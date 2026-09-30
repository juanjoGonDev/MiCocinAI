# Spec: auditoría funcional y responsive de HogarIA

- **Estado:** inventario inicial hecho; baseline Chromium parcial; auditoría funcional y móvil pendiente
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

La ejecución completa más reciente de Karma es `488/488` specs sin fallos de aserción, pero **falla el gate existente de 80 %**. Cobertura global: sentencias `78.88 %` (1648/2089), ramas `64.87 %` (676/1042), funciones `76.84 %` (385/501), líneas `80.40 %` (1432/1781). El umbral no se ha rebajado ni se ha desactivado instrumentation.

- [x] Revalidar cobertura global y por archivo antes de iniciar el siguiente lote; guardar el informe aislado bajo `%TEMP%`.
- [ ] Añadir pruebas unitarias/integración para ramas y caminos de error/éxito no cubiertos; cada lote debe partir de fuentes actuales, tener regresión útil, cobertura ≥70 % en cada métrica del alcance y commit atómico.
- [ ] Repetir la suite frontend completa con coverage y alcanzar 80 % en statements, ramas, funciones y líneas; documentar comandos y salidas, sin bajar umbrales.

Cobertura por archivo en el informe completo más reciente (`%TEMP%\hogaria-qa04-full-5b0805ce187e48a180ffdb9db379ca06-coverage\lcov.info`; orden: statements/branches/functions/lines): `auth.service.ts` 100/81.82/94.59/100 %, `theme.service.ts` 96.67/92.86/87.50/96.67 %; ambos superan el mínimo de alcance. Candidatos con lógica activa por revalidar antes de cada lote: `shopping.model.ts` 79.22/62.40/66.67/79.22 %, `error.interceptor.ts` 7.89/0/0/7.89 %, `swipe-row.directive.ts` 10.09/11.11/11.76/10.09 %, `core/time.ts` 86.75/57.83/95/86.75 %, `data-table.util.ts` 95.86/78.77/100/95.86 %, `i18n.service.ts` 61.70/23.68/61.54/61.70 %, `household.service.ts` 1.79/0/0/1.79 % y `taste-profile.service.ts` 3.33/0/0/3.33 %.

**Siguiente subunidad QA-04c.1 — modelo de ofertas/descuentos de compra (fuente revalidada):** `HOGARIA-SPEC.md` §12h define `buy:3,take:2` como una oferta 3×2; el preset activo lo representa como `{ label:'3x2', buy:3, take:2 }`. `shopping.model.ts::describeOffer` devuelve actualmente `${buy}x${buy-take}` (3x1) y la plantilla de `shopping-list-detail.component.ts` lo pinta en la chapa accesible de cada fila; Playwright real ya reprodujo el texto visible y accesible «3x1». Los helpers puros `lineDiscountOfItem`, `describeLineDiscount`, `offerOfItem` y `describeOffer` son usados por la pantalla activa; `shopping.model.spec.ts` no los cubre. El normalizador de backend `server/src/utils/list-discount.ts::normalizeOffer` exige `buy ≥ 2`, `take ≥ 1` y `take < buy`, por lo que el helper cliente debe ignorar también filas inválidas. Criterios:

- [x] Reproducir antes de cambiar código con Playwright real: `shopping-round6.spec.ts` Chromium (build/servidor/SQLite/semilla/puerto temporales únicos; rate limit activo) falla de forma concreta: preset «3x2» deja texto visible y title accesible «Oferta 3x1»; screenshot sintético retenido fuera de Git.
- [ ] Primero extender las pruebas unitarias de `shopping.model.spec.ts` para valores ausentes, 0/negativos/no válidos, amount/percent, campos ausentes, límite de unidades y singular/plural; incluir `describeOffer({buy:3,take:2}) === '3x2'` para reproducir el error del nombre visible.
- [ ] Cubrir ofertas ausentes/0, `buy < 2`, `take < 1`, `take >= buy` y al menos presets válidos 3×2/2×1; no cambiar el contrato matemático de `HOGARIA-SPEC.md` §12h.
- [ ] Ejecutar el test focalizado en rojo antes del cambio y luego verde; corregir el helper mínimo y medir ≥70 % de las cuatro métricas de `shopping.model.ts`.
- [ ] Validar la chapa y su nombre accesible con Playwright real en escritorio y móvil usando `shopping-round6.spec.ts` contra servidor/SQLite temporales; capturar PC y móvil sin datos personales.

