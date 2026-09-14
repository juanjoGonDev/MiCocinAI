import { z } from 'zod';

const aiProviderEnum = z.enum(['openai', 'custom']);
const detailLevelEnum = z.enum(['basic', 'intermediate', 'expert']);

// AI Config schemas
export const createAiConfigSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  provider: aiProviderEnum.default('custom'),
  baseUrl: z.string().url('Invalid URL format'),
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().min(1, 'Model is required'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().max(4096).default(2000),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  timeout: z.number().int().positive().max(120000).default(30000),
  retryAttempts: z.number().int().min(0).max(5).default(3)
});

export const updateAiConfigSchema = createAiConfigSchema.partial().extend({
  isActive: z.boolean().optional()
});

// Test connection schema
export const testConnectionSchema = z.object({
  configId: z.string().optional()
});

// Recipe generation schema
export const generateRecipeSchema = z.object({
  ingredients: z.array(z.object({
    id: z.string(),
    name: z.string(),
    quantity: z.number(),
    unit: z.string()
  })).min(1, 'At least one ingredient is required'),
  utensils: z.array(z.object({
    id: z.string(),
    name: z.string(),
    available: z.boolean()
  })).optional().default([]),
  servings: z.number().int().positive().max(20).default(4),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  detailLevel: detailLevelEnum.default('intermediate'),
  dietaryRestrictions: z.array(z.string()).optional().default([]),
  allergies: z.array(z.string()).optional().default([]),
  preferences: z.array(z.string()).optional().default([]),
  cookingTime: z.object({
    min: z.number().int().positive(),
    max: z.number().int().positive()
  }).optional(),
  generateMultiple: z.boolean().default(false),
  count: z.number().int().min(1).max(5).default(3)
});

// Weekly plan schema
export const generateWeeklyPlanSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  goals: z.object({
    type: z.string(),
    caloriesTarget: z.number().positive().optional(),
    proteinTarget: z.number().positive().optional(),
    restrictions: z.array(z.string()).optional().default([])
  }),
  availableIngredients: z.array(z.string()).optional().default([]),
  householdPreferences: z.object({
    likes: z.array(z.string()).optional().default([]),
    dislikes: z.array(z.string()).optional().default([]),
    allergies: z.array(z.string()).optional().default([])
  }).optional()
});

// Recommendation schema
export const getRecommendationsSchema = z.object({
  recentMeals: z.array(z.object({
    date: z.string(),
    meal: z.string(),
    recipeId: z.string().optional()
  })).optional().default([]),
  availableIngredients: z.array(z.string()).optional().default([]),
  householdPreferences: z.object({
    likes: z.array(z.string()).optional().default([]),
    dislikes: z.array(z.string()).optional().default([]),
    allergies: z.array(z.string()).optional().default([])
  }).optional(),
  goals: z.object({
    type: z.string(),
    target: z.number().optional()
  }).optional(),
  count: z.number().int().min(1).max(10).default(3)
});

export type CreateAiConfigInput = z.infer<typeof createAiConfigSchema>;
export type UpdateAiConfigInput = z.infer<typeof updateAiConfigSchema>;
export type TestConnectionInput = z.infer<typeof testConnectionSchema>;
export type GenerateRecipeInput = z.infer<typeof generateRecipeSchema>;
export type GenerateWeeklyPlanInput = z.infer<typeof generateWeeklyPlanSchema>;
export type GetRecommendationsInput = z.infer<typeof getRecommendationsSchema>;
