# Tavolo

개인 요리 기록 앱. 직접 만든 요리를 날짜별로 기록하고, 사진과 메모로 다시 꺼내보며, 나중에는 연말 결산과 요리 월드컵으로 회고하는 로컬 우선 앱이다.

## 제품 방향

Tavolo는 대중 서비스나 SNS가 아니라 개인 아카이브에 가깝다. 사용자가 앱을 켜고 빠르게 오늘 만든 요리를 남긴 뒤, 달력과 사진을 중심으로 과거의 요리 기록을 다시 보는 경험을 우선한다.

핵심 원칙:

- 개인용 기록 앱으로 설계한다.
- 서버, 로그인, 공개 피드 없이 로컬 우선으로 시작한다.
- 요리 이름과 날짜만으로도 저장할 수 있게 한다.
- 사진, 영상, 메모, 만족도, 태그는 선택 입력으로 둔다.
- 달력과 사진 썸네일을 기록 탐색의 중심에 둔다.
- 결산과 월드컵은 MVP 이후 확장 가능한 구조로 준비한다.

## MVP 범위

초기 MVP의 목표는 `요리 기록 생성 -> 저장 -> 홈/달력에서 조회` 흐름을 완성하는 것이다.

포함 기능:

- 하단 탭 기반 앱 구조
- 홈, 달력, 추가, 검색, 결산 탭
- 요리 기록 생성
- 요리 이름, 날짜, 만족도, 메모, 태그 입력
- 사진 첨부
- 로컬 SQLite 저장
- 홈 화면 최근 기록 조회
- 달력 화면 날짜별 기록 조회
- 요리 상세 조회
- 기록 수정 및 삭제
- 기본 검색

MVP에서 제외:

- 계정 생성 및 로그인
- 클라우드 동기화
- 공개 피드
- 팔로우, 좋아요, 댓글
- SNS 공유
- 고급 통계

## 핵심 사용자 흐름

### 오늘 요리 기록

1. 앱을 연다.
2. `오늘의 요리 추가`를 누른다.
3. 요리 이름을 입력한다.
4. 필요하면 사진, 만족도, 메모, 태그를 추가한다.
5. 저장한다.
6. 홈 최근 기록과 달력의 해당 날짜에 기록이 표시된다.

### 과거 기록 조회

1. 달력 화면을 연다.
2. 특정 날짜를 선택한다.
3. 해당 날짜의 요리 목록을 확인한다.
4. 요리 상세 화면에서 사진, 메모, 만족도, 태그를 다시 본다.

### 연말 회고

MVP 이후에는 연도별 요리 수, 월별 요리 횟수, 만족도 높은 요리, 자주 사용한 태그를 보여주고, 기록된 요리들을 후보로 월드컵을 진행한다.

## 기술 스택

- React Native
- Expo
- Expo Router
- TypeScript
- SQLite
- Expo SQLite

기본 방향은 서버 없는 로컬 앱이다. 사진과 영상은 기기 로컬 저장소를 사용하되, 원본 삭제로 기록이 깨지지 않도록 앱 내부 저장소 복사 방식을 우선 검토한다.

## 개발 환경

```bash
npm install
npm run start
```

타입 체크는 다음 명령으로 실행한다.

```bash
npm run typecheck
```

## 데이터 모델 초안

```ts
type MealRecord = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  rating?: number; // 1~5
  memo?: string;
  tags: string[];
  mediaIds: string[];
  recipeUrl?: string;
  createdAt: string;
  updatedAt: string;
};

type Media = {
  id: string;
  mealRecordId: string;
  type: "photo" | "video";
  uri: string;
  thumbnailUri?: string;
  createdAt: string;
};

type Tag = {
  id: string;
  name: string;
  createdAt: string;
};
```

월드컵 기능은 MVP 이후 다음 모델을 추가해 확장한다.

```ts
type WorldCupSession = {
  id: string;
  title: string;
  year: number;
  candidateMealIds: string[];
  winnerMealId?: string;
  createdAt: string;
  completedAt?: string;
};

type WorldCupMatch = {
  id: string;
  sessionId: string;
  round: number;
  leftMealId: string;
  rightMealId: string;
  selectedMealId?: string;
  createdAt: string;
};
```

## 현재 폴더 구조

```txt
app/
  _layout.tsx
  (tabs)/
    _layout.tsx
    index.tsx
    calendar.tsx
    add.tsx
    search.tsx
    recap.tsx
assets/
src/
  db/
    schema.ts
  types/
    meal.ts
```

이후 기능 구현이 진행되면 아래 구조로 확장한다.

```txt
src/
  components/
    meal/
      MealCard.tsx
      MealForm.tsx
      MealMediaGrid.tsx
    calendar/
      CalendarMonth.tsx
      CalendarDayCell.tsx
    worldcup/
      WorldCupMatchCard.tsx
  db/
    schema.ts
    migrations/
    mealRepository.ts
    mediaRepository.ts
    tagRepository.ts
  hooks/
    useMealRecords.ts
    useCalendarMeals.ts
    useMediaPicker.ts
  lib/
    date.ts
    id.ts
    media.ts
  types/
    meal.ts
    media.ts
    worldcup.ts
```

## 개발 단계

### Phase 1. 기본 기록

- Expo 프로젝트 세팅
- 하단 탭 네비게이션 구성
- SQLite 세팅
- MealRecord, Media 타입 및 테이블 생성
- 요리 추가 화면 구현
- 사진 첨부 구현
- 기록 저장 구현
- 홈 최근 기록 리스트 구현

완료 기준: 요리 이름과 사진을 저장할 수 있고, 앱 재실행 후에도 기록이 유지된다.

### Phase 2. 달력

- 월 단위 달력 UI 구현
- 날짜별 기록 조회
- 요리 있는 날짜 표시
- 날짜 선택 시 기록 목록 표시
- 기록 상세 화면 이동

완료 기준: 달력에서 특정 날짜를 눌러 그날의 요리를 볼 수 있다.

### Phase 3. 상세, 수정, 삭제

- 요리 상세 화면 구현
- 사진 및 영상 갤러리 표시
- 기록 수정
- 기록 삭제
- 미디어 삭제

완료 기준: 저장한 기록을 다시 열고 수정하거나 삭제할 수 있다.

### Phase 4. 검색과 태그

- 검색 화면 구현
- 제목 검색
- 메모 검색
- 태그 추가
- 태그 필터

완료 기준: 요리 이름이나 태그로 과거 기록을 찾을 수 있다.

### Phase 5. 결산 기초

- 연도별 요리 수
- 월별 요리 수
- 만족도 높은 요리 목록
- 자주 사용한 태그
- 다시 해먹고 싶은 요리 목록

완료 기준: 올해 요리 기록을 간단히 돌아볼 수 있다.

### Phase 6. 요리 월드컵

- 월드컵 후보 선택
- 랜덤 매칭
- 라운드 진행
- 승자 선택
- 최종 우승 요리 저장
- 결과 화면 구현

완료 기준: 기록한 요리 중 최고의 요리를 토너먼트 방식으로 고를 수 있다.

## 성공 기준

- 앱을 켜고 10초 안에 오늘 요리를 기록할 수 있다.
- 기록한 요리가 홈과 달력에 표시된다.
- 사진 중심으로 과거 요리를 다시 볼 수 있다.
- 데이터가 앱 재실행 후에도 유지된다.
- 결산과 월드컵 기능을 나중에 무리 없이 추가할 수 있다.
