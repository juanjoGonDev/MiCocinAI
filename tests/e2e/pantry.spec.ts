import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { registerWithHousehold } from './helpers/auth';

test.describe('Pantry', () => {
  test.beforeEach(async ({ page }) => {
    // El seed de ingredientes se crea junto al hogar
    await registerWithHousehold(page, '/pantry');
    await expect(page.locator('h1.pantry__title')).toBeVisible();
  });

  test('should display pantry page', async ({ page }) => {
    await expect(page.locator('h1.pantry__title')).toContainText('Inventario'); // ## 12aa
  });

  test('should show stats cards', async ({ page }) => {
    await expect(page.locator('.stat-card__label')).toContainText([
      'En inventario',
      'Por caducar',
      'Caducados'
    ]);
  });

  test('should show search input', async ({ page }) => {
    await expect(page.locator('input[type="search"]')).toBeVisible();
  });

  test('should show category filters', async ({ page }) => {
    const tags = page.locator('app-tag');
    // ## 12aa: con el arbol sembrado en la casa hay un chip nuevo, y es el del padre. Se ancla aqui el
    // indice que sube para que quien lea el diff sepa por que se movio Verduras y no se mueva otro por gusto.
    await expect(tags.nth(0)).toContainText('Todos');
    await expect(tags.nth(1)).toContainText('Alimentos');
    await expect(tags.nth(2)).toContainText('Verduras');
    await expect(tags.nth(3)).toContainText('Frutas');
  });

  test('should filter by category chip', async ({ page }) => {
    await page.locator('app-tag', { hasText: 'Verduras' }).click();
    await expect(page.locator('app-tag .tag--selected')).toContainText('Verduras');
  });

  test('should open add ingredient modal', async ({ page }) => {
    await page.getByRole('button', { name: '+ Agregar' }).click();

    await expect(page.locator('.modal__title')).toContainText('Agregar Ingrediente');
    await expect(page.locator('input#ingredientName')).toBeVisible();
    await expect(page.locator('input#quantity')).toBeVisible();
  });

  // Desde la tanda 25 el formulario de la despensa no tiene <select>: categoria y ubicacion son `app-picker`,
  // que abre una lista de opciones y se pulsa por texto. Con el idioma del arnes anclado en castellano, el texto
  // es el del diccionario (y en ubicacion lleva el pictograma delante, de ahi que se filtre por substring).
  const elegir = async (page: Page, picker: string, opcion: string): Promise<void> => {
    const caja = page.locator(picker);
    await caja.locator('.picker__trigger').click();
    await caja.locator('.picker__option').filter({ hasText: opcion }).first().click();
  };

  test('should add a new ingredient', async ({ page }) => {
    await page.getByRole('button', { name: '+ Agregar' }).click();

    await page.fill('input#ingredientName', 'Tomate');
    await page.fill('input#quantity', '500');
    await elegir(page, '[data-test="pantry-picker-categoria"]', 'Verduras');
    await elegir(page, '[data-test="pantry-picker-ubicacion"]', 'Nevera');

    await page.locator('app-modal button[type="submit"]').click();

    await expect(page.locator('.toast--success .toast__title')).toContainText('Agregado');
    await expect(page.locator('.ingredient-item', { hasText: 'Tomate' })).toHaveCount(1);
  });

  test('should add an ingredient with expiration date', async ({ page }) => {
    await page.getByRole('button', { name: '+ Agregar' }).click();

    await page.fill('input#ingredientName', 'Yogur');
    await page.fill('input#quantity', '6');
    await elegir(page, '[data-test="pantry-picker-categoria"]', 'Lácteos');
    await elegir(page, '[data-test="pantry-picker-ubicacion"]', 'Nevera');
    // <input type="date"> produce YYYY-MM-DD (el backend no debe exigir ISO datetime)
    await page.fill('input#expiration', '2026-12-31');

    await page.locator('app-modal button[type="submit"]').click();

    await expect(page.locator('.toast--success .toast__title')).toContainText('Agregado');
    await expect(page.locator('.ingredient-item', { hasText: 'Yogur' })).toHaveCount(1);
  });

  test('should close modal on cancel', async ({ page }) => {
    await page.getByRole('button', { name: '+ Agregar' }).click();
    await expect(page.locator('.modal__title')).toContainText('Agregar Ingrediente');

    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
  });

  // --- Seed de ingredientes comunes (sugerencias) -------------------------

  test('should show the common ingredients seeded with the household', async ({ page }) => {
    const suggestions = page.locator('.suggestions .chip');
    await expect(page.locator('.suggestions__title')).toContainText('Sugerencias comunes');
    await expect(suggestions.first()).toBeVisible();
    // El backend pagina de 20 en 20 y la UI no pagina: se pide una pagina
    // amplia para que lleguen los 68 ingredientes sembrados.
    expect(await suggestions.count()).toBeGreaterThan(50);
  });

  test('suggestions do not count as pantry stock', async ({ page }) => {
    // "En despensa" solo cuenta items con quantity > 0
    await expect(page.locator('.stat-card--total .stat-card__value')).toHaveText('0');
  });

  test('el stepper de la fila mueve la cantidad de uno en uno (## 12aa)', async ({ page }) => {
    await page.getByRole('button', { name: '+ Agregar' }).click();
    await page.fill('input#ingredientName', 'Tomate stepper');
    await page.fill('input#quantity', '5');
    await page.locator('app-modal button[type="submit"]').click();
    await expect(page.locator('.toast--success .toast__title')).toContainText('Agregado');

    const fila = page.locator('.ingredient-item', { hasText: 'Tomate stepper' });
    await expect(fila).toContainText('5 g'); // el modal nace en gramos: el stepper mueve la cantidad, no la unidad
    await fila.locator('[data-test^="pantry-stock-mas-"]').click();
    await expect(fila).toContainText('6 g');
    await fila.locator('[data-test^="pantry-stock-menos-"]').click();
    await expect(fila).toContainText('5 g');
    // Bajar a 0 no borra la ficha: la deja en «lo que la casa conoce», que es la semantica de `staples` (## 12x).
    for (let i = 0; i < 5; i++) {
      await page.locator('.ingredient-item', { hasText: 'Tomate stepper' }).locator('[data-test^="pantry-stock-menos-"]').click();
    }
    await expect(page.locator('.ingredient-item', { hasText: 'Tomate stepper' })).toHaveCount(0);
  });

  test('clicking a suggestion opens the modal prefilled', async ({ page }) => {
    const chip = page.locator('.suggestions .chip').first();
    const chipName = (await chip.locator('.chip__name').textContent())!.trim();

    await chip.click();

    await expect(page.locator('.modal__title')).toContainText('Agregar Ingrediente');
    await expect(page.locator('input#ingredientName')).toHaveValue(chipName);
  });
});
