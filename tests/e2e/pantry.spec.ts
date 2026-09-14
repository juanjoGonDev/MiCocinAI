import { test, expect } from '@playwright/test';
import { registerWithHousehold } from './helpers/auth';

test.describe('Pantry', () => {
  test.beforeEach(async ({ page }) => {
    // El seed de ingredientes se crea junto al hogar
    await registerWithHousehold(page, '/pantry');
    await expect(page.locator('h1.pantry__title')).toBeVisible();
  });

  test('should display pantry page', async ({ page }) => {
    await expect(page.locator('h1.pantry__title')).toContainText('Despensa');
  });

  test('should show stats cards', async ({ page }) => {
    await expect(page.locator('.stat-card__label')).toContainText([
      'En despensa',
      'Por caducar',
      'Caducados'
    ]);
  });

  test('should show search input', async ({ page }) => {
    await expect(page.locator('input[type="search"]')).toBeVisible();
  });

  test('should show category filters', async ({ page }) => {
    const tags = page.locator('app-tag');
    await expect(tags.nth(0)).toContainText('Todos');
    await expect(tags.nth(1)).toContainText('Verduras');
    await expect(tags.nth(2)).toContainText('Frutas');
  });

  test('should filter by category chip', async ({ page }) => {
    await page.locator('app-tag', { hasText: 'Verduras' }).click();
    await expect(page.locator('app-tag .tag--selected')).toContainText('Verduras');
  });

  test('should open add ingredient modal', async ({ page }) => {
    await page.getByRole('button', { name: '+ Agregar' }).click();

    await expect(page.locator('.modal__title')).toContainText('Agregar Ingrediente');
    await expect(page.locator('input#ingredientName')).toBeVisible();
    await expect(page.locator('input#quantity')).toBeVisible();
  });

  test('should add a new ingredient', async ({ page }) => {
    await page.getByRole('button', { name: '+ Agregar' }).click();

    await page.fill('input#ingredientName', 'Tomate');
    await page.fill('input#quantity', '500');
    await page.selectOption('select[name="category"]', 'vegetables');
    await page.selectOption('select[name="location"]', 'fridge');

    await page.locator('app-modal button[type="submit"]').click();

    await expect(page.locator('.toast--success .toast__title')).toContainText('Agregado');
    await expect(page.locator('.ingredient-item', { hasText: 'Tomate' })).toHaveCount(1);
  });

  test('should close modal on cancel', async ({ page }) => {
    await page.getByRole('button', { name: '+ Agregar' }).click();
    await expect(page.locator('.modal__title')).toContainText('Agregar Ingrediente');

    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
  });

  // --- Seed de ingredientes comunes (sugerencias) -------------------------

  test('should show the common ingredients seeded with the household', async ({ page }) => {
    const suggestions = page.locator('.suggestions .chip');
    await expect(page.locator('.suggestions__title')).toContainText('Sugerencias comunes');
    await expect(suggestions.first()).toBeVisible();
    // ~68 ingredientes sembrados con cantidad 0
    expect(await suggestions.count()).toBeGreaterThan(40);
  });

  test('suggestions do not count as pantry stock', async ({ page }) => {
    // "En despensa" solo cuenta items con quantity > 0
    await expect(page.locator('.stat-card--total .stat-card__value')).toHaveText('0');
  });

  test('clicking a suggestion opens the modal prefilled', async ({ page }) => {
    const chip = page.locator('.suggestions .chip').first();
    const chipName = (await chip.locator('.chip__name').textContent())!.trim();

    await chip.click();

    await expect(page.locator('.modal__title')).toContainText('Agregar Ingrediente');
    await expect(page.locator('input#ingredientName')).toHaveValue(chipName);
  });
});
