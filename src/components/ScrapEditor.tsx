import { useState } from 'react';
import { updateRecipeScrapAsync } from '../db';
import type {RecipeScrap} from '../types/meal';

async function thumbnail(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 400 / Math.max(image.width,image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error();
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',0.75);
  } finally { URL.revokeObjectURL(url); }
}
export function ScrapEditor({scrap,onSaved}:{scrap:RecipeScrap,onSaved:()=>Promise<void>}) {
  const [editing,setEditing] = useState(false);
  const [title,setTitle] = useState(scrap.title ?? '');
  const [file,setFile] = useState<File>();
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState(false);
  if (!editing) return <button type="button" onClick={()=>{setTitle(scrap.title ?? '');setFile(undefined);setError(false);setEditing(true);}}>편집</button>;
  return <form onSubmit={async event=>{
    event.preventDefault(); setBusy(true); setError(false);
    try {
      await updateRecipeScrapAsync(scrap.id,{title:title.trim(),...(file ? {coverImage:await thumbnail(file)} : {})});
      await onSaved(); setEditing(false);
    } catch {setError(true);} finally {setBusy(false);}
  }}><fieldset disabled={busy}><label>제목<input value={title} maxLength={200} onChange={e=>setTitle(e.target.value)} /></label>
    <label>대표 사진<input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0])} /></label>
    <button>저장</button><button type="button" onClick={()=>setEditing(false)}>취소</button>
    {error && <p role="alert">사진 형식과 연결 상태를 확인하고 다시 시도해주세요.</p>}
  </fieldset></form>;
}
