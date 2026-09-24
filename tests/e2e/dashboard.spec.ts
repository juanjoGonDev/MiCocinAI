import { test, expect } from './fixtures';
import { registerUser, registerWithHousehold } from './helpers/auth';

test.describe('Dashboard (new user) — empty states', () => {
  test('shows greeting, empty states and quick stats', async ({ page }) => {
    await registerUser(page, 'Dash');
    await page.goto('/dashboard');

    // Greeting should contain user name
    await expect(page.locator('h1.dashboard__title')).toContainText('Dash');

    // No meals / no suggested recipes for a brand new user
    await expect(page.locator('.empty-state__text').first()).toBeVisible();

    // Quick stats are rendered
    await expect(page.locator('.stat-card__value').first()).toBeVisible();
    await expect(page.locator('.stat-card__label').first()).toBeVisible();
  });

  test('las stats reflejan la despensa real, no el catálogo sembrado', async ({ page }) => {
    // El hogar se siembra con ~68 ingredientes de sugerencia con cantidad 0.
    // "Ingredientes" debe contar solo los que tienen cantidad > 0.
    await registerWithHousehold(page, '/dashboard');

    // Los textos van traducidos (el idioma se detecta del navegador)
    const ingredients = page.locator('.stat-card').filter({ hasText: /Ingredientes|Ingredients/i });
    await expect(ingredients).toHaveCount(1);
    await expect(ingredients.locator('.stat-card__value')).toHaveText('0');

    // Y los miembros salen del hogar (el usuario que lo crea es el primero)
    const members = page.locator('.stat-card').filter({ hasText: /Miembros|Members/i });
    await expect(members).toHaveCount(1);
    await expect(members.locator('.stat-card__value')).toHaveText('1');

    // Con un ingrediente real la tarjeta deja de estar a cero: no es un valor
    // calculado una vez, se vuelve a leer al volver de la despensa.
    await page.goto('/pantry');
    await page.getByRole('button', { name: '+ Agregar' }).click();
    await page.fill('input#ingredientName', 'Tomate');
    await page.fill('input#quantity', '500');
    // Categoria y ubicacion son app-picker desde la ## 12x —el select nativo que estas lineas clicaban
    // murio alli y el spec, en el shard 2 cancelado, nunca se entero (## 12af).
    for (const [testDelPicker, opcion] of [
      ['pantry-picker-categoria', 'Verduras'],
      ['pantry-picker-ubicacion', 'Nevera']
    ] as const) {
      const caja = page.locator(`[data-test="${testDelPicker}"]`);
      await caja.locator('.picker__trigger').click();
      await caja.locator('.picker__option').filter({ hasText: opcion }).first().click();
    }
    await page.locator('app-modal button[type="submit"]').click();
    await expect(page.locator('.ingredient-item', { hasText: 'Tomate' })).toHaveCount(1);

    await page.goto('/dashboard');
    await expect(ingredients.locator('.stat-card__value')).toHaveText('1');
  });

  test('quick actions navigate to correct sections', async ({ page }) => {
    await registerUser(page, 'QA');
    await page.goto('/dashboard');

    await page.locator('a.action-card[href="/pantry"]').click();
    await expect(page).toHaveURL(/.*pantry/);

    await page.goto('/dashboard');
    await page.locator('a.action-card[href="/calendar"]').click();
    await expect(page).toHaveURL(/.*calendar/);
  });
});
