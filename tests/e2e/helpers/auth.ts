import { Page, expect } from '@playwright/test';

const TEST_PASSWORD = 'Test1234';

/** Cada prueba registra su propio usuario para no pisarse entre si. */
function generatedEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** El registro termina en el onboarding (o en el dashboard si ya se configuro). */
function waitAfterRegister(page: Page, timeout: number): Promise<boolean> {
  return page
    .waitForURL(/.*(dashboard|onboarding)/, { timeout })
    .then(() => true)
    .catch(() => false);
}

/**
 * Rellena y envia el alta, y espera a la redireccion.
 *
 * El backend limita las peticiones por IP (/api/* 300/min) y la suite entera
 * comparte esa ventana: si el alta cae en un 429 no hay redireccion y la prueba
 * se quedaba esperando. Se devuelve un booleano para que quien llama reintente.
 */
async function submitRegister(page: Page, name: string, email: string): Promise<boolean> {
  await page.goto('/auth/register');
  if (
    await page
      .locator('input#name')
      .isVisible()
      .catch(() => false)
  ) {
    await page.fill('input#name', name);
    await page.fill('input#email', email);
    await page.fill('input#password', TEST_PASSWORD);
    await page.click('button[type="submit"]');
  }
  return waitAfterRegister(page, 20000);
}

/**
 * El registro pasa por la configuración inicial (alergias, gustos, objetivo y
 * utensilios). La mayoría de tests no quieren ese formulario: lo saltan y se
 * quedan en el dashboard.
 */
export async function skipOnboarding(page: Page): Promise<void> {
  await page.waitForURL(/.*(dashboard|onboarding)/, { timeout: 20000 });
  if (!page.url().includes('/onboarding')) return;

  await page.getByRole('button', { name: /Saltar por ahora/i }).click();
  await page.waitForURL(/.*dashboard/, { timeout: 20000 });
}

/** Registra un usuario nuevo y lo deja en el onboarding (sin saltarlo). */
export async function registerToOnboarding(
  page: Page,
  name = 'E2E',
  email?: string
): Promise<string> {
  let target = email ?? generatedEmail();
  let ok = await submitRegister(page, name, target);

  if (!ok) {
    // Primero por si la navegacion simplemente ha llegado tarde a la prueba.
    ok = await waitAfterRegister(page, 10000);
    // Si no, con otra direccion: la anterior puede no haberse registrado nunca.
    if (!ok && !email) ok = await submitRegister(page, name, (target = generatedEmail()));
  }
  if (!ok) {
    throw new Error(`El registro de la prueba no ha llegado al onboarding (${page.url()})`);
  }

  await expect(page).toHaveURL(/.*(dashboard|onboarding)/);
  return target;
}

/**
 * Registra un usuario nuevo (email unico) y lo deja autenticado en el
 * dashboard. Los tests no comparten usuario para no pisarse entre si.
 */
export async function registerUser(page: Page, name = 'E2E', email?: string): Promise<string> {
  const created = await registerToOnboarding(page, name, email);
  await skipOnboarding(page);
  return created;
}

/**
 * Crea un hogar. Es necesario para que el backend siembre los ingredientes
 * comunes (~68) y los utensilios (~54) del catalogo.
 */
export async function createHousehold(page: Page, name = 'Hogar E2E'): Promise<void> {
  await page.goto('/household');
  await expect(page.locator('.no-household')).toBeVisible({ timeout: 45000 });
  await page.getByRole('button', { name: /Crear hogar/i }).click();
  await page.fill('input#householdName', name);
  await page.locator('app-modal button[type="submit"]').click();
  await expect(page.locator('.invite-card__code')).toContainText('/invite/', { timeout: 45000 });
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
