import { fields, metadataOf } from './components/RecipeFilters';
import type { MealRecord } from './types/meal';

export type RecapSummary = {
  year: number;
  totalCount: number;
  monthCounts: number[];
  averageRating: string | null;
  averageMinutes: number | null;
  timedCount: number;
  rankings: { field: typeof fields[number]; values: { name: string; count: number }[] }[];
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
  const minutes = yearlyRecords.flatMap(record => record.totalMinutes ? [record.totalMinutes] : []);
  const rankings = fields.map(field => {
    const counts = new Map<string, number>();
    for (const record of yearlyRecords) {
      for (const name of new Set(metadataOf(record)[field] ?? [])) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    const values = [...counts].map(([name,count]) => ({name,count}))
      .sort((a,b) => b.count - a.count || a.name.localeCompare(b.name,'ko')).slice(0,5);
    return { field, values };
  });
  const bestRating = Math.max(0, ...yearlyRecords.map((record) => record.rating ?? 0));

  return {
    year,
    totalCount: yearlyRecords.length,
    monthCounts,
    averageRating,
    averageMinutes: minutes.length ? Math.round(minutes.reduce((sum,n) => sum+n,0) / minutes.length) : null,
    timedCount: minutes.length,
    rankings,
    bestRecords: bestRating ? yearlyRecords.filter((record) => record.rating === bestRating).slice(0, 3) : [],
  };
}
