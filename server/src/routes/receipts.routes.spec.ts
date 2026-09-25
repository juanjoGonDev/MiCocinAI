import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import jwt from 'jsonwebtoken';

/**
 * La lectura de tickets por IA (HOGARIA-SPEC ## 12aj), sin montar un proveedor: lo que se
 * prueba es el ciclo que la IA no puede romper —subir valida la FIRMA del fichero, la cola
 * falla con su codigo cuando no hay configuracion, parar y reintentar dejan el ticket donde
 * toca, la revision edita las lineas, y confirmar registra la tienda, apunta precios y sube
 * la compra al inventario CON la categoria revisada—.
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
  db.prepare(
    'INSERT INTO users (id, email, name, password_hash, household_id) VALUES (?, ?, ?, ?, ?)'
  ).run(id, email, 'Cocinera', 'hash', null);
  const config = await import('../config/app.config.js');
  return {
    id,
    token: jwt.sign({ sub: id, email }, config.config.auth.jwtSecret, { expiresIn: '1h' })
  };
}

async function call(method: string, path: string, body?: unknown, token = alice.token) {
  const response = await app.request(`/api/receipts${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, payload };
}

/** Un PNG de mentira: la firma de 8 bytes es lo que la ruta valida. */
const PNG_FIRMA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function subirTicket(nombre = 'ticket.png', bytes: Buffer = PNG_FIRMA, tipo = 'image/png') {
  const formulario = new FormData();
  formulario.append('file', new File([new Uint8Array(bytes)], nombre, { type: tipo }));
  const response = await app.request('/api/receipts', {
    method: 'POST',
    headers: { authorization: `Bearer ${alice.token}` },
    body: formulario
  });
  return { status: response.status, payload: (await response.json()) as any };
}

/** Espera a que el trabajador de la cola mueva el ticket de `queued` a otra cosa. */
async function esperarEstado(id: string, estado: string, ms = 8000): Promise<any> {
  const inicio = Date.now();
  while (Date.now() - inicio < ms) {
    const ficha = await call('GET', `/${id}`);
    if (ficha.payload?.data?.status === estado) return ficha.payload.data;
    await new Promise((resolver) => setTimeout(resolver, 150));
  }
  throw new Error(`El ticket nunca llego a ${estado}`);
}

beforeAll(async () => {
  const database = await import('../config/database.js');
  await database.initializeDatabase();
  db = database.getDatabase();
  closeDatabase = database.closeDatabase;

  const { receiptsRoutes } = await import('./receipts.routes.js');
  const { errorHandler } = await import('../middleware/error.middleware.js');
  app = new Hono();
  app.onError(errorHandler as never);
  app.route('/api/receipts', receiptsRoutes);
});

afterAll(() => closeDatabase?.());

beforeEach(async () => {
  db.exec(
    'DELETE FROM receipt_items; DELETE FROM ai_jobs; DELETE FROM receipts; DELETE FROM stores; DELETE FROM price_observations; DELETE FROM ingredients; DELETE FROM pantry_categories; DELETE FROM ai_configs; DELETE FROM users;'
  );
  alice = await makeUser(`alice-${Math.random().toString(36).slice(2)}@test.local`);
});

