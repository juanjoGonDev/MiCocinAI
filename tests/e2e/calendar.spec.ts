import { expect, test } from './fixtures';
import { registerAndGoto } from './helpers/auth';

/**
 * El calendario se ve en tres formatos (día / semana / mes) y lo que se pinta es
 * lo que hay guardado. Estos tests cubren las dos cosas: la vista y la URL que la
 * describe, y que una comida añadida desde la rejilla aparece en la rejilla
 * (antes la cuadrícula se construía con huecos vacíos y no leía el servicio, así
 * que nunca se veía nada).
 */

const isoOf = (date: Date): string =>
  `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;

const daysFromToday = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return isoOf(date);
};

/** Añade una comida escrita a mano por el modal, en el hueco que se le diga. */
async function addMealThroughModal(page: import('@playwright/test').Page, dish: string): Promise<void> {
  // El hueco de franja ya no existe: se anade desde el «+» de la cabecera del dia, que es lo que
  // queda de las cuatro filas por tipo de comida.
  await page.locator('[data-test="timeline-add-meal"]').first().click();
  await expect(page.locator('.modal__title')).toContainText('Agregar Comida');
  await page.fill('#meal-custom', dish);
  await page.locator('app-modal').getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(page.locator('.modal-overlay')).toHaveCount(0);
}

test.describe('Calendario', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndGoto(page, '/calendar');
    await expect(page.locator('h1.calendar__title')).toBeVisible();
  });

  test('arranca en la vista de semana con la URL limpia', async ({ page }) => {
    const views = page.locator('.cal-segment__btn');
    await expect(views).toHaveCount(3);
    await expect(page.locator('#cal-view-week')).toHaveAttribute('aria-selected', 'true');
    await expect(page).not.toHaveURL(/view=/);

    // Titulo del periodo: «14 – 20 de septiembre»
    await expect(page.locator('h1.calendar__title')).toContainText(/\d{1,2} – \d{1,2} de/);

    // Siete columnas, y NO las 24 horas: la rejilla se recorta a lo que hay.
    await expect(page.locator('[data-test="timeline-col"]')).toHaveCount(7);
    const hours = await page.locator('.tl__hour').count();
    expect(hours).toBeGreaterThan(5);
    expect(hours).toBeLessThan(24);
  });

  test('el conmutador cambia la vista, viaja en la URL y sobrevive a recargar', async ({ page }) => {
    await page.locator('#cal-view-month').click();
    await expect(page).toHaveURL(/[?&]view=month/);
    await expect(page.locator('.cal-cell').first()).toBeVisible();
    const cells = await page.locator('.cal-cell').count();
    expect(cells % 7).toBe(0);

    await page.reload();
    await expect(page.locator('#cal-view-month')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.cal-cell')).toHaveCount(cells);

    await page.locator('#cal-view-day').click();
    await expect(page).toHaveURL(/[?&]view=day/);
    // Dia y semana son la MISMA rejilla con una columna; las cuatro franjas por tipo de comida se
    // fueron con el rediseño. Lo que hay que exigir es que quede una columna de horas.
    await expect(page.locator('[data-test="timeline-col"]')).toHaveCount(1);

    // Semana es la por defecto: vuelve a una URL sin parametro
    await page.locator('#cal-view-week').click();
    await expect(page).not.toHaveURL(/view=/);
  });

  test('en el mes, pinchar el numero de un dia abre ese dia', async ({ page }) => {
    await page.locator('#cal-view-month').click();
    await expect(page.locator('.cal-cell.is-today')).toHaveCount(1);

    const target = page.locator('.cal-cell:not(.is-outside) .cal-cell__num').nth(1);
    const dayNumber = (await target.innerText()).trim();
    await target.click();

    await expect(page).toHaveURL(/[?&]view=day/);
    await expect(page).toHaveURL(new RegExp(`[?&]date=\\d{4}-\\d{2}-${dayNumber.padStart(2, '0')}`));
    await expect(page.locator('h1.calendar__title')).toContainText(dayNumber);
  });

  test('lo que se añade desde un hueco se ve en la rejilla y sigue despues de recargar', async ({
    page
  }) => {
    await addMealThroughModal(page, 'Tortilla de patatas');

    const event = page.locator('.cal-event');
    await expect(event).toHaveCount(1);
    await expect(event).toContainText('Tortilla de patatas');

    await page.reload();
    await expect(page.locator('.cal-event')).toHaveCount(1);
    await expect(page.locator('.cal-event__name')).toContainText('Tortilla de patatas');

    // El resumen del periodo se entera
    await expect(page.locator('.cal-strip__value').first()).toContainText(/1\s*\/\s*28/);
  });

  test('una comida se marca como hecha desde la propia rejilla', async ({ page }) => {
    await addMealThroughModal(page, 'Pollo con arroz');

    const event = page.locator('.cal-event');
    await event.hover();
    await event.getByRole('button', { name: 'Marcar como hecha' }).click();
    await expect(event).toHaveAttribute('data-done', 'true');

    await page.reload();
    await expect(page.locator('.cal-event')).toHaveAttribute('data-done', 'true');
    await expect(page.locator('.cal-strip__done')).toContainText('1 hecha');
  });

  test('quitar una comida pasa por el dialogo de la app', async ({ page }) => {
    await addMealThroughModal(page, 'Ensalada completa');
    await expect(page.locator('.cal-event')).toHaveCount(1);

    const event = page.locator('.cal-event');
    await event.hover();
    await event.getByRole('button', { name: 'Quitar comida' }).click();

    // El titulo lo luce el modal que envuelve el dialogo; el mensaje, el propio
    // componente: se comprueba el mensaje, que es lo que habla de la comida concreta.
    const dialog = page.locator('.confirm');
    await expect(page.locator('.modal__title')).toContainText('Eliminar comida');
    await expect(dialog.locator('.confirm__message')).toContainText(
      'Quitar «Ensalada completa» de la planificación'
    );
    await dialog.getByRole('button', { name: 'Eliminar' }).click();

    await expect(page.locator('.cal-event')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.cal-event')).toHaveCount(0);
  });

  test('la navegacion cambia de semana y «Hoy» vuelve a la actual', async ({ page }) => {
    const title = page.locator('h1.calendar__title');
    const currentLabel = (await title.innerText()).trim();

    await page.getByRole('button', { name: 'Periodo siguiente' }).click();
    await expect(title).not.toHaveText(currentLabel);
    await expect(page).toHaveURL(new RegExp(`[?&]date=${daysFromToday(7)}`));

    await page.getByRole('button', { name: 'Periodo anterior' }).click();
    await expect(title).toHaveText(currentLabel);
    await expect(page).not.toHaveURL(/date=/);

    await page.getByRole('button', { name: 'Periodo siguiente' }).click();
    await page.getByRole('button', { name: 'Hoy' }).click();
    await expect(title).toHaveText(currentLabel);
  });

  test('el teclado mueve el calendario (flechas, T y D/S/M)', async ({ page }) => {
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(new RegExp(`[?&]date=${daysFromToday(7)}`));

    await page.keyboard.press('m');
    await expect(page.locator('#cal-view-month')).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('t');
    await expect(page).not.toHaveURL(/date=/);
    await expect(page).toHaveURL(/view=month/);

    // De vuelta a la semana: las flechas mueven de 7 en 7 dias
    await page.keyboard.press('s');
    await expect(page).not.toHaveURL(/view=/);
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(new RegExp(`[?&]date=${daysFromToday(-7)}`));
  });

  test('el selector de fecha salta a cualquier mes', async ({ page }) => {
    await page.locator('.cal-jump input').fill('2026-12-24');
    await expect(page).toHaveURL(/[?&]date=2026-12-24/);
    // La semana que contiene el 24 de diciembre
    await expect(page.locator('h1.calendar__title')).toContainText('diciembre');

    await page.locator('#cal-view-month').click();
    await expect(page.locator('h1.calendar__title')).toContainText('diciembre de 2026');
  });

  test('el plan de la IA anuncia la semana que va a cubrir', async ({ page }) => {
    await page.getByRole('button', { name: /Planificar IA/ }).click();

    const modal = page.locator('.modal-overlay');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.modal__title')).toContainText('Planificar con IA');
    await expect(modal).toContainText('La IA prepara la');
    await expect(modal).toContainText('Rellena los huecos');
    await expect(modal.locator('#gen-goal option')).not.toHaveCount(0);

    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
  });

  test('los objetivos se guardan sobre la semana que se esta viendo', async ({ page }) => {
    await page.getByRole('button', { name: /Objetivo/ }).click();
    const modal = page.locator('.modal-overlay');
    await expect(modal.locator('.modal__title')).toContainText('Objetivos Nutricionales');

    await modal.locator('.goal-option', { hasText: 'Variada' }).click();
    await modal.locator('#goals-calories').fill('2100');
    await modal.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);

    // La pastilla de la cabecera refleja el objetivo guardado...
    await expect(page.locator('.cal-pill', { hasText: 'Objetivo' })).toContainText(/variada/i); // GOAL_TYPE_LABELS: «Comida variada»
    // ...y la vista de dia usa las calorias nuevas como denominador
    await page.locator('#cal-view-day').click();
    // El separador de miles lo decide el ICU del navegador: en un Chromium con
    // datos completos es «2.100» y con los recortados, «2100». Se admite cualquiera.
    await expect(page.locator('[data-test="timeline-kcal"]').first()).toContainText(/2\D?100/);
  });

  test('un evento se apunta escribiendo solo el titulo', async ({ page }) => {
    // Es la repro literal del usuario: «el calendario da error si no mandas todos los campos, y eso es
    // erroneo ya que se marcan como opcional». Aqui no se rellena nada de lo opcional: ni color, ni
    // sitio, ni notas, ni hora. Si el servidor volviera a pedir el paquete entero, este test es el
    // que lo cuenta, y lo cuenta con el boton que se pulsa, no con un safeParse.
    await page.locator('[data-test="event-add"]').click();
    await expect(page.locator('.modal__title')).toContainText('Apuntar un evento');

    await page.fill('#event-title', 'Medir el pasillo');
    await page.locator('[data-test="event-save"]').click();

    await expect(page.locator('.modal-overlay')).toHaveCount(0);
    await expect(page.locator('[data-test="household-event"]')).toContainText('Medir el pasillo');
    // Y el dialogo de error no aparecio: los 400 del calendario se ven como nota dentro del modal.
    await expect(page.locator('.cal-note[role="alert"]')).toHaveCount(0);
  });

  test('la pestaña Receta elige del recetario en lugar de escribir el plato', async ({ page }) => {
    await page.locator('[data-test="timeline-add-meal"]').first().click();
    await page.locator('.meal-form__tabs button', { hasText: 'Receta' }).click();
    await expect(page.locator('.modal-overlay')).toContainText('Selecciona una receta');

    // Sin receta elegida no se puede guardar
    await expect(page.locator('app-modal').getByRole('button', { name: 'Añadir', exact: true })).toBeDisabled();
  });
});
