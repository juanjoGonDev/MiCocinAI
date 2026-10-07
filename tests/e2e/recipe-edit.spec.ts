import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from './fixtures';
import { registerAndGoto } from './helpers/auth';
import {
  createSyntheticRecipe,
  deleteSyntheticRecipe,
  waitForStableView
} from './helpers/recipe-fixtures';

const detailedFixture = {
  name: 'Guiso de prueba para editar',
  ingredients: [
    {
      name: 'Garbanzos QA',
      quantity: 240,
      unit: 'g',
      preparation: 'enjuagados',
      isOptional: false,
      substitutes: ['alubias'],
      notes: 'escurridos'
    },
    { name: 'Espinacas QA', quantity: 100, unit: 'g', isOptional: true, substitutes: [] }
  ],
  guidance: {
    appliances: ['Cocina de gas'],
    parallelTasks: ['Lava las espinacas mientras se calienta el caldo.'],
    tipsAndVariations: ['Termina con pimentón.']
  },
  instructionsByLevel: {
    basic: [{ stepNumber: 1, instruction: 'Lava las espinacas y escurre los garbanzos.' }],
    intermediate: [
      { stepNumber: 1, instruction: 'Lava las espinacas; enjuaga y escurre los garbanzos.' }
    ],
    expert: [
      { stepNumber: 1, instruction: 'Enjuaga los garbanzos y seca las espinacas antes de saltear.' }
    ]
  },
  nutrition: { calories: 380, protein: 18, carbs: 50, fat: 10, fiber: 14 },
  storage: {
    method: 'Refrigerar cuando se enfríe.',
    container: 'Recipiente hermético',
    duration: '3 días',
    reheatingInstructions: 'Calentar hasta que esté bien caliente.',
    freezingPossible: true,
    freezingDuration: '2 meses'
  }
};

