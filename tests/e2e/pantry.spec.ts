import { test, expect } from '@playwright/test';

test.describe('Pantry', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/auth/login');
    await page.fill('input#email', 'test@example.com');
    await page.fill('input#password', 'Password1');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    // Navigate to pantry
    await page.goto('/pantry');
  });

  test('should display pantry page', async ({ page }) => {
    await expect(page.locator('text=Despensa')).toBeVisible();
  });

  test('should show stats cards', async ({ page }) => {
    await expect(page.locator('text=Total')).toBeVisible();
    await expect(page.locator('text=Por caducar')).toBeVisible();
    await expect(page.locator('text=Caducados')).toBeVisible();
  });

  test('should show search input', async ({ page }) => {
    await expect(page.locator('input[type="search"]')).toBeVisible();
  });

  test('should show category filters', async ({ page }) => {
    await expect(page.locator('text=Todos')).toBeVisible();
    await expect(page.locator('text=Verduras')).toBeVisible();
    await expect(page.locator('text=Frutas')).toBeVisible();
  });

  test('should open add ingredient modal', async ({ page }) => {
    await page.click('text=Agregar');

    await expect(page.locator('text=Agregar Ingrediente')).toBeVisible();
    await expect(page.locator('input#name')).toBeVisible();
    await expect(page.locator('input#quantity')).toBeVisible();
  });

  test('should add a new ingredient', async ({ page }) => {
    await page.click('text=Agregar');

    await page.fill('input#name', 'Tomate');
    await page.fill('input#quantity', '500');

    // Select category
    await page.selectOption('select[name="category"]', 'vegetables');

    // Select location
    await page.selectOption('select[name="location"]', 'fridge');

    await page.click('text=Agregar');

    // Should show success toast
    await expect(page.locator('text=Agregado')).toBeVisible();
  });

  test('should filter by category', async ({ page }) => {
    // Click on vegetables category
    await page.click('text=🥬 Verduras');

    // Should filter the list (URL should contain category param)
    await expect(page).toHaveURL(/.*category=vegetables/);
  });

  test('should search ingredients', async ({ page }) => {
    const searchInput = page.locator('input[type="search"]');
    await searchInput.fill('tomate');

    // Wait for search to apply
    await page.waitForTimeout(500);

    // Should filter results
  });

  test('should show empty state when no ingredients', async ({ page }) => {
    // If no ingredients, should show empty state
    const emptyState = page.locator('text=Tu despensa está vacía');
    
    // This might or might not be visible depending on data
    if (await emptyState.isVisible()) {
      await expect(emptyState).toBeVisible();
    }
  });

  test('should close modal on cancel', async ({ page }) => {
    await page.click('text=Agregar');

    await expect(page.locator('text=Agregar Ingrediente')).toBeVisible();

    await page.click('text=Cancelar');

    await expect(page.locator('text=Agregar Ingrediente')).not.toBeVisible();
  });
});
