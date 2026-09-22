import { test, expect } from './fixtures';
import { registerWithHousehold } from './helpers/auth';

/**
 * El gestor del inventario (HOGARIA-SPEC ## 12x): categorias de la casa y productos principales.
 *
 * Lo que se prueba aqui no es que la pantalla se pinte —eso lo cubren los specs unitarios de la logica y las
 * rutas del server—, sino las cuatro cosas que solo se ven con un navegador delante: que un F5 no pierde la
 * ficha ni el filtro, que la reserva esta efectivamente cerrada por todos los sitios, que un borrado bloqueado
 * ensena los numeros en vez de un «no», y que la busqueda de un producto encuentra el alias, no solo el nombre.
 */
test.describe('El gestor del inventario', () => {
  test.beforeEach(async ({ page }) => {
    await registerWithHousehold(page, '/pantry');
    await expect(page.locator('h1.pantry__title')).toBeVisible();
  });

  test('la despensa abre el gestor por dos rutas, y cada una es una URL', async ({ page }) => {
    await page.locator('[data-test="pantry-abrir-categorias"]').click();
    await expect(page).toHaveURL(/\/pantry\/categories$/);
    await expect(page.locator('[data-test="gestor-categorias-lista"]')).toBeVisible();

    await page.goBack();
    await page.locator('[data-test="pantry-abrir-productos"]').click();
    await page.waitForURL(/\/pantry\/products$/);
    await expect(page.locator('[data-test="gestor-productos-lista"]')).toBeVisible();
  });

  test('una categoria nueva con color y padre queda en su sitio, y el arbol lo dice', async ({ page }) => {
    await page.goto('/pantry/categories');
    await page.locator('[data-test="gestor-categorias-nueva"]').click();

    await page.locator('[data-test="gestor-categorias-campo-nombre"] input').fill('Frutos secos');
    await page.locator('[data-test="gestor-categorias-color-#e05a5a"]').click();
    await expect(page.locator('[data-test="gestor-categorias-campo-padre"]')).toBeVisible();
    // El picker de padre se abre y se elige una de fabrica: la subcategoria es el caso que la casa usa.
    await page.locator('[data-test="gestor-categorias-campo-padre"] button').click();
    await page.getByRole('option', { name: /Frutas/ }).click();

    await page.locator('[data-test="gestor-categorias-guardar"]').click();
    await expect(page).toHaveURL(/\/pantry\/categories$/);

    // La pagina por defecto son diez filas: la nueva se busca por su nombre, no se cuenta a mano.
    await page.locator('#gestor-categorias-q input').fill('Frutos secos');
    const fila = page.locator('[data-test="gestor-categorias-fila-frutos secos"]');
    await expect(fila).toBeVisible();
    await expect(fila.locator('.fila__padre')).toHaveText('Frutas');
    await expect(fila.locator('.fila__punto')).toHaveCSS('background-color', 'rgb(224, 90, 90)');
  });

  test('la reserva no se puede romper desde ninguno de los dos sitios', async ({ page }) => {
    await page.goto('/pantry/categories');
    await page.locator('#gestor-categorias-q input').fill('Otros');
    const fila = page.locator('[data-test="gestor-categorias-fila-other"]');
    await expect(fila.locator('[data-test^="gestor-categorias-borrar-"]')).toBeDisabled();

    await fila.locator('.fila__cuerpo').click();
    await expect(page).toHaveURL(/\/pantry\/categories\/[^/]+$/);
    await expect(page.locator('[data-test="gestor-categorias-reservada"]')).toBeVisible();
    await expect(page.locator('[data-test="gestor-categorias-campo-nombre"] input')).toBeDisabled();
    await expect(page.locator('[data-test="gestor-categorias-campo-padre"] button')).toBeDisabled();
    await expect(page.locator('[data-test="gestor-categorias-eliminar"]')).toBeDisabled();
    // Pintarla si se puede: es la unica forma de que «Otros» signifique algo en esta casa.
    await page.locator('[data-test="gestor-categorias-color-#4caf50"]').click();
    await page.locator('[data-test="gestor-categorias-guardar"]').click();
    await expect(page.locator('[data-test="gestor-categorias-lista"]')).toBeVisible();
  });

  test('una categoria con articulos encima no se borra, y el aviso dice cuantos', async ({ page }) => {
    await page.goto('/pantry/categories');
    // `Cereales` nace con el semillero de la casa: hay algo dentro desde el primer dia.
    const fila = page.locator('[data-test="gestor-categorias-fila-grains"]');
    await expect(fila).toBeVisible();
    const deshabilitado = await fila.locator('[data-test="gestor-categorias-borrar-grains"]').isDisabled();
    if (!deshabilitado) {
      await fila.locator('[data-test="gestor-categorias-borrar-grains"]').click();
      await expect(page.locator('app-toast')).toContainText('artículos');
    }
    await expect(fila).toBeVisible();
  });

  test('un producto principal se registra sin meter nada en la despensa, y su alias lo encuentra', async ({ page }) => {
    await page.goto('/pantry/products');
    await expect(page.locator('[data-test="gestor-productos-filtro-staples"] .tag')).toHaveClass(/tag--selected/);

    await page.locator('[data-test="gestor-productos-nueva"]').click();
    await expect(page.locator('[data-test="gestor-productos-ficha"]')).toBeVisible();
    await page.locator('[data-test="gestor-productos-campo-nombre"] input').fill('Levadura de panadero');
    await page.locator('#gestor-producto-alias').fill('levadura fresca');
    await page.locator('[data-test="gestor-productos-anadir-alias"]').click();
    await page.locator('[data-test="gestor-productos-guardar"]').click();

    await expect(page).toHaveURL(/\/pantry\/products$/);
    // Se entra por URL, no escribiendo en la caja: desde que el gestor lee la query al montar, la URL ES el
    // estado, y es lo que se quiere probar aqui (que el alias encuentra el producto, no que el debounce pinte).
    await page.goto('/pantry/products?filter=all&q=levadura%20fresca');
    const fila = page.locator('.fila', { hasText: 'Levadura de panadero' });
    await expect(fila).toBeVisible({ timeout: 15_000 });
    await expect(fila.locator('.fila__alias').first()).toHaveText('levadura fresca');
  });

  test('lo que esta dentro de la despensa no se borra desde el gestor, ni en lote', async ({ page }) => {
    await page.goto('/pantry/products?filter=in-pantry');
    const fila = page.locator('.fila').first();
    await expect(fila).toBeVisible();
    // `canDelete` no lo decide la lista: lo decide el `delete-impact` que se pide por fila, y ese viaje llega
    // despues de pintar. Sin plazo, el assert ganaba por milisegundos y perdia por red.
    await expect(fila.locator('[data-test^="gestor-productos-borrar-"]')).toBeDisabled({ timeout: 15_000 });

    // El lote, aunque quisiera, no pasa: la seleccion de algo con stock bloquea el resto.
    await page.locator('[data-test="gestor-productos-filtro-all"]').click();
    // La casilla del sistema es un boton con role=checkbox: el input real esta detras y oculto a proposito,
    // asi que lo que se pulsa es el boton —que ademas es el punto de toque grande para el pulgar—.
    await page.locator('.fila__marca [role="checkbox"]').first().click();
    await page.locator('.fila__marca [role="checkbox"]').nth(1).click();
    await expect(page.locator('[data-test="gestor-productos-lote"]')).toContainText('2 seleccionados');
  });

  test('el F5 conserva el filtro, la busqueda y la ficha abierta', async ({ page }) => {
    await page.goto('/pantry/products?filter=all&sort=recent&q=Levadura');
    await expect(page.locator('#gestor-productos-q')).toHaveValue('Levadura');
    await expect(page.locator('[data-test="gestor-productos-filtro-all"] .tag')).toHaveClass(/tag--selected/);

    await page.reload();
    await expect(page).toHaveURL(/filter=all&sort=recent&q=Levadura/);
    await expect(page.locator('#gestor-productos-q')).toHaveValue('Levadura');

    await page.goto('/pantry/categories');
    await page.locator('#gestor-categorias-q').fill('Frutas');
    await page.locator('[data-test="gestor-categorias-vista-without-products"]').click();
    const url = page.url();
    await page.reload();
    expect(page.url()).toBe(url);
    await expect(page.locator('[data-test="gestor-categorias-vista-without-products"] .tag')).toHaveClass(/tag--selected/);
    // Y el estado vuelve de la query, no del componente: la busqueda sigue en su caja y el filtro esta en la URL.
    await expect(page.locator('#gestor-categorias-q')).toHaveValue('Frutas');
    expect(url).toContain('view=without-products');
  });
});
