import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {authenticate} from '../server/mcpAuth.mjs';
import {draftSchema,stableId} from '../server/archiveMcp.mjs';

test('MCP authentication rejects session tokens, wrong audience/issuer, expired and invalid signatures', async () => {
  const claims = {iss:'https://project.supabase.co/auth/v1',aud:'authenticated',role:'authenticated',sub:'user',client_id:'client',exp:Date.now()/1000+60};
  const request = new Request('https://tavolo-kr.vercel.app/api/mcp',{headers:{Authorization:'Bearer test'}});
  const config = {url:'https://project.supabase.co',key:'public'};
  let suppliedHeaders;
  const factory = overrides => (_url,_key,options) => {
    suppliedHeaders=options.global.headers;
    return {auth:{getClaims:async()=>({data:{claims:{...claims,...overrides}}}),getUser:async()=>({data:{user:{id:'user'}}})}};
  };
  assert.equal((await authenticate(request,config,factory({}))).userId,'user');
  assert.equal(suppliedHeaders.Authorization,'Bearer test');
  for (const override of [{client_id:null},{aud:'other'},{iss:'https://evil.test'},{exp:0},{role:'anon'}]) assert.equal(await authenticate(request,config,factory(override)),null);
  assert.equal(await authenticate(request,config,()=>({auth:{getClaims:async()=>({error:{message:'signature'}})}})),null);
  assert.equal(await authenticate(new Request('https://example.com'),config,factory({})),null);
});
test('draft input rejects impossible dates and executable links; idempotency is scoped to author', () => {
  assert.equal(draftSchema.safeParse({name:'파스타',cookedAt:'2026-02-30'}).success,false);
  assert.equal(draftSchema.safeParse({name:'파스타',cookedAt:'2026-11-10',recipeUrl:'javascript:alert(1)'}).success,false);
  assert.equal(draftSchema.safeParse({name:'파스타',cookedAt:'2026-11-10'}).success,true);
  assert.equal(stableId('a','draft','key'),stableId('a','draft','key'));
  assert.notEqual(stableId('a','draft','key'),stableId('b','draft','key'));
});
test('draft RLS isolates authors and prevents forged ownership, stale updates and hard delete', async () => {
  const db = new PGlite();
  const a='00000000-0000-4000-8000-000000000001', b='00000000-0000-4000-8000-000000000002';
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth;
      create table auth.users(id uuid primary key); create table public.meal_records(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;`);
    await db.query('insert into auth.users values ($1),($2)',[a,b]);
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261110133652_mcp_record_drafts.sql',import.meta.url),'utf8'));
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
    await db.query('insert into mcp_record_drafts(id,user_id,payload) values($1,$1,$2)',[a,{name:'파스타'}]);
    await assert.rejects(db.query('insert into mcp_record_drafts(id,user_id,payload) values($1,$1,$2)',[b,{}]));
    await assert.rejects(db.query('update mcp_record_drafts set payload=$1',[{}]));
    assert.equal((await db.query('update mcp_record_drafts set payload=$1,revision=2 where revision=1 returning id',[{name:'수정'}])).rows.length,1);
    assert.equal((await db.query('update mcp_record_drafts set payload=$1,revision=2 where revision=1 returning id',[{}])).rows.length,0);
    await assert.rejects(db.query('delete from mcp_record_drafts'));
    await assert.rejects(db.query('update mcp_record_drafts set user_id=$1',[b]));
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);
    assert.equal((await db.query('select * from mcp_record_drafts')).rows.length,0);
    assert.equal((await db.query('update mcp_record_drafts set payload=$1,revision=3 returning id',[{}])).rows.length,0);
  } finally { await db.close(); }
});
