import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

@Component({
  selector: 'app-tooltip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tooltip-wrapper">
      <ng-content></ng-content>
      <span *ngIf="text" [class]="'tooltip tooltip--' + position">
        {{ text }}
      </span>
    </div>
  `,
  styles: [`
    .tooltip-wrapper {
      position: relative;
      display: inline-flex;
    }

    .tooltip {
      position: absolute;
      z-index: 50;
      padding: var(--space-1) var(--space-2);
      font-size: var(--text-xs);
      font-weight: var(--font-medium);
      color: var(--text-inverse);
      background: var(--color-neutral-800);
      border-radius: var(--radius-md);
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity var(--duration-150) var(--ease-out);
    }

    .tooltip-wrapper:hover .tooltip {
      opacity: 1;
    }

    /* Positions */
    .tooltip--top {
      bottom: calc(100% + var(--space-1));
      left: 50%;
      transform: translateX(-50%);
    }

    .tooltip--bottom {
      top: calc(100% + var(--space-1));
      left: 50%;
      transform: translateX(-50%);
    }

    .tooltip--left {
      right: calc(100% + var(--space-1));
      top: 50%;
      transform: translateY(-50%);
    }

    .tooltip--right {
      left: calc(100% + var(--space-1));
      top: 50%;
      transform: translateY(-50%);
    }
  `]
})
export class TooltipComponent {
  @Input() text = '';
  @Input() position: TooltipPosition = 'top';
}
