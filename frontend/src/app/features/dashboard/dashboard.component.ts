import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { RecipeService } from '../../core/services/recipe.service';
import { PantryService } from '../../core/services/pantry.service';
import { CalendarService } from '../../core/services/calendar.service';
import { HouseholdService } from '../../core/services/household.service';
import { CardComponent } from '../../shared/components/ui/card/card.component';
import { BadgeComponent } from '../../shared/components/ui/badge/badge.component';
import { ProgressComponent } from '../../shared/components/ui/progress/progress.component';
import { TranslatePipe } from '../../core/pipes/translate.pipe';

interface QuickStat {
  icon: string;
  labelKey: string;
  value: string | number;
  color: string;
}

interface UpcomingMeal {
  id: string;
  type: string;
  name: string;
  time: string;
  icon: string;
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
  imports: [CommonModule, RouterLink, CardComponent, BadgeComponent, ProgressComponent, TranslatePipe],
  template: `
    <div class="dashboard">
      <!-- Welcome Section -->
      <section class="dashboard__welcome">
        <div class="dashboard__greeting">
          <h1 class="dashboard__title">{{ 'dashboard.greeting' | t:{name: userName()} }}</h1>
          <p class="dashboard__subtitle">{{ 'dashboard.subtitle' | t }}</p>
        </div>
      </section>

      <!-- Quick Stats -->
      <section class="dashboard__stats">
        <div class="stat-card" *ngFor="let stat of quickStats()">
          <span class="stat-card__icon">{{ stat.icon }}</span>
          <div class="stat-card__content">
            <span class="stat-card__value">{{ stat.value }}</span>
            <span class="stat-card__label">{{ stat.labelKey | t }}</span>
          </div>
        </div>
      </section>

      <!-- Quick Actions -->
      <section class="dashboard__actions">
        <a routerLink="/recipes" fragment="ai" class="action-card action-card--primary">
          <span class="action-card__icon">🤖</span>
          <span class="action-card__label">{{ 'dashboard.genAI' | t }}</span>
        </a>
        <a routerLink="/pantry" class="action-card action-card--secondary">
          <span class="action-card__icon">📦</span>
          <span class="action-card__label">{{ 'dashboard.pantry' | t }}</span>
        </a>
        <a routerLink="/calendar" class="action-card action-card--accent">
          <span class="action-card__icon">📅</span>
          <span class="action-card__label">{{ 'dashboard.plan' | t }}</span>
        </a>
      </section>

      <!-- Today's Meals -->
      <section class="dashboard__section">
        <div class="dashboard__section-header">
          <h2 class="dashboard__section-title">{{ 'dashboard.todayMeals' | t }}</h2>
          <a routerLink="/calendar" class="dashboard__section-link">{{ 'dashboard.viewAll' | t }}</a>
        </div>

        <div class="meals-list">
          <div *ngFor="let meal of upcomingMeals()" class="meal-card">
            <span class="meal-card__icon">{{ meal.icon }}</span>
            <div class="meal-card__content">
              <span class="meal-card__type">{{ meal.type }}</span>
              <span class="meal-card__name">{{ meal.name }}</span>
            </div>
            <span class="meal-card__time">{{ meal.time }}</span>
          </div>

          <div *ngIf="upcomingMeals().length === 0 && !isLoading()" class="empty-state">
            <span class="empty-state__icon">🍽️</span>
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
            [routerLink]="['/recipes', recipe.id]"
            class="recipe-card"
          >
            <div class="recipe-card__image">
              <span *ngIf="!recipe.image" class="recipe-card__placeholder">🍳</span>
            </div>
            <div class="recipe-card__content">
              <span class="recipe-card__name">{{ recipe.name }}</span>
              <div class="recipe-card__meta">
                <span class="recipe-card__time">⏱️ {{ recipe.time }}min</span>
                <app-badge [variant]="getDifficultyVariant(recipe.difficulty)" size="sm">
                  {{ recipe.difficulty }}
                </app-badge>
              </div>
            </div>
          </a>

          <div *ngIf="suggestedRecipes().length === 0 && !isLoading()" class="empty-state">
            <span class="empty-state__icon">📖</span>
            <p class="empty-state__text">{{ 'dashboard.noSuggested' | t }}</p>
            <a routerLink="/recipes" fragment="ai" class="empty-state__link">{{ 'dashboard.genAIRecipes' | t }}</a>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .dashboard {
      padding: var(--space-4);
      max-width: 800px;
      margin: 0 auto;
    }

    @media (min-width: 768px) {
      .dashboard { padding: var(--space-8); }
    }

    .dashboard__welcome { margin-bottom: var(--space-6); }

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
      .dashboard__stats { grid-template-columns: repeat(4, 1fr); }
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

    .stat-card__icon { font-size: var(--text-2xl); }
    .stat-card__content { display: flex; flex-direction: column; }

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
      &:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
    }
    .action-card--primary   { background: var(--primary-subtle); color: var(--primary-dark); }
    .action-card--secondary { background: var(--secondary-subtle); color: var(--secondary-dark); }
    .action-card--accent    { background: var(--bg-tertiary); color: var(--text-primary); }
    .action-card__icon { font-size: var(--text-3xl); }
    .action-card__label { font-size: var(--text-sm); font-weight: var(--font-medium); }

    .dashboard__section { margin-bottom: var(--space-8); }

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
      &:hover { color: var(--primary-dark); }
    }

    .meals-list { display: flex; flex-direction: column; gap: var(--space-2); }

    .meal-card {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3);
      background: var(--bg-secondary);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-default);
    }

    .meal-card__icon { font-size: var(--text-2xl); }
    .meal-card__content { flex: 1; display: flex; flex-direction: column; }
    .meal-card__type { font-size: var(--text-xs); color: var(--text-tertiary); text-transform: uppercase; }
    .meal-card__name { font-size: var(--text-sm); font-weight: var(--font-medium); color: var(--text-primary); }
    .meal-card__time { font-size: var(--text-xs); color: var(--text-secondary); }

    .recipes-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-3);
    }

    @media (min-width: 480px) {
      .recipes-grid { grid-template-columns: repeat(3, 1fr); }
    }

    .recipe-card {
      background: var(--bg-secondary);
      border-radius: var(--radius-xl);
      border: 1px solid var(--border-default);
      overflow: hidden;
      text-decoration: none;
      transition: var(--transition-fast);
      &:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
    }

    .recipe-card__image {
      aspect-ratio: 16/10;
      background: var(--bg-tertiary);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .recipe-card__placeholder { font-size: var(--text-4xl); }
    .recipe-card__content { padding: var(--space-3); }

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

    .recipe-card__time { font-size: var(--text-xs); color: var(--text-secondary); }

    .empty-state {
      grid-column: 1 / -1;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--space-8);
      text-align: center;
    }

    .empty-state__icon { font-size: 48px; margin-bottom: var(--space-3); }

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
      &:hover { color: var(--primary-dark); }
    }
  `]
})
export class DashboardComponent implements OnInit {
  private authService = inject(AuthService);
  private recipeService = inject(RecipeService);
  private pantryService = inject(PantryService);
  private calendarService = inject(CalendarService);
  private householdService = inject(HouseholdService);

