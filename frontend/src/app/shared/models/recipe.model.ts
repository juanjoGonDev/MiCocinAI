export interface Recipe {
  id: string;
  name: string;
  description: string;
  difficulty: Difficulty;
  cuisine: string;
  mealType: MealType[];
  totalTime: number;
  prepTime: number;
  cookTime: number;
  restTime?: number;
  servings: number;
  calories?: number;
  image?: string;
  ingredients: RecipeIngredient[];
  utensils: string[];
  steps: RecipeStep[];
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
  preparation?: string;
  isOptional: boolean;
  substitutes?: string[];
  notes?: string;
}

export interface RecipeStep {
  stepNumber: number;
  instruction: string;
  duration?: number;
  temperature?: Temperature;
  timerRequired: boolean;
  timerDuration?: number;
  tips?: string;
  warning?: string;
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
  fiber: number;
  sugar?: number;
  sodium?: number;
}

export interface StorageInfo {
  method: string;
  container: string;
  duration: string;
  reheatingInstructions?: string;
  freezingPossible: boolean;
  freezingDuration?: string;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export type MealType = 'breakfast' | 'brunch' | 'lunch' | 'snack' | 'dinner' | 'dessert';

export type AuthorType = 'ai' | 'user';

export type MeasurementUnit =
  | 'g' | 'kg' | 'ml' | 'l'
  | 'cup' | 'tbsp' | 'tsp'
  | 'unit' | 'bunch' | 'slice' | 'piece';

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
