import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { Locator, Page, TestInfo, expect } from '@playwright/test';
import { test } from './fixtures';
import { registerAndGoto } from './helpers/auth';

const TOKEN_KEY = 'hogar:v1:auth_token';

async function tokenOf(page: Page): Promise<string> {
  const token = await page.evaluate((key) => window.localStorage.getItem(key), TOKEN_KEY);
  expect(token).toBeTruthy();
  return token as string;
}

function seedReceipts(databasePath: string, runDirectory: string, userId: string) {
  const relativeDatabasePath = relative(resolve(runDirectory), resolve(databasePath));
  if (isAbsolute(relativeDatabasePath) || relativeDatabasePath.startsWith('..')) {
    throw new Error('DATABASE_PATH debe permanecer dentro del directorio aislado del test');
  }

  const reviewId = `receipt-note-${randomUUID()}`;
  const confirmedId = `receipt-note-confirmed-${randomUUID()}`;
  const createdAt = new Date('2026-10-09T00:00:00.000Z').toISOString();
  const database = new Database(databasePath);
  try {
    const insertReceipt = database.prepare(
      `INSERT INTO receipts (
        id, user_id, status, store, purchase_date, currency, total_minor,
        file_url, file_kind, file_name, file_bytes, created_at, confirmed_at
      ) VALUES (?, ?, ?, 'Mercado QA', '2026-10-09', 'EUR', 350, ?, 'png', ?, 8, ?, ?)`
    );
    const insertLine = database.prepare(
      `INSERT INTO receipt_items (
        id, receipt_id, name, quantity, unit, category, price_minor,
        offer_buy, offer_take, note, confidence, position
      ) VALUES (?, ?, 'Producto QA', 1, 'ud', 'other', 350, NULL, NULL, ?, 0.99, 0)`
    );

    insertReceipt.run(
      reviewId,
      userId,
      'review',
      `/api/uploads/receipts/${reviewId}.png`,
      'ticket-note-review.png',
      createdAt,
      null
    );
    insertLine.run(`${reviewId}-line`, reviewId, 'Nota reconocida');
    insertReceipt.run(
      confirmedId,
      userId,
      'confirmed',
      `/api/uploads/receipts/${confirmedId}.png`,
      'ticket-note-confirmed.png',
      createdAt,
      createdAt
    );
    insertLine.run(`${confirmedId}-line`, confirmedId, 'Nota bloqueada');
  } finally {
    database.close();
  }

  return { reviewId, confirmedId, reviewLineId: `${reviewId}-line` };
}

async function expectNoHorizontalOverflow(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  expect(dimensions.content, `sin overflow a ${width}×${height}`).toBeLessThanOrEqual(
    dimensions.viewport
  );
}

async function expectMobileTouchTargets(page: Page) {
  const inputs = page.locator('.tabla__fila input.linea__input');
  const count = await inputs.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const bounds = await inputs.nth(index).boundingBox();
    expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
}

