import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { config } from './app.config.js';
import * as schema from '../models/schema.js';
import { existsSync, mkdirSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { backfillHouseholdSeeds, backfillUserSeeds } from '../utils/seed-data.js';

let db: Database.Database;
let drizzleDb: ReturnType<typeof drizzle>;

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export function getDrizzle() {
  if (!drizzleDb) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return drizzleDb;
}

/**
 * Los nombres bajo los que esta BD existio en instalaciones desplegadas. Se
 * prueban en este orden: el primero es el que dejo la ultima version publicada.
 */
export const LEGACY_DB_FILENAMES = ['recipeapp.db', 'mi-cocinai.db'];

/**
 * HogarIA nace del renombre de la app y la BD se llama ahora `hogaria.sqlite`.
 * Aqui no se documenta «borra tus datos y vuelve a empezar»: se renombra el
 * fichero antes de abrirlo, asi que una Raspberry con dos anos de hogares
 * actualiza y sigue funcionando.
 *
 * Reglas duras: nunca se pisa un fichero que ya existe (si alguien creo la BD
 * nueva, se deja la nueva y no se toca nada) y se mueven juntos `-wal`/`-shm`,
 * porque un WAL huerfano corromperia el arranque. Devuelve la ruta de la que se
 * vino, o null si no habia nada que adoptar.
 */
export function adoptLegacyDatabase(target: string): string | null {
  // Una BD en RAM o una URI de better-sqlite3 no tienen directorio del que heredar.
  if (target === ':memory:' || target.startsWith('file:')) return null;
  if (existsSync(target)) return null;

  const dir = dirname(target);
  for (const legacy of LEGACY_DB_FILENAMES) {
    const source = join(dir, legacy);
    if (source === target || !existsSync(source)) continue;

    renameSync(source, target);
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(source + suffix)) renameSync(source + suffix, target + suffix);
    }
    return source;
  }
  return null;
}

export async function initializeDatabase(): Promise<void> {
  // Ensure data directory exists
  const dbDir = dirname(config.database.path);
  mkdirSync(dbDir, { recursive: true });

  const adoptedFrom = adoptLegacyDatabase(config.database.path);
  if (adoptedFrom) {
    console.log(`[DB] Base de datos heredada adoptada: ${adoptedFrom} -> ${config.database.path}`);
  }

  // Create SQLite database
  db = new Database(config.database.path, {
    verbose: config.server.env === 'development' ? console.log : undefined
  });

  // Configure SQLite for low memory usage
  db.pragma('journal_mode = WAL');
  db.pragma(`cache_size = ${config.database.cacheSize}`);
  db.pragma('temp_store = MEMORY');
  db.pragma('synchronous = NORMAL');
  db.pragma('mmap_size = 67108864'); // 64MB
  db.pragma('page_size = 4096');
  db.pragma('foreign_keys = ON');

  // Initialize Drizzle ORM
  drizzleDb = drizzle(db, { schema });

  // Run migrations
  await runMigrations(db);

  console.log('Database configured with WAL mode and low memory settings');
}

