import { test, expect } from './fixtures';
import { registerAndGoto } from './helpers/auth';

/**
 * Los modulos son un flag de la app: se editan en Configuracion (no en
 * Preferencias, que habla del comensal), se aplican sin recargar y lo que este
 * build aun no trae se puede dejar activado por adelantado sin que nadie se
 * quede con un enlace roto.
 *
 * Se busca por atributos de datos y por href, nunca por el texto: las etiquetas
 * de la seccion pasan por el pipe de i18n y en CI el idioma resuelto no siempre
 * es el castellano en el primer render.
 */
test.describe('Configuración — módulos', () => {
  test('lista las cinco secciones y marca las que aún no llegan', async ({ page }) => {
    await registerAndGoto(page, '/settings', 'mods-list');

    await expect(page.locator('.settings-module')).toHaveCount(5);
    await expect(page.locator('.settings-module__soon')).toHaveCount(2);

    // Sin marcar nada, el significado es «todo lo que trae el build»
    await expect(page.locator('[data-module-switch="meals"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-module-switch="pantry"]')).toHaveAttribute('aria-checked', 'true');
    // La lista de la compra ya existe: viene encendida con las demas del build.
    await expect(page.locator('[data-module-switch="shopping"]')).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(page.locator('[data-module-switch="receipts"]')).toHaveAttribute(
      'aria-checked',
      'false'
    );

    // Y lo dice en texto, para que la regla no sea un misterio
    await expect(
      page.locator('.settings-hint', { hasText: /todas las secciones|every section/i })
    ).toHaveCount(1);
  });

  test('apagar una sección la quita de la navegación sin recargar', async ({ page }) => {
    await registerAndGoto(page, '/settings', 'mods-off');

    await expect(page.locator('a[href="/pantry"]')).not.toHaveCount(0);

    await page.locator('[data-module-switch="pantry"]').click();

    // Seguimos en Configuracion: no hay navegacion ni recarga de por medio
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.locator('a[href="/pantry"]')).toHaveCount(0);
    // El resto convive: el cambio es quirurgico
    await expect(page.locator('a[href="/calendar"]')).not.toHaveCount(0);

    // Persistido: al volver, la seccion sigue apagada
    await page.reload();
    await expect(page.locator('[data-module-switch="pantry"]')).toHaveAttribute(
      'aria-checked',
      'false'
    );
    await expect(page.locator('a[href="/pantry"]')).toHaveCount(0);

    await page.locator('[data-module-switch="pantry"]').click();
    await expect(page.locator('a[href="/pantry"]')).not.toHaveCount(0);
  });

  test('activar por adelantado lo que aún no existe no crea rutas muertas', async ({ page }) => {
    await registerAndGoto(page, '/settings', 'mods-soon');

    await page.locator('[data-module-switch="receipts"]').click();
    await expect(page.locator('[data-module-switch="receipts"]')).toHaveAttribute(
      'aria-checked',
      'true'
    );
    // Marcado, pero enlazarlo seria un 404: este build no trae la pantalla
    await expect(page.locator('a[href="/receipts"]')).toHaveCount(0);

    await page.reload();
    await expect(page.locator('[data-module-switch="receipts"]')).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(page.locator('a[href="/receipts"]')).toHaveCount(0);

    // Y la que si existe no se cayo al cambiar el resto: sigue enlazada
    await expect(page.locator('a[href="/shopping"]')).not.toHaveCount(0);
  });

  test('la última sección visible no se apaga, y se puede restablecer', async ({ page }) => {
    await registerAndGoto(page, '/settings', 'mods-last');

    await page.locator('[data-module-switch="pantry"]').click();

    // Queda una sola: apagarla habria vuelto a encender todas (seleccion vacia)
    await expect(page.locator('[data-module-switch="meals"]')).toBeDisabled();
    await expect(page.locator('a[href="/calendar"]')).not.toHaveCount(0);

    await page.locator('[data-modules-reset]').click();
    await expect(page.locator('[data-module-switch="pantry"]')).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(page.locator('[data-module-switch="meals"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-modules-reset]')).toHaveCount(0);
  });

  test('el núcleo de la app no se puede apagar', async ({ page }) => {
    await registerAndGoto(page, '/settings', 'mods-core');

    await page.locator('[data-module-switch="pantry"]').click();

    for (const path of ['/dashboard', '/household', '/preferences', '/settings']) {
      await expect(page.locator(`a[href="${path}"]`)).not.toHaveCount(0, { message: path });
    }
  });

  test('una sección apagada sigue accesible por URL: no se expulsa a nadie', async ({ page }) => {
    await registerAndGoto(page, '/settings', 'mods-direct');

    await page.locator('[data-module-switch="pantry"]').click();
    await expect(page.locator('a[href="/pantry"]')).toHaveCount(0);

    // La ruta sigue viva: solo deja de enseñarse en la navegacion
    await page.goto('/pantry');
    await expect(page).toHaveURL(/\/pantry/);
    await expect(page.locator('app-pantry')).toHaveCount(1);
    await expect(page.locator('a[href="/pantry"]')).toHaveCount(0);
  });
});
