import { defineConfig } from 'vitest/config';

/**
 * Cobertura del nucleo del servidor (HOGARIA-SPEC §11c).
 *
 * El umbral es duro y por fichero: ningun fichero de esta lista puede bajar del
 * 70 % en ninguna metrica. Y la lista es una rampa: un fichero entra cuando tiene
 * spec propia, nunca se le excluye para que el numero salga bonito.
 *
 * `src/config/database.ts` entro al cambiar el nombre del fichero de la BD: la
 * adopcion del fichero heredado es logica que puede dejar a alguien sin datos,
 * asi que se pruebo antes de subirla (73 % de ramas; por debajo del 100 % quedan
 * las ramas del bootstrap que estos tests no montan, no codigo sin probar).
 *
 * Hoy quedan fuera, con su prueba atada a la fase que les corresponde:
 *   - src/routes/** y src/index.ts    → se prueban de momento con la suite e2e
 *   - src/middleware/**, src/schemas/**, src/utils/log-store.ts,
 *     src/utils/logger.ts              → unidades puras; entran con P1/P2, que es
 *     cuando se escriben sus tests de contrato
 */
const COVERED = [
  'src/routes/shopping.routes.ts',
  'src/schemas/shopping.schema.ts',
  'src/utils/product-key.ts',
  'src/utils/shopping-categories.ts',
  'src/utils/ai-client.ts',
  'src/config/database.ts',
  'src/utils/memory-monitor.ts',
  'src/utils/seed-data.ts',
  'src/utils/taste-profile.ts',
  'src/utils/week-calendar.ts',
  'src/utils/weekly-plan.ts',
  'src/models/schema.ts',
  'src/config/app.config.ts'
];

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      all: false,
      include: COVERED,
      // `text` para leerla en el CI log, `html` para verla en el navegador y
      // `lcov` para que la consuman las extensiones de VS Code / los informes de PR.
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      clean: true,
      thresholds: {
        perFile: true,
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70
      }
    }
  }
});
