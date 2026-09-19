import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
import { calendarRoutes } from './calendar.routes.js';

/**
 * Las sueltas del calendario de la casa, sobre una BD en memoria real. Lo que interesa
 * aqui no es el INSERT: es quien ve que (la casa compartida y la que no se compartio),
 * quien puede tocar (solo el autor), y que una comida NO pueda escribirse por esta via.
 */

process.env.DATABASE_PATH = ':memory:';
process.env.NODE_ENV = 'test';

type Sql = import('better-sqlite3').Database;

let app: Hono;
let db: Sql;
let closeDatabase: () => void;

async function makeUser(id: string, householdId: string | null, name = 'Alguien') {
  const email = `${id}@hogaria.test`;
  db.prepare('INSERT INTO users (id, email, name, password_hash, household_id) VALUES (?, ?, ?, ?, ?)').run(
    id,
    email,
    name,
    'hash',
    householdId
  );
  const config = await import('../config/app.config.js');
  const token = jwt.sign({ sub: id, email }, config.config.auth.jwtSecret, { expiresIn: '1h' });
  return { id, email, token };
}

type User = { id: string; email: string; token: string };

function call(user: User, method: string, path: string, body?: unknown) {
  return app.request(`/api/calendar${path}`, {
    method,
    headers: {
      authorization: `Bearer ${user.token}`,
      'content-type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

/** Igual que en la compra: `Response.json()` es `unknown` y aqui se ancha una vez. */
async function data(response: Response) {
  const body = (await response.json()) as any;
  if (body?.success !== true) throw new Error(`respuesta inesperada: ${JSON.stringify(body)}`);
  return body.data;
}

describe('calendario de la casa (§8f)', () => {
  const householdId = 'hh-cal';

  beforeAll(async () => {
    const database = await import('../config/database.js');
    await database.initializeDatabase();
    closeDatabase = database.closeDatabase;
    db = database.getDatabase();
    app = new Hono();
    app.route('/api/calendar', calendarRoutes);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(() => {
    // Orden inverso a las FK: primero las sueltas, luego las cuentas, luego la casa.
    // Borrar TODO (y no solo lo de esta suite) es lo que permite repetir el mismo id
    // en cada test y leer el fallo sin ambiguedad cuando algo se queda atras.
    for (const sql of ['DELETE FROM calendar_events', 'DELETE FROM meals', 'DELETE FROM users', 'DELETE FROM households']) {
      db.prepare(sql).run();
    }
    db.prepare('INSERT INTO households (id, name, invite_code) VALUES (?, ?, ?)').run(householdId, 'La casa', 'CALTEST1');
  });

  const event = {
    title: 'Carpinteria: medir el pasillo',
    kind: 'home',
    date: '2026-03-11',
    startTime: '17:30',
    endTime: '18:15'
  } as const;

  it('crea, lee y borra una suelta', async () => {
    const alice = await makeUser('cal-alice', householdId, 'Alice');
    const created = (await data(await call(alice, 'POST', '/events', { ...event, sharedWithHousehold: true }))) as any;
    expect(created.id).toBeTruthy();
    expect(created.allDay).toBe(false);
    expect(created.editable).toBe(true);

    const list = await data(await call(alice, 'GET', '/events?from=2026-03-01&to=2026-03-31'));
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe(event.title);
    // El nombre de quien la escribio viaja en la lectura: es lo que pinta la burbuja.
    expect(list[0].authorName).toBe('Alice');

    expect((await call(alice, 'DELETE', `/events/${created.id}`)).status).toBe(200);
    expect(await data(await call(alice, 'GET', '/events?from=2026-03-01&to=2026-03-31'))).toEqual([]);
  });

  it('la casa ve la suelta compartida, y la que no se compartio no', async () => {
    const alice = await makeUser('cal-alice', householdId, 'Alice');
    const bob = await makeUser('cal-bob', householdId, 'Bob');
    await call(alice, 'POST', '/events', { ...event, sharedWithHousehold: true });
    const privateOne = (await data(await call(alice, 'POST', '/events', { ...event, title: 'Mi dentista' }))) as any;
    // Al crear no se devuelve el nombre de quien escribe: quien llama ya lo sabe, y la
    // lectura es el sitio donde el nombre interesa (es de otra persona).
    expect(privateOne.authorName).toBeNull();

    const seen = await data(await call(bob, 'GET', '/events?from=2026-03-01&to=2026-03-31'));
    expect(seen.map((e: any) => e.title)).toEqual([event.title]);
    expect(seen[0].editable).toBe(false);
    expect(await data(await call(alice, 'GET', '/events?from=2026-03-01&to=2026-03-31'))).toHaveLength(2);
  });

  it('ver el evento de otra persona no es poder reescribirlo', async () => {
    const alice = await makeUser('cal-alice', householdId, 'Alice');
    const bob = await makeUser('cal-bob', householdId, 'Bob');
    const created = (await data(await call(alice, 'POST', '/events', { ...event, sharedWithHousehold: true }))) as any;

    const patch = await call(bob, 'PATCH', `/events/${created.id}`, { title: 'Ya no vengo' });
    expect(patch.status).toBe(403);
    expect(((await patch.json()) as any).message).toBe('FORBIDDEN');
    expect((await call(bob, 'DELETE', `/events/${created.id}`)).status).toBe(403);
    expect(((await data(await call(alice, 'GET', '/events?from=2026-03-01&to=2026-03-31')))[0].title)).toBe(event.title);
  });

  it('el filtro de tipos deja pintar solo lo que interesa', async () => {
    const alice = await makeUser('cal-alice', householdId, 'Alice');
    await call(alice, 'POST', '/events', { ...event, sharedWithHousehold: true });
    await call(alice, 'POST', '/events', { title: 'Comprar velas', kind: 'shopping', date: '2026-03-12', allDay: 1 });
    await call(alice, 'POST', '/events', { title: 'Cumple', kind: 'personal', date: '2026-03-13' });

    const home = await data(await call(alice, 'GET', '/events?from=2026-03-01&to=2026-03-31&kinds=home'));
    expect(home.map((e: any) => e.title)).toEqual([event.title]);
    const two = await data(await call(alice, 'GET', '/events?from=2026-03-01&to=2026-03-31&kinds=home,shopping'));
    expect(two).toHaveLength(2);
    // Las de todo el dia van delante: en el dia se pintan como franja completa y si no,
    // quedan debajo de las horas, que es lo que hace legible la columna.
    expect(two[1].allDay).toBe(true);
  });

  it('una comida no se cuela por aqui: la manda el plan', async () => {
    const alice = await makeUser('cal-alice', householdId, 'Alice');
    const response = await call(alice, 'POST', '/events', { title: 'Cena', kind: 'meal', date: '2026-03-11' });
    expect(response.status).toBe(400);
    expect(((await response.json()) as any).message).toBe('MEAL_COMES_FROM_THE_PLAN');
  });

  it('rechaza horas absurdas y fechas sin formato', async () => {
    const alice = await makeUser('cal-alice', householdId, 'Alice');
    expect((await call(alice, 'POST', '/events', { ...event, endTime: '17:00' })).status).toBe(400);
    expect((await call(alice, 'POST', '/events', { ...event, startTime: '25:00' })).status).toBe(400);
    expect((await call(alice, 'POST', '/events', { ...event, date: '11/03/2026' })).status).toBe(400);
    expect((await call(alice, 'POST', '/events', { ...event, title: '   ' })).status).toBe(400);
    expect((await call(alice, 'POST', '/events', { ...event, color: 'rojo' })).status).toBe(400);
    // `to` falta: sin ventana no hay forma razonable de responder, y devolver todo
    // seria el peor comportamiento posible para un endpoint que se paga en milisegundos.
    expect((await call(alice, 'GET', '/events?from=2026-03-01')).status).toBe(400);
  });

  it('marcar todo el dia borra las horas, y el PATCH no toca lo que no se mando', async () => {
    const alice = await makeUser('cal-alice', householdId, 'Alice');
    const created = (await data(await call(alice, 'POST', '/events', event))) as any;
    expect(created.startTime).toBe('17:30');

    const updated = (await data(await call(alice, 'PATCH', `/events/${created.id}`, { allDay: true }))) as any;
    expect(updated.allDay).toBe(true);
    expect(updated.startTime).toBeNull();
    expect(updated.endTime).toBeNull();
    // El titulo sigue ahi: un PATCH parcial no borra lo que no se menciona.
    expect(updated.title).toBe(event.title);
  });

  it('fuera de la ventana no se devuelve nada, aunque el evento exista', async () => {
    const alice = await makeUser('cal-alice', householdId, 'Alice');
    await call(alice, 'POST', '/events', event);
    expect(await data(await call(alice, 'GET', '/events?from=2026-04-01&to=2026-04-30'))).toEqual([]);
  });

  it('sin token no hay calendario de la casa', async () => {
    const response = await app.request('/api/calendar/events?from=2026-03-01&to=2026-03-31');
    expect(response.status).toBe(401);
  });
});
