import { test, expect } from './fixtures';
import { registerAndGoto } from './helpers/auth';

test.describe('AI Config', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndGoto(page, '/ai-config');
    await expect(page.locator('h1.ai-config__title')).toBeVisible();
  });

  test('should display AI config page', async ({ page }) => {
    await expect(page.locator('h1.ai-config__title')).toContainText('Configuración IA');
  });

  test('should show info message', async ({ page }) => {
    await expect(page.locator('.ai-config__info')).toContainText('Conecta tu proveedor de IA');
  });

  test('should show empty state with the add button', async ({ page }) => {
    await expect(page.locator('.empty-state__title')).toContainText('Sin configuraciones');
    await expect(page.getByRole('button', { name: /Agregar configuración/ }).first()).toBeVisible();
  });

  test('should open add config modal with its fields', async ({ page }) => {
    await page.getByRole('button', { name: /Agregar configuración/ }).first().click();

    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.modal__title')).toContainText('Nueva Configuración');
    await expect(page.locator('input#name')).toBeVisible();
    await expect(page.locator('input#model')).toBeVisible();
    await expect(page.locator('input#baseUrl')).toBeVisible();
    await expect(page.locator('input#apiKey')).toBeVisible();
  });

  test('should show provider options and temperature', async ({ page }) => {
    await page.getByRole('button', { name: /Agregar configuración/ }).first().click();

    const provider = page.locator('select[name="provider"]');
    await expect(provider).toBeVisible();
    await expect(provider.locator('option')).toContainText(['OpenAI', 'Custom (OpenAI-like)']);

    await expect(page.locator('.form-label', { hasText: 'Temperatura' })).toBeVisible();
    await expect(page.locator('input#maxTokens')).toBeVisible();
  });

  test('should create a new config', async ({ page }) => {
    await page.getByRole('button', { name: /Agregar configuración/ }).first().click();

    await page.fill('input#name', 'Mi Proveedor');
    await page.fill('input#model', 'gpt-4o-mini');
    await page.fill('input#baseUrl', 'https://api.openai.com/v1');
    await page.fill('input#apiKey', 'sk-test-key');
    await page.locator('app-modal button[type="submit"]').click();

    // El modal se cierra y la configuracion aparece en el listado
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
    await expect(page.locator('.config-card__name')).toContainText('Mi Proveedor');
    await expect(page.locator('.config-detail__label', { hasText: 'Temperatura' })).toBeVisible();
  });

  test('probar desde el formulario: el boton se bloquea en «Comprobando…» y el resultado llega al terminar', async ({
    page
  }) => {
    // El proveedor tarda: sin esto, la peticion falla en milisegundos (localhost:9) y no da
    // tiempo a ver el estado «comprobando». El retraso es la mitad de la prueba.
    let respondido = false;
    await page.route('**/api/ai/test-connection', async route => {
      await new Promise(resolver => setTimeout(resolver, 700));
      respondido = true;
      await route.fulfill({
        json: { success: true, data: { success: true, model: 'gpt-5', latency: 12, message: 'conexión establecida' } }
      });
    });

    await page.getByRole('button', { name: /Agregar configuración/ }).first().click();
    await page.fill('input#name', 'Mi webapi');
    await page.fill('input#model', 'gpt-5');
    await page.fill('input#baseUrl', 'http://localhost:8000');
    await page.fill('input#apiKey', 'sk-test');

    const boton = page.locator('[data-test="probar-formulario"] button');
    await boton.click();

    // Mientras el proveedor no ha contestado: bloqueado, «Comprobando…», y NINGUN aviso de
    // exito por adelantado (el pecado original: el toast salia sin haber llamado a nadie).
    await expect(boton).toBeDisabled();
    await expect(boton).toContainText('Comprobando');
    await page.waitForTimeout(300);
    expect(respondido).toBe(false);
    await expect(page.locator('.toast--success')).toHaveCount(0);

    // Y cuando llega, el resultado —sea el que sea— es lo unico que se ensena.
    await expect(page.locator('.test-result__title')).toContainText('Conexión exitosa', { timeout: 10000 });
    await expect(page.locator('.test-result__detail').first()).toContainText('gpt-5');
  });

  test('la configuracion recien creada es LA activa, y activar otra apaga la anterior', async ({ page }) => {
    const crear = async (nombre: string) => {
      await page.getByRole('button', { name: /Agregar configuración/ }).first().click();
      await page.fill('input#name', nombre);
      await page.fill('input#model', 'gpt-5');
      await page.fill('input#baseUrl', 'http://localhost:8000/v1');
      await page.fill('input#apiKey', 'sk-test');
      await page.locator('app-modal button[type=\"submit\"]').click();
      await expect(page.locator('.modal-overlay')).toHaveCount(0);
    };

    await crear('La vieja');
    await crear('La nueva');

    const tarjetaDe = (nombre: string) => page.locator('.config-card').filter({ hasText: nombre });
    // La recien creada es la activa; la anterior se apaga (antes: ambas activas y la VIEJA
    // era la que contestaba, que era «la IA no se activa»).
    await expect(tarjetaDe('La vieja').locator('app-badge').first()).toContainText('Inactivo');
    await expect(tarjetaDe('La nueva').locator('app-badge').first()).toContainText('Activo');

    // Activar la vieja apaga la nueva: solo hay una.
    await tarjetaDe('La vieja').getByRole('button', { name: /Activar/ }).click();
    await expect(tarjetaDe('La vieja').locator('app-badge').first()).toContainText('Activo');
    await expect(tarjetaDe('La nueva').locator('app-badge').first()).toContainText('Inactivo');
  });

  test('should close modal on cancel', async ({ page }) => {
    await page.getByRole('button', { name: /Agregar configuración/ }).first().click();
    await expect(page.locator('.modal__title')).toContainText('Nueva Configuración');

    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
  });
});
