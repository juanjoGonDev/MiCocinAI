import { AVATAR_EDGE, AVATAR_MAX_FILE_BYTES, avatarFileError, squareCrop } from './avatar-image';

/**
 * Lo que se puede decidir sin navegador. El recorte con canvas se prueba a mano en el movil; aqui
 * lo que importa es que un archivo raro no llegue nunca al servidor, y que el recorte sea cuadrado
 * y por el centro (un avatar recortado arriba corta la cabeza).
 */
describe('avatar-image — el archivo antes de salir del dispositivo', () => {
  const ok = { type: 'image/jpeg', size: 900_000 };

  it('acepta lo que un canvas sabe decodificar', () => {
    expect(avatarFileError(ok)).toBeNull();
    expect(avatarFileError({ type: 'image/png', size: 10 })).toBeNull();
    expect(avatarFileError({ type: 'image/webp', size: 10 })).toBeNull();
  });

  it('rechaza el SVG, el HEIC y lo que no es una imagen', () => {
    // SVG es texto con script dentro, y admitirlo aqui es meterlo en un `img`.
    expect(avatarFileError({ type: 'image/svg+xml', size: 10 })).toContain('JPEG');
    expect(avatarFileError({ type: 'image/heic', size: 10 })).toContain('JPEG');
    expect(avatarFileError({ type: 'application/pdf', size: 10 })).toMatch(/JPEG|PNG|WebP/);
    expect(avatarFileError({ type: '', size: 10 })).not.toBeNull();
  });

  it('el vacio y el demasiado grande se dicen con un mensaje accionable', () => {
    expect(avatarFileError({ type: 'image/jpeg', size: 0 })).toContain('vacio');
    const huge = avatarFileError({ type: 'image/jpeg', size: AVATAR_MAX_FILE_BYTES + 1 });
    expect(huge).toContain('demasiado');
    expect(huge).toContain('MB'); // un numero, no "413"
  });

  it('el recorte es un cuadrado por el centro, y nunca de tamano 0', () => {
    expect(squareCrop({ width: 4000, height: 3000 }, 128)).toEqual({ sx: 500, sy: 0, size: 3000 });
    expect(squareCrop({ width: 100, height: 4000 }, 128)).toEqual({ sx: 0, sy: 1950, size: 100 });
    expect(squareCrop({ width: 0, height: 0 }, 128).size).toBe(1);
    expect(squareCrop({ width: 90, height: 90 }, AVATAR_EDGE)).toEqual({ sx: 0, sy: 0, size: 90 });
  });
});
