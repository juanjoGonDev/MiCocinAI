/**
 * La foto de la cuenta, antes de salir del dispositivo.
 *
 * Dos partes, y solo una es pura. `avatarFileError` decide si el fichero que se eligio merece la
 * pena: se prueba en node porque es donde estan los fallos (un SVG con script dentro, un HEIC que
 * el navegador no decodifica, una foto de 12 MB del movil). `avatarDataUrlFromFile` hace el recorte
 * con un canvas: eso solo existe en el navegador, y por eso el resto del fichero no depende de el.
 *
 * Se recorta aqui, y no en el servidor, por dos razones: el ancho de subida en un movil es lo que
 * hace que la operacion falle o no, y un servidor que reescala necesita una libreria de imagenes
 * que este binario no trae (y no se le puede anadir un peso asi a una Raspberry).
 */

/** Un cuadrado de 128 px: el avatar mas grande de la app mide 64, y el doble es para retina. */
export const AVATAR_EDGE = 128;

/** Calidad JPEG del recorte. Por debajo se nota el bloque; por encima no paga nada. */
export const AVATAR_QUALITY = 0.72;

/** Techo del fichero de partida: 4 MB es una foto de movil recortable sin drama. */
export const AVATAR_MAX_FILE_BYTES = 4 * 1024 * 1024;

/** Lo que un `canvas.drawImage` sabe decodificar sin ayuda de un servidor. */
export const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const;

export function avatarFileError(file: { type: string; size: number; name?: string }): string | null {
  if (!file || typeof file.size !== 'number') return 'Ese archivo no se puede leer.';
  if (file.size === 0) return 'El archivo esta vacio.';
  if (file.size > AVATAR_MAX_FILE_BYTES) {
    return `La foto pesa demasiado (${Math.round(file.size / 1024 / 1024)} MB). Elige otra o recortala antes.`;
  }
  // El SVG es texto: admitirlo es admitir un `script` dentro de una imagen.
  if (!AVATAR_ALLOWED_TYPES.includes(file.type as (typeof AVATAR_ALLOWED_TYPES)[number])) {
    return 'Puede ser JPEG, PNG o WebP.';
  }
  return null;
}

/** El lado del cuadrado recortado, centrado: se recorta por el centro porque la cara sale en el centro. */
export function squareCrop(source: { width: number; height: number }, edge = AVATAR_EDGE): { sx: number; sy: number; size: number } {
  const size = Math.max(1, Math.min(source.width, source.height));
  return { sx: Math.round((source.width - size) / 2), sy: Math.round((source.height - size) / 2), size };
}

/**
 * Lee, recorta y comprime. Devuelve un data URL JPEG listo para `POST /api/auth/avatar`.
 * Si el navegador no puede decodificar el fichero, rechaza con un mensaje para la persona —no
 * con el error tecnico—, que es lo que se puede accionar desde la pantalla.
 */
export async function avatarDataUrlFromFile(file: File, edge = AVATAR_EDGE): Promise<string> {
  const error = avatarFileError(file);
  if (error) throw new Error(error);

  const bitmap = await decode(file);
  try {
    const crop = squareCrop({ width: bitmap.width, height: bitmap.height }, edge);
    const canvas = document.createElement('canvas');
    canvas.width = edge;
    canvas.height = edge;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('El navegador no puede procesar la imagen.');
    context.drawImage(bitmap as CanvasImageSource, crop.sx, crop.sy, crop.size, crop.size, 0, 0, edge, edge);
    return canvas.toDataURL('image/jpeg', AVATAR_QUALITY);
  } finally {
    if ('close' in bitmap) bitmap.close(); // solo ImageBitmap; el <img> se recoge solo
  }
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* se cae al <img>, que decodifica algo mas (p. ej. PNGs extra-normalizados) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('La imagen no se pudo leer.'));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}
