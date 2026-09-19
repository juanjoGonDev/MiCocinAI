import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { getDatabase } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { productKeyOf } from '../utils/product-key.js';
import {
  bulkItemsSchema,
  createCategorySchema,
  discountSchema,
  createItemSchema,
  createListSchema,
  createPriceSchema,
  listFilterSchema,
  orderSchema,
  parseItemLine,
  priceFilterSchema,
  updateItemSchema,
  updateListSchema
} from '../schemas/shopping.schema.js';
import {
  ensureDefaultCategories,
  listCategories,
  upsertCategory
} from '../utils/shopping-categories.js';
import { describeEvent, readEvents, recordEvent } from '../utils/shopping-events.js';
import { channelForList, channelsForTray, publish, subscribe, type LiveEvent } from '../utils/live-hub.js';
import {
  basketMoney,
  describeDiscount,
  normalizeOffer,
  offerOf,
  paidUnits,
  type Discount
} from '../utils/list-discount.js';
import { streamSSE } from 'hono/streaming';
import type { AppEnv } from '../types/hono-env.js';

/**
 * Lista de la compra y precios (esqueleto de P2/P3 del spec).
 *
 * Las reglas que explican el forma de esta API:
 * - El dinero viaja en centimos (`*Minor`) y las cantidades en reales; nunca se
 *   multiplica un float por un precio para dar el total, se redondea una vez al
 *   final (`roundMinor`).
 * - Las listas son del hogar si el usuario tiene uno (es lo que se comparte con
 *   quien hace la compra), y si no, de la persona.
 * - Borrar una linea es LOGICO (`deleted_at`): la UI de movil ofrece «Deshacer»
 *   durante unos segundos, y eso solo se puede prometer si el dato sigue ahi.
 * - `GET /lists/:id/estimate` calcula con el ultimo precio observado del producto
 *   (primero el del propio usuario, luego el del hogar). No hay catalogo todavia:
 *   la clave es el nombre normalizado (ver `utils/product-key.ts`), que es lo que
 *   permitira migrar a `canonical_products` sin tocar las observaciones.
 */
const shoppingRoutes = new Hono<AppEnv>();

shoppingRoutes.use('*', authMiddleware);

type Scope = { clause: string; params: string[]; householdId: string | null };

function getScope(userId: string): Scope {
  const db = getDatabase();
  const user = db
    .prepare(
      `SELECT u.household_id AS hid FROM users u WHERE u.id = ?`
    )
    .get(userId) as { hid: string | null } | undefined;

  if (user?.hid) {
    return { clause: '(user_id = ? OR household_id = ?)', params: [userId, user.hid], householdId: user.hid };
  }
  return { clause: 'user_id = ?', params: [userId], householdId: null };
}

/** 404 con el mismo envoltorio que el resto del server. */
function notFound(c: any, what: string) {
  return c.json({ success: false, message: `${what} not found` }, 404);
}

function roundMinor(value: number): number {
  return Math.max(0, Math.round(value));
}

function readList(db: ReturnType<typeof getDatabase>, scope: Scope, listId: string) {
  return db
    .prepare(`SELECT * FROM shopping_lists WHERE id = ? AND ${scope.clause}`)
    .get(listId, ...scope.params) as any;
}

/**
 * Suceso + aviso en vivo, en la misma llamada. Van juntas SIEMPRE: un `recordEvent`
 * sin `publish` es una auditoria que nadie ve, y un `publish` sin `recordEvent` es un
 * refresco sin rastro de quien lo provoco.
 */
function announce(
  db: ReturnType<typeof getDatabase>,
  list: { id: string; household_id?: string | null } | null,
  userId: string | null,
  action: string,
  itemName: string | null = null
): void {
  if (list) recordEvent(db, { listId: list.id, userId, action, itemName });
  const byName = userId
    ? ((db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as any)?.name ?? null)
    : null;
  const event: LiveEvent = {
    type: action.startsWith('item') || action === 'list.clear-checked' ? 'items' : 'list',
    listId: list?.id ?? null,
    action,
    by: userId,
    byName,
    itemName,
    at: new Date().toISOString()
  };
  const channels = [
    ...(list ? [channelForList(list.id)] : []),
    ...channelsForTray({ userId: userId ?? '', householdId: list?.household_id ?? null })
  ];
  publish(channels, event);
}

/** Solo a la bandeja: para el borrado, donde la fila de la lista ya no va a existir. */
function announceToTray(
  db: ReturnType<typeof getDatabase>,
  scope: { userId: string; householdId: string | null },
  action: string,
  listId: string | null
): void {
  publish(channelsForTray(scope), {
    type: 'list',
    listId,
    action,
    by: scope.userId,
    byName: (db.prepare('SELECT name FROM users WHERE id = ?').get(scope.userId) as any)?.name ?? null,
    itemName: null,
    at: new Date().toISOString()
  });
}

/**
 * La fila de descuento, en la forma que consume `utils/list-discount.ts`. `null`
 * cuando la lista no tiene ninguno: el `estimate` entonces no pinta bloque de
 * descuento, en vez de un «-0,00 €» que sugiere que algo se aplico y no.
 */
