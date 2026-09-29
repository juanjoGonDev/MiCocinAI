import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import jwt from 'jsonwebtoken';

/**
 * Las rutas de configuracion de IA (revision de la ## 8f a peticion del usuario): la prueba de
 * conexion con JSON DADO (no un «Hello» a ver que contesta) y la activacion. Dos promesas:
 *
 *   - La prueba va contra una config guardada (`configId`) o contra los datos del formulario
 *     tal cual (baseUrl+apiKey+model), que es lo que permite probar ANTES de guardar; y el
 *     estado (`test_status`) solo se persiste en la primera.
 *   - La configuracion activa es UNA: la recien creada es la activa, y activar otra apaga la
 *     anterior. La queja era «la IA no se activa se queda inactivada»: creabas una config
 *     nueva y la primera fila (la vieja, por rowid) seguia siendo la que contestaba.
 */

process.env.DATABASE_PATH = ':memory:';
process.env.NODE_ENV = 'test';

type Sql = import('better-sqlite3').Database;

let app: Hono;
let db: Sql;
let closeDatabase: () => void;

async function makeUser(email: string) {
  const id = `u-${email.split('@')[0]}`;
  db.prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)').run(
    id,
    email,
    'Tester',
    'hash'
  );
  const config = await import('../config/app.config.js');
  const token = jwt.sign({ sub: id, email }, config.config.auth.jwtSecret, { expiresIn: '1h' });
  return { id, token };
}

type User = { id: string; token: string };

