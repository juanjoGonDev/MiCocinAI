// =============================================================================
// El diccionario de HogarIA, mezclado.
//
// Como se usa un texto nuevo:
//   1. se anade la clave a `dict/<dominio>.ts` en los dos idiomas (si falta el ingles, no compila);
//   2. en la plantilla, {{ 'dominio.clave' | t }}; en el codigo, this.i18n.t('dominio.clave');
//   3. si lleva un numero o un nombre detras, separamos con {param}: no se pegan frases en la plantilla,
//      que una frase partida en dos no se traduce bien en ningun idioma.
//
// Por que `es` manda: es el idioma en el que esta escrito el producto, y el fallback de una clave
// desconocida tiene que ser el original, no la clave en crudo. Con `strictTemplates`, la union de tipos ya
// impide escribir una clave que no existe; lo que el tipo no puede ver es el `en`, y ahi mira el check-ui
// (regla `clave-sin-traduccion`).
// =============================================================================
import { uiEs, uiEn } from './dict/ui';
import { authEs, authEn } from './dict/auth';
import { dashboardEs, dashboardEn } from './dict/dashboard';
import { logsEs, logsEn } from './dict/logs';
import { navEs, navEn } from './dict/nav';
import { pantryEs, pantryEn } from './dict/pantry';
import { recipesEs, recipesEn } from './dict/recipes';
import { settingsEs, settingsEn } from './dict/settings';

const es = {
  ...uiEs,
  ...authEs,
  ...dashboardEs,
  ...logsEs,
  ...navEs,
  ...pantryEs,
  ...recipesEs,
  ...settingsEs,
};

const en: Record<keyof typeof es, string> = {
  ...uiEn,
  ...authEs,
  ...dashboardEs,
  ...logsEs,
  ...navEs,
  ...pantryEs,
  ...recipesEs,
  ...settingsEs,
};

export const DICTS = { es, en };

/** Toda clave que existe. Una cadena nueva sin traduccion no compila, y una clave inventada tampoco. */
export type TranslationKey = keyof typeof es;

/** Lo que hay que traducir, por si manana el diccionario viene de un JSON y no de un literal. */
export type TranslationParams = Record<string, string | number>;
