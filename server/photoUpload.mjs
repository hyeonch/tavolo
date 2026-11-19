import { createHash } from 'node:crypto';
import { imageType } from './draftPhotos.mjs';

export class UploadError extends Error {}
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function location(userId, { id, slot, requestId, mimeType }) {
  const key = createHash('sha256').update(JSON.stringify([slot, requestId])).digest('hex');
  return [userId, id, key + '.' + extensions[mimeType]].join('/');
}

export async function prepareUpload({ db, userId }, args) {
  const { id, expectedRevision, slot, mimeType } = args;
  const { data, error } = await db.from('mcp_record_drafts').select('revision,record_id,payload')
    .eq('id', id).eq('user_id', userId).single();
  if (error || !data || data.record_id || data.revision !== expectedRevision)
    throw new UploadError('수정 가능한 초안과 최신 revision을 확인해주세요.');
  if (slot !== 'finished' && Number(slot.slice(5)) >= data.payload.steps.length)
    throw new UploadError('초안에 해당 조리순서가 없어요.');
  const signed = await db.storage.from('meal-media').createSignedUploadUrl(location(userId, args), { upsert: false });
  if (signed.error) throw new UploadError('업로드 링크를 만들지 못했어요. 다시 시도해주세요.');
  const params = new URLSearchParams({ url: signed.data.signedUrl, mimeType, slot });
  return { uploadUrl: signed.data.signedUrl, method: 'PUT', contentType: mimeType,
    pageUrl: 'https://tavolo-kr.vercel.app/photo-upload.html#' + params, finishArgs: args };
}

export async function finishUpload({ db, userId }, args) {
  const path = location(userId, args);
  const { data, error } = await db.storage.from('meal-media').download(path);
  if (error || !data) throw new UploadError('사진이 아직 도착하지 않았어요. 같은 링크에서 업로드를 마쳐주세요.');
  if (!data.size || data.size > 10 * 1024 * 1024) throw new UploadError('10MB 이하의 사진으로 새 링크를 요청해주세요.');
  const bytes = Buffer.from(await data.arrayBuffer());
  let detected;
  try { detected = imageType(bytes); } catch { throw new UploadError('사진 형식을 확인한 뒤 새 링크로 다시 보내주세요.'); }
  if (detected.mimeType !== args.mimeType) throw new UploadError('원본 형식에 맞는 새 링크를 요청해주세요.');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (args.expectedSha256 && args.expectedSha256 !== sha256) throw new UploadError('원본과 받은 사진이 달라요. 새 링크로 다시 보내주세요.');
  const saved = await db.rpc('mcp_draft_action', { action: 'attach', target_id: args.id,
    expected_revision: args.expectedRevision, photo: { path, slot: args.slot, mimeType: detected.mimeType, bytes: bytes.length } });
  if (saved.error) throw new UploadError('초안을 다시 조회하고 사진 칸을 확인한 뒤 최신 revision으로 첨부를 마쳐주세요.');
  return { ...saved.data, bytes: bytes.length, sha256 };
}
