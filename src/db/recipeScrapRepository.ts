import { requestToPromise, withStoreAsync } from './database';
import { stores } from './schema';
import type { CreateRecipeScrapInput, RecipeScrap } from '../types/meal';

export async function createRecipeScrapAsync(input: CreateRecipeScrapInput) {
  const now = new Date().toISOString();
  const recipeScrap: RecipeScrap = {
    id: input.id,
    url: input.url.trim(),
    title: input.title?.trim() || undefined,
    memo: input.memo?.trim() || undefined,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? input.createdAt ?? now,
  };

  await withStoreAsync(stores.recipeScraps, 'readwrite', (store) =>
    requestToPromise(store.put(recipeScrap))
  );

  return recipeScrap;
}

export async function listRecipeScrapsAsync() {
  return withStoreAsync(stores.recipeScraps, 'readonly', async (store) => {
    const recipeScraps = await requestToPromise<RecipeScrap[]>(store.getAll());

    return recipeScraps.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  });
}

export async function deleteRecipeScrapAsync(id: string) {
  return withStoreAsync(stores.recipeScraps, 'readwrite', async (store) => {
    const existing = await requestToPromise<RecipeScrap | undefined>(store.get(id));

    if (!existing) return false;

    await requestToPromise(store.delete(id));
    return true;
  });
}
