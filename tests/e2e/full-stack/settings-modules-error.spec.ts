import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '../fixtures';
import { registerAndGoto } from '../helpers/auth';

// The route creates a real account; keep its bearer credentials out of traces and screenshots.
test.use({ serviceWorkers: 'block', trace: 'off', screenshot: 'off', video: 'off' });

function isTastePatch(response: import('@playwright/test').Response): boolean {
  return new URL(response.url()).pathname.endsWith('/api/auth/taste') && response.request().method() === 'PATCH';
}

test('un fallo al guardar módulos revierte, desbloquea y permite reintentar', async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile-chrome';
  const initialViewport = isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  await page.setViewportSize(initialViewport);
  await registerAndGoto(page, '/settings');

  const pantrySwitch = page.locator('[data-module-switch="pantry"]');
  await expect(pantrySwitch).toHaveAttribute('aria-checked', 'true');
  await expect(pantrySwitch).toBeEnabled();

  let shouldFailNextPatch = true;
  let notifyPatchObserved!: () => void;
  let releaseFailedPatch!: () => void;
  const patchObserved = new Promise<void>((resolve) => { notifyPatchObserved = resolve; });
  const failedResponseGate = new Promise<void>((resolve) => { releaseFailedPatch = resolve; });

  await page.route('**/api/auth/taste*', async (route) => {
    if (route.request().method() === 'PATCH' && shouldFailNextPatch) {
      shouldFailNextPatch = false;
      notifyPatchObserved();
      await failedResponseGate;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'synthetic QA failure' })
      });
      return;
    }
    await route.continue();
  });

  const failedResponsePromise = page.waitForResponse(isTastePatch);
  if (isMobile) await pantrySwitch.tap();
  else await pantrySwitch.click();
  await patchObserved;
  await expect(pantrySwitch).toBeDisabled();
  releaseFailedPatch();

  const failedResponse = await failedResponsePromise;
  expect(failedResponse.status()).toBe(500);
  await expect(pantrySwitch).toHaveAttribute('aria-checked', 'true');
  await expect(pantrySwitch).toBeEnabled();
  await expect(page.locator('.settings-hint--error')).toBeVisible();

  const viewports = isMobile
    ? [
        { width: 320, height: 740 },
        { width: 360, height: 800 },
        { width: 390, height: 844 },
        { width: 430, height: 932 },
        { width: 844, height: 390 },
        { width: 932, height: 430 }
      ]
    : [
        { width: 767, height: 900 },
        { width: 768, height: 900 },
        { width: 769, height: 900 },
        { width: 1023, height: 900 },
        { width: 1024, height: 900 },
        { width: 1280, height: 900 },
        { width: 1440, height: 900 }
      ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, `Configuración no debe desbordarse a ${viewport.width}×${viewport.height}`).toBe(false);
    await expect(pantrySwitch).toBeVisible();
    await expect(pantrySwitch).toBeEnabled();
  }

  const screenshotDirectory = process.env.E2E_SCREENSHOT_DIR;
  if (screenshotDirectory) {
    mkdirSync(screenshotDirectory, { recursive: true });
    await page.setViewportSize(initialViewport);
    await pantrySwitch.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(screenshotDirectory, `settings-modules-error-${isMobile ? 'mobile' : 'desktop'}-${Date.now()}.png`),
      fullPage: true
    });
  }

  const retryResponsePromise = page.waitForResponse(isTastePatch);
  await pantrySwitch.focus();
  await pantrySwitch.press('Space');
  const retryResponse = await retryResponsePromise;
  expect(retryResponse.ok()).toBe(true);
  await expect(pantrySwitch).toHaveAttribute('aria-checked', 'false');
  await expect(pantrySwitch).toBeEnabled();
  await expect(page.locator('.settings-hint--error')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('[data-module-switch="pantry"]')).toHaveAttribute('aria-checked', 'false');
});
