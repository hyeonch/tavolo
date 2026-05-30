import { useEffect, useMemo, useState } from 'react';

import {
  createMediaObjectUrl,
  getMediaByIdAsync,
  listMealRecordsAsync,
  listRecentMealRecordsAsync,
  revokeMediaObjectUrl,
} from './db';
import type { MealRecord } from './types/meal';

type RouteKey = 'home' | 'add' | 'calendar' | 'search' | 'recap' | 'detail';

type Route = {
  key: RouteKey;
  label: string;
};

const routes: Route[] = [
  { key: 'home', label: '홈' },
  { key: 'add', label: '기록' },
  { key: 'calendar', label: '달력' },
  { key: 'search', label: '검색' },
  { key: 'recap', label: '결산' },
];

type HomeMealCard = {
  record: MealRecord;
  thumbnailUrl: string | null;
};

function getTodayLabel() {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'full',
  }).format(new Date());
}

function getCurrentMonthKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
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
  onAddClick,
  onOpenRecord,
}: {
  onAddClick: () => void;
  onOpenRecord: (record: MealRecord) => void;
}) {
  const [recentMeals, setRecentMeals] = useState<HomeMealCard[]>([]);
  const [currentMonthCount, setCurrentMonthCount] = useState(0);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let isMounted = true;
    let objectUrls: string[] = [];

    async function loadHomeAsync() {
      setLoadState('loading');

      try {
        const [recentRecords, allRecords] = await Promise.all([
          listRecentMealRecordsAsync(6),
          listMealRecordsAsync(),
        ]);
        const mealCards = await Promise.all(
          recentRecords.map(async (record) => {
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

        const monthKey = getCurrentMonthKey();
        setRecentMeals(mealCards);
        setCurrentMonthCount(
          allRecords.filter((record) => record.cookedAt.startsWith(monthKey)).length
        );
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
      objectUrls.forEach((url) => revokeMediaObjectUrl(url));
      objectUrls = [];
    };
  }, []);

  return (
    <section className="view home-view">
      <div className="section-heading">
        <p className="eyebrow">오늘의 식탁</p>
        <h1>요리를 남기고, 나중에 다시 꺼내보세요.</h1>
        <p>{getTodayLabel()}</p>
      </div>

      <div className="summary-grid" aria-label="요리 기록 요약">
        <div className="summary-item">
          <span>이번 달</span>
          <strong>{currentMonthCount}회</strong>
        </div>
        <div className="summary-item">
          <span>최근 기록</span>
          <strong>{recentMeals.length}개</strong>
        </div>
      </div>

      <button className="primary-action" type="button" onClick={onAddClick}>
        오늘 요리 기록하기
      </button>

      <div className="panel">
        <div className="panel-header">
          <h2>최근 기록</h2>
          <span>최신순</span>
        </div>
        {loadState === 'loading' ? <p className="panel-state">기록을 불러오는 중입니다.</p> : null}
        {loadState === 'error' ? (
          <p className="panel-state">저장된 기록을 불러오지 못했습니다.</p>
        ) : null}
        {loadState === 'ready' && recentMeals.length === 0 ? (
          <div className="empty-state">
            <strong>아직 저장된 요리가 없습니다.</strong>
            <p>첫 요리를 기록하면 이곳에 최근 기록이 쌓입니다.</p>
          </div>
        ) : null}
        {recentMeals.length > 0 ? (
          <ul className="meal-list">
            {recentMeals.map((mealCard) => (
              <MealCard
                key={mealCard.record.id}
                mealCard={mealCard}
                onOpen={onOpenRecord}
              />
            ))}
          </ul>
        ) : null}
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

function AddView() {
  return (
    <section className="view">
      <div className="section-heading">
        <p className="eyebrow">새 기록</p>
        <h1>오늘 만든 요리</h1>
        <p>IndexedDB 저장은 TVL-29에서 연결합니다.</p>
      </div>

      <form className="meal-form">
        <label>
          요리 이름
          <input type="text" placeholder="김치볶음밥" />
        </label>
        <label>
          날짜
          <input type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
        </label>
        <label>
          사진
          <input type="file" accept="image/*" />
        </label>
        <label>
          메모
          <textarea placeholder="다음엔 파를 더 넣기" rows={4} />
        </label>
        <button className="primary-action" type="button">
          저장 준비 중
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
            onAddClick={() => setActiveRoute('add')}
            onOpenRecord={(record) => {
              setSelectedRecord(record);
              setActiveRoute('detail');
            }}
          />
        )}
        {activeRoute === 'add' && <AddView />}
        {activeRoute === 'detail' && (
          <DetailPreviewView
            record={selectedRecord}
            onBackClick={() => {
              setSelectedRecord(null);
              setActiveRoute('home');
            }}
          />
        )}
        {activeRoute === 'calendar' && (
          <PlaceholderView
            eyebrow="달력"
            title="월별 요리 기록을 볼 준비"
            copy="날짜별 기록 조회와 대표 사진 표시는 Phase 2에서 연결합니다."
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
