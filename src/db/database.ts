import { databaseName, databaseVersion, stores } from './schema';

let databasePromise: Promise<IDBDatabase> | null = null;

function ensureObjectStore(
  database: IDBDatabase,
  transaction: IDBTransaction,
  name: string,
  options?: IDBObjectStoreParameters
) {
  if (database.objectStoreNames.contains(name)) {
    return transaction.objectStore(name);
  }

  return database.createObjectStore(name, options);
}

function ensureIndex(
  store: IDBObjectStore,
  name: string,
  keyPath: string | string[],
  options?: IDBIndexParameters
) {
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, options);
  }
}

function migrateDatabase(database: IDBDatabase, transaction: IDBTransaction) {
  const meals = ensureObjectStore(database, transaction, stores.meals, { keyPath: 'id' });
  ensureIndex(meals, 'name', 'name', { unique: false });
  ensureIndex(meals, 'updatedAt', 'updatedAt', { unique: false });

  const mealRecords = ensureObjectStore(database, transaction, stores.mealRecords, {
    keyPath: 'id',
  });
  ensureIndex(mealRecords, 'mealId', 'mealId', { unique: false });
  ensureIndex(mealRecords, 'cookedAt', 'cookedAt', { unique: false });
  ensureIndex(mealRecords, 'createdAt', 'createdAt', { unique: false });

  const media = ensureObjectStore(database, transaction, stores.media, { keyPath: 'id' });
  ensureIndex(media, 'mealRecordId', 'mealRecordId', { unique: false });
  ensureIndex(media, 'createdAt', 'createdAt', { unique: false });

  const tags = ensureObjectStore(database, transaction, stores.tags, { keyPath: 'id' });
  ensureIndex(tags, 'name', 'name', { unique: true });

  const mealTags = ensureObjectStore(database, transaction, stores.mealTags, {
    keyPath: ['mealId', 'tagId'],
  });
  ensureIndex(mealTags, 'mealId', 'mealId', { unique: false });
  ensureIndex(mealTags, 'tagId', 'tagId', { unique: false });
}

export function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
}

export function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve());
    transaction.addEventListener('abort', () => reject(transaction.error));
    transaction.addEventListener('error', () => reject(transaction.error));
  });
}

export function getDatabaseAsync() {
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);

    request.addEventListener('upgradeneeded', () => {
      if (!request.transaction) {
        reject(new Error('IndexedDB migration transaction is unavailable.'));
        return;
      }

      migrateDatabase(request.result, request.transaction);
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
    request.addEventListener('blocked', () => {
      reject(new Error('다른 탭에서 Tavolo 데이터베이스를 사용 중입니다.'));
    });
  });

  return databasePromise;
}

export async function withStoreAsync<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore, transaction: IDBTransaction) => T | Promise<T>
) {
  const database = await getDatabaseAsync();
  const transaction = database.transaction(storeName, mode);
  const store = transaction.objectStore(storeName);
  const result = await callback(store, transaction);

  if (mode !== 'readonly') {
    await transactionDone(transaction);
  }

  return result;
}

export async function withStoresAsync<T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  callback: (storesByName: Record<string, IDBObjectStore>, transaction: IDBTransaction) => T | Promise<T>
) {
  const database = await getDatabaseAsync();
  const transaction = database.transaction(storeNames, mode);
  const storesByName = Object.fromEntries(
    storeNames.map((storeName) => [storeName, transaction.objectStore(storeName)])
  );
  const result = await callback(storesByName, transaction);

  if (mode !== 'readonly') {
    await transactionDone(transaction);
  }

  return result;
}

export async function clearDatabaseAsync() {
  await withStoresAsync(Object.values(stores), 'readwrite', async (storesByName) => {
    await Promise.all(
      Object.values(storesByName).map((store) => requestToPromise(store.clear()))
    );
  });
}
