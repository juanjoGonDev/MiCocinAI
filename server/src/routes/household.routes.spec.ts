import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import jwt from 'jsonwebtoken';

process.env.DATABASE_PATH = ':memory:';
process.env.NODE_ENV = 'test';

type Sql = import('better-sqlite3').Database;
type User = { id: string; email: string; token: string };

let app: Hono;
let db: Sql;
let closeDatabase: () => void;

describe('household create and join transactions', () => {
  beforeAll(async () => {
    const database = await import('../config/database.js');
    const { householdRoutes } = await import('./household.routes.js');
    const { config } = await import('../config/app.config.js');
    await database.initializeDatabase();
    closeDatabase = database.closeDatabase;
    db = database.getDatabase();
    app = new Hono();
    app.route('/api/household', householdRoutes);
    app.onError((error, context) => {
      return context.json({ success: false, message: error.message }, 500);
    });
    testJwtSecret = config.auth.jwtSecret;
  });

  afterAll(() => closeDatabase());

  beforeEach(() => {
    for (const table of [
      'pantry_categories',
      'ingredients',
      'utensils',
      'household_members',
      'users',
      'households'
    ]) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
    db.exec('DROP TRIGGER IF EXISTS fail_household_seed');
  });

  let testJwtSecret = '';

  async function makeUser(id: string, householdId: string | null): Promise<User> {
    const email = `${id}@hogaria.test`;
    db.prepare(
      'INSERT INTO users (id, email, name, password_hash, household_id) VALUES (?, ?, ?, ?, ?)'
    ).run(id, email, id, 'not-a-real-password-hash', householdId);
    return {
      id,
      email,
      token: jwt.sign({ sub: id, email }, testJwtSecret, { expiresIn: '1h' })
    };
  }

  function call(user: User, method: string, path: string, body?: unknown) {
    return app.request(`/api/household${path}`, {
      method,
      headers: {
        authorization: `Bearer ${user.token}`,
        'content-type': 'application/json'
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }

  function failDuringHouseholdSeed() {
    db.exec(`
      CREATE TRIGGER fail_household_seed
      BEFORE INSERT ON pantry_categories
      WHEN NEW.key = 'vegetables'
        AND (NEW.household_id = 'target-house' OR NEW.user_id = 'create-owner')
      BEGIN
        SELECT RAISE(ABORT, 'forced household seed failure');
      END;
    `);
  }

  function addPersonalRows(userId: string) {
    db.prepare(
      'INSERT INTO ingredients (id, user_id, name, category, quantity, unit) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('personal-ingredient', userId, 'Avena personalizada', 'grains', 2, 'kg');
    db.prepare(
      'INSERT INTO utensils (id, user_id, name, category, available) VALUES (?, ?, ?, ?, ?)'
    ).run('personal-utensil', userId, 'Cuchillo heredado', 'tools', 1);
  }

  function addDuplicateHouseholdRows(userId: string) {
    db.prepare(
      `INSERT INTO ingredients (id, user_id, household_id, name, category, quantity, unit)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('target-ingredient', userId, 'target-house', 'Avena personalizada', 'grains', 7, 'kg');
    db.prepare(
      `INSERT INTO utensils (id, user_id, household_id, name, category, available)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('target-utensil', userId, 'target-house', 'Cuchillo heredado', 'tools', 0);
  }

  async function createJoinFixture() {
    db.prepare('INSERT INTO households (id, name, invite_code) VALUES (?, ?, ?)').run(
      'old-house',
      'Hogar anterior',
      'OLDHOUSE'
    );
    db.prepare('INSERT INTO households (id, name, invite_code) VALUES (?, ?, ?)').run(
      'target-house',
      'Hogar destino',
      'TARGET01'
    );
    const member = await makeUser('joining-member', 'old-house');
    const oldAdmin = await makeUser('old-admin', 'old-house');
    const admin = await makeUser('target-admin', 'target-house');
    db.prepare(
      `INSERT INTO household_members (id, household_id, user_id, role, permissions)
       VALUES (?, ?, ?, 'member', '{}')`
    ).run('old-membership', 'old-house', member.id);
    db.prepare(
      `INSERT INTO household_members (id, household_id, user_id, role, permissions)
       VALUES (?, ?, ?, 'admin', '{}')`
    ).run('old-admin-membership', 'old-house', oldAdmin.id);
    db.prepare(
      `INSERT INTO household_members (id, household_id, user_id, role, permissions)
       VALUES (?, ?, ?, 'admin', '{}')`
    ).run('target-membership', 'target-house', admin.id);
    addPersonalRows(member.id);
    return { member, oldAdmin, admin };
  }

  it('lee el estado sin hogar, la invitación pública y la vista autenticada', async () => {
    const guest = await makeUser('household-guest', null);
    const empty = await call(guest, 'GET', '');
    expect(empty.status).toBe(200);
    expect(await empty.json()).toMatchObject({ success: true, data: null });

    const { admin } = await createJoinFixture();
    const child = await makeUser('read-child', 'target-house');
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run('/uploads/admin.png', admin.id);
    db.prepare(
      `INSERT INTO household_members (id, household_id, user_id, role, permissions)
       VALUES (?, ?, ?, 'child', NULL)`
    ).run('target-child-membership', 'target-house', child.id);

    const missingInvite = await app.request('/api/household/invite/UNKNOWN');
    const publicInvite = await app.request('/api/household/invite/TARGET01');
    const memberInvite = await call(admin, 'GET', '/invite/TARGET01');
    const currentHousehold = await call(admin, 'GET', '');

    expect(missingInvite.status).toBe(404);
    expect(publicInvite.status).toBe(200);
    expect(await publicInvite.json()).toMatchObject({
      success: true,
      data: {
        householdId: 'target-house',
        householdName: 'Hogar destino',
        memberCount: 2,
        alreadyMember: false
      }
    });
    expect(await memberInvite.json()).toMatchObject({
      success: true,
      data: { memberCount: 2, alreadyMember: true }
    });
    const current = (await currentHousehold.json()) as {
      success: boolean;
      data: {
        id: string;
        members: Array<{ userId: string; avatar?: string; permissions: { settings: boolean } }>;
      };
    };
    expect(currentHousehold.status).toBe(200);
    expect(current.data.id).toBe('target-house');
    expect(current.data.members.find((entry) => entry.userId === admin.id)?.avatar).toBe(
      '/uploads/admin.png'
    );
    expect(
      current.data.members.find((entry) => entry.userId === child.id)?.permissions.settings
    ).toBe(false);
  });

  it('lista hogares propios y solo permite seleccionar una membresía existente', async () => {
    const { member } = await createJoinFixture();
    db.prepare(
      `INSERT INTO household_members (id, household_id, user_id, role, permissions)
       VALUES (?, ?, ?, 'member', '{}')`
    ).run('member-target-membership', 'target-house', member.id);

    const memberships = await call(member, 'GET', '/memberships');
    expect(memberships.status).toBe(200);
    expect(await memberships.json()).toMatchObject({
      success: true,
      data: {
        activeHouseholdId: 'old-house',
        memberships: [
          { id: 'old-house', name: 'Hogar anterior', role: 'member', active: true },
          { id: 'target-house', name: 'Hogar destino', role: 'member', active: false }
        ]
      }
    });

    const switched = await call(member, 'POST', '/active', { householdId: 'target-house' });
    expect(switched.status).toBe(200);
    expect(
      (db.prepare('SELECT household_id FROM users WHERE id = ?').get(member.id) as any).household_id
    ).toBe('target-house');
    expect((await call(member, 'GET', '')).status).toBe(200);

    const rejected = await call(member, 'POST', '/active', { householdId: 'unknown-house' });
    expect(rejected.status).toBe(404);
    expect(
      (db.prepare('SELECT household_id FROM users WHERE id = ?').get(member.id) as any).household_id
    ).toBe('target-house');

    const invalid = await call(member, 'POST', '/active', { householdId: '  ' });
    expect(invalid.status).toBe(400);
    expect(
      (db.prepare('SELECT household_id FROM users WHERE id = ?').get(member.id) as any).household_id
    ).toBe('target-house');
  });

  it('repara una selección obsoleta solo si queda una membresía y no filtra con varias', async () => {
    await createJoinFixture();
    const stale = await makeUser('stale-selection', 'target-house');
    db.prepare(
      `INSERT INTO household_members (id, household_id, user_id, role, permissions)
       VALUES (?, ?, ?, 'member', '{}')`
    ).run('stale-old-membership', 'old-house', stale.id);

    const repaired = await call(stale, 'GET', '/memberships');
    expect(repaired.status).toBe(200);
    expect(await repaired.json()).toMatchObject({
      success: true,
      data: { activeHouseholdId: 'old-house', memberships: [{ id: 'old-house', active: true }] }
    });
    expect(
      (db.prepare('SELECT household_id FROM users WHERE id = ?').get(stale.id) as any).household_id
    ).toBe('old-house');

    const unselected = await makeUser('multiple-without-selection', null);
    db.prepare(
      `INSERT INTO household_members (id, household_id, user_id, role, permissions)
       VALUES (?, ?, ?, 'member', '{}')`
    ).run('multi-old-membership', 'old-house', unselected.id);
    db.prepare(
      `INSERT INTO household_members (id, household_id, user_id, role, permissions)
       VALUES (?, ?, ?, 'member', '{}')`
    ).run('multi-target-membership', 'target-house', unselected.id);

    const noImplicitChoice = await call(unselected, 'GET', '');
    expect(noImplicitChoice.status).toBe(200);
    expect(await noImplicitChoice.json()).toMatchObject({ success: true, data: null });
    expect(
      (db.prepare('SELECT household_id FROM users WHERE id = ?').get(unselected.id) as any)
        .household_id
    ).toBeNull();
  });

  it('rolls back household creation when seeding fails after personal rows are adopted', async () => {
    const owner = await makeUser('create-owner', null);
    addPersonalRows(owner.id);
    failDuringHouseholdSeed();

    const response = await call(owner, 'POST', '', { name: 'Nuevo hogar' });

    expect(response.status).toBe(500);
    expect(db.prepare('SELECT COUNT(*) AS count FROM households').get()).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM household_members').get()).toEqual({
      count: 0
    });
    expect(
      (
        db.prepare('SELECT household_id FROM users WHERE id = ?').get(owner.id) as {
          household_id: string | null;
        }
      ).household_id
    ).toBeNull();
    expect(
      (
        db
          .prepare('SELECT household_id FROM ingredients WHERE id = ?')
          .get('personal-ingredient') as {
          household_id: string | null;
        }
      ).household_id
    ).toBeNull();
    expect(
      (
        db.prepare('SELECT household_id FROM utensils WHERE id = ?').get('personal-utensil') as {
          household_id: string | null;
        }
      ).household_id
    ).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS count FROM pantry_categories').get()).toEqual({
      count: 0
    });
  });

  it.each([
    { label: 'el endpoint con código en el body', path: '/join', useBody: true },
    { label: 'el endpoint con código en la ruta', path: '/join/TARGET01', useBody: false }
  ])(
    'conserva el hogar anterior si falla la siembra al unirse por $label',
    async ({ path, useBody }) => {
      const { member, admin } = await createJoinFixture();
      addDuplicateHouseholdRows(admin.id);
      failDuringHouseholdSeed();

      const response = await call(
        member,
        'POST',
        path,
        useBody ? { inviteCode: 'TARGET01' } : undefined
      );

      expect(response.status).toBe(500);
      expect(
        (
          db.prepare('SELECT household_id FROM users WHERE id = ?').get(member.id) as {
            household_id: string | null;
          }
        ).household_id
      ).toBe('old-house');
      expect(
        db
          .prepare('SELECT id FROM household_members WHERE household_id = ? AND user_id = ?')
          .get('old-house', member.id)
      ).toEqual({ id: 'old-membership' });
      expect(
        db
          .prepare('SELECT id FROM household_members WHERE household_id = ? AND user_id = ?')
          .get('target-house', member.id)
      ).toBeUndefined();
      expect(
        (
          db
            .prepare('SELECT household_id FROM ingredients WHERE id = ?')
            .get('personal-ingredient') as {
            household_id: string | null;
          }
        ).household_id
      ).toBeNull();
      expect(
        (
          db.prepare('SELECT household_id FROM utensils WHERE id = ?').get('personal-utensil') as {
            household_id: string | null;
          }
        ).household_id
      ).toBeNull();
      expect(
        db.prepare('SELECT quantity FROM ingredients WHERE id = ?').get('target-ingredient')
      ).toEqual({ quantity: 7 });
      expect(
        db.prepare('SELECT available FROM utensils WHERE id = ?').get('target-utensil')
      ).toEqual({ available: 0 });
      expect(
        db
          .prepare('SELECT COUNT(*) AS count FROM pantry_categories WHERE household_id = ?')
          .get('target-house')
      ).toEqual({ count: 0 });
    }
  );

  it('crea el hogar y adopta los datos personales cuando toda la secuencia termina', async () => {
    const owner = await makeUser('create-owner', null);
    addPersonalRows(owner.id);

    const response = await call(owner, 'POST', '', { name: 'Nuevo hogar' });
    const result = (await response.json()) as {
      success: boolean;
      data: { id: string };
    };

    expect(response.status).toBe(201);
    expect(result.success).toBe(true);
    expect(result.data.id).toBeTruthy();
    expect(
      db
        .prepare(
          `SELECT h.ai_owner_user_id, hm.role
             FROM households h
             JOIN household_members hm ON hm.household_id = h.id AND hm.user_id = ?
            WHERE h.id = ?`
        )
        .get(owner.id, result.data.id)
    ).toEqual({ ai_owner_user_id: null, role: 'admin' });
    expect(
      (
        db.prepare('SELECT household_id FROM users WHERE id = ?').get(owner.id) as {
          household_id: string | null;
        }
      ).household_id
    ).toBe(result.data.id);
    expect(
      (
        db
          .prepare('SELECT household_id FROM ingredients WHERE id = ?')
          .get('personal-ingredient') as {
          household_id: string | null;
        }
      ).household_id
    ).toBe(result.data.id);
    expect(
      (
        db.prepare('SELECT household_id FROM utensils WHERE id = ?').get('personal-utensil') as {
          household_id: string | null;
        }
      ).household_id
    ).toBe(result.data.id);
    expect(
      db
        .prepare('SELECT COUNT(*) AS count FROM pantry_categories WHERE household_id = ?')
        .get(result.data.id)
    ).toEqual({ count: 13 });
  });

  it('permite crear otro hogar sin eliminar la membresía anterior ni adoptar datos de esa casa', async () => {
    const { member } = await createJoinFixture();

    const response = await call(member, 'POST', '', { name: 'Segundo hogar' });
    const body = (await response.json()) as { data: { id: string } };

    expect(response.status).toBe(201);
    expect(db.prepare('SELECT COUNT(*) AS count FROM households').get()).toEqual({ count: 3 });
    expect(
      db
        .prepare('SELECT id FROM household_members WHERE household_id = ? AND user_id = ?')
        .get('old-house', member.id)
    ).toBeTruthy();
    expect(
      db
        .prepare('SELECT role FROM household_members WHERE household_id = ? AND user_id = ?')
        .get(body.data.id, member.id)
    ).toEqual({ role: 'admin' });
    expect(
      (db.prepare('SELECT household_id FROM users WHERE id = ?').get(member.id) as any).household_id
    ).toBe(body.data.id);
    expect(
      (
        db
          .prepare('SELECT household_id FROM ingredients WHERE id = ?')
          .get('personal-ingredient') as any
      ).household_id
    ).toBeNull();
  });

  it.each([
    { label: 'el endpoint con código en el body', path: '/join', useBody: true },
    { label: 'el endpoint con código en la ruta', path: '/join/TARGET01', useBody: false }
  ])(
    'añade una segunda membresía sin mover datos de la casa anterior por $label',
    async ({ path, useBody }) => {
      const { member } = await createJoinFixture();

      const response = await call(
        member,
        'POST',
        path,
        useBody ? { inviteCode: 'TARGET01' } : undefined
      );

      expect(response.status).toBe(200);
      expect(
        (
          db.prepare('SELECT household_id FROM users WHERE id = ?').get(member.id) as {
            household_id: string | null;
          }
        ).household_id
      ).toBe('target-house');
      expect(
        db
          .prepare('SELECT id FROM household_members WHERE household_id = ? AND user_id = ?')
          .get('old-house', member.id)
      ).toEqual({ id: 'old-membership' });
      expect(
        db
          .prepare('SELECT id FROM household_members WHERE household_id = ? AND user_id = ?')
          .get('target-house', member.id)
      ).toBeTruthy();
      expect(
        (
          db
            .prepare('SELECT household_id FROM ingredients WHERE id = ?')
            .get('personal-ingredient') as {
            household_id: string | null;
          }
        ).household_id
      ).toBeNull();
      expect(
        (
          db.prepare('SELECT household_id FROM utensils WHERE id = ?').get('personal-utensil') as {
            household_id: string | null;
          }
        ).household_id
      ).toBeNull();
      expect(
        db
          .prepare('SELECT COUNT(*) AS count FROM pantry_categories WHERE household_id = ?')
          .get('target-house')
      ).toEqual({ count: 13 });
    }
  );

  it('une a una cuenta sin hogar y adopta sus filas personales al primer hogar', async () => {
    db.prepare('INSERT INTO households (id, name, invite_code) VALUES (?, ?, ?)').run(
      'target-house',
      'Hogar destino',
      'TARGET01'
    );
    const member = await makeUser('personal-member', null);
    const admin = await makeUser('target-admin', 'target-house');
    db.prepare(
      `INSERT INTO household_members (id, household_id, user_id, role, permissions)
       VALUES (?, ?, ?, 'admin', '{}')`
    ).run('target-membership', 'target-house', admin.id);
    addPersonalRows(member.id);

    const response = await call(member, 'POST', '/join', { inviteCode: 'TARGET01' });

    expect(response.status).toBe(200);
    expect(
      (
        db.prepare('SELECT household_id FROM users WHERE id = ?').get(member.id) as {
          household_id: string | null;
        }
      ).household_id
    ).toBe('target-house');
    expect(
      db
        .prepare('SELECT id FROM household_members WHERE household_id = ? AND user_id = ?')
        .get('target-house', member.id)
    ).toBeTruthy();
    expect(
      (
        db
          .prepare('SELECT household_id FROM ingredients WHERE id = ?')
          .get('personal-ingredient') as {
          household_id: string | null;
        }
      ).household_id
    ).toBe('target-house');
  });

  it('preserva los resultados de código inválido y membresía duplicada sin escrituras', async () => {
    const { member, admin } = await createJoinFixture();

    expect((await call(member, 'POST', '/join/NO-SUCH-CODE')).status).toBe(404);
    expect((await call(admin, 'POST', '/join', { inviteCode: 'TARGET01' })).status).toBe(409);
    expect(
      (
        db.prepare('SELECT household_id FROM users WHERE id = ?').get(member.id) as {
          household_id: string | null;
        }
      ).household_id
    ).toBe('old-house');
    expect(
      db
        .prepare('SELECT COUNT(*) AS count FROM household_members WHERE household_id = ?')
        .get('target-house')
    ).toEqual({ count: 1 });
  });

  it('un administrador no puede cambiar el rol de un miembro de otro hogar', async () => {
    const { member, admin } = await createJoinFixture();

    const response = await call(admin, 'PATCH', '', {
      name: 'Cambio que no debe aplicarse',
      memberId: 'old-membership',
      memberRole: 'child'
    });

    expect(response.status).toBe(404);
    expect(
      db.prepare('SELECT role FROM household_members WHERE id = ?').get('old-membership')
    ).toEqual({ role: 'member' });
    expect(db.prepare('SELECT name FROM households WHERE id = ?').get('target-house')).toEqual({
      name: 'Hogar destino'
    });
    expect(
      (
        db.prepare('SELECT household_id FROM users WHERE id = ?').get(member.id) as {
          household_id: string | null;
        }
      ).household_id
    ).toBe('old-house');
  });

  it('permite al administrador cambiar un rol local y lo rechaza a un miembro', async () => {
    const { member, admin } = await createJoinFixture();
    const localMember = await makeUser('local-member', 'target-house');
    db.prepare(
      `INSERT INTO household_members (id, household_id, user_id, role, permissions)
       VALUES (?, ?, ?, 'member', '{}')`
    ).run('target-local-membership', 'target-house', localMember.id);

    const changed = await call(admin, 'PATCH', '', {
      memberId: 'target-local-membership',
      memberRole: 'child'
    });
    const denied = await call(member, 'PATCH', '', {
      memberId: 'old-membership',
      memberRole: 'child'
    });

    expect(changed.status).toBe(200);
    expect(
      db.prepare('SELECT role FROM household_members WHERE id = ?').get('target-local-membership')
    ).toEqual({ role: 'child' });
    expect(denied.status).toBe(403);
    expect(
      db.prepare('SELECT role FROM household_members WHERE id = ?').get('old-membership')
    ).toEqual({ role: 'member' });

    const customPermissions = { pantry: { view: true, edit: false } };
    const permissionUpdate = await call(admin, 'PATCH', '', {
      memberId: 'target-local-membership',
      memberPermissions: customPermissions
    });
    expect(permissionUpdate.status).toBe(200);
    expect(
      db
        .prepare('SELECT permissions FROM household_members WHERE id = ?')
        .get('target-local-membership')
    ).toEqual({ permissions: JSON.stringify(customPermissions) });
  });

  it('persiste los tres ajustes compartidos del admin y responde al PATCH vacío', async () => {
    const { admin } = await createJoinFixture();

    const updated = await call(admin, 'PATCH', '', {
      name: 'Hogar actualizado',
      sharedPantry: false,
      shareRecipes: false,
      shareCalendar: false
    });
    const body = (await updated.json()) as any;

    expect(updated.status).toBe(200);
    expect(body.data).toMatchObject({
      id: 'target-house',
      name: 'Hogar actualizado',
      sharedPantry: false,
      shareRecipes: false,
      shareCalendar: false
    });
    expect(
      db
        .prepare(
          'SELECT name, shared_pantry, share_recipes, share_calendar FROM households WHERE id = ?'
        )
        .get('target-house')
    ).toEqual({
      name: 'Hogar actualizado',
      shared_pantry: 0,
      share_recipes: 0,
      share_calendar: 0
    });
    expect((await call(admin, 'PATCH', '', {})).status).toBe(200);
  });

  it('regenera el enlace y distingue una cuenta todavía sin hogar', async () => {
    const personalUser = await makeUser('personal-user', null);
    expect((await call(personalUser, 'PATCH', '', { name: 'No disponible' })).status).toBe(404);
    expect((await call(personalUser, 'POST', '/regenerate-invite', {})).status).toBe(404);
    expect((await call(personalUser, 'DELETE', '/leave')).status).toBe(404);

    const { admin } = await createJoinFixture();
    const regenerated = await call(admin, 'POST', '/regenerate-invite', {});
    const body = (await regenerated.json()) as { success: boolean; data: { inviteCode: string } };

    expect(regenerated.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.inviteCode).toHaveLength(8);
    expect(body.data.inviteCode).not.toBe('TARGET01');
    expect((await app.request('/api/household/invite/TARGET01')).status).toBe(404);
    expect((await app.request(`/api/household/invite/${body.data.inviteCode}`)).status).toBe(200);
  });

  it('permite que un miembro salga sin borrar el hogar de los demás', async () => {
    const { member, oldAdmin } = await createJoinFixture();

    const response = await call(member, 'DELETE', '/leave');

    expect(response.status).toBe(200);
    expect(
      (
        db.prepare('SELECT household_id FROM users WHERE id = ?').get(member.id) as {
          household_id: string | null;
        }
      ).household_id
    ).toBeNull();
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM households WHERE id = ?').get('old-house')
    ).toEqual({
      count: 1
    });
    expect(
      db
        .prepare('SELECT COUNT(*) AS count FROM household_members WHERE household_id = ?')
        .get('old-house')
    ).toEqual({ count: 1 });
    expect(
      db
        .prepare('SELECT id FROM household_members WHERE household_id = ? AND user_id = ?')
        .get('old-house', oldAdmin.id)
    ).toEqual({ id: 'old-admin-membership' });
  });

  it('al salir de la casa activa conserva y selecciona otra membresía', async () => {
    const { member } = await createJoinFixture();
    db.prepare(
      `INSERT INTO household_members (id, household_id, user_id, role, permissions)
       VALUES (?, ?, ?, 'member', '{}')`
    ).run('member-target-membership', 'target-house', member.id);

    const response = await call(member, 'DELETE', '/leave');

    expect(response.status).toBe(200);
    expect(
      db
        .prepare('SELECT id FROM household_members WHERE household_id = ? AND user_id = ?')
        .get('old-house', member.id)
    ).toBeUndefined();
    expect(
      db
        .prepare('SELECT id FROM household_members WHERE household_id = ? AND user_id = ?')
        .get('target-house', member.id)
    ).toEqual({ id: 'member-target-membership' });
    expect(
      (db.prepare('SELECT household_id FROM users WHERE id = ?').get(member.id) as any).household_id
    ).toBe('target-house');
  });

  it('al salir el único admin elimina el hogar y solo su inventario compartido', async () => {
    db.prepare('INSERT INTO households (id, name, invite_code) VALUES (?, ?, ?)').run(
      'only-house',
      'Hogar único',
      'ONLYONE1'
    );
    const owner = await makeUser('only-owner', 'only-house');
    db.prepare(
      `INSERT INTO household_members (id, household_id, user_id, role, permissions)
       VALUES (?, ?, ?, 'admin', '{}')`
    ).run('only-admin-membership', 'only-house', owner.id);
    db.prepare(
      'INSERT INTO ingredients (id, user_id, household_id, name, category, quantity, unit) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('shared-ingredient', owner.id, 'only-house', 'Patatas', 'vegetables', 4, 'kg');
    db.prepare(
      'INSERT INTO ingredients (id, user_id, name, category, quantity, unit) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('personal-ingredient', owner.id, 'Avena', 'grains', 2, 'kg');
    db.prepare(
      'INSERT INTO utensils (id, user_id, household_id, name, category, available) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('shared-utensil', owner.id, 'only-house', 'Olla', 'cookware', 1);

    const response = await call(owner, 'DELETE', '/leave');

    expect(response.status).toBe(200);
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM households WHERE id = ?').get('only-house')
    ).toEqual({
      count: 0
    });
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM ingredients WHERE id = ?').get('shared-ingredient')
    ).toEqual({
      count: 0
    });
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM utensils WHERE id = ?').get('shared-utensil')
    ).toEqual({
      count: 0
    });
    expect(
      db.prepare('SELECT household_id FROM ingredients WHERE id = ?').get('personal-ingredient')
    ).toEqual({
      household_id: null
    });
    expect(
      (
        db.prepare('SELECT household_id FROM users WHERE id = ?').get(owner.id) as {
          household_id: string | null;
        }
      ).household_id
    ).toBeNull();
  });
});
