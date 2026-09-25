// Diccionario del dominio `receipts`: la lectura de tickets por IA (HOGARIA-SPEC ## 12aj).
// Aquí vive lo que la pantalla dice —estados de la cola, revisión de líneas, confirmación—.
// No va aquí lo que se le envía al modelo (eso es `ticket-prompt.ts`, en el server).
export const receiptsEs = {
  'receipts.titulo': 'Tickets',
  'receipts.subtitulo':
    'Sube un ticket (imagen o PDF) y la IA saca líneas, tienda y precios. Nada toca el inventario hasta que lo confirmas.',
  'receipts.suelta_el_ticket_aqui': 'Suelta el ticket aquí',
  'receipts.o_elige_el_fichero': 'o elige el fichero',
  'receipts.formatos_y_tamano': 'PNG, JPEG, WebP o PDF · máximo 10 MB',
  'receipts.subiendo': 'Subiendo…',
  'receipts.eso_no_es_un_ticket': 'Eso no es una imagen ni un PDF',
  'receipts.pesa_demasiado': 'El ticket pesa más de 10 MB',
  'receipts.no_se_ha_podido': 'No se ha podido subir el ticket',
  'receipts.sin_tickets': 'Aún no hay tickets',
  'receipts.sin_tickets_hint':
    'Sube el primero: la IA leerá las líneas y tú las revisas antes de tocar el inventario.',
  'receipts.abrir_ticket': 'Abrir ticket',
  'receipts.ver_el_fichero': 'Ver el fichero original',
  'receipts.volver_a_tickets': 'Volver a tickets',

  // ── el pipeline ──
  'receipts.estado.queued': 'En cola',
  'receipts.estado.analyzing': 'Leyendo…',
  'receipts.estado.review': 'A revisar',
  'receipts.estado.confirmed': 'Confirmado',
  'receipts.estado.failed': 'Falló',
  'receipts.estado.stopped': 'Parado',

  'receipts.leyendo_el_ticket': 'Leyendo el ticket…',
  'receipts.leyendo_hint': 'Las líneas van apareciendo según la IA las lee.',
  'receipts.lineas': '{n} líneas',
  'receipts.una_linea': '1 línea',
  'receipts.nada_leido_todavia': 'Todavía no ha leído nada',
  'receipts.error.NO_CONFIG': 'No hay configuración de IA: encaja el proveedor en Ajustes → IA',
  'receipts.error.BAD_JSON': 'El modelo no contestó con una estructura válida',
  'receipts.error.TIMEOUT': 'El proveedor tardó demasiado en contestar',
  'receipts.error.PROVIDER': 'El proveedor de IA falló',

  // ── la revisión ──
  'receipts.tienda': 'Tienda',
  'receipts.tienda_no_detectada': 'Tienda no detectada',
  'receipts.notas': 'Notas',
  'receipts.guardar_tienda': 'Guardar tienda',
  'receipts.nombre': 'Nombre',
  'receipts.cantidad': 'Cant.',
  'receipts.unidad': 'Unidad',
  'receipts.categoria': 'Categoría',
  'receipts.precio': 'Precio',
  'receipts.oferta': 'Oferta',
  'receipts.nota': 'Nota',
  'receipts.anadir_linea': 'Añadir línea',
  'receipts.borrar_linea': 'Quitar la línea',
  'receipts.confianza': 'Confianza',
  'receipts.total_del_ticket': 'Total del ticket',
  'receipts.suma_de_lineas': 'Suma de líneas',
  'receipts.no_cuadra': 'No cuadra con el total del ticket',
  'receipts.avisos': 'Avisos de la lectura',
  'receipts.lineas_editables_hint':
    'Cada línea se puede retocar entera: nombre, cantidad, categoría, precio, oferta, nota.',

  // ── confirmar ──
  'receipts.confirmar': 'Confirmar y subir al inventario',
  'receipts.confirmando': 'Confirmando…',
  'receipts.confirmado': 'Compra en el inventario',
  'receipts.confirmado_detalle':
    '{precios} precios apuntados · {nuevas} fichas nuevas · {sumadas} fichas que ya estaban',
  'receipts.ver_inventario': 'Ver el inventario',
  'receipts.hay_que_revisar':
    'Este ticket tiene que estar en revisión (o rescatado a mano) para confirmarse',
  'receipts.nada_que_confirmar': 'No hay líneas que confirmar',

  // ── parar / reintentar ──
  'receipts.reintentar': 'Volver a leer',
  'receipts.parar': 'Parar',
  'receipts.parar_todo': 'Parar todo',
  'receipts.borrar': 'Borrar',
  'receipts.borrar_el_ticket': 'Borrar el ticket',
  'receipts.ticket_borrado': 'Ticket borrado',

  // ── el icono de la cola ──
  'receipts.cola_de_lectura': 'Cola de lectura de tickets',
  'receipts.nada_en_cola': 'Nada en la cola',
  'receipts.nada_en_cola_hint': 'Los tickets que subas se leen aquí, uno a uno.',
  'receipts.en_curso': 'En curso',
  'receipts.en_cola_n': 'En cola: {n}',
  'receipts.fallo_n': 'Con fallos: {n}',
  'receipts.intentos': 'intento {n} de {m}',
  'receipts.abrir': 'Abrir',
  'receipts.parado': 'Parado'
} as const;

