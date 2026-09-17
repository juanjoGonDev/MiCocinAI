import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { getDatabase } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  calendarFilterSchema,
  createCalendarSchema,
  addMealSchema,
  updateMealSchema,
  updateGoalsSchema
} from '../schemas/calendar.schema.js';
import { ensureWeekCalendar } from '../utils/week-calendar.js';
import type { AppEnv } from '../types/hono-env.js';

const calendarRoutes = new Hono<AppEnv>();
calendarRoutes.use('*', authMiddleware);

// GET /api/calendar
calendarRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = getDatabase();

  // Get current week's calendar
  const calendar = db.prepare(`
    SELECT * FROM weekly_calendars 
    WHERE user_id = ? 
    ORDER BY week_start DESC 
    LIMIT 1
  `).get(userId) as any;

  if (!calendar) {
    return c.json({ success: true, data: null });
  }

  const meals = db.prepare(`
    SELECT m.*, r.name as recipe_name
    FROM meals m
    LEFT JOIN recipes r ON r.id = m.recipe_id
    WHERE m.calendar_id = ?
    ORDER BY m.date, 
      CASE m.meal_type 
        WHEN 'breakfast' THEN 1 
        WHEN 'lunch' THEN 2 
        WHEN 'dinner' THEN 3 
        WHEN 'snack' THEN 4 
      END
  `).all(calendar.id);

  return c.json({
    success: true,
    data: {
      ...calendar,
      goals: JSON.parse(calendar.goals || '{}'),
      meals
    }
  });
});

// GET /api/calendar/range?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
//
// Lo que necesita la rejilla (mes / semana / dia): TODAS las comidas del rango
// visible. `GET /api/calendar` solo devuelve el ultimo calendario —una semana—,
// asi que en vista de mes todo lo demas salia vacio pase lo que pase.
calendarRoutes.get('/range', async (c) => {
  const userId = c.get('userId');
  const today = new Date().toISOString().slice(0, 10);
  const parsed = calendarFilterSchema.safeParse({
    startDate: c.req.query('startDate') ?? undefined,
    endDate: c.req.query('endDate') ?? undefined
  });
  if (!parsed.success) {
    return c.json({ success: false, message: 'startDate y endDate deben tener formato YYYY-MM-DD' }, 400);
  }

  // Sin rango, la semana actual: la ruta sigue siendo util a mano.
  const startDate = parsed.data.startDate ?? today;
  const endDate = parsed.data.endDate ?? today;
  if (startDate > endDate) {
    return c.json({ success: false, message: 'startDate debe ser anterior a endDate' }, 400);
  }

  const db = getDatabase();
  const meals = db.prepare(`
    SELECT m.*, r.name AS recipe_name, r.calories AS recipe_calories
    FROM meals m
    LEFT JOIN recipes r ON r.id = m.recipe_id
    WHERE m.date BETWEEN ? AND ?
      AND m.calendar_id IN (SELECT id FROM weekly_calendars WHERE user_id = ?)
    ORDER BY m.date,
      CASE m.meal_type
        WHEN 'breakfast' THEN 1
        WHEN 'lunch' THEN 2
        WHEN 'dinner' THEN 3
        WHEN 'snack' THEN 4
      END,
      m.time
  `).all(startDate, endDate, userId);

  // Objetivos de la semana que se esta mirando (si no existe, los ultimos).
  const goalsRow =
    (db.prepare(`
      SELECT goals FROM weekly_calendars
      WHERE user_id = ? AND week_start <= ? AND week_end >= ?
      ORDER BY week_start DESC LIMIT 1
    `).get(userId, startDate, endDate) as any) ||
    (db.prepare('SELECT goals FROM weekly_calendars WHERE user_id = ? ORDER BY week_start DESC LIMIT 1')
      .get(userId) as any);

  let goals: Record<string, unknown> = {};
  try {
    goals = JSON.parse(goalsRow?.goals || '{}');
  } catch {
    goals = {};
  }

  return c.json({ success: true, data: { startDate, endDate, goals, meals } });
});

