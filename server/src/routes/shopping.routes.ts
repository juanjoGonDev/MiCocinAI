import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { getDatabase } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { productKeyOf } from '../utils/product-key.js';
import {
  bulkItemsSchema,
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
// Listas
// ═══════════════════════════════════════════════════════════════════

shoppingRoutes.get('/lists', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const filter = listFilterSchema.parse(c.req.query());

  const conditions = [scope.clause];
  const params = [...scope.params];

  if (filter.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  } else {
    // Por defecto no se ven las terminadas: la pantalla es para lo que queda
    // por comprar, el historial vive en su propia pestana.
    conditions.push(`status IN ('active', 'archived')`);
  }
  if (filter.q) {
    conditions.push('name LIKE ?');
    params.push(`%${filter.q}%`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const lists = db
    .prepare(
      `SELECT l.* FROM shopping_lists l ${where}
       ORDER BY (l.status = 'active') DESC, l.updated_at DESC, l.created_at DESC, l.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, filter.limit, filter.offset) as any[];

  const data = lists.map((list) => ({ ...list, ...listTotals(db, list.id) }));
  const { count } = db.prepare(`SELECT COUNT(*) AS count FROM shopping_lists l ${where}`).get(...params) as {
    count: number;
  };

  return c.json({ success: true, data, meta: { total: count, limit: filter.limit, offset: filter.offset } });
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

  return c.json({ success: true, data: { ...list, items, ...listTotals(db, list.id) } });
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

  sets.push('version = version + 1', 'updated_at = CURRENT_TIMESTAMP');
  db.prepare(`UPDATE shopping_lists SET ${sets.join(', ')} WHERE id = ?`).run(...params, list.id);

  const updated = readList(db, scope, list.id);
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

function insertItem(db: ReturnType<typeof getDatabase>, listId: string, input: any) {
  const id = nanoid();
  const key = productKeyOf(input.name);
  db.prepare(
    `INSERT INTO shopping_list_items
       (id, list_id, name, product_key, quantity, unit, category, price_minor, note, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    nextPosition(db, listId)
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
    db.prepare('UPDATE shopping_list_items SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      body.quantity ?? 1,
      existing.id
    );
    db.prepare('UPDATE shopping_lists SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      list.id
    );
    // Se relee la fila: responder con la copia leida ANTES del UPDATE devolvria la
    // cantidad vieja y la UI tendria que adivinar el resultado de su propio toque.
    const mergedRow = db.prepare('SELECT * FROM shopping_list_items WHERE id = ?').get(existing.id) as any;
    return c.json({ success: true, data: { ...mergedRow, merged: true } }, 200);
  }

  const id = insertItem(db, list.id, body);
  db.prepare('UPDATE shopping_lists SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    list.id
  );

  const item = db.prepare('SELECT * FROM shopping_list_items WHERE id = ?').get(id) as any;
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
          'UPDATE shopping_list_items SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(line.quantity ?? 1, existing.id);
        merged.push(db.prepare('SELECT * FROM shopping_list_items WHERE id = ?').get(existing.id));
        continue;
      }
      added.push(db.prepare('SELECT * FROM shopping_list_items WHERE id = ?').get(insertItem(db, list.id, line)));
    }
    db.prepare('UPDATE shopping_lists SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      list.id
    );
  });
  transaction();

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

  sets.push('updated_at = CURRENT_TIMESTAMP');
  db.prepare(`UPDATE shopping_list_items SET ${sets.join(', ')} WHERE id = ?`).run(...params, item.id);
  db.prepare('UPDATE shopping_lists SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    list.id
  );

  const updated = db.prepare('SELECT * FROM shopping_list_items WHERE id = ?').get(item.id) as any;
  return c.json({ success: true, data: updated });
});

/** Borrado logico: el «Deshacer» de la UI de movil tiene que poder cumplirse. */
shoppingRoutes.delete('/lists/:id/items/:itemId', async (c) => {
  const db = getDatabase();
  const scope = getScope(c.get('userId'));
  const list = readList(db, scope, c.req.param('id'));
  if (!list) return notFound(c, 'List');

  const result = db
    .prepare(
      `UPDATE shopping_list_items SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND list_id = ? AND deleted_at IS NULL`
    )
    .run(c.req.param('itemId'), list.id);

  if (result.changes === 0) return notFound(c, 'Item');
  db.prepare('UPDATE shopping_lists SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    list.id
  );

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
  return c.json({ success: true, data: item });
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
  const lines = items.map((item) => {
    if (item.price_minor != null) {
      const lineTotal = roundMinor(item.price_minor * (item.quantity ?? 1));
      totalMinor += lineTotal;
      return { itemId: item.id, name: item.name, source: 'manual' as const, unitMinor: item.price_minor, lineTotalMinor: lineTotal };
    }

    const found = observation.get(productKeyOf(item.name), c.get('userId'), list.household_id) as
      | { price_minor: number; quantity: number; store_name: string | null; observed_at: string }
      | undefined;

    if (!found) return { itemId: item.id, name: item.name, source: 'unpriced' as const, lineTotalMinor: null };

    const unitMinor = roundMinor(found.price_minor / (found.quantity || 1));
    const lineTotal = roundMinor(unitMinor * (item.quantity ?? 1));
    totalMinor += lineTotal;
    return {
      itemId: item.id,
      name: item.name,
      source: 'observed' as const,
      unitMinor,
      lineTotalMinor: lineTotal,
      store: found.store_name,
      observedAt: found.observed_at
    };
  });

  return c.json({
    success: true,
    data: {
      listId: list.id,
      currency: 'EUR',
      totalMinor,
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
      // El item guarda precio/unidad; la observacion, lo pagado por esa cantidad.
      insertObservation.run(
        nanoid(),
        userId,
        list.household_id,
        item.product_key,
        item.name,
        list.store,
        roundMinor(item.price_minor * (item.quantity ?? 1)),
        item.quantity ?? 1
      );
      recorded += 1;
    }
    db.prepare(
      `UPDATE shopping_lists SET status = 'done', completed_at = CURRENT_TIMESTAMP,
         version = version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(list.id);
  })();

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

export { shoppingRoutes };
