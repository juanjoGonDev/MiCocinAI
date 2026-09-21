import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MealHoursComponent } from './meal-hours.component';

/**
 * El control de las horas de la casa, probado sin navegador.
 *
 * Se corre con el puente de vitest del server (`server/tmp-frontend.vitest.config.ts`), igual que
 * `core/calendar-grid.spec.ts` —en esta maquina no hay Chrome, y `ng test` no arranca. Las dos
 * aserciones que leen el fichero (ids y texto de la copia) tampoco vivirian en Karma: ahi no hay `fs`.
 * Se mantienen porque son el contrato con los e2e y con la decision de redaccion de HOGARIA-SPEC 12q, y
 * porque un `readFileSync` que no resuelve falla ruidosamente en lugar de pasar sin probar nada.
 */

const source = readFileSync(fileURLToPath(new URL('./meal-hours.component.ts', import.meta.url)), 'utf-8');

function withTimes(times: Record<string, string>): MealHoursComponent {
  const component = new MealHoursComponent();
  component.times = times as never;
  return component;
}

describe('app-meal-hours', () => {
  it('pinta las cuatro comidas en el orden del dia, con su id prefijado', () => {
    const component = withTimes({});
    component.idPrefix = 'meal';
    expect(component.rows.map((row) => row.id)).toEqual([
      'meal-breakfast',
      'meal-lunch',
      'meal-snack',
      'meal-dinner'
    ]);
    expect(component.rows.map((row) => row.label)).toEqual(['Desayuno', 'Almuerzo', 'Merienda', 'Cena']);
  });

  it('el prefijo del tour deja intactos los ids que buscan los e2e', () => {
    const component = withTimes({});
    component.idPrefix = 'ob-meal';
    expect(component.rows.map((row) => row.id)).toContain('ob-meal-dinner');
  });

  it('la hora de fabrica no ofrece «Por defecto»: no hay nada que deshacer', () => {
    expect(withTimes({ dinner: '20:30' }).isDefault('dinner')).toBeTrue();
    expect(withTimes({ dinner: '20:30' }).isNotDefault('dinner')).toBeFalse();
  });

  it('una hora distinta, si', () => {
    expect(withTimes({ dinner: '22:15' }).isNotDefault('dinner')).toBeTrue();
  });

  it('vaciar el campo cuenta como «por defecto», que es lo que hara la app con ese valor', () => {
    expect(withTimes({ dinner: '' }).isDefault('dinner')).toBeTrue();
    expect(withTimes({ dinner: '   ' }).isDefault('dinner')).toBeTrue();
  });

  it('reset escribe la hora de fabrica dentro del objeto del host, no una copia', () => {
    const times = { dinner: '22:15' };
    withTimes(times).reset('dinner');
    // Mutar en lugar de emitir es lo que hace que `hasUnsavedChanges()` de Preferencias se entere: si
    // esto devolviera un objeto nuevo, el snapshot guardado seguiria comparando contra el viejo y el
    // boton de guardar diria «no hay cambios» teniendolos. Es el bug que tenia la copia de Preferencias.
    expect(times.dinner).toBe('20:30');
  });

  it('escribe en el modelo al teclear y guarda la cadena vacia tal cual', () => {
    const times: Record<string, string> = { dinner: '20:30' };
    const component = withTimes(times);
    component.write('dinner', '21:45');
    expect(times.dinner).toBe('21:45');
    component.write('dinner', '');
    expect(times.dinner).toBe('');
  });

  it('la copia del boton es «Por defecto», no «en blanco»', () => {
    // HOGARIA-SPEC 12q: un campo vacio se describe por lo que significa (vuelve el valor de fabrica),
    // no por su aspecto. Y el aspecto, ademas, mintio durante todo este tiempo.
    // El boton lleva el texto en la linea de al lado del `>`, y en el fichero hay un `Por defecto` en
    // un comentario: la asercion tiene que mirar el tag, no la palabra suelta.
    expect(source).toMatch(/<button[\s\S]{0,240}?Por defecto[\s\S]{0,40}?<\/button>/);
    expect(source).not.toMatch(/[Ee]n blanco/);
  });
});
