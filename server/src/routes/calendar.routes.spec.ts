import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
// Las rutas se importan DENTRO de `beforeAll`, y no arriba: una importacion estatica arrastra
// `config/app.config.js`, que lee DATABASE_PATH al evaluarse —antes de la linea que lo pone a
// `:memory:`— y la prueba acaba escribiendo en la BD de desarrollo del repositorio. Era la única
// spec de rutas con este descuido, y fallaba en cuanto alguien usaba la app en local.

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
    const { calendarRoutes } = await import('./calendar.routes.js');
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
    for (const sql of [
      'DELETE FROM calendar_event_attendees',
      'DELETE FROM calendar_events',
      'DELETE FROM household_members',
      'DELETE FROM meals',
      'DELETE FROM weekly_calendars',
      'DELETE FROM users',
      'DELETE FROM households'
    ]) {
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
    // Y su foto junto a el, para que el «de quien» sea el mismo icono en toda la app.
    expect(list[0].authorAvatar).toBeNull();
    db.prepare(`UPDATE users SET avatar = '/uploads/alice.png' WHERE id = ?`).run(alice.id);
    const conFoto = (await data(await call(alice, 'GET', '/events?from=2026-03-01&to=2026-03-31'))) as any[];
    expect(conFoto[0].authorAvatar).toBe('/uploads/alice.png');

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
    // Las de todo el día van delante: en el día se pintan como franja completa y si no,
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

  /* ── 12o: los huecos de un formulario, y quien entra en el evento ───────────── */

  it('un evento con SOLO lo obligatorio se crea, y lo demas queda vacio de verdad', async () => {
    // El repro del usuario: «da error si no mandas todos los campos», siendo campos que el propio
    // dialog marca como opcionales. Aquí no se manda ninguno de esos.
    const alice = await makeUser('cal-alice', householdId, 'Alice');
    const created = (await data(await call(alice, 'POST', '/events', { title: 'Carpinteria', date: '2026-03-11' }))) as any;
    expect(created.title).toBe('Carpinteria');
    expect(created.kind).toBe('other');
    expect(created.allDay).toBe(true); // sin hora, «todo el dia»: no un evento a medianoche
    for (const field of ['startTime', 'endTime', 'color', 'notes', 'location']) {
      expect(created[field], `${field} deberia estar vacio`).toBeNull();
    }
    // Y se lee por la ventana, que es lo que hace que exista en la rejilla.
    const list = (await data(await call(alice, 'GET', '/events?from=2026-03-01&to=2026-03-31'))) as any[];
    expect(list.map((row) => row.id)).toContain(created.id);
  });

  it('los opcionales admiten null y cadena vacia, que son las formas del hueco', async () => {
    const alice = await makeUser('cal-alice', householdId, 'Alice');
    const shapes = [
      { notes: null, location: null, color: null },
      { notes: '', location: '   ', color: '' },
      { startTime: '', endTime: '', allDay: null, sharedWithHousehold: null }
    ];
    for (const [index, shape] of shapes.entries()) {
      const response = await call(alice, 'POST', '/events', { title: `Forma ${index}`, date: '2026-03-12', ...shape });
      expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
    }
    const rows = (await data(await call(alice, 'GET', '/events?from=2026-03-12&to=2026-03-12'))) as any[];
    expect(rows).toHaveLength(3);
    // Un hueco no se guarda como cadena en blanco: se guarda como «sin valor», que es lo que
    // permite volver a dejarlo vacio después.
    expect(rows.map((row) => row.notes)).toEqual([null, null, null]);
  });

  it('un 400 dice el campo y el motivo, no «Invalid input data»', async () => {
    const alice = await makeUser('cal-alice', householdId, 'Alice');
    const response = await call(alice, 'POST', '/events', { title: '', date: '11-03-2026' });
    expect(response.status).toBe(400);
    const body = (await response.json()) as any;
    expect(body.code).toBe('INVALID_FORM');
    expect(body.message).toMatch(/Titulo/);
    expect(body.issues.map((issue: any) => issue.field)).toContain('date');
  });

  it('quitar la nota con null si la quita (y no es un «guardado» que no toca nada)', async () => {
    const alice = await makeUser('cal-alice', householdId, 'Alice');
    const created = (await data(
      await call(alice, 'POST', '/events', { title: 'Carpinteria', date: '2026-03-11', notes: 'Medir 90 cm' })
    )) as any;
    expect(created.notes).toBe('Medir 90 cm');

    const cleared = (await data(await call(alice, 'PATCH', `/events/${created.id}`, { notes: null }))) as any;
    expect(cleared.notes).toBeNull();
    // Y el resto sigue donde estaba.
    expect(cleared.title).toBe('Carpinteria');
  });

  it('la hora de una comida se puede quitar: el PATCH la escribe, no la ignora', async () => {
    // Dos bugs de una: `time` no estaba en la lista de columnas del PATCH (cambiar la hora no hacfa
    // nada) y con `.optional()` a secas vaciar el campo devolvfa un 400.
    const alice = await makeUser('cal-alice', householdId, 'Alice');
    const created = (await data(
      await call(alice, 'POST', '/meals', { date: '2026-03-11', mealType: 'lunch', customMeal: 'Gazpacho', time: '14:00' })
    )) as any;
    expect(created.time).toBe('14:00');

    const moved = (await data(await call(alice, 'PATCH', `/meals/${created.id}`, { time: '15:30' }))) as any;
    expect(moved.time).toBe('15:30');

    const cleared = (await data(await call(alice, 'PATCH', `/meals/${created.id}`, { time: null }))) as any;
    expect(cleared.time).toBeNull();
  });

  it('las comidas se ordenan por el dia, y la merienda va antes que la cena', async () => {
    const alice = await makeUser('cal-alice', householdId, 'Alice');
    for (const type of ['dinner', 'snack', 'lunch', 'breakfast']) {
      await call(alice, 'POST', '/meals', { date: '2026-03-11', mealType: type, customMeal: `Plato ${type}` });
    }
    const range = (await data(await call(alice, 'GET', '/range?startDate=2026-03-11&endDate=2026-03-11'))) as any;
    expect(range.meals.map((meal: any) => meal.meal_type)).toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
  });

  it('invitar a alguien de la casa le abre el evento, y salirse de el no es borrarlo', async () => {
    const alice = await makeUser('cal-alice', householdId, 'Alice');
    const bob = await makeUser('cal-bob', householdId, 'Bob');
    db.prepare('INSERT INTO household_members (id, household_id, user_id, role) VALUES (?, ?, ?, ?)').run(
      'hm-a',
      householdId,
      alice.id,
      'admin'
    );
    db.prepare('INSERT INTO household_members (id, household_id, user_id, role) VALUES (?, ?, ?, ?)').run(
      'hm-b',
      householdId,
      bob.id,
      'member'
    );

    // Un evento NO compartido con la casa, pero si con Bob: solo lo ve Bob, no «toda la casa».
    const created = (await data(
      await call(alice, 'POST', '/events', {
        title: 'Cita del dentista',
        date: '2026-03-11',
        startTime: '09:00',
        sharedWithHousehold: false,
        attendeeIds: [bob.id]
      })
    )) as any;
    expect(created.attendeeIds).toEqual([bob.id]);

    const seen = (await data(await call(bob, 'GET', '/events?from=2026-03-01&to=2026-03-31'))) as any[];
    expect(seen.map((row) => row.id)).toContain(created.id);
    expect(seen[0].editable).toBe(false);
    expect(seen[0].attendees[0].name).toBe('Bob');
    // El listado tiene que traer la pareja: el dialogo de edicion marca las casillas con `attendeeIds`,
    // y sin el se abria con la cara de Bob pintada y la casilla vacia —guardar sin tocar nada borraba la
    // invitacion. Es el bug que el usuario volvio a reportar, y estaba aqui, no en el POST.
    expect(seen[0].attendeeIds).toEqual([bob.id]);

    // Bob no puede reescribirlo...
    expect((await call(bob, 'PATCH', `/events/${created.id}`, { title: 'Otra cosa' })).status).toBe(403);
    // ...pero si puede salirse de el, y eso lo quita de SU calendario sin borrar el de Alice.
    expect((await call(bob, 'DELETE', `/events/${created.id}/attendees/me`)).status).toBe(200);
    expect(await data(await call(bob, 'GET', '/events?from=2026-03-01&to=2026-03-31'))).toEqual([]);
    const stillThere = (await data(await call(alice, 'GET', '/events?from=2026-03-01&to=2026-03-31'))) as any[];
    expect(stillThere.map((row) => row.id)).toContain(created.id);

    // Y Alice no «se sale» de lo suyo: eso se borra.
    expect((await call(alice, 'DELETE', `/events/${created.id}/attendees/me`)).status).toBe(403);
  });

  it('invitar a quien no es de la casa se dice, no se traga', async () => {
    const alice = await makeUser('cal-alice', householdId, 'Alice');
    const response = await call(alice, 'POST', '/events', {
      title: 'Cita',
      date: '2026-03-11',
      attendeeIds: ['no-existe']
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as any;
    expect(body.code).toBe('ATTENDEE_NOT_IN_HOUSEHOLD');
    expect(body.data.rejected).toEqual(['no-existe']);
  });

  it('quitar a todos los invitados con una lista vacia funciona', async () => {
    const alice = await makeUser('cal-alice', householdId, 'Alice');
    const bob = await makeUser('cal-bob', householdId, 'Bob');
    db.prepare('INSERT INTO household_members (id, household_id, user_id, role) VALUES (?, ?, ?, ?)').run(
      'hm-b',
      householdId,
      bob.id,
      'member'
    );
    const created = (await data(
      await call(alice, 'POST', '/events', { title: 'Mudanza', date: '2026-03-14', attendeeIds: [bob.id] })
    )) as any;
    expect(await data(await call(bob, 'GET', '/events?from=2026-03-01&to=2026-03-31'))).toHaveLength(1);

    const updated = (await data(await call(alice, 'PATCH', `/events/${created.id}`, { attendeeIds: [] }))) as any;
    expect(updated.attendeeIds).toEqual([]);
    // ...y el proximo listado ya no la trae: una lectura que no refleja el vaciado es un guardado que
    // el usuario dara por perdido.
    const after = (await data(await call(alice, 'GET', '/events?from=2026-03-09&to=2026-03-15'))) as any[];
    expect(after.find((event) => event.id === created.id)?.attendeeIds).toEqual([]);
    expect(await data(await call(bob, 'GET', '/events?from=2026-03-01&to=2026-03-31'))).toEqual([]);
  });
});
