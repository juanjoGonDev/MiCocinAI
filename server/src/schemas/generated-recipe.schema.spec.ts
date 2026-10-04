import { describe, expect, it } from 'vitest';
import { generatedRecipeCandidateSchema } from './generated-recipe.schema.js';

const validCandidate = {
  name: 'Crema de zanahoria',
  description: 'Crema suave para dos personas.',
  difficulty: 'easy',
  cuisine: 'Mediterránea',
  totalTime: 20,
  prepTime: 5,
  cookTime: 15,
  restTime: null,
  servings: 2,
  calories: 180,
  ingredients: [
    {
      name: 'zanahoria',
      quantity: 2,
      unit: 'unit',
      preparation: null,
      isOptional: false,
      notes: null
    }
  ],
  utensils: ['olla'],
  instructionsByLevel: {
    basic: [
      {
        stepNumber: 1,
        instruction: 'Cocer la zanahoria.',
        duration: null,
        tips: null,
        warning: null
      }
    ],
    intermediate: [
      {
        stepNumber: 1,
        instruction: 'Cortar la zanahoria y cocerla hasta que esté tierna.',
        duration: null,
        tips: null,
        warning: null
      }
    ],
    expert: [
      {
        stepNumber: 1,
        instruction: 'Cortar dados uniformes y cocer a hervor suave hasta textura tierna.',
        duration: null,
        tips: null,
        warning: null
      }
    ]
  },
  nutrition: { calories: 180, protein: 2, carbs: 20, fat: 5, fiber: 4 },
  storage: {
    method: 'Refrigerada',
    duration: '2 días',
    reheating: 'Calentar',
    container: null,
    freezingPossible: false,
    freezingDuration: null
  },
  tags: ['vegetariana']
};

describe('generatedRecipeCandidateSchema', () => {
  it('acepta una receta completa con los tres niveles de instrucciones', () => {
    expect(generatedRecipeCandidateSchema.parse(validCandidate)).toMatchObject(validCandidate);
  });

  it('rechaza niveles ausentes, listas vacías y pasos desordenados', () => {
    expect(
      generatedRecipeCandidateSchema.safeParse({
        ...validCandidate,
        instructionsByLevel: { basic: validCandidate.instructionsByLevel.basic }
      }).success
    ).toBe(false);
    expect(
      generatedRecipeCandidateSchema.safeParse({
        ...validCandidate,
        instructionsByLevel: {
          ...validCandidate.instructionsByLevel,
          expert: []
        }
      }).success
    ).toBe(false);
    expect(
      generatedRecipeCandidateSchema.safeParse({
        ...validCandidate,
        instructionsByLevel: {
          ...validCandidate.instructionsByLevel,
          intermediate: [
            {
              stepNumber: 2,
              instruction: 'Segundo paso.',
              duration: null,
              tips: null,
              warning: null
            },
            {
              stepNumber: 1,
              instruction: 'Primer paso.',
              duration: null,
              tips: null,
              warning: null
            }
          ]
        }
      }).success
    ).toBe(false);
  });

  it('rechaza una lista duplicada de pasos o niveles no admitidos', () => {
    expect(
      generatedRecipeCandidateSchema.safeParse({
        ...validCandidate,
        steps: validCandidate.instructionsByLevel.basic
      }).success
    ).toBe(false);
    expect(
      generatedRecipeCandidateSchema.safeParse({
        ...validCandidate,
        instructionsByLevel: {
          ...validCandidate.instructionsByLevel,
          novice: validCandidate.instructionsByLevel.basic
        }
      }).success
    ).toBe(false);
  });
});
