import type {
  RecipeDetailLevel,
  RecipeInstructionStep,
  RecipeInstructionsByLevel
} from './recipe-instructions';
import type { RecipeGuidance } from './recipe.model';

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
  /** Máximo de trabajos IA en vuelo por proveedor; 0 = ilimitado. */
  concurrency: number;
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

export type DetailLevel = RecipeDetailLevel;

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
  householdMemberIds?: string[];
  guests?: AIGuestPreferences[];
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

/** Ephemeral food preferences for a guest; deliberately contains no name or account identifier. */
export interface AIGuestPreferences {
  allergies: string[];
  intolerances: string[];
  diets: string[];
  likes: string[];
  dislikes: string[];
  notes: string;
}

/** Backwards-compatible alias for the meal-replacement request contract. */
export type AIReplacementGuest = AIGuestPreferences;

export interface AIReplacementCandidate {
  name: string;
  description: string;
  ingredients: string[];
  estimatedTime: number;
  servings: number;
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
  cuisine?: string | null;
  totalTime: number;
  prepTime: number;
  cookTime: number;
  servings: number;
  calories?: number | null;
  ingredients: AIRecipeIngredient[];
  utensils: string[];
  guidance: RecipeGuidance;
  /** Canonical output: all detail variants in one provider response. */
  instructionsByLevel?: RecipeInstructionsByLevel;
  /** Initial view selection returned by the API; changing it is local-only. */
  selectedDetailLevel?: DetailLevel;
  /** Legacy provider response support during rolling upgrades. */
  steps?: AIRecipeStep[];
  tags?: string[];
  nutrition?: AINutritionInfo | null;
  storage?: AIStorageInfo | null;
  restTime?: number | null;
  difficultyNotes?: string;
}

export interface AIRecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
  preparation?: string | null;
  isOptional?: boolean;
  substitutes?: string[];
  notes?: string | null;
}

export interface AIRecipeStep extends RecipeInstructionStep {
  timerRequired?: boolean;
  timerDuration?: number;
}

export interface AINutritionInfo {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
}

export interface AIStorageInfo {
  method: string;
  duration: string;
  reheating?: string | null;
  container?: string | null;
  freezingPossible?: boolean;
  freezingDuration?: string | null;
}

export interface AIWeeklyPlanRequest {
  startDate: string;
  endDate: string;
  goals: AIGoals;
  availableIngredients: string[];
  householdPreferences?: AIHouseholdPreferences;
  householdMemberIds?: string[];
  guests?: AIGuestPreferences[];
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
  /** Lo que el modelo contesto cuando la prueba pasa (el JSON pedido, validado en el server). */
  message?: string;
}

export const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'OpenAI',
  custom: 'Custom (OpenAI-like)'
};
