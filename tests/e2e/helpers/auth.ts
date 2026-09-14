import { Page, expect } from '@playwright/test';

/**
 * Registra un usuario nuevo (email unico) y lo deja autenticado en el
 * dashboard. Los tests no comparten usuario para no pisarse entre si.
 */
export async function registerUser(page: Page, name = 'E2E'): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto('/auth/register');
  await page.fill('input#name', name);
  await page.fill('input#email', email);
  await page.fill('input#password', 'Test1234');
  await page.click('button[type="submit"]');
  await page.waitForURL(/.*dashboard/, { timeout: 25000 });
  return email;
}

/**
 * Crea un hogar. Es necesario para que el backend siembre los ingredientes
 * comunes (~68) y los utensilios (~54) del catalogo.
 */
export async function createHousehold(page: Page, name = 'Hogar E2E'): Promise<void> {
  await page.goto('/household');
  await page.getByRole('button', { name: /Crear hogar/i }).click();
  await page.fill('input#householdName', name);
  await page.locator('app-modal button[type="submit"]').click();
  try {
    await expect(page.locator('.invite-card__code')).toContainText('/invite/', { timeout: 15000 });
  } catch (err) {
    // TEMP DEBUG
    const dbg = await page
      .locator('.household__content, .no-household, .modal-overlay')
      .first()
      .innerHTML()
      .catch(() => 'NO CONTENT');
    console.log('::error::DEBUG_HH ' + dbg.replace(/\s+/g, ' ').replace(/%/g, '%25').slice(0, 700));
    throw err;
  }
}

/** Registra un usuario, crea su hogar y lo deja en `path`. */
export async function registerWithHousehold(page: Page, path: string, name = 'E2E'): Promise<void> {
  await registerUser(page, name);
  await createHousehold(page);
  await page.goto(path);
}

/** Registra un usuario y lo deja en `path` (sin hogar). */
export async function registerAndGoto(page: Page, path: string, name = 'E2E'): Promise<string> {
  const email = await registerUser(page, name);
  await page.goto(path);
  return email;
}

/** Cierra la sesion (limpia el almacenamiento local) y vuelve al login. */
export async function logout(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.clear());
  await page.goto('/auth/login');
}
