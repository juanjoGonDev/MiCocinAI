export interface Household {
  id: string;
  name: string;
  inviteCode: string;
  members: HouseholdMember[];
  sharedPantry: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface HouseholdMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  cookingLevel: CookingLevel;
  preferences: FoodPreferences;
  allergies: Allergy[];
  dislikes: string[];
  avatar?: string;
  joinedAt: Date;
}

export type MemberRole = 'admin' | 'member' | 'child';

export type CookingLevel = 'beginner' | 'intermediate' | 'expert';

export interface FoodPreferences {
  dietType: DietType;
  cuisinePreferences: string[];
  spiceTolerance: SpiceTolerance;
  portionSize: PortionSize;
}

export type DietType =
  | 'omnivore'
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'keto'
  | 'paleo';

export type SpiceTolerance = 'low' | 'medium' | 'high';

export type PortionSize = 'small' | 'medium' | 'large';

export interface Allergy {
  id: string;
  name: string;
  severity: AllergySeverity;
  notes?: string;
}

export type AllergySeverity = 'mild' | 'moderate' | 'severe';

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  admin: 'Administrador',
  member: 'Miembro',
  child: 'Niño'
};

export const COOKING_LEVEL_LABELS: Record<CookingLevel, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  expert: 'Experto'
};

export const DIET_TYPE_LABELS: Record<DietType, string> = {
  omnivore: 'Omnívoro',
  vegetarian: 'Vegetariano',
  vegan: 'Vegano',
  pescatarian: 'Pescetariano',
  keto: 'Keto',
  paleo: 'Paleo'
};

export const SPICE_TOLERANCE_LABELS: Record<SpiceTolerance, string> = {
  low: 'Bajo',
  medium: 'Medio',
  high: 'Alto'
};

export const PORTION_SIZE_LABELS: Record<PortionSize, string> = {
  small: 'Pequeña',
  medium: 'Mediana',
  large: 'Grande'
};

export const ALLERGY_SEVERITY_LABELS: Record<AllergySeverity, string> = {
  mild: 'Leve',
  moderate: 'Moderada',
  severe: 'Severa'
};
