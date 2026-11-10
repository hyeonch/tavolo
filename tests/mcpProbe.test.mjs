import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../api/mcp-probe.mjs';
import { allowedFileUrl, inspectFile } from '../server/mcpProbe.mjs';
const rpc = (method, params={}) => POST(new Request('https://tavolo-two.vercel.app/api/mcp-probe', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc:'2.0', id:1, method, params }) }));
test('MCP initialization, discovery and connection probe work without archive access', async () => {
  const init = await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}});
  assert.equal(init.status,200);
  assert.equal((await init.json()).result.serverInfo.name,'tavolo-connection-test');
  const list = (await (await rpc('tools/list')).json()).result.tools;
  assert.equal(list.length,2);
  const photo = list.find(t=>t.name==='tavolo_photo_transfer_test');
  assert.deepEqual(photo._meta['openai/fileParams'],['photo']);
  assert.deepEqual(photo.inputSchema.properties.photo.required,['download_url','file_id']);
  const called = (await (await rpc('tools/call',{name:'tavolo_connection_test',arguments:{}})).json()).result;
  assert.equal(called.structuredContent.connected,true);
  assert.equal(called.structuredContent.archiveAccess,false);
  assert.equal(called.structuredContent.persistence,false);
  const invalid = await POST(new Request('https://tavolo-two.vercel.app/api/mcp-probe',{method:'POST',headers:{Origin:'https://evil.example'}}));
  assert.equal(invalid.status,403);
});
test('photo probe rejects arbitrary hosts and bounded download does not persist content',async()=>{
  for(const url of ['http://127.0.0.1/a','https://example.com/a','https://oaiusercontent.com.evil.example/a','https://user:pass@files.oaiusercontent.com/a']) assert.throws(()=>allowedFileUrl(url));
  const file={download_url:'https://files.oaiusercontent.com/photo',file_id:'test'};
  const response=await inspectFile(file,async(url,options)=>{ assert.equal(options.redirect,'error');return new Response('image-bytes'); });
  assert.equal(response.bytes,11);assert.equal(response.persisted,false);assert.equal(response.sha256.length,64);
  await assert.rejects(inspectFile(file,async()=>new Response('x',{headers:{'Content-Length':String(11*1024*1024)}})),/10MB/);
});
