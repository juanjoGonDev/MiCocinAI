import { test, expect } from '@playwright/test';
import { registerAndGoto } from './helpers/auth';

test.describe('Logs page', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndGoto(page, '/logs');
    await expect(page.locator('.terminal__body')).toBeVisible();
  });

  test('should render the logs terminal', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Logs');
    // Live/disconnected indicator
    await expect(page.locator('.logs-toolbar')).toContainText(/En vivo|Desconectado/);
    // Source/level filters
    await expect(page.locator('select.logs-select').first()).toBeVisible();
    // Pause / autoscroll / clear buttons exist
    await expect(page.getByRole('button', { name: /Pausar|Pause/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Auto-scroll/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Limpiar|Clear/ })).toBeVisible();
  });

  test('should toggle pause and resume', async ({ page }) => {
    const pauseBtn = page.getByRole('button', { name: /Pausar|Pause/ });
    await pauseBtn.click();
    await expect(page.getByRole('button', { name: /Reanudar|Resume/ })).toBeVisible();

    await page.getByRole('button', { name: /Reanudar|Resume/ }).click();
    await expect(page.getByRole('button', { name: /Pausar|Pause/ })).toBeVisible();
  });

  test('should toggle auto-scroll off and on', async ({ page }) => {
    const autoBtn = page.getByRole('button', { name: /Auto-scroll/ });
    await autoBtn.click();
    await expect(autoBtn).toContainText('OFF');
    await autoBtn.click();
    await expect(autoBtn).toContainText('ON');
  });

  test('should filter by server source', async ({ page }) => {
    await page.locator('select.logs-select').first().selectOption('server');

    const lines = page.locator('.terminal__line');
    const count = await lines.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      await expect(lines.nth(i)).toContainText('[SRV]');
    }
  });
});
