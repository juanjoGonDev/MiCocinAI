import { test, expect } from './fixtures';
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

    // Por id del campo, no por la clase de estilo: el diseno del modal cambia y
    // el contrato que interesa es el del formulario.
    const textarea = modal.locator('#gen-custom');
    // Mientras el objetivo no es "custom" el textarea no se renderiza
    await expect(textarea).toHaveCount(0);

    const goalSelect = modal.locator('#gen-goal');
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
        // `saved` es lo que el front enseña en el aviso: el plan se guarda en el
        // servidor, así que la respuesta simulada tiene que traer el recuento.
        body: JSON.stringify({ success: true, data: { days: [], saved: { created: 4, skipped: 1 } } })
      });
    });

    await page.getByRole('button', { name: /Planificar IA/ }).click();
    const modal = page.locator('.modal-overlay');
    await modal.locator('#gen-goal').selectOption('custom');
    await modal.locator('#gen-custom').fill('Cenas sin carne los lunes');
    await modal.getByRole('button', { name: /Generar plan/ }).click();

    await expect(page.locator('.toast__title')).toContainText('Plan guardado');
    // Un solo aviso, con el recuento de lo guardado y de lo respetado
    await expect(page.locator('.toast__message').first()).toContainText(
      /4 comidas añadidas · 1 hueco ya ocupado/
    );
    expect(payload).not.toBeNull();
    expect(payload.goals.type).toBe('custom');
    expect(payload.goals.customInstructions).toBe('Cenas sin carne los lunes');
  });
});
