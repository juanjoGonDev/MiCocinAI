import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { getDatabase } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  createRecipeSchema,
  updateRecipeSchema,
  recipeFilterSchema,
  adjustServingsSchema
} from '../schemas/recipe.schema.js';
import type { AppEnv } from '../types/hono-env.js';

const recipeRoutes = new Hono<AppEnv>();

recipeRoutes.use('*', authMiddleware);

// Map from camelCase API field names to snake_case DB column names,
// plus an allow-list to prevent SQL injection via ORDER BY.
const SORT_COLUMN_MAP: Record<string, string> = {
  name: 'name',
  difficulty: 'difficulty',
  totalTime: 'total_time',
  rating: 'rating',
  createdAt: 'created_at'
};

// Helper to convert snake_case DB row to camelCase API object
function mapRecipe(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    difficulty: r.difficulty,
    cuisine: r.cuisine,
    mealType: JSON.parse((r.meal_type as string) || '[]'),
    totalTime: r.total_time,
    prepTime: r.prep_time,
    cookTime: r.cook_time,
    restTime: r.rest_time,
    servings: r.servings,
    calories: r.calories,
    image: r.image,
    ingredients: JSON.parse((r.ingredients as string) || '[]'),
    utensils: JSON.parse((r.utensils as string) || '[]'),
    steps: JSON.parse((r.steps as string) || '[]'),
    tags: JSON.parse((r.tags as string) || '[]'),
    nutrition: r.nutrition ? JSON.parse(r.nutrition as string) : null,
    storage: r.storage ? JSON.parse(r.storage as string) : null,
    author: r.author,
    authorId: r.author_id,
    rating: r.rating,
    timesCooked: r.times_cooked,
    isFavorite: !!r.is_favorite,
    isPublic: !!r.is_public,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

/**
 * Coerce query-string values (always strings) to the types Zod expects.
 */
function coerceQuery(q: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...q };
  const intKeys = ['maxTime', 'page', 'pageSize'];
  for (const k of intKeys) {
    if (out[k] !== undefined && out[k] !== '') {
      const n = Number(out[k]);
      out[k] = Number.isFinite(n) ? n : undefined;
    } else {
      delete out[k];
    }
  }
  if (out.isFavorite !== undefined) {
    out.isFavorite = out.isFavorite === 'true' || out.isFavorite === '1';
  }
  return out;
}

// GET /api/recipes
recipeRoutes.get('/', async (c) => {
  const rawQuery = c.req.query();
  const filter = recipeFilterSchema.parse(coerceQuery(rawQuery));

  const db = getDatabase();
  const conditions: string[] = ['1=1'];
  const params: any[] = [];

  if (filter.search) {
    conditions.push('(name LIKE ? OR description LIKE ?)');
    params.push(`%${filter.search}%`, `%${filter.search}%`);
  }

  if (filter.difficulty) {
    conditions.push('difficulty = ?');
    params.push(filter.difficulty);
  }

  if (filter.mealType) {
    conditions.push("meal_type LIKE ?");
    params.push(`%${filter.mealType}%`);
  }

  if (filter.maxTime) {
    conditions.push('total_time <= ?');
    params.push(filter.maxTime);
  }

  if (filter.cuisine) {
    conditions.push('cuisine = ?');
    params.push(filter.cuisine);
  }

  if (filter.author) {
    conditions.push('author = ?');
    params.push(filter.author);
  }

  if (filter.isFavorite) {
    conditions.push('is_favorite = 1');
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const offset = (filter.page - 1) * filter.pageSize;

  // Whitelist ORDER BY columns via our map
  const sortColumn = SORT_COLUMN_MAP[filter.sortBy] || 'created_at';
  const sortOrder = filter.sortOrder === 'asc' ? 'ASC' : 'DESC';

  const countResult = db.prepare(
    `SELECT COUNT(*) as total FROM recipes ${whereClause}`
  ).get(...params) as Record<string, unknown>;

  const recipes = db.prepare(
    `SELECT * FROM recipes ${whereClause} ORDER BY ${sortColumn} ${sortOrder} LIMIT ? OFFSET ?`
  ).all(...params, filter.pageSize, offset) as Record<string, unknown>[];

  return c.json({
    success: true,
    data: {
      recipes: recipes.map(mapRecipe),
      total: countResult.total,
      page: filter.page,
      pageSize: filter.pageSize
    }
  });
});

// GET /api/recipes/:id
recipeRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDatabase();

  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id) as Record<string, unknown> | undefined;

  if (!recipe) {
    return c.json({ success: false, message: 'Recipe not found' }, 404);
  }

  return c.json({
    success: true,
    data: mapRecipe(recipe)
  });
});

