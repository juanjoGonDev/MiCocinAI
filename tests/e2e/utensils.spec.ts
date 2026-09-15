import { test, expect } from '@playwright/test';
import { registerWithHousehold } from './helpers/auth';

test.describe('Pantry — utensils tab', () => {
  test.beforeEach(async ({ page }) => {
    // El catalogo de utensilios se siembra junto al hogar (y se backfillea
    // en los hogares que se crearon antes de que existiera el catalogo)
    await registerWithHousehold(page, '/pantry');
    await page.locator('.tab', { hasText: 'Utensilios' }).click();
    await expect(page.locator('.utensils')).toBeVisible();
  });

  test('shows the seeded catalogue grouped by category', async ({ page }) => {
    await expect(page.locator('.utensil-group').first()).toBeVisible();
    expect(await page.locator('.utensil-group').count()).toBeGreaterThan(3);
    // ~54 utensilios sembrados
    expect(await page.locator('.utensil-card').count()).toBeGreaterThanOrEqual(50);
  });

  test('no utensil is marked by default', async ({ page }) => {
    await expect(page.locator('.utensil-card--owned')).toHaveCount(0);
    await expect(page.locator('.tab', { hasText: 'Utensilios' })).toContainText('0');
  });

  test('marking a utensil persists across reloads', async ({ page }) => {
    const card = page.locator('.utensil-card').first();
    const name = (await card.locator('.utensil-card__name').textContent())!.trim();

    await card.locator('input.utensil-card__check').check();
    await expect(card).toHaveClass(/utensil-card--owned/);
    await expect(page.locator('.tab', { hasText: 'Utensilios' })).toContainText('1');

    await page.reload();
    await page.locator('.tab', { hasText: 'Utensilios' }).click();
    await expect(page.locator('.utensil-card', { hasText: name }).first()).toHaveClass(
      /utensil-card--owned/
    );
  });

  test('the header add button opens the utensils modal on this tab', async ({ page }) => {
    await page.getByRole('button', { name: '+ Agregar' }).click();

    await expect(page.locator('.modal__title')).toContainText('Agregar Utensilio');
    await expect(page.locator('input#utensilName')).toBeVisible();
    await expect(page.locator('select#utensilCategory')).toBeVisible();
  });

  test('adds and deletes a custom utensil from the modal', async ({ page }) => {
    // El borrado pide confirmacion con confirm()
    page.on('dialog', (dialog) => dialog.accept());

    await page.getByRole('button', { name: '+ Agregar' }).click();
    await page.fill('input#utensilName', 'Sous vide');
    await page.selectOption('select#utensilCategory', 'tools');
    await page.locator('.modal-overlay button[type="submit"]').click();

    await expect(page.locator('.toast--success .toast__title')).toContainText('Añadido');
    const custom = page.locator('.utensil-card', { hasText: 'Sous vide' });
    await expect(custom).toHaveCount(1);
    await expect(custom).toHaveClass(/utensil-card--owned/);

    await custom.locator('.utensil-card__delete').click();
    await expect(page.locator('.toast--success').filter({ hasText: 'Eliminado' })).toBeVisible();
    await expect(page.locator('.utensil-card', { hasText: 'Sous vide' })).toHaveCount(0);
  });

  test('does not allow duplicated utensil names', async ({ page }) => {
    await page.getByRole('button', { name: '+ Agregar' }).click();
    await page.fill('input#utensilName', 'Abrelatas');
    await page.locator('.modal-overlay button[type="submit"]').click();

    await expect(page.locator('.input__error')).toContainText('Ya existe');
    await expect(page.locator('.utensil-card', { hasText: 'Abrelatas' })).toHaveCount(1);
  });
});
