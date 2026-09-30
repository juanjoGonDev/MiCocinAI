# Spec: auditoría funcional y responsive de HogarIA

- **Estado:** inventario inicial hecho; cola de tickets/Hogar, tarjeta móvil de hogar, cabecera móvil de Inventario y comidas pendientes de hoy ya tienen regresiones verificadas; el barrido funcional/responsive del resto de pantallas sigue pendiente
- **Actualizado:** 2026-09-30

**Contrato de producto:** [`HOGARIA-SPEC.md`](./HOGARIA-SPEC.md)

Esta spec convierte la petición de revisar toda la app en una lista verificable. No presupone que las pantallas funcionan porque exista un test: cada casilla se marca después de probar el comportamiento en el navegador y guardar evidencia reproducible.

## Alcance y fuente de verdad

- Se revisan las rutas y pantallas que existen hoy, sus formularios, botones, estados vacíos/de error, navegación, persistencia y diseño responsive.
- Para lo que existe hoy mandan `frontend/src/app/app.routes.ts`, las rutas/componentes de cada feature y el comportamiento observado. `HOGARIA-SPEC.md` define las decisiones de producto activas; documentos históricos no sustituyen al código actual.
- No se añaden funcionalidades nuevas solo porque aparezcan en una spec antigua. Si código, texto de interfaz y contrato activo discrepan, primero se anota y decide la conducta esperada.
- Cada casilla cerrada debe enlazar a un test o anotar comando, navegador, datos y resultado. Una lista de tests enumerada no equivale a una lista ejecutada.

## Unidad QA-UI.1 · panel de cola de tickets y glifos de Hogar (resuelta)

**Fuente revalidada antes de implementar:** `ReceiptQueueComponent` se monta en la cabecera móvil y dentro de `.sidebar__header` en escritorio. Su `.rq__panel` es `position:absolute; right:0`, de modo que el panel de 380 px se ancla hacia dentro del lateral de 280 px y el contenido se recorta; `tests/e2e/receipts.spec.ts` solo afirma visibilidad/contenido, no límites geométricos. `HOGARIA-SPEC.md` §7 y `scripts/check-ui.mjs` regla `sin-emoji` respaldan usar el sistema SVG ya existente (`IconComponent`); el diccionario/pantalla de Hogar y los slots decorativos de Dashboard aún usan emojis. Se conservan explícitamente los emojis de contenido de alergias, gustos y catálogo de ingredientes que el usuario indicó que prefiere. Esta unidad cubre la cola y la iconografía decorativa de Hogar y Dashboard, no da por migrada la deuda de emoji de las demás pantallas.

- [x] Añadir primero una regresión Playwright que abra la cola vacía y mida el panel real en Chromium escritorio y Pixel 5; reproducir que el panel queda recortado/pegado al lateral antes del arreglo.
- [x] Posicionar el panel de la cola junto al disparador sin clipping del lateral ni del viewport; verificar límites, scroll si la lista crece y cierre con Escape en escritorio y móvil.
- [x] Añadir primero la regresión Playwright visual de Hogar: el baseline debe mostrar el `app-icon` ausente en el estado vacío y el emoji dentro del nombre accesible de «Copiar enlace».
- [x] Añadir primero la regresión Playwright de Dashboard: el baseline renderiza cero `app-icon` en los cuatro resúmenes, las tres acciones y los estados vacíos.
- [x] Retirar los emojis de presentación de Hogar (título, estado sin hogar, compartir, copiar, regenerar, salir) y los emojis de los resúmenes, CTA y vacíos decorativos de Dashboard; usar `app-icon` SVG existente, mantener textos ES/EN limpios y preservar la felicitación textual sin iconografía añadida.
- [x] Verificar con E2E que las acciones de invitación siguen siendo accesibles/funcionales y que las etiquetas no incorporan emoji; preservar intactos los emojis semánticos de alergias, gustos e ingredientes.
- [x] En móvil, mantener el enlace de invitación y sus acciones de copiar/regenerar dentro de la tarjeta a 393 y 320 px, sin clipping ni overflow horizontal.
- [x] Guardar e inspeccionar capturas sintéticas de PC y móvil; ejecutar pruebas focales, typecheck, `check-ui` y build con evidencia reproducible, sin rebajar gates.

**Evidencia visual inicial:** la captura facilitada por el usuario muestra el panel de cola recortado dentro del lateral y pictogramas de familia/copia en Hogar; la reproducción de Playwright se registra a continuación.

**TDD rojo (2026-09-30, sin cambios de producción):** `receipt-queue-panel-layout.spec.ts` con el runner aislado `%TEMP%\hogaria-e2e-runner-audit.mjs`, `E2E_SCOPE=all`, `E2E_RATE_LIMIT=on`, DB/puerto/semilla únicos; el runner detuvo el servidor y conservó los artefactos de los casos rojos. Chromium escritorio falla el límite izquierdo (panel `x=-117`, viewport 1280); Pixel 5 falla igual (`x=-71`, viewport 393). En la primera iteración móvil el locator `:visible` resolvió también el disparador de la sidebar trasladada fuera de pantalla; el test se corrigió para elegir `.header`/`.sidebar` por breakpoint y luego reprodujo el defecto geométrico real.

`household-icon-consistency.spec.ts` reprodujo rojo en Chromium con `E2E_SCOPE=all`, `E2E_PROJECT=chromium`, rate limit activo y el mismo runner aislado: **3 fallos esperados**. El estado vacío no contiene `app-icon`; la vista de hogar muestra «👨‍👩‍👧‍👦 Hogar» y falla al buscar «Copiar enlace» exactamente (el emoji del diccionario integra el nombre accesible). Dashboard devuelve cero `app-icon` donde el test espera 4 resúmenes, 3 acciones, el icono de miembros y los vacíos. Cada ejecución usa su propia DB temporal y el runner conserva screenshots/logs de fallo.

**Regresión móvil adicional (TDD rojo → verde, 2026-09-30):** la captura sintética de hogar a 393 px mostró el URL de invitación sobrepasando la tarjeta y las acciones fuera de pantalla. El test geométrico real de Pixel 5 midió el borde del enlace en x=488 px mientras la tarjeta terminaba en x=377 px; el check del documento no lo detectaba porque la vista limita el ancho exterior. Tras registrar el rojo, la tarjeta refluye en móvil y el enlace/acciones quedan dentro a 393×851 y 320×568; ambos tamaños pasan la aserción de geometría.

**Evidencia verde QA-UI.1 (2026-09-30):** `computeReceiptQueuePanelPosition` + `IconComponent` en Karma: 11/11; coverage focal Statements 100 %, Branches 80 %, Functions 100 %, Lines 100 % (gate existente del 80 % intacto). `tsc -p tsconfig.e2e.json --noEmit` pasa usando el compilador local y `npm run build:prod` compila. Playwright aislado con rate limit activo, SQLite/puerto/semilla temporales: `receipt-queue-panel-layout.spec.ts` + `household-icon-consistency.spec.ts`, Chromium 5/5 y Pixel 5 5/5; `household.spec.ts` + `receipts.spec.ts`, Chromium 7/7 y Pixel 5 7/7. La cola se mide fuera del lateral, sobrevive a resize/rotación 568×320, permite scroll real con diez tickets sintéticos en 320×568 y cierra con Escape. Copiar verifica el clipboard real y Regenerar cambia el enlace; el texto de accesibilidad no incluye glifos. Capturas inspeccionadas en `.e2e-screenshots/qa-ui-1-desktop/` y `.e2e-screenshots/qa-ui-1-mobile/` (incluye 320×568 y 568×320).

`node scripts/check-ui.mjs` sigue terminando con 13 incidencias preexistentes de `texto-en-un-catalogo` en `frontend/src/app/core/i18n/labels.ts:345-358` (deuda QA-05, fuera de esta unidad); no reporta emoji en los ficheros Hogar/Dashboard migrados. El ESLint directo no tiene configuración en la raíz y `ng lint` está bloqueado porque falta `@angular-eslint/builder:lint`; no se alteró configuración ni dependencias para ocultarlo. `git diff --check` pasa. Build de producción aprobado con los warnings existentes de budgets e imports opcionales/no usados; no se modificaron gates.

**Revalidación de los dos hallazgos de las capturas (2026-09-30):** las imágenes aportadas muestran el estado anterior a `4a751bb`. Sobre el build de producción actual, Playwright aislado volvió a verificar cola de tickets + iconografía de Hogar/Dashboard: Chromium 5/5 y Pixel 5 5/5, con DB/puerto/semilla temporales, rate limit activo y cleanup. Hogar mantiene nombre limpio, iconos SVG, copiar/regenerar funcionales y emojis semánticos de Preferencias intactos; el panel de tickets queda visible fuera del lateral y dentro del viewport. Capturas PC/móvil inspeccionadas: `.e2e-screenshots/qa-ui-confirm/current-desktop/receipt-queue-panel.png`, `.e2e-screenshots/qa-ui-confirm/current-mobile/receipt-queue-panel-320x568.png`, `.e2e-screenshots/qa-ui-confirm/current-desktop/household-members.png` y `.e2e-screenshots/qa-ui-confirm/current-mobile/household-members-es-320x568.png`. La búsqueda del código actual encontró otros pictogramas decorativos fuera de esta unidad; se inventarían por separado en QA-UI.3.

## Unidad QA-UI.1b · panel de tickets separado del lateral (reabierta)

**Motivo de reapertura:** el usuario ha vuelto a señalar que el panel del icono de tickets se ve «metido en el lateral». La captura adjunta refleja el recorte del estado previo a `4a751bb`; no se tratará como evidencia del build actual. La revalidación del código sí encontró un defecto geométrico más pequeño que sobrevivió a QA-UI.1: `computeReceiptQueuePanelPosition()` posiciona el borde izquierdo con `anchor.left`, y `receipt-queue-panel-layout.spec.ts` solo exige que el borde derecho exceda el lateral. En escritorio el disparador está aproximadamente en `x=224`, el panel tiene 380 px y el lateral 280 px: el panel aún invade 56 px del lateral aunque ya no se recorte.

**Conducta esperada:** al abrir desde el lateral de escritorio, el panel queda completamente fuera de este con un pequeño espacio visual, sin perder límites de viewport. En móvil, el disparador de la cabecera mantiene el panel íntegro dentro del viewport; revisar además la instancia del menú móvil, dado que `.sidebar` se transforma y puede cambiar el bloque contenedor de `position: fixed`. Si esa instancia duplica una acción ya disponible en la cabecera o no puede funcionar sin solapamiento, resolverlo de acuerdo con la fuente de verdad actual antes de implementar.

- [x] Añadir primero una regresión geométrica que exija `panel.left >= sidebar.right + gap` al usar el disparador lateral a 1024 y 1440 px; reproducir el solapamiento actual en Playwright real, sin `force`.
- [x] Probar el disparador visible de cabecera en 393×851, 320×568 y 568×320; comprobar posición, cierre con Escape y scroll real sin salir del viewport. Abrir también el menú móvil y medir qué instancia de cola es alcanzable, sus límites y su bloque de posicionamiento.
- [x] Corregir la colocación mínima para que el panel no se solape con el lateral en escritorio; resolver explícitamente la instancia del menú móvil sin ocultar o duplicar una acción necesaria.
- [x] Añadir/ajustar pruebas unitarias de los límites y casos de viewport estrecho; coverage focal ≥70 % en statements, branches, functions y lines. Ejecutar Playwright real en Chromium escritorio y Pixel 5 sobre fixture aislada.
- [x] Guardar e inspeccionar capturas sintéticas PC y móvil; registrar build/typecheck y errores de consola. No usar escritura contra el servidor/base normal de `localhost:4200`.

**TDD rojo (2026-09-30):** se fortaleció `receipt-queue-panel-layout.spec.ts` y la prueba aislada real de Chromium falló contra la posición actual: en 1440 px el panel comenzaba en `x=219`, el lateral terminaba en `x=280` (solapamiento de 61 px). La E2E anterior pasaba porque solo exigía que el borde derecho del panel sobrepasara el lateral. Karma también reprodujo el límite ausente: el helper devolvía `left=224` donde se requiere `left>=288`.

**Corrección y evidencia verde:** el helper recibe el borde derecho del lateral y coloca el panel `8px` después cuando hay ancho suficiente; en viewports estrechos vuelve a priorizar caber íntegro en pantalla. No se cambia la colocación del icono de cabecera. La instancia accesible desde el cajón móvil también se abrió y midió; a 320 px el panel queda dentro de viewport y se cierra con Escape, solapando el cajón como overlay porque no existe espacio horizontal para abrirlo a su derecha.

`receipt-queue-position.spec.ts`: Karma **6/6**, coverage focal del helper **100/100/100/100 %** (statements/branches/functions/lines). `tsc -p tsconfig.e2e.json --noEmit`, `git diff --check`, Prettier focal y build Angular production pasan; el build mantiene warnings preexistentes de presupuesto/imports sin usar. Playwright real con `E2E_SCOPE=all`, rate limit activo, runner efímero y `DATABASE_PATH` verificado bajo `%TEMP%`: `receipt-queue-panel-layout.spec.ts`, Chromium escritorio **2/2** y Pixel 5 **2/2**. Desktop comprueba 1024/1440 px; Pixel 5 comprueba 393×851, 320×568, 568×320, 10 tickets sintéticos con scroll y el cajón móvil. E2E vigila page errors, consola del origen de la app y fallos de red propios: **0**; el entorno puede bloquear Google Fonts de terceros (limitación ya anotada en baseline). El preflight común todavía sondea `/main.js`, `/polyfills.js`, `/styles.css` y recibe 404; el bundle hashed de la app carga y las pruebas pasan. Capturas sintéticas inspeccionadas: `.e2e-screenshots/qa-ui-1b/final-desktop/receipt-queue-panel.png`, `.e2e-screenshots/qa-ui-1b/final-mobile/receipt-queue-panel-320x568.png` y `receipt-queue-panel-drawer.png`. No se usó `localhost:4200` con autenticación o escrituras. Rollback: revertir la unidad atómica que contiene el helper/consumidor, sus pruebas y esta sección de spec.

## Unidad QA-UI.2 · geometría de tarjeta de miembro en móvil (resuelta)

