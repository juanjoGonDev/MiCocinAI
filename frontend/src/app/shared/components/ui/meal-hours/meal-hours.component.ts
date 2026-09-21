import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MEAL_ORDER,
  MEAL_TIME_DEFAULTS,
  MEAL_TYPE_LABELS,
  MealTimes,
  MealType
} from '../../../models/calendar.model';

interface MealHourRow {
  type: MealType;
  /** `#meal-dinner`, `#ob-meal-dinner`: lo que buscan los e2e. */
  id: string;
  label: string;
  hint?: string;
}

/**
 * Las cuatro horas de la casa, escritas una sola vez.
 *
 * Existian dos copias del mismo bloque —el paso del tour y Preferencias— y la segunda habia
 * «mejorado» a medias: el tour guardaba el cambio pero el boton de guardar no se enteraba. Un
 * componente en vez de dos hojas de estilos es lo que hace que «por defecto» signifique lo mismo en
 * las dos pantallas.
 *
 * **Escribe dentro del objeto del host.** No emite una copia: el host es dueno de `times` y lo compara
 * contra su snapshot para saber si hay cambios (Preferencias) o para decidir el parche que manda (el
 * tour). Si esto emitiera un objeto nuevo, el `savedSnapshot` de Preferencias seguiria siendo viejo y
 * «hay cambios» mentiria —que es justo el bug que habia.
 *
 * `idPrefix` no es decoracion: los ids acaban siendo `#meal-dinner` y `#ob-meal-dinner`, que son los
 * que buscan los e2e. Esos dos prefijos son el contrato entre «la misma pantalla en dos sitios» y «dos
 * controles distintos que se llaman igual».
 */
@Component({
  selector: 'app-meal-hours',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="meal-hours" role="group" [attr.aria-label]="groupLabel">
      <div class="meal-hours__row" *ngFor="let row of rows">
        <label class="meal-hours__label" [attr.for]="row.id">{{ row.label }}</label>
        <input
          type="time"
          class="meal-hours__input"
          [id]="row.id"
          [name]="row.id"
          [attr.data-test]="dataTest ? dataTest + '-' + row.type : null"
          [attr.aria-describedby]="row.hint ? row.id + '-hint' : null"
          [ngModel]="times[row.type]"
          (ngModelChange)="write(row.type, $event)"
        />
        <!-- Vaciar un input de hora no es una decision, asi que aqui no se explica: se pulsa el boton. -->
        <button
          *ngIf="isDefault(row.type)"
          type="button"
          class="meal-hours__reset"
          [attr.data-test]="dataTest ? dataTest + '-reset-' + row.type : null"
          (click)="reset(row.type)"
        >
          Por defecto
        </button>
        <span class="meal-hours__state" *ngIf="!isDefault(row.type)">{{ defaults[row.type] }}</span>
        <p class="meal-hours__hint" *ngIf="row.hint" [id]="row.id + '-hint'">
          {{ hints[row.type] }}
        </p>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .meal-hours {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .meal-hours__row {
        display: grid;
        grid-template-columns: 1fr auto auto;
        align-items: center;
        column-gap: var(--space-3);
        row-gap: var(--space-1);
      }

      .meal-hours__label {
        font-size: var(--text-sm);
        font-weight: var(--font-medium);
        color: var(--text-primary);
      }

      /* La misma receta que la de app-input: si el control se ve distinto, se comporta distinto en la
         cabeza de quien lo mira. Y dentro de un literal de plantilla no pueden aparecer backticks. */
      .meal-hours__input {
        min-width: 8.5rem;
        padding: var(--space-2) var(--space-3);
        font-family: var(--font-sans);
        font-size: var(--text-base);
        line-height: var(--leading-normal);
        color: var(--text-primary);
        background: var(--bg-secondary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        transition: var(--transition-fast);
      }

      .meal-hours__input:hover {
        border-color: var(--border-strong);
      }

      .meal-hours__input:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 3px var(--primary-subtle);
      }

      .meal-hours__reset {
        padding: var(--space-1) var(--space-2);
        font-size: var(--text-xs);
        font-weight: var(--font-medium);
        color: var(--text-secondary);
        background: transparent;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-full);
        transition: var(--transition-fast);
      }

      .meal-hours__reset:hover {
        color: var(--primary-dark);
        background: var(--primary-subtle);
        border-color: var(--primary);
      }

      /* «20:30» a secas, sin verbo, cuando la hora ya es la de siempre: no es un boton, no pide nada. */
      .meal-hours__state {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
        min-width: 5.5rem;
        text-align: right;
      }

      .meal-hours__hint {
        grid-column: 1 / -1;
        margin: 0;
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }

      @media (prefers-reduced-motion: reduce) {
        .meal-hours__input,
        .meal-hours__reset {
          transition: none;
        }
      }
    `,
  ],
})
export class MealHoursComponent {
  @Input({required: true}) times!: MealTimes;
  /** Prefijo de los ids: `meal` en Preferencias, `ob-meal` en el tour. */
  @Input() idPrefix = 'meal';
  /** Un `data-test` por fila (`...-<tipo>`), para los e2e que ya existen. */
  @Input() dataTest: string | null = null;
  @Input() groupLabel = 'Horarios de las comidas';
  readonly defaults = MEAL_TIME_DEFAULTS;
  readonly hints: Partial<Record<MealType, string>> = {};

  get rows(): MealHourRow[] {
    return MEAL_ORDER.map((type) => ({
      type,
      id: `${this.idPrefix}-${type}`,
      label: MEAL_TYPE_LABELS[type],
      hint: this.hints[type]
    }));
  }

  /** `true` cuando la hora **no** es la de siempre: ahi es donde «Por defecto» tiene algo que hacer. */
  isNotDefault(type: MealType): boolean {
    const value = this.times?.[type];
    return !!value?.trim() && value !== MEAL_TIME_DEFAULTS[type];
  }

  /** El nombre del template sale al reves de la pregunta (evita el `!` en la plantilla). */
  isDefault(type: MealType): boolean {
    return !this.isNotDefault(type);
  }

  write(type: MealType, value: string): void {
    this.times[type] = value ?? '';
  }

  reset(type: MealType): void {
    this.times[type] = MEAL_TIME_DEFAULTS[type];
  }
}
