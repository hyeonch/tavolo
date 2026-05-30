import { clearDatabaseAsync } from './database';
import { createMealAsync, createMealRecordAsync, listMealRecordsAsync } from './mealRepository';
import { createMediaAsync } from './mediaRepository';
import { attachTagToMealAsync, createTagAsync } from './tagRepository';

const sampleMeals = [
  {
    mealName: '김치볶음밥',
    memo: '계란 프라이를 올리면 더 좋다.',
    cookedAt: '2026-05-30',
    rating: 5,
    tags: ['한식', '간단요리'],
  },
  {
    mealName: '버섯 파스타',
    memo: '마늘을 넉넉히 넣었다.',
    cookedAt: '2026-05-29',
    rating: 4,
    tags: ['파스타'],
  },
] as const;

function createDebugId(prefix: string, index: number) {
  return `${prefix}-debug-${index + 1}`;
}

export async function seedDebugDataAsync({ reset = false } = {}) {
  if (reset) {
    await clearDatabaseAsync();
  }

  const existingRecords = await listMealRecordsAsync();

  if (existingRecords.length > 0) {
    return existingRecords;
  }

  for (const [index, sampleMeal] of sampleMeals.entries()) {
    const mealId = createDebugId('meal', index);
    const mealRecordId = createDebugId('meal-record', index);

    await createMealAsync({
      id: mealId,
      name: sampleMeal.mealName,
      memo: sampleMeal.memo,
      createdAt: new Date().toISOString(),
    });

    await createMealRecordAsync({
      id: mealRecordId,
      mealId,
      cookedAt: sampleMeal.cookedAt,
      rating: sampleMeal.rating,
      memo: sampleMeal.memo,
    });

    await createMediaAsync({
      id: createDebugId('media', index),
      mealRecordId,
      type: 'photo',
      uri: undefined,
    });

    for (const [tagIndex, tagName] of sampleMeal.tags.entries()) {
      const tagId = `${createDebugId('tag', index)}-${tagIndex + 1}`;

      await createTagAsync({
        id: tagId,
        name: tagName,
      });
      await attachTagToMealAsync(mealId, tagId);
    }
  }

  return listMealRecordsAsync();
}
