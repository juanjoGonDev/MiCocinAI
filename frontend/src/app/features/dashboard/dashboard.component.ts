import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { RecipeService } from '../../core/services/recipe.service';
import { PantryService } from '../../core/services/pantry.service';
import { CalendarService } from '../../core/services/calendar.service';
import { HouseholdService } from '../../core/services/household.service';
import { I18nService } from '../../core/services/i18n.service';
import { BadgeComponent } from '../../shared/components/ui/badge/badge.component';
import { IconComponent } from '../../shared/components/ui/icon/icon.component';
import type { IconName } from '../../shared/components/ui/icon/icon-paths';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import type { TranslationKey } from '../../core/i18n';
import type { MealType } from '../../shared/models/calendar.model';
import {
  localIsoDate,
  mealTypeLabel as translateMealTypeLabel,
  pendingMealsForDate
} from './dashboard-meals.util';

interface QuickStat {
  icon: IconName;
  labelKey: TranslationKey;
  value: string | number;
  color: string;
}

interface SuggestedRecipe {
  id: string;
  name: string;
  time: number;
  difficulty: string;
  image?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, BadgeComponent, IconComponent, TranslatePipe],
  template: `
    <div class="dashboard">
      <!-- Welcome Section -->
      <section class="dashboard__welcome">
        <div class="dashboard__greeting">
          <h1 class="dashboard__title">{{ 'dashboard.greeting' | t: { name: userName() } }}</h1>
          <p class="dashboard__subtitle">{{ 'dashboard.subtitle' | t }}</p>
        </div>
      </section>

      <!-- Quick Stats -->
      <section class="dashboard__stats">
        <div class="stat-card" *ngFor="let stat of quickStats()">
          <span class="stat-card__icon" [style.color]="stat.color">
            <app-icon [name]="stat.icon" [size]="24" [label]="null" />
          </span>
          <div class="stat-card__content">
            <span class="stat-card__value">{{ stat.value }}</span>
            <span class="stat-card__label">{{ stat.labelKey | t }}</span>
          </div>
        </div>
      </section>

      <!-- Quick Actions -->
      <section class="dashboard__actions">
        <a routerLink="/recipes" fragment="ai" class="action-card action-card--primary">
          <span class="action-card__icon"
            ><app-icon name="smart_toy" [size]="28" [label]="null"
          /></span>
          <span class="action-card__label">{{ 'dashboard.genAI' | t }}</span>
        </a>
        <a routerLink="/pantry" class="action-card action-card--secondary">
          <span class="action-card__icon"
            ><app-icon name="inventory_2" [size]="28" [label]="null"
          /></span>
          <span class="action-card__label">{{ 'dashboard.pantry' | t }}</span>
        </a>
        <a routerLink="/calendar" class="action-card action-card--accent">
          <span class="action-card__icon"
            ><app-icon name="calendar_today" [size]="28" [label]="null"
          /></span>
          <span class="action-card__label">{{ 'dashboard.plan' | t }}</span>
        </a>
      </section>

      <!-- Today's Meals -->
      <section class="dashboard__section">
        <div class="dashboard__section-header">
          <h2 class="dashboard__section-title">{{ 'dashboard.todayMeals' | t }}</h2>
          <a routerLink="/calendar" class="dashboard__section-link">{{
            'dashboard.viewAll' | t
          }}</a>
        </div>

        <div class="meals-list">
          <div *ngFor="let meal of upcomingMeals()" class="meal-card" data-test="today-meal">
            <span class="meal-card__icon"
              ><app-icon name="event_note" [size]="24" [label]="null"
            /></span>
            <div class="meal-card__content">
              <span class="meal-card__type">{{ mealTypeLabel(meal.mealType) }}</span>
              <span class="meal-card__name">{{ meal.title }}</span>
            </div>
            <time *ngIf="meal.time as time" class="meal-card__time" [attr.datetime]="time">
              {{ time }}
            </time>
          </div>

          <div
            *ngIf="calendarLoading()"
            class="meal-status"
            role="status"
            data-test="today-meals-loading"
          >
            {{ 'common.loading' | t }}
          </div>

          <div
            *ngIf="!calendarLoading() && calendarError() as error"
            class="meal-error"
            role="alert"
            data-test="today-meals-error"
          >
            <p class="meal-error__message">{{ error }}</p>
            <button
              class="meal-error__retry"
              type="button"
              data-test="today-meals-retry"
              (click)="retryTodayMeals()"
            >
              {{ 'calendar.reintentar' | t }}
            </button>
          </div>

          <div
            *ngIf="
              calendarReady() &&
              !calendarLoading() &&
              !calendarError() &&
              upcomingMeals().length === 0
            "
            class="empty-state"
            data-test="today-meals-empty"
          >
            <span class="empty-state__icon"
              ><app-icon name="event_note" [size]="40" [label]="null"
            /></span>
            <p class="empty-state__text">{{ 'dashboard.noMeals' | t }}</p>
            <a routerLink="/calendar" class="empty-state__link">{{ 'dashboard.planNow' | t }}</a>
          </div>
        </div>
      </section>

      <!-- Suggested Recipes -->
      <section class="dashboard__section">
        <div class="dashboard__section-header">
          <h2 class="dashboard__section-title">{{ 'dashboard.suggested' | t }}</h2>
          <a routerLink="/recipes" class="dashboard__section-link">{{ 'dashboard.viewAll' | t }}</a>
        </div>

        <div class="recipes-grid">
          <a
            *ngFor="let recipe of suggestedRecipes()"
            routerLink="/recipes"
            [queryParams]="{ recipe: recipe.id }"
            class="recipe-card"
          >
            <div class="recipe-card__image">
              <span *ngIf="!recipe.image" class="recipe-card__placeholder">
                <app-icon name="kitchen" [size]="36" [label]="null" />
              </span>
            </div>
            <div class="recipe-card__content">
              <span class="recipe-card__name">{{ recipe.name }}</span>
              <div class="recipe-card__meta">
                <span class="recipe-card__time">{{
                  'dashboard.minutes_short' | t: { time: recipe.time }
                }}</span>
                <app-badge [variant]="getDifficultyVariant(recipe.difficulty)" size="sm">
                  {{ recipe.difficulty }}
                </app-badge>
              </div>
            </div>
          </a>

          <div *ngIf="suggestedRecipes().length === 0 && !isLoading()" class="empty-state">
            <span class="empty-state__icon"
              ><app-icon name="menu_book" [size]="40" [label]="null"
            /></span>
            <p class="empty-state__text">{{ 'dashboard.noSuggested' | t }}</p>
            <a routerLink="/recipes" fragment="ai" class="empty-state__link">{{
              'dashboard.genAI' | t
            }}</a>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: [
    `
      .dashboard {
        padding-block: var(--space-4);
        max-width: 800px;
        margin: 0 auto;
      }

      @media (min-width: 768px) {
        .dashboard {
          padding-block: var(--space-8);
        }
      }

      .dashboard__welcome {
        margin-bottom: var(--space-6);
      }

      .dashboard__title {
        font-family: var(--font-display);
        font-size: var(--text-2xl);
        font-weight: var(--font-bold);
        color: var(--text-primary);
        margin-bottom: var(--space-1);
      }

      .dashboard__subtitle {
        font-size: var(--text-lg);
        color: var(--text-secondary);
      }

      .dashboard__stats {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-3);
        margin-bottom: var(--space-6);
      }

      @media (min-width: 480px) {
        .dashboard__stats {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      .stat-card {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-4);
        background: var(--bg-secondary);
        border-radius: var(--radius-xl);
        border: 1px solid var(--border-default);
      }

      .stat-card__icon {
        display: inline-flex;
      }
      .stat-card__content {
        display: flex;
        flex-direction: column;
      }

      .stat-card__value {
        font-size: var(--text-xl);
        font-weight: var(--font-bold);
        color: var(--text-primary);
      }

      .stat-card__label {
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }

      .dashboard__actions {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-3);
        margin-bottom: var(--space-8);
      }

      .action-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-4);
        border-radius: var(--radius-xl);
        text-decoration: none;
        transition: var(--transition-fast);
        &:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }
      }
      .action-card--primary {
        background: var(--primary-subtle);
        color: var(--primary-dark);
      }
      .action-card--secondary {
        background: var(--secondary-subtle);
        color: var(--secondary-dark);
      }
      .action-card--accent {
        background: var(--bg-tertiary);
        color: var(--text-primary);
      }
      .action-card__icon {
        display: inline-flex;
      }
      .action-card__label {
        font-size: var(--text-sm);
        font-weight: var(--font-medium);
      }

      .dashboard__section {
        margin-bottom: var(--space-8);
      }

      .dashboard__section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-4);
      }

      .dashboard__section-title {
        font-family: var(--font-display);
        font-size: var(--text-lg);
        font-weight: var(--font-semibold);
        color: var(--text-primary);
      }

      .dashboard__section-link {
        font-size: var(--text-sm);
        color: var(--primary);
        text-decoration: none;
        &:hover {
          color: var(--primary-dark);
        }
      }

      .meals-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .meal-status {
        display: flex;
        align-items: center;
        min-height: 44px;
        color: var(--text-secondary);
        font-size: var(--text-sm);
      }

      .meal-error {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: var(--space-2);
        padding: var(--space-3);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        background: var(--bg-secondary);
      }

      .meal-error__message {
        flex: 1;
        min-width: 0;
        margin: 0;
        color: var(--text-secondary);
        font-size: var(--text-sm);
      }

      .meal-error__retry {
        min-height: 44px;
        padding: var(--space-2) var(--space-4);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--text-primary);
        font: inherit;
        cursor: pointer;
      }

      .meal-error__retry:hover {
        background: var(--bg-tertiary);
      }

      .meal-error__retry:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }

      .meal-card {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-3);
        background: var(--bg-secondary);
        border-radius: var(--radius-lg);
        border: 1px solid var(--border-default);
      }

      .meal-card__icon {
        display: inline-flex;
        flex: none;
        color: var(--text-secondary);
      }
      .meal-card__content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .meal-card__type {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
        text-transform: uppercase;
      }
      .meal-card__name {
        font-size: var(--text-sm);
        font-weight: var(--font-medium);
        color: var(--text-primary);
        overflow-wrap: anywhere;
      }
      .meal-card__time {
        flex: none;
        font-size: var(--text-xs);
        color: var(--text-secondary);
        white-space: nowrap;
      }

      .recipes-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-3);
      }

      @media (min-width: 480px) {
        .recipes-grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      .recipe-card {
        background: var(--bg-secondary);
        border-radius: var(--radius-xl);
        border: 1px solid var(--border-default);
        overflow: hidden;
        text-decoration: none;
        transition: var(--transition-fast);
        &:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }
      }

      .recipe-card__image {
        aspect-ratio: 16/10;
        background: var(--bg-tertiary);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .recipe-card__placeholder {
        display: inline-flex;
        color: var(--text-secondary);
      }
      .recipe-card__content {
        padding: var(--space-3);
      }

      .recipe-card__name {
        font-size: var(--text-sm);
        font-weight: var(--font-medium);
        color: var(--text-primary);
        display: block;
        margin-bottom: var(--space-2);
      }

      .recipe-card__meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .recipe-card__time {
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }

      .empty-state {
        grid-column: 1 / -1;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--space-8);
        text-align: center;
      }

      .empty-state__icon {
        display: inline-flex;
        margin-bottom: var(--space-3);
        color: var(--text-secondary);
      }

      .empty-state__text {
        font-size: var(--text-sm);
        color: var(--text-secondary);
        margin-bottom: var(--space-4);
      }

      .empty-state__link {
        font-size: var(--text-sm);
        font-weight: var(--font-medium);
        color: var(--primary);
        text-decoration: none;
        &:hover {
          color: var(--primary-dark);
        }
      }
    `
  ]
})
export class DashboardComponent implements OnInit {
  private authService = inject(AuthService);
  private recipeService = inject(RecipeService);
  private pantryService = inject(PantryService);
  private calendarService = inject(CalendarService);
  private householdService = inject(HouseholdService);
  private i18n = inject(I18nService);

  userName = signal('');

  readonly todayIso = localIsoDate(new Date());
  readonly upcomingMeals = computed(() =>
    pendingMealsForDate(this.calendarService.meals(), this.todayIso)
  );
  readonly calendarLoading = this.calendarService.isLoading;
  readonly calendarError = this.calendarService.error;
  readonly calendarReady = computed(() => {
    const range = this.calendarService.range();
    return range?.start === this.todayIso && range.end === this.todayIso;
  });

  /** Recetas sugeridas: las 6 mas recientes del listado. */
  suggestedRecipes = computed<SuggestedRecipe[]>(() =>
    this.recipeService
      .recipes()
      .slice(0, 6)
      .map((r) => ({
        id: r.id,
        name: r.name,
        time: r.totalTime ?? 0,
        difficulty: r.difficulty,
        image: r.image
      }))
  );

  /**
   * Tarjetas de resumen. Son `computed` de las senales de los servicios, de
   * modo que se actualizan solas cuando cambian los datos (antes se
   * calculaban una unica vez tras un `setTimeout`, con lo que cualquier
   * peticion lenta dejaba el dashboard con valores obsoletos o a cero).
   */
  quickStats = computed<QuickStat[]>(() => [
    {
      icon: 'inventory_2',
      // Ojo: `pantryService.total()` es el total del listado de ingredientes
      // y cuenta tambien los ~68 sembrados como sugerencia con cantidad 0.
      // Lo que hay "en despensa" es stats.totalItems (quantity > 0).
      labelKey: 'dashboard.ingredients',
      value: this.pantryService.stats()?.totalItems ?? 0,
      color: 'var(--primary)'
    },
    {
      icon: 'menu_book',
      labelKey: 'nav.recipes',
      value: this.recipeService.total(),
      color: 'var(--secondary)'
    },
    {
      icon: 'group',
      labelKey: 'dashboard.members',
      value: this.householdService.household()?.members?.length ?? 0,
      color: 'var(--info)'
    },
    {
      icon: 'kitchen',
      // Sin registro de comidas cocinadas por usuario todavia
      labelKey: 'dashboard.cooked',
      value: 0,
      color: 'var(--warning)'
    }
  ]);

  isLoading = computed(() => this.pantryService.isLoading() || this.recipeService.isLoading());

  ngOnInit(): void {
    this.userName.set(this.authService.userName() || 'Chef');
    this.loadDashboardData();
  }

  private loadDashboardData(): void {
    // Ingredientes y estadisticas de la despensa
    this.pantryService.loadIngredients();
    this.pantryService.loadStats();

    // Recetas (la rejilla muestra las 6 primeras)
    this.recipeService.loadRecipes();

    // Comidas de hoy: el rango y el estado de error vienen del calendario compartido.
    this.calendarService.loadRange(this.todayIso, this.todayIso);

    // El hogar es best-effort; el dashboard no debe romperse si falla.
    try {
      this.householdService.loadHousehold();
    } catch {
      /* ignore */
    }
  }

  mealTypeLabel(mealType: MealType): string {
    return translateMealTypeLabel(mealType, (key) => this.i18n.t(key));
  }

  retryTodayMeals(): void {
    this.calendarService.loadRange(this.todayIso, this.todayIso, true);
  }

  getDifficultyVariant(difficulty: string): 'success' | 'warning' | 'error' {
    const d = (difficulty || '').toLowerCase();
    if (d === 'easy' || d === 'fácil') return 'success';
    if (d === 'hard' || d === 'difícil' || d === 'expert') return 'error';
    return 'warning';
  }
}
