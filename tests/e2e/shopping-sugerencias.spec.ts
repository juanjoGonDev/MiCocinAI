import { Locator, Page, expect } from '@playwright/test';
import { test } from './fixtures';
import { registerAndGoto } from './helpers/auth';

/**
 * Ronda 35 (HOGARIA-SPEC ## 12ag): el autocompletado al anadir lineas y el vuelco del carro
 * comprado al inventario de la casa al cerrar la lista.
 *
 * Son dos cosas que un test de unit no ve: el panel de sugerencias solo vive si el teclado, el
 * debounce y el catalogo global se ponen de acuerdo, y la ficha que nace al cerrar la compra sale
 * de una transaccion del server que el frontend solo sabe contar. Por eso el primer test teclea
 * «lech» de verdad y el segundo cierra una compra y baja a la despensa a comprobar la fila.
 */

async function openNewList(page: Page, seed: string, store?: string): Promise<void> {
  await registerAndGoto(page, '/shopping', seed);
  await page.locator('[data-test="new-list"]').click();
  await page.locator('[data-test="list-name"]').fill('Compra ronda 35');
  if (store) await page.locator('[data-test="list-store"]').fill(store);
  await page.locator('[data-test="create-submit"]').click();
  await expect(page).toHaveURL(/\/shopping\/[\w-]+$/);
}

function row_(page: Page, name: string): Locator {
  return page.locator('[data-test="item-row"]', {
    has: page.locator('.detail__name', { hasText: name })
  });
}

/** Precio por unidad desde la hoja de la linea, con la coma espaola. */
async function priceRow(page: Page, name: string, price: string): Promise<void> {
  const row = row_(page, name);
  await row.locator('.detail__more').click();
  await expect(page.locator('[data-test="edit-sheet"]')).toBeVisible();
  await page.locator('[data-test="price-input"]').fill(price);
  await page.locator('[data-test="price-input"]').blur();
  await page.locator('[data-test="edit-sheet"]').getByRole('button', { name: /Hecho/i }).click();
  await expect(page.locator('[data-test="edit-sheet"]')).toHaveCount(0);
}

test.describe('el anadido sugiere del catalogo', () => {
  test('«lech» despliega el catalogo, y elegir la hoja escribe el nombre canonico', async ({
    page
  }) => {
    await openNewList(page, 'r35-sug');

    // `fill` no basta: el panel se alimenta del `input` tras un debounce, y `pressSequentially`
    // es el dedo tecleando, que es lo que se quiere probar.
    // «lech» a secas no basta: el limite son seis hojas por orden alfabético y se las llevan las
    // lechugas y las leches vegetales. «leche semi» es lo que teclearia alguien que sabe lo que busca.
    await page.locator('[data-test="add-input"]').pressSequentially('leche semi', { delay: 40 });
    const panel = page.locator('[data-test="add-sugerencias"]');
    await expect(panel).toBeVisible();
    const fila = panel.locator('.detail__sug').filter({ hasText: 'Leche semidesnatada' });
    await expect(fila.first()).toBeVisible();

    await fila.first().click();
    // La eleccion reemplaza el nombre, no toda la linea: quien escribio «2kg » conserva su cantidad.
    await expect(page.locator('[data-test="add-input"]')).toHaveValue('Leche semidesnatada');
    await expect(panel).toHaveCount(0);

    await page.locator('[data-test="add-submit"]').click();
    await expect(row_(page, 'Leche semidesnatada')).toHaveCount(1);
  });

  test('sin tocar ninguna hoja, Enter manda lo tecleado tal cual', async ({ page }) => {
    await openNewList(page, 'r35-sug-enter');
    await page.locator('[data-test="add-input"]').pressSequentially('leche semi', { delay: 40 });
    await expect(page.locator('[data-test="add-sugerencias"]')).toBeVisible();

    // El panel esta abierto pero NADIE resalta una hoja: Enter no elige, envia. Es la garantia de
    // que el autocompletado no secuestra la escritura de siempre.
    await page.locator('[data-test="add-input"]').press('Enter');
    await expect(row_(page, 'leche semi')).toHaveCount(1);
  });
});

test.describe('cerrar la compra baja el carro a la despensa', () => {
  test('la linea comprada, con su precio, aparece en la despensa y el aviso lo dice', async ({
    page
  }) => {
    await openNewList(page, 'r35-cierre', 'Familia');
    await page.locator('[data-test="add-input"]').fill('Pan de pueblo');
    await page.locator('[data-test="add-submit"]').click();
    await expect(row_(page, 'Pan de pueblo')).toHaveCount(1);

    await priceRow(page, 'Pan de pueblo', '2,40');
    await row_(page, 'Pan de pueblo').locator('[data-test="check"]').click();

    await page.locator('[data-test="complete"]').click();
    // El recibo del cierre ya no es solo dinero: una linea se fue al inventario, y se dice.
    await expect(page.locator('.toast--success').filter({ hasText: /inventario/i })).toBeVisible();

    // Y la prueba del algodon: la ficha existe en la despensa con lo comprado.
    await page.goto('/pantry');
    await expect(
      page.locator('[data-test="pantry-tabla-inventario"]').getByText('Pan de pueblo')
    ).toBeVisible({ timeout: 10000 });
  });
});
