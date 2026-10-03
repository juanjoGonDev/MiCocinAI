import { MEAL_LABEL_KEYS } from '../../core/i18n/labels';
import type { TranslationKey } from '../../core/i18n';
import type { CalendarMeal } from '../../shared/models/calendar.model';

/** ISO date in the user's local calendar, avoiding UTC's previous-day boundary. */
export function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Keep only pending meals for one local date, in a stable time order. */
export function pendingMealsForDate(meals: readonly CalendarMeal[], date: string): CalendarMeal[] {
  return meals
    .filter((meal) => meal.date === date && !meal.completed)
    .sort((left, right) => {
      if (left.time == null && right.time != null) return 1;
      if (left.time != null && right.time == null) return -1;

      return (
        (left.time ?? '').localeCompare(right.time ?? '') ||
        left.title.localeCompare(right.title) ||
        left.id.localeCompare(right.id)
      );
    });
}

/** Resolve meal type through the shared dictionary instead of hard-coding Spanish text. */
export function mealTypeLabel(
  mealType: CalendarMeal['mealType'],
  translate: (key: TranslationKey) => string
): string {
  return translate(MEAL_LABEL_KEYS[mealType]);
}
