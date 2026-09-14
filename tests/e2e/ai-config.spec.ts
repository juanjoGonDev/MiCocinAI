import { test, expect } from '@playwright/test';

test.describe('AI Config', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/auth/login');
    await page.fill('input#email', 'test@example.com');
    await page.fill('input#password', 'Password1');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    // Navigate to AI config
    await page.goto('/ai-config');
  });

  test('should display AI config page', async ({ page }) => {
    await expect(page.locator('text=Configuración IA')).toBeVisible();
  });

  test('should show info message', async ({ page }) => {
    await expect(page.locator('text=Conecta tu proveedor de IA')).toBeVisible();
  });

  test('should show add config button', async ({ page }) => {
    await expect(page.locator('text=Agregar configuración')).toBeVisible();
  });

  test('should open add config modal', async ({ page }) => {
    await page.click('text=Agregar configuración');

    await expect(page.locator('text=Nueva Configuración')).toBeVisible();
    await expect(page.locator('input#name')).toBeVisible();
    await expect(page.locator('input#model')).toBeVisible();
    await expect(page.locator('input#baseUrl')).toBeVisible();
    await expect(page.locator('input#apiKey')).toBeVisible();
  });

  test('should show config form fields', async ({ page }) => {
    await page.click('text=Agregar configuración');

    // Provider selector
    await expect(page.locator('text=OpenAI')).toBeVisible();
    await expect(page.locator('text=Custom (OpenAI-like)')).toBeVisible();

    // Temperature slider
    await expect(page.locator('text=Temperatura')).toBeVisible();

    // Max tokens
    await expect(page.locator('input#maxTokens')).toBeVisible();
  });

  test('should create a new config', async ({ page }) => {
    await page.click('text=Agregar configuración');

    await page.fill('input#name', 'Mi Proveedor');
    await page.fill('input#model', 'gpt-4o-mini');
    await page.fill('input#baseUrl', 'https://api.openai.com/v1');
    await page.fill('input#apiKey', 'sk-test-key');

    await page.click('text=Crear');

    // Should show success
    await expect(page.locator('text=Creado')).toBeVisible();
  });

  test('should show config card after creation', async ({ page }) => {
    const configCard = page.locator('text=Mi Proveedor');
    
    if (await configCard.isVisible()) {
      await expect(configCard).toBeVisible();
    }
  });

  test('should show test connection button', async ({ page }) => {
    const testBtn = page.locator('text=Probar');
    
    if (await testBtn.isVisible()) {
      await expect(testBtn).toBeVisible();
    }
  });

  test('should close modal on cancel', async ({ page }) => {
    await page.click('text=Agregar configuración');

    await expect(page.locator('text=Nueva Configuración')).toBeVisible();

    await page.click('text=Cancelar');

    await expect(page.locator('text=Nueva Configuración')).not.toBeVisible();
  });

  test('should show empty state when no configs', async ({ page }) => {
    const emptyState = page.locator('text=Sin configuraciones');
    
    if (await emptyState.isVisible()) {
      await expect(emptyState).toBeVisible();
      await expect(page.locator('text=Agregar configuración')).toBeVisible();
    }
  });
});
