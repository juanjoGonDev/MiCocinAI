import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ProgressSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-progress',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="progress-container">
      <div *ngIf="label || showPercentage" class="progress__header">
        <span *ngIf="label" class="progress__label">{{ label }}</span>
        <span *ngIf="showPercentage" class="progress__value">{{ value }}%</span>
      </div>
      <div [class]="getClasses()">
        <div 
          class="progress__bar"
          [style.width.%]="value"
          [style.background-color]="color"
        ></div>
      </div>
    </div>
  `,
  styles: [`
    .progress-container {
      width: 100%;
    }

    .progress__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-1);
    }

    .progress__label {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    .progress__value {
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      color: var(--text-primary);
    }

    .progress {
      width: 100%;
      background: var(--bg-tertiary);
      border-radius: var(--radius-full);
      overflow: hidden;
    }

    .progress--sm { height: 4px; }
    .progress--md { height: 8px; }
    .progress--lg { height: 12px; }

    .progress__bar {
      height: 100%;
      background: var(--primary);
      border-radius: var(--radius-full);
      transition: width var(--duration-300) var(--ease-out);
      min-width: 0;
    }
  `]
})
export class ProgressComponent {
  @Input() value = 0;
  @Input() size: ProgressSize = 'md';
  @Input() label = '';
  @Input() showPercentage = false;
  @Input() color?: string;

  getClasses(): string {
    return `progress progress--${this.size}`;
  }
}
