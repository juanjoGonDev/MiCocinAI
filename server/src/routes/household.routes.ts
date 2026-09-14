import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { getDatabase } from '../config/database.js';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import {
  createHouseholdSchema,
  joinHouseholdSchema
} from '../schemas/household.schema.js';
import type { AppEnv } from '../types/hono-env.js';
import { seedDefaultsForHousehold } from '../utils/seed-data.js';

const householdRoutes = new Hono<AppEnv>();

// Generate invite code
function generateInviteCode(): string {
  return nanoid(8).toUpperCase();
}

function mapHousehold(raw: any) {
  return {
    id: raw.id,
    name: raw.name,
    inviteCode: raw.invite_code,
    sharedPantry: !!raw.shared_pantry,
    shareRecipes: !!raw.share_recipes,
    shareCalendar: !!raw.share_calendar,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    members: (raw.members || []).map((m: any) => ({
      id: m.id,
      userId: m.user_id,
      name: m.name,
      email: m.email,
      avatar: m.avatar ?? undefined,
      role: m.role,
      cookingLevel: m.cooking_level,
      joinedAt: m.joined_at,
      permissions: m.permissions ? JSON.parse(m.permissions) : defaultPermissions(m.role)
    }))
  };
}

export function defaultPermissions(role: string) {
  // Default permissions by role. Granular flags allow fine-tuning later.
  if (role === 'admin') {
    return {
      pantry: { view: true, edit: true, manage: true },
      recipes: { view: true, create: true, edit: true, delete: true, generateAI: true },
      calendar: { view: true, edit: true },
      members: { invite: true, kick: true, manageRoles: true },
      settings: true
    };
  }
  if (role === 'child') {
    return {
      pantry: { view: true, edit: false, manage: false },
      recipes: { view: true, create: false, edit: false, delete: false, generateAI: false },
      calendar: { view: true, edit: false },
      members: { invite: false, kick: false, manageRoles: false },
      settings: false
    };
  }
  // member
  return {
    pantry: { view: true, edit: true, manage: false },
    recipes: { view: true, create: true, edit: false, delete: false, generateAI: true },
    calendar: { view: true, edit: true },
    members: { invite: false, kick: false, manageRoles: false },
    settings: false
  };
}

// Public (no auth) invite info endpoint — so links work for non-logged users
householdRoutes.get('/invite/:code', optionalAuthMiddleware, async (c) => {
  const code = c.req.param('code');
  const db = getDatabase();

  const household = db.prepare('SELECT id, name FROM households WHERE invite_code = ?').get(code) as any;
  if (!household) {
    return c.json({ success: false, message: 'Invalid invite code' }, 404);
  }

  const memberCount = db.prepare(
    'SELECT COUNT(*) as count FROM household_members WHERE household_id = ?'
  ).get(household.id) as any;

  return c.json({
    success: true,
    data: {
      householdId: household.id,
      householdName: household.name,
      memberCount: memberCount.count,
      alreadyMember: !!(c.get('userId') && db.prepare(
        'SELECT 1 FROM household_members WHERE household_id = ? AND user_id = ?'
      ).get(household.id, c.get('userId')))
    }
  });
});

// POST /api/household/join/:code — join by code (also accepts the link from invite page)
householdRoutes.post('/join/:code', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const code = c.req.param('code') || '';
  return doJoin(c, userId, code);
});

// GET /api/household
householdRoutes.get('/', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const db = getDatabase();

  const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId) as any;

  if (!user?.household_id) {
    return c.json({ success: true, data: null });
  }

  const household = db.prepare('SELECT * FROM households WHERE id = ?').get(user.household_id) as any;
  const members = db.prepare(`
    SELECT hm.id, hm.user_id, u.name, u.email, u.avatar, u.cooking_level, hm.role, hm.joined_at, hm.permissions
    FROM household_members hm
    JOIN users u ON u.id = hm.user_id
    WHERE hm.household_id = ?
  `).all(user.household_id);

  return c.json({
    success: true,
    data: mapHousehold({ ...household, members })
  });
});

// POST /api/household
householdRoutes.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = createHouseholdSchema.parse(body);

  const db = getDatabase();
  const id = nanoid();
  const inviteCode = generateInviteCode();

  const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId) as any;
  if (user?.household_id) {
    return c.json({ success: false, message: 'User already has a household' }, 409);
  }

  db.prepare(`
    INSERT INTO households (id, name, invite_code, shared_pantry, share_recipes, share_calendar)
    VALUES (?, ?, ?, ?, 1, 1)
  `).run(id, input.name, inviteCode, input.sharedPantry ? 1 : 0);

  const perms = JSON.stringify(defaultPermissions('admin'));
  db.prepare(`
    INSERT INTO household_members (id, household_id, user_id, role, permissions)
    VALUES (?, ?, ?, 'admin', ?)
  `).run(nanoid(), id, userId, perms);

  db.prepare('UPDATE users SET household_id = ? WHERE id = ?').run(id, userId);

  // Seed default pantry items and utensils for the household
  seedDefaultsForHousehold(db, id);

  const household = db.prepare('SELECT * FROM households WHERE id = ?').get(id) as any;
  const members = db.prepare(`
    SELECT hm.id, hm.user_id, u.name, u.email, u.avatar, u.cooking_level, hm.role, hm.joined_at, hm.permissions
    FROM household_members hm JOIN users u ON u.id = hm.user_id WHERE hm.household_id = ?
  `).all(id);

  return c.json({ success: true, data: mapHousehold({ ...household, members }) }, 201);
});

