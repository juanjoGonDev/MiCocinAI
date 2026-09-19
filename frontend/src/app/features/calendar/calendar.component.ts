import { Component, DestroyRef, computed, effect, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { CalendarService } from '../../core/services/calendar.service';
import { RecipeService } from '../../core/services/recipe.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { TasteProfileService } from '../../core/services/taste-profile.service';
import { GOAL_OPTIONS } from '../../shared/models/taste-profile';
import { ModalComponent } from '../../shared/components/ui/modal/modal.component';
import {
  CalendarDayView,
  CalendarMeal,
  CalendarView,
  CALENDAR_DATE_PARAM,
  CALENDAR_VIEWS,
  CALENDAR_VIEW_LABELS,
  CALENDAR_VIEW_PARAM,
  GOAL_TYPE_LABELS,
  GoalType,
  MealType,
  MEAL_ORDER,
  MEAL_TYPE_META
} from '../../shared/models/calendar.model';
import { clearTabParam, readTabParam, writeTabParam } from '../../core/utils/tab-url';
import {
  addDays,
  addMonths,
  formatNumber,
  labels,
  monthGrid,
  parseISODate,
  startOfDay,
  startOfWeek,
  toISODate,
  weekDays
} from './calendar.util';
import { CalendarMonthComponent } from './calendar-month.component';
import { CalendarWeekComponent } from './calendar-week.component';
import { CalendarDayComponent } from './calendar-day.component';
import { IconComponent } from '../../shared/components/ui/icon/icon.component';
import { PickerComponent, PickerOption } from '../../shared/components/ui/picker/picker.component';
import { CheckboxComponent } from '../../shared/components/ui/checkbox/checkbox.component';
import { CalendarHouseholdEventsComponent } from './calendar-household-events.component';
import { HouseholdService } from '../../core/services/household.service';
import {
  HOUSEHOLD_EVENT_COLORS,
  HOUSEHOLD_EVENT_KINDS,
  HOUSEHOLD_EVENT_META,
  HouseholdEvent,
  HouseholdEventKind,
  eventTimeLabel
} from '../../shared/models/calendar.model';

/** Días por fila de la vista de mes. */
const WEEK_LENGTH = 7;

interface MealDraft {
  id: string | null;
  date: string;
  mealType: MealType;
  customMeal: string;
  recipeId: string;
  time: string;
  servings: number;
  notes: string;
}

const emptyDraft = (date: string, mealType: MealType): MealDraft => ({
  id: null,
  date,
  mealType,
  customMeal: '',
  recipeId: '',
  time: '',
  servings: 1,
  notes: ''
});

/**
 * Calendario de comidas con tres vistas —día, semana y mes— al modo de Google
 * Calendar: cabecera con navegación, conmutador de vistas y una superficie con
 * líneas finas donde cada comida es un bloque de color por franja.
 *
 * Tres cosas mandan en el diseño:
 *  - **Lo que se ve es lo que hay.** La rejilla se deriva de `GET /api/calendar/range`
 *    para el rango visible; antes se pintaban huecos vacíos y las comidas
 *    guardadas no llegaban nunca a la pantalla.
 *  - **La vista y la fecha viajan en la URL** (`?view=month&date=2026-09-16`),
 *    como el resto de pestañas de la app: se puede enlazar, recargar y volver
 *    atrás. `?view=week` y la fecha de hoy se omiten para que `/calendar` siga
 *    siendo limpio.
 *  - **Atajos de teclado** (← →, T, D/S/M) para moverse sin buscar el ratón.
 */
@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    IconComponent,
    PickerComponent,
    CheckboxComponent,
    CalendarHouseholdEventsComponent,
    
    CommonModule,
    FormsModule,
    ModalComponent,
    CalendarMonthComponent,
    CalendarWeekComponent,
    CalendarDayComponent
  ],
  host: {
    '(window:keydown)': 'onKeydown($event)'
  },
  template: `
    <div class="calendar">
      <section class="calendar__panel">
        <!-- ══ Cabecera ══ -->
        <header class="cal-top">
          <div class="cal-top__title">
            <span class="cal-top__eyebrow">Planificación</span>
            <h1 class="calendar__title">{{ periodLabel() }}</h1>
          </div>

          <div class="cal-top__nav">
            <button
              type="button"
              class="cal-icon-btn"
              aria-label="Periodo anterior"
              title="Periodo anterior (←)"
              (click)="shift(-1)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <button type="button" class="cal-pill" title="Ir a hoy (T)" (click)="goToToday()">Hoy</button>
            <button
              type="button"
              class="cal-icon-btn"
              aria-label="Periodo siguiente"
              title="Periodo siguiente (→)"
              (click)="shift(1)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
            </button>

            <label class="cal-jump" title="Ir a una fecha concreta">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 3v2M17 3v2M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
              </svg>
              <input
                type="date"
                [value]="anchorIso()"
                (change)="jumpTo(input.value)"
                #input
                aria-label="Ir a una fecha"
              />
            </label>
          </div>

          <div class="cal-top__right">
            <div class="cal-segment" role="tablist" aria-label="Vista del calendario">
              <button
                *ngFor="let option of viewOptions"
                type="button"
                role="tab"
                class="cal-segment__btn"
                [id]="'cal-view-' + option"
                [attr.aria-selected]="view() === option"
                [class.is-active]="view() === option"
                (click)="setView(option)"
              >
                {{ CALENDAR_VIEW_LABELS[option] }}
              </button>
            </div>

            <button type="button" class="cal-pill" (click)="openGoalsModal()">
              Objetivo<span *ngIf="goalLabel()"> · {{ goalLabel() }}</span>
            </button>
            <button type="button" class="cal-btn cal-btn--primary" (click)="openGenerateModal()">
              Planificar IA
            </button>
            <button type="button" class="cal-pill cal-pill--add" data-test="event-add" (click)="openEventModal()">
              <app-icon name="add" [size]="16" [label]="null" />
              <span>Evento</span>
            </button>
          </div>
        </header>

        <!-- ══ Capas: que se pinta hoy en la rejilla ══ -->
        <div class="cal-layers" role="group" aria-label="Que se muestra en el calendario" data-test="calendar-layers">
          <button
            type="button"
            class="cal-layer"
            [class.is-on]="showMeals()"
            [attr.aria-pressed]="showMeals()"
            data-test="layer-meals"
            (click)="showMeals.set(!showMeals())"
          >
            <span class="cal-layer__dot" style="background: var(--primary)"></span>
            Comidas
          </button>
          @for (kind of eventKinds; track kind) {
            <button
              type="button"
              class="cal-layer"
              [class.is-on]="isKindVisible(kind)"
              [attr.aria-pressed]="isKindVisible(kind)"
              [attr.data-test]="'layer-' + kind"
              (click)="toggleKind(kind)"
            >
              <span class="cal-layer__dot" [style.background]="metaOf(kind).color"></span>
              {{ metaOf(kind).label }}
              @if (countOf(kind) > 0) {
                <span class="cal-layer__count">{{ countOf(kind) }}</span>
              }
            </button>
          }
        </div>

        <!-- ══ Resumen del periodo ══ -->
        <div class="cal-strip">
          <div class="cal-strip__item">
            <span class="cal-strip__label">Comidas</span>
            <span class="cal-strip__value">
              {{ plannedCount() }}<small> / {{ expectedMeals() }}</small>
            </span>
          </div>
          <div class="cal-strip__track" [title]="'Comidas planificadas en ' + periodLabel()">
            <span class="cal-strip__fill" [style.width.%]="plannedPercent()"></span>
          </div>

          <div class="cal-strip__item" *ngIf="hasNutrition()">
            <span class="cal-strip__label">Energía</span>
            <span class="cal-strip__value">
              {{ fmt(calories()) }}<small> / {{ fmt(calendarService.targetCalories()) }} kcal</small>
            </span>
          </div>
          <div class="cal-strip__track" *ngIf="hasNutrition()">
            <span class="cal-strip__fill cal-strip__fill--kcal" [style.width.%]="caloriePercent()"></span>
          </div>

          <span class="cal-strip__done" *ngIf="doneCount() > 0">
            {{ doneCount() }} {{ doneCount() === 1 ? 'hecha' : 'hechas' }}
          </span>

          <span class="cal-strip__spacer"></span>

          <span class="cal-strip__hint" *ngIf="plannedCount() === 0 && !isLoading()">
            Nada planificado en {{ periodShortLabel() }}.
            <button type="button" class="cal-link" (click)="openGenerateModal()">Que lo haga la IA</button>
            <span aria-hidden="true">·</span>
            <button type="button" class="cal-link" (click)="openAddModal(anchorIso(), 'lunch')">
              Empezar por el almuerzo
            </button>
          </span>

          <span class="cal-strip__hint" *ngIf="calendarService.error()">
            {{ calendarService.error() }}
            <button type="button" class="cal-link" (click)="reload()">Reintentar</button>
          </span>
        </div>

        <!-- ══ Rejilla ══ -->
        <div class="cal-body" [class.is-loading]="isLoading()" [attr.aria-busy]="isLoading()">
          <div class="cal-skeleton" *ngIf="showSkeleton()" aria-hidden="true">
            <span *ngFor="let row of [0, 1, 2]"></span>
          </div>

          <ng-container [ngSwitch]="view()" *ngIf="!showSkeleton()">
            <app-calendar-month
              *ngSwitchCase="'month'"
              [days]="days()"
              [anchorIso]="anchorIso()"
              (addMeal)="openAddModal($event.date, $event.mealType)"
              (openMeal)="openEditModal($event)"
              (openDay)="openDayFor($event)"
              (editEvent)="openEventModal(undefined, $event)"
            ></app-calendar-month>

            <app-calendar-week
              *ngSwitchDefault
              [days]="days()"
              (addMeal)="openAddModal($event.date, $event.mealType)"
              (openMeal)="openEditModal($event)"
              (toggleMeal)="toggleMeal($event)"
              (removeMeal)="removeMeal($event)"
              (openDay)="openDayFor($event)"
              (editEvent)="openEventModal(undefined, $event)"
            ></app-calendar-week>

            <app-calendar-day
              *ngSwitchCase="'day'"
              [day]="singleDay()"
              [targetCalories]="calendarService.targetCalories()"
              [goalLabel]="goalLabel()"
              (addMeal)="openAddModal($event.date, $event.mealType)"
              (openMeal)="openEditModal($event)"
              (toggleMeal)="toggleMeal($event)"
              (removeMeal)="removeMeal($event)"
              (editEvent)="openEventModal(undefined, $event)"
            ></app-calendar-day>
          </ng-container>
        </div>

        <!-- ══ Agenda del dia señalado ══ -->
        <section class="cal-agenda" [attr.data-test]="'agenda'" aria-label="Agenda del dia">
          <header class="cal-agenda__head">
            <h3 class="cal-agenda__title">Agenda · {{ anchorLabel() }}</h3>
            <button type="button" class="cal-pill" data-test="agenda-add" (click)="openEventFor(agendaDay())">
              <app-icon name="add" [size]="14" [label]="null" />
              <span>Apuntar</span>
            </button>
          </header>
          @if (agendaDay().events.length) {
            <app-calendar-household-events [events]="agendaDay().events" (edit)="openEventModal(undefined, $event)" />
          } @else {
            <p class="cal-agenda__empty">Nada mas apuntado ese dia.</p>
          }
        </section>
      </section>

      <!-- ══ Suelta de la casa ══ -->
      <app-modal
        [isOpen]="isEventModalOpen()"
        [title]="eventDraft.id ? 'Editar evento' : 'Apuntar un evento'"
        size="md"
        (onClose)="closeEventModal()"
      >
        <div class="meal-form">
          <div class="meal-form__field">
            <label for="event-title">Que es</label>
            <input id="event-title" name="eventTitle" class="cal-input" maxlength="120" [(ngModel)]="eventDraft.title" data-test="event-title" placeholder="Carpinteria: medir el pasillo" />
          </div>

          <div class="meal-form__row">
            <div class="meal-form__field meal-form__field--sm">
              <span class="cal-field-label">Tipo</span>
              <app-picker
                label="Tipo de evento"
                [options]="kindOptions()"
                [value]="eventDraft.kind"
                [filterFrom]="99"
                data-test="event-kind"
                (valueChange)="setEventKind($event)"
              />
            </div>
            <div class="meal-form__field meal-form__field--sm">
              <label for="event-date">Dia</label>
              <input id="event-date" name="eventDate" type="date" class="cal-input" [(ngModel)]="eventDraft.date" />
            </div>
          </div>

          <div class="meal-form__row">
            <app-checkbox
              label="Todo el dia"
              name="eventAllDay"
              [checked]="eventDraft.allDay"
              (checkedChange)="setAllDay($event)"
            />
            @if (!eventDraft.allDay) {
              <div class="meal-form__field meal-form__field--sm">
                <label for="event-start">Desde</label>
                <input id="event-start" name="eventStart" type="time" class="cal-input" [(ngModel)]="eventDraft.startTime" />
              </div>
              <div class="meal-form__field meal-form__field--sm">
                <label for="event-end">Hasta</label>
                <input id="event-end" name="eventEnd" type="time" class="cal-input" [(ngModel)]="eventDraft.endTime" />
              </div>
            }
          </div>

          <div class="meal-form__field">
            <label>Color</label>
            <div class="cal-swatches" role="group" aria-label="Color del evento">
              @for (color of eventColors; track color) {
                <button
                  type="button"
                  class="cal-swatch"
                  [class.is-active]="(eventDraft.color ?? metaOf(eventDraft.kind).color) === color"
                  [style.background]="color"
                  [attr.aria-label]="'Color ' + color"
                  (click)="eventDraft.color = color; eventDraft.colorTouched = true"
                ></button>
              }
            </div>
          </div>

          <div class="meal-form__field">
            <label for="event-place">Sitio (opcional)</label>
            <input id="event-place" name="eventPlace" class="cal-input" maxlength="120" [(ngModel)]="eventDraft.location" placeholder="Tienda de la calle Acera" />
          </div>

          <div class="meal-form__field">
            <label for="event-notes">Notas (opcional)</label>
            <textarea id="event-notes" name="eventNotes" class="cal-input" rows="2" maxlength="500" [(ngModel)]="eventDraft.notes"></textarea>
          </div>

          @if (hasHousehold()) {
            <app-checkbox
              label="Que lo vea mi casa"
              name="eventShared"
              [checked]="eventDraft.sharedWithHousehold"
              (checkedChange)="eventDraft.sharedWithHousehold = $event"
            />
          }
          <p class="cal-note" *ngIf="calendarService.eventsError()" role="alert">{{ calendarService.eventsError() }}</p>

          <div class="meal-form__actions">
            @if (eventDraft.id) {
              <button type="button" class="cal-btn cal-btn--ghost cal-btn--danger" (click)="removeEvent()">Borrar</button>
            }
            <span class="meal-form__grow"></span>
            <button type="button" class="cal-btn cal-btn--ghost" (click)="closeEventModal()">Cancelar</button>
            <button
              type="button"
              class="cal-btn cal-btn--primary"
              data-test="event-save"
              [disabled]="!eventDraft.title.trim() || calendarService.creatingEvent()"
              (click)="saveEvent()"
            >
              {{ calendarService.creatingEvent() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </div>
      </app-modal>

      <!-- ══ Añadir / editar comida ══ -->
      <app-modal
        [isOpen]="isMealModalOpen()"
        [title]="draft.id ? 'Editar Comida' : 'Agregar Comida'"
        size="md"
        (onClose)="closeMealModal()"
      >
        <div class="meal-form">
          <div class="meal-form__when">
            <span class="meal-form__band" [attr.data-meal]="draft.mealType" aria-hidden="true"></span>
            <strong>{{ MEAL_TYPE_META[draft.mealType].label }}</strong>
            <span class="meal-form__date">{{ draftDateLabel() }}</span>
            <div class="meal-form__tabs" role="tablist" aria-label="Origen de la comida">
              <button
                type="button"
                role="tab"
                [class.tab]="true"
                [class.tab--active]="mealTab() === 'custom'"
                [attr.aria-selected]="mealTab() === 'custom'"
                (click)="switchAddMealTab('custom')"
              >
                Escribir
              </button>
              <button
                type="button"
                role="tab"
                [class.tab]="true"
                [class.tab--active]="mealTab() === 'recipe'"
                [attr.aria-selected]="mealTab() === 'recipe'"
                (click)="switchAddMealTab('recipe')"
              >
                Receta
              </button>
            </div>
          </div>

          <div class="meal-form__field" *ngIf="mealTab() === 'custom'">
            <label for="meal-custom">¿Qué vas a comer?</label>
            <input
              id="meal-custom"
              type="text"
              maxlength="200"
              [(ngModel)]="draft.customMeal"
              placeholder="Ej: Pasta con tomate y albahaca"
              class="cal-input"
            />
          </div>

          <div class="meal-form__field" *ngIf="mealTab() === 'recipe'">
            <label for="meal-recipe">Selecciona una receta</label>
            <select id="meal-recipe" [(ngModel)]="draft.recipeId" class="cal-input">
              <option value="">Seleccionar…</option>
              <option *ngFor="let recipe of recipeService.recipes()" [value]="recipe.id">
                {{ recipe.name }}{{ recipe.calories ? ' · ' + recipe.calories + ' kcal' : '' }}
              </option>
            </select>
            <span class="cal-hint" *ngIf="recipeService.recipes().length === 0">
              Todavía no hay recetas en tu recetario.
            </span>
          </div>

          <div class="meal-form__row">
            <div class="meal-form__field meal-form__field--sm">
              <label for="meal-time">Hora (opcional)</label>
              <input id="meal-time" type="time" [(ngModel)]="draft.time" class="cal-input" />
            </div>
            <div class="meal-form__field meal-form__field--sm">
              <label for="meal-servings">Raciones</label>
              <input
                id="meal-servings"
                type="number"
                min="1"
                max="12"
                [(ngModel)]="draft.servings"
                class="cal-input"
              />
            </div>
          </div>

          <div class="meal-form__field">
            <label for="meal-notes">Notas (opcional)</label>
            <textarea
              id="meal-notes"
              rows="2"
              maxlength="500"
              [(ngModel)]="draft.notes"
              placeholder="Ej: sobras del día anterior, sin gluten…"
              class="cal-input cal-input--area"
            ></textarea>
          </div>

          <div class="meal-form__actions">
            <button
              *ngIf="draft.id"
              type="button"
              class="cal-btn cal-btn--danger"
              (click)="removeMealById(draft.id)"
            >
              Eliminar
            </button>
            <span class="meal-form__grow"></span>
            <button type="button" class="cal-btn" (click)="closeMealModal()">Cancelar</button>
            <button
              type="button"
              class="cal-btn cal-btn--primary"
              [disabled]="!draftValid()"
              (click)="saveMeal()"
            >
              {{ draft.id ? 'Guardar cambios' : 'Añadir' }}
            </button>
          </div>
        </div>
      </app-modal>

      <!-- ══ Objetivos ══ -->
      <app-modal
        [isOpen]="isGoalsModalOpen()"
        title="Objetivos Nutricionales"
        size="md"
        (onClose)="closeGoalsModal()"
      >
        <div class="goals-form">
          <p class="cal-muted">
            Sirven de punto de partida al planificar con IA. El objetivo fino de alergias y
            gustos se edita en Preferencias.
          </p>
          <div class="goals-form__options">
            <button
              *ngFor="let goal of goalOptions"
              type="button"
              class="goal-option"
              [class.goal-option--selected]="goalsDraft.type === goal.value"
              [attr.aria-pressed]="goalsDraft.type === goal.value"
              (click)="goalsDraft.type = goal.value"
            >
              <span class="goal-option__icon" aria-hidden="true">{{ goal.icon }}</span>
              <span class="goal-option__label">{{ goal.label }}</span>
            </button>
          </div>

          <div class="meal-form__field meal-form__field--sm">
            <label for="goals-calories">Calorías diarias objetivo</label>
            <input
              id="goals-calories"
              type="number"
              min="800"
              max="6000"
              step="50"
              [(ngModel)]="goalsDraft.dailyCalories"
              class="cal-input"
            />
          </div>

          <div class="meal-form__actions">
            <span class="meal-form__grow"></span>
            <button type="button" class="cal-btn" (click)="closeGoalsModal()">Cancelar</button>
            <button type="button" class="cal-btn cal-btn--primary" (click)="saveGoals()">Guardar</button>
          </div>
        </div>
      </app-modal>

      <!-- ══ Planificar con IA ══ -->
      <app-modal
        [isOpen]="isGenerateModalOpen()"
        title="Planificar con IA"
        size="md"
        (onClose)="closeGenerateModal()"
      >
        <div class="generate-form">
          <p class="cal-muted">
            La IA prepara la <strong>{{ planWeekLabel() }}</strong>. Rellena los huecos: lo que ya
            tengas puesto ese día y a esa hora se queda como está.
          </p>

          <div class="meal-form__field">
            <label for="gen-goal">Objetivo</label>
            <select id="gen-goal" [(ngModel)]="generateOptions.goalType" class="cal-input" (change)="onGoalTypeChange()">
              <option *ngFor="let goal of goalOptions" [value]="goal.value">
                {{ goal.label }}
              </option>
            </select>
          </div>

          <div class="meal-form__field" *ngIf="generateOptions.goalType === 'custom'">
            <label for="gen-custom">Describe tu objetivo</label>
            <textarea
              id="gen-custom"
              name="customDescription"
              rows="4"
              [(ngModel)]="generateOptions.customDescription"
              placeholder="Ej: cenas ligeras y sin carne los lunes y miércoles, mucha verdura, poco frito y algo de pasta o arroz dos veces por semana. Sin gluten."
              class="cal-input cal-input--area"
            ></textarea>
            <span class="cal-hint">
              Cuanto más concreto, mejor: intolerancias, horarios, recetas que te gusten…
            </span>
          </div>

          <div class="meal-form__field meal-form__field--sm">
            <label for="gen-calories">Calorías diarias (opcional)</label>
            <input
              id="gen-calories"
              type="number"
              min="800"
              max="6000"
              step="50"
              [(ngModel)]="generateOptions.calories"
              class="cal-input"
            />
          </div>

          <div class="meal-form__actions">
            <span class="meal-form__grow"></span>
            <button type="button" class="cal-btn" (click)="closeGenerateModal()">Cancelar</button>
            <button
              type="button"
              class="cal-btn cal-btn--primary"
              [disabled]="isGenerating()"
              (click)="generateWeeklyPlan()"
            >
              <span class="cal-spinner" *ngIf="isGenerating()" aria-hidden="true"></span>
              {{ isGenerating() ? 'Planificando…' : 'Generar plan' }}
            </button>
          </div>
        </div>
      </app-modal>
    </div>
  `,
  styles: [`
    .cal-pill--add {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .cal-layers {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      padding: 6px 0 0;
    }
    .cal-layer {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-full);
      background: transparent;
      color: var(--text-tertiary);
      font-family: inherit;
      font-size: var(--text-xs);
      padding: 4px 10px;
      min-height: 30px;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    .cal-layer.is-on {
      color: var(--text-primary);
      background: var(--bg-tertiary);
      border-color: var(--border-strong);
    }
    .cal-layer__dot {
      width: 8px;
      height: 8px;
      border-radius: var(--radius-full);
      opacity: 0.4;
    }
    .cal-layer.is-on .cal-layer__dot {
      opacity: 1;
    }
    .cal-layer__count {
      font-variant-numeric: tabular-nums;
      color: var(--text-tertiary);
    }
    .cal-swatches {
      display: flex;
      gap: 6px;
    }
    .cal-swatch {
      width: 22px;
      height: 22px;
      border-radius: var(--radius-full);
      border: 2px solid transparent;
      cursor: pointer;
      padding: 0;
    }
    .cal-swatch.is-active {
      border-color: var(--text-primary);
    }
    .cal-check {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: var(--text-sm);
      color: var(--text-secondary);
      cursor: pointer;
    }
    .cal-note {
      margin: 0;
      font-size: var(--text-xs);
      color: var(--error);
    }
    .cal-evt {
      display: flex;
      align-items: center;
      gap: 4px;
      width: 100%;
      border: none;
      border-left: 3px solid var(--event-color, var(--primary));
      border-radius: 4px;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      font-family: inherit;
      font-size: 11px;
      line-height: 1.25;
      text-align: left;
      padding: 2px 4px;
      cursor: pointer;
      overflow: hidden;
    }
    .cal-evt__when {
      color: var(--text-tertiary);
      font-variant-numeric: tabular-nums;
    }
    .cal-evt__who {
      margin-left: auto;
      font-size: 9px;
      color: var(--text-tertiary);
      text-transform: uppercase;
    }
    :host {
      --cal-line: var(--border-default);
    }

    .calendar {
      padding: var(--space-3) var(--space-4) var(--space-8);
      max-width: 1280px;
      margin: 0 auto;
    }

    @media (min-width: 768px) {
      .calendar { padding: var(--space-4) var(--space-6) var(--space-10); }
    }

    /* Una sola superficie con líneas finas: el aspecto de un calendario real,
       en vez de siete tarjetas sueltas. */
    .calendar__panel {
      display: grid;
      background: var(--bg-secondary);
      border: 1px solid var(--cal-line);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
    }

    /* ── Cabecera ── */
    .cal-top {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--space-3) var(--space-4);
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--cal-line);
    }

    .cal-top__title {
      display: flex;
      flex-direction: column;
      gap: 1px;
      margin-right: auto;
      min-width: 0;
    }

    .cal-top__eyebrow {
      font-size: 10px;
      font-weight: var(--font-semibold);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-tertiary);
    }

    .calendar__title {
      font-family: var(--font-display);
      font-size: var(--text-xl);
      font-weight: var(--font-semibold);
      letter-spacing: -0.01em;
      line-height: 1.2;
      color: var(--text-primary);
    }

    .cal-top__nav,
    .cal-top__right {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    .cal-top__right {
      gap: var(--space-2);
    }

    @media (min-width: 1100px) {
      .cal-top__title { margin-right: var(--space-6); }
    }

    .cal-icon-btn {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      padding: 0;
      color: var(--text-secondary);
      background: none;
      border: 1px solid transparent;
      border-radius: var(--radius-full);
      cursor: pointer;
      transition: var(--transition-fast);
    }

    .cal-icon-btn svg {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.75;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .cal-icon-btn:hover {
      color: var(--text-primary);
      background: var(--bg-tertiary);
    }

    .cal-pill {
      padding: 5px 11px;
      font: inherit;
      font-size: var(--text-xs);
      font-weight: var(--font-medium);
      color: var(--text-secondary);
      background: var(--bg-secondary);
      border: 1px solid var(--cal-line);
      border-radius: var(--radius-full);
      cursor: pointer;
      transition: var(--transition-fast);
      white-space: nowrap;
    }

    .cal-pill:hover {
      color: var(--text-primary);
      border-color: var(--border-strong);
      background: var(--bg-tertiary);
    }

    /* Selector de fecha nativo, disfrazado de botón de icono. */
    .cal-jump {
      position: relative;
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      color: var(--text-secondary);
      border: 1px solid transparent;
      border-radius: var(--radius-full);
      cursor: pointer;
      transition: var(--transition-fast);
    }

    .cal-jump:hover {
      color: var(--text-primary);
      background: var(--bg-tertiary);
    }

    .cal-jump svg {
      width: 15px;
      height: 15px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.6;
      stroke-linecap: round;
    }

    .cal-jump input {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
      font: inherit;
    }

    /* Conmutador de vistas: segmentado, como el Day/Week/Month de Google. */
    .cal-segment {
      display: inline-flex;
      padding: 2px;
      background: var(--bg-tertiary);
      border: 1px solid var(--cal-line);
      border-radius: var(--radius-full);
    }

    .cal-segment__btn {
      padding: 4px 12px;
      font: inherit;
      font-size: var(--text-xs);
      font-weight: var(--font-medium);
      color: var(--text-secondary);
      background: none;
      border: none;
      border-radius: var(--radius-full);
      cursor: pointer;
      transition: var(--transition-fast);
    }

    .cal-segment__btn:hover {
      color: var(--text-primary);
    }

    .cal-segment__btn.is-active {
      color: var(--text-primary);
      background: var(--bg-secondary);
      box-shadow: var(--shadow-xs);
    }

    .cal-segment__btn:focus-visible,
    .cal-pill:focus-visible,
    .cal-icon-btn:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }

    /* ── Botones ── */
    .cal-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      padding: 6px 14px;
      font: inherit;
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      color: var(--text-secondary);
      background: var(--bg-secondary);
      border: 1px solid var(--cal-line);
      border-radius: var(--radius-full);
      cursor: pointer;
      transition: var(--transition-fast);
    }

    .cal-btn:hover:not(:disabled) {
      color: var(--text-primary);
      border-color: var(--border-strong);
    }

    .cal-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .cal-btn--primary {
      color: var(--text-inverse);
      background: var(--primary);
      border-color: var(--primary);
      box-shadow: var(--shadow-xs);
    }

    .cal-btn--primary:hover:not(:disabled) {
      color: var(--text-inverse);
      background: var(--primary-dark);
      border-color: var(--primary-dark);
    }

    .cal-btn--danger {
      color: var(--error);
      border-color: color-mix(in srgb, var(--error) 35%, var(--cal-line));
    }

    .cal-btn--danger:hover:not(:disabled) {
      color: var(--error);
      background: var(--error-subtle);
      border-color: var(--error);
    }

    .cal-spinner {
      width: 12px;
      height: 12px;
      border: 2px solid color-mix(in srgb, var(--text-inverse) 40%, transparent);
      border-top-color: var(--text-inverse);
      border-radius: 50%;
      animation: cal-spin 0.7s linear infinite;
    }

    @keyframes cal-spin {
      to { transform: rotate(360deg); }
    }

    /* ── Tira de resumen ── */
    .cal-strip {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-3);
      padding: 7px var(--space-4);
      background: color-mix(in srgb, var(--bg-tertiary) 45%, var(--bg-secondary));
      border-bottom: 1px solid var(--cal-line);
      font-size: var(--text-xs);
    }

    .cal-strip__item {
      display: flex;
      align-items: baseline;
      gap: 5px;
      white-space: nowrap;
    }

    .cal-strip__label {
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-size: 9px;
      font-weight: var(--font-semibold);
    }

    .cal-strip__value {
      font-weight: var(--font-semibold);
      font-variant-numeric: tabular-nums;
      color: var(--text-primary);
    }

    .cal-strip__value small {
      font-weight: var(--font-normal);
      color: var(--text-secondary);
    }

    .cal-strip__track {
      flex: 0 1 110px;
      height: 3px;
      min-width: 46px;
      background: var(--border-default);
      border-radius: var(--radius-full);
      overflow: hidden;
    }

    .cal-strip__fill {
      display: block;
      height: 100%;
      background: var(--primary);
      border-radius: inherit;
      transition: width var(--duration-300) var(--ease-out);
    }

    .cal-strip__fill--kcal {
      background: var(--secondary);
    }

    .cal-strip__done {
      padding: 1px 8px;
      color: var(--secondary-dark);
      background: color-mix(in srgb, var(--secondary) 12%, var(--bg-secondary));
      border-radius: var(--radius-full);
      font-variant-numeric: tabular-nums;
    }

    .cal-strip__spacer {
      flex: 1 1 auto;
    }

    .cal-strip__hint {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--text-secondary);
      flex-wrap: wrap;
    }

    .cal-link {
      padding: 0;
      font: inherit;
      font-weight: var(--font-medium);
      color: var(--primary-dark);
      background: none;
      border: none;
      border-bottom: 1px solid color-mix(in srgb, var(--primary) 40%, transparent);
      cursor: pointer;
    }

    .cal-link:hover {
      border-bottom-color: var(--primary);
    }

    /* ── Cuerpo ── */
    .cal-body {
      position: relative;
      min-height: 260px;
    }

    .cal-body.is-loading::after {
      content: '';
      position: absolute;
      inset: 0 0 auto 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--primary), transparent);
      background-size: 220px 100%;
      animation: cal-sweep 1.1s var(--ease-in-out) infinite;
    }

    @keyframes cal-sweep {
      from { transform: translateX(-220px); }
      to { transform: translateX(100%); }
    }

    /* Primera carga (sin dato previo que mantener en pantalla). */
    .cal-skeleton {
      display: grid;
      gap: 1px;
      padding: var(--space-4);
    }

    .cal-skeleton span {
      height: 86px;
      border-radius: var(--radius-md);
      background: linear-gradient(
        90deg,
        var(--bg-tertiary) 0%,
        color-mix(in srgb, var(--bg-tertiary) 55%, var(--bg-secondary)) 50%,
        var(--bg-tertiary) 100%
      );
      background-size: 420px 100%;
      animation: cal-shimmer 1.3s var(--ease-in-out) infinite;
    }

    @keyframes cal-shimmer {
      from { background-position: -160px 0; }
      to { background-position: 420px 0; }
    }

    /* ── Formularios de los diálogos ── */
    .meal-form,
    .goals-form,
    .generate-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .meal-form__when {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--space-2);
      padding-bottom: var(--space-3);
      border-bottom: 1px solid var(--cal-line);
      font-size: var(--text-sm);
    }

    .meal-form__band {
      width: 3px;
      height: 15px;
      border-radius: var(--radius-full);
      background: var(--primary);
    }

    .meal-form__band[data-meal='breakfast'] { background: var(--warning); }
    .meal-form__band[data-meal='dinner'] { background: var(--info); }
    .meal-form__band[data-meal='snack'] { background: var(--secondary); }

    .meal-form__date {
      color: var(--text-secondary);
      font-size: var(--text-xs);
    }

    .meal-form__tabs {
      display: flex;
      gap: var(--space-1);
      margin-left: auto;
      padding: 2px;
      background: var(--bg-tertiary);
      border: 1px solid var(--cal-line);
      border-radius: var(--radius-full);
    }

    .meal-form__field {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 0;
    }

    .meal-form__field > label {
      font-size: var(--text-xs);
      font-weight: var(--font-medium);
      color: var(--text-secondary);
    }

    .meal-form__field--sm {
      max-width: 220px;
    }

    .meal-form__row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-4);
    }

    .meal-form__actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding-top: var(--space-1);
    }

    .meal-form__grow {
      flex: 1 1 auto;
    }

    .tab {
      padding: 4px 12px;
      font: inherit;
      font-size: var(--text-xs);
      color: var(--text-secondary);
      background: none;
      border: none;
      border-radius: var(--radius-full);
      cursor: pointer;
      transition: var(--transition-fast);
    }

    .tab--active {
      color: var(--text-primary);
      background: var(--bg-secondary);
      box-shadow: var(--shadow-xs);
    }

    .cal-input {
      width: 100%;
      padding: var(--space-2) var(--space-3);
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--text-primary);
      background: var(--bg-secondary);
      border: 1px solid var(--cal-line);
      border-radius: var(--radius-md);
      transition: var(--transition-fast);
    }

    .cal-input:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 14%, transparent);
    }

    .cal-input--area {
      resize: vertical;
      min-height: 62px;
      line-height: 1.5;
    }

    .cal-hint {
      font-size: var(--text-xs);
      color: var(--text-tertiary);
    }

    .cal-muted {
      margin: 0;
      font-size: var(--text-sm);
      line-height: 1.5;
      color: var(--text-secondary);
    }

    .goals-form__options {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--space-2);
    }

    .goal-option {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      font: inherit;
      text-align: left;
      color: var(--text-primary);
      background: var(--bg-secondary);
      border: 1px solid var(--cal-line);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: var(--transition-fast);
    }

    .goal-option:hover {
      border-color: var(--border-strong);
      background: var(--bg-tertiary);
    }

    .goal-option--selected {
      border-color: var(--primary);
      background: color-mix(in srgb, var(--primary) 8%, var(--bg-secondary));
    }

    .goal-option__icon {
      font-size: var(--text-lg);
      line-height: 1;
    }

    .goal-option__label {
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
    }

    /* Cabecera pegajosa en semanas largas, como en Google. */
    @media (min-width: 1024px) {
      .cal-body {
        max-height: min(72vh, 720px);
        overflow: auto;
      }
    }
  `]
})
export class CalendarComponent implements OnInit {
  calendarService = inject(CalendarService);
  recipeService = inject(RecipeService);

