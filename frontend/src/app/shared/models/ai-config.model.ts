export interface AIProviderConfig {
  id: string;
  name: string;
  provider: AIProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  timeout: number;
  retryAttempts: number;
  isActive: boolean;
  lastTested?: Date;
  testStatus?: TestStatus;
  testError?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AIProvider = 'openai' | 'custom';

export type TestStatus = 'idle' | 'testing' | 'success' | 'failed';

export interface AIRequestConfig {
  recipeGeneration: RecipeGenerationConfig;
  weeklyPlanning: WeeklyPlanningConfig;
  recommendations: RecommendationsConfig;
}

export interface RecipeGenerationConfig {
  detailLevel: DetailLevel;
  includeNutrition: boolean;
  includeStorage: boolean;
  includeAlternatives: boolean;
  language: string;
}

export type DetailLevel = 'basic' | 'intermediate' | 'expert';

export interface WeeklyPlanningConfig {
  considerSeasonal: boolean;
  varietyWeight: number;
  budgetConsideration: boolean;
  leftoverReuse: boolean;
}

export interface RecommendationsConfig {
  basedOnHistory: boolean;
  historyDays: number;
  considerPreferences: boolean;
  suggestNew: boolean;
}

export interface AIRecipeRequest {
  ingredients: AIIngredient[];
  utensils: AIUtensil[];
  servings: number;
  difficulty: string;
  detailLevel: DetailLevel;
  dietaryRestrictions: string[];
  allergies: string[];
  preferences: string[];
  cookingTime?: {
    min: number;
    max: number;
  };
}

export interface AIIngredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface AIUtensil {
  id: string;
  name: string;
  available: boolean;
}

export interface AIRecipeResponse {
  name: string;
  description: string;
  difficulty: string;
  totalTime: number;
  prepTime: number;
  cookTime: number;
  servings: number;
  calories?: number;
  ingredients: AIRecipeIngredient[];
  utensils: string[];
  steps: AIRecipeStep[];
  nutrition?: AINutritionInfo;
  storage?: AIStorageInfo;
  restTime?: number;
  difficultyNotes?: string;
}

export interface AIRecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
  preparation?: string;
  notes?: string;
}

export interface AIRecipeStep {
  stepNumber: number;
  instruction: string;
  duration?: number;
  tips?: string;
  warning?: string;
}

export interface AINutritionInfo {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

export interface AIStorageInfo {
  method: string;
  duration: string;
  reheating?: string;
}

export interface AIWeeklyPlanRequest {
  startDate: string;
  endDate: string;
  goals: AIGoals;
  availableIngredients: string[];
  householdPreferences: AIHouseholdPreferences;
}

export interface AIGoals {
  type: string;
  caloriesTarget?: number;
  proteinTarget?: number;
  restrictions: string[];
}

export interface AIHouseholdPreferences {
  likes: string[];
  dislikes: string[];
  allergies: string[];
}

export interface AIRecommendationRequest {
  recentMeals: AIRecentMeal[];
  availableIngredients: string[];
  householdPreferences: AIHouseholdPreferences;
  goals: AIGoals;
  count: number;
}

export interface AIRecentMeal {
  date: string;
  meal: string;
  recipeId?: string;
}

export interface AITestConnectionResponse {
  success: boolean;
  model: string;
  latency: number;
  error?: string;
}

export const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'OpenAI',
  custom: 'Custom (OpenAI-like)'
};


