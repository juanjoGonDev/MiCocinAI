import { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import { config } from '../config/app.config.js';

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({
      success: false,
      message: 'Authorization header required'
    }, 401);
  }

  const token = authHeader.substring(7);

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
  const authHeader = c.req.header('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

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
