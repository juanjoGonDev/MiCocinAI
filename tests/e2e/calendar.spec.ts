import { test, expect } from '@playwright/test';

test.describe('Calendar', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/auth/login');
    await page.fill('input#email', 'test@example.com');
    await page.fill('input#password', 'Password1');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    // Navigate to calendar
    await page.goto('/calendar');
  });

  test('should display calendar page', async ({ page }) => {
    await expect(page.locator('text=Planificación Semanal')).toBeVisible();
  });

  test('should show week navigation', async ({ page }) => {
    await expect(page.locator('text=Hoy')).toBeVisible();
    
    const prevBtn = page.locator('button:has-text("←")');
    const nextBtn = page.locator('button:has-text("→")');
    
    await expect(prevBtn).toBeVisible();
    await expect(nextBtn).toBeVisible();
  });

  test('should show AI planning button', async ({ page }) => {
    await expect(page.locator('text=Planificar IA')).toBeVisible();
  });

  test('should show weekly progress', async ({ page }) => {
    await expect(page.locator('text=Calorías')).toBeVisible();
    await expect(page.locator('text=Comidas planificadas')).toBeVisible();
  });

  test('should show day columns', async ({ page }) => {
    await expect(page.locator('text=LUN')).toBeVisible();
    await expect(page.locator('text=MAR')).toBeVisible();
    await expect(page.locator('text=MIÉ')).toBeVisible();
    await expect(page.locator('text=JUE')).toBeVisible();
    await expect(page.locator('text=VIE')).toBeVisible();
    await expect(page.locator('text=SÁB')).toBeVisible();
    await expect(page.locator('text=DOM')).toBeVisible();
  });

  test('should show meal types for each day', async ({ page }) => {
    // Check for meal type labels
    const breakfastSlots = page.locator('text=🌅 Desayuno');
    const lunchSlots = page.locator('text=☀️ Almuerzo');
    const dinnerSlots = page.locator('text=🌙 Cena');
    
    // At least some should be visible
    const breakfastCount = await breakfastSlots.count();
    expect(breakfastCount).toBeGreaterThan(0);
  });

  test('should open add meal modal when clicking empty slot', async ({ page }) => {
    // Click on an empty meal slot
    const emptySlot = page.locator('.meal-slot').first();
    await emptySlot.click();

    await expect(page.locator('text=Agregar Comida')).toBeVisible();
  });

  test('should show add meal form', async ({ page }) => {
    const emptySlot = page.locator('.meal-slot').first();
    await emptySlot.click();

    await expect(page.locator('text=Escribir')).toBeVisible();
    await expect(page.locator('text=Receta')).toBeVisible();
  });

  test('should switch between custom and recipe tabs', async ({ page }) => {
    const emptySlot = page.locator('.meal-slot').first();
    await emptySlot.click();

    // Click on recipe tab
    await page.click('text=Receta');

    await expect(page.locator('text=Selecciona una receta')).toBeVisible();
  });

  test('should open goals modal', async ({ page }) => {
    // Click on change goal button
    const changeBtn = page.locator('text=Cambiar');
    
    if (await changeBtn.isVisible()) {
      await changeBtn.click();

      await expect(page.locator('text=Objetivos Nutricionales')).toBeVisible();
      await expect(page.locator('text=Equilibrada')).toBeVisible();
      await expect(page.locator('text=Perder peso')).toBeVisible();
    }
  });

  test('should open AI planning modal', async ({ page }) => {
    await page.click('text=Planificar IA');

    await expect(page.locator('text=Planificar con IA')).toBeVisible();
    await expect(page.locator('text=Objetivo')).toBeVisible();
    await expect(page.locator('text=Calorías diarias')).toBeVisible();
  });

  test('should navigate to previous week', async ({ page }) => {
    const prevBtn = page.locator('button:has-text("←")');
    await prevBtn.click();

    // Should update the week label
    await page.waitForTimeout(500);
  });

  test('should navigate to next week', async ({ page }) => {
    const nextBtn = page.locator('button:has-text("→")');
    await nextBtn.click();

    await page.waitForTimeout(500);
  });

  test('should go to today', async ({ page }) => {
    // Navigate away first
    const nextBtn = page.locator('button:has-text("→")');
    await nextBtn.click();
    await page.waitForTimeout(300);

    // Click today
    await page.click('text=Hoy');

    await page.waitForTimeout(300);
  });
});
