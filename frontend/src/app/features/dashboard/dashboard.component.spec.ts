import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { CalendarService } from '../../core/services/calendar.service';
import { DashboardPreferencesService } from '../../core/services/dashboard-preferences.service';
import { HouseholdService } from '../../core/services/household.service';
import { I18nService } from '../../core/services/i18n.service';
import { PantryService } from '../../core/services/pantry.service';
import { RecipeService } from '../../core/services/recipe.service';
import type { CaducidadRow } from '../../shared/models/caducidades.model';
import type { CalendarMeal } from '../../shared/models/calendar.model';
import { DashboardComponent } from './dashboard.component';
import { localIsoDate, localIsoDateOffset } from './dashboard-meals.util';

function expiryRow(name: string, daysLeft: number | null): CaducidadRow {
  return {
    id: name,
    name,
    category: 'other',
    quantity: 1,
    unit: 'unit',
    expirationDate: null,
    estimatedDays: null,
    shelfSource: daysLeft === null ? null : 'fecha',
    vence: null,
    daysLeft,
    cadaDias: null,
    unidadesPorCompra: null,
    duraDias: null,
    lastBought: null
  };
}

function plannedMeal(id: string, date: string): CalendarMeal {
  return {
    id,
    date,
    mealType: 'lunch',
    title: id,
    servings: 1,
    completed: false,
    time: '14:00'
  };
}

