import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { getDatabase } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  createIngredientSchema,
  updateIngredientSchema,
  ingredientFilterSchema,
  createUtensilSchema,
  updateUtensilSchema,
  utensilFilterSchema
} from '../schemas/pantry.schema.js';
import type { AppEnv } from '../types/hono-env.js';

const pantryRoutes = new Hono<AppEnv>();

// Apply auth middleware to all routes
pantryRoutes.use('*', authMiddleware);

/**
 * Returns the user's household context:
 *   { householdId, scope: 'user_id = ?' | '(user_id = ? OR household_id = ?)', params }
 * If shared_pantry = 1, items belonging to the household are visible to all members.
 */
function getUserScope(userId: string) {
  const db = getDatabase();
  const user = db.prepare(
    `SELECT u.household_id as hid, h.shared_pantry
     FROM users u LEFT JOIN households h ON h.id = u.household_id
     WHERE u.id = ?`
  ).get(userId) as any;

  if (user?.hid && user.shared_pantry) {
    return {
      householdId: user.hid,
      userClause: '(user_id = ? OR household_id = ?)',
      userParams: [userId, user.hid],
      memberClause: '(user_id = ? OR household_id = ?)',
      memberParams: [userId, user.hid]
    };
  }
  return {
    householdId: user?.hid ?? null,
    userClause: 'user_id = ?',
    userParams: [userId],
    memberClause: 'user_id = ?',
    memberParams: [userId]
  };
}

// ═══════════════════════════════════════════════════════════════════
// Ingredients
// ═══════════════════════════════════════════════════════════════════

// GET /api/pantry/ingredients
pantryRoutes.get('/ingredients', async (c) => {
  const userId = c.get('userId');
  const query = c.req.query();
  const filter = ingredientFilterSchema.parse(query);

  const db = getDatabase();
  const scope = getUserScope(userId);
  const conditions: string[] = [scope.userClause];
  const params: any[] = [...scope.userParams];

  if (filter.search) {
    conditions.push('name LIKE ?');
    params.push(`%${filter.search}%`);
  }

  if (filter.category) {
    conditions.push('category = ?');
    params.push(filter.category);
  }

  if (filter.location) {
    conditions.push('location = ?');
    params.push(filter.location);
  }

  if (filter.expiringSoon) {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    conditions.push('expiration_date IS NOT NULL AND expiration_date <= ?');
    conditions.push('expiration_date >= datetime("now")');
    params.push(threeDaysFromNow.toISOString());
  }

  if (filter.expired) {
    conditions.push('expiration_date IS NOT NULL AND expiration_date < datetime("now")');
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (filter.page - 1) * filter.pageSize;

  // Get total count
  const countResult = db.prepare(
    `SELECT COUNT(*) as total FROM ingredients ${whereClause}`
  ).get(...params) as any;

  // Get paginated results
  const ingredients = db.prepare(
    `SELECT * FROM ingredients ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, filter.pageSize, offset);

  return c.json({
    success: true,
    data: {
      ingredients,
      total: countResult.total,
      page: filter.page,
      pageSize: filter.pageSize,
      totalPages: Math.ceil(countResult.total / filter.pageSize)
    }
  });
});

// GET /api/pantry/ingredients/stats
pantryRoutes.get('/ingredients/stats', async (c) => {
  const userId = c.get('userId');
  const db = getDatabase();
  const scope = getUserScope(userId);

  // Get total items
  const totalResult = db.prepare(
    `SELECT COUNT(*) as total FROM ingredients WHERE ${scope.userClause}`
  ).get(...scope.userParams) as any;

  // Get expiring soon (next 3 days)
  const expiringSoonResult = db.prepare(`
    SELECT COUNT(*) as total FROM ingredients
    WHERE ${scope.userClause}
    AND expiration_date IS NOT NULL
    AND expiration_date >= datetime('now')
    AND expiration_date <= datetime('now', '+3 days')
  `).get(...scope.userParams) as any;

  // Get expired
  const expiredResult = db.prepare(`
    SELECT COUNT(*) as total FROM ingredients
    WHERE ${scope.userClause}
    AND expiration_date IS NOT NULL
    AND expiration_date < datetime('now')
  `).get(...scope.userParams) as any;

  // Get by category
  const byCategory = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM ingredients
    WHERE ${scope.userClause}
    GROUP BY category
  `).all(...scope.userParams);

  // Get by location
  const byLocation = db.prepare(`
    SELECT location, COUNT(*) as count
    FROM ingredients
    WHERE ${scope.userClause}
    GROUP BY location
  `).all(...scope.userParams);

  return c.json({
    success: true,
    data: {
      total: totalResult.total,
      expiringSoon: expiringSoonResult.total,
      expired: expiredResult.total,
      byCategory: Object.fromEntries(byCategory.map((r: any) => [r.category, r.count])),
      byLocation: Object.fromEntries(byLocation.map((r: any) => [r.location, r.count]))
    }
  });
});

// GET /api/pantry/ingredients/:id
pantryRoutes.get('/ingredients/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDatabase();

  const ingredient = db.prepare(
    'SELECT * FROM ingredients WHERE id = ? AND user_id = ?'
  ).get(id, userId);

  if (!ingredient) {
    return c.json({
      success: false,
      message: 'Ingredient not found'
    }, 404);
  }

  return c.json({
    success: true,
    data: ingredient
  });
});

