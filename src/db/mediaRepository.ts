import { requestToPromise, withStoreAsync } from './database';
import { stores } from './schema';
import type { CreateMediaInput, Media } from '../types/meal';

export async function createMediaAsync(input: CreateMediaInput) {
  const media: Media = {
    id: input.id,
    mealRecordId: input.mealRecordId,
    type: input.type,
    uri: input.uri,
    blob: input.blob,
    thumbnailUri: input.thumbnailUri,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  await withStoreAsync(stores.media, 'readwrite', (store) => requestToPromise(store.put(media)));
  return getMediaByIdAsync(input.id);
}

export async function getMediaByIdAsync(id: string) {
  return withStoreAsync(stores.media, 'readonly', async (store) => {
    const media = await requestToPromise<Media | undefined>(store.get(id));
    return media ?? null;
  });
}

export async function listMediaByMealRecordIdAsync(mealRecordId: string) {
  return withStoreAsync(stores.media, 'readonly', async (store) => {
    const mediaRows = await requestToPromise<Media[]>(
      store.index('mealRecordId').getAll(mealRecordId)
    );

    return mediaRows.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  });
}

export function createMediaObjectUrl(media: Media) {
  if (media.blob) {
    return URL.createObjectURL(media.blob);
  }

  return media.uri ?? null;
}

export function revokeMediaObjectUrl(url: string | null) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

export async function deleteMediaAsync(id: string) {
  return withStoreAsync(stores.media, 'readwrite', async (store) => {
    const media = await requestToPromise<Media | undefined>(store.get(id));

    if (!media) {
      return false;
    }

    await requestToPromise(store.delete(id));
    return true;
  });
}

export async function deleteMediaByMealRecordIdAsync(mealRecordId: string) {
  return withStoreAsync(stores.media, 'readwrite', async (store) => {
    const mediaRows = await requestToPromise<Media[]>(
      store.index('mealRecordId').getAll(mealRecordId)
    );

    await Promise.all(mediaRows.map((media) => requestToPromise(store.delete(media.id))));
    return mediaRows.length;
  });
}
