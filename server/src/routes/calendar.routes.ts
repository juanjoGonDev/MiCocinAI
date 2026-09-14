import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { getDatabase } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  createCalendarSchema,
  addMealSchema,
  updateMealSchema,
  updateGoalsSchema
} from '../schemas/calendar.schema.js';
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

// POST /api/calendar
calendarRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = createCalendarSchema.parse(body);

  const db = getDatabase();
  const id = nanoid();

  const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId) as any;

  // Calculate week end (6 days after start)
  const startDate = new Date(input.weekStart);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);

  db.prepare(`
    INSERT INTO weekly_calendars (id, household_id, user_id, week_start, week_end, goals)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    user?.household_id || id,
    userId,
    input.weekStart,
    endDate.toISOString().split('T')[0],
    JSON.stringify(input.goals || {})
  );

  const calendar = db.prepare('SELECT * FROM weekly_calendars WHERE id = ?').get(id);

  return c.json({ success: true, data: calendar }, 201);
});

// POST /api/calendar/meals
calendarRoutes.post('/meals', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = addMealSchema.parse(body);

  const db = getDatabase();
  const id = nanoid();

  // Get or create calendar for the week
  const mealDate = new Date(input.date);
  const weekStart = new Date(mealDate);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);

  let calendar = db.prepare(`
    SELECT * FROM weekly_calendars 
    WHERE user_id = ? AND week_start = ?
  `).get(userId, weekStart.toISOString().split('T')[0]) as any;

  if (!calendar) {
    const calendarId = nanoid();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    db.prepare(`
      INSERT INTO weekly_calendars (id, household_id, user_id, week_start, week_end)
      VALUES (?, ?, ?, ?, ?)
    `).run(calendarId, '', userId, weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]);

    calendar = db.prepare('SELECT * FROM weekly_calendars WHERE id = ?').get(calendarId);
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

  const calendar = db.prepare(`
    SELECT * FROM weekly_calendars WHERE user_id = ? ORDER BY week_start DESC LIMIT 1
  `).get(userId) as any;

  if (!calendar) {
    return c.json({ success: false, message: 'No calendar found' }, 404);
  }

  db.prepare('UPDATE weekly_calendars SET goals = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(JSON.stringify(input), calendar.id);

  return c.json({ success: true, message: 'Goals updated' });
});

export { calendarRoutes };
