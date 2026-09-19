import {
  COOKING_LEVEL_LABELS,
  COOKING_LEVEL_OPTIONS,
  DEFAULT_HOME_PROFILE,
  detailLevelHint,
  HOME_MODULES,
  HOME_MODULE_OPTIONS,
  isCookingLevel,
  isHomeModule,
  toHomeProfile,
  toggleHomeModule,
  HomeProfile
} from './home-profile';

/**
 * El modelo del perfil del hogar es el unico sitio donde se interpretan los
 * valores que llegan del backend o del almacenamiento local: aqui se prueba la
 * parte defensiva, que es la que evita pantallas en blanco con datos viejos.
 */
describe('home-profile model', () => {
  it('declara los cuatro niveles con su etiqueta y su explicacion', () => {
    expect(COOKING_LEVEL_OPTIONS.map((option) => option.value)).toEqual([
      'none',
      'beginner',
      'intermediate',
      'expert'
    ]);
    for (const option of COOKING_LEVEL_OPTIONS) {
      expect(option.label).toBe(COOKING_LEVEL_LABELS[option.value]);
      expect(option.hint.length).toBeGreaterThan(10);
    }
  });

  it('dice a cada nivel cuanto explica la IA', () => {
    expect(detailLevelHint('none')).toContain('pasos cortos');
    expect(detailLevelHint('beginner')).toContain('cada paso');
    expect(detailLevelHint('intermediate')).toContain('al grano');
    expect(detailLevelHint('expert')).toContain('técnica');
  });

  it('lista las cinco secciones, tres de ellas como pendientes', () => {
    expect(HOME_MODULE_OPTIONS.map((option) => option.value)).toEqual(HOME_MODULES);
    expect(HOME_MODULE_OPTIONS.filter((option) => !option.available).length).toBe(3);
    for (const option of HOME_MODULE_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(3);
      expect(option.hint.length).toBeGreaterThan(3);
    }
  });

  it('reconoce solo los valores suyos', () => {
    expect(isCookingLevel('none')).toBeTrue();
    expect(isCookingLevel('expert')).toBeTrue();
    expect(isCookingLevel('chefa')).toBeFalse();
    expect(isCookingLevel(undefined)).toBeFalse();
    expect(isHomeModule('receipts')).toBeTrue();
    expect(isHomeModule('gatos')).toBeFalse();
    expect(isHomeModule(null)).toBeFalse();
  });

  it('arranca sin secciones marcadas y con el nivel por defecto del alta', () => {
    expect(DEFAULT_HOME_PROFILE).toEqual({ cookingLevel: 'beginner', modules: [] });
  });

  describe('toHomeProfile', () => {
    it('acepta lo bien formado', () => {
      expect(toHomeProfile({ cookingLevel: 'expert', modules: ['meals', 'pantry'] })).toEqual({
        cookingLevel: 'expert',
        modules: ['meals', 'pantry']
      });
    });

    it('sobrevive a un perfil ausente o roto', () => {
      const fallback: HomeProfile = { cookingLevel: 'beginner', modules: [] };
      expect(toHomeProfile(undefined)).toEqual(fallback);
      expect(toHomeProfile(null)).toEqual(fallback);
      expect(toHomeProfile('no es un objeto')).toEqual(fallback);
      expect(toHomeProfile(42)).toEqual(fallback);
    });

    it('descarta valores desconocidos y duplicados', () => {
      const result = toHomeProfile({
        cookingLevel: 'intermedio',
        modules: ['meals', 'meals', 'gatos', null, 7, 'pantry']
      });

      expect(result.cookingLevel).toBe('beginner');
      expect(result.modules).toEqual(['meals', 'pantry']);
    });

    it('ordena por el registro, no por lo que mando el cliente', () => {
      expect(toHomeProfile({ modules: ['pantry', 'meals'] }).modules).toEqual(['meals', 'pantry']);
    });

    it('ignora una lista de modulos que no es una lista', () => {
      expect(toHomeProfile({ modules: 'meals' }).modules).toEqual([]);
      expect(toHomeProfile({ modules: { 0: 'meals' } }).modules).toEqual([]);
    });
  });

  describe('toggleHomeModule', () => {
    it('añade si no estaba y quita si estaba', () => {
      expect(toggleHomeModule([], 'meals')).toEqual(['meals']);
      expect(toggleHomeModule(['meals'], 'pantry')).toEqual(['meals', 'pantry']);
      expect(toggleHomeModule(['meals', 'pantry'], 'meals')).toEqual(['pantry']);
    });

    it('es reversible y no muta la lista de entrada', () => {
      const before: ('meals' | 'pantry')[] = ['meals'];

      const once = toggleHomeModule(before, 'pantry');
      const twice = toggleHomeModule(once, 'pantry');

      expect(once).toEqual(['meals', 'pantry']);
      expect(twice).toEqual(['meals']);
      expect(before).toEqual(['meals']);
    });
  });
});
