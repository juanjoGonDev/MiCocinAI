import { z } from 'zod';
import { formDefault, formField, formPartial } from './form.js';

const aiProviderEnum = z.enum(['openai', 'custom']);
const detailLevelEnum = z.enum(['basic', 'intermediate', 'expert']);

// AI Config schemas
export const createAiConfigSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  provider: formDefault(aiProviderEnum, 'custom'),
  baseUrl: z.string().url('Invalid URL format'),
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().min(1, 'Model is required'),
  temperature: formDefault(z.number().min(0).max(2), 0.7),
  maxTokens: formDefault(z.number().int().positive().max(4096), 2000),
  topP: formField(z.number().min(0).max(1)),
  frequencyPenalty: formField(z.number().min(-2).max(2)),
  presencePenalty: formField(z.number().min(-2).max(2)),
  timeout: formDefault(z.number().int().positive().max(120000), 30000),
  retryAttempts: formDefault(z.number().int().min(0).max(5), 3)
});

export const updateAiConfigSchema = formPartial(createAiConfigSchema).extend({
  isActive: formField(z.boolean())
});

// Test connection schema
export const testConnectionSchema = z.object({
  configId: formField(z.string())
});

// Recipe generation schema
export const generateRecipeSchema = z.object({
  ingredients: z.array(z.object({
    id: z.string(),
    name: z.string(),
    quantity: z.number(),
    unit: z.string()
  })).min(1, 'At least one ingredient is required'),
  utensils: formDefault(z.array(z.object({
    id: z.string(),
    name: z.string(),
    available: z.boolean()
  })), []),
  servings: formDefault(z.number().int().positive().max(20), 4),
  difficulty: formDefault(z.enum(['easy', 'medium', 'hard']), 'medium'),
  detailLevel: formDefault(detailLevelEnum, 'intermediate'),
  dietaryRestrictions: formDefault(z.array(z.string()), []),
  allergies: formDefault(z.array(z.string()), []),
  preferences: formDefault(z.array(z.string()), []),
  cookingTime: formField(z.object({
    min: z.number().int().positive(),
    max: z.number().int().positive()
  })),
  generateMultiple: formDefault(z.boolean(), false),
  count: formDefault(z.number().int().min(1).max(5), 3)
});

// Weekly plan schema
export const generateWeeklyPlanSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // `goals` sigue obligatorio AQUI: sin objetivo no hay prompt que montar, y un plan «sin tipo» es
  // la IA adivinando. Lo que se relaja son sus huecos interiores (calorias, proteinas), que si son
  // opcionales de verdad.
  goals: z
    .object({
      type: z.string(),
      caloriesTarget: formField(z.number().positive()),
      proteinTarget: formField(z.number().positive()),
      restrictions: formDefault(z.array(z.string()), []),
      // El objetivo 'custom' del onboarding/planificador se escribe aqui. Zod recorta las claves
      // desconocidas: sin declararlo, la descripcion del usuario llegaba al front pero nunca al
      // prompt.
      customInstructions: formField(z.string().max(2000))
    })
    .passthrough(),
  availableIngredients: formDefault(z.array(z.string()), []),
  /**
   * Que comidas se piden («Desayuno, almuerzo, cena»). `formDefault` con la lista vacia: la UI manda
   * lo que la persona ha marcado y el servicio resuelve vacio = el dia completo (ver
   * `resolveMealTypes`), asi que un «no he marcado nada» no puede ser ni un 400 ni un plan vacio.
   */
  mealTypes: formDefault(z.array(z.string().max(20)).max(12), []),
  householdPreferences: formField(
    z.object({
      likes: formDefault(z.array(z.string()), []),
      dislikes: formDefault(z.array(z.string()), []),
      allergies: formDefault(z.array(z.string()), [])
    })
  )
});

// Recommendation schema
export const getRecommendationsSchema = z.object({
  recentMeals: formDefault(
    z.array(z.object({ date: z.string(), meal: z.string(), recipeId: formField(z.string()) })),
    []
  ),
  availableIngredients: formDefault(z.array(z.string()), []),
  householdPreferences: formField(
    z.object({
      likes: formDefault(z.array(z.string()), []),
      dislikes: formDefault(z.array(z.string()), []),
      allergies: formDefault(z.array(z.string()), [])
    })
  ),
  goals: formField(z.object({ type: z.string(), target: formField(z.number()) })),
  count: formDefault(z.number().int().min(1).max(10), 3)
});

export type CreateAiConfigInput = z.infer<typeof createAiConfigSchema>;
export type UpdateAiConfigInput = z.infer<typeof updateAiConfigSchema>;
export type TestConnectionInput = z.infer<typeof testConnectionSchema>;
export type GenerateRecipeInput = z.infer<typeof generateRecipeSchema>;
export type GenerateWeeklyPlanInput = z.infer<typeof generateWeeklyPlanSchema>;
export type GetRecommendationsInput = z.infer<typeof getRecommendationsSchema>;
