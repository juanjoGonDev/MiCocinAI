/**
 * Catalogo de categorias del inventario (HOGARIA-SPEC ## 12x).
 *
 * Antes de esta tanda la categoria de un articulo de despensa era un enum cerrado en el codigo, escrito dos
 * veces (el `z.enum` del server y la union del cliente), y el desplegable del formulario pintaba aquellas doce
 * palabras con un `<select>` nativo. Una casa no podia crear la suya, renombrar la de siempre ni quitar lo que
 * no usa. Este fichero convierte eso en dato: `pantry_categories`, con nombre, color, descripcion y padre.
 *
 * Las tres cosas que sostienen el diseño, y que no son gusto:
 *
 * 1. **`key` es el dato, `name` es la etiqueta.** `ingredients.category` guarda la clave, y el prompt de la IA
 *    tambien; renombrar una categoria no reescribe ninguna fila. Por eso `PATCH` no toca `key`, ni siquiera
 *    cuando el nombre cambia.
 * 2. **`other` es la reserva, y no se puede romper.** Cae ahi lo que llega sin categoria (un ticket fotografizado,
 *    un articulo viejo con una clave que alguien borro). Se puede pintar como se quiera —color y nota—, pero no se
 *    puede renombrar, recolocar ni borrar: si la reserva se va, cada fila huerfana necesita una decision.
 * 3. **Borrar esta bloqueado mientras quede algo encima.** Un 409 con el recuento dentro, para que el dialogo
 *    pueda decir «42 articulos y 3 subcategorias» en vez de «no se puede».
 *
 * El modelo de referencias es Basketra (`src/domain/categories.ts`, `catalog-management-core.ts`), con dos
 * diferencias deliberadas: el padre se referencia por `parent_key` y no por id (las claves son lo que ya viaja
 * en las filas y en el prompt), y la profundidad tiene techo —el conteo de descendientes recorre el arbol, y un
 * ciclo no es un fallo feo: es un bucle que no acaba nunca—.
 */
import type Database from 'better-sqlite3';

type Db = Database.Database;

/** Lo que hay en las filas hoy, palabra por palabra: cambiar esto es un contrato, no un capricho. */
export const DEFAULT_PANTRY_CATEGORIES: readonly { key: string; name: string; color: string }[] = [
  { key: 'vegetables', name: 'Verduras', color: '#4CAF50' },
  { key: 'fruits', name: 'Frutas', color: '#E05A5A' },
  { key: 'meat', name: 'Carnes', color: '#A6343E' },
  { key: 'fish', name: 'Pescados', color: '#4FA3D1' },
  { key: 'dairy', name: 'Lácteos', color: '#E6C34A' },
  { key: 'grains', name: 'Cereales', color: '#B26A00' },
  { key: 'spices', name: 'Especias', color: '#8E5AC8' },
  { key: 'condiments', name: 'Condimentos', color: '#C99A2E' },
  { key: 'frozen', name: 'Congelados', color: '#6C8AE4' },
  { key: 'canned', name: 'Enlatados', color: '#2FA79B' },
  { key: 'beverages', name: 'Bebidas', color: '#5C6BC0' },
  { key: 'other', name: 'Otros', color: '#8A8F98' }
];

/** La reserva: nace con la casa, recibe lo que no encaja, y no se puede romper. */
export const PROTECTED_PANTRY_KEY = 'other';

/** Raiz = 1. Cuatro niveles es lo que se puede leer en una lista indentada en un movil. */
export const MAX_PANTRY_DEPTH = 4;

export const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export class PantryCategoryProtectedError extends Error {
  constructor(message = 'La categoria de reserva no se puede renombrar, mover ni borrar') {
    super(message);
    this.name = 'PantryCategoryProtectedError';
  }
}

export class PantryCategoryInUseError extends Error {
  readonly impact: CategoryImpact;
  constructor(impact: CategoryImpact) {
    super('La categoria todavia tiene articulos o subcategorias');
    this.name = 'PantryCategoryInUseError';
    this.impact = impact;
  }
}

export type Scope = { userId: string; householdId: string | null };

/** El mismo ambito que la cesta: si la despensa es compartida, las categorias tambien. */
export function scopeClause(scope: Scope): { clause: string; params: unknown[] } {
  return scope.householdId
    ? { clause: '(user_id = ? OR household_id = ?)', params: [scope.userId, scope.householdId] }
    : { clause: 'user_id = ?', params: [scope.userId] };
}

