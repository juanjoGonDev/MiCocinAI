import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from './fixtures';
import { registerAndGoto } from './helpers/auth';
import { mockRecipeStepPhotos } from './helpers/recipe-step-photos';

const SYNTHETIC_COVER_ID = '0123456789abcdef01234567';
const SYNTHETIC_COVER_PATH = `/api/recipe-images/${SYNTHETIC_COVER_ID}`;

async function mockLocalRecipeBookCover(page: import('@playwright/test').Page) {
  const coverFixture = readFileSync(resolve('tests/e2e/fixtures/recipe-book-cover.svg'));
  let servedCoverCount = 0;

  // Attach a local fixture to one catalog item without changing app/API code or
  // contacting an image provider. The test still exercises the real catalog API.
  await page.route('**/api/recipes**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (
      request.method() !== 'GET' ||
      (pathname !== '/api/recipes' &&
        (!pathname.startsWith('/api/recipes/') || pathname.includes('/step-photos')))
    ) {
      await route.continue();
      return;
    }

    const response = await route.fetch();
    if (!response.ok()) {
      await route.fulfill({ response });
      return;
    }

    const payload = (await response.json()) as {
      data?: Record<string, unknown> & { recipes?: Array<Record<string, unknown>> };
    };
    const patchCover = (recipe: Record<string, unknown>) => {
      if (recipe.name !== 'Riguas de elote') return recipe;
      return { ...recipe, image: SYNTHETIC_COVER_PATH, imageAttribution: null };
    };

    if (pathname === '/api/recipes' && Array.isArray(payload.data?.recipes)) {
      payload.data.recipes = payload.data.recipes.map(patchCover);
    } else if (pathname !== '/api/recipes' && payload.data && 'name' in payload.data) {
      payload.data = patchCover(payload.data);
    }

    await route.fulfill({ response, json: payload });
  });

  await page.route(`**${SYNTHETIC_COVER_PATH}`, async (route) => {
    servedCoverCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: coverFixture
    });
  });

  return { servedCoverCount: () => servedCoverCount };
}

