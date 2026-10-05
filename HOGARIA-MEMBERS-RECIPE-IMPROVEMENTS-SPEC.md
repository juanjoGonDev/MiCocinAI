# HogarIA — miembros activos y mejoras de recetas

**Estado:** especificación activa; implementación pendiente.

**Rama/PR:** `arena/01a0a6c2-micocinai` / Draft PR #41.
**Fuente vigente:** `HOGARIA-SPEC.md` §12aq, `QA-RECIPE.DETAIL-LEVELS-AND-MEDIA.1`, `QA-RECIPE.FULL-DETAIL-VIEW.1`, `QA-RECIPE.EDIT-DEDICATED-VIEW.1` y `QA-HOUSEHOLD.MULTI-AI.1`.

Este addendum concreta las mejoras solicitadas por el usuario y prevalece solo donde indique explícitamente una conducta distinta. En particular, reemplaza el valor fijo de dos raciones en §12aq/`QA-RECIPE.FULL-DETAIL-VIEW.1` por el recuento de miembros activos del hogar. No declara terminado el resto del spec ni cambia el requisito existente de conservar una vista de edición dedicada.

## Decisiones de producto y seguridad

- «Desactivar» afecta una membresía concreta, no la cuenta ni las demás membresías del usuario. La fila y sus datos se conservan; se puede reactivar. Se reutiliza `members.kick` y la autorización se comprueba en servidor. La ausencia actual de estado en `household_members` implica una migración aditiva: miembros existentes empiezan activos.
- Una membresía inactiva no autoriza leer ni escribir datos de ese hogar, no aparece como hogar seleccionable y no cuenta para raciones. La lista administrativa puede mostrar el estado para permitir reactivarla. Nunca se desactiva al último admin activo ni se cambia la casa activa del usuario hacia otra sin selección explícita; una baja no borra datos ni afecta otras casas.
- Raciones por defecto = membresías activas del hogar activo, obtenidas en servidor; la UI permite editar antes de generar. Sin hogar activo se conserva el fallback personal actual de dos. No se reescriben recetas/eventos existentes. El límite de entrada debe permitir el número activo real; no se debe reducir silenciosamente.
- Los invitados son contexto efímero de una petición de sustitución/replanificación. Se capturan alergias/intolerancias (restricciones estrictas), dietas, gustos, ingredientes no deseados y notas breves. No crean usuarios, no se guardan en perfiles/historial y no se envían nombres, emails ni otros identificadores al modelo. Los resultados y errores no pueden eludir restricciones estrictas del hogar ni del invitado.
- El nivel de cocina selecciona el nivel inicial, no elimina las otras variantes: básico explica con mucho detalle para principiantes (preparación/lavado, cantidades, técnica, calor, tiempos, señales visuales y errores comunes); intermedio es práctico y equilibrado, suponiendo técnicas sencillas; experto es conciso y preciso, con tiempos, temperaturas y puntos críticos. Los tres niveles se generan juntos y comparten una sola lista de ingredientes.
- Buscar fotos es explícito desde el editor dedicado. Se reutiliza Wikimedia Commons y su atribución/licencia; la consulta contiene solo el nombre de receta y texto de búsqueda que el usuario escribió, nunca ingredientes completos, pasos privados, gustos, hogar o datos personales. Resultados vacíos/errores no bloquean edición.
- La generación fotográfica es una acción explícita, nunca una sustitución simulada por texto o SVG. Solo se habilita si el proveedor de IA activo expone una capacidad de generación de imágenes compatible; si no, la UI lo explica y mantiene la búsqueda/selección real disponible. Las peticiones pasan por la configuración/hogar y cola vigentes. Se valida y almacena el resultado como imagen raster local acotada, sin descargar URLs arbitrarias del proveedor ni exponer claves.

## Unidades y checklist

### `QA-HOUSEHOLD.ACTIVE-MEMBERS-SERVINGS.1`

- [ ] Añadir estado activo a la membresía con migración aditiva/idempotente (`active=true` para filas existentes), DTO/servicio y controles de activar/desactivar localizados.
- [ ] Solo quien tenga `members.kick` puede cambiar el estado; un usuario no puede hacerlo por llamada directa sin permiso. Impedir desactivar la propia membresía desde la gestión y proteger al último admin activo. Reactivar restaura esa membresía sin recrear cuenta ni datos.
- [ ] Excluir membresías inactivas de selección/contexto activo, APIs de hogar, autorización de rutas y recuentos. Si se desactiva la casa activa del usuario, dejar contexto nulo y pedir que elija entre sus otras membresías activas; nunca filtrar datos de otra casa.
- [ ] Las raciones iniciales en generación de recetas y planificación/sustitución usan el número activo del hogar, y los campos de raciones de nuevos platos siguen el mismo valor. Fallback sin hogar = 2; valor modificable por el usuario; sin cambios retroactivos a datos guardados ni truncamiento silencioso por el límite actual de 20.
- [ ] TDD de migración/compatibilidad, permisos, último admin, reactivación, miembro inactivo en cada ruta relevante, varias casas, cambio de casa y recuento de miembros 0/1/múltiples; pruebas de UI/servicio para default, fallback y override.
- [ ] Playwright aislado escritorio/móvil: estado visible, activar/desactivar/reactivar, confirmación accesible si procede, foco/teclado, errores y recuento actualizado; fixtures y DB sintéticos, capturas comparables.

