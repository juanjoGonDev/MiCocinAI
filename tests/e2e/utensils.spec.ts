import { test, expect } from './fixtures';
import { createHousehold, registerAndGoto, registerWithHousehold } from './helpers/auth';

/**
 * Catálogo de utensilios: se siembra solo (no hay que añadir 54 filas a mano)
 * y se recorre por secciones, porque como lista única no se acaba nunca.
 */
test.describe('Pantry — utensils tab', () => {
  test.beforeEach(async ({ page }) => {
    // El catalogo de utensilios se siembra junto al hogar (y se backfillea
    // en los hogares que se crearon antes de que existiera el catalogo)
    await registerWithHousehold(page, '/pantry');
    await page.locator('.tab', { hasText: 'Utensilios' }).click();
    await expect(page.locator('.utensils')).toBeVisible();
  });

  test('muestra una sección cada vez, no una lista de 54 filas', async ({ page }) => {
    // Una sola sección visible, con su cabecera y su contador
    await expect(page.locator('.utensil-group')).toHaveCount(1);
    await expect(page.locator('.utensil-group__title').first()).toContainText('Horno');

    const cards = await page.locator('.utensil-card').count();
    expect(cards).toBeGreaterThan(0);
    expect(cards).toBeLessThanOrEqual(12);

    // Navegador de secciones: una chapita por categoría, con lo marcado de cada
    // una (los ~54 utensilios siguen todos accesibles)
    const sections = page.locator('.utensils-section');
    expect(await sections.count()).toBeGreaterThan(3);
    await expect(sections.first()).toContainText('Horno');
    await expect(page.locator('.utensils-bar__step')).toContainText('Sección 1 de');
  });

  test('las secciones se recorren con Siguiente/Anterior', async ({ page }) => {
    await expect(page.getByRole('button', { name: '← Anterior' })).toBeDisabled();

    await page.getByRole('button', { name: /Siguiente:/ }).click();
    await expect(page.locator('.utensil-group__title').first()).toContainText('Ollas / Sartenes');
    await expect(page.locator('.utensils-bar__step')).toContainText('Sección 2 de');

    await page.getByRole('button', { name: /Anterior/ }).click();
    await expect(page.locator('.utensil-group__title').first()).toContainText('Horno');
  });

  test('un chip lleva a la sección de su categoría', async ({ page }) => {
    await page.locator('.utensils-section', { hasText: 'Herramientas' }).click();

    await expect(page.locator('.utensil-group__title').first()).toContainText('Herramientas');
    // Las 34 herramientas no caben en una sección: se parte en tramos de 12
    expect(await page.locator('.utensil-card').count()).toBeLessThanOrEqual(12);

    // Desde la última sección el botón deja de ser "siguiente" y muestra todo
    await page.getByRole('button', { name: 'Ver todo de golpe' }).click();
    expect(await page.locator('.utensil-group').count()).toBeGreaterThan(3);
    expect(await page.locator('.utensil-card').count()).toBeGreaterThanOrEqual(50);
  });

  test('shows the seeded catalogue grouped by category', async ({ page }) => {
    await page.getByRole('button', { name: 'Ver todo de golpe' }).click();

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

  test('marking a utensil updates the card in place (no scroll jump)', async ({ page }) => {
    // Con una sola sección la página no llega a scrollear: se ve todo de golpe
    await page.getByRole('button', { name: 'Ver todo de golpe' }).click();

    const cards = page.locator('.utensil-card');
    await expect(cards.first()).toBeVisible();

    const last = cards.nth((await cards.count()) - 1);
    const check = last.locator('input.utensil-card__check');
    await last.scrollIntoViewIfNeeded();

    // Se marca el nodo del DOM para detectar si Angular lo reemplaza entero
    await check.evaluate((el) => el.setAttribute('data-e2e-node', 'original'));
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(0);

    await check.click();
    await expect(last).toHaveClass(/utensil-card--owned/);

    // trackBy: mismo nodo, mismo foco y la página no se mueve
    await expect(page.locator('input[data-e2e-node="original"]')).toHaveCount(1);
    await expect(check).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  });

  test('the header add button opens the utensils modal on this tab', async ({ page }) => {
    await page.getByRole('button', { name: '+ Agregar' }).click();

    await expect(page.locator('.modal__title')).toContainText('Agregar Utensilio');
    await expect(page.locator('input#utensilName')).toBeVisible();
    await expect(page.locator('select#utensilCategory')).toBeVisible();
  });

  test('adds and deletes a custom utensil from the modal', async ({ page }) => {
    // El borrado se confirma con el dialogo propio de la app (nunca con
    // confirm() del navegador: ver tests/e2e/confirm-dialog.spec.ts)
    await page.getByRole('button', { name: '+ Agregar' }).click();
    await page.fill('input#utensilName', 'Sous vide');
    await page.selectOption('select#utensilCategory', 'tools');
    await page.locator('.modal-overlay button[type="submit"]').click();

    await expect(page.locator('.toast--success .toast__title')).toContainText('Añadido');

    // El alta abre la sección donde ha caído el utensilio: si no, parece que no
    // se ha añadido nada (está en otra sección del catálogo)
    const custom = page.locator('.utensil-card', { hasText: 'Sous vide' });
    await expect(custom).toHaveCount(1);
    await expect(custom).toHaveClass(/utensil-card--owned/);

    await custom.locator('.utensil-card__delete').click();

    // El dialogo propio se abre con el texto de la accion y sus dos botones
    const confirmDialog = page.locator('.modal-overlay');
    await expect(confirmDialog).toContainText('Eliminar utensilio');
    await expect(confirmDialog.locator('.modal__title')).toHaveText('Eliminar utensilio');
    await expect(confirmDialog.locator('.confirm__message')).toContainText(
      'Quitar Sous vide del catálogo'
    );

    await confirmDialog.getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.locator('.toast--success').filter({ hasText: 'Eliminado' })).toBeVisible();
    await expect(page.locator('.utensil-card', { hasText: 'Sous vide' })).toHaveCount(0);
  });

  test('does not allow duplicated utensil names', async ({ page }) => {
    // 'Abrelatas' viene del catálogo: se busca con todo el catálogo a la vista
    await page.getByRole('button', { name: 'Ver todo de golpe' }).click();
    await page.getByRole('button', { name: '+ Agregar' }).click();
    await page.fill('input#utensilName', 'Abrelatas');
    await page.locator('.modal-overlay button[type="submit"]').click();

    await expect(page.locator('.input__error')).toContainText('Ya existe');
    await expect(page.locator('.utensil-card', { hasText: 'Abrelatas' })).toHaveCount(1);
  });
});

/**
 * Quien se registra y no crea un hogar se encontraba las dos pestañas de la
 * despensa vacías: el catálogo solo vivía dentro de un hogar.
 */
test.describe('Pantry — utensilios sin hogar', () => {
  test('el catálogo está desde el registro y se puede marcar', async ({ page }) => {
    await registerAndGoto(page, '/pantry?tab=utensils');
    await expect(page.locator('.utensils')).toBeVisible();

    await page.getByRole('button', { name: 'Ver todo de golpe' }).click();
    expect(await page.locator('.utensil-card').count()).toBeGreaterThanOrEqual(50);

    await page.locator('.utensil-card').first().locator('input.utensil-card__check').check();
    await expect(page.locator('.tab', { hasText: 'Utensilios' })).toContainText('1');
  });

  test('crear un hogar se lleva el catálogo personal sin duplicarlo', async ({ page }) => {
    await registerAndGoto(page, '/pantry?tab=utensils');
    await page.getByRole('button', { name: 'Ver todo de golpe' }).click();

    const cards = page.locator('.utensil-card');
    const total = await cards.count();
    const markedName = (await cards.first().locator('.utensil-card__name').textContent())!.trim();
    await cards.first().locator('input.utensil-card__check').check();

    await createHousehold(page);
    await page.goto('/pantry?tab=utensils');
    await expect(page.locator('.utensils')).toBeVisible();
    await page.getByRole('button', { name: 'Ver todo de golpe' }).click();

    // Mismo número de filas (no 2x) y la marca sigue marcada
    await expect(cards).toHaveCount(total);
    await expect(page.locator('.utensil-card', { hasText: markedName })).toHaveClass(
      /utensil-card--owned/
    );
    await expect(page.locator('.tab', { hasText: 'Utensilios' })).toContainText('1');
  });
});
