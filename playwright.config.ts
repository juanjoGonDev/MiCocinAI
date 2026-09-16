import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
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
    ['html'],
    // 'list' vuelca cada resultado al log: así se ve por dónde se atasca un run
    // de CI sin esperar al informe final.
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }]
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
    env: { DISABLE_RATE_LIMIT: '1' },
  },
});
