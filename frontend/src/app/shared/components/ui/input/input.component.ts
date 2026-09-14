import { Component, Input, Output, EventEmitter, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

export type InputType = 'text' | 'number' | 'email' | 'password' | 'search' | 'tel' | 'url' | 'date';
export type InputSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div [class]="getGroupClasses()">
      <label *ngIf="label" [for]="id" class="input__label">
        {{ label }}
        <span *ngIf="required" class="input__required">*</span>
      </label>
      
      <div class="input__wrapper">
        <span *ngIf="prefixIcon" class="input__icon input__icon--prefix">
          <ng-content select="[prefix]"></ng-content>
        </span>
        
        <input
          [id]="id"
          [type]="type"
          [placeholder]="placeholder"
          [disabled]="disabled"
          [readonly]="readonly"
          [required]="required"
          [value]="value"
          [class]="getInputClasses()"
          (input)="onInput($event)"
          (blur)="onBlur.emit($event)"
          (focus)="onFocus.emit($event)"
        />
        
        <span *ngIf="suffixIcon" class="input__icon input__icon--suffix">
          <ng-content select="[suffix]"></ng-content>
        </span>
        
        <button
          *ngIf="type === 'password' && showToggle"
          type="button"
          class="input__toggle"
          (click)="togglePassword()"
        >
          {{ showPassword ? '🙈' : '👁️' }}
        </button>
      </div>
      
      <span *ngIf="error" class="input__error">{{ error }}</span>
      <span *ngIf="helper && !error" class="input__helper">{{ helper }}</span>
    </div>
  `,
  styles: [`
    .input-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .input__label {
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      color: var(--text-primary);
    }

    .input__required {
      color: var(--error);
    }

    .input__wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .input {
      width: 100%;
      font-family: var(--font-sans);
      font-size: var(--text-base);
      line-height: var(--leading-normal);
      color: var(--text-primary);
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      transition: var(--transition-fast);

      &::placeholder {
        color: var(--text-tertiary);
      }

      &:hover:not(:disabled) {
        border-color: var(--border-strong);
      }

      &:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 3px var(--primary-subtle);
      }

      &--error {
        border-color: var(--error);

        &:focus {
          box-shadow: 0 0 0 3px var(--error-subtle);
        }
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        background: var(--bg-tertiary);
      }
    }

    /* Sizes */
    .input--sm {
      padding: var(--space-1) var(--space-2);
      font-size: var(--text-sm);
    }

    .input--md {
      padding: var(--space-2) var(--space-3);
    }

    .input--lg {
      padding: var(--space-3) var(--space-4);
      font-size: var(--text-lg);
    }

    /* With icons */
    .input--has-prefix {
      padding-left: var(--space-10);
    }

    .input--has-suffix {
      padding-right: var(--space-10);
    }

    .input__icon {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-tertiary);
      pointer-events: none;
    }

    .input__icon--prefix {
      left: var(--space-3);
    }

    .input__icon--suffix {
      right: var(--space-3);
    }

    .input__toggle {
      position: absolute;
      right: var(--space-3);
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      cursor: pointer;
      padding: var(--space-1);
      font-size: var(--text-lg);
    }

    .input__error {
      font-size: var(--text-xs);
      color: var(--error);
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    .input__helper {
      font-size: var(--text-xs);
      color: var(--text-tertiary);
    }

    /* Full width */
    .input-group--full-width {
      width: 100%;
    }
  `],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputComponent),
      multi: true
    }
  ]
})
export class InputComponent implements ControlValueAccessor {
  @Input() id = '';
  @Input() type: InputType = 'text';
  @Input() label = '';
  @Input() placeholder = '';
  @Input() helper = '';
  @Input() error = '';
  @Input() size: InputSize = 'md';
  @Input() disabled = false;
  @Input() readonly = false;
  @Input() required = false;
  @Input() prefixIcon = false;
  @Input() suffixIcon = false;
  @Input() showToggle = true;
  @Input() fullWidth = true;

  @Output() onBlur = new EventEmitter<Event>();
  @Output() onFocus = new EventEmitter<Event>();

  value = '';
  showPassword = false;

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string): void {
    this.value = value || '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.value = input.value;
    this.onChange(this.value);
    this.onTouched();
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
    this.type = this.showPassword ? 'text' : 'password';
  }

  getGroupClasses(): string {
    const classes = ['input-group'];
    if (this.fullWidth) classes.push('input-group--full-width');
    return classes.join(' ');
  }

  getInputClasses(): string {
    const classes = ['input', `input--${this.size}`];
    if (this.error) classes.push('input--error');
    if (this.prefixIcon) classes.push('input--has-prefix');
    if (this.suffixIcon || (this.type === 'password' && this.showToggle)) {
      classes.push('input--has-suffix');
    }
    return classes.join(' ');
  }
}
