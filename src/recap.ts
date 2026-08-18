import type { MealRecord } from './types/meal';

export type RecapSummary = {
  year: number;
  totalCount: number;
  monthCounts: number[];
  averageRating: string | null;
  favoriteTag: string | null;
  topTags: { name: string; count: number }[];
  bestRecords: MealRecord[];
};

export function getRecordYears(records: MealRecord[]) {
  return [...new Set(records.map((record) => Number(record.cookedAt.slice(0, 4))))].sort((left, right) => right - left);
}

export function buildRecapSummary(records: MealRecord[], year: number): RecapSummary {
  const yearlyRecords = records.filter((record) => Number(record.cookedAt.slice(0, 4)) === year);
  const monthCounts = Array.from({ length: 12 }, (_, month) =>
    yearlyRecords.filter((record) => Number(record.cookedAt.slice(5, 7)) === month + 1).length
  );
  const ratedRecords = yearlyRecords.filter((record) => record.rating);
  const averageRating = ratedRecords.length
    ? (ratedRecords.reduce((sum, record) => sum + (record.rating ?? 0), 0) / ratedRecords.length).toFixed(1)
    : null;
  const tagCounts = new Map<string, number>();
  yearlyRecords.flatMap((record) => record.meal?.tags ?? []).forEach((tag) => {
    tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  });
  const topTags = [...tagCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'ko-KR'));
  const bestRating = Math.max(0, ...yearlyRecords.map((record) => record.rating ?? 0));

  return {
    year,
    totalCount: yearlyRecords.length,
    monthCounts,
    averageRating,
    favoriteTag: topTags[0]?.name ?? null,
    topTags: topTags.slice(0, 5),
    bestRecords: bestRating ? yearlyRecords.filter((record) => record.rating === bestRating).slice(0, 3) : [],
  };
}
