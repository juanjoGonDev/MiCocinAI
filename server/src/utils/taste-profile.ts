import Database from 'better-sqlite3';
import { z } from 'zod';
import { formField } from '../schemas/form.js';

/**
 * Perfil de gustos, alergias y objetivo del comensal.
 *
 * Se rellena en el onboarding (nada más registrarse) y se puede editar a mano
 * en Ajustes. Se guarda dentro del JSON `users.preferences` — bajo las claves
 * `taste` y `onboarding` — para no añadir columnas ni migraciones: es data
 * propia de la cuenta, no compartida con el hogar.
 *
 * Lo consume la IA: sin él, las recetas que genera pueden llevar ingredientes
 * que el usuario no puede comer o que no le gustan.
 */

export const tasteGoalEnum = z.enum([
  'balanced',
  'weight-loss',
  'weight-gain',
  'muscle-gain',
  'variety',
  'custom'
]);

export const GOAL_LABELS: Record<string, string> = {
  balanced: 'Equilibrada',
  'weight-loss': 'Perder peso',
  'weight-gain': 'Ganar peso',
  'muscle-gain': 'Ganar músculo',
  variety: 'Variada',
  custom: 'Personalizada'
};

/**
 * Nivel en la cocina. `none` («apenas cocino») llega con HogarIA: la app ya no
 * es solo de recetas, así que quien no cocina también tiene que poder decirlo.
 * Se guarda en `users.cooking_level` (TEXT sin CHECK: no hace falta migración).
 */
export const COOKING_LEVELS = ['none', 'beginner', 'intermediate', 'expert'] as const;
export const cookingLevelEnum = z.enum(COOKING_LEVELS);
export type CookingLevel = (typeof COOKING_LEVELS)[number];

/** Secciones de HogarIA que la persona quiere llevar desde la app. */
export const HOME_MODULES = ['meals', 'pantry', 'shopping', 'receipts', 'home'] as const;
export const homeModuleEnum = z.enum(HOME_MODULES);
export type HomeModule = (typeof HOME_MODULES)[number];

/** Qué se responde y qué se guarda: el nivel vive en la columna, los módulos en el JSON. */
export interface HomeProfileView {
  cookingLevel: CookingLevel;
  modules: HomeModule[];
}

/**
 * El nivel tiene que servir para algo: sin petición explícita de la UI, la IA
 * explica más a quien empieza y va al grano con quien domina la cocina.
 */
export function detailLevelForCookingLevel(level: unknown): 'basic' | 'intermediate' | 'expert' {
  if (level === 'expert') return 'expert';
  if (level === 'intermediate') return 'intermediate';
  return 'basic';
}

/** Defensivo al leer: JSON antiguos o escritos a mano no pueden colar valores desconocidos. */
export function toHomeProfile(
  stored: unknown,
  cookingLevel: unknown
): HomeProfileView {
  const raw = readPreferences(stored);
  const modules: HomeModule[] = [];
  if (Array.isArray(raw.modules)) {
    for (const item of raw.modules) {
      const value = String(item ?? '') as HomeModule;
      if (!HOME_MODULES.includes(value) || modules.includes(value)) continue;
      modules.push(value);
    }
  }
  const level = COOKING_LEVELS.includes(cookingLevel as CookingLevel)
    ? (cookingLevel as CookingLevel)
    : 'beginner';
  return { cookingLevel: level, modules: modules.slice(0, HOME_MODULES.length) };
}

/** Listas cortas y sin vacíos: son cadenas que se envían tal cual a la IA. */
const stringList = z.array(z.string().trim().min(1).max(60)).max(60).optional();

export const tasteProfileSchema = z.object({
  goal: tasteGoalEnum.optional(),
  goalNotes: z.string().trim().max(500).optional(),
  allergies: stringList,
  likes: stringList,
  dislikes: stringList,
  notes: z.string().trim().max(1000).optional()
});

