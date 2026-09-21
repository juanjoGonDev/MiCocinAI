import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RecipeService } from '../../core/services/recipe.service';
import { AiService } from '../../core/services/ai.service';
import { PantryService } from '../../core/services/pantry.service';
import { ToastService } from '../../core/services/toast.service';
import { ButtonComponent } from '../../shared/components/ui/button/button.component';
import { InputComponent } from '../../shared/components/ui/input/input.component';
import { BadgeComponent } from '../../shared/components/ui/badge/badge.component';
import { TagComponent } from '../../shared/components/ui/tag/tag.component';
import { ModalComponent } from '../../shared/components/ui/modal/modal.component';
import { LoadingComponent } from '../../shared/components/ui/loading/loading.component';
import { TimerComponent } from '../../shared/components/ui/timer/timer.component';
import { Recipe, Difficulty } from '../../shared/models/recipe.model';
import { AIRecipeResponse } from '../../shared/models/ai-config.model';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { CatalogLabelPipe } from '../../shared/pipes/catalog-label.pipe';
import type { TranslationKey } from '../../core/i18n';
import { I18nService } from '../../core/services/i18n.service';

@Component({
  selector: 'app-recipes',
  standalone: true,
  imports: [
    TranslatePipe,
    
    CommonModule, FormsModule,
    ButtonComponent, InputComponent, BadgeComponent, TagComponent,
    ModalComponent, LoadingComponent, TimerComponent
  , CatalogLabelPipe],
  template: `
    <div class="recipes">
      <!-- Header -->
      <div class="recipes__header">
        <div class="recipes__title-section">
          <h1 class="recipes__title">{{ 'recipes.title' | t }}</h1>
          <span class="recipes__count">{{ recetasLabel() }}</span>
        </div>
        <div class="recipes__actions">
          <app-button variant="outline" (onClick)="openFilterModal()">
            {{ 'recipes.filters' | t }}
          </app-button>
          <app-button variant="primary" (onClick)="openAiModal()">
            {{ 'recipes.genAI' | t }}
          </app-button>
        </div>
      </div>

      <!-- Quick Filters -->
      <div class="recipes__quick-filters">
        <app-tag
          *ngFor="let filter of quickFilters"
          [selected]="activeFilter() === filter.value"
          (onClick)="setFilter(filter.value)"
        >
          {{ filter.icon }} {{ filter.labelKey | t }}
        </app-tag>
      </div>

      <!-- Loading -->
      <app-loading *ngIf="recipeService.isLoading()" [message]="'recipes.loading' | t"></app-loading>

      <!-- Recipes Grid -->
      <div class="recipes__grid" *ngIf="!recipeService.isLoading()">
        <div
          *ngFor="let recipe of recipeService.recipes(); trackBy: trackById"
          class="recipe-card"
          (click)="viewRecipe(recipe)"
        >
          <div class="recipe-card__image">
            <span class="recipe-card__placeholder">🍳</span>
            <button
              type="button"
              class="recipe-card__favorite"
              [class.recipe-card__favorite--active]="recipe.isFavorite"
              (click)="toggleFavorite(recipe); $event.stopPropagation()"
            >
              {{ recipe.isFavorite ? '❤️' : '🤍' }}
            </button>
          </div>
          
          <div class="recipe-card__content">
            <h3 class="recipe-card__name">{{ recipe.name }}</h3>
            <p class="recipe-card__description">{{ recipe.description }}</p>
            
            <div class="recipe-card__meta">
              <span class="recipe-card__time">{{ 'recipes.min' | t:{n: recipe.totalTime} }}</span>
              <app-badge [variant]="getDifficultyVariant(recipe.difficulty)" size="sm">
                {{ recipe.difficulty }}
              </app-badge>
              <span class="recipe-card__servings">👥 {{ recipe.servings }}</span>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div *ngIf="recipeService.recipes().length === 0" class="empty-state">
          <span class="empty-state__icon">📖</span>
          <h3 class="empty-state__title">{{ 'recipes.none' | t }}</h3>
          <p class="empty-state__text">{{ 'recipes.none.desc' | t }}</p>
          <app-button variant="primary" (onClick)="openAiModal()">
            {{ 'recipes.generar_con_ia' | t }}
          </app-button>
        </div>
      </div>

      <!-- AI Generation Modal -->
      <app-modal
        [isOpen]="isAiModalOpen()"
        [attr.title]="'recipes.generar_receta_con_ia' | t"
        size="lg"
        (onClose)="closeAiModal()"
      >
        <div class="ai-form">
          <p class="ai-form__description">
            {{ 'recipes.selecciona_los_ingredientes_que' | t }}
          </p>

          <!-- Selected Ingredients -->
          <div class="ai-form__section">
            <label class="ai-form__label">{{ 'recipes.ingredientes_seleccionados' | t }}</label>
            <div class="ai-form__ingredients">
              <app-tag
                *ngFor="let ing of selectedIngredients()"
                [removable]="true"
                (onRemove)="removeIngredient(ing)"
              >
                {{ ing.name | catalog }}
              </app-tag>
              <span *ngIf="selectedIngredients().length === 0" class="ai-form__hint">
                {{ 'recipes.selecciona_ingredientes_de_abajo' | t }}
              </span>
            </div>
          </div>

          <!-- Available Ingredients -->
          <div class="ai-form__section">
            <label class="ai-form__label">{{ 'recipes.tu_despensa' | t }}</label>
            <div class="ai-form__pantry">
              <app-tag
                *ngFor="let ing of pantryService.ingredients()"
                [selected]="isIngredientSelected(ing.id)"
                (onClick)="toggleIngredientSelection(ing)"
              >
                {{ getCategoryIcon(ing.category) }} {{ ing.name | catalog }}
              </app-tag>
            </div>
          </div>

          <!-- Options -->
          <div class="ai-form__row">
            <div class="ai-form__field">
              <label class="ai-form__label">{{ 'recipes.dificultad' | t }}</label>
              <select [(ngModel)]="aiOptions.difficulty" class="form-select">
                <option value="easy">{{ 'recipes.facil' | t }}</option>
                <option value="medium">{{ 'recipes.medio' | t }}</option>
                <option value="hard">{{ 'recipes.dificil' | t }}</option>
              </select>
            </div>

            <div class="ai-form__field">
              <label class="ai-form__label">{{ 'recipes.porciones' | t }}</label>
              <input type="number" [(ngModel)]="aiOptions.servings" min="1" max="20" class="form-input" />
            </div>

            <div class="ai-form__field">
              <label class="ai-form__label">{{ 'recipes.detalle' | t }}</label>
              <select [(ngModel)]="aiOptions.detailLevel" class="form-select">
                <option value="basic">{{ 'recipes.basico' | t }}</option>
                <option value="intermediate">{{ 'auth.intermediate' | t }}</option>
                <option value="expert">{{ 'auth.expert' | t }}</option>
              </select>
            </div>
          </div>

          <!-- Generate Buttons -->
          <div class="ai-form__actions">
            <app-button
              variant="primary"
              [loading]="aiService.isGenerating()"
              [disabled]="selectedIngredients().length === 0"
              (onClick)="generateSingle()"
            >
              {{ 'recipes.generar_1_receta' | t }}
            </app-button>
            <app-button
              variant="outline"
              [loading]="aiService.isGenerating()"
              [disabled]="selectedIngredients().length === 0"
              (onClick)="generateMultiple()"
            >
              {{ 'recipes.generar_3_opciones' | t }}
            </app-button>
          </div>
        </div>

        <!-- Generated Recipe -->
        <div *ngIf="aiService.generatedRecipe() as recipe" class="generated-recipe">
          <div class="generated-recipe__header">
            <h3 class="generated-recipe__title">{{ recipe.name }}</h3>
            <div class="generated-recipe__meta">
              <app-badge variant="primary">{{ 'recipes.min' | t:{n: recipe.totalTime} }}</app-badge>
              <app-badge variant="secondary">{{ 'recipes.porciones' | t:{n: recipe.servings} }}</app-badge>
              <app-badge *ngIf="recipe.calories">{{ 'recipes.kcal' | t:{n: recipe.calories} }}</app-badge>
            </div>
          </div>

          <p class="generated-recipe__description">{{ recipe.description }}</p>

          <!-- Ingredients -->
          <div class="generated-recipe__section">
            <h4>{{ 'dashboard.ingredients' | t }}</h4>
            <ul class="generated-recipe__list">
              <li *ngFor="let ing of recipe.ingredients">
                {{ 'recipes.ingrediente_de' | t: { quantity: ing.quantity, unit: ing.unit, name: ing.name } }}
                <span *ngIf="ing.preparation" class="generated-recipe__prep">({{ ing.preparation }})</span>
              </li>
            </ul>
          </div>

          <!-- Steps -->
          <div class="generated-recipe__section">
            <h4>{{ 'recipes.preparacion' | t }}</h4>
            <div class="generated-recipe__steps">
              <div *ngFor="let step of recipe.steps" class="step">
                <span class="step__number">{{ step.stepNumber }}</span>
                <div class="step__content">
                  <p class="step__instruction">{{ step.instruction }}</p>
                  <div class="step__meta" *ngIf="step.duration || step.tips">
                    <span *ngIf="step.duration" class="step__duration">{{ 'recipes.min' | t:{n: step.duration} }}</span>
                    <span *ngIf="step.tips" class="step__tips">💡 {{ step.tips }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Save Button -->
          <div class="generated-recipe__actions">
            <app-button variant="primary" (onClick)="saveGeneratedRecipe(recipe)">
              {{ 'recipes.guardar_receta' | t }}
            </app-button>
            <app-button variant="ghost" (onClick)="aiService.clearGenerated()">
              {{ 'ui.dismiss' | t }}
            </app-button>
          </div>
        </div>
      </app-modal>

      <!-- Recipe Detail Modal -->
      <app-modal
        [isOpen]="isDetailModalOpen()"
        [title]="selectedRecipe()?.name || ''"
        size="lg"
        (onClose)="closeDetailModal()"
      >
        <div *ngIf="selectedRecipe() as recipe" class="recipe-detail">
          <div class="recipe-detail__header">
            <div class="recipe-detail__meta">
              <app-badge [variant]="getDifficultyVariant(recipe.difficulty)">
                {{ recipe.difficulty }}
              </app-badge>
              <span>{{ 'recipes.min' | t:{n: recipe.totalTime} }}</span>
              <span>{{ 'recipes.porciones' | t:{n: recipe.servings} }}</span>
              <span *ngIf="recipe.calories">{{ 'recipes.kcal' | t:{n: recipe.calories} }}</span>
            </div>
            <p class="recipe-detail__description">{{ recipe.description }}</p>
          </div>

          <!-- Ingredients -->
          <div class="recipe-detail__section">
            <h3>{{ 'dashboard.ingredients' | t }}</h3>
            <ul>
              <li *ngFor="let ing of recipe.ingredients">
                {{ 'recipes.ingrediente_de' | t: { quantity: ing.quantity, unit: ing.unit, name: ing.name } }}
              </li>
            </ul>
          </div>

          <!-- Steps with Timers -->
          <div class="recipe-detail__section">
            <h3>{{ 'recipes.preparacion' | t }}</h3>
            <div class="recipe-detail__steps">
              <div *ngFor="let step of recipe.steps" class="step-card">
                <div class="step-card__header">
                  <span class="step-card__number">{{ 'recipes.paso_n' | t: { n: step.stepNumber } }}</span>
                  <span *ngIf="step.duration" class="step-card__time">{{ 'recipes.min' | t:{n: step.duration} }}</span>
                </div>
                <p class="step-card__instruction">{{ step.instruction }}</p>
                
                <app-timer
                  *ngIf="step.timerRequired && step.timerDuration"
                  [duration]="step.timerDuration * 60"
                  [label]="'recipes.timer_paso' | t:{n: step.stepNumber}"
                ></app-timer>

                <div *ngIf="step.tips" class="step-card__tip">
                  💡 {{ step.tips }}
                </div>
                <div *ngIf="step.warning" class="step-card__warning">
                  ⚠️ {{ step.warning }}
                </div>
              </div>
            </div>
          </div>

          <!-- Storage -->
          <div *ngIf="recipe.storage" class="recipe-detail__section">
            <h3>{{ 'recipes.conservacion' | t }}</h3>
            <p>{{ recipe.storage.method }} - {{ recipe.storage.duration }}</p>
            <p *ngIf="recipe.storage.reheatingInstructions">
              {{ 'recipes.recalentar' | t:{text: recipe.storage.reheatingInstructions} }}
            </p>
          </div>

          <!-- Actions -->
          <div class="recipe-detail__actions">
            <app-button variant="primary" (onClick)="cookRecipe(recipe)">
              {{ 'recipes.cocinar_ahora' | t }}
            </app-button>
            <app-button variant="outline" (onClick)="toggleFavorite(recipe)">
              {{ recipe.isFavorite ? ('recipes.favorito' | t) : ('recipes.anadir_a_favoritos' | t) }}
            </app-button>
          </div>
        </div>
      </app-modal>
    </div>
  `,
  styles: [`  /*
     * ── Estados de interaccion (HOGARIA-SPEC 12q-B) ───────────────────────────────────────────
     *
     * Todo lo que se pulsa avisa antes de que se pulse. Va aqui arriba, junto, en lugar de repartido por
     * las reglas de cada control: asi la proxima clase que se anada se compara con esta lista, y el
     * check-ui (regla boton-sin-afecto) no deja a nadie poner un boton sin su hover. Van sin :hover los
     * deshabilitados —un boton apagado que se ilumina es la manera mas rapida de ensenar a desconfiar.
     */
    /* El corazon de la tarjeta esta encima de una tarjeta que ya es un enlace: su hover tiene que marcar
       el icono, no la tarjeta, y por eso se pinta el circulo en lugar de cambiar el color del trazo. */
    .recipe-card__favorite:hover {
      background: var(--error-subtle);
      transform: scale(1.1);
    }
  

    .recipes {
      padding: var(--space-4);
      max-width: 1000px;
      margin: 0 auto;
    }

    @media (min-width: 768px) {
      .recipes { padding: var(--space-6); }
    }

    .recipes__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-4);
      flex-wrap: wrap;
      gap: var(--space-3);
    }

    .recipes__title-section {
      display: flex;
      align-items: baseline;
      gap: var(--space-3);
    }

    .recipes__title {
      font-family: var(--font-display);
      font-size: var(--text-2xl);
      font-weight: var(--font-bold);
    }

    .recipes__count {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    .recipes__actions {
      display: flex;
      gap: var(--space-2);
    }

    .recipes__quick-filters {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-bottom: var(--space-6);
    }

    .recipes__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--space-4);
    }

    /* Recipe Card */
    .recipe-card {
      background: var(--bg-secondary);
      border-radius: var(--radius-xl);
      border: 1px solid var(--border-default);
      overflow: hidden;
      cursor: pointer;
      transition: var(--transition-fast);

      &:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-md);
      }
    }

    .recipe-card__image {
      position: relative;
      aspect-ratio: 16/10;
      background: var(--bg-tertiary);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .recipe-card__placeholder {
      font-size: 48px;
    }

    .recipe-card__favorite {
      position: absolute;
      top: var(--space-2);
      right: var(--space-2);
      width: 36px;
      height: 36px;
      border-radius: var(--radius-full);
      background: rgba(255,255,255,0.9);
      border: none;
      cursor: pointer;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .recipe-card__content {
      padding: var(--space-4);
    }

    .recipe-card__name {
      font-family: var(--font-display);
      font-size: var(--text-base);
      font-weight: var(--font-semibold);
      margin-bottom: var(--space-1);
    }

    .recipe-card__description {
      font-size: var(--text-xs);
      color: var(--text-secondary);
      margin-bottom: var(--space-3);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .recipe-card__meta {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      font-size: var(--text-xs);
      color: var(--text-secondary);
    }

    /* AI Form */
    .ai-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
    }

    .ai-form__description {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    .ai-form__section {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .ai-form__label {
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
    }

    .ai-form__ingredients,
    .ai-form__pantry {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      padding: var(--space-3);
      background: var(--bg-tertiary);
      border-radius: var(--radius-lg);
      min-height: 60px;
    }

    .ai-form__hint {
      font-size: var(--text-sm);
      color: var(--text-tertiary);
    }

    .ai-form__row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-4);
    }

    .ai-form__field {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .ai-form__actions {
      display: flex;
      gap: var(--space-3);
    }

    /* Generated Recipe */
    .generated-recipe {
      margin-top: var(--space-6);
      padding-top: var(--space-6);
      border-top: 1px solid var(--border-default);
    }

    .generated-recipe__header {
      margin-bottom: var(--space-4);
    }

    .generated-recipe__title {
      font-family: var(--font-display);
      font-size: var(--text-xl);
      font-weight: var(--font-bold);
      margin-bottom: var(--space-2);
    }

    .generated-recipe__meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .generated-recipe__description {
      font-size: var(--text-sm);
      color: var(--text-secondary);
      margin-bottom: var(--space-6);
    }

    .generated-recipe__section {
      margin-bottom: var(--space-6);

      h4 {
        font-size: var(--text-base);
        font-weight: var(--font-semibold);
        margin-bottom: var(--space-3);
      }
    }

    .generated-recipe__list {
      list-style: none;
      padding: 0;

      li {
        padding: var(--space-2) 0;
        border-bottom: 1px solid var(--border-default);
        font-size: var(--text-sm);
      }
    }

    .generated-recipe__prep {
      color: var(--text-tertiary);
      font-style: italic;
    }

    .generated-recipe__steps {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .step {
      display: flex;
      gap: var(--space-3);
    }

    .step__number {
      width: 28px;
      height: 28px;
      background: var(--primary-subtle);
      color: var(--primary-dark);
      border-radius: var(--radius-full);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--text-xs);
      font-weight: var(--font-bold);
      flex-shrink: 0;
    }

    .step__instruction {
      font-size: var(--text-sm);
    }

    .step__meta {
      display: flex;
      gap: var(--space-3);
      margin-top: var(--space-2);
      font-size: var(--text-xs);
      color: var(--text-secondary);
    }

    .generated-recipe__actions {
      display: flex;
      gap: var(--space-3);
      margin-top: var(--space-6);
    }

    /* Recipe Detail */
    .recipe-detail__header {
      margin-bottom: var(--space-6);
    }

    .recipe-detail__meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      margin-bottom: var(--space-3);
    }

    .recipe-detail__description {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    .recipe-detail__section {
      margin-bottom: var(--space-6);

      h3 {
        font-size: var(--text-lg);
        font-weight: var(--font-semibold);
        margin-bottom: var(--space-3);
      }

      ul {
        list-style: none;
        padding: 0;

        li {
          padding: var(--space-2) 0;
          border-bottom: 1px solid var(--border-default);
          font-size: var(--text-sm);
        }
      }
    }

    .recipe-detail__steps {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .step-card {
      padding: var(--space-4);
      background: var(--bg-tertiary);
      border-radius: var(--radius-lg);
    }

    .step-card__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-2);
    }

    .step-card__number {
      font-weight: var(--font-semibold);
      font-size: var(--text-sm);
    }

    .step-card__time {
      font-size: var(--text-xs);
      color: var(--text-secondary);
    }

    .step-card__instruction {
      font-size: var(--text-sm);
      margin-bottom: var(--space-3);
    }

    .step-card__tip,
    .step-card__warning {
      font-size: var(--text-xs);
      padding: var(--space-2);
      border-radius: var(--radius-md);
      margin-top: var(--space-2);
    }

    .step-card__tip {
      background: var(--info-subtle);
      color: var(--color-info-700);
    }

    .step-card__warning {
      background: var(--warning-subtle);
      color: var(--color-warning-700);
    }

    .recipe-detail__actions {
      display: flex;
      gap: var(--space-3);
      margin-top: var(--space-6);
    }

    /* Form elements */
    .form-select,
    .form-input {
      width: 100%;
      padding: var(--space-2) var(--space-3);
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--text-primary);
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);

      &:focus {
        outline: none;
        border-color: var(--primary);
      }
    }

    /* Empty State */
    .empty-state {
      grid-column: 1 / -1;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--space-12);
      text-align: center;
    }

    .empty-state__icon {
      font-size: 64px;
      margin-bottom: var(--space-4);
    }

    .empty-state__title {
      font-family: var(--font-display);
      font-size: var(--text-xl);
      font-weight: var(--font-semibold);
      margin-bottom: var(--space-2);
    }

    .empty-state__text {
      font-size: var(--text-sm);
      color: var(--text-secondary);
      margin-bottom: var(--space-6);
    }

    @media (max-width: 480px) {
      .ai-form__row {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class RecipesComponent implements OnInit {
  private readonly i18n = inject(I18nService);

  /** Cuantas recetas hay, dicho como se lee: «1 receta» no es «1 recetas». */
  recetasLabel(): string {
    const n = this.recipeService.total();
    return this.i18n.plural(n, 'recipes.n_recetas_uno', 'recipes.n_recetas_varios', { count: n });
  }

  recipeService = inject(RecipeService);
  aiService = inject(AiService);
  pantryService = inject(PantryService);
  private toastService = inject(ToastService);

  activeFilter = signal('');
  isAiModalOpen = signal(false);
  isDetailModalOpen = signal(false);
  selectedRecipe = signal<Recipe | null>(null);
  selectedIngredients = signal<any[]>([]);

  aiOptions = {
    difficulty: 'medium',
    servings: 4,
    detailLevel: 'intermediate'
  };

  /** Cuatro filtros, cuatro claves. «IA» en ingles se escribe «AI», y eso un catalogo con la frase dentro no lo puede saber. */
  readonly quickFilters: { value: string; labelKey: TranslationKey; icon: string }[] = [
    { value: '', labelKey: 'recipes.filtro_todas', icon: '📋' },
    { value: 'favorites', labelKey: 'recipes.filtro_favoritas', icon: '❤️' },
    { value: 'quick', labelKey: 'recipes.filtro_rapidas', icon: '⚡' },
    { value: 'ai', labelKey: 'recipes.filtro_ia', icon: '🤖' }
  ];

  ngOnInit(): void {
    this.recipeService.loadRecipes();
    this.pantryService.loadIngredients();
  }

  setFilter(filter: string): void {
    this.activeFilter.set(filter);
    if (filter === 'favorites') {
      this.recipeService.loadRecipes({ isFavorite: true });
    } else if (filter === 'ai') {
      this.recipeService.loadRecipes({ author: 'ai' });
    } else if (filter === 'quick') {
      this.recipeService.loadRecipes({ maxTime: 30 });
    } else {
      this.recipeService.loadRecipes();
    }
  }

  openAiModal(): void {
    this.isAiModalOpen.set(true);
    this.aiService.clearGenerated();
  }

  closeAiModal(): void {
    this.isAiModalOpen.set(false);
    this.selectedIngredients.set([]);
    this.aiService.clearGenerated();
  }

  viewRecipe(recipe: Recipe): void {
    this.selectedRecipe.set(recipe);
    this.isDetailModalOpen.set(true);
  }

  closeDetailModal(): void {
    this.isDetailModalOpen.set(false);
    this.selectedRecipe.set(null);
  }

  openFilterModal(): void {
    // TODO: Implement filter modal
  }

  toggleIngredientSelection(ingredient: any): void {
    this.selectedIngredients.update(list => {
      const exists = list.find(i => i.id === ingredient.id);
      if (exists) {
        return list.filter(i => i.id !== ingredient.id);
      }
      return [...list, ingredient];
    });
  }

  removeIngredient(ingredient: any): void {
    this.selectedIngredients.update(list => list.filter(i => i.id !== ingredient.id));
  }

  isIngredientSelected(id: string): boolean {
    return this.selectedIngredients().some(i => i.id === id);
  }

  generateSingle(): void {
    const request = {
      ingredients: this.selectedIngredients().map(i => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit
      })),
      utensils: [],
      servings: this.aiOptions.servings,
      difficulty: this.aiOptions.difficulty,
      detailLevel: this.aiOptions.detailLevel as any,
      dietaryRestrictions: [],
      allergies: [],
      preferences: []
    };

    this.aiService.generateRecipe(request).subscribe({
      next: () => {
        this.toastService.success(this.i18n.t('recipes.receta_generada'), this.i18n.t('recipes.la_ia_ha_creado'));
      },
      error: () => {
        this.toastService.error(this.i18n.t('ui.error'), this.i18n.t('recipes.no_se_pudo_generar'));
      }
    });
  }

  generateMultiple(): void {
    const request = {
      ingredients: this.selectedIngredients().map(i => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit
      })),
      utensils: [],
      servings: this.aiOptions.servings,
      difficulty: this.aiOptions.difficulty,
      detailLevel: this.aiOptions.detailLevel as any,
      dietaryRestrictions: [],
      allergies: [],
      preferences: [],
      count: 3
    };

    this.aiService.generateMultipleRecipes(request).subscribe({
      next: () => {
        this.toastService.success(this.i18n.t('recipes.recetas_generadas'), this.i18n.t('recipes.selecciona_tu_favorita'));
      },
      error: () => {
        this.toastService.error(this.i18n.t('ui.error'), this.i18n.t('recipes.no_se_pudieron_generar'));
      }
    });
  }

  saveGeneratedRecipe(recipe: AIRecipeResponse): void {
    this.recipeService.createRecipe({
      name: recipe.name,
      description: recipe.description,
      difficulty: recipe.difficulty as Difficulty,
      totalTime: recipe.totalTime,
      prepTime: recipe.prepTime,
      cookTime: recipe.cookTime,
      restTime: recipe.restTime,
      servings: recipe.servings,
      calories: recipe.calories,
      ingredients: recipe.ingredients.map(i => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit as any,
        preparation: i.preparation,
        isOptional: false,
        notes: i.notes
      })),
      utensils: recipe.utensils,
      steps: recipe.steps.map(s => ({
        stepNumber: s.stepNumber,
        instruction: s.instruction,
        duration: s.duration,
        timerRequired: !!s.duration,
        timerDuration: s.duration,
        tips: s.tips,
        warning: s.warning
      })),
      nutrition: recipe.nutrition ? {
        calories: recipe.nutrition.calories,
        protein: recipe.nutrition.protein,
        carbs: recipe.nutrition.carbs,
        fat: recipe.nutrition.fat,
        fiber: recipe.nutrition.fiber || 0
      } : undefined,
      storage: recipe.storage ? {
        method: recipe.storage.method,
        container: 'Apropiado',
        duration: recipe.storage.duration,
        reheatingInstructions: recipe.storage.reheating,
        freezingPossible: false
      } : undefined,
      tags: []
    }).subscribe({
      next: () => {
        this.toastService.success(this.i18n.t('recipes.guardada'), this.i18n.t('recipes.la_receta_se_ha'));
        this.closeAiModal();
      },
      error: () => {
        this.toastService.error(this.i18n.t('ui.error'), this.i18n.t('recipes.no_se_pudo_guardar'));
      }
    });
  }

  toggleFavorite(recipe: Recipe): void {
    this.recipeService.toggleFavorite(recipe.id);
  }

  cookRecipe(recipe: Recipe): void {
    this.recipeService.recordCooking(recipe.id);
    this.toastService.success(this.i18n.t('recipes.a_cocinar'), this.i18n.t('recipes.disfruta_preparando_tu_receta'));
    this.closeDetailModal();
  }

  getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      dairy: '🧀', meat: '🥩', fish: '🐟', vegetables: '🥬',
      fruits: '🍎', grains: '🌾', spices: '🧂', frozen: '❄️'
    };
    return icons[category] || '📦';
  }

  getDifficultyVariant(difficulty: string): 'success' | 'warning' | 'error' {
    switch (difficulty?.toLowerCase()) {
      case 'easy': return 'success';
      case 'medium': return 'warning';
      case 'hard': return 'error';
      default: return 'warning';
    }
  }

  trackById(_index: number, item: Recipe): string {
    return item.id;
  }
}
