import { Locator, Page, expect } from '@playwright/test';
import { test } from './fixtures';
import { registerAndGoto } from './helpers/auth';

/**
 * Ronda 6 (HOGARIA-SPEC §8f): la bandeja como tabla con filtros, controles de solo icono,
 * cancelar en la edicion del titulo, ofertas, descuento, entrada por foto y el calendario
 * de la casa con capas.
 *
 * A proposito sin proveedor de IA: lo que se prueba de la foto es que la pantalla **no
 * escribe nada** cuando el modelo no esta configurado y que dice donde se configura. eso es
 * lo que la hace segura; si algun dia este test necesita un modelo, esta en el sitio equivocado.
 */

function watchPageErrors(page: Page): () => string {
  const errors: string[] = [];
  page.on('pageerror', (event) => errors.push(String(event.message).split('\n')[0]));
  return () => (errors.length > 0 ? errors.join(' | ') : 'sin errores de pagina');
}

async function newList(page: Page, name: string, store?: string): Promise<void> {
  await page.locator('[data-test="new-list"]').click();
  await page.locator('[data-test="list-name"]').fill(name);
  if (store) await page.locator('input[name="listStore"]').fill(store);
  await page.locator('[data-test="create-submit"]').click();
  await expect(page).toHaveURL(/\/shopping\/[\w-]+$/);
  await page.locator('[data-test="back"], a[href="/shopping"]').first().click();
  await expect(page.locator('[data-test="list-row"]').first()).toBeVisible();
}

function rowOf(page: Page, name: string): Locator {
  return page.locator('[data-test="list-row"]', { hasText: name });
}