// POST /api/pantry/ingredients
pantryRoutes.post('/ingredients', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = createIngredientSchema.parse(body);

  const db = getDatabase();
  const id = nanoid();

  // Get user's household
  const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId) as any;

  db.prepare(`
    INSERT INTO ingredients (id, user_id, household_id, name, category, quantity, unit, expiration_date, location, image, barcode, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    user?.household_id,
    input.name,
    input.category,
    input.quantity,
    input.unit,
    input.expirationDate,
    input.location,
    input.image,
    input.barcode,
    input.notes
  );

  const ingredient = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id);

  return c.json({
    success: true,
    data: ingredient
  }, 201);
});

// PATCH /api/pantry/ingredients/:id
pantryRoutes.patch('/ingredients/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();
  const input = updateIngredientSchema.parse(body);

  const db = getDatabase();

  // Check if ingredient exists and belongs to user
  const existing = db.prepare(
    'SELECT id FROM ingredients WHERE id = ? AND user_id = ?'
  ).get(id, userId);

  if (!existing) {
    return c.json({
      success: false,
      message: 'Ingredient not found'
    }, 404);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (input.name !== undefined) {
    updates.push('name = ?');
    values.push(input.name);
  }

  if (input.category !== undefined) {
    updates.push('category = ?');
    values.push(input.category);
  }

  if (input.quantity !== undefined) {
    updates.push('quantity = ?');
    values.push(input.quantity);
  }

  if (input.unit !== undefined) {
    updates.push('unit = ?');
    values.push(input.unit);
  }

  if (input.expirationDate !== undefined) {
    updates.push('expiration_date = ?');
    values.push(input.expirationDate);
  }

  if (input.location !== undefined) {
    updates.push('location = ?');
    values.push(input.location);
  }

  if (input.notes !== undefined) {
    updates.push('notes = ?');
    values.push(input.notes);
  }

  if (updates.length > 0) {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    db.prepare(`UPDATE ingredients SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const ingredient = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id);

  return c.json({
    success: true,
    data: ingredient
  });
});

// DELETE /api/pantry/ingredients/:id
pantryRoutes.delete('/ingredients/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDatabase();

  const result = db.prepare(
    'DELETE FROM ingredients WHERE id = ? AND user_id = ?'
  ).run(id, userId);

  if (result.changes === 0) {
    return c.json({
      success: false,
      message: 'Ingredient not found'
    }, 404);
  }

  return c.json({
    success: true,
    message: 'Ingredient deleted'
  });
});

// ═══════════════════════════════════════════════════════════════════
// Utensils
// ═══════════════════════════════════════════════════════════════════

// GET /api/pantry/utensils
pantryRoutes.get('/utensils', async (c) => {
  const userId = c.get('userId');
  const query = c.req.query();
  const filter = utensilFilterSchema.parse(query);

  const db = getDatabase();
  const scope = getUserScope(userId);
  const conditions: string[] = [scope.userClause];
  const params: any[] = [...scope.userParams];

  if (filter.search) {
    conditions.push('name LIKE ?');
    params.push(`%${filter.search}%`);
  }

  if (filter.category) {
    conditions.push('category = ?');
    params.push(filter.category);
  }

  if (filter.available !== undefined) {
    conditions.push('available = ?');
    params.push(filter.available ? 1 : 0);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const utensils = db.prepare(
    `SELECT * FROM utensils ${whereClause} ORDER BY name ASC`
  ).all(...params);

  return c.json({
    success: true,
    data: utensils
  });
});

// POST /api/pantry/utensils
pantryRoutes.post('/utensils', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = createUtensilSchema.parse(body);

  const db = getDatabase();
  const id = nanoid();

  const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId) as any;

  db.prepare(`
    INSERT INTO utensils (id, user_id, household_id, name, category, available, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    user?.household_id,
    input.name,
    input.category,
    input.available ? 1 : 0,
    input.notes
  );

  const utensil = db.prepare('SELECT * FROM utensils WHERE id = ?').get(id);

  return c.json({
    success: true,
    data: utensil
  }, 201);
});

// PATCH /api/pantry/utensils/:id
pantryRoutes.patch('/utensils/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();
  const input = updateUtensilSchema.parse(body);

  const db = getDatabase();

  const existing = db.prepare(
    'SELECT id FROM utensils WHERE id = ? AND user_id = ?'
  ).get(id, userId);

  if (!existing) {
    return c.json({
      success: false,
      message: 'Utensil not found'
    }, 404);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (input.name !== undefined) {
    updates.push('name = ?');
    values.push(input.name);
  }

  if (input.category !== undefined) {
    updates.push('category = ?');
    values.push(input.category);
  }

  if (input.available !== undefined) {
    updates.push('available = ?');
    values.push(input.available ? 1 : 0);
  }

  if (input.notes !== undefined) {
    updates.push('notes = ?');
    values.push(input.notes);
  }

  if (updates.length > 0) {
    values.push(id);
    db.prepare(`UPDATE utensils SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const utensil = db.prepare('SELECT * FROM utensils WHERE id = ?').get(id);

  return c.json({
    success: true,
    data: utensil
  });
});

// DELETE /api/pantry/utensils/:id
pantryRoutes.delete('/utensils/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDatabase();

  const result = db.prepare(
    'DELETE FROM utensils WHERE id = ? AND user_id = ?'
  ).run(id, userId);

  if (result.changes === 0) {
    return c.json({
      success: false,
      message: 'Utensil not found'
    }, 404);
  }

  return c.json({
    success: true,
    message: 'Utensil deleted'
  });
});

export { pantryRoutes };
