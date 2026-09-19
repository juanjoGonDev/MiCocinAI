/**
 * Modelo de la lista de la compra y de los precios.
 *
 * El dinero viaja en centimos (enteros) por contrato con el backend; aqui solo se
 * convierte para pintar y para leer lo que teclea una persona. Las dos funciones de
 * conversion son puras y tienen sus pruebas: un "1,290.50" mal leido es una cesta
 * mal contada, y eso es exactamente el tipo de bug que hace que nadie vuelva a anotar
 * un precio.
 */

export type ShoppingListStatus = 'active' | 'archived' | 'done';

export interface ShoppingList {
  id: string;
  name: string;
  store: string | null;
  status: ShoppingListStatus;
  version: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  /** Calculados por el server: la pantalla y el dashboard tienen que decir lo mismo. */
  totalItems: number;
  checkedItems: number;
  pricedTotalMinor: number;
  /** El descuento de la lista, y la frase que lo cuenta (el server la escribe). */
  discount?: ListDiscount | null;
  discountDescription?: string | null;
  /** Suministra el server cuando hay casa: la lista puede ser de otra persona. */
  added_by_name?: string | null;
}

export interface ShoppingListItem {
  id: string;
  list_id: string;
  name: string;
  product_key: string;
  quantity: number;
  unit: string | null;
  category: string | null;
  /** Precio POR UNIDAD en centimos; null = sin dato (no es lo mismo que 0). */
  price_minor: number | null;
  note: string | null;
  position: number;
  checked: 0 | 1;
  deleted_at: string | null;
  /** Oferta de linea (3x2 = buy 3 / take 2). `null` = precio normal. */
  promo_buy: number | null;
  promo_take: number | null;
  added_by: string | null;
  updated_by: string | null;
  /** Los resuelve el server al leer la lista: un id de usuario no es legible. */
  added_by_name?: string | null;
  updated_by_name?: string | null;
}

/** La oferta como dato de UI: solo existe si es valida (take < buy y buy >= 2). */
export function offerOfItem(item: Pick<ShoppingListItem, 'promo_buy' | 'promo_take'>): LineOffer | null {
  const buy = Number(item.promo_buy ?? 0);
  const take = Number(item.promo_take ?? 0);
  if (!buy || !take || take >= buy || buy < 2) return null;
  return { buy, take };
}

export interface EstimateLine {
  itemId: string;
  name: string;
  source: 'manual' | 'observed' | 'unpriced';
  unitMinor?: number;
  lineTotalMinor: number | null;
  store?: string | null;
  observedAt?: string;
}

export interface ListEstimate {
  listId: string;
  currency: string;
  totalMinor: number;
  pricedLines: number;
  unpriced: string[];
  lines: EstimateLine[];
}

export interface PriceObservation {
  id: string;
  product_name: string;
  product_key: string;
  store_name: string | null;
  price_minor: number;
  quantity: number;
  observed_at: string;
  observations?: number;
}

export interface CreateItemInput {
  name: string;
  quantity?: number;
  unit?: string | null;
  category?: string | null;
  priceMinor?: number | null;
  note?: string | null;
  /** 3x2 = {buy:3, take:2}; `null` la quita. En la fila son promo_buy/promo_take. */
  offer?: LineOffer | null;
}

/** Categorias de la lista, en el orden en que se recorren en la tienda. */
export const LIST_CATEGORIES = [
  'Frutas y verduras',
  'Panaderia',
  'Carne y pescado',
  'Lacteos',
  'Congelados',
  'Despensa',
  'Bebidas',
  'Limpieza e higiene',
  'Otros'
] as const;

/**
 * Agrupa por seccion de tienda, con `Otros` siempre al final: lo que no tiene
 * seccion no debe colarse en medio del recorrido. Dentro de la seccion se
 * respeta el orden manual (`position`), que es lo que sostiene el arrastrar.
 */
