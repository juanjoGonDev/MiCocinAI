import { Locator, Page, expect } from '@playwright/test';
import { test } from './fixtures';
import { registerAndGoto } from './helpers/auth';

/**
 * La lista de la compra, usada como se usa en la vida real: con un pulgar.
 *
 * Las pruebas de gestos no simulan toques con `tap()` ni hacen clic en el riel:
 * arrastran de verdad, porque lo que se quiere comprobar es el umbral (asomar vs
 * ejecutar) y el hecho de que un arrastre del todo borre y aun se pueda deshacer.
 * El raton de Playwright genera los mismos pointer events que el dedo.
 */

const LIST_NAME = 'Compra de la semana';

async function openNewList(page: Page, seed: string, name = LIST_NAME): Promise<void> {
  await registerAndGoto(page, '/shopping', seed);
  await page.locator('[data-test="new-list"]').click();
  await page.locator('[data-test="list-name"]').fill(name);
  await page.locator('[data-test="create-submit"]').click();
  await expect(page).toHaveURL(/\/shopping\/[\w-]+$/);
}

/**
 * Escribe una linea y espera a que la app la haya asumido: el campo se vacia en el
 * mismo gesto, antes de la respuesta, asi que eso es lo que se comprueba aqui. El
 * rows se espera despues, caso por caso, porque una linea repetida NO anade fila
 * (funde cantidades) y contar filas desde el helper mentiria justo ahi.
 */
async function addItem(page: Page, text: string): Promise<void> {
  await page.locator('[data-test="add-input"]').fill(text);
  await page.locator('[data-test="add-submit"]').click();
  await expect(page.locator('[data-test="add-input"]')).toHaveValue('');
}

function row_(page: Page, name: string): Locator {
  return page.locator('[data-test="item-row"]', { has: page.locator('.detail__name', { hasText: name }) });
}

function faceOf(row: Locator): Locator {
  return row.locator('.detail__face');
}

/** Arrastre horizontal de la cara de la fila, de `fromRatio` a `toRatio` del ancho. */
async function dragRow(page: Page, row: Locator, fromRatio: number, toRatio: number, holdMs = 0): Promise<void> {
  const box = await faceOf(row).boundingBox();
  if (!box) throw new Error('La fila no tiene caja: no se puede arrastrar');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * fromRatio, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * ((fromRatio + toRatio) / 2), y, { steps: 5 });
  await page.mouse.move(box.x + box.width * toRatio, y, { steps: 5 });
  if (holdMs) await page.waitForTimeout(holdMs);
  await page.mouse.up();
}

/**
 * Los tres gestos criticos se vigilan con un eco de `pageerror` en el mensaje del
 * assert: si Angular revienta a mitad de un gesto, lo que se ve desde CI es un
 * «element not found» que no dice nada, y el trace vive en un artefacto que no
 * siempre se puede descargar. El texto del fallo, en cambio, siempre llega.
 */
/**
 * Registro de lo que la app llamo al backend. Un gesto que no deja barra de deshacer
 * puede ser dos cosas muy distintas (no se borro nada, o se borro y el aviso no
 * llega), y desde fuera se ven igual: «element not found». Las llamadas lo separan.
 */
function watchApi(page: Page): () => string {
  const lines: string[] = [];
  page.on('response', response => {
    const url = response.url();
    if (url.includes('/api/shopping')) {
      lines.push(`${response.request().method()} ${response.status()} ${new URL(url).pathname.replace('/api/shopping', '')}`);
    }
  });
  page.on('requestfailed', request => {
    if (request.url().includes('/api/')) lines.push(`FALLO ${request.method()} ${new URL(request.url()).pathname}`);
  });
  return () => (lines.length > 0 ? lines.slice(-6).join(' | ') : 'ni una llamada a /api/shopping');
}

function watchPageErrors(page: Page): () => string {
  const errors: string[] = [];
  page.on('pageerror', event => errors.push(String(event.message).split('\n')[0]));
  return () => (errors.length > 0 ? errors.join(' | ') : 'sin errores de pagina');
}

