import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { getDatabase } from '../config/database.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  createHouseholdSchema,
  updateHouseholdSchema,
  joinHouseholdSchema
} from '../schemas/household.schema.js';
import type { AppEnv } from '../types/hono-env.js';

const householdRoutes = new Hono<AppEnv>();
householdRoutes.use('*', authMiddleware);

// Generate invite code
function generateInviteCode(): string {
  return nanoid(8).toUpperCase();
}

// GET /api/household
householdRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = getDatabase();

  const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId) as any;

  if (!user?.household_id) {
    return c.json({ success: true, data: null });
  }

  const household = db.prepare('SELECT * FROM households WHERE id = ?').get(user.household_id) as any;
  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar, u.cooking_level, hm.role, hm.joined_at
    FROM household_members hm
    JOIN users u ON u.id = hm.user_id
    WHERE hm.household_id = ?
  `).all(user.household_id);

  return c.json({
    success: true,
    data: { ...household, members }
  });
});

// POST /api/household
householdRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = createHouseholdSchema.parse(body);

  const db = getDatabase();
  const id = nanoid();
  const inviteCode = generateInviteCode();

  // Check if user already has a household
  const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId) as any;
  if (user?.household_id) {
    return c.json({ success: false, message: 'User already has a household' }, 409);
  }

  db.prepare(`
    INSERT INTO households (id, name, invite_code, shared_pantry)
    VALUES (?, ?, ?, ?)
  `).run(id, input.name, inviteCode, input.sharedPantry ? 1 : 0);

  // Add user as admin
  db.prepare(`
    INSERT INTO household_members (id, household_id, user_id, role)
    VALUES (?, ?, ?, 'admin')
  `).run(nanoid(), id, userId);

  // Update user's household
  db.prepare('UPDATE users SET household_id = ? WHERE id = ?').run(id, userId);

  const household = db.prepare('SELECT * FROM households WHERE id = ?').get(id);

  return c.json({ success: true, data: household }, 201);
});

// POST /api/household/join
householdRoutes.post('/join', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = joinHouseholdSchema.parse(body);

  const db = getDatabase();

  const household = db.prepare('SELECT * FROM households WHERE invite_code = ?').get(input.inviteCode) as any;
  if (!household) {
    return c.json({ success: false, message: 'Invalid invite code' }, 404);
  }

  // Check if already a member
  const existing = db.prepare(
    'SELECT id FROM household_members WHERE household_id = ? AND user_id = ?'
  ).get(household.id, userId);

  if (existing) {
    return c.json({ success: false, message: 'Already a member' }, 409);
  }

  db.prepare(`
    INSERT INTO household_members (id, household_id, user_id, role)
    VALUES (?, ?, ?, 'member')
  `).run(nanoid(), household.id, userId);

  db.prepare('UPDATE users SET household_id = ? WHERE id = ?').run(household.id, userId);

  return c.json({ success: true, message: 'Joined household' });
});

// PATCH /api/household
householdRoutes.patch('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const input = updateHouseholdSchema.parse(body);

  const db = getDatabase();
  const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId) as any;

  if (!user?.household_id) {
    return c.json({ success: false, message: 'No household found' }, 404);
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (input.name !== undefined) { updates.push('name = ?'); values.push(input.name); }
  if (input.sharedPantry !== undefined) { updates.push('shared_pantry = ?'); values.push(input.sharedPantry ? 1 : 0); }

  if (updates.length > 0) {
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(user.household_id);
    db.prepare(`UPDATE households SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const household = db.prepare('SELECT * FROM households WHERE id = ?').get(user.household_id);
  return c.json({ success: true, data: household });
});

// POST /api/household/regenerate-invite
householdRoutes.post('/regenerate-invite', async (c) => {
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
householdRoutes.delete('/leave', async (c) => {
  const userId = c.get('userId');
  const db = getDatabase();

  const user = db.prepare('SELECT household_id FROM users WHERE id = ?').get(userId) as any;
  if (!user?.household_id) {
    return c.json({ success: false, message: 'No household found' }, 404);
  }

  db.prepare('DELETE FROM household_members WHERE household_id = ? AND user_id = ?')
    .run(user.household_id, userId);
  db.prepare('UPDATE users SET household_id = NULL WHERE id = ?').run(userId);

  return c.json({ success: true, message: 'Left household' });
});

export { householdRoutes };
