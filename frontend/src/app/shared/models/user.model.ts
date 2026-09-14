export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  householdId?: string;
  cookingLevel: CookingLevel;
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export type CookingLevel = 'beginner' | 'intermediate' | 'expert';

export interface UserPreferences {
  theme: Theme;
  language: Language;
  detailLevel: DetailLevel;
  notifications: NotificationPreferences;
}

export type Theme = 'light' | 'dark' | 'system';

export type Language = 'es' | 'en';

export type DetailLevel = 'basic' | 'intermediate' | 'expert';

export interface NotificationPreferences {
  expirationAlerts: boolean;
  mealReminders: boolean;
  recipeSuggestions: boolean;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  cookingLevel?: CookingLevel;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
}

export interface TokenPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

export const COOKING_LEVEL_LABELS: Record<CookingLevel, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  expert: 'Experto'
};

export const THEME_LABELS: Record<Theme, string> = {
  light: 'Claro',
  dark: 'Oscuro',
  system: 'Sistema'
};

export const DETAIL_LEVEL_LABELS: Record<DetailLevel, string> = {
  basic: 'Básico',
  intermediate: 'Intermedio',
  expert: 'Experto'
};
