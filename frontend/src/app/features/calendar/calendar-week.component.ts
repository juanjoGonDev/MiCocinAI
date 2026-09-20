import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CalendarDayView,
  CalendarMeal,
  MealType,
  MEAL_ORDER,
  MEAL_TYPE_META
} from '../../shared/models/calendar.model';
import { formatNumber, labels } from './calendar.util';
import { CalendarHouseholdEventsComponent } from './calendar-household-events.component';
import { HouseholdEvent } from '../../shared/models/calendar.model';
import { CalendarEventComponent } from './calendar-event.component';

/**
 * Vista de semana: siete columnas con las cuatro franjas de comida de cada día.
 *
 * Cabecera fija y cuerpo con scroll, como en Google Calendar. No hay eje de
 * horas porque aquí lo que ordena el día es el tipo de comida; el tiempo libre
 * de cada franja es donde se pulsa para añadir.
 */
@Component({
  selector: 'app-calendar-week',
  standalone: true,
  imports: [CommonModule, CalendarHouseholdEventsComponent, CalendarEventComponent],
  template: `
    <div class="cal-week">
      <!-- Cabecera de días -->
      <div class="cal-week__head">
        <div
          *ngFor="let day of days; trackBy: trackByIso"
          class="cal-dayhead"
          [class.is-today]="day.isToday"
          [class.is-weekend]="isWeekend(day)"
          [class.is-empty]="kitchen && day.planned === 0"
        >
          <button
            type="button"
            class="cal-dayhead__day"
            [attr.aria-current]="day.isToday ? 'date' : null"
            [title]="'Ver el ' + labels.fullDate(day.date)"
            (click)="openDay.emit(day.iso)"
          >
            <span class="cal-dayhead__dow">{{ labels.dayOfWeekShort(day.date) }}</span>
            <span class="cal-dayhead__num">{{ day.date.getDate() }}</span>
          </button>
          <span class="cal-dayhead__meta">
            <ng-container *ngIf="day.planned > 0; else nothing">
              {{ day.planned }} {{ day.planned === 1 ? 'comida' : 'comidas' }}
              <ng-container *ngIf="day.hasNutrition"> · {{ fmt(day.calories) }} kcal</ng-container>
            </ng-container>
            <ng-template #nothing>—</ng-template>
          </span>
        </div>
      </div>

      <!-- Franjas -->
      <div class="cal-week__body">
        <div
          *ngFor="let day of days; trackBy: trackByIso"
          class="cal-col"
          [class.is-today]="day.isToday"
          [class.is-weekend]="isWeekend(day)"
        >
          <ng-container *ngIf="kitchen; else weekAgenda">
          <div
            *ngFor="let type of mealTypes"
            class="meal-slot"
            [class.meal-slot--filled]="day.slots[type].length > 0"
            [attr.data-meal]="type"
            (click)="onSlotClick(day, type)"
          >
            <div class="meal-slot__head">
              <span class="meal-slot__label">{{ MEAL_TYPE_META[type].label }}</span>
              <button
                type="button"
                class="meal-slot__plus"
                [attr.aria-label]="'Añadir ' + MEAL_TYPE_META[type].label.toLowerCase() + ' el ' + labels.dayOfMonth(day.date)"
                (click)="$event.stopPropagation(); addMeal.emit({ date: day.iso, mealType: type })"
              >
                +
              </button>
            </div>

            <app-calendar-household-events
              *ngIf="type === 'breakfast' && day.events.length"
              [events]="day.events"
              (edit)="editEvent.emit($event)"
            />

            <app-calendar-event
              *ngFor="let meal of day.slots[type]; trackBy: trackByMealId"
              [meal]="meal"
              (open)="openMeal.emit(meal)"
              (toggle)="toggleMeal.emit(meal)"
              (remove)="removeMeal.emit(meal)"
            ></app-calendar-event>

            <span *ngIf="day.slots[type].length === 0" class="meal-slot__hint">Sin planificar</span>
          </div>
          </ng-container>

          <!-- Sin cocina la semana no es una rejilla de franjas de comida: es la agenda del dia,
               una fila por dia. Se reutiliza la clase meal-slot para que el alto y los bordes no
               cambien de una modalidad a otra. (Y nada de backticks aqui: cierran el literal.) -->
          <ng-template #weekAgenda>
            <div class="meal-slot meal-slot--agenda">
              <app-calendar-household-events [events]="day.events" (edit)="editEvent.emit($event)" />
              <span *ngIf="day.events.length === 0" class="meal-slot__hint">Nada en la agenda</span>
            </div>
          </ng-template>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      --cal-col-min: 132px;
    }

    .cal-week {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      border-top: 1px solid var(--border-default);
      overflow: hidden;
    }

    .cal-week__head,
    .cal-week__body {
      display: grid;
      grid-template-columns: repeat(7, minmax(var(--cal-col-min), 1fr));
      min-width: 100%;
    }

    .cal-week__head {
      position: sticky;
      top: 0;
      z-index: 3;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-default);
    }

    .cal-week__body {
      overflow: visible;
    }

    /* ── Cabecera de día ── */
    .cal-dayhead {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: var(--space-2) var(--space-1) 6px;
      border-right: 1px solid var(--border-default);
    }

    .cal-dayhead:last-child {
      border-right: none;
    }

    .cal-dayhead__day {
      display: flex;
      align-items: baseline;
      gap: 5px;
      padding: 2px 8px;
      font: inherit;
      color: inherit;
      background: none;
      border: none;
      border-radius: var(--radius-full);
      cursor: pointer;
      transition: background var(--duration-150) var(--ease-out);
    }

    .cal-dayhead__day:hover {
      background: var(--bg-tertiary);
    }

    .cal-dayhead__day:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 1px;
    }

    .cal-dayhead__dow {
      font-size: 10px;
      font-weight: var(--font-semibold);
      letter-spacing: 0.06em;
      color: var(--text-secondary);
    }

    .cal-dayhead__num {
      display: grid;
      place-items: center;
      min-width: 22px;
      height: 22px;
      font-size: var(--text-base);
      font-weight: var(--font-medium);
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;
    }

    .is-today .cal-dayhead__num {
      color: var(--text-inverse);
      background: var(--primary);
      border-radius: var(--radius-full);
    }

    .is-today .cal-dayhead__dow {
      color: var(--primary-dark);
    }

    .cal-dayhead__meta {
      font-size: 10px;
      color: var(--text-tertiary);
      font-variant-numeric: tabular-nums;
    }

    .cal-dayhead.is-empty .cal-dayhead__meta {
      opacity: 0.6;
    }

    /* ── Columna ── */
    .cal-col {
      display: flex;
      flex-direction: column;
      border-right: 1px solid var(--border-default);
      background: var(--bg-secondary);
    }

    .cal-col:last-child {
      border-right: none;
    }

    .cal-col.is-weekend {
      background: color-mix(in srgb, var(--bg-tertiary) 55%, var(--bg-secondary));
    }

    .cal-col.is-today {
      background: color-mix(in srgb, var(--primary) 4%, var(--bg-secondary));
    }

    /* ── Franja de comida ── */
    .meal-slot {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-height: 74px;
      padding: 5px 6px 7px;
      border-bottom: 1px solid color-mix(in srgb, var(--border-default) 60%, transparent);
      cursor: pointer;
      transition: background var(--duration-150) var(--ease-out);
    }

    .meal-slot:hover {
      background: color-mix(in srgb, var(--bg-tertiary) 70%, transparent);
    }

    .meal-slot--filled {
      cursor: default;
    }

    .meal-slot__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-1);
    }

    .meal-slot__label {
      font-size: 9px;
      font-weight: var(--font-semibold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-tertiary);
    }

    .meal-slot__plus {
      display: grid;
      place-items: center;
      width: 16px;
      height: 16px;
      padding: 0;
      font-size: 12px;
      line-height: 1;
      color: var(--text-secondary);
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-full);
      opacity: 0;
      cursor: pointer;
      transition: var(--transition-fast);
    }

    .meal-slot:hover .meal-slot__plus,
    .meal-slot__plus:focus-visible {
      opacity: 1;
    }

    .meal-slot__plus:hover {
      color: var(--primary-dark);
      border-color: var(--primary);
    }

    .meal-slot__hint {
      font-size: 10px;
      color: var(--text-tertiary);
      opacity: 0;
      transition: opacity var(--duration-150) var(--ease-out);
    }

    .meal-slot:hover .meal-slot__hint {
      opacity: 1;
    }

    /* En pantallas estrechas la semana se desplaza, como en el móvil de Google. */
    @media (max-width: 1023px) {
      :host {
        overflow-x: auto;
        display: block;
      }
      .cal-week {
        min-width: calc(var(--cal-col-min) * 7);
      }
      .meal-slot__plus,
      .meal-slot__hint {
        opacity: 1;
      }
    }
  `]
})
export class CalendarWeekComponent {
  @Input() days: CalendarDayView[] = [];
  /** Con la cocina apagada la rejilla de franjas se convierte en una lista por dia. */
  @Input() kitchen = true;

  @Output() addMeal = new EventEmitter<{ date: string; mealType: MealType }>();
  @Output() openMeal = new EventEmitter<CalendarMeal>();
  @Output() toggleMeal = new EventEmitter<CalendarMeal>();
  @Output() removeMeal = new EventEmitter<CalendarMeal>();
  @Output() openDay = new EventEmitter<string>();
  @Output() editEvent = new EventEmitter<HouseholdEvent>();

  readonly mealTypes = MEAL_ORDER;
  readonly MEAL_TYPE_META = MEAL_TYPE_META;
  readonly labels = labels;

  /** El hueco se pincha para rellenarlo; una franja con comidas se edita desde su bloque. */
  onSlotClick(day: CalendarDayView, type: MealType): void {
    if (day.slots[type].length === 0) this.addMeal.emit({ date: day.iso, mealType: type });
  }

  fmt(value: number): string {
    return formatNumber(value);
  }

  isWeekend(day: CalendarDayView): boolean {
    return day.date.getDay() === 0 || day.date.getDay() === 6;
  }

  trackByIso(_i: number, day: CalendarDayView): string {
    return day.iso;
  }

  trackByMealId(_i: number, meal: CalendarMeal): string {
    return meal.id;
  }
}
