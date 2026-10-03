import { test, expect } from './fixtures';
import { registerAndGoto } from './helpers/auth';

test.describe('Recipes', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndGoto(page, '/recipes');
    await expect(page.locator('h1.recipes__title')).toBeVisible();
  });

  test('should display recipes page', async ({ page }) => {
    await expect(page.locator('h1.recipes__title')).toContainText('Recetas');
  });

  test('should show filter options', async ({ page }) => {
    const filters = page.locator('app-tag');
    await expect(filters.nth(0)).toContainText('Todas');
    await expect(filters.nth(1)).toContainText('Favoritas');
    await expect(filters.nth(2)).toContainText('Rápidas');
    await expect(filters.nth(3)).toContainText('IA');
  });

  test('should filter by favorites', async ({ page }) => {
    await page.locator('app-tag', { hasText: 'Favoritas' }).click();
    await expect(page.locator('app-tag .tag--selected')).toContainText('Favoritas');
  });

  test('should show empty state when no recipes', async ({ page }) => {
    await expect(page.locator('.empty-state__title')).toContainText('No hay recetas');
    await expect(page.getByRole('button', { name: /Generar con IA/ })).toBeVisible();
  });

  test('should open AI generation modal', async ({ page }) => {
    await page.getByRole('button', { name: /Generar IA/ }).click();
    await expect(page.locator('.modal__title')).toContainText('Generar Receta con IA');
  });

  test('should show AI generation form', async ({ page }) => {
    await page.getByRole('button', { name: /Generar IA/ }).click();

    await expect(page.locator('.ai-form__label')).toContainText([
      'Ingredientes seleccionados',
      'Tu despensa',
      'Dificultad',
      'Porciones',
      'Detalle'
    ]);
  });

  test('should show generate buttons', async ({ page }) => {
    await page.getByRole('button', { name: /Generar IA/ }).click();

    await expect(page.getByRole('button', { name: /Generar 1 receta/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Generar 3 opciones/ })).toBeVisible();
  });

  test('should close AI modal', async ({ page }) => {
    await page.getByRole('button', { name: /Generar IA/ }).click();
    await expect(page.locator('.modal__title')).toContainText('Generar Receta con IA');

    await page.locator('.modal__close').click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
  });
});
