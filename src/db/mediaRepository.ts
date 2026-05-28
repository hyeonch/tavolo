import { getDatabaseAsync, initializeDatabaseAsync } from './database';
import type { CreateMediaInput, Media } from '../types/meal';

type MediaRow = {
  id: string;
  meal_record_id: string;
  type: Media['type'];
  uri: string;
  thumbnail_uri: string | null;
  created_at: string;
};

function mapMedia(row: MediaRow): Media {
  return {
    id: row.id,
    mealRecordId: row.meal_record_id,
    type: row.type,
    uri: row.uri,
    thumbnailUri: row.thumbnail_uri ?? undefined,
    createdAt: row.created_at,
  };
}

export async function createMediaAsync(input: CreateMediaInput) {
  const db = await initializeDatabaseAsync();
  const createdAt = input.createdAt ?? new Date().toISOString();

  await db.runAsync(
    `INSERT INTO media (
      id,
      meal_record_id,
      type,
      uri,
      thumbnail_uri,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    input.id,
    input.mealRecordId,
    input.type,
    input.uri,
    input.thumbnailUri ?? null,
    createdAt
  );

  return getMediaByIdAsync(input.id);
}

export async function getMediaByIdAsync(id: string) {
  const db = await getDatabaseAsync();
  const row = await db.getFirstAsync<MediaRow>('SELECT * FROM media WHERE id = ?', id);
  return row ? mapMedia(row) : null;
}

export async function listMediaByMealRecordIdAsync(mealRecordId: string) {
  const db = await initializeDatabaseAsync();
  const rows = await db.getAllAsync<MediaRow>(
    'SELECT * FROM media WHERE meal_record_id = ? ORDER BY created_at ASC',
    mealRecordId
  );

  return rows.map(mapMedia);
}

export async function deleteMediaAsync(id: string) {
  const db = await initializeDatabaseAsync();
  const result = await db.runAsync('DELETE FROM media WHERE id = ?', id);
  return result.changes > 0;
}

export async function deleteMediaByMealRecordIdAsync(mealRecordId: string) {
  const db = await initializeDatabaseAsync();
  const result = await db.runAsync('DELETE FROM media WHERE meal_record_id = ?', mealRecordId);
  return result.changes;
}
