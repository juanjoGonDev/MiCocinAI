import type { Page } from '@playwright/test';
import { expect } from '../fixtures';

const TOKEN_KEY = 'hogar:v1:auth_token';

export interface SyntheticRecipe {
  id: string;
  name: string;
  token: string;
}

export interface SyntheticRecipeOptions {
  name?: string;
  tips?: string;
  warning?: string;
}

export async function createSyntheticRecipe(
  page: Page,
  options: SyntheticRecipeOptions = {}
): Promise<SyntheticRecipe> {
  const token = await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY);
  if (!token) throw new Error('la sesión de prueba debe estar autenticada');

  const name = options.name ?? `Receta QA ${Date.now()}`;
  const response = await page.request.post('/api/recipes', {
    headers: { authorization: `Bearer ${token}` },
    data: {
      name,
      description: 'Fixture sintético para comprobar navegación y deep links.',
      difficulty: 'easy',
      totalTime: 15,
      prepTime: 5,
      cookTime: 10,
      servings: 2,
      ingredients: [{ name: 'Tomate QA', quantity: 2, unit: 'unit' }],
      steps: [
        {
          stepNumber: 1,
          instruction: 'Cortar el tomate.',
          ...(options.tips ? { tips: options.tips } : {}),
          ...(options.warning ? { warning: options.warning } : {})
        }
      ]
    }
  });
  expect(
    response.ok(),
    `el alta sintética debe responder 2xx, obtuvo ${response.status()}`
  ).toBeTruthy();
  const body = (await response.json()) as { data: { id: string } };
  return { id: body.data.id, name, token };
}

export async function deleteSyntheticRecipe(page: Page, recipe: SyntheticRecipe): Promise<void> {
  const response = await page.request.delete(`/api/recipes/${recipe.id}`, {
    headers: { authorization: `Bearer ${recipe.token}` }
  });
  expect(response.ok(), 'el fixture de receta propio debe limpiarse').toBeTruthy();
}

export async function waitForStableView(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
  await page.waitForFunction(() => {
    if (document.getAnimations().some((animation) => animation.playState !== 'finished'))
      return false;
    const overlay = document.querySelector<HTMLElement>('.modal-overlay');
    const modal = document.querySelector<HTMLElement>('.modal');
    return (
      !overlay ||
      !modal ||
      (getComputedStyle(overlay).opacity === '1' && getComputedStyle(modal).transform === 'none')
    );
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}
