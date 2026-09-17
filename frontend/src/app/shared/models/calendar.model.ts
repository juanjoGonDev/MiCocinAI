export interface WeeklyCalendar {
  id: string;
  householdId: string;
  weekStart: Date;
  weekEnd: Date;
  days: DayPlan[];
  goals: NutritionalGoals;
  generatedBy: GenerationType;
  createdAt: Date;
  updatedAt: Date;
}

export interface DayPlan {
  date: Date;
  dayOfWeek: DayOfWeek;
  meals: Meal[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  notes?: string;
}

export interface Meal {
  id: string;
  type: MealType;
  recipeId?: string;
  recipeName?: string;
  customMeal?: string;
  time?: string;
  servings: number;
  notes?: string;
  completed: boolean;
  completedAt?: Date;
}

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type GenerationType = 'user' | 'ai';

export interface NutritionalGoals {
  type: GoalType;
  dailyCalories?: number;
  dailyProtein?: number;
  dailyCarbs?: number;
  dailyFat?: number;
  restrictions: string[];
  customGoals?: CustomGoal[];
}

export type GoalType =
  | 'balanced'
  | 'weight-loss'
  | 'weight-gain'
  | 'muscle-gain'
  | 'maintenance'
  | 'variety'
  | 'custom';

export interface CustomGoal {
  name: string;
  target: number;
  unit: string;
  frequency: GoalFrequency;
}

export type GoalFrequency = 'daily' | 'weekly';

export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo'
};

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Desayuno',
  lunch: 'Almuerzo',
  dinner: 'Cena',
  snack: 'Merienda'
};

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  balanced: 'Dieta equilibrada',
  'weight-loss': 'Perder peso',
  'weight-gain': 'Ganar peso',
  'muscle-gain': 'Ganar músculo',
  maintenance: 'Mantenimiento',
  variety: 'Comida variada',
  custom: 'Personalizado'
};

export const DAY_ORDER: DayOfWeek[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
];

export const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/* ═══════════════════════════════════════════════════════════════════════
   Modelo de vistas del calendario (mes / semana / día)
   ═══════════════════════════════════════════════════════════════════════ */

/** Vista activa del calendario. `week` es la por defecto y la que no sale en la URL. */
export type CalendarView = 'day' | 'week' | 'month';

export const CALENDAR_VIEWS = ['day', 'week', 'month'] as const;
export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = {
  day: 'Día',
  week: 'Semana',
  month: 'Mes'
};

/** Query params que definen lo que se está viendo. */
export const CALENDAR_VIEW_PARAM = 'view';
export const CALENDAR_DATE_PARAM = 'date';

/**
 * Comida ya normalizada desde la fila cruda de la API (`snake_case`).
 * `title` resuelve la receta o lo que el usuario escribió a mano: las vistas
 * no deberían volver a preguntar por ninguna de las dos columnas.
 */
export interface CalendarMeal {
  id: string;
  date: string;
  mealType: MealType;
  title: string;
  recipeId?: string | null;
  customMeal?: string | null;
  time?: string | null;
  servings: number;
  notes?: string | null;
  completed: boolean;
  /** Calorías de la receta (por ración), si el plato viene del recetario. */
  calories?: number | null;
}

/** Un día tal y como lo consume una vista: fecha + sus comidas + resumen. */
export interface CalendarDay {
  date: Date;
  iso: string;
  /** false en las celdas de mes que pertenecen al mes anterior/siguiente. */
  inCurrentMonth: boolean;
  isToday: boolean;
  meals: CalendarMeal[];
  calories: number;
  /** true si alguna comida del día trae datos nutricionales. */
  hasNutrition: boolean;
}

/** Cómo se pinta cada tipo de comida: color por tipo, como en Google Calendar. */
export interface MealTypeMeta {
  label: string;
  /** Texto del hueco vacío, para no escribir «Agregar» cuatro veces. */
  addAction: string;
}

export const MEAL_TYPE_META: Record<MealType, MealTypeMeta> = {
  breakfast: { label: 'Desayuno', addAction: 'Desayuno' },
  lunch: { label: 'Almuerzo', addAction: 'Almuerzo' },
  dinner: { label: 'Cena', addAction: 'Cena' },
  snack: { label: 'Merienda', addAction: 'Merienda' }
};

/**
 * Día ya preparado para pintar: las comidas repartidas por franja, para que las
 * vistas no llamen a funciones en el template (una por celda y por detección de
 * cambios) y el `trackBy` sea estable.
 */
export interface CalendarDayView extends CalendarDay {
  slots: Record<MealType, CalendarMeal[]>;
  planned: number;
  done: number;
}
