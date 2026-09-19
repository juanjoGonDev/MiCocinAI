/**
 * Perfil del hogar: qué se cocina y qué se quiere llevar desde la app.
 *
 * Nace del renombre a HogarIA. Antes el registro preguntaba un «nivel de
 * cocina» que no alimentaba nada; ahora el nivel decide cuánto explica la IA
 * (ver `detailLevelForCookingLevel` en el server) y los módulos dicen qué
 * secciones importan. Se guarda en la cuenta (`users.cooking_level` y
 * `users.preferences.profile.modules`), no en el hogar: cada comensal tiene el suyo.
 */

export type CookingLevel = 'none' | 'beginner' | 'intermediate' | 'expert';

/** Lo que muestra la UI en casa del miembro, también en el listado del hogar. */
export const COOKING_LEVEL_LABELS: Record<CookingLevel, string> = {
  none: 'Apenas cocino',
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  expert: 'Experto'
};

export const COOKING_LEVEL_OPTIONS: {
  value: CookingLevel;
  label: string;
  hint: string;
}[] = [
  {
    value: 'none',
    label: COOKING_LEVEL_LABELS.none,
    hint: 'Platos de cuatro pasos o menos, sin tecnicismos'
  },
  {
    value: 'beginner',
    label: COOKING_LEVEL_LABELS.beginner,
    hint: 'Explica el cómo, no solo el qué'
  },
  {
    value: 'intermediate',
    label: COOKING_LEVEL_LABELS.intermediate,
    hint: 'Lo normal, con algún consejo suelto'
  },
  {
    value: 'expert',
    label: COOKING_LEVEL_LABELS.expert,
    hint: 'Al grano: técnica, tiempos y temperaturas'
  }
];

/** Secciones de HogarIA. `available: false` es lo que aún está por construir. */
export type HomeModule = 'meals' | 'pantry' | 'shopping' | 'receipts' | 'home';

export interface HomeModuleOption {
  value: HomeModule;
  label: string;
  hint: string;
  available: boolean;
}

export const HOME_MODULE_OPTIONS: HomeModuleOption[] = [
  {
    value: 'meals',
    label: 'Comidas y recetas',
    hint: 'Planificador semanal y recetas con IA',
    available: true
  },
  {
    value: 'pantry',
    label: 'Despensa y caducidades',
    hint: 'Qué queda, qué caduca, qué aprovechar',
    available: true
  },
  {
    value: 'shopping',
    label: 'Lista de la compra y precios',
    hint: 'Cesta por tienda y cuánto costará',
    available: false
  },
  {
    value: 'receipts',
    label: 'Tickets con OCR',
    hint: 'Foto al ticket → despensa con caducidad y precios',
    available: false
  },
  {
    value: 'home',
    label: 'Tareas del hogar',
    hint: 'Reparto de tareas y calendario conjunto',
    available: false
  }
];

export const HOME_MODULES = HOME_MODULE_OPTIONS.map((option) => option.value);

export interface HomeProfile {
  cookingLevel: CookingLevel;
  modules: HomeModule[];
}

export const DEFAULT_HOME_PROFILE: HomeProfile = {
  cookingLevel: 'beginner',
  modules: []
};

const LEVELS: readonly string[] = ['none', 'beginner', 'intermediate', 'expert'];

export function isCookingLevel(value: unknown): value is CookingLevel {
  return typeof value === 'string' && LEVELS.includes(value);
}

export function isHomeModule(value: unknown): value is HomeModule {
  return typeof value === 'string' && (HOME_MODULES as readonly string[]).includes(value);
}

/**
 * Lo que venga del backend o del almacenamiento local pasa por aquí: valores
 * desconocidos fuera, duplicados dentro, y el orden de HOME_MODULES para que
 * dos dispositivos vean la misma lista.
 */
export function toHomeProfile(stored: unknown): HomeProfile {
  const raw = (stored ?? {}) as { modules?: unknown; cookingLevel?: unknown };
  const list = Array.isArray(raw['modules']) ? (raw['modules'] as unknown[]) : [];
  const modules = HOME_MODULE_OPTIONS.filter((option) => list.includes(option.value)).map(
    (option) => option.value
  );

  return {
    cookingLevel: isCookingLevel(raw['cookingLevel']) ? raw['cookingLevel'] : 'beginner',
    modules
  };
}

export function toggleHomeModule(modules: HomeModule[], module: HomeModule): HomeModule[] {
  return modules.includes(module) ? modules.filter((m) => m !== module) : [...modules, module];
}

/** Frase para «así te afecta», en el propio selector. */
export function detailLevelHint(level: CookingLevel): string {
  switch (level) {
    case 'none':
      return 'La IA escribirá pasos cortos y explicará cada término.';
    case 'beginner':
      return 'La IA explicará cómo se hace cada paso, no solo qué poner.';
    case 'intermediate':
      return 'La IA irá al grano y añadirá consejos cuando aporten.';
    case 'expert':
      return 'La IA dará por supuesto lo básico: técnica, tiempos y temperaturas.';
  }
}
