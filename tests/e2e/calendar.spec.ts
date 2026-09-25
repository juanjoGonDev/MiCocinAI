import { expect, test } from './fixtures';
import { registerAndGoto, skipOnboarding } from './helpers/auth';

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

  test('quien no tiene casa no ve un picker de invitados: no hay a quien invitar', async ({ page }) => {
    // No es que el control este roto: es que no hay hogar. Y la distincion importa, porque el bug que
    // trajo esta ronda era exactamente un bloque que no se pintaba por no haber cargado la casa.
    await page.locator('[data-test="event-add"]').click();
    await expect(page.locator('.modal__title')).toContainText('Apuntar un evento');
    await expect(page.locator('[data-test="event-attendees"]')).toHaveCount(0);
    await expect(page.locator('[data-test="event-no-people"]')).toHaveCount(0);

    await page.fill('#event-title', 'Regar los tomates');
    await page.locator('[data-test="event-save"]').click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
    await expect(page.locator('[data-test="household-event"]')).toContainText('Regar los tomates');
  });

  test('la pestaña Receta elige del recetario en lugar de escribir el plato', async ({ page }) => {
    await page.locator('[data-test="timeline-add-meal"]').first().click();
    await page.locator('.meal-form__tabs button', { hasText: 'Receta' }).click();
    await expect(page.locator('.modal-overlay')).toContainText('Selecciona una receta');

    // Sin receta elegida no se puede guardar
    await expect(page.locator('app-modal').getByRole('button', { name: 'Añadir', exact: true })).toBeDisabled();
  });
});

/**
 * Invitaciones a un evento. Viven en su propio describe porque necesitan dos sesiones: «invitar a
 * alguien de la casa» no se puede probar con un usuario solo, que es justo el caso en el que el control
 * dejo de existir.
 *
 * Escrito en la ronda de los horarios y con `typecheck:e2e` pasado; no se ha ejecutado aqui porque el
 * sandbox no tiene Chromium. Corre en el job de Playwright.
 */
