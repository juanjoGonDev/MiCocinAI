import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type CardVariant = 'default' | 'flat' | 'interactive' | 'selected';

@Component({
  selector: 'app-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div [class]="getClasses()">
      <div *ngIf="showHeader" class="card__header">
        <ng-content select="[header]"></ng-content>
      </div>
      
      <img *ngIf="image" [src]="image" [alt]="imageAlt || ''" class="card__image" loading="lazy" />
      
      <div class="card__content">
        <ng-content></ng-content>
      </div>
      
      <div *ngIf="showFooter" class="card__footer">
        <ng-content select="[footer]"></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-xl);
      overflow: hidden;
      transition: var(--transition-normal);
    }

    .card--interactive {
      cursor: pointer;

      &:hover {
        box-shadow: var(--shadow-md);
        transform: translateY(-2px);
      }

      &:active {
        transform: translateY(0);
      }
    }

    .card--flat {
      box-shadow: none;
      border: none;
      background: var(--bg-tertiary);

      &:hover {
        background: var(--border-default);
        transform: none;
        box-shadow: none;
      }
    }

    .card--selected {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px var(--primary-subtle);
    }

    .card__header {
      padding: var(--space-4) var(--space-4) 0;
    }

    .card__image {
      width: 100%;
      aspect-ratio: 16/9;
      object-fit: cover;
      background: var(--bg-tertiary);
    }

    .card__content {
      padding: var(--space-4);
    }

    .card__footer {
      padding: 0 var(--space-4) var(--space-4);
    }
  `]
})
export class CardComponent {
  @Input() variant: CardVariant = 'default';
  @Input() image?: string;
  @Input() imageAlt?: string;
  @Input() showHeader = false;
  @Input() showFooter = false;

  getClasses(): string {
    const classes = ['card'];
    if (this.variant !== 'default') classes.push(`card--${this.variant}`);
    return classes.join(' ');
  }
}
