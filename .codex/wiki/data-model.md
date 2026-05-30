# Data Model

Current direction:

- `Meal` represents the reusable dish.
- `MealRecord` represents one dated cooking record for a `Meal`.
- `Media` belongs to `MealRecord`.
- `Tag` belongs to `Meal` through `meal_tags`.
- The web MVP should store structured records in IndexedDB.
- Attached photos should be represented by `Media` and stored locally in the browser, using Blob/File data where practical.
- TVL-29 uses a small native IndexedDB wrapper instead of adding an IndexedDB library.

Current conceptual types:

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
  meal?: Meal;
  cookedAt: string;
  rating?: number;
  memo?: string;
  mediaIds: string[];
  createdAt: string;
  updatedAt: string;
};

type Media = {
  id: string;
  mealRecordId: string;
  type: 'photo';
  uri?: string;
  blob?: Blob;
  thumbnailUri?: string;
  createdAt: string;
};
```

Rationale:

- A user may save a meal from a recipe link before cooking it.
- A user may cook the same meal multiple times, creating multiple records.
- Recaps and search should be able to distinguish the reusable dish from each dated record.
- The repository layer should hide IndexedDB and Blob/object URL details from UI components.
- Debug seed helpers may exist for browser-local development data, but product UI should not depend on seeded records.
