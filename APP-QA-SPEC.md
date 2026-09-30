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
- Suite unitaria frontend completa (Chrome Headless 154, con coverage; 2026-09-30): 451/470 pasaron; 19 fallaron en `AuthService` (4), `authGuard` (2), `home-profile` (1), `ModulesService` (7), `CheckboxComponent` (1), `ThemeService` (3) y `ModalComponent` (1). `CheckboxComponent` también reproduce el fallo en la suite completa; las causas de este grupo siguen pendientes de diagnóstico en QA-04. Cobertura global: statements 75.52 %, ramas 62.18 %, funciones 72.92 %, líneas 76.76 %; no alcanza el gate local de 80 %. La reparación de esta suite queda pendiente y no se baja el umbral. QA-03, por separado, pasa su subconjunto unitario 38/38.

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

- Contrato: `server/src/schemas/auth.schema.ts::registerSchema`. Pruebas backend `node ./node_modules/vitest/vitest.mjs run src/schemas/auth-register-boundaries.spec.ts` — 3/3; Karma enfocado en Chrome Headless 154 — 38/38 (`input.component.spec.ts`, `register-form.validation.spec.ts`, `register.component.spec.ts`, `auth-register-context.spec.ts`). Para Karma local se generó y eliminó un launcher temporal `ChromeHeadlessSafe` por las restricciones GPU/sandbox de Chrome; el archivo no cambia el gate ni queda en el repo.
- Typecheck: `node ./node_modules/typescript/bin/tsc -p server/tsconfig.json` y `node ./node_modules/typescript/bin/tsc -p tsconfig.e2e.json --noEmit` — pasaron. Build frontend producción — pasó con warnings preexistentes de imports, bundle y estilos. Auditoría de CI (`.github/workflows/ci.yml`): servidor con gate de coverage 70 %/archivo, build producción y Playwright full-stack Chromium + mobile-chrome; no ejecuta Karma/frontend unit coverage, así que ese gate queda validado localmente.
- Playwright sobre build de producción y servidor real, puerto, SQLite, uploads y semilla únicos bajo `%TEMP%`, `RATE_LIMIT` activo y limpieza tras éxito: `tests/e2e/full-stack/register-contract.spec.ts` Chromium — 4/4; `mobile-chrome` (Pixel 5) — 4/4. Viewports sin overflow: escritorio 1023/1024/1440; móvil 320×740, 390×844 y horizontal 844×390. Capturas sintéticas ignoradas por Git: `.e2e-screenshots/registration-desktop.png` (1440×900) y `.e2e-screenshots/registration-mobile.png` (390×844). Revisadas visualmente.
- Interacción directa de solo lectura con el servidor dev existente `http://localhost:4200/auth/register`: Chromium escritorio y móvil revisaron campos, validación, ARIA y los mismos seis tamaños; 0 POST a registro. Capturas adicionales `.e2e-screenshots/dev-registration-desktop.png` y `dev-registration-mobile.png`, inspeccionadas visualmente.
- Cobertura del alcance con Karma: `register-form.validation.ts`, `register.component.ts` e `input.component.ts` — 100 % en statements, ramas, funciones y líneas. En `AuthService.register`, todas las sentencias y callbacks del método (incluido el contexto silencioso y los caminos éxito/error) se ejecutaron; el archivo completo sigue en 53.68/22.73/45.45/54.95 % (statements/branches/functions/lines) por métodos ajenos al alcance. La suite global completa sigue bloqueada por los 19 tests anotados en el baseline y por su gate 80 %; no se rebajó.

## Unidad QA-03b · estado touched del control compartido (pendiente)

**Hallazgo revalidado:** `frontend/src/app/shared/components/ui/input/input.component.ts` solo emite `onBlur` en el evento blur. En cambio `onInput()` llama `onTouched()` para texto y valores numéricos vacíos/no válidos, pero retorna sin hacerlo para números válidos. Esto vuelve inconsistente el estado touched de `ControlValueAccessor` según el tipo de campo y no sigue el momento de interacción esperado (salir del campo).

- [ ] `onTouched` se ejecuta al salir de cualquier input y no al teclear, tanto texto como número; el output público `onBlur` se conserva.
- [ ] Tests CVA reproducen primero la discrepancia, luego verifican blur/touched y que no cambia al teclear.
- [ ] Ejecutar el E2E real de registro en Chromium y mobile-chrome contra un servidor/DB aislados; cobertura de todas las métricas ≥70 % en el alcance, sin tocar los gates existentes.

### Discrepancias que requieren prueba/decisión

- [ ] Dashboard: verificar el destino de las cards que apuntan a `/recipes/:id` y de las acciones con fragmento `#ai`; confirmar con producto si el destino esperado es modal, ruta o ancla antes de cambiarlo.
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

1. Cerrar QA-03b: alinear `InputComponent` CVA con blur/touched, test-first.
2. QA-04: reparar de forma test-first los 19 fallos de specs frontend obsoletos/dobles y subir la suite al gate local de 80 %, sin rebajar umbrales.
3. Corregir la configuración permanente de Playwright full-stack: su `DATABASE_PATH` sigue comentado; conservar aislamiento del servidor/DB de uso normal.
4. Continuar el barrido de rutas y acciones con capturas de consola/red/overflow. Resolver el destino de Dashboard `/recipes/:id` con conducta actual observada antes de cambiar el router.
