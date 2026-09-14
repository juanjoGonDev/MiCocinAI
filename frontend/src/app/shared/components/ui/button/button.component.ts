import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      [class]="getClasses()"
      [disabled]="disabled || loading"
      [type]="type"
      (click)="onClick.emit($event)"
    >
      <span *ngIf="loading" class="btn__spinner"></span>
      <ng-content></ng-content>
    </button>
  `,
  styles: [`
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      font-family: var(--font-sans);
      font-weight: var(--font-medium);
      line-height: var(--leading-none);
      border: 1px solid transparent;
      border-radius: var(--radius-lg);
      cursor: pointer;
      transition: var(--transition-fast);
      user-select: none;
      white-space: nowrap;
      position: relative;

      &:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    /* Sizes */
    .btn--sm {
      padding: var(--space-1) var(--space-3);
      font-size: var(--text-xs);
      border-radius: var(--radius-md);
    }

    .btn--md {
      padding: var(--space-2) var(--space-4);
      font-size: var(--text-sm);
    }

    .btn--lg {
      padding: var(--space-3) var(--space-6);
      font-size: var(--text-base);
      border-radius: var(--radius-xl);
    }

    .btn--icon {
      padding: var(--space-2);
      aspect-ratio: 1;
    }

    /* Variants */
    .btn--primary {
      background: var(--primary);
      color: var(--white);
      box-shadow: var(--shadow-sm);

      &:hover:not(:disabled) {
        background: var(--primary-dark);
        box-shadow: var(--shadow-md);
        transform: translateY(-1px);
      }

      &:active:not(:disabled) {
        transform: translateY(0);
      }
    }

    .btn--secondary {
      background: var(--secondary);
      color: var(--white);
      box-shadow: var(--shadow-sm);

      &:hover:not(:disabled) {
        background: var(--secondary-dark);
        box-shadow: var(--shadow-md);
        transform: translateY(-1px);
      }
    }

    .btn--outline {
      background: transparent;
      color: var(--text-primary);
      border-color: var(--border-default);

      &:hover:not(:disabled) {
        background: var(--bg-tertiary);
        border-color: var(--border-strong);
      }
    }

    .btn--ghost {
      background: transparent;
      color: var(--text-secondary);

      &:hover:not(:disabled) {
        background: var(--bg-tertiary);
        color: var(--text-primary);
      }
    }

    .btn--danger {
      background: var(--error);
      color: var(--white);

      &:hover:not(:disabled) {
        background: var(--color-error-700);
      }
    }

    /* Loading spinner */
    .btn__spinner {
      width: 1em;
      height: 1em;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: var(--radius-full);
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `]
})
export class ButtonComponent {
  @Input() variant: ButtonVariant = 'primary';
  @Input() size: ButtonSize = 'md';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() fullWidth = false;

  @Output() onClick = new EventEmitter<Event>();

  getClasses(): string {
    const classes = ['btn', `btn--${this.variant}`, `btn--${this.size}`];
    if (this.fullWidth) classes.push('btn--full-width');
    if (this.loading) classes.push('btn--loading');
    return classes.join(' ');
  }
}
