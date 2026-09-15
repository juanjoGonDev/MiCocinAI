import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CalendarService } from '../../core/services/calendar.service';
import { AiService } from '../../core/services/ai.service';
import { ToastService } from '../../core/services/toast.service';
import { ButtonComponent } from '../../shared/components/ui/button/button.component';
import { CardComponent } from '../../shared/components/ui/card/card.component';
import { BadgeComponent } from '../../shared/components/ui/badge/badge.component';
import { TagComponent } from '../../shared/components/ui/tag/tag.component';
import { ModalComponent } from '../../shared/components/ui/modal/modal.component';
import { LoadingComponent } from '../../shared/components/ui/loading/loading.component';
import { ProgressComponent } from '../../shared/components/ui/progress/progress.component';
import {
  DayOfWeek,
  MealType,
  DAY_OF_WEEK_LABELS,
  MEAL_TYPE_LABELS,
  GOAL_TYPE_LABELS,
  GoalType
} from '../../shared/models/calendar.model';
import { clearTabParam, readTabParam, writeTabParam } from '../../core/utils/tab-url';

interface DayMeals {
  day: DayOfWeek;
  date: string;
  meals: Record<MealType, any>;
}

/** Pestañas del modal de comida: "Escribir" o elegir una receta. */
type MealTab = 'custom' | 'recipe';