**Fuente revalidada antes de esta unidad:** `HouseholdComponent` dibuja `.member-card` como fila flex y `.member-card__meta` como otra fila sin reflujo específico móvil. La captura sintética `household-members.png` de QA-UI.1 parece mostrar las insignias de rol/nivel cerca o más allá del borde derecho de la tarjeta; la imagen por sí sola no confirma un defecto. Medir geometría con el navegador antes de cambiar estilos.

- [x] Escribir primero una regresión Playwright que mida los límites reales de `.member-card`, nombre/email y `.member-card__meta` en Pixel 5 a 393×851 y 320×568; registrar el baseline y confirmar si existe desbordamiento horizontal/clipping.
- [x] Usar datos sintéticos de nombre/email y etiquetas largas en español e inglés; exigir que las insignias permanezcan dentro de la tarjeta y que no haya overflow horizontal del documento.
- [x] Solo si el rojo reproduce el problema, aplicar el reflujo mínimo con TDD; mantener legibles los datos, estados accesibles y áreas táctiles.
- [x] Verificar la regresión en Chromium escritorio y Pixel 5, capturar/inspeccionar PC y móvil y registrar comandos/resultados sin tocar servidor ni base normales.

**TDD rojo (2026-09-30, sin cambios de producción):** runner aislado `E2E_SCOPE=all`, `E2E_PROJECT=mobile-chrome`, `E2E_FILES=household-icon-consistency.spec.ts`, `E2E_RATE_LIMIT=on`: Pixel 5 pasa a 393×851 y falla a 320×568. Con el fixture inicial, `.member-card__meta` llegó a x=371 px mientras `.member-card` terminaba en x=304 px; endurecí después el escenario con un nombre sintético largo y el borde de las insignias aún llegó a x=360 px (56 px fuera). El documento no se ensancha, por lo que el desborde local quedaba oculto/clipeado. En la ejecución reforzada, el resto del test de esta pantalla y Dashboard pasa (2 passed, 1 failed); cada corrida usa servidor, SQLite y semilla temporales únicas.

**Evidencia verde QA-UI.2 (2026-09-30):** `HouseholdComponent` refluye la fila de miembro a una rejilla de dos columnas en móvil; la columna de texto tiene ancho mínimo cero y nombre/correo pueden partirse, mientras las insignias ocupan una segunda fila. La regresión mide documento, columna, correo y tarjeta a 393×851 y 320×568 con nombre sintético largo en español e inglés. Tras `npm run build:prod` (el runner aislado sirve el bundle estático existente y no recompila Angular), `tsc -p tsconfig.e2e.json --noEmit` pasa; Playwright aislado con `E2E_RATE_LIMIT=on`, SQLite/puerto/semilla temporales: `household-icon-consistency.spec.ts`, Pixel 5 **3/3** y Chromium escritorio **3/3**. Capturas inspeccionadas: `.e2e-screenshots/qa-ui-2-desktop/household-members.png` y `.e2e-screenshots/qa-ui-2-mobile/household-members-{es,en}-{320x568,393x851}.png`. No se usaron el server ni la base de datos normales.

## Unidad QA-UI.3 · coherencia de iconos fuera del contenido semántico (en curso)

**Fuente revalidada antes de implementar:** el sistema SVG local es `IconComponent` + `IconName`, declarado por `frontend/src/app/shared/components/ui/icon/icon-paths.ts`. El generador es `frontend/scripts/icons.mjs` (no `scripts/icons.mjs`) y espera `frontend/node_modules/@material-icons/svg/svg`; esa fuente no está instalada en este entorno, así que no regenerar ni añadir dependencias sin encontrar una fuente local verificable. Preferir nombres SVG ya registrados; si no hay equivalente adecuado, quitar el ornamento y dejar texto limpio antes que inventar un icono.

El barrido actual encontró pictogramas decorativos en controles compartidos, Auth/Onboarding/Invitación, Configuración IA, Configuración, Recetas e Inventario. Clasificación explícita: se preservan los emojis de contenido de `COMMON_ALLERGENS`, `COMMON_LIKES` y `COMMON_DISLIKES` en `shared/models/taste-profile.ts`, que el usuario aprobó para alergias/gustos, y los emojis de las categorías alimentarias `ingredientCategoriesNoAll` de `features/pantry/pantry.component.ts` (verduras, fruta, carne, pescado, lácteos, etc.), que el usuario indicó que le gustan en Ingredientes; se verificará que sigan visibles en filtros/filas. También se preservan los marcadores 👍/👎 con semántica de las elecciones «Me gusta/Mejor no» del onboarding; se migran los iconos de objetivos que comparten ese archivo. El 📋 de «Todas las categorías» no identifica comida: puede pasar a SVG/texto limpio. Se limpia el 👍 decorativo de copy de invitación. No cambiar emojis escritos por usuarios ni texto dinámico de recetas/consejos/advertencias: solo sustituir prefijos decorativos controlados por la plantilla.

**Decisión de diseño:** una acción, navegación, categoría, estado, métrica, título o estado vacío usa `app-icon` decorativo y texto accesible independiente; si falta icono local, se conserva el significado mediante texto, no emoji. Los nombres accesibles no deben incluir glifos ornamentales.

### QA-UI.3a · controles compartidos

- [x] Añadir primero unit tests para chip-select, toggle de contraseña, toast y `DifficultyPipe`: emoji de catálogo de Preferencias sigue visible pero se marca decorativo; opción personalizada usa SVG; mostrar/ocultar contraseña funciona en ciclos repetidos por click y teclado con nombre ES/EN, icono que refleja la acción, no revela controles deshabilitados y vuelve a ocultar si se deshabilita cuando ya estaba visible; cada tipo de toast anuncia su texto mediante una región viva y usa icono SVG distinguible; la pipe no añade emoji.
- [x] Corregir el botón de contraseña que desaparece tras mostrarla; usar los `IconName` disponibles y labels localizados, conservar el contrato externo del input y deshabilitar/resetear el toggle y su campo cuando se deshabilite. Dar a success/error/warning/info semántica viva adecuada, conservar cierre accesible y diferenciar error de warning con un símbolo inequívoco del registro local, sin añadir dependencia ni emoji.
- [x] Validar cobertura focal ≥70 % en statements/branches/functions/lines, typecheck y build; Playwright de Auth en Chromium y Pixel 5 confirma visibilidad repetible/teclado, estado visual correcto y nombres limpios.

**Hallazgos de revisión y resolución:** `disabled` podía cambiar de `false` a `true` después de revelar la contraseña y ahora resetea la visibilidad tanto por `@Input` como por ControlValueAccessor; `notifications` era una campana genérica y se sustituyó por el `sync_problem` local, que representa un problema con exclamación. La segunda revisión read-only confirmó ambos arreglos y no encontró nuevos P1/P2/P3.

**Evidencia QA-UI.3a (2026-09-30):** TDD rojo inicial: Karma focal 56 tests, 52 pasan y 4 regresiones fallan. La revisión detectó después el caso visible→disabled y que una campana no denota precaución; su follow-up rojo fue 45 tests, 43 pasan y 2 regresiones fallan. Verde: `node ./node_modules/@angular/cli/bin/ng.js test --no-watch --browsers=ChromeHeadlessNoSandbox --include=src/app/shared/components/ui/input/input.component.spec.ts --include=src/app/shared/components/ui/chip-select/chip-select.component.spec.ts --include=src/app/shared/components/ui/toast/toast.component.spec.ts --include=src/app/shared/pipes/difficulty.pipe.spec.ts --code-coverage` pasa **56/56**. Cobertura focal S/B/F/L: `input.component.ts` 98.38/100/88.23/98.18 %, `chip-select.component.ts` 97.77/92.85/100/100 %, `toast.component.ts` y `difficulty.pipe.ts` 100/100/100/100 %. `tsc -p tsconfig.e2e.json --noEmit` y build de producción pasan; build conserva avisos preexistentes de budgets/imports no usados. `node scripts/check-ui.mjs` devuelve 13 incidencias conocidas únicamente en `core/i18n/labels.ts:345-358`; no señala los ficheros migrados. Playwright real con `$env:E2E_SCOPE='all'`, `$env:E2E_RATE_LIMIT='on'`, `$env:E2E_FILES='tests/e2e/password-visibility.spec.ts'`, `$env:E2E_PROJECT={chromium|mobile-chrome}` y runner `%TEMP%\hogaria-e2e-runner-audit.mjs` usa server/puerto/semilla/SQLite temporales y no envía el formulario: Chromium **1/1**, Pixel 5 **1/1**. Verifica 320×568, 393×851, 568×320 y 1440×900, teclado Enter/Space, ciclos de visibilidad, ocultamiento al deshabilitar, nombre ES/EN, icono/diagonal CSS visible, target ≥44 px, bounds y errores de primera parte. El preflight común sondea `/main.js`, `/polyfills.js`, `/styles.css` y devuelve 404; el bundle hashed carga y el E2E pasa. Capturas sintéticas inspeccionadas: `.e2e-screenshots/qa-ui-3a/password-toggle-desktop.png` y `password-toggle-mobile.png` (ignoradas por Git; formulario sin datos personales). Rollback: revertir el commit atómico de QA-UI.3a elimina la migración de controles compartidos, sus tests, traducciones localizadas, limpieza de allowlist y evidencia asociada sin tocar unidades ajenas.

### QA-UI.3b · Auth, onboarding e invitación

- [x] Añadir regresiones antes de cambiar logo/objetivos; SVG casa decorativo sin contaminar títulos, retirar 👍 de copy de invitación y usar SVG para iconos de objetivo, sin cambiar semántica 👍/👎 de opciones de gusto.
- [x] Probar rutas públicas/invitación válida e inválida, pasos de onboarding y guardado/salto/retroceso en ES/EN; los emojis de alergias/gustos siguen visibles. Medir 320/393 px, viewport corto y horizontal, controles/foco/teclado.
- [x] Ejecutar Playwright real en escritorio y Pixel 5, capturar e inspeccionar PC+móvil y revisar errores de consola.
- [x] Hallazgo E2E: en móvil el navegador rechaza `ViewTransition.ready` (`InvalidStateError`) al redimensionar o fallar el prepaint; capturar ese rechazo y llamar `skipTransition()` para que la capa visual no siga interceptando controles. No ocultar errores de navegación.
- [x] Hallazgo Pixel 5: las pestañas de Preferencias desbordan el viewport (`scrollWidth=792` frente a `clientWidth=393`) y empujan a la derecha el contenido y los controles; mantener el documento dentro del ancho móvil y comprobar que se pueden pulsar pestañas/objetivos en 320/393 px y horizontal.
- [x] Hallazgo Pixel 5: el grid de horarios y el pie flex de acciones vuelven a desbordar el documento en Preferencias y hacen fallar los toques; apilar/ajustar filas y pie al ancho móvil, y validar input, «Por defecto», checkbox y guardado con la barra inferior presente.

**Evidencia QA-UI.3b (2026-09-30):** rojo E2E reprodujo pictogramas decorativos en Auth/Onboarding/Invitación, el rechazo de `ViewTransition.ready` y el overflow de Preferencias a 393/320 px y viewport horizontal. Verde: `auth-onboarding-icons.spec.ts`, Playwright real aislado en Chromium **3/3** y Pixel 5 **3/3**; `onboarding.spec.ts`, Chromium **6/6** y Pixel 5 **6/6**. Las corridas usan puerto/SQLite/semilla únicos, rate limit activo y cleanup; validan login/register/forgot-password e invitaciones válida/inválida, idioma ES/EN, SVGs y nombres accesibles, comida 🍗/🌾/🫀 conservada, seis pasos, preferencias, horarios, teclado y persistencia. Pixel 5 cubre 393×851, 320×568 y 568×320 sin overflow; navega pestañas, edita/restaura una hora, guarda y recarga preferencias.

`view-transition-utils.spec.ts` + `taste-profile.spec.ts`: Karma **6/6**, cobertura focal S/B/F/L **100/100/100/100 %** (gate global 80 % intacto). Build production, `tsc -p tsconfig.e2e.json --noEmit`, Prettier focal y `git diff --check` pasan. Capturas sintéticas revisadas: `.e2e-screenshots/qa-ui-3b/final-desktop-verified/{auth-login-chromium.png,onboarding-goals-1440x900.png,preferences-meals-1440x900.png}` y `.e2e-screenshots/qa-ui-3b/final-mobile-verified/{auth-login-mobile-chrome.png,onboarding-goals-320x568.png,onboarding-goals-393x851.png,onboarding-goals-568x320.png,preferences-meals-320x568.png,preferences-meals-393x851.png,preferences-meals-568x320.png}`. Se quitaron cuatro excepciones `sin-emoji` obsoletas del guardián y sus fixtures de test ya no se consideran interfaz; `check-ui` aún reporta solo las 13 deudas conocidas `texto-en-un-catalogo` en `core/i18n/labels.ts:345-358`. Rollback: revertir el commit atómico de QA-UI.3b restaura la navegación visual/íconos y el layout mobile, más sus pruebas y evidencia.

### QA-UI.3c · Configuración IA y Configuración

**Fuente revalidada y baseline (2026-09-30, antes de tocar producción):** `/ai-config` y `/settings` son rutas lazy-loaded. `AiConfigComponent` dibuja `🤖` en vacío y resultado de prueba (`✅`/`❌`); `ai_config.ts` añade emojis a título, botones y copy. `settings.ts` añade banderas a idioma, y emojis a título, tema y módulos. Los breakpoints vigentes en el código son `ai-config` 480/600/768 px y Settings 480 px. `AiService` guarda, edita, elimina y prueba mediante `/api/ai/*`; `ModulesService` aplica de forma optimista y revierte cambios al fallar el guardado.

Baseline aislada con `%TEMP%\hogaria-e2e-runner-audit.mjs`, `E2E_SCOPE=all`, `E2E_RATE_LIMIT=on`, puerto/SQLite/semilla únicos: `settings-modules.spec.ts` + `settings-theme-i18n.spec.ts`, Chromium **12/12**, Pixel 5 **12/12**. `ai-config.spec.ts`, Chromium **8/9**: el test «probar desde el formulario» esperaba éxito pero recibió error. El runner registró `POST /api/ai/test-connection 200` desde el backend durante el caso, señal de que el `page.route()` fixture no interceptó la petición en el build de producción (que registra el service worker); revalidar/bloquear service workers en ese spec y afirmar que la respuesta simulada se usó antes de interpretar el resultado como fallo del producto. Los otros ocho casos IA pasan. `ModulesService` ya tiene cobertura unitaria focal de rollback/reintento, pero Settings no tiene pruebas de componente. Aún no hay regresión Playwright para los glifos de estas pantallas ni comprobación de bounds/capturas responsive.

