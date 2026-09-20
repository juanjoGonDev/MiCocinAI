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
  'sin-emoji': [
    'frontend/src/app/core/services/i18n.service.ts',
    'frontend/src/app/features/ai-config/ai-config.component.ts',
    'frontend/src/app/features/dashboard/dashboard.component.ts',
    'frontend/src/app/features/household/household.component.ts',
    'frontend/src/app/features/invite/invite.component.ts',
    'frontend/src/app/features/onboarding/onboarding.component.ts',
    'frontend/src/app/features/pantry/pantry.component.ts',
    'frontend/src/app/features/preferences/preferences.component.ts',
    'frontend/src/app/features/recipes/recipes.component.ts',
    'frontend/src/app/features/settings/settings.component.ts',
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
  // Y los construidos a voleo ([attr.data-test]="option.value === 'done' ? 'tab-done' : null"):
  // se coge cualquier literal de la linea, porque el nombre entero no aparece nunca escrito.
  for (const line of text.split('\n')) {
    if (!line.includes('data-test')) continue;
    for (const match of line.matchAll(/'([a-z0-9-]{3,})'/g)) dataTestInFrontend.add(match[1]);
  }
}

const known = [...dataTestInFrontend];
const matchesAnything = (name) =>
  known.some((candidate) => candidate === name || candidate.startsWith(name) || name.startsWith(candidate));

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

// --------------------------------------------------------------------------------
for (const [rule, files] of stale) {
  for (const file of files) {
    if (!touched.get(rule)?.has(file)) {
      console.log(`check-ui: ${file} ya no incumple '${rule}': quitalo de la lista de deuda.`);
    }
  }
}

if (problems.length === 0) {
  console.log(`check-ui: ${sourceFiles.length} ficheros, 7 reglas, sin incidencias.`);
  process.exit(0);
}

const width = Math.max(...problems.map((problem) => problem.rule.length));
for (const problem of problems) {
  console.log(`${problem.file}:${problem.line}  ${problem.rule.padEnd(width)}  ${problem.detail}`);
}
console.log(`\ncheck-ui: ${problems.length} incidencias en ${sourceFiles.length} ficheros.`);
process.exit(1);
