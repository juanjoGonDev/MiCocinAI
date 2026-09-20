import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CalendarDayView,
  CalendarMeal,
  MealType,
  MEAL_ORDER,
  MEAL_TYPE_META
} from '../../shared/models/calendar.model';
import { formatNumber } from './calendar.util';
import { CalendarHouseholdEventsComponent } from './calendar-household-events.component';
import { HouseholdEvent } from '../../shared/models/calendar.model';
import { CalendarEventComponent } from './calendar-event.component';

/**
 * Vista de día: cada franja con su sitio, para poder leer y editar sin
 * microscopio. Es lo que en Google Calendar es la columna del día seleccionado.
 */
@Component({
  selector: 'app-calendar-day',
  standalone: true,
  imports: [CommonModule, CalendarHouseholdEventsComponent, CalendarEventComponent],
  template: `
    <div class="cal-day" *ngIf="day as d">
      <div class="cal-day__list">
        <ng-container *ngIf="kitchen; else dayAgenda">
        <section
          *ngFor="let type of mealTypes; trackBy: trackByType"
          class="cal-band"
          [attr.data-meal]="type"
          [class.is-empty]="d.slots[type].length === 0"
        >
          <header class="cal-band__head">
            <span class="cal-band__marker" aria-hidden="true"></span>
            <h2 class="cal-band__title">{{ MEAL_TYPE_META[type].label }}</h2>
            <span class="cal-band__meta">
              <ng-container *ngIf="slotCalories(d, type) as kcal">
                {{ fmt(kcal) }} kcal ·
              </ng-container>
              {{ count(d, type) }} {{ count(d, type) === 1 ? 'plato' : 'platos' }}
            </span>
            <button
              type="button"
              class="cal-band__add"
              (click)="addMeal.emit({ date: d.iso, mealType: type })"
            >
              + Añadir
            </button>
          </header>

          <div class="cal-band__body">
            <app-calendar-household-events
              *ngIf="type === 'lunch' && d.events.length"
              [events]="d.events"
              (edit)="editEvent.emit($event)"
            />

            <app-calendar-event
              *ngFor="let meal of d.slots[type]; trackBy: trackByMealId"
              mode="full"
              [meal]="meal"
              (open)="openMeal.emit(meal)"
              (toggle)="toggleMeal.emit(meal)"
              (remove)="removeMeal.emit(meal)"
            ></app-calendar-event>

            <p class="cal-band__empty" *ngIf="d.slots[type].length === 0">
              Nada por aquí.
              <button type="button" class="cal-link" (click)="addMeal.emit({ date: d.iso, mealType: type })">
                Añadir {{ MEAL_TYPE_META[type].label.toLowerCase() }}
              </button>
            </p>
          </div>
        </section>
        </ng-container>

        <!-- Lo mismo que en la semana: sin cocina el dia no tiene bandas de comida, tiene agenda.
             El aside (energia, comidas, objetivo) se queda fuera: es el recuento de la cocina. -->
        <ng-template #dayAgenda>
          <section class="cal-band cal-band--agenda">
            <header class="cal-band__head">
              <span class="cal-band__marker" aria-hidden="true"></span>
              <h2 class="cal-band__title">Agenda</h2>
              <span class="cal-band__meta">{{ d.events.length }} {{ d.events.length === 1 ? 'plan' : 'planes' }}</span>
            </header>
            <div class="cal-band__body">
              <app-calendar-household-events [events]="d.events" (edit)="editEvent.emit($event)" />
              <p class="cal-band__empty" *ngIf="d.events.length === 0">Nada por aquí.</p>
            </div>
          </section>
        </ng-template>
      </div>

      <aside class="cal-day__aside" *ngIf="kitchen">
        <h3 class="cal-day__aside-title">Resumen del día</h3>

        <div class="cal-day__stat">
          <span class="cal-day__stat-label">Energía</span>
          <span class="cal-day__stat-value">
            {{ fmt(d.calories) }}
            <small>/ {{ fmt(targetCalories) }} kcal</small>
          </span>
          <div class="cal-day__track">
            <span [style.width.%]="percent()"></span>
          </div>
          <span class="cal-day__stat-note" *ngIf="!d.hasNutrition">
            Las calorías salen de las recetas del recetario; lo escrito a mano no las aporta.
          </span>
        </div>

        <div class="cal-day__stat">
          <span class="cal-day__stat-label">Comidas</span>
          <span class="cal-day__stat-value">
            {{ d.planned }}<small>/ {{ mealTypes.length }}</small>
          </span>
          <div class="cal-day__track">
            <span class="is-alt" [style.width.%]="(d.planned / mealTypes.length) * 100"></span>
          </div>
        </div>

        <dl class="cal-day__facts">
          <div *ngIf="goalLabel">
            <dt>Objetivo</dt>
            <dd>{{ goalLabel }}</dd>
          </div>
          <div>
            <dt>Hechas</dt>
            <dd>{{ d.done }} de {{ d.planned }}</dd>
          </div>
        </dl>
      </aside>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      border-top: 1px solid var(--border-default);
    }

    .cal-day {
      display: grid;
      gap: var(--space-5);
      padding: var(--space-4);
    }

    @media (min-width: 1024px) {
      .cal-day {
        grid-template-columns: minmax(0, 1fr) 248px;
        align-items: start;
        padding: var(--space-5) var(--space-6);
      }
    }

    .cal-day__list {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      min-width: 0;
    }

    /* ── Banda por tipo de comida ── */
    .cal-band {
      --meal: var(--primary);
      display: grid;
      gap: var(--space-2);
      padding: var(--space-3);
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      transition: border-color var(--duration-150) var(--ease-out);
    }

    .cal-band:hover {
      border-color: var(--border-strong);
    }

    .cal-band[data-meal='breakfast'] { --meal: var(--warning); }
    .cal-band[data-meal='lunch'] { --meal: var(--primary); }
    .cal-band[data-meal='dinner'] { --meal: var(--info); }
    .cal-band[data-meal='snack'] { --meal: var(--secondary); }

    .cal-band__head {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
    }

    .cal-band__marker {
      flex: none;
      width: 3px;
      height: 16px;
      border-radius: var(--radius-full);
      background: var(--meal);
    }

    .cal-band__title {
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      font-weight: var(--font-semibold);
      letter-spacing: 0.01em;
    }

    .cal-band__meta {
      font-size: var(--text-xs);
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
    }

    .cal-band__add {
      margin-left: auto;
      padding: 3px 10px;
      font: inherit;
      font-size: var(--text-xs);
      color: var(--text-secondary);
      background: none;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-full);
      cursor: pointer;
      transition: var(--transition-fast);
    }

    .cal-band__add:hover {
      color: var(--primary-dark);
      border-color: var(--primary);
      background: color-mix(in srgb, var(--primary) 8%, transparent);
    }

    .cal-band__body {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 0;
    }

    .cal-band__empty {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      margin: 0;
      padding: var(--space-2) var(--space-1);
      font-size: var(--text-sm);
      color: var(--text-tertiary);
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

    /* ── Resumen lateral ── */
    .cal-day__aside {
      display: grid;
      gap: var(--space-4);
      padding: var(--space-4);
      background: color-mix(in srgb, var(--bg-tertiary) 55%, var(--bg-secondary));
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
    }

    @media (max-width: 1023px) {
      .cal-day {
        grid-template-columns: minmax(0, 1fr);
      }
      .cal-day__aside {
        order: -1;
      }
    }

    .cal-day__aside-title {
      font-family: var(--font-sans);
      font-size: var(--text-xs);
      font-weight: var(--font-semibold);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-secondary);
    }

    .cal-day__stat {
      display: grid;
      gap: 4px;
    }

    .cal-day__stat-label {
      font-size: var(--text-xs);
      color: var(--text-secondary);
    }

    .cal-day__stat-value {
      font-size: var(--text-xl);
      font-weight: var(--font-semibold);
      font-variant-numeric: tabular-nums;
      line-height: 1.1;
    }

    .cal-day__stat-value small {
      font-size: var(--text-xs);
      font-weight: var(--font-normal);
      color: var(--text-secondary);
    }

    .cal-day__stat-note {
      font-size: 10px;
      line-height: 1.45;
      color: var(--text-tertiary);
    }

    .cal-day__track {
      height: 4px;
      margin-top: 2px;
      background: var(--border-default);
      border-radius: var(--radius-full);
      overflow: hidden;
    }

    .cal-day__track > span {
      display: block;
      height: 100%;
      background: var(--primary);
      border-radius: inherit;
      transition: width var(--duration-300) var(--ease-out);
    }

    .cal-day__track > .is-alt {
      background: var(--secondary);
    }

    .cal-day__facts {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding-top: var(--space-1);
      border-top: 1px solid var(--border-default);
    }

    .cal-day__facts > div {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .cal-day__facts dt {
      font-size: var(--text-xs);
      color: var(--text-secondary);
    }

    .cal-day__facts dd {
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      text-align: right;
    }
  `]
})
export class CalendarDayComponent {
  @Input() day: CalendarDayView | null = null;
  /** `false` = sin modulo de cocina: el dia muestra la agenda y nada de recuento energetico. */
  @Input() kitchen = true;
  @Input() targetCalories = 2000;
  @Input() goalLabel = '';