  private readonly tasteService = inject(TasteProfileService);
  private readonly toastService = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly householdService = inject(HouseholdService);

  readonly viewOptions = CALENDAR_VIEWS;
  readonly CALENDAR_VIEW_LABELS = CALENDAR_VIEW_LABELS;
  readonly MEAL_TYPE_META = MEAL_TYPE_META;
  readonly mealTypes = MEAL_ORDER;
  /**
   * Miles al estilo `es-ES` («1.450 kcal»). El pipe `number` de Angular sigue el
   * LOCALE_ID del módulo (en-US aquí) y saldría «1,450», fuera del resto de
   * etiquetas en español, así que se formatea a mano.
   */
  readonly fmt = formatNumber;

  /** Vista activa. `week` es la por defecto y es la única que no sale en la URL. */
  readonly view = signal<CalendarView>('week');
  /** Día de referencia: ancla la semana, el mes o el día que se ve. */
  readonly anchor = signal<Date>(startOfDay(new Date()));

  readonly isMealModalOpen = signal(false);
  readonly isGoalsModalOpen = signal(false);
  readonly isGenerateModalOpen = signal(false);
  readonly isGenerating = signal(false);
  /** Pestaña del modal de comida: `?mealTab=recipe` mientras está abierto. */
  readonly mealTab = signal<'custom' | 'recipe'>('custom');
  readonly selectedGoal = signal<GoalType | null>(null);

