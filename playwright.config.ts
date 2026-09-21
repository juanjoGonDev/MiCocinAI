import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Fija la semilla del run antes que nada: la ven workers, reporter y backend.
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // En CI queda margen para el chunk perezoso de la ruta nueva que toca a cada
  // worker (el arranque frio del bundle ya se paga en globalSetup), pero no 120s:
  // un timeout largo multiplica por el numero de tests cualquier cascada, y eso es
  // literalmente como se ha colgado este job. 90s cubre el peor caso conocido.
  timeout: process.env.CI ? 90000 : 60000,
  retries: process.env.CI ? 1 : 0,
  // Con un solo worker la suite de 113 tests tardaba mas que el propio runner.
  // El trabajo pesado (install, compilacion) esta fuera de los tests, asi que se
  // puede paralelizar: 2 por shard, 4 shards en paralelo = 8 tests a la vez.
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    // `list`, y no el reporter propio que se citaba aqui: `tools/reporters/hogaria-e2e-reporter.js`
    // nunca llego al repositorio, y un path inexistente no degrada —Playwright falla antes de correr el
    // primer test, que es exactamente como se quedo esta suite sin ejecutar en CI. Si se quiere de
    // vuelta el arbol con semilla y los mas lentos, se escribe y se trae en su propia tanda; mientras no
    // este, el arbol por `it` con duracion de `list` dice lo esencial.
    ['list'],
    // El informe HTML sigue siendo el sitio donde ver el trace de un fallo.
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    // XML para quien lo quiera consumir (CI, IDEs, quality gates).
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],
  use: {
    baseURL: 'http://localhost:4200',
    // El idioma del navegador, fijado: con `language: 'auto'` la app mira `navigator.language`, y en CI eso
    // es `en-US`. Toda la suite esta escrita contra el espanol de la interfaz, asi que sin este ancla un
    // test verde en mi maquina es rojo en la suya —y al reves— sin que nadie haya tocado la app.
    locale: 'es-ES',
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
