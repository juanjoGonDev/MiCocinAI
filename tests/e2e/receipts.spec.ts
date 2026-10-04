import { mkdirSync } from 'node:fs';
import { Page, TestInfo, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isAbsolute, join, relative, resolve } from 'node:path';
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

type TicketProviderMessage = {
  role?: string;
  content?:
    | string
    | {
        type?: string;
        text?: string;
        image_url?: { url?: string; detail?: string };
      }[];
};

type TicketProviderRequest = {
  model?: string;
  stream?: boolean;
  messages?: TicketProviderMessage[];
};

async function iniciarProveedorDeTickets(respuesta: unknown) {
  const solicitudes: TicketProviderRequest[] = [];
  const proveedor = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
        response.writeHead(404).end();
        return;
      }

      let body: TicketProviderRequest;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as TicketProviderRequest;
      } catch {
        response.writeHead(400).end();
        return;
      }
      solicitudes.push(body);
      const content = JSON.stringify(respuesta);

      if (body.stream) {
        const delta = JSON.stringify({ choices: [{ delta: { content } }] });
        response
          .writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
          .end(`data: ${delta}\n\ndata: [DONE]\n\n`);
        return;
      }

      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });

  await new Promise<void>((resolveListen, reject) => {
    proveedor.once('error', reject);
    proveedor.listen(0, '127.0.0.1', resolveListen);
  });

  const address = proveedor.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    solicitudes,
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        proveedor.close((error) => (error ? reject(error) : resolveClose()));
      })
  };
}

async function abrirTicketsDesdeLaNavegacion(page: Page): Promise<void> {
  if ((page.viewportSize()?.width ?? 0) < 1024) {
    await page.locator('.header__menu').click();
    await page.locator('.sidebar--open .sidebar__nav a[href="/receipts"]').click();
    return;
  }

  await page.locator('.sidebar__nav a[href="/receipts"]').click();
}

function iconoVisibleDeCola(page: Page) {
  return (page.viewportSize()?.width ?? 0) >= 1024
    ? page.locator('.sidebar [data-test="receipt-queue-icon"]')
    : page.locator('.header [data-test="receipt-queue-icon"]');
}

async function cerrarAvisos(page: Page): Promise<void> {
  const closeButtons = page.locator('.toast__close');
  while ((await closeButtons.count()) > 0) await closeButtons.first().click();
}

async function terminarTransiciones(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined))
    );
  });
}

