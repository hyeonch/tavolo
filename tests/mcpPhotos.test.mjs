import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {downloadPhoto,imageType} from '../server/draftPhotos.mjs';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('private photo staging and atomic commit preserve ownership, retry safety and shared visibility',async()=>{
  const db=new PGlite(); const a=uuid(1),b=uuid(2),outsider=uuid(3),id=uuid(10),bad=uuid(11);
  const login=async user=>{await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);};
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

    for(const u of [a,b,outsider]) await db.query('insert into auth.users values($1,$2,now())',[u,u+'@example.com']);
    for(const file of ['20261109074901_shared_journal_access.sql','20261109073739_account_world_cups.sql','20261109220910_journal_invites_and_restore.sql','20261110133652_mcp_record_drafts.sql','20261110134053_restrict_mcp_draft_grants.sql','20261110134513_commit_mcp_drafts_with_photos.sql']) await db.exec(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await login(a);
    const payload={name:'버섯 리소토',cookedAt:'2026-11-10',memo:'첫 시도',tags:['이탈리안'],ingredientGroups:[{name:'재료',items:[{name:'쌀',quantity:'100',unit:'g'}]}],steps:['볶는다','졸인다'],uncertainties:['치즈 양 미확인']};
    await db.query('insert into mcp_record_drafts(id,user_id,payload) values($1,$2,$3)',[id,a,payload]);
    const path=`${a}/${id}/${'a'.repeat(64)}.png`;
    const photo={path,slot:'finished',mimeType:'image/png',bytes:123};
    const action=async(act,target,rev,p=null)=>(await db.query('select mcp_draft_action($1,$2,$3,$4) as result',[act,target,rev,p])).rows[0].result;
    await assert.rejects(action('attach',id,1,photo));
    assert.equal((await db.query('select count(*)::int as n from meal_records')).rows[0].n,0);
    await db.query("insert into storage.objects(bucket_id,name) values('meal-media',$1)",[path]);
    const attached=await action('attach',id,1,photo);
    assert.equal(attached.revision,2);
    assert.deepEqual(await action('attach',id,1,photo),attached);
    await assert.rejects(action('commit',id,1));
    const stepPath=`${a}/${id}/${'b'.repeat(64)}.png`;
    await db.query("insert into storage.objects(bucket_id,name) values('meal-media',$1)",[stepPath]);
    const stepAttached=await action('attach',id,2,{...photo,path:stepPath,slot:'step:0'});
    assert.equal(stepAttached.revision,3);
    await assert.rejects(db.query('update mcp_record_drafts set payload=$1,revision=4 where id=$2',[{...payload,steps:['changed']},id]));

    await login(outsider);
    await assert.rejects(action('commit',id,3));
    assert.equal((await db.query('select * from mcp_draft_photos')).rows.length,0);
    assert.equal((await db.query('select * from storage.objects')).rows.length,0);
    await login(a);
    const committed=await action('commit',id,3);
    assert.equal(committed.created,true);assert.equal(committed.recordId,id);
    assert.equal((await action('commit',id,3)).created,false);
    assert.equal((await db.query('select * from meal_records')).rows.length,1);
    const record=(await db.query('select * from meal_records')).rows[0];
    assert.match(record.memo,/치즈 양 미확인/);assert.equal(record.recipe_steps[0].order,1);assert.equal(record.recipe_steps[0].mediaIds.length,1);
    assert.equal((await db.query('select * from media')).rows[0].storage_path,path);
    // A bad draft rolls the entire meal+record transaction back.
    await db.query('insert into mcp_record_drafts(id,user_id,payload) values($1,$2,$3)',[bad,a,{...payload,rating:99}]);
    await assert.rejects(action('commit',bad,1));
    assert.equal((await db.query('select * from meals')).rows.length,1);
    // Sharing includes committed media/records but not private drafts.
    const inv=(await db.query("select journal_action('invite','A',$1,'') as x",[b+'@example.com'])).rows[0].x;
    await login(b);await db.query("select journal_action('accept','B','',$1)",[inv.token]);
    assert.equal((await db.query('select * from meal_records')).rows.length,1);
    assert.equal((await db.query('select * from storage.objects')).rows.length,2);
    assert.equal((await db.query('select * from mcp_record_drafts')).rows.length,0);
    await assert.rejects(action('commit',bad,1));
    await db.query('update meal_records set deleted_at=now() where id=$1',[id]);
    await login(a);await action('commit',id,3);
    assert.ok((await db.query('select deleted_at from meal_records where id=$1',[id])).rows[0].deleted_at);
  } finally {await db.close();}
});

test('photo download checks actual format, host, byte cap and forbids redirects',async()=>{
  const png=Buffer.from([137,80,78,71,13,10,26,10,0]);
  assert.equal(imageType(png).mimeType,'image/png');
  assert.throws(()=>imageType(Buffer.from('<svg></svg>')));
  const photo={download_url:'https://files.oaiusercontent.com/test',file_id:'test',mime_type:'image/jpeg'};
  const got=await downloadPhoto(photo,async(_url,options)=>{assert.equal(options.redirect,'error');return new Response(png);});
  assert.equal(got.mimeType,'image/png');assert.equal(got.bytes.length,png.length);
  await assert.rejects(downloadPhoto({...photo,download_url:'https://example.com/image'},async()=>new Response(png)));
  await assert.rejects(downloadPhoto(photo,async()=>new Response(png,{headers:{'content-length':String(10485761)}})));
});
