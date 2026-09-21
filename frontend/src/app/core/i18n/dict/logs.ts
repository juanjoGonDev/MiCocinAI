/**
 * El visor de logs, que es una pantalla de tecnico pero la ve una persona.
 *
 * Un fichero por dominio porque con 600 claves en el service cada retoque habria generado conflictos
 * en todas las tandas a la vez. `as const` no es decoracion: es lo que da el tipo union de claves y, con
 * el `Record<keyof typeof es, string>` del lado ingles, hace que **una traduccion que falte sea un error
 * de compilacion** en lugar de una pantalla medio en espanol.
 */
export const logsEs = {
  'logs.lineas_copiadas_varios': '{n} líneas en el portapapeles',
  'logs.lineas_copiadas_uno': '{n} línea en el portapapeles',
  'logs.borrar_todos_los_logs': '¿Borrar todos los logs? Esta acción no se puede deshacer.',
  'logs.borrar_logs': 'Borrar logs',
  'logs.no_se_pudo_copiar': 'No se pudo copiar al portapapeles',
  'logs.no_hay_lineas_visibles': 'No hay líneas visibles',
  'logs.nada_que_copiar': 'Nada que copiar',
  'logs.zona_detectada': 'Zona detectada: {zone}',
  'logs.terminal_de': 'HogarIA — terminal',
  'logs.seleccion_en_el_terminal': '{n} línea(s) seleccionadas · Ctrl/Cmd o Mayús + clic para ajustar',
  'logs.hora_de': 'hora de {zone}',
  'logs.copiar_todo': 'Copiar todo',
  'logs.copiar_seleccionado': 'Copiar seleccionado ({n})',
  'logs.autoscroll_estado': 'Auto-scroll: {state}',
  'logs.clic_seleccionar_ctrl_cmd': 'Clic: seleccionar · Ctrl/Cmd: añadir o quitar · Mayús: seleccionar rango',
  'logs.limpiar_seleccion': 'Limpiar selección',
  'logs.limpiar': 'Limpiar',
  'logs.reintentar_la_conexion': 'Reintentar la conexion',
  'logs.waiting': 'Esperando logs…',
} as const;

export const logsEn: Record<keyof typeof logsEs, string> = {
  'logs.lineas_copiadas_varios': '{n} lines on the clipboard',
  'logs.lineas_copiadas_uno': '{n} line on the clipboard',
  'logs.borrar_todos_los_logs': 'Delete every log entry? This action cannot be undone.',
  'logs.borrar_logs': 'Delete logs',
  'logs.no_se_pudo_copiar': 'Could not copy to the clipboard',
  'logs.no_hay_lineas_visibles': 'There are no visible lines',
  'logs.nada_que_copiar': 'Nothing to copy',
  'logs.zona_detectada': 'Detected time zone: {zone}',
  'logs.terminal_de': 'HogarIA — terminal',
  'logs.seleccion_en_el_terminal': '{n} line(s) selected · Ctrl/Cmd or Shift+click to extend',
  'logs.hora_de': 'time in {zone}',
  'logs.copiar_todo': 'Copy everything',
  'logs.copiar_seleccionado': 'Copy selection ({n})',
  'logs.autoscroll_estado': 'Auto-scroll: {state}',
  'logs.clic_seleccionar_ctrl_cmd': 'Click: select · Ctrl/Cmd: add or remove · Shift: select a range',
  'logs.limpiar_seleccion': 'Clear selection',
  'logs.limpiar': 'Clear',
  'logs.reintentar_la_conexion': 'Try the connection again',
  'logs.waiting': 'Waiting for logs…',
};
