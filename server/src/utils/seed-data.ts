import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

/**
 * Seeds a newly created household with a sensible starter set of common
 * ingredients (quantity 0 so they are suggestions, not real stock) and
 * common kitchen utensils (available = true).
 */

interface SeedItem {
  name: string;
  category: string;
  unit?: string;
}

const COMMON_INGREDIENTS: SeedItem[] = [
  // Basics
  { name: 'Patatas', category: 'verduras', unit: 'kg' },
  { name: 'Cebolla', category: 'verduras', unit: 'unit' },
  { name: 'Ajo', category: 'verduras', unit: 'unit' },
  { name: 'Tomate', category: 'verduras', unit: 'unit' },
  { name: 'Zanahoria', category: 'verduras', unit: 'unit' },
  { name: 'Pimiento', category: 'verduras', unit: 'unit' },
  { name: 'Lechuga', category: 'verduras', unit: 'unit' },
  { name: 'Pepino', category: 'verduras', unit: 'unit' },
  { name: 'Calabacín', category: 'verduras', unit: 'unit' },
  { name: 'Berenjena', category: 'verduras', unit: 'unit' },
  { name: 'Brócoli', category: 'verduras', unit: 'unit' },
  { name: 'Espinacas', category: 'verduras', unit: 'g' },
  // Fruits
  { name: 'Plátano', category: 'frutas', unit: 'unit' },
  { name: 'Manzana', category: 'frutas', unit: 'unit' },
  { name: 'Naranja', category: 'frutas', unit: 'unit' },
  { name: 'Limón', category: 'frutas', unit: 'unit' },
  { name: 'Fresas', category: 'frutas', unit: 'g' },
  { name: 'Uvas', category: 'frutas', unit: 'g' },
  { name: 'Aguacate', category: 'frutas', unit: 'unit' },
  { name: 'Piña', category: 'frutas', unit: 'unit' },
  { name: 'Melocotón', category: 'frutas', unit: 'unit' },
  { name: 'Pera', category: 'frutas', unit: 'unit' },
  // Proteins
  { name: 'Huevos', category: 'proteínas', unit: 'unit' },
  { name: 'Pollo', category: 'carnes', unit: 'g' },
  { name: 'Carne picada', category: 'carnes', unit: 'g' },
  { name: 'Ternera', category: 'carnes', unit: 'g' },
  { name: 'Cerdo', category: 'carnes', unit: 'g' },
  { name: 'Bacón', category: 'carnes', unit: 'g' },
  { name: 'Salmón', category: 'pescado', unit: 'g' },
  { name: 'Merluza', category: 'pescado', unit: 'g' },
  { name: 'Atún en lata', category: 'pescado', unit: 'unit' },
  { name: 'Gambas', category: 'pescado', unit: 'g' },
  // Dairy
  { name: 'Leche', category: 'lácteos', unit: 'l' },
  { name: 'Queso', category: 'lácteos', unit: 'g' },
  { name: 'Queso rallado', category: 'lácteos', unit: 'g' },
  { name: 'Yogur', category: 'lácteos', unit: 'unit' },
  { name: 'Mantequilla', category: 'lácteos', unit: 'g' },
  { name: 'Nata', category: 'lácteos', unit: 'ml' },
  // Pantry
  { name: 'Arroz', category: 'despensa', unit: 'g' },
  { name: 'Pasta', category: 'despensa', unit: 'g' },
  { name: 'Pan de molde', category: 'despensa', unit: 'unit' },
  { name: 'Pan', category: 'despensa', unit: 'unit' },
  { name: 'Harina', category: 'despensa', unit: 'g' },
  { name: 'Azúcar', category: 'despensa', unit: 'g' },
  { name: 'Sal', category: 'especias', unit: 'g' },
  { name: 'Pimienta', category: 'especias', unit: 'g' },
  { name: 'Aceite de oliva', category: 'aceites', unit: 'l' },
  { name: 'Vinagre', category: 'despensa', unit: 'ml' },
  { name: 'Salsa de tomate', category: 'despensa', unit: 'unit' },
  { name: 'Mayonesa', category: 'despensa', unit: 'unit' },
  { name: 'Ketchup', category: 'despensa', unit: 'unit' },
  { name: 'Mostaza', category: 'despensa', unit: 'unit' },
  { name: 'Salsa de soja', category: 'despensa', unit: 'ml' },
  { name: 'Miel', category: 'despensa', unit: 'g' },
  { name: 'Café', category: 'despensa', unit: 'g' },
  { name: 'Té', category: 'despensa', unit: 'unit' },
  { name: 'Chocolate', category: 'despensa', unit: 'g' },
  { name: 'Pan rallado', category: 'despensa', unit: 'g' },
  { name: 'Levadura', category: 'despensa', unit: 'g' },
  { name: 'Garbanzos', category: 'legumbres', unit: 'g' },
  { name: 'Lentejas', category: 'legumbres', unit: 'g' },
  { name: 'Alubias', category: 'legumbres', unit: 'g' },
  // Frozen
  { name: 'Guisantes congelados', category: 'congelados', unit: 'g' },
  { name: 'Helado', category: 'congelados', unit: 'unit' },
  // Drinks
  { name: 'Agua', category: 'bebidas', unit: 'l' },
  { name: 'Zumo', category: 'bebidas', unit: 'l' },
  { name: 'Cerveza', category: 'bebidas', unit: 'unit' },
  { name: 'Vino tinto', category: 'bebidas', unit: 'unit' }
];

