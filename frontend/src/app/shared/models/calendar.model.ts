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

/**
 * A qué hora come esta casa, por defecto. Aqui y no en `core/meal-times.ts` porque tambien la necesita
 * `app-meal-hours` (un componente del design system, que no importa de `core/`), y porque es el mismo
 * dato que responde el server cuando no hay nada guardado: una copia por pantalla es una copia de mas.
 * El espejo con el server lo vigila `server/src/utils/meal-times-mirror.spec.ts`.
 */
export const MEAL_TIME_DEFAULTS: Record<MealType, string> = {
  breakfast: '09:00',
  lunch: '14:00',
  snack: '17:00',
  dinner: '20:30'
};

/** Horas de la casa, siempre completas: lo que no esta escrito es el defecto, no un hueco. */
export type MealTimes = Record<MealType, string>;

/**
 * El orden del día español: desayuno, almuerzo, merienda, cena. Estuvo al revés (cena antes que
 * merienda) desde la primera version, y no era un detalle de etiqueta: es la clave con la que se
 * ordenan la rejilla, el mes y las filas que escribe la IA, asi que ahi se leia una cena a media
 * tarde. La convenciones de hora viven en `calendar-grid.ts`, y siguen este mismo orden.
 */
export const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

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
  /**
   * El acento del tipo. Es un `var()` y no un hex, y por eso puede vivir en el modelo: lo que hace
   * legible una rejilla de 40 celdas es que «desayuno» sea siempre el mismo color, y ese color tiene
   * que cambiar con el tema. Un hex aqui seria un segundo tema que la hoja de estilos no alcanza.
   */
  color: string;
  /** Texto del hueco vacío, para no escribir «Agregar» cuatro veces. */
  addAction: string;
}

export const MEAL_TYPE_META: Record<MealType, MealTypeMeta> = {
  breakfast: { label: 'Desayuno', addAction: 'Desayuno', color: 'var(--warning)' },
  lunch: { label: 'Almuerzo', addAction: 'Almuerzo', color: 'var(--primary)' },
  snack: { label: 'Merienda', addAction: 'Merienda', color: 'var(--secondary)' },
  dinner: { label: 'Cena', addAction: 'Cena', color: 'var(--info)' }
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
  /** Sueltas de la casa del mismo día (HOGARIA-SPEC §8f), ya filtradas por capas. */
  events: HouseholdEvent[];
}

/**
 * Las otras cosas de la casa (HOGARIA-SPEC §8f). Las comidas NO son un tipo de aqui
 * abajo: vienen del plan semanal y se proyectan, para que no haya dos verdades sobre lo
 * que se cena. Por eso `meal` no tiene META propia: es una CAPA visible, no un evento.
 */
export const HOUSEHOLD_EVENT_KINDS = ['shopping', 'home', 'appointment', 'personal', 'other'] as const;
export type HouseholdEventKind = (typeof HOUSEHOLD_EVENT_KINDS)[number];

/** Quien esta invitado a una suelta: nombre y foto, como en todo lo que es identidad. */
export interface EventAttendee {
  id: string;
  name: string;
  avatar?: string | null;
}

export interface HouseholdEvent {
  id: string;
  title: string;
  kind: HouseholdEventKind;
  date: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  color: string | null;
  notes: string | null;
  location: string | null;
  source: string;
  userId: string;
  authorName: string | null;
  /** La foto del autor, si la tiene. El nombre se congelo al escribir; la foto es la de hoy. */
  authorAvatar?: string | null;
  editable: boolean;
  /**
   * Quien mas entra en el evento (HOGARIA-SPEC 12o). Viene del servidor con la lista ya resuelta, y
   * `attendeeIds` es lo que el dialog tiene que volver a marcar al editar: sin las dos, o se pintan
   * caras sin seleccion o se pierde a alguien al guardar.
   */
  attendees?: EventAttendee[];
  attendeeIds?: string[];
}

export const HOUSEHOLD_EVENT_META: Record<
  HouseholdEventKind,
  { label: string; color: string; icon: 'shopping_cart' | 'home' | 'event_available' | 'person' | 'flag' }
> = {
  shopping: { label: 'Compra', color: '#4FA3D1', icon: 'shopping_cart' },
  home: { label: 'Casa', color: '#4CAF50', icon: 'home' },
  appointment: { label: 'Citas', color: '#E05A5A', icon: 'event_available' },
  personal: { label: 'Personal', color: '#8E5AC8', icon: 'person' },
  other: { label: 'Otros', color: '#8A8F98', icon: 'flag' }
};

export const HOUSEHOLD_EVENT_COLORS = ['#4FA3D1', '#4CAF50', '#E05A5A', '#8E5AC8', '#C99A2E', '#2FA79B'];

export function eventTimeLabel(event: HouseholdEvent): string {
  if (event.allDay || !event.startTime) return '';
  return event.endTime ? `${event.startTime}–${event.endTime}` : event.startTime;
}
