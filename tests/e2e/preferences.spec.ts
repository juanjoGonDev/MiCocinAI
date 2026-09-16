import { test, expect } from './fixtures';
import { registerAndGoto, registerUser } from './helpers/auth';

/**
 * Preferencias del comensal: alergias, gustos y objetivo. Seccion propia con
 * una pestaña por asunto —la configuración de la app (tema, idioma) no tiene
 * nada que ver aquí— y la pestaña activa viaja en la URL.
 */
test.describe('Preferencias', () => {
  test('vive fuera de la configuración de la app', async ({ page }) => {
    await registerUser(page, 'Pref Tester');

    // Ajustes ya no mezcla: solo habla de la app y enlaza a lo del comensal
    await page.goto('/settings');
    await expect(page.locator('.settings-title')).toBeVisible();
    await expect(page.locator('app-chip-select')).toHaveCount(0);
    await expect(page.locator('.preferences__goal')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Ver preferencias' })).toBeVisible();

    await page.getByRole('link', { name: 'Ver preferencias' }).click();
    await expect(page).toHaveURL(/\/preferences/);
    await expect(page.locator('.preferences__title')).toContainText('Preferencias');
  });

  test('una pestaña por asunto, reflejada en la URL', async ({ page }) => {
    await registerAndGoto(page, '/preferences', 'prefs-tabs');

    // La primera pestaña es la por defecto: URL limpia
    await expect(page.locator('.tab--active')).toContainText('Alergias');
    await expect(page).not.toHaveURL(/tab=/);

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

  test('lo marcado en una pestaña no se pierde al cambiar y se guarda junto', async ({ page }) => {
    await registerAndGoto(page, '/preferences', 'prefs-save');

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
    await registerAndGoto(page, '/preferences', 'prefs-discard');

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
