import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import {
  createMealAsync,
  createMealRecordAsync,
  createMediaAsync,
  createMediaObjectUrl,
  getMediaByIdAsync,
  listMealRecordsAsync,
  revokeMediaObjectUrl,
} from './db';
import type { MealRecord } from './types/meal';

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
            const firstMediaId = record.mediaIds[0];
            const media = firstMediaId ? await getMediaByIdAsync(firstMediaId) : null;
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

function DetailPreviewView({
  record,
  onBackClick,
}: {
  record: MealRecord | null;
  onBackClick: () => void;
}) {
  return (
    <section className="view placeholder-view">
      <div className="section-heading">
        <p className="eyebrow">기록 상세</p>
        <h1>{record?.meal?.name ?? '요리 기록'}</h1>
        <p>{record ? formatCookedAtLabel(record.cookedAt) : '선택한 기록을 찾을 수 없습니다.'}</p>
      </div>
      {record ? (
        <div className="detail-preview">
          <div>
            <span>만족도</span>
            <strong>{record.rating ? `${record.rating}/5` : '미입력'}</strong>
          </div>
          {record.memo ? (
            <div>
              <span>메모</span>
              <p>{record.memo}</p>
            </div>
          ) : null}
          {record.meal?.tags.length ? (
            <div>
              <span>태그</span>
              <p>{record.meal.tags.join(', ')}</p>
            </div>
          ) : null}
        </div>
      ) : null}
      <button className="secondary-action" type="button" onClick={onBackClick}>
        홈으로 돌아가기
      </button>
    </section>
  );
}

function AddView({ onSaved }: { onSaved: () => void }) {
  const [mealName, setMealName] = useState('');
  const [cookedAt, setCookedAt] = useState(new Date().toISOString().slice(0, 10));
  const [rating, setRating] = useState('');
  const [memo, setMemo] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitState, setSubmitState] = useState<'idle' | 'saving' | 'error'>('idle');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedMealName = mealName.trim();

    if (!trimmedMealName || !cookedAt) {
      return;
    }

    setSubmitState('saving');

    try {
      const mealId = createLocalId('meal');
      const mealRecordId = createLocalId('meal-record');
      const trimmedMemo = memo.trim();
      await createMealAsync({
        id: mealId,
        name: trimmedMealName,
        memo: trimmedMemo || undefined,
      });
      await createMealRecordAsync({
        id: mealRecordId,
        mealId,
        cookedAt,
        rating: rating ? Number(rating) : undefined,
        memo: trimmedMemo || undefined,
      });

      if (photo) {
        await createMediaAsync({
          id: createLocalId('media'),
          mealRecordId,
          type: 'photo',
          blob: photo,
        });
      }

      onSaved();
    } catch (error) {
      console.error(error);
      setSubmitState('error');
    }
  }

  return (
    <section className="view">
      <div className="section-heading">
        <p className="eyebrow">새 기록</p>
        <h1>오늘 만든 요리</h1>
        <p>요리 이름과 날짜만 입력해도 바로 저장할 수 있습니다.</p>
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
        <label>
          날짜
          <input
            required
            type="date"
            value={cookedAt}
            onChange={(event) => setCookedAt(event.target.value)}
          />
        </label>
        <label>
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
          사진
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
          />
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
          {submitState === 'saving' ? '저장 중' : '저장하기'}
        </button>
      </form>
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
  const [activeRoute, setActiveRoute] = useState<RouteKey>('home');
  const [selectedRecord, setSelectedRecord] = useState<MealRecord | null>(null);
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
              onClick={() => setActiveRoute(route.key)}
            >
              {route.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="content">
        <div className="mobile-topbar">
          <strong>{activeRouteLabel}</strong>
          <span>Tavolo</span>
        </div>

        {activeRoute === 'home' && (
          <HomeView
            onOpenRecord={(record) => {
              setSelectedRecord(record);
              setActiveRoute('detail');
            }}
          />
        )}
        {activeRoute === 'add' && (
          <AddView
            onSaved={() => {
              setActiveRoute('home');
            }}
          />
        )}
        {activeRoute === 'detail' && (
          <DetailPreviewView
            record={selectedRecord}
            onBackClick={() => {
              setSelectedRecord(null);
              setActiveRoute('home');
            }}
          />
        )}
        {activeRoute === 'recipes' && (
          <PlaceholderView
            eyebrow="레시피 스크랩"
            title="나중에 만들 레시피를 모아두세요."
            copy="외부 레시피 링크 저장과 기록 시작 흐름은 다음 단계에서 연결합니다."
          />
        )}
        {activeRoute === 'search' && (
          <PlaceholderView
            eyebrow="검색"
            title="요리 이름과 메모로 찾기"
            copy="IndexedDB 검색 쿼리는 Phase 4에서 구현합니다."
          />
        )}
        {activeRoute === 'recap' && (
          <PlaceholderView
            eyebrow="결산"
            title="올해의 식탁 돌아보기"
            copy="요리 횟수와 만족도 요약은 Phase 5에서 채웁니다."
          />
        )}
      </main>
    </div>
  );
}
