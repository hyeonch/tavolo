import type { MealRecord, WorldCupMatch, WorldCupSession } from './types/meal';

function createId(prefix: string) {
  return typeof crypto.randomUUID === 'function'
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function shuffle<T>(items: T[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[nextIndex]] = [shuffled[nextIndex], shuffled[index]];
  }
  return shuffled;
}

export function getWorldCupCandidates(records: MealRecord[]) {
  const latestByMeal = new Map<string, MealRecord>();
  records.forEach((record) => {
    const existing = latestByMeal.get(record.mealId);
    if (!existing || existing.cookedAt < record.cookedAt) latestByMeal.set(record.mealId, record);
  });
  return [...latestByMeal.values()];
}

export function getWorldCupSizes(candidateCount: number) {
  return [8, 4, 2].filter((size) => candidateCount >= size);
}

export function createWorldCup(records: MealRecord[], size: number) {
  const candidates = shuffle(getWorldCupCandidates(records)).slice(0, size);
  const now = new Date().toISOString();
  const session: WorldCupSession = {
    id: createId('world-cup'),
    candidateRecordIds: candidates.map((record) => record.id),
    totalRounds: Math.log2(size),
    currentRound: 1,
    status: 'in-progress',
    createdAt: now,
    updatedAt: now,
  };
  const matches: WorldCupMatch[] = candidates.reduce<WorldCupMatch[]>((items, record, index) => {
    if (index % 2) return items;
    const opponent = candidates[index + 1];
    if (!opponent) return items;
    items.push({
      id: createId('world-cup-match'),
      sessionId: session.id,
      round: 1,
      order: index / 2 + 1,
      leftRecordId: record.id,
      rightRecordId: opponent.id,
      createdAt: now,
      updatedAt: now,
    });
    return items;
  }, []);

  return { session, matches };
}

export function advanceWorldCup(
  session: WorldCupSession,
  matches: WorldCupMatch[],
  matchId: string,
  winnerRecordId: string
) {
  const now = new Date().toISOString();
  const updatedMatches = matches.map((match) =>
    match.id === matchId ? { ...match, winnerRecordId, updatedAt: now } : match
  );
  const currentMatches = updatedMatches.filter((match) => match.round === session.currentRound);
  if (currentMatches.some((match) => !match.winnerRecordId)) {
    return { session: { ...session, updatedAt: now }, matches: updatedMatches };
  }

  const winners = currentMatches.map((match) => match.winnerRecordId as string);
  if (winners.length === 1) {
    return {
      session: { ...session, status: 'completed' as const, winnerRecordId: winners[0], updatedAt: now },
      matches: updatedMatches,
    };
  }

  const nextRound = session.currentRound + 1;
  const nextMatches = winners.reduce<WorldCupMatch[]>((items, winner, index) => {
    if (index % 2) return items;
    items.push({
      id: createId('world-cup-match'),
      sessionId: session.id,
      round: nextRound,
      order: index / 2 + 1,
      leftRecordId: winner,
      rightRecordId: winners[index + 1],
      createdAt: now,
      updatedAt: now,
    });
    return items;
  }, []);

  return {
    session: { ...session, currentRound: nextRound, updatedAt: now },
    matches: [...updatedMatches, ...nextMatches],
  };
}
