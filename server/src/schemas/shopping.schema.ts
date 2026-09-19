import { z } from 'zod';

/**
 * Contrato de la lista de la compra y de los precios.
 *
 * El dinero es SIEMPRE enteros en centimos (`*_minor`): un float de 0.1 + 0.2
 * no vale para sumar una cesta. Las cantidades si son reales, porque medio kilo
 * es una cantidad legitima; lo que no se admite es que una cantidad o un precio
 * entren negativos o a cero — un precio 0 no es «gratis», es «sin dato», y para
 * eso existe `null`.
 */

export const LIST_STATUSES = ['active', 'archived', 'done'] as const;

const trimmed = (max: number) => z.string().trim().min(1).max(max);

/** Cantidad: > 0 y con techo razonable (un pedido de 1e6 unidades es un bug). */
const quantity = z.coerce.number().positive().max(10000);

/** Precio en centimos. `null` explicito = «quiero borrar el precio de la linea». */
const priceMinor = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.coerce.number().int().min(0).max(100_000_000).nullable().optional()
);

/**
 * `z.coerce.boolean()` no vale aqui: convierte la cadena 'false' en true (cualquier
 * string no vacia es truthy), y el check de una linea llega por query/body como
 * string segun quien llame. Se listan las formas honestas y se traduce.
 */
export const booleanish = z
  .union([z.boolean(), z.enum(['0', '1', 'true', 'false', 'on', 'off'])])
  .transform((value) => value === true || value === '1' || value === 'true' || value === 'on');

const pageSize = z.coerce.number().int().min(1).max(200).catch(50);
const offset = z.coerce.number().int().min(0).max(100000).catch(0);

export const listFilterSchema = z.object({
  status: z.enum(LIST_STATUSES).optional(),
  q: z.string().trim().max(120).optional(),
  limit: pageSize,
  offset
});

export const createListSchema = z.object({
  name: trimmed(80),
  store: z.string().trim().max(80).nullable().optional()
});

/**
 * `version` es el CAS: la app guarda en local y el movil puede estar horas sin
 * red, asi que la unica forma de no pisar lo que otra persona del hogar marco es
 * decir sobre que version se esta escribiendo. Los items no la exigen: marcar una
 * casilla es conmutativo y un conflicto ahi se resuelve solo (ver el comentario
 * en PATCH /lists/:id/items/:itemId).
 */
export const updateListSchema = z
  .object({
    name: trimmed(80).optional(),
    store: z.string().trim().max(80).nullable().optional(),
    status: z.enum(LIST_STATUSES).optional(),
    version: z.coerce.number().int().positive()
  })
  .refine((value) => value.name !== undefined || value.store !== undefined || value.status !== undefined, {
    message: 'NothingToUpdate'
  });

export const createItemSchema = z.object({
  name: trimmed(120),
  quantity: quantity.optional(),
  unit: z.string().trim().max(24).nullable().optional(),
  category: z.string().trim().max(48).nullable().optional(),
  priceMinor: priceMinor,
  note: z.string().trim().max(280).nullable().optional()
});

export const updateItemSchema = z
  .object({
    name: trimmed(120).optional(),
    quantity: quantity.optional(),
    unit: z.string().trim().max(24).nullable().optional(),
    category: z.string().trim().max(48).nullable().optional(),
    checked: booleanish.optional(),
    priceMinor: priceMinor,
    note: z.string().trim().max(280).nullable().optional()
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.quantity !== undefined ||
      value.unit !== undefined ||
      value.category !== undefined ||
      value.checked !== undefined ||
      value.priceMinor !== undefined ||
      value.note !== undefined,
    { message: 'NothingToUpdate' }
  );

/** Pegado desde otro sitio: `lines` es texto con una linea por producto. */
export const bulkItemsSchema = z
  .object({
    lines: z.string().max(20000),
    items: z.array(createItemSchema).max(200).optional()
  })
  .refine((value) => value.lines.trim().length > 0 || (value.items?.length ?? 0) > 0, {
    message: 'NothingToAdd'
  });

export const orderSchema = z.object({
  itemIds: z.array(z.string()).max(500),
  version: z.coerce.number().int().positive()
});

export const priceFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  limit: pageSize,
  offset
});

export const createPriceSchema = z.object({
  productName: trimmed(120),
  priceMinor: z.coerce.number().int().min(1).max(100_000_000),
  quantity: quantity.optional(),
  unit: z.string().trim().max(24).nullable().optional(),
  store: z.string().trim().max(80).nullable().optional()
});

/**
 * Una linea pegada tipo `2 Leche semidesnatada` o `1,5 kg tomate de colgar`.
 * Se parsea aqui y no en la UI: el mismo texto puede llegar del portapapeles,
 * del asistente de voz o de un `POST /items/bulk`, y los tres tienen que
 * entenderse igual.
 */
export function parseItemLine(line: string): z.infer<typeof createItemSchema> | null {
  const clean = line.replace(/^\s*(?:[-*•]|\d+[).])\s+/, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return null;

  const match = /^(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|ud|uds|unidades?|pack|bote|botella)?\s+(.+)$/i.exec(clean);
  if (!match) return { name: clean.slice(0, 120) };

  const [, rawQuantity, rawUnit, rest] = match;
  const parsed = Number.parseFloat(rawQuantity.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return { name: clean.slice(0, 120) };

  return {
    name: rest.slice(0, 120),
    quantity: Math.min(parsed, 10000),
    unit: (rawUnit ?? null) as string | null
  };
}

export type ListFilter = z.infer<typeof listFilterSchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;
