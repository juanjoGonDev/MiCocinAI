import { test, expect } from '@playwright/test';
import { registerWithHousehold } from './helpers/auth';

test.describe('Pantry — utensils tab', () => {
  test.beforeEach(async ({ page }) => {
    // El catalogo de utensilios se siembra junto al hogar
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

  test('adds and deletes a custom utensil', async ({ page }) => {
    // El borrado pide confirmacion con confirm()
    page.on('dialog', (dialog) => dialog.accept());

    await page.fill('input[name="utensilName"]', 'Sous vide');
    await page.locator('.utensils-add__form button[type="submit"]').click();

    await expect(page.locator('.toast--success .toast__title')).toContainText('Añadido');
    const custom = page.locator('.utensil-card', { hasText: 'Sous vide' });
    await expect(custom).toHaveCount(1);
    await expect(custom).toHaveClass(/utensil-card--owned/);

    await custom.locator('.utensil-card__delete').click();
    await expect(page.locator('.toast--success').filter({ hasText: 'Eliminado' })).toBeVisible();
    await expect(page.locator('.utensil-card', { hasText: 'Sous vide' })).toHaveCount(0);
  });
});