test.describe('Libro de recetas', () => {
  test.beforeEach(async ({ page }) => {
    await mockRecipeStepPhotos(page);
    await registerAndGoto(page, '/recipes', 'recipe-book');
    await expect(page.locator('h1.recipes__title')).toBeVisible();
  });

  test('filtra el catálogo por búsqueda, país y comida; conserva portada y atribución', async ({
    page
  }, testInfo) => {
    await page.getByRole('tab', { name: 'Libro de recetas' }).click();
    await expect(page).toHaveURL(/[?&]collection=book/);

    const cards = page.locator('[data-test="recipe-card"]');
    await expect(cards).toHaveCount(12);
    await expect(cards.filter({ hasText: 'Tortilla de patatas' })).toHaveCount(1);
    await expect(cards.filter({ hasText: 'Pupusa revuelta con curtido' })).toHaveCount(1);

    const search = page.locator('[data-test="recipe-book-search"]');
    await search.fill('Maíz');
    await search.press('Enter');

    await page.getByRole('button', { name: 'Filtros', exact: true }).click();
    await page.locator('[data-test="recipe-book-country"] .picker__trigger').click();
    await page.getByRole('option', { name: 'El Salvador', exact: true }).click();
    await page.locator('[data-test="recipe-book-meal"] .picker__trigger').click();
    await page.getByRole('option', { name: 'Desayuno', exact: true }).click();
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();

    await expect(page).toHaveURL(/[?&]search=Ma%C3%ADz/);
    await expect(page).toHaveURL(/[?&]country=SV/);
    await expect(page).toHaveURL(/[?&]mealType=breakfast/);
    await expect(cards).toHaveCount(2);
    await expect(cards.filter({ hasText: 'Tamal salvadoreño de pollo' })).toHaveCount(0);
    await expect(cards.filter({ hasText: 'Pastelitos salvadoreños de carne' })).toHaveCount(0);
    await expect(page.locator('.recipes__count')).toHaveText('2 recetas');
    const riguas = cards.filter({ hasText: 'Riguas de elote' });
    await expect(riguas).toHaveCount(1);
    await expect(riguas).toContainText('El Salvador');
    await expect(riguas.locator('.recipe-card__cover-fallback')).toBeVisible();

    const screenshotDirectory = resolve('.e2e-screenshots/recipe-book');
    mkdirSync(screenshotDirectory, { recursive: true });
    await page.evaluate(async () => {
      const animations = document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === 'running' &&
            animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY
        );
      await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
    });
    await page.screenshot({
      path: resolve(screenshotDirectory, `${testInfo.project.name}-filtered-book.png`),
      fullPage: false,
      animations: 'disabled'
    });

    await riguas.click();
    await expect(page.locator('[data-test="recipe-detail-page"]')).toContainText(
      'Ministerio de Educación de El Salvador'
    );
  });

  test('la URL y los filtros se restauran al recargar y se limpian juntos', async ({ page }) => {
    await page.getByRole('tab', { name: 'Libro de recetas' }).click();
    await page.locator('[data-test="recipe-book-search"]').fill('Tarta de Santiago');
    await page.locator('[data-test="recipe-book-search"]').press('Enter');
    await expect(page.locator('[data-test="recipe-card"]')).toHaveCount(1);
    await page.reload();

    await expect(page.getByRole('tab', { name: 'Libro de recetas' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(page.locator('[data-test="recipe-book-search"]')).toHaveValue('Tarta de Santiago');
    await expect(page.locator('[data-test="recipe-card"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Limpiar filtros' }).click();
    await expect(page.locator('[data-test="recipe-card"]')).toHaveCount(12);
    await expect(page).not.toHaveURL(/[?&]search=/);
  });

  test('sirve la portada del libro desde un fixture local y la conserva en tarjeta y detalle', async ({
    page
  }, testInfo) => {
    const viewport =
      testInfo.project.name === 'chromium'
        ? { width: 1440, height: 1000 }
        : { width: 393, height: 852 };
    await page.setViewportSize(viewport);
    const cover = await mockLocalRecipeBookCover(page);

    await page.getByRole('tab', { name: 'Libro de recetas' }).click();
    const card = page.locator('[data-test="recipe-card"]').filter({ hasText: 'Riguas de elote' });
    await expect(card).toHaveCount(1);
    await card.scrollIntoViewIfNeeded();

    const cardImage = card.locator('.recipe-card__open img');
    await expect(cardImage).toBeVisible();
    await expect(cardImage).toHaveAttribute('alt', 'Portada de Riguas de elote');
    await expect
      .poll(() => cardImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
    await expect(card.locator('.recipe-card__cover-fallback')).toHaveCount(0);
    expect(cover.servedCoverCount()).toBeGreaterThan(0);

    const screenshotDirectory = resolve(
      process.env.E2E_SCREENSHOT_DIR ?? '.e2e-screenshots/2026-10-06-recipe-book-cover'
    );
    mkdirSync(screenshotDirectory, { recursive: true });
    await page.screenshot({
      path: resolve(screenshotDirectory, `${testInfo.project.name}-book-cover-card.png`),
      fullPage: false,
      animations: 'disabled'
    });

    await card.locator('.recipe-card__open').click();
    const detail = page.locator('[data-test="recipe-detail-page"]');
    await expect(detail).toBeVisible();
    const detailImage = detail.locator('.recipe-detail__cover img');
    await expect(detailImage).toBeVisible();
    await expect(detailImage).toHaveAttribute('src', SYNTHETIC_COVER_PATH);
    await expect(detailImage).toHaveAttribute('alt', 'Portada de Riguas de elote');
    await expect
      .poll(() => detailImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
    await expect(detail.locator('[data-test="recipe-detail-title"]')).toHaveText('Riguas de elote');
    await expect(detail).toContainText('Ministerio de Educación de El Salvador');
    expect(cover.servedCoverCount()).toBeGreaterThan(0);

    await page.screenshot({
      path: resolve(screenshotDirectory, `${testInfo.project.name}-book-cover-detail.png`),
      fullPage: false,
      animations: 'disabled'
    });
  });

  test('una receta del libro abre el detalle completo sin pedir otra generación IA', async ({
    page
  }, testInfo) => {
    const viewport =
      testInfo.project.name === 'chromium'
        ? { width: 1440, height: 1000 }
        : { width: 393, height: 852 };
    await page.setViewportSize(viewport);
    await page.getByRole('tab', { name: 'Libro de recetas' }).click();
    const aiRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/ai/')) aiRequests.push(request.url());
    });

    const tortilla = page.locator('[data-test="recipe-card"]').filter({
      hasText: 'Tortilla de patatas'
    });
    await tortilla.locator('.recipe-card__open').click();

    const detail = page.locator('[data-test="recipe-full-detail"]');
    await expect(detail).toBeVisible();
    await expect(page.locator('[data-test="recipe-detail-page"]')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-test="recipe-detail-title"]')).toHaveText(
      'Tortilla de patatas'
    );
    await expect(detail.locator('[data-test="recipe-nutrition"]')).toBeVisible();
    await expect(detail.locator('[data-test="recipe-equipment"]')).toBeVisible();
    await expect(detail.locator('[data-test="recipe-parallel-tasks"]')).toBeVisible();
    await expect(detail.locator('[data-test="recipe-tips-variations"]')).toBeVisible();
    await expect(detail.locator('[data-test="recipe-storage"]')).toBeVisible();
    expect(
      await detail.locator('[data-test="recipe-preparation"] .step-card').count()
    ).toBeGreaterThanOrEqual(4);
    expect(
      await detail
        .locator('[data-test="recipe-preparation"] [data-test="recipe-step-photo"]')
        .count()
    ).toBeGreaterThanOrEqual(4);
    await expect(detail.locator('.step-card').first()).toContainText(
      /lav|enjuag|no hace falta lavar/i
    );

    const firstIngredient = detail.locator('[data-test="recipe-ingredients"] li').first();
    await expect(firstIngredient).toContainText('600 g');
    await detail.locator('[data-test="recipe-serving-count"]').fill('2');
    await expect(firstIngredient).toContainText('300 g');
    await detail.locator('[data-test="recipe-detail-level"]').selectOption('expert');
    expect(
      await detail.locator('[data-test="recipe-preparation"] .step-card').count()
    ).toBeGreaterThanOrEqual(4);
    expect(aiRequests, 'el cambio de detalle/raciones debe ser local').toEqual([]);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(viewport.width);

    const screenshotDirectory = resolve('.e2e-screenshots/recipe-book-full-detail');
    mkdirSync(screenshotDirectory, { recursive: true });
    await page.screenshot({
      path: resolve(screenshotDirectory, `${testInfo.project.name}-tortilla-detail-top.png`),
      fullPage: false,
      animations: 'disabled'
    });
    await detail.locator('[data-test="recipe-preparation"]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(screenshotDirectory, `${testInfo.project.name}-tortilla-detail-steps.png`),
      fullPage: false,
      animations: 'disabled'
    });
  });

  test('pagina resultados, conserva la página al recargar y presenta una búsqueda vacía', async ({
    page
  }) => {
    await page.goto('/recipes?collection=book&pageSize=6');

    const cards = page.locator('[data-test="recipe-card"]');
    await expect(cards).toHaveCount(6);
    await expect(page.getByText('Página 1 de 2')).toBeVisible();

    await page.getByRole('button', { name: 'Página siguiente', exact: true }).click();
    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(cards).toHaveCount(6);
    await expect(page.getByText('Página 2 de 2')).toBeVisible();
    await page.reload();
    await expect(cards).toHaveCount(6);
    await expect(page.getByText('Página 2 de 2')).toBeVisible();

    const search = page.locator('[data-test="recipe-book-search"]');
    await search.fill('zz-receta-inexistente-qa');
    await search.press('Enter');
    await expect(cards).toHaveCount(0);
    await expect(page.locator('.empty-state__title')).toBeVisible();

    await search.fill('');
    await search.press('Enter');
    await expect(cards).toHaveCount(6);
    await expect(page.getByText('Página 1 de 2')).toBeVisible();
  });

  test('el libro es operable con teclado y no desborda en móvil estrecho u horizontal', async ({
    page
  }) => {
    await page.getByRole('tab', { name: 'Libro de recetas' }).click();
    const firstCard = page.locator('[data-test="recipe-card"]').first();
    const openButton = firstCard.locator('.recipe-card__open');
    await openButton.focus();
    await expect(openButton).toBeFocused();
    await page.keyboard.press('Enter');
    const detail = page.locator('[data-test="recipe-detail-page"]');
    await expect(detail).toBeVisible();
    await page.getByRole('button', { name: 'Volver a recetas' }).focus();
    await page.keyboard.press('Enter');
    await expect(detail).toBeHidden();
    await expect(page.locator('[data-test="recipe-list-view"]')).toBeVisible();

    const favorite = firstCard.locator('.recipe-card__favorite');
    await expect(favorite).toHaveAccessibleName('Añadir a favoritos');
    await favorite.focus();
    await expect(favorite).toBeFocused();
    await page.keyboard.press('Space');
    await expect(favorite).toHaveAttribute('aria-pressed', 'true');
    await expect(favorite).toHaveAccessibleName('Favorito');

    for (const viewport of [
      { width: 320, height: 640 },
      { width: 812, height: 375 }
    ]) {
      await page.setViewportSize(viewport);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(viewport.width);
    }
  });
});
