import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { expect, test as baseTest } from './fixtures';
import { registerAndGoto } from './helpers/auth';

type ProviderResponse = { status?: number; content?: unknown; delayMs?: number };
type ProviderRequest = { model?: string; messages?: { content?: string }[] };

interface SyntheticProvider {
  readonly baseUrl: string;
  readonly requests: ProviderRequest[];
  enqueue(...responses: ProviderResponse[]): void;
}

const test = baseTest.extend<{ syntheticProvider: SyntheticProvider }>({
  syntheticProvider: async ({}, use) => {
    const queue: ProviderResponse[] = [];
    const requests: ProviderRequest[] = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        if (request.url !== '/v1/chat/completions' || request.method !== 'POST') {
          response.writeHead(404).end();
          return;
        }

        try {
          requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as ProviderRequest);
        } catch {
          response.writeHead(400).end();
          return;
        }

        const next = queue.shift() ?? { status: 503 };
        const send = () => {
          if (response.destroyed) return;
          if (next.status && next.status >= 400) {
            response
              .writeHead(next.status, { 'content-type': 'application/json' })
              .end(JSON.stringify({ error: 'Synthetic provider failure' }));
            return;
          }

          const content =
            typeof next.content === 'string' ? next.content : JSON.stringify(next.content ?? {});
          response
            .writeHead(200, { 'content-type': 'application/json' })
            .end(JSON.stringify({ choices: [{ message: { content } }] }));
        };

        if (next.delayMs) setTimeout(send, next.delayMs);
        else send();
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    try {
      const address = server.address() as AddressInfo;
      await use({
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        requests,
        enqueue: (...responses) => queue.push(...responses)
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }
});

const TOKEN_KEY = 'hogar:v1:auth_token';
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 393, height: 851 },
  { width: 320, height: 568 },
  { width: 568, height: 320 }
];

const singleRecipe = {
  name: 'Crema sintética de zanahoria',
  description: 'Receta sintética para verificar el flujo.',
  difficulty: 'easy',
  cuisine: 'Mediterránea',
  totalTime: 20,
  prepTime: 5,
  cookTime: 15,
  restTime: null,
  servings: 2,
  calories: 180,
  ingredients: [
    {
      name: 'Zanahoria QA recetas',
      quantity: 2,
      unit: 'unit',
      preparation: 'lavada',
      isOptional: true,
      notes: 'Añadir solo si hace falta'
    }
  ],
  utensils: ['olla'],
  instructionsByLevel: {
    basic: [
      {
        stepNumber: 1,
        instruction: 'Cocer la zanahoria.',
        duration: 15,
        tips: 'Fixture de prueba',
        warning: ''
      }
    ],
    intermediate: [
      {
        stepNumber: 1,
        instruction: 'Cortar la zanahoria en trozos iguales y cocerla hasta que esté tierna.',
        duration: 15,
        tips: 'Fixture de prueba',
        warning: ''
      }
    ],
    expert: [
      {
        stepNumber: 1,
        instruction: 'Cortar dados uniformes de 2 cm y cocer a hervor suave hasta textura tierna.',
        duration: 15,
        tips: 'Fixture de prueba',
        warning: ''
      }
    ]
  },
  nutrition: { calories: 180, protein: 2, carbs: 20, fat: 5, fiber: null },
  storage: {
    method: 'Refrigerada',
    duration: '2 días',
    reheating: 'Calentar',
    container: 'Tarro hermético',
    freezingPossible: true,
    freezingDuration: '1 mes'
  },
  tags: ['synthetic']
};

const singleRecipeWithAllLevels = {
  ...singleRecipe,
  instructionsByLevel: {
    basic: singleRecipe.instructionsByLevel.basic.map((step) => ({
      ...step,
      instruction: 'Cocer la zanahoria.'
    })),
    intermediate: singleRecipe.instructionsByLevel.intermediate.map((step) => ({
      ...step,
      instruction: 'Cortar la zanahoria en trozos iguales y cocerla hasta que esté tierna.'
    })),
    expert: singleRecipe.instructionsByLevel.expert.map((step) => ({
      ...step,
      instruction: 'Cortar en dados uniformes de 2 cm y cocer a hervor suave hasta textura tierna.'
    }))
  }
};

