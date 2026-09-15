import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

/**
 * Seeds a newly created household with a sensible starter set of common
 * ingredients (quantity 0 - they appear as suggestions the user can
 * "add to pantry") and common kitchen utensils (available = false by
 * default - the user must mark which ones they actually own).
 *
 * Categories MUST match the backend enums (see schemas/pantry.schema.ts):
 *   ingredient categories: dairy, meat, fish, vegetables, fruits, grains,
 *       spices, condiments, frozen, canned, beverages, other
 *   utensil categories: oven, microwave, airfryer, stovetop, blender,
 *       mixer, food-processor, cookware, bakeware, tools
 */

interface SeedItem { name: string; category: string; unit?: string }
interface SeedUtensil { name: string; category: string }

const COMMON_INGREDIENTS: SeedItem[] = [
  // Vegetables
  { name: 'Patatas', category: 'vegetables', unit: 'kg' },
  { name: 'Cebolla', category: 'vegetables', unit: 'unit' },
  { name: 'Ajo', category: 'vegetables', unit: 'unit' },
  { name: 'Tomate', category: 'vegetables', unit: 'unit' },
  { name: 'Zanahoria', category: 'vegetables', unit: 'unit' },
  { name: 'Pimiento', category: 'vegetables', unit: 'unit' },
  { name: 'Lechuga', category: 'vegetables', unit: 'unit' },
  { name: 'Pepino', category: 'vegetables', unit: 'unit' },
  { name: 'Calabacín', category: 'vegetables', unit: 'unit' },
  { name: 'Berenjena', category: 'vegetables', unit: 'unit' },
  { name: 'Brócoli', category: 'vegetables', unit: 'g' },
  { name: 'Espinacas', category: 'vegetables', unit: 'g' },
  // Fruits
  { name: 'Plátano', category: 'fruits', unit: 'unit' },
  { name: 'Manzana', category: 'fruits', unit: 'unit' },
  { name: 'Naranja', category: 'fruits', unit: 'unit' },
  { name: 'Limón', category: 'fruits', unit: 'unit' },
  { name: 'Fresas', category: 'fruits', unit: 'g' },
  { name: 'Uvas', category: 'fruits', unit: 'g' },
  { name: 'Aguacate', category: 'fruits', unit: 'unit' },
  { name: 'Piña', category: 'fruits', unit: 'unit' },
  { name: 'Melocotón', category: 'fruits', unit: 'unit' },
  { name: 'Pera', category: 'fruits', unit: 'unit' },
  // Meats / Fish / Eggs
  { name: 'Huevos', category: 'other', unit: 'unit' },
  { name: 'Pollo', category: 'meat', unit: 'g' },
  { name: 'Carne picada', category: 'meat', unit: 'g' },
  { name: 'Ternera', category: 'meat', unit: 'g' },
  { name: 'Cerdo', category: 'meat', unit: 'g' },
  { name: 'Bacón', category: 'meat', unit: 'g' },
  { name: 'Salmón', category: 'fish', unit: 'g' },
  { name: 'Merluza', category: 'fish', unit: 'g' },
  { name: 'Atún en lata', category: 'canned', unit: 'unit' },
  { name: 'Gambas', category: 'fish', unit: 'g' },
  // Dairy
  { name: 'Leche', category: 'dairy', unit: 'l' },
  { name: 'Queso', category: 'dairy', unit: 'g' },
  { name: 'Queso rallado', category: 'dairy', unit: 'g' },
  { name: 'Yogur', category: 'dairy', unit: 'unit' },
  { name: 'Mantequilla', category: 'dairy', unit: 'g' },
  { name: 'Nata', category: 'dairy', unit: 'ml' },
  // Grains / Pantry staples
  { name: 'Arroz', category: 'grains', unit: 'g' },
  { name: 'Pasta', category: 'grains', unit: 'g' },
  { name: 'Pan de molde', category: 'grains', unit: 'unit' },
  { name: 'Pan', category: 'grains', unit: 'unit' },
  { name: 'Harina', category: 'grains', unit: 'g' },
  { name: 'Azúcar', category: 'other', unit: 'g' },
  { name: 'Sal', category: 'spices', unit: 'g' },
  { name: 'Pimienta', category: 'spices', unit: 'g' },
  { name: 'Aceite de oliva', category: 'condiments', unit: 'l' },
  { name: 'Vinagre', category: 'condiments', unit: 'ml' },
  { name: 'Salsa de tomate', category: 'canned', unit: 'unit' },
  { name: 'Mayonesa', category: 'condiments', unit: 'unit' },
  { name: 'Ketchup', category: 'condiments', unit: 'unit' },
  { name: 'Mostaza', category: 'condiments', unit: 'unit' },
  { name: 'Salsa de soja', category: 'condiments', unit: 'ml' },
  { name: 'Miel', category: 'other', unit: 'g' },
  { name: 'Café', category: 'beverages', unit: 'g' },
  { name: 'Té', category: 'beverages', unit: 'unit' },
  { name: 'Chocolate', category: 'other', unit: 'g' },
  { name: 'Pan rallado', category: 'grains', unit: 'g' },
  { name: 'Levadura', category: 'other', unit: 'g' },
  { name: 'Garbanzos', category: 'canned', unit: 'g' },
  { name: 'Lentejas', category: 'canned', unit: 'g' },
  { name: 'Alubias', category: 'canned', unit: 'g' },
  // Frozen
  { name: 'Guisantes congelados', category: 'frozen', unit: 'g' },
  { name: 'Helado', category: 'frozen', unit: 'unit' },
  // Drinks
  { name: 'Agua', category: 'beverages', unit: 'l' },
  { name: 'Zumo', category: 'beverages', unit: 'l' },
  { name: 'Cerveza', category: 'beverages', unit: 'unit' },
  { name: 'Vino tinto', category: 'beverages', unit: 'unit' }
];

