import { Component, Input, Output, EventEmitter, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface DropdownOption {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  divider?: boolean;
}

@Component({
  selector: 'app-dropdown',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dropdown">
      <div class="dropdown__trigger" (click)="toggle()">
        <ng-content select="[trigger]"></ng-content>
      </div>
      
      <div *ngIf="isOpen" class="dropdown__menu" [class]="'dropdown__menu--' + position">
        <ng-container *ngFor="let option of options">
          <div *ngIf="option.divider" class="dropdown__divider"></div>
          <button
            *ngIf="!option.divider"
            type="button"
            [class]="getOptionClasses(option)"
            [disabled]="option.disabled"
            (click)="selectOption(option)"
          >
            <span *ngIf="option.icon" class="dropdown__option-icon">{{ option.icon }}</span>
            <span class="dropdown__option-label">{{ option.label }}</span>
          </button>
        </ng-container>
        <ng-content select="[content]"></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .dropdown {
      position: relative;
      display: inline-block;
    }

    .dropdown__trigger {
      cursor: pointer;
    }

    .dropdown__menu {
      position: absolute;
      z-index: 100;
      min-width: 180px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      padding: var(--space-1);
      animation: fadeInDown var(--duration-150) var(--ease-out);
    }

    .dropdown__menu--bottom-left {
      top: calc(100% + var(--space-1));
      left: 0;
    }

    .dropdown__menu--bottom-right {
      top: calc(100% + var(--space-1));
      right: 0;
    }

    .dropdown__menu--top-left {
      bottom: calc(100% + var(--space-1));
      left: 0;
    }

    .dropdown__menu--top-right {
      bottom: calc(100% + var(--space-1));
      right: 0;
    }

    .dropdown__option {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      width: 100%;
      padding: var(--space-2) var(--space-3);
      font-size: var(--text-sm);
      color: var(--text-primary);
      background: none;
      border: none;
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: var(--transition-fast);
      text-align: left;

      &:hover:not(:disabled) {
        background: var(--bg-tertiary);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .dropdown__option--selected {
      background: var(--primary-subtle);
      color: var(--primary-dark);
    }

    .dropdown__option-icon {
      flex-shrink: 0;
      font-size: var(--text-base);
    }

    .dropdown__option-label {
      flex: 1;
    }

    .dropdown__divider {
      height: 1px;
      background: var(--border-default);
      margin: var(--space-1) 0;
    }

    @keyframes fadeInDown {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `]
})
export class DropdownComponent {
  @Input() options: DropdownOption[] = [];
  @Input() position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' = 'bottom-left';
  @Input() selectedId?: string;

  @Output() selectedIdChange = new EventEmitter<string>();
  @Output() optionSelected = new EventEmitter<DropdownOption>();

  isOpen = false;

  constructor(private elementRef: ElementRef) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen = false;
    }
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
  }

  selectOption(option: DropdownOption): void {
    if (option.disabled || option.divider) return;
    
    this.selectedId = option.id;
    this.selectedIdChange.emit(option.id);
    this.optionSelected.emit(option);
    this.isOpen = false;
  }

  getOptionClasses(option: DropdownOption): string {
    const classes = ['dropdown__option'];
    if (option.id === this.selectedId) classes.push('dropdown__option--selected');
    return classes.join(' ');
  }
}
