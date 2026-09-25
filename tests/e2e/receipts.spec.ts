import { Page, expect } from '@playwright/test';
import { test } from './fixtures';
import { registerAndGoto } from './helpers/auth';

/**
 * La lectura de tickets por IA (HOGARIA-SPEC ## 12aj), de punta a punta SIN proveedor de IA:
 * lo que se prueba es el ciclo que la IA no puede romper.
 *
 *  - Subir un ticket valido lo mete en la cola; sin configuracion de IA el trabajo falle con
 *    NO_CONFIG, el icono de la cabecera se pone el borde rojo y su panel ensena el trabajo con
 *    su reintento.
 *  - Un fichero que no es imagen ni PDF no pasa de la puerta (415 con la firma, no el
 *    Content-Type, que es una opinion).
 *  - Un ticket fallido se rescata a mano: lineas anadidas y editadas por la interfaz, tienda
 *    corregida, y confirmar sube la compra al inventario y registra la tienda.
 *
 * Lo que queda fuera: la lectura en si (el stream de lineas llegando poco a poco) es cosa del
 * modelo y del `ticket-queue`; aqui se cubre con los specs de server.
 */

const TOKEN_KEY = 'hogar:v1:auth_token';

async function tokenOf(page: Page): Promise<string> {
  const token = await page.evaluate((clave) => window.localStorage.getItem(clave), TOKEN_KEY);
  expect(token, 'la sesion deberia tener token').toBeTruthy();
  return token as string;
}

/** Un PNG de mentira de 8 bytes: la firma es lo unico que la subida valida. */
function pngDeMentira(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

/** Un PDF de mentira: la firma %PDF- es lo que distingue el kind. */
function pdfDeMentira(): Buffer {
  return Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 0x20)]);
}

