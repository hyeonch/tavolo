# Domain Notes

Tavolo is a local-first personal cooking record web app.

Core language:

- A `Meal` is the dish itself: what the food is, optional recipe link, notes, and tags.
- A `MealRecord` is an event of cooking or eating a meal on a date.
- A `Media` item belongs to a `MealRecord`, because photos/videos capture a specific cooking instance.
- Tags currently belong to `Meal`, because tags such as cuisine, category, or style describe the dish itself.

Use Korean user-facing copy by default.

Platform direction:

- The MVP is web-app-first.
- Supabase is the account-backed source of truth for authenticated users; browser-local data remains only for migration and short-lived client state.
- Photos are private personal archive media stored in Supabase Storage, not publicly addressable files.
- The first cloud-backed release requires connectivity for writes; offline conflict resolution is a later enhancement.

국가, 주재료, 요리 종류는 회차별 metadata의 country, mainIngredient, dishType 문자열 배열로 저장한다. 입력 기본값 목록은 두지 않는다. 검색 선택지는 해당 기록장에 저장된 값으로 구성한다. 기존 자유 태그는 보존한다.
