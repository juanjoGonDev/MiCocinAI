import { test, expect } from '@playwright/test';
import { registerUser } from './helpers/auth';

test.describe('Settings — theme & i18n', () => {
  test.beforeEach(async ({ page }) => {
    await registerUser(page, 'Tester');
    await page.goto('/settings');
    await expect(page.locator('.settings-group__title').first()).toBeVisible();
  });

  test('settings page renders theme and language sections', async ({ page }) => {
    await expect(page.locator('.settings-group__title').nth(0)).toContainText(/Tema|Theme/);
    await expect(page.getByRole('button', { name: /Claro|Light/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Oscuro|Dark/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sistema|System/ })).toBeVisible();

    await expect(page.locator('.settings-group__title').nth(1)).toContainText(/Idioma|Language/);
    await expect(
      page.locator('.settings-group').nth(1).locator('button.settings-option')
    ).toHaveCount(3);
  });

  test('switching to dark theme applies data-theme=dark', async ({ page }) => {
    await page.getByRole('button', { name: /Oscuro|Dark/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('switching to light theme applies data-theme=light', async ({ page }) => {
    await page.getByRole('button', { name: /Claro|Light/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('switching language to English translates the settings page', async ({ page }) => {
    await page.getByRole('button', { name: /English/ }).click();
    await expect(page.locator('.settings-group__title').nth(1)).toHaveText('Language');
  });

  test('language preference persists across reloads', async ({ page }) => {
    await page.getByRole('button', { name: /English/ }).click();
    await page.reload();
    await expect(page.locator('.settings-group__title').nth(1)).toHaveText('Language');
  });

  test('system theme follows prefers-color-scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/settings');
    await page.getByRole('button', { name: /Sistema|System/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
