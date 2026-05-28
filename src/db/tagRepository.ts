import { getDatabaseAsync, initializeDatabaseAsync } from './database';
import type { CreateTagInput, Tag } from '../types/meal';

type TagRow = {
  id: string;
  name: string;
  created_at: string;
};

function mapTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}

export async function createTagAsync(input: CreateTagInput) {
  const db = await initializeDatabaseAsync();
  const createdAt = input.createdAt ?? new Date().toISOString();

  await db.runAsync(
    'INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)',
    input.id,
    input.name.trim(),
    createdAt
  );

  return getTagByIdAsync(input.id);
}

export async function getTagByIdAsync(id: string) {
  const db = await getDatabaseAsync();
  const row = await db.getFirstAsync<TagRow>('SELECT * FROM tags WHERE id = ?', id);
  return row ? mapTag(row) : null;
}

export async function getTagByNameAsync(name: string) {
  const db = await initializeDatabaseAsync();
  const row = await db.getFirstAsync<TagRow>(
    'SELECT * FROM tags WHERE name = ? COLLATE NOCASE',
    name.trim()
  );
  return row ? mapTag(row) : null;
}

export async function listTagsAsync() {
  const db = await initializeDatabaseAsync();
  const rows = await db.getAllAsync<TagRow>('SELECT * FROM tags ORDER BY name ASC');
  return rows.map(mapTag);
}

export async function listTagsByMealIdAsync(mealId: string) {
  const db = await initializeDatabaseAsync();
  const rows = await db.getAllAsync<TagRow>(
    `SELECT tags.*
     FROM tags
     INNER JOIN meal_tags ON meal_tags.tag_id = tags.id
     WHERE meal_tags.meal_id = ?
     ORDER BY tags.name ASC`,
    mealId
  );

  return rows.map(mapTag);
}

export async function attachTagToMealAsync(mealId: string, tagId: string) {
  const db = await initializeDatabaseAsync();
  await db.runAsync(
    `INSERT OR IGNORE INTO meal_tags (meal_id, tag_id, created_at)
     VALUES (?, ?, ?)`,
    mealId,
    tagId,
    new Date().toISOString()
  );
}

export async function replaceMealTagsAsync(mealId: string, tagIds: string[]) {
  const db = await initializeDatabaseAsync();

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM meal_tags WHERE meal_id = ?', mealId);

    for (const tagId of tagIds) {
      await db.runAsync(
        `INSERT INTO meal_tags (meal_id, tag_id, created_at)
         VALUES (?, ?, ?)`,
        mealId,
        tagId,
        new Date().toISOString()
      );
    }
  });
}

export async function deleteTagAsync(id: string) {
  const db = await initializeDatabaseAsync();
  const result = await db.runAsync('DELETE FROM tags WHERE id = ?', id);
  return result.changes > 0;
}