**Hallazgos read-only revalidados en fuente para ampliar criterios:** `AiService` emite `null`/`false` ante error HTTP y los `next` de `AiConfigComponent` lo confunden con éxito; `loadConfigs()` traga el error y la plantilla representa el `[]` como pantalla vacía; `testConfig()` no actualiza la insignia persistida; el modal de resultado usa `[attr.title]` aunque `ModalComponent` recibe `[title]`; proveedor/temperatura no tienen labels asociadas; el helper de URL solo está en español. Tema/idioma solo exponen clase visual activa, el reset de módulos no se deshabilita al guardar y el aviso de error no es live region. En móvil `.form-actions` no permite wrap. El interceptor común ofrece `SILENT_TOAST` para peticiones con error mostrado por pantalla propia; verificar que IA no muestre un aviso genérico duplicado junto a su error contextual.

**TDD rojo adicional (2026-09-30):** al comprobar el requisito de teclado/foco en el diálogo de IA, el nuevo caso Playwright pasa **17/18** y falla porque el `role="dialog"` no declara `aria-modal`; la prueba unitaria de `ModalComponent` pasa **16/18**, reproduciendo además que el foco no entra en el diálogo y que `Tab`/`Shift+Tab` escapan de sus límites. La prueba se escribió antes de corregir el componente compartido.

- [ ] Añadir primero regresiones para vacío/resultado/acciones de IA y títulos/opciones de Configuración en ES/EN; migrar robots, estados, acciones, título, módulos/tema a iconos SVG y eliminar banderas de las etiquetas de idioma.
- [ ] Verificar formulario IA inválido, creación/edición (sin exponer ni reemplazar la clave al dejarla vacía), activar/desactivar en exclusiva, probar desde formulario y tarjeta (éxito/error/insignia actualizada), eliminar con confirmación, cancelar y fallos de red sin falsos éxitos ni toasts duplicados; el modal de resultado tiene título accesible y campos proveedor/temperatura etiquetas asociadas.
- [ ] Diferenciar carga de configuraciones vacía/cargando/fallida; al fallar no mostrar «Sin configuraciones» como si el backend confirmara vacío y ofrecer reintento accesible.
- [ ] Verificar persistencia y semántica accesible de idioma/tema/módulos; el botón restablecer no compite con un guardado en curso y los errores se anuncian. El diálogo de IA declara `aria-modal`, mueve el foco dentro, confina `Tab`/`Shift+Tab` y restaura el foco al disparador al cerrar; mantener los demás controles operables con teclado/foco y objetivos táctiles adecuados.
- [ ] Medir bordes 320/393, 480/481, 600/601, 768/769 y orientación horizontal; formulario/modal, sus acciones y documento permanecen dentro del viewport y se pueden recorrer con teclado.
- [ ] Ejecutar Playwright real en Chromium y Pixel 5, capturar e inspeccionar PC+móvil; cobertura focal ≥70 % en las métricas aplicables.

### QA-UI.3d · Inventario y Recetas

- [ ] Añadir primero regresiones para vacíos/categorías/favorito/porciones/filtros/tips/advertencias; migrar solo glifos decorativos. Preservar y probar los emojis semánticos de alergias/gustos y de las categorías alimentarias mostradas en Ingredientes. Remover metadatos de emoji no usados; mantener el selector nativo entendible sin emoji y no alterar contenido de receta escrito/generado.
- [ ] Verificar acciones de Inventario y Recetas con fixtures sintéticas en ES/EN, incluidos estados vacíos y cargados, 320/393 px, breakpoints del código y orientación horizontal; no debe haber glifos en iconos/nombres accesibles.
- [ ] Ejecutar Playwright real en Chromium y Pixel 5, revisar errores de consola, capturar e inspeccionar PC+móvil y validar cobertura focal ≥70 % en las métricas aplicables.

### QA-UI.3e · guardia estática y cierre

- [ ] Probar primero la guardia estática: detecta emoji decorativo en cualquier fuente de UI/diccionario, permite únicamente el contenido semántico aprobado y falla si se añade emoji decorativo junto a esos datos; no mantener excepciones por archivo completo.
- [ ] Retirar allowlists heredadas que oculten pictogramas en los ficheros ya migrados, preservar explícitamente las excepciones de contenido aprobadas y comprobar `node scripts/check-ui.mjs`.
- [ ] Ejecutar build, typecheck, unit tests focales, `check-ui`, Playwright real de todas las superficies afectadas en Chromium y Pixel 5; registrar cobertura y limitaciones sin rebajar gates existentes.

## Unidad QA-DASH.1 · comidas pendientes de hoy en el Dashboard (resuelta)

**Fuentes revalidadas antes de implementar:** el contrato activo `HOGARIA-SPEC.md` §2 define Today con comidas debidas y §12al pide la siguiente comida planificada. `DashboardComponent.upcomingMeals` empezaba como `[]` y no se actualizaba; `loadDashboardData()` llamaba a `CalendarService.loadCalendar()` sin conectar la respuesta con «Comidas de hoy». `CalendarService.loadRange(start, end)` y `CalendarMeal` ya normalizan la carga.

**Decisión de comportamiento:** el bloque mostrará las comidas no completadas de la fecha local de hoy, ordenadas por hora; no debe mostrar como «pendiente» una comida completada ni una comida de otro día. Un error de carga no se presentará como «no hay comidas».

- [x] Escribir primero la regresión Playwright con comidas sintéticas de hoy/ayer/mañana, pendiente y completada; el baseline previo carecía de render de comidas y estados de carga/error. Al inicio `page.route()` no interceptaba por el service worker Angular; bloquear workers hizo determinista el test. El caso devuelve 503 en la primera carga y comprueba que no aparezca el vacío; todas las fixtures se crean y cada borrado se intenta en `finally` contra SQLite aislada. El test vigila `/api/ai/*` y confirma cero llamadas.
- [x] Conectar el Dashboard a `CalendarService.loadRange()` para la fecha local, sin duplicar cliente HTTP; ordenar pendientes por hora, localizar tipo, mostrar título/hora, mantener carga/error/reintento separados y enseñar el vacío solo después de una carga correcta.
- [x] Añadir pruebas unitarias focales para orden estable, fecha local, fecha/completado y etiquetas ES/EN. `dashboard-meals.util.ts` alcanza 100 % statements/branches/functions/lines; el agregado de la ejecución enfocada (incluye dependencias) queda en 65.71/40.54/55.55/67.74 %, por debajo del gate global, que continúa abierto en QA-04c. El alcance de cobertura del helper está al 100 %; no se presenta el agregado ni el gate global como cerrados.
- [x] Verificar CTA «Ver todo» a `/calendar`, recarga, primer error 503 (sin estado vacío), error tras datos, reintento y vacío después de limpiar; probar el nombre accesible, foco y Enter de «Reintentar». Probar cruce local/UTC fijando Playwright en `Europe/Madrid` a 2026-09-30 22:30Z (fecha local 1 oct, UTC 30 sep). Playwright aislado: Chromium 1/1 y Pixel 5 1/1. Pixel 5 cubre 320×568, 393×851, 479/480/481, 767/768/769 y 844×390; Chromium escritorio cubre 1440×900 y 1023/1024. Sin overflow/solapamiento del bloque ni errores JS.
- [x] `node ./node_modules/@angular/cli/bin/ng.js test --no-watch --browsers=ChromeHeadlessNoSandbox --include=src/app/features/dashboard/dashboard-meals.util.spec.ts --code-coverage` (frontend): 3/3; `node ./node_modules/@angular/cli/bin/ng.js build --configuration production`: éxito con warnings preexistentes; `node ./node_modules/typescript/bin/tsc -p tsconfig.e2e.json --noEmit`: éxito. Playwright: `$env:E2E_SCOPE='all'; $env:E2E_RATE_LIMIT='on'; $env:E2E_FILES='dashboard-today-meals.spec.ts'; $env:E2E_PROJECT='chromium'` y después `mobile-chrome`; `node (Join-Path $env:TEMP 'hogaria-e2e-runner-audit.mjs') (Get-Location).Path`: 1/1 en cada proyecto, cada uno con servidor, puerto, semilla y SQLite únicos temporales. Capturas sintéticas EN inspeccionadas: `.e2e-screenshots/qa-dashboard-1/desktop/dashboard-today-meals-1440x900.png` y `.e2e-screenshots/qa-dashboard-1/mobile/dashboard-today-meals-393x851.png`.

**Evidencia de regresión ampliada:** la suite Dashboard existente pasó 7/7 en Chromium; Pixel 5 pasó 6/7. El único fallo fue al hacer click en «+ Agregar» de `/pantry`: controles del encabezado/cabecera de cola interceptan el click (45 s). No lo causa el cambio aislado de Dashboard; queda desglosado en QA-PANTRY.1, sin ocultarlo como suite completamente verde.

**TDD rojo observado antes del cambio:** contra el bundle anterior, `dashboard-today-meals.spec.ts` falló porque el Dashboard no renderizaba comidas ni estados de carga/error. En la primera versión del test, el mock 503 no alcanzó la petición porque el service worker registrado la interceptaba; lo registré y corregí el setup con `serviceWorkers: 'block'` antes de usar el test como señal verde. Rollback de esta unidad: revertir conjuntamente `dashboard.component.ts`, `dashboard-meals.util.ts`, su spec unitario, `dashboard-today-meals.spec.ts` y esta sección QA-DASH.1.

**Discrepancias de producto abiertas (no se cierran en esta unidad):** `HOGARIA-SPEC.md` §2/§12al también pide vencimientos, lista abierta/presupuesto semanal y cola IA en Today; `DashboardComponent` actual no renderiza esos bloques. Mantener abierta la checklist general `/dashboard` y decidir cada superficie en su propia unidad, sin atribuirlas a esta corrección de comidas.

## Unidad QA-PANTRY.1 · alta manual accesible en móvil (resuelta)

**Fuente revalidada antes de implementar:** el comentario y `(onClick)="openAddModal()"` de `PantryComponent` definen «+ Agregar» como la acción que abre el modal de alta de la pestaña activa. `.pantry__header` distribuye título y `.pantry__header-acciones` con `flex`, pero la fila de acciones no declara `flex-wrap` ni un reflujo móvil; hay breakpoints cercanos en 480, 600, 768 y 1023 px que deben volver a comprobarse antes de tocar estilos. En Playwright Pixel 5, la prueba existente de Dashboard expiró al pulsar «+ Agregar»; el registro muestra interceptación alternada por `pantry-anadir-catalogo` y el botón de la cola de tickets en `header`. La captura sintética del fallo muestra la fila superior cortada/desplazada. Esto acredita un fallo de interacción real, pero todavía hay que medir límites y solapamientos en viewport, no inferir su geometría solo por la captura.

**Conducta esperada:** los tres controles de acción del encabezado permanecen visibles, no se superponen y son activables por toque/teclado; «+ Agregar» abre el alta de la pestaña activa. A 320 px debe ser posible operar sin overflow horizontal ni un control vecino capturando el puntero.

- [x] Crear pruebas unitarias de los dos destinos del CTA (ingredientes/utensilios) y Playwright de regresión que mida rectángulo/área, overflow del documento y elemento que recibe el puntero; reproducir la obstrucción sin `force`, con fixtures sintéticas y DB aislada.
- [x] Medir Chromium escritorio y Pixel 5 en 320×568, 393×851, 479/480/481, 599/600/601, 767/768/769, 1022/1023/1024 y orientación horizontal 568×320/844×390. Confirmar acciones dentro del viewport, hit testing real y objetivos ≥44×44 px.
- [x] Refluir solo el encabezado a ≤600 px y permitir que la fila de acciones envuelva; añadir el objetivo táctil opcional de 44 px a `app-button`. Verificar modal correcto por pestaña, activación Enter, destinos de caducidades/catálogo y ausencia de clicks interceptados.
- [x] Ejecutar prueba unitaria focal, E2E real Chromium/Pixel 5, build/typecheck y cobertura de las unidades de lógica tocadas ≥70 % en las cuatro métricas; conservar gates superiores existentes. Capturar e inspeccionar PC 1440×900 y móvil 393×851/320×568.
- [x] Repetir la suite Dashboard en ambos proyectos: 7/7 Chromium y 7/7 Pixel 5. No atribuir los demás hallazgos globales a esta unidad.

**TDD rojo (2026-09-30, sin cambio de producción):** Pixel 5 reveló ancho de documento 517 px a viewport 320 px y botones de 32 px de alto; `+ Agregar` falló un click real de 5 s porque el catálogo/cola recibían el puntero. El baseline de `pantry-header-actions.spec.ts` conserva capturas en `.e2e-screenshots/qa-pantry-1/baseline-mobile/`.

**Evidencia verde (2026-09-30):** Karma enfocado Button + Pantry 18/18; coverage HTML de `ButtonComponent` 100/100/100/100 (statements/branches/functions/lines). `PantryComponent.openAddModal()` cubre ambos destinos y las dos salidas de `prefill` (todos sus statements/branches/functions/lines ejecutados); el agregado de Karma de toda la app no representa el alcance y el gate global continúa abierto en QA-04c. Build Angular producción pasó con warnings de presupuesto/imports anotados; `tsc -p tsconfig.e2e.json --noEmit`, Prettier de los tests y `git diff --check` pasan.

Playwright real con `E2E_SCOPE=all`, rate limit activo, servidor de producción efímero, puerto/SQLite/semilla únicos y cleanup: `pantry-header-actions.spec.ts` Chromium 2/2 y Pixel 5 2/2. Pixel 5 recorrió 320×568, 393×851, límites 479/480/481, 599/600/601, 767/768/769, 1022/1023/1024, 568×320 y 844×390; Chromium recorrió 1440×900 y 1022/1023/1024. Sin overflow, solapamiento, acción fuera de viewport ni interceptación; errores JS = 0. Suite Dashboard combinada (`dashboard.spec.ts`, `dashboard-recipe-links.spec.ts`, `dashboard-today-meals.spec.ts`) 7/7 en Chromium y 7/7 en Pixel 5. Capturas inspeccionadas: `.e2e-screenshots/qa-pantry-1/final-desktop/pantry-header-1440x900.png`, `.e2e-screenshots/qa-pantry-1/final-mobile/pantry-header-{393x851,320x568}.png`.

