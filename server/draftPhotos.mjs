import {createHash} from 'node:crypto';
import {allowedFileUrl} from './mcpProbe.mjs';
const maxBytes=10*1024*1024;
export function imageType(bytes) {
  if (bytes.length>=8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return {mimeType:'image/png',extension:'png'};
  if (bytes.length>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return {mimeType:'image/jpeg',extension:'jpg'};
  if (bytes.length>=12 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP') return {mimeType:'image/webp',extension:'webp'};
  throw new Error('JPEG·PNG·WebP 사진으로 보내주세요.');
}
export async function downloadPhoto(photo,fetcher=fetch) {
  const response=await fetcher(allowedFileUrl(photo.download_url),{redirect:'error',signal:AbortSignal.timeout(8000)});
  if (!response.ok || !response.body) throw new Error('사진을 다운로드하지 못했어요. 다시 첨부해주세요.');
  if (Number(response.headers.get('content-length'))>maxBytes) { await response.body.cancel(); throw new Error('사진은 10MB 이하로 보내주세요.'); }
  const reader=response.body.getReader(), chunks=[];
  let size=0;
  try {
    for (;;) {
      const {done,value}=await reader.read(); if (done) break;
      size+=value.byteLength; if (size>maxBytes) throw new Error('사진은 10MB 이하로 보내주세요.');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel(); }
  const bytes=Buffer.concat(chunks);
  return {bytes,sha256:createHash('sha256').update(bytes).digest('hex'),...imageType(bytes)};
}
export async function attachPhoto({db,userId},{id,expectedRevision,slot,photo},fetcher=fetch) {
  const draft=await db.from('mcp_record_drafts').select('id,revision,record_id').eq('id',id).eq('user_id',userId).single();
  if (draft.error || draft.data.record_id) throw new Error('수정할 수 있는 초안이 아니에요.');
  const file=await downloadPhoto(photo,fetcher);
  const objectId=createHash('sha256').update(JSON.stringify([slot,file.sha256])).digest('hex');
  const path=`${userId}/${id}/${objectId}.${file.extension}`;
  const bucket=db.storage.from('meal-media');
  const uploaded=await bucket.upload(path,file.bytes,{contentType:file.mimeType,upsert:false});
  if (uploaded.error) {
    // A lost response/retry may already have uploaded this content-addressed file.
    // Verify the existing bytes rather than trusting an arbitrary upload error.
    const existing=await bucket.download(path);
    if (existing.error || !existing.data || existing.data.size!==file.bytes.length
      || createHash('sha256').update(Buffer.from(await existing.data.arrayBuffer())).digest('hex')!==file.sha256) throw new Error('사진 업로드에 실패했어요. 같은 초안으로 다시 시도해주세요.');
  }
  const saved=await db.rpc('mcp_draft_action',{action:'attach',target_id:id,expected_revision:expectedRevision,
    photo:{path,slot,mimeType:file.mimeType,bytes:file.bytes.length}});
  if (saved.error) throw new Error('초안이 바뀌었어요. 최신 버전을 확인한 후 같은 사진으로 다시 시도해주세요.');
  return {...saved.data,bytes:file.bytes.length,sha256:file.sha256};
}
