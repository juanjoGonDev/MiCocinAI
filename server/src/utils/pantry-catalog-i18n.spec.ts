/**
 * Espejo del catalogo sembrado (HOGARIA-SPEC ## 12w).
 *
 * `server/src/utils/seed-data.ts` escribe la despensa y los utensilios de una casa nueva con el nombre en
 * castellano, y el frente los pinta con la etiqueta traducida a partir de dos mapas (`FOOD_LABEL_KEYS` y
 * `UTENSIL_LABEL_KEYS`). Esos mapas no los cura nadie a mano: viven pegados al semillero, y este fichero es lo
 * que se entera cuando alguien anade un alimento, le cambia el nombre o deja el ingles en blanco. Un mapa que
 * se queda viejo no rompe nada visible en el momento: simplemente la palabra nueva vuelve a salir en castellano
 * para siempre, que es el bug que la ronda 24 viene a cerrar.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const SEED = join(__dirname, 'seed-data.ts');
const LABELS = join(REPO_ROOT, 'frontend/src/app/core/i18n/labels.ts');
const DICT = join(REPO_ROOT, 'frontend/src/app/core/i18n/dict/pantry.ts');

const seed = readFileSync(SEED, 'utf8');
const labels = readFileSync(LABELS, 'utf8');
const dict = readFileSync(DICT, 'utf8');

/** Los `name:` de un array del semillero, en el orden en que estan escritos. */
function nombresDelSemillero(constante: string): string[] {
  const i = seed.indexOf(constante);
  if (i < 0) throw new Error(`${constante} ya no esta en seed-data.ts`);
  const abierto = seed.indexOf('[', i);
  const bloque = seed.slice(abierto, seed.indexOf('\n]', abierto) + 2);
  return [...bloque.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1]);
}

/** Un mapa `Record<string, TranslationKey>` del frente, leido como texto: no hay porque duplicar la fuente. */
function mapaDeLabels(nombre: string): Map<string, string> {
  const i = labels.indexOf(`export const ${nombre}`);
  if (i < 0) throw new Error(`falta ${nombre} en core/i18n/labels.ts`);
  const bloque = labels.slice(i, labels.indexOf('};', i));
  const out = new Map<string, string>();
  for (const m of bloque.matchAll(/'([^']+)':\s*'(pantry\.[a-z_.]+)'/g)) out.set(m[1], m[2]);
  return out;
}