export const updateTasteSchema = z.object({
  // `formField` en todo: el onboarding manda el perfil por partes (y «omitir el onboarding» es un
  // PATCH con un solo campo), y un hueco aqui tiene que significar «no tocar», no un 400.
  taste: formField(tasteProfileSchema.optional()),
  /** 'done' al terminar el onboarding, 'skipped' si se salta. */
  onboardingStatus: formField(z.enum(['done', 'skipped'])),
  /** Nivel de cocina: se escribe en su columna, no en el JSON. */
  cookingLevel: formField(cookingLevelEnum),
  /** Qué se quiere llevar desde la app (ver HOME_MODULES). */
  modules: formField(z.array(homeModuleEnum).max(HOME_MODULES.length))
});

export type TasteProfileInput = z.infer<typeof tasteProfileSchema>;
export type UpdateTasteInput = z.infer<typeof updateTasteSchema>;

export interface TasteProfile {
  goal: string;
  goalNotes: string;
  allergies: string[];
  likes: string[];
  dislikes: string[];
  notes: string;
}

export interface OnboardingState {
  status: 'pending' | 'done' | 'skipped';
  completedAt: string | null;
}

export interface TasteResponse {
  taste: TasteProfile;
  onboarding: OnboardingState;
  profile: HomeProfileView;
}

export const emptyTasteProfile = (): TasteProfile => ({
  goal: 'balanced',
  goalNotes: '',
  allergies: [],
  likes: [],
  dislikes: [],
  notes: ''
});

const pendingOnboarding: OnboardingState = { status: 'pending', completedAt: null };

