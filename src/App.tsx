import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { JournalPanel } from './journal/JournalPanel';
import { getUserLabel } from './auth/useAuth';
import { AccountControls } from './auth/AccountControls';
import { useAuth } from './auth/useAuth';
import {
  createMealAsync,
  createMealRecordAsync,
  createMediaAsync,
  createRecipeScrapAsync,
  createWorldCupSessionAsync,
  deleteMealRecordAsync,
  deleteMediaAsync,
  deleteRecipeScrapAsync,
  createMediaObjectUrl,
  getMealRecordByIdAsync,
  getMediaByIdAsync,
  getWorldCupStateAsync,
  listMealRecordsAsync,
  listMediaByMealRecordIdAsync,
  listRecipeScrapsAsync,
  setMealTagNamesAsync,
  isCloudDataSource,
  revokeMediaObjectUrl,
  saveWorldCupProgressAsync,
  setDataSource,
  updateMealAsync,
  updateMealRecordAsync,
} from './db';
import { buildRecapSummary, getRecordYears } from './recap';
import type {
  IngredientGroup,
  MealRecord,
  Media,
  RecipeScrap,
  RecipeStep,
  WorldCupMatch,
  WorldCupSession,
} from './types/meal';
import { advanceWorldCup, createWorldCup, getWorldCupCandidates, getWorldCupSizes } from './worldCup';

type RouteKey = 'home' | 'recipes' | 'add' | 'search' | 'recap' | 'detail' | 'settings';

type Route = {
  key: RouteKey;
  label: string;
};

const routes: Route[] = [
  { key: 'home', label: '기록' },
  { key: 'recipes', label: '스크랩' },
  { key: 'recap', label: '결산' },
  { key: 'settings', label: '설정' },
];

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: 'M3 4h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v16h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3z M12 6v16',
    recipes: 'M6 3h12v19l-6-4-6 4z',
    recap: 'M5 21V12 M12 21V3 M19 21V8',
    settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',
    search: 'M21 21l-6-6 M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14',
  };
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] ?? paths.home} /></svg>;
}

type SearchPreset = {
  key: string;
  year?: number;
  month?: number;
  tag?: string;
};

const emptyMealRecords: MealRecord[] = [];

function createLocalId(prefix: string) {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${prefix}-${Math.random().toString(36).slice(2)}`;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function formatCookedAtLabel(cookedAt: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${cookedAt}T00:00:00`));
}

function formatRating(rating?: number) {
  return rating ? `만족도 ${rating}/5` : '만족도 미입력';
}

function getRecipeScrapTitle(recipeScrap: RecipeScrap) {
  if (recipeScrap.title) return recipeScrap.title;

  try {
    return new URL(recipeScrap.url).hostname;
  } catch {
    return recipeScrap.url;
  }
}

function getRecipePreview(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    let videoId: string | null = null;

    if (host === 'youtu.be') {
      videoId = parsed.pathname.split('/').filter(Boolean)[0] ?? null;
    } else if (host.includes('youtube.com')) {
      videoId =
        parsed.searchParams.get('v') ??
        parsed.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/)?.[1] ??
        null;
    }

    if (videoId) {
      return {
        host,
        label: 'YouTube',
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      };
    }

    return {
      host,
      label: host.includes('instagram.com') ? 'Instagram' : host,
      thumbnailUrl: null,
    };
  } catch {
    return { host: '', label: '외부 링크', thumbnailUrl: null };
  }
}

type RecipeStepDraft = RecipeStep & {
  photoFile?: File | null;
};

function SelectedPhotoPreview({
  file,
  alt,
  label,
  onClear,
}: {
  file: File;
  alt: string;
  label: string;
  onClear: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <figure className="selected-photo-preview">
      <img alt={alt} src={previewUrl ?? ''} />
      <figcaption>
        <span>{label}</span>
        <button type="button" onClick={onClear}>
          취소
        </button>
      </figcaption>
    </figure>
  );
}

function createIngredientItem() {
  return {
    id: createLocalId('ingredient'),
    name: '',
    quantity: '',
    unit: '',
  };
}

function createIngredientGroup(name: string): IngredientGroup {
  return {
    id: createLocalId('ingredient-group'),
    name,
    items: [createIngredientItem()],
  };
}

function createRecipeStep(order: number): RecipeStepDraft {
  return {
    id: createLocalId('recipe-step'),
    order,
    body: '',
    mediaIds: [],
    photoFile: null,
  };
}

