import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Perfil de gustos/alergias/objetivo: se guarda dentro del JSON
 * `users.preferences` sin pisar el resto de preferencias, y alimenta los
 * prompts de la IA.
 */

// DATABASE_PATH se lee al importar la config, asi que el resto de modulos se
// importan de forma dinamica (con el path ya fijado) para usar una BD en RAM.
process.env.DATABASE_PATH = ':memory:';
process.env.NODE_ENV = 'test';

type SqliteDb = import('better-sqlite3').Database;
type Taste = typeof import('./taste-profile.js');

let db: SqliteDb;
let taste: Taste;
let closeDatabase: () => void;
let userSeq = 0;

function createUser(preferences?: string): string {
  const id = `taste-u-${userSeq++}`;
  db.prepare(
    'INSERT INTO users (id, email, name, password_hash, preferences) VALUES (?, ?, ?, ?, ?)'
  ).run(id, `${id}@test`, 'Tester', 'hash', preferences ?? '{}');
  return id;
}

function readPreferencesColumn(userId: string): Record<string, any> {
  const row = db.prepare('SELECT preferences FROM users WHERE id = ?').get(userId) as {
    preferences: string;
  };
  return JSON.parse(row.preferences);
}

beforeAll(async () => {
  const database = await import('../config/database.js');
  await database.initializeDatabase();
  db = database.getDatabase();
  closeDatabase = database.closeDatabase;
  taste = await import('./taste-profile.js');
});

afterAll(() => closeDatabase?.());

describe('saveTasteProfile', () => {
  it('devuelve el perfil por defecto a quien no ha contestado nada', () => {
    const user = createUser();

    const response = taste.readTasteResponse(db, user);

    expect(response.taste).toEqual({
      goal: 'balanced',
      goalNotes: '',
      allergies: [],
      likes: [],
      dislikes: [],
      notes: ''
    });
    expect(response.onboarding.status).toBe('pending');
  });

  it('fusiona sin pisar tema, idioma o nivel de detalle', () => {
    const user = createUser(
      JSON.stringify({ theme: 'dark', language: 'es', detailLevel: 'expert' })
    );

    taste.saveTasteProfile(db, user, {
      taste: {
        goal: 'weight-loss',
        goalNotes: 'Cenas ligeras',
        allergies: ['Lactosa', 'Frutos secos'],
        likes: ['Legumbres'],
        dislikes: ['Vísceras'],
        notes: 'Ceno pronto'
      },
      onboardingStatus: 'done'
    });

    const stored = readPreferencesColumn(user);
    expect(stored.theme).toBe('dark');
    expect(stored.language).toBe('es');
    expect(stored.detailLevel).toBe('expert');
    expect(stored.taste.allergies).toEqual(['Lactosa', 'Frutos secos']);
    expect(stored.onboarding.status).toBe('done');
    expect(stored.onboarding.at).toBeTruthy();
  });

  it('un parche parcial no borra lo que ya estaba dicho', () => {
    const user = createUser();
    taste.saveTasteProfile(db, user, {
      taste: { allergies: ['Gluten'], likes: ['Pollo'] }
    });

    taste.saveTasteProfile(db, user, { taste: { goal: 'muscle-gain' } });

    const response = taste.readTasteResponse(db, user);
    expect(response.taste.allergies).toEqual(['Gluten']);
    expect(response.taste.likes).toEqual(['Pollo']);
    expect(response.taste.goal).toBe('muscle-gain');
  });

  it('limpia duplicados, vacíos y objetivos desconocidos', () => {
    const user = createUser();

    taste.saveTasteProfile(db, user, {
      taste: {
        goal: 'dieta-de-3-dias' as never,
        allergies: ['  Lactosa ', 'Lactosa', '', '   ', 'Huevo']
      }
    });

    const response = taste.readTasteResponse(db, user);
    expect(response.taste.allergies).toEqual(['Lactosa', 'Huevo']);
    // Un valor que no está en el enum no se guarda: vuelve al por defecto
    expect(response.taste.goal).toBe('balanced');
  });

  it('una preferencia con JSON roto no rompe la lectura', () => {
    const user = createUser('{esto no es json');

    const response = taste.readTasteResponse(db, user);

    expect(response.taste.allergies).toEqual([]);
    expect(response.onboarding.status).toBe('pending');
  });
});

describe('tastePromptLines', () => {
  it('no escribe nada para un perfil vacío', () => {
    const empty = taste.emptyTasteProfile();

    expect(taste.hasTasteProfile(empty)).toBe(false);
    expect(taste.tastePromptLines(empty)).toBe('');
  });

  it('prioriza las alergias y arrastra el objetivo y las notas', () => {
    const lines = taste
      .tastePromptLines({
        goal: 'weight-loss',
        goalNotes: 'sin fritos',
        allergies: ['Lactosa'],
        likes: ['Verduras'],
        dislikes: ['Marisco'],
        notes: 'Ceno a las 21:00'
      })
      .split('\n');

    expect(lines[0]).toContain('Alergias e intolerancias');
    expect(lines[0]).toContain('Lactosa');
    expect(lines).toEqual(expect.arrayContaining([expect.stringContaining('Verduras')]));
    expect(lines).toEqual(expect.arrayContaining([expect.stringContaining('Marisco')]));
    expect(lines).toEqual(expect.arrayContaining([expect.stringContaining('Perder peso')]));
    expect(lines).toEqual(expect.arrayContaining([expect.stringContaining('sin fritos')]));
    expect(lines).toEqual(expect.arrayContaining([expect.stringContaining('Ceno a las 21:00')]));
  });

  it('con objetivo personalizado usa el texto libre como objetivo', () => {
    const block = taste.tastePromptLines({
      ...taste.emptyTasteProfile(),
      goal: 'custom',
      goalNotes: 'Sin carne los lunes y cenas de una olla'
    });

    expect(block).toContain('Objetivo del comensal: Sin carne los lunes');
    expect(block).not.toContain('Personalizada');
  });
});