// POST /api/household/join
householdRoutes.post('/join', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = joinHouseholdSchema.parse(body);
  return doJoin(c, userId, input.inviteCode);
});

async function doJoin(c: any, userId: string, inviteCode: string) {
  const db = getDatabase();

  const household = db.prepare('SELECT * FROM households WHERE invite_code = ?').get(inviteCode) as any;
  if (!household) {
    return c.json({ success: false, message: 'Invalid invite code' }, 404);
  }

  const existing = db.prepare(
    'SELECT id FROM household_members WHERE household_id = ? AND user_id = ?'
  ).get(household.id, userId);

  if (existing) {
    return c.json({ success: false, message: 'Already a member' }, 409);
  }

  // If user already belongs to another household, leave it first
  const currentUser = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId) as any;
  if (currentUser?.household_id && currentUser.household_id !== household.id) {
    db.prepare('DELETE FROM household_members WHERE household_id = ? AND user_id = ?').run(currentUser.household_id, userId);
  }

  const perms = JSON.stringify(defaultPermissions('member'));
  db.prepare(`
    INSERT INTO household_members (id, household_id, user_id, role, permissions)
    VALUES (?, ?, ?, 'member', ?)
  `).run(nanoid(), household.id, userId, perms);

  db.prepare('UPDATE users SET household_id = ? WHERE id = ?').run(household.id, userId);

  return c.json({ success: true, message: 'Joined household' });
}

// PATCH /api/household — settings (admin only)
householdRoutes.patch('/', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const db = getDatabase();
  const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId) as any;
  if (!user?.household_id) {
    return c.json({ success: false, message: 'No household found' }, 404);
  }

  const membership = db.prepare(
    'SELECT role FROM household_members WHERE household_id = ? AND user_id = ?'
  ).get(user.household_id, userId) as any;
  if (!membership || membership.role !== 'admin') {
    return c.json({ success: false, message: 'Only admins can change settings' }, 403);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
  if (body.sharedPantry !== undefined) { updates.push('shared_pantry = ?'); values.push(body.sharedPantry ? 1 : 0); }
  if (body.shareRecipes !== undefined) { updates.push('share_recipes = ?'); values.push(body.shareRecipes ? 1 : 0); }
  if (body.shareCalendar !== undefined) { updates.push('share_calendar = ?'); values.push(body.shareCalendar ? 1 : 0); }

  if (updates.length > 0) {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(user.household_id);
    db.prepare(`UPDATE households SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  // Update member role/permissions if provided (admin only)
  if (body.memberId && (body.memberRole || body.memberPermissions)) {
    const memUpdates: string[] = [];
    const memValues: any[] = [];
    if (body.memberRole) { memUpdates.push('role = ?'); memValues.push(body.memberRole); }
    if (body.memberPermissions) {
      memUpdates.push('permissions = ?');
      memValues.push(JSON.stringify(body.memberRole ? defaultPermissions(body.memberRole) : body.memberPermissions));
    } else if (body.memberRole) {
      memUpdates.push('permissions = ?');
      memValues.push(JSON.stringify(defaultPermissions(body.memberRole)));
    }
    memValues.push(body.memberId);
    db.prepare(`UPDATE household_members SET ${memUpdates.join(', ')} WHERE id = ?`).run(...memValues);
  }

  const household = db.prepare('SELECT * FROM households WHERE id = ?').get(user.household_id) as any;
  const members = db.prepare(`
    SELECT hm.id, hm.user_id, u.name, u.email, u.avatar, u.cooking_level, hm.role, hm.joined_at, hm.permissions
    FROM household_members hm JOIN users u ON u.id = hm.user_id WHERE hm.household_id = ?
  `).all(user.household_id);
  return c.json({ success: true, data: mapHousehold({ ...household, members }) });
});

// POST /api/household/regenerate-invite
householdRoutes.post('/regenerate-invite', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const db = getDatabase();

  const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId) as any;
  if (!user?.household_id) {
    return c.json({ success: false, message: 'No household found' }, 404);
  }

  const newCode = generateInviteCode();
  db.prepare('UPDATE households SET invite_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(newCode, user.household_id);

  return c.json({ success: true, data: { inviteCode: newCode } });
});

// DELETE /api/household/leave
householdRoutes.delete('/leave', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const db = getDatabase();

  const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId) as any;
  if (!user?.household_id) {
    return c.json({ success: false, message: 'No household found' }, 404);
  }

  // If admin and only member, delete household entirely
  const memberCount = db.prepare(
    'SELECT COUNT(*) as c FROM household_members WHERE household_id = ?'
  ).get(user.household_id) as any;
  const membership = db.prepare(
    'SELECT role FROM household_members WHERE household_id = ? AND user_id = ?'
  ).get(user.household_id, userId) as any;

  db.prepare('DELETE FROM household_members WHERE household_id = ? AND user_id = ?').run(user.household_id, userId);
  db.prepare('UPDATE users SET household_id = NULL WHERE id = ?').run(userId);

  if (membership?.role === 'admin' && memberCount.c <= 1) {
    db.prepare('DELETE FROM ingredients WHERE household_id = ?').run(user.household_id);
    db.prepare('DELETE FROM utensils WHERE household_id = ?').run(user.household_id);
    db.prepare('DELETE FROM households WHERE id = ?').run(user.household_id);
  }

  return c.json({ success: true, message: 'Left household' });
});

export { householdRoutes };