/** Query param que lleva la pestaña del modal de comida en la URL. */
const MEAL_TAB_PARAM = 'mealTab';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonComponent, CardComponent, BadgeComponent, TagComponent,
    ModalComponent, LoadingComponent, ProgressComponent
  ],
  template: `
    <div class="calendar">
      <!-- Header -->
      <div class="calendar__header">
        <div class="calendar__title-section">
          <h1 class="calendar__title">📅 Planificación Semanal</h1>
          <span class="calendar__week">{{ currentWeekLabel() }}</span>
        </div>
        <div class="calendar__actions">
          <app-button variant="outline" (onClick)="previousWeek()">
            ←
          </app-button>
          <app-button variant="outline" (onClick)="goToToday()">
            Hoy
          </app-button>
          <app-button variant="outline" (onClick)="nextWeek()">
            →
          </app-button>
          <app-button variant="primary" (onClick)="openGenerateModal()">
            🤖 Planificar IA
          </app-button>
        </div>
      </div>

      <!-- Goals -->
      <div class="calendar__goals" *ngIf="selectedGoal()">
        <span class="calendar__goal-label">Objetivo:</span>
        <app-tag [selected]="true">{{ getGoalLabel(selectedGoal()!) }}</app-tag>
        <app-button variant="ghost" size="sm" (onClick)="openGoalsModal()">
          Cambiar
        </app-button>
      </div>

      <!-- Weekly Progress -->
      <div class="calendar__progress">
        <div class="progress-item">
          <span class="progress-item__label">Calorías</span>
          <span class="progress-item__value">{{ weeklyCalories() }} / {{ targetCalories }}</span>
          <app-progress [value]="getCalorieProgress()" size="sm"></app-progress>
        </div>
        <div class="progress-item">
          <span class="progress-item__label">Comidas planificadas</span>
          <span class="progress-item__value">{{ plannedMeals() }} / 21</span>
          <app-progress [value]="getMealProgress()" size="sm" color="var(--secondary)"></app-progress>
        </div>
      </div>

      <!-- Loading -->
      <app-loading *ngIf="calendarService.isLoading()" message="Cargando calendario..."></app-loading>

      <!-- Weekly Grid -->
      <div class="calendar__grid" *ngIf="!calendarService.isLoading()">
        <div
          *ngFor="let day of weekDays()"
          class="day-column"
          [class.day-column--today]="isToday(day.date)"
        >
          <div class="day-column__header">
            <span class="day-column__name">{{ getDayLabel(day.day) }}</span>
            <span class="day-column__date">{{ formatDate(day.date) }}</span>
          </div>

          <div class="day-column__meals">
            <div
              *ngFor="let mealType of mealTypes"
              class="meal-slot"
              [class.meal-slot--filled]="day.meals[mealType]"
              (click)="openAddMealModal(day.date, mealType)"
            >
              <span class="meal-slot__type">{{ getMealIcon(mealType) }} {{ getMealLabel(mealType) }}</span>
              
              <div *ngIf="day.meals[mealType] as meal" class="meal-slot__content">
                <span class="meal-slot__name">{{ meal.recipe_name || meal.custom_meal }}</span>
                <div class="meal-slot__actions">
                  <button
                    type="button"
                    class="meal-action"
                    [class.meal-action--done]="meal.completed"
                    (click)="toggleComplete(meal); $event.stopPropagation()"
                  >
                    {{ meal.completed ? '✅' : '⬜' }}
                  </button>
                  <button
                    type="button"
                    class="meal-action meal-action--delete"
                    (click)="deleteMeal(meal); $event.stopPropagation()"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <span *ngIf="!day.meals[mealType]" class="meal-slot__empty">
                + Agregar
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Add Meal Modal -->
      <app-modal
        [isOpen]="isAddMealModalOpen()"
        title="Agregar Comida"
        size="md"
        (onClose)="closeAddMealModal()"
      >
        <div class="add-meal-form">
          <div class="add-meal-form__info">
            <span>{{ getMealLabel(newMealData.mealType) }} - {{ formatDate(newMealData.date) }}</span>
          </div>

          <div class="add-meal-form__tabs">
            <button
              type="button"
              [class]="'tab' + (addMealTab() === 'custom' ? ' tab--active' : '')"
              (click)="switchAddMealTab('custom')"
            >
              Escribir
            </button>
            <button
              type="button"
              [class]="'tab' + (addMealTab() === 'recipe' ? ' tab--active' : '')"
              (click)="switchAddMealTab('recipe')"
            >
              Receta
            </button>
          </div>

          <div *ngIf="addMealTab() === 'custom'" class="add-meal-form__field">
            <label>¿Qué vas a comer?</label>
            <input
              type="text"
              [(ngModel)]="newMealData.customMeal"
              placeholder="Ej: Pasta con tomate"
              class="form-input"
            />
          </div>

          <div *ngIf="addMealTab() === 'recipe'" class="add-meal-form__field">
            <label>Selecciona una receta</label>
            <select [(ngModel)]="newMealData.recipeId" class="form-select">
              <option value="">Seleccionar...</option>
              <option *ngFor="let recipe of availableRecipes()" [value]="recipe.id">
                {{ recipe.name }}
              </option>
            </select>
          </div>

          <div class="add-meal-form__actions">
            <app-button variant="ghost" (onClick)="closeAddMealModal()">Cancelar</app-button>
            <app-button variant="primary" (onClick)="saveMeal()">Guardar</app-button>
          </div>
        </div>
      </app-modal>

      <!-- Goals Modal -->
      <app-modal
        [isOpen]="isGoalsModalOpen()"
        title="Objetivos Nutricionales"
        size="md"
        (onClose)="closeGoalsModal()"
      >
        <div class="goals-form">
          <div class="goals-form__options">
            <button
              *ngFor="let goal of goalOptions"
              type="button"
              [class]="'goal-option' + (selectedGoal() === goal.value ? ' goal-option--selected' : '')"
              (click)="selectGoal(goal.value)"
            >
              <span class="goal-option__icon">{{ goal.icon }}</span>
              <span class="goal-option__label">{{ goal.label }}</span>
            </button>
          </div>

          <div class="goals-form__calories">
            <label>Calorías diarias objetivo</label>
            <input
              type="number"
              [(ngModel)]="targetCalories"
              placeholder="2000"
              class="form-input"
            />
          </div>

          <div class="goals-form__actions">
            <app-button variant="primary" (onClick)="saveGoals()">Guardar</app-button>
          </div>
        </div>
      </app-modal>

      <!-- Generate with AI Modal -->
      <app-modal
        [isOpen]="isGenerateModalOpen()"
        title="🤖 Planificar con IA"
        size="md"
        (onClose)="closeGenerateModal()"
      >
        <div class="generate-form">
          <p class="generate-form__description">
            La IA creará un plan de comidas personalizado para la semana.
          </p>

          <div class="generate-form__field">
            <label>Objetivo</label>
            <select [(ngModel)]="generateOptions.goalType" class="form-select" (change)="onGoalTypeChange()">
              <option *ngFor="let goal of goalOptions" [value]="goal.value">
                {{ goal.icon }} {{ goal.label }}
              </option>
            </select>
          </div>

          <div class="generate-form__field" *ngIf="generateOptions.goalType === 'custom'">
            <label>Describe tu objetivo</label>
            <textarea
              [(ngModel)]="generateOptions.customDescription"
              name="customDescription"
              rows="4"
              placeholder="Ej: Quiero cenas ligeras y sin carne los lunes y miércoles, mucha verdura, poco frito, y algo de pasta o arroz 2 veces por semana. Sin gluten."
              class="form-textarea"
            ></textarea>
            <span class="field-hint">Sé lo más específico/a posible: intolerancias, preferencias, días especiales, recetas favoritas…</span>
          </div>

          <div class="generate-form__field">
            <label>Calorías diarias (opcional)</label>
            <input type="number" [(ngModel)]="generateOptions.calories" placeholder="2000" class="form-input" />
          </div>

          <div class="generate-form__actions">
            <app-button
              variant="primary"
              [loading]="isGenerating()"
              (onClick)="generateWeeklyPlan()"
            >
              🤖 Generar plan
            </app-button>
          </div>
        </div>
      </app-modal>
    </div>
  `,
  styles: [`
    .calendar {
      padding: var(--space-4);
      max-width: 1200px;
      margin: 0 auto;
    }

    @media (min-width: 768px) {
      .calendar { padding: var(--space-6); }
    }

    .calendar__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-6);
      flex-wrap: wrap;
      gap: var(--space-3);
    }

    .calendar__title-section {
      display: flex;
      align-items: baseline;
      gap: var(--space-3);
    }

    .calendar__title {
      font-family: var(--font-display);
      font-size: var(--text-2xl);
      font-weight: var(--font-bold);
    }

    .calendar__week {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    .calendar__actions {
      display: flex;
      gap: var(--space-2);
    }

    .calendar__goals {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }

    .calendar__goal-label {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    .calendar__progress {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: var(--space-4);
      margin-bottom: var(--space-6);
    }

    .progress-item {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-3);
      background: var(--bg-secondary);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-default);
    }

    .progress-item__label {
      font-size: var(--text-xs);
      color: var(--text-secondary);
    }

    .progress-item__value {
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
    }

    /* Weekly Grid */
    .calendar__grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: var(--space-2);
      overflow-x: auto;
      padding-bottom: var(--space-4);
    }

    @media (max-width: 768px) {
      .calendar__grid {
        grid-template-columns: repeat(7, minmax(120px, 1fr));
      }
    }

    .day-column {
      min-width: 120px;
    }

    .day-column--today .day-column__header {
      background: var(--primary-subtle);
      border-color: var(--primary);
    }

    .day-column__header {
      padding: var(--space-2);
      background: var(--bg-secondary);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-default);
      text-align: center;
      margin-bottom: var(--space-2);
    }

    .day-column__name {
      font-size: var(--text-xs);
      font-weight: var(--font-semibold);
      text-transform: uppercase;
      color: var(--text-secondary);
    }

    .day-column__date {
      font-size: var(--text-lg);
      font-weight: var(--font-bold);
    }

    .day-column__meals {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    /* Meal Slot */
    .meal-slot {
      padding: var(--space-2);
      background: var(--bg-secondary);
      border-radius: var(--radius-md);
      border: 1px dashed var(--border-default);
      cursor: pointer;
      transition: var(--transition-fast);
      min-height: 60px;

      &:hover {
        border-color: var(--primary);
        background: var(--primary-subtle);
      }
    }

    .meal-slot--filled {
      border-style: solid;
    }

    .meal-slot__type {
      font-size: 10px;
      color: var(--text-tertiary);
      text-transform: uppercase;
    }

    .meal-slot__content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-1);
    }

    .meal-slot__name {
      font-size: var(--text-xs);
      font-weight: var(--font-medium);
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .meal-slot__actions {
      display: flex;
      gap: 2px;
    }

    .meal-action {
      width: 20px;
      height: 20px;
      border: none;
      background: none;
      cursor: pointer;
      font-size: 12px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .meal-slot__empty {
      font-size: var(--text-xs);
      color: var(--text-tertiary);
    }

    /* Add Meal Form */
    .add-meal-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .add-meal-form__info {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    .add-meal-form__tabs {
      display: flex;
      gap: var(--space-2);
    }

    .tab {
      flex: 1;
      padding: var(--space-2);
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      cursor: pointer;
      font-size: var(--text-sm);
      transition: var(--transition-fast);

      &--active {
        background: var(--primary-subtle);
        border-color: var(--primary);
        color: var(--primary-dark);
      }
    }

    .add-meal-form__field {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);

      label {
        font-size: var(--text-sm);
        font-weight: var(--font-medium);
      }
    }

    .add-meal-form__actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-3);
    }

    /* Goals Form */
    .goals-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
    }

    .goals-form__options {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-2);
    }

    .goal-option {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-3);
      background: var(--bg-tertiary);
      border: 2px solid transparent;
      border-radius: var(--radius-lg);
      cursor: pointer;
      transition: var(--transition-fast);

      &:hover {
        border-color: var(--border-strong);
      }

      &--selected {
        border-color: var(--primary);
        background: var(--primary-subtle);
      }
    }

    .goal-option__icon {
      font-size: var(--text-2xl);
    }

    .goal-option__label {
      font-size: var(--text-xs);
      font-weight: var(--font-medium);
      text-align: center;
    }

    .goals-form__calories {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);

      label {
        font-size: var(--text-sm);
        font-weight: var(--font-medium);
      }
    }

    .goals-form__actions {
      display: flex;
      justify-content: flex-end;
    }

    /* Generate Form */
    .generate-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .generate-form__description {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    .generate-form__field {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);

      label {
        font-size: var(--text-sm);
        font-weight: var(--font-medium);
      }
    }

    .generate-form__actions {
      display: flex;
      justify-content: flex-end;
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

    .form-textarea {
      width: 100%;
      padding: var(--space-3);
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--text-primary);
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      resize: vertical;
      min-height: 100px;
      line-height: 1.5;

      &:focus { outline: none; border-color: var(--primary); }
    }

    .field-hint {
      font-size: var(--text-xs);
      color: var(--text-tertiary);
      margin-top: 4px;
      display: block;
    }
  `]
})
export class CalendarComponent implements OnInit {
  calendarService = inject(CalendarService);
  aiService = inject(AiService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  isAddMealModalOpen = signal(false);
  isGoalsModalOpen = signal(false);
  isGenerateModalOpen = signal(false);
  isGenerating = signal(false);
  availableRecipes = signal<any[]>([]);

  selectedGoal = signal<GoalType | null>(null);
  targetCalories = 2000;
  weeklyCalories = signal(0);
  plannedMeals = signal(0);

  /**
   * Pestañas del modal "Agregar Comida". Igual que en el resto de la web,
   * la pestaña se refleja en la URL (?mealTab=recipe) mientras el modal
   * esta abierto, y se limpia al cerrarlo.
   */
  readonly MEAL_TABS = ['custom', 'recipe'] as const;
  addMealTab = signal<MealTab>('custom');

  newMealData = {
    date: '',
    mealType: 'lunch' as MealType,
    customMeal: '',
    recipeId: ''
  };

  generateOptions = {
    goalType: 'balanced',
    calories: 2000,
    customDescription: ''
  };

  mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

  goalOptions = [
    { value: 'balanced', label: 'Equilibrada', icon: '⚖️' },
    { value: 'weight-loss', label: 'Perder peso', icon: '📉' },
    { value: 'weight-gain', label: 'Ganar peso', icon: '📈' },
    { value: 'muscle-gain', label: 'Ganar músculo', icon: '💪' },
    { value: 'variety', label: 'Variada', icon: '🌈' },
    { value: 'custom', label: 'Personalizada', icon: '✏️' }
  ];

  weekDays = signal<DayMeals[]>([]);
  currentWeekStart = signal(new Date());

  ngOnInit(): void {
    this.calendarService.loadCalendar();
    this.initializeWeek();
  }

  private initializeWeek(): void {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1);
    this.currentWeekStart.set(monday);
    this.generateWeekDays();
  }