## Evidencia inicial (no equivale a aprobación de la app)

- [x] La ruta pública `/auth/login` responde desde `http://localhost:4200`; revisé también `/auth/register`, `/auth/forgot-password` y la invitación inválida.
- [x] Barrido exploratorio sin sesión en 320, 360, 390, 430, 768, 1023, 1024 y 1440 px: esas cuatro pantallas no mostraron overflow horizontal. No se probó aquí la app autenticada ni cada acción.
- [x] El árbol actual declara las áreas pública, onboarding, dashboard, despensa, recetas, compra, tickets, calendario, hogar, configuración de IA, logs, cuenta, preferencias y ajustes; el detalle de rutas está más abajo.
- [x] Playwright enumera 636 casos en 31 archivos y configura Chromium escritorio, Pixel 5 y iPhone 13. Se enumeraron, **no se ejecutaron**.
- [ ] Repetir el barrido con captura de errores de red/console. Google Fonts falló en este entorno restringido (`ERR_NETWORK_ACCESS_DENIED`); determinar si el resto de recursos necesarios funciona y no atribuir este bloqueo a la app sin comprobarlo en un entorno con red.
- [ ] Capturar evidencia de referencia autenticada en escritorio y móvil después de preparar base de datos aislada.

### Baseline real de Chromium (2026-09-30; hallazgos, no cierre)

- Build de servidor: `node ./node_modules/typescript/bin/tsc -p server/tsconfig.json` — pasó.
- Build de cliente: desde `frontend/`, `node ./node_modules/@angular/cli/bin/ng.js build --configuration production` — pasó con avisos de budget de bundle/estilos y componentes/imports sin uso.
- `tests/e2e/full-stack/served-app.spec.ts`: 4 pasaron y 1 se omitió (no hay manifest enlazado); Chrome de sistema, SQLite y uploads exclusivos bajo `%TEMP%`, sin vídeo/traza.
- Suite `tests/e2e/full-stack` inicial: 11 pasaron, 3 fallaron y 1 se omitió; Chrome de sistema, un worker, limitador activo y SQLite temporal. Tras aislar los dos specs de QA, `shopping-money.spec.ts` pasó 3/3 y `request-budget.spec.ts` 2/2. No se llamó al proveedor IA ni se usó una credencial real.
- Los fallos iniciales de `request-budget.spec.ts` eran falsos positivos de medición: el watcher contaba registro, rangos pedidos intencionalmente, varias mutaciones de cesta en la misma ventana y el sondeo de cola permitido por §12aj. No se observó repetición en las ventanas de reposo aisladas ni reconexión SSE; el watcher redacta ahora tokens/credenciales en sus diagnósticos.
- El rojo de `shopping-money.spec.ts` combinaba dos defectos comprobados: `tickAll()` conservaba locators por índice cuando la pestaña filtraba líneas marcadas y `parseLine()` descartaba `Pan` como unidad antes de comprobar `isKnownUnit()`. QA-02 corrige ambos; los tres casos de `shopping-money.spec.ts` pasan en Chromium aislado.
- Las suites Playwright configuradas con vídeo/traza fallaron al cerrar Chromium en este sandbox (`browserContext.close: spawn EPERM`); desactivar ambos para la ejecución local hizo reproducible el cierre. Esto es una limitación del entorno, no evidencia de un fallo de la app.
- Suite unitaria frontend completa inicial (Chrome Headless 154, con coverage; 2026-09-30): 452/471 pasaron; 19 fallaron en `AuthService` (4), `authGuard` (2), `home-profile` (1), `ModulesService` (7), `CheckboxComponent` (1), `ThemeService` (3) y `ModalComponent` (1). La línea base y su cobertura inicial (75.54/62.18/72.78/76.77 % en statements/branches/functions/lines) quedan como historial reproducible; QA-04a corrigió los tests/defectos y QA-04c conserva pendiente el gate de 80 % sin rebajarlo.
- `node scripts/check-ui.mjs` termina con 13 incidencias `texto-en-un-catalogo` en `frontend/src/app/core/i18n/labels.ts` (catálogo de etiquetas de categoría); no es archivo de alcance de QA-03/03b y no se corrige aquí. Queda anotado como unidad de i18n pendiente, sin ocultar ni rebajar la comprobación.

## Unidad QA-01 · fiabilidad de medición E2E (completada)

- [x] `request-budget.spec.ts`: aísla del watcher el registro/acciones intencionales, mide reposo tras cada carga, sigue detectando bucles y `429`, y comprueba que cada pantalla abre su stream una vez sin reintentos. Excluye el sondeo intencional de `/api/receipts/queue` definido en `HOGARIA-SPEC.md` §12aj.
- [x] `request-watch` conserva query no sensible para distinguir rangos, pero redacta tokens/credenciales y userinfo al capturarlos y en diagnósticos; unitarias Node 3/3 (`node --import tsx --test tests/e2e/helpers/request-watch.unit.ts`).
- [x] `shopping-money.spec.ts`: marcar las líneas por identidad estable, afirmar que ambas están en el carro antes de finalizar y comprobar que la hoja permite guardar ambos precios y que se recuerdan en la siguiente lista. Evidencia: ejecución aislada Chromium/build producción, 3/3 pasaron.
- [x] Ejecutar specs enfocados contra build/servidor real con base/uploads temporales únicos y limitador activo: `request-budget.spec.ts` 2/2 y `shopping-money.spec.ts` 3/3, Chromium de sistema, sin vídeo/traza ni proveedor externo.

## Unidad QA-02 · conservar nombres al parsear cantidad y unidad (completada)

Contrato activo: `HOGARIA-SPEC.md`, §8 (entrada `2 Leche` y `1kg Tomates`); `unit-families.ts` es la lista de unidades reconocidas.

- [x] Prueba Jasmine pura: conserva nombres cortos (`1 Pan de cristal`, `2 Leche semidesnatada`), reconoce unidades válidas con/sin espacio, decimales, alias/unidad compuesta, texto plano, marcadores de lista con/sin espacio y cantidad+unidad sin producto.
- [x] El input rápido usa el parser puro; solo consume prefijos de unidad reconocidos por `isKnownUnit()`. Playwright confirma que `2 Leche semidesnatada` se conserva como dos unidades (total recordado 1,90 €) y no pierde el nombre corto.
- [x] Playwright Chromium aislado: `1 Pan de cristal` se muestra completo, ambas líneas se marcan por nombre, la hoja de pago enumera ambas y guarda precios; al crear otra lista, se recupera el precio correcto.
- Evidencia reproducible: build `ng build --configuration production` pasó con warnings ya existentes; prueba unitaria enfocada 5/5; suite `shopping-money.spec.ts` 3/3 con base SQLite y uploads temporales únicos, limitador activo, sin vídeo/traza ni proveedor externo. Cobertura del alcance (suite completa): `quick-add.ts` statements/functions/lines 100 %, branches 88.89 %; `unit-families.ts` 100 % en las cuatro métricas. La suite frontend global permanece roja y bajo su gate local del 80 % (ver baseline).

## Unidad QA-03 · contrato de validación del registro (completada)

**Decisión de alcance:** `server/src/schemas/auth.schema.ts::registerSchema` es la fuente de verdad disponible (HOGARIA-SPEC no fija reglas de registro): nombre de 2 a 100 caracteres, correo válido y contraseña de mínimo 6 caracteres con una mayúscula ASCII (`[A-Z]`) y un dígito ASCII (`[0-9]`). El cliente debe reflejarla y explicar los rechazos antes de llamar a la API; no se relaja la validación backend.

- [x] Añadir pruebas puras de fronteras para nombre (1/2/100/101), email inválido y contraseña (5/6 caracteres, falta mayúscula, falta dígito, acento no ASCII, válida) contra el contrato del servidor.
- [x] El formulario valida los mismos límites, muestra mensajes ES/EN coherentes con cada error, limita visualmente nombre a 100 caracteres y permite corregir/reintentar sin enviar datos inválidos; el error está asociado al campo y anunciado.
- [x] Playwright real con DB temporal cubre rechazos sin petición, aceptación en fronteras válidas, error/reintento y ausencia de doble envío, en escritorio y móvil; capturas comparables guardadas sin datos personales.
- [x] Ejecutar tests unitarios cliente/servidor, typecheck y E2E Chromium escritorio + mobile-chrome; registrar cobertura del alcance sin rebajar los gates existentes.

Evidencia QA-03 (2026-09-30):

- Contrato: `server/src/schemas/auth.schema.ts::registerSchema`. Pruebas backend `node ./node_modules/vitest/vitest.mjs run src/schemas/auth-register-boundaries.spec.ts` — 3/3; Karma enfocado en Chrome Headless 154 — 39/39 (`input.component.spec.ts`, `register-form.validation.spec.ts`, `register.component.spec.ts`, `auth-register-context.spec.ts`). Para Karma local se generó y eliminó un launcher temporal `ChromeHeadlessSafe` por las restricciones GPU/sandbox de Chrome; el archivo no cambia el gate ni queda en el repo.
- Typecheck: `node ./node_modules/typescript/bin/tsc -p server/tsconfig.json` y `node ./node_modules/typescript/bin/tsc -p tsconfig.e2e.json --noEmit` — pasaron. Build frontend producción — pasó con warnings preexistentes de imports, bundle y estilos. Auditoría de CI (`.github/workflows/ci.yml`): servidor con gate de coverage 70 %/archivo, build producción y Playwright full-stack Chromium + mobile-chrome; no ejecuta Karma/frontend unit coverage ni `check-ui`, así que esos resultados son gates locales.
- Playwright sobre build de producción y servidor real, puerto, SQLite, uploads y semilla únicos bajo `%TEMP%`, `RATE_LIMIT` activo y limpieza tras éxito: `tests/e2e/full-stack/register-contract.spec.ts` Chromium — 4/4; `mobile-chrome` (Pixel 5) — 4/4. Viewports sin overflow: escritorio 1023/1024/1440; móvil 320×740, 390×844 y horizontal 844×390. Capturas sintéticas ignoradas por Git: `.e2e-screenshots/registration-desktop.png` (1440×900) y `.e2e-screenshots/registration-mobile.png` (390×844). Revisadas visualmente.
- Interacción directa de solo lectura con el servidor dev existente `http://localhost:4200/auth/register`: Chromium escritorio y móvil revisaron campos, validación, ARIA y los mismos seis tamaños; 0 POST a registro. Capturas adicionales `.e2e-screenshots/dev-registration-desktop.png` y `dev-registration-mobile.png`, inspeccionadas visualmente.
- Cobertura del alcance, medida en el informe HTML de Karma: `register-form.validation.ts` y `register.component.ts` — 100 % en statements, ramas, funciones y líneas; `input.component.ts` — 100 % en statements/ramas/líneas y 92.85 % en funciones (13/14), supera 70 % en cada métrica. En `AuthService.register`, todas las sentencias y callbacks del método (contexto silencioso y caminos éxito/error) se ejecutaron; el archivo completo sigue en 53.68/22.73/45.45/54.95 % (statements/branches/functions/lines) por métodos ajenos al alcance. La suite global completa sigue bloqueada por los 19 tests anotados en el baseline y por su gate 80 %; no se rebajó.

## Unidad QA-03b · estado touched del control compartido (completada)

**Hallazgo revalidado:** `frontend/src/app/shared/components/ui/input/input.component.ts` solo emite `onBlur` en el evento blur. En cambio `onInput()` llama `onTouched()` para texto y valores numéricos vacíos/no válidos, pero retorna sin hacerlo para números válidos. Esto vuelve inconsistente el estado touched de `ControlValueAccessor` según el tipo de campo y no sigue el momento de interacción esperado (salir del campo).

- [x] `onTouched` se ejecuta al salir de cualquier input y no al teclear, tanto texto como número; el output público `onBlur` se conserva.
- [x] Tests CVA reprodujeron primero la discrepancia (2 fallos), luego verificaron blur/touched y que no cambia al teclear (componente 28/28).
- [x] Ejecutar el E2E real de registro en Chromium y mobile-chrome contra un servidor/DB aislados; cobertura de todas las métricas ≥70 % en el alcance, sin tocar los gates existentes.

Evidencia QA-03b (2026-09-30): red TDD 2/28 fallos esperados antes del cambio; suite `input.component.spec.ts` verde 28/28 y subconjunto completo 39/39. Playwright full-stack tras build de producción Chromium 4/4 y mobile-chrome 4/4; servidor dev 4200 escritorio/móvil pasó sin POST de registro; build y typechecks pasaron. El coverage HTML de `InputComponent` indica 100/100/92.85/100 % (statements/branches/functions/lines). La suite global tenía entonces 19 fallos basales, resueltos en QA-04a.

## Unidad QA-04a · rebaselinar suite unitaria y resolver discrepancias (completada)

**Fuente revalidada antes de implementar:** la línea base aislada de Karma volvió a dar 19 specs fallidos y 452/471 verdes: `AuthService` (4), `authGuard` (2), `home-profile` (1), `ModulesService` (7), `CheckboxComponent` (1), `ThemeService` (3) y `ModalComponent` (1). En `ModulesService.spec.ts`, el fake `profile` era una función mutable pero no estaba respaldada por una señal Angular; por ello los `computed` del servicio no reaccionaban a `set()` y seis de los siete specs caían por estado obsoleto. El séptimo supone incorrectamente que `receipts` aún no está disponible. No cambiar el comportamiento de producción solo para hacer verdes estos tests.

