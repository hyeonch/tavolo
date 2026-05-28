export type MealRecord = {
  id: string;
  title: string;
  date: string;
  rating?: number;
  memo?: string;
  tags: string[];
  mediaIds: string[];
  recipeUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type MealMedia = {
  id: string;
  mealRecordId: string;
  type: 'photo' | 'video';
  uri: string;
  thumbnailUri?: string;
  createdAt: string;
};