function readDiscount(db: ReturnType<typeof getDatabase>, listId: string): Discount | null {
  const row = db.prepare('SELECT * FROM shopping_list_discounts WHERE list_id = ?').get(listId) as any;
  if (!row) return null;
  return {
    kind: row.kind,
    valueMinor: row.value_minor ?? null,
    percentBps: row.percent_bps ?? null,
    scope: row.scope,
    firstUnits: row.first_units ?? null,
    label: row.label ?? null
  };
}

/** Totales de cabecera: se calculan aqui y no en la UI, para que la lista y el
 *  dashboard digan lo mismo. */
function listTotals(db: ReturnType<typeof getDatabase>, listId: string) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(checked), 0) AS checked,
              COALESCE(SUM(CASE WHEN price_minor IS NOT NULL THEN CAST(ROUND(price_minor * quantity) AS INTEGER) ELSE 0 END), 0) AS priced
       FROM shopping_list_items
       WHERE list_id = ? AND deleted_at IS NULL`
    )
    .get(listId) as { total: number; checked: number; priced: number };
  return { totalItems: row.total, checkedItems: row.checked, pricedTotalMinor: row.priced };
}

// ═══════════════════════════════════════════════════════════════════
// Secciones del carrito (catalogo con color, ver §8f)
// ═══════════════════════════════════════════════════════════════════

/**
 * El catalogo del usuario, con las por defecto sembradas a la primera lectura. Se
 * siembra aqui y no en una migracion global para no escribir filas de todos los
 * usuarios al actualizar el server.
 */
shoppingRoutes.get('/categories', async (c) => {
  const db = getDatabase();
  const userId = c.get('userId');
  const scope = getScope(userId);
  ensureDefaultCategories(db, userId, scope.householdId);
  return c.json({ success: true, data: listCategories(db, scope.clause, scope.params) });
});

/** Idempotente por clave: 201 si nace, 200 si ya estaba. La IA llama a esto mismo. */
shoppingRoutes.post('/categories', async (c) => {
  const db = getDatabase();
  const userId = c.get('userId');
  const scope = getScope(userId);
  const body = createCategorySchema.parse(await c.req.json());

  const { category, created } = upsertCategory(db, {
    userId,
    householdId: scope.householdId,
    name: body.name,
    color: body.color ?? null,
    idFactory: () => nanoid()
  });
  return c.json({ success: true, data: category }, created ? 201 : 200);
});

// ═══════════════════════════════════════════════════════════════════
// Listas
// ═══════════════════════════════════════════════════════════════════

shoppingRoutes.get('/lists', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const filter = listFilterSchema.parse(c.req.query());

  // Con el JOIN del agregado, `user_id` a secas seria ambiguo: el ambito se escribe
  // siempre prefijado a la tabla de las listas.
  const scoped = scope.clause.replace(/user_id/g, 'l.user_id').replace(/household_id/g, 'l.household_id');
  const conditions = [scoped];
  const params = [...scope.params];

  if (filter.status) {
    conditions.push('l.status = ?');
    params.push(filter.status);
  } else {
    // Por defecto no se ven las terminadas: la pantalla es para lo que queda
    // por comprar, el historial vive en su propia pestana.
    conditions.push(`l.status IN ('active', 'archived')`);
  }
  // El texto busca en el nombre de la lista Y en lo que hay dentro: quien recuerda
  // «puse lo del jamon en alguna parte» no recuerda en cual.
  if (filter.q) {
    conditions.push(`(l.name LIKE ? OR EXISTS (
      SELECT 1 FROM shopping_list_items si
      WHERE si.list_id = l.id AND si.deleted_at IS NULL AND si.name LIKE ?
    ))`);
    params.push(`%${filter.q}%`, `%${filter.q}%`);
  }
  if (filter.store) {
    conditions.push('l.store = ?');
    params.push(filter.store);
  }
  if (filter.from) {
    conditions.push('date(l.updated_at) >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    conditions.push('date(l.updated_at) <= ?');
    params.push(filter.to);
  }

  // Los totales salen de un unico agregado, no de una consulta por lista: la bandeja
  // podia tener cien filas y cien consultas, y ordenar por importe lo necesitaba en
  // el SQL de todas formas.
  const totalsJoin = `
    LEFT JOIN (
      SELECT list_id,
             COUNT(*) AS total,
             COALESCE(SUM(checked), 0) AS checked,
             COALESCE(SUM(CASE WHEN price_minor IS NOT NULL
                               THEN CAST(ROUND(price_minor * quantity) AS INTEGER)
                               ELSE 0 END), 0) AS priced
      FROM shopping_list_items
      WHERE deleted_at IS NULL
      GROUP BY list_id
    ) t ON t.list_id = l.id`;

  const having: string[] = [];
  const havingParams: unknown[] = [];
  if (filter.minTotalMinor != null) {
    having.push('COALESCE(t.priced, 0) >= ?');
    havingParams.push(filter.minTotalMinor);
  }

  // `status = 'active' DESC` solo cuando nadie pidio un orden: con `?sort=name` quien
  // abre la bandeja quiere un directorio, no que lo vivo se cuele por delante.
  const direction = filter.dir === 'asc' ? 'ASC' : 'DESC';
  const order =
    filter.sort === 'name'
      ? 'l.name COLLATE NOCASE ' + direction
      : filter.sort === 'total'
        ? 'COALESCE(t.priced, 0) ' + direction
        : filter.sort === 'lines'
          ? 'COALESCE(t.total, 0) ' + direction
          : `l.status = 'active' DESC, l.updated_at ${direction}, l.created_at DESC`;

  const where = `WHERE ${conditions.join(' AND ')}${having.length ? ' AND ' + having.join(' AND ') : ''}`;

  const lists = db
    .prepare(
      `SELECT l.*,
              COALESCE(t.total, 0) AS totalItems,
              COALESCE(t.checked, 0) AS checkedItems,
              COALESCE(t.priced, 0) AS pricedTotalMinor
       FROM shopping_lists l ${totalsJoin} ${where}
       ORDER BY ${order}, l.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, ...havingParams, filter.limit, filter.offset) as any[];

  const { count } = db
    .prepare(`SELECT COUNT(*) AS count FROM shopping_lists l ${totalsJoin} ${where}`)
    .get(...params, ...havingParams) as { count: number };

  return c.json({
    success: true,
    // `meta.total` es el total FILTRADO: la paginacion necesita saber cuantas paginas
    // hay, y decir «4» cuando se ven 4 de 30 es mentir en el contador.
    data: lists,
    meta: { total: count, limit: filter.limit, offset: filter.offset }
  });
});

