import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { expect, test, type Page } from './fixtures';
import { registerToOnboarding, skipOnboarding } from './helpers/auth';
import { createSyntheticRecipe, deleteSyntheticRecipe } from './helpers/recipe-fixtures';
import {
  AUTHENTICATED_ROUTES,
  ONBOARDING_ROUTE,
  populatedDynamicRoutes,
  PUBLIC_ROUTES,
  type RouteCase,
  type RouteShell
} from './helpers/route-layout-manifest';

type ViewportCase = { width: number; height: number };

const WIDTH_BREAKPOINTS = [
  360, 362, 480, 481, 560, 600, 601, 640, 641, 719, 720, 721, 767, 768, 860, 900, 959, 1023, 1024,
  1100
];

const VIEWPORTS: ViewportCase[] = (() => {
  const widths = new Set([320, 393, 568, 1440, 1920]);
  for (const breakpoint of WIDTH_BREAKPOINTS) {
    widths.add(breakpoint - 1);
    widths.add(breakpoint);
    widths.add(breakpoint + 1);
  }

  return [...widths]
    .sort((left, right) => left - right)
    .map((width) => ({
      width,
      // Keep 568×320 as a real landscape viewport; other widths exercise normal page flow.
      height:
        width === 568 ? 320 : width >= 1920 ? 1080 : width < 768 ? 851 : width < 1024 ? 768 : 900
    }));
})();

const SHELL_HOSTS: Record<RouteShell, string> = {
  auth: 'app-auth-layout',
  invite: 'app-invite',
  onboarding: 'app-onboarding',
  private: 'app-main-layout'
};

const ALL_SHELL_HOSTS = Object.values(SHELL_HOSTS);

function expectedGutter(width: number): number {
  if (width >= 1024) return 32;
  if (width >= 768) return 24;
  return 16;
}

