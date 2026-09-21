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
