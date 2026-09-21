import type { MealType } from '../../shared/models/calendar.model';
import type { TranslationKey } from './index';

// =============================================================================
// De un dato guardado a la clave que lo ensena.
//
// El problema: `MEAL_TYPE_META[type].label` es espanol y viaja al prompt de la IA, asi que no se puede
// traducir ahi (se romperia el contrato, ver HOGARIA-SPEC §12s-A), pero es exactamente esa cadena la que
// cuatro pantallas pintan. La solucion es separar las dos cosas: el dato sigue siendo el dato, y lo que
// se ensena se busca aqui.
//
// El mapa esta tipado a `TranslationKey`, que es la lista real de claves: borrar `meal.snack` del
// diccionario se nota en compilacion, y una clave inventada tambien.
// =============================================================================

/** Como se ensena cada comida, en el idioma activo. */
export const MEAL_LABEL_KEYS: Record<MealType, TranslationKey> = {
  breakfast: 'meal.breakfast',
  lunch: 'meal.lunch',
  snack: 'meal.snack',
  dinner: 'meal.dinner'
};

/**
 * Los gustos y alergias del catalogo del onboarding. Lo que se **guarda** es el texto en castellano (viaja al
 * prompt y lo escribe la IA al releer la lista), asi que no se puede traducir el dato: se traduce lo que se
 * ensena, y solo cuando la cadena es una de las opciones conocidas. Lo que alguien escribio a mano se pinta
 * tal cual, porque es su texto y la pantalla no tiene derecho a corregirlo (HOGARIA-SPEC ## 12u).
 */
export const TASTE_VALUE_LABEL_KEYS: Record<string, TranslationKey> = {
  'Gluten': 'taste.gluten',
  'Lactosa': 'taste.lactosa',
  'Huevo': 'taste.huevo',
  'Pescado': 'taste.pescado',
  'Marisco': 'taste.marisco',
  'Moluscos': 'taste.moluscos',
  'Frutos secos': 'taste.frutos_secos',
  'Cacahuete': 'taste.cacahuete',
  'Soja': 'taste.soja',
  'Sésamo': 'taste.sesamo',
  'Mostaza': 'taste.mostaza',
  'Apio': 'taste.apio',
  'Sulfitos': 'taste.sulfitos',
  'Altramuces': 'taste.altramuces',
  'Cebolleta/Ajo': 'taste.cebolleta_ajo',
  'Sin cerdo': 'taste.sin_cerdo',
  'Sin alcohol': 'taste.sin_alcohol',
  'Vegetariano': 'taste.vegetariano',
  'Vegano': 'taste.vegano',
  'Pollo': 'taste.pollo',
  'Pavo': 'taste.pavo',
  'Pescado al horno': 'taste.pescado_al_horno',
  'Verduras': 'taste.verduras',
  'Ensaladas': 'taste.ensaladas',
  'Legumbres': 'taste.legumbres',
  'Arroz': 'taste.arroz',
  'Pasta': 'taste.pasta',
  'Patata': 'taste.patata',
  'Huevos': 'taste.huevos',
  'Queso': 'taste.queso',
  'Fruta': 'taste.fruta',
  'Sopas y cremas': 'taste.sopas_y_cremas',
  'Cocina española': 'taste.cocina_espanola',
  'Cocina italiana': 'taste.cocina_italiana',
  'Cocina asiática': 'taste.cocina_asiatica',
  'Cocina mexicana': 'taste.cocina_mexicana',
  'Picante': 'taste.picante',
  'A la plancha': 'taste.a_la_plancha',
  'Al horno': 'taste.al_horno',
  'En airfryer': 'taste.en_airfryer',
  'Postres': 'taste.postres',
  'Desayunos salados': 'taste.desayunos_salados',
  'Cocina de aprovechamiento': 'taste.cocina_de_aprovechamiento',
  'Vísceras y casquería': 'taste.visceras_y_casqueria',
  'Anchoas y boquerones': 'taste.anchoas_y_boquerones',
  'Sardinas': 'taste.sardinas',
  'Aceitunas': 'taste.aceitunas',
  'Alcaparras': 'taste.alcaparras',
  'Cilantro': 'taste.cilantro',
  'Menta': 'taste.menta',
  'Regaliz': 'taste.regaliz',
  'Brócoli y coliflor': 'taste.brocoli_y_coliflor',
  'Coles de Bruselas': 'taste.coles_de_bruselas',
  'Espinacas': 'taste.espinacas',
  'Setas y champiñones': 'taste.setas_y_champinones',
  'Calabacín y berenjena': 'taste.calabacin_y_berenjena',
  'Nabo y chirivía': 'taste.nabo_y_chirivia',
  'Pepino': 'taste.pepino',
  'Pimientos asados': 'taste.pimientos_asados',
  'Pasas y fruta pasada': 'taste.pasas_y_fruta_pasada',
  'Muy picante': 'taste.muy_picante',
  'Muy dulce': 'taste.muy_dulce',
  'Fritos': 'taste.fritos',
  'Nata y queso crema': 'taste.nata_y_queso_crema',
  'Crudos (sashimi, steak tartar)': 'taste.crudos_sashimi_steak_tartar',
};

/** La etiqueta de un valor del perfil de gustos, en el idioma activo; `null` si no es del catalogo. */
export function tasteLabelKey(value: string): TranslationKey | null {
  return TASTE_VALUE_LABEL_KEYS[value] ?? null;
}

/**
 * Las categorias de las listas de la compra, igual que los gustos: el valor se guarda y se canoniza
 * en castellano (historial, stats, la IA), y lo unico que puede cambiar de idioma es la etiqueta.
 * «En el carro» no es una categoria del modelo, es el titulo del grupo cuando se mira la pestana de
 * lo ya comprado, y tambien pasa por aqui para no tener una regla especial en la pantalla.
 */
export const LIST_CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  'Frutas y verduras': 'shopping_lists.categoria_frutas_verduras',
  'Carnes y pescados': 'shopping_lists.categoria_carnes_pescados',
  'Lacteos': 'shopping_lists.categoria_lacteos',
  'Despensa': 'shopping_lists.categoria_despensa',
  'Higiene y limpieza': 'shopping_lists.categoria_higiene_limpieza',
  'Bebidas y alcohol': 'shopping_lists.categoria_bebidas_alcohol',
  'Mascotas': 'shopping_lists.categoria_mascotas',
  'Congelados': 'shopping_lists.categoria_congelados',
  'Otros': 'shopping_lists.categoria_otros',
  'En el carro': 'shopping_list_detail.en_el_carro'
};

/** Etiqueta de una categoria de lista; `null` si no es una categoria conocida. */
export function listCategoryLabelKey(value: string): TranslationKey | null {
  return LIST_CATEGORY_LABEL_KEYS[value] ?? null;
}