/** Los supermercados que hay en los datos, para el filtro. Sin catalogo aparte. */
shoppingRoutes.get('/stores', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const rows = db
    .prepare(
      `SELECT store, COUNT(*) AS lists FROM shopping_lists
       WHERE ${scope.clause} AND store IS NOT NULL AND TRIM(store) <> ''
       GROUP BY store ORDER BY lists DESC, store ASC`
    )
    .all(...scope.params) as { store: string; lists: number }[];
  return c.json({ success: true, data: rows });
});

shoppingRoutes.post('/lists', async (c) => {
  const db = getDatabase();
  const userId = c.get('userId');
  const scope = getScope(userId);
  const body = createListSchema.parse(await c.req.json());

  const id = nanoid();
  db.prepare(
    `INSERT INTO shopping_lists (id, user_id, household_id, name, store) VALUES (?, ?, ?, ?, ?)`
  ).run(id, userId, scope.householdId, body.name, body.store ?? null);

  const list = readList(db, scope, id);
  announce(db, list, userId, 'list.create', null);
  return c.json({ success: true, data: { ...list, ...listTotals(db, id) } }, 201);
});

shoppingRoutes.get('/lists/:id', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const list = readList(db, scope, c.req.param('id'));
  if (!list) return notFound(c, 'List');

  const includeDeleted = c.req.query('includeDeleted') === '1';
  const items = db
    .prepare(
      `SELECT * FROM shopping_list_items WHERE list_id = ? ${
        includeDeleted ? '' : 'AND deleted_at IS NULL'
      } ORDER BY position ASC, created_at ASC`
    )
    .all(list.id) as any[];

  const discount = readDiscount(db, list.id);
  return c.json({
    success: true,
    data: { ...list, items, ...listTotals(db, list.id), discount, discountDescription: describeDiscount(discount) }
  });
});

shoppingRoutes.patch('/lists/:id', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const list = readList(db, scope, c.req.param('id'));
  if (!list) return notFound(c, 'List');

  const body = updateListSchema.parse(await c.req.json());
  if (body.version !== list.version) {
    // El otro extremo (409 sin tocar nada) es lo que permite a la app mostrar
    // «hay una version nueva, que quieres hacer?» en vez de ganar a ciegas.
    return c.json(
      { success: false, message: 'LIST_VERSION_CONFLICT', data: { currentVersion: list.version } },
      409
    );
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  if (body.name !== undefined) {
    sets.push('name = ?');
    params.push(body.name);
  }
  if (body.store !== undefined) {
    sets.push('store = ?');
    params.push(body.store);
  }
  if (body.status !== undefined) {
    sets.push('status = ?');
    params.push(body.status);
    // `completed_at` solo tiene sentido con el estado que lo justifica.
    sets.push(body.status === 'done' ? 'completed_at = CURRENT_TIMESTAMP' : 'completed_at = NULL');
  }

  sets.push('version = version + 1', 'updated_at = CURRENT_TIMESTAMP', 'updated_by = ?');
  params.push(c.get('userId'));
  db.prepare(`UPDATE shopping_lists SET ${sets.join(', ')} WHERE id = ?`).run(...params, list.id);

  const updated = readList(db, scope, list.id);
  // Reabrir una lista es el mismo PATCH con otro estado, y aqui se traduce a un
  // suceso distinto: en la auditoria «la termino» y «la volvio a abrir» no se leen igual.
  announce(
    db,
    updated,
    c.get('userId'),
    updated.status === 'done' && list.status !== 'done'
      ? 'list.complete'
      : list.status === 'done' && updated.status !== 'done'
        ? 'list.reopen'
        : 'list.update',
    updated.name
  );
  return c.json({ success: true, data: { ...updated, ...listTotals(db, list.id) } });
});