export function groupItemsByCategory(items: ShoppingListItem[]): { category: string; items: ShoppingListItem[] }[] {
  const buckets = new Map<string, ShoppingListItem[]>();
  for (const item of items) {
    const category = item.category && item.category.trim() ? item.category : 'Otros';
    const bucket = buckets.get(category);
    if (bucket) bucket.push(item);
    else buckets.set(category, [item]);
  }

  const order = (category: string): number => {
    const index = (LIST_CATEGORIES as readonly string[]).indexOf(category);
    return index === -1 || category === 'Otros' ? LIST_CATEGORIES.length : index;
  };

  return [...buckets.entries()]
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b, 'es'))
    .map(([category, groupItems]) => ({ category, items: groupItems }));
}

/** `85 -> "0,85 €"`, `null -> "—"` (la raya dice «sin dato», el 0 diria «gratis»). */
export function formatMoney(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return '—';
  const euros = (minor < 0 ? -minor : minor) / 100;
  const text = euros.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${minor < 0 ? '-' : ''}${text} €`;
}

/**
 * `12,40 €` leido a mano -> `1240`. Null si no es un importe utilizable.
 *
 * Las reglas son las de un teclado espanol, no las de `Number.parseFloat`:
 *  - la coma es SIEMPRE el separador decimal ("1,20" -> 120, "1.290,50" -> 129050);
 *  - sin coma, un punto con 3 digitos detras son miles ("1.290" -> 1290 €), y con
 *    1-2 digitos es decimal ("1.5" -> 1,50, "1.20" -> 1,20);
 *  - "0" es un precio legitimo (gratis), el vacio no: es null, que es lo que pinta
 *    la raya en lugar de un 0 que se sumaria como si fuera real.
 * Y por arriba, 100.000 € por unidad es un dedo resbalado, no un precio.
 */
export function parseMoneyToMinor(input: string | null | undefined): number | null {
  const original = (input ?? '').replace(/\s/g, '').replace(/€|eur\b/gi, '');
  if (!original) return null;

  const usesComma = original.includes(',');
  if (!/^[\d.,]+$/.test(original)) return null;

  let digits = '';
  let decimals = '';

  if (usesComma) {
    // Con coma: la coma manda como decimal y los puntos son separadores de miles.
    const cleaned = original.replace(/\./g, '');
    const parts = cleaned.split(',');
    if (parts.length > 2) return null;
    digits = parts[0] || '0';
    decimals = (parts[1] ?? '').slice(0, 3);
  } else {
    const lastDot = original.lastIndexOf('.');
    if (lastDot === -1) {
      digits = original;
    } else {
      const head = original.slice(0, lastDot);
      const tail = original.slice(lastDot + 1);
      if (tail.length === 3 && /^\d{3}$/.test(tail)) {
        // "1.290" y "1.234.567": el punto separa miles, no decimales.
        digits = original.replace(/\./g, '');
      } else if (tail.length <= 2) {
        digits = head.replace(/\./g, '') || '0';
        decimals = tail;
      } else {
        return null;
      }
    }
  }

  if (!/^\d*$/.test(digits)) return null;
  if (decimals && !/^\d{1,3}$/.test(decimals)) return null;

  // Tres decimales redondean ("3,999" -> 4,00) en lugar de truncar: un presupuesto
  // que pierde un centimo por linea no es un presupuesto, es una costumbre.
  const minor = Math.round(Number(`${digits || '0'}.${decimals || '0'}`) * 100);
  if (!Number.isFinite(minor) || minor > 10_000_000) return null;
  return minor;
}

/** `2` + `"kg"` -> `"2 kg"`, `1` + `null` -> `""` (una unidad suelta no se pinta). */
export function formatQuantity(quantity: number, unit: string | null | undefined): string {
  const amount = Number.isInteger(quantity) ? String(quantity) : quantity.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  if (!unit) return quantity === 1 ? '' : `${amount}×`;
  return `${amount} ${unit}`;
}

// ---------------------------------------------------------------------------
// Lo que anadio la ronda 8f (secciones, auditoria, descuentos, foto, bandeja)
// ---------------------------------------------------------------------------

export interface ShoppingCategory {
  id: string;
  name: string;
  /** El color es DATO y no CSS: la IA lo elige al proponer una seccion nueva. */
  color: string;
  position: number;
  key: string;
}

export type ListEventAction =
  | 'list.create' | 'list.rename' | 'list.store' | 'list.status' | 'list.delete' | 'list.clear_checked'
  | 'items.add' | 'items.merge' | 'items.update' | 'items.check' | 'items.uncheck' | 'items.remove'
  | 'items.bulk_check' | 'items.bulk_remove' | 'items.reorder' | 'items.restore' | 'items.discount' | 'items.apply';

/** Lo que escribio la propia auditoria del server: `description` ya es la frase en castellano. */
export interface ListEvent {
  id: string;
  list_id: string;
  user_id: string;
  user_name: string | null;
  action: ListEventAction;
  item_name: string | null;
  created_at: string;
  description: string;
}

export type DiscountKind = 'amount' | 'percent';
export type DiscountScope = 'all' | 'firstUnits' | 'product' | 'category';

export interface ListDiscount {
  id: string;
  list_id: string;
  kind: DiscountKind;
  value_minor: number | null;
  percent_bps: number | null;
  scope: DiscountScope;
  first_units: number | null;
  /** Que producto o seccion entra con `scope: 'product' | 'category'`. */
  target?: string | null;
  label: string | null;
  /** La frase que pinta la fila de totales: el server la escribe, la app no la reconstruye. */
  description?: string | null;
}

export interface DiscountInput {
  kind: DiscountKind;
  valueMinor?: number | null;
  percentBps?: number | null;
  scope?: DiscountScope;
  firstUnits?: number | null;
  /** Obligatorio cuando `scope` promete un producto o una seccion: sin diana no hay descuento. */
  target?: string | null;
  label?: string | null;
}

/** Oferta de linea (3x2, 2x1): se pagan `buy - take` unidades de cada `buy`. */
export interface LineOffer {
  buy: number;
  take: number;
}

export const OFFER_PRESETS: { label: string; buy: number; take: number; hint: string }[] = [
  { label: '3x2', buy: 3, take: 2, hint: 'Pagas dos, llevas tres' },
  { label: '2x1', buy: 2, take: 1, hint: 'Uno gratis' },
  { label: '4x3', buy: 4, take: 3, hint: 'Pagas tres, llevas cuatro' },
  { label: '5x4', buy: 5, take: 4, hint: 'Pagas cuatro, llevas cinco' }
];

export function describeOffer(offer: LineOffer | null | undefined): string | null {
  if (!offer || !offer.buy || !offer.take) return null;
  if (offer.take >= offer.buy) return null;
  return `${offer.buy}x${offer.buy - offer.take}`;
}

export interface PhotoLine {
  name: string;
  quantity: number;
  unit?: string | null;
  category?: string | null;
  /** Pedir seccion nueva es normal: la IA ve un pasillo que el catalogo no tiene. */
  createCategory?: boolean;
  priceMinor?: number | null;
  offer?: LineOffer | null;
  confidence?: number;
  note?: string | null;
}

export interface PhotoAnalysis {
  listId: string;
  mode: 'auto' | 'ticket' | 'shelf';
  currency: string;
  warnings: string[];
  lines: PhotoLine[];
  categories: { name: string; color: string }[];
}

export type PhotoOutcome =
  | { ok: true; data: PhotoAnalysis }
  | { ok: false; status: number; message: string; data: Record<string, unknown> };

export type ListsSort = 'updated' | 'name' | 'total' | 'lines';

export interface ListsQuery {
  /** `all` es solo del filtro de la bandeja; el server lo entiende como "sin estado". */
  status?: ShoppingListStatus | 'all';
  q?: string;
  store?: string | null;
  minTotalMinor?: number | null;
  from?: string | null;
  to?: string | null;
  sort?: ListsSort;
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface ListsMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface StoreCount {
  store: string;
  lists: number;
}
