import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { getDatabase } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  calendarFilterSchema,
  createCalendarSchema,
  addMealSchema,
  updateMealSchema,
  updateGoalsSchema,
  calendarEventFilterSchema,
  createCalendarEventSchema,
  updateCalendarEventSchema
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

// ---------------------------------------------------------------------------
// Sueltas de la casa (HOGARIA-SPEC 8f)
// ---------------------------------------------------------------------------
//
// Dos decisiones que valen la pena decir en voz alta:
//
// 1. Las COMIDAS no se copian aqui. Se leen desde `meals` en la proyeccion, y punto:
//    en cuanto una cena duplicada en dos tablas puede existir, una de las dos va a
//    estar equivocada. Por eso el POST con kind 'meal' se rechaza en vez de "funcionar".
// 2. Se ve en toda la casa, se toca solo por quien lo escribio. El carpintero del
//    martes interesa a los dos; borrar la cita medica de otra persona, no.

type CalendarEventRow = {
  id: string;
  household_id: string | null;
  user_id: string;
  title: string;
  kind: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: number;
  color: string | null;
  notes: string | null;
  location: string | null;
  source: string;
};

const EVENT_COLUMNS =
  'id, household_id, user_id, title, kind, date, start_time, end_time, all_day, color, notes, location, source';

function toEvent(row: CalendarEventRow, authorName: string | null): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    allDay: row.all_day === 1,
    color: row.color,
    notes: row.notes,
    location: row.location,
    source: row.source,
    userId: row.user_id,
    authorName
  };
}

/**
 * Quien puede ver: lo de la casa (si la hay) y lo propio, aunque no haya casa. El
 * `household_id` NO viene del token: se lee de `users`, igual que en la compra, porque
 * cambiar de casa a mitad de temporada no puede dejar eventos huerfanos.
 */
function eventScope(userId: string) {
  const db = getDatabase();
  const user = db.prepare('SELECT household_id AS hid FROM users WHERE id = ?').get(userId) as
    | { hid: string | null }
    | undefined;
  const householdId = user?.hid ?? null;
  return householdId
    ? { clause: '(household_id = ? OR user_id = ?)', params: [householdId, userId], userId, householdId }
    : { clause: 'user_id = ?', params: [userId], userId, householdId: null };
}

// GET /api/calendar/events?from=&to=&kinds=
calendarRoutes.get('/events', async (c) => {
  const db = getDatabase();
  const parsed = calendarEventFilterSchema.safeParse({
    from: c.req.query('from'),
    to: c.req.query('to'),
    kinds: c.req.query('kinds'),
    limit: c.req.query('limit') ?? undefined
  });
  if (!parsed.success) {
    return c.json(
      { success: false, message: 'from y to son obligatorios (AAAA-MM-DD)', issues: parsed.error.issues },
      400
    );
  }
  const { from, to, kinds, limit } = parsed.data;
  const scope = eventScope(c.get('userId') as string);

  // Un filtro de tipos que no deja NINGUN tipo valido no es "ensename todo": es una
  // peticion rara, y contestar la lista entera seria el peor comportamiento posible.
  const kindsClause = kinds.length ? 'kind IN (' + kinds.map(() => '?').join(', ') + ') AND' : '';

  const filters: string[] = [...kinds, from, to, ...scope.params, String(limit)];
  const rows = db
    .prepare(
      `SELECT ${EVENT_COLUMNS} FROM calendar_events
       WHERE ${kindsClause} date >= ? AND date <= ? AND ${scope.clause}
       ORDER BY date ASC, all_day DESC, start_time ASC, id ASC
       LIMIT ?`
    )
    .all(...filters) as unknown as CalendarEventRow[];

  const authors = new Map<string, string>();
  const names = db.prepare('SELECT id, name FROM users').all() as unknown as { id: string; name: string }[];
  for (const n of names) authors.set(n.id, n.name);

  return c.json({
    success: true,
    data: rows.map((row) => ({
      ...toEvent(row, authors.get(row.user_id) ?? null),
      // El frontend no adivina si puede editar: lo dice el servidor, que es quien sabe
      // quien es quien. Y es `editable`, no `es mio`, porque el dia que haya roles de
      // admin de casa solo hay que cambiar esta linea.
      editable: row.user_id === scope.userId
    }))
  });
});

