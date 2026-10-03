import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import jwt from 'jsonwebtoken';

/**
 * La despensa y los dias de caducidad (HOGARIA-SPEC §12h).
 *
 * `expiration_date` guarda un dia (`2026-12-31`), y los filtros lo comparaban con
 * `datetime('now')`: en orden lexicografico «2026-12-31» es MENOR que «2026-12-31 10:50:08»,
 * asi que lo que caduca HOY contaba como caducado desde la primera hora del dia y desaparecia
 * del «caduca en 3 dias». Se prueba aqui porque el frontend ya no puede taparlo: la cuenta la
 * hace el SQL.
 */

process.env.DATABASE_PATH = ':memory:';
process.env.NODE_ENV = 'test';

type Sql = import('better-sqlite3').Database;

let app: Hono;
let db: Sql;
let closeDatabase: () => void;
let alice: { id: string; token: string };

async function makeUser(email: string) {
  const id = `u-${email.split('@')[0]}`;
  db.prepare('INSERT INTO users (id, email, name, password_hash, household_id) VALUES (?, ?, ?, ?, ?)').run(
    id,
    email,
    'Cocinero',
    'hash',
    null
  );
  const config = await import('../config/app.config.js');
  return { id, token: jwt.sign({ sub: id, email }, config.config.auth.jwtSecret, { expiresIn: '1h' }) };
}

