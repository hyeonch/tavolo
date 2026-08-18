import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { AccountControls } from './auth/AccountControls';
import { useAuth } from './auth/useAuth';
import {
  createMealAsync,
  createMealRecordAsync,
  createMediaAsync,
  createRecipeScrapAsync,
  createTagAsync,
  deleteMealRecordAsync,
  deleteMediaAsync,
  deleteRecipeScrapAsync,
  createMediaObjectUrl,
  getMealRecordByIdAsync,
  getTagByNameAsync,
  getMediaByIdAsync,
  listMealRecordsAsync,
  listRecipeScrapsAsync,
  replaceMealTagsAsync,
  revokeMediaObjectUrl,
  updateMealAsync,
  updateMealRecordAsync,
} from './db';
import type { IngredientGroup, MealRecord, RecipeScrap, RecipeStep } from './types/meal';

type RouteKey = 'home' | 'recipes' | 'add' | 'search' | 'recap' | 'detail';

type Route = {
  key: RouteKey;
  label: string;
};

const routes: Route[] = [
  { key: 'home', label: '홈' },
  { key: 'recipes', label: '레시피' },
  { key: 'add', label: '추가' },
  { key: 'search', label: '검색' },
  { key: 'recap', label: '결산' },
];

type HomeMealCard = {
  record: MealRecord;
  thumbnailUrl: string | null;
};

const emptyMealRecords: MealRecord[] = [];

function createLocalId(prefix: string) {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function getMonthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function moveMonth(month: Date, offset: number) {
  return new Date(month.getFullYear(), month.getMonth() + offset, 1);
}

function getCalendarDays(month: Date) {
  const firstWeekday = month.getDay();
  const totalDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + totalDays) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 && day <= totalDays ? day : null;
  });
}

function formatMonthLabel(month: Date) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
  }).format(month);
}