  userName = signal('');
  quickStats = signal<QuickStat[]>([]);
  upcomingMeals = signal<UpcomingMeal[]>([]);
  suggestedRecipes = signal<SuggestedRecipe[]>([]);
  isLoading = signal(true);

  ngOnInit(): void {
    this.userName.set(this.authService.userName() || 'Chef');
    this.loadDashboardData();
  }

  private loadDashboardData(): void {
    this.isLoading.set(true);

    // Load pantry for stats
    this.pantryService.loadIngredients();
    this.pantryService.loadStats();

    // Load recipes (first 6, sorted by newest)
    this.recipeService.loadRecipes({ pageSize: 6 } as any);

    // Load calendar / household (best-effort)
    try { (this.calendarService as any).loadCalendar?.(); } catch { /* ignore */ }
    try { this.householdService.loadHousehold(); } catch { /* ignore */ }

    // Combine signals into view models after a tick
    setTimeout(() => {
      const pantryTotal = this.pantryService.total();
      const recipesTotal = this.recipeService.total();
      const recipes = this.recipeService.recipes().slice(0, 6).map(r => ({
        id: r.id,
        name: r.name,
        time: r.totalTime ?? 0,
        difficulty: r.difficulty,
        image: r.image
      }));
      this.suggestedRecipes.set(recipes);

      this.quickStats.set([
        { icon: '📦', labelKey: 'dashboard.ingredients', value: pantryTotal, color: 'var(--primary)' },
        { icon: '📖', labelKey: 'dashboard.recipes', value: recipesTotal, color: 'var(--secondary)' },
        { icon: '👨‍👩‍👧‍👦', labelKey: 'dashboard.members', value: 0, color: 'var(--info)' },
        { icon: '🍳', labelKey: 'dashboard.cooked', value: 0, color: 'var(--warning)' }
      ]);

      // Upcoming meals: empty until calendar provides them
      this.upcomingMeals.set([]);
      this.isLoading.set(false);
    }, 400);
  }

  getDifficultyVariant(difficulty: string): 'success' | 'warning' | 'error' {
    const d = (difficulty || '').toLowerCase();
    if (d === 'easy' || d === 'fácil') return 'success';
    if (d === 'hard' || d === 'difícil' || d === 'expert') return 'error';
    return 'warning';
  }
}
