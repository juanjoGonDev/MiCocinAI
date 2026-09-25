/**
 * La cola de consumo de IA de los tickets (HOGARIA-SPEC ## 12aj).
 *
 * LOCAL y durable: los trabajos viven en la tabla `ai_jobs` (no en memoria), asi que un
 * reinicio del server no pierde nada —el barrido de arranque devuelve a la cola lo que quedo
 * `running` con el lease caducado—. La concurrencia es POR CONFIGURACION de IA (por proveedor),
 * default 1, y se toca desde el apartado de IA: un proveedor lento no se come la clave de otro.
 *
 * Cada trabajo: coge el ticket, construye el «inventario.json», llama al modelo EN STREAMING,
 * y va guardando cada linea en cuanto el modelo la cierra —que es lo que hace que en la pantalla
 * se vea «poco a poco» lo que va analizando, sin fingir nada. Al final valida el objeto entero
 * (el stream puede traer lineas que el objeto final no tiene, y al reves), registra la tienda
 * detectada si no existe, y deja el ticket en `review`.
 *
 * Parar: cada trabajo en marcha lleva su `AbortController`; parar uno lo cancela de verdad (el
 * `fetch` se aborta), parar todo cancela los que corren y marca `stopped` los que esperaban.
 * Reintentar devuelve el trabajo a la cola y LIMPIA las lineas a medias: un ticket no lleva
 * lineas de dos lecturas distintas.
 */

import { randomUUID } from 'node:crypto';
import type { Database as SqlDb } from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { getDatabase } from '../config/database.js';
import {
  activeAiConfig,
  AiCallError,
  callAI,
  callAIStreaming,
  extractJsonObject
} from './ai-client.js';
import {
  buildInventarioJson,
  buildTicketPrompt,
  type InventarioParaPrompt
} from './ticket-prompt.js';
import { lineasNuevas } from './ticket-lines-stream.js';
import { ticketAnswerSchema } from '../schemas/receipts.schema.js';
import { leerTicket } from './ticket-files.js';

const TICK_MS = 700;
const LEASE_SEGUNDOS = 300;

type Trabajador = {
  temporizador: NodeJS.Timeout;
  corriendo: Set<string>;
  señales: Map<string, AbortController>;
};

let trabajador: Trabajador | null = null;

/** Arranca la cola si no estaba arrancada (idempotente) y devuelve su estado. */
export function ensureWorker(): Trabajador {
  if (trabajador) return trabajador;
  barrerArranque();
  const estado: Trabajador = {
    temporizador: setInterval(paso, TICK_MS),
    corriendo: new Set(),
    señales: new Map()
  };
  estado.temporizador.unref?.();
  trabajador = estado;
  return estado;
}

/** El barrido de arranque del P4: un `running` con el lease caducado vuelve a la cola. */
export function barrerArranque(db: SqlDb = getDatabase()): number {
  const info = db
    .prepare(
      `UPDATE ai_jobs SET status = 'queued', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'running' AND (lease_until IS NULL OR lease_until < datetime('now'))`
    )
    .run();
  if (info.changes > 0) {
    db.prepare(
      `UPDATE receipts SET status = 'queued', updated_at = CURRENT_TIMESTAMP WHERE status = 'analyzing'`
    ).run();
  }
  return info.changes;
}

/** Cuantos trabajos puede tener a la vez la configuracion activa de un usuario. */
export function concurrenciaDe(db: SqlDb, userId: string): number {
  const activa = activeAiConfig(db, userId);
  const tope = Number(activa?.concurrency ?? 1);
  return Number.isFinite(tope) && tope >= 1 ? Math.min(Math.trunc(tope), 8) : 1;
}

/** Un paso del bucle: lanza trabajos hasta llenar la concurrencia de cada configuracion. */
function paso(): void {
  const estado = trabajador;
  if (!estado) return;
  const db = getDatabase();
  const enCola = db
    .prepare(
      `SELECT j.id, j.user_id FROM ai_jobs j
       WHERE j.status = 'queued' ORDER BY j.created_at LIMIT 32`
    )
    .all() as { id: string; user_id: string }[];
  if (enCola.length === 0) return;

  const corriendoPorUsuario = new Map<string, number>();
  for (const id of estado.corriendo) {
    const fila = db.prepare('SELECT user_id FROM ai_jobs WHERE id = ?').get(id) as
      { user_id: string } | undefined;
    if (fila)
      corriendoPorUsuario.set(fila.user_id, (corriendoPorUsuario.get(fila.user_id) ?? 0) + 1);
  }

  for (const trabajo of enCola) {
    // Sin sitio para SU configuracion se salta: el resto de usuarios conserva el suyo.
    const enMarcha = corriendoPorUsuario.get(trabajo.user_id) ?? 0;
    if (enMarcha >= concurrenciaDe(db, trabajo.user_id)) continue;
    corriendoPorUsuario.set(trabajo.user_id, enMarcha + 1);
    lanzar(trabajo.id, trabajo.user_id);
  }
}

