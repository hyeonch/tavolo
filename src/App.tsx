import { useMemo, useState } from 'react';

type RouteKey = 'home' | 'add' | 'calendar' | 'search' | 'recap';

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

const recentMeals = ['김치볶음밥', '버섯 파스타', '토마토 달걀볶음'];

function getTodayLabel() {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'full',
  }).format(new Date());
}

function HomeView({ onAddClick }: { onAddClick: () => void }) {
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
          <strong>0회</strong>
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
          <span>프로토타입 데이터</span>
        </div>
        <ul className="meal-list">
          {recentMeals.map((meal) => (
            <li key={meal}>
              <span className="meal-thumbnail" aria-hidden="true" />
              <span>{meal}</span>
            </li>
          ))}
        </ul>
      </div>
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
  const activeRouteLabel = useMemo(
    () => routes.find((route) => route.key === activeRoute)?.label ?? '홈',
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

        {activeRoute === 'home' && <HomeView onAddClick={() => setActiveRoute('add')} />}
        {activeRoute === 'add' && <AddView />}
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