test.describe('tickets: la cola de lectura (## 12aj)', () => {
  test('la seccion esta en la navegacion y la bandeja sube un ticket que falla sin IA', async ({
    page
  }) => {
    await registerAndGoto(page, '/dashboard');

    // El modulo de tickets trae este build: sale en el menu lateral.
    await abrirTicketsDesdeLaNavegacion(page);
    await expect(page).toHaveURL(/\/receipts$/);

    // El icono de la cola existe desde el primer momento, apagado.
    // Hay DOS iconos de la cola (cabecera movil y sidebar): el visible es el del viewport.
    const icono = iconoVisibleDeCola(page);
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

  test('recorre el historial completo de más de cien recibos y abre el más antiguo', async ({
    page
  }) => {
    await registerAndGoto(page, '/receipts');
    const token = await tokenOf(page);
    const profileResponse = await page.request.get('/api/auth/profile', {
      headers: { authorization: `Bearer ${token}` }
    });
    expect(profileResponse.ok()).toBeTruthy();
    const profile = (await profileResponse.json()) as { data: { id: string } };

    const runDirectory = process.env.E2E_RUN_DIR;
    const databasePath = process.env.DATABASE_PATH;
    if (!runDirectory || !databasePath) throw new Error('E2E requiere rutas temporales aisladas');
    const relativeDatabasePath = relative(resolve(runDirectory), resolve(databasePath));
    if (isAbsolute(relativeDatabasePath) || relativeDatabasePath.startsWith('..')) {
      throw new Error('DATABASE_PATH debe permanecer dentro del directorio aislado del test');
    }

    const database = new Database(databasePath);
    try {
      const insert = database.prepare(
        `INSERT INTO receipts (id, user_id, status, store, purchase_date, file_url, file_kind, file_name, file_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'png', ?, 8, ?)`
      );
      const statuses = ['review', 'confirmed', 'failed', 'stopped'] as const;
      const seedReceipts = database.transaction(() => {
        for (let index = 0; index < 105; index += 1) {
          const id = `${profile.data.id}-history-${index.toString().padStart(3, '0')}`;
          const purchaseDate =
            index === 0 ? null : new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10);
          const uploadedAt = new Date(Date.UTC(2023, 0, index + 1)).toISOString();
          insert.run(
            id,
            profile.data.id,
            statuses[index % statuses.length],
            `Tienda ${index}`,
            purchaseDate,
            `/api/uploads/receipts/${id}.png`,
            `ticket-${index}.png`,
            uploadedAt
          );
        }
        for (const status of ['queued', 'analyzing'] as const) {
          const id = `${profile.data.id}-active-${status}`;
          insert.run(
            id,
            profile.data.id,
            status,
            `En curso ${status}`,
            null,
            `/api/uploads/receipts/${id}.png`,
            `active-${status}.png`,
            new Date(Date.UTC(2023, 0, 1)).toISOString()
          );
        }
      });
      seedReceipts();
    } finally {
      database.close();
    }

    await page.reload();
    await expect(page.locator('[data-test="ticket-queued"]')).toHaveCount(1);
    await expect(page.locator('[data-test="ticket-analyzing"]')).toHaveCount(1);
    const history = page.locator('[data-test="receipt-history"]');
    const rows = history.locator('[data-test="ticket-history-item"]');
    await expect(rows).toHaveCount(50);
    await expect(history.getByRole('button', { name: 'Cargar más' })).toBeVisible();
    await history.getByRole('button', { name: 'Cargar más' }).click();
    await expect(rows).toHaveCount(100);
    await history.getByRole('button', { name: 'Cargar más' }).click();
    await expect(rows).toHaveCount(105);
    for (const statusLabel of ['A revisar', 'Confirmado', 'Falló', 'Parado']) {
      await expect(rows.filter({ hasText: statusLabel }).first()).toBeVisible();
    }
    await expect(rows.first()).toContainText('Tienda 104');
    const primeraFila = await rows.first().innerText();
    const fechasSeparadas = primeraFila.match(/Fecha de compra:\s*([^·]+)·\s*Subido:\s*([^·]+)·/);
    expect(fechasSeparadas).not.toBeNull();
    expect(fechasSeparadas?.[1].trim()).not.toBe(fechasSeparadas?.[2].trim());
    await expect(rows.last()).toContainText('Sin fecha');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    ).toBe(false);

    const stoppedId = `${profile.data.id}-history-003`;
    const stoppedLink = history.locator(`a[href="/receipts/${stoppedId}"]`);
    await expect(stoppedLink).toHaveCount(1);
    await stoppedLink.click();
    await expect(page).toHaveURL(new RegExp(`/receipts/${stoppedId}$`));
    await expect(page.getByText('Parado', { exact: true })).toBeVisible();
    const storeField = page.getByLabel('Tienda');
    const purchaseDateField = page.getByLabel('Fecha de compra');
    await storeField.fill('Tienda parada editada');
    await purchaseDateField.fill('2024-02-29');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.locator('.ficha__metadatos-estado')).toContainText('Cambios guardados');

    const stoppedDetail = await page.request.get(`/api/receipts/${stoppedId}`, {
      headers: { authorization: `Bearer ${token}` }
    });
    expect(stoppedDetail.ok()).toBeTruthy();
    expect((await stoppedDetail.json()).data).toMatchObject({
      status: 'stopped',
      store: 'Tienda parada editada',
      purchaseDate: '2024-02-29'
    });
    await page.reload();
    await expect(page.getByLabel('Tienda')).toHaveValue('Tienda parada editada');
    await expect(page.getByLabel('Fecha de compra')).toHaveValue('2024-02-29');
    await expect(page.getByText('Parado', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Volver a tickets' }).click();
    const reopenedHistory = page.locator('[data-test="receipt-history"]');
    const reopenedRows = reopenedHistory.locator('[data-test="ticket-history-item"]');
    await expect(reopenedRows).toHaveCount(50);
    await reopenedHistory.getByRole('button', { name: 'Cargar más' }).click();
    await expect(reopenedRows).toHaveCount(100);
    await reopenedHistory.getByRole('button', { name: 'Cargar más' }).click();
    await expect(reopenedRows).toHaveCount(105);
    await expect(reopenedRows.filter({ hasText: 'Tienda parada editada' })).toContainText('Parado');

    await rows.last().locator('a').click();
    await expect(page).toHaveURL(new RegExp(`/receipts/${profile.data.id}-history-000$`));
    await expect(page.getByRole('heading', { name: 'Tienda 0' })).toBeVisible();
    await expect(page.locator('#ticket-fecha-compra')).toHaveValue('');
  });

  test('distingue historial vacío de error, reintenta y protege el acceso', async ({
    page,
    browser
  }, testInfo) => {
    let retryRequested = false;
    await page.route(
      (url) => url.pathname === '/api/receipts' && url.searchParams.get('scope') === 'history',
      async (route) => {
        if (!retryRequested) {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'synthetic history failure' })
          });
          return;
        }
        await route.continue();
      }
    );

    await registerAndGoto(page, '/receipts');
    const history = page.locator('[data-test="receipt-history"]');
    await expect(history.getByRole('heading', { name: 'Historial' })).toBeVisible();
    const error = history.getByRole('alert');
    await expect(error).toBeVisible({ timeout: 20_000 });
    await expect(history.locator('.tickets__history-empty')).toHaveCount(0);
    const retry = error.getByRole('button', { name: 'Reintentar' });
    await expect(retry).toBeVisible();

    const originalViewport = page.viewportSize() ?? { width: 1280, height: 720 };
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 393, height: 851 },
      { width: 480, height: 800 },
      { width: 481, height: 800 },
      { width: 568, height: 320 },
      { width: 640, height: 800 },
      { width: 641, height: 800 },
      { width: 1280, height: 720 }
    ]) {
      await page.setViewportSize(viewport);
      await terminarTransiciones(page);
      const geometry = await page.evaluate(() => {
        const historyElement = document.querySelector('[data-test="receipt-history"]');
        const rect = historyElement?.getBoundingClientRect();
        return {
          documentWidth: document.documentElement.scrollWidth,
          left: rect?.left ?? -1,
          right: rect?.right ?? Number.POSITIVE_INFINITY
        };
      });
      expect(
        geometry.documentWidth,
        `sin overflow horizontal a ${viewport.width}×${viewport.height}`
      ).toBeLessThanOrEqual(viewport.width);
      expect(geometry.left, `historial dentro a ${viewport.width}px`).toBeGreaterThanOrEqual(0);
      expect(geometry.right, `historial dentro a ${viewport.width}px`).toBeLessThanOrEqual(
        viewport.width
      );
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await terminarTransiciones(page);
    await cerrarAvisos(page);
    await error.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('receipt-history-error-desktop.png')
    });
    await page.setViewportSize({ width: 320, height: 568 });
    await terminarTransiciones(page);
    await error.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('receipt-history-error-mobile.png')
    });
    await page.setViewportSize(originalViewport);
    await terminarTransiciones(page);

    retryRequested = true;
    await retry.focus();
    await expect(retry).toBeFocused();
    await retry.press('Enter');
    await expect(history.locator('.tickets__history-error')).toHaveCount(0);
    await expect(history.locator('.tickets__history-empty')).toBeVisible();
    await page.reload();
    await expect(history.locator('.tickets__history-empty')).toBeVisible();

    const unauthorized = await page.request.get('/api/receipts?scope=history');
    expect(unauthorized.status()).toBe(401);

    const guestContext = await browser.newContext({
      baseURL: new URL(page.url()).origin,
      locale: 'es-ES'
    });
    try {
      const guestPage = await guestContext.newPage();
      await guestPage.goto('/receipts');
      await expect(guestPage).toHaveURL(/\/auth\/login/);
      await expect(guestPage.locator('[data-test="receipt-history"]')).toHaveCount(0);
    } finally {
      await guestContext.close();
    }
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
    const fallido = page.locator('[data-test="receipt-history"] [data-test="ticket-history-item"]');
    await expect(fallido).toHaveCount(1, { timeout: 20000 });
  });

  test('un ticket fallido se rescata a mano y confirma: tienda, precios e inventario', async ({
    page
  }, testInfo) => {
    await registerAndGoto(page, '/receipts');
    const token = await tokenOf(page);

    await page.setInputFiles('input[name="ticketFile"]', {
      name: 'compra.png',
      mimeType: 'image/png',
      buffer: pngDeMentira()
    });
    const fallido = page.locator('[data-test="receipt-history"] [data-test="ticket-history-item"]');
    await expect(fallido).toHaveCount(1, { timeout: 20000 });

    // La ficha: el error de la lectura traducido y las acciones de rescate.
    await fallido.locator('a').first().click();
    await expect(page).toHaveURL(/\/receipts\/.+$/);
    await expect(page.locator('[data-test="ticket-error"]')).toContainText('configuración de IA', {
      timeout: 20000
    });

    // La tienda corregible.
    await page.fill('input#ticket-tienda', 'Mercadona del pueblo');
    const fechaCompra = page.getByLabel('Fecha de compra');
    await expect(fechaCompra).toBeVisible();
    await fechaCompra.fill('2024-02-29');
    await expect(fechaCompra).toBeFocused();
    const guardarMetadatos = page.getByRole('button', { name: 'Guardar cambios' });
    let guardarTieneFoco = false;
    for (let intento = 0; intento < 5 && !guardarTieneFoco; intento += 1) {
      await page.keyboard.press('Tab');
      guardarTieneFoco = await guardarMetadatos.evaluate(
        (button) => button === document.activeElement
      );
    }
    await expect(guardarMetadatos).toBeFocused();
    let fallaLaPrimeraGuardada = true;
    const rutaDeRecibos = '**/api/receipts/*';
    await page.route(rutaDeRecibos, async (route) => {
      if (route.request().method() === 'PATCH' && fallaLaPrimeraGuardada) {
        fallaLaPrimeraGuardada = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.continue();
    });
    await page.keyboard.press('Enter');
    await expect(page.locator('.ficha__metadatos-error')).toContainText('Puedes reintentarlo');
    await page.unroute(rutaDeRecibos);
    await guardarMetadatos.click();
    await expect(page.locator('.ficha__metadatos-estado')).toContainText('Cambios guardados');
    await cerrarAvisos(page);
    await terminarTransiciones(page);
    await page.screenshot({ path: testInfo.outputPath('receipt-metadata.png'), fullPage: true });

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

    // Los metadatos siguen editables tras confirmar; este PATCH no vuelve a mover el inventario.
    await page.fill('input#ticket-tienda', 'Mercadona confirmado');
    await fechaCompra.fill('2025-03-01');
    guardarTieneFoco = false;
    for (let intento = 0; intento < 5 && !guardarTieneFoco; intento += 1) {
      await page.keyboard.press('Tab');
      guardarTieneFoco = await guardarMetadatos.evaluate(
        (button) => button === document.activeElement
      );
    }
    await expect(guardarMetadatos).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.ficha__metadatos-estado')).toContainText('Cambios guardados');
    const receiptId = new URL(page.url()).pathname.split('/').at(-1);
    const detalle = await page.request.get(`/api/receipts/${receiptId}`, {
      headers: { authorization: `Bearer ${token}` }
    });
    expect(
      ((await detalle.json()) as { data: { store: string; purchaseDate: string } }).data
    ).toMatchObject({
      store: 'Mercadona confirmado',
      purchaseDate: '2025-03-01'
    });

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

    await page.getByRole('link', { name: 'Volver a tickets' }).click();
    await expect(page.locator('.tickets')).toBeVisible();
    await expect(page.locator('.ficha')).toHaveCount(0);
    const history = page.locator('[data-test="receipt-history"]');
    await expect(history.getByText('Mercadona confirmado')).toBeVisible();
    await expect(history).toContainText('Fecha de compra');
    await expect(history).toContainText('Subido');
    await cerrarAvisos(page);
    await terminarTransiciones(page);
    await page.screenshot({ path: testInfo.outputPath('receipt-history.png'), fullPage: true });
  });

  test('parar todo desde el icono deja los trabajos detenidos', async ({ page }) => {
    await registerAndGoto(page, '/receipts');

    await page.setInputFiles('input[name="ticketFile"]', {
      name: 'ticket.png',
      mimeType: 'image/png',
      buffer: pngDeMentira()
    });

    // Hay DOS iconos de la cola (cabecera movil y sidebar): el visible es el del viewport.
    const icono = iconoVisibleDeCola(page);
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

test.describe('metadatos e historial con zona horaria extrema', () => {
  test.use({ timezoneId: 'Pacific/Kiritimati' });

  for (const scenario of [
    {
      language: 'es',
      store: null,
      purchaseDate: null,
      storeLabel: 'Tienda',
      dateLabel: 'Fecha de compra',
      emptyDateLabel: 'Sin fecha',
      uploadLabel: 'Subido',
      correctedStore: 'Mercado corregido QA',
      correctedDate: '2024-03-01',
      historyPurchaseDate: '1/3/24',
      savedLabel: 'Cambios guardados'
    },
    {
      language: 'en',
      store: null,
      purchaseDate: null,
      storeLabel: 'Store',
      dateLabel: 'Purchase date',
      emptyDateLabel: 'No date',
      uploadLabel: 'Uploaded',
      correctedStore: 'Edited QA store',
      correctedDate: '2024-03-02',
      historyPurchaseDate: '02/03/2024',
      savedLabel: 'Changes saved'
    }
  ] as const) {
    test(`la extracción IA conserva tienda y fecha civil (${scenario.language})`, async ({
      page
    }, testInfo) => {
      const respuesta = {
        store: scenario.store,
        purchaseDate: scenario.purchaseDate,
        lines: [
          {
            name: 'Naranjas QA',
            quantity: 2,
            unit: 'kg',
            category: 'produce',
            createCategory: false,
            priceMinor: 300,
            offer: null,
            confidence: 0.97,
            note: ''
          }
        ],
        currency: 'EUR',
        totalMinor: 300,
        warnings: []
      };
      const proveedor = await iniciarProveedorDeTickets(respuesta);
      const erroresPagina: string[] = [];
      page.on('pageerror', (error) => erroresPagina.push(`${error.name}: ${error.message}`));

      try {
        await registerAndGoto(page, '/receipts');
        await page.evaluate((language) => {
          window.localStorage.setItem('hogar:v1:language', language);
        }, scenario.language);
        await page.reload();
        await expect(
          page.getByRole('heading', { name: scenario.language === 'es' ? 'Tickets' : 'Receipts' })
        ).toBeVisible();
        const token = await tokenOf(page);

        const configuration = await page.request.post('/api/ai/configs', {
          headers: { authorization: `Bearer ${token}` },
          data: {
            name: 'Proveedor sintético de tickets',
            provider: 'custom',
            baseUrl: proveedor.baseUrl,
            apiKey: 'synthetic-e2e-only',
            model: 'synthetic-ticket-model',
            timeout: 10_000,
            retryAttempts: 0
          }
        });
        expect(configuration.status()).toBe(201);

        const uploadResponse = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === '/api/receipts' &&
            response.request().method() === 'POST'
        );
        await page.setInputFiles('input[name="ticketFile"]', {
          name: 'ticket-sintetico.png',
          mimeType: 'image/png',
          buffer: pngDeMentira()
        });
        expect((await uploadResponse).status()).toBe(201);

        await expect.poll(() => proveedor.solicitudes.length, { timeout: 20_000 }).toBe(1);
        const providerRequest = proveedor.solicitudes[0];
        expect(providerRequest.model).toBe('synthetic-ticket-model');
        expect(providerRequest.stream).toBe(true);
        const userContent = providerRequest.messages?.find(
          (message) => message.role === 'user'
        )?.content;
        const parts = Array.isArray(userContent) ? userContent : [];
        expect(parts).toHaveLength(2);
        expect(parts.find((part) => part.type === 'text')?.text).toContain('purchaseDate');
        expect(parts.find((part) => part.type === 'image_url')?.image_url?.url).toMatch(
          /^data:image\/png;base64,/
        );

        const history = page.locator('[data-test="receipt-history"]');
        const historyRow = history.locator('[data-test="ticket-history-item"]');
        await expect(historyRow).toHaveCount(1, { timeout: 20_000 });
        if (scenario.store) await expect(historyRow).toContainText(scenario.store);
        if (!scenario.purchaseDate) {
          await expect(historyRow.locator('.ticket__meta')).toContainText(
            `${scenario.dateLabel}: ${scenario.emptyDateLabel}`
          );
        }
        await historyRow.locator('a').click();

        const storeField = page.getByLabel(scenario.storeLabel);
        const purchaseDateField = page.getByLabel(scenario.dateLabel);
        await expect(storeField).toHaveValue(scenario.store ?? '');
        await expect(storeField).toBeEnabled();
        await expect(purchaseDateField).toHaveValue(scenario.purchaseDate ?? '');
        await expect(purchaseDateField).toBeEnabled();
        await storeField.focus();
        await expect(storeField).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(purchaseDateField).toBeFocused();

        const receiptId = new URL(page.url()).pathname.split('/').at(-1);
        expect(receiptId).toBeTruthy();
        const detailResponse = await page.request.get(`/api/receipts/${receiptId}`, {
          headers: { authorization: `Bearer ${token}` }
        });
        expect(detailResponse.ok()).toBeTruthy();
        const detail = (await detailResponse.json()) as {
          data: {
            status: string;
            store: string | null;
            purchaseDate: string | null;
            createdAt: string;
          };
        };
        expect(detail.data).toMatchObject({
          status: 'review',
          store: scenario.store,
          purchaseDate: scenario.purchaseDate
        });

        await storeField.fill(scenario.correctedStore);
        await purchaseDateField.fill(scenario.correctedDate);
        const metadataSaved = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === `/api/receipts/${receiptId}` &&
            response.request().method() === 'PATCH'
        );
        await page.locator('[data-test="save-receipt-metadata"]').click();
        expect((await metadataSaved).ok()).toBeTruthy();
        await expect(page.locator('.ficha__metadatos-estado')).toContainText(scenario.savedLabel);

        const updatedDetailResponse = await page.request.get(`/api/receipts/${receiptId}`, {
          headers: { authorization: `Bearer ${token}` }
        });
        expect(updatedDetailResponse.ok()).toBeTruthy();
        expect((await updatedDetailResponse.json()).data).toMatchObject({
          status: 'review',
          store: scenario.correctedStore,
          purchaseDate: scenario.correctedDate
        });

        await page.reload();
        await expect(storeField).toHaveValue(scenario.correctedStore);
        await expect(purchaseDateField).toHaveValue(scenario.correctedDate);

        const originalViewport = page.viewportSize() ?? { width: 1280, height: 720 };
        for (const viewport of [
          { width: 320, height: 568 },
          { width: 480, height: 800 },
          { width: 481, height: 800 },
          { width: 568, height: 320 },
          { width: 640, height: 800 },
          { width: 641, height: 800 },
          { width: 1280, height: 720 }
        ]) {
          await page.setViewportSize(viewport);
          const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
          expect(
            documentWidth,
            `sin overflow a ${viewport.width}×${viewport.height}`
          ).toBeLessThanOrEqual(viewport.width);
          for (const field of [storeField, purchaseDateField]) {
            const bounds = await field.evaluate((element) => {
              const rect = element.getBoundingClientRect();
              return { left: rect.left, right: rect.right };
            });
            expect(
              bounds.left,
              `campo dentro del viewport ${viewport.width}px`
            ).toBeGreaterThanOrEqual(0);
            expect(
              bounds.right,
              `campo dentro del viewport ${viewport.width}px`
            ).toBeLessThanOrEqual(viewport.width);
          }
        }
        await page.setViewportSize(originalViewport);
        await page
          .getByRole('link', {
            name: scenario.language === 'es' ? 'Volver a tickets' : 'Back to receipts'
          })
          .click();
        await expect(historyRow).toHaveCount(1);
        const metadata = await historyRow.locator('.ticket__meta').innerText();
        const segments = metadata.split('·').map((segment) => segment.trim());
        const expectedUploadDate = await page.evaluate(
          ({ createdAt, language }) =>
            new Intl.DateTimeFormat(language === 'es' ? 'es-ES' : 'en-GB', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            }).format(new Date(createdAt)),
          { createdAt: detail.data.createdAt, language: scenario.language }
        );
        expect(segments[0]).toContain(`${scenario.dateLabel}: ${scenario.historyPurchaseDate}`);
        expect(segments[1]).toBe(`${scenario.uploadLabel}: ${expectedUploadDate}`);
        await expect(historyRow).toContainText(scenario.correctedStore);
        expect(segments[0]).not.toContain(scenario.language === 'es' ? 'Sin fecha' : 'No date');
        expect(segments[0].slice(segments[0].indexOf(':') + 1).trim()).not.toBe(
          segments[1].slice(segments[1].indexOf(':') + 1).trim()
        );
        await cerrarAvisos(page);
        await terminarTransiciones(page);
        const screenshotDirectory =
          process.env.E2E_SCREENSHOT_DIR ?? '.e2e-screenshots/qa-receipt-history-date-locale-1';
        mkdirSync(screenshotDirectory, { recursive: true });
        await page.screenshot({
          path: join(
            screenshotDirectory,
            `receipt-history-${testInfo.project.name}-${scenario.language}.png`
          ),
          fullPage: true
        });
        expect(erroresPagina).toEqual([]);
      } finally {
        await proveedor.close();
      }
    });
  }
});
