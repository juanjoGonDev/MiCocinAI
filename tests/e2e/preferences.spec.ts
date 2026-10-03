import { test, expect } from './fixtures';
import { registerAndGoto, registerUser } from './helpers/auth';

/**
 * Preferencias del comensal: perfil, alergias, gustos y objetivo. Seccion propia
 * con una pestaña por asunto —la configuración de la app (tema, idioma) no
 * tiene nada que ver aquí— y la pestaña activa viaja en la URL.
 */
test.describe('Preferencias', () => {
  test('vive fuera de la configuración de la app', async ({ page }) => {
    await registerUser(page, 'Pref Tester');

    // Configuracion: solo lo de la app (tema e idioma), sin ni un control del
    // comensal ni una tarjeta que lo recuerde
    await page.goto('/settings');
    await expect(page.locator('.settings-title')).toBeVisible();
    // Tema, idioma y modulos: los modulos son de la app, no del comensal
    await expect(page.locator('.settings-group')).toHaveCount(3);
    // La tarjeta de acceso rapido se fue: no queda ni su enlace
    await expect(page.locator('.settings-group__link')).toHaveCount(0);
    await expect(page.locator('app-chip-select')).toHaveCount(0);
    await expect(page.locator('.preferences__goal')).toHaveCount(0);

    // Se entra por la navegacion de siempre. Por href y no por texto: el label
    // pasa por el pipe de i18n (es/en) y en CI el idioma resuelto no siempre es
    // el castellano en el primer render.
    const entry = page.locator('.sidebar__item[href="/preferences"]');
    await expect(entry).toHaveCount(1, { timeout: 20000 });
    await expect(entry).toContainText(/Preferen/i);

    await page.goto('/preferences');
    await expect(page.locator('.preferences__title')).toContainText('Preferencias');
  });

  test('una pestaña por asunto, reflejada en la URL', async ({ page }) => {
    await registerAndGoto(page, '/preferences', 'prefs-tabs');

    // La primera pestana es la por defecto: URL limpia.
    await expect(page.locator('.tab--active')).toContainText('Perfil');
    await expect(page).not.toHaveURL(/tab=/);

    // Y la cuenta NO esta aqui: desde la ronda 13 es una pagina a parte (/account), a la que se
    // entra pulsando tu propia cara del menu. Mezclar «quien eres» con «que comes» hacia que las
    // dos se confundesen al buscarlas.
    await expect(page.locator('.tab', { hasText: 'Cuenta' })).toHaveCount(0);
    await expect(page.locator('[data-test="account-name"]')).toHaveCount(0);
    await expect(page.locator('[data-test="account-password-new"]')).toHaveCount(0);

    await page.locator('.tab', { hasText: 'Alergias' }).click();
    await expect(page).toHaveURL(/[?&]tab=allergies/);

    await page.locator('.tab', { hasText: 'Gustos' }).click();
    await expect(page).toHaveURL(/[?&]tab=tastes/);
    await expect(page.locator('.preferences__panel-title')).toContainText(
      '¿Qué te gusta y qué no?'
    );

    await page.locator('.tab', { hasText: 'Objetivo' }).click();
    await expect(page).toHaveURL(/[?&]tab=goal/);
    await expect(page.locator('.preferences__goal').first()).toBeVisible();

    // Sobrevive a la recarga y se puede enlazar directo
    await page.reload();
    await expect(page.locator('.tab--active')).toContainText('Objetivo');
    await page.goto('/preferences?tab=allergies');
    await expect(page.locator('.tab--active')).toContainText('Alergias');
    await expect(page.locator('app-chip-select')).toHaveCount(1);
  });

  test('el perfil del hogar se cambia aquí, se guarda y se conserva', async ({ page }) => {
    await registerAndGoto(page, '/preferences?tab=profile', 'prefs-profile');

    // Cuatro niveles, los mismos que en el tour...
    await expect(page.locator('[data-level]')).toHaveCount(4);
    // ...y ninguna seccion: los modulos son de la app y se activan en Configuracion
    await expect(page.locator('label[data-module]')).toHaveCount(0);
    await expect(page.locator('.preferences__inline-link')).toHaveCount(1);
    // Se entra con el nivel por defecto del registro
    await expect(page.locator('[data-level="beginner"]')).toHaveClass(/--on/);

    await page.locator('[data-level="expert"]').click();
    await expect(page.locator('.preferences__state')).toContainText('Hay cambios sin guardar');

    await page.getByRole('button', { name: 'Guardar preferencias' }).click();
    await expect(page.locator('.toast--success').filter({ hasText: 'Guardado' })).toBeVisible();

    // La pestana muestra el nivel con su nombre, no con el valor interno
    await expect(page.locator('.tab', { hasText: 'Perfil' })).toContainText('Experto');

    await page.reload();
    await expect(page.locator('[data-level="expert"]')).toHaveClass(/--on/);

    // Descartar tambien revierte el nivel, sin recargar
    await page.locator('[data-level="beginner"]').click();
    await expect(page.locator('[data-level="beginner"]')).toHaveClass(/--on/);
    await page.getByRole('button', { name: /Descartar/ }).click();
    await expect(page.locator('[data-level="expert"]')).toHaveClass(/--on/);

    // Cambiar el nivel aqui no toca los modulos de Configuracion
    await page.goto('/settings');
    await expect(page.locator('[data-module-switch="meals"]')).toHaveAttribute('aria-checked', 'true');
  });

  test('lo marcado en una pestaña no se pierde al cambiar y se guarda junto', async ({ page }) => {
    // Se entra por Alergias: la pestana por defecto ahora es Perfil
    await registerAndGoto(page, '/preferences?tab=allergies', 'prefs-save');

    await page.locator('.chip-select__chip', { hasText: 'Lactosa' }).click();
    await page.locator('.tab', { hasText: 'Gustos' }).click();
    await page
      .getByRole('group', { name: 'Lo que más te gusta' })
      .locator('.chip-select__chip', { hasText: 'Pollo' })
      .click();
    await page.locator('.tab', { hasText: 'Objetivo' }).click();
    await page.locator('.preferences__goal', { hasText: 'Variada' }).click();

    // Nada viaja al backend hasta guardar, pero el aviso de pendientes es global
    await expect(page.locator('.preferences__state')).toContainText('Hay cambios sin guardar');

    await page.getByRole('button', { name: 'Guardar preferencias' }).click();
    await expect(page.locator('.toast--success').filter({ hasText: 'Guardado' })).toBeVisible();
    await expect(page.locator('.preferences__state')).toContainText('Todo guardado');

    // Y está todo en su sitio al volver a entrar, en cada pestaña
    await page.goto('/preferences?tab=allergies');
    await expect(page.locator('.chip-select__chip--on', { hasText: 'Lactosa' })).toHaveCount(1);
    await page.locator('.tab', { hasText: 'Gustos' }).click();
    await expect(page.locator('.chip-select__chip--on', { hasText: 'Pollo' })).toHaveCount(1);
    await page.locator('.tab', { hasText: 'Objetivo' }).click();
    await expect(page.locator('.preferences__goal--on')).toContainText('Variada');
    await expect(page.locator('.tab', { hasText: 'Alergias' })).toContainText('1');
    await expect(page.locator('.tab', { hasText: 'Gustos' })).toContainText('1');
  });

  test('descartar cambios revierte sin recargar la página', async ({ page }) => {
    await registerAndGoto(page, '/preferences?tab=allergies', 'prefs-discard');

    await page.locator('.chip-select__chip', { hasText: 'Gluten' }).click();
    await expect(page.locator('.chip-select__chip--on')).toHaveCount(1);

    await page.getByRole('button', { name: 'Descartar cambios' }).click();
    await expect(page.locator('.chip-select__chip--on')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Descartar cambios' })).toHaveCount(0);
  });


  test('lo que falta en la cocina se sigue marcando en la despensa', async ({ page }) => {
    await registerAndGoto(page, '/preferences?tab=goal', 'prefs-kitchen');

    await expect(page.locator('.preferences__footnote')).toContainText(
      'Los utensilios se marcan en'
    );
    await page.getByRole('link', { name: 'la despensa' }).click();

    await expect(page).toHaveURL(/\/pantry\?tab=utensils/);
    await expect(page.locator('.utensils')).toBeVisible();
  });
});
