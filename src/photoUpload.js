const params = new URLSearchParams(location.hash.slice(1));
const form = document.querySelector('form');
const status = document.querySelector('[role=status]');
const slot = params.get('slot');
const mime = params.get('mimeType');
const url = new URL(params.get('url') || '/', location.origin);
const trusted = import.meta.env.VITE_SUPABASE_URL;
const valid = trusted && url.origin === new URL(trusted).origin && url.protocol === 'https:'
  && url.pathname.startsWith('/storage/v1/object/upload/sign/meal-media/') && url.searchParams.has('token')
  && ['image/jpeg', 'image/png', 'image/webp'].includes(mime) && /^(finished|step:\d{1,2})$/.test(slot);
document.querySelector('#slot').textContent = valid
  ? (slot === 'finished' ? '완성 사진' : (Number(slot.slice(5)) + 1) + '단계 사진') : '대화에서 새 링크를 요청해주세요.';
form.hidden = !valid;
const input = form.querySelector('input');
const button = form.querySelector('button');
input.onchange = () => { button.disabled = !input.files.length; };
async function prepare(file) {
  if (file.type === mime && file.size <= 10485760) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise(resolve => canvas.toBlob(resolve, mime, 0.88));
}
form.onsubmit = async event => {
  event.preventDefault();
  if (!valid || button.disabled) return;
  input.disabled = button.disabled = true;
  status.textContent = '사진을 보내고 있어요…';
  try {
    const photo = await prepare(input.files[0]);
    if (!photo || photo.type !== mime || photo.size > 10485760) throw new Error();
    const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': mime }, body: photo, credentials: 'omit', redirect: 'error' });
    if (!response.ok) throw new Error();
    form.hidden = true;
    status.textContent = '사진을 보냈어요. 대화로 돌아가 “올렸어”라고 알려주세요.';
  } catch {
    status.textContent = '전송을 확인하지 못했어요. 대화에서 업로드 여부를 확인하거나 새 링크로 JPEG·PNG 사진을 보내주세요.';
  } finally { input.disabled = button.disabled = false; }
};
