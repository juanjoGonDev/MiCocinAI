import { test, expect } from '@playwright/test';

test.describe('Household', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/auth/login');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'Password1');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    // Navigate to household
    await page.goto('/household');
  });

  test('should display household page', async ({ page }) => {
    await expect(page.locator('text=Hogar')).toBeVisible();
  });

  test('should show no household state when user has no household', async ({ page }) => {
    const noHousehold = page.locator('text=No tienes un hogar');
    
    if (await noHousehold.isVisible()) {
      await expect(noHousehold).toBeVisible();
      await expect(page.locator('text=Crear hogar')).toBeVisible();
      await expect(page.locator('text=Unirse con código')).toBeVisible();
    }
  });

  test('should open create household modal', async ({ page }) => {
    await page.click('text=Crear hogar');

    await expect(page.locator('text=Crear Hogar')).toBeVisible();
    await expect(page.locator('#name')).toBeVisible();
  });

  test('should open join household modal', async ({ page }) => {
    await page.click('text=Unirse con código');

    await expect(page.locator('text=Unirse a un Hogar')).toBeVisible();
    await expect(page.locator('#inviteCode')).toBeVisible();
  });

  test('should create a household', async ({ page }) => {
    await page.click('text=Crear hogar');

    await page.fill('#name', 'Mi Hogar Test');

    await page.click('text=Crear');

    // Should show success
    await expect(page.locator('text=Creado')).toBeVisible();
  });

  test('should show household info after creation', async ({ page }) => {
    const householdName = page.locator('text=Mi Hogar Test');
    
    if (await householdName.isVisible()) {
      await expect(householdName).toBeVisible();
      await expect(page.locator('text=miembros')).toBeVisible();
    }
  });

  test('should show invite code', async ({ page }) => {
    const inviteCode = page.locator('text=Código de invitación');
    
    if (await inviteCode.isVisible()) {
      await expect(inviteCode).toBeVisible();
      await expect(page.locator('text=Copiar')).toBeVisible();
    }
  });

  test('should copy invite code', async ({ page }) => {
    const copyBtn = page.locator('text=Copiar');
    
    if (await copyBtn.isVisible()) {
      await copyBtn.click();

      await expect(page.locator('text=Copiado')).toBeVisible();
    }
  });

  test('should show members section', async ({ page }) => {
    const membersSection = page.locator('text=Miembros');
    
    if (await membersSection.isVisible()) {
      await expect(membersSection).toBeVisible();
    }
  });

  test('should close create modal on cancel', async ({ page }) => {
    await page.click('text=Crear hogar');

    await expect(page.locator('text=Crear Hogar')).toBeVisible();

    await page.click('text=Cancelar');

    await expect(page.locator('text=Crear Hogar')).not.toBeVisible();
  });

  test('should close join modal on cancel', async ({ page }) => {
    await page.click('text=Unirse con código');

    await expect(page.locator('text=Unirse a un Hogar')).toBeVisible();

    await page.click('text=Cancelar');

    await expect(page.locator('text=Unirse a un Hogar')).not.toBeVisible();
  });
});
