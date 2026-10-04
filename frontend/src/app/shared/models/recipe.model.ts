import type { RecipeInstructionStep, RecipeInstructionsByLevel } from './recipe-instructions';

export interface Recipe {
  id: string;
  name: string;
  description: string;
  difficulty: Difficulty;
  cuisine: string | null;
  mealType: MealType[];
  totalTime: number;
  prepTime: number;
  cookTime: number;
  restTime?: number | null;
  servings: number;
  calories?: number | null;
  image?: string;
  ingredients: RecipeIngredient[];
  utensils: string[];
  /** Legacy recipes keep their one historical list; new AI recipes use instructionsByLevel. */
  steps?: RecipeStep[];
  instructionsByLevel?: RecipeInstructionsByLevel;
  nutrition?: NutritionInfo;
  storage?: StorageInfo;
  author: AuthorType;
  authorId?: string;
  rating?: number;
  timesCooked: number;
  tags: string[];
  isFavorite: boolean;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecipeIngredient {
  ingredientId?: string;
  name: string;
  quantity: number;
  unit: MeasurementUnit;
  preparation?: string | null;
  isOptional: boolean;
  substitutes?: string[];
  notes?: string | null;
}

export interface RecipeStep extends RecipeInstructionStep {
  temperature?: Temperature;
  image?: string;
}

export interface Temperature {
  value: number;
  unit: 'C' | 'F';
}

export interface NutritionInfo {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  sugar?: number;
  sodium?: number;
}

export interface StorageInfo {
  method: string;
  container?: string | null;
  duration: string;
  reheatingInstructions?: string | null;
  freezingPossible: boolean;
  freezingDuration?: string | null;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export type MealType = 'breakfast' | 'brunch' | 'lunch' | 'snack' | 'dinner' | 'dessert';

export type AuthorType = 'ai' | 'user';

export type MeasurementUnit =
  'g' | 'kg' | 'ml' | 'l' | 'cup' | 'tbsp' | 'tsp' | 'unit' | 'bunch' | 'slice' | 'piece';

export interface RecipeFilter {
  search?: string;
  difficulty?: Difficulty;
  mealType?: MealType;
  maxTime?: number;
  cuisine?: string;
  tags?: string[];
  isFavorite?: boolean;
  author?: AuthorType;
}

export interface RecipeListResponse {
  recipes: Recipe[];
  total: number;
  page: number;
  pageSize: number;
}
