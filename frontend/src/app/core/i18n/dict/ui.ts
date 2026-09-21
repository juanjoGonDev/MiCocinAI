/**
 * Lo que se repite en todas partes (guardar, cancelar, cargar, las comidas) y por eso vive una sola vez.
 *
 * Un fichero por dominio porque con 600 claves en el service cada retoque habria generado conflictos en
 * todas las tandas a la vez. `as const` no es decoracion: es lo que da el tipo union de claves y, con el
 * `Record<keyof typeof es, string>` del lado ingles, hace que **una traduccion que falte sea un error de
 * compilacion** en lugar de una pantalla medio en espanol.
 *
 * Aqui estan tambien `meal.*`: el nombre de una comida se ensena en Horarios, en el calendario, en la
 * portada y en Preferencias, y en las cuatro el dato que se guarda es el mismo (`breakfast`). La etiqueta
 * visible sale del diccionario; `MEAL_TYPE_LABELS` sigue en espanol porque es la cadena que parsea el
 * planificador al leer la respuesta del modelo (HOGARIA-SPEC §12s-A).
 */
export const uiEs = {
  'common.cancel': 'Cancelar',
  'common.create': 'Crear',
  'common.delete': 'Eliminar',
  'common.edit': 'Editar',
  'common.error': 'Error',
  'common.loading': 'Cargando...',
  'common.save': 'Guardar',
  'common.success': 'Éxito',
  'meal.breakfast': 'Desayuno',
  'meal.dinner': 'Cena',
  'meal.lunch': 'Almuerzo',
  'meal.snack': 'Merienda',
  'ui.add_custom_option': 'Añadir opción propia',
  'ui.anadir': 'Añadir',
  'ui.buscar': 'Buscar',
  'ui.choose': 'Elegir…',
  'ui.meal_hours': 'Horarios de las comidas',
  'ui.close': 'Cerrar',
  'ui.escribe_el_tuyo': 'Escribe el tuyo',
  'ui.dismiss': 'Descartar',
  'ui.pausar': 'Pausar',
  'ui.por_defecto': 'Por defecto',
  'ui.selected_option': 'seleccionado: {option}',
  'ui.reiniciar': 'Reiniciar',
  'ui.options': 'Opciones',
  'ui.remove_tag': 'Quitar etiqueta',
  'ui.usar_este_texto': 'usar este texto',
} as const;

export const uiEn: Record<keyof typeof uiEs, string> = {
  'common.cancel': 'Cancel',
  'common.create': 'Create',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.error': 'Error',
  'common.loading': 'Loading...',
  'common.save': 'Save',
  'common.success': 'Success',
  'meal.breakfast': 'Breakfast',
  'meal.dinner': 'Dinner',
  'meal.lunch': 'Lunch',
  'meal.snack': 'Snack',
  'ui.add_custom_option': 'Add your own option',
  'ui.anadir': 'Add',
  'ui.buscar': 'Search',
  'ui.choose': 'Choose…',
  'ui.meal_hours': 'Meal times',
  'ui.close': 'Close',
  'ui.escribe_el_tuyo': 'Type yours',
  'ui.dismiss': 'Dismiss',
  'ui.pausar': 'Pause',
  'ui.por_defecto': 'Default',
  'ui.selected_option': 'selected: {option}',
  'ui.reiniciar': 'Restart',
  'ui.options': 'Options',
  'ui.remove_tag': 'Remove tag',
  'ui.usar_este_texto': 'use this text',
};
