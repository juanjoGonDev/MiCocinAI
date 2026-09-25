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
import { mealAnchors as anchorsFor, mealTimeOf, plannedMealTypes, selectedMealTypes } from '../../core/meal-times';
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
import { CalendarTimelineComponent } from './calendar-timeline.component';
import { IconComponent } from '../../shared/components/ui/icon/icon.component';
import { AvatarComponent } from '../../shared/components/ui/avatar/avatar.component';
import { attendeeIdsPayload, inviteCandidates, selectedInvitees } from '../../core/event-invitations';
import { PickerComponent, PickerOption } from '../../shared/components/ui/picker/picker.component';
import { CheckboxComponent } from '../../shared/components/ui/checkbox/checkbox.component';
import { CalendarHouseholdEventsComponent } from './calendar-household-events.component';
import { HouseholdService } from '../../core/services/household.service';
import { AuthService } from '../../core/services/auth.service';
import { ModulesService } from '../../core/services/modules.service';
import {
  HOUSEHOLD_EVENT_COLORS,
  HOUSEHOLD_EVENT_KINDS,
  HOUSEHOLD_EVENT_META,
  HOUSEHOLD_RECURRENCE_META,
  HOUSEHOLD_RECURRENCES,
  HouseholdEvent,
  HouseholdRecurrence,
  HouseholdEventKind,
  eventTimeLabel
} from '../../shared/models/calendar.model';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { I18nService } from '../../core/services/i18n.service';
import { MEAL_LABEL_KEYS } from '../../core/i18n/labels';

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
    TranslatePipe,
    
    IconComponent,
    AvatarComponent,
    PickerComponent,
    CheckboxComponent,
    CalendarHouseholdEventsComponent,
    
    CommonModule,
    FormsModule,
    ModalComponent,
    CalendarMonthComponent,
    CalendarTimelineComponent
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
            <span class="cal-top__eyebrow">{{ 'calendar.planificacion' | t }}</span>
            <h1 class="calendar__title">{{ periodLabel() }}</h1>
          </div>

          <div class="cal-top__nav">
            <button
              type="button"
              class="cal-icon-btn"
              [attr.aria-label]="'calendar.periodo_anterior' | t"
              [attr.title]="'calendar.periodo_anterior_2' | t"
              (click)="shift(-1)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <button type="button" class="cal-pill" [attr.title]="'calendar.ir_a_hoy_t' | t" (click)="goToToday()">{{ 'calendar.hoy' | t }}</button>
            <button
              type="button"
              class="cal-icon-btn"
              [attr.aria-label]="'calendar.periodo_siguiente' | t"
              [attr.title]="'calendar.periodo_siguiente_2' | t"
              (click)="shift(1)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
            </button>

            <label class="cal-jump" [attr.title]="'calendar.ir_a_una_fecha_2' | t">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 3v2M17 3v2M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
              </svg>
              <input
                type="date"
                [value]="anchorIso()"
                (change)="jumpTo(input.value)"
                #input
                [attr.aria-label]="'calendar.ir_a_una_fecha' | t"
              />
            </label>
          </div>

          <div class="cal-top__right">
            <div class="cal-segment" role="tablist" [attr.aria-label]="'calendar.vista_del_calendario' | t">
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
                {{ CALENDAR_VIEW_LABELS[option] | t }}
              </button>
            </div>

            @if (kitchen()) {
              <button type="button" class="cal-pill" (click)="openGoalsModal()">
                {{ 'calendar.objetivo' | t }}<span *ngIf="goalLabel()"> · {{ goalLabel() }}</span>
              </button>
              <button type="button" class="cal-btn cal-btn--primary" (click)="openGenerateModal()">
                {{ 'calendar.planificar_ia' | t }}
              </button>
            }
            <button type="button" class="cal-pill cal-pill--add" data-test="event-add" (click)="openEventModal()">
              <app-icon name="add" [size]="16" [label]="null" />
              <span>{{ 'calendar.evento' | t }}</span>
            </button>
          </div>
        </header>

        <!-- ══ Capas: que se pinta hoy en la rejilla ══ -->
        <div class="cal-layers" role="group" [attr.aria-label]="'calendar.que_se_muestra_en' | t" data-test="calendar-layers">
          @if (kitchen()) {
            <button
              type="button"
              class="cal-layer"
              [class.is-on]="showMeals()"
              [attr.aria-pressed]="showMeals()"
              data-test="layer-meals"
              (click)="showMeals.set(!showMeals())"
            >
              <span class="cal-layer__dot" style="background: var(--primary)"></span>
              {{ 'calendar.comidas' | t }}
            </button>
          }
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
              {{ metaOf(kind).labelKey | t }}
              @if (countOf(kind) > 0) {
                <span class="cal-layer__count">{{ countOf(kind) }}</span>
              }
            </button>
          }
        </div>

        <!-- ══ Resumen del periodo ══ -->
        <div class="cal-strip" [class.cal-strip--bare]="!kitchen()">
          @if (kitchen()) {
          <div class="cal-strip__item">
            <span class="cal-strip__label">{{ 'calendar.comidas' | t }}</span>
            <span class="cal-strip__value">
              {{ plannedCount() }}<small> / {{ expectedMeals() }}</small>
            </span>
          </div>
          <div class="cal-strip__track" [title]="'calendar.planned_in' | t:{period: periodLabel()}">
            <span class="cal-strip__fill" [style.width.%]="plannedPercent()"></span>
          </div>

          <div class="cal-strip__item" *ngIf="hasNutrition()">
            <span class="cal-strip__label">{{ 'calendar.energia' | t }}</span>
            <span class="cal-strip__value">
              {{ fmt(calories()) }}<small>{{ 'calendar.kcal_of_target' | t:{target: fmt(calendarService.targetCalories())} }}</small>
            </span>
          </div>
          <div class="cal-strip__track" *ngIf="hasNutrition()">
            <span class="cal-strip__fill cal-strip__fill--kcal" [style.width.%]="caloriePercent()"></span>
          </div>

          <span class="cal-strip__done" *ngIf="doneCount() > 0">
            {{ doneCount() }} {{ (doneCount() === 1 ? 'calendar.hecha' : 'calendar.hechas') | t }}
          </span>

          <span class="cal-strip__spacer"></span>

          <span class="cal-strip__hint" *ngIf="plannedCount() === 0 && !isLoading()">
            {{ 'calendar.nothing_planned' | t:{period: periodShortLabel()} }}
            <button type="button" class="cal-link" (click)="openGenerateModal()">{{ 'calendar.que_lo_haga_la' | t }}</button>
            <span aria-hidden="true">·</span>
            <button type="button" class="cal-link" (click)="openAddModal(anchorIso(), 'lunch')">
              {{ 'calendar.empezar_por_el_almuerzo' | t }}
            </button>
          </span>
          }

          <span class="cal-strip__hint" *ngIf="calendarService.error()">
            {{ calendarService.error() }}
            <button type="button" class="cal-link" (click)="reload()">{{ 'calendar.reintentar' | t }}</button>
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
              [kitchen]="kitchen()"
              [anchorIso]="anchorIso()"
              (addMeal)="openAddModal($event.date, $event.mealType)"
              (openMeal)="openEditModal($event)"
              (openDay)="openDayFor($event)"
              (editEvent)="openEventModal(undefined, $event)"
            ></app-calendar-month>

            <!-- Semana y dia son LA MISMA rejilla de horas: lo unico que cambia es cuantas
                 columnas hay. days() ya trae 7 o 1 segun la vista, asi que el componente no tiene
                 que saber en que pestaña esta. -->
            <app-calendar-timeline
              *ngSwitchDefault
              [kitchen]="kitchen()"
              [days]="days()"
              [targetCalories]="calendarService.targetCalories()"
              [mealAnchors]="gridMealAnchors()"
              (addMeal)="onTimelineAddMeal($event)"
              (addEvent)="onTimelineAddEvent($event)"
              (openMeal)="openEditModal($event)"
              (toggleMeal)="toggleMeal($event)"
              (removeMeal)="removeMeal($event)"
              (openDay)="openDayFor($event)"
              (editEvent)="openEventModal(undefined, $event)"
            ></app-calendar-timeline>
          </ng-container>
        </div>

        <!-- ══ Agenda del día señalado ══ -->
        <!-- Un solo boton para anadir, arriba, y ya apunta al dia que se esta mirando
           (openEventModal usa anchorIso() cuando no le llega dia): dos botones de
           «anadir» a seis lineas de distancia son dos formas de preguntar lo mismo, y la
           de abajo se comia el encabezado de una seccion que va de lista en lista.
           OJO: dentro de este literal no pueden aparecer backticks, cierran el string. -->
        <section class="cal-agenda" data-test="agenda" [attr.aria-label]="'calendar.agenda_del_dia' | t">
          <header class="cal-agenda__head">
            <div class="cal-agenda__who">
              <p class="cal-agenda__eyebrow">{{ 'calendar.agenda' | t }}</p>
              <h3 class="cal-agenda__title">{{ anchorLabel() }}</h3>
            </div>
            @if (agendaDay().isToday) {
              <span class="cal-agenda__today" data-test="agenda-today">{{ 'calendar.hoy' | t }}</span>
            }
            @if (agendaDay().events.length) {
              <span class="cal-agenda__count">{{ agendaDay().events.length }} {{ (agendaDay().events.length === 1 ? 'calendar.plan' : 'calendar.planes') | t }}</span>
            }
          </header>

          @if (agendaDay().events.length) {
            <div class="cal-agenda__list">
              <app-calendar-household-events
                [events]="agendaDay().events"
                appearance="agenda"
                (edit)="openEventModal(undefined, $event)"
              />
            </div>
          } @else {
            <p class="cal-agenda__empty">
              <app-icon name="event_note" [size]="18" [label]="null" />
              <span>{{ 'calendar.nada_mas_apuntado_ese' | t }}</span>
              <small>{{ 'calendar.evento_arriba_lo_anade' | t }}</small>
            </p>
          }
        </section>
      </section>

      <!-- ══ Suelta de la casa ══ -->
      <app-modal
        [isOpen]="isEventModalOpen()"
        [title]="eventDraft.id ? ('calendar.edit_event' | t) : ('calendar.new_event' | t)"
        size="md"
        (onClose)="closeEventModal()"
      >
        <div class="meal-form">
          <div class="meal-form__field">
            <label for="event-title">{{ 'calendar.que_es' | t }}</label>
            <input id="event-title" name="eventTitle" class="cal-input" maxlength="120" [(ngModel)]="eventDraft.title" data-test="event-title" [placeholder]="'calendar.carpinteria_medir_el_pasillo' | t" />
          </div>

          <div class="meal-form__row">
            <div class="meal-form__field meal-form__field--sm">
              <span class="cal-field-label">{{ 'calendar.tipo' | t }}</span>
              <app-picker
                [label]="'calendar.tipo_de_evento' | t"
                [options]="kindOptions()"
                [value]="eventDraft.kind"
                [filterFrom]="99"
                data-test="event-kind"
                (valueChange)="setEventKind($event)"
              />
            </div>
            <div class="meal-form__field meal-form__field--sm">
              <label for="event-date">{{ 'calendar.dia' | t }}</label>
              <input id="event-date" name="eventDate" type="date" class="cal-input" [(ngModel)]="eventDraft.date" />
            </div>
          </div>

          <div class="meal-form__row">
            <div class="meal-form__field meal-form__field--sm">
              <span class="cal-field-label">{{ 'calendar.repetir' | t }}</span>
              <app-picker
                [label]="'calendar.cada_cuanto' | t"
                [options]="recurrenceOptions()"
                [value]="eventDraft.recurrence"
                [filterFrom]="99"
                data-test="event-recurrence"
                (valueChange)="setRecurrence($event)"
              />
            </div>
            @if (eventDraft.recurrence !== 'none') {
              <p class="cal-note">
                {{ (eventDraft.id ? 'calendar.los_cambios_afectan' : 'calendar.se_repite_desde') | t }}
              </p>
            }
          </div>

          <div class="meal-form__row">
            <app-checkbox
              [label]="'calendar.todo_el_dia' | t"
              name="eventAllDay"
              [checked]="eventDraft.allDay"
              (checkedChange)="setAllDay($event)"
            />
            @if (!eventDraft.allDay) {
              <div class="meal-form__field meal-form__field--sm">
                <label for="event-start">{{ 'calendar.desde' | t }}</label>
                <input id="event-start" name="eventStart" type="time" class="cal-input" [(ngModel)]="eventDraft.startTime" />
              </div>
              <div class="meal-form__field meal-form__field--sm">
                <label for="event-end">{{ 'calendar.hasta' | t }}</label>
                <input id="event-end" name="eventEnd" type="time" class="cal-input" [(ngModel)]="eventDraft.endTime" />
              </div>
            }
          </div>

          <div class="meal-form__field">
            <label>{{ 'calendar.color' | t }}</label>
            <div class="cal-swatches" role="group" [attr.aria-label]="'calendar.color_del_evento' | t">
              @for (color of eventColors; track color) {
                <button
                  type="button"
                  class="cal-swatch"
                  [class.is-active]="(eventDraft.color ?? metaOf(eventDraft.kind).color) === color"
                  [style.background]="color"
                  [attr.aria-label]="'calendar.color_value' | t:{color: color}"
                  (click)="eventDraft.color = color; eventDraft.colorTouched = true"
                ></button>
              }
            </div>
          </div>

          <div class="meal-form__field">
            <label for="event-place">{{ 'calendar.sitio_opcional' | t }}</label>
            <input id="event-place" name="eventPlace" class="cal-input" maxlength="120" [(ngModel)]="eventDraft.location" [placeholder]="'calendar.tienda_de_la_calle' | t" />
          </div>

          <div class="meal-form__field">
            <label for="event-notes">{{ 'calendar.notas_opcional' | t }}</label>
            <textarea id="event-notes" name="eventNotes" class="cal-input" rows="2" maxlength="500" [(ngModel)]="eventDraft.notes"></textarea>
          </div>

          @if (hasHousehold()) {
            <app-checkbox
              [label]="'calendar.que_lo_vea_mi' | t"
              name="eventShared"
              [checked]="eventDraft.sharedWithHousehold"
              (checkedChange)="eventDraft.sharedWithHousehold = $event"
            />

            <div class="meal-form__field">
              <label id="event-people-label">{{ 'calendar.quien_viene_opcional' | t }}</label>
              <div class="cal-people" role="group" aria-labelledby="event-people-label" data-test="event-attendees">
                @for (person of householdPeople(); track person.userId) {
                  <button
                    type="button"
                    class="cal-person"
                    [class.is-on]="eventDraft.attendeeIds.includes(person.userId)"
                    [attr.aria-pressed]="eventDraft.attendeeIds.includes(person.userId)"
                    (click)="toggleAttendee(person.userId)"
                  >
                    <app-avatar [name]="person.name" [src]="person.avatar" size="xs" />
                    <span>{{ person.name }}</span>
                    @if (eventDraft.attendeeIds.includes(person.userId)) {
                      <app-icon name="check" class="cal-person__check" />
                    }
                  </button>
                }
              </div>
              @if (!householdPeople().length) {
                <p class="cal-note" data-test="event-no-people">
                  {{ 'calendar.eres_la_unica_persona' | t }}
                  <button type="button" class="cal-link" (click)="openHouseholdPage()">{{ 'calendar.invitar_a_alguien' | t }}</button>
                </p>
              } @else {
                <p class="cal-note">{{ 'calendar.solo_cambia_tu_visibilidad' | t }}</p>
              }
            </div>
          }
          <p class="cal-note" *ngIf="calendarService.eventsError()" role="alert">{{ calendarService.eventsError() }}</p>

          <div class="meal-form__actions">
            @if (eventDraft.id) {
              <button type="button" class="cal-btn cal-btn--ghost cal-btn--danger" (click)="removeEvent()">{{ 'calendar.borrar' | t }}</button>
              @if (eventDraft.recurrence !== 'none') {
                <button type="button" class="cal-btn cal-btn--ghost" data-test="event-skip-day" (click)="removeOccurrence()">
                  {{ 'calendar.quitar_solo_este_dia' | t }}
                </button>
              }
            }
            <span class="meal-form__grow"></span>
            <button type="button" class="cal-btn cal-btn--ghost" (click)="closeEventModal()">{{ 'common.cancel' | t }}</button>
            <button
              type="button"
              class="cal-btn cal-btn--primary"
              data-test="event-save"
              [disabled]="!eventDraft.title.trim() || calendarService.creatingEvent()"
              (click)="saveEvent()"
            >
              {{ (calendarService.creatingEvent() ? 'ui.guardando' : 'common.save') | t }}
            </button>
          </div>
        </div>
      </app-modal>

      <!-- ══ Añadir / editar comida ══ -->
      <app-modal
        [isOpen]="isMealModalOpen()"
        [title]="draft.id ? ('calendar.edit_meal' | t) : ('calendar.add_meal_title' | t)"
        size="md"
        (onClose)="closeMealModal()"
      >
        <div class="meal-form">
          <div class="meal-form__when">
            <span class="meal-form__band" [attr.data-meal]="draft.mealType" aria-hidden="true"></span>
            <strong>{{ mealLabel(draft.mealType) }}</strong>
            <span class="meal-form__date">{{ draftDateLabel() }}</span>
            <div class="meal-form__tabs" role="tablist" [attr.aria-label]="'calendar.origen_de_la_comida' | t">
              <button
                type="button"
                role="tab"
                [class.tab]="true"
                [class.tab--active]="mealTab() === 'custom'"
                [attr.aria-selected]="mealTab() === 'custom'"
                (click)="switchAddMealTab('custom')"
              >
                {{ 'calendar.escribir' | t }}
              </button>
              <button
                type="button"
                role="tab"
                [class.tab]="true"
                [class.tab--active]="mealTab() === 'recipe'"
                [attr.aria-selected]="mealTab() === 'recipe'"
                (click)="switchAddMealTab('recipe')"
              >
                {{ 'calendar.receta' | t }}
              </button>
            </div>
          </div>

          <div class="meal-form__field" *ngIf="mealTab() === 'custom'">
            <label for="meal-custom">{{ 'calendar.que_vas_a_comer' | t }}</label>
            <input
              id="meal-custom"
              type="text"
              maxlength="200"
              [(ngModel)]="draft.customMeal"
              [placeholder]="'calendar.ej_pasta_con_tomate' | t"
              class="cal-input"
            />
          </div>

          <div class="meal-form__field" *ngIf="mealTab() === 'recipe'">
            <label for="meal-recipe">{{ 'calendar.selecciona_una_receta' | t }}</label>
            <select id="meal-recipe" [(ngModel)]="draft.recipeId" class="cal-input">
              <option value="">{{ 'calendar.seleccionar' | t }}</option>
              <option *ngFor="let recipe of recipeService.recipes()" [value]="recipe.id">
                {{ recipe.name }}{{ recipe.calories ? ' · ' + recipe.calories + ' kcal' : '' }}
              </option>
            </select>
            <span class="cal-hint" *ngIf="recipeService.recipes().length === 0">
              {{ 'calendar.todavia_no_hay_recetas' | t }}
            </span>
          </div>

          <div class="meal-form__row">
            <div class="meal-form__field meal-form__field--sm">
              <label for="meal-time">{{ 'calendar.hora_opcional' | t }}</label>
              <input id="meal-time" type="time" [(ngModel)]="draft.time" class="cal-input" />
            </div>
            <div class="meal-form__field meal-form__field--sm">
              <label for="meal-servings">{{ 'calendar.raciones' | t }}</label>
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
            <label for="meal-notes">{{ 'calendar.notas_opcional' | t }}</label>
            <textarea
              id="meal-notes"
              rows="2"
              maxlength="500"
              [(ngModel)]="draft.notes"
              [placeholder]="'calendar.ej_sobras_del_dia' | t"
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
              {{ 'common.delete' | t }}
            </button>
            <span class="meal-form__grow"></span>
            <button type="button" class="cal-btn" (click)="closeMealModal()">{{ 'common.cancel' | t }}</button>
            <button
              type="button"
              class="cal-btn cal-btn--primary"
              [disabled]="!draftValid()"
              (click)="saveMeal()"
            >
              {{ draft.id ? ('calendar.save_changes' | t) : ('ui.anadir' | t) }}
            </button>
          </div>
        </div>
      </app-modal>

      <!-- ══ Objetivos ══ -->
      <app-modal
        [isOpen]="isGoalsModalOpen()"
        [attr.title]="'calendar.objetivos_nutricionales' | t"
        size="md"
        (onClose)="closeGoalsModal()"
      >
        <div class="goals-form">
          <p class="cal-muted">
            {{ 'calendar.sirven_de_punto_de' | t }}
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
              <span class="goal-option__label">{{ goal.labelKey | t }}</span>
            </button>
          </div>

          <div class="meal-form__field meal-form__field--sm">
            <label for="goals-calories">{{ 'calendar.calorias_diarias_objetivo' | t }}</label>
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
            <button type="button" class="cal-btn" (click)="closeGoalsModal()">{{ 'common.cancel' | t }}</button>
            <button type="button" class="cal-btn cal-btn--primary" (click)="saveGoals()">{{ 'common.save' | t }}</button>
          </div>
        </div>
      </app-modal>

      <!-- ══ Planificar con IA ══ -->
      <app-modal
        [isOpen]="isGenerateModalOpen()"
        [attr.title]="'calendar.planificar_con_ia' | t"
        size="md"
        (onClose)="closeGenerateModal()"
      >
        <div class="generate-form">
          <p class="cal-muted">
            {{ 'calendar.gen_intro' | t:{period: planWeekLabel()} }}
          </p>

          <div class="meal-form__field">
            <label for="gen-goal">{{ 'calendar.objetivo' | t }}</label>
            <select id="gen-goal" [(ngModel)]="generateOptions.goalType" class="cal-input" (change)="onGoalTypeChange()">
              <option *ngFor="let goal of goalOptions" [value]="goal.value">
                {{ goal.labelKey | t }}
              </option>
            </select>
          </div>

          <fieldset class="meal-form__field" data-test="gen-meals">
            <legend class="meal-form__label">{{ 'calendar.que_comidas_quieres_en' | t }}</legend>
            <!-- Cuatro casillas, no un desplegable de multi-seleccion: «quitar la merienda» es un click,
                 y ver las cuatro con lo que esta marcado es lo que evita pedir un dia a medias sin
                 querer. Ninguna marcada = el dia entero, y eso se dice aqui, no en un 400. -->
            <div class="goals-form__options">
              <app-checkbox
                *ngFor="let meal of mealTypesForPicker(); trackBy: trackMeal"
                [attr.data-test]="'gen-meal-' + meal"
                [label]="mealLabel(meal)"
                [checked]="generateOptions.mealTypes[meal]"
                (checkedChange)="toggleGenerateMeal(meal, $event)"
              />
            </div>
            <span class="cal-hint">
              {{ 'calendar.solo_se_pediran_y' | t }}
            </span>
            <!-- Que la IA no ofrezca una comida no puede parecer un olvido: se dice cual esta bloqueada
                 y donde se cambia, aqui mismo, que es donde se echo de menos. -->
            <span class="cal-hint" *ngIf="blockedMeals().length > 0" data-test="gen-blocked-line">
              {{ 'calendar.bloqueadas_en_preferencias' | t:{comidas: blockedMealsLabel()} }}
            </span>
          </fieldset>

          <div class="meal-form__field" *ngIf="generateOptions.goalType === 'custom'">
            <label for="gen-custom">{{ 'calendar.describe_tu_objetivo' | t }}</label>
            <textarea
              id="gen-custom"
              name="customDescription"
              rows="4"
              [(ngModel)]="generateOptions.customDescription"
              [placeholder]="'calendar.ej_cenas_ligeras_y' | t"
              class="cal-input cal-input--area"
            ></textarea>
            <span class="cal-hint">
              {{ 'calendar.cuanto_mas_concreto_mejor' | t }}
            </span>
          </div>

          <div class="meal-form__field meal-form__field--sm">
            <label for="gen-calories">{{ 'calendar.calorias_diarias_opcional' | t }}</label>
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
            <!-- Un boton apagado sin motivo es una app que no explica: el mensaje vive junto al boton. -->
            <span class="cal-hint" *ngIf="mealTypesForPicker().length === 0" data-test="gen-blocked-all">
              {{ 'calendar.nada_que_planificar' | t }}
            </span>
            <button type="button" class="cal-btn" (click)="closeGenerateModal()">{{ 'common.cancel' | t }}</button>
            <button
              type="button"
              class="cal-btn cal-btn--primary"
              [disabled]="isGenerating() || mealTypesForPicker().length === 0"
              (click)="generateWeeklyPlan()"
            >
              <span class="cal-spinner" *ngIf="isGenerating()" aria-hidden="true"></span>
              {{ isGenerating() ? ('calendar.generating' | t) : ('calendar.generate_plan' | t) }}
            </button>
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
    /* Capas y muestras de color: la respuesta tiene que ser la misma en las dos, porque son el mismo
       control (ensenas/colores que se activan) y hoy una avisaba y la otra no. */
    .cal-layer:hover:not(.is-on) {
      color: var(--text-primary);
      border-color: var(--border-strong);
      background: var(--bg-tertiary);
    }
  
    .cal-layer.is-on:hover {
      filter: brightness(0.96);
    }
  
    .cal-swatch:hover {
      transform: scale(1.08);
    }
  
    .cal-swatch:focus-visible,
    .cal-layer:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }
  

    .cal-people {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .cal-person {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      padding: 4px 8px;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-full);
      background: var(--bg-secondary);
      color: var(--text-primary);
      font: inherit;
      font-size: var(--text-sm);
      cursor: pointer;
      transition: var(--transition-fast);
    }

    .cal-person:hover {
      border-color: var(--primary);
    }

    .cal-person.is-on {
      border-color: var(--primary);
      background: color-mix(in srgb, var(--primary) 16%, transparent);
    }

    .cal-person__check {
      color: var(--primary);
      font-size: var(--text-sm);
    }

    .cal-pill--add {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    /* La fila de filtros vive dentro de un panel sin padding propio (cada banda lo pone al
       lado), y esta se habia quedado sin el suyo: las capsulas pegadas al borde de la tarjeta
       se leian fuera de la pantalla. Mismos 16 px laterales que la cabecera y la franja. */
    .cal-layers {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      padding: 6px var(--space-4) 0;
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

    /* ──────────────────────── Agenda del día ──────────────────────── */
    /* La seccion existe para leerla de pie y con una mano. Sin su propio hueco era una
       lista de 11 px pegada al calendario —la variante que encaja DENTRO de una celda—
       y nadie la veia. Aquí es tarjeta: aire, jerarquia y filas que se tocan. */
    .cal-agenda {
      display: grid;
      gap: var(--space-3);
      margin-top: var(--space-4);
      padding: var(--space-4);
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-xs);
    }

    .cal-agenda__head {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .cal-agenda__who {
      min-width: 0;
      display: grid;
      gap: 2px;
      margin-right: auto;
    }

    .cal-agenda__eyebrow {
      margin: 0;
      font-size: var(--text-xs);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-tertiary);
    }

    .cal-agenda__title {
      margin: 0;
      font-size: var(--text-lg);
      font-weight: 600;
      color: var(--text-primary);
    }

    .cal-agenda__today,
    .cal-agenda__count {
      flex: 0 0 auto;
      padding: 2px var(--space-2);
      border-radius: var(--radius-full);
      font-size: var(--text-xs);
      font-weight: 600;
      background: var(--primary-subtle);
      color: var(--primary-dark);
    }

    .cal-agenda__count {
      background: var(--bg-tertiary);
      color: var(--text-secondary);
    }

    .cal-agenda__list {
      display: grid;
      gap: var(--space-2);
    }

    .cal-agenda__empty {
      display: grid;
      justify-items: center;
      gap: var(--space-1);
      margin: 0;
      padding: var(--space-5) var(--space-4);
      text-align: center;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      background: var(--bg-tertiary);
      border: 1px dashed var(--border-default);
      border-radius: var(--radius-md);
    }

    .cal-agenda__empty small {
      color: var(--text-tertiary);
      font-size: var(--text-xs);
    }

    @media (min-width: 900px) {
      .cal-agenda {
        padding: var(--space-5);
      }
    }
  `]
})
export class CalendarComponent implements OnInit {
  private readonly i18n = inject(I18nService);

  calendarService = inject(CalendarService);
  recipeService = inject(RecipeService);

  private readonly tasteService = inject(TasteProfileService);
  private readonly toastService = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly householdService = inject(HouseholdService);
  private readonly modules = inject(ModulesService);

  /**
   * Si la cuenta tiene encendida «Comidas y recetas». No manda sobre la ruta —la agenda es de la
   * casa y seguiria ahi sin la cocina— sino sobre lo que hay de cocina DENTRO: la capa Comidas,
   * los anadidos de plato de las tres rejillas, la franja de energia y el planificador.
   */
  readonly kitchen = computed(() => this.modules.isEnabled('meals'));
  /** Lo que de verdad se pinta: la capa elegida Y el modulo encendido. */
  readonly mealsVisible = computed(() => this.kitchen() && this.showMeals());

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
  generateOptions = {
    goalType: 'balanced',
    calories: 2000,
    customDescription: '',
    /**
     * Que comidas se piden en el plan. Un mapa por clave, no una lista: lo que la plantilla pinta son
     * cuatro casillas y una lista obligaria a reconstruirla en cada click (y a perder el orden del dia).
     */
    mealTypes: { breakfast: true, lunch: true, snack: true, dinner: true } as Record<MealType, boolean>
  };
  readonly goalOptions = GOAL_OPTIONS;
  /**
   * Que comidas se pueden pedir (12t-T): las cuatro menos las bloqueadas en Preferencias.
   *
   * Es un `computed` sobre el signal del service, no una constante: si alguien desbloquea la merienda
   * en otra pestana, el dialog cambia solo. Y no ofrece lo bloqueado —no lo muestra desmarcado— porque
   * «no te lo ofrezco» y «te lo ofrezco apagado» son dos mensajes distintos, y el primero es el que la
   * casa eligio.
   */
  readonly allowedMeals = computed(() => plannedMealTypes(this.tasteService.mealPlan()));
  readonly blockedMeals = computed(() => MEAL_ORDER.filter((type) => !this.allowedMeals().includes(type)));
  /** Lo que recorre la plantilla del dialogo de IA: el orden del dia, sin las bloqueadas. */
  readonly mealTypesForPicker = this.allowedMeals;
  /** Color y demas meta de cada comida (la plantilla no puede importar el modelo por su cuenta). */
  readonly mealMeta = MEAL_TYPE_META;

  /**
   * Lo que se ensena de una comida, en el idioma de quien mira. La plantilla la llama por nombre porque
   * `MEAL_LABEL_KEYS[...] | t` dentro de un `@for` no tipa tanto como este getter.
   */
  mealLabel(meal: MealType): string {
    return this.i18n.t(MEAL_LABEL_KEYS[meal]);
  }

  /**
   * Las horas de la casa convertidas en minutos del dia: lo que usa la rejilla para sentar una comida
   * que no tiene hora escrita.
   *
   * Es un `computed` sobre el perfil: al cambiar el horario en Preferencias y volver atras, la rejilla se
   * recoloca sola. Y si el perfil aun no ha contestado, `mealAnchors` tira de sus anclas propias —una
   * rejilla mal colocada durante 200 ms es mejor que una medianoche con las cuatro comidas apiladas.
   */
  readonly gridMealAnchors = computed(() => anchorsFor(this.tasteService.mealTimes()));

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
      // asi las tres vistas (mes, semana, día) se comportan igual sin tocarlas.
      const meals = this.mealsVisible() ? byDate.get(iso) ?? [] : [];
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
    // La casa es lo que decide si se puede invitar a alguien: sin pedirla aqui, abrir el calendario
    // directamente (enlace, recarga) dejaba el picker fuera de pantalla.
    this.householdService.ensureHousehold();
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
        return this.i18n.t('calendar.este_dia');
      default:
        return this.i18n.t('calendar.esta_semana');
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
    return type ? this.i18n.t(GOAL_TYPE_LABELS[type] ?? ('calendar.goal.custom' as never)) : '';
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

  /**
   * La rejilla de horas ya sabe la hora en la que ha caido el click: passarsela al dialog es lo que
   * hace que el eje de horas valga algo. Sin eso, la rejilla seria una lista con ejes dibujados.
   */
  onTimelineAddMeal(payload: { date: string; mealType: MealType; time?: string }): void {
    this.openAddModal(payload.date, payload.mealType, payload.time);
  }

  onTimelineAddEvent(payload: { date: string; startTime: string }): void {
    this.openEventModal({ iso: payload.date }, null, payload.startTime);
  }

  openAddModal(date: string, mealType: MealType, time?: string): void {
    this.draft = emptyDraft(date, mealType);
    // La hora es la de la casa, no una pregunta: acabamos de decir a que hora se cena, y volver a
    // pedirla por cada comida seria no haberse enterado. Se puede vaciar la casilla, y entonces la
    // comida queda «sin hora» (la rejilla la coloca en su ancla) —es un estado real, no un cero.
    this.draft.time = time ?? mealTimeOf(this.tasteService.mealTimes(), mealType);
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

    // En el PATCH `undefined` significa «no lo toques», asi que borrar la hora exige mandar `null`
    // explicito: con `undefined` el boton de quitar era un Guardar que no guardaba nada.
    const patch: Record<string, unknown> = {
      customMeal: payload.customMeal ?? null,
      recipeId: payload.recipeId ?? null,
      time: payload.time ?? null,
      servings: payload.servings,
      notes: payload.notes ?? null
    };

    const request = this.draft.id
      ? this.calendarService.updateMeal(this.draft.id, patch as never)
      : this.calendarService.addMeal(payload);

    request.subscribe({
      next: (saved) => {
        if (!saved) {
          this.toastService.error(this.i18n.t('ui.error'), this.i18n.t('calendar.no_se_pudo_guardar'));
          return;
        }
        const when = parseISODate(this.draft.date);
        this.toastService.success(
          this.draft.id ? this.i18n.t('calendar.comida_actualizada') : this.i18n.t('calendar.comida_anadida'),
          `${this.i18n.t(MEAL_LABEL_KEYS[this.draft.mealType])}${when ? ' · ' + labels.longDay(when) : ''}`
        );
        this.closeMealModal();
      },
      error: () => this.toastService.error(this.i18n.t('ui.error'), this.i18n.t('calendar.no_se_pudo_guardar'))
    });
  }

  /**
   * El sufijo del aviso de «generar con IA»: cuantos huecos estaban ya ocupados y se han respetado.
   * Va aparte porque el singular/plural se elige aqui, no dentro de una plantilla.
   */
  private huecosYaOcupados(skipped: number): string {
    if (!skipped) return '';
    return ' · ' + this.i18n.t(
      skipped === 1 ? 'calendar.hueco_ocupado_uno' : 'calendar.huecos_ocupados_varios',
      { n: skipped }
    );
  }

  removeMeal(meal: CalendarMeal): void {
    void this.removeMealById(meal.id, meal.title);
  }

  async removeMealById(id: string, title?: string): Promise<void> {
    // El nombre por defecto tambien se traduce: si se resolviera en la firma, el ingles llegaria tarde.
    const que = title ?? this.i18n.t('calendar.esta_comida');
    const accepted = await this.confirmService.confirm({
      title: this.i18n.t('calendar.eliminar_comida'),
      message: this.i18n.t('calendar.quitar_de_la_planificacion', { title: que }),
      confirmText: this.i18n.t('common.delete')
    });
    if (!accepted) return;

    this.calendarService.deleteMeal(id).subscribe(() => {
      this.toastService.success(
        this.i18n.t('calendar.quitada'),
        this.i18n.t('calendar.ya_no_esta_en_el', { title: que })
      );
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
    this.toastService.success(this.i18n.t('ui.guardado'), this.i18n.t('calendar.objetivos_de_la_semana'));
    this.closeGoalsModal();
  }

  /* ────────────────────────── Plan con IA ────────────────────────── */

  private tasteGoalApplied = false;

  openGenerateModal(): void {
    // Las casillas arrancan de lo que la casa dejo abierto: si la cena esta bloqueada esa casilla no
    // existe, y las demas vuelven a estar marcadas (no guardan la eleccion de la semana pasada).
    const permitidas = this.allowedMeals();
    for (const type of MEAL_ORDER) {
      this.generateOptions.mealTypes[type] = permitidas.includes(type);
    }
    this.isGenerateModalOpen.set(true);
    this.applyTasteGoal();
  }

  /** Case (o descase) una comida del plan pedido. */
  toggleGenerateMeal(mealType: MealType, checked: boolean): void {
    this.generateOptions.mealTypes[mealType] = checked;
  }

  /**
   * Lo que se manda: las comidas marcadas, en el orden del dia. Si no se ha marcado ninguna se manda el
   * dia completo (ver `selectedMealTypes`), pero el «dia completo» de esta casa son **las permitidas**:
   * filtrar despues y no antes es lo que evita que «no marque nada» acabe planificando lo bloqueado.
   */
  get generateMealTypes(): MealType[] {
    const flags = this.generateOptions.mealTypes;
    const permitidas = this.allowedMeals();
    const marcadas = permitidas.filter((type) => flags[type]);
    return selectedMealTypes(marcadas.length > 0 ? marcadas : permitidas);
  }

  /** Los nombres de las comidas bloqueadas, para la linea que dice por que no estan ahi. */
  blockedMealsLabel(): string {
    const nombres = this.blockedMeals().map((type) => this.mealLabel(type));
    if (nombres.length < 2) return nombres[0] ?? '';
    return nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
  }

  trackMeal(_index: number, meal: MealType): MealType {
    return meal;
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
    // El boton ya esta apagado en ese caso; esto es por si el bloqueo llego mientras el dialog estaba
    // abierto (la otra pestana, otro aparato). Nunca se manda una peticion que el server va a tirar.
    if (this.allowedMeals().length === 0) return;
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
        goals,
        mealTypes: this.generateMealTypes
      })
      .subscribe({
        next: (data) => {
          this.isGenerating.set(false);
          const saved = data?.saved;
          if (!saved) {
            this.toastService.error(this.i18n.t('ui.error'), this.i18n.t('calendar.la_ia_no_devolvio'));
            return;
          }
          this.reload();
          this.closeGenerateModal();
          this.toastService.success(
            this.i18n.t('calendar.plan_guardado'),
            saved.created
              ? this.i18n.t(
                  saved.created === 1 ? 'calendar.comidas_generadas_uno' : 'calendar.comidas_generadas_varios',
                  { n: saved.created }
                ) + this.huecosYaOcupados(saved.skipped)
              : this.i18n.t('calendar.la_semana_ya_estaba')
          );
        },
        error: (err) => {
          this.isGenerating.set(false);
          if (err?.original?.error?.code === 'MEAL_PLAN_ALL_BLOCKED') {
            // El server dijo «no hay nada que planificar» porque las comidas se bloquearon mientras
            // tanto: se refresca el estado para que el dialog se pinte con la verdad, y el aviso sale
            // del diccionario en vez de la frase que escribio el server.
            this.tasteService.load().subscribe({ error: () => undefined });
            this.toastService.warning(
              this.i18n.t('calendar.no_se_pudo_generar'),
              this.i18n.t('calendar.bloqueo_a_medio')
            );
            return;
          }
          this.toastService.error(this.i18n.t('ui.error'), this.i18n.t('calendar.no_se_pudo_generar'));
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
    /**
     * Quien esta invitado. Es una lista de ids de usuario, no de nombres: si se guardase el nombre,
     * una Renata que cambie de apellido seguiria invitada a la cena de hace un ano.
     */
    attendeeIds: string[];
    /** Cada cuanto se repite (HOGARIA-SPEC 12t-R). `none` es un dia suelto, como toda la vida. */
    recurrence: HouseholdRecurrence;
    /** El dia que define la serie. Al abrir un martes cualquiera sigue siendo el de inicio: si no, cambiar el titulo le moveria el ancla. */
    seriesDate?: string;
    /** El dia sobre el que se hizo clic. Es el que se quita con «solo este dia no». */
    occurrenceDate?: string;
    /** Si lo escribio esta cuenta. Con `false` el modal no abre: abre la salida. */
    editable?: boolean;
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
    sharedWithHousehold: true,
    attendeeIds: [],
    recurrence: 'none',
    editable: true
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
      // El picker pinta `label`: aqui si que hay que traducir, porque es texto de la interfaz y no dato.
      label: this.i18n.t(HOUSEHOLD_EVENT_META[kind].labelKey),
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

  /** Opciones del «Repetir» (12t-R): el catalogo esta en el modelo; la etiqueta, en el diccionario. */
  readonly recurrenceOptions = computed<PickerOption[]>(() =>
    HOUSEHOLD_RECURRENCES.map((recurrence) => ({
      value: recurrence,
      label: this.i18n.t(HOUSEHOLD_RECURRENCE_META[recurrence].labelKey)
    }))
  );

  /** El picker emite `string | null`; aqui el `null` vuelve a ser «una vez», que es lo que significa. */
  setRecurrence(value: string | null): void {
    this.eventDraft.recurrence = value === 'daily' || value === 'weekly' ? value : 'none';
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
    // `mealsVisible`, no `showMeals`: con la cocina apagada no se escribe `meals` en la URL, que
    // seria re-anadir por enlace lo que la cuenta acaba de apagar —y dejar un enlace que miente.
    const params: Record<string, string | null> = {
      layers: visible.length === all.length && this.mealsVisible() ? null : (this.mealsVisible() ? 'meals,' : '') + visible.join(',')
    };
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
  }

  readLayersFromUrl(): void {
    const raw = new URLSearchParams(window.location.search).get('layers');
    if (!raw) return;
    const wanted = raw.split(',').map((entry) => entry.trim()).filter(Boolean);
    // Se respeta lo que pide el enlace... si la cuenta tiene cocina. Si no, `meals` se ignora:
    // no es un error, y no se escribe de vuelta (arriba se usa `mealsVisible`).
    this.showMeals.set(this.kitchen() && wanted.includes('meals'));
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

  openEventModal(
    day?: { iso?: string; date?: string },
    event?: HouseholdEvent | null,
    /** La hora pulsada en la rejilla. `''` es «todo el día», que es la banda de arriba. */
    startTime?: string
  ): void {
    const iso = event?.date ?? day?.iso ?? day?.date ?? this.anchorIso();
    // El campo del dia es el de la SERIE, no el del dia pulsado: editar una ocurrencia edita la serie
    // (12t-R), y escribir aqui el dia pulsado convertia un cambio de titulo en un cambio de martes.
    const serie = event?.seriesDate ?? iso;
    if (event && event.editable === false) {
      // No es un «no tienes permiso» seco: lo que esa persona quiere hacer aqui es salirse, y eso si
      // puede hacerlo. Abrir un formulario de solo lectura seria enseñarle campos que no puede tocar.
      void this.leaveEvent(event);
      return;
    }
    this.eventDraft = {
      id: event?.id,
      title: event?.title ?? '',
      kind: (event?.kind ?? 'other') as HouseholdEventKind,
      date: serie,
      allDay: event?.allDay ?? startTime === '',
      startTime: event?.startTime ?? (startTime || ''),
      endTime: event?.endTime ?? '',
      color: event?.color ?? null,
      location: event?.location ?? '',
      notes: event?.notes ?? '',
      sharedWithHousehold: event ? true : true,
      attendeeIds: selectedInvitees(event),
      recurrence: event?.recurrence ?? 'none',
      seriesDate: serie,
      occurrenceDate: event ? iso : undefined,
      editable: event?.editable ?? true
    };
    // El picker solo existe si la casa estaba cargada al abrir. Guardar sin esa marca NO manda lista:
    // `attendeeIds: []` es «que no quede nadie», y eso no lo puede decidir un renderido a medias.
    this.eventAttendeesShown = this.hasHousehold();
    this.calendarService.eventsError.set(null);
    this.isEventModalOpen.set(true);
  }

  /**
   * Salirse de un evento que escribio otra persona. Es un DELETE en la tabla de invitados, no en el
   * evento: lo que se borra es la relacion, la cena de la casa sigue en pie.
   */
  async leaveEvent(event: HouseholdEvent): Promise<void> {
    const accepted = await this.confirmService.confirm({
      title: this.i18n.t('calendar.salir_del_evento'),
      message: this.i18n.t('calendar.lo_apunto_otra_persona', {
        title: event.title,
        autor: event.authorName ?? this.i18n.t('calendar.otra_persona_de_la'),
      }),
      confirmText: this.i18n.t('calendar.salirme')
    });
    if (!accepted) return;
    const done = await this.calendarService.leaveHouseholdEvent(event.id);
    if (done) {
      this.toastService.show({ type: 'info', title: this.i18n.t('calendar.te_has_salido_del'), duration: 4000, countdown: true });
      return;
    }
    this.toastService.error(this.i18n.t('calendar.no_se_pudo_salir'), this.i18n.t('calendar.vuelve_a_intentarlo_en'));
  }

  /** Los de la casa, menos yo, en orden de nombre: la regla vive en `core/event-invitations`. */
  protected householdPeople(): ReturnType<typeof inviteCandidates> {
    return inviteCandidates(this.householdService.household()?.members ?? [], this.authService.userId() || null);
  }

  protected openHouseholdPage(): void {
    void this.router.navigate(['/household']);
  }

  toggleAttendee(userId: string): void {
    const list = this.eventDraft.attendeeIds;
    this.eventDraft.attendeeIds = list.includes(userId) ? list.filter((entry) => entry !== userId) : [...list, userId];
  }

  /** Si el borrador actual lleva picker visible: ver `attendeeIdsPayload`. */
  private eventAttendeesShown = false;

  closeEventModal(): void {
    this.isEventModalOpen.set(false);
  }

  /** Se abre desde la celda: el día ya viene elegido, que es lo que ahorra el tecleo. */
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
      /** `null` es «quitar la hora». Ausente es «no la toques»: confundirlas es el bug de antes. */
      startTime: string | null;
      endTime: string | null;
      attendeeIds?: string[];
      recurrence: HouseholdRecurrence;
    } = {
      title,
      kind: draft.kind,
      date: draft.date,
      allDay: draft.allDay,
      sharedWithHousehold: draft.sharedWithHousehold,
      color: draft.color ?? this.metaOf(draft.kind).color,
      location: draft.location.trim() || null,
      notes: draft.notes.trim() || null,
      startTime: draft.allDay ? null : draft.startTime || null,
      endTime: draft.allDay ? null : draft.endTime || null,
      recurrence: draft.recurrence
    };
    // Las caras van con el criterio del pure helper: lista vacia es «nadie invitado» SOLO si el picker
    // se vio; si no se vio, la clave no va y el servidor no toca la lista.
    Object.assign(body, attendeeIdsPayload(this.eventAttendeesShown, draft.attendeeIds));
    const saved = await this.calendarService.saveHouseholdEvent(body, draft.id);
    if (!saved) return;
    // Con recurrencia se vuelve a leer: lo que el servicio guarda en local es UNA fila, y los dias que
    // ocupa los calcula el servidor. Sin esto, crear «todos los dias» pintaba un dia y pareciera que no
    // se guardo nada. El parpadeo es el precio de no tener dos reglas de expansion (una aqui y otra alla).
    if (draft.recurrence !== 'none') this.calendarService.refreshHouseholdEvents();
    this.closeEventModal();
  }

  async removeEvent(): Promise<void> {
    const id = this.eventDraft.id;
    if (!id) return;
    const what = this.eventDraft.title.trim() || this.i18n.t('calendar.este_evento');
    // El aviso dice el alcance verdadero, que no es el que sugiere el boton: borrar el evento lo borra
    // para toda la casa. Para quitarselo de encima sin tocar a los demas existe «salir».
    const accepted = await this.confirmService.confirm({
      title: this.i18n.t('calendar.eliminar_evento'),
      // Con cadencia no se borra «el evento»: se borran todos sus dias, para toda la casa. El aviso lo
      // tiene que decir, que es la diferencia entre un clic y una discusion de pareja.
      message: this.i18n.t(
        this.eventDraft.recurrence === 'none'
          ? 'calendar.dejara_de_verse_para'
          : 'calendar.se_borra_toda_la_serie',
        { title: what }
      ),
      confirmText: this.i18n.t('common.delete'),
      variant: 'danger'
    });
    if (!accepted) return;
    const ok = await this.calendarService.removeHouseholdEvent(id);
    if (ok) {
      this.closeEventModal();
      this.toastService.show({ type: 'info', title: this.i18n.t('calendar.evento_borrado'), duration: 4000, countdown: true });
    }
  }

  /**
   * «Quitar solo este dia» (HOGARIA-SPEC 12t-R). Falta a un gimnasio de los martes no es dejar de ir los
   * martes, y hasta ahora la unica salida era borrar la serie entera o no decirlo.
   */
  async removeOccurrence(): Promise<void> {
    const draft = this.eventDraft;
    const date = draft.occurrenceDate;
    if (!draft.id || !date || draft.recurrence === 'none') return;
    const accepted = await this.confirmService.confirm({
      title: this.i18n.t('calendar.quitar_solo_este_dia'),
      message: this.i18n.t('calendar.se_quita_el_dia', {
        date,
        title: draft.title.trim() || this.i18n.t('calendar.este_evento')
      }),
      confirmText: this.i18n.t('calendar.quitar_solo_este_dia'),
      variant: 'danger'
    });
    if (!accepted) return;
    const ok = await this.calendarService.skipHouseholdOccurrence(draft.id, date);
    if (ok) {
      this.closeEventModal();
      this.toastService.show({
        type: 'info',
        title: this.i18n.t('calendar.dia_fuera_de_serie'),
        duration: 4000,
        countdown: true
      });
      return;
    }
    this.toastService.error(this.i18n.t('ui.error'), this.i18n.t('calendar.no_se_pudo_quitar'));
  }

  eventTimeLabel(event: HouseholdEvent): string {
    return eventTimeLabel(event);
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
