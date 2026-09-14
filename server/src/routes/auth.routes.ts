import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { config } from '../config/app.config.js';
import { getDatabase } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema
} from '../schemas/auth.schema.js';
import type { AppEnv } from '../types/hono-env.js';

const authRoutes = new Hono<AppEnv>();

// Helper to generate tokens
function generateTokens(userId: string, email: string) {
  const token = jwt.sign(
    { sub: userId, email },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiresIn }
  );

  const refreshToken = jwt.sign(
    { sub: userId, type: 'refresh' },
    config.auth.jwtSecret,
    { expiresIn: config.auth.refreshTokenExpiresIn }
  );

  return { token, refreshToken };
}

// Helper to get user without password and convert snake_case DB columns to camelCase
function sanitizeUser(raw: any) {
  const { password_hash, ...u } = raw;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatar: u.avatar ?? undefined,
    householdId: u.household_id ?? undefined,
    cookingLevel: u.cooking_level ?? 'beginner',
    preferences: u.preferences ? JSON.parse(u.preferences) : {},
    createdAt: u.created_at,
    updatedAt: u.updated_at,
  };
}

// POST /api/auth/register
authRoutes.post('/register', async (c) => {
  const body = await c.req.json();
  const input = registerSchema.parse(body);

  const db = getDatabase();

  // Check if user exists
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(input.email);
  if (existingUser) {
    return c.json({
      success: false,
      message: 'Email already registered'
    }, 409);
  }

  // Hash password
  const passwordHash = await bcrypt.hash(input.password, config.auth.bcryptRounds);

  // Create user
  const userId = nanoid();
  db.prepare(`
    INSERT INTO users (id, email, name, password_hash, cooking_level, preferences)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    input.email,
    input.name,
    passwordHash,
    input.cookingLevel || 'beginner',
    JSON.stringify({ theme: 'system', language: 'es', detailLevel: 'intermediate' })
  );

  // Get created user
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const tokens = generateTokens(userId, input.email);

  return c.json({
    success: true,
    data: {
      user: sanitizeUser(user),
      ...tokens
    }
  }, 201);
});

// POST /api/auth/login
authRoutes.post('/login', async (c) => {
  const body = await c.req.json();
  const input = loginSchema.parse(body);

  const db = getDatabase();

  // Find user
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(input.email) as any;
  if (!user) {
    return c.json({
      success: false,
      message: 'Invalid email or password'
    }, 401);
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(input.password, user.password_hash);
  if (!isValidPassword) {
    return c.json({
      success: false,
      message: 'Invalid email or password'
    }, 401);
  }

  // Generate tokens
  const tokens = generateTokens(user.id, user.email);

  return c.json({
    success: true,
    data: {
      user: sanitizeUser(user),
      ...tokens
    }
  });
});

// POST /api/auth/refresh
authRoutes.post('/refresh', async (c) => {
  const body = await c.req.json();
  const input = refreshTokenSchema.parse(body);

  try {
    const payload = jwt.verify(input.refreshToken, config.auth.jwtSecret) as any;

    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) as any;

    if (!user) {
      throw new Error('User not found');
    }

    const tokens = generateTokens(user.id, user.email);

    return c.json({
      success: true,
      data: {
        user: sanitizeUser(user),
        ...tokens
      }
    });
  } catch (error) {
    return c.json({
      success: false,
      message: 'Invalid refresh token'
    }, 401);
  }
});

// POST /api/auth/forgot-password
authRoutes.post('/forgot-password', async (c) => {
  const body = await c.req.json();
  const input = forgotPasswordSchema.parse(body);

  const db = getDatabase();
  db.prepare('SELECT id FROM users WHERE email = ?').get(input.email);

  // Always return success to prevent email enumeration
  return c.json({
    success: true,
    message: 'If the email exists, a reset link has been sent'
  });
});

// POST /api/auth/reset-password
authRoutes.post('/reset-password', async (c) => {
  const body = await c.req.json();
  const input = resetPasswordSchema.parse(body);

  try {
    const payload = jwt.verify(input.token, config.auth.jwtSecret) as any;

    if (payload.type !== 'password-reset') {
      throw new Error('Invalid token type');
    }

    const db = getDatabase();
    const passwordHash = await bcrypt.hash(input.newPassword, config.auth.bcryptRounds);

    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(passwordHash, payload.sub);

    return c.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    return c.json({
      success: false,
      message: 'Invalid or expired reset token'
    }, 400);
  }
});

// POST /api/auth/change-password (protected)
authRoutes.post('/change-password', authMiddleware, async (c) => {
  const body = await c.req.json();
  const input = changePasswordSchema.parse(body);
  const userId = c.get('userId');

  const db = getDatabase();
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as any;

  const isValidPassword = await bcrypt.compare(input.oldPassword, user.password_hash);
  if (!isValidPassword) {
    return c.json({
      success: false,
      message: 'Current password is incorrect'
    }, 400);
  }

  const passwordHash = await bcrypt.hash(input.newPassword, config.auth.bcryptRounds);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(passwordHash, userId);

  return c.json({
    success: true,
    message: 'Password changed successfully'
  });
});

// GET /api/auth/profile (protected)
authRoutes.get('/profile', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const db = getDatabase();

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  if (!user) {
    return c.json({
      success: false,
      message: 'User not found'
    }, 404);
  }

  return c.json({
    success: true,
    data: sanitizeUser(user)
  });
});

// PATCH /api/auth/profile (protected)
authRoutes.patch('/profile', authMiddleware, async (c) => {
  const body = await c.req.json();
  const input = updateProfileSchema.parse(body);
  const userId = c.get('userId');

  const db = getDatabase();
  const updates: string[] = [];
  const values: any[] = [];

  if (input.name !== undefined) {
    updates.push('name = ?');
    values.push(input.name);
  }

  if (input.avatar !== undefined) {
    updates.push('avatar = ?');
    values.push(input.avatar);
  }

  if (input.cookingLevel !== undefined) {
    updates.push('cooking_level = ?');
    values.push(input.cookingLevel);
  }

  if (input.preferences !== undefined) {
    updates.push('preferences = ?');
    values.push(JSON.stringify(input.preferences));
  }

  if (updates.length > 0) {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userId);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  return c.json({
    success: true,
    data: sanitizeUser(user)
  });
});

export { authRoutes };
