import { requestToPromise, withStoreAsync, withStoresAsync } from './database';
import { stores } from './schema';
import { listMediaByMealRecordIdAsync } from './mediaRepository';
import { listTagsByMealIdAsync } from './tagRepository';
import type {
  CreateMealInput,
  CreateMealRecordInput,
  Meal,
  Media,
  MealRecord,
  UpdateMealInput,
  UpdateMealRecordInput,
} from '../types/meal';

type MealRow = Omit<Meal, 'tags'>;
type MealRecordRow = Omit<MealRecord, 'meal' | 'mediaIds'>;
type MealTagRow = {
  mealId: string;
  tagId: string;
  createdAt: string;
};

async function hydrateMealAsync(row: MealRow): Promise<Meal> {
  const tags = await listTagsByMealIdAsync(row.id);

  return {
    ...row,
    tags: tags.map((tag) => tag.name),
  };
}

async function hydrateMealRecordAsync(row: MealRecordRow): Promise<MealRecord> {
  const [meal, media] = await Promise.all([
    getMealByIdAsync(row.mealId),
    listMediaByMealRecordIdAsync(row.id),
  ]);

  return {
    ...row,
    meal: meal ?? undefined,
    mediaIds: media.map((item) => item.id),
  };
}

export async function createMealAsync(input: CreateMealInput) {
  const now = new Date().toISOString();
  const meal: MealRow = {
    id: input.id,
    name: input.name.trim(),
    recipeUrl: input.recipeUrl,
    memo: input.memo,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? input.createdAt ?? now,
  };

  await withStoreAsync(stores.meals, 'readwrite', (store) => requestToPromise(store.put(meal)));
  return getMealByIdAsync(input.id);
}

export async function getMealByIdAsync(id: string) {
  return withStoreAsync(stores.meals, 'readonly', async (store) => {
    const meal = await requestToPromise<MealRow | undefined>(store.get(id));
    return meal ? hydrateMealAsync(meal) : null;
  });
}

export async function listMealsAsync() {
  return withStoreAsync(stores.meals, 'readonly', async (store) => {
    const meals = await requestToPromise<MealRow[]>(store.getAll());
    const hydratedMeals = await Promise.all(meals.map(hydrateMealAsync));

    return hydratedMeals.sort((left, right) => left.name.localeCompare(right.name, 'ko-KR'));
  });
}

export async function updateMealAsync(id: string, input: UpdateMealInput) {
  const existingMeal = await withStoreAsync(stores.meals, 'readonly', (store) =>
    requestToPromise<MealRow | undefined>(store.get(id))
  );

  if (!existingMeal) {
    return null;
  }

  const meal: MealRow = {
    ...existingMeal,
    name: input.name?.trim() ?? existingMeal.name,
    recipeUrl: input.recipeUrl ?? existingMeal.recipeUrl,
    memo: input.memo ?? existingMeal.memo,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };

  await withStoreAsync(stores.meals, 'readwrite', (store) => requestToPromise(store.put(meal)));
  return getMealByIdAsync(id);
}

export async function deleteMealAsync(id: string) {
  return withStoresAsync(
    [stores.meals, stores.mealRecords, stores.media, stores.mealTags],
    'readwrite',
    async (storesByName) => {
      const meal = await requestToPromise<MealRow | undefined>(storesByName[stores.meals].get(id));

      if (!meal) {
        return false;
      }

      const mealRecords = await requestToPromise<MealRecordRow[]>(
        storesByName[stores.mealRecords].index('mealId').getAll(id)
      );
      const mealTags = await requestToPromise<MealTagRow[]>(
        storesByName[stores.mealTags].index('mealId').getAll(id)
      );
      const mediaRows = (
        await Promise.all(
          mealRecords.map((record) =>
            requestToPromise<Media[]>(
              storesByName[stores.media].index('mealRecordId').getAll(record.id)
            )
          )
        )
      ).flat();

      await Promise.all([
        requestToPromise(storesByName[stores.meals].delete(id)),
        ...mealRecords.map((record) =>
          requestToPromise(storesByName[stores.mealRecords].delete(record.id))
        ),
        ...mealTags.map((row) =>
          requestToPromise(storesByName[stores.mealTags].delete([row.mealId, row.tagId]))
        ),
        ...mediaRows.map((media) => requestToPromise(storesByName[stores.media].delete(media.id))),
      ]);

      return true;
    }
  );
}

