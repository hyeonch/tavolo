import { createHash } from 'node:crypto';
import { downloadPhoto, imageType } from './draftPhotos.mjs';
import { UploadError } from './photoUpload.mjs';

export async function recordPhoto({db, userId}, args, action) {
  const {id, requestId, expectedUpdatedAt, stepId, mimeType} = args;
  const {data: record, error} = await db.from('meal_records').select('user_id,updated_at,recipe_steps')
    .eq('id', id).is('deleted_at', null).single();
  if (error || !record) throw new UploadError('기록을 찾을 수 없어요.');
  if (stepId && !record.recipe_steps.some(step => step.id === stepId)) throw new UploadError('조리 단계를 다시 확인해주세요.');
  const bucket = db.storage.from('meal-media');
  const slot = stepId ? 'step:' + record.recipe_steps.findIndex(step => step.id === stepId) : 'finished';
  const file = action === 'attach' ? await downloadPhoto(args.photo) : null;
  const type = file?.mimeType ?? mimeType;
  const extension = {'image/jpeg':'jpg', 'image/webp':'webp', 'image/png':'png'}[type];
  const key = createHash('sha256').update(JSON.stringify([requestId,stepId ?? null,file?.sha256])).digest('hex');
  const path = [record.user_id,id,'mcp-' + userId,key + '.' + extension].join('/');
  if (action === 'prepare') {
    if (record.updated_at !== expectedUpdatedAt) throw new UploadError('기록을 다시 조회해주세요.');
    const signed = await bucket.createSignedUploadUrl(path, {upsert:false});
    if (signed.error) throw new UploadError('업로드 링크를 만들지 못했어요.');
    const params = new URLSearchParams({url:signed.data.signedUrl,mimeType:type,slot});
    return {uploadUrl:signed.data.signedUrl,method:'PUT',contentType:type,pageUrl:'https://tavolo-kr.vercel.app/photo-upload.html#'+params,finishArgs:args};
  }
  if (file) {
    const uploaded = await bucket.upload(path,file.bytes,{contentType:type,upsert:false});
    if (uploaded.error && String(uploaded.error.statusCode) !== '409' && !/already exists|duplicate/i.test(uploaded.error.message)) throw uploaded.error;
  }
  const downloaded = await bucket.download(path);
  if (downloaded.error || !downloaded.data?.size || downloaded.data.size > 10485760) throw new UploadError('업로드한 사진을 확인해주세요.');
  const bytes = Buffer.from(await downloaded.data.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (imageType(bytes).mimeType !== type || (file && file.sha256 !== digest) || (args.expectedSha256 && args.expectedSha256 !== digest))
    throw new UploadError('원본 사진과 업로드 파일이 달라요.');
  const saved = await db.rpc('edit_archive_record',{target_id:id,expected_update:expectedUpdatedAt,patch:{},
    photo:{path,stepId,mimeType:type,bytes:bytes.length}});
  if (saved.error) throw new UploadError('기록을 다시 조회하고 최신 버전으로 사진을 연결해주세요.');
  return saved.data;
}
