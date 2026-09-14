import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SpinnerSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div [class]="getContainerClasses()">
      <div class="spinner" [class]="getSpinnerClasses()"></div>
      <span *ngIf="message" class="loading__message">{{ message }}</span>
    </div>
  `,
  styles: [`
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
    }

    .loading-container--fullscreen {
      position: fixed;
      inset: 0;
      background: rgba(255, 255, 255, 0.8);
      backdrop-filter: blur(4px);
      z-index: 999;
    }

    .loading-container--inline {
      padding: var(--space-4);
    }

    .spinner {
      border: 3px solid var(--border-default);
      border-top-color: var(--primary);
      border-radius: var(--radius-full);
      animation: spin 0.8s linear infinite;
    }

    .spinner--sm {
      width: 20px;
      height: 20px;
      border-width: 2px;
    }

    .spinner--md {
      width: 32px;
      height: 32px;
    }

    .spinner--lg {
      width: 48px;
      height: 48px;
      border-width: 4px;
    }

    .loading__message {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `]
})
export class LoadingComponent {
  @Input() size: SpinnerSize = 'md';
  @Input() message = '';
  @Input() fullscreen = false;
  @Input() inline = false;

  getContainerClasses(): string {
    const classes = ['loading-container'];
    if (this.fullscreen) classes.push('loading-container--fullscreen');
    if (this.inline) classes.push('loading-container--inline');
    return classes.join(' ');
  }

  getSpinnerClasses(): string {
    return `spinner spinner--${this.size}`;
  }
}
