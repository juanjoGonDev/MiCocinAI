import { test, expect } from './fixtures';
import { registerWithHousehold } from './helpers/auth';

/**
 * El visor del catálogo pre-registrado (HOGARIA-SPEC ## 12aa).
 *
 * Lo que prueba no es la calidad del dato —eso vive en `supermarket-catalog.spec.ts` del server— sino la
 * promesa que la pantalla le hace a quien la usa: se entra desde la franja del inventario, se busca sin
 * acentos, la fila se añade con un clic y la propia fila avisa de que ya es tuya; «Añadir lo visible» manda
 * la página entera y no duplica nada. El estado vive en la URL, y aqui se comprueba entrando directo por ella.
 */
test.describe('El catálogo del supermercado', () => {
  test.beforeEach(async ({ page }) => {
    await registerWithHousehold(page, '/pantry');
  });

  test('de la franja al catálogo: buscar, añadir, la fila pasa a «en casa», y el lote no duplica', async ({ page }) => {
    await page.locator('[data-test="pantry-abrir-catalogo"]').click();
    await expect(page).toHaveURL(/\/pantry\/catalogo/);
    await expect(page.locator('h1')).toContainText('Catálogo del supermercado');

    await page.locator('#catalogo-q').fill('leche');
    await expect(page.locator('[data-test="catalogo-resultados"]')).toContainText('productos');
    await expect(page.locator('.lista .fila').first()).toBeVisible();

    // La primera fila con botón: el seed de la casa ya conoce alguna leche, y esas vienen marcadas en casa.
    const fila = page
      .locator('.lista .fila')
      .filter({ has: page.locator('[data-test^="catalogo-anadir-"]') })
      .first();
    const nombre = (await fila.locator('.fila__nombre').innerText()).trim();
    await fila.locator('[data-test^="catalogo-anadir-"]').click();
    await expect(page.locator('.toast--success .toast__title').last()).toContainText('añadido a tu inventario');
    await expect(page.locator('.lista .fila', { hasText: nombre }).locator('.fila__en-casa')).toContainText('En tu inventario');

    // «Añadir lo visible» cuenta lo que de verdad entra y deja la página sin botones: no duplica.
    await page.locator('[data-test="catalogo-anadir-visibles"]').click();
    await expect(page.locator('.toast--success .toast__title').last()).toContainText('productos añadidos a tu inventario');
    await expect(page.locator('[data-test^="catalogo-anadir-"]')).toHaveCount(0);

    await page.locator('[data-test="catalogo-volver"]').click();
    await expect(page).toHaveURL(/\/pantry$/);
    await expect(page.locator('h1.pantry__title')).toContainText('Inventario');
  });

  test('la query hidratada al montar: entrar directo por URL pinta el pasillo y la búsqueda', async ({ page }) => {
    await page.goto('/pantry/catalogo?q=aceite');
    await expect(page.locator('#catalogo-q')).toHaveValue('aceite');
    await expect(page.locator('.lista .fila').filter({ hasText: 'Aceite de oliva virgen extra' })).not.toHaveCount(0);

    await page.goto('/pantry/catalogo?cat=vegetables');
    await expect(page.locator('[data-test="catalogo-filtro-vegetables"]')).toHaveClass(/pasillo--activa/);
    await expect(page.locator('.lista .fila').first()).toBeVisible();

    // El padre filtra su subárbol: más filas que su primera hoja, y ninguna de otro pasillo.
    await page.goto('/pantry/catalogo?cat=alimentos');
    await expect(page.locator('[data-test="catalogo-filtro-alimentos"]')).toHaveClass(/pasillo--activa/);
    await expect(page.locator('[data-test="catalogo-resultados"]')).toContainText('334 productos');
  });

  test('lo que el catálogo alta sale en el gestor de productos, con su padre en el de categorías', async ({ page }) => {
    await page.goto('/pantry/catalogo?q=levadura');
    await page.locator('[data-test^="catalogo-anadir-"]').first().click();
    await expect(page.locator('.toast--success .toast__title').last()).toContainText('Levadura química');

    await page.goto('/pantry/products?filter=all&q=levadura');
    await expect(page.locator('.lista .fila').filter({ hasText: 'Levadura química' })).not.toHaveCount(0);

    await page.goto('/pantry/categories');
    await expect(page.locator('[data-test="gestor-categorias-fila-alimentos"]')).toContainText('Alimentos');
    await expect(page.locator('[data-test="gestor-categorias-fila-grains"]')).toContainText('Alimentos');
  });
});