function formatSelectedDateLabel(cookedAt: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${cookedAt}T00:00:00`));
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

function MealCard({
  mealCard,
  onOpen,
}: {
  mealCard: HomeMealCard;
  onOpen: (record: MealRecord) => void;
}) {
  const { record, thumbnailUrl } = mealCard;

  return (
    <li>
      <button className="meal-card" type="button" onClick={() => onOpen(record)}>
        <span className="meal-thumbnail" aria-hidden="true">
          {thumbnailUrl ? <img alt="" src={thumbnailUrl} /> : record.meal?.name.slice(0, 1) ?? 'T'}
        </span>
        <span className="meal-card-body">
          <strong>{record.meal?.name ?? '이름 없는 요리'}</strong>
          <span>
            {formatCookedAtLabel(record.cookedAt)} · {formatRating(record.rating)}
          </span>
          {record.memo ? <span className="meal-card-memo">{record.memo}</span> : null}
        </span>
      </button>
    </li>
  );
}

function HomeView({
  onOpenRecord,
}: {
  onOpenRecord: (record: MealRecord) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() => getMonthStart(today));
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(today));
  const [records, setRecords] = useState<MealRecord[]>([]);
  const [selectedMeals, setSelectedMeals] = useState<HomeMealCard[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const recordsByDate = useMemo(() => {
    const groupedRecords = new Map<string, MealRecord[]>();

    records.forEach((record) => {
      const items = groupedRecords.get(record.cookedAt) ?? [];
      items.push(record);
      groupedRecords.set(record.cookedAt, items);
    });

    return groupedRecords;
  }, [records]);
  const calendarDays = useMemo(() => getCalendarDays(month), [month]);
  const selectedRecords = useMemo(
    () => recordsByDate.get(selectedDate) ?? emptyMealRecords,
    [recordsByDate, selectedDate]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadHomeAsync() {
      setLoadState('loading');

      try {
        const allRecords = await listMealRecordsAsync();

        if (!isMounted) return;

        setRecords(allRecords);
        setLoadState('ready');
      } catch (error) {
        console.error(error);

        if (isMounted) {
          setLoadState('error');
        }
      }
    }

    void loadHomeAsync();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    let objectUrls: string[] = [];

    async function loadSelectedMealsAsync() {
      try {
        const mealCards = await Promise.all(
          selectedRecords.map(async (record) => {
            const representativeMediaId = record.finishedMediaId ?? record.mediaIds[0];
            const media = representativeMediaId ? await getMediaByIdAsync(representativeMediaId) : null;
            const thumbnailUrl = media ? createMediaObjectUrl(media) : null;

            if (thumbnailUrl?.startsWith('blob:')) {
              objectUrls.push(thumbnailUrl);
            }

            return { record, thumbnailUrl };
          })
        );

        if (!isMounted) {
          objectUrls.forEach((url) => revokeMediaObjectUrl(url));
          return;
        }

        setSelectedMeals(mealCards);
      } catch (error) {
        console.error(error);

        if (isMounted) {
          setSelectedMeals([]);
        }
      }
    }

    void loadSelectedMealsAsync();

    return () => {
      isMounted = false;
      objectUrls.forEach((url) => revokeMediaObjectUrl(url));
    };
  }, [selectedRecords]);

  function handleMonthChange(offset: number) {
    const nextMonth = moveMonth(month, offset);
    setMonth(nextMonth);
    setSelectedDate(toDateKey(nextMonth));
  }

  return (
    <section className="view home-view">
      <div className="section-heading">
        <p className="eyebrow">나의 요리 달력</p>
        <h1>언제, 무엇을 만들었는지 다시 꺼내보세요.</h1>
        <p>날짜를 선택하면 그날 남긴 요리 기록을 볼 수 있습니다.</p>
      </div>

      <div className="calendar-layout">
        <section className="calendar-panel" aria-label={`${formatMonthLabel(month)} 요리 달력`}>
          <div className="calendar-header">
            <div>
              <span className="eyebrow">요리한 날</span>
              <h2>{formatMonthLabel(month)}</h2>
            </div>
            <div className="calendar-controls">
              <button type="button" aria-label="이전 달" onClick={() => handleMonthChange(-1)}>
                이전
              </button>
              <button type="button" aria-label="다음 달" onClick={() => handleMonthChange(1)}>
                다음
              </button>
            </div>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {['일', '월', '화', '수', '목', '금', '토'].map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {calendarDays.map((day, index) => {
              if (!day) {
                return <span aria-hidden="true" className="calendar-empty-day" key={`empty-${index}`} />;
              }

              const date = new Date(month.getFullYear(), month.getMonth(), day);
              const dateKey = toDateKey(date);
              const count = recordsByDate.get(dateKey)?.length ?? 0;
              const isSelected = selectedDate === dateKey;
              const isToday = toDateKey(today) === dateKey;

              return (
                <button
                  aria-pressed={isSelected}
                  className={`calendar-day${count > 0 ? ' has-records' : ''}${
                    isSelected ? ' is-selected' : ''
                  }${isToday ? ' is-today' : ''}`}
                  key={dateKey}
                  type="button"
                  onClick={() => setSelectedDate(dateKey)}
                >
                  <span>{day}</span>
                  {count > 0 ? <small>{count}개</small> : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="selected-date-panel" aria-live="polite">
          <div className="panel-header">
            <div>
              <span className="eyebrow">선택한 날</span>
              <h2>{formatSelectedDateLabel(selectedDate)}</h2>
            </div>
            <span>{selectedRecords.length}개 기록</span>
          </div>
          {loadState === 'loading' ? <p className="panel-state">기록을 불러오는 중입니다.</p> : null}
          {loadState === 'error' ? (
            <p className="panel-state">저장된 기록을 불러오지 못했습니다.</p>
          ) : null}
          {loadState === 'ready' && selectedMeals.length === 0 ? (
            <div className="empty-state">
              <strong>이날은 남긴 요리 기록이 없습니다.</strong>
              <p>새 기록은 하단의 추가 탭에서 남길 수 있습니다.</p>
            </div>
          ) : null}
          {selectedMeals.length > 0 ? (
            <ul className="meal-list">
              {selectedMeals.map((mealCard) => (
                <MealCard
                  key={mealCard.record.id}
                  mealCard={mealCard}
                  onOpen={onOpenRecord}
                />
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </section>
  );
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
      !window.confirm(`“${record.meal?.name ?? '이 기록'}”을(를) 삭제할까요? 사진도 함께 삭제되며 되돌릴 수 없습니다.`)
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
        <p>{record ? formatCookedAtLabel(record.cookedAt) : '저장한 요리 기록을 다시 확인합니다.'}</p>
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
  const [submitState, setSubmitState] = useState<'idle' | 'saving' | 'error'>('idle');

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
      const tagIds = await Promise.all(
        tagNames.map(async (tagName) => {
          const existingTag = await getTagByNameAsync(tagName);

          if (existingTag) return existingTag.id;

          const tagId = createLocalId('tag');
          await createTagAsync({ id: tagId, name: tagName });
          return tagId;
        })
      );
      await replaceMealTagsAsync(mealId, tagIds);
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

      if (finishedPhoto) {
        const media = await createMediaAsync({
          id: createLocalId('media'),
          mealRecordId,
          type: 'photo',
          blob: finishedPhoto,
        });

        if (media) {
          if (record?.finishedMediaId) {
            await deleteMediaAsync(record.finishedMediaId);
          }
          await updateMealRecordAsync(mealRecordId, { finishedMediaId: media.id });
        }
      }

      const recipeStepsWithMedia = await Promise.all(
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

      if (recipeStepsWithMedia.some((step) => step.mediaIds.length > 0)) {
        await updateMealRecordAsync(mealRecordId, { recipeSteps: recipeStepsWithMedia });
      }

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
        <h1>{isEditing ? '그날의 기록을 다듬어요.' : '오늘 만든 요리'}</h1>
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
              <textarea
                aria-label={`Step ${index + 1} 설명`}
                value={step.body}
                placeholder="예: 팬을 충분히 달군 뒤 재료를 볶아요."
                rows={3}
                onChange={(event) => updateRecipeStep(step.id, { body: event.target.value })}
              />
              {step.photoFile ? <span className="field-hint">선택됨: {step.photoFile.name}</span> : null}
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
    if (!window.confirm(`“${getRecipeScrapTitle(recipeScrap)}” 스크랩을 삭제할까요?`)) {
      return;
    }

    await deleteRecipeScrapAsync(recipeScrap.id);
    await loadRecipeScrapsAsync();
  }

  return (
    <section className="view recipe-view">
      <div className="section-heading">
        <p className="eyebrow">레시피 스크랩</p>
        <h1>나중에 만들 레시피를 모아두세요.</h1>
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
          <span>{recipeScraps.length}개</span>
        </div>
        {loadState === 'loading' ? <p className="panel-state">레시피를 불러오는 중입니다.</p> : null}
        {loadState === 'error' ? <p className="panel-state">저장한 레시피를 불러오지 못했습니다.</p> : null}
        {loadState === 'ready' && recipeScraps.length === 0 ? (
          <div className="empty-state">
            <strong>아직 저장한 레시피가 없습니다.</strong>
            <p>마음에 든 외부 레시피 링크를 먼저 모아보세요.</p>
          </div>
        ) : null}
        {recipeScraps.length ? (
          <ul className="scrap-list">
            {recipeScraps.map((recipeScrap) => (
              <li key={recipeScrap.id}>
                <RecipePreview recipeScrap={recipeScrap} />
                <div className="scrap-body">
                  <strong>{getRecipeScrapTitle(recipeScrap)}</strong>
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

function SearchView({ onOpenRecord }: { onOpenRecord: (record: MealRecord) => void }) {
  const [records, setRecords] = useState<MealRecord[]>([]);
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');

  useEffect(() => {
    void listMealRecordsAsync().then(setRecords).catch((error) => console.error(error));
  }, []);

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
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('ko-KR');

      return (
        (!normalizedQuery || searchText.includes(normalizedQuery)) &&
        (!selectedTag || record.meal?.tags.includes(selectedTag))
      );
    });
  }, [query, records, selectedTag]);

  return (
    <section className="view search-view">
      <div className="section-heading">
        <p className="eyebrow">검색</p>
        <h1>기억나는 단어로<br />식탁을 찾아보세요.</h1>
        <p>요리 이름, 메모, 태그를 함께 검색합니다.</p>
      </div>
      <label className="search-field">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={query}
          placeholder="요리, 메모, 태그 검색"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
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
      <p className="result-count">{filteredRecords.length}개의 기록</p>
      {filteredRecords.length ? (
        <ul className="record-text-list">
          {filteredRecords.map((record) => (
            <RecordTextCard key={record.id} record={record} onOpen={onOpenRecord} />
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

function RecapView({ onOpenRecord }: { onOpenRecord: (record: MealRecord) => void }) {
  const [records, setRecords] = useState<MealRecord[]>([]);

  useEffect(() => {
    void listMealRecordsAsync().then(setRecords).catch((error) => console.error(error));
  }, []);

  const ratedRecords = records.filter((record) => record.rating);
  const averageRating = ratedRecords.length
    ? (ratedRecords.reduce((sum, record) => sum + (record.rating ?? 0), 0) / ratedRecords.length).toFixed(1)
    : null;
  const favoriteTag = useMemo(() => {
    const counts = new Map<string, number>();
    records.flatMap((record) => record.meal?.tags ?? []).forEach((tag) => {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });

    return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
  }, [records]);
  const bestRating = Math.max(0, ...records.map((record) => record.rating ?? 0));
  const bestRecords = records.filter((record) => record.rating === bestRating).slice(0, 3);

  return (
    <section className="view recap-view">
      <div className="section-heading">
        <p className="eyebrow">결산</p>
        <h1>쌓인 식탁을<br />한눈에 돌아봐요.</h1>
        <p>지금 이 브라우저에 저장된 기록을 바탕으로 계산합니다.</p>
      </div>
      {records.length ? (
        <>
          <div className="recap-grid">
            <section><span>남긴 요리</span><strong>{records.length}<small>개</small></strong></section>
            <section><span>평균 만족도</span><strong>{averageRating ?? '–'}<small>{averageRating ? ' / 5' : ''}</small></strong></section>
            <section><span>가장 많이 쓴 태그</span><strong className="tag-stat">{favoriteTag ? `#${favoriteTag}` : '–'}</strong></section>
          </div>
          <section className="recap-highlight">
            <div className="panel-header">
              <div><p className="eyebrow">가장 만족한 요리</p><h2>{bestRating ? `${bestRating}점 기록` : '평점을 남겨보세요'}</h2></div>
            </div>
            {bestRecords.length ? (
              <ul className="record-text-list">
                {bestRecords.map((record) => <RecordTextCard key={record.id} record={record} onOpen={onOpenRecord} />)}
              </ul>
            ) : null}
          </section>
        </>
      ) : (
        <div className="empty-state">
          <strong>아직 결산할 기록이 없어요.</strong>
          <p>요리를 몇 번 남기면 좋아한 맛과 자주 만든 요리가 보이기 시작해요.</p>
        </div>
      )}
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
  const [activeRoute, setActiveRoute] = useState<RouteKey>('home');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [selectedRecipeScrap, setSelectedRecipeScrap] = useState<RecipeScrap | null>(null);
  const [editingRecord, setEditingRecord] = useState<MealRecord | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const activeRouteLabel = useMemo(
    () =>
      activeRoute === 'detail'
        ? '상세'
        : routes.find((route) => route.key === activeRoute)?.label ?? '홈',
    [activeRoute]
  );

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="주요 메뉴">
        <div className="brand">
          <span className="brand-mark">T</span>
          <div>
            <strong>Tavolo</strong>
            <span>개인 요리 아카이브</span>
          </div>
        </div>

        <nav className="nav-list">
          {routes.map((route) => (
            <button
              aria-current={activeRoute === route.key ? 'page' : undefined}
              key={route.key}
              type="button"
              onClick={() => {
                setActiveRoute(route.key);

                if (route.key !== 'add') {
                  setSelectedRecipeScrap(null);
                  setEditingRecord(null);
                } else {
                  setSelectedRecipeScrap(null);
                  setEditingRecord(null);
                }
              }}
            >
              {route.label}
            </button>
          ))}
        </nav>

        <AccountControls auth={auth} message={authMessage} onSignIn={signIn} onSignOut={signOut} />
      </aside>

      <main className="content">
        <div className="mobile-topbar">
          <strong>{activeRouteLabel}</strong>
          <AccountControls auth={auth} compact message={authMessage} onSignIn={signIn} onSignOut={signOut} />
        </div>

        {activeRoute === 'home' && (
          <HomeView
            key={`home-${dataVersion}`}
            onOpenRecord={(record) => {
              setSelectedRecordId(record.id);
              setActiveRoute('detail');
            }}
          />
        )}
        {activeRoute === 'add' && (
          <AddView
            key={editingRecord?.id ?? selectedRecipeScrap?.id ?? 'new-record'}
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
            onOpenRecord={(record) => {
              setSelectedRecordId(record.id);
              setActiveRoute('detail');
            }}
          />
        )}
        {activeRoute === 'recap' && (
          <RecapView
            key={`recap-${dataVersion}`}
            onOpenRecord={(record) => {
              setSelectedRecordId(record.id);
              setActiveRoute('detail');
            }}
          />
        )}
      </main>
    </div>
  );
}
