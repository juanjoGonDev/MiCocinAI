import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from './fixtures';
import { registerAndGoto } from './helpers/auth';
import {
  createSyntheticRecipe,
  deleteSyntheticRecipe,
  waitForStableView
} from './helpers/recipe-fixtures';
import { mockRecipeStepPhotos } from './helpers/recipe-step-photos';

const fullRecipe = {
  name: 'Arroz de prueba detallado',
  servings: 2,
  calories: 520,
  restTime: 5,
  ingredients: [
    {
      name: 'Arroz QA',
      quantity: 200,
      unit: 'g',
      preparation: 'enjuagado hasta que el agua salga clara',
      isOptional: false,
      substitutes: ['quinoa'],
      notes: 'usar grano redondo'
    },
    { name: 'Azafrán QA', quantity: 1, unit: 'g', isOptional: true, substitutes: [] }
  ],
  guidance: {
    appliances: ['Cocina de gas'],
    parallelTasks: ['Calienta el caldo mientras preparas las verduras.'],
    tipsAndVariations: ['Tuesta el arroz antes de añadir el caldo para más sabor.']
  },
  instructionsByLevel: {
    basic: [
      {
        stepNumber: 1,
        instruction: 'Lava el arroz y escurre el agua.',
        duration: 2,
        tips: null,
        warning: null,
        illustration: {
          url: 'https://media.example.test/step-one.svg',
          altText: 'Arroz QA bajo el grifo antes de cocinar',
          sourceLabel: 'Ilustración sintética de prueba',
          sourceUrl: 'https://media.example.test/source'
        }
      },
      {
        stepNumber: 2,
        instruction: 'Pica la cebolla en dados pequeños.',
        duration: 2,
        tips: null,
        warning: null,
        illustration: null
      },
      {
        stepNumber: 3,
        instruction: 'Sirve caliente y decora con perejil.',
        duration: 1,
        tips: null,
        warning: null,
        illustration: {
          url: 'https://media.example.test/broken.svg',
          altText: 'Emplatado de arroz QA',
          sourceLabel: 'Fuente de una imagen que no carga',
          sourceUrl: 'https://media.example.test/source'
        }
      }
    ],
    intermediate: [
      {
        stepNumber: 1,
        instruction: 'Enjuaga el arroz en agua fría hasta retirar el almidón superficial.',
        duration: 3,
        tips: 'Mueve los granos con suavidad.',
        warning: null,
        illustration: {
          url: 'https://media.example.test/step-one.svg',
          altText: 'Enjuague del arroz',
          sourceLabel: 'Ilustración sintética de prueba',
          sourceUrl: 'https://media.example.test/source'
        }
      },
      {
        stepNumber: 2,
        instruction: 'Corta la cebolla en dados regulares.',
        duration: 2,
        tips: null,
        warning: null,
        illustration: null
      },
      {
        stepNumber: 3,
        instruction: 'Emplata caliente y termina con perejil.',
        duration: 1,
        tips: null,
        warning: null,
        illustration: {
          url: 'https://media.example.test/broken.svg',
          altText: 'Emplatado de arroz QA',
          sourceLabel: 'Fuente de una imagen que no carga',
          sourceUrl: 'https://media.example.test/source'
        }
      }
    ],
    expert: [
      {
        stepNumber: 1,
        instruction: 'Lava el arroz y mide el caldo con una proporción de dos a uno.',
        duration: 4,
        tips: 'El agua del último enjuague debe quedar casi transparente.',
        warning: 'No dejes el arroz en remojo más tiempo del indicado.',
        illustration: {
          url: 'https://media.example.test/step-one.svg',
          altText: 'Preparación experta del arroz',
          sourceLabel: 'Ilustración sintética de prueba',
          sourceUrl: 'https://media.example.test/source'
        }
      },
      {
        stepNumber: 2,
        instruction: 'Corta la cebolla en brunoise uniforme.',
        duration: 2,
        tips: null,
        warning: null,
        illustration: null
      },
      {
        stepNumber: 3,
        instruction: 'Presenta el plato y decora con perejil.',
        duration: 1,
        tips: null,
        warning: null,
        illustration: {
          url: 'https://media.example.test/broken.svg',
          altText: 'Emplatado de arroz QA',
          sourceLabel: 'Fuente de una imagen que no carga',
          sourceUrl: 'https://media.example.test/source'
        }
      }
    ]
  },
  nutrition: { calories: 520, protein: 12, carbs: 86, fat: 12, fiber: 4, sugar: 3, sodium: 410 },
  storage: {
    method: 'Guardar una vez se haya enfriado.',
    container: 'Recipiente hermético',
    duration: 'hasta 2 días',
    reheatingInstructions: 'Añade una cucharada de agua y calienta bien.',
    freezingPossible: true,
    freezingDuration: 'hasta 1 mes'
  }
};

