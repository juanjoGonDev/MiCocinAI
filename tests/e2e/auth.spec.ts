import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should redirect to login when not authenticated', async ({ page }) => {
    await expect(page).toHaveURL(/.*auth\/login/);
  });

  test('should show login form', async ({ page }) => {
    await expect(page.locator('h2')).toContainText('Iniciar Sesión');
    await expect(page.locator('input#email')).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show validation errors for empty fields', async ({ page }) => {
    await page.click('button[type="submit"]');

    await expect(page.locator('.input__error')).toBeVisible();
  });

  test('should navigate to register page', async ({ page }) => {
    await page.click('text=Regístrate');

    await expect(page).toHaveURL(/.*auth\/register/);
    await expect(page.locator('h2')).toContainText('Crear Cuenta');
  });

  test('should navigate to forgot password page', async ({ page }) => {
    await page.click('text=¿Olvidaste tu contraseña?');

    await expect(page).toHaveURL(/.*auth\/forgot-password/);
    await expect(page.locator('h2')).toContainText('Recuperar Contraseña');
  });

  test('should show register form with cooking level selection', async ({ page }) => {
    await page.goto('/auth/register');

    await expect(page.locator('input#name')).toBeVisible();
    await expect(page.locator('input#email')).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();

    // Cooking level options
    await expect(page.locator('text=Principiante')).toBeVisible();
    await expect(page.locator('text=Intermedio')).toBeVisible();
    await expect(page.locator('text=Experto')).toBeVisible();
  });

  test('should login successfully', async ({ page }) => {
    // This test assumes a test user exists or mocks the API
    await page.fill('input#email', 'test@example.com');
    await page.fill('input#password', 'Password1');
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 10000 });
  });
});
