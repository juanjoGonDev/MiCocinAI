import Database from 'better-sqlite3';
import { z } from 'zod';

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
  taste: tasteProfileSchema.optional(),
  /** 'done' al terminar el onboarding, 'skipped' si se salta. */
  onboardingStatus: z.enum(['done', 'skipped']).optional()
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

function selectTaste(db: Database.Database, userId: string): string | undefined {
  const row = db.prepare('SELECT preferences FROM users WHERE id = ?').get(userId) as
    { preferences: string | null } | undefined;
  return row?.preferences ?? undefined;
}

export function readTasteResponse(db: Database.Database, userId: string): TasteResponse {
  const prefs = readPreferences(selectTaste(db, userId));
  return {
    taste: toTasteProfile(prefs.taste),
    onboarding: toOnboardingState(prefs.onboarding)
  };
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
  const row = db.prepare('SELECT preferences FROM users WHERE id = ?').get(userId) as
    { preferences: string | null } | undefined;
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

  db.prepare('UPDATE users SET preferences = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    JSON.stringify(prefs),
    userId
  );

  return {
    taste: toTasteProfile(prefs.taste),
    onboarding: toOnboardingState(prefs.onboarding)
  };
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
