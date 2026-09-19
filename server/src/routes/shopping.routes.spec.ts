import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import jwt from 'jsonwebtoken';

/**
 * Lista de la compra y precios, sobre una BD en memoria real (nada de mocks de
 * SQL): lo que se quiere probar aqui es la interaccion entre el CAS de la lista,
 * el dedupeo por clave normalizada, el borrado logico que sostiene el «Deshacer»
 * y las unidades del dinero. Un mock no se entera de ninguna de esas cuatro.
 */

process.env.DATABASE_PATH = ':memory:';
process.env.NODE_ENV = 'test';

type Sql = import('better-sqlite3').Database;

let app: Hono;
let db: Sql;
let closeDatabase: () => void;

/** Usuario nuevo + token firmado, que es lo que hace `authMiddleware`. */
async function makeUser(email: string, householdId: string | null = null) {
  const id = `u-${email.split('@')[0]}`;
  db.prepare('INSERT INTO users (id, email, name, password_hash, household_id) VALUES (?, ?, ?, ?, ?)').run(
    id,
    email,
    'Comprador',
    'hash',
    householdId
  );
  const config = await import('../config/app.config.js');
  const token = jwt.sign({ sub: id, email }, config.config.auth.jwtSecret, { expiresIn: '1h' });
  return { id, token };
}

type User = { id: string; token: string };

