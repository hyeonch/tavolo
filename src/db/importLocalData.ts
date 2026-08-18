import * as cloud from './cloudRepository';
import { listMealRecordsAsync as listLocalRecordsAsync } from './mealRepository';
import { listMediaByMealRecordIdAsync } from './mediaRepository';
import { listRecipeScrapsAsync as listLocalScrapsAsync } from './recipeScrapRepository';

function newId() {
  return crypto.randomUUID();
}

export async function importLocalDataAsync(userId: string) {
  const importKey = `tavolo-local-imported:${userId}`;
  if (localStorage.getItem(importKey)) {
    return { records: 0, scraps: 0, alreadyImported: true };
  }

  const [localRecords, localScraps] = await Promise.all([listLocalRecordsAsync(), listLocalScrapsAsync()]);
  const meals = new Map<string, string>();
  let importedRecords = 0;

  for (const localRecord of localRecords) {
    if (!localRecord.meal) continue;
    let mealId = meals.get(localRecord.mealId);
    if (!mealId) {
      mealId = newId();
      await cloud.createMealAsync({
        id: mealId,
        name: localRecord.meal.name,
        recipeUrl: localRecord.meal.recipeUrl,
        memo: localRecord.meal.memo,
        createdAt: localRecord.meal.createdAt,
        updatedAt: localRecord.meal.updatedAt,
      });
      const tagIds = await Promise.all(
        localRecord.meal.tags.map(async (name) => {
          const existing = await cloud.getTagByNameAsync(name);
          if (existing) return existing.id;
          const tagId = newId();
          await cloud.createTagAsync({ id: tagId, name });
          return tagId;
        })
      );
      await cloud.replaceMealTagsAsync(mealId, tagIds);
      meals.set(localRecord.mealId, mealId);
    }

    const recordId = newId();
    await cloud.createMealRecordAsync({
      id: recordId,
      mealId,
      cookedAt: localRecord.cookedAt,
      rating: localRecord.rating,
      memo: localRecord.memo,
      ingredientGroups: localRecord.ingredientGroups,
      recipeSteps: localRecord.recipeSteps?.map((step) => ({ ...step, mediaIds: [] })),
      createdAt: localRecord.createdAt,
      updatedAt: localRecord.updatedAt,
    });

    const localMedia = await listMediaByMealRecordIdAsync(localRecord.id);
    const mediaIdsByStep = new Map<string, string[]>();
    for (const item of localMedia) {
      if (!item.blob) continue;
      const mediaId = newId();
      await cloud.createMediaAsync({
        id: mediaId,
        mealRecordId: recordId,
        type: 'photo',
        blob: item.blob,
        recipeStepId: item.recipeStepId,
        createdAt: item.createdAt,
      });
      if (item.recipeStepId) {
        mediaIdsByStep.set(item.recipeStepId, [...(mediaIdsByStep.get(item.recipeStepId) ?? []), mediaId]);
      }
    }
    if (localRecord.recipeSteps?.length) {
      await cloud.updateMealRecordAsync(recordId, {
        recipeSteps: localRecord.recipeSteps.map((step) => ({
          ...step,
          mediaIds: mediaIdsByStep.get(step.id) ?? [],
        })),
      });
    }
    importedRecords += 1;
  }

  for (const scrap of localScraps) {
    await cloud.createRecipeScrapAsync({ id: newId(), url: scrap.url, title: scrap.title, memo: scrap.memo, createdAt: scrap.createdAt, updatedAt: scrap.updatedAt });
  }
  localStorage.setItem(importKey, 'true');
  return { records: importedRecords, scraps: localScraps.length, alreadyImported: false };
}