async function openEditor(page: import('@playwright/test').Page, id: string): Promise<void> {
  await page.goto(`/recipes?recipe=${encodeURIComponent(id)}`);
  await expect(page.locator('[data-test="recipe-detail-page"]')).toBeVisible();
  await page.locator('[data-test="recipe-edit-action"]').click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${id}/edit$`));
  await expect(page.locator('[data-test="recipe-editor-form"]')).toBeVisible();
}

async function stubAutomaticStepPhotos(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/recipes/step-photos?scene=**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: null })
    })
  );
}

test('la vista dedicada edita todos los campos, conserva el estado personal y no llama a IA', async ({
  page
}, testInfo) => {
  const manualCoverUrl = 'https://images.example.test/cover.jpg';
  const manualStepUrl = 'https://images.example.test/step.jpg';
  if (testInfo.project.name === 'chromium')
    await page.setViewportSize({ width: 1440, height: 1000 });
  await stubAutomaticStepPhotos(page);
  await page.route('https://images.example.test/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'
    })
  );
  await registerAndGoto(page, '/recipes', 'recipe-editor-save');
  const recipe = await createSyntheticRecipe(page, detailedFixture);
  const token = recipe.token;
  const headers = { authorization: `Bearer ${token}` };
  const requests: string[] = [];
  const patchRequests: string[] = [];
  page.on('request', (request) => {
    requests.push(request.url());
    if (request.method() === 'PATCH') patchRequests.push(request.url());
  });

  try {
    await page.request.post(`/api/recipes/${recipe.id}/favorite`, { headers });
    await page.request.post(`/api/recipes/${recipe.id}/cook`, { headers });
    await openEditor(page, recipe.id);
    await expect(page.getByRole('heading', { name: 'Editar receta' })).toBeFocused();
    await expect(page.locator('#step-instruction-basic-0')).toHaveValue(
      detailedFixture.instructionsByLevel.basic[0].instruction
    );
    await expect(page.locator('#step-instruction-intermediate-0')).toHaveValue(
      detailedFixture.instructionsByLevel.intermediate[0].instruction
    );
    await expect(page.locator('#step-instruction-expert-0')).toHaveValue(
      detailedFixture.instructionsByLevel.expert[0].instruction
    );
    await expect(page.locator('#ingredient-substitutes-0')).toHaveValue('alubias');
    await expect(page.locator('#storage-duration')).toHaveValue('3 días');

    if (testInfo.project.name === 'chromium' || testInfo.project.name === 'mobile-chrome') {
      const directory = resolve(process.cwd(), '.e2e-screenshots/recipe-editor');
      mkdirSync(directory, { recursive: true });
      const file = testInfo.project.name === 'chromium' ? 'desktop.png' : 'mobile.png';
      await page.screenshot({
        path: resolve(directory, file),
        fullPage: false,
        animations: 'disabled'
      });
    }

    await page.locator('#editor-name').fill('');
    await page.locator('[data-test="recipe-editor-save"] button').click();
    await expect(page.locator('[data-test="recipe-editor-error"]')).toContainText(
      'Revisa los campos marcados'
    );
    expect(patchRequests).toHaveLength(0);
    await page.locator('#editor-name').fill(detailedFixture.name);

    await page.locator('#editor-name').fill('Guiso de garbanzos y espinacas QA');
    await page.locator('#ingredient-name-0').fill('Garbanzos cocidos QA');
    await page.locator('#editor-image').fill(manualCoverUrl);
    await page.locator('#step-image-basic-0').fill(manualStepUrl);
    await page
      .locator('#step-instruction-intermediate-0')
      .fill('Enjuaga los garbanzos y corta las espinacas.');
    await page.locator('#nutrition-protein').fill('21');
    await page.getByRole('checkbox', { name: 'Almuerzo' }).check();
    await page.locator('[data-test="recipe-editor-save"] button').click();

    await expect(page.locator('[data-test="recipe-detail-page"]')).toBeVisible();
    await expect(page.locator('[data-test="recipe-detail-title"]')).toHaveText(
      'Guiso de garbanzos y espinacas QA'
    );
    const response = await page.request.get(`/api/recipes/${recipe.id}`, { headers });
    expect(response.ok()).toBeTruthy();
    const saved = ((await response.json()) as { data: Record<string, any> }).data;
    expect(saved.name).toBe('Guiso de garbanzos y espinacas QA');
    expect(saved.ingredients[0]).toMatchObject({
      name: 'Garbanzos cocidos QA',
      quantity: 240,
      unit: 'g'
    });
    expect(saved.instructionsByLevel.intermediate[0].instruction).toBe(
      'Enjuaga los garbanzos y corta las espinacas.'
    );
    expect(saved.instructionsByLevel.basic[0].instruction).toBe(
      detailedFixture.instructionsByLevel.basic[0].instruction
    );
    expect(saved.image).toBe(manualCoverUrl);
    expect(saved.instructionsByLevel.basic[0].image).toBe(manualStepUrl);
    expect(saved.instructionsByLevel.expert[0].instruction).toBe(
      detailedFixture.instructionsByLevel.expert[0].instruction
    );
    expect(saved.nutrition.protein).toBe(21);
    expect(saved.isFavorite).toBe(true);
    expect(saved.timesCooked).toBe(1);
    expect(requests.some((url) => url.includes('/api/ai/'))).toBe(false);
    await waitForStableView(page);

    if (testInfo.project.name === 'chromium' || testInfo.project.name === 'mobile-chrome') {
      await page.goto('/recipes');
      await expect(page.locator('[data-test="recipe-list-view"]')).toBeVisible();
    }
  } finally {
    await deleteSyntheticRecipe(page, recipe);
  }
});

test('pide confirmación al abandonar cambios y conserva el borrador cuando falla el guardado', async ({
  page
}) => {
  await stubAutomaticStepPhotos(page);
  await registerAndGoto(page, '/recipes', 'recipe-editor-recover');
  const recipe = await createSyntheticRecipe(page, detailedFixture);
  try {
    await openEditor(page, recipe.id);
    await page.getByRole('checkbox', { name: 'Almuerzo' }).check();
    await page.locator('#editor-name').fill('Borrador que no se pierde');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#editor-name')).toHaveValue('Borrador que no se pierde');

    await page.route(`**/api/recipes/${recipe.id}`, async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 503,
          json: { success: false, message: 'Temporary test failure' }
        });
      } else {
        await route.continue();
      }
    });
    await page.locator('[data-test="recipe-editor-save"] button').click();
    await expect(page.locator('[data-test="recipe-editor-error"]')).toContainText(
      'Tu borrador sigue aquí'
    );
    await expect(page.locator('#editor-name')).toHaveValue('Borrador que no se pierde');

    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.locator('[data-test="recipe-editor-confirm-discard"]').click();
    await expect(page.locator('[data-test="recipe-detail-page"]')).toBeVisible();
  } finally {
    await deleteSyntheticRecipe(page, recipe);
  }
});

test('busca y selecciona fotos reales para portada y pasos, con vista previa y atribución', async ({
  page
}, testInfo) => {
  if (testInfo.project.name === 'chromium')
    await page.setViewportSize({ width: 1440, height: 1000 });
  const photoId = 'f'.repeat(24);
  const searchQueries: string[] = [];
  await page.route('**/api/recipes/step-photos/search**', async (route) => {
    const url = new URL(route.request().url());
    searchQueries.push(url.searchParams.get('q') ?? '');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [
          {
            id: photoId,
            altText: 'Cebolla cortada en dados sobre tabla',
            author: 'Fotógrafa de prueba',
            licenseName: 'CC BY 4.0',
            licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
            sourceUrl: 'https://commons.wikimedia.org/wiki/File:Cebolla-test.jpg',
            previewUrl: `/api/recipe-photo-previews/${photoId}`
          }
        ]
      })
    });
  });
  await page.route('**/api/recipe-photo-previews/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pZkAAAAASUVORK5CYII=',
        'base64'
      )
    })
  );

  await stubAutomaticStepPhotos(page);
  await registerAndGoto(page, '/recipes', 'recipe-step-photo-search');
  const recipe = await createSyntheticRecipe(page, detailedFixture);
  try {
    await openEditor(page, recipe.id);
    await expect(page.getByRole('button', { name: 'Generar foto con IA' })).toBeDisabled();
    await expect(page.locator('#editor-image-generation-help')).toContainText(
      'La configuración de IA activa no ofrece generación de imágenes'
    );
    const coverQuery = page.locator('#editor-photo-search');
    await coverQuery.fill('guiso de prueba');
    const coverResults = page.locator('[data-test="recipe-photo-results"]');
    await expect(coverResults).toBeVisible();
    await coverResults.getByRole('button', { name: /Usar esta foto/ }).click();
    await expect(coverResults.getByRole('button', { name: /Foto seleccionada/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.locator('.editor-cover-preview')).toContainText('Fotógrafa de prueba');

    const query = page.locator('#step-photo-search-basic-0');
    await query.fill('cebolla picada');
    const results = page.locator('[data-test="recipe-step-photo-results-basic-0"]');
    await expect(results).toBeVisible();
    await expect(results.getByRole('button', { name: /Usar esta foto/ })).toBeVisible();
    await results.getByRole('button', { name: /Usar esta foto/ }).click();

    await expect(results.getByRole('button', { name: /Foto seleccionada/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.locator('.editor-step-preview')).toContainText('Fotógrafa de prueba');
    expect(searchQueries).toEqual(['guiso de prueba', 'cebolla picada']);

    if (testInfo.project.name === 'chromium' || testInfo.project.name === 'mobile-chrome') {
      await page.locator('[data-test="recipe-step-photo-search-basic-0"]').scrollIntoViewIfNeeded();
      const directory = resolve(process.cwd(), '.e2e-screenshots/recipe-step-photo-edit');
      mkdirSync(directory, { recursive: true });
      const file = testInfo.project.name === 'chromium' ? 'desktop.png' : 'mobile.png';
      await page.screenshot({
        path: resolve(directory, file),
        fullPage: false,
        animations: 'disabled'
      });
    }
  } finally {
    await deleteSyntheticRecipe(page, recipe);
  }
});

test('la búsqueda de fotos anuncia vacío/error, permite reintentar e ignora resultados obsoletos', async ({
  page
}, testInfo) => {
  const viewport =
    testInfo.project.name === 'chromium'
      ? { width: 1440, height: 1000 }
      : { width: 393, height: 852 };
  await page.setViewportSize(viewport);

  let retryCount = 0;
  let announceStaleRequest!: () => void;
  let releaseStaleResponse!: () => void;
  let finishStaleResponse!: () => void;
  const staleRequestStarted = new Promise<void>((resolveStarted) => {
    announceStaleRequest = resolveStarted;
  });
  const staleResponseGate = new Promise<void>((resolveResponse) => {
    releaseStaleResponse = resolveResponse;
  });
  const staleResponseFinished = new Promise<void>((resolveFinished) => {
    finishStaleResponse = resolveFinished;
  });
  const queries: string[] = [];
  const photoResponse = (id: string, author: string) => ({
    success: true,
    data: [
      {
        id,
        altText: `Foto de prueba: ${author}`,
        author,
        licenseName: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        sourceUrl: `https://commons.wikimedia.org/wiki/File:${author}.jpg`,
        previewUrl: `/api/recipe-photo-previews/${id}`
      }
    ]
  });
  await page.route('**/api/recipes/step-photos/search**', async (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get('q') ?? '';
    queries.push(query);

    if (query === 'consulta antigua') {
      announceStaleRequest();
      await staleResponseGate;
      try {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(photoResponse('a'.repeat(24), 'Resultado obsoleto'))
        });
      } catch {
        // Angular may cancel the old XHR after the next keystroke; either way its data is stale.
      } finally {
        finishStaleResponse();
      }
      return;
    }

    if (query === 'sin coincidencias') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] })
      });
      return;
    }

    if (query === 'fallo temporal' && retryCount++ === 0) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: '{"success":false}'
      });
      return;
    }

    const author = query === 'consulta actual' ? 'Resultado vigente' : 'Foto recuperada';
    const id = query === 'consulta actual' ? 'c'.repeat(24) : 'b'.repeat(24);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(photoResponse(id, author))
    });
  });
  await page.route('**/api/recipe-photo-previews/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pZkAAAAASUVORK5CYII=',
        'base64'
      )
    })
  );
  await stubAutomaticStepPhotos(page);
  await registerAndGoto(page, '/recipes', 'recipe-photo-search-states');
  const recipe = await createSyntheticRecipe(page, detailedFixture);
  try {
    await openEditor(page, recipe.id);
    const query = page.locator('#editor-photo-search');
    const results = page.locator('[data-test="recipe-photo-results"]');

    await query.fill('sin coincidencias');
    await expect(page.getByRole('status')).toContainText(
      'No se han encontrado fotos con licencia y atribución verificables.'
    );
    await expect(page.locator('[data-test="recipe-editor-save"] button')).toBeEnabled();

    await query.fill('fallo temporal');
    const searchAlert = page.locator('.editor-photo-search__error');
    await expect(searchAlert).toContainText('No se pudo buscar ahora.');
    await expect(page.locator('.toast.toast--error')).toHaveCount(0);
    const retryButton = searchAlert.getByRole('button', { name: 'Reintentar búsqueda' });
    await retryButton.focus();
    await expect(retryButton).toBeFocused();
    if (testInfo.project.name === 'chromium' || testInfo.project.name === 'mobile-chrome') {
      const directory = resolve(process.cwd(), '.e2e-screenshots/recipe-photo-search-states');
      mkdirSync(directory, { recursive: true });
      await page.screenshot({
        path: resolve(directory, `${testInfo.project.name}-failure.png`),
        fullPage: false,
        animations: 'disabled'
      });
    }
    await retryButton.press('Enter');
    await expect(results).toContainText('Foto recuperada');

    await query.fill('consulta antigua');
    await staleRequestStarted;
    await query.fill('consulta actual');
    await expect(results).toContainText('Resultado vigente');
    releaseStaleResponse();
    await staleResponseFinished;
    await expect(results).toContainText('Resultado vigente');
    await expect(results).not.toContainText('Resultado obsoleto');
    expect(queries).toEqual([
      'sin coincidencias',
      'fallo temporal',
      'fallo temporal',
      'consulta antigua',
      'consulta actual'
    ]);
  } finally {
    releaseStaleResponse();
    await deleteSyntheticRecipe(page, recipe);
  }
});