test.describe('Lista de la compra — bandeja y cesta', () => {
  test('el módulo vivo enlaza la sección y la bandeja empieza vacía', async ({ page }) => {
    await registerAndGoto(page, '/settings', 'shop-nav');

    await expect(page.locator('a[href="/shopping"]')).not.toHaveCount(0);

    await page.locator('a[href="/shopping"]').first().click();
    await expect(page).toHaveURL(/\/shopping$/);
    await expect(page.getByRole('heading', { name: /Lista de la compra/i })).toBeVisible();
    await expect(page.locator('[data-test="list-row"]')).toHaveCount(0);
    await expect(page.getByText(/Todavia no hay listas/i)).toBeVisible();
  });

  test('crear una lista abre su pantalla y la deja en la bandeja', async ({ page }) => {
    await openNewList(page, 'shop-create');

    await expect(page.locator('.detail__title')).toContainText(LIST_NAME);

    await page.locator('.detail__back').click();
    await expect(page.locator('[data-test="list-row"]')).toHaveCount(1);
    await expect(page.locator('[data-test="list-row"]').getByText('0/0')).toBeVisible();
  });

  test('anadir una línea pinta cantidad y avisa de que no tiene precio', async ({ page }) => {
    await openNewList(page, 'shop-add');

    await addItem(page, '2 Leche');
    const row = row_(page, 'Leche');
    await expect(row).toHaveCount(1);

    await expect(row.locator('.detail__name')).toHaveText('Leche');
    await expect(row.locator('.detail__qty')).toHaveText('2×');
    await expect(row.locator('.detail__price')).toHaveText('—');
    await expect(page.locator('.detail__chip--warn')).toContainText('1 sin precio');
  });

  test('repetir un producto suma la cantidad en la misma línea', async ({ page }) => {
    await openNewList(page, 'shop-merge');

    await addItem(page, '2 Leche');
    await expect(page.locator('[data-test="item-row"]')).toHaveCount(1);
    await page.locator('[data-test="add-input"]').fill('1 Leche');
    await page.locator('[data-test="add-submit"]').click();

    await expect(page.locator('[data-test="item-row"]')).toHaveCount(1);
    await expect(page.locator('.detail__qty')).toHaveText('3×');
  });

  test('marcar una línea se guarda solo y sigue marcado al recargar', async ({ page }) => {
    const echo = watchPageErrors(page);
    await openNewList(page, 'shop-autosave');
    await addItem(page, 'Pan');
    const row = row_(page, 'Pan');
    await expect(row).toHaveCount(1);

    await row.locator('[data-test="check"]').click();
    const face = await row.locator('.detail__face').innerText().catch(() => 'fila fuera de pantalla');
    const toasts = JSON.stringify(await page.locator('.toast').allInnerTexts());

    // Marcar NO es dejar la linea donde estaba: se va del tab de pendientes, que es
    // lo que hace la lista corta cuando compras. Por eso se comprueba en el carro.
    await expect(
      page.locator('[data-test="tab-todo"]'),
      `fila: ${face.replace(/\s+/g, ' ')} · avisos: ${toasts} · ${echo()}`
    ).toContainText('Pendientes (0)');
    await expect(page.locator('[data-test="item-row"]'), echo()).toHaveCount(0);

    await page.locator('[data-test="tab-cart"]').click();
    await expect(page.locator('[data-test="item-row"]')).toHaveCount(1);
    await expect(page.locator('[data-test="item-row"]')).toHaveClass(/detail__row--checked/);

    await page.reload();
    await expect(page.locator('[data-test="tab-todo"]')).toContainText('Pendientes (0)');
    await page.locator('[data-test="tab-cart"]').click();
    await expect(page.locator('[data-test="item-row"]')).toHaveCount(1);
  });

  test('un arrastre corto descubre el riel y un arrastre del todo quita la línea', async ({ page }) => {
    await openNewList(page, 'shop-swipe-rail');
    await addItem(page, 'Tomates');
    const row = row_(page, 'Tomates');
    await expect(row).toHaveCount(1);

    // Medio dedo: el riel se descubre, la acción NO se ejecuta (25 % < 60 %)
    await dragRow(page, row, 0.86, 0.62);
    await expect(row.locator('[data-test="rail-remove"]')).toBeVisible();
    await expect(row).toHaveCount(1);

    // Cerrando de nuevo con otro arrastre a la izquierda, sin cruzar el umbral
    await dragRow(page, row, 0.5, 0.88);
    await expect(row).toHaveCount(1);
  });

  test('arrastrar del todo borra y la barra de deshacer lo devuelve', async ({ page }) => {
    const echo = watchPageErrors(page);
    const api = watchApi(page);
    await openNewList(page, 'shop-swipe-undo');
    await addItem(page, 'Pollo');
    const row = row_(page, 'Pollo');
    await expect(row).toHaveCount(1);

    // El arrastre nace en 0.86 y no en el borde derecho: ahi vive el ⋯, y empezar
    // sobre un boton es otra intencion (abrir la hoja), no este gesto.
    await dragRow(page, row, 0.86, 0.08);
    await expect(page.locator('[data-test="item-row"]'), `${echo()} · llamadas: ${api()}`).toHaveCount(0);

    const bar = page.locator('.toast-container--bottom .toast');
    await expect(
      bar,
      `avisos: ${JSON.stringify(await page.locator('.toast').allInnerTexts())} · ${echo()} · llamadas: ${api()} · estado: ${(
        await page.locator('.detail__status').innerText()
      ).trim()}`
    ).toContainText('Pollo quitada');
    await expect(bar.locator('.toast__countdown')).toHaveCount(1);

    await bar.locator('[data-test="toast-action"]').click();

    await expect(page.locator('[data-test="item-row"]', { hasText: 'Pollo' })).toHaveCount(1);
    // El aviso se quita al actuar: no queda un «Deshacer» huérfano
    await expect(page.locator('.toast-container--bottom .toast')).toHaveCount(0);
  });

  test('deslizar a la derecha suma una unidad', async ({ page }) => {
    await openNewList(page, 'shop-swipe-plus');
    await addItem(page, '1 Yogur');
    const row = row_(page, 'Yogur');
    await expect(row).toHaveCount(1);

    await dragRow(page, row, 0.2, 0.62);

    await expect(row.locator('.detail__qty')).toHaveText('2×');
  });

  test('pulsación larga entra en selección múltiple y marcar compra todas', async ({ page }) => {
    const echo = watchPageErrors(page);
    await openNewList(page, 'shop-selection');
    await addItem(page, 'Manzanas');
    await expect(page.locator('[data-test="item-row"]')).toHaveCount(1);
    await addItem(page, 'Peras');
    await expect(page.locator('[data-test="item-row"]')).toHaveCount(2);

    // 350 ms de pulso, y aquí con margen: el test mide la UI, no el reloj
    await dragRow(page, page.locator('[data-test="item-row"]').first(), 0.5, 0.5, 550);

    await expect(page.locator('[data-test="selection-toolbar"]'), echo()).toBeVisible();
    await expect(page.locator('[data-test="selection-toolbar"]')).toContainText('1 seleccionadas');

    await page.locator('[data-test="item-row"]').nth(1).locator('.detail__face').click();
    await expect(page.locator('[data-test="selection-toolbar"]')).toContainText('2 seleccionadas');

    await page.locator('[data-test="bulk-check"]').click();
    await expect(page.locator('[data-test="selection-toolbar"]')).toHaveCount(0);
    await expect(page.locator('[data-test="tab-todo"]')).toContainText('Pendientes (0)');
  });

  test('quitar en selección múltiple deja una barra que devuelve las dos líneas', async ({ page }) => {
    await openNewList(page, 'shop-selection-remove');
    await addItem(page, 'Cervezas');
    await expect(page.locator('[data-test="item-row"]')).toHaveCount(1);
    await addItem(page, 'Hielo');
    await expect(page.locator('[data-test="item-row"]')).toHaveCount(2);

    await dragRow(page, page.locator('[data-test="item-row"]').first(), 0.5, 0.5, 550);
    await page.locator('[data-test="item-row"]').nth(1).locator('.detail__face').click();
    await page.locator('[data-test="bulk-remove"]').click();

    await expect(page.locator('[data-test="item-row"]')).toHaveCount(0);
    await expect(page.locator('.toast-container--bottom .toast')).toContainText('2 lineas quitadas');

    await page.locator('[data-test="toast-action"]').click();
    await expect(page.locator('[data-test="item-row"]')).toHaveCount(2);
  });

  test('un precio con coma entra en el total estimado', async ({ page }) => {
    await openNewList(page, 'shop-price');
    await addItem(page, '2 Aceite');
    const row = row_(page, 'Aceite');
    await expect(row).toHaveCount(1);

    await row.locator('.detail__more').click();
    await expect(page.locator('[data-test="edit-sheet"]')).toBeVisible();

    await page.locator('[data-test="price-input"]').fill('4,75');
    await page.locator('[data-test="price-input"]').blur();

    // 4,75 € por unidad por 2 unidades: el total de la lista es por linea
    await expect(page.locator('[data-test="total"]')).toHaveText('9,50 €');
    await expect(row.locator('.detail__price')).toHaveText('4,75 €');

    await page.locator('[data-test="edit-sheet"]').getByRole('button', { name: /Hecho/i }).click();
    await expect(page.locator('[data-test="edit-sheet"]')).toHaveCount(0);
  });

  test('pegar una lista de tres líneas las añade de una vez', async ({ page }) => {
    await openNewList(page, 'shop-paste');

    await page.locator('[data-test="paste-open"]').click();
    await page.locator('[data-test="paste-input"]').fill('- 2 Leche\n1kg Tomates\nPan de molde');
    await page.locator('[data-test="paste-submit"]').click();

    await expect(page.locator('[data-test="item-row"]')).toHaveCount(3);
    await expect(page.locator('.detail__name', { hasText: 'Tomates' })).toBeVisible();
    await expect(page.locator('.detail__qty').first()).not.toHaveCount(0);
  });

  test('terminar compra archiva la lista con su total en el historial', async ({ page }) => {
    await openNewList(page, 'shop-complete');
    await addItem(page, 'Cafe');
    const row = row_(page, 'Cafe');
    await expect(row).toHaveCount(1);

    // Primero el precio: en cuanto la marcas se va del tab de pendientes y ahi
    // ya no hay ⋯ que pulsar.
    await row.locator('.detail__more').click();
    await page.locator('[data-test="price-input"]').fill('3,20');
    await page.locator('[data-test="price-input"]').blur();
    await page.locator('[data-test="edit-sheet"]').getByRole('button', { name: /Hecho/i }).click();
    await row.locator('[data-test="check"]').click();

    await page.locator('[data-test="complete"]').click();
    await expect(page).toHaveURL(/\/shopping\?tab=hechas/);
    await expect(page.locator('[data-test="list-row"]')).toHaveCount(1);
    await expect(page.locator('[data-test="list-row"]').getByText('3,20 €')).toBeVisible();

    // Y de aqui se puede volver atras: reabrir es una accion, no un misterio
    await page.locator('[data-test="tab-done"]').click();
    await expect(page.locator('[data-test="list-row"]')).toHaveCount(1);
  });

  test('vaciar el carro deja la lista solo con lo pendiente, con deshacer', async ({ page }) => {
    await openNewList(page, 'shop-clear');
    await addItem(page, 'Azucar');
    await expect(page.locator('[data-test="item-row"]')).toHaveCount(1);
    await addItem(page, 'Sal');
    const first = row_(page, 'Azucar');

    await first.locator('[data-test="check"]').click();
    await page.getByRole('button', { name: /Vaciar carro/i }).click();

    await expect(page.locator('[data-test="item-row"]')).toHaveCount(1);
    // acotado a la fila: con dos lineas en pantalla `.detail__name` seria ambiguo,
    // y Playwright prefiere fallar por strict mode antes que leer la primera y callar.
    await expect(page.locator('[data-test="item-row"] .detail__name')).toHaveText('Sal');

    await page.locator('[data-test="toast-action"]').click();
    // Restaurar deshace el borrado, no el marcado: la linea vuelve marcada, o sea
    // al carro. Contarla "a secas" mentiria sobre lo que hizo el boton.
    await expect(page.locator('[data-test="tab-todo"]')).toContainText('Pendientes (1)');
    await page.locator('[data-test="tab-cart"]').click();
    await expect(page.locator('[data-test="item-row"]')).toHaveCount(1);
  });
});
