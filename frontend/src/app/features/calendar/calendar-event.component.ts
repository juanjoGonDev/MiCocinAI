import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CalendarMeal, MEAL_TYPE_META } from '../../shared/models/calendar.model';

/**
 * Una comida dentro de la rejilla.
 *
 * `chip` (semana/día): bloque con acento de color, kcal y acciones al pasar por
 * encima. `row` (mes): una línea con punto de color —en Google Calendar el mes
 * no da para más— y sin acciones, que irían dentro del propio botón.
 *
 * El color va por tipo de comida (desayuno/almuerzo/cena/merienda) igual que los
 * calendarios de colores de Google: es la única seña que hace escaneable una
 * rejilla de 40 celdas sin ponerle texto extra.
 */
@Component({
  selector: 'app-calendar-event',
  standalone: true,
  imports: [CommonModule],
  host: {
    class: 'cal-event',
    '[attr.data-meal]': 'meal?.mealType',
    '[attr.data-mode]': 'mode',
    '[attr.data-done]': 'meal?.completed ? "true" : null'
  },
  template: `
    <button
      type="button"
      class="cal-event__open"
      [title]="tooltip()"
      (click)="open.emit()"
    >
      <span class="cal-event__marker" aria-hidden="true"></span>
      <span class="cal-event__time" *ngIf="meal?.time">{{ meal!.time }}</span>
      <span class="cal-event__name">{{ meal?.title }}</span>
      <span class="cal-event__kcal" *ngIf="mode !== 'row' && meal?.calories">{{ kcalLabel() }}</span>
    </button>

    <span class="cal-event__actions" *ngIf="mode !== 'row'">
      <button
        type="button"
        class="cal-event__action"
        [attr.aria-label]="meal?.completed ? 'Quitar de hechas' : 'Marcar como hecha'"
        [title]="meal?.completed ? 'Quitar de hechas' : 'Marcar como hecha'"
        (click)="toggle.emit()"
      >
        ✓
      </button>
      <button
        type="button"
        class="cal-event__action cal-event__action--danger"
        aria-label="Quitar comida"
        title="Quitar comida"
        (click)="remove.emit()"
      >
        ×
      </button>
    </span>
  `,
  styles: [`
    :host {
      position: relative;
      display: block;
      min-width: 0;

      --meal: var(--primary);
      --meal-tint: color-mix(in srgb, var(--primary) 12%, var(--bg-secondary));
    }

    :host([data-meal='breakfast']) {
      --meal: var(--warning);
      --meal-tint: color-mix(in srgb, var(--warning) 14%, var(--bg-secondary));
    }
    :host([data-meal='lunch']) {
      --meal: var(--primary);
      --meal-tint: color-mix(in srgb, var(--primary) 12%, var(--bg-secondary));
    }
    :host([data-meal='dinner']) {
      --meal: var(--info);
      --meal-tint: color-mix(in srgb, var(--info) 12%, var(--bg-secondary));
    }
    :host([data-meal='snack']) {
      --meal: var(--secondary);
      --meal-tint: color-mix(in srgb, var(--secondary) 13%, var(--bg-secondary));
    }

    .cal-event__open {
      display: flex;
      align-items: center;
      gap: 5px;
      width: 100%;
      min-width: 0;
      margin: 0;
      padding: 3px 6px 3px 0;
      font: inherit;
      font-size: var(--text-xs);
      line-height: 1.35;
      text-align: left;
      color: var(--text-primary);
      background: var(--meal-tint);
      border: none;
      border-radius: 5px;
      cursor: pointer;
      transition: background var(--duration-150) var(--ease-out), box-shadow var(--duration-150) var(--ease-out);
    }

    .cal-event__open:hover {
      background: color-mix(in srgb, var(--meal) 22%, var(--bg-secondary));
    }

    .cal-event__open:focus-visible {
      outline: 2px solid var(--meal);
      outline-offset: 1px;
    }

    /* Acento lateral, como los eventos de Google Calendar. */
    .cal-event__marker {
      flex: none;
      width: 3px;
      align-self: stretch;
      min-height: 14px;
      border-radius: 0 3px 3px 0;
      background: var(--meal);
    }

    .cal-event__time {
      flex: none;
      font-variant-numeric: tabular-nums;
      color: var(--text-secondary);
      font-size: 10px;
      letter-spacing: 0.02em;
    }

    .cal-event__name {
      flex: 1 1 auto;
      min-width: 0;
      font-weight: var(--font-medium);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .cal-event__kcal {
      flex: none;
      font-size: 10px;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
    }

    .cal-event__actions {
      position: absolute;
      top: 50%;
      right: 3px;
      transform: translateY(-50%);
      display: flex;
      gap: 2px;
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--duration-150) var(--ease-out);
    }

    :host:hover .cal-event__actions,
    :host:focus-within .cal-event__actions {
      opacity: 1;
      pointer-events: auto;
    }

    .cal-event__action {
      display: grid;
      place-items: center;
      width: 18px;
      height: 18px;
      padding: 0;
      font-size: 11px;
      line-height: 1;
      color: var(--text-secondary);
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-full);
      box-shadow: var(--shadow-xs);
      cursor: pointer;
      transition: var(--transition-fast);
    }

    .cal-event__action:hover {
      color: var(--text-primary);
      border-color: var(--border-strong);
    }

    .cal-event__action--danger:hover {
      color: var(--error);
      border-color: var(--error);
    }

    /* Hecho: se retira el color, el texto se apaga. Menos ruido, más lectura. */
    :host([data-done='true']) .cal-event__open {
      background: var(--bg-tertiary);
      color: var(--text-secondary);
    }
    :host([data-done='true']) .cal-event__name {
      text-decoration: line-through;
      text-decoration-thickness: 1px;
      font-weight: var(--font-normal);
    }
    :host([data-done='true']) .cal-event__marker {
      background: color-mix(in srgb, var(--meal) 45%, var(--bg-tertiary));
    }

    /* ── Modo línea (vista de mes) ── */
    :host([data-mode='row']) .cal-event__open {
      padding: 1px 4px 1px 0;
      background: transparent;
      border-radius: 4px;
      font-size: 11px;
    }
    :host([data-mode='row']) .cal-event__open:hover {
      background: var(--meal-tint);
    }
    :host([data-mode='row']) .cal-event__marker {
      display: none;
    }
    :host([data-mode='row']) .cal-event__time {
      font-size: 9px;
    }

    /* ── Modo tarjeta (vista de día) ── */
    :host([data-mode='full']) .cal-event__open {
      padding: 10px 12px 10px 0;
      border-radius: var(--radius-md);
      font-size: var(--text-sm);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--meal) 20%, transparent);
    }
    :host([data-mode='full']) .cal-event__marker {
      width: 4px;
      border-radius: 0 4px 4px 0;
      min-height: 30px;
    }
    :host([data-mode='full']) .cal-event__name {
      font-weight: var(--font-semibold);
      white-space: normal;
    }
    :host([data-mode='full']) .cal-event__time,
    :host([data-mode='full']) .cal-event__kcal {
      font-size: var(--text-xs);
    }
    :host([data-mode='full']) .cal-event__actions {
      position: static;
      transform: none;
      opacity: 1;
      pointer-events: auto;
      margin-left: 2px;
    }
    :host([data-mode='full']) {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
  `]
})
export class CalendarEventComponent {
  @Input() meal: CalendarMeal | null = null;
  /** `chip` (semana) · `row` (mes) · `full` (día). */
  @Input() mode: 'chip' | 'row' | 'full' = 'chip';

  @Output() open = new EventEmitter<void>();
  @Output() toggle = new EventEmitter<void>();
  @Output() remove = new EventEmitter<void>();

  kcalLabel(): string {
    const calories = this.meal?.calories ?? 0;
    const servings = this.meal?.servings ?? 1;
    return `${Math.round(calories * servings).toLocaleString('es-ES')} kcal`;
  }

  /** El detalle que en el mes no cabe, por tooltip. */
  tooltip(): string {
    const meal = this.meal;
    if (!meal) return '';
    const parts = [MEAL_TYPE_META[meal.mealType]?.label ?? '', meal.title];
    if (meal.time) parts.push(meal.time);
    if (meal.calories) parts.push(this.kcalLabel());
    if (meal.completed) parts.push('hecha');
    return parts.filter(Boolean).join(' · ');
  }
}
