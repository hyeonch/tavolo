import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const userA = uuid(1), userB = uuid(2), outsider = uuid(3), journal = uuid(4);

test('recipient-bound invites, tag namespaces and recoverable photos work end to end', async () => {
  const db = new PGlite();
  async function login(user) {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  }
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text unique);
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select,insert,update,delete on storage.objects to authenticated;
    `);
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260818072604_create_tavolo_schema.sql', import.meta.url), 'utf8'));
    for (const user of [userA,userB,outsider]) await db.query('insert into auth.users values ($1,$2,now())', [user,user+'@example.com']);
    for (const [i,user] of [[10,userA],[20,userB],[30,outsider]]) {
      await db.query('insert into meals(id,user_id,name) values($1,$2,$3)', [uuid(i),user,'요리'+i]);
      await db.query('insert into meal_records(id,user_id,meal_id,cooked_at) values($1,$2,$3,$4)', [uuid(i+1),user,uuid(i),'2026-11-09']);
      const path = `${user}/${uuid(i+1)}/photo.jpg`;
      await db.query('insert into media(id,user_id,meal_record_id,storage_path,mime_type,byte_size,kind) values($1,$2,$3,$4,$5,$6,$7)', [uuid(i+2),user,uuid(i+1),path,'image/jpeg',123,'finished']);
      await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['meal-media',path]);
      await db.query('insert into recipe_scraps(id,user_id,url) values($1,$2,$3)', [uuid(i+3),user,'https://example.com/'+i]);
    }
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261109074901_shared_journal_access.sql', import.meta.url), 'utf8'));
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261109073739_account_world_cups.sql', import.meta.url), 'utf8'));
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261109220910_journal_invites_and_restore.sql', import.meta.url), 'utf8'));
    const action = async (a, name='', email='', token='') => (await db.query('select public.journal_action($1,$2,$3,$4) as result',[a,name,email,token])).rows[0].result;
    await login(userA);
    await assert.rejects(action('invite','A',userA+'@example.com'));
    const oldInvite = await action('invite','A',userB+'@example.com');
    const invite = await action('invite','A',userB+'@example.com');
    await assert.rejects(db.query('select * from private.journal_invites'));
    await login(userB);
    await assert.rejects(action('accept','B','',oldInvite.token));
    await login(outsider);
    await assert.rejects(action('accept','C','',invite.token));
    await login(userB);
    await action('invite','B',outsider+'@example.com');
    await action('accept','B','',invite.token);
    await assert.rejects(action('accept','B','',invite.token));
    assert.equal((await db.query('select * from meal_records')).rows.length,2);
    // Same tag name may exist independently for both authors. Replacement uses meal owner.
    await db.query('select public.set_meal_tags($1,$2)',[uuid(10),['파스타','파스타']]);
    await db.query('select public.set_meal_tags($1,$2)',[uuid(20),['파스타']]);
    assert.equal((await db.query('select * from tags')).rows.length,2);
    assert.equal((await db.query('select user_id from meal_tags where meal_id=$1',[uuid(10)])).rows[0].user_id,userA);
    await assert.rejects(db.query('select public.set_meal_tags($1,$2)',[uuid(30),['해킹']]));
    // Shared candidates are accepted, but tournament progress belongs to B alone.
    const session = { id:'shared-cup',candidateRecordIds:[uuid(11),uuid(21)],status:'in-progress' };
    const matches = [{sessionId:session.id,leftRecordId:uuid(11),rightRecordId:uuid(21)}];
    await db.query('insert into world_cups(id,user_id,session,matches) values($1,$2,$3,$4)',[session.id,userB,JSON.stringify(session),JSON.stringify(matches)]);
    await login(userA);
    assert.equal((await db.query('select * from world_cups')).rows.length,0);
    await db.query('update meal_records set deleted_at=now() where id=$1',[uuid(21)]);
    await db.query('select public.restore_archive_item($1,$2)',['record',uuid(21)]);
    assert.equal((await db.query('select deleted_at from meal_records where id=$1',[uuid(21)])).rows[0].deleted_at,null);
    // Restoring an old representative photo trashes its replacement atomically.
    await db.query('update media set deleted_at=now() where id=$1',[uuid(22)]);
    await db.query("insert into media(id,user_id,meal_record_id,storage_path,mime_type,byte_size,kind) values($1,$2,$3,$4,'image/jpeg',123,'finished')",[uuid(99),userB,uuid(21),`${userB}/${uuid(21)}/new.jpg`]);
    await db.query('select public.restore_archive_item($1,$2)',['media',uuid(22)]);
    assert.equal((await db.query("select id from media where meal_record_id=$1 and kind='finished' and deleted_at is null",[uuid(21)])).rows[0].id,uuid(22));
    await db.query("insert into media(id,user_id,meal_record_id,storage_path,mime_type,byte_size,kind,recipe_step_id,deleted_at) values($1,$2,$3,$4,'image/jpeg',123,'step','removed-step',now())",[uuid(98),userB,uuid(21),`${userB}/${uuid(21)}/step.jpg`]);
    await db.query('select public.restore_archive_item($1,$2)',['media',uuid(98)]);
    await db.query('select public.restore_archive_item($1,$2)',['media',uuid(98)]);
    const steps = (await db.query('select recipe_steps from meal_records where id=$1',[uuid(21)])).rows[0].recipe_steps;
    assert.deepEqual(steps[0].mediaIds,[uuid(98)]);
    await login(outsider);
    await assert.rejects(db.query('select public.restore_archive_item($1,$2)',['record',uuid(21)]));
    await db.exec('reset role');
    await db.exec('delete from journal_members; delete from journals');
    await login(userA);
    const revoked = await action('invite','A',userB+'@example.com');
    await action('revoke');
    await login(userB);
    await assert.rejects(action('accept','B','',revoked.token));
    await login(userA);
    const expired = await action('invite','A',userB+'@example.com');
    await db.exec("reset role; update private.journal_invites set expires_at=now()-interval '1 second'");
    await login(userB);
    await assert.rejects(action('accept','B','',expired.token));
    await db.exec('set role anon');
    await assert.rejects(action('invite','Anon',userA+'@example.com'));
  } finally { await db.close(); }
});
