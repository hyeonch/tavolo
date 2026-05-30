import { requestToPromise, withStoreAsync, withStoresAsync } from './database';
import { stores } from './schema';
import type { CreateTagInput, Tag } from '../types/meal';

type MealTagRow = {
  mealId: string;
  tagId: string;
  createdAt: string;
};

function normalizeTagName(name: string) {
  return name.trim();
}

export async function createTagAsync(input: CreateTagInput) {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const tag: Tag = {
    id: input.id,
    name: normalizeTagName(input.name),
    createdAt,
  };

  await withStoreAsync(stores.tags, 'readwrite', (store) => requestToPromise(store.put(tag)));
  return getTagByIdAsync(tag.id);
}

export async function getTagByIdAsync(id: string) {
  return withStoreAsync(stores.tags, 'readonly', async (store) => {
    const tag = await requestToPromise<Tag | undefined>(store.get(id));
    return tag ?? null;
  });
}

export async function getTagByNameAsync(name: string) {
  const normalizedName = normalizeTagName(name);

  return withStoreAsync(stores.tags, 'readonly', async (store) => {
    const index = store.index('name');
    const tag = await requestToPromise<Tag | undefined>(index.get(normalizedName));
    return tag ?? null;
  });
}

export async function listTagsAsync() {
  return withStoreAsync(stores.tags, 'readonly', async (store) => {
    const tags = await requestToPromise<Tag[]>(store.getAll());
    return tags.sort((left, right) => left.name.localeCompare(right.name, 'ko-KR'));
  });
}

export async function listTagsByMealIdAsync(mealId: string) {
  return withStoresAsync(
    [stores.tags, stores.mealTags],
    'readonly',
    async (storesByName) => {
      const mealTagRows = await requestToPromise<MealTagRow[]>(
        storesByName[stores.mealTags].index('mealId').getAll(mealId)
      );

      const tags = await Promise.all(
        mealTagRows.map((mealTag) =>
          requestToPromise<Tag | undefined>(storesByName[stores.tags].get(mealTag.tagId))
        )
      );

      return tags
        .filter((tag): tag is Tag => Boolean(tag))
        .sort((left, right) => left.name.localeCompare(right.name, 'ko-KR'));
    }
  );
}

export async function attachTagToMealAsync(mealId: string, tagId: string) {
  await withStoreAsync(stores.mealTags, 'readwrite', (store) =>
    requestToPromise(
      store.put({
        mealId,
        tagId,
        createdAt: new Date().toISOString(),
      } satisfies MealTagRow)
    )
  );
}

export async function replaceMealTagsAsync(mealId: string, tagIds: string[]) {
  await withStoreAsync(stores.mealTags, 'readwrite', async (store) => {
    const existingRows = await requestToPromise<MealTagRow[]>(store.index('mealId').getAll(mealId));

    await Promise.all(existingRows.map((row) => requestToPromise(store.delete([row.mealId, row.tagId]))));
    await Promise.all(
      tagIds.map((tagId) =>
        requestToPromise(
          store.put({
            mealId,
            tagId,
            createdAt: new Date().toISOString(),
          } satisfies MealTagRow)
        )
      )
    );
  });
}

export async function deleteTagAsync(id: string) {
  return withStoresAsync([stores.tags, stores.mealTags], 'readwrite', async (storesByName) => {
    const tag = await requestToPromise<Tag | undefined>(storesByName[stores.tags].get(id));

    if (!tag) {
      return false;
    }

    const mealTagRows = await requestToPromise<MealTagRow[]>(
      storesByName[stores.mealTags].index('tagId').getAll(id)
    );

    await Promise.all([
      requestToPromise(storesByName[stores.tags].delete(id)),
      ...mealTagRows.map((row) =>
        requestToPromise(storesByName[stores.mealTags].delete([row.mealId, row.tagId]))
      ),
    ]);

    return true;
  });
}
