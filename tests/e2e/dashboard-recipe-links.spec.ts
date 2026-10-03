import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { registerAndGoto } from './helpers/auth';
import {
  createSyntheticRecipe,
  deleteSyntheticRecipe,
  waitForStableView
} from './helpers/recipe-fixtures';

test('la tarjeta sugerida abre el detalle existente y conserva el deep link', async ({ page }) => {
  await registerAndGoto(page, '/dashboard', 'dashboard-recipes');
  const recipe = await createSyntheticRecipe(page);
  try {
    await page.goto('/dashboard');
    const card = page.locator('.recipes-grid .recipe-card').filter({ hasText: recipe.name });
    await expect(card).toBeVisible();
    await card.click();

    await expect(page).toHaveURL(new RegExp(`/recipes\\?recipe=${recipe.id}$`));
    await expect(page.locator('.recipe-detail')).toBeVisible();
    await expect(page.getByRole('dialog', { name: recipe.name })).toBeVisible();
    await expect(page.locator('.modal__title')).toHaveText(recipe.name);
    await expect(page.locator('.recipe-detail__description')).toContainText('Fixture sintético');
    await expect(page.locator('.recipe-detail')).toContainText('Tomate QA');
    await expect(page.locator('.recipe-detail')).toContainText('Cortar el tomate.');

    await waitForStableView(page);
    const screenshotDirectory = process.env.E2E_SCREENSHOT_DIR;
    if (screenshotDirectory) {
      mkdirSync(screenshotDirectory, { recursive: true });
      const width = page.viewportSize()?.width ?? 'desktop';
      await page.screenshot({
        path: join(screenshotDirectory, `dashboard-recipe-detail-${width}.png`)
      });
    }

    await page.reload();
    await expect(page.getByRole('dialog', { name: recipe.name })).toBeVisible();
    await expect(page.locator('.modal__title')).toHaveText(recipe.name);
    await expect(page.locator('.recipe-detail')).toBeVisible();
    await page.locator('.modal__close').click();
    await expect(page).toHaveURL(/\/recipes$/);
  } finally {
    await deleteSyntheticRecipe(page, recipe);
  }
});

test('los enlaces Dashboard y el fragmento directo abren el modal IA sin invocarla', async ({
  page
}) => {
  await registerAndGoto(page, '/dashboard', 'dashboard-recipes-ai');
  const aiRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/ai/')) aiRequests.push(request.url());
  });

  await page.locator('a.action-card--primary').click();
  await expect(page).toHaveURL(/\/recipes#ai$/);
  await expect(page.locator('.ai-form')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Generar Receta con IA' })).toBeVisible();
  await expect(page.locator('.modal__title')).toContainText('Generar Receta con IA');
  await waitForStableView(page);
  const screenshotDirectory = process.env.E2E_SCREENSHOT_DIR;
  if (screenshotDirectory) {
    mkdirSync(screenshotDirectory, { recursive: true });
    const width = page.viewportSize()?.width ?? 'desktop';
    await page.screenshot({ path: join(screenshotDirectory, `dashboard-recipe-ai-${width}.png`) });
  }
  await page.locator('.modal__close').click();
  await expect(page).toHaveURL(/\/recipes$/);

  await page.goto('/recipes#ai');
  await expect(page.locator('.ai-form')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Generar Receta con IA' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.locator('.ai-form')).toHaveCount(0);

  await page.goto('/dashboard');
  const emptyStateLink = page.locator('.dashboard__section').nth(1).locator('.empty-state__link');
  await expect(emptyStateLink).toBeVisible();
  await emptyStateLink.click();
  await expect(page).toHaveURL(/\/recipes#ai$/);
  await expect(page.locator('.ai-form')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Generar Receta con IA' })).toBeVisible();
  expect(aiRequests).toEqual([]);
});

test('un id de receta inexistente deja la lista en una URL recuperable', async ({ page }) => {
  await registerAndGoto(page, '/recipes?recipe=missing', 'dashboard-recipe-missing');

  await expect(page.locator('h1.recipes__title')).toBeVisible();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.locator('.recipe-detail')).toHaveCount(0);
});
