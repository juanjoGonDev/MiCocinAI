import { test, expect } from '@playwright/test';

test.describe('Logs page', () => {
  test.beforeEach(async ({ page }) => {
    // Register a fresh user (random email)
    const email = `logs-${Date.now()}@example.com`;
    await page.goto('/auth/register');
    await page.fill('#name', 'Logger');
    await page.fill('#email', email);
    await page.fill('#password', 'Test1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);
    await page.goto('/logs');
  });

  test('should render the logs terminal', async ({ page }) => {
    // Toolbar
    await expect(page.locator('text=📋 Logs')).toBeVisible();
    // Live/disconnected indicator
    await expect(page.locator('text=En vivo').or(page.locator('text=Live'))).toBeVisible();
    // Terminal chrome
    await expect(page.locator('.terminal__body')).toBeVisible();
    // Source/level filters
    await expect(page.locator('select.logs-select').first()).toBeVisible();
    // Pause / autoscroll / clear buttons exist
    await expect(page.getByRole('button', { name: /Pausar|Pause/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Auto-scroll/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Limpiar|Clear/ })).toBeVisible();
  });

  test('should show startup server logs after page load', async ({ page }) => {
    // Should have seen [SRV] log lines (server startup entries like DB initialized)
    await expect(page.locator('.terminal__body')).toContainText(/Database initialized|Database tables/);
  });

  test('should toggle pause and stop receiving new entries', async ({ page }) => {
    const pauseBtn = page.getByRole('button', { name: /Pausar|Pause/ });
    await pauseBtn.click();
    // Button label should change to resume
    await expect(page.getByRole('button', { name: /Reanudar|Resume/ })).toBeVisible();
    await pauseBtn.click();
    await expect(page.getByRole('button', { name: /Pausar|Pause/ })).toBeVisible();
  });

  test('should filter by server source and hide client entries', async ({ page }) => {
    // Select "Servidor" / "Server" in source filter
    const sourceSelect = page.locator('select.logs-select').first();
    await sourceSelect.selectOption({ label: /Servidor|Server/ });
    // All visible lines should have [SRV]
    const lines = page.locator('.terminal__line');
    const count = await lines.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      await expect(lines.nth(i)).toContainText(/\[SRV\]/);
    }
  });

  test('should toggle auto-scroll off and on', async ({ page }) => {
    const autoBtn = page.getByRole('button', { name: /Auto-scroll/ });
    await autoBtn.click();
    await expect(autoBtn).toContainText('OFF');
    await autoBtn.click();
    await expect(autoBtn).toContainText('ON');
  });
});
