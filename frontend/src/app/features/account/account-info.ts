/**
 * Lo que la cuenta puede decirse a sí misma sin preguntarle a nadie.
 *
 * El navegador es parte de la app (es PWA: guarda la sesión, el tema y la cola de escrituras
 * pendientes), y hasta ahora eso era invisible: si algo no se sincronizaba, no había dónde mirar.
 * Estas funciones son puras a propósito —reciben los datos ya leídos— para que se puedan probar
 * sin navegador.
 */

/** Prefijo común a todo lo que escribe esta app (`hogar:v1:` y las versiones que vengan). */
export const APP_STORAGE_MARK = 'hogar:';

export type StorageUsage = {
  /** Claves de la app en el almacenamiento del navegador. */
  entries: number;
  /** Bytes aproximados: localStorage guarda UTF-16, dos bytes por carácter. */
  bytes: number;
  /** Escrituras esperando a que vuelva la red. */
  pending: number;
};

/**
 * Un inventario del `localStorage` propio. No se lee aquí el almacenamiento: se le pasa la lista
 * de claves y una función para leerlas, que es lo que hace la prueba determinista.
 */
export function storageUsage(keys: string[], read: (key: string) => string, pending = 0): StorageUsage {
  let bytes = 0;
  let entries = 0;
  for (const key of keys) {
    if (!key.startsWith(APP_STORAGE_MARK)) continue;
    entries += 1;
    const value = read(key);
    bytes += (key.length + value.length) * 2;
  }
  return { entries, bytes, pending };
}

/**
 * Bytes a algo que se puede leer de un vistazo. Un número suelto de seis cifras no informa: lo que
 * importa es si es un puñado de texto o un problema.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${trim(kb)} KB`;
  return `${trim(kb / 1024)} MB`;
}

/** Una cifra decimal y coma, como el resto de la app en castellano. */
function trim(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toFixed(1).replace(/\.0$/, '').replace('.', ',');
}

/** La frase de la cola: «nada pendiente» y «dos cosas esperando» se leen distinto. */
export function pendingLabel(pending: number): string {
  if (pending <= 0) return 'Nada pendiente de enviar';
  return pending === 1 ? '1 escritura esperando la red' : `${pending} escrituras esperando la red`;
}

/** El id de la cuenta, recortado por los dos lados: entero no cabe en una línea. */
export function shortId(id: string | null | undefined, edge = 8): string {
  if (!id) return '—';
  return id.length <= edge * 2 ? id : `${id.slice(0, edge)}…${id.slice(-4)}`;
}
