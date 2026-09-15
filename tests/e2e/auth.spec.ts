import { test, expect } from '@playwright/test';
import { registerUser, logout } from './helpers/auth';

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

  test('should stay on login with unknown credentials', async ({ page }) => {
    await page.fill('input#email', 'no-existe@example.com');
    await page.fill('input#password', 'WrongPassword1');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/.*auth\/login/);
    await expect(page).not.toHaveURL(/.*dashboard/);
  });

  test('should navigate to register page', async ({ page }) => {
    await page.getByRole('link', { name: /Regístrate/ }).click();

    await expect(page).toHaveURL(/.*auth\/register/);
    await expect(page.locator('h2')).toContainText('Crear Cuenta');
  });

  test('should navigate to forgot password page', async ({ page }) => {
    await page.getByRole('link', { name: /Olvidaste/ }).click();

    await expect(page).toHaveURL(/.*auth\/forgot-password/);
    await expect(page.locator('h2')).toContainText('Recuperar Contraseña');
  });

  test('should show register form with cooking level selection', async ({ page }) => {
    await page.goto('/auth/register');

    await expect(page.locator('input#name')).toBeVisible();
    await expect(page.locator('input#email')).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();

    const levels = page.locator('.register-form__option');
    await expect(levels).toHaveCount(3);
    await expect(levels.nth(0)).toContainText('Principiante');
    await expect(levels.nth(1)).toContainText('Intermedio');
    await expect(levels.nth(2)).toContainText('Experto');
  });

  test('should login with the credentials used at registration', async ({ page }) => {
    const email = await registerUser(page, 'Login Tester');
    await logout(page);

    await page.fill('input#email', email);
    await page.fill('input#password', 'Test1234');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/.*dashboard/);
  });
});
