# Data Model

Current direction:

- `Meal` represents the reusable dish.
- `MealRecord` represents one dated cooking record for a `Meal`.
- `Media` belongs to `MealRecord`.
- A `RecipeScrap` is a saved external recipe link; it can seed a new `Meal`/`MealRecord`, whose `recipeUrl` preserves the source link.
- `Tag` belongs to `Meal` through `meal_tags`; the add-record form may collect tags while creating a cooking record, but those tags should be saved on the linked `Meal`.
- Recipe notes are part of a cooking record for now: keep ingredient groups and recipe steps attached to `MealRecord` until a richer reusable recipe model is needed.
- Step photos should still be represented as `Media`, with enough metadata to associate them to a recipe step when implemented.
- Each `MealRecord` has at most one finished-dish representative photo; this should be the thumbnail source for home, list, search, and recap surfaces.
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
  ingredientGroups?: {
    id: string;
    name: string; // e.g. '재료', '양념'
    items: { id: string; name: string; quantity?: string; unit?: string; note?: string }[];
  }[];
  recipeSteps?: { id: string; order: number; body: string; mediaIds: string[] }[];
  finishedMediaId?: string;
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

type RecipeScrap = {
  id: string;
  url: string;
  title?: string;
  memo?: string;
  createdAt: string;
  updatedAt: string;
};
```

Rationale:

- A user may save a meal from a recipe link before cooking it.
- Recipe scraps let a user keep an external recipe before deciding to cook it, without creating a meal record prematurely.
- A user may cook the same meal multiple times, creating multiple records.
- A user may adjust ingredient groups and steps on each cooking attempt, so Phase 1 recipe notes stay on `MealRecord` rather than becoming a separate reusable recipe entity immediately.
- The single finished photo rule keeps thumbnails deterministic while still allowing step photos to exist separately.
- Recaps and search should be able to distinguish the reusable dish from each dated record, while still using meal-level tags entered from the add-record flow.
- The repository layer should hide IndexedDB and Blob/object URL details from UI components.
- Debug seed helpers may exist for browser-local development data, but product UI should not depend on seeded records.

Supabase persistence direction:

- All account data is owned by `auth.users.id` through a `user_id` column and RLS; rows cannot cross user boundaries.
- `meals`, `meal_records`, `tags`, `meal_tags`, and `recipe_scraps` map directly to the current conceptual types. Ingredient groups and recipe steps remain JSONB columns on `meal_records`.
- `media` stores private Storage metadata (`storage_path`, MIME type, size, kind, and optional recipe-step ID); Blob data itself lives in the private `meal-media` bucket.
- Existing IndexedDB records are imported only after the user explicitly approves a first-login migration. Keep the local copy until that import succeeds.
