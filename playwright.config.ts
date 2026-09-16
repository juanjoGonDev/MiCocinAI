import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Acotados para que una suite completa no se dispare de tiempo en CI.
  // 60s: cada test registra su usuario y (muchos) crea su hogar, y los
  // timeout internos de espera llegan a 45s sobre el dev server de CI.
  timeout: 60000,
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
    // Sin tope de accion, un localizador que no aparece se espera hasta el
    // timeout del test (60s) y con reintentos la suite entera se multiplica x4:
    // mejor un fallo en 15s y legible.
    actionTimeout: 15000,
    navigationTimeout: 20000,
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
