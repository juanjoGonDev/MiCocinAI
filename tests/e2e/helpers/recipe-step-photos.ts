import type { Page } from '@playwright/test';

const PHOTO_IDS: Record<string, string> = {
  wash: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  cut: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  mix: 'cccccccccccccccccccccccc',
  cook: 'dddddddddddddddddddddddd',
  bake: 'eeeeeeeeeeeeeeeeeeeeeeee',
  rest: 'ffffffffffffffffffffffff',
  serve: '111111111111111111111111',
  prepare: '222222222222222222222222'
};

const SYNTHETIC_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nm9kAAAAASUVORK5CYII=',
  'base64'
);

export interface StepPhotoRequest {
  path: string;
  params: Record<string, string>;
}

/** Isolated E2E media: no internet request and no real recipe text leaves the browser. */
export async function mockRecipeStepPhotos(page: Page): Promise<StepPhotoRequest[]> {
  const requests: StepPhotoRequest[] = [];
  await page.route('**/api/recipes/step-photos**', async (route) => {
    const url = new URL(route.request().url());
    const params = Object.fromEntries(url.searchParams.entries());
    requests.push({ path: url.pathname, params });

    if (url.pathname.endsWith('/image')) {
      await route.fulfill({ status: 200, contentType: 'image/png', body: SYNTHETIC_PNG });
      return;
    }

    const scene = url.searchParams.get('scene') ?? '';
    const id = PHOTO_IDS[scene];
    if (!id || Object.keys(params).some((key) => key !== 'scene')) {
      await route.fulfill({ status: 400, json: { success: false, message: 'Invalid photo scene' } });
      return;
    }
    await route.fulfill({
      status: 200,
      json: {
        success: true,
        data: {
          id,
          altText: `Foto real de referencia: ${scene}`,
          author: 'Autora sintética de E2E',
          licenseName: 'CC BY 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
          sourceUrl: `https://commons.wikimedia.org/wiki/File:synthetic-${scene}.jpg`
        }
      }
    });
  });
  return requests;
}
