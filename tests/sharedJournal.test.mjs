import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const userA = uuid(1), userB = uuid(2), outsider = uuid(3), journal = uuid(4);

test('shared archive preserves authors, protects membership, restores trash and isolates photos', async () => {
  const db = new PGlite();
  async function login(user) {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  }
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create schema auth;
      create table auth.users(id uuid primary key);
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
    for (const user of [userA,userB,outsider]) await db.query('insert into auth.users values ($1)', [user]);
    for (const [i,user] of [[10,userA],[20,userB],[30,outsider]]) {
      await db.query('insert into meals(id,user_id,name) values($1,$2,$3)', [uuid(i),user,'요리'+i]);
      await db.query('insert into meal_records(id,user_id,meal_id,cooked_at) values($1,$2,$3,$4)', [uuid(i+1),user,uuid(i),'2026-11-09']);
      const path = `${user}/${uuid(i+1)}/photo.jpg`;
      await db.query('insert into media(id,user_id,meal_record_id,storage_path,mime_type,byte_size,kind) values($1,$2,$3,$4,$5,$6,$7)', [uuid(i+2),user,uuid(i+1),path,'image/jpeg',123,'finished']);
      await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['meal-media',path]);
      await db.query('insert into recipe_scraps(id,user_id,url) values($1,$2,$3)', [uuid(i+3),user,'https://example.com/'+i]);
    }
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261109074901_shared_journal_access.sql', import.meta.url), 'utf8'));
    await login(userA);
    assert.equal((await db.query('select * from meal_records')).rows.length,1);
    await assert.rejects(db.query('insert into journal_members(user_id,journal_id,display_name) values($1,$2,$3)',[userA,journal,'A']));
    await db.exec('reset role');
    await db.query('insert into journals(id,created_by) values($1,$2)', [journal,userA]);
    await db.query('insert into journal_members(user_id,journal_id,display_name) values($1,$3,$4),($2,$3,$5)',[userA,userB,journal,'A','B']);
    await assert.rejects(db.query('insert into journal_members(user_id,journal_id,display_name) values($1,$2,$3)',[outsider,journal,'C']));
    await login(userA);
    assert.equal((await db.query('select * from meal_records')).rows.length,2);
    assert.equal((await db.query('select * from recipe_scraps')).rows.length,2);
    assert.equal((await db.query('select * from storage.objects')).rows.length,2);
    assert.equal((await db.query('select * from journal_members')).rows.length,2);
    await db.query('update meal_records set memo=$1,deleted_at=now() where id=$2',['함께 수정',uuid(21)]);
    assert.equal((await db.query('select user_id from meal_records where id=$1',[uuid(21)])).rows[0].user_id,userB);
    assert.equal((await db.query('select * from meal_records where deleted_at is null')).rows.length,1);
    assert.equal((await db.query('select * from storage.objects')).rows.length,2);
    await db.query('update meal_records set deleted_at=null where id=$1',[uuid(21)]);
    assert.equal((await db.query('select * from meal_records where deleted_at is null')).rows.length,2);
    await assert.rejects(db.query('update meal_records set user_id=$1 where id=$2',[userA,uuid(21)]));
    await assert.rejects(db.query('delete from meal_records where id=$1',[uuid(21)]));
    const outsiderPath = `${outsider}/${uuid(31)}/photo.jpg`;
    await assert.rejects(db.query('update media set storage_path=$1 where id=$2',[outsiderPath,uuid(12)]));
    assert.equal((await db.query('delete from storage.objects returning id')).rows.length,0);
    // A new photo attached to the partner's record keeps the existing composite FK owner.
    const sharedPath = `${userB}/${uuid(21)}/new.jpg`;
    await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['meal-media',sharedPath]);
    await db.query('insert into media(id,user_id,meal_record_id,storage_path,mime_type,byte_size,kind) values($1,$2,$3,$4,$5,$6,$7)',[uuid(99),userB,uuid(21),sharedPath,'image/jpeg',123,'finished']);
    await login(outsider);
    assert.equal((await db.query('select * from meal_records')).rows.length,1);
    assert.equal((await db.query('select * from journal_members')).rows.length,0);
    assert.equal((await db.query('select * from journals')).rows.length,0);
    assert.equal((await db.query('update meal_records set memo=$1 where id=$2 returning id',['hack',uuid(21)])).rows.length,0);
    await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['meal-media',`${userA}/${uuid(11)}/hack.jpg`]));
    await db.exec('reset role');
    await db.query('delete from journal_members where user_id=$1',[userB]);
    await login(userA);
    assert.equal((await db.query('select * from meal_records')).rows.length,1);
    assert.equal((await db.query('select * from storage.objects')).rows.length,1);
    await login(userB);
    assert.equal((await db.query('select * from meal_records')).rows.length,1);
    assert.equal((await db.query('select * from storage.objects')).rows.length,2);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from journal_members'));
  } finally { await db.close(); }
});
