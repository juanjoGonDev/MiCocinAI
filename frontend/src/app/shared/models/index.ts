// Recipe model
export {
  Recipe,
  RecipeIngredient,
  RecipeStep,
  Temperature,
  NutritionInfo,
  StorageInfo,
  Difficulty,
  AuthorType,
  RecipeFilter,
  RecipeListResponse
} from './recipe.model';

export type { MealType as RecipeMealType } from './recipe.model';
export type { MeasurementUnit as RecipeMeasurementUnit } from './recipe.model';

// Pantry model
export {
  Ingredient,
  IngredientCategory,
  StorageLocation,
  Utensil,
  UtensilCategory,
  PantryFilter,
  PantryStats,
  INGREDIENT_CATEGORY_LABELS,
  STORAGE_LOCATION_LABELS,
  UTENSIL_CATEGORY_LABELS
} from './pantry.model';

export type { MeasurementUnit } from './pantry.model';

// Household model
export {
  Household,
  HouseholdMember,
  MemberRole,
  CookingLevel,
  FoodPreferences,
  DietType,
  SpiceTolerance,
  PortionSize,
  Allergy,
  AllergySeverity,
  MEMBER_ROLE_LABELS,
  COOKING_LEVEL_LABELS,
  DIET_TYPE_LABELS,
  SPICE_TOLERANCE_LABELS,
  PORTION_SIZE_LABELS,
  ALLERGY_SEVERITY_LABELS
} from './household.model';

// Calendar model
export {
  WeeklyCalendar,
  DayPlan,
  Meal,
  DayOfWeek,
  MealType,
  GenerationType,
  NutritionalGoals,
  GoalType,
  CustomGoal,
  GoalFrequency,
  DAY_OF_WEEK_LABELS,
  MEAL_TYPE_LABELS,
  GOAL_TYPE_LABELS,
  DAY_ORDER,
  MEAL_ORDER
} from './calendar.model';

// AI Config model
export {
  AIProviderConfig,
  AIProvider,
  TestStatus,
  AIRequestConfig,
  RecipeGenerationConfig,
  WeeklyPlanningConfig,
  RecommendationsConfig,
  AIRecipeRequest,
  AIIngredient,
  AIUtensil,
  AIRecipeResponse,
  AIRecipeIngredient,
  AIRecipeStep,
  AINutritionInfo,
  AIStorageInfo,
  AIWeeklyPlanRequest,
  AIGoals,
  AIHouseholdPreferences,
  AIRecommendationRequest,
  AIRecentMeal,
  AITestConnectionResponse,
  AI_PROVIDER_LABELS,
  DETAIL_LEVEL_LABELS,
  DetailLevel
} from './ai-config.model';

// User model
export {
  User,
  UserPreferences,
  Theme,
  Language,
  NotificationPreferences,
  AuthCredentials,
  RegisterData,
  AuthResponse,
  TokenPayload,
  THEME_LABELS
} from './user.model';

export type { CookingLevel as UserCookingLevel } from './user.model';

// Home profile model (nivel de cocina + secciones que se quieren usar)
export {
  COOKING_LEVEL_OPTIONS,
  DEFAULT_HOME_PROFILE,
  HOME_MODULE_OPTIONS,
  HOME_MODULES,
  detailLevelHint,
  isCookingLevel,
  isHomeModule,
  toHomeProfile,
  toggleHomeModule
} from './home-profile';
export type { HomeModule, HomeProfile } from './home-profile';
