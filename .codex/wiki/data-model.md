# Data Model

Current direction:

- `Meal` represents the reusable dish.
- `MealRecord` represents one dated cooking record for a `Meal`.
- `Media` belongs to `MealRecord`.
- `Tag` belongs to `Meal` through `meal_tags`.

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
```

Rationale:

- A user may save a meal from a recipe link before cooking it.
- A user may cook the same meal multiple times, creating multiple records.
- Recaps and search should be able to distinguish the reusable dish from each dated record.
