import { getSupabaseClient } from '../lib/supabase';
import type {
  CreateMealInput,
  CreateMealRecordInput,
  CreateMediaInput,
  CreateRecipeScrapInput,
  CreateTagInput,
  Meal,
  MealRecord,
  Media,
  RecipeScrap,
  Tag,
  UpdateMealInput,
  UpdateMealRecordInput,
} from '../types/meal';

const mediaBucket = 'meal-media';

async function getCloudContext() {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase 연결 설정을 찾을 수 없습니다.');
  }
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Error('로그인이 필요합니다.');
  }

  return { supabase, userId: data.user.id };
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function sortRecords(records: MealRecord[]) {
  return records.sort((left, right) => {
    const cookedAtOrder = right.cookedAt.localeCompare(left.cookedAt);
    return cookedAtOrder || right.createdAt.localeCompare(left.createdAt);
  });
}

async function createPrivateMediaUrl(storagePath: string) {
  const { supabase } = await getCloudContext();
  const { data, error } = await supabase.storage.from(mediaBucket).createSignedUrl(storagePath, 60 * 60);
  if (error) return undefined;
  return data.signedUrl;
}

async function loadMealsAndRecordsAsync() {
  const { supabase, userId } = await getCloudContext();
  const [mealsResult, recordsResult, tagsResult, mealTagsResult, mediaResult] = await Promise.all([
    supabase.from('meals').select('*').order('name'),
    supabase.from('meal_records').select('*').order('cooked_at', { ascending: false }),
    supabase.from('tags').select('*'),
    supabase.from('meal_tags').select('*'),
    supabase.from('media').select('*'),
  ]);

  [mealsResult, recordsResult, tagsResult, mealTagsResult, mediaResult].forEach((result) =>
    throwIfError(result.error)
  );

  const tagsById = new Map((tagsResult.data ?? []).map((tag) => [tag.id, tag]));
  const tagNamesByMealId = new Map<string, string[]>();
  (mealTagsResult.data ?? []).forEach((mealTag) => {
    const tag = tagsById.get(mealTag.tag_id);
    if (!tag) return;
    tagNamesByMealId.set(mealTag.meal_id, [...(tagNamesByMealId.get(mealTag.meal_id) ?? []), tag.name]);
  });
  const mealsById = new Map<string, Meal>();
  (mealsResult.data ?? []).forEach((meal) => {
    mealsById.set(meal.id, {
      id: meal.id,
      name: meal.name,
      recipeUrl: meal.recipe_url ?? undefined,
      memo: meal.memo ?? undefined,
      tags: tagNamesByMealId.get(meal.id) ?? [],
      createdAt: meal.created_at,
      updatedAt: meal.updated_at,
    });
  });

  const mediaByRecordId = new Map<string, Media[]>();
  await Promise.all(
    (mediaResult.data ?? []).map(async (media) => {
      const uri = await createPrivateMediaUrl(media.storage_path);
      const item: Media = {
        id: media.id,
        mealRecordId: media.meal_record_id,
        type: 'photo',
        uri,
        recipeStepId: media.recipe_step_id ?? undefined,
        createdAt: media.created_at,
      };
      mediaByRecordId.set(media.meal_record_id, [...(mediaByRecordId.get(media.meal_record_id) ?? []), item]);
    })
  );

  const records = (recordsResult.data ?? []).map((record) => {
    const media = mediaByRecordId.get(record.id) ?? [];
    const finishedMediaId = (mediaResult.data ?? []).find(
      (item) => item.meal_record_id === record.id && item.kind === 'finished'
    )?.id;
    return {
      id: record.id,
      mealId: record.meal_id,
      meal: mealsById.get(record.meal_id),
      cookedAt: record.cooked_at,
      rating: record.rating ?? undefined,
      memo: record.memo ?? undefined,
      ingredientGroups: Array.isArray(record.ingredient_groups) ? record.ingredient_groups : undefined,
      recipeSteps: Array.isArray(record.recipe_steps) ? record.recipe_steps : undefined,
      finishedMediaId,
      mediaIds: media.map((item) => item.id),
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    } satisfies MealRecord;
  });

  return { meals: [...mealsById.values()], records: sortRecords(records), mediaByRecordId, userId };
}

export async function createMealAsync(input: CreateMealInput) {
  const { supabase, userId } = await getCloudContext();
  const { error } = await supabase.from('meals').insert({
    id: input.id,
    user_id: userId,
    name: input.name.trim(),
    recipe_url: input.recipeUrl?.trim() || null,
    memo: input.memo?.trim() || null,
    created_at: input.createdAt,
    updated_at: input.updatedAt ?? input.createdAt,
  });
  throwIfError(error);
  return getMealByIdAsync(input.id);
}

