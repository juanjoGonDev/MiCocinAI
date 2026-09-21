import { expect, test } from '../fixtures';
import { registerAndGoto } from '../helpers/auth';
import { watchRequests } from '../helpers/request-watch';

/**
 * El bucle de peticiones, medido desde fuera.
 *
 * Dos formas tiene un calendario (o un visor de logs) de quedarse mirando: pedir el mismo
 * rango otra vez porque la respuesta alimenta lo que se mira, y reconectar un stream que
 * no cuaja. Ninguna se ve en un test de «el titulo cambia cuando pulso ›»: se ve en el
 * numero de peticiones, y ese numero no lo miraba nadie.
 *
 * El umbral no es un numero redondo: son 3 repeticiones de la MISMA URL en 1,5 s. La app
 * real, navegando normal, no llega —cada accion pide URL distintas—, y el bug de las
 * rondas anteriores (un `computed` cebando a si mismo) llegaba en menos de un segundo.
 */

test.describe('presupuesto de peticiones en el stack de produccion', () => {
  test('la agenda y la cesta no repiten la misma peticion', async ({ page }) => {
    const watch = watchRequests(page);
    await registerAndGoto(page, '/calendar', 'full-budget');

    for (const label of ['Periodo siguiente', 'Periodo anterior', 'Periodo siguiente', 'Hoy']) {
      await page.getByRole('button', { name: label }).click();
      await page.waitForTimeout(250);
    }
    for (const view of ['Mes', 'Semana', 'Dia']) {
      const tab = page.getByRole('tab', { name: view, exact: true });
      if ((await tab.count()) > 0) {
        await tab.click();
        await page.waitForTimeout(250);
      }
    }

    await page.goto('/shopping');
    await page.locator('[data-test="new-list"]').click();
    await page.locator('[data-test="list-name"]').fill('Cesta con presupuesto');
    await page.locator('[data-test="create-submit"]').click();
    for (const item of ['2 Leche', '1 Pan', '3 Huevos']) {
      await page.locator('[data-test="add-input"]').fill(item);
      await page.locator('[data-test="add-submit"]').click();
    }
    await page.locator('[data-test="item-row"]').first().locator('[data-test="check"]').click();

    // Y se espera un momento: el bucle no es una rafaga, es una mecha.
    await page.waitForTimeout(1500);

    expect(watch.describeProblems()).toBe('sin rachas ni 429');
    // Las pestañas siguen contando lo que hay, con lo que sea que haya en la URL.
    await expect(page.locator('[data-test="tab-todo"]')).toContainText(/Pendientes \(\d+\)/);
  });

  test('el stream de la lista se abre una vez por pestana', async ({ page }) => {
    const watch = watchRequests(page, { windowMs: 2000, maxPerUrl: 1 });
    await registerAndGoto(page, '/shopping', 'full-sse');
    await page.locator('[data-test="new-list"]').click();
    await page.locator('[data-test="list-name"]').fill('Cesta en vivo');
    await page.locator('[data-test="create-submit"]').click();

    // La bandeja y el detalle abren cada una su propio stream (dos URLs distintas, una
    // conexion cada una). Lo que no vale es la MISMA URL dos veces en dos segundos: si el
    // servidor corta el SSE, el reintento tiene que llegar despues de la espera creciente.
    await page.waitForTimeout(2500);
    const streams = watch.entries().filter((entry) => entry.url.includes('/stream/'));
    expect(streams.length).toBeGreaterThanOrEqual(1);
    expect(watch.bursts(), watch.describeProblems()).toEqual([]);
  });
});
