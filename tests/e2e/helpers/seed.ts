/**
 * Semilla de datos de un run de la suite e2e.
 *
 * Cada prueba registra su propio usuario; con la semilla esos usuarios son
 * rastreables: el correo es `e2e-<semilla>-<n>@example.com`, así que se puede
 * saber que filas dejo UN run concreto (y repetirlo con E2E_SEED=...).
 *
 * La pone `global-setup.ts` en el entorno comun: el reporter, los workers y el
 * backend arrancado por Playwright ven la misma semilla.
 */
export const E2E_SEED: string = process.env.E2E_SEED ??= `s${Date.now().toString(36)}`;

let counter = 0;

/** Correo unico y estable para este run. */
export function seededEmail(): string {
  counter += 1;
  return `e2e-${E2E_SEED}-${counter}@example.com`;
}

/** Identificador de datos del test actual, para anotarlo y verlo en el log. */
export function dataSeed(key: string): string {
  return `${E2E_SEED}/${key}`;
}
