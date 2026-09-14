import { z } from 'zod';

const difficultyEnum = z.enum(['easy', 'medium', 'hard']);
const mealTypeEnum = z.enum(['breakfast', 'brunch', 'lunch', 'snack', 'dinner', 'dessert']);
const measurementUnitEnum = z.enum([
  'g', 'kg', 'ml', 'l', 'cup', 'tbsp', 'tsp', 'unit', 'bunch', 'slice', 'piece'
]);

const recipeIngredientSchema = z.object({
  ingredientId: z.string().optional().nullable(),
  name: z.string().min(1),
  quantity: z.number().positive(),
  unit: measurementUnitEnum,
  preparation: z.string().optional().nullable(),
  isOptional: z.boolean().default(false),
  substitutes: z.array(z.string()).optional().default([]),
  notes: z.string().optional().nullable()
});

const temperatureSchema = z.object({
  value: z.number(),
  unit: z.enum(['C', 'F'])
});

const recipeStepSchema = z.object({
  stepNumber: z.number().int().positive(),
  instruction: z.string().min(1),
  duration: z.number().int().positive().optional().nullable(),
  temperature: temperatureSchema.optional().nullable(),
  timerRequired: z.boolean().default(false),
  timerDuration: z.number().int().positive().optional().nullable(),
  tips: z.string().optional().nullable(),
  warning: z.string().optional().nullable(),
  image: z.string().url().optional().nullable()
});

const nutritionInfoSchema = z.object({
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  fiber: z.number().optional(),
  sugar: z.number().optional(),
  sodium: z.number().optional()
});

const storageInfoSchema = z.object({
  method: z.string(),
  container: z.string(),
  duration: z.string(),
  reheatingInstructions: z.string().optional().nullable(),
  freezingPossible: z.boolean().default(false),
  freezingDuration: z.string().optional().nullable()
});

// Create recipe schema
export const createRecipeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).optional().nullable(),
  difficulty: difficultyEnum.default('medium'),
  cuisine: z.string().max(50).optional().nullable(),
  mealType: z.array(mealTypeEnum).optional().default([]),
  totalTime: z.number().int().positive().optional().nullable(),
  prepTime: z.number().int().positive().optional().nullable(),
  cookTime: z.number().int().positive().optional().nullable(),
  restTime: z.number().int().positive().optional().nullable(),
  servings: z.number().int().positive().default(4),
  calories: z.number().positive().optional().nullable(),
  image: z.string().url().optional().nullable(),
  ingredients: z.array(recipeIngredientSchema).min(1, 'At least one ingredient is required'),
  utensils: z.array(z.string()).optional().default([]),
  steps: z.array(recipeStepSchema).min(1, 'At least one step is required'),
  nutrition: nutritionInfoSchema.optional().nullable(),
  storage: storageInfoSchema.optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
  isPublic: z.boolean().optional().default(false)
});

// Update recipe schema
export const updateRecipeSchema = createRecipeSchema.partial().extend({
  isFavorite: z.boolean().optional()
});

// Recipe filter schema
export const recipeFilterSchema = z.object({
  search: z.string().optional(),
  difficulty: difficultyEnum.optional(),
  mealType: mealTypeEnum.optional(),
  maxTime: z.number().int().positive().optional(),
  cuisine: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isFavorite: z.boolean().optional(),
  author: z.enum(['ai', 'user']).optional(),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().positive().max(100).optional().default(20),
  sortBy: z.enum(['name', 'difficulty', 'totalTime', 'rating', 'createdAt']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
});

// Adjust servings schema
export const adjustServingsSchema = z.object({
  servings: z.number().int().positive().max(20)
});

export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;
export type RecipeFilterInput = z.infer<typeof recipeFilterSchema>;
export type AdjustServingsInput = z.infer<typeof adjustServingsSchema>;