const COMMON_UTENSILS: SeedUtensil[] = [
  // Cookware (ollas, sartenes…)
  { name: 'Sartén', category: 'cookware' },
  { name: 'Sartén antiadherente', category: 'cookware' },
  { name: 'Sartén pequeña', category: 'cookware' },
  { name: 'Olla', category: 'cookware' },
  { name: 'Olla a presión', category: 'cookware' },
  { name: 'Cazuela', category: 'cookware' },
  { name: 'Cacerola', category: 'cookware' },
  { name: 'Batería de cocina', category: 'cookware' },
  // Appliances (cooking)
  { name: 'Freidora de aire (Airfryer)', category: 'airfryer' },
  { name: 'Microondas', category: 'microwave' },
  { name: 'Horno', category: 'oven' },
  { name: 'Vitrocerámica / Placa inducción', category: 'stovetop' },
  { name: 'Batidora de mano', category: 'mixer' },
  { name: 'Batidora de vaso / Blender', category: 'blender' },
  { name: 'Procesador de alimentos', category: 'food-processor' },
  { name: 'Tostadora', category: 'tools' },
  { name: 'Cafetera', category: 'tools' },
  { name: 'Hervidor de agua', category: 'tools' },
  { name: 'Exprimidor', category: 'tools' },
  { name: 'Robot de cocina', category: 'food-processor' },
  { name: 'Lavavajillas', category: 'tools' },
  { name: 'Frigorífico', category: 'tools' },
  { name: 'Congelador', category: 'tools' },
  // Prep tools
  { name: 'Tabla de cortar', category: 'tools' },
  { name: 'Cuchillo de chef', category: 'tools' },
  { name: 'Cuchillo de pelar', category: 'tools' },
  { name: 'Cuchillo de sierra (pan)', category: 'tools' },
  { name: 'Pelador', category: 'tools' },
  { name: 'Rallador', category: 'tools' },
  { name: 'Tijeras de cocina', category: 'tools' },
  { name: 'Abrelatas', category: 'tools' },
  { name: 'Descorchador', category: 'tools' },
  { name: 'Rodillo de cocina', category: 'tools' },
  { name: 'Colador', category: 'tools' },
  { name: 'Escurridor', category: 'tools' },
  { name: 'Bol / Cuenco', category: 'tools' },
  { name: 'Báscula de cocina', category: 'tools' },
  { name: 'Vaso medidor', category: 'tools' },
  { name: 'Cucharas medidoras', category: 'tools' },
  { name: 'Espátula de silicona', category: 'tools' },
  { name: 'Cuchara de madera', category: 'tools' },
  { name: 'Pinzas de cocina', category: 'tools' },
  { name: 'Batidor de varillas', category: 'tools' },
  // Bakeware
  { name: 'Bandeja de horno', category: 'bakeware' },
  { name: 'Molde para bizcocho', category: 'bakeware' },
  { name: 'Fuente de cristal', category: 'bakeware' },
  { name: 'Papel de horno', category: 'bakeware' },
  // Other
  { name: 'Paños de cocina', category: 'tools' },
  { name: 'Papel de cocina', category: 'tools' },
  { name: 'Delantal', category: 'tools' },
  { name: 'Guantes de horno', category: 'tools' },
  { name: 'Tupperware / Recipientes', category: 'tools' },
  { name: 'Papel film', category: 'tools' },
  { name: 'Papel de aluminio', category: 'tools' }
];

