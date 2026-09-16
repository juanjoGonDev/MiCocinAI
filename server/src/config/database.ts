import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { config } from './app.config.js';
import * as schema from '../models/schema.js';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
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

export async function initializeDatabase(): Promise<void> {
  // Ensure data directory exists
  const dbDir = dirname(config.database.path);
  mkdirSync(dbDir, { recursive: true });

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
      household_id TEXT NOT NULL,
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
