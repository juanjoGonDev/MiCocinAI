// Diccionario del dominio `avatar_editor`: texto de la interfaz, lo que la app dice. No va aqui lo que se
// guarda ni lo que se envia a la IA (HOGARIA-SPEC §12s-A). El `en` lo escribe una persona.
export const avatarEditorEs = {
  'avatar_editor.acercar': 'Acercar',
  'avatar_editor.alejar': 'Alejar',
  'avatar_editor.arrastra_para_encuadrar_el': 'Arrastra para encuadrar. El circulo es lo que se ver; fuera de el, se recorta.',
  'avatar_editor.mueve_la_foto_con': 'Mueve la foto con el dedo o con las flechas para encuadrar; la rueda o el slider la acercan',
  'avatar_editor.usar_imagen': 'Usar imagen',
  'avatar_editor.volver_al_centro': 'Volver al centro',
  'avatar_editor.zoom': 'Zoom',
} as const;

export const avatarEditorEn: Record<keyof typeof avatarEditorEs, string> = {
  'avatar_editor.acercar': 'Zoom in',
  'avatar_editor.alejar': 'Zoom out',
  'avatar_editor.arrastra_para_encuadrar_el': 'Drag to frame it. The circle is what you will see; outside it, it gets cropped.',
  'avatar_editor.mueve_la_foto_con': 'Move the photo with your finger or the arrows to frame it; the wheel or the slider zooms',
  'avatar_editor.usar_imagen': 'Use image',
  'avatar_editor.volver_al_centro': 'Back to centre',
  'avatar_editor.zoom': 'Zoom',
};