  draft: MealDraft = emptyDraft(toISODate(new Date()), 'lunch');
  goalsDraft = { type: 'balanced' as GoalType | string, dailyCalories: 2000 };
  generateOptions = { goalType: 'balanced', calories: 2000, customDescription: '' };
  readonly goalOptions = GOAL_OPTIONS;

  /** Días que se pinta cada vista, con sus comidas ya repartidas por franja. */
  readonly days = computed<CalendarDayView[]>(() => {
    const view = this.view();
    const anchor = this.anchor();
    const dates =
      view === 'month' ? monthGrid(anchor) : view === 'week' ? weekDays(anchor) : [startOfDay(anchor)];
    const byDate = this.calendarService.mealsByDate();
    const monthAnchor = anchor;

    return dates.map((date) => {
      const iso = toISODate(date);
      // Apagar la capa de comidas no es esconder CSS: es no darles nada que pintar, y
      // asi las tres vistas (mes, semana, dia) se comportan igual sin tocarlas.
      const meals = this.showMeals() ? byDate.get(iso) ?? [] : [];
      const slots = { breakfast: [], lunch: [], dinner: [], snack: [] } as Record<MealType, CalendarMeal[]>;
      let calories = 0;
      let hasNutrition = false;
      let done = 0;

      for (const meal of meals) {
        slots[meal.mealType].push(meal);
        if (meal.calories) {
          hasNutrition = true;
          calories += meal.calories * (meal.servings || 1);
        }
        if (meal.completed) done++;
      }

      return {
        date,
        iso,
        inCurrentMonth: view !== 'month' ? true : date.getMonth() === monthAnchor.getMonth() && date.getFullYear() === monthAnchor.getFullYear(),
        isToday: isSameDayAsToday(date),
        meals,
        slots,
        calories: Math.round(calories),
        hasNutrition,
        planned: meals.length,
        done,
        events: this.calendarService.visibleEventsOn(iso)
      };
    });
  });

