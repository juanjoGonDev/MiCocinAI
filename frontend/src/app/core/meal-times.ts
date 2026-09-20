import { MEAL_ORDER, MealType } from '../shared/models/calendar.model';
import { MEAL_ANCHOR_MINUTES, minutesFromTime } from './calendar-grid';

/**
 * Las horas a las que come esta casa.
 *
 * Un ajuste, no una constante: el usuario las dice en el tour o en Preferencias (Desayuno 09:00,
 * Almuerzo 14:00, Merienda 17:00, Cena 20:30 por defecto) y las cambia cuando quiere. Que vivan aqui
 * y no dentro del componente es lo que permite que las tres cosas que dependen de ellas —donde se
 * coloca una comida sin hora en la rejilla, con que hora nace una comida nueva y a que hora le pide
 * comer la IA— hablen del mismo reloj.
 *
 * Es el espejo del `MEAL_TIME_DEFAULTS` del server. Un espejo con test
 * (`server/src/utils/meal-times-mirror.spec.ts`), no una promesa: si manana cena pasa a las 21:00 en
 * un lado y sigue a las 20:30 en el otro, la app pintaria una hora y la IA planificaria otra, y eso no
 * lo ve nadie hasta que alguien cena a las 20:30 mirando una rejilla que decia otra cosa.
 */
export const MEAL_TIME_DEFAULTS: Record<MealType, string> = {
  breakfast: '09:00',
  lunch: '14:00',
  snack: '17:00',
  dinner: '20:30'
};

export type MealTimes = Record<MealType, string>;

/**
 * Lo que hay en la respuesta de la API (o en un JSON viejo) convertido en horas completas.
 *
 * Defensivo a proposito: la API ya responde `HH:MM` o el defecto, pero este estado también lo pinta
 * un formulario y lo lee un JSON escrito a mano. Una hora ilegible no puede dar `NaN` en la rejilla;
 * se cae al defecto, que es lo que el usuario veria si no hubiera tocado nunca el ajuste.
 */
export function resolveMealTimes(stored: unknown): MealTimes {
  const raw = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  const times: MealTimes = { ...MEAL_TIME_DEFAULTS };
  for (const type of MEAL_ORDER) {
    const value = typeof raw[type] === 'string' ? raw[type] : null;
    if (minutesFromTime(value) !== null) times[type] = String(value).trim();
  }
  return times;
}

/**
 * Donde se sienta cada comida en la rejilla, en minutos del dia.
 *
 * Lo que la rejilla necesita son minutos; lo que la gente escribe son horas. Aqui esta la traduccion,
 * y aqui esta tambien el unico sitio donde el ancla de `calendar-grid` sigue teniendo sentido: si la
 * preferencia no ha llegado todavia (primera pasada, o sin sesion), la rejilla pinta con sus anclas en
 * vez de apilarlo todo en la medianoche.
 */
export function mealAnchors(times?: Partial<MealTimes> | null): Record<MealType, number> {
  const anchors = {} as Record<MealType, number>;
  for (const type of MEAL_ORDER) {
    const minutes = minutesFromTime(times?.[type]);
    anchors[type] = minutes ?? MEAL_ANCHOR_MINUTES[type];
  }
  return anchors;
}

/** La hora con la que nace una comida nueva de este tipo (el campo se puede vaciar despues). */
export function mealTimeOf(times: Partial<MealTimes> | null | undefined, type: MealType): string {
  return times?.[type] ?? MEAL_TIME_DEFAULTS[type];
}

/**
 * Que comidas pedirle a la IA.
 *
 * Marcar ninguna no significa «no quiero plan», significa «el dia entero»: el mismo acuerdo que aplica
 * el server (`resolveMealTypes`), para que el chat de la IA y el plan que se guarda no discrepen de lo
 * que se pidio. El orden devuelto es el del dia, no el de los clicks, porque ese orden es el que se
 * escribe en el prompt.
 */
export function selectedMealTypes(selected: readonly string[] | null | undefined): MealType[] {
  if (!selected || selected.length === 0) return [...MEAL_ORDER];
  const picked = new Set(selected);
  const valid = MEAL_ORDER.filter((type) => picked.has(type));
  return valid.length > 0 ? valid : [...MEAL_ORDER];
}

/** `HH:MM` -> minutos del dia, para comparar o para el `title` de un bloque. `null` si no es una hora. */
export function mealTimeToMinutes(time: string | null | undefined): number | null {
  return minutesFromTime(time);
}
