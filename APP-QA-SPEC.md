# Spec: auditoría funcional y responsive de HogarIA

- **Estado:** inventario inicial hecho; unidad de compra QA-04c revalidada en escritorio y móviles estrechos; el barrido funcional/responsive del resto de pantallas sigue pendiente
- **Actualizado:** 2026-09-30

**Contrato de producto:** [`HOGARIA-SPEC.md`](./HOGARIA-SPEC.md)

Esta spec convierte la petición de revisar toda la app en una lista verificable. No presupone que las pantallas funcionan porque exista un test: cada casilla se marca después de probar el comportamiento en el navegador y guardar evidencia reproducible.

## Alcance y fuente de verdad

- Se revisan las rutas y pantallas que existen hoy, sus formularios, botones, estados vacíos/de error, navegación, persistencia y diseño responsive.
- Para lo que existe hoy mandan `frontend/src/app/app.routes.ts`, las rutas/componentes de cada feature y el comportamiento observado. `HOGARIA-SPEC.md` define las decisiones de producto activas; documentos históricos no sustituyen al código actual.
- No se añaden funcionalidades nuevas solo porque aparezcan en una spec antigua. Si código, texto de interfaz y contrato activo discrepan, primero se anota y decide la conducta esperada.
- Cada casilla cerrada debe enlazar a un test o anotar comando, navegador, datos y resultado. Una lista de tests enumerada no equivale a una lista ejecutada.

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

### QA-04c.11 · enlaces de recetas y generación IA desde el Dashboard (en curso)

**Fuente activa y decisión antes de codificar:** `app.routes.ts` declara `/recipes` pero `recipes.routes.ts` solo declara `path: ''`; el `*` envía `/recipes/:id` al Dashboard. La pantalla de Recetas enseña el detalle en un modal (`viewRecipe`) y ya ofrece la API autenticada `GET /api/recipes/:id`. Por tanto, la tarjeta sugerida conservará su destino concreto con `?recipe=<id>` y abrirá ese modal existente; no se creará una segunda vista de detalle. Los CTA Dashboard existentes llevan `#ai`, así que cargar/navegar a ese fragmento abrirá el modal de generación sin enviar una petición al proveedor. Al cerrar cualquiera de los modales, su estado URL se limpiará; un id inexistente debe volver a la lista sin dejar un destino roto.

**Hallazgos TDD durante la integración:** el primer test rojo reprodujo que el click original acababa en `/dashboard`; al reencaminarlo, la modal de detalle aparece pero la ficha queda vacía porque `RecipeService.getRecipe()` devuelve `{ success, data }` como si fuese `Recipe`. El modal IA también conserva un `h2` vacío: el template asigna `[attr.title]` en vez del `@Input() title` de `app-modal`, dejando al diálogo sin nombre accesible. La prueba unitaria de servicio red (3/8 fallos) destapó además que `createRecipe()` y `deleteRecipe()` filtran el envelope de API hacia fuera pese a que sus firmas prometen `Recipe | null` y `boolean`; esta unidad normaliza ambos retornos.

**Hallazgo responsive adicional (Pixel 5 estrecho 320×568):** el E2E midió 302 px de contenido de acciones en 240 px disponibles: el segundo botón de `.ai-form__actions` quedaba cortado horizontalmente porque la regla móvil solo apilaba los campos. Las acciones ahora se apilan, ambos botones se miden dentro de la fila y viewport y el test espera una vista estable antes de capturar.

**Hallazgo responsive de la ficha (Pixel 5 320×568):** tras abrir el deep link a 320 px en un documento nuevo, `.recipe-detail__actions` también desborda: la fila mide 332 px de contenido dentro de 240 px disponibles. El primer intento de E2E se detuvo ante esta aserción y dejó el fixture sintético sin borrar; el siguiente caso falló en cascada por encontrar esa receta. La prueba debe limpiar su receta propia en `finally`, incluso si una aserción falla.

- [ ] TDD E2E con receta sintética creada por API en SQLite temporal: la tarjeta sugerida del Dashboard abre la receta concreta en desktop y Pixel 5; recargar el deep link conserva modal/contenido; cerrar vuelve a `/recipes` y quita `recipe`.
- [ ] TDD E2E del CTA principal y del estado vacío: seguir `#ai` abre el formulario accesible tanto al navegar desde Dashboard como al cargar `/recipes#ai`; cerrar limpia el fragmento y no llama a IA.
- [ ] Refluir las acciones de la modal IA a 320 px y medir ambos botones completos dentro del viewport; mantener scroll vertical usable y comprobar 393×851/320×568.
- [ ] Refluir también las acciones de la ficha a 320 px; medir «Cocinar ahora» y «Añadir a favoritos» completos en su contenedor y viewport, con espacio bajo los botones.
- [ ] Limpiar siempre la receta sintética E2E con `finally`, para que una aserción fallida no contamine casos posteriores.
- [ ] Probar `/recipes?recipe=missing` como borde: mantener la página de Recetas, no abrir detalle vacío ni caer en Dashboard, limpiar el id inválido con una salida recuperable.
- [x] Corregir `RecipeService.getRecipe()` para desempaquetar el DTO; unit test cubre éxito/error y `currentRecipe`.
- [ ] E2E comprueba nombre/descripción/ingredientes reales del detalle abierto por deep link.
- [x] Alinear `createRecipe()` y `deleteRecipe()` con sus tipos de salida (`Recipe | null` y `boolean`); los tests comprueban payload y persistencia de la señal al fallar.
- [ ] Corregir el binding del título del modal IA a su `@Input()`; E2E confirma el nombre accesible del diálogo al navegar y al cargar `#ai` directamente.
- [ ] Añadir pruebas unitarias de resolución de intención de ruta (incluida precedencia entre `recipe` y `#ai`).
- [x] La cobertura de `RecipeService`, con la prueba focal aislada, supera el 70 % de statements, ramas, funciones y líneas sin bajar gates.
- [ ] Revisar patrones de ruta/template y ejecutar typecheck/build, pruebas aisladas desktop/Pixel 5 y capturas sintéticas PC/móvil inspeccionadas.

**Evidencia parcial — contrato del servicio (2026-09-30):** prueba focal `ng test` con solo `recipe.service.spec.ts`: **8/8**. Cobertura informada: statements **100 % (59/59)**, ramas **80 % (8/10)**, funciones **100 % (30/30)** y líneas **100 % (47/47)**; el gate local de Karma se mantiene en 80 % en cada métrica. El runtime de deep links y las capturas quedan pendientes para la unidad de integración siguiente.

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

- [ ] Dashboard/recetas: discrepancia reproducida en fuentes actuales; decisión de comportamiento y checklist TDD anotados en QA-04c.11.
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
2. QA-04c.10: corregir el destino roto del error «Falta configurar la IA» con prueba real que siga el enlace; no tocar proveedor/token.
3. QA-04b checkbox: completada con Karma y Playwright real en escritorio/Pixel 5 (incluido 320 px); investigar por separado el posible solapamiento visual del toast de error en móvil.
4. QA-04c: subir la suite frontend al gate global de coverage 80 %, en unidades revisables, revalidando fuentes antes de cada lote.
5. Corregir la configuración permanente de Playwright full-stack: su `DATABASE_PATH` sigue comentado; conservar aislamiento del servidor/DB de uso normal.
6. QA-05: resolver en la fuente de verdad las 13 incidencias i18n `texto-en-un-catalogo` y agregar tests/regresión.
7. Continuar el barrido de rutas y acciones con capturas de consola/red/overflow. Resolver el destino de Dashboard `/recipes/:id` con conducta actual observada antes de cambiar el router.
