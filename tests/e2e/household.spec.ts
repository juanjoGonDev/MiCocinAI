import { test, expect } from '@playwright/test';

test.describe('Household sharing & invite flow', () => {
  test('invite code appears immediately after creating household and is a full URL', async ({ page }) => {
    const email = `hh-${Date.now()}@example.com`;
    await page.goto('/auth/register');
    await page.fill('input#name', 'Homeowner');
    await page.fill('input#email', email);
    await page.fill('input#password', 'Test1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    // Create household
    await page.goto('/household');
    await page.getByRole('button', { name: /Crear hogar/i }).click();
    await page.fill('input#householdName', 'Mi Casa');
    await page.click('button[type="submit"]');

    // Invite code should be a full URL (http.../invite/CODE)
    await expect(page.locator('.invite-card__code')).toContainText('/invite/');
    // Copy link button present
    await expect(page.getByRole('button', { name: /Copiar enlace/ })).toBeVisible();
    // Share toggles present (admin sees them)
    const shareSection = page.locator('.settings-section');
    await expect(shareSection).toContainText('Despensa compartida');
    await expect(shareSection).toContainText('Recetas compartidas');
    await expect(shareSection).toContainText('Calendario compartido');
    // Admin badge on member list
    await expect(page.locator('.member-card').first()).toContainText('Admin');
  });

  test('public invite page shows household name and join/login CTAs for logged-out users', async ({ browser }) => {
    // First register + create household in one context
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const email = `owner-${Date.now()}@example.com`;
    await ownerPage.goto('/auth/register');
    await ownerPage.fill('input#name', 'Owner');
    await ownerPage.fill('input#email', email);
    await ownerPage.fill('input#password', 'Test1234');
    await ownerPage.click('button[type="submit"]');
    await ownerPage.waitForURL(/.*dashboard/);
    await ownerPage.goto('/household');
    await ownerPage.getByRole('button', { name: /Crear hogar/i }).click();
    await ownerPage.fill('input#householdName', 'Familia López');
    await ownerPage.click('button[type="submit"]');
    const inviteUrl = await ownerPage.locator('.invite-card__code').textContent();
    expect(inviteUrl).toContain('/invite/');
    const code = inviteUrl!.split('/invite/')[1];
    await ownerCtx.close();

    // Fresh context: open invite page without login
    const guestCtx = await browser.newContext();
    const guestPage = await guestCtx.newPage();
    await guestPage.goto(`/invite/${code}`);
    await expect(guestPage.locator('.invite-card__title')).toContainText('Familia López');
    await expect(guestPage.getByRole('link', { name: /Iniciar sesión/ })).toBeVisible();
    await expect(guestPage.getByRole('link', { name: /Crear cuenta/ })).toBeVisible();
    await guestCtx.close();
  });
});