  readonly singleDay = computed<CalendarDayView | null>(() => this.days()[0] ?? null);

  /** Rango que hay que pedir: cubre la rejilla entera, no solo el mes. */
  /**
   * El rango visible se calcula sobre el ancla y la vista, NUNCA sobre `days()`.
   *
   * No es una preferencia estetica: `days()` incluye los eventos de casa leidos, y un
   * `effect` que pide el rango y escribe los eventos se re-ejecutaba a si mismo —cada
   * respuesta dejaba el rango "nuevo" (otra tupla) y el navegador disparaba otra peticion
   * hasta que el limitador del server cortaba la corriente (429, «demasiadas peticiones»).
   * El rango depende de lo que se mira, no de lo que se ha cargado.
   */
  readonly visibleRange = computed<[string, string]>(() => {
    const anchor = this.anchor();
    const view = this.view();
    if (view === 'month') {
      const grid = monthGrid(anchor);
      return [toISODate(grid[0]), toISODate(grid[grid.length - 1])];
    }
    if (view === 'week') {
      const days = weekDays(anchor);
      return [toISODate(days[0]), toISODate(days[days.length - 1])];
    }
    const iso = toISODate(startOfDay(anchor));
    return [iso, iso];
  });

  /**
   * Días que entran en las cuentas del resumen. En la vista de mes la rejilla
   * completa tiene días del mes anterior y del siguiente: contarlos hincharía el
   * denominador («4 / 168 comidas») y el progreso no cuadraría con lo que se ve.
   */
  readonly countedDays = computed(() => {
    const days = this.days();
    return this.view() === 'month' ? days.filter((day) => day.inCurrentMonth) : days;
  });