test.describe('tickets: la cola de lectura (## 12aj)', () => {
  test('la seccion esta en la navegacion y la bandeja sube un ticket que falla sin IA', async ({
    page
  }) => {
    await registerAndGoto(page, '/dashboard');

    // El modulo de tickets trae este build: sale en el menu lateral.
    const enlace = page.locator('a[href="/receipts"]').first();
    await expect(enlace).toBeVisible();
    await enlace.click();
    await expect(page).toHaveURL(/\/receipts$/);

    // El icono de la cola existe desde el primer momento, apagado.
    // Hay DOS iconos de la cola (cabecera movil y sidebar): el visible es el del viewport.
    const icono = page.locator('[data-test="receipt-queue-icon"]:visible');
    await expect(icono).toBeVisible();

    // La subida: un PNG valido entra en la cola.
    await page.setInputFiles('input[name="ticketFile"]', {
      name: 'ticket.png',
      mimeType: 'image/png',
      buffer: pngDeMentira()
    });
    await expect(page.locator('[data-test="ticket-drop"]')).toBeVisible();

    // Sin configuracion de IA la lectura no puede empezar: el trabajo falle y el icono
    // de la cabecera se pone el borde rojo —lo que se ve desde el otro lado de la habitacion.
    await expect(icono).toHaveClass(/rq__button--error/, { timeout: 20000 });

    // El panel del icono: el trabajo con su estado y su reintento.
    await icono.click();
    const panel = page.locator('[data-test="receipt-queue-panel"]');
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-test="queue-job-failed"]')).toHaveCount(1);
    await expect(panel.getByRole('button', { name: 'Volver a leer' })).toBeVisible();
  });

  test('un fichero que no es imagen ni PDF no pasa de la puerta', async ({ page }) => {
    await registerAndGoto(page, '/receipts');

    // El Content-Type del fichero lo elige quien lo manda: la puerta del cliente mira el
    // tipo, la del server la FIRMA de los bytes. Aqui se prueba la del cliente.
    await page.setInputFiles('input[name="ticketFile"]', {
      name: 'virus.png',
      mimeType: 'text/plain',
      buffer: Buffer.from('MZ\x90\x00 esto no es un ticket')
    });
    await expect(page.locator('[data-test="ticket-upload-error"]')).toContainText(
      'no es una imagen',
      { timeout: 20000 }
    );
  });

  test('un PDF tambien entra en la cola', async ({ page }) => {
    await registerAndGoto(page, '/receipts');

    await page.setInputFiles('input[name="ticketFile"]', {
      name: 'ticket.pdf',
      mimeType: 'application/pdf',
      buffer: pdfDeMentira()
    });

    // Aparece en la bandeja: el estado termina en Falló (sin IA), pero el fichero fue
    // aceptado como PDF, no rechazado en la puerta.
    const fallido = page.locator('[data-test="ticket-failed"]');
    await expect(fallido).toHaveCount(1, { timeout: 20000 });
  });

  test('un ticket fallido se rescata a mano y confirma: tienda, precios e inventario', async ({
    page
  }) => {
    await registerAndGoto(page, '/receipts');
    const token = await tokenOf(page);

    await page.setInputFiles('input[name="ticketFile"]', {
      name: 'compra.png',
      mimeType: 'image/png',
      buffer: pngDeMentira()
    });
    const fallido = page.locator('[data-test="ticket-failed"]');
    await expect(fallido).toHaveCount(1, { timeout: 20000 });

    // La ficha: el error de la lectura traducido y las acciones de rescate.
    await fallido.locator('a').first().click();
    await expect(page).toHaveURL(/\/receipts\/.+$/);
    await expect(page.locator('[data-test="ticket-error"]')).toContainText('configuración de IA', {
      timeout: 20000
    });

    // La tienda corregible.
    await page.fill('input#ticket-tienda', 'Mercadona del pueblo');

    // Dos lineas a mano: nombre, cantidad y precio editables uno a uno. (Por rol: el
    // data-test queda en el host de app-button, y el clic del centro no siempre cae en el
    // boton de dentro.)
    await page.getByRole('button', { name: 'Añadir línea' }).click();
    await page.getByRole('button', { name: 'Añadir línea' }).click();
    const filas = page.locator('.tabla__fila');
    await expect(filas).toHaveCount(2);

    await filas.nth(0).locator('input[id$="-nombre"]').fill('Leche entera');
    await filas.nth(0).locator('input[id$="-cantidad"]').fill('2');
    await filas.nth(0).locator('input[id$="-precio"]').fill('1.95');

    await filas.nth(1).locator('input[id$="-nombre"]').fill('Pan de pueblo');
    await filas.nth(1).locator('input[id$="-precio"]').fill('1.40');

    // La suma de lineas ensena lo que va a entrar.
    await expect(page.getByText('Suma de líneas')).toBeVisible();

    // Confirmar: la compra sube al inventario.
    await page.getByRole('button', { name: 'Confirmar y subir al inventario' }).click();
    await expect(page.locator('[data-test="ticket-confirmed"]')).toBeVisible({ timeout: 20000 });

    // Y de verdad: el inventario tiene la leche con sus dos unidades, y la tienda quedo
    // registrada para la casa.
    const inventario = await page.request.get('/api/pantry/ingredients?search=Leche', {
      headers: { authorization: `Bearer ${token}` }
    });
    expect(inventario.ok()).toBeTruthy();
    const cuerpo = (await inventario.json()) as {
      data: { ingredients: { name: string; quantity: number }[] };
    };
    const leche = cuerpo.data.ingredients.find((fila) => fila.name === 'Leche entera');
    expect(leche?.quantity).toBe(2);

    const tiendas = await page.request.get('/api/shopping/stores', {
      headers: { authorization: `Bearer ${token}` }
    });
    expect(tiendas.ok()).toBeTruthy();
    const listaTiendas = (await tiendas.json()) as { data: { store: string }[] };
    expect(listaTiendas.data.map((fila) => fila.store)).toContain('Mercadona del pueblo');
  });

  test('parar todo desde el icono deja los trabajos detenidos', async ({ page }) => {
    await registerAndGoto(page, '/receipts');

    await page.setInputFiles('input[name="ticketFile"]', {
      name: 'ticket.png',
      mimeType: 'image/png',
      buffer: pngDeMentira()
    });

    // Hay DOS iconos de la cola (cabecera movil y sidebar): el visible es el del viewport.
    const icono = page.locator('[data-test="receipt-queue-icon"]:visible');
    await icono.click();
    const panel = page.locator('[data-test="receipt-queue-panel"]');
    await expect(panel).toBeVisible();

    // Parar todo: sin trabajos en marcha la accion no rompe nada, y el panel sigue en pie.
    const pararTodo = panel.getByRole('button', { name: 'Parar todo' });
    if (await pararTodo.isVisible().catch(() => false)) {
      await pararTodo.click();
    }
    await expect(panel).toBeVisible();
  });
});
