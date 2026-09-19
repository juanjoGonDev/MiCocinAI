import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';

/**
 * La BD cambio de nombre con la marca (recipeapp.db -> hogaria.sqlite) y la
 * adopcion del fichero heredado es lo unico que separa un despliegue que
 * sobrevive al de uno que empieza de cero. Son pruebas de sistema de ficheros
 * sobre un tmpdir, no de negocio: lo que se exige es que nunca se pierda ni se
 * pise un byte.
 */

type DbModule = typeof import('./database.js');

let dir: string;
let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hogaria-db-'));
  saved = { ...process.env };
});

afterEach(() => {
  vi.resetModules();
  process.env = { ...saved };
  rmSync(dir, { recursive: true, force: true });
});

/** El modulo de config lee DATABASE_PATH al importarse: hay que aislarlo. */
async function dbModuleWith(databasePath: string): Promise<DbModule> {
  vi.resetModules();
  process.env.DATABASE_PATH = databasePath;
  process.env.NODE_ENV = 'test';
  return import('./database.js');
}

const target = () => join(dir, 'hogaria.sqlite');

describe('adoptLegacyDatabase', () => {
  it('no hace nada donde no hay nada que adoptar', async () => {
    const { adoptLegacyDatabase } = await dbModuleWith(':memory:');

    expect(adoptLegacyDatabase(target())).toBeNull();
    expect(existsSync(target())).toBe(false);
  });

  it('adopta la recipeapp.db y se lleva el WAL y el SHM consigo', async () => {
    const legacy = join(dir, 'recipeapp.db');
    const handle = new Database(legacy);
    handle.pragma('journal_mode = WAL');
    handle.exec('CREATE TABLE t (v TEXT); INSERT INTO t VALUES (\'sigue aqui\')');
    handle.close();
    writeFileSync(`${legacy}-wal`, 'wal-sucio');
    writeFileSync(`${legacy}-shm`, 'shm-sucio');

    const { adoptLegacyDatabase } = await dbModuleWith(':memory:');

    expect(adoptLegacyDatabase(target())).toBe(legacy);
    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(`${legacy}-wal`)).toBe(false);
    expect(existsSync(`${legacy}-shm`)).toBe(false);
    expect(readFileSync(`${target()}-wal`, 'utf8')).toBe('wal-sucio');
    expect(readFileSync(`${target()}-shm`, 'utf8')).toBe('shm-sucio');

    const opened = new Database(target());
    expect(opened.prepare('SELECT v FROM t').get()).toEqual({ v: 'sigue aqui' });
    opened.close();
  });

  it('prefiere la recipeapp.db cuando las dos heredadas estan ahi', async () => {
    writeFileSync(join(dir, 'recipeapp.db'), 'esta-gano');
    writeFileSync(join(dir, 'mi-cocinai.db'), 'esta-perdio');

    const { adoptLegacyDatabase } = await dbModuleWith(':memory:');

    expect(adoptLegacyDatabase(target())).toBe(join(dir, 'recipeapp.db'));
    expect(readFileSync(target(), 'utf8')).toBe('esta-gano');
    // La otra no se toca: no es nuestra, y borrar datos ajenos no es parte de un renombre.
    expect(readFileSync(join(dir, 'mi-cocinai.db'), 'utf8')).toBe('esta-perdio');
  });

  it('nunca pisa una base de datos que ya existe', async () => {
    writeFileSync(target(), 'nueva');
    writeFileSync(join(dir, 'recipeapp.db'), 'vieja');

    const { adoptLegacyDatabase } = await dbModuleWith(':memory:');

    expect(adoptLegacyDatabase(target())).toBeNull();
    expect(readFileSync(target(), 'utf8')).toBe('nueva');
    expect(readFileSync(join(dir, 'recipeapp.db'), 'utf8')).toBe('vieja');
  });

  it('una BD en memoria o una URI no tienen de que heredar', async () => {
    const { adoptLegacyDatabase } = await dbModuleWith(':memory:');

    writeFileSync(join(dir, 'recipeapp.db'), 'vieja');
    expect(adoptLegacyDatabase(':memory:')).toBeNull();
    expect(adoptLegacyDatabase('file:./data/hogaria.sqlite?mode=memory')).toBeNull();
    expect(readFileSync(join(dir, 'recipeapp.db'), 'utf8')).toBe('vieja');
  });
});

describe('initializeDatabase con fichero heredado', () => {
  it('renombra antes de abrir y migra la adoptada, sin perder filas', async () => {
    const legacy = join(dir, 'recipeapp.db');
    const handle = new Database(legacy);
    handle.exec('CREATE TABLE t (v TEXT); INSERT INTO t VALUES (\'de la version anterior\')');
    handle.close();

    const mod = await dbModuleWith(target());
    await mod.initializeDatabase();

    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(target())).toBe(true);

    const db = mod.getDatabase();
    expect(db.prepare('SELECT v FROM t').get()).toEqual({ v: 'de la version anterior' });
    // Las tablas de la app se crean encima de la heredada (CREATE TABLE IF NOT EXISTS).
    expect(db.prepare('SELECT COUNT(*) as c FROM users').get()).toEqual({ c: 0 });

    mod.closeDatabase();
  });

  it('deja de llamarse recipeapp y se cierra sin dejar el handle abierto', async () => {
    const mod = await dbModuleWith(target());
    await mod.initializeDatabase();

    expect(existsSync(target())).toBe(true);
    expect(existsSync(join(dir, 'recipeapp.db'))).toBe(false);

    mod.closeDatabase();
    expect(() => mod.getDatabase().prepare('SELECT 1').get()).toThrow();
  });
});