shoppingRoutes.delete('/lists/:id', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const list = readList(db, scope, c.req.param('id'));
  if (!list) return notFound(c, 'List');

  // Borrado fisico: la lista es el contenedor, y su historial de precios vive
  // en price_observations, que sobrevive (ON DELETE no la toca).
  db.prepare('DELETE FROM shopping_lists WHERE id = ?').run(list.id);
  // El suceso no se guarda: la FK de la auditoria es `ON DELETE CASCADE`, y una
  // auditoria de una lista que ya no existe no tiene donde leerse. Lo que si hace
  // falta es que la bandeja de las demas personas se entere.
  announceToTray(db, { userId: c.get('userId'), householdId: list.household_id }, 'list.delete', list.id);
  return c.json({ success: true, data: { id: list.id } });
});

// ═══════════════════════════════════════════════════════════════════
// Items
// ═══════════════════════════════════════════════════════════════════

function nextPosition(db: ReturnType<typeof getDatabase>, listId: string): number {
  const row = db.prepare('SELECT COALESCE(MAX(position), -1) AS last FROM shopping_list_items WHERE list_id = ?').get(
    listId
  ) as { last: number };
  return row.last + 1;
}

function insertItem(db: ReturnType<typeof getDatabase>, listId: string, input: any, userId: string | null = null) {
  const id = nanoid();
  const offer = normalizeOffer(input.offer);
  const key = productKeyOf(input.name);
  db.prepare(
    `INSERT INTO shopping_list_items
       (id, list_id, name, product_key, quantity, unit, category, price_minor, note, position,
        promo_buy, promo_take, added_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    listId,
    input.name,
    key,
    input.quantity ?? 1,
    input.unit ?? null,
    input.category ?? null,
    input.priceMinor ?? input.price_minor ?? null,
    input.note ?? null,
    nextPosition(db, listId),
    offer?.buy ?? null,
    offer?.take ?? null,
    userId,
    userId
  );
  return id;
}

shoppingRoutes.post('/lists/:id/items', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const list = readList(db, scope, c.req.param('id'));
  if (!list) return notFound(c, 'List');

  const body = createItemSchema.parse(await c.req.json());

  // Misma linea pendiente (mismo producto y unidad) => se suma la cantidad.
  // Es lo que espera quien escribe «leche» dos veces: una fila, 2 unidades.
  const key = productKeyOf(body.name);
  const existing = db
    .prepare(
      `SELECT * FROM shopping_list_items
       WHERE list_id = ? AND product_key = ? AND deleted_at IS NULL AND COALESCE(unit, '') = COALESCE(?, '')`
    )
    .get(list.id, key, body.unit ?? null) as any;

  if (existing) {
    // Se suma la cantidad y, si la linea nueva traia oferta, se la lleva puesta:
    // quien escribe «6 Cervexas 3x2» sobre una fila de «3 Cervexas» habla de la misma
    // estanteria, y perder la oferta a mitad de camino pinta un precio mayor.
    db.prepare(
      `UPDATE shopping_list_items
         SET quantity = quantity + ?,
             promo_buy = COALESCE(?, promo_buy),
             promo_take = COALESCE(?, promo_take),
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(body.quantity ?? 1, normalizeOffer(body.offer)?.buy ?? null, normalizeOffer(body.offer)?.take ?? null, existing.id);
    db.prepare('UPDATE shopping_lists SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      list.id
    );
    // Se relee la fila: responder con la copia leida ANTES del UPDATE devolvria la
    // cantidad vieja y la UI tendria que adivinar el resultado de su propio toque.
    const mergedRow = db.prepare('SELECT * FROM shopping_list_items WHERE id = ?').get(existing.id) as any;
    announce(db, list, c.get('userId'), 'item.merge', mergedRow.name);
    return c.json({ success: true, data: { ...mergedRow, merged: true } }, 200);
  }

  const id = insertItem(db, list.id, body, c.get('userId'));
  db.prepare('UPDATE shopping_lists SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    list.id
  );

  const item = db.prepare('SELECT * FROM shopping_list_items WHERE id = ?').get(id) as any;
  announce(db, list, c.get('userId'), 'item.add', item.name);
  return c.json({ success: true, data: { ...item, merged: false } }, 201);
});

/** Pegado de texto: una linea por producto, dedupeando contra lo que ya esta. */
shoppingRoutes.post('/lists/:id/items/bulk', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const list = readList(db, scope, c.req.param('id'));
  if (!list) return notFound(c, 'List');

  const body = bulkItemsSchema.parse(await c.req.json());
  const parsed = (
    body.items?.length
      ? body.items
      : body.lines
          .split(/\r?\n/)
          .map(parseItemLine)
          .filter((line): line is NonNullable<typeof line> => line !== null)
  ).slice(0, 200);

  const added: any[] = [];
  const merged: any[] = [];
  const skipped: { name: string; reason: string }[] = [];

  const transaction = db.transaction(() => {
    for (const line of parsed) {
      const key = productKeyOf(line.name);
      if (!key) {
        skipped.push({ name: line.name, reason: 'EMPTY_AFTER_NORMALIZE' });
        continue;
      }
      const existing = db
        .prepare(
          `SELECT * FROM shopping_list_items
           WHERE list_id = ? AND product_key = ? AND deleted_at IS NULL AND COALESCE(unit, '') = COALESCE(?, '')`
        )
        .get(list.id, key, line.unit ?? null) as any;

      if (existing) {
        db.prepare(
          `UPDATE shopping_list_items
             SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
           WHERE id = ?`
        ).run(line.quantity ?? 1, c.get('userId'), existing.id);
        merged.push(db.prepare('SELECT * FROM shopping_list_items WHERE id = ?').get(existing.id));
        continue;
      }
      added.push(
        db.prepare('SELECT * FROM shopping_list_items WHERE id = ?').get(insertItem(db, list.id, line, c.get('userId')))
      );
    }
    db.prepare('UPDATE shopping_lists SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      list.id
    );
  });
  transaction();

  announce(
    db,
    list,
    c.get('userId'),
    'items.bulk',
    `${added.length + merged.length} lineas anadidas${skipped.length ? `, ${skipped.length} ignoradas` : ''}`
  );

  return c.json(
    { success: true, data: { added, merged, skipped, version: (readList(db, scope, list.id) as any).version } },
    added.length > 0 ? 201 : 200
  );
});

