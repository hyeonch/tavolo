// Files and Sets are structured-cloned: photos never pass through localStorage.
const pending = new Map<string, Promise<unknown>>();
function openDrafts(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('tavolo-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction<T>(key: string, mode: IDBTransactionMode, value?: T, remove = false): Promise<T | undefined> {
  const db = await openDrafts();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', mode);
    const store = tx.objectStore('drafts');
    const request = mode === 'readonly' ? store.get(key) : remove ? store.delete(key) : store.put(value, key);
    tx.oncomplete = () => { db.close(); resolve(mode === 'readonly' ? request.result : value); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? request.error); };
  });
}
export async function readDraft<T>(key: string) {
  await pending.get(key)?.catch(() => undefined);
  return transaction<T>(key, 'readonly');
}
export function writeDraft<T>(key: string, value: T) {
  const operation = (pending.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => transaction(key, 'readwrite', value));
  pending.set(key, operation);
  const release = () => { if (pending.get(key) === operation) pending.delete(key); };
  void operation.then(release, release);
  return operation;
}
export function deleteDraft(key: string) {
  const operation = (pending.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => transaction(key, 'readwrite', undefined, true));
  pending.set(key, operation);
  const release = () => { if (pending.get(key) === operation) pending.delete(key); };
  void operation.then(release, release);
  return operation;
}
