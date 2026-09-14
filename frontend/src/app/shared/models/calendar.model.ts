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
