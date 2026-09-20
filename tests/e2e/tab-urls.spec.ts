import { test, expect } from './fixtures';
import { registerAndGoto, registerWithHousehold } from './helpers/auth';

/**
 * Convencion de la aplicacion: toda pestaña que muestra contenido distinto
 * queda reflejada en la URL, de modo que la vista sea enlazable, sobreviva
 * a recargas y se pueda compartir.
 */
test.describe('Pestañas y URL', () => {
  test('la pestaña de la despensa viaja en la URL y sobrevive a la recarga', async ({ page }) => {
    await registerWithHousehold(page, '/pantry');
    await expect(page.locator('h1.pantry__title')).toBeVisible();

    // La pestaña por defecto no ensucia la URL
    await expect(page).not.toHaveURL(/[?&]tab=/);

    await page.locator('.tab', { hasText: 'Utensilios' }).click();
    await expect(page.locator('.utensils')).toBeVisible();
    await expect(page).toHaveURL(/[?&]tab=utensils/);

    await page.reload();
    await expect(page.locator('.utensils')).toBeVisible();
    await expect(page.locator('.tab--active')).toContainText('Utensilios');

    // Volver a la pestaña por defecto limpia el parametro
    await page.locator('.tab', { hasText: 'Ingredientes' }).click();
    await expect(page.locator('.suggestions__title')).toBeVisible();
    await expect(page).not.toHaveURL(/[?&]tab=/);
  });

  test('se puede entrar directamente en la pestaña de utensilios', async ({ page }) => {
    await registerWithHousehold(page, '/pantry?tab=utensils');

    await expect(page.locator('.utensils')).toBeVisible();
    await expect(page.locator('.tab--active')).toContainText('Utensilios');
  });

  test('un valor de pestaña desconocido se descarta', async ({ page }) => {
    await registerWithHousehold(page, '/pantry?tab=batidora');

    await expect(page.locator('.tab--active')).toContainText('Ingredientes');
    await expect(page).not.toHaveURL(/[?&]tab=/);
  });

  test('las pestañas de Preferencias también viajan en la URL', async ({ page }) => {
    await registerAndGoto(page, '/preferences', 'urls-prefs');

    await expect(page.locator('.tab--active')).toContainText('Perfil');
    await expect(page).not.toHaveURL(/tab=/);

    await page.locator('.tab', { hasText: 'Alergias' }).click();
    await expect(page).toHaveURL(/tab=allergies/);

    await page.locator('.tab', { hasText: 'Objetivo' }).click();
    await expect(page).toHaveURL(/[?&]tab=goal/);

    await page.goto('/preferences?tab=tastes');
    await expect(page.locator('.tab--active')).toContainText('Gustos');
  });

  test('las sub-secciones de la cuenta también viajan en la URL', async ({ page }) => {
    await registerAndGoto(page, '/account', 'urls-account');

    await expect(page.locator('.tab--active')).toContainText('Cuenta');
    await expect(page).not.toHaveURL(/tab=/);

    await page.locator('.tab', { hasText: 'Seguridad' }).click();
    await expect(page).toHaveURL(/[?&]tab=security/);

    // Un valor que no existe no se inventa: cae en la primera, y la URL se limpia.
    await page.goto('/account?tab=loquesea');
    await expect(page.locator('.tab--active')).toContainText('Cuenta');
  });

  test('la sección del catálogo de utensilios también viaja en la URL', async ({ page }) => {
    await registerWithHousehold(page, '/pantry?tab=utensils');
    await expect(page.locator('.utensil-group__title').first()).toContainText('Horno');

    // La primera sección es la por defecto: no ensucia la URL
    await expect(page).not.toHaveURL(/[?&]section=/);

    await page.getByRole('button', { name: /Siguiente:/ }).click();
    await expect(page).toHaveURL(/[?&]section=cookware/);

    await page.reload();
    await expect(page.locator('.utensil-group__title').first()).toContainText('Ollas / Sartenes');

    // Y se puede enlazar directamente a una sección
    await page.goto('/pantry?tab=utensils&section=tools');
    await expect(page.locator('.utensil-group__title').first()).toContainText('Herramientas');

    // Fuera de la pestaña de utensilios el parametro no tiene sentido
    await page.locator('.tab', { hasText: 'Ingredientes' }).click();
    await expect(page).not.toHaveURL(/section=/);
  });

  test('las pestañas del modal de comida también cambian la URL', async ({ page }) => {
    await registerWithHousehold(page, '/calendar');
    await expect(page.locator('h1.calendar__title')).toBeVisible();

    await page.locator('.meal-slot').first().click();
    await expect(page.locator('.modal__title')).toContainText('Agregar Comida');

    await page.locator('.meal-form__tabs button', { hasText: 'Receta' }).click();
    await expect(page.locator('.modal-overlay')).toContainText('Selecciona una receta');
    await expect(page).toHaveURL(/[?&]mealTab=recipe/);

    // Al cerrar el modal la pestaña deja de tener sentido en la URL
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
    await expect(page).not.toHaveURL(/mealTab=/);
  });
});
