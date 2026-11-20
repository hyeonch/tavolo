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
export function matchesMetadata(record: MealRecord, filters: typeof emptyFilters) {
  const metadata = metadataOf(record);
  return (!filters.servings || record.servings === Number(filters.servings)) && fields.every(key => !filters[key] || metadata[key]?.includes(filters[key]));
}
export function RecipeFilters({records, filters, onChange}: {records:MealRecord[],filters:typeof emptyFilters,onChange:(value:typeof emptyFilters)=>void}) {
  return <div className="metadata-filters">{fields.map(key => <label key={key}>{labels[key]}
    <select value={filters[key]} onChange={event => onChange({...filters,[key]:event.target.value})}>
      <option value="">전체</option>
      {[...new Set(records.flatMap(record => metadataOf(record)[key] ?? []))].sort((a,b)=>a.localeCompare(b,'ko')).map(value=><option key={value}>{value}</option>)}
    </select></label>)}<label>인분<select value={filters.servings} onChange={e=>onChange({...filters,servings:e.target.value})}><option value="">전체</option>
      {[...new Set(records.flatMap(r=>r.servings ? [r.servings] : []))].sort((a,b)=>a-b).map(n=><option value={n} key={n}>{n}인분</option>)}
    </select></label></div>;
}
