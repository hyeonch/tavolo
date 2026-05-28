import { getDatabaseAsync, initializeDatabaseAsync } from './database';
import type {
  CreateMealInput,
  CreateMealRecordInput,
  Meal,
  MealRecord,
  UpdateMealInput,
  UpdateMealRecordInput,
} from '../types/meal';

type MealRow = {
  id: string;
  name: string;
  recipe_url: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

type MealRecordRow = {
  id: string;
  meal_id: string;
  cooked_at: string;
  rating: number | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

function mapMeal(row: MealRow, tags: string[] = []): Meal {
  return {
    id: row.id,
    name: row.name,
    recipeUrl: row.recipe_url ?? undefined,
    memo: row.memo ?? undefined,
    tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMealRecord(
  row: MealRecordRow,
  meal: Meal | undefined,
  mediaIds: string[] = []
): MealRecord {
  return {
    id: row.id,
    mealId: row.meal_id,
    meal,
    cookedAt: row.cooked_at,
    rating: row.rating ?? undefined,
    memo: row.memo ?? undefined,
    mediaIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getTagsForMealAsync(mealId: string) {
  const db = await getDatabaseAsync();
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT tags.name
     FROM tags
     INNER JOIN meal_tags ON meal_tags.tag_id = tags.id
     WHERE meal_tags.meal_id = ?
     ORDER BY tags.name ASC`,
    mealId
  );

  return rows.map((row) => row.name);
}

async function getMediaIdsForMealRecordAsync(mealRecordId: string) {
  const db = await getDatabaseAsync();
  const rows = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM media WHERE meal_record_id = ? ORDER BY created_at ASC',
    mealRecordId
  );

  return rows.map((row) => row.id);
}

async function hydrateMealAsync(row: MealRow) {
  return mapMeal(row, await getTagsForMealAsync(row.id));
}

async function hydrateMealRecordAsync(row: MealRecordRow) {
  const [meal, mediaIds] = await Promise.all([
    getMealByIdAsync(row.meal_id),
    getMediaIdsForMealRecordAsync(row.id),
  ]);

  return mapMealRecord(row, meal ?? undefined, mediaIds);
}

export async function createMealAsync(input: CreateMealInput) {
  const db = await initializeDatabaseAsync();
  const now = new Date().toISOString();
  const createdAt = input.createdAt ?? now;
  const updatedAt = input.updatedAt ?? createdAt;

  await db.runAsync(
    `INSERT INTO meals (
      id,
      name,
      recipe_url,
      memo,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    input.id,
    input.name,
    input.recipeUrl ?? null,
    input.memo ?? null,
    createdAt,
    updatedAt
  );

  return getMealByIdAsync(input.id);
}

export async function getMealByIdAsync(id: string) {
  const db = await initializeDatabaseAsync();
  const row = await db.getFirstAsync<MealRow>('SELECT * FROM meals WHERE id = ?', id);

  if (!row) {
    return null;
  }

  return hydrateMealAsync(row);
}

export async function listMealsAsync() {
  const db = await initializeDatabaseAsync();
  const rows = await db.getAllAsync<MealRow>('SELECT * FROM meals ORDER BY name ASC');
  return Promise.all(rows.map(hydrateMealAsync));
}

export async function updateMealAsync(id: string, input: UpdateMealInput) {
  const db = await initializeDatabaseAsync();
  const current = await getMealByIdAsync(id);

  if (!current) {
    return null;
  }

  await db.runAsync(
    `UPDATE meals
     SET name = ?,
         recipe_url = ?,
         memo = ?,
         updated_at = ?
     WHERE id = ?`,
    input.name ?? current.name,
    input.recipeUrl ?? current.recipeUrl ?? null,
    input.memo ?? current.memo ?? null,
    input.updatedAt ?? new Date().toISOString(),
    id
  );

  return getMealByIdAsync(id);
}

export async function deleteMealAsync(id: string) {
  const db = await initializeDatabaseAsync();
  const result = await db.runAsync('DELETE FROM meals WHERE id = ?', id);
  return result.changes > 0;
}

export async function createMealRecordAsync(input: CreateMealRecordInput) {
  const db = await initializeDatabaseAsync();
  const now = new Date().toISOString();
  const createdAt = input.createdAt ?? now;
  const updatedAt = input.updatedAt ?? createdAt;

  await db.runAsync(
    `INSERT INTO meal_records (
      id,
      meal_id,
      cooked_at,
      rating,
      memo,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    input.id,
    input.mealId,
    input.cookedAt,
    input.rating ?? null,
    input.memo ?? null,
    createdAt,
    updatedAt
  );

  return getMealRecordByIdAsync(input.id);
}

export async function getMealRecordByIdAsync(id: string) {
  const db = await initializeDatabaseAsync();
  const row = await db.getFirstAsync<MealRecordRow>('SELECT * FROM meal_records WHERE id = ?', id);

  if (!row) {
    return null;
  }

  return hydrateMealRecordAsync(row);
}

export async function listMealRecordsAsync() {
  const db = await initializeDatabaseAsync();
  const rows = await db.getAllAsync<MealRecordRow>(
    'SELECT * FROM meal_records ORDER BY cooked_at DESC, created_at DESC'
  );

  return Promise.all(rows.map(hydrateMealRecordAsync));
}

export async function listRecentMealRecordsAsync(limit = 10) {
  const db = await initializeDatabaseAsync();
  const rows = await db.getAllAsync<MealRecordRow>(
    'SELECT * FROM meal_records ORDER BY cooked_at DESC, created_at DESC LIMIT ?',
    limit
  );

  return Promise.all(rows.map(hydrateMealRecordAsync));
}

export async function listMealRecordsByDateAsync(cookedAt: string) {
  const db = await initializeDatabaseAsync();
  const rows = await db.getAllAsync<MealRecordRow>(
    'SELECT * FROM meal_records WHERE cooked_at = ? ORDER BY created_at DESC',
    cookedAt
  );

  return Promise.all(rows.map(hydrateMealRecordAsync));
}

export async function listMealRecordsByMealIdAsync(mealId: string) {
  const db = await initializeDatabaseAsync();
  const rows = await db.getAllAsync<MealRecordRow>(
    'SELECT * FROM meal_records WHERE meal_id = ? ORDER BY cooked_at DESC, created_at DESC',
    mealId
  );

  return Promise.all(rows.map(hydrateMealRecordAsync));
}

export async function updateMealRecordAsync(id: string, input: UpdateMealRecordInput) {
  const db = await initializeDatabaseAsync();
  const current = await getMealRecordByIdAsync(id);

  if (!current) {
    return null;
  }

  await db.runAsync(
    `UPDATE meal_records
     SET meal_id = ?,
         cooked_at = ?,
         rating = ?,
         memo = ?,
         updated_at = ?
     WHERE id = ?`,
    input.mealId ?? current.mealId,
    input.cookedAt ?? current.cookedAt,
    input.rating ?? current.rating ?? null,
    input.memo ?? current.memo ?? null,
    input.updatedAt ?? new Date().toISOString(),
    id
  );

  return getMealRecordByIdAsync(id);
}

export async function deleteMealRecordAsync(id: string) {
  const db = await initializeDatabaseAsync();
  const result = await db.runAsync('DELETE FROM meal_records WHERE id = ?', id);
  return result.changes > 0;
}