const submittedInstructionsByLevel = Object.fromEntries(
  (['basic', 'intermediate', 'expert'] as const).map((level) => [
    level,
    singleRecipeWithAllLevels.instructionsByLevel[level].map((step) => ({
      ...step,
      timerRequired: Boolean(step.duration),
      timerDuration: step.duration
    }))
  ])
);

const persistedInstructionsByLevel = Object.fromEntries(
  (['basic', 'intermediate', 'expert'] as const).map((level) => [
    level,
    singleRecipeWithAllLevels.instructionsByLevel[level].map((step) => ({
      ...step,
      tips: step.tips?.trim() ? step.tips : null,
      warning: step.warning?.trim() ? step.warning : null,
      timerRequired: Boolean(step.duration),
      timerDuration: step.duration
    }))
  ])
);

function recipeOption(number: number) {
  return {
    ...singleRecipe,
    name: `Opción sintética ${number}`,
    description: `Descripción sintética ${number}.`,
    ingredients: singleRecipe.ingredients.map((ingredient) => ({
      ...ingredient,
      name: `${ingredient.name} ${number}`
    })),
    instructionsByLevel: Object.fromEntries(
      (['basic', 'intermediate', 'expert'] as const).map((level) => [
        level,
        singleRecipe.instructionsByLevel[level].map((step) => ({
          ...step,
          instruction: `${step.instruction} (opción ${number})`
        }))
      ])
    )
  };
}

async function captureScreenshot(
  page: Parameters<typeof registerAndGoto>[0],
  scenario: string,
  viewport: (typeof VIEWPORTS)[number],
  projectName: string
): Promise<void> {
  const directory = process.env.E2E_SCREENSHOT_DIR;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  await page.screenshot({
    path: join(directory, `${projectName}-${scenario}-${viewport.width}x${viewport.height}.png`),
    animations: 'disabled'
  });
}

async function dismissToasts(page: Parameters<typeof registerAndGoto>[0]): Promise<void> {
  const closeButtons = page.locator('.toast__close');
  for (let attempt = 0; attempt < 5 && (await closeButtons.count()) > 0; attempt += 1) {
    await closeButtons.first().click();
  }
}

async function openGenerator(
  page: Parameters<typeof registerAndGoto>[0],
  viewport: (typeof VIEWPORTS)[number],
  providerBaseUrl: string
) {
  await page.setViewportSize(viewport);
  await registerAndGoto(page, '/dashboard', 'qa-recipes-ai-flow');
  const token = await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY);
  expect(token, 'la prueba debe usar la sesión sintética del runner aislado').toBeTruthy();

  const ingredientResponse = await page.request.post('/api/pantry/ingredients', {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name: 'Zanahoria QA recetas',
      category: 'vegetables',
      quantity: 2,
      unit: 'unit',
      location: 'pantry'
    }
  });
  expect(
    ingredientResponse.ok(),
    'se debe crear el ingrediente solo en la SQLite temporal'
  ).toBeTruthy();

  const providerResponse = await page.request.post('/api/ai/configs', {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name: 'Proveedor sintético QA',
      provider: 'custom',
      baseUrl: providerBaseUrl,
      apiKey: 'synthetic-e2e-only',
      model: 'synthetic-test-model',
      timeout: 300,
      retryAttempts: 0
    }
  });
  expect(
    providerResponse.status(),
    'la configuración debe apuntar únicamente al stub local temporal'
  ).toBe(201);

  await page.goto('/recipes');
  await expect(page.locator('h1.recipes__title')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Generar IA/ }).click();
  const ingredient = page
    .locator('.ai-form__pantry app-tag')
    .filter({ hasText: 'Zanahoria QA recetas' });
  await expect(ingredient).toBeVisible();
  await ingredient.click();
  await expect(
    page.locator('.ai-form__ingredients app-tag').filter({ hasText: 'Zanahoria QA recetas' })
  ).toBeVisible();
}

