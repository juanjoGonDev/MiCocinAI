import type { PantryCategory } from '../../shared/models/pantry.model';

/**
 * Lo que las dos pantallas del gestor calculan sin tocar el DOM (HOGARIA-SPEC ## 12x).
 *
 * Vive aqui en vez de dentro del componente porque las dos reglas que hay debajo son las unicas del gestor que
 * se pueden equivocar sin que nadie se de cuenta hasta que la lista esta mal pintada, y porque un `computed` de
 * Angular no es un sitio comodo para probar un arbol. El server tiene las mismas dos reglas (en
 * `server/src/utils/pantry-categories.ts`); aqui se replican para no pedirle un 400 a la persona despues de
 * haberla dejado elegir la opcion que lo provoca.
 */

/**
 * Las claves que NO se pueden elegir como padre de una categoria: ella misma y todo lo que cuelga de ella.
 *
 * Si el picker de padre dejara elegir un descendiente, el arbol se cerraria en un ciclo y el conteo de
 * articulos por rama —que se calcula bajando por el arbol— no acabaria nunca. El server lo rechaza igualmente
 * (`assertPlacement`), pero la pantalla puede simplemente no ofrecer la opcion, y eso es mejor que un error.
 */
export function clavesNoElegiblesComoPadre(categorias: PantryCategory[], idPropio: string | null): Set<string> {
  // Al crear no hay nada prohibido: la categoria todavia no tiene descendientes.
  if (!idPropio) return new Set();
  const clavePropia = categorias.find((categoria) => categoria.id === idPropio)?.key;
  if (!clavePropia) return new Set();
  const prohibidas = new Set<string>([clavePropia]);
  let pendientes = [clavePropia];
  const visitadas = new Set<string>([clavePropia]);
  while (pendientes.length > 0) {
    const actual = pendientes.shift()!;
    const hijas = categorias.filter((categoria) => categoria.parentKey === actual);
    for (const hija of hijas) {
      if (visitadas.has(hija.key)) continue;
      visitadas.add(hija.key);
      prohibidas.add(hija.key);
      pendientes.push(hija.key);
    }
  }
  return prohibidas;
}

/** El color con el que se pinta una fila: el punto de la categoria, o gris de reserva si no trae ninguno. */
export const COLOR_RESERVA = '#8A8F98';

export function colorDeCategoria(categoria: Pick<PantryCategory, 'color'> | null | undefined): string {
  const valor = (categoria?.color ?? '').trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(valor) ? valor : COLOR_RESERVA;
}

/**
 * El alias que se anade a la ficha, o `null` si no es un alias.
 *
 * Tres cosas lo convierten en `null` y las tres las decide la persona, no el servidor: vacio, el propio nombre
 * del producto (no es un alias, es el nombre), y uno que ya esta puesto. El techo de 20 y de 60 caracteres son
 * los mismos del server, para que el boton no se quede con ganas.
 */
export function normalizarAlias(
  entrada: string,
  nombre: string,
  existentes: string[]
): { valor: string } | { error: 'vacio' | 'repetido' | 'es-el-nombre' } | null {
  const valor = String(entrada ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!valor) return { error: 'vacio' };
  if (nombre && valor.toLowerCase() === nombre.trim().toLowerCase()) return { error: 'es-el-nombre' };
  if (existentes.some((previo) => previo.toLowerCase() === valor.toLowerCase())) return { error: 'repetido' };
  if (existentes.length >= 20) return null;
  return { valor };
}

/** Lo que se pinta en la fila: los tres primeros alias y un «+n» con el resto, para que la lista no baile. */
export function aliasVisibles(aliases: string[], maximo = 3): { visibles: string[]; ocultos: number } {
  if (aliases.length <= maximo) return { visibles: aliases, ocultos: 0 };
  return { visibles: aliases.slice(0, maximo), ocultos: aliases.length - maximo };
}
