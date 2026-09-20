import { Page, expect, test } from './fixtures';
import { registerAndGoto } from './helpers/auth';

/**
 * La cuenta de la persona, en su pagina (ronda 13). Hasta aqui vivia dentro de Preferencias, que
 * es del comensal —alergias, gustos, objetivo—, y las dos cosas no se parecen en nada: se entra
 * pulsando tu propia cara del menu, no buscando el ajo. Se prueba contra el servidor real, porque
 * media pantalla es un fichero en `uploads/`.
 */

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function addOneItem(page: Page, name: string, item: string): Promise<void> {
  await registerAndGoto(page, '/shopping', name);
  await page.locator('[data-test="new-list"]').click();
  await page.locator('[data-test="list-name"]').fill('La compra');
  await page.locator('[data-test="create-submit"]').click();
  await page.locator('[data-test="add-input"]').fill(item);
  await page.locator('[data-test="add-submit"]').click();
}

test.describe('Mi cuenta', () => {
  test('tiene pagina propia, y se entra por la cara del menu', async ({ page }) => {
    await registerAndGoto(page, '/dashboard', 'acct-entry');

    // El avatar del menu es la puerta: lleva a la cuenta, no a las preferencias del comensal.
    await page.locator('[data-test="account-chip"]').locator('.sidebar__account-main').click();
    await expect(page).toHaveURL(/\/account$/);

    // Tres sub-secciones, la primera por defecto y sin ensuciar la URL.
    await expect(page.locator('.tab')).toHaveCount(3);
    await expect(page.locator('.tab--active')).toContainText('Cuenta');
    await expect(page).not.toHaveURL(/tab=/);

    await page.locator('.tab', { hasText: 'Seguridad' }).click();
    await expect(page).toHaveURL(/[?&]tab=security/);
    await page.locator('.tab', { hasText: 'Información' }).click();
    await expect(page).toHaveURL(/[?&]tab=info/);
    await expect(page.locator('[data-test="account-email"]')).toContainText('@');

    await page.reload();
    await expect(page.locator('.tab--active')).toContainText('Información');

    // La de la cuenta es una pestaña con controles propios, y el enlace al comensal esta ahi.
    await page.locator('.tab', { hasText: 'Cuenta' }).click();
    await expect(page.locator('[data-test="account-name"]')).toBeVisible();
    await expect(page.locator('a[href="/preferences"]')).not.toHaveCount(0);
  });

  test('renombrarse se ve en el menu y en el historial, sin recargar', async ({ page }) => {
    await addOneItem(page, 'acct-hist', 'Leche');
    await page.getByRole('button', { name: 'Quien ha tocado que' }).click();
    const row = page.locator('[data-test="audit-row"]').first();
    await expect(row).toContainText('acct-hist');
    await page.locator('[data-test="audit-close"]').click();

    await page.goto('/account');
    await page.locator('[data-test="account-name"]').fill('Ana Belen');
    await page.locator('[data-test="account-name-save"]').click();
    await expect(page.locator('.toast--success').filter({ hasText: 'Nombre guardado' })).toBeVisible();

    // El menu ya la llama asi (misma senal que el historial, no dos copias que se separan).
    await expect(page.locator('.sidebar__account-name')).toHaveText('Ana Belen');

    // Y la fila del historial, sin refrescar la lista: es tu linea, y decir «Ana ha anadido»
    // mientras la pantalla entera te llama de otra forma es el fallo que esto cierra.
    await page.goto('/shopping');
    await page.locator('[data-test="item-row"]').first().click();
    await page.getByRole('button', { name: 'Quien ha tocado que' }).click();
    await expect(page.locator('[data-test="audit-row"]').first()).toContainText('Ana Belen');
    await expect(page.locator('[data-test="audit-row"]').first()).not.toContainText('acct-hist');
  });

  test('la cara se toca: hover, modal, encuadre y foto en todos lados', async ({ page }) => {
    await registerAndGoto(page, '/account', 'acct-photo');

    // El disco con la inicial: tinta sobre fondo, no sobre el fondo de la pagina (que era el
    // fallo: una letra del mismo color que su propio circulo).
    const disc = page.locator('[data-test="account-avatar"] .avatar');
    const { background, ink } = await disc.evaluate((el) => {
      const style = getComputedStyle(el);
      const letters = el.querySelector('.avatar__initials');
      return {
        background: style.backgroundColor,
        ink: letters ? getComputedStyle(letters).color : ''
      };
    });
    expect(background).not.toBe('rgba(0, 0, 0, 0)');
    expect(ink).toBeTruthy();
    expect(ink).not.toBe(background);

    // La cara es un control: en un escritorio con puntero la etiqueta sale al pasar por encima, y
    // no ocupa sitio hasta ese momento.
    const edit = page.locator('[data-test="account-avatar-edit"]');
    await expect(edit).toHaveCSS('opacity', '0');
    await page.locator('[data-test="account-avatar-button"]').hover();
    await expect(edit).toHaveCSS('opacity', '1');

    await page.locator('[data-test="account-avatar-button"]').click();
    await expect(page.locator('[data-test="account-photo-label"]')).toBeVisible();
    // Sin foto no hay nada que quitar: el boton de quite no se inventa.
    await expect(page.locator('[data-test="account-photo-remove"]')).toHaveCount(0);

    await page.locator('[data-test="account-photo"]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.locator('[data-test="avatar-stage"]')).toBeVisible();

    // Encuadrar: acercar cambia lo que se ve dentro del cuadro. La prueba es el estilo del `img`,
    // que sale de la MISMA region que se va a recortar (avatar-crop) —si el estilo no se mueve, el
    // recorte tampoco.
    const preview = page.locator('[data-test="avatar-stage"] img');
    const before = await preview.getAttribute('style');
    await page.locator('[data-test="avatar-zoom-in"]').click();
    await page.locator('[data-test="avatar-zoom-in"]').click();
    await expect.poll(() => preview.getAttribute('style')).not.toBe(before);
    await page.locator('[data-test="avatar-recenter"]').click();

    // Y Cancelar en el editor no sube nada: vuelve al paso anterior, con la eleccion deshecha.
    await page.locator('[data-test="avatar-editor-cancel"]').click();
    await expect(page.locator('[data-test="account-photo-label"]')).toBeVisible();

    await page.locator('[data-test="account-photo"]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
    await page.locator('[data-test="avatar-editor-use"]').click();
    await expect(page.locator('.toast--success').filter({ hasText: 'Imagen cambiada' })).toBeVisible();

    // El modal se cierra despues de subir (el editor se va con el): si se queda abierto con la
    // foto ya guardada dentro, la pantalla miente sobre en que paso esta.
    await expect(page.locator('[data-test="avatar-editor-use"]')).toHaveCount(0);

    // El editor SIEMPRE entrega JPEG cuadrado de 128: la URL lo dice, y es la prueba de que el
    // recorte llego al servidor y no solo al canvas.
    const photo = page.locator('[data-test="account-avatar"] img');
    await expect(photo).toHaveAttribute('src', /^\/api\/uploads\/avatars\/.+\.jpg$/);
    await expect
      .poll(() => photo.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect
      .poll(() => photo.evaluate((el) => `${(el as HTMLImageElement).naturalWidth}x${(el as HTMLImageElement).naturalHeight}`))
      .toBe('128x128');

    // La foto necesita anillo: sobre una tarjeta blanca dejaba de ser un circulo.
    await expect(disc).not.toHaveCSS('box-shadow', 'none');

    // La misma cara en los dos sitios donde vive: el menu y la cabecera del movil.
    await expect(page.locator('.sidebar__account app-avatar img')).toHaveCount(1);
    await expect(page.locator('.header__profile app-avatar img')).toHaveCount(1);

    await page.reload();
    await expect(page.locator('[data-test="account-avatar"] .avatar--photo')).toBeVisible();

    // Quitar se hace en el mismo modal, y ahora si que existe el boton de quite.
    await page.locator('[data-test="account-avatar-button"]').click();
    await page.locator('[data-test="account-photo-remove"]').click();
    await expect(page.locator('[data-test="account-avatar"] img')).toHaveCount(0);
    await expect(page.locator('[data-test="account-avatar"] .avatar__initials')).toBeVisible();
    await expect(page.locator('.toast--success').filter({ hasText: 'Imagen quitada' })).toBeVisible();
  });

  test('la contrasena se cambia aqui, y Cancelar limpia los tres campos', async ({ page }) => {
    await registerAndGoto(page, '/account?tab=security', 'acct-pass');
    await expect(page.locator('.tab--active')).toContainText('Seguridad');

    await expect(page.locator('[data-test="account-password-save"]')).toBeDisabled();
    await page.locator('[data-test="account-password-current"]').fill('ClaveFalsa1');
    await page.locator('[data-test="account-password-new"]').fill('Nueva1234');
    await page.locator('[data-test="account-password-repeat"]').fill('Nueva1234');
    await expect(page.locator('[data-test="account-password-save"]')).toBeEnabled();

    // No coinciden: se dice aqui, antes de llamar a nadie.
    await page.locator('[data-test="account-password-repeat"]').fill('Otra12345');
    await page.locator('[data-test="account-password-save"]').click();
    await expect(page.locator('[data-test="account-password-error"]')).toContainText('no coinciden');

    // Floja: la regla es la del servidor, contada en la pantalla.
    await page.locator('[data-test="account-password-new"]').fill('nova');
    await page.locator('[data-test="account-password-repeat"]').fill('nova');
    await page.locator('[data-test="account-password-save"]').click();
    await expect(page.locator('[data-test="account-password-error"]')).toContainText('mayuscula');

    // Con la actual equivocada, lo que contesta el servidor, traducido.
    await page.locator('[data-test="account-password-new"]').fill('Nueva1234');
    await page.locator('[data-test="account-password-repeat"]').fill('Nueva1234');
    await page.locator('[data-test="account-password-save"]').click();
    await expect(page.locator('[data-test="account-password-error"]')).toContainText('La contrasena actual no es esa');

    await page.locator('[data-test="account-password-cancel"]').click();
    await expect(page.locator('[data-test="account-password-current"]')).toHaveValue('');
    await expect(page.locator('[data-test="account-password-new"]')).toHaveValue('');
    await expect(page.locator('[data-test="account-password-repeat"]')).toHaveValue('');
  });

  test('informacion dice lo que la app guarda en este navegador', async ({ page }) => {
    await registerAndGoto(page, '/account?tab=info', 'acct-info');

    await expect(page.locator('[data-test="account-email"]')).toContainText('@hogaria.test');
    await expect(page.locator('[data-test="account-version"]')).toContainText('1.');
    // El tamano se dice en unidades legibles, y la cola de escribiras se ve aunque este vacia.
    await expect(page.locator('[data-test="account-storage"]')).toContainText(/B|KB|MB/);
    await expect(page.locator('[data-test="account-pending"]')).toContainText('Nada pendiente');
    await expect(page.locator('[data-test="account-level-link"]')).toContainText(/[A-Za-zÁÉÍÓÚñ]/);

    // Cerrar sesion es real: te saca de la pantalla.
    await page.locator('.tab', { hasText: 'Seguridad' }).click();
    await page.locator('[data-test="account-logout"]').click();
    await expect(page).not.toHaveURL(/\/account/);
  });
});