- [x] Repetir la línea base aislada de Karma y registrar los nombres de los specs rojos y porcentajes; no tocar datos ni el servidor de uso normal.
- [x] `AuthService`/`authGuard`: sembrar y afirmar `STORAGE_KEYS` antes de construir servicios; modelar `isAuthenticated` como señal invocable. Probar el ciclo legado → migración → logout → nueva migración/arranque para confirmar que una sesión cerrada no se restaura; preservar prioridad/idempotencia de migración y comportamiento de login.
- [x] `AuthService` emite `AuthResponse`/`User` normalizado tanto con respuesta API `{data: ...}` como plana: contrastar login, registro, refresh y `updateProfile` con sus consumidores; normalizar el observable además de actualizar el cache.
- [x] Aumentar cobertura de caminos relevantes de refresh, perfil/avatar, contraseñas y evento de cambio del tema del sistema; ambos servicios superan ≥70 % en statements, ramas, funciones y líneas (ver informe actual abajo).
- [x] Corregir el logout solo tras reproducir la migración: al cerrar sesión borrar credenciales de sesión heredadas sin eliminar preferencias ni claves ajenas, y cubrir la regresión con unit test y flujo Playwright.
- [x] `ThemeService`: usar `STORAGE_KEYS.theme`, limpiar/sembrar almacenamiento antes de instanciar y crear instancias de prueba dentro del contexto Angular; verificar valores válidos, valor por defecto, persistencia y evento de media query.
- [x] `ModulesService`/`home-profile`: alinear fixtures con `MODULE_REGISTRY` (`meals`, `pantry`, `shopping`, `receipts` disponibles; `home` pendiente); probar selección vacía/expresa, módulo no disponible, último módulo visible, rollback con selección válida y reintento después del error.
- [x] Reconciliar la frase histórica contradictoria de `HOGARIA-SPEC.md` §8c con el registro, rutas y funciones implementadas; no deshabilitar módulos vigentes para complacer tests viejos.
- [x] `ModalComponent`/`CheckboxComponent`: comprobar ambos outputs de cierre; actualizar el fixture tras el click antes de leer `aria-checked`; conservar estado disabled.
- [x] Repetir las pruebas focalizadas y toda la suite frontend: cero assertions fallidas. Se registra por separado el gate global de coverage aún rojo en QA-04c; no se redujo ningún umbral.

Evidencia QA-04a (2026-09-30): baseline Chrome Headless 154 aislado — `TOTAL: 19 FAILED, 452 SUCCESS`. Tras corregir fixtures/expectativas y dos defectos reales (migración que restauraba credenciales tras logout y `ModulesService.isSaving` retenido ante error), el grupo auditado pasó 84/84 y la suite completa `488/488`. Las pruebas nuevas Playwright de logout+migración y fallo/reintento de módulos pasan Chromium `2/2` y Pixel 5 `2/2`, con rate limit activo, servidor de producción efímero y SQLite/semilla/puerto temporales únicos; `tsc -p tsconfig.e2e.json --noEmit` pasó. `GET http://localhost:4200/` responde 200 y el dev server permanece activo en IPv6; no se realizaron escrituras contra él ni contra la base de uso normal.

## Unidad QA-04c · cobertura global sin rebajar gates (en curso)

La ejecución completa más reciente de Karma pasó `507/507` specs sin fallos de aserción, pero **falla el gate existente de 80 %**. Cobertura global: sentencias `80.80 %` (1819/2251), ramas `69.75 %` (798/1144), funciones `79.25 %` (428/540), líneas `82.32 %` (1584/1924). El gate falla en ramas/funciones; las ramas globales también quedan 0,25 puntos por debajo del mínimo 70 % pedido. No se rebajó el umbral ni se desactivó instrumentation.

- [x] Revalidar cobertura global y por archivo antes de iniciar el siguiente lote; guardar el informe aislado bajo `%TEMP%`.
- [ ] Añadir pruebas unitarias/integración para ramas y caminos de error/éxito no cubiertos; cada lote debe partir de fuentes actuales, tener regresión útil, cobertura ≥70 % en cada métrica del alcance y commit atómico.
- [ ] Repetir la suite frontend completa con coverage y alcanzar 80 % en statements, ramas, funciones y líneas; documentar comandos y salidas, sin bajar umbrales.

Candidatos del informe previo al lote (histórico; orden statements/branches/functions/lines): `auth.service.ts` 100/81.82/94.59/100 %, `theme.service.ts` 96.67/92.86/87.50/96.67 %, `shopping.model.ts` 79.22/62.40/66.67/79.22 %, `error.interceptor.ts` 7.89/0/0/7.89 %, `swipe-row.directive.ts` 10.09/11.11/11.76/10.09 %, `core/time.ts` 86.75/57.83/95/86.75 %, `data-table.util.ts` 95.86/78.77/100/95.86 %, `i18n.service.ts` 61.70/23.68/61.54/61.70 %, `household.service.ts` 1.79/0/0/1.79 % y `taste-profile.service.ts` 3.33/0/0/3.33 %.

Revalidación actual (Karma Chrome Headless 154, `ng test --watch=false --code-coverage`, gate original intacto): `picker.component.ts` 96.90/92.42/100/97.37 %, `shopping.model.ts` 93.55/86.18/100/96.25 %, `shopping-http-error.ts` 100/100/100/100 %. Esos tres archivos superan ≥70 % en statements/branches/functions/lines. El global requiere todavía un lote específico para ramas/funciones restantes; no se declara completo.

**Subunidad QA-04c.1 — modelo de ofertas/descuentos de compra (fuente revalidada):** `HOGARIA-SPEC.md` §12h define `buy:3,take:2` como una oferta 3×2; el preset activo lo representa como `{ label:'3x2', buy:3, take:2 }`. `shopping.model.ts::describeOffer` antes devolvía `${buy}x${buy-take}` (3x1) y la plantilla de `shopping-list-detail.component.ts` lo pinta en la chapa accesible de cada fila; Playwright real reprodujo el texto visible y accesible «3x1». Los helpers puros `lineDiscountOfItem`, `describeLineDiscount`, `offerOfItem` y `describeOffer` son usados por la pantalla activa. El normalizador de backend `server/src/utils/list-discount.ts::normalizeOffer` exige `buy ≥ 2`, `take ≥ 1` y `take < buy`, por lo que el helper cliente debe ignorar también filas inválidas. Criterios:

- [x] Reproducir antes de cambiar código con Playwright real: `shopping-round6.spec.ts` Chromium (build/servidor/SQLite/semilla/puerto temporales únicos; rate limit activo) falla de forma concreta: preset «3x2» deja texto visible y title accesible «Oferta 3x1»; screenshot sintético retenido fuera de Git.
- [x] Revalidar el test para Pixel 5: el nuevo intento móvil paró antes de la oferta porque usa el locator desktop `[data-test="new-list"]`, que se oculta intencionadamente ≤600 px; `shopping-lists.component.ts` expone `[data-test="new-list-text"]` como CTA de texto visible. La captura muestra «Nueva lista» y «Empezar una lista» visibles; no es un defecto de producción. El E2E debe elegir el locator visible según viewport antes de validar la oferta.
- [x] Tras adaptar el CTA móvil, Pixel 5 confirma los asserts visibles/accesibles de la chapa, pero no puede tocar «Hecho». La primera medición usó un `setViewportSize(390×844)` de Playwright y dio layout `448×968` frente a visual `390×844`; se revalidó luego sin override con el viewport Pixel 5 del proyecto. La hoja original no tenía límites ni scroll interno.
- [x] Pixel 5 real del proyecto (sin override inicial, 393 px de ancho): prueba geométrica roja aparte del modal detecta overflow previo de la pantalla: `visualViewport.width=393`, raíz `clientWidth=393, scrollWidth=447`; el formulario `.detail__add` ocupa `x=16..377` (361 px), pero sus `app-icon-button` se dibujan en `x=359..399` y `407..447`. El DOM demuestra que los iconos del propio formulario, no el menú fijo, exceden el contenedor. Fuente actual: `.detail__add` es una sola fila flex sin wrap y `.detail__add-campo` solo tiene `flex:1`; falta permitir que el campo se contraiga o refluya.
- [x] TDD rojo de layout: `expect(documentElement.scrollWidth ≤ visualViewport.width)` falla en Chromium mobile real (`447 > 393`) antes de abrir la hoja. Ocultar temporalmente `.bottom-nav` no elimina el exceso. El rojo aislado demuestra que la fila `.detail__add` causaba el ancho extra.
- [x] Primero extender las pruebas unitarias de `shopping.model.spec.ts` para valores ausentes, 0/negativos/no válidos, amount/percent, campos ausentes, límite de unidades y singular/plural; incluir `describeOffer({buy:3,take:2}) === '3x2'` para reproducir el error del nombre visible.
- [x] Cubrir ofertas ausentes/0, `buy < 2`, `take < 1`, `take >= buy` y al menos presets válidos 3×2/2×1; no cambiar el contrato matemático de `HOGARIA-SPEC.md` §12h.
- [x] TDD rojo reproducible en Karma Chrome Headless 154: solo `shopping.model.spec.ts` da `TOTAL: 2 FAILED, 22 SUCCESS`; fallan `offerOfItem({promo_buy:3,promo_take:-1})` (se emite `{buy:3,take:-1}`) y `describeOffer({buy:3,take:2})` (emite `3x1`). La config `ChromeHeadlessSafe` fue temporal y se eliminó.
- [x] Corregir los helpers mínimos, ejecutar el mismo spec en verde y medir ≥70 % por métrica de `shopping.model.ts`: 24/24 aserciones; cobertura del archivo 96.25/86.18/100/96.25 % (statements/branches/functions/lines).
- [x] Corregir con TDD el reflujo de `.detail__add`: E2E Pixel 5 confirma en 393 px y en 320×568 que raíz, formulario y cuatro controles (Añadir, pegar, foto e historial) caben en el `visualViewport`; tras el fix no hay scroll horizontal.
- [x] E2E Chromium aislado de la oferta completa: escritorio 1/1 y Pixel 5 1/1; comprueba el nombre/texto accesible 3x2, persistencia tras recarga y eliminación con un toque. Capturas sintéticas `.e2e-screenshots/shopping-offer-desktop.png` y `shopping-offer-mobile.png` (ignoradas por Git) se inspeccionaron visualmente.
- [x] La hoja móvil a 393 px y 320×568 se mantiene dentro del `visualViewport`, limita altura y usa scroll interno (`overflow-y:auto`); el test alcanza «Hecho», enfoca la acción y la activa con Enter. El fix reserva safe-area top/bottom en CSS y la prueba confirma accesibilidad geométrica y de teclado en Chromium emulado.
- [ ] Validar en motor Safari/iOS real (WebKit no está instalado/disponible en este entorno); ejecutar interacción con cierre X y fondo, safe-area no nula y teclado nativo. La ejecución Chromium no sustituye esa validación.

Evidencia final QA-04c.1 (2026-09-30): Karma `shopping.model.spec.ts` 24/24; cobertura del archivo 96.25/86.18/100/96.25 % (statements/branches/functions/lines); build producción del cliente pasó con warnings existentes de budget/imports. El test E2E aislado de escritorio y el de Pixel 5 pasaron 1/1 cada uno, con SQLite/servidor/puerto/semilla temporales y rate limit activo. Capturas PC/móvil están en `.e2e-screenshots/`. Playwright no pudo enumerar instalaciones porque Windows denegó `scandir` de su directorio `.links`; las rutas Playwright WebKit no existen localmente, por lo que no se afirma validación iOS.

### QA-04c.2 · reparar expectativas E2E de cesta (revalidación antes de cambiar tests)

La primera revalidación de `shopping-round6.spec.ts` dio 7/11; un paso intermedio, 8/11. Los cinco desajustes de expectativas/selectores y el error de UI de foto ya están corregidos o cubiertos abajo; la revalidación actual es Chromium 12 passed/3 skipped y Pixel 5 14 passed/1 skipped. Los skips son escenarios exclusivos del otro viewport; el detalle y los límites del lote permanecen en QA-04c.4/QA-04c.5.

- `newList()` (`tests/e2e/shopping-round6.spec.ts`) crea la lista, espera `/shopping/:id` y navega de vuelta a `/shopping`; por eso el `add-input` no debe existir hasta abrir de nuevo la tarjeta creada.
- `toggleCheck()` mueve la línea marcada fuera de la pestaña «Pendientes»; `visibleItems()` filtra por la pestaña activa y `toggleSelectAll()` selecciona solo esos elementos. La prueba debe pasar a «En el carro» antes de seleccionar todo.
- El atributo `data-test="discount-amount"` vive en el propio `<input>`, no en un wrapper; el selector `discount-amount input` no puede coincidir.
- `[data-test="tray-search"]` se renderiza solo con `filtersOpen()`: el control visible `.tray__filter-toggle` abre el panel; el test no lo hacía.
- El caso de descuento por producto solo asignaba precio `4,00 €/ud` a Jamón y dejaba Leche sin precio; el subtotal aislado era 4,00 €, por eso 2,00 € tras descontar 2 € es correcto. El fixture crea 2 Leches y quiere una línea de 1,00 €; debe fijar `0,50 €/ud` (subtotal previo esperado 5,00 €) para justificar el total posterior de 3,00 €.
- El error de foto confirmó un defecto real de presentación: E2E recibía `409 AI_NOT_CONFIGURED` pero la UI mostraba el mensaje genérico; QA-04c.3 conserva ahora el body original. No se llamó al provider.
- `[data-test="tray-search"]` sigue fallando solo porque el panel de filtros continúa cerrado: abrir `.tray__filter-toggle` es la interacción de UI definida por el template.
- El descuento por producto aplica correctamente el -2 €: total 2,00 € sobre Jamón de 4,00 €; Leche no tenía precio y, por tanto, no forma parte del subtotal. Falta completar el fixture con Leche a 0,50 €/ud (2 uds = 1,00 €) antes de afirmar el total de 3,00 €.

- [x] Revalidar los cuatro rojos iniciales en la suite aislada completa, con servidor/SQLite/puerto/semilla temporales y rate limit activo; registrar 7/11 y 8/11 en corridas intermedias. Tras resolver supuestos/fixtures y el error photo wrapper, Chromium completo pasó 11/11.
- [x] Contrastar helper de creación, filtro/selección visible, selector de importe, mensaje frontend y contrato/handler backend con fuente actual.
- [x] Capturar status/body sin provider: `409 AI_NOT_CONFIGURED` y redirect `/settings/ai`; la misma E2E reproduce que la UI pierde el mensaje específico. No se utilizó proveedor externo.
- [x] Completar correcciones test-only: panel de filtro explícito, selector del input directo, ambas líneas con precio unitario y subtotal previo 5,00 €/total final 3,00 €. Suite completa desktop `shopping-round6.spec.ts` pasó 11/11.
- [x] TDD del wrapper `errorInterceptor`: la regresión unitaria dio 2 FAILED y luego Karma enfocada 2/2; el unwrap conserva status, `body.message` y `body.data` en `analyzePhoto` y se comparte con `complete()`.
- [x] Playwright de foto aislado en Chromium y Pixel 5: HTTP 409 `AI_NOT_CONFIGURED`, enlace `/settings/ai`, lista sin filas; el mensaje específico se muestra y no se contacta provider.
- [x] Ejecutar `shopping-round6.spec.ts` en Chromium (12 passed, 3 skipped) y Pixel 5 (14 passed, 1 skipped); medir cada archivo de lógica focalizada nuevo/cambiado (`picker.component.ts`, `shopping.model.ts`, `shopping-http-error.ts`) por encima de 70 % en statements/branches/functions/lines. UI adicional comprobada por E2E; gate global intacto y aún rojo, ver QA-04c.

