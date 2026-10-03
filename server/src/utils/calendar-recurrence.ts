// =============================================================================
// Recurrencia de las sueltas del calendario (HOGARIA-SPEC 12t-R).
//
// Una serie es UNA fila: `date` es el dia en que empieza y `recurrence` dice cada cuanto se repite.
// Las ocurrencias no se guardan, se materializan al leer —el mismo motivo por el que las comidas no se
// copian a `calendar_events` (8f): dos verdades se desincronizan. Y tiene un efecto bueno de regalo:
// cambiar el titulo de la serie cambia los lunes de verdad, y borrar la serie no deja treinta filas
// huerfanas.
//
// Todo este fichero es aritmetica de fechas sobre ISO `YYYY-MM-DD` en UTC. Nada de `new Date()` local:
// un navegador en otra zona corria los lunes (y en el server, el deploy a las 23:59 también).
// =============================================================================

export const RECURRENCES = ['none', 'daily', 'weekly'] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export function isRecurrence(value: unknown): value is Recurrence {
  return (RECURRENCES as readonly unknown[]).includes(value);
}

/** Lo que hace falta saber de una fila para saber cuando ocurre. */
export interface RecurrenceRule {
  /** Dia de la serie, `YYYY-MM-DD`. Para `none`, el unico dia. */
  date: string;
  recurrence: Recurrence;
  /** Dias `YYYY-MM-DD` en los que esta serie, concretamente, no ocurre («solo este dia no»). */
  exceptions?: readonly string[] | string | null;
}

export interface Expansion {
  /** Fechas `YYYY-MM-DD` dentro de la ventana, en orden, sin las excepciones. */
  dates: string[];
  /** `true` si habia mas ocurrencias que `max`: la ventana corta, no la serie. */
  truncated: boolean;
}

const DAY_MS = 86_400_000;
/** Cuantas ocurrencias se materializan por serie y lectura, como mucho. */
export const MAX_OCCURRENCES = 400;

/** `YYYY-MM-DD` -> medianoche UTC en ms, o `null`. Una fecha que no existe (2026-02-30) es `null`. */
export function dayFromISO(iso: unknown): number | null {
  if (typeof iso !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(ms) || toISO(ms) !== iso.trim() ? null : ms;
}

function toISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Las excepciones admiten venir como JSON sin parsear: la columna es TEXT, y no se rompe una lectura por eso. */
export function parseExceptionDates(raw: readonly string[] | string | null | undefined): string[] {
  const value = typeof raw === 'string' ? safelyParse(raw) : raw;
  const list = Array.isArray(value) ? value : [];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item === 'string' && dayFromISO(item) !== null && !out.includes(item.trim())) out.push(item.trim());
  }
  return out;
}

export function exceptionSet(rule: RecurrenceRule): Set<string> {
  return new Set(parseExceptionDates(rule.exceptions));
}

function safelyParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

/**
 * Que dias ocurre la serie dentro de `[from, to]`, ambos inclusive.
 *
 * `none` es un dia; `daily` es cada dia desde el de la serie; `weekly` es el mismo dia de la semana
 * (UTC) de ese dia. La ventana puede empezar despues del inicio de la serie —es lo normal: una casa
 * que planifico «sacar la basura» en marzo sigue viendola en octubre—, asi que el primer dia util se
 * calcula en vez de iterar desde el principio: recorrer a saltos una serie de tres anos para pintar
 * un mes es una manera cara de no llegar nunca.
 */
export function expandOccurrences(
  rule: RecurrenceRule,
  window: { from?: string | null; to?: string | null } = {},
  max: number = MAX_OCCURRENCES
): Expansion {
  const empty: Expansion = { dates: [], truncated: false };
  const start = dayFromISO(rule.date);
  if (start === null) return empty;

  const from = dayFromISO(window.from ?? null) ?? -Infinity;
  const to = dayFromISO(window.to ?? null) ?? Infinity;
  if (from === -Infinity && to === Infinity && rule.recurrence === 'none') {
    return { dates: [toISO(start)], truncated: false };
  }
  if (from > to) return empty;

  const exceptions = exceptionSet(rule);
  const push = (ms: number, dates: string[]): void => {
    const iso = toISO(ms);
    if (!exceptions.has(iso)) dates.push(iso);
  };

  if (rule.recurrence === 'none') {
    if (start < from || start > to) return empty;
    const iso = toISO(start);
    return { dates: exceptions.has(iso) ? [] : [iso], truncated: false };
  }

  const step = rule.recurrence === 'daily' ? DAY_MS : 7 * DAY_MS;
  // Primer dia de la serie que cae en la ventana (o despues).
  let cursor = start;
  if (start < from) {
    const saltos = Math.ceil((from - start) / step);
    cursor = start + saltos * step;
  }

  const dates: string[] = [];
  let generated = 0;
  while (cursor <= to) {
    if (generated >= max) return { dates, truncated: true };
    push(cursor, dates);
    generated++;
    cursor += step;
  }
  return { dates, truncated: false };
}

/** Vale para el dia suelto (vista de dia, «quitar solo este dia»): la serie ocurre ese dia? */
export function occursOn(rule: RecurrenceRule, date: string): boolean {
  return expandOccurrences(rule, { from: date, to: date }).dates.length > 0;
}
