import type { RecipeDetailLevel } from '../../shared/models/recipe-instructions';

export type RecipeDetailPreferences = Readonly<Record<string, RecipeDetailLevel>>;

/** Keep recipe generation aligned with the cook's profile: unknown/none means beginner detail. */
export function detailLevelForCookingLevel(level: unknown): RecipeDetailLevel {
  if (level === 'expert') return 'expert';
  if (level === 'intermediate') return 'intermediate';
  return 'basic';
}

/** Scale a stored base quantity for display without mutating the recipe. */
export function scaleRecipeQuantity(
  quantity: number,
  baseServings: number,
  selectedServings: number
): number {
  if (
    !Number.isFinite(quantity) ||
    !Number.isFinite(baseServings) ||
    baseServings <= 0 ||
    !Number.isFinite(selectedServings) ||
    selectedServings <= 0
  ) {
    return quantity;
  }

  return Math.round(((quantity * selectedServings) / baseServings) * 100) / 100;
}

/** Return a recipe's in-session level, defaulting to the current form selection. */
export function recipeDetailLevelFor(
  preferences: RecipeDetailPreferences,
  recipeId: string,
  fallback: RecipeDetailLevel
): RecipeDetailLevel {
  return preferences[recipeId] ?? fallback;
}

/** Remember the presentation choice immutably, keyed per recipe. */
export function rememberRecipeDetailLevel(
  preferences: RecipeDetailPreferences,
  recipeId: string,
  level: RecipeDetailLevel
): RecipeDetailPreferences {
  return { ...preferences, [recipeId]: level };
}