### QA-04c.3 · conservar el error de IA tras el interceptor (resuelta)

La ejecución aislada verificó el contrato POST de foto sin configuración → HTTP 409, `message=AI_NOT_CONFIGURED`, `data.redirect=/settings/ai`; antes del fix la UI caía al mensaje genérico. Fuente revalidada: `errorInterceptor` vuelve a lanzar `{ status, message, original: HttpErrorResponse }`; `ShoppingService.analyzePhoto` descartaba `original.error`, mientras `complete()` ya leía `original`. No hay filas IA en la DB de prueba y no se contacta provider.

- [x] Añadir el assert de status/body al E2E sin configuración y reproducir simultáneamente el error visual genérico y la ausencia de escritura en la lista.
- [x] Escribir tests unitarios con el `errorInterceptor` funcional para 409 `AI_NOT_CONFIGURED`/redirect y 502 `AI_UNAVAILABLE`/detail; rojo TDD reproducible en Karma Chrome Headless 154: 2 FAILED, 0 SUCCESS. En ambos resultados el servicio conserva el status pero devuelve `message=AI_UNAVAILABLE` y `data={}`.
- [x] Reutilizar `originalHttpError()` en `complete()` y `analyzePhoto()`; no cambia la semántica del interceptor ni duplica toasts.
- [x] E2E aislado en Chromium y Pixel 5: la respuesta/UI expresan «Falta configurar la IA», enlace lleva a `/settings/ai`, `item-row` sigue vacío y no hay llamada a provider.
- [x] Coverage de la lógica nueva ≥70 % en statements/branches/functions/lines; typecheck, `shopping-round6` Chromium/Pixel 5 y build. El gate global sigue en 80 % y se registra sin rebajarlo (ver QA-04c global).

Evidencia: `shopping-http-error.ts` cubre el helper puro al 100 % en las cuatro métricas; el E2E sin configuración verifica status/body, presentación, cero filas añadidas y cero llamadas al provider. La suite actual de `shopping-round6.spec.ts` pasa en ambos proyectos. La cobertura global y el gate intacto se registran en QA-04c.

**Revalidación posterior:** esta unidad verificó que el enlace mostrara el destino del body, pero no lo siguió. El árbol actual declara `/ai-config`; `settings.routes.ts` solo declara `path: ''`; por tanto `/settings/ai` no es una ruta válida y el wildcard conduce a `/dashboard`. Mantener la preservación del mensaje como resuelta y auditar/cambiar el destino por separado en QA-04c.10.

### QA-04c.10 · el error sin IA recupera a la ruta real sin toast duplicado (verificada)

**Decisión basada en la fuente activa:** `app.routes.ts` declara `/ai-config` como área protegida y `main-layout.component.ts` la ofrece en la navegación; `/settings` es una pantalla distinta y no tiene subruta `ai`. El contrato anterior `/settings/ai` estaba obsoleto. La acción de recuperación del error sin proveedor debe llevar a `/ai-config`; no se añadirá un alias ficticio de settings.

**Hallazgo de la inspección visual PC/móvil:** la hoja ya muestra un error específico y el enlace, pero el mismo `409 AI_NOT_CONFIGURED` además crea un toast global «Error / AI_NOT_CONFIGURED» que persiste al navegar y cubre parte de la cabecera móvil. `error.interceptor.ts` ya define `SILENT_TOAST` precisamente para errores que la pantalla resuelve; `ShoppingService.complete()` lo usa, `analyzePhoto()` no. Para esta respuesta tipada y presentada inline, se conserva status/body pero se silencia el toast genérico.

**Hallazgo de la pantalla de destino:** la captura real de `/ai-config` en Pixel 5 (393 px) muestra que el CTA de cabecera rebasa el borde derecho. La fuente actual `.ai-config__header` es una fila flex sin reflujo móvil. El flujo de recuperación solo queda utilizable si la pantalla destino mantiene su CTA dentro del viewport a 393 y 320 px.

- [x] Actualizar primero el contrato activo y expectativas de backend para `409 AI_NOT_CONFIGURED` → `data.redirect: '/ai-config'`; conservar el estado sin configuración y no llamar al proveedor.
- [x] Añadir regresión E2E al flujo real de foto: mostrar error/link accesible, seguirlo en escritorio y Pixel 5, confirmar URL `/ai-config` y encabezado de configuración, y confirmar cero filas creadas.
- [x] Reproducir rojo aislado con el link actual `/settings/ai`, y corregir backend más fallback frontend al destino único vigente.
- [x] Añadir prueba unitaria focalizada de la política de contexto HTTP silencioso y cubrir el resultado específico con E2E real de `analyzePhoto()`; confirmar que desaparece el toast redundante antes/después de navegar, sin incorporar al scope de coverage las ramas ajenas del servicio legado completo.
- [x] En Pixel 5, demostrar sin overflow horizontal que el CTA «Agregar configuración» queda entero dentro del viewport de `/ai-config` a 393×851 y 320×568; refluir el header si la regresión lo reproduce.
- [x] Ejecutar pruebas unitarias de ruta, Playwright desktop/móvil, typecheck/build y verificar coverage del alcance ≥70 % sin bajar gates.
- [x] Guardar e inspeccionar capturas sintéticas PC/móvil; actualizar evidencia y solo entonces marcar checklist.

Evidencia reproducible (2026-09-30): TDD rojo: seguir `/settings/ai` acababa en `/dashboard`, el error dejaba un `.toast--error` global y Pixel 5 a 393 px tenía `scrollWidth=474`; al quitar el toast antes de corregir el servicio, el test de contexto falló (`false` esperado como `true`). Verde: `shopping.routes.spec.ts` 94/94; cobertura del archivo de ruta 89.80/79.92/89.69/92.65 % (statements/branches/functions/lines). `shopping-photo-http-context.spec.ts` 1/1 y su helper 100/100/100/100 %. La cobertura parcial del spec de ruta sale con código 1 porque el scope incluye otros ficheros no ejecutados (por ejemplo `database.ts`, `ai-client.ts`, `memory-monitor.ts`, `taste-profile.ts`, `week-calendar.ts`, `weekly-plan.ts`); no se redujo el gate server global de 70 %.

El E2E full-stack usa el runner aislado `%TEMP%\hogaria-e2e-runner-audit.mjs`, `DATABASE_PATH` SQLite temporal único y rate limit activo, sin proveedor externo ni base normal: `shopping-ai-recovery.spec.ts` Chromium 1/1 y Pixel 5 1/1; en Pixel 5 comprueba 393×851 y 320×568, destino, CTA en viewport, cero overflow, cero items y cero toast duplicado antes/después de navegar. La regresión existente `shopping-round6.spec.ts` pasa Chromium 12 (3 skips esperados) y Pixel 5 14 (1 skip esperado). Typechecks de servidor y E2E y build de producción pasaron; se mantienen warnings previos de bundle (691.41 kB frente al warning de 500 kB), estilos e imports. Capturas sintéticas inspeccionadas: `.e2e-screenshots/shopping-ai-recovery-final-2/shopping-ai-recovery-config-1280.png`, `...-393.png` y `...-320.png` (también se conserva el estado de error PC/móvil); todas ignoradas por Git. El gate global frontend de 80 % sigue pendiente en QA-04c.

### QA-04c.11 · enlaces de recetas y generación IA desde el Dashboard (resuelta)

**Fuente activa y decisión antes de codificar:** `app.routes.ts` declara `/recipes` pero `recipes.routes.ts` solo declara `path: ''`; el `*` envía `/recipes/:id` al Dashboard. La pantalla de Recetas enseña el detalle en un modal (`viewRecipe`) y ya ofrece la API autenticada `GET /api/recipes/:id`. Por tanto, la tarjeta sugerida conservará su destino concreto con `?recipe=<id>` y abrirá ese modal existente; no se creará una segunda vista de detalle. Los CTA Dashboard existentes llevan `#ai`, así que cargar/navegar a ese fragmento abrirá el modal de generación sin enviar una petición al proveedor. Al cerrar cualquiera de los modales, su estado URL se limpiará; un id inexistente debe volver a la lista sin dejar un destino roto.

**Hallazgos TDD durante la integración:** el primer test rojo reprodujo que el click original acababa en `/dashboard`; al reencaminarlo, la modal de detalle aparece pero la ficha queda vacía porque `RecipeService.getRecipe()` devuelve `{ success, data }` como si fuese `Recipe`. El modal IA también conserva un `h2` vacío: el template asigna `[attr.title]` en vez del `@Input() title` de `app-modal`, dejando al diálogo sin nombre accesible. La prueba unitaria de servicio red (3/8 fallos) destapó además que `createRecipe()` y `deleteRecipe()` filtran el envelope de API hacia fuera pese a que sus firmas prometen `Recipe | null` y `boolean`; esta unidad normaliza ambos retornos.

**Hallazgo responsive adicional (Pixel 5 estrecho 320×568):** el E2E midió 302 px de contenido de acciones en 240 px disponibles: el segundo botón de `.ai-form__actions` queda cortado horizontalmente porque la regla móvil solo apila los campos. El reflujo y la medición real de ambos botones son la unidad pendiente.

**Hallazgo responsive de la ficha (Pixel 5 320×568):** tras abrir el deep link a 320 px en un documento nuevo, `.recipe-detail__actions` también desborda: la fila mide 332 px de contenido dentro de 240 px disponibles. El primer intento de E2E se detuvo ante esta aserción y dejó el fixture sintético sin borrar; el siguiente caso falló en cascada por encontrar esa receta. La prueba debe limpiar su receta propia en `finally`, incluso si una aserción falla.

- [x] TDD E2E con receta sintética creada por API en SQLite temporal: la tarjeta sugerida del Dashboard abre la receta concreta en desktop y Pixel 5; recargar el deep link conserva modal/contenido; cerrar vuelve a `/recipes` y quita `recipe`.
- [x] TDD E2E del CTA principal y del estado vacío: seguir `#ai` abre el formulario accesible tanto al navegar desde Dashboard como al cargar `/recipes#ai`; cerrar limpia el fragmento y no llama a IA.
- [x] Refluir las acciones de la modal IA a 320 px y medir ambos botones completos dentro del viewport; mantener scroll vertical usable y comprobar 393×851/320×568.
- [x] Refluir también las acciones de la ficha a 320 px; medir «Cocinar ahora» y «Añadir a favoritos» completos en su contenedor y viewport, con espacio bajo los botones.
- [x] Limpiar siempre la receta sintética E2E con `finally`, para que una aserción fallida no contamine casos posteriores.
- [x] Probar `/recipes?recipe=missing` como borde: mantener la página de Recetas, no abrir detalle vacío ni caer en Dashboard, limpiar el id inválido con una salida recuperable.
- [x] Corregir `RecipeService.getRecipe()` para desempaquetar el DTO; unit test cubre éxito/error y `currentRecipe`.
- [x] E2E comprueba nombre/descripción/ingredientes reales del detalle abierto por deep link.
- [x] Alinear `createRecipe()` y `deleteRecipe()` con sus tipos de salida (`Recipe | null` y `boolean`); los tests comprueban payload y persistencia de la señal al fallar.
- [x] Corregir el binding del título del modal IA a su `@Input()`; E2E confirma el nombre accesible del diálogo al navegar y al cargar `#ai` directamente.
- [x] Añadir pruebas unitarias de resolución de intención de ruta (incluida precedencia entre `recipe` y `#ai`).
- [x] La cobertura de `RecipeService` y del resolver, con la prueba focal aislada, supera el 70 % de statements, ramas, funciones y líneas sin bajar gates.
- [x] Revisar patrones de ruta/template y ejecutar typecheck/build, pruebas aisladas desktop/Pixel 5 y capturas sintéticas PC/móvil inspeccionadas.

**Evidencia final (2026-09-30):** las corridas reales de Playwright usaron `E2E_SCOPE=all`, `E2E_RATE_LIMIT=on` y el runner `%TEMP%\hogaria-e2e-runner-audit.mjs`, que asigna puerto/SQLite únicos y limpia el DB temporal al terminar. Comando reproducible (desde la raíz; repetir para cada variante):

```powershell
$env:E2E_SCOPE='all'; $env:E2E_PROJECT='<chromium|mobile-chrome>'; $env:E2E_FILES='<dashboard-recipe-links.spec.ts|recipe-actions-mobile.spec.ts>'; $env:E2E_RATE_LIMIT='on'; node "$env:TEMP\hogaria-e2e-runner-audit.mjs" (Get-Location).Path
```

`dashboard-recipe-links.spec.ts` pasó **3/3 Chromium** y **3/3 Pixel 5**; `recipe-actions-mobile.spec.ts` pasó **1/1 Pixel 5**, midiendo 393×851 y 320×568. Las regresiones rojas anteriores midieron 302 px (IA) y 332 px (ficha) en 240 px disponibles; el CSS ahora apila ambas filas a ≤480 px. Aserciones miden ancho, cajas completas, viewport y 8 px de separación inferior; el modal IA conserva desplazamiento vertical, raíz sin overflow horizontal y cero llamadas `/api/ai/`. Los fixtures API sintéticos se borran en `finally`.