describe('DashboardComponent', () => {
  let pantry: {
    caducidades: ReturnType<typeof signal<CaducidadRow[]>>;
    cargandoCaducidades: ReturnType<typeof signal<boolean>>;
    caducidadesError: ReturnType<typeof signal<boolean>>;
    stats: ReturnType<typeof signal<{ totalItems: number }>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    loadIngredients: jasmine.Spy;
    loadStats: jasmine.Spy;
    loadCaducidades: jasmine.Spy;
  };
  let recipes: {
    recipes: ReturnType<typeof signal<Array<Record<string, unknown>>>>;
    total: ReturnType<typeof signal<number>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    loadRecipes: jasmine.Spy;
  };
  let calendar: {
    meals: ReturnType<typeof signal<CalendarMeal[]>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<boolean>>;
    range: ReturnType<typeof signal<{ start: string; end: string } | null>>;
    loadRange: jasmine.Spy;
    getMealsForRange: jasmine.Spy;
  };
  let household: {
    household: ReturnType<typeof signal<{ members: unknown[] }>>;
    loadHousehold: jasmine.Spy;
  };
  let preferences: { expiryHorizonDays: ReturnType<typeof signal<number>> };
  let translate: jasmine.Spy;
  let userName: jasmine.Spy;

  beforeEach(() => {
    userName = jasmine.createSpy('userName').and.returnValue('Ada');
    translate = jasmine
      .createSpy('translate')
      .and.callFake((key: string, params?: { days?: number }) => {
        if (key === 'dashboard.expiryStatusDays') return `In ${params?.days} days`;
        return key;
      });
    pantry = {
      caducidades: signal<CaducidadRow[]>([]),
      cargandoCaducidades: signal(false),
      caducidadesError: signal(false),
      stats: signal({ totalItems: 4 }),
      isLoading: signal(false),
      loadIngredients: jasmine.createSpy('loadIngredients'),
      loadStats: jasmine.createSpy('loadStats'),
      loadCaducidades: jasmine.createSpy('loadCaducidades')
    };
    recipes = {
      recipes: signal<Array<Record<string, unknown>>>([]),
      total: signal(9),
      isLoading: signal(false),
      loadRecipes: jasmine.createSpy('loadRecipes')
    };
    calendar = {
      meals: signal<CalendarMeal[]>([]),
      isLoading: signal(false),
      error: signal(false),
      range: signal(null),
      loadRange: jasmine.createSpy('loadRange'),
      getMealsForRange: jasmine.createSpy('getMealsForRange').and.returnValue(of([]))
    };
    household = {
      household: signal({ members: [{}] }),
      loadHousehold: jasmine.createSpy('loadHousehold')
    };
    preferences = { expiryHorizonDays: signal(3) };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { userName } },
        { provide: PantryService, useValue: pantry },
        { provide: RecipeService, useValue: recipes },
        { provide: CalendarService, useValue: calendar },
        { provide: HouseholdService, useValue: household },
        { provide: DashboardPreferencesService, useValue: preferences },
        { provide: I18nService, useValue: { t: translate } }
      ]
    });
  });

  function createComponent(): DashboardComponent {
    return TestBed.runInInjectionContext(() => new DashboardComponent());
  }

  it('loads dashboard data and keeps the page available if household loading throws', () => {
    userName.and.returnValue('');
    household.loadHousehold.and.throwError('household unavailable');

    const component = createComponent();
    component.ngOnInit();

    expect(component.userName()).toBe('Chef');
    expect(pantry.loadIngredients).toHaveBeenCalled();
    expect(pantry.loadStats).toHaveBeenCalled();
    expect(pantry.loadCaducidades).toHaveBeenCalled();
    expect(recipes.loadRecipes).toHaveBeenCalled();
    expect(calendar.loadRange).toHaveBeenCalledWith(component.todayIso, component.todayIso);
    expect(household.loadHousehold).toHaveBeenCalled();
  });

  it('loads a seven-local-date meal preview without changing the shared calendar range', () => {
    calendar.range.set({ start: '2026-10-01', end: '2026-10-31' });
    const component = createComponent();
    component.ngOnInit();

    const today = localIsoDate(new Date());
    expect(calendar.getMealsForRange).toHaveBeenCalledOnceWith(
      today,
      localIsoDateOffset(new Date(), 6)
    );
    expect(calendar.range()).toEqual({ start: '2026-10-01', end: '2026-10-31' });
  });

  it('exposes next-meal load errors and retries the auxiliary read', () => {
    const now = new Date();
    calendar.getMealsForRange.and.returnValues(
      throwError(() => new Error('offline')),
      of([plannedMeal('tomorrow', localIsoDateOffset(now, 1))])
    );
    const component = createComponent();
    component.ngOnInit();

    expect(component.nextMealLoading()).toBeFalse();
    expect(component.nextMealError()).toBeTrue();

    component.retryNextMeal();

    expect(component.nextMealError()).toBeFalse();
    expect(component.nextMealLoading()).toBeFalse();
    expect(component.nextPlannedMeal()?.id).toBe('tomorrow');
    expect(calendar.getMealsForRange).toHaveBeenCalledTimes(2);
  });

  it('cancels stale and destroyed next-meal requests', () => {
    const staleResponse = new Subject<CalendarMeal[]>();
    const currentResponse = new Subject<CalendarMeal[]>();
    calendar.getMealsForRange.and.returnValues(
      staleResponse.asObservable(),
      currentResponse.asObservable()
    );
    const component = createComponent();
    component.ngOnInit();

    component.retryNextMeal();
    expect(staleResponse.observers).toHaveSize(0);
    staleResponse.next([plannedMeal('stale', localIsoDateOffset(new Date(), 1))]);
    currentResponse.next([plannedMeal('current', localIsoDateOffset(new Date(), 1))]);
    expect(component.nextPlannedMeal()?.id).toBe('current');

    component.ngOnDestroy();

    expect(currentResponse.observers).toHaveSize(0);
  });

  it('filters expiry rows using the preference and labels expired, today and upcoming dates', () => {
    pantry.caducidades.set([
      expiryRow('Expired', -1),
      expiryRow('Today', 0),
      expiryRow('At horizon', 3),
      expiryRow('Unknown', null),
      expiryRow('Outside horizon', 4)
    ]);
    const component = createComponent();

    expect(component.expiringItems().map((row) => row.name)).toEqual([
      'Expired',
      'Today',
      'At horizon'
    ]);
    expect(component.expiryStatus(-1)).toBe('dashboard.expiryStatusExpired');
    expect(component.expiryStatus(0)).toBe('dashboard.expiryStatusToday');
    expect(component.expiryStatus(3)).toBe('In 3 days');
    expect(component.expiryStatus(null)).toBe('');
  });

  it('retries expiry and today-meal loading on demand', () => {
    const component = createComponent();

    component.retryExpiries();
    component.retryTodayMeals();

    expect(pantry.loadCaducidades).toHaveBeenCalledOnceWith();
    expect(calendar.loadRange).toHaveBeenCalledOnceWith(
      component.todayIso,
      component.todayIso,
      true
    );
  });

  it('computes summary and recipe preview data and maps meal/difficulty labels', () => {
    recipes.recipes.set(
      Array.from({ length: 7 }, (_, index) => ({
        id: String(index),
        name: `Recipe ${index}`,
        totalTime: index * 10,
        difficulty: 'easy',
        image: null
      }))
    );
    calendar.range.set({ start: createComponent().todayIso, end: createComponent().todayIso });
    const component = createComponent();

    expect(component.quickStats().map((stat) => stat.value)).toEqual([4, 9, 1, 0]);
    expect(component.suggestedRecipes()).toHaveSize(6);
    expect(component.suggestedRecipes()[0].time).toBe(0);
    expect(component.calendarReady()).toBeTrue();
    expect(component.isLoading()).toBeFalse();
    expect(component.mealTypeLabel('breakfast')).toBe('meal.breakfast');
    expect(component.getDifficultyVariant('easy')).toBe('success');
    expect(component.getDifficultyVariant('difícil')).toBe('error');
    expect(component.getDifficultyVariant('medium')).toBe('warning');
    expect(component.getDifficultyVariant('')).toBe('warning');
  });
});
