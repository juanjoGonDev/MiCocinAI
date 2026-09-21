#!/usr/bin/env node
// =============================================================================
// Guarda de las reglas de UI de HogarIA, sin dependencias.
//
// Por que existe: las reglas de abajo se escribieron a mano en el spec, se
// incumplieron tres veces en dos semanas y NINGUNO de los fallos lo pillo el
// compilador ni los tests: un emoji en un boton se ve bonito en el commit y feo en
// un movil pequeno; un `select` nativo funciona en desktop y sale con los colores
// del sistema en Android; y un test e2e que pregunta por un `data-test` inventado
// no falla en local, falla en CI a las tres de la tarde. Aqui se comprueban de
// golpe, en local, en medio segundo.
//
// Uso: node scripts/check-ui.mjs   (o  pnpm run check:ui)
// =============================================================================
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, posix } from 'node:path';

const FRONTEND = 'frontend/src';
const UI_DIR = 'frontend/src/app/shared/components/ui';
const E2E_DIR = 'tests/e2e';

// Cuantas reglas hay dentro. Se cuenta aqui y no a mano porque la ultima vez que se anadio una (la de
// los selectores huerfanos) el mensaje de «sin incidencias» seguia diciendo siete, que es exactamente
// el tipo de mentira que este fichero existe para evitar.
const RULES = 15;

// ---------------------------------------------------------------------------
// Deuda heredada, declarada en voz alta.
//
// Estas dos listas NO son un "vale, entonces da igual": son la cuenta de lo que
// queda por migrar. Se admiten porque el cambio de un glifo o de un `select` en
// una pantalla ajena a esta ronda es otra PR con sus propios tests, y porque un
// guardia que falla en 300 sitios no se ejecuta nunca. Lo que si se exige: que la
// lista SOLO puede encoger. Si un fichero deja de deber nada, abajo lo dice, y se
// quita de aqui en el mismo commit.
// ---------------------------------------------------------------------------
const LEGACY = {
  // «Quitar la foto» NO pregunta: el propio modal de la foto es ya un paso con dos decisiones
  // (sustituir / quitar) y su boton de cancelar, y quitar la foto se deshace volviendo a subirla. Un
  // confirm dentro de un dialogo que ya es una confirmacion es preguntar dos veces por lo mismo.
  'sin-confirmar-borrado': [
    'frontend/src/app/features/account/account.component.ts'
  ],
  'sin-emoji': [
    // Los emoji de Configuracion viajaban dentro del diccionario del service; al mover el diccionario a
    // su fichero se muda tambien la deuda, que sigue siendo la misma cuenta (regla 1, tanda aparte).
    'frontend/src/app/core/i18n/dict/settings.ts',
    'frontend/src/app/features/ai-config/ai-config.component.ts',
    'frontend/src/app/features/dashboard/dashboard.component.ts',
    'frontend/src/app/features/household/household.component.ts',
    'frontend/src/app/features/invite/invite.component.ts',
    'frontend/src/app/features/onboarding/onboarding.component.ts',
    'frontend/src/app/features/pantry/pantry.component.ts',
    'frontend/src/app/features/recipes/recipes.component.ts',
    'frontend/src/app/layouts/auth-layout/auth-layout.component.ts',
    'frontend/src/app/shared/components/ui/chip-select/chip-select.component.ts',
    'frontend/src/app/shared/components/ui/input/input.component.ts',
    'frontend/src/app/shared/components/ui/modal/modal.component.ts',
    'frontend/src/app/shared/components/ui/rating/rating.component.ts',
    'frontend/src/app/shared/components/ui/toast/toast.component.spec.ts',
    'frontend/src/app/shared/components/ui/toast/toast.component.ts',
    'frontend/src/app/shared/models/taste-profile.ts',
    'frontend/src/app/shared/pipes/difficulty.pipe.spec.ts',
    'frontend/src/app/shared/pipes/difficulty.pipe.ts',
  ],
  'ui-sin-uso': [
    'frontend/src/app/shared/components/ui/card/card.component.ts',
    'frontend/src/app/shared/components/ui/dropdown/dropdown.component.ts',
    'frontend/src/app/shared/components/ui/progress/progress.component.ts',
    'frontend/src/app/shared/components/ui/rating/rating.component.ts',
    'frontend/src/app/shared/components/ui/tooltip/tooltip.component.ts'
  ],
  // Tanda 20: el diccionario aun no es el unico camino para el texto en estas 22 pantallas. La lista es la
  // cuenta de lo que queda de esta tanda, NO un «ya llegara»: cada commit la acorta, y el objetivo es
  // borrarla entera (HOGARIA-SPEC 12s). Si un fichero se va y se queda aqui, check-ui lo dice.
  'texto-sin-traducir': [
    'frontend/src/app/features/account/account.component.ts',
    'frontend/src/app/features/account/avatar-editor.component.ts',
    'frontend/src/app/features/ai-config/ai-config.component.ts',
    'frontend/src/app/features/auth/forgot-password/forgot-password.component.ts',
    'frontend/src/app/features/auth/login/login.component.ts',
    'frontend/src/app/features/auth/register/register.component.ts',
    'frontend/src/app/features/calendar/calendar-event.component.ts',
    'frontend/src/app/features/calendar/calendar-month.component.ts',
    'frontend/src/app/features/calendar/calendar-timeline.component.ts',
    'frontend/src/app/features/calendar/calendar.component.ts',
    'frontend/src/app/features/household/household.component.ts',
    'frontend/src/app/features/invite/invite.component.ts',
    'frontend/src/app/features/logs/logs.component.ts',
    'frontend/src/app/features/onboarding/onboarding.component.ts',
    'frontend/src/app/features/pantry/pantry.component.ts',
    'frontend/src/app/features/preferences/preferences.component.ts',
    'frontend/src/app/features/recipes/recipes.component.ts',
    'frontend/src/app/features/shopping/shopping-list-detail.component.ts',
    'frontend/src/app/features/shopping/shopping-lists.component.ts',
    'frontend/src/app/features/shopping/unit-picker.component.ts',
    'frontend/src/app/layouts/auth-layout/auth-layout.component.ts',
    'frontend/src/app/shared/components/ui/home-profile-picker/home-profile-picker.component.ts',
  ],
  'sin-select-nativo': [
    'frontend/src/app/features/ai-config/ai-config.component.ts',
    'frontend/src/app/features/calendar/calendar.component.ts',
    'frontend/src/app/features/logs/logs.component.ts',
    'frontend/src/app/features/pantry/pantry.component.ts',
    'frontend/src/app/features/recipes/recipes.component.ts',
  ]
};