export function normalizeCategoryName(value: unknown): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > 120) throw new RangeError('El nombre de la categoria tiene que medir entre 1 y 120 caracteres');
  return normalized;
}

export function normalizeCategoryColor(value: unknown): string {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!COLOR_PATTERN.test(normalized)) throw new RangeError('El color de la categoria tiene que ser #RRGGBB');
  return normalized;
}

export function normalizeOptionalCategoryColor(value: unknown): string | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  return normalizeCategoryColor(value);
}

/**
 * Clave de la categoria: minusculas, sin acentos, espacios colapsados. A proposito NO es `productKeyOf`, que
 * ademas abrevia unidades: una seccion no es un producto, y normalizarla como tal haria que dos categorias
 * distintas chocaran por un motivo que nadie entiende (es el mismo criterio que `categoryKey` de la cesta).
 */
export function pantryCategoryKey(name: string): string {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.,;:!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Color determinista para una categoria nueva: el mismo abanico de siempre, elegido por clave. */
export function colorForNewCategory(seed: string): string {
  const PALETTE = ['#4CAF50', '#B26A00', '#E05A5A', '#4FA3D1', '#6C8AE4', '#C99A2E', '#8E5AC8', '#2FA79B'];
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.codePointAt(0)!) % 9973;
  return PALETTE[hash % PALETTE.length];
}

