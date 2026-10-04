import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import jwt from 'jsonwebtoken';

process.env.DATABASE_PATH = ':memory:';
process.env.NODE_ENV = 'test';

type Sql = import('better-sqlite3').Database;
let app: Hono;
let db: Sql;
let closeDatabase: () => void;
let userId: string;
let token: string;

async function call(method: string, path: string, body?: unknown) {
  const response = await app.request(`/api/recipes${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, payload: (await response.json()) as any };
}

const instructionsByLevel = {
  basic: [{ stepNumber: 1, instruction: 'Cocer.', timerRequired: false }],
  intermediate: [
    { stepNumber: 1, instruction: 'Cortar y cocer hasta que esté tierna.', timerRequired: false }
  ],
  expert: [
    { stepNumber: 1, instruction: 'Cortar en dados y cocer a hervor suave.', timerRequired: false }
  ]
};

beforeAll(async () => {
  const database = await import('../config/database.js');
  await database.initializeDatabase();
  db = database.getDatabase();
  closeDatabase = database.closeDatabase;

  const config = await import('../config/app.config.js');
  const { errorHandler } = await import('../middleware/error.middleware.js');
  const { recipeRoutes } = await import('./recipes.routes.js');
  app = new Hono();
  app.onError(errorHandler as never);
  app.route('/api/recipes', recipeRoutes);
  userId = 'recipe-levels-user';
  token = jwt.sign(
    { sub: userId, email: 'recipe-levels@test.local' },
    config.config.auth.jwtSecret
  );
});

beforeEach(() => {
  db.prepare('DELETE FROM recipes WHERE author_id = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  db.prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)').run(
    userId,
    'recipe-levels@test.local',
    'Recipe test',
    'synthetic-hash'
  );
});

afterAll(() => closeDatabase?.());

describe('POST /api/recipes recipe instruction storage', () => {
  it('stores one canonical map and returns it after reloading the recipe', async () => {
    const created = await call('POST', '', {
      name: 'Crema sintética',
      description: 'Fixture.',
      ingredients: [{ name: 'Zanahoria', quantity: 2, unit: 'unit' }],
      instructionsByLevel
    });

    expect(created.status).toBe(201);
    expect(created.payload.data.instructionsByLevel).toEqual(instructionsByLevel);
    expect(created.payload.data).not.toHaveProperty('steps');
    expect(created.payload.data.ingredients).toHaveLength(1);
    expect(
      (
        db.prepare('SELECT COUNT(*) AS count FROM recipes WHERE author_id = ?').get(userId) as {
          count: number;
        }
      ).count
    ).toBe(1);

    const persisted = db
      .prepare('SELECT steps FROM recipes WHERE id = ?')
      .get(created.payload.data.id) as {
      steps: string;
    };
    expect(JSON.parse(persisted.steps)).toEqual(instructionsByLevel);

    const reloaded = await call('GET', `/${created.payload.data.id}`);
    expect(reloaded.status).toBe(200);
    expect(reloaded.payload.data.instructionsByLevel).toEqual(instructionsByLevel);
    expect(reloaded.payload.data).not.toHaveProperty('steps');
  });

  it('keeps legacy saved recipes with a flat steps array readable', async () => {
    const legacySteps = [
      { stepNumber: 1, instruction: 'Preparación anterior.', timerRequired: false }
    ];
    const created = await call('POST', '', {
      name: 'Receta antigua',
      ingredients: [{ name: 'Zanahoria', quantity: 2, unit: 'unit' }],
      steps: legacySteps
    });

    expect(created.status).toBe(201);
    expect(created.payload.data.steps).toEqual(legacySteps);
    expect(created.payload.data).not.toHaveProperty('instructionsByLevel');
    const reloaded = await call('GET', `/${created.payload.data.id}`);
    expect(reloaded.payload.data.steps).toEqual(legacySteps);
  });

  it('does not accept both representations or a partial level map', async () => {
    const both = await call('POST', '', {
      name: 'Duplicada',
      ingredients: [{ name: 'Zanahoria', quantity: 2, unit: 'unit' }],
      steps: [{ stepNumber: 1, instruction: 'Cocer.' }],
      instructionsByLevel
    });
    const partial = await call('POST', '', {
      name: 'Incompleta',
      ingredients: [{ name: 'Zanahoria', quantity: 2, unit: 'unit' }],
      instructionsByLevel: { basic: instructionsByLevel.basic }
    });

    expect(both.status).toBe(400);
    expect(partial.status).toBe(400);
    expect(
      (
        db.prepare('SELECT COUNT(*) AS count FROM recipes WHERE author_id = ?').get(userId) as {
          count: number;
        }
      ).count
    ).toBe(0);
  });
});