async function checkPageContainer(
  page: Page,
  target: RouteCase,
  viewport: ViewportCase,
  navigateToRoute: boolean
): Promise<string[]> {
  await page.setViewportSize(viewport);
  if (navigateToRoute) await page.goto(target.path, { waitUntil: 'domcontentloaded' });

  const expectedShell = SHELL_HOSTS[target.shell];
  await expect(
    page.locator(expectedShell),
    `${target.path} debe conservar ${expectedShell}`
  ).toHaveCount(1);
  await expect(page.locator(expectedShell)).toBeVisible();
  for (const shell of ALL_SHELL_HOSTS) {
    if (shell !== expectedShell) {
      await expect(
        page.locator(shell),
        `${target.path} no debe montar un shell duplicado`
      ).toHaveCount(0);
    }
  }

  await expect(
    page.locator(target.component),
    `${target.path} debe montar ${target.component}`
  ).toBeVisible();
  if (target.readySelector) {
    await expect(
      page.locator(target.readySelector),
      `${target.path} debe mostrar su vista poblada, no un estado vacío o 404`
    ).toBeVisible();
  }
  if (target.readyContent) {
    await expect(
      page.locator(target.readyContent.selector),
      `${target.path} debe mostrar el registro sintético esperado`
    ).toHaveText(target.readyContent.text);
  }
  const actualUrl = new URL(page.url());
  const expectedUrl = new URL(target.finalPath ?? target.path, page.url());
  const actualPath = `${actualUrl.pathname}${actualUrl.search}${actualUrl.hash}`;
  const expectedPath = `${expectedUrl.pathname}${expectedUrl.search}${expectedUrl.hash}`;
  const mismatches: string[] = [];
  if (actualPath !== expectedPath) {
    await expect
      .poll(() => {
        const current = new URL(page.url());
        return `${current.pathname}${current.search}${current.hash}`;
      }, `${target.path} debe finalizar en ${expectedPath}`)
      .toBe(expectedPath);
  }

  if (target.pageRoot) {
    const roots = page.locator(target.pageRoot);
    await expect(roots, `${target.path} debe tener una superficie raíz`).toHaveCount(1);
    const rootPadding = await roots.evaluate((element) => {
      const style = getComputedStyle(element);
      return [
        Number.parseFloat(style.paddingInlineStart),
        Number.parseFloat(style.paddingInlineEnd)
      ];
    });
    if (rootPadding[0] !== 0 || rootPadding[1] !== 0) {
      mismatches.push(
        `${target.path} @ ${viewport.width}x${viewport.height}: el wrapper de feature duplica el gutter con padding ${rootPadding.join('/')}`
      );
    }
  }

  const frames = page.locator('app-page-container');
  const frameCount = await frames.count();
  if (frameCount !== 1) {
    mismatches.push(
      `${target.path} @ ${viewport.width}x${viewport.height}: esperado 1 app-page-container, actual ${frameCount}`
    );
    return mismatches;
  }

  const geometry = await frames.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const parent = element.parentElement?.getBoundingClientRect();

    return {
      bounded: element.classList.contains('page-container--bounded'),
      maxWidth: style.maxWidth,
      gutterStart: Number.parseFloat(style.paddingInlineStart),
      gutterEnd: Number.parseFloat(style.paddingInlineEnd),
      frameStart: rect.left,
      frameEnd: rect.right,
      parentStart: parent?.left ?? 0,
      parentEnd: parent?.right ?? window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      overflowCandidates: Array.from(document.body.querySelectorAll<HTMLElement>('*'))
        .map((candidate) => {
          const candidateRect = candidate.getBoundingClientRect();
          return {
            tag: candidate.tagName.toLowerCase(),
            className: candidate.getAttribute('class')?.replace(/\s+/g, ' ').slice(0, 80) ?? '',
            right: Math.round(candidateRect.right),
            width: Math.round(candidateRect.width)
          };
        })
        .filter(
          (candidate) =>
            candidate.width > 0 && candidate.right > document.documentElement.clientWidth + 1
        )
        .sort((left, right) => right.right - left.right)
        .slice(0, 5),
      contentStart: rect.left + Number.parseFloat(style.paddingInlineStart),
      contentEnd: rect.right - Number.parseFloat(style.paddingInlineEnd)
    };
  });

  const expected = expectedGutter(viewport.width);
  const tolerance = 1;
  if (!geometry.bounded) {
    mismatches.push(
      `${target.path} @ ${viewport.width}x${viewport.height}: todos los shells deben usar el marco común limitado al ancho de lectura`
    );
  }
  const expectedMaxWidth = '1280px';
  if (geometry.maxWidth !== expectedMaxWidth) {
    mismatches.push(
      `${target.path} @ ${viewport.width}x${viewport.height}: max-width esperado ${expectedMaxWidth}, actual ${geometry.maxWidth}`
    );
  }
  if (geometry.gutterStart !== expected || geometry.gutterEnd !== expected) {
    mismatches.push(
      `${target.path} @ ${viewport.width}x${viewport.height}: gutters esperados ${expected}/${expected}px, actuales ${geometry.gutterStart}/${geometry.gutterEnd}px`
    );
  }
  if (
    geometry.frameStart < geometry.parentStart - tolerance ||
    geometry.frameEnd > geometry.parentEnd + tolerance ||
    geometry.contentStart < geometry.frameStart + expected - tolerance ||
    geometry.contentEnd > geometry.frameEnd - expected + tolerance
  ) {
    mismatches.push(
      `${target.path} @ ${viewport.width}x${viewport.height}: borde exterior del contenedor fuera de su shell o gutter no aplicado a la caja real`
    );
  }
  const contentRoot =
    target.contentRoot ??
    (target.shell === 'private' || target.shell === 'onboarding' ? target.pageRoot : undefined);
  if (contentRoot) {
    const rootLocator = page.locator(contentRoot);
    await expect(rootLocator, `${target.path} debe exponer su raíz de contenido`).toHaveCount(1);
    const root = await rootLocator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        start: rect.left,
        end: rect.right,
        width: rect.width,
        display: style.display,
        maxWidth: style.maxWidth,
        paddingStart: Number.parseFloat(style.paddingInlineStart),
        paddingEnd: Number.parseFloat(style.paddingInlineEnd)
      };
    });
    if (target.expectedRootDisplay && root.display !== target.expectedRootDisplay) {
      mismatches.push(
        `${target.path} @ ${viewport.width}x${viewport.height}: display de raíz esperado ${target.expectedRootDisplay}, actual ${root.display}`
      );
    }
    if (
      Math.abs(root.start - geometry.contentStart) > tolerance ||
      Math.abs(root.end - geometry.contentEnd) > tolerance ||
      root.maxWidth !== 'none' ||
      root.paddingStart !== 0 ||
      root.paddingEnd !== 0
    ) {
      mismatches.push(
        `${target.path} @ ${viewport.width}x${viewport.height}: raíz ${root.width}px (max-width ${root.maxWidth}, padding ${root.paddingStart}/${root.paddingEnd}) no ocupa el contenido común del main (${geometry.contentStart}–${geometry.contentEnd}px)`
      );
    }
  }
  if (geometry.documentWidth > geometry.documentClientWidth + tolerance) {
    mismatches.push(
      `${target.path} @ ${viewport.width}x${viewport.height}: overflow horizontal del documento (${geometry.documentWidth}px > ${geometry.documentClientWidth}px); elementos: ${JSON.stringify(geometry.overflowCandidates)}`
    );
  }

  return mismatches;
}

