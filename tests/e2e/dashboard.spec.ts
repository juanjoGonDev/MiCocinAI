import { test, expect } from '@playwright/test';

test.describe('Dashboard (new user) — empty states', () => {
  test('shows empty-state messages when no recipes or meals exist', async ({ page }) => {
    const email = `dash-${Date.now()}@example.com`;
    await page.goto('/auth/register');
    await page.fill('input#name', 'Dash');
    await page.fill('input#email', email);
    await page.fill('input#password', 'Test1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    // Greeting should contain user name
    await expect(page.locator('h1')).toContainText('Dash');

    // Meals empty state
    await expect(page.locator('text=No hay comidas planificadas').or(page.locator('text=No meals planned'))).toBeVisible();

    // Recipes empty state
    await expect(page.locator('text=No hay recetas').or(page.locator('text=No recipes'))).toBeVisible();

    // Quick stats show zeroes for ingredients/recipes
    await expect(page.locator('.stat-card__value').first()).toBeVisible();
  });

  test('quick actions navigate to correct sections', async ({ page }) => {
    const email = `dash-actions-${Date.now()}@example.com`;
    await page.goto('/auth/register');
    await page.fill('input#name', 'QA');
    await page.fill('input#email', email);
    await page.fill('input#password', 'Test1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    await page.getByRole('link', { name: /Mi Despensa|My Pantry/ }).click();
    await expect(page).toHaveURL(/.*pantry/);

    await page.goBack();
    await page.getByRole('link', { name: /Planificar|Plan/ }).click();
    await expect(page).toHaveURL(/.*calendar/);
  });
});