  readonly plannedCount = computed(() => sum(this.countedDays(), 'planned'));
  readonly doneCount = computed(() => sum(this.countedDays(), 'done'));
  readonly calories = computed(() => sum(this.countedDays(), 'calories'));
  readonly hasNutrition = computed(() => this.countedDays().some((day) => day.hasNutrition));

  /** Cuatro franjas por día del periodo que se está mirando. */
  readonly expectedMeals = computed(() => this.countedDays().length * MEAL_ORDER.length);

  constructor() {
    // Convención de la app: lo que se ve, en la URL. Aquí son dos cosas —la vista
    // y el día ancla—, así que se leen juntas y se escriben en UNA sola
    // navegacion: dos `router.navigate` seguidos en el mismo tick cancelan el
    // primero y el resultado es un `?view=` que desaparece a media prueba.
    readTabParam<CalendarView>(this.route, CALENDAR_VIEW_PARAM, CALENDAR_VIEWS, 'week', (value) =>
      this.view.set(value)
    );
    const fromUrl = parseISODate(this.route.snapshot.queryParamMap.get(CALENDAR_DATE_PARAM));
    if (fromUrl) this.anchor.set(fromUrl);

    effect(() => this.writeViewInUrl());

    // Cambiar de vista o de fecha => se pide exactamente el rango visible.
    effect(() => {
      const [start, end] = this.visibleRange();
      this.calendarService.loadRange(start, end);
      this.calendarService.loadHouseholdEvents(start, end);
      // Fin del bucle: si el efecto volviera a encadenarse, el guardado por ventana en el
      // servicio corta el gasto —una sola peticion por rango visible, siempre.
    });
  }

