import { nanoid } from 'nanoid';
import { ensureWeekCalendar, toUTCISO, utcDate, weekStartOf } from './week-calendar.js';

/**
 * Guardar el plan que devuelve la IA en el calendario de la semana pedida.
 *
 * `POST /api/ai/plan-week` generaba el plan y lo devolvía tal cual: la interfaz
 * decía «¡Plan generado!» y la rejilla seguía vacía, porque nadie escribía nada.
 * Aquí se insertan las comidas, con dos reglas:
 *
 *  - **Rellena huecos, no pisa lo tuyo.** Si en ese día ya hay algo para esa
 *    comida, se respeta y se omite el sugerido.
 *  - **Nada fuera de la semana pedida.** La respuesta de la IA es texto libre:
 *    solo se guardan fechas válidas dentro del rango solicitado.
 */

type SqlDb = import('better-sqlite3').Database;

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export interface PersistWeeklyPlanInput {
  userId: string;
  /** YYYY-MM-DD, inclusive. */
  startDate: string;
  endDate: string;
  goals?: {
    type?: string;
    caloriesTarget?: number;
    restrictions?: string[];
  };
  /** Lo que devolvió el modelo: se valida aquí, nunca se da por bueno. */
  plan: unknown;
}

export interface PersistWeeklyPlanResult {
  /** Comidas insertadas. */
  created: number;
  /** Huecos que ya estaban ocupados y se han dejado intactos. */
  skipped: number;
  weekStart: string;
  calendarId: string;
}

function clamp(text: string, max: number): string {
  const clean = text.trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function mealName(value: unknown): string | null {
  // La IA a veces devuelve un string suelto en lugar del objeto {name, ingredients}.
  if (typeof value === 'string') return value.trim() ? clamp(value, 200) : null;
  const record = asRecord(value);
  if (!record || typeof record.name !== 'string') return null;
  const name = record.name.trim();
  return name ? clamp(name, 200) : null;
}

function mealNotes(value: unknown): string | null {
  const record = asRecord(value);
  const ingredients = record && Array.isArray(record.ingredients) ? record.ingredients : [];
  const names = ingredients
    .map((item) => (typeof item === 'string' ? item : (asRecord(item)?.name as string) ?? ''))
    .map((item) => item.trim())
    .filter(Boolean);
  return names.length ? clamp(`Ingredientes: ${names.join(', ')}`, 500) : null;
}

export function persistWeeklyPlan(
  db: SqlDb,
  input: PersistWeeklyPlanInput
): PersistWeeklyPlanResult {
  const start = utcDate(input.startDate);
  const end = utcDate(input.endDate);
  const weekStart = weekStartOf(input.startDate);
  if (!weekStart) return { created: 0, skipped: 0, weekStart: '', calendarId: '' };

  const result: PersistWeeklyPlanResult = {
    created: 0,
    skipped: 0,
    weekStart: toUTCISO(weekStart),
    calendarId: ''
  };

  const days = asRecord(input.plan)?.days;
  if (!start || !end || !Array.isArray(days) || days.length === 0) return result;

  // Semana de la IA => calendario semanal, creando el que falte (misma regla que
  // POST /api/calendar/meals, ahora en un solo sitio).
  const calendar = ensureWeekCalendar(db, input.userId, result.weekStart, {
    type: input.goals?.type ?? 'balanced',
    dailyCalories: input.goals?.caloriesTarget,
    restrictions: input.goals?.restrictions ?? []
  });
  if (!calendar) return result;

  result.calendarId = calendar.id;

  const existing = db.prepare('SELECT id FROM meals WHERE calendar_id = ? AND date = ? AND meal_type = ?');
  const insert = db.prepare(
    `INSERT INTO meals (id, calendar_id, date, meal_type, recipe_id, custom_meal, time, servings, notes)
     VALUES (?, ?, ?, ?, NULL, ?, NULL, 1, ?)`
  );

  for (const rawDay of days) {
    const day = asRecord(rawDay);
    const iso = typeof day?.date === 'string' ? day.date : '';
    const date = utcDate(iso);
    // Fuera del rango pedido (o fecha inválida): se descarta el día entero.
    if (!date || date < start || date > end) continue;

    const meals = asRecord(day?.meals);
    if (!meals) continue;

    for (const type of MEAL_TYPES) {
      const name = mealName(meals[type]);
      if (!name) continue;

      if (existing.get(calendar.id, iso, type)) {
        result.skipped++;
        continue;
      }
      insert.run(nanoid(), calendar.id, iso, type, name, mealNotes(meals[type]));
      result.created++;
    }
  }

  db.prepare('UPDATE weekly_calendars SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(calendar.id);

  return result;
}
