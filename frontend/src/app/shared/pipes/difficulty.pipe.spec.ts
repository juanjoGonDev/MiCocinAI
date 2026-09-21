import { DICTS, type TranslationKey } from '../../core/i18n';
import { difficultyLabel } from './difficulty.pipe';

/**
 * `t` se le pasa por parametro y el diccionario en espanol es el de verdad: el pipe no tiene logica propia,
 * y lo que puede romperse es el reparto de claves, el punto de color y el «esto no es una dificultad».
 */
const es = (key: TranslationKey) => (DICTS.es as Record<string, string>)[key] ?? key;

describe('difficultyLabel', () => {
  it('traduce las tres', () => {
    expect(difficultyLabel('easy', es)).toBe('Fácil');
    expect(difficultyLabel('medium', es)).toBe('Medio');
    expect(difficultyLabel('hard', es)).toBe('Difícil');
  });

  it('la marca no la cambia el idioma', () => {
    const en = (key: TranslationKey) => (DICTS.en as Record<string, string>)[key] ?? key;
    expect(difficultyLabel('easy', en)).toBe('Easy');
    expect(difficultyLabel('hard', en)).toBe('Hard');
  });

  it('ante una dificultad que no conoce, ensena el dato, no una clave', () => {
    expect(difficultyLabel('Experta en frituras', es)).toBe('Experta en frituras');
  });

  it('el punto de color solo si se pide y solo si hay nivel', () => {
    expect(difficultyLabel('easy', es, true)).toBe('🟢 Fácil');
    expect(difficultyLabel('rara', es, true)).toBe('rara');
  });

  it('sin dato, nada', () => {
    expect(difficultyLabel(null, es)).toBe('');
    expect(difficultyLabel(undefined, es)).toBe('');
    expect(difficultyLabel('', es)).toBe('');
  });

  it('acepta la cadena como la escribio la IA, en lo que sea', () => {
    expect(difficultyLabel('HARD', es)).toBe('Difícil');
  });
});
