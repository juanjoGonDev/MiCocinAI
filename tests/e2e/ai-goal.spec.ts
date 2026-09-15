import { test, expect } from '@playwright/test';
import { registerAndGoto } from './helpers/auth';

test.describe('AI planner — custom goal', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndGoto(page, '/calendar');
    await expect(page.locator('h1.calendar__title')).toBeVisible();
  });

  test('choosing "Personalizada" reveals the free-text instructions textarea', async ({ page }) => {
    await page.getByRole('button', { name: /Planificar IA/ }).click();

    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.modal__title')).toContainText('Planificar con IA');

    const textarea = modal.locator('textarea.form-textarea');
    // Mientras el objetivo no es "custom" el textarea no se renderiza
    await expect(textarea).toHaveCount(0);

    const goalSelect = modal.locator('select.form-select').first();
    await expect(goalSelect.locator('option', { hasText: 'Personalizada' })).toHaveCount(1);
    await goalSelect.selectOption('custom');

    await expect(textarea).toBeVisible();
    await textarea.fill('Sin carne los lunes, sin gluten y cenas ligeras.');
    await expect(textarea).toHaveValue('Sin carne los lunes, sin gluten y cenas ligeras.');
  });

  test('custom instructions are sent as goals.customInstructions', async ({ page }) => {
    let payload: any = null;

    // Se intercepta la llamada a la IA para que el test no dependa de un
    // proveedor configurado: solo interesa lo que se envia.
    await page.route('**/api/ai/plan-week', async (route) => {
      payload = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { meals: [] } })
      });
    });

    await page.getByRole('button', { name: /Planificar IA/ }).click();
    const modal = page.locator('.modal-overlay');
    await modal.locator('select.form-select').first().selectOption('custom');
    await modal.locator('textarea.form-textarea').fill('Cenas sin carne los lunes');
    await modal.getByRole('button', { name: /Generar plan/ }).click();

    await expect(page.locator('.toast__title')).toContainText('Plan generado');
    expect(payload).not.toBeNull();
    expect(payload.goals.type).toBe('custom');
    expect(payload.goals.customInstructions).toBe('Cenas sin carne los lunes');
  });
});
