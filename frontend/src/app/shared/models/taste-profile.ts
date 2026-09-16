/**
 * Perfil de gustos, alergias y objetivo del comensal.
 *
 * Se rellena en el onboarding (justo al registrarse, se puede saltar) y se
 * edita a mano en Preferencias. Lo consume la IA al generar recetas y al planificar
 * la semana: sin él no sabe qué ingredientes no puede usar.
 */

export type TasteGoal =
  'balanced' | 'weight-loss' | 'weight-gain' | 'muscle-gain' | 'variety' | 'custom';

export interface TasteProfile {
  goal: TasteGoal;
  goalNotes: string;
  /** Alergias e intolerancias: la IA no puede colar ni una variante. */
  allergies: string[];
  likes: string[];
  dislikes: string[];
  /** Texto libre: horarios, estilo de cocina, cosas de casa... */
  notes: string;
}

export type OnboardingStatus = 'pending' | 'done' | 'skipped';

export interface OnboardingState {
  status: OnboardingStatus;
  completedAt: string | null;
}

export interface TasteResponse {
  taste: TasteProfile;
  onboarding: OnboardingState;
}

/** Opción de un selector de chips: lo que se guarda es el propio texto. */
export interface ChipOption {
  value: string;
  icon?: string;
}

export function emptyTasteProfile(): TasteProfile {
  return {
    goal: 'balanced',
    goalNotes: '',
    allergies: [],
    likes: [],
    dislikes: [],
    notes: ''
  };
}

/** ¿Ha dicho algo? (para no hablar de "tus gustos" con el perfil vacío) */
export function hasTasteProfile(taste: TasteProfile | null): boolean {
  if (!taste) return false;
  return (
    taste.allergies.length > 0 ||
    taste.likes.length > 0 ||
    taste.dislikes.length > 0 ||
    taste.notes.trim().length > 0 ||
    taste.goalNotes.trim().length > 0 ||
    taste.goal !== 'balanced'
  );
}

export const GOAL_OPTIONS: { value: TasteGoal; label: string; icon: string; hint: string }[] = [
  { value: 'balanced', label: 'Equilibrada', icon: '⚖️', hint: 'De todo, sin obsesionarse' },
  {
    value: 'weight-loss',
    label: 'Perder peso',
    icon: '📉',
    hint: 'Raciones contenidas, poco frito'
  },
  { value: 'weight-gain', label: 'Ganar peso', icon: '📈', hint: 'Más calorías, platos densos' },
  { value: 'muscle-gain', label: 'Ganar músculo', icon: '💪', hint: 'Proteína en cada comida' },
  { value: 'variety', label: 'Variada', icon: '🌈', hint: 'Que no se repita la carta' },
  { value: 'custom', label: 'Personalizada', icon: '✏️', hint: 'Te leemos el texto libre' }
];

export const GOAL_LABELS: Record<TasteGoal, string> = GOAL_OPTIONS.reduce(
  (acc, option) => ({ ...acc, [option.value]: option.label }),
  {} as Record<TasteGoal, string>
);

/** Los 14 alérgenos de la UE, que es lo que viene en las etiquetas. */
export const COMMON_ALLERGENS: ChipOption[] = [
  { value: 'Gluten', icon: '🌾' },
  { value: 'Lactosa', icon: '🥛' },
  { value: 'Huevo', icon: '🥚' },
  { value: 'Pescado', icon: '🐟' },
  { value: 'Marisco', icon: '🦐' },
  { value: 'Moluscos', icon: '🐚' },
  { value: 'Frutos secos', icon: '🌰' },
  { value: 'Cacahuete', icon: '🥜' },
  { value: 'Soja', icon: '🫘' },
  { value: 'Sésamo', icon: '⚪' },
  { value: 'Mostaza', icon: '🟡' },
  { value: 'Apio', icon: '🥬' },
  { value: 'Sulfitos', icon: '🍷' },
  { value: 'Altramuces', icon: '🌼' },
  { value: 'Cebolleta/Ajo', icon: '🧄' },
  { value: 'Sin cerdo', icon: '🐖' },
  { value: 'Sin alcohol', icon: '🚫' },
  { value: 'Vegetariano', icon: '🌱' },
  { value: 'Vegano', icon: '🌿' }
];

/** Lo que suele gustar, en las palabras que usaría alguien en la mesa. */
export const COMMON_LIKES: ChipOption[] = [
  { value: 'Pollo', icon: '🍗' },
  { value: 'Pavo', icon: '🦃' },
  { value: 'Pescado al horno', icon: '🐟' },
  { value: 'Verduras', icon: '🥦' },
  { value: 'Ensaladas', icon: '🥗' },
  { value: 'Legumbres', icon: '🫘' },
  { value: 'Arroz', icon: '🍚' },
  { value: 'Pasta', icon: '🍝' },
  { value: 'Patata', icon: '🥔' },
  { value: 'Huevos', icon: '🍳' },
  { value: 'Queso', icon: '🧀' },
  { value: 'Fruta', icon: '🍎' },
  { value: 'Sopas y cremas', icon: '🍲' },
  { value: 'Cocina española', icon: '🇪🇸' },
  { value: 'Cocina italiana', icon: '🇮🇹' },
  { value: 'Cocina asiática', icon: '🥢' },
  { value: 'Cocina mexicana', icon: '🌮' },
  { value: 'Picante', icon: '🌶️' },
  { value: 'A la plancha', icon: '🔥' },
  { value: 'Al horno', icon: '🍞' },
  { value: 'En airfryer', icon: '🌪️' },
  { value: 'Postres', icon: '🍰' },
  { value: 'Desayunos salados', icon: '🥐' },
  { value: 'Cocina de aprovechamiento', icon: '♻️' }
];

/** Lo que más se repite en el «esto no me lo pongas». */
export const COMMON_DISLIKES: ChipOption[] = [
  { value: 'Vísceras y casquería', icon: '🫀' },
  { value: 'Anchoas y boquerones', icon: '🐟' },
  { value: 'Sardinas', icon: '🐟' },
  { value: 'Marisco', icon: '🦐' },
  { value: 'Aceitunas', icon: '🫒' },
  { value: 'Alcaparras', icon: '🌿' },
  { value: 'Cilantro', icon: '🌿' },
  { value: 'Menta', icon: '🌱' },
  { value: 'Regaliz', icon: '🖤' },
  { value: 'Brócoli y coliflor', icon: '🥦' },
  { value: 'Coles de Bruselas', icon: '🥬' },
  { value: 'Espinacas', icon: '🥬' },
  { value: 'Setas y champiñones', icon: '🍄' },
  { value: 'Calabacín y berenjena', icon: '🍆' },
  { value: 'Nabo y chirivía', icon: '🥕' },
  { value: 'Pepino', icon: '🥒' },
  { value: 'Pimientos asados', icon: '🫑' },
  { value: 'Pasas y fruta pasada', icon: '🍇' },
  { value: 'Muy picante', icon: '🌶️' },
  { value: 'Muy dulce', icon: '🍬' },
  { value: 'Fritos', icon: '🍟' },
  { value: 'Nata y queso crema', icon: '🥛' },
  { value: 'Crudos (sashimi, steak tartar)', icon: '🍣' }
];

/** Categorías de utensilios que de verdad cambian qué recetas se pueden hacer. */
export const ONBOARDING_UTENSIL_CATEGORIES = [
  'oven',
  'microwave',
  'airfryer',
  'stovetop',
  'blender',
  'mixer',
  'food-processor'
] as const;