function lanzar(jobId: string, userId: string): void {
  const estado = ensureWorker();
  estado.corriendo.add(jobId);
  const señal = new AbortController();
  estado.señales.set(jobId, señal);
  void correr(jobId, userId, señal).finally(() => {
    estado.corriendo.delete(jobId);
    estado.señales.delete(jobId);
  });
}

async function correr(jobId: string, userId: string, señal: AbortController): Promise<void> {
  const db = getDatabase();
  const trabajo = db
    .prepare(
      `UPDATE ai_jobs SET status = 'running', attempts = attempts + 1, started_at = CURRENT_TIMESTAMP,
         lease_until = datetime('now', '+${LEASE_SEGUNDOS} seconds'), updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'queued'`
    )
    .run(jobId);
  if (trabajo.changes === 0) return;

  const recibo = db
    .prepare(`SELECT r.* FROM receipts r JOIN ai_jobs j ON j.receipt_id = r.id WHERE j.id = ?`)
    .get(jobId) as
    | { id: string; file_url: string; file_kind: 'png' | 'jpeg' | 'webp' | 'pdf'; status: string }
    | undefined;
  if (!recibo) {
    db.prepare(
      `UPDATE ai_jobs SET status = 'done', finished_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(jobId);
    return;
  }
  db.prepare(
    `UPDATE receipts SET status = 'analyzing', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(recibo.id);
  // Una lectura que empieza, empieza limpia: las lineas de un intento anterior no se mezclan.
  db.prepare('DELETE FROM receipt_items WHERE receipt_id = ?').run(recibo.id);

  try {
    const fichero = leerTicket(recibo.file_url);
    if (!fichero)
      throw new AiCallError(
        'PROVIDER',
        'El fichero del ticket ya no esta en el servidor',
        'FILE_MISSING'
      );

    const { system, user } = buildTicketPrompt({
      inventarioJson: buildInventarioJson(inventarioDeLaCasa(db, userId)),
      esPdf: recibo.file_kind === 'pdf'
    });
    const contenido =
      recibo.file_kind === 'pdf'
        ? [
            { type: 'text', text: user },
            {
              type: 'image_url',
              image_url: { url: `data:application/pdf;base64,${fichero.toString('base64')}` }
            }
          ]
        : [
            { type: 'text', text: user },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/${recibo.file_kind === 'jpeg' ? 'jpeg' : recibo.file_kind};base64,${fichero.toString('base64')}`,
                detail: 'high'
              }
            }
          ];

    // El stream va guardando lineas a medida que el modelo las cierra.
    let acumulado = '';
    let entregadas = 0;
    let vistasEnStream = 0;
    const respuesta = await callAIStreaming(
      userId,
      [
        { role: 'system', content: system },
        { role: 'user', content: contenido as never }
      ],
      db,
      (delta) => {
        acumulado += delta;
        const nuevas = lineasNuevas(acumulado, vistasEnStream);
        for (const linea of nuevas) {
          vistasEnStream += 1;
          const parseada = seguro(() => JSON.parse(linea.crudo));
          if (!parseada || typeof parseada !== 'object' || !('name' in parseada)) continue;
          if (entregadas >= 300) return;
          insertarLinea(db, recibo.id, parseada as Record<string, unknown>, entregadas);
          entregadas += 1;
        }
      },
      señal.signal
    ).catch(async (error) => {
      // Sin stream en este proveedor (o error antes del primer trozo): caer a la llamada entera.
      if (entregadas > 0 || acumulado.length > 0) throw error;
      return callAI(
        userId,
        [
          { role: 'system', content: system },
          { role: 'user', content: contenido as never }
        ],
        db
      );
    });

    const validado = ticketAnswerSchema.safeParse(extractJsonObject(respuesta));
    if (!validado.success) {
      throw new AiCallError(
        'BAD_JSON',
        'La respuesta del modelo no cuadra con lo que se le pidio',
        JSON.stringify(validado.error.issues.slice(0, 4))
      );
    }

    // Lo que manda es el objeto FINAL validado: el stream puede haber guardado una version a
    // medias de una linea que el modelo corrigio despues. Se reescriben todas.
    db.prepare('DELETE FROM receipt_items WHERE receipt_id = ?').run(recibo.id);
    let posicion = 0;
    for (const linea of validado.data.lines) {
      insertarLinea(db, recibo.id, linea as unknown as Record<string, unknown>, posicion);
      posicion += 1;
    }

    const tienda = validado.data.store?.trim() || null;
    if (tienda) registrarTienda(db, userId, tienda);
    db.prepare(
      `UPDATE receipts SET status = 'review', store = COALESCE(?, store), currency = ?, total_minor = ?,
         warnings = ?, error_code = NULL, error_detail = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      tienda,
      validado.data.currency ?? 'EUR',
      validado.data.totalMinor ?? null,
      JSON.stringify(validado.data.warnings ?? []),
      recibo.id
    );
    db.prepare(
      `UPDATE ai_jobs SET status = 'done', finished_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(jobId);
  } catch (error) {
    const cancelado = señal.signal.aborted;
    const codigo = cancelado ? 'CANCELLED' : error instanceof AiCallError ? error.code : 'PROVIDER';
    const detalle = cancelado
      ? 'Parado por la persona'
      : String((error as Error)?.message ?? error).slice(0, 300);
    const fila = db
      .prepare('SELECT attempts, max_attempts, receipt_id FROM ai_jobs WHERE id = ?')
      .get(jobId) as
      { attempts: number; max_attempts: number; receipt_id: string | null } | undefined;
    const reintentosQuedan =
      !!fila &&
      !cancelado &&
      fila.attempts < fila.max_attempts &&
      codigo !== 'BAD_JSON' &&
      codigo !== 'NO_CONFIG';
    db.prepare(
      `UPDATE ai_jobs SET status = ?, error_code = ?, error_detail = ?, updated_at = CURRENT_TIMESTAMP,
         finished_at = ${reintentosQuedan ? 'NULL' : 'CURRENT_TIMESTAMP'} WHERE id = ?`
    ).run(reintentosQuedan ? 'queued' : 'failed', codigo, detalle, jobId);
    if (fila?.receipt_id) {
      db.prepare(
        `UPDATE receipts SET status = ?, error_code = ?, error_detail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(
        reintentosQuedan ? 'queued' : cancelado ? 'stopped' : 'failed',
        codigo,
        detalle,
        fila.receipt_id
      );
    }
  }
}

/** `try` que no rompe el bucle: una linea mala del stream no tira la lectura entera. */
function seguro<T>(intentar: () => T): T | null {
  try {
    return intentar();
  } catch {
    return null;
  }
}

function insertarLinea(
  db: SqlDb,
  receiptId: string,
  linea: Record<string, unknown>,
  posicion: number
): void {
  const nombre = String(linea.name ?? '').trim();
  if (!nombre) return;
  const cantidad = Number(linea.quantity);
  const precio =
    linea.priceMinor === null || linea.priceMinor === undefined ? null : Number(linea.priceMinor);
  const oferta = (linea.offer ?? null) as { buy?: number; take?: number } | null;
  db.prepare(
    `INSERT INTO receipt_items (id, receipt_id, name, quantity, unit, category, price_minor, offer_buy, offer_take, note, confidence, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    nanoid(),
    receiptId,
    nombre.slice(0, 120),
    Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1,
    linea.unit ? String(linea.unit).slice(0, 24) : null,
    linea.category ? String(linea.category).trim().slice(0, 64) || 'other' : 'other',
    Number.isFinite(precio as number) && (precio as number) >= 0
      ? Math.trunc(precio as number)
      : null,
    oferta?.buy ?? null,
    oferta?.take ?? null,
    linea.note ? String(linea.note).slice(0, 280) : null,
    Number.isFinite(Number(linea.confidence)) ? Number(linea.confidence) : null,
    posicion
  );
}

/** El «inventario.json» de la casa: tiendas, categorias de la despensa y sus productos. */
export function inventarioDeLaCasa(db: SqlDb, userId: string): InventarioParaPrompt {
  const hogar = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId) as
    { household_id: string | null } | undefined;
  const householdId = hogar?.household_id ?? null;

  const tiendas = (
    db
      .prepare(
        `SELECT DISTINCT name FROM stores WHERE user_id = ? OR (household_id IS NOT NULL AND household_id = ?)
         UNION SELECT DISTINCT store AS name FROM shopping_lists
           WHERE (user_id = ? OR (household_id IS NOT NULL AND household_id = ?)) AND store IS NOT NULL AND TRIM(store) <> ''
         ORDER BY name LIMIT 200`
      )
      .all(userId, householdId, userId, householdId) as { name: string }[]
  ).map((fila) => fila.name);

  const categorias = (
    db
      .prepare(
        `SELECT key, name FROM pantry_categories WHERE user_id = ? OR (household_id IS NOT NULL AND household_id = ?)
         ORDER BY position LIMIT 300`
      )
      .all(userId, householdId) as { key: string; name: string }[]
  ).map((fila) => ({ clave: fila.key, nombre: fila.name }));

  const productos = (
    db
      .prepare(
        `SELECT name, category, unit FROM ingredients WHERE (user_id = ? OR (household_id IS NOT NULL AND household_id = ?))
         ORDER BY name LIMIT 2000`
      )
      .all(userId, householdId) as { name: string; category: string; unit: string }[]
  ).map((fila) => ({ categoria: fila.category, nombre: fila.name, unidad: fila.unit }));

  return { tiendas, categorias, productos };
}

/** Registrar una tienda que no existe: la deteccion de un ticket la deja escrita. */
export function registrarTienda(db: SqlDb, userId: string, nombre: string): void {
  const hogar = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId) as
    { household_id: string | null } | undefined;
  const limpia = nombre.trim();
  if (!limpia) return;
  const ya = db
    .prepare(
      `SELECT id FROM stores WHERE name = ? AND (user_id = ? OR (household_id IS NOT NULL AND household_id = ?))`
    )
    .get(limpia, userId, hogar?.household_id ?? null);
  if (ya) return;
  db.prepare('INSERT INTO stores (id, user_id, household_id, name) VALUES (?, ?, ?, ?)').run(
    randomUUID(),
    userId,
    hogar?.household_id ?? null,
    limpia
  );
}

/** Parar un trabajo concreto: cancela el `fetch` y deja el ticket `stopped`. */
export function pararTrabajo(jobId: string): boolean {
  const estado = trabajador;
  const señal = estado?.señales.get(jobId);
  if (!señal) return false;
  señal.abort();
  return true;
}

/** Parar todo lo de un usuario: los que corren se cancelan y los que esperan quedan `stopped`. */
export function pararTodo(userId: string): { cancelados: number; detenidos: number } {
  const db = getDatabase();
  const estado = trabajador;
  let cancelados = 0;
  if (estado) {
    for (const [jobId, señal] of estado.señales) {
      const fila = db.prepare('SELECT user_id FROM ai_jobs WHERE id = ?').get(jobId) as
        { user_id: string } | undefined;
      if (fila?.user_id !== userId) continue;
      señal.abort();
      cancelados += 1;
    }
  }
  const detenidos = db
    .prepare(
      `UPDATE ai_jobs SET status = 'stopped', updated_at = CURRENT_TIMESTAMP, finished_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND status = 'queued'`
    )
    .run(userId).changes;
  db.prepare(
    `UPDATE receipts SET status = 'stopped', updated_at = CURRENT_TIMESTAMP
     WHERE status = 'queued' AND id IN (SELECT receipt_id FROM ai_jobs WHERE user_id = ? AND status = 'stopped')`
  ).run(userId);
  return { cancelados, detenidos };
}

/** Reintentar: el trabajo vuelve a la cola (sus lineas a medias se limpian al arrancar). */
export function reencolar(jobId: string): boolean {
  const db = getDatabase();
  const info = db
    .prepare(
      `UPDATE ai_jobs SET status = 'queued', error_code = NULL, error_detail = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN ('failed', 'stopped', 'done')`
    )
    .run(jobId);
  if (info.changes === 0) return false;
  const recibo = db.prepare('SELECT receipt_id FROM ai_jobs WHERE id = ?').get(jobId) as
    { receipt_id: string | null } | undefined;
  if (recibo?.receipt_id) {
    db.prepare(
      `UPDATE receipts SET status = 'queued', error_code = NULL, error_detail = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN ('failed', 'stopped', 'review', 'confirmed')`
    ).run(recibo.receipt_id);
  }
  ensureWorker();
  return true;
}