// POST /api/recipes
recipeRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = createRecipeSchema.parse(body);

  const db = getDatabase();
  const id = nanoid();

  db.prepare(`
    INSERT INTO recipes (id, name, description, difficulty, cuisine, meal_type, total_time, prep_time, cook_time, rest_time, servings, calories, image, ingredients, utensils, steps, nutrition, storage, author, author_id, tags, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    input.description,
    input.difficulty,
    input.cuisine,
    JSON.stringify(input.mealType),
    input.totalTime,
    input.prepTime,
    input.cookTime,
    input.restTime,
    input.servings,
    input.calories,
    input.image,
    JSON.stringify(input.ingredients),
    JSON.stringify(input.utensils),
    JSON.stringify(input.steps),
    input.nutrition ? JSON.stringify(input.nutrition) : null,
    input.storage ? JSON.stringify(input.storage) : null,
    'user',
    userId,
    JSON.stringify(input.tags),
    input.isPublic ? 1 : 0
  );

  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);

  return c.json({ success: true, data: recipe }, 201);
});

// PATCH /api/recipes/:id
recipeRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const input = updateRecipeSchema.parse(body);

  const db = getDatabase();

  const existing = db.prepare('SELECT id FROM recipes WHERE id = ?').get(id);
  if (!existing) {
    return c.json({ success: false, message: 'Recipe not found' }, 404);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (input.name !== undefined) { updates.push('name = ?'); values.push(input.name); }
  if (input.description !== undefined) { updates.push('description = ?'); values.push(input.description); }
  if (input.difficulty !== undefined) { updates.push('difficulty = ?'); values.push(input.difficulty); }
  if (input.isFavorite !== undefined) { updates.push('is_favorite = ?'); values.push(input.isFavorite ? 1 : 0); }

  if (updates.length > 0) {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    db.prepare(`UPDATE recipes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
  return c.json({ success: true, data: recipe });
});

// DELETE /api/recipes/:id
recipeRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDatabase();

  const result = db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
  if (result.changes === 0) {
    return c.json({ success: false, message: 'Recipe not found' }, 404);
  }

  return c.json({ success: true, message: 'Recipe deleted' });
});

// POST /api/recipes/:id/favorite
recipeRoutes.post('/:id/favorite', async (c) => {
  const id = c.req.param('id');
  const db = getDatabase();

  const recipe = db.prepare('SELECT id FROM recipes WHERE id = ?').get(id);
  if (!recipe) {
    return c.json({ success: false, message: 'Recipe not found' }, 404);
  }

  db.prepare('UPDATE recipes SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?').run(id);
  const updated = db.prepare('SELECT is_favorite FROM recipes WHERE id = ?').get(id) as any;

  return c.json({
    success: true,
    data: { isFavorite: updated.is_favorite === 1 }
  });
});

// POST /api/recipes/:id/cook
recipeRoutes.post('/:id/cook', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDatabase();

  db.prepare('UPDATE recipes SET times_cooked = times_cooked + 1 WHERE id = ?').run(id);

  // Update user recipe history
  const existing = db.prepare(
    'SELECT id FROM user_recipes WHERE user_id = ? AND recipe_id = ?'
  ).get(userId, id);

  if (existing) {
    db.prepare(`
      UPDATE user_recipes 
      SET times_cooked = times_cooked + 1, last_cooked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND recipe_id = ?
    `).run(userId, id);
  } else {
    db.prepare(`
      INSERT INTO user_recipes (id, user_id, recipe_id, times_cooked, last_cooked_at)
      VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
    `).run(nanoid(), userId, id);
  }

  return c.json({ success: true, message: 'Recipe cooked recorded' });
});

// POST /api/recipes/:id/adjust-servings
recipeRoutes.post('/:id/adjust-servings', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const input = adjustServingsSchema.parse(body);

  const db = getDatabase();
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id) as any;

  if (!recipe) {
    return c.json({ success: false, message: 'Recipe not found' }, 404);
  }

  const ingredients = JSON.parse(recipe.ingredients || '[]');
  const ratio = input.servings / recipe.servings;

  const adjustedIngredients = ingredients.map((ing: any) => ({
    ...ing,
    quantity: Math.round(ing.quantity * ratio * 100) / 100
  }));

  return c.json({
    success: true,
    data: {
      servings: input.servings,
      ingredients: adjustedIngredients
    }
  });
});

export { recipeRoutes };