  private generateWeekDays(): void {
    const days: DayMeals[] = [];
    const dayNames: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    for (let i = 0; i < 7; i++) {
      const date = new Date(this.currentWeekStart());
      date.setDate(date.getDate() + i);

      days.push({
        day: dayNames[i],
        date: date.toISOString().split('T')[0],
        meals: {
          breakfast: null,
          lunch: null,
          dinner: null,
          snack: null
        }
      });
    }

    this.weekDays.set(days);
  }

  currentWeekLabel(): string {
    const start = this.currentWeekStart();
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${start.toLocaleDateString('es', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('es', { day: 'numeric', month: 'short' })}`;
  }

  previousWeek(): void {
    const current = this.currentWeekStart();
    current.setDate(current.getDate() - 7);
    this.currentWeekStart.set(new Date(current));
    this.generateWeekDays();
  }

  nextWeek(): void {
    const current = this.currentWeekStart();
    current.setDate(current.getDate() + 7);
    this.currentWeekStart.set(new Date(current));
    this.generateWeekDays();
  }

  goToToday(): void {
    this.initializeWeek();
  }

  isToday(dateStr: string): boolean {
    return dateStr === new Date().toISOString().split('T')[0];
  }

  getDayLabel(day: DayOfWeek): string {
    return DAY_OF_WEEK_LABELS[day];
  }

  getMealLabel(type: MealType): string {
    return MEAL_TYPE_LABELS[type];
  }

  getMealIcon(type: MealType): string {
    const icons: Record<MealType, string> = {
      breakfast: '🌅',
      lunch: '☀️',
      dinner: '🌙',
      snack: '🍎'
    };
    return icons[type];
  }

  getGoalLabel(goal: GoalType): string {
    return GOAL_TYPE_LABELS[goal];
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es', { day: 'numeric' });
  }

  getCalorieProgress(): number {
    return Math.min(100, (this.weeklyCalories() / this.targetCalories) * 100);
  }

  getMealProgress(): number {
    return Math.min(100, (this.plannedMeals() / 21) * 100);
  }

  openAddMealModal(date: string, mealType: MealType): void {
    this.newMealData = { date, mealType, customMeal: '', recipeId: '' };
    // Si la URL trae una pestaña valida (?mealTab=recipe) se respeta.
    readTabParam(this.route, MEAL_TAB_PARAM, this.MEAL_TABS, 'custom', tab =>
      this.addMealTab.set(tab)
    );
    this.isAddMealModalOpen.set(true);
  }

  /** Cambia de pestaña y lo deja reflejado en la URL. */
  switchAddMealTab(tab: MealTab): void {
    this.addMealTab.set(tab);
    writeTabParam(this.router, this.route, MEAL_TAB_PARAM, tab, 'custom');
  }

  closeAddMealModal(): void {
    this.isAddMealModalOpen.set(false);
    // El modal ya no esta: la pestaña deja de tener sentido en la URL.
    clearTabParam(this.router, this.route, MEAL_TAB_PARAM);
  }

  saveMeal(): void {
    this.calendarService.addMeal({
      date: this.newMealData.date,
      mealType: this.newMealData.mealType,
      customMeal: this.newMealData.customMeal || undefined,
      recipeId: this.newMealData.recipeId || undefined
    }).subscribe({
      next: () => {
        this.toastService.success('Agregada', 'Comida agregada al calendario');
        this.closeAddMealModal();
      },
      error: () => {
        this.toastService.error('Error', 'No se pudo agregar la comida');
      }
    });
  }

  toggleComplete(meal: any): void {
    this.calendarService.completeMeal(meal.id, !meal.completed);
  }

  deleteMeal(meal: any): void {
    if (confirm('¿Eliminar esta comida?')) {
      this.calendarService.deleteMeal(meal.id);
    }
  }

  openGoalsModal(): void {
    this.isGoalsModalOpen.set(true);
  }

  closeGoalsModal(): void {
    this.isGoalsModalOpen.set(false);
  }

  selectGoal(goal: GoalType | string): void {
    this.selectedGoal.set(goal as GoalType);
  }

  saveGoals(): void {
    this.calendarService.updateGoals({
      type: this.selectedGoal() || 'balanced',
      dailyCalories: this.targetCalories,
      restrictions: []
    });
    this.toastService.success('Guardado', 'Objetivos actualizados');
    this.closeGoalsModal();
  }

  openGenerateModal(): void {
    this.isGenerateModalOpen.set(true);
  }

  closeGenerateModal(): void {
    this.isGenerateModalOpen.set(false);
  }

  onGoalTypeChange(): void {
    if (this.generateOptions.goalType !== 'custom') {
      this.generateOptions.customDescription = '';
    }
  }

  generateWeeklyPlan(): void {
    this.isGenerating.set(true);

    const start = this.currentWeekStart();
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const goals: any = {
      type: this.generateOptions.goalType,
      caloriesTarget: this.generateOptions.calories
    };
    if (this.generateOptions.goalType === 'custom' && this.generateOptions.customDescription.trim()) {
      goals.customInstructions = this.generateOptions.customDescription.trim();
    }

    this.calendarService.generateWithAi({
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      goals
    }).subscribe({
      next: () => {
        this.isGenerating.set(false);
        this.toastService.success('¡Plan generado!', 'Tu semana ha sido planificada');
        this.closeGenerateModal();
        this.calendarService.loadCalendar();
      },
      error: () => {
        this.isGenerating.set(false);
        this.toastService.error('Error', 'No se pudo generar el plan');
      }
    });
  }
}