test('the direct editor route preserves shared content geometry at phone and landscape widths', async ({
  page
}) => {
  await stubAutomaticStepPhotos(page);
  await registerAndGoto(page, '/recipes', 'recipe-editor-responsive');
  const recipe = await createSyntheticRecipe(page, detailedFixture);
  try {
    await page.goto(`/recipes/${recipe.id}/edit`);
    await expect(page.locator('[data-test="recipe-editor-form"]')).toBeVisible();
    for (const [index, viewport] of [
      { width: 320, height: 700 },
      { width: 393, height: 852 },
      { width: 568, height: 320 }
    ].entries()) {
      await page.setViewportSize(viewport);
      await expect(page.locator('[data-test="recipe-editor-form"]')).toBeVisible();
      const widths = await page.evaluate(() => ({
        body: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
        editor: (() => {
          const rect = document.querySelector('.recipe-editor')!.getBoundingClientRect();
          return { left: rect.left, width: rect.width };
        })()
      }));
      expect(
        widths.scroll,
        `sin overflow en ${viewport.width}x${viewport.height}`
      ).toBeLessThanOrEqual(widths.body);
      expect(widths.editor.width).toBeLessThanOrEqual(widths.body);

      await page.goto('/recipes');
      await expect(page.locator('[data-test="recipe-list-view"]')).toBeVisible();
      const list = await page.locator('.recipes').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, width: rect.width };
      });
      expect(
        Math.abs(widths.editor.left - list.left),
        `margen izquierdo coherente en ${viewport.width}px`
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(widths.editor.width - list.width),
        `ancho de contenido coherente en ${viewport.width}px`
      ).toBeLessThanOrEqual(1);

      if (index < 2) {
        await page.goto(`/recipes/${recipe.id}/edit`);
        await expect(page.locator('[data-test="recipe-editor-form"]')).toBeVisible();
      }
    }
  } finally {
    await deleteSyntheticRecipe(page, recipe);
  }
});
