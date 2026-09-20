import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * El espejo de las comidas entre el server y la app, vigilado.
 *
 * `MEAL_TYPE_KEYS`, `MEAL_TIME_DEFAULTS` y `MEAL_TYPE_LABELS` de `taste-profile.ts` son el contrato: lo
 * que se guarda, lo que se le envia a la IA y el orden del dia. La app tiene sus propias copias
 * (`frontend/src/app/core/meal-times.ts` y `shared/models/calendar.model.ts`) porque son dos
 * compilaciones distintas y el frontend no puede importar un fichero del server que arrastra
 * better-sqlite3.
 *
 * Dos copias de unos numeros sin un test que las compare es la receta de «la app dice 20:30 y la IA
 * planifica la cena a las 21:00», que se cuela en un code review porque cada lado, solo, parece correcto.
 * Por eso esto compara los literales del fuente: si alguien mueve la constante de sitio, el regex falla y
 * el test avisa, en vez de pasar en verde sin comparar nada.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

function read(relative: string): string {
  return readFileSync(resolve(repoRoot, relative), 'utf8');
}

/** `export const NAME ... = { clave: 'valor', ... }` ignorando los comentarios. */
function objectEntries(source: string, name: string): Record<string, string> {
  const body = new RegExp(`export const ${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`).exec(source)?.[1];
  if (!body) throw new Error(`${name} ya no esta como estaba: actualiza este test`);

  const out: Record<string, string> = {};
  for (const line of body.split('\n')) {
    const clean = line.trim();
    if (!clean || clean.startsWith('*') || clean.startsWith('/') || clean.startsWith('//')) continue;
    const pair = /^'?(?<key>[\w-]+)'?:\s*'(?<value>[^']*)',?$/.exec(clean);
    if (pair?.groups) out[pair.groups.key] = pair.groups.value;
  }
  return out;
}

/** `export const NAME = ['a', 'b'] as const` -> la lista, en orden. */
function arrayConst(source: string, name: string): string[] {
  const body = new RegExp(`export const ${name}[^=]*=\\s*\\[([^\\]]*)\\]`).exec(source)?.[1];
  if (!body) throw new Error(`${name} ya no esta como estaba: actualiza este test`);
  return body
    .split(',')
    .map((entry) => entry.trim().replace(/'/g, ''))
    .filter(Boolean);
}

const server = read('server/src/utils/taste-profile.ts');
const frontendTimes = read('frontend/src/app/core/meal-times.ts');
const frontendModel = read('frontend/src/app/shared/models/calendar.model.ts');

describe('las comidas son las mismas en los dos lados', () => {
  it('los cuatro horarios por defecto coinciden', () => {
    expect(objectEntries(frontendTimes, 'MEAL_TIME_DEFAULTS')).toEqual(
      objectEntries(server, 'MEAL_TIME_DEFAULTS')
    );
  });

  it('el orden del dia es el mismo: la merienda antes que la cena', () => {
    const order = arrayConst(server, 'MEAL_TYPE_KEYS');

    expect(order).toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
    expect(arrayConst(frontendModel, 'MEAL_ORDER')).toEqual(order);
  });

  it('los nombres en español coinciden, comida por comida', () => {
    const serverLabels = objectEntries(server, 'MEAL_TYPE_LABELS');
    const frontendLabels = objectEntries(frontendModel, 'MEAL_TYPE_LABELS');

    for (const type of arrayConst(server, 'MEAL_TYPE_KEYS')) {
      expect(frontendLabels[type]).toBe(serverLabels[type]);
    }
  });

  it('el frontend no se ha hecho una lista de tipos propia', () => {
    // Las horas por defecto si se repiten, a proposito: son el espejo del server. La LISTA de comidas
    // no: si alguien vuelve a escribir los cuatro literales en `meal-times.ts`, manana hay dos ordenes
    // del dia y solo uno de ellos se acuerda de la merienda.
    expect(frontendTimes).toContain("MEAL_ORDER, MealType } from '../shared/models/calendar.model'");
    expect(frontendTimes).not.toMatch(/\[\s*'breakfast'/);
  });
});
