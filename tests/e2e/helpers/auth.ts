import { Page } from '@playwright/test';

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
  await page.waitForURL(/.*dashboard/, { timeout: 20000 });
  return email;
}

/** Registra un usuario y lo deja en `path`. */
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