export const receiptsEn: Record<keyof typeof receiptsEs, string> = {
  'receipts.titulo': 'Receipts',
  'receipts.subtitulo':
    'Upload a receipt (image or PDF) and the AI pulls out lines, store and prices. Nothing touches the inventory until you confirm.',
  'receipts.suelta_el_ticket_aqui': 'Drop the receipt here',
  'receipts.o_elige_el_fichero': 'or pick the file',
  'receipts.formatos_y_tamano': 'PNG, JPEG, WebP or PDF · 10 MB max',
  'receipts.subiendo': 'Uploading…',
  'receipts.eso_no_es_un_ticket': "That's neither an image nor a PDF",
  'receipts.pesa_demasiado': 'The receipt is over 10 MB',
  'receipts.no_se_ha_podido': "Couldn't upload the receipt",
  'receipts.sin_tickets': 'No receipts yet',
  'receipts.sin_tickets_hint':
    'Upload the first one: the AI will read the lines and you review them before touching the inventory.',
  'receipts.abrir_ticket': 'Open receipt',
  'receipts.ver_el_fichero': 'View the original file',
  'receipts.volver_a_tickets': 'Back to receipts',

  'receipts.estado.queued': 'Queued',
  'receipts.estado.analyzing': 'Reading…',
  'receipts.estado.review': 'To review',
  'receipts.estado.confirmed': 'Confirmed',
  'receipts.estado.failed': 'Failed',
  'receipts.estado.stopped': 'Stopped',

  'receipts.leyendo_el_ticket': 'Reading the receipt…',
  'receipts.leyendo_hint': 'Lines appear as the AI reads them.',
  'receipts.lineas': '{n} lines',
  'receipts.una_linea': '1 line',
  'receipts.nada_leido_todavia': 'Nothing read yet',
  'receipts.error.NO_CONFIG': 'No AI configuration: set the provider up in Settings → AI',
  'receipts.error.BAD_JSON': "The model didn't answer with a valid structure",
  'receipts.error.TIMEOUT': 'The provider took too long to answer',
  'receipts.error.PROVIDER': 'The AI provider failed',

  'receipts.tienda': 'Store',
  'receipts.tienda_no_detectada': 'Store not detected',
  'receipts.notas': 'Notes',
  'receipts.guardar_tienda': 'Save store',
  'receipts.nombre': 'Name',
  'receipts.cantidad': 'Qty',
  'receipts.unidad': 'Unit',
  'receipts.categoria': 'Category',
  'receipts.precio': 'Price',
  'receipts.oferta': 'Offer',
  'receipts.nota': 'Note',
  'receipts.anadir_linea': 'Add line',
  'receipts.borrar_linea': 'Remove line',
  'receipts.confianza': 'Confidence',
  'receipts.total_del_ticket': 'Receipt total',
  'receipts.suma_de_lineas': 'Sum of lines',
  'receipts.no_cuadra': "Doesn't match the receipt total",
  'receipts.avisos': 'Reading warnings',
  'receipts.lineas_editables_hint':
    'Every line is fully editable: name, quantity, category, price, offer, note.',

  'receipts.confirmar': 'Confirm and add to inventory',
  'receipts.confirmando': 'Confirming…',
  'receipts.confirmado': 'Shopping in the inventory',
  'receipts.confirmado_detalle':
    '{precios} prices recorded · {nuevas} new items · {sumadas} items that already existed',
  'receipts.ver_inventario': 'View inventory',
  'receipts.hay_que_revisar': 'This receipt must be in review (or rescued by hand) to be confirmed',
  'receipts.nada_que_confirmar': 'There are no lines to confirm',

  'receipts.reintentar': 'Read again',
  'receipts.parar': 'Stop',
  'receipts.parar_todo': 'Stop all',
  'receipts.borrar': 'Delete',
  'receipts.borrar_el_ticket': 'Delete the receipt',
  'receipts.ticket_borrado': 'Receipt deleted',

  'receipts.cola_de_lectura': 'Receipt reading queue',
  'receipts.nada_en_cola': 'Nothing in the queue',
  'receipts.nada_en_cola_hint': 'Receipts you upload are read here, one at a time.',
  'receipts.en_curso': 'Running',
  'receipts.en_cola_n': 'Queued: {n}',
  'receipts.fallo_n': 'Failed: {n}',
  'receipts.intentos': 'attempt {n} of {m}',
  'receipts.abrir': 'Open',
  'receipts.parado': 'Stopped'
};
