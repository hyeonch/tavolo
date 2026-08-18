import { requestToPromise, withStoreAsync, withStoresAsync } from './database';
import { stores } from './schema';
import type { WorldCupMatch, WorldCupSession } from '../types/meal';

export async function createWorldCupSessionAsync(session: WorldCupSession, matches: WorldCupMatch[]) {
  await withStoresAsync(
    [stores.worldCupSessions, stores.worldCupMatches],
    'readwrite',
    async (storesByName) => {
      await Promise.all([
        requestToPromise(storesByName[stores.worldCupSessions].put(session)),
        ...matches.map((match) => requestToPromise(storesByName[stores.worldCupMatches].put(match))),
      ]);
    }
  );

  return session;
}

export async function getLatestWorldCupSessionAsync() {
  return withStoreAsync(stores.worldCupSessions, 'readonly', async (store) => {
    const sessions = await requestToPromise<WorldCupSession[]>(store.getAll());
    return sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
  });
}

export async function listWorldCupMatchesAsync(sessionId: string) {
  return withStoreAsync(stores.worldCupMatches, 'readonly', async (store) => {
    const matches = await requestToPromise<WorldCupMatch[]>(store.index('sessionId').getAll(sessionId));
    return matches.sort((left, right) => left.round - right.round || left.order - right.order);
  });
}

export async function saveWorldCupProgressAsync(session: WorldCupSession, matches: WorldCupMatch[]) {
  await withStoresAsync(
    [stores.worldCupSessions, stores.worldCupMatches],
    'readwrite',
    async (storesByName) => {
      await Promise.all([
        requestToPromise(storesByName[stores.worldCupSessions].put(session)),
        ...matches.map((match) => requestToPromise(storesByName[stores.worldCupMatches].put(match))),
      ]);
    }
  );

  return session;
}
