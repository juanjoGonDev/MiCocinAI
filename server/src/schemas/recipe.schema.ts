import { z } from 'zod';
import { formDefault, formField, formPartial } from './form.js';

const difficultyEnum = z.enum(['easy', 'medium', 'hard']);
const mealTypeEnum = z.enum(['breakfast', 'brunch', 'lunch', 'snack', 'dinner', 'dessert']);
const measurementUnitEnum = z.enum([
  'g', 'kg', 'ml', 'l', 'cup', 'tbsp', 'tsp', 'unit', 'bunch', 'slice', 'piece'
]);

const recipeIngredientSchema = z.object({
  ingredientId: formField(z.string()),
  name: z.string().min(1),
  quantity: z.number().positive(),
  unit: measurementUnitEnum,
  preparation: formField(z.string()),
  isOptional: formDefault(z.boolean(), false),
  substitutes: formDefault(z.array(z.string()), []),
  notes: formField(z.string())
});

const temperatureSchema = z.object({
  value: z.number(),
  unit: z.enum(['C', 'F'])
});

const recipeStepSchema = z.object({
  stepNumber: z.number().int().positive(),
  instruction: z.string().min(1),
  duration: formField(z.number().int().positive()),
  temperature: formField(temperatureSchema),
  timerRequired: formDefault(z.boolean(), false),
  timerDuration: formField(z.number().int().positive()),
  tips: formField(z.string()),
  warning: formField(z.string()),
  image: formField(z.string().url())
});

const nutritionInfoSchema = z.object({
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  fiber: formField(z.number()),
  sugar: formField(z.number()),
  sodium: formField(z.number())
});

const storageInfoSchema = z.object({
  method: z.string(),
  container: z.string(),
  duration: z.string(),
  reheatingInstructions: formField(z.string()),
  freezingPossible: formDefault(z.boolean(), false),
  freezingDuration: formField(z.string())
});

// Create recipe schema
export const createRecipeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: formField(z.string().max(1000)),
  difficulty: formDefault(difficultyEnum, 'medium'),
  cuisine: formField(z.string().max(50)),
  mealType: formDefault(z.array(mealTypeEnum), []),
  totalTime: formField(z.number().int().positive()),
  prepTime: formField(z.number().int().positive()),
  cookTime: formField(z.number().int().positive()),
  restTime: formField(z.number().int().positive()),
  servings: formDefault(z.number().int().positive(), 4),
  calories: formField(z.number().positive()),
  image: formField(z.string().url()),
  ingredients: z.array(recipeIngredientSchema).min(1, 'At least one ingredient is required'),
  utensils: formDefault(z.array(z.string()), []),
  steps: z.array(recipeStepSchema).min(1, 'At least one step is required'),
  nutrition: formField(nutritionInfoSchema),
  storage: formField(storageInfoSchema),
  tags: formDefault(z.array(z.string()), []),
  isPublic: formDefault(z.boolean(), false)
});

// Update recipe schema
export const updateRecipeSchema = formPartial(createRecipeSchema).extend({
  isFavorite: formField(z.boolean())
});

// Recipe filter schema
export const recipeFilterSchema = z.object({
  search: formField(z.string()),
  difficulty: formField(difficultyEnum),
  mealType: formField(mealTypeEnum),
  maxTime: formField(z.number().int().positive()),
  cuisine: formField(z.string()),
  tags: formField(z.array(z.string())),
  isFavorite: formField(z.boolean()),
  author: formField(z.enum(['ai', 'user'])),
  page: formDefault(z.number().int().positive(), 1),
  pageSize: formDefault(z.number().int().positive().max(100), 20),
  sortBy: formDefault(z.enum(['name', 'difficulty', 'totalTime', 'rating', 'createdAt']), 'createdAt'),
  sortOrder: formDefault(z.enum(['asc', 'desc']), 'desc')
});

// Adjust servings schema
export const adjustServingsSchema = z.object({
  servings: z.number().int().positive().max(20)
});

export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;
export type RecipeFilterInput = z.infer<typeof recipeFilterSchema>;
export type AdjustServingsInput = z.infer<typeof adjustServingsSchema>;