function call(method: string, path: string, body?: unknown) {
  return app.request(`/api/pantry${path}`, {
    method,
    headers: {
      authorization: `Bearer ${alice.token}`,
      'content-type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

const data = async (response: Response): Promise<any> => ((await response.json()) as any).data;

/** La coleccion sale bajo `ingredients`; se acepta tambien `items` para no partirse una
 *  segunda vez si la ruta decide llamarla como el resto. */
const namesOf = (payload: any): string[] => (payload?.ingredients ?? payload?.items ?? []).map((entry: any) => entry.name);

/** El dia de hoy como lo escribe un `<input type="date">`. */
function dayFromNow(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

async function addIngredient(name: string, expirationDate: string | null) {
  const response = await call('POST', '/ingredients', {
    name,
    category: 'dairy',
    quantity: 1,
    unit: 'unit',
    location: 'fridge',
    ...(expirationDate ? { expirationDate } : {})
  });
  expect(response.status).toBe(201);
  return await data(response);
}

beforeAll(async () => {
  const database = await import('../config/database.js');
  await database.initializeDatabase();
  db = database.getDatabase();
  closeDatabase = database.closeDatabase;

  const { pantryRoutes } = await import('./pantry.routes.js');
  const { errorHandler } = await import('../middleware/error.middleware.js');
  const { timestampMiddleware } = await import('../middleware/timestamp.middleware.js');
  app = new Hono();
  app.onError(errorHandler as never);
  app.use('/api/*', timestampMiddleware());
  app.route('/api/pantry', pantryRoutes);
});

afterAll(() => closeDatabase?.());

beforeEach(async () => {
  db.exec('DELETE FROM ingredients;');
  alice = await makeUser(`alice-${Math.random().toString(36).slice(2)}@test.local`);
});

describe('dias de caducidad', () => {
  it('lo que caduca hoy no esta caducado y si entra en «próximos 3 días»', async () => {
    await addIngredient('Yogur natural', dayFromNow(0));

    const expired = await data(await call('GET', '/ingredients?expired=true'));
    expect(namesOf(expired)).toEqual([]);

    const soon = await data(await call('GET', '/ingredients?expiringSoon=true'));
    const names = namesOf(soon);
    expect(names).toContain('Yogur natural');

    const stats = await data(await call('GET', '/ingredients/stats'));
    expect(stats.expired).toBe(0);
    expect(stats.expiringSoon).toBe(1);
  });

  it('lo que caduco ayer si esta caducado, y no en los proximos tres dias', async () => {
    await addIngredient('Leche del lunes', dayFromNow(-1));

    const expired = await data(await call('GET', '/ingredients?expired=true'));
    expect(namesOf(expired)).toContain('Leche del lunes');

    const stats = await data(await call('GET', '/ingredients/stats'));
    expect(stats.expired).toBe(1);
    expect(stats.expiringSoon).toBe(0);
  });

  it('lo que caduca en cuatro dias no entra en ningun aviso', async () => {
    await addIngredient('Aceitunas', dayFromNow(4));
    const stats = await data(await call('GET', '/ingredients/stats'));
    expect(stats.expiringSoon).toBe(0);
    expect(stats.expired).toBe(0);
  });

  it('el dia se guarda y se devuelve como dia: ni hora ni zona', async () => {
    const today = dayFromNow(2);
    const created = await addIngredient('Queso curado', today);
    // Una `Z` aqui convertida en instante moveria la caducidad media jornada, y «mañana»
    // pasaria a ser «hoy» en media Europa.
    expect(created.expirationDate ?? created.expiration_date).toBe(today);
  });

  it('un ingrediente con lo minimo que pide la pantalla se guarda, y lo opcional no existe', async () => {
    // La pantalla marca como obligatorio Nombre y Cantidad; caducidad, notas, foto y codigo de
    // barras se pueden dejar sin tocar. Es la misma queja del usuario, en otra pantalla: aqui el
    // riesgo no era un 400 (eso lo cubre el contrato de schemas) sino un 500, porque el INSERT liga
    // cada campo a mano y un `undefined` en better-sqlite3 no se convierte en NULL: revienta.
    const response = await call('POST', '/ingredients', {
      name: 'Pimentón de la Vera',
      quantity: 1,
      category: 'other',
      unit: 'unit'
    });
    expect(response.status).toBe(201);
    const saved = await data(response);
    const column = (row: any, camel: string, snake: string) => row[camel] ?? row[snake] ?? null;
    expect(column(saved, 'expirationDate', 'expiration_date')).toBeNull();
    expect(saved.notes ?? null).toBeNull();

    // Escribir la caducidad y luego vaciarla: `null` borra, `undefined` no toca.
    const withDate = await data(await call('PATCH', `/ingredients/${saved.id}`, { expirationDate: dayFromNow(3) }));
    expect(column(withDate, 'expirationDate', 'expiration_date')).toBe(dayFromNow(3));
    const cleared = await data(await call('PATCH', `/ingredients/${saved.id}`, { expirationDate: null }));
    expect(column(cleared, 'expirationDate', 'expiration_date')).toBeNull();
    // Y una clave ausente en el mismo PATCH no se lleva por delante las notas escritas antes.
    const noted = await data(await call('PATCH', `/ingredients/${saved.id}`, { notes: 'para el gazpacho' }));
    expect(noted.notes).toBe('para el gazpacho');
    const untouched = await data(await call('PATCH', `/ingredients/${saved.id}`, { quantity: 2 }));
    expect(untouched.notes).toBe('para el gazpacho');
  });
});

describe('el stepper de la fila puede bajar a 0 (## 12aa)', () => {
  it('quantity 0 se guarda, la casilla vacia cae a 0 y la fila no se borra', async () => {
    // El visor promete que bajar a 0 devuelve el articulo a «lo que la casa conoce» sin borrarlo. El alta
    // exige >= 1 (la cantidad vacia no es un ingrediente, es una sugerencia), pero el stepper necesita
    // escribir el 0 por el PATCH de toda la vida, que era `formPartial(create)` y se comia el `.positive()`
    // del alta: la fila se quedaba en 1 sin decir nada (el 400 no tenia ni destinatario en el cliente).
    const saved = await data(await call('POST', '/ingredients', {
      name: 'Tomate sin botes', quantity: 1, category: 'other', unit: 'g'
    }));
    const cero = await data(await call('PATCH', `/ingredients/${saved.id}`, { quantity: 0 }));
    expect(cero.quantity).toBe(0);
    // `null` —la casilla vaciada a mano— cae a 0: «sin existencias» es lo mismo que 0 aqui, y la columna
    // es NOT NULL, asi que el hueco tiene que elegir un lado. Elige el 0, no el 500.
    const vacio = await data(await call('PATCH', `/ingredients/${saved.id}`, { quantity: null, notes: 'el ultimo bote, al armario' }));
    expect(vacio.quantity).toBe(0);
    expect(vacio.notes).toBe('el ultimo bote, al armario');
    // Y la fila sigue viva: el 0 la mueve de seccion, no de tabla.
    const lista = await data(await call('GET', '/ingredients'));
    expect(namesOf(lista)).toContain('Tomate sin botes');
  });
});
