import { z } from 'zod';

const mealTypeEnum = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
const goalTypeEnum = z.enum([
  'balanced', 'weight-loss', 'weight-gain', 'muscle-gain', 'maintenance', 'variety', 'custom'
]);
const goalFrequencyEnum = z.enum(['daily', 'weekly']);

const customGoalSchema = z.object({
  name: z.string().min(1).max(100),
  target: z.number().positive(),
  unit: z.string().max(20),
  frequency: goalFrequencyEnum.default('daily')
});

const nutritionalGoalsSchema = z.object({
  type: goalTypeEnum.default('balanced'),
  dailyCalories: z.number().positive().optional(),
  dailyProtein: z.number().positive().optional(),
  dailyCarbs: z.number().positive().optional(),
  dailyFat: z.number().positive().optional(),
  restrictions: z.array(z.string()).optional().default([]),
  customGoals: z.array(customGoalSchema).optional().default([])
});

const mealSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
  mealType: mealTypeEnum,
  recipeId: z.string().optional().nullable(),
  customMeal: z.string().max(200).optional().nullable(),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:mm format').optional().nullable(),
  servings: z.number().int().positive().default(1),
  notes: z.string().max(500).optional().nullable()
});

// Calendar schemas
export const createCalendarSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  goals: nutritionalGoalsSchema.optional()
});

export const updateCalendarSchema = z.object({
  goals: nutritionalGoalsSchema.optional()
});

export const addMealSchema = mealSchema;

export const updateMealSchema = z.object({
  recipeId: z.string().optional().nullable(),
  customMeal: z.string().max(200).optional().nullable(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  servings: z.number().int().positive().optional(),
  notes: z.string().max(500).optional().nullable(),
  completed: z.boolean().optional()
});

export const completeMealSchema = z.object({
  completed: z.boolean()
});

export const calendarFilterSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export const updateGoalsSchema = nutritionalGoalsSchema;

export type CreateCalendarInput = z.infer<typeof createCalendarSchema>;
export type UpdateCalendarInput = z.infer<typeof updateCalendarSchema>;
export type AddMealInput = z.infer<typeof addMealSchema>;
export type UpdateMealInput = z.infer<typeof updateMealSchema>;
export type CompleteMealInput = z.infer<typeof completeMealSchema>;
export type CalendarFilterInput = z.infer<typeof calendarFilterSchema>;
export type UpdateGoalsInput = z.infer<typeof updateGoalsSchema>;