  @Output() addMeal = new EventEmitter<{ date: string; mealType: MealType }>();
  @Output() openMeal = new EventEmitter<CalendarMeal>();
  @Output() toggleMeal = new EventEmitter<CalendarMeal>();
  @Output() removeMeal = new EventEmitter<CalendarMeal>();
  @Output() editEvent = new EventEmitter<HouseholdEvent>();

  readonly mealTypes = MEAL_ORDER;
  readonly MEAL_TYPE_META = MEAL_TYPE_META;

  slotCalories(day: CalendarDayView, type: MealType): number {
    return Math.round(
      day.slots[type].reduce((sum, meal) => sum + (meal.calories ?? 0) * (meal.servings || 1), 0)
    );
  }

  count(day: CalendarDayView, type: MealType): number {
    return day.slots[type].length;
  }

  /** Porcentaje del objetivo de calorías, recortado a [0, 100] para la barra. */
  fmt(value: number): string {
    return formatNumber(value);
  }

  percent(): number {
    if (!this.day || !this.targetCalories) return 0;
    return Math.max(0, Math.min(100, (this.day.calories / this.targetCalories) * 100));
  }

  trackByType(_i: number, type: MealType): string {
    return type;
  }

  trackByMealId(_i: number, meal: CalendarMeal): string {
    return meal.id;
  }
}