/** El JSON de preferencias puede venir roto o vacío: nunca rompe una lectura. */
function readPreferences(raw: unknown): Record<string, any> {
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = String(item ?? '')
      .trim()
      .slice(0, 60);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function normalizeText(value: unknown, max: number): string {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

/** Une el perfil guardado con los valores por defecto (nunca undefined). */
export function toTasteProfile(stored: unknown): TasteProfile {
  const raw = readPreferences(stored);
  const goal = typeof raw.goal === 'string' && GOAL_LABELS[raw.goal] ? raw.goal : 'balanced';

  return {
    goal,
    goalNotes: normalizeText(raw.goalNotes, 500),
    allergies: normalizeList(raw.allergies),
    likes: normalizeList(raw.likes),
    dislikes: normalizeList(raw.dislikes),
    notes: normalizeText(raw.notes, 1000)
  };
}

function toOnboardingState(stored: unknown): OnboardingState {
  const raw = readPreferences(stored);
  if (!raw || typeof raw !== 'object' || typeof raw.status !== 'string')
    return { ...pendingOnboarding };

  const status = raw.status === 'done' || raw.status === 'skipped' ? raw.status : 'pending';
  return { status, completedAt: typeof raw.at === 'string' ? raw.at : null };
}

interface UserPreferenceRow {
  preferences: string | null;
  cooking_level: string | null;
}

function selectUserRow(db: Database.Database, userId: string): UserPreferenceRow | undefined {
  return db
    .prepare('SELECT preferences, cooking_level FROM users WHERE id = ?')
    .get(userId) as UserPreferenceRow | undefined;
}

export function readTasteResponse(db: Database.Database, userId: string): TasteResponse {
  const row = selectUserRow(db, userId);
  const prefs = readPreferences(row?.preferences);
  return {
    taste: toTasteProfile(prefs.taste),
    onboarding: toOnboardingState(prefs.onboarding),
    profile: toHomeProfile(prefs.profile, row?.cooking_level)
  };
}

/** Lo que necesita la IA antes de escribir un prompt: el nivel del comensal. */
export function readCookingLevel(db: Database.Database, userId: string): CookingLevel {
  const row = selectUserRow(db, userId);
  const level = row?.cooking_level;
  return COOKING_LEVELS.includes(level as CookingLevel) ? (level as CookingLevel) : 'beginner';
}

/**
 * Fusiona el parche en `users.preferences` sin tocar el resto (tema, idioma,
 * nivel de detalle...): se leen, se modifica solo `taste`/`onboarding` y se
 * vuelve a escribir el objeto completo.
 */
export function saveTasteProfile(
  db: Database.Database,
  userId: string,
  patch: UpdateTasteInput
): TasteResponse {
  const row = selectUserRow(db, userId);
  const prefs = readPreferences(row?.preferences);

  if (patch.taste) {
    const previous = toTasteProfile(prefs.taste);
    const next = patch.taste;
    prefs.taste = {
      goal: next.goal ?? previous.goal,
      goalNotes:
        next.goalNotes !== undefined ? normalizeText(next.goalNotes, 500) : previous.goalNotes,
      allergies: next.allergies !== undefined ? normalizeList(next.allergies) : previous.allergies,
      likes: next.likes !== undefined ? normalizeList(next.likes) : previous.likes,
      dislikes: next.dislikes !== undefined ? normalizeList(next.dislikes) : previous.dislikes,
      notes: next.notes !== undefined ? normalizeText(next.notes, 1000) : previous.notes
    };
  }

  if (patch.onboardingStatus) {
    prefs.onboarding = {
      status: patch.onboardingStatus,
      at: new Date().toISOString()
    };
  }

  if (patch.modules !== undefined) {
    const profile = readPreferences(prefs.profile);
    profile.modules = [...new Set(patch.modules)];
    prefs.profile = profile;
  }

  const sets = ['preferences = ?', 'updated_at = CURRENT_TIMESTAMP'];
  const values: unknown[] = [JSON.stringify(prefs)];
  if (patch.cookingLevel !== undefined) {
    sets.unshift('cooking_level = ?');
    values.unshift(patch.cookingLevel);
  }
  values.push(userId);

  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return readTasteResponse(db, userId);
}

/** Solo el perfil, para los prompts de la IA. */
export function readTasteProfile(db: Database.Database, userId: string): TasteProfile {
  return readTasteResponse(db, userId).taste;
}

/**
 * Bloque de prompt con lo que ha contestado el usuario. Vacío si no ha
 * configurado nada, para no rellenar el prompt de líneas sin contenido.
 */
export function tastePromptLines(taste: TasteProfile): string {
  const lines: string[] = [];

  if (taste.allergies.length > 0) {
    lines.push(
      `Alergias e intolerancias (no uses NADA de esto, ni en variantes ni como opcional): ${taste.allergies.join(', ')}`
    );
  }
  if (taste.likes.length > 0) {
    lines.push(`Le gusta: ${taste.likes.join(', ')}`);
  }
  if (taste.dislikes.length > 0) {
    lines.push(`Prefiere evitar (no lo propongas si no hace falta): ${taste.dislikes.join(', ')}`);
  }

  const goalLabel = GOAL_LABELS[taste.goal] ?? taste.goal;
  if (taste.goal === 'custom' && taste.goalNotes) {
    lines.push(`Objetivo del comensal: ${taste.goalNotes}`);
  } else if (taste.goal && taste.goal !== 'balanced') {
    lines.push(
      taste.goalNotes ? `Objetivo: ${goalLabel} — ${taste.goalNotes}` : `Objetivo: ${goalLabel}`
    );
  } else if (taste.goalNotes) {
    lines.push(`Objetivo del comensal: ${taste.goalNotes}`);
  }

  if (taste.notes) {
    lines.push(`Notas del comensal: ${taste.notes}`);
  }

  return lines.join('\n');
}

/** ¿Tiene algo dicho el usuario? (para no hablar de "tus gustos" con un perfil vacío) */
export function hasTasteProfile(taste: TasteProfile): boolean {
  return (
    taste.allergies.length > 0 ||
    taste.likes.length > 0 ||
    taste.dislikes.length > 0 ||
    taste.notes.length > 0 ||
    taste.goalNotes.length > 0 ||
    (taste.goal !== '' && taste.goal !== 'balanced')
  );
}
