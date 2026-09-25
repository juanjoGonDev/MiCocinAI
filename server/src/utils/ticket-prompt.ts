/**
 * El prompt de la lectura de tickets (HOGARIA-SPEC ## 12aj), aparte de la ruta por las mismas
 * razones que `photo-prompt.ts`: se puede leer entero sin buscarlo entre un `try` y un `INSERT`,
 * y se puede probar que menciona lo que tiene que mencionar (el inventario adjunto, los
 * centimos, la tienda, el «no inventes») sin montar un proveedor de IA.
 *
 * La novedad del parte: a la IA se le adjunta un JSON llamado «inventario» con TODAS las tiendas
 * guardadas, las categorias de la despensa y los productos dentro de cada categoria —asi sabe
 * en que categoria va cada cosa que lee, y si un producto o una categoria no estan registrados,
 * sabe como proponerlos en vez de inventar.
 */

export const TICKET_SHAPE = `{
  "store": "Mercadona",
  "lines": [
    {
      "name": "Leche semidesnatada 1,5L",
      "quantity": 2,
      "unit": "ud",
      "category": "dairy",
      "createCategory": false,
      "priceMinor": 195,
      "offer": { "buy": 3, "take": 2 },
      "confidence": 0.95,
      "note": ""
    }
  ],
  "currency": "EUR",
  "totalMinor": 390,
  "warnings": ["No se lee la linea del final"]
}`;

/** La forma del «inventario.json» que viaja con cada ticket. */
export interface InventarioParaPrompt {
  tiendas: string[];
  categorias: { clave: string; nombre: string }[];
  productos: { categoria: string; nombre: string; unidad: string }[];
}

export function buildInventarioJson(inventario: InventarioParaPrompt): string {
  // El fichero se LLAMA «inventario»: su contenido es el objeto, sin envoltorio —envolverlo en
  // `{ inventario: ... }` es la clase de indireccion que un modelo pequeno no siempre desenvuelve.
  return JSON.stringify(inventario);
}

export function buildTicketPrompt(input: { inventarioJson: string; esPdf: boolean }): {
  system: string;
  user: string;
} {
  const system = [
    'Eres el lector de tickets de compra de una casa. Tu salida es UN objeto JSON y nada mas: sin markdown, sin prosa antes ni despues, sin comentarios.',
    'Reglas que no se pueden romper:',
    '1. El dinero va en CENTIMOS ENTEROS en `priceMinor` y `totalMinor` (1,95 EUR son 195). Nunca escribas un precio con coma ni con simbolo.',
    '2. El importe de cada linea del ticket es lo PAGADO por esa cantidad, no el precio por unidad: si la linea dice «2 x 1,10», son 2 unidades y priceMinor 220.',
    '3. NO inventes precios. Si el numero no se lee, `priceMinor` es null y lo dices en `warnings`. Una estimacion tuya acabaria en el historial de precios de la casa como si fuera un dato real.',
    '4. `store` es la tienda de la cabecera del ticket (el nombre del establecimiento, no su CIF ni su direccion). Si no se distingue, null.',
    '5. `category` es la CLAVE de una categoria del «inventario» adjunto. Busca primero en los productos ya registrados: como se llame alli algo parecido, usa su misma categoria. Si no encaja ninguna y tiene sentido, propone una clave nueva (en minusculas, sin espacios ni acentos) con `createCategory: true`.',
    '6. `quantity` es cuantas unidades se llevan; `unit` la unidad corta (ud, kg, g, l, ml, pack, lata, botella, caja). Las ofertas tipo «3x2» van en `offer`, no en el precio.',
    '7. `confidence` entre 0 y 1: lo que se lee claro vale 0.95, lo deducido de una letra borrosa vale 0.3.',
    '8. `totalMinor` es el total final del ticket. Si no cuadra con la suma de tus lineas, dilo en `warnings` en vez de cuadrarlo tu.',
    '9. Si una linea no se lee, no la metas: es mejor una linea menos que un producto que nadie compro.'
  ].join('\n');

  const user = [
    'Adjunto va «inventario.json», el inventario de esta casa: las tiendas que ya conoce, las categorias de su despensa y los productos registrados en cada una. Usalo para clasificar y para no proponer como nuevos cosas que ya existen:',
    input.inventarioJson,
    '',
    input.esPdf
      ? 'El ticket llega como PDF: lee sus lineas directamente del documento.'
      : 'El ticket llega como imagen: lee sus lineas directamente de la foto.',
    '',
    'Contesta con este objeto exacto, con tantas lineas `lines` como productos compre la persona:',
    TICKET_SHAPE
  ].join('\n');

  return { system, user };
}
