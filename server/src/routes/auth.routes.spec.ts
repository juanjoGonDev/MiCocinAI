import { chmodSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * La cuenta de la persona: su nombre, su foto y su contrasena. Era el hueco que la app tenia —el
 * servidor ya aceptaba `name` y `avatar` en `PATCH /profile`, y no habia pantalla donde tocarlo—
 * y dos de las tres cosas necesitan un fichero en disco, que es lo que se prueba aqui.
 *
 * La BD va en memoria, pero `uploads/` NO: con `:memory:` el carpetillo cae en el temporal del
 * proceso (ver `uploadsRoot`), asi que la prueba escribe fuera del arbol del repo y no deja restos
 * que commitear.
 */

process.env.DATABASE_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let app: Awaited<ReturnType<typeof import('../app.js').createApp>>;

/** `Response.json()` es `unknown` en TS; se ancha a `any` una vez y se acaba el asunto. */
const json = async (response: Response): Promise<any> => await response.json();

function withAuth(token: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  };
}

async function register(name: string): Promise<{ token: string; email: string }> {
  const email = `${name.toLowerCase().replace(/[^a-z]/g, '')}-${Math.random().toString(36).slice(2, 8)}@hogaria.test`;
  const response = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, password: 'Clave1234' })
  });
  return { token: (await json(response)).data.token as string, email };
}

const profileAvatar = async (token: string) => (await json(await app.request('/api/auth/profile', withAuth(token)))).data.avatar as string | null;

beforeAll(async () => {
  const database = await import('../config/database.js');
  await database.initializeDatabase();
  const { createApp } = await import('../app.js');
  app = createApp({ rateLimit: null, staticDir: null });
});