interface SeedUtensil {
  name: string;
  category: string;
}

const COMMON_UTENSILS: SeedUtensil[] = [
  { name: 'Sartén', category: 'cocción' },
  { name: 'Sartén antiadherente', category: 'cocción' },
  { name: 'Sartén pequeña', category: 'cocción' },
  { name: 'Olla', category: 'cocción' },
  { name: 'Olla a presión', category: 'cocción' },
  { name: 'Cazuela', category: 'cocción' },
  { name: 'Cacerola', category: 'cocción' },
  { name: 'Batería de cocina', category: 'cocción' },
  { name: 'Freidora de aire (Airfryer)', category: 'electrodomésticos' },
  { name: 'Microondas', category: 'electrodomésticos' },
  { name: 'Horno', category: 'electrodomésticos' },
  { name: 'Vitrocerámica / Placa inducción', category: 'electrodomésticos' },
  { name: 'Batidora de mano', category: 'electrodomésticos' },
  { name: 'Batidora de vaso / Blender', category: 'electrodomésticos' },
  { name: 'Licuadora', category: 'electrodomésticos' },
  { name: 'Tostadora', category: 'electrodomésticos' },
  { name: 'Cafetera', category: 'electrodomésticos' },
  { name: 'Hervidor de agua', category: 'electrodomésticos' },
  { name: 'Exprimidor', category: 'electrodomésticos' },
  { name: 'Robot de cocina', category: 'electrodomésticos' },
  { name: 'Lavavajillas', category: 'electrodomésticos' },
  { name: 'Frigorífico', category: 'electrodomésticos' },
  { name: 'Congelador', category: 'electrodomésticos' },
  // Prep
  { name: 'Tabla de cortar', category: 'preparación' },
  { name: 'Cuchillo de chef', category: 'preparación' },
  { name: 'Cuchillo de pelar', category: 'preparación' },
  { name: 'Cuchillo de sierra (pan)', category: 'preparación' },
  { name: 'Pelador', category: 'preparación' },
  { name: 'Rallador', category: 'preparación' },
  { name: 'Tijeras de cocina', category: 'preparación' },
  { name: 'Abrelatas', category: 'preparación' },
  { name: 'Descorchador', category: 'preparación' },
  { name: 'Rodillo de cocina', category: 'preparación' },
  { name: 'Colador', category: 'preparación' },
  { name: 'Escurridor', category: 'preparación' },
  { name: 'Bol / Cuenco', category: 'preparación' },
  { name: 'Báscula de cocina', category: 'preparación' },
  { name: 'Vaso medidor', category: 'preparación' },
  { name: 'Cucharas medidoras', category: 'preparación' },
  { name: 'Espátula de silicona', category: 'preparación' },
  { name: 'Cuchara de madera', category: 'preparación' },
  { name: 'Pinzas de cocina', category: 'preparación' },
  { name: 'Batidor de varillas', category: 'preparación' },
  // Bakeware
  { name: 'Bandeja de horno', category: 'horno' },
  { name: 'Molde para bizcocho', category: 'horno' },
  { name: 'Fuente de cristal', category: 'horno' },
  { name: 'Papel de horno', category: 'horno' },
  // Other
  { name: 'Paños de cocina', category: 'varios' },
  { name: 'Papel de cocina', category: 'varios' },
  { name: 'Delantal', category: 'varios' },
  { name: 'Guantes de horno', category: 'varios' },
  { name: 'Tupperware / Recipientes', category: 'almacenaje' },
  { name: 'Papel film', category: 'almacenaje' },
  { name: 'Papel de aluminio', category: 'almacenaje' }
];

export function seedDefaultsForHousehold(db: Database.Database, householdId: string, userId: string): void {
  // Avoid re-seeding if already seeded
  const existing = db.prepare(
    'SELECT COUNT(*) as c FROM utensils WHERE household_id = ?'
  ).get(householdId) as any;
  if (existing && existing.c > 0) return;

  const insertIngredient = db.prepare(`
    INSERT INTO ingredients (id, user_id, household_id, name, category, quantity, unit, location, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, 'pantry', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  const insertUtensil = db.prepare(`
    INSERT INTO utensils (id, user_id, household_id, name, category, available, notes, created_at)
    VALUES (?, ?, ?, ?, ?, 1, NULL, CURRENT_TIMESTAMP)
  `);

  const seed = db.transaction(() => {
    for (const ing of COMMON_INGREDIENTS) {
      insertIngredient.run(nanoid(), userId, householdId, ing.name, ing.category, ing.unit || 'unit');
    }
    for (const ut of COMMON_UTENSILS) {
      insertUtensil.run(nanoid(), userId, householdId, ut.name, ut.category);
    }
  });
  seed();
}
