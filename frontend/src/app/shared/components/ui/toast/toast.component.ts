import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container toast-container--top">
      <div
        *ngFor="let toast of topToasts(); trackBy: trackById"
        [class]="getToastClasses(toast)"
      >
        <span class="toast__icon">{{ getIcon(toast.type) }}</span>
        <div class="toast__content">
          <span class="toast__title">{{ toast.title }}</span>
          <span *ngIf="toast.message" class="toast__message">{{ toast.message }}</span>
        </div>
        <button
          *ngIf="toast.action"
          type="button"
          class="toast__action"
          data-test="toast-action"
          (click)="toastService.runAction(toast)"
        >
          {{ toast.action.label }}
        </button>
        <button
          *ngIf="toast.dismissible"
          type="button"
          class="toast__close"
          (click)="toastService.dismiss(toast.id)"
          aria-label="Dismiss"
        >
          ✕
        </button>
        <span
          *ngIf="toast.countdown"
          class="toast__countdown"
          [style.animationDuration]="toast.duration + 'ms'"
        ></span>
      </div>
    </div>

    <!-- Abajo es donde el pulgar llega: los avisos con Deshacer (quitar una linea,
         vaciar el carro) se actian aqui y caducan a la vista. -->
    <div class="toast-container toast-container--bottom">
      <div
        *ngFor="let toast of bottomToasts(); trackBy: trackById"
        [class]="getToastClasses(toast, true)"
      >
        <span class="toast__icon">{{ getIcon(toast.type) }}</span>
        <div class="toast__content">
          <span class="toast__title">{{ toast.title }}</span>
          <span *ngIf="toast.message" class="toast__message">{{ toast.message }}</span>
        </div>
        <button
          *ngIf="toast.action"
          type="button"
          class="toast__action"
          data-test="toast-action"
          (click)="toastService.runAction(toast)"
        >
          {{ toast.action.label }}
        </button>
        <button
          *ngIf="toast.dismissible"
          type="button"
          class="toast__close"
          (click)="toastService.dismiss(toast.id)"
          aria-label="Dismiss"
        >
          ✕
        </button>
        <span
          *ngIf="toast.countdown"
          class="toast__countdown"
          [style.animationDuration]="toast.duration + 'ms'"
        ></span>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      left: var(--space-4);
      right: var(--space-4);
      z-index: 1100;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      pointer-events: none;
    }

    .toast-container--top {
      top: var(--space-4);
      align-items: flex-end;
    }

    .toast-container--bottom {
      bottom: calc(var(--space-4) + var(--bottom-nav-height));
      align-items: center;
    }

    @media (min-width: 481px) {
      .toast-container {
        left: auto;
      }
      .toast-container--top {
        max-width: 400px;
      }
      .toast-container--bottom {
        right: var(--space-4);
        max-width: 400px;
        align-items: flex-end;
      }
    }

    @media (max-width: 480px) {
      .toast-container--top {
        top: var(--space-2);
      }
    }

    .toast {
      position: relative;
      overflow: hidden;
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      width: 100%;
      background: var(--bg-secondary);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      border-left: 4px solid;
      animation: slideInRight var(--duration-300) var(--ease-out);
    }

    .toast-container--bottom .toast {
      width: auto;
      min-width: min(100%, 360px);
      animation: riseIn var(--duration-300) var(--ease-out);
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

    .toast__action {
      flex-shrink: 0;
      border: 1px solid var(--primary);
      background: var(--primary-subtle);
      color: var(--primary);
      border-radius: var(--radius-md);
      font-size: var(--text-sm);
      font-weight: var(--font-semibold);
      padding: var(--space-2) var(--space-3);
      cursor: pointer;
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
      flex-shrink: 0;
    }

    /* La barra que se vacia es el plazo: sin ella, «Deshacer» parece permanente. */
    .toast__countdown {
      position: absolute;
      left: 0;
      bottom: 0;
      height: 3px;
      width: 100%;
      background: var(--primary);
      transform-origin: left center;
      animation-name: toast-countdown;
      animation-timing-function: linear;
      animation-fill-mode: forwards;
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

    @keyframes riseIn {
      from {
        opacity: 0;
        transform: translateY(16px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes toast-countdown {
      from {
        transform: scaleX(1);
      }
      to {
        transform: scaleX(0);
      }
    }
  `]
})
export class ToastComponent {
  toastService = inject(ToastService);

  /** Dos pilas separadas: arriba informa, abajo deja actuar con el pulgar. */
  topToasts(): Toast[] {
    return this.toastService.toasts().filter(toast => toast.position !== 'bottom');
  }

  bottomToasts(): Toast[] {
    return this.toastService.toasts().filter(toast => toast.position === 'bottom');
  }

  trackById(_index: number, toast: Toast): string {
    return toast.id;
  }

  getToastClasses(toast: Toast, actionable = false): string {
    return `toast toast--${toast.type}${actionable ? ' toast--actionable' : ''}`;
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
