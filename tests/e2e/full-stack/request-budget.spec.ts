import { expect, test } from '../fixtures';
import { registerUser } from '../helpers/auth';
import { watchRequests } from '../helpers/request-watch';

async function expectNoRepeatAfterIdle(
  page: Parameters<typeof watchRequests>[0],
  watch: ReturnType<typeof watchRequests>
) {
  await page.waitForTimeout(1500);
  expect(watch.describeProblems()).toBe('sin rachas ni 429');
  watch.reset();
}

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
    await registerUser(page, 'full-budget');
    const watch = watchRequests(page);

    const firstRange = page.waitForResponse((response) =>
      response.url().includes('/api/calendar/range')
    );
    await page.goto('/calendar');
    expect((await firstRange).status()).toBe(200);
    const calendarBody = page.locator('.cal-body');
    await expect(calendarBody).toHaveAttribute('aria-busy', 'false');
    await expectNoRepeatAfterIdle(page, watch);

    const assertRangeSettles = async (action: () => Promise<void>) => {
      watch.reset();
      const range = page.waitForResponse((response) =>
        response.url().includes('/api/calendar/range')
      );
      await action();
      expect((await range).status()).toBe(200);
      await expect(calendarBody).toHaveAttribute('aria-busy', 'false');
      await expectNoRepeatAfterIdle(page, watch);
    };

    for (const label of ['Periodo siguiente', 'Periodo anterior', 'Periodo siguiente', 'Hoy']) {
      await assertRangeSettles(() => page.getByRole('button', { name: label }).click());
    }

    const tabs = page.getByRole('tab');
    for (let index = 0; index < (await tabs.count()); index += 1) {
      const tab = tabs.nth(index);
      if ((await tab.getAttribute('aria-selected')) === 'true') continue;
      await assertRangeSettles(() => tab.click());
    }

    await page.goto('/shopping');
    await page.locator('[data-test="new-list"]').click();
    await page.locator('[data-test="list-name"]').fill('Cesta con presupuesto');
    await page.locator('[data-test="create-submit"]').click();
    await expect(page.locator('[data-test="add-input"]')).toBeVisible();
    await expectNoRepeatAfterIdle(page, watch);

    for (const item of ['2 Leche', '1 Pan', '3 Huevos']) {
      await page.locator('[data-test="add-input"]').fill(item);
      await page.locator('[data-test="add-submit"]').click();
      await expect(
        page.locator('[data-test="item-row"]').filter({ hasText: item.replace(/^\d+\s*/, '') })
      ).toBeVisible();
      await expectNoRepeatAfterIdle(page, watch);
    }
    await page.locator('[data-test="item-row"]').first().locator('[data-test="check"]').click();
    await expectNoRepeatAfterIdle(page, watch);

    // Los mutantes intencionales quedan fuera de la ventana de reposo que sigue.
    await watch.reset();
    await page.waitForTimeout(1500);
    expect(watch.describeProblems()).toBe('sin rachas ni 429');
    // Las pestañas siguen contando lo que hay, con lo que sea que haya en la URL.
    await expect(page.locator('[data-test="tab-todo"]')).toContainText(/Pendientes \(\d+\)/);
  });

  test('el stream de la lista se abre una vez por pestana', async ({ page }) => {
    await registerUser(page, 'full-sse');
    const watch = watchRequests(page, {
      windowMs: 2000,
      maxPerUrl: 1,
      // §12aj permite leer la cola cada segundo mientras se observa; no es un bucle SSE.
      ignore: /\.(js|css|svg|png|woff2?|ico|json)(\?|$)|\/api\/receipts\/queue(?:\?|$)/
    });
    await page.goto('/shopping');
    await expect(page.locator('[data-test="new-list"]')).toBeVisible();
    await expect
      .poll(
        () => watch.entries().filter((entry) => entry.url.includes('/api/shopping/stream/')).length
      )
      .toBe(1);

    await page.locator('[data-test="new-list"]').click();
    await page.locator('[data-test="list-name"]').fill('Cesta en vivo');
    await page.locator('[data-test="create-submit"]').click();
    await expect(page.locator('[data-test="add-input"]')).toBeVisible();
    await expect
      .poll(
        () => watch.entries().filter((entry) => entry.url.includes('/api/shopping/stream/')).length
      )
      .toBe(2);

    // Bandeja y detalle abren su propia URL (una por pantalla); tras resetear el historial,
    // cualquier nueva conexión es un reintento, no una recarga intencional.
    const streams = watch.entries().filter((entry) => entry.url.includes('/api/shopping/stream/'));
    const paths = streams.map((entry) => new URL(entry.url.replace(/^[A-Z]+\s+/, '')).pathname);
    expect(new Set(paths).size).toBe(2);

    watch.reset();
    await page.waitForTimeout(2500);
    expect(watch.entries().filter((entry) => entry.url.includes('/api/shopping/stream/'))).toEqual(
      []
    );
    expect(watch.bursts(), watch.describeProblems()).toEqual([]);
  });
});
