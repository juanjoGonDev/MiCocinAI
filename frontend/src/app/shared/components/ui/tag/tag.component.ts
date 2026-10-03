import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-tag',
  standalone: true,
  imports: [
    TranslatePipe,
    CommonModule],
  template: `
    <span [class]="getClasses()" (click)="onClick.emit()">
      <ng-content></ng-content>
      <button
        *ngIf="removable"
        type="button"
        class="tag__remove"
        (click)="onRemove.emit($event); $event.stopPropagation()"
        [attr.aria-label]="'ui.remove_tag' | t"
      >
        ×
      </button>
    </span>
  `,
  styles: [`
    .tag {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      padding: var(--space-1) var(--space-3);
      font-size: var(--text-sm);
      font-weight: var(--font-normal);
      color: var(--text-primary);
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: var(--transition-fast);
      user-select: none;

      &:hover {
        background: var(--border-default);
      }
    }

    .tag--selected {
      background: var(--primary-subtle);
      border-color: var(--primary);
      color: var(--primary-dark);
    }

    .tag--disabled {
      opacity: 0.5;
      cursor: not-allowed;
      pointer-events: none;
    }

    .tag__remove {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: var(--radius-full);
      background: var(--border-default);
      color: var(--text-tertiary);
      font-size: 12px;
      line-height: 1;
      cursor: pointer;
      transition: var(--transition-fast);
      border: none;
      padding: 0;

      &:hover {
        background: var(--error-subtle);
        color: var(--error);
      }
    }
  `]
})
export class TagComponent {
  @Input() selected = false;
  @Input() removable = false;
  @Input() disabled = false;

  @Output() onClick = new EventEmitter<void>();
  @Output() onRemove = new EventEmitter<Event>();

  getClasses(): string {
    const classes = ['tag'];
    if (this.selected) classes.push('tag--selected');
    if (this.disabled) classes.push('tag--disabled');
    return classes.join(' ');
  }
}