shoppingRoutes.patch('/lists/:id/items/:itemId', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const list = readList(db, scope, c.req.param('id'));
  if (!list) return notFound(c, 'List');

  const item = db
    .prepare('SELECT * FROM shopping_list_items WHERE id = ? AND list_id = ?')
    .get(c.req.param('itemId'), list.id) as any;
  if (!item) return notFound(c, 'Item');

  const body = updateItemSchema.parse(await c.req.json());
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const column of ['name', 'quantity', 'unit', 'category', 'note'] as const) {
    if ((body as any)[column] !== undefined) {
      sets.push(`${column} = ?`);
      params.push((body as any)[column]);
      if (column === 'name') {
        sets.push('product_key = ?');
        params.push(productKeyOf((body as any)[column]));
      }
    }
  }
  if (body.checked !== undefined) {
    sets.push('checked = ?');
    params.push(body.checked ? 1 : 0);
  }
  if (body.priceMinor !== undefined) {
    sets.push('price_minor = ?');
    params.push(body.priceMinor);
  }
  // `offer: null` quita la oferta; `undefined` no la toca. Un `COALESCE` aqui no
  // serviria: haria «quitar» indistinguible de «no decir nada».
  if (body.offer !== undefined) {
    sets.push('promo_buy = ?');
    sets.push('promo_take = ?');
    params.push(normalizeOffer(body.offer)?.buy ?? null, normalizeOffer(body.offer)?.take ?? null);
  }

  // `updated_by` se escribe siempre, no solo cuando cambia el nombre: lo que interesa
  // en la auditoria es quien toco la linea por ultima vez.
  sets.push('updated_at = CURRENT_TIMESTAMP');
  sets.push('updated_by = ?');
  params.push(c.get('userId'));
  db.prepare(`UPDATE shopping_list_items SET ${sets.join(', ')} WHERE id = ?`).run(...params, item.id);
  db.prepare('UPDATE shopping_lists SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    list.id
  );

  const updated = db.prepare('SELECT * FROM shopping_list_items WHERE id = ?').get(item.id) as any;
  // El suceso distingue marcar de editar porque la pantalla lo cuenta aparte: «Ana ha
  // marcado el pollo» y «Ana ha editado el pollo» no son la misma noticia.
  announce(
    db,
    list,
    c.get('userId'),
    body.checked !== undefined ? (updated.checked ? 'item.check' : 'item.uncheck') : 'item.update',
    updated.name
  );
  return c.json({ success: true, data: updated });
});

/** Borrado logico: el «Deshacer» de la UI de movil tiene que poder cumplirse. */
shoppingRoutes.delete('/lists/:id/items/:itemId', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const list = readList(db, scope, c.req.param('id'));
  if (!list) return notFound(c, 'List');

  // El nombre se lee ANTES de borrar: es lo que va a decir la auditoria, y despues
  // de marcar `deleted_at` ya no se sabe cual de las dos lineas del carrito era.
  const before = db
    .prepare(
      'SELECT name FROM shopping_list_items WHERE id = ? AND list_id = ? AND deleted_at IS NULL'
    )
    .get(c.req.param('itemId'), list.id) as { name: string } | undefined;

  const result = db
    .prepare(
      `UPDATE shopping_list_items
         SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, updated_by = ?
       WHERE id = ? AND list_id = ? AND deleted_at IS NULL`
    )
    .run(c.get('userId'), c.req.param('itemId'), list.id);

  if (result.changes === 0) return notFound(c, 'Item');
  db.prepare('UPDATE shopping_lists SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    list.id
  );

  announce(db, list, c.get('userId'), 'item.remove', before?.name ?? null);
  return c.json({ success: true, data: { id: c.req.param('itemId'), deletedAt: new Date().toISOString() } });
});

shoppingRoutes.post('/lists/:id/items/:itemId/restore', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const list = readList(db, scope, c.req.param('id'));
  if (!list) return notFound(c, 'List');

  const result = db
    .prepare(`UPDATE shopping_list_items SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND list_id = ?`)
    .run(c.req.param('itemId'), list.id);
  if (result.changes === 0) return notFound(c, 'Item');

  const item = db.prepare('SELECT * FROM shopping_list_items WHERE id = ?').get(c.req.param('itemId')) as any;
  announce(db, list, c.get('userId'), 'item.restore', item.name);
  return c.json({ success: true, data: item });
});

/**
 * El descuento de la lista. Un `PUT`, no un `POST`: como mucho hay uno, y una
 * pantalla que guarda sola necesita que «guardar» y «guardar por primera vez» sean
 * la misma operacion. Borrarlo es `DELETE`, no `PUT {kind: null}` — el estado
 * «sin descuento» tiene que ser la ausencia de fila.
 */
