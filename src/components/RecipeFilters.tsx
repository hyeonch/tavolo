import legacyTags from '../db/legacyMealTags.json';
import type { MealRecord, RecipeMetadata } from '../types/meal';

export const fields = ['country', 'mainIngredient', 'dishType'] as const;
export const labels = {country:'국가', mainIngredient:'주재료', dishType:'요리 종류'};
export const emptyFilters = {country:'', mainIngredient:'', dishType:'',servings:''};
export function metadataOf(record?: MealRecord | null): RecipeMetadata {
  if (record?.metadata) return record.metadata;
  const tags = record?.meal?.tags ?? [];
  return {country:tags.filter(t => legacyTags.나라.includes(t)), mainIngredient:tags.filter(t => legacyTags.주재료.includes(t)), dishType:tags.filter(t => legacyTags['요리 종류'].includes(t))};
}
type FilterField = typeof fields[number];

export function matchesMetadata(record: MealRecord, filters: typeof emptyFilters, exactField?: FilterField) {
  if (filters.servings && record.servings !== Number(filters.servings)) return false;
  const metadata = metadataOf(record);
  return fields.every(key => {
    const query = filters[key]?.trim().toLowerCase();
    if (!query) return true;
    return metadata[key]?.some(value => key === exactField
      ? value === filters[key]
      : value.toLowerCase().includes(query));
  });
}

export function RecipeFilters({ filters, onChange }: {
  filters: typeof emptyFilters;
  onChange: (value: typeof emptyFilters) => void;
}) {
  return <div className="metadata-filters">
    {fields.map(key => <label key={key}>{labels[key]}
      <input type="search" placeholder={labels[key] + ' 검색'} value={filters[key]}
        onChange={event => onChange({ ...filters, [key]: event.target.value })} />
    </label>)}
    <label>인분
      <input type="number" min="1" inputMode="numeric" placeholder="전체" value={filters.servings}
        onChange={event => onChange({ ...filters, servings: event.target.value })} />
    </label>
  </div>;
}
