import { test, expect } from '@playwright/test';
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

  test('should close modal on cancel', async ({ page }) => {
    await page.getByRole('button', { name: /Agregar configuración/ }).first().click();
    await expect(page.locator('.modal__title')).toContainText('Nueva Configuración');

    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
  });
});
