export type RecipeDetailLevel = 'basic' | 'intermediate' | 'expert';

export interface RecipeInstructionStep {
  stepNumber: number;
  instruction: string;
  duration?: number | null;
  tips?: string | null;
  warning?: string | null;
  timerRequired?: boolean;
  timerDuration?: number | null;
}

export type RecipeInstructionsByLevel = Record<RecipeDetailLevel, RecipeInstructionStep[]>;

export interface RecipeInstructionSource {
  instructionsByLevel?: Partial<RecipeInstructionsByLevel> | null;
  steps?: RecipeInstructionStep[] | null;
}

/** Prefer a stored detail variant, then fall back to the single legacy list without fabricating variants. */
export function recipeInstructionsForLevel(
  recipe: RecipeInstructionSource,
  level: RecipeDetailLevel
): RecipeInstructionStep[] {
  const selectedInstructions = recipe.instructionsByLevel?.[level];
  return selectedInstructions?.length ? selectedInstructions : (recipe.steps ?? []);
}
