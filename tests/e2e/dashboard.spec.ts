import { test, expect } from '@playwright/test';
import { registerUser } from './helpers/auth';

test.describe('Dashboard (new user) — empty states', () => {
  test('shows greeting, empty states and quick stats', async ({ page }) => {
    await registerUser(page, 'Dash');
    await page.goto('/dashboard');

    // Greeting should contain user name
    await expect(page.locator('h1.dashboard__title')).toContainText('Dash');

    // No meals / no suggested recipes for a brand new user
    await expect(page.locator('.empty-state__text').first()).toBeVisible();

    // Quick stats are rendered
    await expect(page.locator('.stat-card__value').first()).toBeVisible();
    await expect(page.locator('.stat-card__label').first()).toBeVisible();
  });

  test('quick actions navigate to correct sections', async ({ page }) => {
    await registerUser(page, 'QA');
    await page.goto('/dashboard');

    await page.locator('a.action-card[href="/pantry"]').click();
    await expect(page).toHaveURL(/.*pantry/);

    await page.goto('/dashboard');
    await page.locator('a.action-card[href="/calendar"]').click();
    await expect(page).toHaveURL(/.*calendar/);
  });
});