async function expectReadableNote(note: Locator) {
  const ratios = await note.evaluate((element) => {
    const root = document.documentElement;
    const originalTheme = root.getAttribute('data-theme');
    const parseColor = (value: string) => value.match(/[\d.]+/g)?.map(Number) ?? [];
    const luminance = (channels: number[]) => {
      const linear = channels.slice(0, 3).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
    };
    const contrastForTheme = (theme: 'light' | 'dark') => {
      if (theme === 'dark') root.setAttribute('data-theme', theme);
      else root.removeAttribute('data-theme');

      const foreground = parseColor(getComputedStyle(element).color);
      let ancestor: HTMLElement | null = element as HTMLElement;
      let background: number[] = [];
      while (ancestor) {
        const candidate = parseColor(getComputedStyle(ancestor).backgroundColor);
        if (candidate.length >= 3 && (candidate[3] ?? 1) > 0.99) {
          background = candidate;
          break;
        }
        ancestor = ancestor.parentElement;
      }

      const light = Math.max(luminance(foreground), luminance(background));
      const dark = Math.min(luminance(foreground), luminance(background));
      return (light + 0.05) / (dark + 0.05);
    };

    try {
      return {
        light: contrastForTheme('light'),
        dark: contrastForTheme('dark'),
        placeholderOpacity: getComputedStyle(element, '::placeholder').opacity
      };
    } finally {
      if (originalTheme === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', originalTheme);
    }
  });

  expect(ratios.light).toBeGreaterThanOrEqual(4.5);
  expect(ratios.dark).toBeGreaterThanOrEqual(4.5);
  expect(ratios.placeholderOpacity).toBe('1');
}

async function guardarCaptura(page: Page, testInfo: TestInfo, language: string) {
  const directory = process.env.E2E_SCREENSHOT_DIR ?? testInfo.outputPath('screenshots');
  mkdirSync(directory, { recursive: true });
  await page.locator('.tabla').screenshot({
    path: join(directory, `receipt-line-note-${testInfo.project.name}-${language}.png`),
    animations: 'disabled'
  });
}

test.describe('edición de nota de línea del ticket', () => {
  for (const scenario of [
    {
      language: 'es',
      noteLabel: 'Nota de Producto QA',
      notePlaceholder: 'Añadir nota…',
      errorText: 'No se pudo completar la operación.'
    },
    {
      language: 'en',
      noteLabel: 'Note for Producto QA',
      notePlaceholder: 'Add a note…',
      errorText: "Couldn't complete the operation."
    }
  ]) {
    test(`permite crear, corregir y borrar la nota (${scenario.language})`, async ({
      page
    }, info) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(`${error.name}: ${error.message}`));
      await registerAndGoto(page, '/receipts');
      await page.evaluate((language) => {
        window.localStorage.setItem('hogar:v1:language', language);
      }, scenario.language);
      await page.reload();

      const token = await tokenOf(page);
      const profileResponse = await page.request.get('/api/auth/profile', {
        headers: { authorization: `Bearer ${token}` }
      });
      expect(profileResponse.ok()).toBeTruthy();
      const profile = (await profileResponse.json()) as { data: { id: string } };
      const runDirectory = process.env.E2E_RUN_DIR;
      const databasePath = process.env.DATABASE_PATH;
      if (!runDirectory || !databasePath) throw new Error('E2E requiere rutas temporales aisladas');
      const { reviewId, confirmedId, reviewLineId } = seedReceipts(
        databasePath,
        runDirectory,
        profile.data.id
      );

      await page.goto(`/receipts/${reviewId}`);
      const note = page.getByLabel(scenario.noteLabel, { exact: true });
      await expect(note).toHaveValue('Nota reconocida');
      await expect(note).toHaveAttribute('maxlength', '280');
      await expect(note).toHaveAttribute('placeholder', scenario.notePlaceholder);
      await expectReadableNote(note);
      await note.focus();
      await expect(note).toBeFocused();
      expect(await note.evaluate((element) => getComputedStyle(element).borderColor)).not.toBe(
        'rgba(0, 0, 0, 0)'
      );

      const linePath = `/api/receipts/${reviewId}/items/${reviewLineId}`;
      const saveNote = async (value: string, expectedNote: string | null) => {
        const patch = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === linePath && response.request().method() === 'PATCH'
        );
        await note.fill(value);
        await note.press('Tab');
        const response = await patch;
        expect(response.status()).toBe(200);
        const body = response.request().postDataJSON() as { note?: string | null };
        expect(body.note).toBe(expectedNote);
        const detailResponse = await page.request.get(`/api/receipts/${reviewId}`, {
          headers: { authorization: `Bearer ${token}` }
        });
        expect((await detailResponse.json()).data.lines[0].note).toBe(expectedNote);
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        });
      };

      await saveNote('Nota corregida', 'Nota corregida');

      if (info.project.name === 'chromium') {
        await expectNoHorizontalOverflow(page, 1440, 900);
        await expect(note).toBeVisible();
        await guardarCaptura(page, info, scenario.language);
        await expectNoHorizontalOverflow(page, 320, 740);
        await expectMobileTouchTargets(page);
      } else {
        await expectNoHorizontalOverflow(page, 390, 844);
        await expect(note).toBeVisible();
        await expectMobileTouchTargets(page);
        await guardarCaptura(page, info, scenario.language);
        await expectNoHorizontalOverflow(page, 320, 740);
        await expectMobileTouchTargets(page);
      }

      await saveNote('', null);
      await page.reload();
      await expect(note).toHaveValue('');

      await page.route(`**${linePath}`, (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'SYNTHETIC_FAILURE' })
        })
      );
      const failedPatch = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === linePath && response.request().method() === 'PATCH'
      );
      await note.fill('Borrador conservado');
      await note.press('Tab');
      expect((await failedPatch).status()).toBe(503);
      await expect(note).toHaveValue('Borrador conservado');
      await expect(
        page.locator('.toast--error').filter({ hasText: scenario.errorText })
      ).toBeVisible();
      await page.unroute(`**${linePath}`);

      await page.goto(`/receipts/${confirmedId}`);
      await expect(page.getByText('Nota bloqueada', { exact: true })).toBeVisible();
      await expect(page.getByLabel(scenario.noteLabel, { exact: true })).toHaveCount(0);
      expect(pageErrors).toEqual([]);
    });
  }
});