/** Los dos idiomas del dominio, que comparten fichero. */
function idiomas(): { es: Map<string, string>; en: Map<string, string> } {
  const parse = (ident: string) => {
    const i = dict.indexOf(`export const ${ident}`);
    if (i < 0) throw new Error(`falta ${ident} en dict/pantry.ts`);
    const bloque = dict.slice(i, dict.indexOf('\n}', i));
    const out = new Map<string, string>();
    for (const m of bloque.matchAll(/'([^']+)':\s*'((?:[^'\\]|\\.)*)'/g)) out.set(m[1], m[2].replace(/\\'/g, "'"));
    return out;
  };
  return { es: parse('pantryEs'), en: parse('pantryEn') };
}

for (const [nombre, constante, prefijo] of [
  ['FOOD_LABEL_KEYS', 'COMMON_INGREDIENTS', 'pantry.comida.'],
  ['UTENSIL_LABEL_KEYS', 'COMMON_UTENSILS', 'pantry.utensilio.']
] as const) {
  describe(`${nombre} contra el semillero (## 12w)`, () => {
    const mapa = mapaDeLabels(nombre);
    const sembrados = nombresDelSemillero(constante);

    it('cada nombre sembrado tiene etiqueta, y el mapa no se ha quedado con nombres que ya no existen', () => {
      expect([...mapa.keys()].sort()).toEqual([...sembrados].sort());
      expect(sembrados.length).toBeGreaterThan(40);
    });

    it('las claves tienen el slug del nombre, y el prefijo del catalogo', () => {
      for (const [valor, clave] of mapa) {
        expect(clave.startsWith(prefijo)).toBe(true);
        expect(clave).toMatch(/^pantry\.(comida|utensilio)\.[a-z0-9_]+$/);
        expect(valor.length).toBeGreaterThan(1);
      }
      for (const clave of mapa.values()) expect(clave.startsWith(prefijo)).toBe(true);
    });

    it('el castellano de la etiqueta es el nombre del semillero, byte a byte', () => {
      // Si aqui alguien «arregla» una tilde, la clave deja de encontrarse con el dato guardado y el nombre
      // vuelve a salir en crudo: el mapa se indexa por el texto que hay en la base de datos.
      const { es } = idiomas();
      for (const [valor, clave] of mapa) expect(es.get(clave)).toBe(valor);
    });

    it('el ingles esta, y no es el castellano copiado con acentos', () => {
      const { es, en } = idiomas();
      for (const clave of mapa.values()) {
        const traduccion = en.get(clave);
        expect(typeof traduccion).toBe('string');
        expect((traduccion ?? '').trim().length).toBeGreaterThan(0);
        expect(traduccion).not.toMatch(/[áéíóúñÁÉÍÓÚÑ]/);
        expect(es.has(clave)).toBe(true);
      }
    });
  });
}

describe('los dos catalogos del semillero (## 12w)', () => {
  it('no comparten ni una palabra: la lectura puede mirar primero la despensa y luego los utensilios', () => {
    const comidas = new Set(mapaDeLabels('FOOD_LABEL_KEYS').keys());
    const solape = [...mapaDeLabels('UTENSIL_LABEL_KEYS').keys()].filter((n) => comidas.has(n));
    expect(solape).toEqual([]);
  });

  it('ningun nombre del catalogo se queda sin clave en el diccionario', () => {
    const { es, en } = idiomas();
    const claves = [...mapaDeLabels('FOOD_LABEL_KEYS').values(), ...mapaDeLabels('UTENSIL_LABEL_KEYS').values()];
    expect(claves.length).toBe(122);
    for (const clave of claves) {
      expect(en.has(clave)).toBe(true);
      expect(es.has(clave)).toBe(true);
    }
  });
});

describe('los puntos de pintura del catalogo (## 12w)', () => {
  const FRONT = join(REPO_ROOT, 'frontend/src/app');

  it('quien lee un nombre del semillero lo pasa por la etiqueta', () => {
    for (const f of [
      'features/pantry/pantry.component.ts',
      'features/onboarding/onboarding.component.ts',
      'features/recipes/recipes.component.ts',
      'features/shopping/shopping-list-detail.component.ts'
    ]) {
      const texto = readFileSync(join(FRONT, f), 'utf8');
      expect(/\{\{ *[a-zA-Z_.]+\.name \| catalog \}\}/.test(texto)).toBe(true);
    }
  });

  it('y quien lee las lineas de un ticket fotografiado las deja intactas', () => {
    // Es la otra mitad de la regla: el texto de otra persona no se corrige, aunque se parezca al catalogo.
    const detalle = readFileSync(join(FRONT, 'features/shopping/shopping-list-detail.component.ts'), 'utf8');
    expect(detalle).toContain('{{ line.name }}');
    expect(detalle.includes('line.name | catalog')).toBe(false);
  });
});

describe('la pipe de lectura (## 12w)', () => {
  const PIPE = join(REPO_ROOT, 'frontend/src/app/shared/pipes/catalog-label.pipe.ts');

  it('es impura: pura no se vuelve a evaluar al cambiar de idioma', () => {
    const fuente = readFileSync(PIPE, 'utf8');
    const decorador = fuente.slice(fuente.indexOf('@Pipe('), fuente.indexOf('})', fuente.indexOf('@Pipe(')));
    expect(decorador).toContain('pure: false');
    expect(decorador).toContain('standalone: true');
  });

  it('y esta declarada en cada pantalla que pinta un nombre del semillero', () => {
    for (const f of [
      'features/pantry/pantry.component.ts',
      'features/onboarding/onboarding.component.ts',
      'features/recipes/recipes.component.ts',
      'features/shopping/shopping-list-detail.component.ts'
    ]) {
      const texto = readFileSync(join(REPO_ROOT, 'frontend/src/app', f), 'utf8');
      expect(texto).toContain('CatalogLabelPipe');
    }
  });
});
