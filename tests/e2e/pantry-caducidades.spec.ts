import { Page, expect } from '@playwright/test';
import { test } from './fixtures';
import { registerAndGoto } from './helpers/auth';

/**
 * La pantalla de caducidades (HOGARIA-SPEC ## 12ak), de punta a punta y SIN proveedor de IA.
 *
 * Lo que se prueba es la promesa de la pantalla, no la calidad de las estimaciones (eso viven
 * los specs de server `caducidades` y `pantry-expiry`): que desde la despensa se llega con un
 * clic y la URL es la suya, que la lista llega ordenada por prisa —caducado, 2 dias, catalogo,
 * sin fecha al final—, que el origen de cada vida se ve (una fecha registrada no es un «≈4 dias»
 * del catalogo), que las cabeceras reordenan, y que «Estimar» sin IA configurada dice lo suyo
 * en vez de un error a secas. El ritmo de compra no se siembra aqui: el API pone «ahora» en
 * cada precio, y dos compras el mismo dia no hacen ritmo.
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

/** Un articulo con stock, por API: la pantalla solo lee. */
async function sembrar(
  page: Page,
  token: string,
  nombre: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  await apiPost(page, '/api/pantry/ingredients', token, {
    name: nombre,
    category: 'other',
    quantity: 2,
    unit: 'unit',
    location: 'pantry',
    ...extra
  });
}

function dia(desplazado: number): string {
  const fecha = new Date();
  fecha.setUTCDate(fecha.getUTCDate() + desplazado);
  return fecha.toISOString().slice(0, 10);
}

const filaDe = (page: import('@playwright/test').Page) => page.locator('[data-test^="cad-fila-"]');
const nombreDe = (page: import('@playwright/test').Page, texto: string | RegExp) =>
  filaDe(page).filter({ hasText: texto });

test.describe('las caducidades de la despensa (## 12ak)', () => {
  test('de la despensa a la pantalla: orden por prisa, origen a la vista, reordenar y estimar sin IA', async ({
    page
  }) => {
    await registerAndGoto(page, '/pantry', 'r39-cad');
    const token = await tokenOf(page);

    // Cuatro casos, uno por origen de vida: fecha caducada, fecha critica, catalogo y nada.
    await sembrar(page, token, 'Yogur natural', { expirationDate: dia(-1) });
    await sembrar(page, token, 'Leche entera', { expirationDate: dia(2) });
    await sembrar(page, token, 'Pan de barra');
    await sembrar(page, token, 'Quinoa real');

    await page.locator('[data-test="pantry-caducidades"]').click();
    await expect(page).toHaveURL(/\/pantry\/caducidades/);
    await expect(page.locator('h1')).toContainText('Caducidades');

    // El resumen cuenta lo que hay: uno caducado, dos esta semana (la leche y el pan del
    // catalogo, que tambien vence en dias), y la quinoa sin fecha conocida.
    const resumen = page.locator('[data-test="cad-resumen"]');
    await expect(resumen).toContainText('1 caducados');
    await expect(resumen).toContainText('2 esta semana');
    await expect(resumen).toContainText('1 sin fecha');

    // La prisa manda: caducado, 2 dias, catalogo (~dias) y lo sin fecha cierra la marcha.
    await expect(filaDe(page)).toHaveCount(4);
    await expect(filaDe(page).nth(0)).toContainText('Yogur natural');
    await expect(filaDe(page).nth(0)).toContainText('Hace 1 días');
    await expect(filaDe(page).nth(1)).toContainText('Leche entera');
    await expect(filaDe(page).nth(1)).toContainText('2 días');
    await expect(filaDe(page).nth(2)).toContainText('Pan de barra');
    // El pan sale del catalogo de bolsillo: origen «Catálogo» y dias con ≈, no fecha.
    await expect(filaDe(page).nth(2)).toContainText('Catálogo');
    await expect(filaDe(page).nth(2)).toContainText('≈');
    await expect(nombreDe(page, 'Leche entera')).toContainText('Fecha');
    // La quinoa no sabe cuando vence y eso tambien se dice.
    await expect(filaDe(page).nth(3)).toContainText('Quinoa real');
    await expect(filaDe(page).nth(3)).toContainText('sin datos');

    // La grafica es la misma historia en barras: la primera es lo caducado.
    await expect(page.locator('[data-test="cad-grafica"] .cad-barra')).toHaveCount(4);
    await expect(page.locator('[data-test="cad-grafica"] .cad-barra').first()).toContainText(
      'Yogur natural'
    );

    // Reordenar por nombre: alfabetico y toggle de vuelta.
    await page.locator('[data-test="cad-orden-nombre"]').click();
    await expect(filaDe(page).nth(0)).toContainText('Leche entera');
    await expect(filaDe(page).nth(3)).toContainText('Yogur natural');
    await page.locator('[data-test="cad-orden-nombre"]').click();
    await expect(filaDe(page).nth(0)).toContainText('Yogur natural');

    // «Estimar» sin IA configurada: la quinoa no esta en el catalogo, asi que el server dice
    // NO_CONFIG y la pantalla lo traduce —configura la IA—, no un error generico.
    await page.locator('[data-test="cad-estimar"]').click();
    await expect(page.locator('[data-test="cad-error"]')).toContainText('Falta configurar la IA');

    // El aviso del planificador (## 12ak en /calendar): lo que caduca en 7 dias, a la vista.
    await page.goto('/calendar');
    await page.getByRole('button', { name: /Planificar IA/ }).click();
    await expect(page.locator('[data-test="gen-caducidades"]')).toContainText('Yogur natural');
  });
});