test.describe('Bandeja: tabla, filtros y paginación', () => {
  test('las cabeceras son columnas de verdad y se puede ordenar por total', async ({ page }) => {
    const echo = watchPageErrors(page);
    await registerAndGoto(page, '/shopping', 'r6-table');
    await newList(page, 'Cesta pequena', 'Ahorro');
    await newList(page, 'Cesta grande', 'Mercadona');

    await expect(page.getByRole('columnheader', { name: 'Lista' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Total' })).toBeVisible();
    expect(echo()).toBe('sin errores de pagina');

    await page.getByRole('columnheader', { name: 'Total' }).click();
    await expect(page.getByRole('columnheader', { name: 'Total' })).toHaveAttribute('aria-sort', 'descending');
    // Ordenar vive en la URL: la pantalla ordenada es un enlace que se puede mandar.
    await expect(page).toHaveURL(/sort=total/);
  });

  test('buscar filtra por producto y el contador de filtros dice cuanto hay puesto', async ({ page }) => {
    await registerAndGoto(page, '/shopping', 'r6-search');
    await newList(page, 'Frutas', 'Ahorro');
    // La lista queda abierta: se anade una linea y se vuelve.
    await page.locator('[data-test="add-input"]').fill('Manzanas');
    await page.locator('[data-test="add-submit"]').click();
    await page.locator('a[href="/shopping"]').first().click();
    await newList(page, 'Otros', 'Mercadona');

    await page.locator('[data-test="tray-search"]').fill('Manzanas');
    await expect(page.locator('[data-test="list-row"]')).toHaveCount(1);
    await expect(rowOf(page, 'Frutas')).toBeVisible();
    await expect(page.locator('.tray__filter-count')).toHaveText('1');

    await page.locator('[data-test="tray-search"]').fill('nada que ver');
    await expect(page.locator('[data-test="list-row"]')).toHaveCount(0);
    await expect(page.getByText(/Ninguna lista encaja con los filtros/i)).toBeVisible();

    await page.getByRole('button', { name: /Quitar los 1 filtros/i }).click();
    await expect(page.locator('[data-test="list-row"]')).toHaveCount(2);
  });

  test('la paginacion corta y el tamano de pagina se elige', async ({ page }) => {
    await registerAndGoto(page, '/shopping', 'r6-pager');
    await newList(page, 'Una');
    await newList(page, 'Dos');
    await expect(page.locator('.tray__pager-text')).toContainText('1-2 de 2');
    await expect(page.getByRole('button', { name: 'Pagina siguiente' })).toBeDisabled();

    await page.locator('.tray__pager app-picker button').first().click();
    await page.getByRole('option', { name: '10 por pagina' }).click();
    await expect(page).toHaveURL(/size=10/);
    await expect(page.locator('[data-test="list-row"]')).toHaveCount(2);
  });

  test('renombrar se puede cancelar y no se queda el input abierto', async ({ page }) => {
    await registerAndGoto(page, '/shopping', 'r6-rename');
    await newList(page, 'Nombre original');

    const row = rowOf(page, 'Nombre original');
    await row.getByRole('button', { name: 'Renombrar' }).click();
    const input = page.locator('[data-test="rename-input"]');
    await expect(input).toBeVisible();
    await input.fill('Nombre torcido');
    await input.press('Escape');

    await expect(input).toHaveCount(0);
    await expect(rowOf(page, 'Nombre original')).toBeVisible();
  });
});

test.describe('Cesta: iconos, oferta y descuento', () => {
  test('marcar es un icono, y seleccionar todo tambien', async ({ page }) => {
    await registerAndGoto(page, '/shopping', 'r6-icons');
    await page.locator('[data-test="new-list"]').click();
    await page.locator('[data-test="list-name"]').fill('Cesta');
    await page.locator('[data-test="create-submit"]').click();
    await page.locator('[data-test="add-input"]').fill('LecHE');
    await page.locator('[data-test="add-submit"]').click();

    const row = page.locator('[data-test="item-row"]').first();
    await expect(row.locator('[data-test="check"] svg')).toBeVisible();
    await row.locator('[data-test="check"]').click();
    await expect(page.locator('[data-test="tab-cart"]')).toContainText('En el carro (1)');

    await page.locator('[data-test="select-all"]').click();
    await expect(page.locator('[data-test="selection-toolbar"]')).toBeVisible();
  });

  test('una oferta 3x2 se pinta en la fila y se quita con un toque', async ({ page }) => {
    await registerAndGoto(page, '/shopping', 'r6-offer');
    await page.locator('[data-test="new-list"]').click();
    await page.locator('[data-test="list-name"]').fill('Ofertas');
    await page.locator('[data-test="create-submit"]').click();
    await page.locator('[data-test="add-input"]').fill('3 Yogur');
    await page.locator('[data-test="add-submit"]').click();

    await page.locator('[data-test="item-row"]').first().getByRole('button', { name: 'Acciones de la linea' }).click();
    await page.locator('[data-test="offer-preset"]', { hasText: '3x2' }).click();
    await expect(page.locator('[data-test="offer-chip"]')).toHaveText('3x2');
    await page.locator('[data-test="edit-sheet"] [data-test="primary-close"], .detail__primary').last().click();

    // La fila recuerda la oferta al recargar, y el chip la quita sin abrir la hoja.
    await page.reload();
    await expect(page.locator('[data-test="offer-chip"]')).toHaveText('3x2');
    await page.locator('[data-test="offer-chip"]').click();
    await expect(page.locator('[data-test="offer-chip"]')).toHaveCount(0);
  });

  test('el descuento de la lista se aplica al total y se puede quitar', async ({ page }) => {
    await registerAndGoto(page, '/shopping', 'r6-discount');
    await page.locator('[data-test="new-list"]').click();
    await page.locator('[data-test="list-name"]').fill('Con descuento');
    await page.locator('[data-test="create-submit"]').click();
    await page.locator('[data-test="add-input"]').fill('1 Aceite');
    await page.locator('[data-test="add-submit"]').click();
    await page.locator('[data-test="item-row"]').first().getByRole('button', { name: 'Acciones de la linea' }).click();
    await page.locator('[data-test="price-input"]').fill('10');
    await page.locator('.detail__primary', { hasText: 'Hecho' }).click();

    await page.locator('[data-test="discount-open"]').click();
    await page.locator('[data-test="discount-kind"]', { hasText: 'Porcentaje' }).click();
    await page.locator('[data-test="discount-percent"] button').click();
    await page.getByRole('option', { name: '10 %' }).click();
    await page.locator('[data-test="discount-save"]').click();

    await expect(page.locator('[data-test="total"]')).toHaveText('9,00 €');
    await expect(page.locator('[data-test="discount-row"]')).toContainText('10');

    await page.locator('[data-test="discount-row"]').click();
    await page.locator('[data-test="discount-remove"]').click();
    await expect(page.locator('[data-test="total"]')).toHaveText('10,00 €');
  });

  test('la hoja de foto avisa de que falta la IA y no escribe nada', async ({ page }) => {
    await registerAndGoto(page, '/shopping', 'r6-photo');
    await page.locator('[data-test="new-list"]').click();
    await page.locator('[data-test="list-name"]').fill('Con foto');
    await page.locator('[data-test="create-submit"]').click();

    await page.locator('[data-test="photo-open"]').click();
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
      'base64'
    );
    await page.locator('input[name="photoFile"]').setInputFiles({ name: 'ticket.png', mimeType: 'image/png', buffer: png });
    await page.locator('[data-test="photo-analyze"]').click();

    await expect(page.locator('[data-test="photo-error"]')).toContainText(/Falta configurar la IA/i);
    await expect(page.locator('[data-test="photo-error"] a')).toHaveAttribute('href', /\/settings\/ai/);
    await expect(page.locator('[data-test="item-row"]')).toHaveCount(0);
  });
});

test.describe('Calendario de la casa', () => {
  test('las capas filtran lo que se pinta y una suelta vive en la agenda', async ({ page }) => {
    const echo = watchPageErrors(page);
    await registerAndGoto(page, '/calendar', 'r6-calendar');

    await page.locator('[data-test="agenda-add"]').click();
    await page.locator('[data-test="event-title"]').fill('Carpinteria: medir el pasillo');
    await page.locator('select[name="eventKind"]').selectOption('home');
    await page.locator('[data-test="event-save"]').click();
    await expect(page.locator('[data-test="household-event"]')).toContainText('Carpinteria');

    await page.locator('[data-test="layer-home"]').click();
    await expect(page.locator('[data-test="household-event"]')).toHaveCount(0);
    await page.locator('[data-test="layer-home"]').click();
    await expect(page.locator('[data-test="household-event"]')).toHaveCount(1);

    await page.locator('[data-test="layer-meals"]').click();
    await expect(page.locator('[data-test="household-event"]')).toHaveCount(1);
    await page.locator('[data-test="layer-meals"]').click();
    expect(echo()).toBe('sin errores de pagina');
  });
});
