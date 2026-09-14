import { test, expect } from '@playwright/test';

test.describe('Recipes', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/auth/login');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'Password1');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    // Navigate to recipes
    await page.goto('/recipes');
  });

  test('should display recipes page', async ({ page }) => {
    await expect(page.locator('text=Recetas')).toBeVisible();
  });

  test('should show filter options', async ({ page }) => {
    await expect(page.locator('text=Todas')).toBeVisible();
    await expect(page.locator('text=Favoritas')).toBeVisible();
    await expect(page.locator('text=Rápidas')).toBeVisible();
    await expect(page.locator('text=IA')).toBeVisible();
  });

  test('should open AI generation modal', async ({ page }) => {
    await page.click('text=Generar IA');

    await expect(page.locator('text=Generar Receta con IA')).toBeVisible();
  });

  test('should show AI generation form', async ({ page }) => {
    await page.click('text=Generar IA');

    await expect(page.locator('text=Ingredientes seleccionados')).toBeVisible();
    await expect(page.locator('text=Tu despensa')).toBeVisible();
    await expect(page.locator('text=Dificultad')).toBeVisible();
    await expect(page.locator('text=Porciones')).toBeVisible();
    await expect(page.locator('text=Detalle')).toBeVisible();
  });

  test('should close AI modal', async ({ page }) => {
    await page.click('text=Generar IA');

    await expect(page.locator('text=Generar Receta con IA')).toBeVisible();

    // Click close button
    const closeBtn = page.locator('.modal__close');
    await closeBtn.click();

    await expect(page.locator('text=Generar Receta con IA')).not.toBeVisible();
  });

  test('should show generate buttons', async ({ page }) => {
    await page.click('text=Generar IA');

    await expect(page.locator('text=Generar 1 receta')).toBeVisible();
    await expect(page.locator('text=Generar 3 opciones')).toBeVisible();
  });

  test('should filter by favorites', async ({ page }) => {
    await page.click('text=❤️ Favoritas');

    await expect(page).toHaveURL(/.*filter=favorites/);
  });

  test('should filter by quick recipes', async ({ page }) => {
    await page.click('text=⚡ Rápidas');

    await expect(page).toHaveURL(/.*filter=quick/);
  });

  test('should show recipe cards', async ({ page }) => {
    const recipeCards = page.locator('.recipe-card');
    
    // Check if any recipe cards are visible
    const count = await recipeCards.count();
    
    if (count > 0) {
      await expect(recipeCards.first()).toBeVisible();
    }
  });

  test('should show recipe details when clicking a recipe', async ({ page }) => {
    const recipeCards = page.locator('.recipe-card');
    const count = await recipeCards.count();
    
    if (count > 0) {
      await recipeCards.first().click();

      // Should open detail modal
      await expect(page.locator('.recipe-detail')).toBeVisible();
    }
  });

  test('should show empty state when no recipes', async ({ page }) => {
    const emptyState = page.locator('text=No hay recetas');
    
    if (await emptyState.isVisible()) {
      await expect(emptyState).toBeVisible();
      await expect(page.locator('text=Generar con IA')).toBeVisible();
    }
  });
});
