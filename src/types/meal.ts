export type Meal = {
  id: string;
  name: string;
  recipeUrl?: string;
  memo?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type IngredientItem = {
  id: string;
  name: string;
  quantity?: string;
  unit?: string;
  note?: string;
};

export type IngredientGroup = {
  id: string;
  name: string;
  items: IngredientItem[];
};

export type RecipeStep = {
  id: string;
  order: number;
  body: string;
  mediaIds: string[];
};

export type MealRecord = {
  id: string;
  mealId: string;
  meal?: Meal;
  cookedAt: string;
  rating?: number;
  memo?: string;
  ingredientGroups?: IngredientGroup[];
  recipeSteps?: RecipeStep[];
  finishedMediaId?: string;
  mediaIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type Media = {
  id: string;
  mealRecordId: string;
  type: 'photo';
  uri?: string;
  blob?: Blob;
  thumbnailUri?: string;
  recipeStepId?: string;
  createdAt: string;
};

export type MealMedia = Media;

export type Tag = {
  id: string;
  name: string;
  createdAt: string;
};

export type CreateMealInput = {
  id: string;
  name: string;
  recipeUrl?: string;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type UpdateMealInput = Partial<Pick<Meal, 'name' | 'recipeUrl' | 'memo'>> & {
  updatedAt?: string;
};

export type CreateMealRecordInput = {
  id: string;
  mealId: string;
  cookedAt: string;
  rating?: number;
  memo?: string;
  ingredientGroups?: IngredientGroup[];
  recipeSteps?: RecipeStep[];
  finishedMediaId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type UpdateMealRecordInput = Partial<
  Pick<
    MealRecord,
    'mealId' | 'cookedAt' | 'rating' | 'memo' | 'ingredientGroups' | 'recipeSteps' | 'finishedMediaId'
  >
> & {
  updatedAt?: string;
};

export type CreateMediaInput = {
  id: string;
  mealRecordId: string;
  type: Media['type'];
  uri?: string;
  blob?: Blob;
  thumbnailUri?: string;
  recipeStepId?: string;
  createdAt?: string;
};

export type CreateTagInput = {
  id: string;
  name: string;
  createdAt?: string;
};
