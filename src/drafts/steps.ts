import type { RecipeStep } from '../types/meal';
export function stepsForSave(steps: (RecipeStep & { photoFile?: File | null })[], removed: Set<string>): RecipeStep[] {
  return steps.filter(step => step.body.trim() || step.photoFile || step.mediaIds.some(id => !removed.has(id)))
    .map((step, index) => ({ id: step.id, order: index + 1, body: step.body.trim(), mediaIds: step.mediaIds.filter(id => !removed.has(id)) }));
}
