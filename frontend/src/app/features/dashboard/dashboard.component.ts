import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { CardComponent } from '../../shared/components/ui/card/card.component';
import { BadgeComponent } from '../../shared/components/ui/badge/badge.component';
import { ProgressComponent } from '../../shared/components/ui/progress/progress.component';

interface QuickStat {
  icon: string;
  label: string;
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
  imports: [CommonModule, RouterLink, CardComponent, BadgeComponent, ProgressComponent],
  template: `
    <div class="dashboard">
      <!-- Welcome Section -->
      <section class="dashboard__welcome">
        <div class="dashboard__greeting">
          <h1 class="dashboard__title">¡Hola, {{ userName() }}! 👋</h1>
          <p class="dashboard__subtitle">¿Qué vamos a cocinar hoy?</p>
        </div>
      </section>

      <!-- Quick Stats -->
      <section class="dashboard__stats">
        <div class="stat-card" *ngFor="let stat of quickStats()">
          <span class="stat-card__icon">{{ stat.icon }}</span>
          <div class="stat-card__content">
            <span class="stat-card__value">{{ stat.value }}</span>
            <span class="stat-card__label">{{ stat.label }}</span>
          </div>
        </div>
      </section>

      <!-- Quick Actions -->
      <section class="dashboard__actions">
        <a routerLink="/recipes/generate" class="action-card action-card--primary">
          <span class="action-card__icon">🤖</span>
          <span class="action-card__label">Generar con IA</span>
        </a>
        <a routerLink="/pantry" class="action-card action-card--secondary">
          <span class="action-card__icon">📦</span>
          <span class="action-card__label">Mi Despensa</span>
        </a>
        <a routerLink="/calendar" class="action-card action-card--accent">
          <span class="action-card__icon">📅</span>
          <span class="action-card__label">Planificar</span>
        </a>
      </section>

      <!-- Today's Meals -->
      <section class="dashboard__section">
        <div class="dashboard__section-header">
          <h2 class="dashboard__section-title">Comidas de hoy</h2>
          <a routerLink="/calendar" class="dashboard__section-link">Ver todo →</a>
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
          
          <div *ngIf="upcomingMeals().length === 0" class="empty-state">
            <span class="empty-state__icon">🍽️</span>
            <p class="empty-state__text">No hay comidas planificadas para hoy</p>
            <a routerLink="/calendar" class="empty-state__link">Planificar ahora</a>
          </div>
        </div>
      </section>

      <!-- Suggested Recipes -->
      <section class="dashboard__section">
        <div class="dashboard__section-header">
          <h2 class="dashboard__section-title">Recetas sugeridas</h2>
          <a routerLink="/recipes" class="dashboard__section-link">Ver todas →</a>
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
          
          <div *ngIf="suggestedRecipes().length === 0" class="empty-state">
            <span class="empty-state__icon">📖</span>
            <p class="empty-state__text">No hay recetas sugeridas</p>
            <a routerLink="/recipes/generate" class="empty-state__link">Generar con IA</a>
          </div>
        </div>
      </section>

      <!-- Weekly Progress -->
      <section class="dashboard__section">
        <div class="dashboard__section-header">
          <h2 class="dashboard__section-title">Progreso semanal</h2>
        </div>
        
        <div class="progress-card">
          <div class="progress-card__item">
            <div class="progress-card__header">
              <span class="progress-card__label">Calorías</span>
              <span class="progress-card__value">1,450 / 2,000</span>
            </div>
            <app-progress [value]="72" size="md"></app-progress>
          </div>
          
          <div class="progress-card__item">
            <div class="progress-card__header">
              <span class="progress-card__label">Proteínas</span>
              <span class="progress-card__value">65g / 100g</span>
            </div>
            <app-progress [value]="65" size="md" color="var(--secondary)"></app-progress>
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
      .dashboard {
        padding: var(--space-8);
      }
    }

    /* Welcome */
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

    /* Stats */
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
      font-size: var(--text-2xl);
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

    /* Quick Actions */
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
      font-size: var(--text-3xl);
    }

    .action-card__label {
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
    }

    /* Sections */
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

    /* Meals */
    .meals-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
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
      font-size: var(--text-2xl);
    }

    .meal-card__content {
      flex: 1;
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
    }

    .meal-card__time {
      font-size: var(--text-xs);
      color: var(--text-secondary);
    }

    /* Recipes Grid */
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
      font-size: var(--text-4xl);
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

    /* Progress */
    .progress-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding: var(--space-4);
      background: var(--bg-secondary);
      border-radius: var(--radius-xl);
      border: 1px solid var(--border-default);
    }

    .progress-card__item {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .progress-card__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .progress-card__label {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    .progress-card__value {
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      color: var(--text-primary);
    }

    /* Empty State */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--space-8);
      text-align: center;
    }

    .empty-state__icon {
      font-size: 48px;
      margin-bottom: var(--space-3);
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
  `]
})
export class DashboardComponent implements OnInit {
  private authService = inject(AuthService);

  userName = signal('');
  quickStats = signal<QuickStat[]>([]);
  upcomingMeals = signal<UpcomingMeal[]>([]);
  suggestedRecipes = signal<SuggestedRecipe[]>([]);

  ngOnInit(): void {
    this.userName.set(this.authService.userName() || 'Chef');
    this.loadDashboardData();
  }

  private loadDashboardData(): void {
    // Mock data - in real app, fetch from API
    this.quickStats.set([
      { icon: '📦', label: 'Ingredientes', value: 24, color: 'var(--primary)' },
      { icon: '📖', label: 'Recetas', value: 12, color: 'var(--secondary)' },
      { icon: '👨‍👩‍👧‍👦', label: 'Miembros', value: 3, color: 'var(--info)' },
      { icon: '🍳', label: 'Cocinadas', value: 8, color: 'var(--warning)' }
    ]);

    this.upcomingMeals.set([
      { id: '1', type: 'Desayuno', name: 'Tostadas con aguacate', time: '08:30', icon: '🥑' },
      { id: '2', type: 'Almuerzo', name: 'Pasta con pollo', time: '13:00', icon: '🍝' },
      { id: '3', type: 'Cena', name: 'Ensalada César', time: '20:00', icon: '🥗' }
    ]);

    this.suggestedRecipes.set([
      { id: '1', name: 'Pasta Carbonara', time: 25, difficulty: 'Fácil' },
      { id: '2', name: 'Pollo al Curry', time: 40, difficulty: 'Medio' },
      { id: '3', name: 'Ensalada Griega', time: 15, difficulty: 'Fácil' }
    ]);
  }

  getDifficultyVariant(difficulty: string): 'success' | 'warning' | 'error' {
    switch (difficulty.toLowerCase()) {
      case 'fácil': return 'success';
      case 'medio': return 'warning';
      case 'difícil': return 'error';
      default: return 'warning';
    }
  }
}