describe('POST / (subir)', () => {
  it('un PNG valido entra en la cola con su trabajo, y la cola sin configuracion falla con NO_CONFIG', async () => {
    const subida = await subirTicket();
    expect(subida.status).toBe(201);
    expect(subida.payload.data.status).toBe('queued');
    expect(subida.payload.data.fileKind).toBe('png');

    const trabajo = db
      .prepare('SELECT * FROM ai_jobs WHERE receipt_id = ?')
      .get(subida.payload.data.id) as any;
    expect(trabajo.status).toBe('queued');

    // Sin configuracion de IA la lectura no puede ni empezar: el codigo de error es el que
    // la pantalla traduce por «configura la IA».
    const ficha = await esperarEstado(subida.payload.data.id, 'failed');
    expect(ficha.error).toBe('NO_CONFIG');
    expect(ficha.job.status).toBe('failed');
  });

  it('la firma manda: un exe con nombre de png no pasa, y un PDF si', async () => {
    const malo = await subirTicket('ticket.png', Buffer.from('MZ\x90\x00 virus'), 'image/png');
    expect(malo.status).toBe(415);
    expect(malo.payload.error).toBe('BAD_FILE_TYPE');

    const pdf = await subirTicket('ticket.pdf', Buffer.from('%PDF-1.7 fingido'), 'application/pdf');
    expect(pdf.status).toBe(201);
    expect(pdf.payload.data.fileKind).toBe('pdf');
  });

  it('sin fichero no hay ticket', async () => {
    const response = await app.request('/api/receipts', {
      method: 'POST',
      headers: { authorization: `Bearer ${alice.token}` },
      body: new FormData()
    });
    expect(response.status).toBe(400);
  });
});

describe('la cola', () => {
  it('GET /queue cuenta lo que hay, y stop-all deja los tickets en stopped', async () => {
    await subirTicket();
    const b = await subirTicket();
    const cola = await call('GET', '/queue');
    expect(cola.payload.data.jobs).toHaveLength(2);

    const parada = await call('POST', '/queue/stop');
    expect(parada.payload.data.detenidos + parada.payload.data.cancelados).toBeGreaterThanOrEqual(
      1
    );

    const fichaB = await call('GET', `/${b.payload.data.id}`);
    expect(['stopped', 'failed', 'queued']).toContain(fichaB.payload.data.status);
    // El trabajo parado en cola no corre mas.
    const trabajos = db.prepare('SELECT status FROM ai_jobs').all() as { status: string }[];
    for (const trabajo of trabajos) expect(trabajo.status).not.toBe('running');
  });

  it('retry devuelve el trabajo a la cola desde failed', async () => {
    const subida = await subirTicket();
    await esperarEstado(subida.payload.data.id, 'failed');
    const reintento = await call('POST', `/${subida.payload.data.id}/retry`);
    expect(reintento.payload.data.requeued).toBe(true);
    const trabajo = db
      .prepare('SELECT status FROM ai_jobs WHERE receipt_id = ?')
      .get(subida.payload.data.id) as any;
    expect(trabajo.status).toBe('queued');
    // Y volvera a fallar (sigue sin haber configuracion): el ciclo se puede repetir.
    await esperarEstado(subida.payload.data.id, 'failed');
  });

  it('la concurrencia por configuracion: default 1, y lo que escriba el apartado de IA', async () => {
    const { concurrenciaDe } = await import('../utils/ticket-queue.js');
    expect(concurrenciaDe(db, alice.id)).toBe(1);

    const id = 'cfg-conc';
    db.prepare(
      `INSERT INTO ai_configs (id, user_id, name, provider, base_url, api_key, model, concurrency, is_active)
       VALUES (?, ?, 'prueba', 'custom', 'http://localhost:9/v1', 'k', 'm', 3, 1)`
    ).run(id, alice.id);
    expect(concurrenciaDe(db, alice.id)).toBe(3);
  });
});

