import { UNIT_FAMILIES, canonicalUnit, familyOf, isKnownUnit } from './unit-families';

/**
 * Las dos reglas del selector de unidad, sin Angular en medio: lo que se teclea a mano y lo que
 * significa cada familia. Si esto se rompe, la fila se guarda con una unidad que la lista de la
 * tienda no entiende, y el precio por unidad deja de ser comparable.
 */

describe('unit-picker — canonizar lo que se escribe', () => {
  it('reconoce las familias con sus mayusculas y plurales', () => {
    expect(canonicalUnit('KG')).toBe('kg');
    expect(canonicalUnit('kilos')).toBe('kg');
    expect(canonicalUnit('  250 g  ')).toBe('250 g');
    expect(canonicalUnit('lata.')).toBe('lata');
    expect(canonicalUnit('l')).toBe('L');
    expect(canonicalUnit('unidades')).toBe('ud');
  });

  it('deja intacto lo que no es una unidad conocida', () => {
    // Es el caso que justifica que esto exista: «bote de 400 g» NO es un error que haya que
    // corregir, es el dato de la estanteria.
    expect(canonicalUnit('bote de 400 g')).toBe('bote de 400 g');
    expect(canonicalUnit('pack de 6')).toBe('pack de 6');
  });

  it('nada no es una unidad', () => {
    expect(canonicalUnit('')).toBeNull();
    expect(canonicalUnit('   ')).toBeNull();
    expect(canonicalUnit(null)).toBeNull();
    expect(canonicalUnit(undefined)).toBeNull();
  });
});

describe('unit-picker — que sea una unidad', () => {
  it('distingue la unidad del nombre del producto', () => {
    expect(isKnownUnit('kg')).toBe(true);
    expect(isKnownUnit('KG')).toBe(true);
    expect(isKnownUnit('bote de 400 g')).toBe(false);
    expect(isKnownUnit('Tomates')).toBe(false);
    expect(isKnownUnit(null)).toBe(false);
  });
});

describe('unit-picker — familias', () => {
  it('una unidad pertenece a la familia que la lista', () => {
    expect(familyOf('g')?.id).toBe('weight');
    expect(familyOf('ml')?.id).toBe('volume');
    expect(familyOf('docena')?.id).toBe('count');
    expect(familyOf('L')?.id).toBe('volume');
    // Y una cadena inventada no tiene familia: la pantalla no tiene que inventarsela.
    expect(familyOf('bote de 400 g')).toBeNull();
    expect(familyOf(null)).toBeNull();
  });

  it('cada familia tiene una unidad por defecto que esta en su lista', () => {
    for (const family of UNIT_FAMILIES) {
      expect(family.units).toContain(family.defaultUnit);
    }
  });

  it('no hay dos familias que se disputen la misma unidad', () => {
    // Dos familias con la misma cadena harian que el check del desplegable apareciera en dos
    // filas y que «a que familia vuelvo al pulsar» dependiera del orden del array.
    const seen = new Map<string, string>();
    for (const family of UNIT_FAMILIES) {
      for (const unit of family.units) {
        const key = unit.toLowerCase();
        expect(seen.has(key)).toBe(false);
        seen.set(key, family.id);
      }
    }
  });
});