async function checkRouteAcrossViewports(
  page: Page,
  target: RouteCase,
  mismatches: string[],
  afterViewport?: (viewport: ViewportCase) => Promise<void>
): Promise<void> {
  for (const [index, viewport] of VIEWPORTS.entries()) {
    mismatches.push(...(await checkPageContainer(page, target, viewport, index === 0)));
    await afterViewport?.(viewport);
  }
}

/** Crea exclusivamente filas/configuración sintéticas bajo el usuario que acaba de registrar el test. */
async function createPopulatedDynamicRouteFixtures(page: Page): Promise<{
  categoryId: string;
  productId: string;
  aiConfigId: string;
  inventoryItemId: string;
  shoppingListId: string;
  receiptId: string;
  recipeId: string;
  recipe: Awaited<ReturnType<typeof createSyntheticRecipe>>;
}> {
  const result = await page.evaluate(async () => {
    const token = localStorage.getItem('hogar:v1:auth_token');
    if (!token) throw new Error('No hay token de la cuenta E2E sintética');
    const headers = {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`
    };
    const send = async (path: string, body: unknown) => {
      const response = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(`No se pudo crear fixture sintética (${path}, ${response.status})`);
      }
      return payload.data;
    };

    // Subir el ticket ANTES de crear la config .invalid de cobertura de la cola. La cuenta
    // recién registrada no tiene proveedor: el worker lo mueve a NO_CONFIG sin invocar red externa.
    const receiptForm = new FormData();
    receiptForm.append(
      'file',
      new File(
        [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
        'qa-layout-receipt.png',
        { type: 'image/png' }
      )
    );
    const receiptUpload = await fetch('/api/receipts', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: receiptForm
    });
    const receiptPayload = await receiptUpload.json();
    if (!receiptUpload.ok) {
      throw new Error(
        `No se pudo crear fixture sintética (/api/receipts, ${receiptUpload.status})`
      );
    }
    const receiptId = String(receiptPayload.data.id);
    const deadline = Date.now() + 15_000;
    let receipt = receiptPayload.data;
    while (receipt.status === 'queued' || receipt.status === 'analyzing') {
      if (Date.now() >= deadline) {
        throw new Error('La fixture sintética de ticket no llegó al estado terminal esperado');
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      const response = await fetch(`/api/receipts/${encodeURIComponent(receiptId)}`, {
        headers: { authorization: `Bearer ${token}` }
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          `No se pudo leer fixture sintética (/api/receipts/:id, ${response.status})`
        );
      }
      receipt = payload.data;
    }
    if (receipt.status !== 'failed' || receipt.error !== 'NO_CONFIG') {
      throw new Error('La fixture de ticket debe fallar de forma determinista con NO_CONFIG');
    }
    const receiptMetadata = await fetch(`/api/receipts/${encodeURIComponent(receiptId)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ store: 'QA Layout Receipt Store', purchaseDate: '2026-10-02' })
    });
    if (!receiptMetadata.ok) {
      throw new Error(
        `No se pudieron fijar metadatos de fixture (/api/receipts/:id, ${receiptMetadata.status})`
      );
    }

    const inventoryItem = await send('/api/pantry/ingredients', {
      name: 'QA Layout Inventory Item',
      category: 'dairy',
      quantity: 2,
      unit: 'unit',
      location: 'pantry'
    });
    const shoppingList = await send('/api/shopping/lists', {
      name: 'QA Layout Shopping List',
      store: 'QA Store'
    });
    await send(`/api/shopping/lists/${encodeURIComponent(String(shoppingList.id))}/items`, {
      name: 'QA Layout Shopping Item',
      quantity: 1,
      unit: 'unit'
    });

    const category = await send('/api/pantry/categories', {
      name: 'QA Layout Category',
      description: 'Fixture sintética de rutas'
    });
    const product = await send('/api/pantry/products', {
      name: 'QA Layout Product',
      category: category.key,
      quantity: 0
    });
    const config = await send('/api/ai/configs', {
      name: 'QA Layout Synthetic Provider',
      provider: 'custom',
      // Dominio reservado .invalid: este test navega la cola vacía y nunca invoca al proveedor.
      baseUrl: 'https://layout-route-coverage.invalid/v1',
      apiKey: 'synthetic-route-coverage-only',
      model: 'synthetic-layout-model',
      concurrency: 1,
      retryAttempts: 0,
      timeout: 1000
    });
    return {
      categoryId: String(category.id),
      productId: String(product.id),
      aiConfigId: String(config.id),
      inventoryItemId: String(inventoryItem.id),
      shoppingListId: String(shoppingList.id),
      receiptId
    };
  });
  const recipe = await createSyntheticRecipe(page, { name: 'QA Layout Recipe' });
  expect(result.categoryId).toBeTruthy();
  expect(result.productId).toBeTruthy();
  expect(result.aiConfigId).toBeTruthy();
  return { ...result, recipeId: recipe.id, recipe };
}