function call(user: User, method: string, path: string, body?: unknown) {
  return app.request(`/api/ai${path}`, {
    method,
    headers: { authorization: `Bearer ${user.token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

const json = async (response: Response): Promise<any> => await response.json();
const data = async (response: Response): Promise<any> => (await json(response)).data;

/** El proveedor contesta lo que se le diga: aqui se decide si la prueba pasa o no. */
function stubDelProveedor(content: string, status = 200): void {
  vi.stubGlobal(
    'fetch',
    (async (): Promise<Response> =>
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status })) as unknown as typeof fetch
  );
}

let alice: User;

beforeEach(async () => {
  vi.unstubAllGlobals();
  db.exec('DELETE FROM ai_configs; DELETE FROM users;');
  alice = await makeUser(`alice-${Math.random().toString(36).slice(2)}@test.local`);
});

beforeAll(async () => {
  const database = await import('../config/database.js');
  await database.initializeDatabase();
  db = database.getDatabase();
  closeDatabase = database.closeDatabase;

  const { aiRoutes } = await import('./ai.routes.js');
  const { errorHandler } = await import('../middleware/error.middleware.js');
  const { timestampMiddleware } = await import('../middleware/timestamp.middleware.js');
  app = new Hono();
  app.onError(errorHandler as never);
  app.use('/api/*', timestampMiddleware());
  app.route('/api/ai', aiRoutes);
});

afterAll(() => closeDatabase?.());

async function crearConfig(user: User, nombre: string, baseUrl = 'http://localhost:9/v1') {
  return data(
    await call(user, 'POST', '/configs', {
      name: nombre,
      provider: 'custom',
      baseUrl,
      apiKey: 'sk-x',
      model: 'gpt-5'
    })
  );
}

describe('la configuracion activa es UNA', () => {
  it('la config recien creada es la activa, y apaga la anterior', async () => {
    const primera = await crearConfig(alice, 'Vieja');
    expect(primera.isActive).toBe(true);

    const segunda = await crearConfig(alice, 'Nueva');
    const filas = db
      .prepare('SELECT name, is_active FROM ai_configs ORDER BY created_at, rowid')
      .all() as { name: string; is_active: number }[];
    expect(filas).toEqual([
      { name: 'Vieja', is_active: 0 },
      { name: 'Nueva', is_active: 1 }
    ]);
    expect(segunda.isActive).toBe(true);
  });

  it('la respuesta no devuelve la api_key', async () => {
    await crearConfig(alice, 'Con llave');
    const respuesta = await call(alice, 'GET', '/configs');
    const cuerpo = (await respuesta.json()) as { data: Record<string, unknown>[] };
    expect(cuerpo.data).toHaveLength(1);
    expect(JSON.stringify(cuerpo.data)).not.toContain('sk-');
    expect(JSON.stringify(cuerpo.data)).not.toContain('api_key');
    expect(cuerpo.data[0].baseUrl).toBe('http://localhost:9/v1'); // camelCase, lo que la UI lee
  });

  it('activar una config apaga las demas: elegir es exclusivo', async () => {
    await crearConfig(alice, 'Vieja');
    const nueva = await crearConfig(alice, 'Nueva');
    const vieja = db
      .prepare('SELECT id FROM ai_configs WHERE name = ?')
      .get('Vieja') as { id: string };

    await call(alice, 'PATCH', `/configs/${vieja.id}`, { isActive: true });
    const filas = db
      .prepare('SELECT name, is_active FROM ai_configs ORDER BY created_at, rowid')
      .all() as { name: string; is_active: number }[];
    expect(filas).toEqual([
      { name: 'Vieja', is_active: 1 },
      { name: 'Nueva', is_active: 0 }
    ]);
    expect(nueva.isActive).toBe(true); // lo que devolvio el alta, antes del cambio
  });
});

describe('POST /test-connection', () => {
  it('la config guardada se prueba con el JSON dado, y el estado queda en la fila', async () => {
    const config = await crearConfig(alice, 'Local');
    stubDelProveedor('{"status":"ok","message":"conexión establecida"}');

    const respuesta = await call(alice, 'POST', '/test-connection', { configId: config.id });
    expect(respuesta.status).toBe(200);
    const cuerpo = await data(respuesta);
    expect(cuerpo.success).toBe(true);
    expect(cuerpo.model).toBe('gpt-5');
    expect(typeof cuerpo.latency).toBe('number');

    const fila = db
      .prepare('SELECT test_status, test_error FROM ai_configs WHERE id = ?')
      .get(config.id) as { test_status: string | null; test_error: string | null };
    expect(fila.test_status).toBe('success');
    expect(fila.test_error).toBeNull();
  });

  it('el modelo que no devuelve el JSON pedido suspende la prueba, con su error en la fila', async () => {
    const config = await crearConfig(alice, 'Local');
    stubDelProveedor('Hello! How can I help you today?');

    const respuesta = await call(alice, 'POST', '/test-connection', { configId: config.id });
    const cuerpo = await data(respuesta);
    expect(cuerpo.success).toBe(false);
    expect(cuerpo.error).toContain('no devolvió el JSON pedido');

    const fila = db
      .prepare('SELECT test_status, test_error FROM ai_configs WHERE id = ?')
      .get(config.id) as { test_status: string | null; test_error: string | null };
    expect(fila.test_status).toBe('failed');
    expect(fila.test_error).toContain('no devolvió el JSON pedido');
  });

  it('se puede probar desde el formulario (sin guardar): el veredicto si, la fila no', async () => {
    stubDelProveedor('{"status":"ok","message":"conexión establecida"}');

    const respuesta = await call(alice, 'POST', '/test-connection', {
      baseUrl: 'http://localhost:9',
      apiKey: 'sk-x',
      model: 'gpt-5'
    });
    expect(respuesta.status).toBe(200);
    const cuerpo = await data(respuesta);
    expect(cuerpo.success).toBe(true);

    // Sin configId no hay fila que tocar: la casa aun no ha guardado nada.
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM ai_configs').get() as { n: number }).n
    ).toBe(0);
  });

  it('sin configId y sin datos de formulario no hay prueba que hacer', async () => {
    const respuesta = await call(alice, 'POST', '/test-connection', {});
    expect(respuesta.status).toBe(400);
  });
});