describe('la cuenta de la persona', () => {
  it('sube una foto, la sirve y la guarda en el perfil', async () => {
    const { token } = await register('Ana');

    const uploaded = await json(
      await app.request('/api/auth/avatar', withAuth(token, { method: 'POST', body: JSON.stringify({ image: PNG_1PX }) }))
    );
    const avatar = uploaded.data.avatar as string;
    // El id de usuario es un nanoid (mayusculas incluidas): la URL lleva su prefijo.
    expect(avatar).toMatch(/^\/api\/uploads\/avatars\/[A-Za-z0-9._-]+\.png$/);

    const served = await app.request(avatar);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect((await served.arrayBuffer()).byteLength).toBeGreaterThan(0);

    expect(await profileAvatar(token)).toBe(avatar);
  });

  it('con el disco de las imagenes sin permisos, se dice 500: nada de un 200 mentiroso', async () => {
    // El fallo que esto cierra es el peor posible en una pantalla de identidad: la subida
    // responde satisfecha, la URL queda en la base de datos y el navegador recibe un 404 en cada
    // `img` —una foto que «no cambia» y un toast que dice que si. Si escribir no se pudo, el
    // perfil tiene que quedarse como estaba y hay que decir por que.
    const { token } = await register('Eun');
    const before = await profileAvatar(token);
    const ro = mkdtempSync(join(tmpdir(), 'hogaria-uploads-sin-permisos-'));
    chmodSync(ro, 0o500);
    const saved = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = join(ro, 'hogaria.sqlite'); // `uploads/` se crea dentro: no podra
    try {
      const res = await app.request('/api/auth/avatar', withAuth(token, { method: 'POST', body: JSON.stringify({ image: PNG_1PX }) }));
      expect(res.status).toBe(500);
      expect((await json(res)).message).toBe('UPLOAD_WRITE_FAILED');
      expect(await profileAvatar(token)).toBe(before);
    } finally {
      process.env.DATABASE_PATH = saved;
      chmodSync(ro, 0o700);
    }
  });

  it('la segunda foto sustituye a la primera: la URL cambia', async () => {
    const { token } = await register('Bea');
    const upload = async () =>
      (await json(await app.request('/api/auth/avatar', withAuth(token, { method: 'POST', body: JSON.stringify({ image: PNG_1PX }) })))).data.avatar;
    const first = await upload();
    const second = await upload();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(await profileAvatar(token)).toBe(second);
  });

  it('lo que no es una foto de siempre no entra', async () => {
    const { token } = await register('Che');
    const svg = await app.request(
      '/api/auth/avatar',
      withAuth(token, { method: 'POST', body: JSON.stringify({ image: 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0IG9ubG9hZD1hbGVydCgxKSAvPjwvc3ZnPg==' }) })
    );
    expect(svg.status).toBe(415);
    expect((await json(svg)).message).toBe('UNSUPPORTED_IMAGE');

    const nonsense = await app.request('/api/auth/avatar', withAuth(token, { method: 'POST', body: JSON.stringify({ image: 'no soy una imagen' }) }));
    expect(nonsense.status).toBe(400);
    expect((await json(nonsense)).message).toBe('INVALID_IMAGE');

    expect((await app.request('/api/auth/avatar', withAuth(token, { method: 'POST', body: '{}' }))).status).toBe(400);
    // Y no se guardo nada: sigue sin foto.
    expect(await profileAvatar(token)).toBeFalsy();
  });

  it('quitar la foto deja el campo vacio', async () => {
    const { token } = await register('Die');
    await app.request('/api/auth/avatar', withAuth(token, { method: 'POST', body: JSON.stringify({ image: PNG_1PX }) }));
    expect(await profileAvatar(token)).toBeTruthy();

    const removed = await app.request('/api/auth/avatar', withAuth(token, { method: 'DELETE' }));
    expect(removed.status).toBe(200);
    // `sanitizeUser` omite el campo cuando no hay foto (nunca un string vacio): para el frontend
    // `User.avatar?: string` es exactamente lo mismo, ausencia.
    expect(await profileAvatar(token)).toBeFalsy();
  });

  it('el perfil acepta la ruta que el propio backend devuelve, y no un /etc/passwd', async () => {
    const { token } = await register('Ene');
    const ok = await app.request(
      '/api/auth/profile',
      withAuth(token, { method: 'PATCH', body: JSON.stringify({ name: 'Ene Lar', avatar: '/api/uploads/avatars/u-ene-f1e2d3.png' }) })
    );
    expect(ok.status).toBe(200);
    const profile = await json(await app.request('/api/auth/profile', withAuth(token)));
    expect(profile.data.name).toBe('Ene Lar');
    expect(profile.data.avatar).toBe('/api/uploads/avatars/u-ene-f1e2d3.png');

    const absolute = await app.request('/api/auth/profile', withAuth(token, { method: 'PATCH', body: JSON.stringify({ avatar: 'https://cdn.ejemplo.com/a.png' }) }));
    expect(absolute.status).toBe(200);

    const traversal = await app.request('/api/auth/profile', withAuth(token, { method: 'PATCH', body: JSON.stringify({ avatar: '/etc/passwd' }) }));
    expect(traversal.status).toBeGreaterThanOrEqual(400);

    const cleared = await app.request('/api/auth/profile', withAuth(token, { method: 'PATCH', body: JSON.stringify({ avatar: null }) }));
    expect(cleared.status).toBe(200);
    expect(await profileAvatar(token)).toBeFalsy();
  });

  it('cambiar la contrasena exige la anterior, y con la nueva se entra', async () => {
    const { token, email } = await register('Luis');
    const wrong = await app.request(
      '/api/auth/change-password',
      withAuth(token, { method: 'POST', body: JSON.stringify({ oldPassword: 'no-es', newPassword: 'Nueva1234' }) })
    );
    expect(wrong.status).toBe(400);

    const weak = await app.request(
      '/api/auth/change-password',
      withAuth(token, { method: 'POST', body: JSON.stringify({ oldPassword: 'Clave1234', newPassword: 'corta' }) })
    );
    expect(weak.status).toBeGreaterThanOrEqual(400);

    const ok = await app.request(
      '/api/auth/change-password',
      withAuth(token, { method: 'POST', body: JSON.stringify({ oldPassword: 'Clave1234', newPassword: 'Nueva1234' }) })
    );
    expect(ok.status).toBe(200);

    const loginOld = await app.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Clave1234' }) });
    expect(loginOld.status).toBeGreaterThanOrEqual(400);
    const loginNew = await app.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Nueva1234' }) });
    expect(loginNew.status).toBe(200);
  });

  it('sin token no se sube nada, y la foto no se adivina por la ruta', async () => {
    const anonymous = await app.request('/api/auth/avatar', { method: 'POST', body: JSON.stringify({ image: PNG_1PX }) });
    expect(anonymous.status).toBe(401);
    expect((await app.request('/api/uploads/avatars/no-existe.png')).status).toBe(404);
    // Un directorio que la app no sirve, aunque el fichero existiera.
    expect((await app.request('/api/uploads/secrets/x.png')).status).toBe(404);
  });
});