shoppingRoutes.put('/lists/:id/discount', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const list = readList(db, scope, c.req.param('id'));
  if (!list) return notFound(c, 'List');

  const body = discountSchema.parse(await c.req.json());
  db.prepare(
    `INSERT INTO shopping_list_discounts
       (list_id, kind, value_minor, percent_bps, scope, first_units, label)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(list_id) DO UPDATE SET
       kind = excluded.kind,
       value_minor = excluded.value_minor,
       percent_bps = excluded.percent_bps,
       scope = excluded.scope,
       first_units = excluded.first_units,
       label = excluded.label,
       updated_at = CURRENT_TIMESTAMP`
  ).run(
    list.id,
    body.kind,
    body.kind === 'amount' ? body.valueMinor ?? 0 : null,
    body.kind === 'percent' ? body.percentBps ?? 0 : null,
    body.scope,
    body.scope === 'firstUnits' ? body.firstUnits ?? null : null,
    body.label ?? null
  );

  const discount = readDiscount(db, list.id);
  announce(db, list, c.get('userId'), 'list.discount', describeDiscount(discount));
  return c.json({ success: true, data: { ...discount, description: describeDiscount(discount) } });
});

shoppingRoutes.delete('/lists/:id/discount', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const list = readList(db, scope, c.req.param('id'));
  if (!list) return notFound(c, 'List');

  db.prepare('DELETE FROM shopping_list_discounts WHERE list_id = ?').run(list.id);
  announce(db, list, c.get('userId'), 'list.discount-remove', null);
  return c.json({ success: true, data: { removed: true } });
});

/** Lo comprado se va de la lista (y su precio queda anotado, ver `complete`). */
shoppingRoutes.post('/lists/:id/clear-checked', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const list = readList(db, scope, c.req.param('id'));
  if (!list) return notFound(c, 'List');

  const removed = db
    .prepare('UPDATE shopping_list_items SET deleted_at = CURRENT_TIMESTAMP WHERE list_id = ? AND checked = 1 AND deleted_at IS NULL')
    .run(list.id);
  db.prepare('UPDATE shopping_lists SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    list.id
  );

  announce(db, list, c.get('userId'), 'list.clear-checked', `${removed.changes} lineas`);
  return c.json({ success: true, data: { removed: removed.changes } });
});

/** Orden explicito (arrastrar para reordenar). Se manda el orden completo. */
shoppingRoutes.put('/lists/:id/order', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const list = readList(db, scope, c.req.param('id'));
  if (!list) return notFound(c, 'List');

  const body = orderSchema.parse(await c.req.json());
  if (body.version !== list.version) {
    return c.json(
      { success: false, message: 'LIST_VERSION_CONFLICT', data: { currentVersion: list.version } },
      409
    );
  }

  const pending = new Set(
    (db.prepare('SELECT id FROM shopping_list_items WHERE list_id = ? AND deleted_at IS NULL').all(list.id) as any[]).map(
      (row) => row.id
    )
  );
  const unknown = body.itemIds.filter((id) => !pending.has(id));
  if (unknown.length > 0) {
    return c.json({ success: false, message: 'ITEMS_NOT_IN_LIST', data: { unknown } }, 400);
  }

  const update = db.prepare('UPDATE shopping_list_items SET position = ? WHERE id = ? AND list_id = ?');
  db.transaction(() => {
    body.itemIds.forEach((id, index) => update.run(index, id, list.id));
    db.prepare('UPDATE shopping_lists SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      list.id
    );
  })();

  return c.json({ success: true, data: { ordered: body.itemIds.length } });
});

/**
 * Estimacion. Unidades, que es donde se equivocan las apps de dinero:
 *   - `shopping_list_items.price_minor` es PRECIO POR UNIDAD (lo que la gente
 *     recuerda: «la leche a 0,85»).
 *   - `price_observations.price_minor` es lo PAGADO por `quantity` unidades (lo
 *     que dice un ticket). De ahi que al estimar se divida y al aprender se
 *     multiplique, y que las dos tablas no puedan usarse indistintamente.
 * Se devuelve el porque de cada linea para que la UI pueda decir «sin precio»
 * sin adivinar.
 */