const problems = [];
const stale = new Map(Object.entries(LEGACY).map(([rule, files]) => [rule, new Set(files)]));
const touched = new Map(); // rule -> ficheros que la incumplen, deuden o no

const fail = (file, line, rule, detail) => {
  const normalized = file.replace(/\\/g, '/');
  if (!touched.has(rule)) touched.set(rule, new Set());
  touched.get(rule).add(normalized);
  if (stale.get(rule)?.has(normalized)) return;
  problems.push({ file: normalized, line, rule, detail });
};

function walk(dir, filter) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path, filter));
    else if (filter(path)) out.push(path);
  }
  return out.sort();
}

const isFrontendSource = (path) => path.endsWith('.ts') || path.endsWith('.html') || path.endsWith('.css');
const sourceFiles = walk(FRONTEND, isFrontendSource);
// El mismo texto, entero, para las reglas que preguntan «existe esta cadena en la interfaz».
const frontendSource = sourceFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// ---------------------------------------------------------------------------
// 1) Ni un emoji en la interfaz.
//
// Los iconos son los glifos de Material ya incorporados en el propio frontend
// (shared/components/ui/icon); un emoji depende de la fuente del sistema, cambia
// de forma entre Android e iOS y en una lista de la compra ocupa el sitio que
// necesita el nombre del producto. El rango esta elegido a mano para NO cazar la
// puntuacion latina de siempre: «», ·, —, ✓ y ° siguen siendo bienvenidas.
// ---------------------------------------------------------------------------
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F3FB}-\u{1F3FF}]/u;

for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(new RegExp(EMOJI, 'gu'))) {
    const snippet = text.slice(Math.max(0, match.index - 40), match.index + 40).replace(/\s+/g, ' ').trim();
    // Un emoji DENTRO de un comentario tampoco vale: manana alguien lo copia.
    fail(file, lineOf(text, match.index), 'sin-emoji', `"${match[0]}" en: ${snippet}`);
  }
}

// ---------------------------------------------------------------------------
// 2) Nada de `select` nativo fuera de los componentes de UI.
//
// El selector propio (app-picker) existe porque el nativo no admite color por
// opcion —que en una seccion de la compra ES informacion—, no deja escribir un
// valor que no esta en la lista y en movil abre el dialogo del sistema. Si aun
// asi hace falta un nativo, se escribe en el componente de UI y aqui se justifica.
// ---------------------------------------------------------------------------
for (const file of sourceFiles) {
  if (file.replace(/\\/g, '/').startsWith(UI_DIR)) continue;
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/<select[\s>]/g)) {
    fail(file, lineOf(text, match.index), 'sin-select-nativo', 'usar <app-picker> (o mover el nativo a shared/components/ui)');
  }
}

// ---------------------------------------------------------------------------
// 3) Ningun componente de `ui/` se queda sin usar.
//
// El peor final de un buen control es este: existe el picker, nadie lo importa, y
// en la pantalla de al lado nace otro `select` pelado. Si no hay nadie detras, el
// componente se borra o se usa; las dos opciones son mejores que el cementerio.
// ---------------------------------------------------------------------------
for (const file of walk(UI_DIR, (path) => path.endsWith('.component.ts'))) {
  const text = readFileSync(file, 'utf8');
  const selector = /selector:\s*'([^']+)'/.exec(text)?.[1];
  if (!selector || !selector.startsWith('app-')) continue;
  const usedSomewhere = sourceFiles.some(
    (other) => other !== file && readFileSync(other, 'utf8').includes(`<${selector}`)
  );
  if (!usedSomewhere) fail(file, 1, 'ui-sin-uso', `<${selector}> no lo monta ninguna plantilla`);
}

// ---------------------------------------------------------------------------
// 4) Los `data-test` de los e2e existen en la interfaz.
//
// El contrato se escribe en dos ficheros que no se ven entre ellos: si la pantalla
// cambia de nombre al atributo, el spec no se entera hasta que corre, y un spec que
// pregunta por algo que no existe puede pasar por "verde" mucho tiempo (Playwright
// no se queja de un locator que coincide con cero elementos y nadie lo toca). La
// comparacion admite prefijo comun porque hay atributos construidos a voleo
// ([attr.data-test]="'layer-' + kind") que nunca aparecen enteros en el codigo.
// ---------------------------------------------------------------------------
const dataTestInFrontend = new Set();
for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/data-test="([a-z0-9-]+)"/g)) dataTestInFrontend.add(match[1]);
  // Y los que se escriben con una expresion: `[attr.data-test]="option.value === 'done' ? 'tab-done' :
  // null"` o `[attr.data-test]="'layer-' + kind"`. El nombre entero no aparece nunca escrito, asi que
  // se recogen los literales de la linea —pero solo los con forma de nombre (`tab-done`, no `done`),
  // y cuando la linea concatena se guardan como PREFIJO, que es lo que son.
  for (const line of text.split('\n')) {
    if (!/\[\s*attr\.data-test\s*\]=/.test(line)) continue;
    const dynamic = line.includes('+');
    for (const match of line.matchAll(/'([a-z][a-z0-9]*-[a-z0-9-]*)'/g)) {
      // `'layer-' + kind` y `'discount-target-' + slug` son prefijos: se guardan tal cual, con su
      // guion, y se compara por empieza-por. Los demas son nombres completos.
      dataTestInFrontend.add(dynamic ? match[1] : match[1]);
    }
  }
}

