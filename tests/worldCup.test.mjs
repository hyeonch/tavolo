import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const source = ts.transpileModule(fs.readFileSync(new URL('../src/worldCup.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { createWorldCup, advanceWorldCup, getWorldCupCandidates } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const records = Array.from({ length: 8 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  mealId: `meal-${i}`, cookedAt: '2026-11-09', mediaIds: [],
}));

for (const size of [2, 4, 8]) test(`${size} candidates reach one persisted winner`, () => {
  let state = createWorldCup(records, size);
  let count = 0;
  while (state.session.status !== 'completed') {
    const match = state.matches.find(m => m.round === state.session.currentRound && !m.winnerRecordId);
    state = advanceWorldCup(state.session, state.matches, match.id, match.leftRecordId);
    assert.ok(++count <= size - 1);
  }
  assert.equal(count, size - 1);
  assert.ok(state.session.candidateRecordIds.includes(state.session.winnerRecordId));
});

test('rejects insufficient candidates, foreign winners and repeated votes', () => {
  assert.throws(() => createWorldCup(records.slice(0, 1), 2));
  assert.throws(() => createWorldCup(records, 3));
  const { session, matches } = createWorldCup(records, 2);
  assert.throws(() => advanceWorldCup(session, matches, matches[0].id, 'foreign'));
  const done = advanceWorldCup(session, matches, matches[0].id, matches[0].leftRecordId);
  assert.throws(() => advanceWorldCup(done.session, done.matches, matches[0].id, matches[0].rightRecordId));
  const newer = { ...records[0], id: 'new', cookedAt: '2026-11-10' };
  assert.equal(getWorldCupCandidates([...records, newer]).find(r => r.mealId === newer.mealId).id, 'new');
});

test('Postgres: RLS isolation, atomic snapshots, optimistic concurrency and foreign-candidate denial', async () => {
  const db = new PGlite();
  const owner = '10000000-0000-4000-8000-000000000001';
  const other = '10000000-0000-4000-8000-000000000002';
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      create table public.meal_records(id uuid primary key, user_id uuid not null);
      alter table public.meal_records enable row level security;
      create policy owner on public.meal_records to authenticated using (auth.uid() = user_id);
      grant select on public.meal_records to authenticated;
    `);
    await db.query('insert into auth.users values ($1), ($2)', [owner, other]);
    for (const record of records) await db.query('insert into meal_records values ($1,$2)', [record.id, owner]);
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261109073739_account_world_cups.sql', import.meta.url), 'utf8'));
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]);
    const state = createWorldCup(records, 4);
    await db.query('insert into world_cups(id,user_id,session,matches) values ($1,$2,$3,$4)', [state.session.id, owner, JSON.stringify(state.session), JSON.stringify(state.matches)]);
    const loaded = (await db.query('select * from world_cups')).rows[0];
    assert.deepEqual(loaded.matches, state.matches);
    assert.deepEqual(loaded.session, state.session);
    const match = state.matches[0];
    const next = advanceWorldCup(state.session, state.matches, match.id, match.leftRecordId);
    const saved = await db.query('update world_cups set session=$1,matches=$2,revision=2 where id=$3 and revision=1 returning revision', [JSON.stringify(next.session), JSON.stringify(next.matches), state.session.id]);
    assert.equal(saved.rows[0].revision, 2);
    assert.equal((await db.query('update world_cups set revision=2 where id=$1 and revision=1 returning id', [state.session.id])).rows.length, 0);
    await assert.rejects(db.query('update world_cups set matches=$1,revision=3 where id=$2', [JSON.stringify([{ ...match, leftRecordId: other }]), state.session.id]));
    assert.equal((await db.query('select revision from world_cups')).rows[0].revision, 2);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [other]);
    assert.equal((await db.query('select * from world_cups')).rows.length, 0);
    assert.equal((await db.query('update world_cups set revision=3 where id=$1 returning id', [state.session.id])).rows.length, 0);
    await assert.rejects(db.query('insert into world_cups(id,user_id,session,matches) values ($1,$2,$3,$4)', [state.session.id+'other', other, JSON.stringify({...state.session,id:state.session.id+'other'}), JSON.stringify(state.matches)]));
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from world_cups'));
  } finally { await db.close(); }
});