  /**
   * `?view=…&date=…`, omitiendo lo que ya es el valor por defecto (semana de
   * hoy) para que `/calendar` siga siendo la URL limpia. Un `view=bogus` se
   * descarta al leer, y aquí se limpia de la URL.
   */
  private writeViewInUrl(): void {
    const view = this.view();
    const iso = toISODate(this.anchor());
    const isToday = iso === toISODate(startOfDay(new Date()));

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        [CALENDAR_VIEW_PARAM]: view === 'week' ? null : view,
        [CALENDAR_DATE_PARAM]: isToday ? null : iso
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  ngOnInit(): void {
    this.readLayersFromUrl();
    // El recetario alimenta la pestaña «Receta» del modal (antes estaba vacío).
    this.recipeService.loadRecipes();
    this.tasteService.ensureLoaded();
  }

  /* ─────────────────────────── Etiquetas ─────────────────────────── */

  periodLabel(): string {
    const anchor = this.anchor();
    switch (this.view()) {
      case 'month':
        return labels.month(anchor);
      case 'day':
        return labels.longDay(anchor);
      default: {
        const days = this.days();
        return labels.weekRange(days[0]?.date ?? anchor, days[days.length - 1]?.date ?? anchor);
      }
    }
  }

  /** Para el texto del hueco, donde «14 – 20 de septiembre» es demasiado largo. */
  periodShortLabel(): string {
    switch (this.view()) {
      case 'month':
        return labels.month(this.anchor());
      case 'day':
        return 'este día';
      default:
        return 'esta semana';
    }
  }

  anchorIso(): string {
    return toISODate(this.anchor());
  }

  draftDateLabel(): string {
    const date = parseISODate(this.draft.date);
    return date ? labels.fullDate(date) : this.draft.date;
  }

  /** La semana que se va a planificar, no la que se esté viendo. */
  planWeekLabel(): string {
    const start = startOfWeek(this.anchor());
    return labels.weekRange(start, addDays(start, 6));
  }

  goalLabel(): string {
    const type = this.selectedGoal() ?? this.calendarService.goalType();
    return type ? (GOAL_TYPE_LABELS[type] ?? type) : '';
  }

  plannedPercent(): number {
    const expected = this.expectedMeals();
    return expected ? Math.min(100, (this.plannedCount() / expected) * 100) : 0;
  }

  caloriePercent(): number {
    const target = this.calendarService.targetCalories();
    return target ? Math.min(100, (this.calories() / target) * 100) : 0;
  }

  isLoading(): boolean {
    return this.calendarService.isLoading();
  }

  /** La primera vez no hay nada que enseñar: esqueleto. Después, barra fina. */
  showSkeleton(): boolean {
    return this.isLoading() && this.calendarService.meals().length === 0 && !this.calendarService.error();
  }

  reload(): void {
    const [start, end] = this.visibleRange();
    this.calendarService.loadRange(start, end, true);
    // Forzada: `reload` es literalmente "vuelve a pedir lo mismo".
    this.calendarService.loadHouseholdEvents(start, end, true);
  }

  /* ─────────────────────── Navegación de periodos ─────────────────────── */

  setView(view: CalendarView): void {
    this.view.set(view);
  }

  shift(direction: 1 | -1): void {
    const anchor = this.anchor();
    const next =
      this.view() === 'month'
        ? addMonths(anchor, direction)
        : this.view() === 'week'
          ? addDays(anchor, direction * WEEK_LENGTH)
          : addDays(anchor, direction);
    this.anchor.set(next);
  }

  goToToday(): void {
    this.anchor.set(startOfDay(new Date()));
  }

  jumpTo(iso: string): void {
    const date = parseISODate(iso);
    if (date) this.anchor.set(date);
  }

  /** Ver el día: desde el número de la celda o desde «+N más». */
  openDayFor(iso: string): void {
    const date = parseISODate(iso);
    if (date) this.anchor.set(date);
    this.view.set('day');
  }

  /* ─────────────────────────── Teclado ─────────────────────────── */

  /** ← → periodos · T hoy · D/S/M vistas (como en Google Calendar). */
  onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (this.isMealModalOpen() || this.isGoalsModalOpen() || this.isGenerateModalOpen()) return;

    const target = event.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
    }

