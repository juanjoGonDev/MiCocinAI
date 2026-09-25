import { Page, expect } from '@playwright/test';
import { test } from './fixtures';
import { registerAndGoto } from './helpers/auth';

/**
 * La ficha del articulo de inventario (HOGARIA-SPEC ## 12ai): detalle con caracteristicas,
 * pestana de precios por tienda con grafica, y su pantalla de edicion dedicada.
 *
 * El flujo se siembra por API a proposito: crear el articulo y apuntar tres precios desde la
 * interfaz exigiria pasar por el cierre de una compra entera, que es el spec de la ## 12ag —
 * aqui lo que se prueba es la FICHA: que el nombre de la tabla enlaza, que la pestana viaja
 * en la URL, que cada tienda sale con su ultimo precio y su linea en la grafica, y que la
 * edicion guarda y vuelve. El sello de tiempo del API es «ahora», asi que la grafica no
 * puede ensenar meses de historia: eso lo cubre el spec de `precio-chart.util` con datos
 * sinteticos; aqui se comprueba que las series, los puntos y las etiquetas existen.
 */

const TOKEN_KEY = 'hogar:v1:auth_token';

async function tokenOf(page: Page): Promise<string> {
  const token = await page.evaluate((clave) => window.localStorage.getItem(clave), TOKEN_KEY);
  expect(token, 'la sesion deberia tener token').toBeTruthy();
  return token as string;
}

async function apiPost(page: Page, path: string, token: string, body: unknown): Promise<any> {
  const response = await page.request.post(path, {
    headers: { authorization: `Bearer ${token}` },
    data: body
  });
  expect(response.ok(), `${path} deberia dar 2xx y dio ${response.status()}`).toBeTruthy();
  return response.json();
}

/** Un articulo en el inventario de la casa, creado por API con todo lo que la ficha sabe leer. */
async function sembrarArticulo(
  page: Page,
  token: string,
  nombre: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const respuesta = await apiPost(page, '/api/pantry/ingredients', token, {
    name: nombre,
    category: 'dairy',
    quantity: 4,
    unit: 'unit',
    location: 'fridge',
    ...extra
  });
  return respuesta.data.id as string;
}

async function sembrarPrecio(
  page: Page,
  token: string,
  nombre: string,
  minor: number,
  tienda: string
): Promise<void> {
  await apiPost(page, '/api/shopping/prices', token, {
    productName: nombre,
    priceMinor: minor,
    quantity: 1,
    store: tienda
  });
}

test.describe('la ficha del articulo de inventario', () => {
  test('el nombre de la tabla enlaza, y la ficha dice lo que el articulo es', async ({ page }) => {
    await registerAndGoto(page, '/pantry', 'r37-ficha');
    const token = await tokenOf(page);
    const id = await sembrarArticulo(page, token, 'Leche entera', {
      barcode: '8480000123456',
      notes: 'La de siempre, entera'
    });

    await page.goto('/pantry');
    const enlace = page.locator(`[data-test="pantry-item-${id}"]`);
    await expect(enlace).toBeVisible();
    await enlace.click();

    await expect(page).toHaveURL(new RegExp(`/pantry/inventario/${id}$`));
    await expect(page.locator('.item__nombre')).toHaveText('Leche entera');
    // Lo que la ficha promete: caracteristicas, no solo un nombre grande.
    await expect(page.locator('[data-test="item-detalles"]')).toBeVisible();
    await expect(page.locator('.item__clase')).toHaveText('Lácteos');
    await expect(page.locator('.item__estado')).toContainText('4 unit');
    await expect(page.locator('[data-test="item-detalles"]')).toContainText('8480000123456');
    await expect(page.locator('[data-test="item-detalles"]')).toContainText(
      'La de siempre, entera'
    );

    // La pestana de precios existe y viaja en la URL; sin historia, dice que no hay nada.
    await page.locator('[data-test="item-tab-precios"]').click();
    await expect(page).toHaveURL(new RegExp(`/pantry/inventario/${id}\\?tab=precios$`));
    await expect(page.locator('[data-test="item-precios-vacio"]')).toBeVisible();
  });

  test('los precios se ven por tienda, dibujan la grafica y una observacion se puede quitar', async ({
    page
  }) => {
    await registerAndGoto(page, '/pantry', 'r37-precios');
    const token = await tokenOf(page);
    const id = await sembrarArticulo(page, token, 'Leche entera');
    await sembrarPrecio(page, token, 'Leche entera', 175, 'Mercadona');
    await sembrarPrecio(page, token, 'Leche entera', 180, 'Mercadona');
    await sembrarPrecio(page, token, 'Leche entera', 160, 'Lidl');

    await page.goto(`/pantry/inventario/${id}?tab=precios`);
    const precios = page.locator('[data-test="item-precios"]');
    await expect(precios.locator('[data-test="item-tienda"]')).toHaveCount(2);

    // Cada tienda con su ultimo precio: la tarjeta lo dice en euros.
    const mercadona = precios.locator('[data-test="item-tienda"]', { hasText: 'Mercadona' });
    await expect(mercadona).toContainText('1,80');
    const lidl = precios.locator('[data-test="item-tienda"]', { hasText: 'Lidl' });
    await expect(lidl).toContainText('1,60');

    // La grafica: dos series (dos colores en la leyenda), tres puntos, y la linea del que
    // tiene historia (Mercadona con dos observaciones).
    const grafica = page.locator('[data-test="precios-grafica"]');
    await expect(grafica.locator('svg')).toBeVisible();
    await expect(grafica.locator('.grafica__clave')).toHaveCount(2);
    await expect(grafica.locator('svg circle')).toHaveCount(3);
    await expect(grafica.locator('svg path.grafica__linea')).toHaveCount(1);

    // El historial cuenta las tres observaciones, y una se quita con su confirmacion.
    await expect(precios.locator('[data-test^="item-precio-"]')).toHaveCount(3);
    await precios.locator('.item__quitar').first().click();
    const confirmacion = page.locator('app-confirm-dialog');
    await expect(confirmacion.locator('.modal')).toBeVisible();
    await confirmacion.getByRole('button', { name: 'Quitar', exact: true }).click();
    await expect(precios.locator('[data-test^="item-precio-"]')).toHaveCount(2);
  });

  test('la edicion es su propia pantalla: guarda, vuelve a la ficha y lo cambiado se ve', async ({
    page
  }) => {
    await registerAndGoto(page, '/pantry', 'r37-editar');
    const token = await tokenOf(page);
    const id = await sembrarArticulo(page, token, 'Yogur natural', { location: 'pantry' });

    await page.goto(`/pantry/inventario/${id}`);
    await page.locator('[data-test="item-editar"]').click();
    await expect(page).toHaveURL(new RegExp(`/pantry/inventario/${id}/editar$`));

    // El stock se ve pero no se toca: la regla de la ## 12x, dicha en la propia pantalla.
    await expect(page.locator('[data-test="editar-stock"]')).toContainText('4 unit');

    await page.locator('input#item-nota').fill('El de la caja roja');
    await page.locator('input#item-codigo').fill('1234567890');
    await page.locator('[data-test="editar-guardar"]').click();

    await expect(page).toHaveURL(new RegExp(`/pantry/inventario/${id}$`));
    await expect(page.locator('[data-test="item-detalles"]')).toContainText('El de la caja roja');
    await expect(page.locator('[data-test="item-detalles"]')).toContainText('1234567890');
  });
});