describe('la revision y el confirm', () => {
  async function ticketEnRevision() {
    const subida = await subirTicket();
    const id = subida.payload.data.id;
    // Sin IA: el ticket falla, y la persona lo rescata a mano (que es la otra mitad del flujo).
    await esperarEstado(id, 'failed');
    await call('PATCH', `/${id}`, { store: 'Mercadona' });
    await call('POST', `/${id}/items`, {
      name: 'Leche entera',
      quantity: 2,
      unit: 'ud',
      category: 'dairy',
      priceMinor: 390
    });
    // 'bakery' NO es una clave del catalogo de despensa (es 'grains'): una categoria que no
    // existe no puede colarse en el inventario, cae a la reserva.
    await call('POST', `/${id}/items`, {
      name: 'Pan de pueblo',
      quantity: 1,
      unit: 'ud',
      category: 'bakery',
      priceMinor: 140
    });
    return id;
  }

  it('las lineas se editan una a una: categoria, precio, oferta y cantidad', async () => {
    const id = await ticketEnRevision();
    const ficha = await call('GET', `/${id}`);
    const primera = ficha.payload.data.lines[0];

    const editada = await call('PATCH', `/${id}/items/${primera.id}`, {
      category: 'other',
      priceMinor: 350,
      offer: { buy: 3, take: 2 }
    });
    expect(editada.status).toBe(200);

    const despues = await call('GET', `/${id}`);
    expect(despues.payload.data.lines[0].category).toBe('other');
    expect(despues.payload.data.lines[0].priceMinor).toBe(350);
    expect(despues.payload.data.lines[0].offer).toEqual({ buy: 3, take: 2 });
    expect(despues.payload.data.lines[0].quantity).toBe(2);
  });

  it('confirmar registra la tienda, apunta el precio y sube la compra al inventario con SU categoria', async () => {
    const id = await ticketEnRevision();
    const confirmado = await call('POST', `/${id}/confirm`);
    expect(confirmado.status).toBe(200);
    expect(confirmado.payload.data).toMatchObject({ pricesRecorded: 2, store: 'Mercadona' });
    expect(confirmado.payload.data.pantryMoved + confirmado.payload.data.pantryMerged).toBe(2);

    // La tienda detectada queda registrada para la casa.
    const tienda = db.prepare('SELECT name FROM stores').all() as { name: string }[];
    expect(tienda.map((fila) => fila.name)).toContain('Mercadona');

    // El precio con su tienda y su cantidad: lo que la ficha del articulo pinta despues.
    const precio = db
      .prepare('SELECT * FROM price_observations WHERE product_name = ?')
      .get('Leche entera') as any;
    expect(precio).toMatchObject({
      store_name: 'Mercadona',
      price_minor: 390,
      quantity: 2,
      source: 'receipt'
    });

    // Y la ficha del inventario nace en la categoria revisada, no en la reserva.
    const leche = db.prepare('SELECT * FROM ingredients WHERE name = ?').get('Leche entera') as any;
    expect(leche).toMatchObject({ category: 'dairy', quantity: 2, unit: 'ud' });
    const pan = db.prepare('SELECT * FROM ingredients WHERE name = ?').get('Pan de pueblo') as any;
    expect(pan.category).toBe('other');

    // Confirmado es confirmado: no se reconfirma ni se edita.
    expect((await call('POST', `/${id}/confirm`)).status).toBe(409);
    expect((await call('PATCH', `/${id}`, { store: 'Lidl' })).status).toBe(409);
  });

  it('confirmar de nuevo con stock existente SUMA unidades en vez de duplicar la ficha', async () => {
    const id = await ticketEnRevision();
    await call('POST', `/${id}/confirm`);
    const leche = db
      .prepare('SELECT quantity FROM ingredients WHERE name = ?')
      .get('Leche entera') as any;
    expect(leche.quantity).toBe(2);

    // Otro ticket con la misma compra: la ficha ya existe, se suman las unidades.
    const otro = await ticketEnRevision();
    await call('POST', `/${otro}/confirm`);
    const despues = db
      .prepare('SELECT quantity FROM ingredients WHERE name = ?')
      .get('Leche entera') as any;
    expect(despues.quantity).toBe(4);
  });

  it('un ticket sin lineas no se confirma', async () => {
    const subida = await subirTicket();
    await esperarEstado(subida.payload.data.id, 'failed');
    const confirmado = await call('POST', `/${subida.payload.data.id}/confirm`);
    expect(confirmado.status).toBe(409);
    expect(confirmado.payload.error).toBe('NO_LINES');
  });

  it('borrar un ticket se lleva sus lineas y su trabajo', async () => {
    const id = await ticketEnRevision();
    const borrado = await call('DELETE', `/${id}`);
    expect(borrado.status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) AS n FROM receipts').get()).toMatchObject({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM receipt_items').get()).toMatchObject({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM ai_jobs').get()).toMatchObject({ n: 0 });
  });
});