async function assertDashboardCaptureReady(page: Page, viewport: ViewportCase): Promise<void> {
  await expect(page.locator('app-dashboard > .dashboard')).toBeVisible();
  await expect(page.locator('app-page-container')).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expect(page.locator('.sidebar-overlay')).toHaveCount(0);

  const sidebar = page.locator('.sidebar');
  const menuButton = page.locator('.header__menu');
  if (viewport.width < 1024) {
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar).not.toHaveClass(/sidebar--open/);
    await expect
      .poll(() => sidebar.evaluate((element) => element.getBoundingClientRect().right))
      .toBeLessThanOrEqual(1);
  } else {
    await expect(menuButton).toBeHidden();
    await expect(sidebar).toBeVisible();
  }
}

test('todas las rutas conservan su shell y aplican un único gutter común', async ({
  page
}, testInfo) => {
  test.setTimeout(300_000);

  const mismatches: string[] = [];
  for (const target of PUBLIC_ROUTES) {
    await checkRouteAcrossViewports(page, target, mismatches);
  }

  await registerToOnboarding(page, 'Layout gutter QA');
  await checkRouteAcrossViewports(page, ONBOARDING_ROUTE, mismatches);
  await skipOnboarding(page);

  for (const target of AUTHENTICATED_ROUTES) {
    await checkRouteAcrossViewports(page, target, mismatches, async (viewport) => {
      const captureDesktop =
        target.expectedRootDisplay &&
        testInfo.project.name === 'chromium' &&
        viewport.width === 1440;
      const captureMobile =
        target.expectedRootDisplay &&
        testInfo.project.name === 'mobile-chrome' &&
        viewport.width === 393;
      if (captureDesktop || captureMobile) {
        const directory = process.env.E2E_SCREENSHOT_DIR;
        const screenshotName = `${target.component.replace(/^app-/, '')}-${captureDesktop ? 'desktop' : 'mobile'}.png`;
        const screenshotPath = directory
          ? join(directory, screenshotName)
          : testInfo.outputPath(screenshotName);
        mkdirSync(dirname(screenshotPath), { recursive: true });
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
      }

      if (
        target.path === '/dashboard' &&
        ((testInfo.project.name === 'chromium' && viewport.width === 1440) ||
          (testInfo.project.name === 'mobile-chrome' && viewport.width === 393))
      ) {
        await assertDashboardCaptureReady(page, viewport);
        const directory = process.env.E2E_SCREENSHOT_DIR;
        const screenshotPath = directory
          ? join(
              directory,
              testInfo.project.name === 'chromium'
                ? 'dashboard-desktop.png'
                : 'dashboard-mobile.png'
            )
          : testInfo.outputPath(
              testInfo.project.name === 'chromium'
                ? 'dashboard-desktop.png'
                : 'dashboard-mobile.png'
            );
        mkdirSync(dirname(screenshotPath), { recursive: true });
        await page.screenshot({
          path: screenshotPath,
          fullPage: false,
          animations: 'disabled'
        });
      }
    });
  }

  expect(
    mismatches,
    'todas las rutas deben conservar el shell esperado, el mismo marco de 1280px/gutter y raíces alineadas con el contenido del main'
  ).toEqual([]);
});

test('los detalles dinámicos poblados conservan shell, raíz, gutter y ancho', async ({
  page
}, testInfo) => {
  test.setTimeout(300_000);

  const mismatches: string[] = [];
  await registerToOnboarding(page, 'Layout gutter dynamic QA');
  await skipOnboarding(page);

  const fixtures = await createPopulatedDynamicRouteFixtures(page);
  try {
    const populatedRoutes = populatedDynamicRoutes(fixtures);
    for (const target of populatedRoutes) {
      await checkRouteAcrossViewports(page, target, mismatches, async (viewport) => {
        if (!target.path.startsWith('/recipes?recipe=')) return;
        const captureDesktop = testInfo.project.name === 'chromium' && viewport.width === 1440;
        const captureMobile = testInfo.project.name === 'mobile-chrome' && viewport.width === 393;
        if (!captureDesktop && !captureMobile) return;

        const directory = process.env.E2E_SCREENSHOT_DIR;
        const screenshotPath = directory
          ? join(
              directory,
              captureDesktop ? 'recipe-detail-desktop.png' : 'recipe-detail-mobile.png'
            )
          : testInfo.outputPath(
              captureDesktop ? 'recipe-detail-desktop.png' : 'recipe-detail-mobile.png'
            );
        mkdirSync(dirname(screenshotPath), { recursive: true });
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
      });
    }
  } finally {
    await deleteSyntheticRecipe(page, fixtures.recipe);
  }

  expect(
    mismatches,
    'los detalles dinámicos poblados deben conservar shell, una raíz alineada con el contenido común y no tener overflow horizontal'
  ).toEqual([]);
});
