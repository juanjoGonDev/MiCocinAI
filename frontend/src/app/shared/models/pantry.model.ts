export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  quantity: number;
  unit: MeasurementUnit;
  expirationDate?: Date;
  location: StorageLocation;
  image?: string;
  barcode?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type IngredientCategory =
  | 'dairy'
  | 'meat'
  | 'fish'
  | 'vegetables'
  | 'fruits'
  | 'grains'
  | 'spices'
  | 'condiments'
  | 'frozen'
  | 'canned'
  | 'beverages'
  | 'other';

export type MeasurementUnit =
  | 'g' | 'kg' | 'ml' | 'l'
  | 'cup' | 'tbsp' | 'tsp'
  | 'unit' | 'bunch' | 'slice' | 'piece';

export type StorageLocation = 'fridge' | 'freezer' | 'pantry' | 'counter';

export interface Utensil {
  id: string;
  name: string;
  category: UtensilCategory;
  available: boolean;
  notes?: string;
}

export type UtensilCategory =
  | 'oven'
  | 'microwave'
  | 'airfryer'
  | 'stovetop'
  | 'blender'
  | 'mixer'
  | 'food-processor'
  | 'cookware'
  | 'bakeware'
  | 'tools';

export interface PantryFilter {
  search?: string;
  category?: IngredientCategory;
  location?: StorageLocation;
  expiringSoon?: boolean;
  expired?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PantryStats {
  totalItems: number;
  expiringSoon: number;
  expired: number;
  byCategory: Record<IngredientCategory, number>;
  byLocation: Record<StorageLocation, number>;
}

export const INGREDIENT_CATEGORY_LABELS: Record<IngredientCategory, string> = {
  dairy: 'Lácteos',
  meat: 'Carnes',
  fish: 'Pescados',
  vegetables: 'Verduras',
  fruits: 'Frutas',
  grains: 'Cereales',
  spices: 'Especias',
  condiments: 'Condimentos',
  frozen: 'Congelados',
  canned: 'Enlatados',
  beverages: 'Bebidas',
  other: 'Otros'
};

export const STORAGE_LOCATION_LABELS: Record<StorageLocation, string> = {
  fridge: 'Nevera',
  freezer: 'Congelador',
  pantry: 'Despensa',
  counter: 'Encimera'
};

export const UTENSIL_CATEGORY_LABELS: Record<UtensilCategory, string> = {
  oven: 'Horno',
  microwave: 'Microondas',
  airfryer: 'Freidora de aire',
  stovetop: 'Cocina',
  blender: 'Batidora',
  mixer: 'Batidora de mano',
  'food-processor': 'Procesador',
  cookware: 'Utensilios de cocina',
  bakeware: 'Molde',
  tools: 'Herramientas'
};

// Input types for API operations
export interface CreateIngredientInput {
  name: string;
  category: IngredientCategory;
  quantity: number;
  unit: MeasurementUnit;
  expirationDate?: Date | string;
  location: StorageLocation;
  image?: string;
  barcode?: string;
  notes?: string;
}

export interface UpdateIngredientInput {
  name?: string;
  category?: IngredientCategory;
  quantity?: number;
  unit?: MeasurementUnit;
  expirationDate?: Date | string;
  location?: StorageLocation;
  image?: string;
  barcode?: string;
  notes?: string;
}

export interface CreateUtensilInput {
  name: string;
  category: UtensilCategory;
  available?: boolean;
  notes?: string;
}

export interface UpdateUtensilInput {
  name?: string;
  category?: UtensilCategory;
  available?: boolean;
  notes?: string;
}
