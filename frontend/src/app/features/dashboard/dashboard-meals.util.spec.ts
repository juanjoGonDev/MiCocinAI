import { MEAL_LABEL_KEYS } from '../../core/i18n/labels';
import type { TranslationKey } from '../../core/i18n';
import { uiEn, uiEs } from '../../core/i18n/dict/ui';
import type { CalendarMeal, MealType } from '../../shared/models/calendar.model';
import { localIsoDate, mealTypeLabel, pendingMealsForDate } from './dashboard-meals.util';

function meal(id: string, overrides: Partial<CalendarMeal> = {}): CalendarMeal {
  return {
    id,
    date: '2026-09-30',
    mealType: 'lunch',
    title: id,
    servings: 1,
    completed: false,
    ...overrides
  };
}

describe('dashboard meals helpers', () => {
  it('filters to pending meals of the exact local date and sorts timed meals before unscheduled', () => {
    const input = [
      meal('late', { time: '21:30' }),
      meal('unscheduled-z', { time: null, title: 'Zumo' }),
      meal('early', { time: '12:15' }),
      meal('same-time-z', { time: '14:00', title: 'Merienda' }),
      meal('unscheduled-a', { time: null, title: 'Agua' }),
      meal('same-time-a', { time: '14:00', title: 'Merienda' }),
      meal('completed', { time: '08:00', completed: true }),
      meal('yesterday', { date: '2026-09-29', time: '07:00' }),
      meal('tomorrow', { date: '2026-10-01', time: '07:00' })
    ];
    const originalOrder = input.map(({ id }) => id);

    const result = pendingMealsForDate(input, '2026-09-30');

    expect(result.map(({ id }) => id)).toEqual([
      'early',
      'same-time-a',
      'same-time-z',
      'late',
      'unscheduled-a',
      'unscheduled-z'
    ]);
    expect(input.map(({ id }) => id)).toEqual(originalOrder);
  });

  it('formats dates from local calendar fields rather than UTC', () => {
    const justAfterLocalMidnight = new Date(2026, 8, 30, 0, 15);

    expect(localIsoDate(justAfterLocalMidnight)).toBe('2026-09-30');
  });

  it('resolves all meal type labels through the active Spanish and English dictionaries', () => {
    const spanish = (key: TranslationKey) => uiEs[key as keyof typeof uiEs];
    const english = (key: TranslationKey) => uiEn[key as keyof typeof uiEn];
    const mealTypes: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

    expect(mealTypes.map((type) => mealTypeLabel(type, spanish))).toEqual([
      'Desayuno',
      'Almuerzo',
      'Merienda',
      'Cena'
    ]);
    expect(mealTypes.map((type) => mealTypeLabel(type, english))).toEqual([
      'Breakfast',
      'Lunch',
      'Snack',
      'Dinner'
    ]);
    expect(mealTypes.map((type) => MEAL_LABEL_KEYS[type])).toEqual([
      'meal.breakfast',
      'meal.lunch',
      'meal.snack',
      'meal.dinner'
    ]);
  });
});