async function runMigrations(db: Database.Database): Promise<void> {
  // Create tables
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      avatar TEXT,
      household_id TEXT,
      cooking_level TEXT DEFAULT 'beginner',
      preferences TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (household_id) REFERENCES households(id)
    );

    -- Households table
    CREATE TABLE IF NOT EXISTS households (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      shared_pantry INTEGER DEFAULT 1,
      share_recipes INTEGER DEFAULT 1,
      share_calendar INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Household members table
    CREATE TABLE IF NOT EXISTS household_members (
      id TEXT PRIMARY KEY,
      household_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'member',
      permissions TEXT DEFAULT '{}',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (household_id) REFERENCES households(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(household_id, user_id)
    );

    -- Ingredients (pantry) table
    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      household_id TEXT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      expiration_date DATETIME,
      location TEXT DEFAULT 'pantry',
      image TEXT,
      barcode TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (household_id) REFERENCES households(id)
    );

    -- Utensils table
    CREATE TABLE IF NOT EXISTS utensils (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      household_id TEXT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      available INTEGER DEFAULT 1,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (household_id) REFERENCES households(id)
    );

    -- Recipes table
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      difficulty TEXT DEFAULT 'medium',
      cuisine TEXT,
      meal_type TEXT DEFAULT '[]',
      total_time INTEGER,
      prep_time INTEGER,
      cook_time INTEGER,
      rest_time INTEGER,
      servings INTEGER DEFAULT 4,
      calories REAL,
      image TEXT,
      ingredients TEXT DEFAULT '[]',
      utensils TEXT DEFAULT '[]',
      steps TEXT DEFAULT '[]',
      nutrition TEXT,
      storage TEXT,
      author TEXT DEFAULT 'user',
      author_id TEXT,
      rating REAL,
      times_cooked INTEGER DEFAULT 0,
      tags TEXT DEFAULT '[]',
      is_favorite INTEGER DEFAULT 0,
      is_public INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES users(id)
    );

    -- User recipes (favorites, history)
    CREATE TABLE IF NOT EXISTS user_recipes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      recipe_id TEXT NOT NULL,
      is_favorite INTEGER DEFAULT 0,
      times_cooked INTEGER DEFAULT 0,
      last_cooked_at DATETIME,
      rating INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (recipe_id) REFERENCES recipes(id),
      UNIQUE(user_id, recipe_id)
    );

    -- Weekly calendar table
    CREATE TABLE IF NOT EXISTS weekly_calendars (
      id TEXT PRIMARY KEY,
      /* El calendario es de la persona; el hogar se apunta cuando lo hay. No
         puede ser NOT NULL con FK a households: quien se registra sin crear un
         hogar no podría tener ni una sola comida guardada. */
      household_id TEXT,
      user_id TEXT NOT NULL,
      week_start DATE NOT NULL,
      week_end DATE NOT NULL,
      goals TEXT DEFAULT '{}',
      generated_by TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (household_id) REFERENCES households(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Meals table
    CREATE TABLE IF NOT EXISTS meals (
      id TEXT PRIMARY KEY,
      calendar_id TEXT NOT NULL,
      date DATE NOT NULL,
      meal_type TEXT NOT NULL,
      recipe_id TEXT,
      custom_meal TEXT,
      time TEXT,
      servings INTEGER DEFAULT 1,
      notes TEXT,
      completed INTEGER DEFAULT 0,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (calendar_id) REFERENCES weekly_calendars(id),
      FOREIGN KEY (recipe_id) REFERENCES recipes(id)
    );

    -- AI configurations table
    CREATE TABLE IF NOT EXISTS ai_configs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      provider TEXT DEFAULT 'custom',
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      model TEXT NOT NULL,
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 2000,
      top_p REAL,
      frequency_penalty REAL,
      presence_penalty REAL,
      timeout INTEGER DEFAULT 30000,
      retry_attempts INTEGER DEFAULT 3,
      is_active INTEGER DEFAULT 1,
      last_tested DATETIME,
      test_status TEXT,
      test_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Create indexes for better performance
    CREATE INDEX IF NOT EXISTS idx_ingredients_user_id ON ingredients(user_id);
    CREATE INDEX IF NOT EXISTS idx_ingredients_household_id ON ingredients(household_id);
    CREATE INDEX IF NOT EXISTS idx_ingredients_expiration ON ingredients(expiration_date);
    CREATE INDEX IF NOT EXISTS idx_recipes_author_id ON recipes(author_id);
    CREATE INDEX IF NOT EXISTS idx_recipes_difficulty ON recipes(difficulty);
    CREATE INDEX IF NOT EXISTS idx_meals_calendar_id ON meals(calendar_id);
    CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);
    CREATE INDEX IF NOT EXISTS idx_user_recipes_user_id ON user_recipes(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_configs_user_id ON ai_configs(user_id);

    -- ═══ Lista de la compra y precios (esqueleto de P2/P3, spec §9) ═══
    -- Dinero en centimos enteros con CHECK >= 0 y cantidades reales > 0: las dos
    -- restricciones que evitan las cestas imposibles. product_key es el nombre
    -- normalizado (ver utils/product-key.ts): cuando llegue el catalogo canónico
    -- se migra a product_aliases sin tocar ninguna observacion.
    -- (Ojo: dentro de este template literal no se pueden usar backticks.)
    CREATE TABLE IF NOT EXISTS shopping_lists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      household_id TEXT,
      name TEXT NOT NULL,
      store TEXT,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived', 'done')),
      version INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS shopping_list_items (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL,
      name TEXT NOT NULL,
      product_key TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1 CHECK (quantity > 0),
      unit TEXT,
      category TEXT,
      -- precio POR UNIDAD en centimos; null = todavia sin dato
      price_minor INTEGER CHECK (price_minor IS NULL OR price_minor >= 0),
      note TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      checked INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0, 1)),
      -- borrado logico: el «Deshacer» del movil necesita que la fila siga ahi
      deleted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (list_id) REFERENCES shopping_lists(id) ON DELETE CASCADE
    );

    -- Lo pagado por quantity unidades (un ticket dice eso, no el precio unitario)
    CREATE TABLE IF NOT EXISTS price_observations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      household_id TEXT,
      product_key TEXT NOT NULL,
      product_name TEXT NOT NULL,
      store_name TEXT,
      price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
      quantity REAL NOT NULL DEFAULT 1 CHECK (quantity > 0),
      currency TEXT NOT NULL DEFAULT 'EUR',
      source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'receipt', 'estimate')),
      observed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_shopping_lists_user ON shopping_lists(user_id);
    CREATE INDEX IF NOT EXISTS idx_shopping_lists_household ON shopping_lists(household_id);
    CREATE INDEX IF NOT EXISTS idx_shopping_lists_status ON shopping_lists(status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_list_items_list ON shopping_list_items(list_id, position);
    CREATE INDEX IF NOT EXISTS idx_list_items_key ON shopping_list_items(product_key);
    CREATE INDEX IF NOT EXISTS idx_price_obs_key ON price_observations(product_key, observed_at);
    CREATE INDEX IF NOT EXISTS idx_price_obs_user ON price_observations(user_id);
    CREATE INDEX IF NOT EXISTS idx_price_obs_household ON price_observations(household_id);
  `);

  // Auto-migrations: add columns that may be missing in older databases
  const addColumnIfMissing = (table: string, column: string, definition: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some(c => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`[DB] Added ${table}.${column}`);
    }
  };
  addColumnIfMissing('households', 'share_recipes', 'INTEGER DEFAULT 1');
  addColumnIfMissing('households', 'share_calendar', 'INTEGER DEFAULT 1');
  addColumnIfMissing('household_members', 'permissions', 'TEXT DEFAULT \'{}\'');

  // weekly_calendars.household_id nacio NOT NULL con FK a households, y las rutas
  // metían '' para las cuentas sin hogar: la FK lo rechaza (foreign_keys = ON),
  // así que la primera comida de la semana devolvía 500. Se reconstruye la tabla
  // para admitir NULL, que es lo que significa «calendario personal».
  const householdColumn = (
    db.prepare('PRAGMA table_info(weekly_calendars)').all() as { name: string; notnull: number }[]
  ).find((column) => column.name === 'household_id');
  if (householdColumn?.notnull) {
    // PRAGMA foreign_keys no se puede tocar dentro de una transaccion.
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(`
          CREATE TABLE weekly_calendars_personal (
            id TEXT PRIMARY KEY,
            household_id TEXT,
            user_id TEXT NOT NULL,
            week_start DATE NOT NULL,
            week_end DATE NOT NULL,
            goals TEXT DEFAULT '{}',
            generated_by TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (household_id) REFERENCES households(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
          );

          INSERT INTO weekly_calendars_personal
            SELECT id, NULLIF(household_id, ''), user_id, week_start, week_end, goals,
                   generated_by, created_at, updated_at
            FROM weekly_calendars;

          DROP TABLE weekly_calendars;
          ALTER TABLE weekly_calendars_personal RENAME TO weekly_calendars;
        `);
      })();
      console.log('[DB] weekly_calendars.household_id admite NULL (calendarios personales)');
    } catch (error) {
      console.error('[DB] No se pudo relajar weekly_calendars.household_id:', error);
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  // Backfill: los hogares creados antes del catalogo no tienen ni
  // ingredientes sugeridos ni utensilios que marcar.
  backfillHouseholdSeeds(db);

  // ... y las cuentas SIN hogar tampoco: para ellas el catalogo es personal
  // (household_id NULL), que es lo que se siembra al registrarse.
  backfillUserSeeds(db);

  console.log('Database tables and indexes created');
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    console.log('Database connection closed');
  }
}