Karma focal, desde `frontend`: `node .\node_modules\@angular\cli\bin\ng test --no-watch --code-coverage --include=src/app/core/services/recipe.service.spec.ts --include=src/app/features/recipes/recipe-route-intent.spec.ts --browsers=ChromeHeadless` pasó **11/11**, statements **100 % (64/64)**, ramas **83.33 % (10/12)**, funciones **100 % (31/31)** y líneas **100 % (50/50)**; servicio aislado **8/8**, 100/80/100/100. Gate local Karma existente: 80 % por métrica. También pasaron `node .\node_modules\typescript\bin\tsc --noEmit -p tsconfig.e2e.json`, `node .\node_modules\prettier\bin\prettier.cjs --check tests/e2e/dashboard-recipe-links.spec.ts tests/e2e/helpers/recipe-fixtures.ts tests/e2e/recipe-actions-mobile.spec.ts` y `node .\node_modules\@angular\cli\bin\ng build --configuration production` (warnings previos: bundle 691.58 kB vs 500 kB, estilos e imports no usados; exit 0).

Capturas sintéticas inspeccionadas: `.e2e-screenshots/dashboard-recipe-links-route-rerun/desktop/` (1280), `.../mobile/` (393×851) y `.e2e-screenshots/recipe-actions-mobile-final-rerun/` (detalle/IA 393×851 y 320×568), todas ignoradas por Git. Se repitieron los tres proyectos/alcances antes de cerrar; cada runner eliminó su SQLite/artefactos temporales tras el resultado verde. Rollback: los commits de servicios, navegación y reflujo son unidades separadas; esta última solo revierte el apilado de `.ai-form__actions` y `.recipe-detail__actions` y su E2E móvil.

### QA-04c.4 · matriz móvil de bandeja (revalidada en este alcance)

En la línea base histórica, la suite Chromium pasó 11/11 y Pixel 5 pasó 3/11; tras corregir el CTA móvil, una corrida intermedia pasó 4/11. Cuatro fallos de bandeja compartían un selector helper defectuoso: `[data-test="back"], a[href="/shopping"]` elegía primero un enlace del sidebar fuera del viewport, aunque existía el botón de retorno visible `[data-test="back"]`. Otros tres fallos de cesta eran pointer interception: el botón Añadir quedaba debajo de la lista de autocomplete abierta (`.detail__sugs`). La bandeja es intencionalmente tarjeta móvil: a ≤720 px la cabecera/columnheaders se ocultan y cada celda lleva su etiqueta. `HOGARIA-SPEC.md` §8f especifica la tabla y ordenación de escritorio, filtros compactos en móvil y no exige ordenar desde la tarjeta. El resultado actual de la suite está debajo.

- [x] Baseline aislado Pixel 5: 3/11 pasó con selectores desktop; la ejecución con CTA móvil corrigió cuatro flujos y pasó 4/11 (oferta, foto y dos calendarios), con 7 rojos capturados.
- [x] Revalidar en el template/CSS que el CTA de texto es la acción móvil y que la cabecera de tabla oculta es comportamiento responsive previsto.
- [x] Corregir el helper de retorno para usar el control visible `[data-test="back"]`; conservar ordenación de columnas en escritorio y comprobar en móvil tarjetas, acciones, filtro expandible, crear/abrir, renombrar y paginación.
- [x] Asegurar en móvil que la lista de sugerencias no bloquea Añadir: selección táctil/teclado, entrada libre con cantidad y envío sin Escape ni `force`.
- [x] Repetir la suite de compra en Pixel 5 aislado, además de Chromium escritorio; capturar e inspeccionar PC y 393×851/320×568.

Evidencia actual, `shopping-round6.spec.ts` aislado con rate limit activo, SQLite/puerto/semilla temporales únicos: Chromium **12 passed, 3 skipped** (solo escenarios móviles omitidos) y Pixel 5 **14 passed, 1 skipped** (solo escritorio omitido). Las capturas PC/móvil quedaron bajo `.e2e-screenshots/shopping-final-desktop/` y `.e2e-screenshots/shopping-final-mobile-verified/`; las de 320 px verifican navegación y ancho sin scroll horizontal.

### QA-04c.5 · autocomplete bloquea «Añadir» en móvil (resuelta)

En la línea base Pixel 5, el listbox de `.detail__sugs` aparecía debajo del input como `position:absolute; z-index:40` y cubría acciones de `.detail__add` al envolver en móvil la segunda fila del formulario. `HOGARIA-SPEC.md` §8e/§8f exige captura rápida, lista accesible y acciones funcionales con una mano; no debe necesitar Escape de escritorio para poder pulsar Añadir. El estado vigente cambia el listbox a flujo estático a ≤600 px.

Hallazgo intermedio histórico: después del primer reflujo CSS, un hit-test DOM no coincidía con el botón aunque el CTA era visible; el test inicialmente usó `.click()` y el snapshot mostraba el input reiniciado tras la acción. La validación final sustituyó el hit-test frágil por `tap()` real, comprobó cantidad persistida y pasó en ambos viewports.

- [x] Reproducir en Pixel 5 real del proyecto: click de puntero en `add-submit` con sugerencias visibles es interceptado; 3 casos de `shopping-round6` se detienen ahí. Captura synthetic del overlay inspeccionada.
- [x] Contrastar el comportamiento con el markup (`role=combobox`, `aria-autocomplete=list`, `role=listbox/option`, `mousedown.preventDefault`) y la capa absoluta/z-index; desktop Chromium puede usar el flujo actual.
- [x] Escribir regresión móvil con sugerencias visibles; el primer `elementFromPoint()` fue intermitente durante la transición de vista aunque el CTA se veía, por eso el test final usa `tap()` real y verifica el estado guardado, sin `force` ni Escape.
- [x] Refluir el listbox en móvil dentro del formulario; preservar toque a sugerencia, flechas/Enter/Escape, foco y entrada libre.
- [x] E2E quick-add móvil: en 393×851 envía texto libre con cantidad; en 320×568 el envío repetido fusiona cantidad (2→4) sin fila duplicada ni selección accidental; además añade una sugerencia táctil y otra con teclado, sin scroll horizontal ni `pageerror`.
- [x] Repetir `shopping-round6` completa en escritorio y Pixel 5 a 393×851/320×568; capturas sintéticas inspeccionadas. El test de toque real pasa 1/1 focalizado y el proyecto móvil 14/15 (un skip de escenario exclusivo de escritorio).
- [x] Probar `tap()` táctil real sobre Añadir con sugerencias abiertas en ambos anchos; verificar una sola alta/fusión por acción y que el autocompletado no se elija accidentalmente.

### QA-04c.6 · selector de descuento bloquea Guardar en hoja móvil (resuelta)

La revalidación de `shopping-round6.spec.ts` en Pixel 5 pasó 11/12. En «Descuento de la lista», tras elegir `10 %`, el click real a `discount-save` queda interceptado por la opción `50 %` del listbox; la captura synthetic muestra el panel abierto cubriendo el CTA al pie de la hoja. Causa probable respaldada por el DOM: `app-picker` (con su botón interactivo interno) está envuelto por `<label class="detail__field">`; al elegir una opción el panel se cierra, pero la activación por defecto del label puede volver a pulsar el trigger y reabrirlo. La prueba genérica del picker cierra con éxito fuera de ese wrapper. No afecta al run desktop observado.

- [x] Reproducir en Pixel 5 aislado con rate limit: 11/12; `locator.click()` sobre Guardar agotó 45 s y Playwright identificó `.picker__label` «50 %» interceptando el puntero.
- [x] Inspeccionar `PickerComponent.choose()` → `emit()` → `close()` y el wrapper `<label>` de descuento; el label re-activa el trigger descendiente tras elegir la opción.
- [x] Añadir regresión enfocada: tras elegir se exige panel ausente y `aria-expanded=false` antes de pulsar Guardar. Rojo Pixel 5 aislado: esperado 0 paneles, recibido 1 (12 s); la versión previa agotó el click a Guardar en 45 s.
- [x] Escribir prueba unitaria del picker para nombre accesible, selección/cierre, Escape y click exterior; Karma enfocada rojo 1 FAILED / 2 SUCCESS (`aria-label` actual es null), mientras selección/cierre normal pasa.
- [x] Validar que Guardar recibe la acción en móvil y mantener teclado/Escape/click exterior.
- [x] Corregir el wrapper `<label>` interactivo con un contenedor no-label; comprobar 1440×900, 393×851 y 320×568 con E2E, captura y estado cerrado antes de Guardar.

Evidencia: las pruebas unitarias del Picker (13/13), build y suites `shopping-round6` de Chromium/Pixel 5 pasan; la selección de 10 % no reabre el panel y el descuento se guarda/retira. La cobertura por archivo del Picker supera 70 % en las cuatro métricas.

### QA-04c.7 · filtro del selector no reacciona al texto escrito (resuelta)

Al ampliar las pruebas del control compartido, una regresión unitaria real detectó que `filtered` es un `computed` que lee `query` como propiedad ordinaria. El `ngModel` actual modifica el texto visible, pero no invalida el valor memoizado: al buscar por pista o valor el listado completo sigue presente y Enter elige la primera opción en vez de la escrita. Esto afecta a los pickers con buscador (p. ej. unidades/catálogos) aunque el selector de porcentaje no muestre campo por su `filterFrom` alto.

- [x] Escribir unit de búsqueda por valor, pista, texto libre y Enter exacto; Karma enfocada da 7 SUCCESS / 1 FAILED: `filtered()` devuelve las 4 opciones tras teclear `Fresco` y, ante texto desconocido, Enter elige `10`.
- [x] Convertir query y opciones en estado reactivo; filtrar label/value/hint y conservar coincidencia exacta, custom, vacíos y reset/foco al abrir/cerrar.
- [x] Añadir E2E real en el selector de unidad; buscar cero coincidencias, texto custom, flechas/Enter/Escape, persistencia tras reload y nombre accesible en escritorio/móvil.
- [x] Ejecutar unitarias focalizadas (13/13), coverage de picker ≥70 % (96.90/92.42/100/97.37), build y E2E responsive; capturas 1440×900, 393×851 y 320×568 inspeccionadas.
- [x] En el E2E real, filtrar `250`, confirmar con ArrowDown+Enter y elegir label exacto `g` aunque `kg` anterior lo contenga como substring.
- [x] Evitar doble procesamiento del keydown en el input; el espacio no confirma una opción, y cada Enter emite una sola selección.

La regresión quedó reproducida antes de corregir: Karma focalizada 13 tests, 3 fallidos. Con query `g`, `kg` (substring anterior) ganaba; ArrowDown+Enter emitía dos veces por propagación al listbox; espacio seleccionaba/cerraba. El test final pasa 13/13.

Revalidación E2E en `shopping-round6.spec.ts`: búsqueda exacta/texto custom/Escape/persistencia, ArrowDown+Enter y el caso exacto `g` pasan en Chromium 1440×900 y Pixel 5 a 393×851/320×568. En el primer run estrecho aparecieron cuatro errores de transición; las ejecuciones actuales ya no los reproducen y el test comprueba `pageerror` vacío tras reload.

### QA-04c.8 · valor anunciado y opciones dinámicas de `app-picker`

La revisión del diff señaló dos riesgos reales: el `aria-label` podía omitir el valor elegido y `filtered`/`rows` no se invalidaban cuando cambiaban las opciones mientras el panel seguía abierto.

- [x] Reproducir el nombre accesible en navegador después de seleccionar una opción, con label explícito y fallback; comunica propósito/valor y conserva `aria-expanded`/listbox.
- [x] Cambiar opciones mientras panel/búsqueda está abierto; listado, filtro y agrupaciones se actualizan sin reabrirlo.
- [x] Tests TDD cubren nombre accesible, opciones dinámicas, teclado, custom, selección/deshabilitado y click exterior.
- [x] Ejecutar unit 13/13, Playwright real PC/móvil, build y coverage del Picker 96.90/92.42/100/97.37 %.

### QA-04c.9 · desbordamiento horizontal de la shell de compra a 320 px (resuelta)

En la línea base Pixel 5 aislada a 320×568, `clientWidth` era 320 y `scrollWidth` 343; la shell y `.tray__tabs` excedían el viewport. Se observaron errores de `withViewTransitions()` en una ejecución temprana; no deben confundirse con el overflow ni con la revalidación actual.

La primera hipótesis de que solo los labels de bottom-nav imponían el ancho quedó refutada. El arreglo vigente combina anchors flexibles de navegación y reducción/truncado responsivo de la fila de filtros; el control oculto conserva nombre accesible y contador.

Medición directa posterior: `.tray__tabs` está en x=16..304 (288 px) pero su `scrollWidth` es 327; los botones «Activas», «Terminadas», «Todas» y «Filtros» consumen el ancho intrínseco, y el último acaba en x=343. La corrección debe mantener el nombre accesible/contador del filtro y objetivos táctiles ≥44×44 px; truncar u ocultar solo el texto visible requiere proporcionar el nombre del control explícitamente.

- [x] E2E Pixel 5 comprueba ancho, scroll y rectángulos de bottom-nav/filtros en `/shopping` a 320×568 y 393×851.
- [x] Corregir fila de estados/filtros y shell, conservando nombre/contador accesible, destinos ≥44×44 px y navegación.
- [x] Confirmar ancho raíz sin overflow en ambos viewports y `pageerror` vacío en la revalidación completa.
- [x] Capturar/inspeccionar PC y móvil estrecho; build y tests contra servidor/SQLite aislados, dejando intactos server 4200 y la base normal.

Evidencia QA-04c.9: E2E de bandeja y selector miden root `scrollWidth ≤ clientWidth`, tabs sin overflow y controles/nav dentro del viewport a 393×851 y 320×568; la suite Pixel 5 completa pasa 14/15 (un skip de escritorio). Capturas finales bajo `.e2e-screenshots/shopping-final-desktop/` y `.e2e-screenshots/shopping-final-mobile-verified/`. Las cancelaciones de transición observadas en el baseline no se reprodujeron en el test actual.

### QA-04b · hit area táctil de `app-checkbox`

**Hallazgo reproducido y causa:** la línea base de `checkbox.component.ts` declaraba `min-height: 36px` y no fijaba el ancho; el E2E aislado midió el control real antes del cambio por debajo del mínimo interno. Tras subir el CSS a 44×44, la primera medición encontró 42.49 px durante la animación `scaleIn` del modal; el test espera ahora a que finalicen las animaciones y mide el rectángulo estable.

**Criterio de aceptación:** el contrato de producto pide ≥40 px, mientras que `AGENTS.md` fija ≥44×44 px para objetivos táctiles; se aplicará el criterio interno más estricto, midiendo el rectángulo real del botón en navegador (no solo su CSS declarado), sin cambiar nombre accesible ni semántica.