const known = [...dataTestInFrontend];

/**
 * Comparacion EXACTA, con una unica excepcion: los atributos construidos (`'layer-' + kind`), que
 * solo pueden aparecer como un prefijo que acaba en guion. Antes se admitia «coincide por prefijo por
 * cualquier lado», y eso era un colador: al borrar la vista de semana, `meal-chip` seguia «existiendo»
 * porque el gate lo emparejaba con cualquier literal parecido, y los cuatro specs que lo preguntaban
 * se habrian quedado vacios sin que nadie lo notara (Playwright no falla ante un locator de cero
 * elementos). Un test que no puede fallar es peor que no tener test.
 */
const dynamicPrefixes = known.filter((candidate) => candidate.endsWith('-'));
// Un prefijo dinamico puede coincidir por las dos bandas: `household-event` se guarda como
// `household-event-` al construirlo, y un e2e puede preguntar por la base sin sufijo.
const matchesPrefix = (name, prefix) => name.startsWith(prefix) || `${name}-` === prefix || name === prefix.replace(/-$/, '');
const matchesAnything = (name) =>
  dataTestInFrontend.has(name) || dynamicPrefixes.some((prefix) => matchesPrefix(name, prefix));

if (existsSync(E2E_DIR)) {
  for (const file of walk(E2E_DIR, (path) => path.endsWith('.spec.ts'))) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/data-test="([a-z0-9-]+)"/g)) {
      if (match[1].startsWith('api-') || match[1].startsWith('mock-')) continue;
      if (!matchesAnything(match[1])) {
        fail(file, lineOf(text, match.index), 'data-test-inventado', `"${match[1]}" no aparece en ${FRONTEND}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 4b) Las clases que preguntan los e2e existen en el frontend.
//
// Mismo problema que los `data-test`, y mas sangrante porque la mayoria de pantallas no llevan
// atributo de test: el spec pregunta por `.meal-slot` y si la vista cambia de nombre, Playwright no
// falla —coincide con cero elementos y el test se queda vacio. `if (await loc.count() > 0)` agrava
// el asunto: el test verde ya no afirma nada. Se aceptan solo literales con guion (`.cal-cell`),
// porque una clase suelta tipo `.active` la produce Angular o el propio navegador al pintar.
// ---------------------------------------------------------------------------
if (existsSync(E2E_DIR)) {
  const classPattern = /locator\(\s*['"`]\.([a-z][a-z0-9]*(?:-[a-z0-9]+)+)/g;
  for (const file of walk(E2E_DIR, (path) => path.endsWith('.spec.ts'))) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(classPattern)) {
      const cls = match[1];
      // Un prefijo construido en el front (poco comun, pero `.tab-` + valor) tambien vale.
      if (!new RegExp(`\\b${cls}\\b`).test(frontendSource)) {
        fail(file, lineOf(text, match.index), 'clase-huerfana', `.${cls} no aparece en ${FRONTEND}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5) El frontend no habla con el proveedor de IA: habla con Hogaria.
//
// La clave vive en el servidor, en la configuracion de la casa (nada de `.env` y
// nada de clave en el navegador, que es un sitio publico). Un `fetch` a
// api.openai.com desde una pantalla es una clave filtrada, no un atajo.
// ---------------------------------------------------------------------------
const PROVIDER = /(api\.openai\.com|generativelanguage\.googleapis\.com|api\.anthropic\.com|openrouter\.ai|xai\.com|dashscope\.aliyuncs\.com)/;
for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  // Un placeholder con `https://api.openai.com/v1` en un campo de texto esta bien: es
  // EL SITIO DONDE SE ESCRIBE esa URL. Lo que no puede haber es el frontend llamando.
  if (!/\bfetch\s*\(|XMLHttpRequest|new HttpRequest/.test(text)) continue;
  for (const match of text.matchAll(new RegExp(PROVIDER.source, 'g'))) {
    fail(file, lineOf(text, match.index), 'clave-en-el-navegador', `llamada directa al proveedor (${match[1]}); pasa por /api`);
  }
}

// ---------------------------------------------------------------------------
// 6) Un atributo NO es texto: si se escapa del tag, el usuario lo lee.
//
// Paso en la hoja de la foto: el tag se cerro antes de tiempo
// (`... [class.x]="y"> data-test="photo-drop">`) y el atributo se pinto como contenido del
// cuadro de arrastre. Nadie lo vio en el commit, y el compilador tampoco: para Angular es
// texto perfectamente legal. La forma es facil de reconocer —un `>`, algo con forma de
// atributo, y un `>`— y facil de olvidar.
// ---------------------------------------------------------------------------
const LEAKED_ATTRIBUTE = />\s+[a-zA-Z-]+(?:\.[a-zA-Z-]+)?="[^"]*"\s*>/g;
for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(LEAKED_ATTRIBUTE)) {
    // Un `>` de cierre de expresion dentro del propio atributo (`a > b ? "x" : "y"`) no
    // pega con este patron porque exige la comilla de cierre justo antes del `>` final.
    fail(file, lineOf(text, match.index), 'atributo-como-texto', `texto suelto: "${match[0].trim()}"`);
  }
}

// ---------------------------------------------------------------------------
// 9) Todo lo que borra pregunta antes de borrar.
//
// Un borrado es la unica accion cuya equivocacion no se arregla volviendo a pulsar. La regla no
// mantiene una lista de pantallas (eso se oxida el dia que alguien anade un boton): mira los metodos de
// los componentes que llaman a un metodo destructor de un servicio (`delete…`, `remove…`) y exige que
// el `confirmService.confirm(` este DENTRO del mismo metodo. Si la confirmacion vive en otro metodo,
// no cuenta: es exactamente ese salto el que se olvida cuando alguien reutiliza el servicio desde otro
// sitio. Las excepciones se declaran en LEGACY['sin-confirmar-borrado'] con su motivo, y el propio
// script avisa cuando un fichero de la lista ya no incumple nada.
// ---------------------------------------------------------------------------
const DESTRUCTIVE = /(?:^|\.)(?:delete|remove|discard|clear)[A-Z][A-Za-z0-9]*\s*\(/;
const NOT_A_DELETION =
  /confirmService|localStorage|sessionStorage|classList|removeEventListener|clearTimeout|clearInterval|unsubscribe|removeAllRanges|removeRange|removeChild|clearGenerated|\babort\(|draft\.|this\.eventsError\.set/;
const METHOD_HEAD = /^  (?:(?:public|protected|private|readonly)\s+)*(?:async\s+)?([a-zA-Z][A-Za-z0-9_]*)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{\s*$/;

for (const file of sourceFiles) {
  if (!/\.component\.ts$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const head = METHOD_HEAD.exec(lines[i]);
    if (!head) continue;
    const name = head[1];
    // Cuerpo del metodo, siguiendo las llaves. Es burdo y a proposito: un componente de Angular no
    // deberia tener metodos que se salgan de este patron, y si algun dia lo hacen, el aviso sera claro.
    let depth = 0;
    let body = '';
    for (let j = i; j < lines.length; j++) {
      depth += (lines[j].match(/\{/g) || []).length - (lines[j].match(/\}/g) || []).length;
      body += lines[j] + '\n';
      if (depth <= 0 && j > i) break;
    }
    if (!DESTRUCTIVE.test(body) || NOT_A_DELETION.test(body)) continue;
    if (/confirm(?:Service)?\.confirm\(|await this\.confirm/.test(body)) continue;
    // Un salto de una capa si cuenta, y solo uno: `removeMeal(meal)` que delega en
    // `removeMealById(id)` es el patron normal de la app (el metodo del template necesita el objeto
    // entero para nombrar la cosa en el aviso, y el que confirma necesita el id). Dos saltos ya no: a
    // partir de ahi el aviso puede estar en cualquier sitio y nadie lo sabe.
    const delegated = [...body.matchAll(/this\.([a-zA-Z][A-Za-z0-9_]*)\(/g)]
      .map((m) => m[1])
      .filter((target) => target !== name)
      .some((target) => {
        const start = lines.findIndex((line) => new RegExp(`^  (?:(?:public|protected|private|async)\\s+)*${target}\\s*\\(`).test(line));
        if (start < 0) return false;
        let depth = 0;
        let inner = '';
        for (let k = start; k < lines.length; k++) {
          depth += (lines[k].match(/\{/g) || []).length - (lines[k].match(/\}/g) || []).length;
          inner += lines[k] + '\n';
          if (depth <= 0 && k > start) break;
        }
        return /confirm(?:Service)?\.confirm\(/.test(inner);
      });
    if (delegated) continue;
    fail(file, i + 1, 'sin-confirmar-borrado', `${name}() llama a un metodo destructor sin pasar por el dialogo de confirmacion`);
  }
}

// ---------------------------------------------------------------------------
// 7) Nada de backticks en un comentario dentro de la plantilla: cierran el literal.
//
// `template` y `styles` son literales de texto, y para JS un backtick es un backtick aunque
// este dentro de un `/* ... *\/[!]` escrito con buena fe: el primero corta el string, el CSS
// que sigue pasa a ser codigo y `styles` acaba siendo un array de varias entradas. El AOT lo
// cuenta como `Failed to resolve styles at position 1 — Value could not be determined
// statically` y el cliente NO ARRANCA; `tsc -p tsconfig.app.json` no lo ve, porque el
// resultado sigue siendo texto valido para el tipador. Paso real en la hoja de la linea de la
// compra, escribiendo un comentario con `app-avatar` entre backticks.
//
// Se busca la forma, no el contexto: un bloque que abre con `/*` o `<!--` al principio de la
// linea SOLO existe dentro de un literal en este codigo (los comentarios JS abren con `/**`).
// ---------------------------------------------------------------------------
const OPEN_INSIDE_LITERAL = /^\s*(?:\/\*(?!\*)|<!--)/;
for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!OPEN_INSIDE_LITERAL.test(lines[i])) continue;
    const closer = lines[i].trimStart().startsWith('<!--') ? '-->' : '*/';
    let body = '';
    let j = i;
    while (j < lines.length) {
      body += lines[j];
      if (lines[j].includes(closer)) break;
      j++;
    }
    if (body.includes('`')) {
      fail(
        file,
        i + 1,
        'backtick-cierra-el-literal',
        'quita los backticks del comentario: dentro de template/styles cierran el string'
      );
    }
    i = j;
  }
}

// ---------------------------------------------------------------------------
// 10) La interfaz no describe un campo vacio como «en blanco».
//
// Un input vacio puede significar dos cosas distintas —«no hay valor» o «usa el que trae la app»— y
// «en blanco» no dice ninguna: describe el color del rectangulo. La ronda de los horarios lo demostro,
// que escribio `En blanco: 09:00` para la segunda y un `deja el campo en blanco` para la primera. La
// regla mira lineas de codigo (plantillas, textos de componentes, HTML) y salta los comentarios: un
// programador puede hablar del lienzo; un usuario esta recibiendo una instruccion.
// ---------------------------------------------------------------------------
const BLANCO = /\ben blanco\b/i;
for (const file of sourceFiles) {
  // Un spec si puede escribir la palabra, y para prohibirla: su titulo no lo ve nadie salvo quien mantiene
  // la regla, y el test que falla es precisamente el que vigila la copia (meal-hours.component.spec).
  if (file.endsWith('.spec.ts')) continue;
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  let inBlock = null; // '/*' o '<!--', mientras dura un comentario de varias lineas
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (inBlock) {
      if (trimmed.includes(inBlock === '/*' ? '*/' : '-->')) inBlock = null;
      continue;
    }
    if (/^(?:\/\/|\/\*\*?|\*|<!--)/.test(trimmed)) {
      if (trimmed.startsWith('/*') && !trimmed.includes('*/')) inBlock = '/*';
      if (trimmed.startsWith('<!--') && !trimmed.includes('-->')) inBlock = '<!--';
      continue;
    }
    // Un comentario de una linea dentro de la plantilla tampoco es texto del usuario.
    const code = trimmed.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
    if (BLANCO.test(code)) {
      fail(file, i + 1, 'texto-sin-en-blanco', 'di «por defecto» (lo que la app usa) o «vacio / sin valor» (lo que no hay): «en blanco» no dice que pasa');
    }
  }
}

// ---------------------------------------------------------------------------
// 11) Todo lo que se puede pulsar lo parece.
//
// Dos mitades, y la segunda es la que el usuario nota sin saber nombrarla:
//
//  - Un `button` o un enlace con una clase propia tiene que tener estado `:hover` (o `:focus-visible`,
//    o `:active`) en los estilos del componente. Sin el, el control no avisa de que responde, y en
//    pantalla tactil no hay nada que lo compense: `styles.scss` resetea `border` y `background` de
//    todos los botones del mundo, asi que un boton «sin skin» es literalmente texto.
//  - Lo que se puede pulsar SIN ser boton ni enlace (`<div (click)>`, una fila, una tarjeta-label)
//    tiene que declarar `cursor: pointer`; si no, el puntero dice «esto no se toca» encima de algo que
//    si se toca.
//
// Los modificadores BEM cuentan por su base (`.cal-btn--ghost` se cubre con `.cal-btn:hover`), porque
// exigir el estado en cada variante seria inventarse CSS. Y la regla no sustituye a `ui-sin-uso`: esa
// pregunta por componentes del design system que nadie monta; esta, por controles que si se montan y
// no reaccionan.
// ---------------------------------------------------------------------------
const escapeCls = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Los bloques `.cls { … }` del CSS del componente, con las llaves contadas (el style es SCSS anidado). */
function styleBlocks(styles, cls) {
  const out = [];
  for (const match of styles.matchAll(new RegExp(`\\.${escapeCls(cls)}(?![\\w-])[^{]*\\{`, 'g'))) {
    let depth = 0;
    let i = match.index + match[0].length - 1;
    for (; i < styles.length; i++) {
      if (styles[i] === '{') depth++;
      else if (styles[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(styles.slice(match.index, i + 1));
  }
  return out;
}

const hasState = (styles, cls) =>
  styleBlocks(styles, cls).some((block) => /:hover|:focus-visible|:active/.test(block));

// Una incidencia por clase y fichero: `.detail__link` aparece nueve veces en la hoja de la compra y
// nueve lineas en la salida serian nueve formas de decir lo mismo (y la primera es la que hay que
// arreglar, porque el fix es la regla de CSS).
const reported = new Set();
const reportOnce = (key, file, line, detail) => {
  if (reported.has(key)) return;
  reported.add(key);
  fail(file, line, 'boton-sin-afecto', detail);
};

for (const file of sourceFiles) {
  if (!/\.component\.ts$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  const cut = text.indexOf('styles:');
  const template = cut > -1 ? text.slice(0, cut) : text;
  const styles = cut > -1 ? text.slice(cut) : '';

  // Solo `button`: los `a` del codigo heredan el `a:hover` del global (arriba de esta regla se comprueba
  // que ese baseline siga ahi, no que alguien lo borre y la regla se quede mirando a otro sitio).
  for (const match of template.matchAll(/<button\b([^>]*)>/g)) {
    const attrs = match[1];
    const classAttr = /(?:^|\s)class="([^"]*)"/.exec(attrs);
    // Con `[class.x]` o `{{ }}` la clase es un calcetin del estado: no hay a donde apuntar.
    if (!classAttr || /[[{]/.test(classAttr[1])) continue;
    for (const cls of classAttr[1].split(/\s+/).filter(Boolean)) {
      const family = [cls, ...(cls.includes('--') ? [cls.split('--')[0]] : [])];
      if (family.some((name) => hasState(styles, name))) continue;
      reportOnce(
        `${file}#${cls}`,
        file,
        lineOf(text, match.index),
        `.${cls} se puede pulsar y no tiene :hover ni :focus-visible en los estilos del componente`
      );
    }
  }

  for (const match of template.matchAll(/<(label|div|span|li|tr|td)\b([^>]*\((?:click|mousedown)\)="[^"]*"[^>]*)>/g)) {
    const classAttr = /(?:^|\s)class="([^"]*)"/.exec(match[2]);
    if (!classAttr || /[[{]/.test(classAttr[1])) continue;
    const cls = classAttr[1].split(/\s+/)[0];
    const blocks = styleBlocks(styles, cls);
    if (blocks.some((block) => /cursor:\s*(pointer|inherit)/.test(block))) continue;
    // Si el contenedor tiene un control nativo dentro, el puntero ya lo pone ese control.
    if (/<(?:input|button|a|select|textarea)\b/.test(template.slice(match.index, match.index + 900))) continue;
    reportOnce(
      `${file}#${cls}#cursor`,
      file,
      lineOf(text, match.index),
      `<${match[1]} class="${cls}"> se pulsa y no declara cursor: pointer`
    );
  }
}

// El baseline del que la regla de arriba se fia, comprobado: si alguien lo borra, los enlaces se quedan
// sin estado y la regla no lo ve (solo mira botones). Es mas facil de leer aqui que de descubrir en un
// movil.
const GLOBAL_STYLES = readFileSync('frontend/src/styles.scss', 'utf8');
for (const [what, re] of [
  ['`button { cursor: pointer }`', /button\s*\{[^}]*cursor:\s*pointer/s],
  ['`a:hover` global', /a\s*\{[^}]*&:hover/s],
  ['`label:has(input)` con puntero', /label:has\(input\)\s*\{[^}]*cursor:\s*pointer/s]
]) {
  if (!re.test(GLOBAL_STYLES)) {
    fail('frontend/src/styles.scss', 1, 'boton-sin-afecto', `falta el baseline ${what}, y la regla confía en él`);
  }
}

// ---------------------------------------------------------------------------
// 12) Un `var(--token)` que nadie define no es un error: es un estilo que no se aplica.
//
// El CSS se come las propiedades desconocidas sin decir nada, y eso hace de esto el tipo de bug que
// sobrevive a un code review: el campo de horas de `preferences` llevaba `border: 1px solid
// var(--border)`, aqui el token se llama `--border-default`, y el resultado era un input sin borde ni
// fondo que «no parece un boton». La regla distingue el token que alguien se inventa del que el propio
// codigo pasa por inline (`[style.--hour-px]`), que es como la rejilla manda su geometria al CSS y si
// existe.
// ---------------------------------------------------------------------------
const styleFiles = walk(FRONTEND, (path) => /\.(ts|html|css|scss)$/.test(path));
const definedTokens = new Map();
const runtimeTokens = new Set();
for (const file of styleFiles) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/(--[\w-]+)\s*:/g)) {
    if (!definedTokens.has(match[1])) definedTokens.set(match[1], file);
  }
  // `[style.--hour-px]="…"`, `style="--x: …"` y `setProperty('--x', …)`: tres formas de definirlo.
  const inline = /\[style\.(--[\w-]+)\]|style="[^"]*(--[\w-]+)\s*:|setProperty\(\s*'(--[\w-]+)'\s*,/g;
  for (const match of text.matchAll(inline)) {
    for (const group of match.slice(1)) if (group) runtimeTokens.add(group);
  }
}

const distance = (a, b) => {
  const rows = Array.from({ length: b.length + 1 }, (_, i) => [i, ...Array(a.length).fill(0)]);
  for (let j = 1; j <= a.length; j++) rows[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[j - 1] === b[i - 1] ? 0 : 1)
      );
    }
  }
  return rows[b.length][a.length];
};

const names = [...definedTokens.keys()];
for (const file of styleFiles) {
  const text = readFileSync(file, 'utf8');
  const seen = new Set();
  for (const match of text.matchAll(/var\(\s*(--[\w-]+)/g)) {
    const token = match[1];
    if (definedTokens.has(token) || runtimeTokens.has(token) || seen.has(token)) continue;
    seen.add(token);
    // Una pista con la que el fix es una palabra: la mayoria de las veces es el nombre mal recordado.
    // Familia primero: `--text` no se parece a `--meal` en un arbol de edicion, y si el token se
    // inventa a partir de una familia que existe (`--border` -> `--border-default`), eso es lo que hay
    // que decir. Sin familia comun solo se sugiere un vecino muy cercano.
    // `--border` y `--border-default` son de la misma familia; `--meal` no tiene nada que ver, aunque la
    // distancia de edicion diga lo contrario.
    const family = (name) => name.split('-').filter(Boolean)[0] ?? '';
    const guess = (() => {
      const kin = names.filter((name) => family(name) === family(token));
      if (kin.length) {
        return kin
          .map((name) => [name, distance(name, token)])
          .sort((a, b) => a[1] - b[1] || a[0].length - b[0].length)[0];
      }
      const near = names
        .map((name) => [name, distance(name, token)])
        .filter(([, score]) => score <= 2)
        .sort((a, b) => a[1] - b[1])[0];
      return near;
    })();
    fail(
      file,
      lineOf(text, match.index),
      'token-inexistente',
      guess
        ? `${token} no lo define nadie; quiza ${guess[0]} (se define en ${definedTokens.get(guess[0])})`
        : `${token} no lo define nadie y no se parece a ningun token del proyecto`
    );
  }
}

// --------------------------------------------------------------------------------
// 13) Un `*ngFor` que itera un getter del propio componente necesita `trackBy`.
//
// El motivo esta medido, no teorizado: `app-meal-hours` hizo `*ngFor="let row of rows"` sobre un getter
// que construa la array. `*ngFor` compara identidad, asi que cada ciclo de deteccion de cambios destrua
// y volva a montar las cuatro filas; con un `ngModel` dentro, el input recien creado escribe su valor en
// el modelo, el arbol se marca de nuevo, y el bucle no acaba —la pantalla de «Horarios» se congelaba. En
// un sandbox sin navegador nada de eso se ve: por eso la regla pide la clave de seguimiento, que si se
// puede comprobar leyendo el fichero, en lugar de «no uses getters» (mas bonito, menos comprobable).
// --------------------------------------------------------------------------------
const NGFOR_GETTER = /\*ngFor\s*=\s*"let\s+\w+\s+of\s+([A-Za-z_$][\w$]*)([^"]*)"/g;
for (const file of sourceFiles) {
  if (!file.endsWith('.component.ts')) continue;
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(NGFOR_GETTER)) {
    const [, name, rest] = match;
    if (/trackBy/.test(rest)) continue;
    const getter = new RegExp(`get\\s+${name}\\s*\\(\\s*\\)\\s*[:{]`);
    if (!getter.test(text)) continue;
    fail(
      file,
      lineOf(text, match.index),
      'ngfor-getter-sin-trackby',
      `*ngFor itera el getter '${name}', que devuelve una array nueva en cada ciclo: anade trackBy (o el campo, si el getter no aporta nada)`
    );
  }
}

