import { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import { config } from '../config/app.config.js';

/**
 * `EventSource` no puede mandar cabeceras, y el listado en vivo (HOGARIA-SPEC §8f)
 * se hace con el. Se acepta `?access_token=` SOLO en `GET /api/shopping/stream/*`:
 * ni en POST (un token en la URL de una escritura acabaria en el historial de
 * navegacion de una red del hogar), ni en el resto de rutas. Y el logger de `index.ts`
 * lo enmascara, porque un token en la URL es un token en los logs si nadie lo evita.
 */
function bearerToken(c: Context): string | null {
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.substring(7);

  if (c.req.method === 'GET' && c.req.path.startsWith('/api/shopping/stream/')) {
    const query = c.req.query('access_token');
    if (query && query.trim()) return query.trim();
  }
  return null;
}

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const token = bearerToken(c);

  if (!token) {
    return c.json({
      success: false,
      message: 'Authorization header required'
    }, 401);
  }

  try {
    const payload = jwt.verify(token, config.auth.jwtSecret) as any;

    if (payload.type === 'refresh') {
      throw new Error('Invalid token type');
    }

    // Set user info in context
    c.set('userId', payload.sub);
    c.set('userEmail', payload.email);

    await next();
  } catch (error) {
    return c.json({
      success: false,
      message: 'Invalid or expired token'
    }, 401);
  }
}

export async function optionalAuthMiddleware(c: Context, next: Next) {
  const token = bearerToken(c);

  if (token) {

    try {
      const payload = jwt.verify(token, config.auth.jwtSecret) as any;

      if (payload.type !== 'refresh') {
        c.set('userId', payload.sub);
        c.set('userEmail', payload.email);
      }
    } catch {
      // Token invalid, but continue without auth
    }
  }

  await next();
}
