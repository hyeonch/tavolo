# Tavolo

Tavolo는 로컬 우선 개인 요리 아카이브 웹앱이다. 직접 만든 요리를 빠르게 기록하고, 사진과 메모를 붙인 뒤, 최근 기록과 달력, 검색, 간단한 결산으로 다시 꺼내보는 것을 목표로 한다.

## 제품 방향

Tavolo는 웹앱 우선 제품이다. 이전 Expo/React Native 구현은 프로토타입과 참고 자료로만 본다.

핵심 원칙:

- MVP는 브라우저 기반 웹앱으로 먼저 만든다.
- 개인용 로컬 우선 앱으로 유지한다.
- MVP에서는 계정, 서버, 피드, 좋아요, 댓글, 팔로우, 동기화를 만들지 않는다.
- 구조화된 기록은 주로 IndexedDB에 저장한다.
- 첨부 사진은 가능한 한 브라우저 로컬 Blob/File 데이터로 저장한다.
- 요리 이름과 날짜만으로도 빠르게 저장할 수 있어야 한다.
- 사진, 메모, 만족도, 태그, 레시피 URL은 선택 입력이다.
- 사용자에게 보이는 문구는 기본적으로 한국어를 사용한다.

## MVP 범위

첫 웹 MVP는 다음 흐름을 완성한다.

`웹앱 열기 -> 요리 기록 생성 -> 선택적으로 사진 첨부 -> 브라우저에 로컬 저장 -> 홈/달력에서 다시 보기`

포함 기능:

- 웹앱 라우팅과 반응형 레이아웃
- 홈, 기록 추가, 달력, 검색, 결산 화면
- 요리 기록 생성
- 요리 이름, 날짜, 만족도, 메모, 태그, 레시피 URL 입력
- 브라우저 로컬에 저장되는 사진 첨부
- IndexedDB 기반 로컬 repository 레이어
- 홈 최근 기록
- 달력 날짜별 탐색
- 상세 조회, 수정, 삭제
- 기본 텍스트 검색

제외 기능:

- 네이티브 모바일 앱 출시
- 계정 생성과 로그인
- 클라우드 동기화
- 공개 피드
- 소셜 기능
- 공유 플로우
- 고급 분석

## 사용자 흐름

### 오늘 요리 기록

1. 웹앱을 연다.
2. 새 요리 기록을 시작한다.
3. 요리 이름을 입력한다.
4. 필요하면 사진, 만족도, 메모, 태그, 레시피 URL을 추가한다.
5. 저장한다.
6. 홈과 달력에서 저장된 기록을 확인한다.

### 과거 기록 조회

1. 홈 또는 달력을 연다.
2. 날짜나 최근 기록을 선택한다.
3. 요리 상세 화면을 연다.
4. 사진, 메모, 만족도, 태그, 레시피 URL을 다시 본다.

### 이후 회고

핵심 MVP 이후에는 연도별/월별 요리 횟수, 만족도 높은 요리, 자주 사용한 태그를 요약하고, 저장된 요리를 후보로 요리 월드컵을 진행할 수 있다.

## 기술 방향

대상 스택:

- React
- TypeScript
- Vite
- 구조화된 로컬 데이터 저장용 IndexedDB
- 첨부 사진 저장용 브라우저 File/Blob
- 초기 스캐폴드에서는 plain CSS

Expo/React Native 파일은 MVP 경로에서 제거했다. 사용자가 명시적으로 다시 요청하지 않는 한 새 MVP 기능은 Expo 위에 만들지 않는다.

## 개발

의존성 설치:

```bash
npm install
```

웹앱 실행:

```bash
npm run dev
```

빌드와 타입 체크:

```bash
npm run build
npm run typecheck
```

프로덕션 빌드 미리보기:

```bash
npm run preview
```

## 데이터 모델

현재 개념 모델:

```ts
type Meal = {
  id: string;
  name: string;
  recipeUrl?: string;
  memo?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type MealRecord = {
  id: string;
  mealId: string;
  cookedAt: string; // YYYY-MM-DD
  rating?: number; // 1-5
  memo?: string;
  mediaIds: string[];
  createdAt: string;
  updatedAt: string;
};

type Media = {
  id: string;
  mealRecordId: string;
  type: "photo";
  uri?: string;
  blob?: Blob;
  thumbnailUri?: string;
  createdAt: string;
};

type Tag = {
  id: string;
  name: string;
  createdAt: string;
};
```

모델 메모:

- `Meal`은 재사용 가능한 요리 자체를 나타낸다.
- `MealRecord`는 특정 날짜에 요리하거나 먹은 한 번의 기록을 나타낸다.
- `Media`는 `MealRecord`에 속한다.
- 태그는 meal-tag 관계를 통해 `Meal`에 속한다.
- 웹 repository 레이어는 IndexedDB 세부 구현을 UI 컴포넌트에서 숨겨야 한다.
- TVL-29의 초기 구현은 별도 라이브러리 없이 브라우저 기본 IndexedDB 위에 얇은 promise 래퍼를 둔다.
- 저장소 API는 `src/db/index.ts`에서 가져온다.

## Linear 계획

작업은 Linear의 `tavolo` 팀과 `Tavolo MVP` 프로젝트에서 관리한다.

현재 웹앱 우선 마일스톤 순서:

1. `Phase 1: 웹앱 기반 전환`
2. `Phase 2: 달력/상세 탐색`
3. `Phase 3: 수정/삭제/미디어 관리`
4. `Phase 4: 검색/태그`
5. `Phase 5: 결산 기초`
6. `Phase 6: 요리 월드컵`

다음 구현 순서:

- `TVL-29`: IndexedDB 로컬 저장소와 repository 레이어 구성
- `TVL-12`: 웹 홈 최근 요리 기록 리스트 구현

완료된 Expo 프로토타입 이슈는 히스토리로만 유지한다. 새 MVP 작업은 웹앱 우선 Linear 이슈를 따른다.