export async function createMealRecordAsync(input: CreateMealRecordInput) {
  const now = new Date().toISOString();
  const mealRecord: MealRecordRow = {
    id: input.id,
    mealId: input.mealId,
    cookedAt: input.cookedAt,
    rating: input.rating,
    memo: input.memo,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? input.createdAt ?? now,
  };

  await withStoreAsync(stores.mealRecords, 'readwrite', (store) =>
    requestToPromise(store.put(mealRecord))
  );
  return getMealRecordByIdAsync(input.id);
}

export async function getMealRecordByIdAsync(id: string) {
  return withStoreAsync(stores.mealRecords, 'readonly', async (store) => {
    const mealRecord = await requestToPromise<MealRecordRow | undefined>(store.get(id));
    return mealRecord ? hydrateMealRecordAsync(mealRecord) : null;
  });
}

export async function listMealRecordsAsync() {
  return withStoreAsync(stores.mealRecords, 'readonly', async (store) => {
    const records = await requestToPromise<MealRecordRow[]>(store.getAll());
    const hydratedRecords = await Promise.all(records.map(hydrateMealRecordAsync));

    return sortMealRecordsByNewest(hydratedRecords);
  });
}

export async function listRecentMealRecordsAsync(limit = 10) {
  const records = await listMealRecordsAsync();
  return records.slice(0, limit);
}

export async function listMealRecordsByDateAsync(cookedAt: string) {
  return withStoreAsync(stores.mealRecords, 'readonly', async (store) => {
    const records = await requestToPromise<MealRecordRow[]>(
      store.index('cookedAt').getAll(cookedAt)
    );
    const hydratedRecords = await Promise.all(records.map(hydrateMealRecordAsync));

    return sortMealRecordsByNewest(hydratedRecords);
  });
}

export async function listMealRecordsByMealIdAsync(mealId: string) {
  return withStoreAsync(stores.mealRecords, 'readonly', async (store) => {
    const records = await requestToPromise<MealRecordRow[]>(
      store.index('mealId').getAll(mealId)
    );
    const hydratedRecords = await Promise.all(records.map(hydrateMealRecordAsync));

    return sortMealRecordsByNewest(hydratedRecords);
  });
}

export async function updateMealRecordAsync(id: string, input: UpdateMealRecordInput) {
  const existingRecord = await withStoreAsync(stores.mealRecords, 'readonly', (store) =>
    requestToPromise<MealRecordRow | undefined>(store.get(id))
  );

  if (!existingRecord) {
    return null;
  }

  const mealRecord: MealRecordRow = {
    ...existingRecord,
    mealId: input.mealId ?? existingRecord.mealId,
    cookedAt: input.cookedAt ?? existingRecord.cookedAt,
    rating: input.rating ?? existingRecord.rating,
    memo: input.memo ?? existingRecord.memo,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };

  await withStoreAsync(stores.mealRecords, 'readwrite', (store) =>
    requestToPromise(store.put(mealRecord))
  );
  return getMealRecordByIdAsync(id);
}

export async function deleteMealRecordAsync(id: string) {
  return withStoresAsync([stores.mealRecords, stores.media], 'readwrite', async (storesByName) => {
    const mealRecord = await requestToPromise<MealRecordRow | undefined>(
      storesByName[stores.mealRecords].get(id)
    );

    if (!mealRecord) {
      return false;
    }

    const mediaRows = await requestToPromise<{ id: string }[]>(
      storesByName[stores.media].index('mealRecordId').getAll(id)
    );

    await Promise.all([
      requestToPromise(storesByName[stores.mealRecords].delete(id)),
      ...mediaRows.map((media) => requestToPromise(storesByName[stores.media].delete(media.id))),
    ]);

    return true;
  });
}

function sortMealRecordsByNewest(records: MealRecord[]) {
  return records.sort((left, right) => {
    const cookedAtOrder = right.cookedAt.localeCompare(left.cookedAt);

    if (cookedAtOrder !== 0) {
      return cookedAtOrder;
    }

    return right.createdAt.localeCompare(left.createdAt);
  });
}
