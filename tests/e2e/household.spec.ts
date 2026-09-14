import { test, expect } from '@playwright/test';

test.describe('Household sharing & invite flow', () => {
  test('invite code appears immediately after creating household and is a full URL', async ({ page }) => {
    const email = `hh-${Date.now()}@example.com`;
    await page.goto('/auth/register');
    await page.fill('#name', 'Homeowner');
    await page.fill('#email', email);
    await page.fill('#password', 'Test1234');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    // Create household
    await page.goto('/household');
    await page.getByRole('button', { name: /Crear hogar/i }).click();
    await page.fill('#householdName', 'Mi Casa');
    await page.click('button[type="submit"]');

    // Invite code should be a full URL (http.../invite/CODE)
    await expect(page.locator('.invite-card__code')).toContainText('/invite/');
    // Copy link button present
    await expect(page.getByRole('button', { name: /Copiar enlace/ })).toBeVisible();
    // Share toggles present (admin sees them)
    await expect(page.getByText(/Despensa compartida/)).toBeVisible();
    await expect(page.getByText(/Recetas compartidas/)).toBeVisible();
    await expect(page.getByText(/Calendario compartido/)).toBeVisible();
    // Admin badge on member list
    await expect(page.locator('text=Admin')).toBeVisible();
  });

  test('public invite page shows household name and join/login CTAs for logged-out users', async ({ browser }) => {
    // First register + create household in one context
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const email = `owner-${Date.now()}@example.com`;
    await ownerPage.goto('/auth/register');
    await ownerPage.fill('#name', 'Owner');
    await ownerPage.fill('#email', email);
    await ownerPage.fill('#password', 'Test1234');
    await ownerPage.click('button[type="submit"]');
    await ownerPage.waitForURL(/.*dashboard/);
    await ownerPage.goto('/household');
    await ownerPage.getByRole('button', { name: /Crear hogar/i }).click();
    await ownerPage.fill('#householdName', 'Familia López');
    await ownerPage.click('button[type="submit"]');
    const inviteUrl = await ownerPage.locator('.invite-card__code').textContent();
    expect(inviteUrl).toContain('/invite/');
    const code = inviteUrl!.split('/invite/')[1];
    await ownerCtx.close();

    // Fresh context: open invite page without login
    const guestCtx = await browser.newContext();
    const guestPage = await guestCtx.newPage();
    await guestPage.goto(`/invite/${code}`);
    await expect(guestPage.locator('text=Familia López')).toBeVisible();
    await expect(guestPage.getByRole('link', { name: /Iniciar sesión/ })).toBeVisible();
    await expect(guestPage.getByRole('link', { name: /Crear cuenta/ })).toBeVisible();
    await guestCtx.close();
  });
});