function call(user: User, method: string, path: string, body?: unknown) {
  return app.request(`/api/shopping${path}`, {
    method,
    headers: {
      authorization: `Bearer ${user.token}`,
      'content-type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

/** `Response.json()` es `unknown` en TS; aqui se ancha a `any` una vez y se
 *  leen campos de payloads que la propia prueba construye. */
const json = async (response: Response): Promise<any> => await response.json();
const data = async (response: Response): Promise<any> => (await json(response)).data;

let alice: User;
let bob: User;

beforeEach(async () => {
  db.exec(
    'DELETE FROM shopping_list_discounts; DELETE FROM shopping_list_items; DELETE FROM price_observations; DELETE FROM shopping_lists; DELETE FROM shopping_categories;'
  );
  alice = await makeUser(`alice-${Math.random().toString(36).slice(2)}@test.local`);
  bob = await makeUser(`bob-${Math.random().toString(36).slice(2)}@test.local`);
});

beforeAll(async () => {
  const database = await import('../config/database.js');
  await database.initializeDatabase();
  db = database.getDatabase();
  closeDatabase = database.closeDatabase;

  const { shoppingRoutes } = await import('./shopping.routes.js');
  const { errorHandler } = await import('../middleware/error.middleware.js');
  app = new Hono();
  app.onError(errorHandler as never);
  app.route('/api/shopping', shoppingRoutes);
});

afterAll(() => closeDatabase?.());

async function createList(user: User, name = 'Compra semana') {
  const response = await call(user, 'POST', '/lists', { name });
  return await data(response);
}

describe('/lists', () => {
  it('crea y lee una lista con su version inicial y sus totales a cero', async () => {
    const list = await createList(alice);

    expect(list.name).toBe('Compra semana');
    expect(list.version).toBe(1);
    expect(list.status).toBe('active');
    expect(list.totalItems).toBe(0);

    const fetched = await data(await call(alice, 'GET', `/lists/${list.id}`));
    expect(fetched.items).toEqual([]);
  });

  it('requiere autenticacion', async () => {
    const response = await app.request('/api/shopping/lists');
    expect(response.status).toBe(401);
  });

  it('no muestra a nadie la lista de otro usuario', async () => {
    const list = await createList(alice);

    expect((await call(bob, 'GET', `/lists/${list.id}`)).status).toBe(404);
    expect((await call(bob, 'DELETE', `/lists/${list.id}`)).status).toBe(404);
    const visible = await data(await call(bob, 'GET', '/lists'));
    expect(visible).toEqual([]);
  });

  it('filtra por estado y por busqueda, y paginacion acotada', async () => {
    await createList(alice, 'Fruta');
    await createList(alice, 'Limpieza');
    const done = await createList(alice, 'Vacaciones');
    await call(alice, 'PATCH', `/lists/${done.id}`, { status: 'done', version: done.version });

    // `updated_at` es CURRENT_TIMESTAMP (segundos): dos listas creadas en la misma
    // segunda empatan, y el empate se rompe por id (nanoid aleatorio), que no
    // significa nada. Se fija el tiempo a mano para probar la regla real:
    // actualizadas hace mas poco primero, y las `done` fuera de la vista comun.
    db.prepare(`UPDATE shopping_lists SET updated_at = '2026-01-01' WHERE name = 'Fruta'`).run();
    db.prepare(`UPDATE shopping_lists SET updated_at = '2026-01-02' WHERE name = 'Limpieza'`).run();

    const active = await data(await call(alice, 'GET', '/lists'));
    expect(active.map((l: any) => l.name)).toEqual(['Limpieza', 'Fruta']);

    const buscada = await data(await call(alice, 'GET', '/lists?q=frut'));
    expect(buscada).toHaveLength(1);

    const terminadas = await data(await call(alice, 'GET', '/lists?status=done'));
    expect(terminadas.map((l: any) => l.name)).toEqual(['Vacaciones']);

    // `limit` fuera de rango se acota, no se propaga a SQL.
    const limited = await call(alice, 'GET', '/lists?limit=99999&offset=-4');
    expect(limited.ok).toBe(true);
    expect((await json(limited)).meta.limit).toBeLessThanOrEqual(200);
  });

  it('toca el nombre con CAS y rechaza la version rancia', async () => {
    const list = await createList(alice);

    const ok = await data(await call(alice, 'PATCH', `/lists/${list.id}`, { name: 'Compra + pan', version: 1 }));
    expect(ok.version).toBe(2);

    // Un body solo se lee una vez: releerlo daria 'Body has already been read'.
    const stale = await json(await call(alice, 'PATCH', `/lists/${list.id}`, { name: 'Choque', version: 1 }));
    expect(stale.message).toBe('LIST_VERSION_CONFLICT');
    expect(stale.data.currentVersion).toBe(2);
  });

  it('sin campos que cambiar no escribe nada', async () => {
    const list = await createList(alice);
    const response = await call(alice, 'PATCH', `/lists/${list.id}`, { version: 1 });
    expect(response.status).toBe(400);
  });

  it('borrar la lista se lleva los items y deja los precios aprendidos', async () => {
    const list = await createList(alice);
    const milk = await data(await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Leche', priceMinor: 85 }));
    // Solo lo COMPRADO aprende precio: una linea pendiente no es un dato de mercado.
    await call(alice, 'PATCH', `/lists/${list.id}/items/${milk.id}`, { checked: true });
    const completed = await call(alice, 'POST', `/lists/${list.id}/complete`);
    expect((await json(completed)).data.pricesRecorded).toBe(1);

    expect((await call(alice, 'DELETE', `/lists/${list.id}`)).ok).toBe(true);
    expect(db.prepare('SELECT COUNT(*) AS c FROM shopping_list_items').get()).toEqual({ c: 0 });
    // El precio es conocimiento del hogar: sobrevive a la lista que lo vio nacer.
    expect(db.prepare('SELECT COUNT(*) AS c FROM price_observations').get()).toEqual({ c: 1 });
  });
});

describe('/lists/:id/items', () => {
  it('añade una linea con su clave normalizada y al final del orden', async () => {
    const list = await createList(alice);

    const first = await data(await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Tomate', quantity: 2 }));
    const second = await data(await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Leche' }));

    expect(first.product_key).toBe('tomate');
    expect(first.position).toBe(0);
    expect(second.position).toBe(1);
    expect(first.merged).toBe(false);
  });

  it('repetir producto suma la cantidad en vez de duplicar la fila', async () => {
    const list = await createList(alice);
    await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Leche', quantity: 1 });

    const again = await data(await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'LECHE ', quantity: 2 }));
    expect(again.merged).toBe(true);
    expect(again.quantity).toBe(3);

    const items = (await data(await call(alice, 'GET', `/lists/${list.id}`))).items;
    expect(items).toHaveLength(1);
  });

  it('la unidad distingue la linea (1L y 500ml no son el mismo precio)', async () => {
    const list = await createList(alice);
    await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Leche', unit: '1L' });
    const other = await data(await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Leche', unit: '500ml' }));

    expect(other.merged).toBe(false);
  });

  it('rechaza cantidades imposibles', async () => {
    const list = await createList(alice);

    for (const quantity of [0, -1, 'NaN', 99999]) {
      const response = await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Leche', quantity });
      expect([400, 500]).toContain(response.status);
    }
  });

  it('pega texto con cantidades y dedupea contra lo que ya esta', async () => {
    const list = await createList(alice);
    await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Leche', quantity: 1 });

    const result = await data(
      await call(alice, 'POST', `/lists/${list.id}/items/bulk`, {
        lines: '- 2 Leche\n1kg Tomates de colgar\n\n  \n3 huevos\n'
      })
    );

    expect(result.added.map((i: any) => i.name)).toEqual(['Tomates de colgar', 'huevos']);
    expect(result.added.map((i: any) => [i.quantity, i.unit])).toEqual([
      [1, 'kg'],
      [3, null]
    ]);
    expect(result.added).toHaveLength(2);
    expect(result.merged).toHaveLength(1);
    expect(result.skipped).toEqual([]);

    const items = (await data(await call(alice, 'GET', `/lists/${list.id}`))).items;
    const leche = items.find((i: any) => i.product_key === 'leche');
    expect(leche.quantity).toBe(3);
  });

  it('marcar y desmarcar acepta las formas que manda la UI', async () => {
    const list = await createList(alice);
    const item = await data(await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Pan' }));

    for (const value of [true, 'true', '1', 'on', 1]) {
      const checked = await data(await call(alice, 'PATCH', `/lists/${list.id}/items/${item.id}`, { checked: value }));
      expect(checked.checked).toBe(1);
    }
    for (const value of [false, 'false', '0', 'off', 0]) {
      const unchecked = await data(
        await call(alice, 'PATCH', `/lists/${list.id}/items/${item.id}`, { checked: value })
      );
      expect(unchecked.checked).toBe(0);
    }

    // El 1/0 entero es la forma que la UI reenvia (leyo la columna asi); un 2 no es
    // un «true» generico, es un dato malo, y tiene que decirlo.
    const nonsense = await call(alice, 'PATCH', `/lists/${list.id}/items/${item.id}`, { checked: 2 });
    expect(nonsense.status).toBe(400);
  });

  it('borrar es logico y se puede deshacer', async () => {
    const list = await createList(alice);
    const item = await data(await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Aceitunas' }));

    const removed = await call(alice, 'DELETE', `/lists/${list.id}/items/${item.id}`);
    expect(removed.ok).toBe(true);

    const visible = (await data(await call(alice, 'GET', `/lists/${list.id}`))).items;
    expect(visible).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS c FROM shopping_list_items').get()).toEqual({ c: 1 });

    const restored = await data(await call(alice, 'POST', `/lists/${list.id}/items/${item.id}/restore`));
    expect(restored.deleted_at).toBeNull();

    // Borrar dos veces no es un 500 ni un éxito: es que ya no está.
    await call(alice, 'DELETE', `/lists/${list.id}/items/${item.id}`);
    expect((await call(alice, 'DELETE', `/lists/${list.id}/items/${item.id}`)).status).toBe(404);
  });

  it('quitar lo comprado deja lo pendiente', async () => {
    const list = await createList(alice);
    const a = await data(await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Pan' }));
    await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Leche' });
    await call(alice, 'PATCH', `/lists/${list.id}/items/${a.id}`, { checked: true });

    const result = await data(await call(alice, 'POST', `/lists/${list.id}/clear-checked`));
    expect(result.removed).toBe(1);

    const items = (await data(await call(alice, 'GET', `/lists/${list.id}`))).items;
    expect(items.map((i: any) => i.name)).toEqual(['Leche']);
  });

  it('reordena con el orden completo y avisa de lo que no es de la lista', async () => {
    const list = await createList(alice);
    const one = await data(await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Uno' }));
    const two = await data(await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Dos' }));
    const fresh = await data(await call(alice, 'GET', `/lists/${list.id}`));

    const reordered = await call(alice, 'PUT', `/lists/${list.id}/order`, {
      itemIds: [two.id, one.id],
      version: fresh.version
    });
    expect(reordered.ok).toBe(true);
    const items = (await data(await call(alice, 'GET', `/lists/${list.id}`))).items;
    expect(items.map((i: any) => i.position)).toEqual([0, 1]);
    expect(items[0].name).toBe('Dos');

    const stranger = await call(bob, 'PUT', `/lists/${list.id}/order`, { itemIds: [one.id], version: fresh.version });
    expect(stranger.status).toBe(404);

    const mixed = await call(alice, 'PUT', `/lists/${list.id}/order`, {
      itemIds: [one.id, 'no-existe'],
      version: (await data(await call(alice, 'GET', `/lists/${list.id}`))).version
    });
    expect(mixed.status).toBe(400);
    expect((await json(mixed)).data.unknown).toEqual(['no-existe']);
  });
});

describe('precios y estimacion', () => {
  it('estima con el precio manual por unidad por la cantidad', async () => {
    const list = await createList(alice);
    await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Leche', quantity: 2, priceMinor: 85 });
    await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Aceite', quantity: 1, priceMinor: 650 });

    const estimate = await data(await call(alice, 'GET', `/lists/${list.id}/estimate`));
    expect(estimate.totalMinor).toBe(85 * 2 + 650);
    expect(estimate.pricedLines).toBe(2);
    expect(estimate.unpriced).toEqual([]);
  });

  it('usa el ultimo precio observado cuando la linea no lo lleva', async () => {
    const list = await createList(alice);
    await call(alice, 'POST', `/prices`, { productName: 'Leche semi', priceMinor: 170, quantity: 2 });
    await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'LECHE SEMI', quantity: 3 });

    const estimate = await data(await call(alice, 'GET', `/lists/${list.id}/estimate`));
    expect(estimate.lines[0]).toMatchObject({ source: 'observed', unitMinor: 85, lineTotalMinor: 255 });
    expect(estimate.totalMinor).toBe(255);
  });

  it('dice sin precio en vez de inventar un cero', async () => {
    const list = await createList(alice);
    await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Producto misterioso' });

    const estimate = await data(await call(alice, 'GET', `/lists/${list.id}/estimate`));
    expect(estimate.totalMinor).toBe(0);
    expect(estimate.unpriced).toEqual(['Producto misterioso']);
    expect(estimate.lines[0].lineTotalMinor).toBeNull();
  });

  it('completar la compra aprende los precios (pagado = unidad * cantidad)', async () => {
    const list = await createList(alice);
    const item = await data(await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Café', quantity: 3, priceMinor: 210 }));
    await call(alice, 'PATCH', `/lists/${list.id}/items/${item.id}`, { checked: true });

    const result = await data(await call(alice, 'POST', `/lists/${list.id}/complete`));
    expect(result).toMatchObject({ pricesRecorded: 1, items: 1 });

    const observation = db.prepare('SELECT * FROM price_observations').get() as any;
    expect(observation.price_minor).toBe(630);
    expect(observation.quantity).toBe(3);
    expect(observation.product_key).toBe('cafe');

    const closed = await data(await call(alice, 'GET', `/lists/${list.id}`));
    expect(closed.status).toBe('done');
    expect(closed.completed_at).toBeTruthy();
  });

  it('el precio es del hogar: se comparte y se puede borrar solo el propio', async () => {
    const householdId = 'h-shopping-test';
    db.prepare('DELETE FROM household_members WHERE household_id = ?').run(householdId);
    db.prepare('DELETE FROM households WHERE id = ?').run(householdId);
    db.prepare('INSERT INTO households (id, name, invite_code) VALUES (?, ?, ?)').run(
      householdId,
      'Hogar shared',
      `code-${householdId}`
    );
    alice = await makeUser(`alice-h-${Math.random().toString(36).slice(2)}@test.local`, householdId);
    bob = await makeUser(`bob-h-${Math.random().toString(36).slice(2)}@test.local`, householdId);

    const list = await createList(alice, 'Compra compartida');
    expect((await call(bob, 'GET', `/lists/${list.id}`)).ok).toBe(true);

    await call(alice, 'POST', `/prices`, { productName: 'Galletas', priceMinor: 120 });
    const bobSeesIt = await data(await call(bob, 'GET', '/prices'));
    expect(bobSeesIt.map((o: any) => o.product_name)).toContain('Galletas');

    // Bob no puede borrar lo que observo Alice: la propiedad sigue siendo de quien
    // lo metio aunque el dato se comparta.
    const id = bobSeesIt[0].id;
    expect((await call(bob, 'DELETE', `/prices/${id}`)).status).toBe(404);
    expect((await call(alice, 'DELETE', `/prices/${id}`)).ok).toBe(true);
  });

  it('un precio imposible no entra', async () => {
    const response = await call(alice, 'POST', `/prices`, { productName: 'Leche', priceMinor: -5 });
    expect([400, 500]).toContain(response.status);
    const empty = await call(alice, 'POST', `/prices`, { productName: '', priceMinor: 100 });
    expect([400, 500]).toContain(empty.status);
  });
});

describe('categorias: el inventario de secciones (§8f)', () => {
  it('la primera lectura siembra las por defecto y la segunda no duplica', async () => {
    const first = await data(await call(alice, 'GET', '/categories'));
    expect(first.map((c: any) => c.name)).toContain('Frutas y verduras');
    expect(first.at(-1).name).toBe('Otros');
    expect(first.every((c: any) => /^#[0-9a-f]{6}$/i.test(c.color))).toBe(true);

    const again = await data(await call(alice, 'GET', '/categories'));
    expect(again.length).toBe(first.length);
  });

  it('crear una seccion que ya existe por clave no la duplica', async () => {
    await call(alice, 'GET', '/categories'); // sin catalogo todavia no hay nada que reutilizar
    // El nombre esta escrito de otra forma a proposito: lo que compara es la clave.
    const created = await call(alice, 'POST', '/categories', { name: '  frutas   Y VERDURAS ', color: '#112233' });
    expect(created.status).toBe(200);
    const rows = await data(await call(alice, 'GET', '/categories'));
    expect(rows.filter((c: any) => c.key === 'frutas y verduras')).toHaveLength(1);
    // El color del que ya estaba manda: reutilizar no es re-pintar la seccion de otra persona.
    expect(rows.find((c: any) => c.key === 'frutas y verduras').color).not.toBe('#112233');
  });

  it('una seccion nueva nace con color valido y detras de las demas', async () => {
    const response = await call(alice, 'POST', '/categories', { name: 'Comida para el bebé' });
    expect(response.status).toBe(201);
    const created = await data(response);
    expect(created.key).toBe('comida para el bebe');
    expect(/^#[0-9a-f]{6}$/i.test(created.color)).toBe(true);

    const rows = await data(await call(alice, 'GET', '/categories'));
    expect(rows.at(-1).id).toBe(created.id);
  });

  it('un color que no es hexadecimal no entra', async () => {
    const response = await call(alice, 'POST', '/categories', { name: 'Verde que te quiero', color: 'rojo' });
    expect(response.status).toBe(400);
  });

  it('el catalogo es de quien lo creo: otra cuenta no lo ve ni lo pisa', async () => {
    await call(alice, 'POST', '/categories', { name: 'Seccion de Alice' });
    const bobSees = await data(await call(bob, 'GET', '/categories'));
    expect(bobSees.some((c: any) => c.name === 'Seccion de Alice')).toBe(false);

    // Y bob, que no la tiene, si puede crear la suya con el mismo nombre.
    const bobCreates = await call(bob, 'POST', '/categories', { name: 'Seccion de Alice' });
    expect(bobCreates.status).toBe(201);
  });
});

describe('descuentos y ofertas (§8f)', () => {
  it('la oferta de una linea cambia lo que se paga, no lo que cuesta la unidad', async () => {
    const list = await createList(alice);
    const item = await data(
      await call(alice, 'POST', `/lists/${list.id}/items`, {
        name: 'Cerveza',
        quantity: 6,
        priceMinor: 100,
        offer: { buy: 3, take: 2 }
      })
    );
    expect(item.promo_buy).toBe(3);
    expect(item.promo_take).toBe(2);

    const estimate = await data(await call(alice, 'GET', `/lists/${list.id}/estimate`));
    expect(estimate.lines[0]).toMatchObject({ paidUnits: 4, lineTotalMinor: 400, offerSavingsMinor: 200 });
    expect(estimate.subtotalMinor).toBe(400);
    expect(estimate.totalMinor).toBe(400);
  });

  it('una oferta que no ahorra no se guarda como oferta', async () => {
    const list = await createList(alice);
    const item = await data(
      await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Agua', quantity: 4, offer: { buy: 4, take: 4 } })
    );
    expect(item.promo_buy).toBeNull();
    expect(item.promo_take).toBeNull();
  });

  it('quitar la oferta es un null explicito, no «no hablar de ella»', async () => {
    const list = await createList(alice);
    const item = await data(
      await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Yogur', quantity: 6, priceMinor: 90, offer: { buy: 3, take: 2 } })
    );
    await call(alice, 'PATCH', `/lists/${list.id}/items/${item.id}`, { offer: null });

    const after = (await data(await call(alice, 'GET', `/lists/${list.id}`))).items[0];
    expect(after.promo_buy).toBeNull();

    const estimate = await data(await call(alice, 'GET', `/lists/${list.id}/estimate`));
    expect(estimate.lines[0].paidUnits).toBe(6);
    expect(estimate.subtotalMinor).toBe(540);
  });

  it('el descuento de la lista baja el total y se puede quitar', async () => {
    const list = await createList(alice);
    await call(alice, 'POST', `/lists/${list.id}/items`, { name: 'Pan', quantity: 2, priceMinor: 250 });

    const created = await call(alice, 'PUT', `/lists/${list.id}/discount`, { kind: 'percent', percentBps: 2000 });
    expect(created.status).toBe(200);

    const withDiscount = await data(await call(alice, 'GET', `/lists/${list.id}/estimate`));
    expect(withDiscount.discountMinor).toBe(100);
    expect(withDiscount.totalMinor).toBe(400);
    expect(withDiscount.discount.description).toBe('20 %');

    // El detalle de la lista lo dice tambien, que es donde se pinta el chip.
    const detail = await data(await call(alice, 'GET', `/lists/${list.id}`));
    expect(detail.discountDescription).toBe('20 %');

    await call(alice, 'DELETE', `/lists/${list.id}/discount`);
    const cleared = await data(await call(alice, 'GET', `/lists/${list.id}/estimate`));
    expect(cleared.discount).toBeNull();
    expect(cleared.totalMinor).toBe(500);
  });

  it('un descuento mal formado no entra', async () => {
    const list = await createList(alice);
    expect((await call(alice, 'PUT', `/lists/${list.id}/discount`, { kind: 'percent', percentBps: 20_000 })).status).toBe(400);
    expect((await call(alice, 'PUT', `/lists/${list.id}/discount`, { kind: 'amount' })).status).toBe(400);
    expect(
      (await call(alice, 'PUT', `/lists/${list.id}/discount`, { kind: 'amount', valueMinor: 100, scope: 'firstUnits' }))
        .status
    ).toBe(400);
  });

  it('al cerrar la compra se anota lo pagado, no lo llevado', async () => {
    const list = await createList(alice);
    const item = await data(
      await call(alice, 'POST', `/lists/${list.id}/items`, {
        name: 'Zumo',
        quantity: 6,
        priceMinor: 150,
        offer: { buy: 3, take: 2 }
      })
    );
    await call(alice, 'PATCH', `/lists/${list.id}/items/${item.id}`, { checked: true });
    await call(alice, 'POST', `/lists/${list.id}/complete`);

    // 6 llevadas, 4 pagadas: 600 centimos. Si se anotara «600 por 6», la próxima
    // estimacion diria 100/ud cuando la botella cuesta 150.
    const prices = await data(await call(alice, 'GET', '/prices?q=zumo'));
    expect(prices[0]).toMatchObject({ price_minor: 600, quantity: 4 });
  });
});

describe('bandeja: filtros, orden y paginacion (§8f)', () => {
  async function listWithItem(name: string, opts: { store?: string; price?: number; quantity?: number } = {}) {
    const list = await data(
      await call(alice, 'POST', '/lists', { name, store: opts.store ?? null })
    );
    if (opts.price != null) {
      await call(alice, 'POST', `/lists/${list.id}/items`, {
        name: `Linea de ${name}`,
        quantity: opts.quantity ?? 1,
        priceMinor: opts.price
      });
    }
    return list;
  }

  it('filtra por supermercado y por importe minimo', async () => {
    await listWithItem('Mercadona cara', { store: 'Mercadona', price: 4000 });
    await listWithItem('Mercadona barata', { store: 'Mercadona', price: 500 });
    await listWithItem('Lidl', { store: 'Lidl', price: 9000 });

    const lasDeMercadona = await data(await call(alice, 'GET', '/lists?store=Mercadona'));
    expect(lasDeMercadona.map((l: any) => l.name).sort()).toEqual(['Mercadona barata', 'Mercadona cara']);

    // El importe no pregunta por la tienda: Lidl (90 €) tambien pasa de 30 €.
    const caras = await data(await call(alice, 'GET', '/lists?minTotalMinor=3000'));
    expect(caras.map((l: any) => l.name).sort()).toEqual(['Lidl', 'Mercadona cara']);

    const combo = await data(await call(alice, 'GET', '/lists?store=Mercadona&minTotalMinor=600'));
    expect(combo.map((l: any) => l.name)).toEqual(['Mercadona cara']);
  });

  it('el texto encuentra la lista por lo que hay dentro, no solo por su nombre', async () => {
    await listWithItem('Compra del martes', { price: 100 });
    await listWithItem('Otra lista', { price: 100 });

    const found = await data(await call(alice, 'GET', '/lists?q=Compra del'));
    expect(found).toHaveLength(1);

    const byItem = await data(await call(alice, 'GET', '/lists?q=Otra'));
    expect(byItem.map((l: any) => l.name)).toEqual(['Otra lista']);

    // «Linea de Compra del martes» es el nombre del item: buscar por el item tambien vale.
    const byLine = await data(await call(alice, 'GET', '/lists?q=Linea'));
    expect(byLine.length).toBe(2);
  });

  it('filtra por fechas sobre lo que se toco, no sobre lo que se fundo', async () => {
    // Las fechas se fijan a mano: lo que se prueba es el filtro, y «hoy» cambia de
    // sitio cada vez que corre el reloj de la CI.
    const old = await listWithItem('Vieja');
    const fresh = await listWithItem('Reciente');
    db.prepare(`UPDATE shopping_lists SET updated_at = '2025-01-05 10:00:00' WHERE id = ?`).run(old.id);
    db.prepare(`UPDATE shopping_lists SET updated_at = '2025-03-10 09:00:00' WHERE id = ?`).run(fresh.id);

    const marzo = await data(await call(alice, 'GET', '/lists?from=2025-03-01&to=2025-03-31'));
    expect(marzo.map((l: any) => l.name)).toEqual(['Reciente']);

    const enero = await data(await call(alice, 'GET', '/lists?to=2025-01-31'));
    expect(enero.map((l: any) => l.name)).toEqual(['Vieja']);

    const desde = await data(await call(alice, 'GET', '/lists?from=2025-02-01'));
    expect(desde.map((l: any) => l.name)).toEqual(['Reciente']);
  });

  it('una fecha con otra forma no entra (es un filtro, no un texto libre)', async () => {
    const response = await call(alice, 'GET', '/lists?from=05/03/2025');
    expect(response.status).toBe(400);
  });

  it('ordena por importe y por nombre, y la direccion se invierte', async () => {
    await listWithItem('Barata', { price: 100 });
    await listWithItem('Cara', { price: 9000 });
    await listWithItem('Media', { price: 900 });

    const byTotal = await data(await call(alice, 'GET', '/lists?sort=total&dir=desc'));
    expect(byTotal.map((l: any) => l.name)).toEqual(['Cara', 'Media', 'Barata']);

    const byTotalAsc = await data(await call(alice, 'GET', '/lists?sort=total&dir=asc'));
    expect(byTotalAsc.map((l: any) => l.name)).toEqual(['Barata', 'Media', 'Cara']);

    const byName = await data(await call(alice, 'GET', '/lists?sort=name&dir=asc'));
    expect(byName.map((l: any) => l.name)).toEqual(['Barata', 'Cara', 'Media']);
  });

  it('la paginacion dice el total filtrado, no lo que cabe en la pagina', async () => {
    for (const index of [1, 2, 3, 4]) await listWithItem(`Lista ${index}`);

    const page = await json(await call(alice, 'GET', '/lists?limit=2&offset=0'));
    expect(page.data).toHaveLength(2);
    expect(page.meta).toEqual({ total: 4, limit: 2, offset: 0 });

    const second = await json(await call(alice, 'GET', '/lists?limit=2&offset=2'));
    expect(second.data).toHaveLength(2);
    expect(second.meta.total).toBe(4);

    const filtered = await json(await call(alice, 'GET', '/lists?q=Lista 3&limit=2'));
    expect(filtered.meta.total).toBe(1);
  });

  it('GET /stores devuelve los supermercados con cuantas listas tienen', async () => {
    await listWithItem('Una', { store: 'Ahorramas' });
    await listWithItem('Dos', { store: 'Ahorramas' });
    await listWithItem('Tres', { store: 'Lidl' });
    await listWithItem('Sin tienda');

    const stores = await data(await call(alice, 'GET', '/stores'));
    expect(stores).toEqual([
      { store: 'Ahorramas', lists: 2 },
      { store: 'Lidl', lists: 1 }
    ]);
  });
});
