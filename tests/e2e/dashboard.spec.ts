import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login first (assuming test user exists)
    await page.goto('/auth/login');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'Password1');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);
  });

  test('should display welcome message', async ({ page }) => {
    await expect(page.locator('text=¡Hola')).toBeVisible();
  });

  test('should show quick stats', async ({ page }) => {
    await expect(page.locator('text=Ingredientes')).toBeVisible();
    await expect(page.locator('text=Recetas')).toBeVisible();
    await expect(page.locator('text=Miembros')).toBeVisible();
  });

  test('should show quick actions', async ({ page }) => {
    await expect(page.locator('text=Generar con IA')).toBeVisible();
    await expect(page.locator('text=Mi Despensa')).toBeVisible();
    await expect(page.locator('text=Planificar')).toBeVisible();
  });

  test('should show today meals section', async ({ page }) => {
    await expect(page.locator('text=Comidas de hoy')).toBeVisible();
  });

  test('should show suggested recipes section', async ({ page }) => {
    await expect(page.locator('text=Recetas sugeridas')).toBeVisible();
  });

  test('should show weekly progress', async ({ page }) => {
    await expect(page.locator('text=Progreso semanal')).toBeVisible();
    await expect(page.locator('text=Calorías')).toBeVisible();
  });

  test('should navigate to pantry from quick action', async ({ page }) => {
    await page.click('text=Mi Despensa');

    await expect(page).toHaveURL(/.*pantry/);
  });

  test('should navigate to recipes from quick action', async ({ page }) => {
    await page.click('text=Generar con IA');

    await expect(page).toHaveURL(/.*recipes/);
  });

  test('should navigate to calendar from quick action', async ({ page }) => {
    await page.click('text=Planificar');

    await expect(page).toHaveURL(/.*calendar/);
  });
});