    switch (event.key) {
      case 'ArrowLeft':
        this.shift(-1);
        break;
      case 'ArrowRight':
        this.shift(1);
        break;
      case 't':
      case 'T':
        this.goToToday();
        break;
      case 'd':
      case 'D':
        this.setView('day');
        break;
      case 's':
      case 'S':
        this.setView('week');
        break;
      case 'm':
      case 'M':
        this.setView('month');
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  /* ──────────────────────── Añadir / editar ──────────────────────── */

  openAddModal(date: string, mealType: MealType): void {
    this.draft = emptyDraft(date, mealType);
    // Si la URL trae una pestaña válida (?mealTab=recipe) se respeta.
    readTabParam(this.route, 'mealTab', ['custom', 'recipe'] as const, 'custom', (tab) =>
      this.mealTab.set(tab)
    );
    this.isMealModalOpen.set(true);
  }

  openEditModal(meal: CalendarMeal): void {
    this.draft = {
      id: meal.id,
      date: meal.date,
      mealType: meal.mealType,
      customMeal: meal.recipeId ? '' : (meal.customMeal ?? meal.title),
      recipeId: meal.recipeId ?? '',
      time: meal.time ?? '',
      servings: meal.servings || 1,
      notes: meal.notes ?? ''
    };
    this.mealTab.set(meal.recipeId ? 'recipe' : 'custom');
    this.isMealModalOpen.set(true);
  }

  /** Cambia de pestaña y lo deja reflejado en la URL. */
  switchAddMealTab(tab: 'custom' | 'recipe'): void {
    this.mealTab.set(tab);
    writeTabParam(this.router, this.route, 'mealTab', tab, 'custom');
  }

  closeMealModal(): void {
    this.isMealModalOpen.set(false);
    // El modal ya no está: la pestaña deja de tener sentido en la URL.
    clearTabParam(this.router, this.route, 'mealTab');
  }

  draftValid(): boolean {
    return this.mealTab() === 'recipe' ? !!this.draft.recipeId : !!this.draft.customMeal.trim();
  }

  saveMeal(): void {
    if (!this.draftValid()) return;

    const payload = {
      date: this.draft.date,
      mealType: this.draft.mealType,
      customMeal: this.draft.customMeal.trim() || undefined,
      recipeId: this.draft.recipeId || undefined,
      time: this.draft.time || undefined,
      servings: this.draft.servings || 1,
      notes: this.draft.notes.trim() || undefined
    };

    const request = this.draft.id
      ? this.calendarService.updateMeal(this.draft.id, {
          customMeal: payload.customMeal,
          recipeId: payload.recipeId,
          time: payload.time,
          servings: payload.servings,
          notes: payload.notes
        })
      : this.calendarService.addMeal(payload);

    request.subscribe({
      next: (saved) => {
        if (!saved) {
          this.toastService.error('Error', 'No se pudo guardar la comida');
          return;
        }
        const when = parseISODate(this.draft.date);
        this.toastService.success(
          this.draft.id ? 'Comida actualizada' : 'Comida añadida',
          `${MEAL_TYPE_META[this.draft.mealType].label}${when ? ' · ' + labels.longDay(when) : ''}`
        );
        this.closeMealModal();
      },
      error: () => this.toastService.error('Error', 'No se pudo guardar la comida')
    });
  }

  removeMeal(meal: CalendarMeal): void {
    void this.removeMealById(meal.id, meal.title);
  }

  async removeMealById(id: string, title = 'esta comida'): Promise<void> {
    const accepted = await this.confirmService.confirm({
      title: 'Eliminar comida',
      message: `¿Quitar «${title}» de la planificación?`,
      confirmText: 'Eliminar'
    });
    if (!accepted) return;

    this.calendarService.deleteMeal(id).subscribe(() => {
      this.toastService.success('Quitada', `${title} ya no está en el calendario`);
      if (this.isMealModalOpen()) this.closeMealModal();
    });
  }

  toggleMeal(meal: CalendarMeal): void {
    this.calendarService.toggleComplete(meal);
  }

  /* ──────────────────────────── Objetivos ──────────────────────────── */

  openGoalsModal(): void {
    const goals = this.calendarService.goals();
    this.goalsDraft = {
      type: goals?.type ?? this.selectedGoal() ?? 'balanced',
      dailyCalories: goals?.dailyCalories ?? this.calendarService.targetCalories()
    };
    this.isGoalsModalOpen.set(true);
  }

  closeGoalsModal(): void {
    this.isGoalsModalOpen.set(false);
  }

  saveGoals(): void {
    const type = (this.goalsDraft.type as GoalType) || 'balanced';
    this.selectedGoal.set(type);
    // Se parte de lo guardado: `PATCH /goals` reemplaza el objeto entero, así que
    // las restricciones que ya estuvieran ahí se copian en vez de borrarse.
    const previous = this.calendarService.goals();
    this.calendarService.updateGoals({
      ...previous,
      type,
      dailyCalories: Number(this.goalsDraft.dailyCalories) || undefined,
      restrictions: previous?.restrictions ?? []
    }, toISODate(startOfWeek(this.anchor())));
    this.toastService.success('Guardado', 'Objetivos de la semana actualizados');
    this.closeGoalsModal();
  }

  /* ────────────────────────── Plan con IA ────────────────────────── */

  private tasteGoalApplied = false;

  openGenerateModal(): void {
    this.isGenerateModalOpen.set(true);
    this.applyTasteGoal();
  }

  /**
   * El objetivo de la configuración inicial es el punto de partida del plan.
   * Si el perfil aún no ha llegado, se aplica cuando llegue (mientras el
   * select siga sin tocar): una semana concreta puede usar otro objetivo, y
   * eso manda sobre lo guardado.
   */
  private applyTasteGoal(): void {
    if (this.tasteGoalApplied) return;

    if (!this.tasteService.isLoaded()) {
      this.tasteService
        .load()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => this.applyTasteGoal(),
          error: () => undefined
        });
      return;
    }

    const { goal, goalNotes } = this.tasteService.taste();
    if (!goal || goal === 'balanced' || this.generateOptions.goalType !== 'balanced') return;

    this.tasteGoalApplied = true;
    this.generateOptions.goalType = goal;
    if (goal === 'custom' && !this.generateOptions.customDescription) {
      this.generateOptions.customDescription = goalNotes;
    }
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

    // La IA planifica la semana del día ancla, vea lo que se vea.
    const start = startOfWeek(this.anchor());
    const end = addDays(start, 6);

    const goals: { type: string; caloriesTarget?: number; customInstructions?: string } = {
      type: this.generateOptions.goalType
    };
    const calories = Number(this.generateOptions.calories);
    if (calories > 0) goals.caloriesTarget = calories;
    if (this.generateOptions.goalType === 'custom' && this.generateOptions.customDescription.trim()) {
      goals.customInstructions = this.generateOptions.customDescription.trim();
    }

