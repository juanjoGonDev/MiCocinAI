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

// Las etiquetas de categoria, ubicacion y utensilio ya no estan aqui: eran un `Record<..., string>` en
// espanol que ningun componente leia, y el texto que si se ensena vive en los catalogos de la
// pantalla con su `labelKey` (HOGARIA-SPEC ## 12u).

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
