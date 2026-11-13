import { useEffect, useRef, useState } from 'react';
import * as local from '../db/mealRepository';
import * as localMedia from '../db/mediaRepository';
import * as cloud from '../db/cloudRepository';
import { mediaIdentity } from './media';
import { readDraft, writeDraft } from './store';
import type { MealRecord } from '../types/meal';

export function LocalImportPanel({ scope, accountName, onChanged }: { scope: string; accountName: string; onChanged: () => void }) {
  const [records, setRecords] = useState<MealRecord[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('이 브라우저의 기록 확인 중…');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    void local.listMealRecordsAsync().then(items => { if (active) { setRecords(items); setStatus(''); } }).catch(() => { if (active) setStatus('기기 기록을 불러오지 못했어요.'); });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    const guard = (event: Event) => { if (lock.current) event.preventDefault(); };
    const warn = (event: BeforeUnloadEvent) => { if (lock.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('tavolo:navigate', guard); window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('tavolo:navigate', guard); window.removeEventListener('beforeunload', warn); };
  }, []);
  async function importSelected() {
    if (lock.current || !selected.size) return;
    lock.current = true; setBusy(true);
    try {
      const items = records.filter(record => selected.has(record.id));
      for (const [index, record] of items.entries()) {
        setStatus(`${index + 1}/${items.length} 가져오는 중 · ${record.meal?.name ?? '요리'}`);
        const mealId = await mediaIdentity(scope, 'import-meal', new Blob([record.mealId]));
        const id = await mediaIdentity(scope, 'import-record', new Blob([record.id]));
        if (!await cloud.getMealByIdAsync(mealId)) {
          await cloud.createMealAsync({ id: mealId, name: record.meal?.name ?? '이름 없는 요리', recipeUrl: record.meal?.recipeUrl });
          await cloud.setMealTagNamesAsync(mealId, record.meal?.tags ?? []);
        }
        const existing = await cloud.getMealRecordByIdAsync(id);
        // Existing imported records are not overwritten on repeated imports.
        const checkpoint = `import:${scope}:${record.id}`;
        if (existing && await readDraft<boolean>(checkpoint)) continue;
        if (!existing) await cloud.createMealRecordAsync({ id, mealId, cookedAt: record.cookedAt, rating: record.rating, memo: record.memo, ingredientGroups: record.ingredientGroups, recipeSteps: (record.recipeSteps ?? []).map(step => ({ ...step, mediaIds: [] })) });
        const media = await localMedia.listMediaByMealRecordIdAsync(record.id);
        const ids = new Map<string, string>();
        for (const photo of media) {
          if (!photo.blob) throw new Error('기기 사진 원본을 찾을 수 없어 가져오기를 중단했어요.');
          const stepId = photo.recipeStepId ?? record.recipeSteps?.find(step => step.mediaIds.includes(photo.id))?.id;
          const photoId = await mediaIdentity(id, stepId, photo.blob);
          if (!await cloud.getMediaByIdAsync(photoId)) await cloud.createMediaAsync({ id: photoId, mealRecordId: id, type: 'photo', blob: photo.blob, recipeStepId: stepId });
          ids.set(photo.id, photoId);
        }
        await cloud.updateMealRecordAsync(id, { recipeSteps: (record.recipeSteps ?? []).map(step => ({ ...step, mediaIds: step.mediaIds.map(photo => ids.get(photo)).filter((value): value is string => Boolean(value)) })) });
        await writeDraft(checkpoint, true);
      }
      setSelected(new Set()); setStatus('선택한 기록을 가져왔어요. 이 브라우저의 원본도 그대로 보관했어요.'); onChanged();
    } catch (error) { setStatus(error instanceof Error ? error.message + ' 완료된 항목은 중복 생성하지 않아요. 다시 시도할 수 있어요.' : '가져오지 못했어요. 다시 시도해주세요.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <details className="local-import"><summary>이 브라우저의 기록 가져오기</summary><p>로그인 전에 작성한 기록 중 내 기록을 직접 선택해주세요. {accountName} 계정의 기록장에 복사하며, 공유 중이면 상대방도 볼 수 있어요. 원본은 삭제하지 않아요.</p>
    <fieldset disabled={busy}><legend>가져올 요리 기록</legend>{records.map(record => <label key={record.id}><input type="checkbox" checked={selected.has(record.id)} onChange={event => setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(record.id); else next.delete(record.id); return next; })} />{record.cookedAt} · {record.meal?.name ?? '이름 없는 요리'}</label>)}{!records.length && !status && <p>이 브라우저에 저장된 요리 기록이 없어요.</p>}<button type="button" onClick={() => setRetry(v => v + 1)}>목록 새로고침</button><button type="button" disabled={!selected.size || busy} onClick={() => void importSelected()}>선택한 {selected.size}개 기록 가져오기</button></fieldset><p role="status">{status}</p>
  </details>;
}
