import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type BadgeVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'neutral';
export type BadgeSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span [class]="getClasses()">
      <span *ngIf="dot" class="badge__dot"></span>
      <ng-content></ng-content>
    </span>
  `,
  styles: [`
    .badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      font-weight: var(--font-medium);
      line-height: var(--leading-none);
      border-radius: var(--radius-full);
      white-space: nowrap;
    }

    /* Sizes */
    .badge--sm {
      padding: 2px var(--space-1);
      font-size: 10px;
    }

    .badge--md {
      padding: var(--space-1) var(--space-2);
      font-size: var(--text-xs);
    }

    .badge--lg {
      padding: var(--space-1) var(--space-3);
      font-size: var(--text-sm);
    }

    /* Variants */
    .badge--primary {
      background: var(--primary-subtle);
      color: var(--primary-dark);
    }

    .badge--secondary {
      background: var(--secondary-subtle);
      color: var(--secondary-dark);
    }

    .badge--success {
      background: var(--success-subtle);
      color: var(--color-success-700);
    }

    .badge--warning {
      background: var(--warning-subtle);
      color: var(--color-warning-700);
    }

    .badge--error {
      background: var(--error-subtle);
      color: var(--color-error-700);
    }

    .badge--neutral {
      background: var(--bg-tertiary);
      color: var(--text-secondary);
    }

    .badge__dot {
      width: 6px;
      height: 6px;
      border-radius: var(--radius-full);
      background: currentColor;
    }
  `]
})
export class BadgeComponent {
  @Input() variant: BadgeVariant = 'primary';
  @Input() size: BadgeSize = 'md';
  @Input() dot = false;

  getClasses(): string {
    return `badge badge--${this.variant} badge--${this.size}`;
  }
}
