import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { getMigrations } from './migrations';
import { currentDatabaseVersion, databaseName } from './schema';

let databasePromise: Promise<SQLiteDatabase> | null = null;

export async function getDatabaseAsync() {
  databasePromise ??= openDatabaseAsync(databaseName);
  return databasePromise;
}

export async function migrateDatabaseAsync(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;

  if (version < currentDatabaseVersion) {
    await db.withTransactionAsync(async () => {
      for (const migration of getMigrations(db.execAsync.bind(db))) {
        if (version < migration.version) {
          await migration.migrateAsync();
          await db.execAsync(`PRAGMA user_version = ${migration.version}`);
        }
      }
    });
  }

  if (version > currentDatabaseVersion) {
    throw new Error('앱보다 새로운 데이터베이스 버전입니다. 앱 업데이트가 필요합니다.');
  }
}

export async function initializeDatabaseAsync() {
  const db = await getDatabaseAsync();
  await migrateDatabaseAsync(db);
  return db;
}
