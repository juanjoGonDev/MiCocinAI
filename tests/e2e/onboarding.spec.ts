import { test, expect } from './fixtures';
import { registerToOnboarding, registerUser } from './helpers/auth';

/**
 * Configuración inicial, nada más registrarse: alergias, gustos, objetivo y
 * utensilios. Es saltable, se guarda en la cuenta (no en el hogar) y se puede
 * editar a mano en Ajustes.
 */
test.describe('Onboarding — gustos, alergias y objetivo', () => {
  test('el registro lleva a la configuración inicial y se puede saltar', async ({ page }) => {
    await registerToOnboarding(page, 'Salta Tester');

    await expect(page.locator('.onboarding__title')).toHaveText('Configura tu cocina');
    await expect(page.locator('.onboarding__step-label')).toContainText('Paso 1 de 4 · Alergias');
    // Alérgenos proposés desde el primer paso, sin tener que escribirlos
    await expect(page.locator('.chip-select__chip').first()).toContainText('Gluten');

    await page.getByRole('button', { name: /Saltar por ahora/i }).click();
    await expect(page).toHaveURL(/.*dashboard/);

    // Saltar no borra nada: en Preferencias sigue el perfil vacío, listo para editar
    await page.goto('/preferences');
    await expect(page.locator('.preferences__title')).toContainText('Preferencias');
    await expect(
      page.locator('.preferences__notice', { hasText: 'Todavía no has marcado nada' })
    ).toBeVisible();
  });

  test('guarda alergias (también una escrita a mano), gustos, objetivo y utensilios', async ({
    page
  }) => {
    await registerToOnboarding(page, 'Perfil Tester');

    // ── Paso 1 · alergias: un chip del catálogo + uno propio
    await page.locator('.chip-select__chip', { hasText: 'Lactosa' }).click();
    await page.locator('input[name="chip-select-custom"]').fill('Kiwi');
    await page.getByRole('button', { name: 'Añadir' }).click();

    const selected = page.locator('.chip-select__chip--on');
    await expect(selected).toHaveCount(2);
    await expect(selected.filter({ hasText: 'Kiwi' })).toHaveCount(1);

    await page.getByRole('button', { name: 'Siguiente →' }).click();

    // ── Paso 2 · gustos y texto libre
    await expect(page.locator('.onboarding__step-label')).toContainText('Paso 2 de 4 · Gustos');
    await page
      .getByRole('group', { name: 'Lo que más te gusta' })
      .locator('.chip-select__chip', { hasText: 'Legumbres' })
      .click();
    await page
      .getByRole('group', { name: 'Lo que prefieres evitar' })
      .locator('.chip-select__chip', { hasText: 'Setas y champiñones' })
      .click();
    await page.fill('textarea#tasteNotes', 'Ceno pronto y como en el trabajo con tupper.');

    await page.getByRole('button', { name: 'Siguiente →' }).click();

    // ── Paso 3 · objetivo
    await expect(page.locator('.onboarding__step-label')).toContainText('Paso 3 de 4 · Objetivo');
    await page.locator('.onboarding__goal', { hasText: 'Perder peso' }).click();
    await expect(page.locator('.onboarding__goal--on')).toContainText('Perder peso');
    await page.fill('textarea#goalNotes', 'Poco frito y nada de bollería.');

    await page.getByRole('button', { name: 'Siguiente →' }).click();

    // ── Paso 4 · con qué cuentas: se marca en la propia despensa
    await expect(page.locator('.onboarding__step-label')).toContainText('Paso 4 de 4 · Cocina');
    const airfryer = page.locator('.utensil-card', { hasText: 'Airfryer' });
    await expect(airfryer.first()).toBeVisible({ timeout: 20000 });
    await airfryer.first().locator('input.utensil-card__check').check();
    await expect(airfryer.first()).toHaveClass(/utensil-card--owned/);

    await page.getByRole('button', { name: 'Guardar y empezar' }).click();
    await expect(page.locator('.toast--success').filter({ hasText: 'Listo' })).toBeVisible();
    await expect(page).toHaveURL(/.*dashboard/);

    // ── Persistido: Preferencias muestra exactamente lo contestado, en su pestaña
    await page.goto('/preferences');
    await expect(page.locator('.chip-select__chip--on', { hasText: 'Lactosa' })).toHaveCount(1);
    await expect(page.locator('.chip-select__chip--on', { hasText: 'Kiwi' })).toHaveCount(1);
    await expect(page.locator('.tab', { hasText: 'Alergias' })).toContainText('2');

    await page.locator('.tab', { hasText: 'Gustos' }).click();
    await expect(page).toHaveURL(/tab=tastes/);
    await expect(page.locator('.chip-select__chip--on', { hasText: 'Legumbres' })).toHaveCount(1);
    await expect(page.locator('.chip-select__chip--on', { hasText: 'Setas' })).toHaveCount(1);
    await expect(page.locator('textarea#tasteNotes')).toHaveValue(
      'Ceno pronto y como en el trabajo con tupper.'
    );

    await page.locator('.tab', { hasText: 'Objetivo' }).click();
    await expect(page).toHaveURL(/tab=goal/);
    await expect(page.locator('.preferences__goal--on')).toContainText('Perder peso');
    await expect(page.locator('textarea#goalNotes')).toHaveValue('Poco frito y nada de bollería.');

    // El utencilio marcado en el onboarding vive en la despensa, no en un sitio aparte
    await page.goto('/pantry?tab=utensils');
    await expect(page.locator('.utensil-card', { hasText: 'Airfryer' })).toHaveClass(
      /utensil-card--owned/
    );
    await expect(page.locator('.tab', { hasText: 'Utensilios' })).toContainText('1');

    // Y el onboarding vuelve con las respuestas puestas si se rehace
    await page.goto('/onboarding');
    await expect(page.locator('.chip-select__chip--on', { hasText: 'Lactosa' })).toHaveCount(1);

    // El enlace de rehacer sale de Preferencias, no de la configuración de la app
    await page.goto('/preferences');
    await expect(page.locator('.preferences__redo')).toContainText('Rehacer la configuración');
  });

  test('una alergia escrita a mano se conserva al volver atrás y se puede quitar', async ({
    page
  }) => {
    await registerToOnboarding(page, 'Chip Tester');

    // 'Mango' no está en ninguna lista: la IA lo recibe tal cual se escribió
    await page.locator('input[name="chip-select-custom"]').fill('Mango');
    await page.getByRole('button', { name: 'Añadir' }).click();

    const mango = page.locator('.chip-select__chip--on', { hasText: 'Mango' });
    await expect(mango).toHaveCount(1);

    await page.getByRole('button', { name: 'Siguiente →' }).click();
    await page.getByRole('button', { name: /Atrás/ }).click();

    // Volver atrás no reinicia lo contestado
    await expect(mango).toHaveCount(1);

    // Y se quita volviendo a pulsar la chip
    await mango.click();
    await expect(page.locator('.chip-select__chip--on')).toHaveCount(0);
  });

  test('lo guardado en Preferencias es el punto de partida del planificador', async ({ page }) => {
    await registerUser(page, 'Plan Tester');

    await page.goto('/preferences?tab=goal');
    await page.locator('.preferences__goal', { hasText: 'Ganar músculo' }).click();
    await expect(page.locator('.preferences__state')).toContainText('Hay cambios sin guardar');
    await page.getByRole('button', { name: 'Guardar preferencias' }).click();
    await expect(page.locator('.toast--success').filter({ hasText: 'Guardado' })).toBeVisible();

    await page.goto('/calendar');
    await expect(page.locator('h1.calendar__title')).toBeVisible();
    await page.getByRole('button', { name: /Planificar IA/ }).click();

    await expect(page.locator('#gen-goal')).toHaveValue('muscle-gain');
  });
});