### QA-04b · hit area táctil de `app-checkbox`

**Discrepancia revalidada:** `HOGARIA-SPEC.md` §8f exige un área de toque de 40 px, pero `checkbox.component.ts` establece `min-height: 36px`. El test unitario actual no mide el tamaño real y, además, lee `aria-checked` antes de ejecutar change detection.

- [ ] Añadir primero una regresión que mida el rectángulo real de `button[role=checkbox]` en Chromium; probar disabled y teclado/foco sin cambiar semántica ni nombre accesible.
- [ ] Corregir el tamaño mínimo con el cambio CSS más pequeño; demostrar altura ≥40 px en la instancia real de Calendario en móvil y escritorio, sin overflow ni solapamiento.
- [ ] Ejecutar unit tests y Playwright real para el formulario/event sheet afectado; capturar PC y móvil con fixtures sintéticos e inspeccionar las imágenes.
- [ ] Registrar porcentajes de statements, ramas, funciones y líneas del alcance (cada uno ≥70 %), manteniendo los gates configurados.

**Hallazgos QA-04 resueltos:** las credenciales de sesión heredadas no se limpiaban al hacer logout, el observable de AuthService dejaba salir wrappers `{data:...}`, y `ModulesService.apply()` no liberaba `isSaving` al recibir `error`. Los demás fallos basales eran mocks/expectativas obsoletas. El test de Settings confirma rollback, desbloqueo y reintento por teclado en tamaños desktop y móvil; aún queda revisar visualmente el toast de error en el flujo móvil porque la captura full-page lo muestra sobre la barra fija de navegación, sin clasificarlo todavía como defecto reproducible en viewport.

### Discrepancias que requieren prueba/decisión

- [ ] Dashboard/recetas (fuente revalidada): `dashboard.component.ts:114` enlaza recetas sugeridas a `/recipes/:id`, pero `recipes.routes.ts` declara solo la ruta vacía y `app.routes.ts` redirige `**` al Dashboard. El E2E actual cubre estado vacío y atajos, no esa card con datos. Reproducir navegación y contrato con fixture aislado y resolver el destino esperado antes de modificar rutas; revisar también los `#ai`.
- [ ] E2E de `shopping-round6.spec.ts`: baseline aislado completo `6/11` pasa; además del defecto confirmado de oferta 3×2, fallan cuatro asserts que requieren revalidación separada antes de decidir conducta: falta `[data-test="add-input"]` tras crear lista, no aparece `[data-test="selection-toolbar"]`, error de foto «El modelo no está disponible ahora mismo» frente a expectativa «Falta configurar la IA», y ausencia de `[data-test="discount-amount"] input`. No corregir tests ni producción sin revisar ruta actual/contrato y reproducir cada caso individualmente.
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
2. QA-04b: reproducir/corregir y validar con Playwright el tamaño táctil del checkbox; aclarar el posible solapamiento visual del toast de error en móvil.
3. QA-04c: subir la suite frontend al gate global de coverage 80 %, en unidades revisables, revalidando fuentes antes de cada lote.
4. Corregir la configuración permanente de Playwright full-stack: su `DATABASE_PATH` sigue comentado; conservar aislamiento del servidor/DB de uso normal.
5. QA-05: resolver en la fuente de verdad las 13 incidencias i18n `texto-en-un-catalogo` y agregar tests/regresión.
6. Continuar el barrido de rutas y acciones con capturas de consola/red/overflow. Resolver el destino de Dashboard `/recipes/:id` con conducta actual observada antes de cambiar el router.
