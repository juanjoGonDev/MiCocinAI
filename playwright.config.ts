import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Fija la semilla del run antes que nada: la ven workers, reporter y backend.
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // En CI hace falta margen: ng serve compila el chunk de cada ruta perezosa
  // a la primera, y eso pasa dentro del test (registrarse lleva al onboarding,
  // que es ruta nueva). 120s por test cubre el arranque frio sin que un fallo
  // real se convierta en una espera interminable.
  timeout: process.env.CI ? 120000 : 60000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    // Salida tipo vitest/jest: arbol por `it` con duracion y semilla de datos,
    // fallos concentrados antes del summary y summary con los mas lentos.
    ['./tools/reporters/hogaria-e2e-reporter.js'],
    // El informe HTML sigue siendo el sitio donde ver el trace de un fallo.
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    // XML para quien lo quiera consumir (CI, IDEs, quality gates).
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Acotados, pero con margen: recortar esto a 15/20s convirtio 5 fallos
    // reales en 69 (la compilacion en frio del dev server de CI no da abasto).
    actionTimeout: 45000,
    navigationTimeout: 60000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    // Toda la suite comparte la IP del backend: sin apagar el rate limit, un
    // pico de peticiones deja algun registro sin redirigir y el test espera su
    // navegacion hasta el timeout. Las limitaciones no son lo que se prueba aqui.
    env: {
      DISABLE_RATE_LIMIT: '1',
      // Para poder cruzar los logs del backend con la semilla del run.
      E2E_SEED: process.env.E2E_SEED ?? ''
    },
  },
});
