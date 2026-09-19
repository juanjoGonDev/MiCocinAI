import { test, expect } from './fixtures';
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

  test('should show the register form without the profile questions', async ({ page }) => {
    await page.goto('/auth/register');

    await expect(page.locator('input#name')).toBeVisible();
    await expect(page.locator('input#email')).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();

    // El nivel de cocina se fue del alta: es perfil, se responde en el tour y se
    // edita en Preferencias > Perfil. Aqui solo se crea la cuenta.
    await expect(page.locator('.register-form__option')).toHaveCount(0);
    await expect(page.locator('.register-form__note')).toContainText('cinco cosas cortas');
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