// POST /api/calendar/events
calendarRoutes.post('/events', async (c) => {
  const db = getDatabase();
  const body = await c.req.json().catch(() => ({}));
  const parsed = createCalendarEventSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        message: parsed.error.issues[0]?.message ?? 'Datos invalidos',
        issues: parsed.error.issues
      },
      400
    );
  }
  const input = parsed.data;
  if (input.kind === 'meal') {
    return c.json(
      {
        success: false,
        message: 'MEAL_COMES_FROM_THE_PLAN',
        data: { hint: 'La comida se planifica en el calendario de comidas; aqui van las otras cosas de la casa.' }
      },
      400
    );
  }

  const userId = c.get('userId') as string;
  const householdId = eventScope(userId).householdId;
  const id = nanoid();
  const allDay = input.allDay === undefined ? (!input.startTime ? 1 : 0) : input.allDay === true || input.allDay === 1 ? 1 : 0;

  db.prepare(
    `INSERT INTO calendar_events
     (id, household_id, user_id, title, kind, date, start_time, end_time, all_day, color, notes, location, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')`
  ).run(
    id,
    // Sin casa la suelta es solo tuya; con casa, solo se comparte si quien la escribe
    // lo pide. Una cita medica no es automaticamente de la familia.
    input.sharedWithHousehold ? householdId : null,
    userId,
    input.title,
    input.kind,
    input.date,
    input.startTime ?? null,
    input.endTime ?? null,
    allDay,
    input.color ?? null,
    input.notes ?? null,
    input.location ?? null
  );

  const row = db.prepare(`SELECT ${EVENT_COLUMNS} FROM calendar_events WHERE id = ?`).get(id) as unknown as CalendarEventRow;
  return c.json({ success: true, data: { ...toEvent(row, null), editable: true } }, 201);
});

// PATCH /api/calendar/events/:id
calendarRoutes.patch('/events/:id', async (c) => {
  const db = getDatabase();
  const id = c.req.param('id');
  const userId = c.get('userId') as string;
  const existing = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id) as
    | (CalendarEventRow & { user_id: string; all_day: number; start_time: string | null; end_time: string | null })
    | undefined;
  if (!existing) return c.json({ success: false, message: 'Evento no encontrado' }, 404);
  // Escrita en el sitio: ver el evento de otra persona no es poder reescribirlo.
  if (existing.user_id !== userId) {
    return c.json({ success: false, message: 'FORBIDDEN', data: { hint: 'Solo quien lo escribio puede cambiarlo.' } }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = updateCalendarEventSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, message: parsed.error.issues[0]?.message ?? 'Datos invalidos' }, 400);
  }
  const input = parsed.data as Record<string, unknown>;

  const set: string[] = [];
  const params: (string | number | null)[] = [];
  const put = (column: string, value: unknown) => {
    if (value === undefined) return;
    set.push(`${column} = ?`);
    params.push(value === null ? null : (value as string | number));
  };
  put('title', input.title);
  put('kind', input.kind);
  put('date', input.date);
  put('start_time', input.startTime);
  put('end_time', input.endTime);
  put('color', input.color);
  put('notes', input.notes);
  put('location', input.location);
  if (input.allDay !== undefined) {
    set.push('all_day = ?');
    params.push(input.allDay === true || input.allDay === 1 ? 1 : 0);
  }
  // Cambiar de hora a todo el dia tiene que BORRAR las horas: si no, la siguiente
  // edicion ve un evento 'todo el dia' con 19:30 dentro y nadie sabe cual manda.
  if (input.allDay === true || input.allDay === 1) {
    set.push('start_time = NULL', 'end_time = NULL');
  }
  // Las horas se comprueban SOBRE LA FILA RESULTANTE, no sobre lo que llego: un PATCH
  // que solo manda endTime puede dejar el final antes del principio, y ese evento no
  // lo rechaza ningun schema que valide partes.
  const nextStart = input.startTime ?? existing.start_time ?? null;
  const nextEnd = input.endTime ?? existing.end_time ?? null;
  const nextAllDay = input.allDay === true || input.allDay === 1 ? 1 : existing.all_day;
  if (!nextAllDay && nextStart && nextEnd && nextEnd < nextStart) {
    return c.json({ success: false, message: 'endTime no puede ser anterior a startTime' }, 400);
  }
  if (!set.length) return c.json({ success: false, message: 'Nada que actualizar' }, 400);

  params.push(id);
  db.prepare(`UPDATE calendar_events SET ${set.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...params);

  const row = db.prepare(`SELECT ${EVENT_COLUMNS} FROM calendar_events WHERE id = ?`).get(id) as unknown as CalendarEventRow;
  return c.json({ success: true, data: { ...toEvent(row, null), editable: true } });
});

// DELETE /api/calendar/events/:id
calendarRoutes.delete('/events/:id', async (c) => {
  const db = getDatabase();
  const id = c.req.param('id');
  const userId = c.get('userId') as string;
  const existing = db.prepare('SELECT user_id FROM calendar_events WHERE id = ?').get(id) as { user_id: string } | undefined;
  if (!existing) return c.json({ success: false, message: 'Evento no encontrado' }, 404);
  if (existing.user_id !== userId) {
    return c.json({ success: false, message: 'FORBIDDEN', data: { hint: 'Solo quien lo escribio puede borrarlo.' } }, 403);
  }
  db.prepare('DELETE FROM calendar_events WHERE id = ?').run(id);
  return c.json({ success: true, message: 'Evento eliminado' });
});

export { calendarRoutes };