shoppingRoutes.get('/lists/:id/estimate', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const list = readList(db, scope, c.req.param('id'));
  if (!list) return notFound(c, 'List');

  const items = db
    .prepare(
      'SELECT * FROM shopping_list_items WHERE list_id = ? AND deleted_at IS NULL ORDER BY position ASC, created_at ASC'
    )
    .all(list.id) as any[];

  const observation = db.prepare(
    `SELECT price_minor, quantity, store_name, observed_at FROM price_observations
     WHERE product_key = ? AND (user_id = ? OR (household_id IS NOT NULL AND household_id = ?))
     ORDER BY observed_at DESC LIMIT 1`
  );

  let totalMinor = 0;
  const priced: { item: any; unitMinor: number | null; source: 'manual' | 'observed' | 'unpriced'; store: string | null; observedAt: string | null }[] = [];

  for (const item of items) {
    if (item.price_minor != null) {
      priced.push({ item, unitMinor: item.price_minor, source: 'manual', store: null, observedAt: null });
      continue;
    }
    const found = observation.get(productKeyOf(item.name), c.get('userId'), list.household_id) as
      | { price_minor: number; quantity: number; store_name: string | null; observed_at: string }
      | undefined;
    if (!found) {
      priced.push({ item, unitMinor: null, source: 'unpriced', store: null, observedAt: null });
      continue;
    }
    // La observacion guarda lo pagado por N unidades; la unidad sale de ahi, no de un
    // precio que nadie anoto. Se redondea una vez, aqui.
    priced.push({
      item,
      unitMinor: roundMinor(found.price_minor / (found.quantity || 1)),
      source: 'observed',
      store: found.store_name,
      observedAt: found.observed_at
    });
  }
  void totalMinor;

  const discount = readDiscount(db, list.id);
  const money = basketMoney({
    lines: priced.map((entry) => ({
      itemId: entry.item.id,
      quantity: entry.item.quantity ?? 1,
      unitMinor: entry.unitMinor,
      offer: offerOf(entry.item)
    })),
    discount
  });
  const byId = new Map(money.lines.map((line) => [line.itemId, line]));

  const lines = priced.map((entry) => {
    const line = byId.get(entry.item.id);
    const offer = offerOf(entry.item);
    const base: any = {
      itemId: entry.item.id,
      name: entry.item.name,
      units: entry.item.quantity ?? 1,
      paidUnits: line?.paidUnits ?? entry.item.quantity ?? 1,
      ...(offer ? { offer } : {})
    };
    if (entry.source === 'unpriced') return { ...base, source: 'unpriced' as const, lineTotalMinor: null };
    return {
      ...base,
      source: entry.source,
      unitMinor: entry.unitMinor,
      // `lineTotalMinor` sigue siendo lo que cuesta la linea (despues de su oferta y
      // antes del descuento de la lista): es el numero que alguien contrasta con el
      // ticket. El descuento de la lista se ve aparte, porque no es de esta linea.
      lineTotalMinor: line?.grossMinor ?? 0,
      netMinor: line?.netMinor ?? 0,
      offerSavingsMinor: line?.offerSavingsMinor ?? 0,
      ...(entry.store ? { store: entry.store, observedAt: entry.observedAt } : {})
    };
  });

  return c.json({
    success: true,
    data: {
      listId: list.id,
      currency: 'EUR',
      totalMinor: money.totalMinor,
      subtotalMinor: money.subtotalMinor,
      offerSavingsMinor: money.offerSavingsMinor,
      discountMinor: money.discountMinor,
      discount: discount ? { ...discount, description: describeDiscount(discount), ...money.discount } : null,
      pricedLines: lines.filter((line) => line.lineTotalMinor !== null).length,
      unpriced: lines.filter((line) => line.source === 'unpriced').map((line) => line.name),
      lines
    }
  });
});

/** Cerrar la compra: archivar y aprender los precios de lo que se pago. */
shoppingRoutes.post('/lists/:id/complete', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const list = readList(db, scope, c.req.param('id'));
  if (!list) return notFound(c, 'List');

  const userId = c.get('userId');
  const bought = db
    .prepare(
      `SELECT * FROM shopping_list_items
       WHERE list_id = ? AND checked = 1 AND deleted_at IS NULL AND price_minor IS NOT NULL`
    )
    .all(list.id) as any[];

  const insertObservation = db.prepare(
    `INSERT INTO price_observations
       (id, user_id, household_id, product_key, product_name, store_name, price_minor, quantity, source, observed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', CURRENT_TIMESTAMP)`
  );

  let recorded = 0;
  db.transaction(() => {
    for (const item of bought) {
      // El item guarda precio/unidad; la observacion, lo pagado por la cantidad que
      // realmente se pago. Con una oferta 3x2 alguien se llevo 6 y pago 4: anotar
      // «4 € por 6 unidades» aprenderia un precio por unidad un 33 % mas barato que
      // el real, y ese error se propaga a todas las estimaciones futuras.
      const paid = paidUnits(item.quantity ?? 1, offerOf(item)) || item.quantity || 1;
      insertObservation.run(
        nanoid(),
        userId,
        list.household_id,
        item.product_key,
        item.name,
        list.store,
        roundMinor(item.price_minor * paid),
        paid
      );
      recorded += 1;
    }
    db.prepare(
      `UPDATE shopping_lists SET status = 'done', completed_at = CURRENT_TIMESTAMP,
         version = version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(list.id);
  })();

  announce(db, list, userId, 'list.complete', `${recorded} precios`);
  return c.json({ success: true, data: { pricesRecorded: recorded, items: bought.length } });
});

// ═══════════════════════════════════════════════════════════════════
// Precios
// ═══════════════════════════════════════════════════════════════════

shoppingRoutes.get('/prices', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const filter = priceFilterSchema.parse(c.req.query());

  // `price_observations` usa `household_id`/`user_id` (no `household_id`NULL-safe
  // como los items), asi que la clausula de alcance se reescribe con prefijo.
  const conditions = [scope.clause.replace(/(user_id|household_id)/g, 'p.$1')];
  const params: unknown[] = [...scope.params];
  if (filter.q) {
    conditions.push('(p.product_name LIKE ? OR p.store_name LIKE ?)');
    params.push(`%${filter.q}%`, `%${filter.q}%`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const rows = db
    .prepare(
      `SELECT p.*, COUNT(o.id) AS observations
       FROM price_observations p
       LEFT JOIN price_observations o ON o.product_key = p.product_key AND o.observed_at >= datetime(p.observed_at, '-180 days')
       ${where}
       GROUP BY p.id
       ORDER BY p.observed_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, filter.limit, filter.offset) as any[];

  return c.json({ success: true, data: rows, meta: { limit: filter.limit, offset: filter.offset } });
});

shoppingRoutes.post('/prices', async (c) => {
  const db = getDatabase();
  const userId = c.get('userId');
  const scope = getScope(userId);
  const body = createPriceSchema.parse(await c.req.json());

  const id = nanoid();
  db.prepare(
    `INSERT INTO price_observations
       (id, user_id, household_id, product_key, product_name, store_name, price_minor, quantity, source, observed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', CURRENT_TIMESTAMP)`
  ).run(
    id,
    userId,
    scope.householdId,
    productKeyOf(body.productName),
    body.productName,
    body.store ?? null,
    body.priceMinor,
    body.quantity ?? 1
  );

  return c.json({ success: true, data: db.prepare('SELECT * FROM price_observations WHERE id = ?').get(id) }, 201);
});

shoppingRoutes.delete('/prices/:id', async (c) => {
  const db = getDatabase();
  const userId = c.get('userId');
  // Se comparte la lectura (el hogar ve los precios de todos) pero no la
  // propiedad: un borrado es destructivo y no hay «Deshacer» para una
  // observacion. Dejar que cualquier miembro borre la fila de otra persona es
  // una forma facil de perder el historial de precios por un desliz.
  const result = db.prepare('DELETE FROM price_observations WHERE id = ? AND user_id = ?').run(
    c.req.param('id'),
    userId
  );
  if (result.changes === 0) return notFound(c, 'Price');
  return c.json({ success: true, data: { id: c.req.param('id') } });
});

// ═══════════════════════════════════════════════════════════════════
// Auditoria y en-vivo (§8f)
// ═══════════════════════════════════════════════════════════════════

shoppingRoutes.get('/lists/:id/events', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const list = readList(db, scope, c.req.param('id'));
  if (!list) return notFound(c, 'List');

  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit')) || 50));
  const rows = readEvents(db, { listId: list.id, limit });
  return c.json({ success: true, data: rows.map((row) => ({ ...row, description: describeEvent(row) })) });
});

