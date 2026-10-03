import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from './fixtures';
import { registerUser } from './helpers/auth';

test.describe('Auth refresh failure', () => {
  test('ends protected requests and returns to login when refresh is rejected', async ({
    page
  }, testInfo) => {
    const pageErrors: string[] = [];
    const refreshStatuses: number[] = [];
    const protectedPaths: string[] = [];
    const apiRequests = new Set<string>();
    const settledRequests = new Set<string>();
    const requestIds = new WeakMap<object, string>();
    let sequence = 0;

    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) return;

      const id = String(++sequence);
      requestIds.set(request, id);
      apiRequests.add(id);
      if (url.pathname !== '/api/auth/refresh') protectedPaths.push(url.pathname);
    });
    page.on('response', (response) => {
      if (new URL(response.url()).pathname === '/api/auth/refresh') {
        refreshStatuses.push(response.status());
      }
    });
    page.on('requestfinished', (request) => {
      const id = requestIds.get(request);
      if (id) settledRequests.add(id);
    });
    page.on('requestfailed', (request) => {
      const id = requestIds.get(request);
      if (id) settledRequests.add(id);
    });

    await registerUser(page, 'Expired session E2E');
    const isMobile = testInfo.project.name === 'mobile-chrome';
    apiRequests.clear();
    settledRequests.clear();
    protectedPaths.length = 0;
    refreshStatuses.length = 0;
    sequence = 0;
    await page.evaluate(() => {
      const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      localStorage.setItem('hogar:v1:auth_token', `e30.${payload}.invalid-signature`);
      localStorage.setItem('hogar:v1:refresh_token', 'synthetic-invalid-refresh');
    });

    await page.setViewportSize(
      isMobile ? { width: 393, height: 851 } : { width: 1440, height: 900 }
    );
    await page.reload();

    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 20000 });
    await expect.poll(() => refreshStatuses.includes(401), { timeout: 10000 }).toBe(true);
    await expect.poll(() => protectedPaths.length, { timeout: 10000 }).toBeGreaterThan(0);
    await expect
      .poll(() => [...apiRequests].every((id) => settledRequests.has(id)), { timeout: 10000 })
      .toBe(true);
    expect(pageErrors).toEqual([]);
    expect(
      await page.evaluate(() => [
        localStorage.getItem('hogar:v1:auth_token'),
        localStorage.getItem('hogar:v1:refresh_token')
      ])
    ).toEqual([null, null]);

    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width);

    const screenshotDirectory = process.env.E2E_SCREENSHOT_DIR;
    if (screenshotDirectory) {
      mkdirSync(screenshotDirectory, { recursive: true });
      await page.screenshot({
        path: join(screenshotDirectory, `${isMobile ? 'mobile' : 'desktop'}.png`),
        fullPage: true,
        animations: 'disabled'
      });
    }
  });
});
