import { test, expect } from './fixtures';
import { createHousehold, registerAndGoto, registerWithHousehold } from './helpers/auth';

/**
 * Catálogo de utensilios: se siembra solo (no hay que añadir 54 filas a mano)
 * y se recorre por secciones, porque como lista única no se acaba nunca.
 *
 * Ojo al localizar tarjetas: hay nombres que se solapan, así que lo que se
 * marca se comprueba por posición y no por texto.
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
    // Una sección arrastra varias categorías pequeñas, pero nunca más de 12 filas
    const rows = await page.locator('.utensil-card').count();
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThanOrEqual(12);
    expect(await page.locator('.utensil-group').count()).toBeLessThan(10);
    await expect(page.locator('.utensil-group__title').first()).toContainText('Horno');

    // Una chapita por categoría, con lo marcado de cada una
    await expect(page.locator('.utensils-section')).toHaveCount(10);
    await expect(page.locator('.utensils-section').first()).toContainText('Horno');
    await expect(page.locator('.utensils-bar__step')).toContainText('Sección 1 de');
    await expect(page.locator('.utensils-bar__label')).toContainText('0 de 54 marcados');

    // Recorrer todas las secciones (las etiquetas cambian: se va al último botón)
    const sectionCount = Number(
      /de (\d+)/.exec((await page.locator('.utensils-bar__step').textContent())!)![1]
    );
    const nav = page.locator('.utensils-nav button');
    await expect(nav.first()).toBeDisabled();
    const perSection = [rows];
    for (let i = 1; i < sectionCount; i++) {
      await nav.last().click();
      const visible = await page.locator('.utensil-card').count();
      expect(visible).toBeLessThanOrEqual(12);
      perSection.push(visible);
    }
    const total = perSection.reduce((sum, n) => sum + n, 0);
    expect(total).toBeGreaterThanOrEqual(54);
    await expect(page).toHaveURL(/section=/);
    await expect(nav.last()).toContainText('Ver todo el catálogo');

    // Ver todas de golpe deja de paginar y limpia la sección de la URL
    await page.locator('.utensils-bar__mode').click();
    await expect(page.locator('.utensil-card')).toHaveCount(total);
    await expect(page.locator('.utensil-group')).toHaveCount(10);
    await expect(page.locator('.utensils-nav')).toBeHidden();
    await expect(page).not.toHaveURL(/section=/);
  });

  test('las secciones se recorren con Siguiente/Anterior', async ({ page }) => {
    // Las etiquetas de los botones cambian (dicen a dónde van), así que se
    // localizan por posición dentro del navegador de secciones
    const nav = page.locator('.utensils-nav button');
    await expect(nav.first()).toBeDisabled();
    await expect(nav.last()).toContainText('Siguiente: Ollas / Sartenes');

    await nav.last().click();
    await expect(page.locator('.utensil-group__title').first()).toContainText('Ollas / Sartenes');
    await expect(page.locator('.utensils-bar__step')).toContainText('Sección 2 de');

    await expect(nav.first()).toContainText('← Horno');
    await nav.first().click();
    await expect(page.locator('.utensil-group__title').first()).toContainText('Horno');
    await expect(page.locator('.utensils-bar__step')).toContainText('Sección 1 de');
  });

  test('un chip lleva a la sección de su categoría y se refleja en la URL', async ({ page }) => {
    const chip = page.locator('.utensils-section', { hasText: 'Herramientas' });
    await chip.click();

    await expect(page.locator('.utensil-group__title').first()).toContainText('Herramientas');
    await expect(page).toHaveURL(/[?&]section=tools/);
    await expect(chip).toHaveClass(/utensils-section--active/);
    // Las 34 herramientas no caben en una sección: se parte en tramos de 12
    const rows = await page.locator('.utensil-card').count();
    expect(rows).toBeGreaterThan(1);
    expect(rows).toBeLessThanOrEqual(12);

    // Atrás, atrás... hasta la primera sección, donde la URL vuelve a estar limpia
    const prev = page.locator('.utensils-nav button').first();
    for (let i = 0; i < 10; i++) {
      if (await prev.isDisabled()) break;
      await prev.click();
    }
    await expect(page.locator('.utensils-bar__step')).toContainText('Sección 1 de');
    await expect(page).not.toHaveURL(/section=/);
  });

  test('muestra el catálogo agrupado y con el progreso de cada categoría', async ({ page }) => {
    await page.getByRole('button', { name: 'Ver todo de golpe' }).click();

    await expect(page.locator('.utensil-group').first()).toBeVisible();
    await expect(page.locator('.utensil-group__meta').first()).toContainText('0/1 marcados');
    expect(await page.locator('.utensil-card').count()).toBeGreaterThanOrEqual(54);
  });

  test('arrancar la pestaña sin filtros deja ver el catálogo marcable', async ({ page }) => {
    await expect(page.locator('.utensils')).toBeVisible();
    await expect(page.locator('.utensils-bar__step')).toContainText('Sección 1 de');
    await expect(page.locator('.utensil-card').first()).toBeVisible();
    await expect(page.locator('.utensil-card').first()).not.toHaveClass(/utensil-card--owned/);
    await expect(page.locator('.utensil-card--owned')).toHaveCount(0);
    await expect(page.locator('.tab', { hasText: 'Utensilios' })).toContainText('0');
  });

  test('marcar un utensilio persiste tras recargar', async ({ page }) => {
    const card = page.locator('.utensil-card').first();
    await card.locator('input.utensil-card__check').check();

    await expect(card).toHaveClass(/utensil-card--owned/);
    await expect(page.locator('.tab', { hasText: 'Utensilios' })).toContainText('1');
    await expect(page.locator('.utensils-bar__label')).toContainText('1 de 54 marcados');

    await page.reload();
    await page.locator('.tab', { hasText: 'Utensilios' }).click();
    await expect(page.locator('.utensil-card').first()).toHaveClass(/utensil-card--owned/);
  });

  test('marcar no mueve la vista: la tarjeta no se re-renderiza entera', async ({ page }) => {
    // Con una sola sección la página no llega a scrollear: se ve todo de golpe
    await page.getByRole('button', { name: 'Ver todo de golpe' }).click();

    const cards = page.locator('.utensil-card');
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

  test('agregar un utensilio propio lo marca, abre su sección y se puede borrar', async ({
    page
  }) => {
    await page.getByRole('button', { name: '+ Agregar' }).click();
    await expect(page.locator('.modal__title')).toContainText('Agregar Utensilio');
    await page.fill('input#utensilName', 'Sous vide');
    await page.selectOption('select#utensilCategory', 'tools');
    await page.locator('.modal-overlay button[type="submit"]').click();

    await expect(page.locator('.toast--success .toast__title')).toContainText('Añadido');

    // El alta abre la sección donde ha caído el utensilio: si no, parece que no
    // se ha añadido nada (está en otra sección del catálogo)
    const custom = page.locator('.utensil-card', { hasText: 'Sous vide' });
    await expect(custom).toHaveCount(1);
    await expect(custom).toHaveClass(/utensil-card--owned/);
    await expect(page).toHaveURL(/section=tools/);

    await custom.locator('.utensil-card__delete').click();

    // El borrado se confirma con el dialogo propio de la app (nunca con
    // confirm() del navegador: ver tests/e2e/confirm-dialog.spec.ts)
    const confirmDialog = page.locator('.modal-overlay');
    await expect(confirmDialog.locator('.modal__title')).toHaveText('Eliminar utensilio');
    await expect(confirmDialog.locator('.confirm__message')).toContainText(
      'Quitar Sous vide del catálogo'
    );
    await confirmDialog.getByRole('button', { name: 'Eliminar' }).click();

    await expect(page.locator('.toast--success').filter({ hasText: 'Eliminado' })).toBeVisible();
    await expect(page.locator('.utensil-card', { hasText: 'Sous vide' })).toHaveCount(0);
  });

  test('no deja añadir un utensilio con un nombre duplicado', async ({ page }) => {
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
    expect(await page.locator('.utensil-card').count()).toBeGreaterThanOrEqual(54);

    await page.locator('.utensil-card').first().locator('input.utensil-card__check').check();
    await expect(page.locator('.tab', { hasText: 'Utensilios' })).toContainText('1');
  });

  test('crear un hogar se lleva el catálogo personal sin duplicarlo', async ({ page }) => {
    await registerAndGoto(page, '/pantry?tab=utensils');
    await page.getByRole('button', { name: 'Ver todo de golpe' }).click();

    const cards = page.locator('.utensil-card');
    const total = await cards.count();

    // Se marca la primera tarjeta y se comprueba la misma posición despues del
    // hogar: buscarla por nombre no vale, hay tarjetas que se solapan
    await cards.first().locator('input.utensil-card__check').check();
    await expect(cards.first()).toHaveClass(/utensil-card--owned/);

    await createHousehold(page);
    await page.goto('/pantry?tab=utensils');
    await expect(page.locator('.utensils')).toBeVisible();
    await page.getByRole('button', { name: 'Ver todo de golpe' }).click();

    // Mismo número de filas (no el doble) y la marca sigue en su sitio
    await expect(cards).toHaveCount(total);
    await expect(cards.first()).toHaveClass(/utensil-card--owned/);
    await expect(page.locator('.tab', { hasText: 'Utensilios' })).toContainText('1');
  });
});