test.describe('Calendario — invitar a la casa', () => {
  test('una casa de uno dice que no hay a quien invitar, en lugar de callarse', async ({
    browser
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await registerAndGoto(page, '/household');
    await page.getByRole('button', { name: /Crear hogar/i }).click();
    await page.fill('input#householdName', 'Familia Uno');
    await page.click('button[type="submit"]');

    await page.goto('/calendar');
    await page.locator('[data-test="event-add"]').click();
    // El bloque sale (hay casa) y dice lo que hay: una persona. Antes de esta ronda, «no hay mas» y «no
    // he cargado la casa» se pintaban igual: nada.
    await expect(page.locator('[data-test="event-attendees"]')).toBeVisible();
    await expect(page.locator('[data-test="event-no-people"]')).toContainText('única persona');
    await expect(page.getByRole('button', { name: /Invitar a alguien/i })).toBeVisible();

    await page.getByRole('button', { name: /Invitar a alguien/i }).click();
    await expect(page).toHaveURL(/household/);
    await ctx.close();
  });

  test('se marca a otra persona, se guarda, y al reabrir el evento sigue marcada', async ({
    browser
  }) => {
    const ownerName = `Sótano de ${Date.now()}`;
    const ownerCtx = await browser.newContext();
    const page = await ownerCtx.newPage();
    await registerAndGoto(page, '/household');
    await page.getByRole('button', { name: /Crear hogar/i }).click();
    await page.fill('input#householdName', ownerName);
    await page.click('button[type="submit"]');
    const inviteUrl = (await page.locator('.invite-card__code').textContent()) ?? '';
    expect(inviteUrl).toContain('/invite/');
    const code = inviteUrl.split('/invite/')[1];

    // Segunda persona, en su propia sesion: el picker tiene que listar a la OTRA y nunca a quien escribe.
    const memberCtx = await browser.newContext();
    const memberPage = await memberCtx.newPage();
    await memberPage.goto('/auth/register');
    await memberPage.fill('input#name', 'Bea');
    await memberPage.fill('input#email', `bea-${Date.now()}@example.com`);
    await memberPage.fill('input#password', 'Test1234');
    await memberPage.click('button[type="submit"]');
    await skipOnboarding(memberPage);
    await memberPage.goto('/household');
    await memberPage.getByRole('button', { name: /Unirse con código/i }).click();
    await memberPage.locator('.join-form input').fill(code);
    await memberPage.getByRole('button', { name: 'Unirse', exact: true }).click();
    await expect(memberPage.locator('.household-info')).toBeVisible();

    await page.goto('/calendar');
    await page.locator('[data-test="event-add"]').click();
    const people = page.locator('[data-test="event-attendees"] .cal-person');
    await expect(people).toHaveCount(1);
    await expect(people.first()).toContainText('Bea');

    await people.first().click();
    await expect(people.first()).toHaveAttribute('aria-pressed', 'true');
    await page.fill('#event-title', 'Medir el pasillo');
    await page.locator('[data-test="event-save"]').click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
    await expect(page.locator('[data-test="household-event"]')).toContainText('Medir el pasillo');

    // El bug que reportó el usuario: abrir «editar» empezaba sin nadie seleccionado, y guardar
    // escribia ese vacio (desinvitar a todos sin querer). Reabierto, la marca tiene que estar.
    await page.locator('[data-test="household-event"]').first().click();
    await expect(page.locator('#event-title')).toHaveValue('Medir el pasillo');
    await expect(page.locator('[data-test="event-attendees"] .cal-person').first()).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // Y la otra persona lo ve en su calendario: es un evento de la casa, no una nota privada.
    await memberPage.goto('/calendar');
    await expect(memberPage.locator('[data-test="household-event"]')).toContainText('Medir el pasillo');

    await memberCtx.close();
    await ownerCtx.close();
  });
});

/**
 * Repeticiones (HOGARIA-SPEC 12t-R): lo que pidio quien usa la app —«que en la creacion de eventos pueda
 * repetirse, semanal, diario»—. Se comprueba en la agenda del dia, que es donde la app pinta las sueltas:
 * la serie es UNA fila guardada, y lo que se ve el lunes es una replica del lunes pasado. La cadencia se
 * prueba cambiando de dia con las flechas, no contando la semana entera: si se cuenta, el test depende de
 * que el calendario pinte o no cada dia, y eso es otra pantalla.
 */
test.describe('Calendario — repeticiones', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndGoto(page, '/calendar');
    await expect(page.locator('h1.calendar__title')).toBeVisible();
    // La agenda del dia es la que dice lo que hay hoy; la vista de dia ancla en hoy al entrar.
    await page.locator('#cal-view-day').click();
    await expect(page.locator('[data-test="agenda"]')).toBeVisible();
  });

  /** El dia anterior, con la flecha de la cabecera. */
  async function diaAnterior(page: import('@playwright/test').Page): Promise<void> {
    await page.locator('.cal-top__nav .cal-icon-btn').first().click();
  }

  /** Abre el «+», rellena titulo y fecha, y elige la cadencia si se le dice. */
  async function nuevaSuelta(
    page: import('@playwright/test').Page,
    titulo: string,
    fecha: string,
    cadencia?: 'Cada semana' | 'Todos los días'
  ): Promise<void> {
    await page.locator('[data-test="event-add"]').click();
    await expect(page.locator('.modal__title')).toContainText('Apuntar un evento');
    await page.fill('#event-title', titulo);
    await page.fill('#event-date', fecha);
    if (cadencia) {
      const repetir = page.locator('[data-test="event-recurrence"]');
      await repetir.locator('.picker__trigger').click();
      await repetir.locator('.picker__option', { hasText: cadencia }).click();
    }
    await page.locator('[data-test="event-save"]').click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
  }

  test('una serie semanal aparece hoy y no ayer, con la marca de repeticion', async ({ page }) => {
    // La fecha de la serie es HACE SIETE DIAS: si hoy aparece y ayer no, la expansion respeta la cadencia.
    // Era la alternativa facil (guardar una fila por dia) lo que habria pintado los dos.
    await nuevaSuelta(page, 'Sacar la basura', daysFromToday(-7), 'Cada semana');

    const hoy = page.locator('[data-test="household-event"]', { hasText: 'Sacar la basura' });
    await expect(hoy).toHaveCount(1);
    // El glifo va en la pastilla: «esto se repite» tiene que verse sin abrir nada.
    await expect(hoy.locator('.cal-evt__repeat')).toHaveCount(1);

    await diaAnterior(page);
    await expect(page.locator('[data-test="household-event"]', { hasText: 'Sacar la basura' })).toHaveCount(0);
  });

  test('una serie diaria se repite tambien el dia anterior, y sigue siendo un solo evento', async ({ page }) => {
    await nuevaSuelta(page, 'Revisar el riego', daysFromToday(-30), 'Todos los días');

    const hoy = page.locator('[data-test="household-event"]', { hasText: 'Revisar el riego' });
    await expect(hoy).toHaveCount(1);
    await diaAnterior(page);
    await expect(page.locator('[data-test="household-event"]', { hasText: 'Revisar el riego' })).toHaveCount(1);

    // Un evento, no dos: al abrirlo desde una burbuja el modal avisa de que se edita la SERIE, y da la
    // opcion de faltar solo a un dia. Las dos frases a la vez es lo que hace que no haya susto.
    await page.locator('[data-test="household-event"]', { hasText: 'Revisar el riego' }).first().click();
    await expect(page.locator('[data-test="event-skip-day"]')).toBeVisible();
    await expect(page.locator('.cal-note').filter({ hasText: 'afectan a todas las repeticiones' })).toHaveCount(1);
  });

  test('«quitar solo este día» deja el resto de la serie en pie', async ({ page }) => {
    await nuevaSuelta(page, 'Pasar el aspirador', daysFromToday(-30), 'Todos los días');
    const hoy = page.locator('[data-test="household-event"]', { hasText: 'Pasar el aspirador' });
    await expect(hoy).toHaveCount(1);

    await hoy.first().click();
    await page.locator('[data-test="event-skip-day"]').click();
    // Confirmacion propia de la app, no `confirm()` del navegador: se acepta por el boton que la app pinta.
    const dialog = page.locator('.modal-overlay');
    await expect(dialog).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Quitar solo este día' }).click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);

    // Hoy no esta, y el hueco no se rellena solo: eso es la excepcion guardada, no una espera.
    await expect(page.locator('[data-test="household-event"]', { hasText: 'Pasar el aspirador' })).toHaveCount(0);
    await diaAnterior(page);
    await expect(page.locator('[data-test="household-event"]', { hasText: 'Pasar el aspirador' })).toHaveCount(1);
  });

  test('una suelta normal no se repite: «No se repite» es el defecto y no lleva glifo', async ({ page }) => {
    await page.locator('[data-test="event-add"]').click();
    const repetir = page.locator('[data-test="event-recurrence"]');
    await repetir.locator('.picker__trigger').click();
    await expect(repetir.locator('.picker__option', { hasText: 'No se repite' })).toHaveCount(1);
    await page.fill('#event-title', 'Comprar lija');
    await page.locator('[data-test="event-save"]').click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0);

    const chip = page.locator('[data-test="household-event"]', { hasText: 'Comprar lija' });
    await expect(chip).toHaveCount(1);
    await expect(chip.locator('.cal-evt__repeat')).toHaveCount(0);
  });
});
