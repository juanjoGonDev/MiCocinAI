import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * El catalogo de categorias del inventario (HOGARIA-SPEC ## 12x).
 *
 * Lo que se prueba aqui es la parte que no puede comprobar el compilador: que una categoria nueva no pueda
 * colocarse debajo de si misma (el conteo de descendientes recorre el arbol, y un ciclo es un `while` eterno),
 * que `other` sea la reserva y no se pueda borrar, y que el color que se guarda sea siempre `#RRGGBB` en
 * mayusculas —el mismo que pinta el punto de la fila, y un `red` en la base es un punto negro en la pantalla.
 */

process.env.DATABASE_PATH = ':memory:';
process.env.NODE_ENV = 'test';

type Sql = import('better-sqlite3').Database;

let db: Sql;
let mod: typeof import('./pantry-categories.js');

beforeAll(async () => {
  const database = await import('../config/database.js');
  await database.initializeDatabase();
  db = database.getDatabase();
  mod = await import('./pantry-categories.js');
});

beforeEach(() => {
  db.exec('DELETE FROM pantry_categories; DELETE FROM ingredients; DELETE FROM users;');
  db.prepare("INSERT INTO users (id, email, name, password_hash) VALUES ('u-a', 'a@t.local', 'Ana', 'hash')").run();
});

type Crear = Parameters<typeof mod.createCategory>[1];

const crear = (input: Partial<Crear> = {}) =>
  mod.createCategory(db, {
    userId: 'u-a',
    householdId: null,
    name: 'Bebidas vegetales',
    idFactory: () => `pc-${Math.random().toString(36).slice(2, 8)}`,
    ...input
  } as Crear);

describe('normalizar lo que entra del formulario', () => {
  it('el nombre no puede venir con espacios de sobra ni con nada de eso de 200 caracteres', () => {
    expect(mod.normalizeCategoryName('  Bebidas   vegetales ')).toBe('Bebidas vegetales');
    expect(() => mod.normalizeCategoryName('   ')).toThrow(RangeError);
    expect(() => mod.normalizeCategoryName('x'.repeat(121))).toThrow(RangeError);
  });

  it('el color se guarda en mayusculas, y lo que no es #RRGGBB no entra', () => {
    expect(mod.normalizeCategoryColor('#33aaff')).toBe('#33AAFF');
    expect(() => mod.normalizeCategoryColor('red')).toThrow(RangeError);
    expect(() => mod.normalizeCategoryColor('#fff')).toThrow(RangeError);
    expect(mod.normalizeOptionalCategoryColor('')).toBeUndefined();
    expect(mod.normalizeOptionalCategoryColor(null)).toBeUndefined();
  });

  it('la clave es el dato: minusculas, sin acentos, y tal cual la guarda `ingredients.category`', () => {
    expect(mod.pantryCategoryKey('Bebidas vegetales')).toBe('bebidas vegetales');
    // Las doce de fábrica son las que ya estan escritas en las filas, no un slug nuevo.
    expect(mod.DEFAULT_PANTRY_CATEGORIES.map((c) => c.key)).toEqual([
      'vegetables', 'fruits', 'meat', 'fish', 'dairy', 'grains',
      'spices', 'condiments', 'frozen', 'canned', 'beverages', 'other'
    ]);
    expect(mod.PROTECTED_PANTRY_KEY).toBe('other');
  });
});

describe('el arbol', () => {
  it('una categoria no puede ser su propio padre', () => {
    const padre = crear({ name: 'Bebidas', key: 'bebidas' });
    expect(() =>
      mod.updateCategory(db, { userId: 'u-a', householdId: null, id: padre.id, patch: { parentKey: padre.key } })
    ).toThrow(RangeError);
  });

  it('ni el nieto puede adoptar al abuelo para cerrar un ciclo', () => {
    const abuelo = crear({ name: 'Alimentacion', key: 'alimentacion' });
    const padre = crear({ name: 'Bebidas', key: 'bebidas', parentKey: abuelo.key });
    const hijo = crear({ name: 'Vegetales', key: 'vegetales', parentKey: padre.key });
    expect(() =>
      mod.updateCategory(db, { userId: 'u-a', householdId: null, id: abuelo.id, patch: { parentKey: hijo.key } })
    ).toThrow(RangeError);
  });

  it('y la profundidad tiene un techo que se dice con nombre', () => {
    let parentKey: string | undefined;
    for (let nivel = 0; nivel < mod.MAX_PANTRY_DEPTH; nivel++) {
      const creada = crear({ name: `Nivel ${nivel}`, key: `nivel-${nivel}`, parentKey });
      parentKey = creada.key;
    }
    expect(() => crear({ name: 'Demasiado abajo', key: 'demasiado', parentKey })).toThrow(/profundidad/i);
  });

  it('los recuentos suman a los descendientes, que es lo que hace falta para saber si se puede borrar', () => {
    const raiz = crear({ name: 'Alimentacion', key: 'alimentacion' });
    const hija = crear({ name: 'Bebidas', key: 'bebidas', parentKey: raiz.key });
    crear({ name: 'De avena', key: 'de avena', parentKey: hija.key });
    for (const [category, quantity] of [
      ['alimentacion', 3],
      ['bebidas', 1],
      ['de avena', 2]
    ] as const) {
      db.prepare(
        "INSERT INTO ingredients (id, user_id, name, category, quantity, unit) VALUES (?, 'u-a', ?, ?, 1, 'unit')"
      ).run(`ing-${category}`, category, category);
      void quantity;
    }
    const filas = mod.listCategories(db, { userId: 'u-a', householdId: null });
    const de = (key: string) => filas.find((f) => f.key === key)!;
    expect(de('alimentacion').counts).toEqual({ products: 1, children: 1, descendantProducts: 3 });
    expect(de('de avena').counts).toEqual({ products: 1, children: 0, descendantProducts: 1 });
    expect(de('alimentacion').canDelete).toBe(false);
    expect(de('de avena').canDelete).toBe(false);
  });
});

describe('sembrar y borrar', () => {
  it('la casa arranca con las doce, en orden, y dos veces seguidas no son veinticuatro', () => {
    mod.ensureDefaultCategories(db, 'u-a', null);
    mod.ensureDefaultCategories(db, 'u-a', null);
    const filas = db.prepare("SELECT key FROM pantry_categories WHERE user_id = 'u-a' ORDER BY position").all() as {
      key: string;
    }[];
    expect(filas).toHaveLength(12);
    expect(filas[0].key).toBe('vegetables');
    expect(filas[11].key).toBe('other');
  });

  it('el nombre sembrado es la etiqueta en castellano que ya pinta la pantalla, palabra por palabra', () => {
    mod.ensureDefaultCategories(db, 'u-a', null);
    const nombres = (db.prepare("SELECT name FROM pantry_categories WHERE user_id = 'u-a' ORDER BY position").all() as {
      name: string;
    }[]).map((f) => f.name);
    expect(nombres).toEqual([
      'Verduras', 'Frutas', 'Carnes', 'Pescados', 'Lácteos', 'Cereales',
      'Especias', 'Condimentos', 'Congelados', 'Enlatados', 'Bebidas', 'Otros'
    ]);
  });

  it('la reserva no se borra ni vacia; y con articulos encima tampoco', () => {
    mod.ensureDefaultCategories(db, 'u-a', null);
    const otras = mod.findCategoryByKey(db, { userId: 'u-a', householdId: null }, 'other')!;
    expect(mod.deleteImpact(db, { userId: 'u-a', householdId: null }, otras.id)).toMatchObject({
      protected: true,
      canDelete: false
    });

    const nueva = crear({ name: 'Frutos secos', key: 'frutos secos' });
    db.prepare("INSERT INTO ingredients (id, user_id, name, category, quantity, unit) VALUES ('i-1', 'u-a', 'Almendras', 'frutos secos', 1, 'unit')").run();
    expect(mod.deleteImpact(db, { userId: 'u-a', householdId: null }, nueva.id).canDelete).toBe(false);

    db.prepare("DELETE FROM ingredients WHERE id = 'i-1'").run();
    expect(mod.deleteImpact(db, { userId: 'u-a', householdId: null }, nueva.id)).toMatchObject({
      products: 0,
      canDelete: true
    });
    mod.removeCategory(db, { userId: 'u-a', householdId: null }, nueva.id);
    expect(mod.findCategoryByKey(db, { userId: 'u-a', householdId: null }, 'frutos secos')).toBeUndefined();

    expect(() => mod.removeCategory(db, { userId: 'u-a', householdId: null }, otras.id)).toThrow(/protected|reserva/i);
  });

  it('sin color en el formulario sale uno del abanico, siempre el mismo para la misma clave', () => {
    expect(mod.colorForNewCategory('frutos secos')).toBe(mod.colorForNewCategory('frutos secos'));
    expect(mod.colorForNewCategory('otra')).not.toBe(mod.colorForNewCategory('frutos secos'));
    const creada = crear({ name: 'Sin color', color: null });
    expect(creada.color).toMatch(/^#[0-9A-F]{6}$/);
    expect(crear({ name: 'Con color', color: '#112233' }).color).toBe('#112233');
    expect(crear({ name: 'Con margen', color: '  #112234  ' }).color).toBe('#112234');
  });
});