// --------------------------------------------------------------------------------
// 14) Ningun texto de la interfaz se escribe a mano: todo pasa por el diccionario.
//
// La regla que faltaba. `I18nService` existia desde el principio, `check-ui` no miraba ni una sola
// vez si el texto lo atravesaba, y el resultado medido fue este: 502 literales en 29 plantillas
// contra 96 claves de diccionario. Cambiar a ingles dejaba media app en espanol y ningun gate se
// enteraba —ni el compilador, ni los tests, ni la build— porque un literal escrito en la plantilla
// es codigo perfectamente valido.
//
// Que se caza: un nodo de texto con prosa y los atributos que se leen (`placeholder`, `aria-label`,
// `title`...) sin su `| t`, y los `@Input()` con un literal de texto por defecto (un campo se evalua
// al construir el componente y no se entera despues del cambio de idioma). Que se salta a proposito:
// lo puramente tecnico (`class`, rutas, ids de icono, `g`/`ml`, `sk-...`, una url) y lo que lleva
// `{{ }}` en medio, que tambien tiene que traducirse pero convertido en una clave con {parametros}
// —eso lo decide una persona, y la lista de pendientes la imprime el propio extractor.
// --------------------------------------------------------------------------------
const VISIBLE_ATTRS = [
  'placeholder',
  'label',
  'alt',
  'heading',
  'message',
  'confirmText',
  'cancelText',
  'app-tooltip',
  'aria-label',
  'title'
];
// Unidades, simbolos y tokens tecnicos: se escriben igual en los dos idiomas. Anadir aqui es una
// decision de producto, no la forma de callar a la regla.
const NOT_TEXT = new Set(['g', 'kg', 'mg', 'lb', 'ml', 'l', 'cl', 'dl', 'ud', 'u', 'un', 'x', '%', '€']);

