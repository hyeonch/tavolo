# Tavolo

Tavolo is a local-first personal cooking archive. It helps one person quickly record what they cooked, attach photos and notes, then rediscover past meals through recent lists, calendar views, search, and lightweight recaps.

## Product Direction

Tavolo is now a web-app-first product. The earlier Expo/React Native implementation is treated as a prototype and reference, not the target MVP architecture.

Core principles:

- Build the MVP as a browser-based web app first.
- Keep the app personal and local-first.
- Do not add accounts, servers, feeds, likes, comments, follows, or sync in the MVP.
- Store records in browser local storage, primarily IndexedDB.
- Store attached photos locally in the browser, using Blob/File data where practical.
- Make recording fast: meal name and date should be enough to save.
- Keep photos, memo, rating, tags, and recipe URL optional.
- Use Korean user-facing copy by default.

## MVP Scope

The first web MVP should complete this flow:

`open web app -> create meal record -> attach optional photo -> persist locally -> browse from home/calendar`

Included:

- Web app routing and responsive layout
- Home, add record, calendar, search, and recap surfaces
- Meal record creation
- Meal name, date, rating, memo, tags, recipe URL
- Photo attachment stored locally in the browser
- IndexedDB-backed local repository layer
- Recent records on home
- Calendar date-based browsing
- Detail, edit, and delete
- Basic text search

Excluded:

- Native mobile app release
- Account creation and login
- Cloud sync
- Public feed
- Social actions
- Sharing flows
- Advanced analytics

## User Flows

### Record Today's Cooking

1. Open the web app.
2. Start a new cooking record.
3. Enter the meal name.
4. Optionally attach a photo, rating, memo, tags, or recipe URL.
5. Save.
6. See the record on the home screen and calendar.

### Browse Past Records

1. Open the calendar or home screen.
2. Select a date or recent record.
3. Open the meal detail page.
4. Review photos, memo, rating, tags, and recipe URL.

### Recap Later

After the core MVP, Tavolo can summarize yearly and monthly cooking counts, favorite meals, common tags, and eventually run a cooking world cup using saved meals.

## Technical Direction

Target stack:

- React
- TypeScript
- Web app framework to be selected in `TVL-28`
- IndexedDB for local structured data
- Browser File/Blob storage for attached photos
- CSS or a lightweight styling approach selected with the web scaffold

The current repository may still contain Expo/React Native files from the prototype. `TVL-28` owns the web scaffold and cleanup decision. Do not continue building new MVP features on Expo unless explicitly requested.

## Development

Current prototype commands:

```bash
npm install
npm run typecheck
```

The web-app dev/build commands will be finalized by `TVL-28`.

## Data Model

Current conceptual model:

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

Model notes:

- `Meal` represents the reusable dish.
- `MealRecord` represents one dated cooking/eating event.
- `Media` belongs to `MealRecord`.
- Tags belong to `Meal` through a meal-tag relationship.
- The web repository layer should hide IndexedDB details from UI components.

## Linear Plan

Work is tracked in Linear under the `tavolo` team and `Tavolo MVP` project.

Current web-first milestone order:

1. `Phase 1: 웹앱 기반 전환`
2. `Phase 2: 달력/상세 탐색`
3. `Phase 3: 수정/삭제/미디어 관리`
4. `Phase 4: 검색/태그`
5. `Phase 5: 결산 기초`
6. `Phase 6: 요리 월드컵`

Next implementation should start with:

- `TVL-28`: 웹앱 스캐폴딩과 Expo 앱 구조 제거
- `TVL-29`: IndexedDB 로컬 저장소와 repository 레이어 구성

Completed Expo prototype issues are retained as historical context. New MVP work should follow the web-first Linear issues.