export type PantryCategory = {
  id: string;
  key: string;
  name: string;
  color: string;
  description: string | null;
  parentKey: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type CategoryCounts = { products: number; children: number; descendantProducts: number };

export type PantryCategoryRow = PantryCategory & {
  parentName: string | null;
  counts: CategoryCounts;
  protected: boolean;
  canDelete: boolean;
};

export type CategoryImpact = {
  products: number;
  children: number;
  descendantCategories: number;
  descendantProducts: number;
  protected: boolean;
  canDelete: boolean;
};

type RawRow = {
  id: string;
  key: string;
  name: string;
  color: string;
  description: string | null;
  parent_key: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

function map(row: RawRow): PantryCategory {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    color: row.color,
    description: row.description,
    parentKey: row.parent_key,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function selectAll(db: Db, scope: Scope): PantryCategory[] {
  const { clause, params } = scopeClause(scope);
  return (
    db
      // La tabla puede estar medio vacia en una casa antigua: LEFT JOIN no, filtro en memoria —
      // el arbol se recorre entero para contar, y son decenas de filas, no miles.
      .prepare(
        `SELECT id, key, name, color, description, parent_key, position, created_at, updated_at
         FROM pantry_categories
         WHERE ${clause}
         ORDER BY position ASC, name ASC`
      )
      .all(...params) as RawRow[]
  ).map(map);
}

export function findCategoryByKey(db: Db, scope: Scope, key: string): PantryCategory | undefined {
  return selectAll(db, scope).find((row) => row.key === key);
}

export function findCategoryById(db: Db, scope: Scope, id: string): PantryCategory | undefined {
  return selectAll(db, scope).find((row) => row.id === id);
}

/** Descendientes de una clave, en anchura, cortando por visited: un ciclo no puede colgarse aqui. */
function descendantsOf(categories: PantryCategory[], key: string): PantryCategory[] {
  const porPadre = new Map<string, PantryCategory[]>();
  for (const category of categories) {
    if (!category.parentKey) continue;
    const hermanos = porPadre.get(category.parentKey) ?? [];
    hermanos.push(category);
    porPadre.set(category.parentKey, hermanos);
  }
  const salida: PantryCategory[] = [];
  const pendientes = [...(porPadre.get(key) ?? [])];
  const vistos = new Set([key]);
  while (pendientes.length > 0) {
    const actual = pendientes.shift()!;
    if (vistos.has(actual.key)) continue;
    vistos.add(actual.key);
    salida.push(actual);
    pendientes.push(...(porPadre.get(actual.key) ?? []));
  }
  return salida;
}

/**
 * La profundidad del arbol entero, y de paso el ciclo: si subiendo desde una clave vuelves a una que ya
 * has pisado, la estructura no es un arbol. Se comprueba sobre el arbol **que resultaria** del cambio, no
 * sobre el guardado, que es la unica forma de pillar el ciclo antes de escribirlo.
 */
function profundidadMaxima(categorias: PantryCategory[]): number {
  let max = 0;
  for (const categoria of categorias) {
    let profundidad = 1;
    let actual: PantryCategory | undefined = categoria;
    const vistos = new Set([categoria.key]);
    while (actual?.parentKey) {
      if (vistos.has(actual.parentKey)) {
        throw new RangeError('Esa colocacion cerraria un ciclo en el arbol de categorias');
      }
      vistos.add(actual.parentKey);
      const siguiente = categorias.find((row) => row.key === actual?.parentKey);
      if (!siguiente) break;
      profundidad++;
      actual = siguiente;
    }
    max = Math.max(max, profundidad);
  }
  return max;
}

/**
 * Donde se coloca una categoria: el padre tiene que existir en la casa (lo comprueba la ruta, con 404), nadie
 * puede ser su propio padre, y el arbol que resulta no puede pasar de `MAX_PANTRY_DEPTH`. Lo ultimo no es
 * puntilleria: los recuentos de descendientes se pintan en cada fila, y una cadena de veinte niveles es una
 * lista que ya no se puede leer en una pantalla de movil.
 */
function assertPlacement(categorias: PantryCategory[], clave: string, parentKey: string | null): void {
  if (parentKey && parentKey === clave) throw new RangeError('Una categoria no puede ser su propia padre');
  const prospective = [...categorias.filter((row) => row.key !== clave), { key: clave, parentKey } as PantryCategory];
  if (profundidadMaxima(prospective) > MAX_PANTRY_DEPTH) {
    throw new RangeError(`El arbol de categorias no puede pasar de ${MAX_PANTRY_DEPTH} niveles de profundidad`);
  }
}

/**
 * El arbol, aplanado y con los recuentos. `view` es lo que la pantalla filtra (sin productos / con subcategorias)
 * y `q` busca por nombre o por clave, que es lo que alguien teclea cuando recuerda la palabra pero no el grupo.
 */
export function listCategories(
  db: Db,
  scope: Scope,
  options: { view?: 'all' | 'without-products' | 'with-children'; q?: string } = {}
): PantryCategoryRow[] {
  const todas = selectAll(db, scope);
  const { clause, params } = scopeClause(scope);
  const porClave = new Map<string, number>();
  for (const fila of db
    .prepare(`SELECT category AS key, COUNT(*) AS count FROM ingredients WHERE ${clause} GROUP BY category`)
    .all(...params) as { key: string; count: number }[]) {
    porClave.set(fila.key, fila.count);
  }

  const búsqueda = options.q ? pantryCategoryKey(options.q) : '';
  const filas = todas.map((category) => {
    // `children` son las DIRECTAS, que son las que impiden borrar; `descendantProducts` baja hasta el ultimo
    // nivel, que es lo que hace falta para decir cuantos articones se quedan colgando de una rama entera.
    const directos = todas.filter((otra) => otra.parentKey === category.key).length;
    const nietos = descendantsOf(todas, category.key);
    const products = porClave.get(category.key) ?? 0;
    const descendantProducts = nietos.reduce((total, hijo) => total + (porClave.get(hijo.key) ?? 0), products);
    const counts: CategoryCounts = { products, children: directos, descendantProducts };
    const protegida = category.key === PROTECTED_PANTRY_KEY;
    return {
      ...category,
      parentName: category.parentKey ? todas.find((otra) => otra.key === category.parentKey)?.name ?? null : null,
      counts,
      protected: protegida,
      canDelete: !protegida && products === 0 && directos === 0
    };
  });

  const filtradas = búsqueda
    ? filas.filter((fila) => pantryCategoryKey(fila.name).includes(búsqueda) || fila.key.includes(búsqueda))
    : filas;
  if (options.view === 'without-products') return filtradas.filter((fila) => fila.counts.products === 0);
  if (options.view === 'with-children') return filtradas.filter((fila) => fila.counts.children > 0);
  return filtradas;
}

export function ensureDefaultCategories(db: Db, userId: string, householdId: string | null): void {
  const { clause, params } = scopeClause({ userId, householdId });
  const { count } = db.prepare(`SELECT COUNT(*) AS count FROM pantry_categories WHERE ${clause}`).get(...params) as {
    count: number;
  };
  if (count > 0) return;
  const insert = db.prepare(
    `INSERT INTO pantry_categories (id, user_id, household_id, key, name, color, description, parent_key, position)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)`
  );
  DEFAULT_PANTRY_CATEGORIES.forEach((seed, index) => {
    insert.run(`pcat-${userId}-${index}`, userId, householdId, seed.key, seed.name, seed.color, index);
  });
}


export function createCategory(
  db: Db,
  input: {
    userId: string;
    householdId: string | null;
    name: string;
    key?: string;
    color?: string | null;
    description?: string | null;
    parentKey?: string | null;
    idFactory: () => string;
  }
): PantryCategory {
  const scope: Scope = { userId: input.userId, householdId: input.householdId };
  const name = normalizeCategoryName(input.name);
  const key = pantryCategoryKey(input.key ?? name);
  if (!key) throw new RangeError('La categoria necesita un nombre del que derivar la clave');
  const color = normalizeOptionalCategoryColor(input.color) ?? colorForNewCategory(key);
  const description = input.description ? String(input.description).trim().slice(0, 280) : null;
  const parentKey = input.parentKey ? String(input.parentKey).trim() : null;

  assertPlacement(selectAll(db, scope), key, parentKey);

  const { max } = db
    .prepare(`SELECT COALESCE(MAX(position), -1) AS max FROM pantry_categories WHERE ${scopeClause(scope).clause}`)
    .get(...scopeClause(scope).params) as { max: number };
  const id = input.idFactory();
  db.prepare(
    `INSERT INTO pantry_categories (id, user_id, household_id, key, name, color, description, parent_key, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.userId, input.householdId, key, name, color, description, parentKey, max + 1);

  return findCategoryById(db, scope, id)!;
}

export function updateCategory(
  db: Db,
  input: {
    userId: string;
    householdId: string | null;
    id: string;
    patch: { name?: string; color?: string | null; description?: string | null; parentKey?: string | null };
  }
): PantryCategory {
  const scope: Scope = { userId: input.userId, householdId: input.householdId };
  const actual = findCategoryById(db, scope, input.id);
  if (!actual) throw new RangeError('La categoria no existe en esta casa');

  const cambiaEstructura = input.patch.name !== undefined || 'parentKey' in input.patch;
  if (actual.key === PROTECTED_PANTRY_KEY && cambiaEstructura) throw new PantryCategoryProtectedError();

  const nombre = input.patch.name === undefined ? actual.name : normalizeCategoryName(input.patch.name);
  const color =
    input.patch.color === undefined ? actual.color : normalizeOptionalCategoryColor(input.patch.color) ?? actual.color;
  const descripcion =
    input.patch.description === undefined
      ? actual.description
      : input.patch.description == null
        ? null
        : String(input.patch.description).trim().slice(0, 280) || null;
  const parentKey =
    'parentKey' in input.patch
      ? input.patch.parentKey == null || String(input.patch.parentKey).trim() === ''
        ? null
        : String(input.patch.parentKey).trim()
      : actual.parentKey;

  // El arbol que resulta, no el guardado: es la unica forma de ver el ciclo antes de escribirlo.
  const categorias = selectAll(db, scope).map((row) => (row.id === actual.id ? { ...row, parentKey } : row));
  assertPlacement(categorias, actual.key, parentKey);

  db.prepare(
    `UPDATE pantry_categories
     SET name = ?, color = ?, description = ?, parent_key = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(nombre, color, descripcion, parentKey, actual.id);

  return findCategoryById(db, scope, actual.id)!;
}

export function deleteImpact(db: Db, scope: Scope, id: string): CategoryImpact {
  const categoria = findCategoryById(db, scope, id);
  if (!categoria) throw new RangeError('La categoria no existe en esta casa');
  const filas = listCategories(db, scope);
  const propia = filas.find((fila) => fila.id === id)!;
  const nietos = descendantsOf(selectAll(db, scope), categoria.key);
  return {
    products: propia.counts.products,
    children: propia.counts.children,
    descendantCategories: nietos.length,
    descendantProducts: propia.counts.descendantProducts,
    protected: propia.protected,
    canDelete: propia.canDelete
  };
}

export function removeCategory(db: Db, scope: Scope, id: string): void {
  const impacto = deleteImpact(db, scope, id);
  if (impacto.protected) throw new PantryCategoryProtectedError();
  if (!impacto.canDelete) throw new PantryCategoryInUseError(impacto);
  db.prepare('DELETE FROM pantry_categories WHERE id = ?').run(id);
}
