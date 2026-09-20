import { z } from 'zod';
import { formDefault, formField, formPartial } from './form.js';

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
  // `formField` alrededor del refine: la caducidad se QUITA vaciando la casilla, y un input de fecha
  // vacio manda `''`, que `Date.parse` leia como fecha invalida (400) en vez de «sin fecha».
  expirationDate: formField(
    z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Fecha no valida')
  ),
  location: formDefault(storageLocationEnum, 'pantry'),
  image: formField(z.string().url()),
  barcode: formField(z.string()),
  notes: formField(z.string().max(500))
});

// `formPartial` y no `.partial()`: ver el contrato en `form-contract.spec.ts` —un PATCH tiene que
// poder escribir `null` para quitar la foto o la nota, y `.partial()` lo rechaza.
export const updateIngredientSchema = formPartial(createIngredientSchema);

/**
 * Un flag pasado por la URL. `z.boolean()` a secas no sirve: la query siempre manda texto, y
 * el `?expiringSoon=true` que manda la pantalla de la despensa reventaba con un ZodError en
 * vez de filtrar — o sea, los dos unicos botones de filtro de la despensa no funcionaban.
 */
/**
 * Flag de consulta: `?expiringSoon=1`, `=true`, o el `''` que deja una URL compartida con el filtro
 * sin valor. El hueco vale «sin filtro», que NO es `false`: con `false` el listado excluye, y un
 * enlace guardado hace un mes no estaba excluyendo nada.
 */
export const queryFlag = z.preprocess(
  (value: unknown) => (value === '' || value === '   ' || value === null ? undefined : value),
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true' || value === '1'))
);

export const ingredientFilterSchema = z.object({
  search: formField(z.string()),
  category: formField(ingredientCategoryEnum),
  location: formField(storageLocationEnum),
  expiringSoon: queryFlag,
  expired: queryFlag,
  // Los query params llegan como string: hay que coercionarlos.
  page: formDefault(z.coerce.number().int().positive(), 1),
  pageSize: formDefault(z.coerce.number().int().positive().max(100), 20)
});

// Utensil schemas
export const createUtensilSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  category: utensilCategoryEnum,
  available: formDefault(z.boolean(), true),
  notes: formField(z.string().max(500))
});

export const updateUtensilSchema = formPartial(createUtensilSchema);

export const utensilFilterSchema = z.object({
  search: formField(z.string()),
  category: formField(utensilCategoryEnum),
  available: queryFlag
});

export type CreateIngredientInput = z.infer<typeof createIngredientSchema>;
export type UpdateIngredientInput = z.infer<typeof updateIngredientSchema>;
export type IngredientFilterInput = z.infer<typeof ingredientFilterSchema>;
export type CreateUtensilInput = z.infer<typeof createUtensilSchema>;
export type UpdateUtensilInput = z.infer<typeof updateUtensilSchema>;
export type UtensilFilterInput = z.infer<typeof utensilFilterSchema>;
