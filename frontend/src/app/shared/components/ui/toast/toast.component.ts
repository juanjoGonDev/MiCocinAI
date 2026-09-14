import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      <div
        *ngFor="let toast of toastService.toasts(); trackBy: trackById"
        [class]="getToastClasses(toast)"
        class="toast"
      >
        <span class="toast__icon">{{ getIcon(toast.type) }}</span>
        <div class="toast__content">
          <span class="toast__title">{{ toast.title }}</span>
          <span *ngIf="toast.message" class="toast__message">{{ toast.message }}</span>
        </div>
        <button
          *ngIf="toast.dismissible"
          type="button"
          class="toast__close"
          (click)="toastService.dismiss(toast.id)"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: var(--space-4);
      right: var(--space-4);
      z-index: 1100;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      max-width: 400px;
      width: 100%;
    }

    .toast {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      background: var(--bg-secondary);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      border-left: 4px solid;
      animation: slideInRight var(--duration-300) var(--ease-out);
    }

    .toast--success {
      border-left-color: var(--success);
    }

    .toast--error {
      border-left-color: var(--error);
    }

    .toast--warning {
      border-left-color: var(--warning);
    }

    .toast--info {
      border-left-color: var(--info);
    }

    .toast__icon {
      font-size: var(--text-lg);
      flex-shrink: 0;
    }

    .toast__content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .toast__title {
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      color: var(--text-primary);
    }

    .toast__message {
      font-size: var(--text-xs);
      color: var(--text-secondary);
    }

    .toast__close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: var(--radius-md);
      background: none;
      border: none;
      color: var(--text-tertiary);
      cursor: pointer;
      transition: var(--transition-fast);
      flex-shrink: 0;

      &:hover {
        background: var(--bg-tertiary);
        color: var(--text-primary);
      }
    }

    @keyframes slideInRight {
      from {
        opacity: 0;
        transform: translateX(100%);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    @media (max-width: 480px) {
      .toast-container {
        left: var(--space-4);
        right: var(--space-4);
        max-width: none;
      }
    }
  `]
})
export class ToastComponent {
  toastService = inject(ToastService);

  trackById(_index: number, toast: Toast): string {
    return toast.id;
  }

  getToastClasses(toast: Toast): string {
    return `toast toast--${toast.type}`;
  }

  getIcon(type: string): string {
    const icons: Record<string, string> = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    return icons[type] || icons['info'];
  }
}
