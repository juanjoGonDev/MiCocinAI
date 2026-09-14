import { z } from 'zod';

const memberRoleEnum = z.enum(['admin', 'member', 'child']);
const cookingLevelEnum = z.enum(['beginner', 'intermediate', 'expert']);
const dietTypeEnum = z.enum(['omnivore', 'vegetarian', 'vegan', 'pescatarian', 'keto', 'paleo']);
const spiceToleranceEnum = z.enum(['low', 'medium', 'high']);
const portionSizeEnum = z.enum(['small', 'medium', 'large']);
const allergySeverityEnum = z.enum(['mild', 'moderate', 'severe']);

const allergySchema = z.object({
  name: z.string().min(1).max(100),
  severity: allergySeverityEnum.default('moderate'),
  notes: z.string().max(200).optional().nullable()
});

const foodPreferencesSchema = z.object({
  dietType: dietTypeEnum.default('omnivore'),
  cuisinePreferences: z.array(z.string()).optional().default([]),
  spiceTolerance: spiceToleranceEnum.default('medium'),
  portionSize: portionSizeEnum.default('medium')
});

// Household schemas
export const createHouseholdSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  sharedPantry: z.boolean().default(true)
});

export const updateHouseholdSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sharedPantry: z.boolean().optional()
});

export const joinHouseholdSchema = z.object({
  inviteCode: z.string().min(1, 'Invite code is required')
});

// Member schemas
export const updateMemberSchema = z.object({
  role: memberRoleEnum.optional(),
  cookingLevel: cookingLevelEnum.optional(),
  preferences: foodPreferencesSchema.optional(),
  allergies: z.array(allergySchema).optional(),
  dislikes: z.array(z.string().max(100)).optional()
});

export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email format')
});

export type CreateHouseholdInput = z.infer<typeof createHouseholdSchema>;
export type UpdateHouseholdInput = z.infer<typeof updateHouseholdSchema>;
export type JoinHouseholdInput = z.infer<typeof joinHouseholdSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