export async function getMealByIdAsync(id: string) {
  const { meals } = await loadMealsAndRecordsAsync();
  return meals.find((meal) => meal.id === id) ?? null;
}

export async function listMealsAsync() {
  const { meals } = await loadMealsAndRecordsAsync();
  return meals.sort((left, right) => left.name.localeCompare(right.name, 'ko-KR'));
}

export async function updateMealAsync(id: string, input: UpdateMealInput) {
  const { supabase } = await getCloudContext();
  const updates = {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...('recipeUrl' in input ? { recipe_url: input.recipeUrl?.trim() || null } : {}),
    ...('memo' in input ? { memo: input.memo?.trim() || null } : {}),
    updated_at: input.updatedAt ?? new Date().toISOString(),
  };
  const { error } = await supabase.from('meals').update(updates).eq('id', id);
  throwIfError(error);
  return getMealByIdAsync(id);
}

export async function deleteMealAsync(id: string) {
  const { supabase } = await getCloudContext();
  const { error, count } = await supabase.from('meals').delete({ count: 'exact' }).eq('id', id);
  throwIfError(error);
  return Boolean(count);
}

export async function createMealRecordAsync(input: CreateMealRecordInput) {
  const { supabase, userId } = await getCloudContext();
  const { error } = await supabase.from('meal_records').insert({
    id: input.id,
    user_id: userId,
    meal_id: input.mealId,
    cooked_at: input.cookedAt,
    rating: input.rating ?? null,
    memo: input.memo?.trim() || null,
    ingredient_groups: input.ingredientGroups ?? [],
    recipe_steps: input.recipeSteps ?? [],
    created_at: input.createdAt,
    updated_at: input.updatedAt ?? input.createdAt,
  });
  throwIfError(error);
  return getMealRecordByIdAsync(input.id);
}

export async function getMealRecordByIdAsync(id: string) {
  const { records } = await loadMealsAndRecordsAsync();
  return records.find((record) => record.id === id) ?? null;
}

export async function listMealRecordsAsync() {
  const { records } = await loadMealsAndRecordsAsync();
  return records;
}

export async function listRecentMealRecordsAsync(limit = 10) {
  return (await listMealRecordsAsync()).slice(0, limit);
}

export async function listMealRecordsByDateAsync(cookedAt: string) {
  return (await listMealRecordsAsync()).filter((record) => record.cookedAt === cookedAt);
}

export async function listMealRecordsByMealIdAsync(mealId: string) {
  return (await listMealRecordsAsync()).filter((record) => record.mealId === mealId);
}

export async function updateMealRecordAsync(id: string, input: UpdateMealRecordInput) {
  const { supabase } = await getCloudContext();
  const updates = {
    ...(input.mealId !== undefined ? { meal_id: input.mealId } : {}),
    ...(input.cookedAt !== undefined ? { cooked_at: input.cookedAt } : {}),
    ...('rating' in input ? { rating: input.rating ?? null } : {}),
    ...('memo' in input ? { memo: input.memo?.trim() || null } : {}),
    ...('ingredientGroups' in input ? { ingredient_groups: input.ingredientGroups ?? [] } : {}),
    ...('recipeSteps' in input ? { recipe_steps: input.recipeSteps ?? [] } : {}),
    updated_at: input.updatedAt ?? new Date().toISOString(),
  };
  const { error } = await supabase.from('meal_records').update(updates).eq('id', id);
  throwIfError(error);
  return getMealRecordByIdAsync(id);
}

export async function deleteMealRecordAsync(id: string) {
  const media = await listMediaByMealRecordIdAsync(id);
  await Promise.all(media.map((item) => deleteMediaAsync(item.id)));
  const { supabase } = await getCloudContext();
  const { error, count } = await supabase.from('meal_records').delete({ count: 'exact' }).eq('id', id);
  throwIfError(error);
  return Boolean(count);
}