// POST /api/calendar
calendarRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = createCalendarSchema.parse(body);

  const db = getDatabase();

  // Una fila por semana y usuario: si la semana ya tiene calendario, se reutiliza
  // (antes cada POST creaba un duplicado y `GET /api/calendar` enseñaba otro).
  const calendar = ensureWeekCalendar(db, userId, input.weekStart, input.goals);
  if (!calendar) {
    return c.json({ success: false, message: 'weekStart debe ser una fecha real YYYY-MM-DD' }, 400);
  }

  if (input.goals) {
    db.prepare('UPDATE weekly_calendars SET goals = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(JSON.stringify(input.goals), calendar.id);
  }

  return c.json({ success: true, data: calendar }, 201);
});

// POST /api/calendar/meals
calendarRoutes.post('/meals', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = addMealSchema.parse(body);

  const db = getDatabase();
  const id = nanoid();

  // La comida vive en el calendario de SU semana, creándolo si es la primera que
  // se guarda. El lunes se calcula sobre la cadena YYYY-MM-DD: con `new Date(iso)`
  // la medianoche UTC cae en el día anterior según la zona horaria y abría la
  // semana equivocada.
  const calendar = ensureWeekCalendar(db, userId, input.date);
  if (!calendar) {
    return c.json({ success: false, message: 'date debe ser una fecha real YYYY-MM-DD' }, 400);
  }

  db.prepare(`
    INSERT INTO meals (id, calendar_id, date, meal_type, recipe_id, custom_meal, time, servings, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, calendar.id, input.date, input.mealType, input.recipeId, input.customMeal, input.time, input.servings, input.notes);

  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(id);

  return c.json({ success: true, data: meal }, 201);
});

// PATCH /api/calendar/meals/:id
calendarRoutes.patch('/meals/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const input = updateMealSchema.parse(body);

  const db = getDatabase();

  const updates: string[] = [];
  const values: any[] = [];

  if (input.recipeId !== undefined) { updates.push('recipe_id = ?'); values.push(input.recipeId); }
  if (input.customMeal !== undefined) { updates.push('custom_meal = ?'); values.push(input.customMeal); }
  if (input.servings !== undefined) { updates.push('servings = ?'); values.push(input.servings); }
  if (input.notes !== undefined) { updates.push('notes = ?'); values.push(input.notes); }
  if (input.completed !== undefined) { 
    updates.push('completed = ?'); 
    values.push(input.completed ? 1 : 0);
    if (input.completed) {
      updates.push('completed_at = CURRENT_TIMESTAMP');
    }
  }

  if (updates.length > 0) {
    values.push(id);
    db.prepare(`UPDATE meals SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(id);
  return c.json({ success: true, data: meal });
});

// DELETE /api/calendar/meals/:id
calendarRoutes.delete('/meals/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDatabase();

  const result = db.prepare('DELETE FROM meals WHERE id = ?').run(id);
  if (result.changes === 0) {
    return c.json({ success: false, message: 'Meal not found' }, 404);
  }

  return c.json({ success: true, message: 'Meal deleted' });
});

// PATCH /api/calendar/goals
calendarRoutes.patch('/goals', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = updateGoalsSchema.parse(body);

  const db = getDatabase();

  // `weekStart` es opcional: el calendario que se está mirando, no «el último».
  // Antes, si la semana no tenía fila, respondía 404 y la interfaz lo enseñaba
  // como un guardado correcto igualmente.
  const { weekStart } = body as { weekStart?: string };
  const calendar = ensureWeekCalendar(
    db,
    userId,
    weekStart ?? new Date().toISOString().slice(0, 10)
  );
  if (!calendar) {
    return c.json({ success: false, message: 'weekStart debe ser una fecha real YYYY-MM-DD' }, 400);
  }

  db.prepare('UPDATE weekly_calendars SET goals = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(JSON.stringify(input), calendar.id);

  return c.json({ success: true, message: 'Goals updated', data: { weekStart: calendar.week_start } });
});

export { calendarRoutes };
