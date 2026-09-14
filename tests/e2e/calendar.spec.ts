import { test, expect } from '@playwright/test';
import { registerAndGoto } from './helpers/auth';

test.describe('Calendar', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndGoto(page, '/calendar');
    await expect(page.locator('h1.calendar__title')).toBeVisible();
  });

  test('should display calendar page', async ({ page }) => {
    await expect(page.locator('h1.calendar__title')).toContainText('Planificación Semanal');
  });

  test('should show week navigation', async ({ page }) => {
    await expect(page.getByRole('button', { name: '←' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hoy' })).toBeVisible();
    await expect(page.getByRole('button', { name: '→' })).toBeVisible();
  });

  test('should show AI planning button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Planificar IA/ })).toBeVisible();
  });

  test('should show a meal slot per day and meal type', async ({ page }) => {
    // 7 dias x 4 tipos de comida (desayuno, almuerzo, cena, snack)
    await expect(page.locator('.meal-slot')).toHaveCount(28);
  });

  test('should open add meal modal when clicking an empty slot', async ({ page }) => {
    await page.locator('.meal-slot').first().click();
    await expect(page.locator('.modal__title')).toContainText('Agregar Comida');
  });

  test('should switch between custom and recipe tabs in the meal modal', async ({ page }) => {
    await page.locator('.meal-slot').first().click();

    const tabs = page.locator('.add-meal-form__tabs button');
    await expect(tabs.nth(0)).toContainText('Escribir');
    await expect(tabs.nth(1)).toContainText('Receta');

    await tabs.nth(1).click();
    await expect(page.locator('.modal-overlay')).toContainText('Selecciona una receta');
  });

  test('should open AI planning modal', async ({ page }) => {
    await page.getByRole('button', { name: /Planificar IA/ }).click();

    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.modal__title')).toContainText('Planificar con IA');
    await expect(modal).toContainText('Objetivo');
    await expect(modal).toContainText('Calorías diarias');
  });

  test('should navigate between weeks and back to today', async ({ page }) => {
    await page.getByRole('button', { name: '→' }).click();
    await expect(page.locator('h1.calendar__title')).toBeVisible();

    await page.getByRole('button', { name: '←' }).click();
    await expect(page.locator('h1.calendar__title')).toBeVisible();

    await page.getByRole('button', { name: 'Hoy' }).click();
    await expect(page.locator('.meal-slot')).toHaveCount(28);
  });
});