const HEARTBEAT_MS = 15_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // El reloj no puede mantener vivo el proceso: en un Raspberry Pi el server se
    // para y se queda esperando a un timer de un navegador ya cerrado.
    (timer as any).unref?.();
  });
}

/**
 * Un solo mecanismo para los dos canales. Se escribe aqui y no en el frontend porque
 * el unico que sabe si una conexion sigue viva es el server: el navegador puede estar
 * en el pasillo, con la pantalla apagada y el socket ya roto.
 *
 * El cliente recibe `change` y VUELVE A LEER; nunca pinta lo que trae el evento. El
 * payload es una pista de refresco, no la verdad — si se perdiera un evento, la
 * pantalla se corrige con el siguiente toque en vez de quedarse con un dato inventado.
 */
async function pumpStream(stream: any, channels: string[], listId: string | null): Promise<void> {
  const queue: LiveEvent[] = [];
  let wake: (() => void) | null = null;
  let closed = false;

  const offs = channels.map((channel) =>
    subscribe(channel, (event) => {
      if (listId && event.listId && event.listId !== listId) return;
      queue.push(event);
      wake?.();
    })
  );
  stream.onAbort(() => {
    closed = true;
    wake?.();
  });

  try {
    await stream.writeSSE({ event: 'ready', data: JSON.stringify({ at: new Date().toISOString(), channels }) });
    while (!closed) {
      const event = queue.shift();
      if (event) {
        await stream.writeSSE({ event: 'change', data: JSON.stringify(event) });
        continue;
      }
      await Promise.race([
        new Promise<void>((resolve) => {
          wake = () => {
            wake = null;
            resolve();
          };
        }),
        sleep(HEARTBEAT_MS)
      ]);
      if (closed) break;
      // Corazon: un proxy del enjambre corta una conexion silenciosa, y el usuario
      // no tiene forma de saber que su lista dejo de estar en vivo.
      await stream.writeSSE({ event: 'ping', data: '{}' });
    }
  } catch {
    // El otro extremo cerro la pestana a medias: no hay nada que reportar.
  } finally {
    offs.forEach((off) => off());
  }
}

/** El detalle de una lista en vivo. */
shoppingRoutes.get('/stream/lists/:listId', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const list = readList(db, scope, c.req.param('listId'));
  if (!list) return notFound(c, 'List');

  return streamSSE(c, async (stream) => {
    await pumpStream(stream, [channelForList(list.id)], list.id);
  });
});

/** La bandeja: listas que nacen, se terminan o se borran en otra pantalla del hogar. */
shoppingRoutes.get('/stream/tray', async (c) => {
  const userId = c.get('userId');
  const scope = getScope(userId);
  return streamSSE(c, async (stream) => {
    await pumpStream(stream, channelsForTray({ userId, householdId: scope.householdId }), null);
  });
});


export { shoppingRoutes };
