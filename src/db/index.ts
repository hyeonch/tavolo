import * as cloud from './cloudRepository';
import * as localMeal from './mealRepository';
import * as localMedia from './mediaRepository';
import * as localRecipeScrap from './recipeScrapRepository';
import * as localTag from './tagRepository';

export { clearDatabaseAsync, getDatabaseAsync, requestToPromise, transactionDone, withStoreAsync, withStoresAsync } from './database';
export { seedDebugDataAsync } from './debugSeed';
export { databaseName, databaseVersion, stores } from './schema';
export { createMediaObjectUrl, revokeMediaObjectUrl } from './mediaRepository';

let dataSource: 'local' | 'cloud' = 'local';
export function setDataSource(nextDataSource: 'local' | 'cloud') { dataSource = nextDataSource; }
const meals = () => (dataSource === 'cloud' ? cloud : localMeal);
const media = () => (dataSource === 'cloud' ? cloud : localMedia);
const tags = () => (dataSource === 'cloud' ? cloud : localTag);
const scraps = () => (dataSource === 'cloud' ? cloud : localRecipeScrap);

export const createMealAsync = (...args: Parameters<typeof localMeal.createMealAsync>) => meals().createMealAsync(...args);
export const getMealByIdAsync = (...args: Parameters<typeof localMeal.getMealByIdAsync>) => meals().getMealByIdAsync(...args);
export const listMealsAsync = () => meals().listMealsAsync();
export const updateMealAsync = (...args: Parameters<typeof localMeal.updateMealAsync>) => meals().updateMealAsync(...args);
export const deleteMealAsync = (...args: Parameters<typeof localMeal.deleteMealAsync>) => meals().deleteMealAsync(...args);
export const createMealRecordAsync = (...args: Parameters<typeof localMeal.createMealRecordAsync>) => meals().createMealRecordAsync(...args);
export const getMealRecordByIdAsync = (...args: Parameters<typeof localMeal.getMealRecordByIdAsync>) => meals().getMealRecordByIdAsync(...args);
export const listMealRecordsAsync = () => meals().listMealRecordsAsync();
export const listRecentMealRecordsAsync = (...args: Parameters<typeof localMeal.listRecentMealRecordsAsync>) => meals().listRecentMealRecordsAsync(...args);
export const listMealRecordsByDateAsync = (...args: Parameters<typeof localMeal.listMealRecordsByDateAsync>) => meals().listMealRecordsByDateAsync(...args);
export const listMealRecordsByMealIdAsync = (...args: Parameters<typeof localMeal.listMealRecordsByMealIdAsync>) => meals().listMealRecordsByMealIdAsync(...args);
export const updateMealRecordAsync = (...args: Parameters<typeof localMeal.updateMealRecordAsync>) => meals().updateMealRecordAsync(...args);
export const deleteMealRecordAsync = (...args: Parameters<typeof localMeal.deleteMealRecordAsync>) => meals().deleteMealRecordAsync(...args);
export const createMediaAsync = (...args: Parameters<typeof localMedia.createMediaAsync>) => media().createMediaAsync(...args);
export const getMediaByIdAsync = (...args: Parameters<typeof localMedia.getMediaByIdAsync>) => media().getMediaByIdAsync(...args);
export const listMediaByMealRecordIdAsync = (...args: Parameters<typeof localMedia.listMediaByMealRecordIdAsync>) => media().listMediaByMealRecordIdAsync(...args);
export const deleteMediaAsync = (...args: Parameters<typeof localMedia.deleteMediaAsync>) => media().deleteMediaAsync(...args);
export const deleteMediaByMealRecordIdAsync = (...args: Parameters<typeof localMedia.deleteMediaByMealRecordIdAsync>) => media().deleteMediaByMealRecordIdAsync(...args);
export const createTagAsync = (...args: Parameters<typeof localTag.createTagAsync>) => tags().createTagAsync(...args);
export const getTagByIdAsync = (...args: Parameters<typeof localTag.getTagByIdAsync>) => tags().getTagByIdAsync(...args);
export const getTagByNameAsync = (...args: Parameters<typeof localTag.getTagByNameAsync>) => tags().getTagByNameAsync(...args);
export const replaceMealTagsAsync = (...args: Parameters<typeof localTag.replaceMealTagsAsync>) => tags().replaceMealTagsAsync(...args);
export const listTagsAsync = () => localTag.listTagsAsync();
export const listTagsByMealIdAsync = (...args: Parameters<typeof localTag.listTagsByMealIdAsync>) => localTag.listTagsByMealIdAsync(...args);
export const attachTagToMealAsync = (...args: Parameters<typeof localTag.attachTagToMealAsync>) => localTag.attachTagToMealAsync(...args);
export const deleteTagAsync = (...args: Parameters<typeof localTag.deleteTagAsync>) => localTag.deleteTagAsync(...args);
export const createRecipeScrapAsync = (...args: Parameters<typeof localRecipeScrap.createRecipeScrapAsync>) => scraps().createRecipeScrapAsync(...args);
export const listRecipeScrapsAsync = () => scraps().listRecipeScrapsAsync();
export const deleteRecipeScrapAsync = (...args: Parameters<typeof localRecipeScrap.deleteRecipeScrapAsync>) => scraps().deleteRecipeScrapAsync(...args);