test.describe('Generación de recetas IA', () => {
  for (const viewport of VIEWPORTS.slice(0, 2)) {
    test(`cambia el nivel solo en pantalla y conserva las tres variantes al guardar/reabrir (${viewport.width}×${viewport.height})`, async ({
      page,
      syntheticProvider
    }) => {
      const recipeName = `${singleRecipe.name} ${viewport.width}`;
      syntheticProvider.enqueue({
        content: { ...singleRecipeWithAllLevels, name: recipeName }
      });
      await openGenerator(page, viewport, syntheticProvider.baseUrl);

      const generate = page.getByRole('button', { name: 'Generar 1 receta' });
      const generatedResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/api/ai/generate-recipe') &&
          response.request().method() === 'POST'
      );
      await generate.click();
      expect((await generatedResponse).status()).toBe(200);

      const generatedSelector = page.locator('.generated-recipe__detail-level select');
      await expect(generatedSelector).toHaveValue('intermediate');
      await expect(generatedSelector).toHaveAccessibleName('Nivel de detalle');
      await expect(page.locator('.generated-recipe__steps')).toContainText('Cortar la zanahoria');
      await generatedSelector.focus();
      await expect(generatedSelector).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(generatedSelector).toHaveValue('expert');
      await expect(page.locator('.generated-recipe__steps')).toContainText(
        'dados uniformes de 2 cm'
      );
      expect(syntheticProvider.requests).toHaveLength(1);
      await dismissToasts(page);
      await captureScreenshot(page, 'generated-recipe-detail-level', viewport, 'chromium');

      const saveRequest = page.waitForRequest(
        (request) => request.url().endsWith('/api/recipes') && request.method() === 'POST'
      );
      const saveResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/recipes') && response.request().method() === 'POST'
      );
      await page.getByRole('button', { name: 'Guardar receta' }).click();
      const savePayload = (await saveRequest).postDataJSON();
      expect(savePayload.instructionsByLevel).toEqual(submittedInstructionsByLevel);
      expect(savePayload).not.toHaveProperty('steps');
      expect(savePayload.ingredients).toEqual(singleRecipeWithAllLevels.ingredients);
      expect(savePayload.nutrition.fiber).toBeNull();
      expect(savePayload.storage).toEqual({
        method: 'Refrigerada',
        duration: '2 días',
        reheatingInstructions: 'Calentar',
        container: 'Tarro hermético',
        freezingPossible: true,
        freezingDuration: '1 mes'
      });
      expect((await saveResponse).status()).toBe(201);

      const token = await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY);
      expect(token).toBeTruthy();
      const recipesResponse = await page.request.get('/api/recipes', {
        headers: { authorization: `Bearer ${token}` }
      });
      const recipesPayload = (await recipesResponse.json()) as {
        data: { recipes: Record<string, unknown>[] };
      };
      const saved = recipesPayload.data.recipes.filter((recipe) => recipe.name === recipeName);
      expect(saved).toHaveLength(1);
      expect(saved[0].instructionsByLevel).toEqual(persistedInstructionsByLevel);
      expect(saved[0]).not.toHaveProperty('steps');
      expect(saved[0].ingredients).toMatchObject(singleRecipeWithAllLevels.ingredients);
      expect(saved[0].nutrition).toMatchObject(singleRecipeWithAllLevels.nutrition);
      expect(saved[0].storage).toEqual({
        method: 'Refrigerada',
        duration: '2 días',
        reheatingInstructions: 'Calentar',
        container: 'Tarro hermético',
        freezingPossible: true,
        freezingDuration: '1 mes'
      });
      expect(syntheticProvider.requests).toHaveLength(1);

      await page.reload();
      const card = page.locator('.recipe-card').filter({ hasText: recipeName }).first();
      await expect(card).toBeVisible();
      await card.click();
      const savedSelector = page.locator('.recipe-detail__detail-level select');
      await expect(savedSelector).toBeVisible();
      await expect(savedSelector).toHaveAccessibleName('Nivel de detalle');
      await savedSelector.focus();
      await page.keyboard.press('Home');
      await expect(savedSelector).toHaveValue('basic');
      await expect(page.locator('.recipe-detail__steps')).toContainText('Cocer la zanahoria.');
      expect(syntheticProvider.requests).toHaveLength(1);
      await dismissToasts(page);
      await captureScreenshot(page, 'saved-recipe-detail-level', viewport, 'chromium');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        viewport.width
      );
    });
  }

  for (const viewport of VIEWPORTS) {
    test(`la generación individual informa error y permite reintentar (${viewport.width}×${viewport.height})`, async ({
      page,
      syntheticProvider
    }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(`${error.name}: ${error.message}`));
      syntheticProvider.enqueue({ content: singleRecipe, delayMs: 900 }, { content: singleRecipe });
      await openGenerator(page, viewport, syntheticProvider.baseUrl);

      const generate = page.getByRole('button', { name: 'Generar 1 receta' });
      const firstRequest = page.waitForRequest((request) =>
        request.url().includes('/api/ai/generate-recipe')
      );
      const firstResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/api/ai/generate-recipe') &&
          response.request().method() === 'POST'
      );
      await generate.click();
      const firstPayload = (await firstRequest).postDataJSON();
      expect(firstPayload.ingredients).toContainEqual(
        expect.objectContaining({ name: 'Zanahoria QA recetas', quantity: 2 })
      );
      expect((await firstResponse).status()).toBe(500);
      expect(syntheticProvider.requests).toHaveLength(1);
      expect(JSON.stringify(syntheticProvider.requests[0].messages)).toContain(
        'Zanahoria QA recetas'
      );
      // The global interceptor owns the user-facing server-error copy; assert the
      // error state, not wording that varies by API response/language.
      await expect(page.locator('.toast--error')).toBeVisible();
      expect(await page.getByText('¡Receta generada!', { exact: true }).count()).toBe(0);
      await expect(generate).toBeEnabled();
      await dismissToasts(page);

      const retryResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/api/ai/generate-recipe') &&
          response.request().method() === 'POST'
      );
      await generate.click();
      expect((await retryResponse).status()).toBe(200);
      expect(syntheticProvider.requests).toHaveLength(2);
      await expect(page.locator('.generated-recipe__title')).toHaveText(singleRecipe.name);
      await expect(page.getByText('¡Receta generada!', { exact: true })).toBeVisible();
      await expect(generate).toBeEnabled();
      await dismissToasts(page);
      const dialog = page.getByRole('dialog');
      const dialogBounds = await dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      });
      expect(dialogBounds.left).toBeGreaterThanOrEqual(0);
      expect(dialogBounds.right).toBeLessThanOrEqual(viewport.width);
      await captureScreenshot(page, 'recipes-ai-single', viewport, test.info().project.name);

      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(documentWidth).toBeLessThanOrEqual(viewport.width);
      expect(pageErrors).toEqual([]);
    });
  }

  for (const viewport of VIEWPORTS) {
    test(`muestra y permite guardar una candidata múltiple tras recuperarse de una respuesta no utilizable (${viewport.width}×${viewport.height})`, async ({
      page,
      syntheticProvider
    }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(`${error.name}: ${error.message}`));
      syntheticProvider.enqueue(
        { content: '[]' },
        { content: recipeOption(1) },
        { content: recipeOption(2) },
        { content: recipeOption(3) }
      );
      await openGenerator(page, viewport, syntheticProvider.baseUrl);
      const token = await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY);
      expect(token, 'la verificación debe seguir usando la sesión sintética').toBeTruthy();
      const baselineResponse = await page.request.get('/api/recipes', {
        headers: { authorization: `Bearer ${token}` }
      });
      expect(baselineResponse.ok()).toBeTruthy();
      const baselinePayload = (await baselineResponse.json()) as {
        data: { recipes: { name: string }[] };
      };
      const candidateNames = [1, 2, 3].map((number) => `Opción sintética ${number}`);
      const baselineCounts = candidateNames.map(
        (name) => baselinePayload.data.recipes.filter((recipe) => recipe.name === name).length
      );

      const generate = page.getByRole('button', { name: 'Generar 3 opciones' });
      const firstRequest = page.waitForRequest((request) =>
        request.url().includes('/api/ai/generate-multiple-recipes')
      );
      const firstResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/api/ai/generate-multiple-recipes') &&
          response.request().method() === 'POST'
      );
      await generate.click();
      const firstPayload = (await firstRequest).postDataJSON();
      expect(firstPayload.count).toBe(3);
      expect(firstPayload.ingredients).toContainEqual(
        expect.objectContaining({ name: 'Zanahoria QA recetas', quantity: 2 })
      );
      await expect(page.locator('.toast--error')).toBeVisible();
      expect((await firstResponse).status()).toBe(500);
      expect(syntheticProvider.requests).toHaveLength(1);
      expect(await page.getByText('¡Recetas generadas!', { exact: true }).count()).toBe(0);
      await expect(generate).toBeEnabled();
      await dismissToasts(page);

      const retryResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/api/ai/generate-multiple-recipes') &&
          response.request().method() === 'POST'
      );
      await generate.click();
      expect((await retryResponse).status()).toBe(200);
      expect(syntheticProvider.requests).toHaveLength(4);
      const optionsRegion = page.getByRole('region', {
        name: 'Elige una receta para guardar'
      });
      const generatedOptions = optionsRegion.getByRole('article');
      await expect(generatedOptions).toHaveCount(3);
      const firstOptionLevel = generatedOptions
        .nth(0)
        .locator('.generated-option__detail-level select');
      await expect(firstOptionLevel).toHaveAccessibleName('Nivel de detalle');
      await expect(firstOptionLevel).toHaveValue('intermediate');
      await firstOptionLevel.selectOption('expert');
      await expect(generatedOptions.nth(0).locator('.generated-option__steps')).toContainText(
        'opción 1'
      );
      expect(syntheticProvider.requests).toHaveLength(4);
      for (const [index, option] of [1, 2, 3].entries()) {
        await expect(generatedOptions.nth(index).getByRole('heading')).toHaveText(
          `Opción sintética ${option}`
        );
      }
      await expect(page.getByText('¡Recetas generadas!', { exact: true })).toBeVisible();
      await dismissToasts(page);

      syntheticProvider.enqueue({ status: 503 });
      const failedRetry = page.waitForResponse(
        (response) =>
          response.url().includes('/api/ai/generate-multiple-recipes') &&
          response.request().method() === 'POST'
      );
      await generate.click();
      expect((await failedRetry).status()).toBe(500);
      await expect(page.locator('.toast--error')).toBeVisible();
      await expect(generatedOptions).toHaveCount(3);
      for (const [index, option] of [1, 2, 3].entries()) {
        await expect(generatedOptions.nth(index).getByRole('heading')).toHaveText(
          `Opción sintética ${option}`
        );
      }
      await dismissToasts(page);

      const dialog = page.getByRole('dialog');
      const dialogBounds = await dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      });
      expect(dialogBounds.left).toBeGreaterThanOrEqual(0);
      expect(dialogBounds.right).toBeLessThanOrEqual(viewport.width);
      await generatedOptions.nth(0).scrollIntoViewIfNeeded();
      const firstOptionBounds = await generatedOptions.nth(0).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      });
      expect(firstOptionBounds.left).toBeGreaterThanOrEqual(0);
      expect(firstOptionBounds.right).toBeLessThanOrEqual(viewport.width);
      await captureScreenshot(page, 'recipes-ai-multiple', viewport, test.info().project.name);

      const draftResponse = await page.request.get('/api/recipes', {
        headers: { authorization: `Bearer ${token}` }
      });
      expect(draftResponse.ok()).toBeTruthy();
      const draftPayload = (await draftResponse.json()) as {
        data: { recipes: { name: string }[] };
      };
      candidateNames.forEach((name, index) => {
        expect(
          draftPayload.data.recipes.filter((recipe) => recipe.name === name),
          `generar una candidata no debe persistir ${name}`
        ).toHaveLength(baselineCounts[index]);
      });

      const save = generatedOptions.nth(1).getByRole('button', { name: 'Guardar receta' });
      const saveResponse = page.waitForResponse(
        (response) =>
          response.url().includes('/api/recipes') && response.request().method() === 'POST'
      );
      await save.focus();
      await expect(save).toBeFocused();
      await page.keyboard.press('Enter');
      expect((await saveResponse).status()).toBe(201);

      const recipesResponse = await page.request.get('/api/recipes', {
        headers: { authorization: `Bearer ${token}` }
      });
      expect(recipesResponse.ok()).toBeTruthy();
      const recipesPayload = (await recipesResponse.json()) as {
        data: { recipes: { name: string }[] };
      };
      candidateNames.forEach((name, index) => {
        expect(
          recipesPayload.data.recipes.filter((recipe) => recipe.name === name),
          `solo guardar la candidata elegida debe añadir ${name}`
        ).toHaveLength(baselineCounts[index] + (name === 'Opción sintética 2' ? 1 : 0));
      });
      await expect(page.locator('.modal-overlay')).toHaveCount(0);
      await page.reload();
      await expect(
        page.locator('.recipe-card__name').filter({ hasText: 'Opción sintética 2' }).first()
      ).toBeVisible();

      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(documentWidth).toBeLessThanOrEqual(viewport.width);
      expect(pageErrors).toEqual([]);
    });
  }

  test('cancela las candidatas sin persistirlas, ni tras recargar (320×568)', async ({
    page,
    syntheticProvider
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(`${error.name}: ${error.message}`));
    const viewport = { width: 320, height: 568 };
    const candidateNames = [1, 2, 3].map((number) => `Opción sintética ${number}`);
    syntheticProvider.enqueue(
      { content: recipeOption(1) },
      { content: recipeOption(2) },
      { content: recipeOption(3) }
    );
    await openGenerator(page, viewport, syntheticProvider.baseUrl);

    const token = await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY);
    expect(token, 'la verificación debe seguir usando la sesión sintética').toBeTruthy();
    const baselineResponse = await page.request.get('/api/recipes', {
      headers: { authorization: `Bearer ${token}` }
    });
    expect(baselineResponse.ok()).toBeTruthy();
    const baselinePayload = (await baselineResponse.json()) as {
      data: { recipes: { name: string }[] };
    };
    const baselineCounts = candidateNames.map(
      (name) => baselinePayload.data.recipes.filter((recipe) => recipe.name === name).length
    );

    const generate = page.getByRole('button', { name: 'Generar 3 opciones' });
    const generationResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/ai/generate-multiple-recipes') &&
        response.request().method() === 'POST'
    );
    await generate.click();
    expect((await generationResponse).status()).toBe(200);
    await expect(
      page.getByRole('region', { name: 'Elige una receta para guardar' }).getByRole('article')
    ).toHaveCount(3);
    expect(syntheticProvider.requests).toHaveLength(3);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const afterCancelResponse = await page.request.get('/api/recipes', {
      headers: { authorization: `Bearer ${token}` }
    });
    expect(afterCancelResponse.ok()).toBeTruthy();
    const afterCancelPayload = (await afterCancelResponse.json()) as {
      data: { recipes: { name: string }[] };
    };
    candidateNames.forEach((name, index) => {
      expect(
        afterCancelPayload.data.recipes.filter((recipe) => recipe.name === name),
        `cancelar debe descartar ${name}`
      ).toHaveLength(baselineCounts[index]);
    });

    await page.reload();
    const afterReloadResponse = await page.request.get('/api/recipes', {
      headers: { authorization: `Bearer ${token}` }
    });
    expect(afterReloadResponse.ok()).toBeTruthy();
    const afterReloadPayload = (await afterReloadResponse.json()) as {
      data: { recipes: { name: string }[] };
    };
    candidateNames.forEach((name, index) => {
      expect(afterReloadPayload.data.recipes.filter((recipe) => recipe.name === name)).toHaveLength(
        baselineCounts[index]
      );
    });
    expect(pageErrors).toEqual([]);
  });
});
