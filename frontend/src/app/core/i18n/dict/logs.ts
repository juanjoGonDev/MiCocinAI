/**
 * El visor de logs, que es una pantalla de tecnico pero la ve una persona.
 *
 * Un fichero por dominio porque con 600 claves en el service cada retoque habria generado conflictos
 * en todas las tandas a la vez. `as const` no es decoracion: es lo que da el tipo union de claves y, con
 * el `Record<keyof typeof es, string>` del lado ingles, hace que **una traduccion que falte sea un error
 * de compilacion** en lugar de una pantalla medio en espanol.
 */
export const logsEs = {
  'logs.all': 'Todos',
  'logs.autoscroll': 'Auto-scroll',
  'logs.browser': 'Cliente',
  'logs.clear': '🗑 Limpiar',
  'logs.clearConfirm': '¿Borrar todos los logs?',
  'logs.disconnected': 'Desconectado',
  'logs.levels.all': 'Todos los niveles',
  'logs.live': 'En vivo',
  'logs.pause': '⏸ Pausar',
  'logs.resume': '▶ Reanudar',
  'logs.server': 'Servidor',
  'logs.title': '📋 Logs',
  'logs.waiting': 'Esperando logs…',
} as const;

export const logsEn: Record<keyof typeof logsEs, string> = {
  'logs.all': 'All',
  'logs.autoscroll': 'Auto-scroll',
  'logs.browser': 'Client',
  'logs.clear': '🗑 Clear',
  'logs.clearConfirm': 'Clear all logs?',
  'logs.disconnected': 'Disconnected',
  'logs.levels.all': 'All levels',
  'logs.live': 'Live',
  'logs.pause': '⏸ Pause',
  'logs.resume': '▶ Resume',
  'logs.server': 'Server',
  'logs.title': '📋 Logs',
  'logs.waiting': 'Waiting for logs…',
};