export async function createMediaAsync(input: CreateMediaInput) {
  if (!input.blob) throw new Error('사진 파일을 찾을 수 없습니다.');
  const { supabase, userId } = await getCloudContext();
  const extension = input.blob.type.split('/')[1] || 'jpg';
  const storagePath = `${userId}/${input.mealRecordId}/${input.id}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(mediaBucket).upload(storagePath, input.blob, {
    contentType: input.blob.type || 'image/jpeg',
    upsert: false,
  });
  throwIfError(uploadError);
  const { error } = await supabase.from('media').insert({
    id: input.id,
    user_id: userId,
    meal_record_id: input.mealRecordId,
    storage_path: storagePath,
    mime_type: input.blob.type || 'image/jpeg',
    byte_size: input.blob.size,
    kind: input.recipeStepId ? 'step' : 'finished',
    recipe_step_id: input.recipeStepId ?? null,
    created_at: input.createdAt,
  });
  if (error) {
    await supabase.storage.from(mediaBucket).remove([storagePath]);
    throwIfError(error);
  }
  return {
    id: input.id,
    mealRecordId: input.mealRecordId,
    type: 'photo',
    uri: await createPrivateMediaUrl(storagePath),
    recipeStepId: input.recipeStepId,
    createdAt: input.createdAt ?? new Date().toISOString(),
  } satisfies Media;
}

export async function getMediaByIdAsync(id: string) {
  const { supabase } = await getCloudContext();
  const { data, error } = await supabase.from('media').select('*').eq('id', id).maybeSingle();
  throwIfError(error);
  if (!data) return null;
  return {
    id: data.id,
    mealRecordId: data.meal_record_id,
    type: 'photo',
    uri: await createPrivateMediaUrl(data.storage_path),
    recipeStepId: data.recipe_step_id ?? undefined,
    createdAt: data.created_at,
  } satisfies Media;
}

export async function listMediaByMealRecordIdAsync(mealRecordId: string) {
  const { mediaByRecordId } = await loadMealsAndRecordsAsync();
  return (mediaByRecordId.get(mealRecordId) ?? []).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function deleteMediaAsync(id: string) {
  const { supabase } = await getCloudContext();
  const { data, error } = await supabase.from('media').select('storage_path').eq('id', id).maybeSingle();
  throwIfError(error);
  if (!data) return false;
  const { error: storageError } = await supabase.storage.from(mediaBucket).remove([data.storage_path]);
  throwIfError(storageError);
  const { error: deleteError } = await supabase.from('media').delete().eq('id', id);
  throwIfError(deleteError);
  return true;
}

export async function deleteMediaByMealRecordIdAsync(mealRecordId: string) {
  const media = await listMediaByMealRecordIdAsync(mealRecordId);
  await Promise.all(media.map((item) => deleteMediaAsync(item.id)));
  return media.length;
}

export async function createTagAsync(input: CreateTagInput) {
  const { supabase, userId } = await getCloudContext();
  const { error } = await supabase.from('tags').insert({ id: input.id, user_id: userId, name: input.name.trim(), created_at: input.createdAt });
  throwIfError(error);
  return getTagByIdAsync(input.id);
}

export async function getTagByIdAsync(id: string) {
  const { supabase } = await getCloudContext();
  const { data, error } = await supabase.from('tags').select('*').eq('id', id).maybeSingle();
  throwIfError(error);
  return data ? { id: data.id, name: data.name, createdAt: data.created_at } satisfies Tag : null;
}

export async function getTagByNameAsync(name: string) {
  const { supabase } = await getCloudContext();
  const { data, error } = await supabase.from('tags').select('*').eq('name', name.trim()).maybeSingle();
  throwIfError(error);
  return data ? { id: data.id, name: data.name, createdAt: data.created_at } satisfies Tag : null;
}

export async function replaceMealTagsAsync(mealId: string, tagIds: string[]) {
  const { supabase, userId } = await getCloudContext();
  const { error: deleteError } = await supabase.from('meal_tags').delete().eq('meal_id', mealId);
  throwIfError(deleteError);
  if (!tagIds.length) return;
  const { error } = await supabase.from('meal_tags').insert(tagIds.map((tagId) => ({ user_id: userId, meal_id: mealId, tag_id: tagId })));
  throwIfError(error);
}

export async function createRecipeScrapAsync(input: CreateRecipeScrapInput) {
  const { supabase, userId } = await getCloudContext();
  const { error } = await supabase.from('recipe_scraps').insert({
    id: input.id, user_id: userId, url: input.url.trim(), title: input.title?.trim() || null, memo: input.memo?.trim() || null,
    created_at: input.createdAt, updated_at: input.updatedAt ?? input.createdAt,
  });
  throwIfError(error);
  return { id: input.id, url: input.url.trim(), title: input.title?.trim() || undefined, memo: input.memo?.trim() || undefined, createdAt: input.createdAt ?? new Date().toISOString(), updatedAt: input.updatedAt ?? input.createdAt ?? new Date().toISOString() } satisfies RecipeScrap;
}

export async function listRecipeScrapsAsync() {
  const { supabase } = await getCloudContext();
  const { data, error } = await supabase.from('recipe_scraps').select('*').order('updated_at', { ascending: false });
  throwIfError(error);
  return (data ?? []).map((item) => ({ id: item.id, url: item.url, title: item.title ?? undefined, memo: item.memo ?? undefined, createdAt: item.created_at, updatedAt: item.updated_at } satisfies RecipeScrap));
}

export async function deleteRecipeScrapAsync(id: string) {
  const { supabase } = await getCloudContext();
  const { error, count } = await supabase.from('recipe_scraps').delete({ count: 'exact' }).eq('id', id);
  throwIfError(error);
  return Boolean(count);
}