- [x] Añadir regresión que mide el rectángulo real de `button[role=checkbox]` en Chromium escritorio y Pixel 5 móvil; la unidad comprueba disabled/outputs y la E2E nombre, `aria-checked`, foco, Space y Enter sin cambiar semántica.
- [x] Corregir el tamaño mínimo con CSS `min-width`/`min-height: 44px`; Calendario alcanza ≥44×44 px en navegador a 1440×900, 393×851 y 320×568, sin overflow horizontal ni solapamiento visible en capturas inspeccionadas.
- [x] Ejecutar Karma (3/3), Playwright real (Chromium 1/1; Pixel 5 2/2) para abrir, operar y cancelar el formulario; capturas sintéticas PC/móvil conservadas bajo `.e2e-screenshots/calendar-checkbox-final/` e inspeccionadas.
- [x] Cobertura del alcance `checkbox.component.ts`: 100 % statements, ramas, funciones y líneas; gate configurado del 80 % intacto. La ejecución focalizada excluyó únicamente `ui/icon/**`, dependencia fuera del alcance, para medir este componente.

Evidencia QA-04b (2026-09-30): Playwright aislado con `E2E_RATE_LIMIT=on`, proyecto `chromium` (1/1) y `mobile-chrome` Pixel 5 (2/2), cada ejecución con puerto y SQLite únicos bajo `%TEMP%`; no se usó el servidor/base de datos normal. Karma focalizada con Chrome Headless 154 y umbral configurado sin cambios: 3/3; cobertura de `checkbox.component.ts` 100/100/100/100. Build de producción ya completado para servir la compilación actual; `tsc -p tsconfig.e2e.json --noEmit` y `git diff --check` pasan. Capturas: `calendar-checkbox-desktop-1440x900.png`, `calendar-checkbox-mobile-393x851.png` y `calendar-checkbox-mobile-320x568.png`.

**Hallazgos QA-04 resueltos:** las credenciales de sesión heredadas no se limpiaban al hacer logout, el observable de AuthService dejaba salir wrappers `{data:...}`, y `ModulesService.apply()` no liberaba `isSaving` al recibir `error`. Los demás fallos basales eran mocks/expectativas obsoletas. El test de Settings confirma rollback, desbloqueo y reintento por teclado en tamaños desktop y móvil; aún queda revisar visualmente el toast de error en el flujo móvil porque la captura full-page lo muestra sobre la barra fija de navegación, sin clasificarlo todavía como defecto reproducible en viewport.

### Discrepancias que requieren prueba/decisión

- [x] Dashboard/recetas: rutas para receta concreta y modal de generación resueltas con decisión y evidencia TDD en QA-04c.11; otras superficies pendientes de `/dashboard` siguen abiertas en la checklist funcional.
- [x] Revalidación aislada actualizada de `shopping-round6.spec.ts` contra vista y contrato actuales: los cuatro fallos antiguos ya no se reproducen. El input existe tras crear/abrir lista; «seleccionar todo» muestra la barra en la pestaña visible; la foto presenta `409 AI_NOT_CONFIGURED` y su error inline; el selector actual `[data-test="discount-amount"]` es el propio input. Playwright con servidor/SQLite/puerto/semilla temporales y rate limit activo: Chromium 12 passed/3 skips esperados y Pixel 5 14 passed/1 skip esperado; verificado de nuevo en esta corrida.
- [ ] La configuración `playwright.full-stack.config.ts` tiene la asignación de `DATABASE_PATH` dentro de un comentario. Corregir/aislar antes de usar esa configuración en local.
- [ ] La suite E2E de desarrollo puede reutilizar `:4200` y la base de datos por defecto. No correr pruebas con escritura contra la instancia/base de datos de uso normal.
- [ ] Hay umbral de cobertura frontend del 80 % y backend del 70 % en la configuración local; CI ejecuta cobertura del backend, pero no se encontró un job de cobertura frontend. Confirmar los gates y cerrar la diferencia sin rebajar umbrales.

## Checklist funcional por pantalla

En cada flujo probar: camino válido, validación/límites, doble envío, carga, fallo de red/servidor, recuperación/reintento, cancelar/volver, recarga/persistencia, teclado, nombres largos y confirmación antes de borrar o perder cambios.

### Acceso y primer uso

- [ ] `/auth/login`: correo/contraseña válidos e inválidos, campos vacíos, revelar/ocultar contraseña, loading, error genérico y redirección correcta.
- [ ] `/auth/register`: requerido/formato, política de contraseña y límites, correo duplicado, error del servidor, registro normal y retorno con `?code=` de invitación.
- [ ] `/auth/forgot-password`: correo vacío/mal formado/válido, respuesta que no revela si existe la cuenta, loading y error recuperable.
- [ ] `/invite/:code`: código válido, inválido/caducado, invitación repetida, ya pertenece al hogar, aceptar/rechazar con sesión y entrada por registro/login preservando el código.
- [ ] `/onboarding`: seis pasos; siguiente/anterior, omitir paso/tour, seleccionar y quitar alergias/gustos/objetivos, objetivo personalizado, horarios, utensilios, guardar, recargar o salir a mitad y reanudar/terminar.

### Navegación y superficies de hogar

- [ ] Shell autenticado: redirección de ruta privada sin sesión; menú lateral, overlay, botón cerrar, Escape, bottom-nav, sidebar de escritorio, cuenta/avatar, cerrar sesión y cola de tickets; verificar ruta directa y atrás/adelante.
- [ ] `/dashboard`: estados con/sin datos, resumen, vencimientos, comidas/recetas y cada CTA; verificar los destinos anotados en discrepancias.
- [ ] `/household`: crear hogar, unirse por código, código incorrecto, copiar/regenerar invitación, miembros/roles, permisos para compartir, salir del hogar y estados sin hogar.
- [ ] `/account`: tabs y URL, editar/cancelar nombre, seguridad/cambio de contraseña, cerrar sesión, información de cuenta; avatar: formatos/tamaño permitidos, recorte, zoom, recentrar, cancelar, subir, quitar, error y persistencia.
- [ ] `/preferences`: tabs/URL y recarga, perfil, alergias, gustos, comidas/horas y objetivos; añadir/quitar opciones personalizadas, guardar/descartar, aviso de cambios sin guardar y enlaces a onboarding/despensa.
- [ ] `/settings`: tema claro/oscuro/sistema, idioma ES/EN, módulos habilitar/deshabilitar, reinicio/persistencia y rutas directas con módulo oculto.

### Cocina, despensa y planificación

- [ ] `/pantry`: ingredientes/utensilios, búsqueda, filtro/categoría, orden, paginar/seleccionar, lote, cantidad/unidad, alta/edición/borrado y sugerencias; estados vacío, sin resultados, error y recarga.
- [ ] `/pantry/caducidades`: fechas ausentes/pasadas/próximas, orden y filtros, estado vacío y navegación de vuelta a la ficha.
- [ ] `/pantry/inventario/:id` y `/editar`: ficha válida/no encontrada, atributos, historial/precios, editar/cancelar/guardar, aliases/código de barras, error y borrar observación con confirmación.
- [ ] `/pantry/categories[/:id]` y `/pantry/products[/:id]`: buscar/filtrar/ordenar, alta/edición, padres/aliases, selección y acciones por lote, protección de registros en uso, validación y confirmaciones.
- [ ] `/pantry/catalogo`: búsqueda, pasillos/categorías, query string, filtros/paginación, alta individual y por lote, ya existente/en inventario, quitar con confirmación y persistencia al volver.
- [ ] `/recipes`: filtros/tabs, favoritos, detalle, cocinar, temporizadores y vuelta; generar 1/3 recetas, ingredientes/utensilios, restricciones/dificultad/raciones/detalle, error/vacío, guardar y cancelar.
- [ ] `/calendar`: día/semana/mes, anterior/siguiente/hoy/salto a fecha, filtros, recarga/error; alta/edición/borrado de comidas y eventos, recurrencia/instancia, invitados, horarios, completado y confirmación.
- [ ] Planificación IA desde calendario: objetivo/fechas/tipos de comida/exclusiones/preferencias, loading/error/reintento, aplicar o cancelar y cambios persistidos sin duplicar comidas.

### Compra, tickets, proveedores y observabilidad

- [ ] `/shopping`: crear/renombrar/borrar lista, tienda, tabs abiertas/completadas, búsqueda/filtros/orden/páginas, completar/reabrir y sugerencias.
- [ ] `/shopping/:id`: alta rápida/typeahead/teclado/pegado multilínea/foto, marcar y editar items, selección/lote, unidades/cantidad/precio/oferta/descuento/cupón, carro pendiente/comprado, subtotal/total, vaciar/finalizar, reabrir, inventario, auditoría en vivo y volver tras recarga.
- [ ] Interacciones móviles de compra: swipe sin disparos accidentales, modal/sheet, selector de unidad, teclado virtual, controles de precio/cantidad accesibles y contenido desplazable sin tapar el CTA.
- [ ] `/receipts`: elegir/arrastrar archivo, formatos/tamaño soportados y rechazados, estados de cola, detener/reintentar/quitar, concurrencia y volver a abrir ticket desde cola.
- [ ] `/receipts/:id`: OCR/IA, edición de tienda/notas/líneas/unidad/cantidad/precio/oferta, añadir/quitar, total que cuadra/no cuadra, confirmar a inventario, detener/reintentar/borrar y fallo de proveedor.
- [ ] `/ai-config`: alta/edición/borrado, campos y rangos, mostrar/ocultar clave, probar desde formulario y desde ficha, loading/éxito/error/timeout, activar una sola config y conservar el secreto sin exponerlo.
- [ ] `/logs`: conexión SSE/reconexión, pausar/reanudar/autoscroll, filtrar fuente/nivel, seleccionar/copiar líneas o todo, borrar con confirmación y cola de logs vacía/larga.

## Matriz responsive, visual y accesibilidad

- [ ] Barrido de **todas las rutas** en 320, 360, 390/393, 430, 768, 1023, 1024, 1280 y 1440 px; guardar ruta, viewport, overflow y errores por página.
- [ ] Cubrir móvil vertical y horizontal (mínimo 844×390 y 932×430), tablet vertical/horizontal y escritorio. Mantener pruebas de dispositivo real emulado Android/Chromium e iOS/WebKit además del cambio de ancho.
- [ ] Para cada breakpoint usado por una pantalla, probar `B−1`, `B` y `B+1` px; buscar breakpoints de nuevo en los estilos fuente al iniciar cada tarea.
- [ ] En cada flujo crítico móvil revisar viewport sin overflow horizontal, scroll real, safe-area, teclado virtual, modales/hojas, tablas/listas, botones fijos y orientación; el contenido no debe quedar tras header/nav/teclado.
- [ ] Revisar cada control por nombre accesible, label/error asociado, foco visible/orden lógico, teclado/Escape, estado disabled/loading, contraste WCAG AA, tamaño táctil objetivo ≥44×44 px y zoom de texto.
- [ ] Guardar capturas comparables de escritorio (1440×900) y móvil (390×844 y 320×740) por pantalla modificada, antes/después. Adjuntar al reporte/PR; no guardar datos personales ni credenciales en capturas.

## Datos, proveedor IA y privacidad de la prueba

- [ ] Preparar fixtures deterministas con usuario(s), hogar, invitación, despensa, utensilios, listas, ticket/archivo y configuración de IA; cada run debe usar una SQLite temporal y semilla única.
- [ ] Verificar que la suite puede crear/leer/borrar solo sus propios datos; no usar la base normal del dev server ni reutilizar `localhost:4200` para pruebas con escritura. No limpiar ni restaurar datos ajenos.
- [ ] Los E2E repetibles deben usar proveedor stub/mock controlado. Separar el smoke del proveedor LAN real, opt-in, con timeout/límites y `API_KEY` desde variable de entorno o almacén de secretos; nunca escribir token/URL con credenciales en git, spec, fixture, screenshot, trace, video o logs.
- [ ] Probar fallo del proveedor, respuesta mal formada/ilegible, 4xx/5xx, desconexión, timeout, reintento y concurrencia sin claves reales.

## Cierre y evidencia requerida

- [ ] Antes de corregir, ejecutar baseline reproducible y separar fallos previos, fallos de entorno y regresiones; después aplicar TDD y actualizar esta checklist en cada unidad de trabajo.
- [ ] Tests unitarios e integración enfocados + Playwright real sobre servidor y navegador para cada flujo afectado; casos borde y estados de error incluidos. Ejecutar la matriz de navegadores/tamaños, no solo enumerar los tests.
- [ ] Cobertura de líneas, ramas, funciones y statements de al menos 70 % para el alcance probado, sin bajar gates existentes (frontend configurado en 80 %; backend en 70 % para la allowlist cubierta); registrar cualquier limitación del gate de CI.
- [ ] Sin errores de consola/red no explicados, rutas rotas, pérdidas de datos ni regresiones visuales; todas las casillas aplicables marcadas con evidencia.
- [ ] Informe final con resumen, comandos/resultados, defectos corregidos/pendientes, capturas PC+móvil y enlaces a los commits/PR. No mergear sin permiso explícito.

## Siguiente unidad de trabajo

1. QA-04a: completada con suite `488/488`, regresiones de servicio y Playwright Chromium/Pixel `2/2` por proyecto; el gate de coverage sigue abierto en QA-04c.
2. QA-DASH.1: resuelta; continuar con QA-PANTRY.1 para corregir la acción de alta manual obstruida en móvil, tras medirla en viewport.
3. QA-04b checkbox: completada con Karma y Playwright real en escritorio/Pixel 5 (incluido 320 px); investigar por separado el posible solapamiento visual del toast de error en móvil.
4. QA-04c: subir la suite frontend al gate global de coverage 80 %, en unidades revisables, revalidando fuentes antes de cada lote.
5. Corregir la configuración permanente de Playwright full-stack: su `DATABASE_PATH` sigue comentado; conservar aislamiento del servidor/DB de uso normal.
6. QA-05: resolver en la fuente de verdad las 13 incidencias i18n `texto-en-un-catalogo` y agregar tests/regresión.
7. Continuar el barrido funcional de rutas, formularios y acciones con captura de consola/red/overflow; Dashboard/recetas ya tiene su resolución de ruta en QA-04c.11.
