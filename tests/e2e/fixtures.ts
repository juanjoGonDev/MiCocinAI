import { test as base, expect } from '@playwright/test';

/**
 * Punto de entrada de todos los specs.
 *
 * Añade un fixture automático que vigila que la aplicación no abra ningún
 * diálogo nativo del navegador (`alert`, `confirm`, `prompt`): todas las
 * confirmaciones pasan por `app-confirm-dialog` (ConfirmService), que sí
 * respeta el diseño, se puede traducir y se puede probar.
 *
 * Si algún día vuelve a colarse un `confirm()`, el diálogo se descarta (para
 * que el test no se quede colgado esperando) y el test falla, en lugar de
 * quedarse "en verde" porque nadie aceptó el diálogo.
 */
export const test = base.extend<{ nativeDialogs: string[] }>({
  nativeDialogs: [
    async ({ page }, use) => {
      const dialogs: string[] = [];

      // Y el idioma, anclado en la preferencia guardada, no solo en el navegador: `language: 'es'` es lo
      // que lee `I18nService` al arrancar. Sin esto, quien escriba un test despues de cambiar de idioma en
      // otro (el `localStorage` sobrevive entre specs dentro del mismo worker) prueba otra app.
      await page.addInitScript(() => {
        try {
          window.localStorage.setItem('hogaria.language', 'es');
        } catch {
          /* el test aun puede correr: la app cae a `auto`, y el locale del navegador es es-ES */
        }
      });

      page.on('dialog', async (dialog) => {
        dialogs.push(`${dialog.type()}: ${dialog.message()}`);
        await dialog.dismiss();
        throw new Error(
          'Diálogo nativo inesperado. La app debe confirmar con app-confirm-dialog ' +
            `(ConfirmService), no con el navegador. Diálogo abierto: ${dialogs.join(' | ')}`
        );
      });

      await use(dialogs);

      // Redundante con el throw de arriba, pero deja el mensaje en el assert.
      expect(dialogs, 'La app no debe abrir diálogos nativos del navegador').toEqual([]);

      page.removeAllListeners('dialog');
    },
    { auto: true }
  ]
});

export { expect };
export type { Page, Locator } from '@playwright/test';
