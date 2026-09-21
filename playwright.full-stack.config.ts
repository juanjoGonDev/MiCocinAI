import { defineConfig, devices } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Playwright contra el proyecto ENTERO levantado como en produccion: un unico proceso
 * node que sirve la API y el `index.html` compilado, con el limitador de peticiones
 * ENCENDIDO y con el visor de logs por SSE.
 *
 * Por que hace falta otra config si ya existe `playwright.config.ts`: porque el job que
 * esta funcionando usa `npm run dev` (ng serve con proxy + `tsx` en el backend) y apaga
 * el limitador —`DISABLE_RATE_LIMIT=1`— para que los 381 tests no se pisen el cupo. Es
 * la decision correcta para esa suite, y deja fuera justo lo que se rompio dos veces: la
 * interfaz compilada, servida por el mismo proceso que la API, con el limite real
 * aplicado y con el streaming de logs intacto. Un «todo verde» que no ejercita esa
 * combinacion no dice nada de ella.
 *
 * Local:  `npm run build && npx playwright test -c playwright.full-stack.config.ts`
 */

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.E2E_FULL_STACK_PORT ?? 3100);
const base = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests/e2e/full-stack',
  // La misma semilla del run: el reporter y el backend tienen que ver lo mismo.
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 1,
  timeout: process.env.CI ? 120_000 : 60_000,
  reporter: [
    ['list'],
    // Informe aparte: mezclarlo con el de la suite de desarrollo haria imposible saber
    // de que job es un fallo que se abre en el navegador.
    ['html', { open: 'never', outputFolder: 'playwright-report/full-stack' }]
  ],
  use: {
    baseURL: base,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 45_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      // Movil de verdad: el 429 se manifesto en el telefono, y el SSE del visor de logs
      // se corta de otra forma cuando el viewport (y el teclado en pantalla) mandan.
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] }
    }
  ],
  webServer: {
    // Un solo proceso: el `CMD` del Dockerfile, no un montaje de dos servidores.
    // `PUBLIC_DIR` se deja SIN fijar a proposito: el servidor probe las formas reales
    // del `dist` (`frontend/dist/browser`, `./public`...), que es lo que hace en el
    // contenedor, y asi este config tampoco se queda apuntando a una ruta vieja.
    command: 'node server/dist/index.js',
    cwd: root,
    url: `${base}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: String(port),
      NODE_ENV: 'production',
      // BD propia por puerto, para poder tener el server de desarrollo y este a la vez.
      DATABASE_PATH: join(root, 'server', 'data', `hogaria-e2e-full-stack-${port}.sqlite`),
      // El limitador NO se apaga: es lo que se viene a probar aqui.
      E2E_SEED: process.env.E2E_SEED ?? ''
    }
  }
});
