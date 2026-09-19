/**
 * Arranca antes de los workers y del webServer de Playwright: fija la semilla
 * del run en `process.env` para que la vean el reporter, las pruebas y el
 * servidor que se levanta con ellas.
 */
import { E2E_SEED } from './helpers/seed';

export default async function globalSetup(): Promise<void> {
  // E2E_SEED ya esta puesto (o generado) por el propio modulo de la semilla.
  // eslint-disable-next-line no-console
  console.log(`[hogar] semilla e2e: ${E2E_SEED}`);
}