const isProse = (raw) => {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s || NOT_TEXT.has(s.toLowerCase())) return false;
  if (!/[a-záéíóúüñ]{2,}/.test(s)) return false; // «ON», «[SRV]», «×» no son frases
  if (/^[a-z0-9_.:/#\\-]+$/.test(s)) return false; // una url, un id, «sk-...», «gpt-4o-mini»
  return /[ ,.;:!?»—]/.test(s) || s.length > 4;
};

for (const file of sourceFiles) {
  if (!file.endsWith('.component.ts')) continue;
  const text = readFileSync(file, 'utf8');
  const block = text.match(/template:\s*`([\s\S]*?)\n\s*`/);
  if (!block) continue;
  const tpl = block[1];
  const base = text.indexOf(tpl, block.index);

  for (const attr of VISIBLE_ATTRS) {
    for (const match of tpl.matchAll(new RegExp(`[\\s]${attr}="([^"]*)"`, 'g'))) {
      const value = match[1];
      if (value.includes('{{') || !isProse(value)) continue;
      fail(
        file,
        lineOf(text, base + match.index),
        'texto-sin-traducir',
        `${attr}="${value}" sale tal cual a pantalla: pon ${attr.startsWith('aria') || attr === 'title' ? `[attr.${attr}]` : `[${attr}]`}="'clave' | t" y la clave en core/i18n/dict/`
      );
    }
  }

  for (const match of tpl.matchAll(/>([^<>]+)</g)) {
    const raw = match[1];
    if (/^\s*\}?\s*@/.test(raw) || /;\s*track\s/.test(raw)) continue; // control de flujo, no prosa
    // Comillas o llaves sueltas = el «nodo de texto» es en realidad un trozo de atributo multineado o
    // una linea de control (`@if (a > b) {`): la `>` de una comparacion abre un falso nodo de texto.
    if (/["'`{}]/.test(raw.replace(/\{\{[\s\S]*?\}\}/g, ''))) continue;
    const visible = raw.replace(/\{\{[\s\S]*?\}\}/g, ' ');
    if (!isProse(visible)) continue;
    if (/\|\s*t\b/.test(visible) && !isProse(visible.replace(/'[\w.-]+'\s*\|\s*t/g, ''))) continue;
    fail(
      file,
      lineOf(text, base + match.index),
      'texto-sin-traducir',
      `texto en la plantilla sin pasar por el diccionario: «${visible.replace(/\s+/g, ' ').trim().slice(0, 60)}» — si lleva {{ }} dentro, la clave va con {parametros}`
    );
  }

  for (const match of text.matchAll(/@Input\(\)\s+\w+(?:!)??\s*(?::\s*[^=]+)?=\s*'([^']*)'/g)) {
    if (!isProse(match[1])) continue;
    fail(
      file,
      lineOf(text, match.index),
      'texto-sin-traducir',
      `un @Input con «${match[1]}» de fabrica se escribe una vez y no se re-traduce al cambiar de idioma: deja el Input sin valor y resuelve el defecto con t('clave') en un getter`
    );
  }
}

// --------------------------------------------------------------------------------
// 15) Toda clave usada existe en los dos idiomas, y toda clave que existe se usa.
//
// El tipo `TranslationKey` ya impide invocar una clave que no esta en el espanol, pero no puede ver
// dos cosas que si importan: que el ingles este (un `''` traduce la pantalla a espacios en blanco), y
// que el diccionario no se este llenando de cadenas que nadie pinta —texto muerto que en la proxima
// tanda alguien «actualiza» y nadie nota que no hacia falta.
// --------------------------------------------------------------------------------
const DICT_DIR = 'frontend/src/app/core/i18n/dict';
const dictPairs = (text, ident) => {
  const match = text.match(new RegExp(`const ${ident}[^{]*\\{([\\s\\S]*?)\\n\\}`));
  if (!match) return new Map();
  const out = new Map();
  for (const kv of match[1].matchAll(/'([^']+)':\s*'((?:[^'\\]|\\.)*)'/g)) out.set(kv[1], kv[2]);
  return out;
};

const dictFiles = walk(DICT_DIR, (path) => path.endsWith('.ts') && !path.endsWith('types.ts'));
const esKeys = new Set();
for (const file of dictFiles) {
  const text = readFileSync(file, 'utf8');
  const stems = [...text.matchAll(/export const (\w+)Es = \{/g)].map((m) => m[1]);
  for (const stem of stems) {
    const es = dictPairs(text, `${stem}Es`);
    const en = dictPairs(text, `${stem}En`);
    for (const [key, value] of es) {
      esKeys.add(key);
      if (!en.has(key)) {
        fail(file, lineOf(text, 0), 'clave-sin-traduccion', `${key} esta en espanol y no en ingles (el tipo lo pilla, pero el mensaje utile es este)`);
      } else if (en.get(key).trim() === '') {
        fail(file, lineOf(text, 0), 'clave-sin-traduccion', `${key} tiene el ingles vacio: la pantalla sale en blanco en ese idioma`);
      }
    }
    for (const key of en.keys()) {
      if (!es.has(key)) fail(file, lineOf(text, 0), 'clave-sin-traduccion', `${key} solo existe en ingles: sobra, o falta en el espanol`);
    }
  }
}

// Las claves admiten guion (`nav.ai-config`), que es justo lo que hizo la regla cuando «no la invocaba
      // nadie» siendo obvia: un patrón de claves que no coincide con las claves reales no detecta nada.
const KEY_LITERAL = /'([a-z][a-z0-9_.-]*\.[a-z0-9_.-]+)'/gi;
const usedKeys = new Set();
for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(KEY_LITERAL)) {
    const key = match[1];
    if (!esKeys.has(key)) continue;
    usedKeys.add(key);
  }
  // Y al reves: una cadena con pinta de clave invocada que no esta en ningun diccionario.
  for (const match of text.matchAll(/\|\s*t\b/g)) {
    const alPrincipio = text.lastIndexOf('\n', match.index);
    if (/^\s*(\/\/|\*)/.test(text.slice(alPrincipio, match.index))) continue; // un ejemplo en un comentario
    const antes = text.slice(Math.max(0, match.index - 60), match.index);
    const key = antes.match(/'([a-z][\w.-]*)'\s*$/i)?.[1];
    if (key && !esKeys.has(key) && key.includes('.')) {
      fail(file, lineOf(text, match.index), 'clave-sin-traduccion', `«${key}» no existe en core/i18n/dict: cae al fallback y se ve la clave en pantalla`);
    }
  }
}
for (const file of dictFiles) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/'([^']+)':\s*'((?:[^'\\]|\\.)*)'/g)) {
    if (esKeys.has(match[1]) && !usedKeys.has(match[1])) {
      const enBlock = /En:/.test(text.slice(0, match.index));
      if (enBlock) continue;
      fail(file, lineOf(text, match.index), 'clave-sin-traduccion', `«${match[1]}» no la invoca nadie: o se usa o se borra`);
    }
  }
}

// --------------------------------------------------------------------------------
for (const [rule, files] of stale) {
  for (const file of files) {
    if (!touched.get(rule)?.has(file)) {
      console.log(`check-ui: ${file} ya no incumple '${rule}': quitalo de la lista de deuda.`);
    }
  }
}

if (problems.length === 0) {
  console.log(`check-ui: ${sourceFiles.length} ficheros, ${RULES} reglas, sin incidencias.`);
  process.exit(0);
}

const width = Math.max(...problems.map((problem) => problem.rule.length));
for (const problem of problems) {
  console.log(`${problem.file}:${problem.line}  ${problem.rule.padEnd(width)}  ${problem.detail}`);
}
console.log(`\ncheck-ui: ${problems.length} incidencias en ${sourceFiles.length} ficheros.`);
process.exit(1);
