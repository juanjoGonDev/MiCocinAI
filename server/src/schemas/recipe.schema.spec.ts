import { describe, expect, it } from 'vitest';
import { createRecipeSchema } from './recipe.schema.js';

const baseRecipe = {
  name: 'Crema de zanahoria',
  ingredients: [{ name: 'Zanahoria', quantity: 2, unit: 'unit' }]
};

const recipeSteps = [{ stepNumber: 1, instruction: 'Cocer la zanahoria.' }];
const instructionsByLevel = {
  basic: recipeSteps,
  intermediate: [{ stepNumber: 1, instruction: 'Cortar y cocer hasta que esté tierna.' }],
  expert: [{ stepNumber: 1, instruction: 'Cortar en dados uniformes y cocer a hervor suave.' }]
};

describe('createRecipeSchema instrucciones', () => {
  it('mantiene válidas las recetas antiguas con una sola lista de pasos', () => {
    expect(createRecipeSchema.safeParse({ ...baseRecipe, steps: recipeSteps }).success).toBe(true);
  });

  it('acepta las tres variantes con campos comunes guardados una sola vez', () => {
    expect(createRecipeSchema.safeParse({ ...baseRecipe, instructionsByLevel }).success).toBe(true);
  });

  it('exige exactamente una representación y rechaza variantes incompletas o vacías', () => {
    expect(createRecipeSchema.safeParse(baseRecipe).success).toBe(false);
    expect(
      createRecipeSchema.safeParse({ ...baseRecipe, steps: recipeSteps, instructionsByLevel })
        .success
    ).toBe(false);
    expect(
      createRecipeSchema.safeParse({
        ...baseRecipe,
        instructionsByLevel: { basic: recipeSteps, intermediate: recipeSteps }
      }).success
    ).toBe(false);
    expect(
      createRecipeSchema.safeParse({
        ...baseRecipe,
        instructionsByLevel: { ...instructionsByLevel, expert: [] }
      }).success
    ).toBe(false);
  });
});
