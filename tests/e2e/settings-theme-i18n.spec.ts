import { test, expect } from '@playwright/test';

test.describe('Settings — theme & i18n', () => {
  test.beforeEach(async ({ page }) => {
    const email = `settings-${Date.now()}@example.com`;
    await page.goto('/auth/register');
    await page.fill('input#name', 'Tester');
    await page.fill('input#email', email);
    await page.fill('input#password', 'Test1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);
  });

  test('settings page renders theme and language sections', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('text=Configuración')).toBeVisible();
    // Both theme options (three variants: claro/oscuro/sistema OR light/dark/system)
    await expect(page.getByRole('button', { name: /Claro|Light/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Oscuro|Dark/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sistema|System/ })).toBeVisible();
    // Language options (auto, es, en)
    await expect(page.getByRole('button', { name: /Detectar|Auto/ })).toBeVisible();
  });

  test('switching to dark theme applies data-theme=dark', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /Oscuro|Dark/ }).click();
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });

  test('switching to light theme applies data-theme=light', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /Claro|Light/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('switching language to English translates the nav', async ({ page }) => {
    await page.goto('/settings');
    // Click English language option
    await page.getByRole('button', { name: /English|Inglés/ }).click();
    // Nav should show "Home" instead of "Inicio"
    await expect(page.locator('a.sidebar__item').getByText('Home')).toBeVisible();
    // Settings title becomes "Settings"
    await expect(page.locator('text=Settings')).toBeVisible();
  });

  test('language preference persists across reloads', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /English|Inglés/ }).click();
    await page.reload();
    await expect(page.locator('a.sidebar__item').getByText('Home')).toBeVisible();
  });

  test('system theme reacts to prefers-color-scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/settings');
    await page.getByRole('button', { name: /Sistema|System/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.emulateMedia({ colorScheme: 'light' });
    // When emulating, we need a reload or to trigger the listener
    await page.reload();
    await page.goto('/settings');
    await page.getByRole('button', { name: /Sistema|System/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});
