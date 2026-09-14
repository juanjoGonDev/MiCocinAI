import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonComponent } from '../button/button.component';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  template: `
    <div *ngIf="isOpen" class="modal-overlay" (click)="onOverlayClick($event)">
      <div [class]="getModalClasses()" role="dialog" [attr.aria-label]="title">
        <div class="modal__header">
          <h2 class="modal__title">{{ title }}</h2>
          <button
            *ngIf="closable"
            type="button"
            class="modal__close"
            (click)="close()"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>
        
        <div class="modal__body">
          <ng-content></ng-content>
        </div>
        
        <div *ngIf="showFooter" class="modal__footer">
          <ng-content select="[footer]"></ng-content>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      padding: var(--space-4);
      animation: fadeIn var(--duration-200) var(--ease-out);
    }

    .modal {
      background: var(--bg-secondary);
      border-radius: var(--radius-2xl);
      box-shadow: var(--shadow-xl);
      display: flex;
      flex-direction: column;
      max-height: calc(100vh - 2rem);
      animation: scaleIn var(--duration-200) var(--ease-out);
    }

    .modal--sm { width: 100%; max-width: 400px; }
    .modal--md { width: 100%; max-width: 500px; }
    .modal--lg { width: 100%; max-width: 700px; }
    .modal--xl { width: 100%; max-width: 900px; }
    .modal--full { width: 95vw; height: 90vh; }

    .modal__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4) var(--space-6);
      border-bottom: 1px solid var(--border-default);
    }

    .modal__title {
      font-family: var(--font-display);
      font-size: var(--text-lg);
      font-weight: var(--font-semibold);
      color: var(--text-primary);
    }

    .modal__close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: var(--radius-lg);
      background: none;
      border: none;
      color: var(--text-tertiary);
      cursor: pointer;
      transition: var(--transition-fast);
      font-size: var(--text-lg);

      &:hover {
        background: var(--bg-tertiary);
        color: var(--text-primary);
      }
    }

    .modal__body {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-6);
    }

    .modal__footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-3);
      padding: var(--space-4) var(--space-6);
      border-top: 1px solid var(--border-default);
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes scaleIn {
      from { 
        opacity: 0; 
        transform: scale(0.95); 
      }
      to { 
        opacity: 1; 
        transform: scale(1); 
      }
    }
  `]
})
export class ModalComponent {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() size: ModalSize = 'md';
  @Input() closable = true;
  @Input() showFooter = false;
  @Input() closeOnOverlay = true;

  @Output() isOpenChange = new EventEmitter<boolean>();
  @Output() onClose = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.closable && this.isOpen) {
      this.close();
    }
  }

  close(): void {
    this.isOpen = false;
    this.isOpenChange.emit(false);
    this.onClose.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if (this.closeOnOverlay && (event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.close();
    }
  }

  getModalClasses(): string {
    return `modal modal--${this.size}`;
  }
}