test('la ficha completa presenta detalle, ajusta raciones solo en pantalla y no solicita más IA', async ({
  page
}, testInfo) => {
  const viewport =
    testInfo.project.name === 'chromium'
      ? { width: 1440, height: 1000 }
      : { width: 393, height: 852 };
  const photoRequests = await mockRecipeStepPhotos(page);
  await registerAndGoto(page, '/recipes', 'recipe-full-detail');
  const recipe = await createSyntheticRecipe(page, fullRecipe);
  const aiRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/ai/')) aiRequests.push(request.url());
  });

  try {
    await page.goto(`/recipes?collection=all&page=1&recipe=${recipe.id}`);
    const detail = page.locator('[data-test="recipe-full-detail"]');
    await expect(page.locator('[data-test="recipe-detail-page"]')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-test="recipe-list-view"]')).toBeHidden();
    await expect(detail).toBeVisible();
    await expect(page.locator('[data-test="recipe-detail-title"]')).toBeFocused();
    const coverBox = await detail.locator('.recipe-detail__cover').boundingBox();
    const summaryBox = await detail.locator('.recipe-detail__header').boundingBox();
    expect(coverBox).not.toBeNull();
    expect(summaryBox).not.toBeNull();
    if (viewport.width <= 760) {
      expect(coverBox!.y + coverBox!.height).toBeLessThanOrEqual(summaryBox!.y + 1);
    } else {
      expect(
        coverBox!.x + coverBox!.width,
        'la portada debe quedar dentro de su columna, sin solaparse con el resumen'
      ).toBeLessThanOrEqual(summaryBox!.x + 1);
    }
    if (viewport.width <= 760) {
      const pageHeader = await page.locator('.recipe-detail-page__header').boundingBox();
      const pageTitle = await page.locator('[data-test="recipe-detail-title"]').boundingBox();
      expect(pageHeader).not.toBeNull();
      expect(pageTitle).not.toBeNull();
      expect(pageTitle!.x).toBeCloseTo(pageHeader!.x, 0);
      expect(pageTitle!.width).toBeGreaterThanOrEqual(pageHeader!.width - 1);
    }
    await expect(detail).toContainText('~520 kcal por ración');
    await expect(detail).toContainText('Tiempo total');
    await expect(detail).toContainText('Preparación');
    await expect(detail).toContainText('Cocción');
    await expect(detail).toContainText('Reposo');
    await expect(detail).toContainText('Azafrán QA');
    await expect(detail).toContainText('Opcional');
    await expect(detail).toContainText('quinoa');
    await expect(page.locator('[data-test="recipe-equipment"]')).toContainText('Cocina de gas');
    await expect(page.locator('[data-test="recipe-parallel-tasks"]')).toContainText(
      'Calienta el caldo'
    );
    await expect(page.locator('[data-test="recipe-tips-variations"]')).toContainText(
      'Tuesta el arroz'
    );
    await expect(page.locator('[data-test="recipe-storage"]')).toContainText('hasta 2 días');
    await expect(page.locator('[data-test="recipe-storage"]')).toContainText(
      'Recipiente hermético'
    );
    await expect(page.locator('[data-test="recipe-storage"]')).toContainText('hasta 1 mes');
    const orderedSections = [
      detail.locator('.recipe-detail__timings'),
      detail.locator('[data-test="recipe-nutrition"]'),
      detail.locator('[data-test="recipe-ingredients"]'),
      detail.locator('[data-test="recipe-equipment"]'),
      detail.locator('[data-test="recipe-preparation"]'),
      detail.locator('[data-test="recipe-parallel-tasks"]'),
      detail.locator('[data-test="recipe-tips-variations"]'),
      detail.locator('[data-test="recipe-storage"]')
    ];
    const sectionTops = await Promise.all(
      orderedSections.map(async (section) => (await section.boundingBox())?.y ?? Number.NaN)
    );
    expect(sectionTops, 'la ficha debe seguir el orden de lectura indicado en el prompt').toEqual(
      [...sectionTops].sort((left, right) => left - right)
    );
    const detailLevel = page.locator('[data-test="recipe-detail-level"]');
    const finalStep = detail.locator('.step-card[data-step-number="3"]');
    await finalStep.scrollIntoViewIfNeeded();
    const finalStepBox = await finalStep.boundingBox();
    const appHeaderBox = await page.locator('.header').boundingBox();
    expect(finalStepBox).not.toBeNull();
    if (testInfo.project.name === 'mobile-chrome') expect(appHeaderBox).not.toBeNull();
    if (appHeaderBox) {
      expect(finalStepBox!.y).toBeGreaterThanOrEqual(appHeaderBox.y + appHeaderBox.height);
    }
    const stepPhotos = detail.locator('[data-test="recipe-step-photo"]');
    await expect(stepPhotos).toHaveCount(3);
    await expect(stepPhotos.locator('img')).toHaveCount(3);
    await detailLevel.selectOption('basic');
    await expect(detail).toContainText('Lava el arroz y escurre el agua.');
    await expect(detail.locator('[data-test="recipe-step-photo"]')).toHaveCount(3);
    await expect(detail.getByRole('img', { name: 'Foto real de referencia: cut' })).toBeVisible();
    const photoShots = resolve('.e2e-screenshots/recipe-step-photos');
    mkdirSync(photoShots, { recursive: true });
    await detail.locator('.step-card[data-step-number="2"]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(photoShots, `${testInfo.project.name}-step-photos.png`),
      fullPage: false,
      animations: 'disabled'
    });
    const stepImage = detail.getByRole('img', { name: 'Foto real de referencia: wash' });
    await stepImage.scrollIntoViewIfNeeded();
    await expect(stepImage).toBeVisible();
    await expect(detail.getByRole('link', { name: 'Wikimedia Commons' }).first()).toHaveAttribute(
      'href',
      'https://commons.wikimedia.org/wiki/File:synthetic-wash.jpg'
    );
    expect(
      photoRequests.filter((request) => request.path.endsWith('/step-photos')).every(
        (request) => Object.keys(request.params).length === 1 && 'scene' in request.params
      ),
      'las consultas solo envían una escena genérica, nunca el texto del paso'
    ).toBeTruthy();

    const servings = page.locator('[data-test="recipe-serving-count"]');
    await expect(servings).toHaveValue('2');
    await expect(detail.locator('[data-test="recipe-ingredients"] li').first()).toContainText(
      '200 g'
    );
    await servings.fill('4');
    await expect(detail.locator('[data-test="recipe-ingredients"] li').first()).toContainText(
      '400 g'
    );

    await detailLevel.selectOption('expert');
    await expect(detail.locator('[data-test="recipe-step-photo"]')).toHaveCount(3);
    await expect(detail).toContainText('proporción de dos a uno');
    await expect(detail).toContainText('No dejes el arroz en remojo');
    expect(aiRequests, 'cambiar nivel y raciones no debe volver a invocar la IA').toEqual([]);

    const persistedResponse = await page.request.get(`/api/recipes/${recipe.id}`, {
      headers: { authorization: `Bearer ${recipe.token}` }
    });
    expect(persistedResponse.ok()).toBeTruthy();
    const persisted = (await persistedResponse.json()).data;
    expect(persisted.servings).toBe(2);
    expect(persisted.ingredients[0].quantity).toBe(200);
    expect(persisted.instructionsByLevel.expert[0].instruction).toContain(
      'proporción de dos a uno'
    );

    await waitForStableView(page);
    await servings.fill('2');
    await detailLevel.selectOption('basic');
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(viewport.width);
    const screenshots = resolve('.e2e-screenshots/recipe-full-detail');
    mkdirSync(screenshots, { recursive: true });
    await page.screenshot({
      path: resolve(screenshots, `${testInfo.project.name}-full-detail.png`),
      fullPage: false,
      animations: 'disabled'
    });

    if (testInfo.project.name === 'mobile-chrome') {
      await page.setViewportSize({ width: 320, height: 568 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(320);
      await expect(detail.getByRole('heading', { name: 'Preparación' })).toBeVisible();
      const visiblePhoto = detail.locator('[data-test="recipe-step-photo"]').first();
      await visiblePhoto.scrollIntoViewIfNeeded();
      const narrowPhotoBox = await visiblePhoto.boundingBox();
      expect(narrowPhotoBox).not.toBeNull();
      expect(narrowPhotoBox!.x + narrowPhotoBox!.width).toBeLessThanOrEqual(320);

      await page.setViewportSize({ width: 568, height: 320 });
      await visiblePhoto.scrollIntoViewIfNeeded();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(568);
      const landscapePhotoBox = await visiblePhoto.boundingBox();
      expect(landscapePhotoBox).not.toBeNull();
      expect(landscapePhotoBox!.x + landscapePhotoBox!.width).toBeLessThanOrEqual(568);
    }

    await detailLevel.selectOption('expert');
    await expect(detail).toContainText('proporción de dos a uno');
    const backToRecipes = page.getByRole('button', { name: 'Volver a recetas' });
    await backToRecipes.focus();
    await backToRecipes.press('Enter');
    await expect(page).toHaveURL(/\/recipes\?collection=all&page=1$/);
    await expect(page.locator('[data-test="recipe-list-heading"]')).toBeFocused();

    const recipeCard = page.locator('.recipe-card').filter({ hasText: recipe.name });
    await expect(recipeCard).toBeVisible();
    await recipeCard.locator('.recipe-card__open').focus();
    await recipeCard.locator('.recipe-card__open').press('Enter');
    await expect(page).toHaveURL(new RegExp(`/recipes\\?[^#]*recipe=${recipe.id}`));
    await expect(page.locator('[data-test="recipe-detail-page"]')).toBeVisible();
    await expect(page.locator('[data-test="recipe-detail-level"]')).toHaveValue('expert');
    expect(aiRequests, 'reabrir la ficha no debe volver a invocar la IA').toEqual([]);
    await expect(page.locator('[data-test="recipe-detail-title"]')).toBeFocused();
    await page.goBack();
    await expect(page).toHaveURL(/\/recipes\?collection=all&page=1$/);
    await expect(page.locator('[data-test="recipe-list-view"]')).toBeVisible();
    await expect(page.locator('[data-test="recipe-list-heading"]')).toBeFocused();

    await page.goto('/recipes#ai');
    const aiDialog = page.getByRole('dialog', { name: 'Generar Receta con IA' });
    await expect(aiDialog).toBeVisible();
    const generationServings = page.getByLabel('Porciones', { exact: true });
    await expect(generationServings).toHaveValue('2');
    await generationServings.fill('3');
    await expect(generationServings).toHaveValue('3');
    expect(
      aiRequests,
      'confirmar o cambiar raciones no debe iniciar por sí solo una llamada'
    ).toEqual([]);
  } finally {
    await deleteSyntheticRecipe(page, recipe);
  }
});
