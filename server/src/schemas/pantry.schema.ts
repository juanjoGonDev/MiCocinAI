import { z } from 'zod';

const measurementUnitEnum = z.enum([
  'g', 'kg', 'ml', 'l', 'cup', 'tbsp', 'tsp', 'unit', 'bunch', 'slice', 'piece'
]);

const ingredientCategoryEnum = z.enum([
  'dairy', 'meat', 'fish', 'vegetables', 'fruits', 'grains',
  'spices', 'condiments', 'frozen', 'canned', 'beverages', 'other'
]);

const storageLocationEnum = z.enum(['fridge', 'freezer', 'pantry', 'counter']);

const utensilCategoryEnum = z.enum([
  'oven', 'microwave', 'airfryer', 'stovetop', 'blender', 'mixer',
  'food-processor', 'cookware', 'bakeware', 'tools'
]);

// Ingredient schemas
export const createIngredientSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  category: ingredientCategoryEnum,
  quantity: z.number().positive('Quantity must be positive'),
  unit: measurementUnitEnum,
  expirationDate: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date')
    .optional()
    .nullable(),
  location: storageLocationEnum.default('pantry'),
  image: z.string().url().optional().nullable(),
  barcode: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable()
});

export const updateIngredientSchema = createIngredientSchema.partial();

export const ingredientFilterSchema = z.object({
  search: z.string().optional(),
  category: ingredientCategoryEnum.optional(),
  location: storageLocationEnum.optional(),
  expiringSoon: z.boolean().optional(),
  expired: z.boolean().optional(),
  // Los query params llegan como string: hay que coercionarlos.
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20)
});

// Utensil schemas
export const createUtensilSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  category: utensilCategoryEnum,
  available: z.boolean().default(true),
  notes: z.string().max(500).optional().nullable()
});

export const updateUtensilSchema = createUtensilSchema.partial();

export const utensilFilterSchema = z.object({
  search: z.string().optional(),
  category: utensilCategoryEnum.optional(),
  available: z.boolean().optional()
});

export type CreateIngredientInput = z.infer<typeof createIngredientSchema>;
export type UpdateIngredientInput = z.infer<typeof updateIngredientSchema>;
export type IngredientFilterInput = z.infer<typeof ingredientFilterSchema>;
export type CreateUtensilInput = z.infer<typeof createUtensilSchema>;
export type UpdateUtensilInput = z.infer<typeof updateUtensilSchema>;
export type UtensilFilterInput = z.infer<typeof utensilFilterSchema>;