    this.calendarService
      .generateWithAi({
        startDate: toISODate(start),
        endDate: toISODate(end),
        goals
      })
      .subscribe({
        next: (data) => {
          this.isGenerating.set(false);
          const saved = data?.saved;
          if (!saved) {
            this.toastService.error('Error', 'La IA no devolvió un plan válido');
            return;
          }
          this.reload();
          this.closeGenerateModal();
          this.toastService.success(
            'Plan guardado',
            saved.created
              ? `${saved.created} ${saved.created === 1 ? 'comida añadida' : 'comidas añadidas'}${
                  saved.skipped
                    ? ` · ${saved.skipped === 1 ? '1 hueco ya ocupado, intacto' : `${saved.skipped} huecos ya ocupados, intactos`}`
                    : ''
                }`
              : 'La semana ya estaba cubierta: no había huecos que rellenar'
          );
        },
        error: () => {
          this.isGenerating.set(false);
          this.toastService.error('Error', 'No se pudo generar el plan');
        }
      });
  }
  // ----------------------------------------------- eventos de la casa (§8f)

  readonly showMeals = signal(true);
  readonly eventKinds = HOUSEHOLD_EVENT_KINDS;
  readonly eventColors = HOUSEHOLD_EVENT_COLORS;
  readonly isEventModalOpen = signal(false);
  eventDraft: {
    id?: string;
    title: string;
    kind: HouseholdEventKind;
    date: string;
    allDay: boolean;
    startTime: string;
    endTime: string;
    color: string | null;
    location: string;
    notes: string;
    sharedWithHousehold: boolean;
    colorTouched?: boolean;
  } = {
    title: '',
    kind: 'other',
    date: '',
    allDay: false,
    startTime: '',
    endTime: '',
    color: null,
    location: '',
    notes: '',
    sharedWithHousehold: true
  };

  metaOf(kind: HouseholdEventKind) {
    return HOUSEHOLD_EVENT_META[kind];
  }

  isKindVisible(kind: HouseholdEventKind): boolean {
    return this.calendarService.visibleKinds().includes(kind);
  }

  /** Opciones del selector de tipo: reutiliza el META, que es de donde sale el color. */
  readonly kindOptions = computed<PickerOption[]>(() =>
    HOUSEHOLD_EVENT_KINDS.map((kind) => ({
      value: kind,
      label: HOUSEHOLD_EVENT_META[kind].label,
      color: HOUSEHOLD_EVENT_META[kind].color
    }))
  );

  setEventKind(value: string | null): void {
    const kind = (HOUSEHOLD_EVENT_KINDS as readonly string[]).includes(String(value))
      ? (value as HouseholdEventKind)
      : 'other';
    this.eventDraft.kind = kind;
    // El color sigue al tipo salvo que la persona haya elegido uno a mano: asi «Citas»
    // sale en rojo sin tener que explicarlo, y lo que se toco a mano se respeta.
    if (!this.eventDraft.colorTouched) this.eventDraft.color = null;
  }

  setAllDay(value: boolean): void {
    this.eventDraft.allDay = value;
    if (value) {
      this.eventDraft.startTime = '';
      this.eventDraft.endTime = '';
    }
  }

  toggleKind(kind: HouseholdEventKind): void {
    this.calendarService.toggleKind(kind);
    this.writeLayers();
  }

  /**
   * Las capas van en la URL (`?layers=home,shopping`): compartir «el calendario sin las
   * comidas» es mandar un enlace, y volver atras desde una cita no te cambia lo que estabas
   * mirando. Con todas activas no se escribe nada, para no ensuciar la URL limpia.
   */
  writeLayers(): void {
    const all = HOUSEHOLD_EVENT_KINDS;
    const visible = this.calendarService.visibleKinds();
    const params: Record<string, string | null> = {
      layers: visible.length === all.length && this.showMeals() ? null : (this.showMeals() ? 'meals,' : '') + visible.join(',')
    };
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
  }

  readLayersFromUrl(): void {
    const raw = new URLSearchParams(window.location.search).get('layers');
    if (!raw) return;
    const wanted = raw.split(',').map((entry) => entry.trim()).filter(Boolean);
    this.showMeals.set(wanted.includes('meals'));
    const kinds = wanted.filter((entry): entry is HouseholdEventKind =>
      (HOUSEHOLD_EVENT_KINDS as readonly string[]).includes(entry)
    );
    // `layers=meals` (sin eventos de casa) es legitimo: significa "solo la comida".
    this.calendarService.visibleKinds.set(kinds);
  }

  countOf(kind: HouseholdEventKind): number {
    return this.calendarService.householdEvents().filter(event => event.kind === kind).length;
  }

  /** La casilla «que lo vea mi casa» solo tiene sentido si hay casa. */
  hasHousehold(): boolean {
    return !!this.householdService.household();
  }

  openEventModal(day?: { iso?: string; date?: string }, event?: HouseholdEvent | null): void {
    const iso = event?.date ?? day?.iso ?? day?.date ?? this.anchorIso();
    this.eventDraft = {
      id: event?.id,
      title: event?.title ?? '',
      kind: (event?.kind ?? 'other') as HouseholdEventKind,
      date: iso,
      allDay: event?.allDay ?? false,
      startTime: event?.startTime ?? '',
      endTime: event?.endTime ?? '',
      color: event?.color ?? null,
      location: event?.location ?? '',
      notes: event?.notes ?? '',
      sharedWithHousehold: event ? true : true
    };
    this.calendarService.eventsError.set(null);
    this.isEventModalOpen.set(true);
  }

  closeEventModal(): void {
    this.isEventModalOpen.set(false);
  }

  /** Se abre desde la celda: el dia ya viene elegido, que es lo que ahorra el tecleo. */
  agendaDay(): CalendarDayView {
    const iso = this.anchorIso();
    return this.days().find(day => day.iso === iso) ?? {
      date: new Date(),
      iso,
      inCurrentMonth: true,
      isToday: true,
      meals: [],
      slots: { breakfast: [], lunch: [], dinner: [], snack: [] } as never,
      calories: 0,
      hasNutrition: false,
      planned: 0,
      done: 0,
      events: []
    };
  }

  anchorLabel(): string {
    return labels.longDay(this.anchor());
  }

  openEventFor(day: CalendarDayView): void {
    this.openEventModal({ iso: day.iso });
  }

  async saveEvent(): Promise<void> {
    const draft = this.eventDraft;
    const title = draft.title.trim();
    if (!title || !draft.date) return;
    const body: {
      title: string;
      kind: HouseholdEventKind;
      date: string;
      allDay: boolean;
      sharedWithHousehold: boolean;
      color: string | null;
      location: string | null;
      notes: string | null;
      startTime?: string;
      endTime?: string;
    } = {
      title,
      kind: draft.kind,
      date: draft.date,
      allDay: draft.allDay,
      sharedWithHousehold: draft.sharedWithHousehold,
      color: draft.color ?? this.metaOf(draft.kind).color,
      location: draft.location.trim() || null,
      notes: draft.notes.trim() || null
    };
    if (!draft.allDay) {
      if (draft.startTime) body.startTime = draft.startTime;
      if (draft.endTime) body.endTime = draft.endTime;
    }
    const saved = await this.calendarService.saveHouseholdEvent(body, draft.id);
    if (saved) this.closeEventModal();
  }

  async removeEvent(): Promise<void> {
    const id = this.eventDraft.id;
    if (!id) return;
    const ok = await this.calendarService.removeHouseholdEvent(id);
    if (ok) {
      this.closeEventModal();
      this.toastService.show({ type: 'info', title: 'Evento borrado', duration: 4000, countdown: true });
    }
  }

  eventTimeLabel(event: HouseholdEvent): string {
    return eventTimeLabel(event);
  }

  authorInitials(event: HouseholdEvent): string {
    const parts = String(event.authorName ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
}

function sum(days: CalendarDayView[], key: 'planned' | 'done' | 'calories'): number {
  return days.reduce((total, day) => total + day[key], 0);
}

function isSameDayAsToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );

}