function HomeView({ onOpenRecord }: { onOpenRecord: (record: MealRecord) => void }) {
  const [records, setRecords] = useState<MealRecord[]>([]);
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState('');
  const [tag, setTag] = useState('');
  const [layout, setLayout] = useState<'photos' | 'list'>('photos');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus('loading');
    listMealRecordsAsync().then(items => {
      if (!active) return;
      setRecords(items); setStatus('ready');
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [retry]);
  const months = [...new Set(records.map(r => r.cookedAt.slice(0, 7)))].sort().reverse();
  const tags = [...new Set(records.flatMap(r => r.meal?.tags ?? []))].sort();
  const normalized = query.trim().toLocaleLowerCase('ko-KR');
  const filtered = records.filter(r => (!month || r.cookedAt.startsWith(month)) && (!tag || r.meal?.tags.includes(tag)) && (!normalized || [r.meal?.name, r.memo, r.meal?.memo, ...(r.meal?.tags ?? []), ...(r.ingredientGroups?.flatMap(g => g.items.flatMap(i => [i.name, i.note])) ?? [])].filter(Boolean).join(' ').toLocaleLowerCase('ko-KR').includes(normalized))).sort((a,b) => b.cookedAt.localeCompare(a.cookedAt));
  const dates = [...new Set(filtered.map(r => r.cookedAt))];
  return <section className="view journal-home">
    <div className="section-heading"><h1>요리 기록</h1></div>
    <label className="search-field"><NavIcon name="search" /><input aria-label="요리 기록 검색" type="search" placeholder="요리, 재료, 메모 검색" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <div className="journal-toolbar">
      <select aria-label="기록 월" value={month} onChange={e => setMonth(e.target.value)}><option value="">전체 기록</option>{months.map(m => <option key={m} value={m}>{m.slice(0,4)}년 {Number(m.slice(5))}월</option>)}</select>
      <div className="view-switch" aria-label="보기 방식"><button type="button" aria-pressed={layout === 'photos'} onClick={() => setLayout('photos')}>사진</button><button type="button" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>목록</button></div>
    </div>
    {tags.length > 0 && <div className="tag-filter"><button type="button" aria-pressed={!tag} className={!tag ? 'is-active' : ''} onClick={() => setTag('')}>전체</button>{tags.map(t => <button type="button" key={t} aria-pressed={tag === t} className={tag === t ? 'is-active' : ''} onClick={() => setTag(tag === t ? '' : t)}>{t}</button>)}</div>}
    {status === 'loading' && <p role="status" className="panel-state">기록 불러오는 중…</p>}
    {status === 'error' && <div role="alert" className="empty-state"><strong>기록을 불러오지 못했어요.</strong><button type="button" onClick={() => setRetry(v => v+1)}>다시 시도</button></div>}
    {status === 'ready' && !filtered.length && <div className="empty-state"><strong>{records.length ? '조건에 맞는 기록이 없어요.' : '아직 요리 기록이 없어요.'}</strong><p>{records.length ? '검색어나 필터를 바꿔보세요.' : '기록하기를 눌러 첫 요리를 남겨보세요.'}</p>{records.length > 0 && <button type="button" onClick={() => { setQuery(''); setMonth(''); setTag(''); }}>필터 초기화</button>}</div>}
    {status === 'ready' && dates.map(date => <section key={date} className={'journal-day journal-' + layout}><h2><time dateTime={date}>{date.replaceAll('-', '.')}</time><span>{new Date(date + 'T12:00:00').toLocaleDateString('ko-KR', { weekday: 'long' })}</span></h2><ul className="record-search-list">{filtered.filter(r => r.cookedAt === date).map(record => <RecordSearchCard key={record.id} record={record} onOpen={onOpenRecord} />)}</ul></section>)}
  </section>;
}

function DetailView({
  recordId,
  onBackClick,
  onEdit,
  onDeleted,
}: {
  recordId: string | null;
  onBackClick: () => void;
  onEdit: (record: MealRecord) => void;
  onDeleted: () => void;
}) {
  const [record, setRecord] = useState<MealRecord | null>(null);
  const [representativePhotoUrl, setRepresentativePhotoUrl] = useState<string | null>(null);
  const [stepPhotoUrls, setStepPhotoUrls] = useState<Record<string, string>>({});
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let objectUrl: string | null = null;
    let stepObjectUrls: string[] = [];

    async function loadRecordAsync() {
      if (!recordId) {
        setRecord(null);
        setLoadState('not-found');
        return;
      }

      setLoadState('loading');

      try {
        const loadedRecord = await getMealRecordByIdAsync(recordId);

        if (!loadedRecord) {
          if (isMounted) {
            setRecord(null);
            setLoadState('not-found');
          }
          return;
        }

        const representativeMediaId = loadedRecord.finishedMediaId ?? loadedRecord.mediaIds[0];
        const media = representativeMediaId ? await getMediaByIdAsync(representativeMediaId) : null;
        const photoUrl = media ? createMediaObjectUrl(media) : null;

        if (photoUrl?.startsWith('blob:')) {
          objectUrl = photoUrl;
        }

        const stepMediaIds = [...new Set(loadedRecord.recipeSteps?.flatMap((step) => step.mediaIds) ?? [])];
        const stepMediaEntries = await Promise.all(
          stepMediaIds.map(async (mediaId) => {
            const stepMedia = await getMediaByIdAsync(mediaId);
            const stepPhotoUrl = stepMedia ? createMediaObjectUrl(stepMedia) : null;

            if (stepPhotoUrl?.startsWith('blob:')) {
              stepObjectUrls.push(stepPhotoUrl);
            }

            return [mediaId, stepPhotoUrl] as const;
          })
        );

        if (!isMounted) {
          revokeMediaObjectUrl(objectUrl);
          stepObjectUrls.forEach((url) => revokeMediaObjectUrl(url));
          return;
        }

        setRecord(loadedRecord);
        setRepresentativePhotoUrl(photoUrl);
        setStepPhotoUrls(
          Object.fromEntries(
            stepMediaEntries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
          )
        );
        setLoadState('ready');
      } catch (error) {
        console.error(error);

        if (isMounted) {
          setLoadState('error');
        }
      }
    }

    void loadRecordAsync();

    return () => {
      isMounted = false;
      revokeMediaObjectUrl(objectUrl);
      stepObjectUrls.forEach((url) => revokeMediaObjectUrl(url));
    };
  }, [recordId]);

  async function handleDelete() {
    if (
      !record ||
      !window.confirm(`“${record.meal?.name ?? '이 기록'}”을(를) 삭제할까요? ${isCloudDataSource() ? '사진과 함께 휴지통에 보관되며 복구할 수 있어요.' : '사진도 함께 삭제되며 되돌릴 수 없습니다.'}`)
    ) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteMealRecordAsync(record.id);
      onDeleted();
    } catch (error) {
      console.error(error);
      setIsDeleting(false);
    }
  }

  return (
    <section className="view detail-view">
      <div className="section-heading">
        <p className="eyebrow">기록 상세</p>
        <h1>{record?.meal?.name ?? (loadState === 'loading' ? '기록을 불러오는 중' : '요리 기록')}</h1>
        <p>{record ? `${formatCookedAtLabel(record.cookedAt)}${record.authorName ? ` · 작성자 ${record.authorName}` : ''}` : '저장한 요리 기록을 다시 확인합니다.'}</p>
      </div>

      {record ? (
        <div className="detail-actions">
          <button className="secondary-action" type="button" onClick={() => onEdit(record)}>
            수정하기
          </button>
          <button className="danger-action" disabled={isDeleting} type="button" onClick={() => void handleDelete()}>
            {isDeleting ? '삭제 중' : '삭제'}
          </button>
        </div>
      ) : null}

      {loadState === 'loading' ? <p className="panel-state">기록을 불러오는 중입니다.</p> : null}
      {loadState === 'not-found' ? <p className="panel-state">요청한 기록을 찾을 수 없습니다.</p> : null}
      {loadState === 'error' ? <p className="panel-state">기록을 불러오지 못했습니다.</p> : null}
      {record ? (
        <div className="detail-content">
          <div className="detail-hero" aria-label="대표 완성사진">
            {representativePhotoUrl ? (
              <img alt={`${record.meal?.name ?? '요리'} 완성사진`} src={representativePhotoUrl} />
            ) : (
              <span>{record.meal?.name.slice(0, 1) ?? 'T'}</span>
            )}
          </div>
          <div className="detail-preview">
            <div>
              <span>만족도</span>
              <strong>{record.rating ? `${record.rating}/5` : '미입력'}</strong>
            </div>
            {record.meal?.tags.length ? (
              <div>
                <span>태그</span>
                <p className="tag-list">{record.meal.tags.map((tag) => <em key={tag}>#{tag}</em>)}</p>
              </div>
            ) : null}
            {record.memo ? (
              <div>
                <span>메모</span>
                <p>{record.memo}</p>
              </div>
            ) : null}
            {record.meal?.recipeUrl ? (
              <div>
                <span>원본 레시피</span>
                <a href={record.meal.recipeUrl} rel="noreferrer" target="_blank">
                  레시피 열기
                </a>
              </div>
            ) : null}
          </div>
          {record.ingredientGroups?.length ? (
            <section className="detail-section">
              <h2>재료정보</h2>
              {record.ingredientGroups.map((group) => (
                <div className="detail-ingredient-group" key={group.id}>
                  <strong>{group.name}</strong>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <span>{item.name}</span>
                        <span>{[item.quantity, item.unit].filter(Boolean).join(' ') || '수량 미입력'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ) : null}
          {record.recipeSteps?.length ? (
            <section className="detail-section">
              <h2>요리순서</h2>
              <ol className="detail-steps">
                {record.recipeSteps.map((step) => (
                  <li key={step.id}>
                    <div>
                      <strong>Step {step.order}</strong>
                      <p>{step.body}</p>
                    </div>
                    {step.mediaIds.length ? (
                      <div className="detail-step-photos">
                        {step.mediaIds.map((mediaId, index) =>
                          stepPhotoUrls[mediaId] ? (
                            <img
                              alt={`Step ${step.order} 과정 사진 ${index + 1}`}
                              key={mediaId}
                              src={stepPhotoUrls[mediaId]}
                            />
                          ) : null
                        )}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      ) : null}
      <button className="secondary-action" type="button" onClick={onBackClick}>
        홈으로 돌아가기
      </button>
    </section>
  );
}

function AddView({
  onSaved,
  recipeScrap,
  record,
}: {
  onSaved: (recordId: string) => void;
  recipeScrap: RecipeScrap | null;
  record: MealRecord | null;
}) {
  const isEditing = Boolean(record);
  const [mealName, setMealName] = useState(() => record?.meal?.name ?? recipeScrap?.title ?? '');
  const [recipeUrl, setRecipeUrl] = useState(() => record?.meal?.recipeUrl ?? recipeScrap?.url ?? '');
  const [cookedAt, setCookedAt] = useState(() => record?.cookedAt ?? new Date().toISOString().slice(0, 10));
  const [rating, setRating] = useState(() => (record?.rating ? String(record.rating) : ''));
  const [memo, setMemo] = useState(() => record?.memo ?? '');
  const [tagsInput, setTagsInput] = useState(() => record?.meal?.tags.join(', ') ?? '');
  const [ingredientGroups, setIngredientGroups] = useState<IngredientGroup[]>(() =>
    record?.ingredientGroups?.length
      ? record.ingredientGroups
      : [createIngredientGroup('재료'), createIngredientGroup('양념')]
  );
  const [recipeSteps, setRecipeSteps] = useState<RecipeStepDraft[]>(() =>
    record?.recipeSteps?.length
      ? record.recipeSteps.map((step) => ({ ...step, photoFile: null }))
      : [createRecipeStep(1)]
  );
  const [finishedPhoto, setFinishedPhoto] = useState<File | null>(null);
  const [existingMedia, setExistingMedia] = useState<Media[]>([]);
  const [existingMediaUrls, setExistingMediaUrls] = useState<Record<string, string>>({});
  const [removedMediaIds, setRemovedMediaIds] = useState<Set<string>>(() => new Set());
  const [replacementFiles, setReplacementFiles] = useState<Record<string, File>>({});
  const [submitState, setSubmitState] = useState<'idle' | 'saving' | 'error'>('idle');

  useEffect(() => {
    if (!record) return;

    const recordId = record.id;
    let isMounted = true;
    const objectUrls: string[] = [];

    async function loadExistingMediaAsync() {
      try {
        const media = await listMediaByMealRecordIdAsync(recordId);
        const entries = media.map((item) => {
          const url = createMediaObjectUrl(item);
          if (url?.startsWith('blob:')) objectUrls.push(url);
          return [item.id, url] as const;
        });

        if (!isMounted) return;
        setExistingMedia(media);
        setExistingMediaUrls(
          Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1])))
        );
      } catch (error) {
        console.error(error);
      }
    }

    void loadExistingMediaAsync();
    return () => {
      isMounted = false;
      objectUrls.forEach((url) => revokeMediaObjectUrl(url));
    };
  }, [record]);

  const visibleExistingMedia = useMemo(
    () => existingMedia.filter((media) => !removedMediaIds.has(media.id)),
    [existingMedia, removedMediaIds]
  );
  const existingFinishedMedia = visibleExistingMedia.find((media) => media.id === record?.finishedMediaId)
    ?? visibleExistingMedia.find(
      (media) =>
        !media.recipeStepId && !record?.recipeSteps?.some((step) => step.mediaIds.includes(media.id))
    );

  function getRecipeStepIdForMedia(media: Media) {
    return media.recipeStepId
      ?? recipeSteps.find((step) => step.mediaIds.includes(media.id))?.id;
  }

  function markMediaForRemoval(media: Media) {
    setRemovedMediaIds((ids) => new Set(ids).add(media.id));
    setReplacementFiles((files) => {
      const nextFiles = { ...files };
      delete nextFiles[media.id];
      return nextFiles;
    });
    const recipeStepId = getRecipeStepIdForMedia(media);
    if (recipeStepId) {
      setRecipeSteps((steps) =>
        steps.map((step) =>
          step.id === recipeStepId ? { ...step, mediaIds: step.mediaIds.filter((id) => id !== media.id) } : step
        )
      );
    }
  }

  function setReplacementFile(mediaId: string, file: File | null) {
    setReplacementFiles((files) => {
      if (!file) {
        const nextFiles = { ...files };
        delete nextFiles[mediaId];
        return nextFiles;
      }
      return { ...files, [mediaId]: file };
    });
  }

  function updateIngredientItem(
    groupId: string,
    itemId: string,
    field: 'name' | 'quantity' | 'unit',
    value: string
  ) {
    setIngredientGroups((groups) =>
      groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              items: group.items.map((item) =>
                item.id === itemId ? { ...item, [field]: value } : item
              ),
            }
          : group
      )
    );
  }

  function addIngredientItem(groupId: string) {
    setIngredientGroups((groups) =>
      groups.map((group) =>
        group.id === groupId ? { ...group, items: [...group.items, createIngredientItem()] } : group
      )
    );
  }

  function updateRecipeStep(stepId: string, update: Partial<RecipeStepDraft>) {
    setRecipeSteps((steps) => steps.map((step) => (step.id === stepId ? { ...step, ...update } : step)));
  }

  function moveRecipeStep(stepId: string, offset: -1 | 1) {
    setRecipeSteps((steps) => {
      const currentIndex = steps.findIndex((step) => step.id === stepId);
      const nextIndex = currentIndex + offset;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= steps.length) return steps;

      const nextSteps = [...steps];
      [nextSteps[currentIndex], nextSteps[nextIndex]] = [nextSteps[nextIndex], nextSteps[currentIndex]];
      return nextSteps;
    });
  }

  function insertRecipeStepAfter(stepId: string) {
    setRecipeSteps((steps) => {
      const currentIndex = steps.findIndex((step) => step.id === stepId);
      if (currentIndex < 0) return steps;

      const nextSteps = [...steps];
      nextSteps.splice(currentIndex + 1, 0, createRecipeStep(currentIndex + 2));
      return nextSteps;
    });
  }

  function removeRecipeStep(stepId: string) {
    const mediaIdsToRemove = existingMedia
      .filter((media) => getRecipeStepIdForMedia(media) === stepId)
      .map((media) => media.id);

    setRemovedMediaIds((ids) => new Set([...ids, ...mediaIdsToRemove]));
    setReplacementFiles((files) => {
      const nextFiles = { ...files };
      mediaIdsToRemove.forEach((mediaId) => delete nextFiles[mediaId]);
      return nextFiles;
    });
    setRecipeSteps((steps) => steps.filter((step) => step.id !== stepId));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedMealName = mealName.trim();

    if (!trimmedMealName || !cookedAt) {
      return;
    }

    setSubmitState('saving');

    try {
      const mealId = record?.mealId ?? createLocalId('meal');
      const mealRecordId = record?.id ?? createLocalId('meal-record');
      const trimmedMemo = memo.trim();
      const tagNames = [...new Set(tagsInput.split(',').map((tag) => tag.trim()).filter(Boolean))];
      const savedIngredientGroups = ingredientGroups
        .map((group) => ({
          ...group,
          items: group.items
            .filter((item) => item.name.trim())
            .map((item) => ({
              ...item,
              name: item.name.trim(),
              quantity: item.quantity?.trim() || undefined,
              unit: item.unit?.trim() || undefined,
            })),
        }))
        .filter((group) => group.items.length > 0);
      const savedRecipeSteps = recipeSteps
        .filter((step) => step.body.trim())
        .map((step, index) => ({
          id: step.id,
          order: index + 1,
          body: step.body.trim(),
          mediaIds: step.mediaIds,
        }));

      if (isEditing) {
        await updateMealAsync(mealId, {
          name: trimmedMealName,
          recipeUrl: recipeUrl.trim() || null,
          memo: trimmedMemo || null,
        });
      } else {
        await createMealAsync({
          id: mealId,
          name: trimmedMealName,
          recipeUrl: recipeUrl.trim() || undefined,
          memo: trimmedMemo || undefined,
        });
      }
      await setMealTagNamesAsync(mealId, tagNames);
      if (isEditing) {
        await updateMealRecordAsync(mealRecordId, {
          cookedAt,
          rating: rating ? Number(rating) : null,
          memo: trimmedMemo || null,
          ingredientGroups: savedIngredientGroups.length ? savedIngredientGroups : null,
          recipeSteps: savedRecipeSteps,
        });
      } else {
        await createMealRecordAsync({
          id: mealRecordId,
          mealId,
          cookedAt,
          rating: rating ? Number(rating) : undefined,
          memo: trimmedMemo || undefined,
          ingredientGroups: savedIngredientGroups.length ? savedIngredientGroups : undefined,
          recipeSteps: savedRecipeSteps.length ? savedRecipeSteps : undefined,
        });
      }

      const mediaIdsToDelete = new Set(removedMediaIds);
      let finishedMediaId = removedMediaIds.has(existingFinishedMedia?.id ?? '')
        ? undefined
        : existingFinishedMedia?.id;

      if (finishedPhoto) {
        const media = await createMediaAsync({
          id: createLocalId('media'),
          mealRecordId,
          type: 'photo',
          blob: finishedPhoto,
        });

        if (media) {
          if (existingFinishedMedia) mediaIdsToDelete.add(existingFinishedMedia.id);
          finishedMediaId = media.id;
        }
      }

      let recipeStepsWithMedia = await Promise.all(
        savedRecipeSteps.map(async (step) => {
          const draft = recipeSteps.find((item) => item.id === step.id);

          if (!draft?.photoFile) {
            return step;
          }

          const media = await createMediaAsync({
            id: createLocalId('media'),
            mealRecordId,
            type: 'photo',
            blob: draft.photoFile,
            recipeStepId: step.id,
          });

          return {
            ...step,
            mediaIds: media ? [...step.mediaIds, media.id] : step.mediaIds,
          };
        })
      );

      for (const [mediaId, file] of Object.entries(replacementFiles)) {
        const existing = existingMedia.find((media) => media.id === mediaId);
        const recipeStepId = existing ? getRecipeStepIdForMedia(existing) : undefined;
        if (!existing || !recipeStepId || removedMediaIds.has(mediaId)) continue;

        const replacement = await createMediaAsync({
          id: createLocalId('media'),
          mealRecordId,
          type: 'photo',
          blob: file,
          recipeStepId,
        });
        if (!replacement) continue;

        mediaIdsToDelete.add(mediaId);
        recipeStepsWithMedia = recipeStepsWithMedia.map((step) =>
          step.id === recipeStepId
            ? { ...step, mediaIds: step.mediaIds.map((id) => (id === mediaId ? replacement.id : id)) }
            : step
        );
      }

      if (isEditing || finishedPhoto || mediaIdsToDelete.size || Object.keys(replacementFiles).length) {
        await updateMealRecordAsync(mealRecordId, {
          recipeSteps: recipeStepsWithMedia,
          finishedMediaId: finishedMediaId ?? null,
        });
      }
      await Promise.all([...mediaIdsToDelete].map((mediaId) => deleteMediaAsync(mediaId)));

      onSaved(mealRecordId);
    } catch (error) {
      console.error(error);
      setSubmitState('error');
    }
  }

  return (
    <section className="view">
      <div className="section-heading">
        <p className="eyebrow">{isEditing ? '기록 수정' : '새 기록'}</p>
        <h1>{isEditing ? '기록 수정' : '기록하기'}</h1>
        <p>
          {recipeScrap
            ? `“${getRecipeScrapTitle(recipeScrap)}” 레시피를 바탕으로 기록합니다.`
            : '요리 이름과 날짜만 입력해도 바로 저장할 수 있습니다.'}
        </p>
      </div>

      <form className="meal-form" onSubmit={handleSubmit}>
        <label>
          요리 이름
          <input
            required
            type="text"
            value={mealName}
            placeholder="김치볶음밥"
            onChange={(event) => setMealName(event.target.value)}
          />
        </label>
        <label className="compact-field">
          날짜
          <input
            required
            type="date"
            value={cookedAt}
            onChange={(event) => setCookedAt(event.target.value)}
          />
        </label>
        <label className="compact-field">
          만족도
          <select value={rating} onChange={(event) => setRating(event.target.value)}>
            <option value="">선택 안 함</option>
            <option value="5">5점</option>
            <option value="4">4점</option>
            <option value="3">3점</option>
            <option value="2">2점</option>
            <option value="1">1점</option>
          </select>
        </label>
        <label>
          태그
          <input
            type="text"
            value={tagsInput}
            placeholder="한식, 간단요리"
            onChange={(event) => setTagsInput(event.target.value)}
          />
          <span className="field-hint">쉼표로 나누어 입력하세요. 요리 자체에 저장됩니다.</span>
        </label>
        <label>
          원본 레시피 링크
          <input
            type="url"
            value={recipeUrl}
            placeholder="https://..."
            onChange={(event) => setRecipeUrl(event.target.value)}
          />
          <span className="field-hint">스크랩에서 시작한 기록은 이 링크를 그대로 보관합니다.</span>
        </label>

        <fieldset className="recipe-section">
          <legend>재료정보</legend>
          <p>만든 날의 재료와 양념을 따로 남겨두세요.</p>
          {ingredientGroups.map((group) => (
            <div className="ingredient-group" key={group.id}>
              <div className="ingredient-group-heading">
                <h2>{group.name}</h2>
                <button type="button" onClick={() => addIngredientItem(group.id)}>
                  + {group.name} 추가
                </button>
              </div>
              <div className="ingredient-labels" aria-hidden="true">
                <span>이름</span>
                <span>수량</span>
                <span>단위</span>
              </div>
              {group.items.map((item, index) => (
                <div className="ingredient-row" key={item.id}>
                  <input
                    aria-label={`${group.name} ${index + 1} 이름`}
                    value={item.name}
                    placeholder="예: 돼지고기"
                    onChange={(event) => updateIngredientItem(group.id, item.id, 'name', event.target.value)}
                  />
                  <input
                    aria-label={`${group.name} ${index + 1} 수량`}
                    value={item.quantity}
                    placeholder="200"
                    onChange={(event) => updateIngredientItem(group.id, item.id, 'quantity', event.target.value)}
                  />
                  <input
                    aria-label={`${group.name} ${index + 1} 단위`}
                    value={item.unit}
                    placeholder="g"
                    onChange={(event) => updateIngredientItem(group.id, item.id, 'unit', event.target.value)}
                  />
                </div>
              ))}
            </div>
          ))}
        </fieldset>

        <fieldset className="recipe-section">
          <legend>요리순서</legend>
          <p>순서별로 메모를 남기고, 필요하면 중간 사진도 골라두세요.</p>
          {recipeSteps.map((step, index) => (
            <div className="recipe-step" key={step.id}>
              <div className="recipe-step-heading">
                <strong>Step {index + 1}</strong>
                <div className="recipe-step-actions">
                  <button
                    aria-label={`Step ${index + 1} 위로 이동`}
                    className="step-order-action"
                    disabled={index === 0}
                    type="button"
                    onClick={() => moveRecipeStep(step.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`Step ${index + 1} 아래로 이동`}
                    className="step-order-action"
                    disabled={index === recipeSteps.length - 1}
                    type="button"
                    onClick={() => moveRecipeStep(step.id, 1)}
                  >
                    ↓
                  </button>
                  <label className="step-photo-entry">
                    사진 추가
                    <input
                      aria-label={`Step ${index + 1} 사진 추가`}
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        updateRecipeStep(step.id, { photoFile: event.target.files?.[0] ?? null })
                      }
                    />
                  </label>
                </div>
              </div>
              <textarea
                aria-label={`Step ${index + 1} 설명`}
                value={step.body}
                placeholder="예: 팬을 충분히 달군 뒤 재료를 볶아요."
                rows={3}
                onChange={(event) => updateRecipeStep(step.id, { body: event.target.value })}
              />
              {visibleExistingMedia.filter((media) => getRecipeStepIdForMedia(media) === step.id).length ? (
                <div className="existing-media-grid" aria-label={`Step ${index + 1} 기존 사진`}>
                  {visibleExistingMedia
                    .filter((media) => getRecipeStepIdForMedia(media) === step.id)
                    .map((media) => (
                      <div className="existing-media-card" key={media.id}>
                        {replacementFiles[media.id] ? (
                          <SelectedPhotoPreview
                            alt={`Step ${index + 1} 교체할 과정 사진`}
                            file={replacementFiles[media.id]}
                            label="교체할 사진"
                            onClear={() => setReplacementFile(media.id, null)}
                          />
                        ) : (
                          <>
                            <span className="media-preview-label">현재 사진</span>
                            {existingMediaUrls[media.id] ? <img alt={`Step ${index + 1} 기존 과정 사진`} src={existingMediaUrls[media.id]} /> : null}
                          </>
                        )}
                        <div>
                          <label className="small-action file-action">
                            변경
                            <input
                              accept="image/*"
                              aria-label={`Step ${index + 1} 기존 사진 변경`}
                              type="file"
                              onChange={(event) => setReplacementFile(media.id, event.target.files?.[0] ?? null)}
                            />
                          </label>
                          <button aria-label={`Step ${index + 1} 기존 사진 삭제`} className="remove-media-action" type="button" onClick={() => markMediaForRemoval(media)}>×</button>
                        </div>
                      </div>
                    ))}
                </div>
              ) : null}
              {step.photoFile ? (
                <SelectedPhotoPreview
                  alt={`Step ${index + 1} 추가할 과정 사진`}
                  file={step.photoFile}
                  label="추가할 사진"
                  onClear={() => updateRecipeStep(step.id, { photoFile: null })}
                />
              ) : null}
              <div className="recipe-step-footer">
                <button className="step-insert-action" type="button" onClick={() => insertRecipeStepAfter(step.id)}>
                  + 이 단계 뒤에 추가
                </button>
                <button className="step-delete-action" type="button" onClick={() => removeRecipeStep(step.id)}>
                  이 단계 삭제
                </button>
              </div>
            </div>
          ))}
          <button
            className="add-row-button"
            type="button"
            onClick={() => setRecipeSteps((steps) => [...steps, createRecipeStep(steps.length + 1)])}
          >
            + 요리순서 추가
          </button>
        </fieldset>

        <label>
          요리 완성사진
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setFinishedPhoto(event.target.files?.[0] ?? null)}
          />
          <span className="field-hint">완성사진은 1장만 등록하며, 홈과 목록의 대표 썸네일로 사용됩니다.</span>
        </label>
        {finishedPhoto && !existingFinishedMedia ? (
          <SelectedPhotoPreview
            alt="추가할 완성사진"
            file={finishedPhoto}
            label="추가할 완성사진"
            onClear={() => setFinishedPhoto(null)}
          />
        ) : null}
        {existingFinishedMedia ? (
          <div className="existing-media-grid finished-media-grid" aria-label="기존 완성사진">
            <div className="existing-media-card">
              {finishedPhoto ? (
                <SelectedPhotoPreview
                  alt="교체할 완성사진"
                  file={finishedPhoto}
                  label="교체할 사진"
                  onClear={() => setFinishedPhoto(null)}
                />
              ) : (
                <>
                  <span className="media-preview-label">현재 사진</span>
                  {existingMediaUrls[existingFinishedMedia.id] ? <img alt="기존 완성사진" src={existingMediaUrls[existingFinishedMedia.id]} /> : null}
                </>
              )}
              <div>
                <label className="small-action file-action">
                  변경
                  <input
                    accept="image/*"
                    aria-label="기존 완성사진 변경"
                    type="file"
                    onChange={(event) => setFinishedPhoto(event.target.files?.[0] ?? null)}
                  />
                </label>
                <button aria-label="기존 완성사진 삭제" className="remove-media-action" type="button" onClick={() => markMediaForRemoval(existingFinishedMedia)}>×</button>
              </div>
            </div>
          </div>
        ) : null}
        <label>
          메모
          <textarea
            value={memo}
            placeholder="다음엔 파를 더 넣기"
            rows={4}
            onChange={(event) => setMemo(event.target.value)}
          />
        </label>
        {submitState === 'error' ? (
          <p className="form-error">저장하지 못했습니다. 다시 시도해 주세요.</p>
        ) : null}
        <button className="primary-action" type="submit" disabled={submitState === 'saving'}>
          {submitState === 'saving' ? '저장 중' : isEditing ? '수정 저장하기' : '저장하기'}
        </button>
      </form>
    </section>
  );
}

function RecipePreview({ recipeScrap }: { recipeScrap: RecipeScrap }) {
  const preview = getRecipePreview(recipeScrap.url);
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className={`scrap-preview${preview.thumbnailUrl && !imageFailed ? ' has-image' : ''}`}>
      {preview.thumbnailUrl && !imageFailed ? (
        <img alt="" src={preview.thumbnailUrl} onError={() => setImageFailed(true)} />
      ) : (
        <span>{preview.label === 'Instagram' ? '◎' : '↗'}</span>
      )}
      <small>{preview.label}</small>
    </div>
  );
}

function RecipeView({ onStartRecord }: { onStartRecord: (recipeScrap: RecipeScrap) => void }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [recipeScraps, setRecipeScraps] = useState<RecipeScrap[]>([]);
  const [query, setQuery] = useState('');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [submitState, setSubmitState] = useState<'idle' | 'saving' | 'error'>('idle');

  async function loadRecipeScrapsAsync() {
    setLoadState('loading');

    try {
      setRecipeScraps(await listRecipeScrapsAsync());
      setLoadState('ready');
    } catch (error) {
      console.error(error);
      setLoadState('error');
    }
  }

  useEffect(() => {
    void loadRecipeScrapsAsync();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState('saving');

    try {
      await createRecipeScrapAsync({
        id: createLocalId('recipe-scrap'),
        url,
        title,
        memo,
      });
      setUrl('');
      setTitle('');
      setMemo('');
      setSubmitState('idle');
      await loadRecipeScrapsAsync();
    } catch (error) {
      console.error(error);
      setSubmitState('error');
    }
  }

  async function handleDelete(recipeScrap: RecipeScrap) {
    if (!window.confirm(`“${getRecipeScrapTitle(recipeScrap)}” 스크랩을 ${isCloudDataSource() ? '휴지통으로 옮길까요? 언제든 복구할 수 있어요.' : '삭제할까요?'}`)) {
      return;
    }

    await deleteRecipeScrapAsync(recipeScrap.id);
    await loadRecipeScrapsAsync();
  }

  const filteredRecipeScraps = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
    if (!normalizedQuery) return recipeScraps;

    return recipeScraps.filter((recipeScrap) =>
      [getRecipeScrapTitle(recipeScrap), recipeScrap.memo, recipeScrap.url]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('ko-KR')
        .includes(normalizedQuery)
    );
  }, [query, recipeScraps]);

  return (
    <section className="view recipe-view">
      <div className="section-heading">
        <p className="eyebrow">레시피 스크랩</p>
        <h1>레시피 스크랩</h1>
        <p>링크를 저장해두고, 마음이 가는 날 바로 요리 기록을 시작할 수 있습니다.</p>
      </div>
      <form className="recipe-scrap-form" onSubmit={handleSubmit}>
        <label>
          레시피 링크
          <input
            required
            type="url"
            value={url}
            placeholder="https://example.com/recipe"
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <label>
          제목
          <input
            type="text"
            value={title}
            placeholder="예: 얼큰한 닭볶음탕"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          메모
          <textarea
            rows={3}
            value={memo}
            placeholder="다음 주말에 만들어 보기"
            onChange={(event) => setMemo(event.target.value)}
          />
        </label>
        {submitState === 'error' ? <p className="form-error">저장하지 못했습니다. 다시 시도해 주세요.</p> : null}
        <button className="primary-action" disabled={submitState === 'saving'} type="submit">
          {submitState === 'saving' ? '저장 중' : '레시피 저장'}
        </button>
      </form>
      <section className="recipe-scrap-list" aria-live="polite">
        <div className="panel-header">
          <h2>저장한 레시피</h2>
          <span>{filteredRecipeScraps.length}개</span>
        </div>
        {recipeScraps.length ? (
          <label className="compact-search-field">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              placeholder="제목, 메모, 링크 검색"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        ) : null}
        {loadState === 'loading' ? <p className="panel-state">레시피를 불러오는 중입니다.</p> : null}
        {loadState === 'error' ? <p className="panel-state">저장한 레시피를 불러오지 못했습니다.</p> : null}
        {loadState === 'ready' && recipeScraps.length === 0 ? (
          <div className="empty-state">
            <strong>아직 저장한 레시피가 없습니다.</strong>
            <p>마음에 든 외부 레시피 링크를 먼저 모아보세요.</p>
          </div>
        ) : null}
        {filteredRecipeScraps.length ? (
          <ul className="scrap-list">
            {filteredRecipeScraps.map((recipeScrap) => (
              <li key={recipeScrap.id}>
                <RecipePreview recipeScrap={recipeScrap} />
                <div className="scrap-body">
                  <strong>{getRecipeScrapTitle(recipeScrap)}</strong>
                  {recipeScrap.authorName && <small>저장한 사람 · {recipeScrap.authorName}</small>}
                  <a href={recipeScrap.url} rel="noreferrer" target="_blank">
                    {getRecipePreview(recipeScrap.url).host || recipeScrap.url} ↗
                  </a>
                  {recipeScrap.memo ? <p>{recipeScrap.memo}</p> : null}
                  <div className="scrap-actions">
                    <button type="button" onClick={() => onStartRecord(recipeScrap)}>
                      이 레시피로 기록
                    </button>
                    <button className="quiet-action" type="button" onClick={() => void handleDelete(recipeScrap)}>
                      삭제
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {loadState === 'ready' && recipeScraps.length > 0 && filteredRecipeScraps.length === 0 ? (
          <div className="empty-state">
            <strong>조건에 맞는 레시피가 없어요.</strong>
            <p>제목이나 메모, 링크의 다른 단어로 찾아보세요.</p>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function RecordTextCard({
  record,
  onOpen,
}: {
  record: MealRecord;
  onOpen: (record: MealRecord) => void;
}) {
  return (
    <li>
      <button className="record-text-card" type="button" onClick={() => onOpen(record)}>
        <span className="record-date">{formatCookedAtLabel(record.cookedAt)}</span>
        <strong>{record.meal?.name ?? '이름 없는 요리'}</strong>
        <span>{record.meal?.tags.length ? record.meal.tags.map((tag) => `#${tag}`).join(' ') : formatRating(record.rating)}</span>
      </button>
    </li>
  );
}

function RecordSearchCard({ record, onOpen }: { record: MealRecord; onOpen: (record: MealRecord) => void }) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let objectUrl: string | null = null;
    const mediaId = record.finishedMediaId ?? record.mediaIds[0];

    async function loadThumbnailAsync() {
      if (!mediaId) {
        setThumbnailUrl(null);
        return;
      }

      try {
        const media = await getMediaByIdAsync(mediaId);
        const url = media ? createMediaObjectUrl(media) : null;
        if (url?.startsWith('blob:')) objectUrl = url;
        if (isMounted) setThumbnailUrl(url);
      } catch (error) {
        console.error(error);
        if (isMounted) setThumbnailUrl(null);
      }
    }

    void loadThumbnailAsync();

    return () => {
      isMounted = false;
      revokeMediaObjectUrl(objectUrl);
    };
  }, [record.finishedMediaId, record.id, record.mediaIds]);

  return (
    <li>
      <button className="record-search-card" type="button" onClick={() => onOpen(record)}>
        <span className="record-search-thumbnail" aria-hidden="true">
          {thumbnailUrl ? <img alt="" src={thumbnailUrl} /> : <span>{record.meal?.name.slice(0, 1) ?? 'T'}</span>}
        </span>
        <span className="record-search-body">
          <strong>{record.meal?.name ?? '이름 없는 요리'}</strong>
          <span>{record.meal?.tags.join(' · ')}</span>
        </span>
        <span className="record-date">{formatCookedAtLabel(record.cookedAt)}</span>
      </button>
    </li>
  );
}

function SearchView({
  onOpenRecord,
  preset,
}: {
  onOpenRecord: (record: MealRecord) => void;
  preset: SearchPreset | null;
}) {
  const [records, setRecords] = useState<MealRecord[]>([]);
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null);

  useEffect(() => {
    void listMealRecordsAsync().then(setRecords).catch((error) => console.error(error));
  }, []);

  useEffect(() => {
    if (!preset) return;

    setQuery('');
    setSelectedTag(preset.tag ?? '');
    setSelectedMonth(
      preset.year && preset.month
        ? { year: preset.year, month: preset.month }
        : null
    );
  }, [preset]);

  const allTags = useMemo(
    () =>
      [...new Set(records.flatMap((record) => record.meal?.tags ?? []))].sort((left, right) =>
        left.localeCompare(right, 'ko-KR')
      ),
    [records]
  );
  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');

    return records.filter((record) => {
      const searchText = [
        record.meal?.name,
        record.memo,
        record.meal?.memo,
        ...(record.meal?.tags ?? []),
        ...(record.ingredientGroups?.flatMap((group) =>
          group.items.flatMap((item) => [item.name, item.note])
        ) ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('ko-KR');

      return (
        (!normalizedQuery || searchText.includes(normalizedQuery)) &&
        (!selectedTag || record.meal?.tags.includes(selectedTag)) &&
        (!selectedMonth || record.cookedAt.startsWith(`${selectedMonth.year}-${String(selectedMonth.month).padStart(2, '0')}`))
      );
    });
  }, [query, records, selectedMonth, selectedTag]);

  const activeFilters = [
    selectedMonth ? `${selectedMonth.year}년 ${selectedMonth.month}월` : null,
    selectedTag ? `#${selectedTag}` : null,
  ].filter(Boolean);

  function clearFilters() {
    setQuery('');
    setSelectedTag('');
    setSelectedMonth(null);
  }

  return (
    <section className="view search-view">
      <div className="section-heading">
        <p className="eyebrow">검색</p>
        <h1>기록 검색</h1>
        <p>처음에는 최신 요리 기록을 모두 보여주고, 요리 이름·메모·태그·재료로 좁혀볼 수 있습니다.</p>
      </div>
      <label className="search-field">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={query}
          placeholder="요리, 태그, 메모, 재료 검색"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {activeFilters.length ? (
        <div className="active-search-filters" aria-label="적용된 검색 필터">
          {activeFilters.map((filter) => <span key={filter}>{filter}</span>)}
          <button type="button" onClick={clearFilters}>필터 지우기</button>
        </div>
      ) : null}
      {allTags.length ? (
        <div className="tag-filter" aria-label="태그 필터">
          <button className={!selectedTag ? 'is-active' : ''} type="button" onClick={() => setSelectedTag('')}>
            전체
          </button>
          {allTags.map((tag) => (
            <button
              className={selectedTag === tag ? 'is-active' : ''}
              key={tag}
              type="button"
              onClick={() => setSelectedTag(selectedTag === tag ? '' : tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      ) : null}
      <p className="result-count">{query.trim() || selectedTag || selectedMonth ? `${filteredRecords.length}개의 검색 결과` : `전체 ${filteredRecords.length}개의 기록`}</p>
      {filteredRecords.length ? (
        <ul className="record-search-list">
          {filteredRecords.map((record) => (
            <RecordSearchCard key={record.id} record={record} onOpen={onOpenRecord} />
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <strong>{records.length ? '조건에 맞는 기록이 없어요.' : '아직 검색할 기록이 없어요.'}</strong>
          <p>{records.length ? '다른 단어나 태그로 다시 찾아보세요.' : '첫 요리 기록을 남기면 여기서 바로 찾을 수 있어요.'}</p>
        </div>
      )}
    </section>
  );
}

function WorldCupChoice({
  record,
  onChoose,
  disabled,
}: {
  record: MealRecord | undefined;
  onChoose: () => void;
  disabled: boolean;
}) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let objectUrl: string | null = null;
    const mediaId = record?.finishedMediaId ?? record?.mediaIds[0];

    async function loadThumbnailAsync() {
      if (!mediaId) {
        setThumbnailUrl(null);
        return;
      }

      try {
        const media = await getMediaByIdAsync(mediaId);
        const url = media ? createMediaObjectUrl(media) : null;
        if (url?.startsWith('blob:')) objectUrl = url;
        if (isMounted) setThumbnailUrl(url);
      } catch (error) {
        console.error(error);
        if (isMounted) setThumbnailUrl(null);
      }
    }

    void loadThumbnailAsync();

    return () => {
      isMounted = false;
      revokeMediaObjectUrl(objectUrl);
    };
  }, [record?.finishedMediaId, record?.id, record?.mediaIds]);

  const mealName = record?.meal?.name ?? '이름 없는 요리';

  return (
    <button type="button" disabled={disabled || !record} onClick={onChoose}>
      <span className="world-cup-thumbnail" aria-hidden="true">
        {thumbnailUrl ? <img alt="" src={thumbnailUrl} /> : <span>{mealName.slice(0, 1)}</span>}
      </span>
      <span className="world-cup-choice-copy">
        <strong>{mealName}</strong>
        <small>{record ? formatCookedAtLabel(record.cookedAt) : '기록을 찾을 수 없어요'}</small>
        {record?.rating ? <em>만족도 {record.rating}/5</em> : null}
      </span>
    </button>
  );
}

function WorldCupView({ records, onOpenRecord }: { records: MealRecord[]; onOpenRecord: (record: MealRecord) => void }) {
  const [session, setSession] = useState<WorldCupSession | null>(null);
  const [matches, setMatches] = useState<WorldCupMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const saving = useRef(false);
  const candidates = useMemo(() => getWorldCupCandidates(records), [records]);
  const recordById = useMemo(() => new Map(records.map((record) => [record.id, record])), [records]);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setLoadError(false);
    setErrorMessage('');
    async function loadWorldCupAsync() {
      try {
        const { session: savedSession, matches: savedMatches } = await getWorldCupStateAsync();
        if (!isMounted) return;
        setSession(savedSession);
        setMatches(savedMatches);
      } catch (error) {
        console.error(error);
        if (isMounted) {
          setLoadError(true);
          setErrorMessage('월드컵을 불러오지 못했어요. 연결을 확인하고 다시 시도해주세요.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    void loadWorldCupAsync();
    return () => { isMounted = false; };
  }, [reloadVersion]);

  async function persist(action: () => Promise<void>) {
    if (saving.current || isLoading || loadError) return;
    saving.current = true;
    setIsSaving(true);
    setErrorMessage('');
    try {
      await action();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '저장하지 못했어요. 다시 시도해주세요.');
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  async function startWorldCup(size: number) {
    await persist(async () => {
      const next = createWorldCup(records, size);
      const savedSession = await createWorldCupSessionAsync(next.session, next.matches);
      setSession(savedSession);
      setMatches(next.matches);
    });
  }

  async function chooseWinner(match: WorldCupMatch, winnerRecordId: string) {
    if (!session || match.winnerRecordId) return;
    await persist(async () => {
      const next = advanceWorldCup(session, matches, match.id, winnerRecordId);
      const savedSession = await saveWorldCupProgressAsync(next.session, next.matches);
      setSession(savedSession);
      setMatches(next.matches);
    });
  }

  const missingCandidates = session?.candidateRecordIds.some((id) => !recordById.has(id)) ?? false;
  const currentMatch = session
    ? matches.find((match) => match.round === session.currentRound && !match.winnerRecordId) ?? null
    : null;
  const roundSize = session ? 2 ** (session.totalRounds - session.currentRound + 1) : 0;
  const winner = session?.winnerRecordId ? recordById.get(session.winnerRecordId) : null;

  return (
    <section className="world-cup-panel">
      <div className="panel-header"><div><p className="eyebrow">요리 월드컵</p><h2>요리 월드컵</h2></div></div>
      {isLoading ? <p className="panel-state">월드컵을 불러오는 중입니다.</p> : null}
      {errorMessage ? <div role="alert"><p>{errorMessage}</p><button type="button" disabled={isSaving || isLoading} onClick={() => setReloadVersion((version) => version + 1)}>다시 불러오기</button></div> : null}
      {isSaving ? <p role="status">선택을 저장하고 있어요.</p> : null}
      {!isLoading && !loadError && missingCandidates ? <p role="status">대회에 포함된 기록이 삭제되었거나 더 이상 볼 수 없어요. 새 대회를 시작해주세요.</p> : null}
      {!isLoading && !loadError && (!session || session.status === 'completed' || missingCandidates) ? (
        <div className="world-cup-start">
          {winner ? <div className="world-cup-winner"><span>지난 우승</span><strong>{winner.meal?.name ?? '이름 없는 요리'}</strong><button type="button" onClick={() => onOpenRecord(winner)}>기록 보기</button></div> : null}
          {getWorldCupSizes(candidates.length).length ? (
            <><p>같은 요리는 최근 기록 하나만 후보로 삼아, 랜덤으로 대결을 만들어요.</p><div className="world-cup-size-actions">{getWorldCupSizes(candidates.length).map((size) => <button className="primary-action" key={size} type="button" disabled={isSaving} onClick={() => void startWorldCup(size)}>{size}강 시작</button>)}</div></>
          ) : <p className="panel-state">서로 다른 요리 기록을 2개 이상 남기면 월드컵을 시작할 수 있어요.</p>}
        </div>
      ) : null}
      {!isLoading && !loadError && !missingCandidates && session?.status === 'in-progress' && currentMatch ? (
        <div className="world-cup-match">
          <span>{roundSize}강 · {currentMatch.order}번째 대결</span>
          <div className="world-cup-choice-grid">
            {[currentMatch.leftRecordId, currentMatch.rightRecordId].map((recordId) => {
              const record = recordById.get(recordId);
              return <WorldCupChoice key={recordId} disabled={isSaving} record={record} onChoose={() => void chooseWinner(currentMatch, recordId)} />;
            })}
          </div>
          <p>더 마음에 드는 요리를 골라주세요.</p>
        </div>
      ) : null}
    </section>
  );
}

function RecapView({
  onOpenRecord,
  onOpenSearch,
}: {
  onOpenRecord: (record: MealRecord) => void;
  onOpenSearch: (preset: Omit<SearchPreset, 'key'>) => void;
}) {
  const [records, setRecords] = useState<MealRecord[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [section, setSection] = useState<'recap' | 'world-cup'>('recap');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    async function loadRecapAsync() {
      try {
        const nextRecords = await listMealRecordsAsync();
        setRecords(nextRecords);
        setSelectedYear((year) => year ?? getRecordYears(nextRecords)[0] ?? new Date().getFullYear());
        setLoadState('ready');
      } catch (error) {
        console.error(error);
        setLoadState('error');
      }
    }
    void loadRecapAsync();
  }, []);

  const years = getRecordYears(records);
  const summary = selectedYear ? buildRecapSummary(records, selectedYear) : null;
  const peakMonth = summary ? Math.max(1, ...summary.monthCounts) : 1;

  return (
    <section className="view recap-view">
      <div className="section-heading"><p className="eyebrow">결산</p><h1>{section === 'recap' ? <>요리 결산</> : <>요리 월드컵</>}</h1><p>{section === 'recap' ? '연도별 요리 기록을 바탕으로 계산합니다.' : '내가 남긴 요리 기록만 후보로 사용합니다.'}</p></div>
      <div className="recap-section-tabs" role="tablist" aria-label="결산 메뉴"><button className={section === 'recap' ? 'is-active' : ''} type="button" onClick={() => setSection('recap')}>연도 결산</button><button className={section === 'world-cup' ? 'is-active' : ''} type="button" onClick={() => setSection('world-cup')}>요리 월드컵</button></div>
      {loadState === 'loading' ? <p className="panel-state">기록을 불러오는 중입니다.</p> : null}
      {loadState === 'error' ? <p className="panel-state">결산을 불러오지 못했습니다.</p> : null}
      {loadState === 'ready' && section === 'world-cup' ? <WorldCupView records={records} onOpenRecord={onOpenRecord} /> : null}
      {loadState === 'ready' && section === 'recap' && summary && summary.totalCount ? (
        <>
          <label className="recap-year-select"><span>결산 연도</span><select value={summary.year} onChange={(event) => setSelectedYear(Number(event.target.value))}>{years.map((year) => <option key={year} value={year}>{year}년</option>)}</select></label>
          <div className="recap-grid"><section><span>남긴 요리</span><strong>{summary.totalCount}<small>개</small></strong></section><section><span>평균 만족도</span><strong>{summary.averageRating ?? '–'}<small>{summary.averageRating ? ' / 5' : ''}</small></strong></section><section><span>가장 많이 쓴 태그</span><strong className="tag-stat">{summary.favoriteTag ? `#${summary.favoriteTag}` : '–'}</strong></section></div>
          <section className="recap-highlight recap-months"><div className="panel-header"><div><p className="eyebrow">월별 기록</p><h2>{summary.year}년의 식탁</h2></div></div><div className="month-bar-list">{summary.monthCounts.map((count, index) => <button disabled={!count} key={index} type="button" onClick={() => onOpenSearch({ year: summary.year, month: index + 1 })}><span>{index + 1}월</span><i><b style={{ width: `${(count / peakMonth) * 100}%` }} /></i><strong>{count}</strong></button>)}</div></section>
          <section className="recap-highlight"><div className="panel-header"><div><p className="eyebrow">자주 사용한 태그</p><h2>{summary.topTags.length ? '올해의 취향' : '태그를 남겨보세요'}</h2></div></div>{summary.topTags.length ? <p className="recap-tag-list">{summary.topTags.map((tag) => <button key={tag.name} type="button" onClick={() => onOpenSearch({ tag: tag.name })}>#{tag.name} <b>{tag.count}</b></button>)}</p> : null}</section>
          <section className="recap-highlight"><div className="panel-header"><div><p className="eyebrow">가장 만족한 요리</p><h2>{summary.bestRecords.length ? `${summary.bestRecords[0].rating}점 기록` : '평점을 남겨보세요'}</h2></div></div>{summary.bestRecords.length ? <ul className="record-text-list">{summary.bestRecords.map((record) => <RecordTextCard key={record.id} record={record} onOpen={onOpenRecord} />)}</ul> : null}</section>
        </>
      ) : null}
      {loadState === 'ready' && section === 'recap' && summary && !summary.totalCount ? <div className="empty-state"><strong>아직 결산할 기록이 없어요.</strong><p>첫 요리 기록을 남기면 연도 결산이 시작됩니다.</p></div> : null}
    </section>
  );
}

function PlaceholderView({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <section className="view placeholder-view">
      <div className="section-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
    </section>
  );
}

export function App() {
  const { auth, message: authMessage, signIn, signOut } = useAuth();
  const activeDataScope = auth.status === 'signed-in' ? auth.user.id : 'local';
  setDataSource(auth.status === 'signed-in' ? 'cloud' : 'local');
  const [activeRoute, setActiveRoute] = useState<RouteKey>('home');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [selectedRecipeScrap, setSelectedRecipeScrap] = useState<RecipeScrap | null>(null);
  const [editingRecord, setEditingRecord] = useState<MealRecord | null>(null);
  const [searchPreset, setSearchPreset] = useState<SearchPreset | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    setSelectedRecordId(null);
    setSelectedRecipeScrap(null);
    setEditingRecord(null);
    setDataVersion((version) => version + 1);
  }, [activeDataScope]);

  if (auth.status === 'loading') {
    return <div className="app-shell"><main className="content"><span className="account-loading">계정 확인 중</span></main></div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="주요 메뉴">
        <div className="brand">
          
          <div>
            <strong>tavolo</strong>
          </div>
        </div>

        <nav className="nav-list">
          {routes.map((route) => (
            <button
              aria-current={(activeRoute === route.key || (route.key === 'home' && ['detail','search','add'].includes(activeRoute))) ? 'page' : undefined}
              key={route.key}
              type="button"
              onClick={() => {
                setActiveRoute(route.key);

                setSelectedRecipeScrap(null);
                setEditingRecord(null);
              }}
            >
              <NavIcon name={route.key} /><span>{route.label}</span>
            </button>
          ))}
        </nav>

        <AccountControls auth={auth} message={authMessage} onSignIn={signIn} onSignOut={signOut} />
      </aside>

      <main className="content">
        <div className="mobile-topbar">
          <strong className="wordmark">tavolo</strong>
          <AccountControls auth={auth} compact message={authMessage} onSignIn={signIn} onSignOut={signOut} />
        </div>

        {activeRoute === 'settings' && <section className="view settings-view"><div className="section-heading"><h1>설정</h1></div><AccountControls auth={auth} message={authMessage} onSignIn={signIn} onSignOut={signOut} />{auth.status === 'signed-in' && <JournalPanel key={activeDataScope} defaultName={getUserLabel(auth.user)} onChanged={() => { setDataVersion(v => v + 1); setEditingRecord(null); setSelectedRecordId(null); }} />}</section>}

        {activeRoute === 'home' && (
          <HomeView
            key={`home-${activeDataScope}-${dataVersion}`}
            onOpenRecord={(record) => {
              setSelectedRecordId(record.id);
              setActiveRoute('detail');
            }}
          />
        )}
        {activeRoute === 'add' && (
          <AddView
            key={`${activeDataScope}-${editingRecord?.id ?? selectedRecipeScrap?.id ?? 'new-record'}`}
            record={editingRecord}
            recipeScrap={selectedRecipeScrap}
            onSaved={(recordId) => {
              setDataVersion((version) => version + 1);
              setSelectedRecipeScrap(null);
              setEditingRecord(null);
              setSelectedRecordId(recordId);
              setActiveRoute('detail');
            }}
          />
        )}
        {activeRoute === 'detail' && (
          <DetailView
            key={`${activeDataScope}-${selectedRecordId ?? 'none'}`}
            recordId={selectedRecordId}
            onEdit={(record) => {
              setEditingRecord(record);
              setSelectedRecipeScrap(null);
              setActiveRoute('add');
            }}
            onDeleted={() => {
              setDataVersion((version) => version + 1);
              setSelectedRecordId(null);
              setActiveRoute('home');
            }}
            onBackClick={() => {
              setSelectedRecordId(null);
              setActiveRoute('home');
            }}
          />
        )}
        {activeRoute === 'recipes' && (
          <RecipeView
            onStartRecord={(recipeScrap) => {
              setSelectedRecipeScrap(recipeScrap);
              setEditingRecord(null);
              setActiveRoute('add');
            }}
          />
        )}
        {activeRoute === 'search' && (
          <SearchView
            key={`search-${dataVersion}`}
            preset={searchPreset}
            onOpenRecord={(record) => {
              setSelectedRecordId(record.id);
              setActiveRoute('detail');
            }}
          />
        )}
        {activeRoute === 'recap' && (
          <RecapView
            key={`recap-${dataVersion}`}
            onOpenSearch={(filter) => {
              setSearchPreset({ ...filter, key: createLocalId('search-filter') });
              setActiveRoute('search');
            }}
            onOpenRecord={(record) => {
              setSelectedRecordId(record.id);
              setActiveRoute('detail');
            }}
          />
        )}
        {activeRoute !== 'add' && activeRoute !== 'settings' && <button type="button" className="record-fab" onClick={() => { setEditingRecord(null); setSelectedRecipeScrap(null); setActiveRoute('add'); }}>＋ 기록하기</button>}
        {activeRoute === 'add' && <button type="button" className="form-back" onClick={() => setActiveRoute(editingRecord ? 'detail' : 'home')}>취소하고 돌아가기</button>}
      </main>
    </div>
  );
}
