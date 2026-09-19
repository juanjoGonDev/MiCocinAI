import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmService } from '../../../../core/services/confirm.service';
import { ModalComponent } from '../modal/modal.component';
import { ButtonComponent } from '../button/button.component';

/**
 * Diálogo de confirmación de la aplicación (en lugar del `confirm()` del
 * navegador). Se monta una sola vez en cada layout y muestra la petición
 * que haya pendiente en ConfirmService.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, ModalComponent, ButtonComponent],
  template: `
    <app-modal
      [isOpen]="!!confirmService.request()"
      [title]="confirmService.request()?.title || 'Confirmar'"
      size="sm"
      (onClose)="confirmService.cancel()"
    >
      <div class="confirm" *ngIf="confirmService.request() as request">
        <p class="confirm__message" *ngIf="request.message">{{ request.message }}</p>

        <div class="confirm__actions">
          <app-button variant="ghost" (onClick)="confirmService.cancel()">
            {{ request.cancelText || 'Cancelar' }}
          </app-button>
          <app-button
            [variant]="request.variant || 'danger'"
            (onClick)="confirmService.accept()"
          >
            {{ request.confirmText || 'Confirmar' }}
          </app-button>
        </div>
      </div>
    </app-modal>
  `,
  styles: [`
    .confirm__message {
      margin: 0 0 var(--space-5);
      font-size: var(--text-sm);
      color: var(--text-secondary);
      line-height: 1.5;
    }

    .confirm__actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-3);
    }
  `]
})
export class ConfirmDialogComponent {
  confirmService = inject(ConfirmService);
}
