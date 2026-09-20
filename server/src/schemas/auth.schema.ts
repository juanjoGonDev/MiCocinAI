import { z } from 'zod';
import { cookingLevelEnum } from '../utils/taste-profile.js';

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  cookingLevel: cookingLevelEnum.optional().default('beginner')
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format')
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Old password is required'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
});

/**
 * La foto de la cuenta: una URL absoluta (una foto que ya vive en otro sitio) o la ruta que
 * produce el propio `POST /auth/avatar`. `z.string().url()` a secas RECHAZABA esa ruta propia,
 * o sea: el backend no aceptaba el valor que el backend mismo devuelve. `null` la quita.
 */
export const avatarField = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) => /^\/api\/uploads\/avatars\/[a-zA-Z0-9._-]{4,80}$/.test(value) || /^https?:\/\//.test(value),
    'avatar debe ser una ruta de subida de esta app o una URL absoluta'
  );

export const avatarImageSchema = z.object({
  // El navegador recorta y comprime antes de mandar: 128 px de lado no necesitan mas de unas
  // decenas de KB, y el techo existe para que un `POST` con 40 MB no llegue ni a parsearse.
  image: z.string().min(24).max(1_000_000)
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  avatar: avatarField.optional().nullable(),
  cookingLevel: cookingLevelEnum.optional(),
  preferences: z.object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    language: z.enum(['es', 'en']).optional(),
    detailLevel: z.enum(['basic', 'intermediate', 'expert']).optional(),
    notifications: z.object({
      expirationAlerts: z.boolean().optional(),
      mealReminders: z.boolean().optional(),
      recipeSuggestions: z.boolean().optional()
    }).optional()
  }).optional()
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