/** Ingredientes comunes (cantidad 0: son sugerencias, no inventario). */
export function seedCommonIngredients(
  db: Database.Database,
  householdId: string,
  userId: string
): number {
  const existing = db
    .prepare('SELECT COUNT(*) as c FROM ingredients WHERE household_id = ?')
    .get(householdId) as any;
  if (existing && existing.c > 0) return 0;

  const insertIngredient = db.prepare(`
    INSERT INTO ingredients (id, user_id, household_id, name, category, quantity, unit, location, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, 'pantry', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  const seed = db.transaction(() => {
    for (const ing of COMMON_INGREDIENTS) {
      insertIngredient.run(nanoid(), userId, householdId, ing.name, ing.category, ing.unit || 'unit');
    }
  });
  seed();
  return COMMON_INGREDIENTS.length;
}

/** Catalogo de utensilios (available = 0: el usuario marca los que tiene). */
export function seedCommonUtensils(
  db: Database.Database,
  householdId: string,
  userId: string
): number {
  const existing = db
    .prepare('SELECT COUNT(*) as c FROM utensils WHERE household_id = ?')
    .get(householdId) as any;
  if (existing && existing.c > 0) return 0;

  const insertUtensil = db.prepare(`
    INSERT INTO utensils (id, user_id, household_id, name, category, available, notes, created_at)
    VALUES (?, ?, ?, ?, ?, 0, NULL, CURRENT_TIMESTAMP)
  `);

  const seed = db.transaction(() => {
    for (const ut of COMMON_UTENSILS) {
      insertUtensil.run(nanoid(), userId, householdId, ut.name, ut.category);
    }
  });
  seed();
  return COMMON_UTENSILS.length;
}

/** Siembra ingredientes + utensilios al crear un hogar. */
export function seedDefaultsForHousehold(db: Database.Database, householdId: string, userId: string): void {
  seedCommonIngredients(db, householdId, userId);
  seedCommonUtensils(db, householdId, userId);
}

/**
 * Backfill para hogares creados antes de que existiera el catalogo: siembra
 * solo lo que falta (ingredientes y/o utensilios) en cada hogar existente.
 * Es idempotente, asi que se puede ejecutar en cada arranque.
 */
export function backfillHouseholdSeeds(db: Database.Database): void {
  const households = db.prepare('SELECT id FROM households').all() as { id: string }[];
  const ownerStmt = db.prepare(
    'SELECT user_id FROM household_members WHERE household_id = ? ORDER BY joined_at ASC LIMIT 1'
  );

  for (const household of households) {
    const owner = ownerStmt.get(household.id) as { user_id: string } | undefined;
    if (!owner) continue;

    const ingredients = seedCommonIngredients(db, household.id, owner.user_id);
    const utensils = seedCommonUtensils(db, household.id, owner.user_id);

    if (ingredients > 0 || utensils > 0) {
      console.log(
        `[DB] Seed backfill hogar ${household.id}: ${ingredients} ingredientes, ${utensils} utensilios`
      );
    }
  }
}
