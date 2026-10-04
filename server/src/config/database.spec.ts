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
    handle.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('sigue aqui')");
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
  it('anade purchase_date a recibos antiguos sin inventar una fecha de compra', async () => {
    const databaseFile = target();
    const previous = new Database(databaseFile);
    previous.exec(`
      CREATE TABLE receipts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        store TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO receipts (id, user_id, store, created_at)
      VALUES ('old-receipt', 'synthetic-user', 'Tienda antigua', '2024-02-29 12:30:00');
    `);
    previous.close();

    const mod = await dbModuleWith(databaseFile);
    try {
      await mod.initializeDatabase();

      const receipt = mod
        .getDatabase()
        .prepare(
          'SELECT id, store, created_at, purchase_date, store_manual, purchase_date_manual FROM receipts WHERE id = ?'
        )
        .get('old-receipt');
      expect(receipt).toEqual({
        id: 'old-receipt',
        store: 'Tienda antigua',
        created_at: '2024-02-29 12:30:00',
        purchase_date: null,
        store_manual: 0,
        purchase_date_manual: 0
      });
    } finally {
      mod.closeDatabase();
    }
  });

  it('renombra antes de abrir y migra la adoptada, sin perder filas', async () => {
    const legacy = join(dir, 'recipeapp.db');
    const handle = new Database(legacy);
    handle.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('de la version anterior')");
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

  it('elige al admin elegible más antiguo en hogares legacy de forma estable e idempotente', async () => {
    const databaseFile = target();
    const previous = new Database(databaseFile);
    previous.exec(`
      CREATE TABLE households (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        invite_code TEXT UNIQUE NOT NULL,
        shared_pantry INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        avatar TEXT,
        household_id TEXT,
        cooking_level TEXT DEFAULT 'beginner',
        preferences TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE household_members (
        id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(household_id, user_id)
      );
      CREATE TABLE ai_configs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        provider TEXT,
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        model TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE ai_jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'receipt',
        status TEXT NOT NULL DEFAULT 'queued',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO households (id, name, invite_code) VALUES
        ('legacy-house', 'Hogar antiguo', 'LEGACY01'),
        ('empty-admin-house', 'Sin administrador', 'NOADMIN1');
      INSERT INTO users (id, email, name, password_hash, household_id) VALUES
        ('member-first', 'member-first@test.invalid', 'Member', '', 'legacy-house'),
        ('admin-z', 'admin-z@test.invalid', 'Admin Z', '', 'legacy-house'),
        ('admin-a', 'admin-a@test.invalid', 'Admin A', '', 'legacy-house'),
        ('admin-newer', 'admin-newer@test.invalid', 'Admin newer', '', 'legacy-house'),
        ('only-member', 'only-member@test.invalid', 'Only member', '', 'empty-admin-house');
      INSERT INTO household_members (id, household_id, user_id, role, joined_at) VALUES
        ('member-row', 'legacy-house', 'member-first', 'member', '2019-01-01 00:00:00'),
        ('admin-z-row', 'legacy-house', 'admin-z', 'admin', '2020-01-01 00:00:00'),
        ('admin-a-row', 'legacy-house', 'admin-a', 'admin', '2020-01-01 00:00:00'),
        ('admin-newer-row', 'legacy-house', 'admin-newer', 'admin', '2021-01-01 00:00:00'),
        ('only-member-row', 'empty-admin-house', 'only-member', 'member', '2018-01-01 00:00:00');
      INSERT INTO ai_configs (id, user_id, name, provider, base_url, api_key, model, is_active)
        VALUES ('historic-config', 'admin-a', 'Existing config', 'custom', 'http://127.0.0.1', '', 'test-model', 1);
      INSERT INTO ai_jobs (id, user_id, kind, status, created_at)
        VALUES ('historic-job', 'member-first', 'custom', 'done', '2020-02-03 04:05:06');
    `);
    previous.close();

    const mod = await dbModuleWith(databaseFile);
    let restarted: DbModule | undefined;
    try {
      await mod.initializeDatabase();
      const db = mod.getDatabase();
      expect(
        db.prepare('SELECT ai_owner_user_id FROM households WHERE id = ?').get('legacy-house')
      ).toEqual({ ai_owner_user_id: 'admin-a' });
      expect(
        db.prepare('SELECT ai_owner_user_id FROM households WHERE id = ?').get('empty-admin-house')
      ).toEqual({ ai_owner_user_id: null });

      const configsBeforeRestart = db
        .prepare('SELECT id, user_id, name, api_key, model, is_active FROM ai_configs ORDER BY id')
        .all();
      const jobsBeforeRestart = db
        .prepare('SELECT id, user_id, kind, status, created_at FROM ai_jobs ORDER BY id')
        .all();
      expect(configsBeforeRestart).toEqual([
        {
          id: 'historic-config',
          user_id: 'admin-a',
          name: 'Existing config',
          api_key: '',
          model: 'test-model',
          is_active: 1
        }
      ]);
      expect(jobsBeforeRestart).toEqual([
        {
          id: 'historic-job',
          user_id: 'member-first',
          kind: 'custom',
          status: 'done',
          created_at: '2020-02-03 04:05:06'
        }
      ]);

      mod.closeDatabase();
      restarted = await dbModuleWith(databaseFile);
      await restarted.initializeDatabase();
      const restartedDb = restarted.getDatabase();
      expect(
        restartedDb.prepare('SELECT id, ai_owner_user_id FROM households ORDER BY id').all()
      ).toEqual([
        { id: 'empty-admin-house', ai_owner_user_id: null },
        { id: 'legacy-house', ai_owner_user_id: 'admin-a' }
      ]);
      expect(
        restartedDb
          .prepare(
            'SELECT id, user_id, name, api_key, model, is_active FROM ai_configs ORDER BY id'
          )
          .all()
      ).toEqual(configsBeforeRestart);
      expect(
        restartedDb
          .prepare('SELECT id, user_id, kind, status, created_at FROM ai_jobs ORDER BY id')
          .all()
      ).toEqual(jobsBeforeRestart);
    } finally {
      restarted?.closeDatabase();
      mod.closeDatabase();
    }
  });
});
