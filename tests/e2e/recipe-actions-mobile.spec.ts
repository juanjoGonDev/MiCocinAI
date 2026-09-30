import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { registerAndGoto } from './helpers/auth';
import {
  createSyntheticRecipe,
  deleteSyntheticRecipe,
  waitForStableView
} from './helpers/recipe-fixtures';

async function expectActionsFit(
  page: import('@playwright/test').Page,
  selector: string,
  buttonNames: RegExp[]
): Promise<void> {
  const actions = page.locator(selector);
  const buttons = buttonNames.map((name) => page.getByRole('button', { name }));
  await page.locator('.modal__body').evaluate((element: HTMLElement) => {
    element.scrollTop = element.scrollHeight;
  });
  const layout = await actions.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const bodyBounds = element.closest('.modal__body')?.getBoundingClientRect();
    const buttons = Array.from(element.querySelectorAll('button'), (button) => {
      const rect = button.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      left: bounds.left,
      right: bounds.right,
      bodyTop: bodyBounds?.top,
      bodyBottom: bodyBounds?.bottom,
      buttons
    };
  });

  expect(layout.buttons).toHaveLength(buttons.length);
  expect(layout.scrollWidth, 'las acciones no deben desbordar su contenedor').toBeLessThanOrEqual(
    layout.clientWidth
  );
  for (const [index, button] of buttons.entries()) {
    await expect(button).toBeVisible();
    await expect(button).toBeInViewport();
    expect(
      layout.buttons[index].left,
      'el botón debe caber dentro de la fila'
    ).toBeGreaterThanOrEqual(layout.left);
    expect(
      layout.buttons[index].right,
      'el botón debe caber dentro de la fila'
    ).toBeLessThanOrEqual(layout.right);
    expect(layout.buttons[index].left, 'el botón debe caber en el viewport').toBeGreaterThanOrEqual(
      0
    );
    expect(layout.buttons[index].right, 'el botón debe caber en el viewport').toBeLessThanOrEqual(
      page.viewportSize()!.width
    );
    expect(
      layout.buttons[index].top,
      'el botón debe quedar dentro del cuerpo desplazable del modal'
    ).toBeGreaterThanOrEqual(layout.bodyTop!);
    expect(
      layout.buttons[index].bottom,
      'debe haber separación respecto al borde inferior del modal'
    ).toBeLessThanOrEqual(layout.bodyBottom! - 8);
  }
}

async function expectAiFormScrolls(page: import('@playwright/test').Page): Promise<void> {
  const layout = await page.locator('.modal__body').evaluate((element) => ({
    scrollable: element.scrollHeight > element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
    rootWidth: document.documentElement.scrollWidth,
    viewportWidth: visualViewport?.width ?? innerWidth
  }));
  expect(layout.scrollable, 'el formulario largo debe desplazarse dentro de la modal').toBe(true);
  expect(layout.overflowY).toBe('auto');
  expect(layout.rootWidth).toBeLessThanOrEqual(layout.viewportWidth);
}

test('las acciones de detalle e IA caben y se desplazan en 393 y 320 px', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) > 600, 'la matriz móvil se ejecuta en Pixel 5');
  await registerAndGoto(page, '/dashboard', 'recipe-actions-mobile');
  const recipe = await createSyntheticRecipe(page);
  const aiRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/ai/')) aiRequests.push(request.url());
  });

  try {
    const screenshotDirectory = process.env.E2E_SCREENSHOT_DIR;
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(`/recipes?recipe=${recipe.id}`);
    await expect(page.getByRole('dialog', { name: recipe.name })).toBeVisible();
    await expect(page.locator('.recipe-detail')).toBeVisible();
    await waitForStableView(page);
    const rootWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(rootWidth, 'la ficha no debe crear scroll horizontal a 320 px').toBeLessThanOrEqual(320);
    await expectActionsFit(page, '.recipe-detail__actions', [
      /Cocinar ahora/,
      /Añadir a favoritos/
    ]);
    if (screenshotDirectory) {
      mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({ path: join(screenshotDirectory, 'recipe-actions-detail-320.png') });
    }

    await page.locator('.modal__close').click();
    await expect(page).toHaveURL(/\/recipes$/);
    await page.setViewportSize({ width: 393, height: 851 });
    await page.goto(`/recipes?recipe=${recipe.id}`);
    await expect(page.getByRole('dialog', { name: recipe.name })).toBeVisible();
    await waitForStableView(page);
    await expectActionsFit(page, '.recipe-detail__actions', [
      /Cocinar ahora/,
      /Añadir a favoritos/
    ]);
    if (screenshotDirectory) {
      await page.screenshot({ path: join(screenshotDirectory, 'recipe-actions-detail-393.png') });
    }

    await page.locator('.modal__close').click();
    await expect(page).toHaveURL(/\/recipes$/);
    await page.goto('/recipes#ai');
    await expect(page.getByRole('dialog', { name: 'Generar Receta con IA' })).toBeVisible();
    await waitForStableView(page);
    await expectAiFormScrolls(page);
    await expectActionsFit(page, '.ai-form__actions', [/Generar 1 receta/, /Generar 3 opciones/]);
    if (screenshotDirectory) {
      await page.screenshot({ path: join(screenshotDirectory, 'recipe-actions-ai-393.png') });
    }

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/recipes$/);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/recipes#ai');
    await expect(page.getByRole('dialog', { name: 'Generar Receta con IA' })).toBeVisible();
    await waitForStableView(page);
    await expectAiFormScrolls(page);
    await expectActionsFit(page, '.ai-form__actions', [/Generar 1 receta/, /Generar 3 opciones/]);
    if (screenshotDirectory) {
      await page.screenshot({ path: join(screenshotDirectory, 'recipe-actions-ai-320.png') });
    }

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/recipes$/);
    expect(aiRequests).toEqual([]);
  } finally {
    await deleteSyntheticRecipe(page, recipe);
  }
});
