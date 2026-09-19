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