### `QA-PLANNER.REPLACEMENT-GUESTS.1`

- [ ] En el flujo de sustituir/replanificar, permitir añadir/quitar varios invitados con restricciones (alergias/intolerancias estrictas), dietas, gustos/aversiones y notas acotadas; revisión visible antes de enviar.
- [ ] Adjuntar solo esos campos al contexto de la receta alternativa. No enviar identificadores personales; mantener preferencias efímeras, sin persistencia en perfil, hogar, historial, logs o telemetría.
- [ ] Una restricción estricta nunca puede relajarse para cumplir otra preferencia; validar payload/tamaños en API y devolver error seguro si la petición contradice restricciones o no produce alternativa válida.
- [ ] Cancelar o fallar no modifica platos; confirmar aplica únicamente los slots seleccionados y conserva identidad/horario/datos de lo demás. Repetir la misma acción no duplica comidas.
- [ ] TDD para invitados vacíos/múltiples, conflicto de restricciones, payload inválido, pérdida de conexión, cancelación, retry y persistencia; E2E de selector y sustitución con proveedor sintético y dos hogares aislados.

### `QA-RECIPE.COOKING-LEVEL-DEPTH.1`

- [ ] Hacer cumplir las tres profundidades de instrucción en el prompt, schema y normalización de IA, manteniendo cronología y seguridad alimentaria; básico muy explicativo, intermedio equilibrado, experto conciso/preciso.
- [ ] Seleccionar por defecto el nivel según el perfil de cocina de quien solicita/genera; el selector de la receta permite cambiar solo la presentación; los tres niveles persisten juntos en una receta sin repetir ingredientes ni nuevas llamadas.
- [ ] Cubrir cada nivel con contratos/unit tests y ejemplos sintéticos; E2E cambia niveles en borrador/receta guardada, verifica contenido distinto, persistencia y que no hay llamadas extra. Smoke IA real opt-in usa ingredientes sintéticos diversos y verifica cualitativamente detalle, seguridad y que no se duplican datos.

### `QA-RECIPE.IMAGE-MANAGER.1`

- [ ] La vista dedicada de edición administra la portada y las imágenes opcionales de pasos (buscar, seleccionar, reemplazar, quitar; alt/autor/fuente/licencia cuando aplique) y guarda con el resto sin duplicar recetas.
- [ ] Mini buscador con actualización al escribir (debounce, cancelación de solicitudes anteriores y límites) devuelve hasta 10 fotos reales utilizables con atribución/licencia; selección se ve en preview antes de guardar. Resultados, error, timeout, imagen rota y retry son estados accesibles que no bloquean el formulario.
- [ ] Usar búsquedas de mismo origen validadas por servidor, proxy seguro de imágenes y dominios/licencias permitidos; no aceptar URLs arbitrarias del navegador/proveedor ni hacer SSRF. Escapar/sanitizar texto de proveedor y atribución.
- [ ] Mostrar «Generar imagen realista» solo con capacidad real del proveedor: acción manual, advertencia clara de uso del proveedor, cola/concurrencia y hogar correctos; validar bytes/MIME/dimensiones/tamaño antes de almacenamiento local. No presentar una imagen inventada o salida textual como fotografía. En proveedor sin soporte, dar explicación localizable y permitir continuar buscando.
- [ ] No enviar restricciones de invitados, datos del hogar, emails ni pasos/ingredientes completos a la búsqueda o generación; enviar solo prompt visual mínimo derivado del título/cocina y texto de búsqueda explícito.
- [ ] TDD de query, esquema, crédito/licencia, cancelación, carreras, capacidad ausente/presente, invalid image/URL, tamaño límite, autorización y persistencia; E2E con proveedores falsos y smoke real opt-in, sintético y consentido.
- [ ] Validar escritorio, móvil 320/393, horizontal y breakpoints; geometría de contenido compartida con Recetas dentro de 1 CSS px, labels/teclado/foco, alt, contraste y targets. Guardar/inspeccionar capturas PC/móvil con fixture sintético y exigir ≥70 % de coverage S/B/F/L en el alcance sin rebajar gates.

## Evidencia requerida antes de cerrar

- Revalidar el spec y código vigente antes de cada unidad; TDD (prueba roja antes del cambio), tests de servidor/UI y Playwright real contra app/API aisladas con SQLite temporal. No usar la DB normal ni el proveedor de uso normal.
- Registrar comandos/resultados reales, coverage focal, typechecks, builds, `check:ui`, capturas inspeccionadas, limitaciones de CI y rollback de cada unidad. No marcar casillas por pruebas solo enumeradas/compiladas.
- La búsqueda Commons es una integración web genérica ya presente; cualquier smoke de generación se mantiene opt-in. No usar credenciales, tickets personales ni cuerpos/logs con datos reales en artefactos.
- No cerrar el audit visual global mientras existan rutas/familias compartidas no medidas; no mergear ni sacar del Draft sin aprobación explícita.
