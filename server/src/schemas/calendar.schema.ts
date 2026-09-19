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

/**
 * Sueltas del calendario de la casa (HOGARIA-SPEC §8f). `meal` esta en la lista de
 * tipos pero NO se puede crear por aqui: la comida la manda el plan semanal, y si
 * existiera una fila suelta por plato habria dos verdades que se desincronizan en
 * cuanto alguien cambie la cena.
 */
export const CALENDAR_EVENT_KINDS = ['meal', 'shopping', 'home', 'appointment', 'personal', 'other'] as const;
export type CalendarEventKind = (typeof CALENDAR_EVENT_KINDS)[number];
const eventKindEnum = z.enum(CALENDAR_EVENT_KINDS);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora debe ser HH:MM');
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color debe ser #rrggbb');
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const calendarEventFilterSchema = z.object({
  from: z.string().regex(dateRe, 'Fecha debe ser AAAA-MM-DD'),
  to: z.string().regex(dateRe, 'Fecha debe ser AAAA-MM-DD'),
  // Coma de tipos. Un tipo que no existe se ignora en vez de reventar: es un filtro, no
  // una escritura, y lo que se pide al cambiar de pestaña es "ensename lo que sepas".
  kinds: z
    .string()
    .optional()
    .transform((value) =>
      !value
        ? ([] as CalendarEventKind[])
        : value
            .split(',')
            .map((kind) => kind.trim())
            .filter((kind): kind is CalendarEventKind =>
              (CALENDAR_EVENT_KINDS as readonly string[]).includes(kind)
            )
    ),
  limit: z.coerce.number().int().min(1).max(500).catch(200)
});

/** Campos, sin el refine cruzado: asi el PATCH puede reutilizarlos con `.omit()`. */
const calendarEventFields = z.object({
    title: z.string().trim().min(1, 'Titulo requerido').max(120),
    kind: eventKindEnum.default('other'),
    date: z.string().regex(dateRe, 'Fecha debe ser AAAA-MM-DD'),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    allDay: z.union([z.coerce.number().int().min(0).max(1), z.boolean()]).optional(),
    color: hexColor.optional(),
    notes: z.string().trim().max(500).optional(),
    location: z.string().trim().max(120).optional(),
    sharedWithHousehold: z.boolean().optional()
});

// OJO: `.omit()` de zod 4 no puede usarse sobre un objeto con `.refine()` — por eso las
// horas se validan aparte (`compareEventTimes`) y el schema de arriba queda limpio.
function compareEventTimes(value: { startTime?: string; endTime?: string }): boolean {
  return !value.startTime || !value.endTime || value.startTime <= value.endTime;
}

export const createCalendarEventSchema = calendarEventFields.superRefine((value, ctx) => {
  if (!compareEventTimes(value)) {
    ctx.addIssue({ code: 'custom', message: 'endTime no puede ser anterior a startTime', path: ['endTime'] });
  }
});

export const updateCalendarEventSchema = calendarEventFields
  .omit({ sharedWithHousehold: true })
  .partial()
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Nada que actualizar' });
    }
    if (!compareEventTimes(value)) {
      ctx.addIssue({ code: 'custom', message: 'endTime no puede ser anterior a startTime', path: ['endTime'] });
    }
  });

export type CalendarEventFilter = z.infer<typeof calendarEventFilterSchema>;
export type CreateCalendarEvent = z.infer<typeof createCalendarEventSchema>;
