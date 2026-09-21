import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../button/button.component';
import { ChipOption } from '../../../models/taste-profile';

/**
 * Lista de opciones en formato chip, de una o varias selecciones, con hueco
 * para escribir lo que no esté en la lista.
 *
 * Los valores son texto plano (lo que se envía a la IA tal cual), así que
 * «Frutos secos» vale tanto si viene del catálogo de alérgenos como si lo ha
 * escrito el usuario.
 */
@Component({
  selector: 'app-chip-select',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  template: `
    <div class="chip-select" role="group" [attr.aria-label]="label">
      <div class="chip-select__list">
        <button
          *ngFor="let option of choices"
          type="button"
          class="chip-select__chip"
          [class.chip-select__chip--on]="isSelected(option.value)"
          [attr.aria-pressed]="isSelected(option.value)"
          (click)="toggle(option.value)"
        >
          <span class="chip-select__icon" *ngIf="option.icon">{{ option.icon }}</span>
          <span class="chip-select__text">{{ option.value }}</span>
          <span class="chip-select__x" *ngIf="isCustom(option.value)" aria-hidden="true">×</span>
        </button>
      </div>

      <div class="chip-select__add" *ngIf="allowCustom">
        <input
          type="text"
          class="chip-select__input"
          name="chip-select-custom"
          [placeholder]="customPlaceholder"
          [attr.aria-label]="customLabel"
          [(ngModel)]="customText"
          (keyup.enter)="$event.preventDefault(); addCustom()"
        />
        <app-button variant="ghost" size="sm" (onClick)="addCustom()">Añadir</app-button>
      </div>

      <p class="chip-select__hint" *ngIf="hint">{{ hint }}</p>
    </div>
  `,
  styles: [
    `
      .chip-select {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .chip-select__list {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
      }
      .chip-select__chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: var(--space-1) var(--space-3);
        font-family: var(--font-sans);
        font-size: var(--text-sm);
        color: var(--text-secondary);
        background: var(--bg-secondary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-full);
        cursor: pointer;
        transition: var(--transition-fast);
        user-select: none;
        &:hover {
          border-color: var(--border-strong);
          color: var(--text-primary);
        }
        &--on {
          background: var(--primary-subtle);
          border-color: var(--primary);
          color: var(--primary-dark);
          font-weight: var(--font-medium);
        }
      }
      .chip-select__icon {
        font-size: var(--text-base);
        line-height: 1;
      }
      .chip-select__x {
        font-size: var(--text-xs);
        opacity: 0.7;
      }
      .chip-select__add {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }
      .chip-select__input {
        flex: 1;
        min-width: 0;
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
      .chip-select__hint {
        margin: 0;
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
    `
  ]
})
export class ChipSelectComponent {
  /** Opciones propuestas (las ya elegidas se muestran aunque no estén aquí). */
  @Input() options: ChipOption[] = [];
  @Input() value: string[] = [];
  @Output() valueChange = new EventEmitter<string[]>();

  @Input() label = '';
  @Input() hint = '';
  @Input() allowCustom = true;
  @Input() customPlaceholder = 'Escribe el tuyo';
  @Input() customLabel = 'Añadir opción propia';

  customText = '';

  /** Predefinidas + las que haya escrito el usuario. */
  get choices(): ChipOption[] {
    const base = this.options.filter(
      (option, index) => this.options.findIndex((other) => other.value === option.value) === index
    );
    const extras = this.value
      .filter((item) => !base.some((option) => option.value === item))
      .map((value) => ({ value, icon: '✏️' }));
    return [...base, ...extras];
  }

  isSelected(value: string): boolean {
    return this.value.includes(value);
  }

  /** Una opción escrita a mano se quita con la propia chip (con la ×). */
  isCustom(value: string): boolean {
    return !this.options.some((option) => option.value === value);
  }

  toggle(value: string): void {
    this.emit(
      this.isSelected(value) ? this.value.filter((item) => item !== value) : [...this.value, value]
    );
  }

  addCustom(): void {
    const text = this.customText.trim();
    if (!text) return;

    if (!this.value.some((item) => item.toLowerCase() === text.toLowerCase())) {
      this.emit([...this.value, text]);
    }
    this.customText = '';
  }

  private emit(next: string[]): void {
    this.value = next;
    this.valueChange.emit(next);
  }
}
