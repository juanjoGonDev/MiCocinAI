import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

@Component({
  selector: 'app-avatar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div [class]="getClasses()" [style.background-color]="color">
      <img
        *ngIf="src; else initialsTemplate"
        [src]="src"
        [alt]="name || ''"
        class="avatar__image"
        loading="lazy"
      />
      <ng-template #initialsTemplate>
        <span class="avatar__initials">{{ getInitials() }}</span>
      </ng-template>
      <span *ngIf="status" [class]="'avatar__status avatar__status--' + status"></span>
    </div>
  `,
  styles: [`
    .avatar {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-full);
      overflow: hidden;
      flex-shrink: 0;
    }

    /* Sizes */
    .avatar--xs { width: 24px; height: 24px; }
    .avatar--sm { width: 32px; height: 32px; }
    .avatar--md { width: 40px; height: 40px; }
    .avatar--lg { width: 48px; height: 48px; }
    .avatar--xl { width: 64px; height: 64px; }

    .avatar__image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar__initials {
      font-family: var(--font-display);
      font-weight: var(--font-semibold);
      color: var(--white);
      text-transform: uppercase;
    }

    .avatar--xs .avatar__initials { font-size: 10px; }
    .avatar--sm .avatar__initials { font-size: var(--text-xs); }
    .avatar--md .avatar__initials { font-size: var(--text-sm); }
    .avatar--lg .avatar__initials { font-size: var(--text-base); }
    .avatar--xl .avatar__initials { font-size: var(--text-lg); }

    .avatar__status {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 25%;
      height: 25%;
      min-width: 8px;
      min-height: 8px;
      border-radius: var(--radius-full);
      border: 2px solid var(--bg-secondary);
    }

    .avatar__status--online { background: var(--success); }
    .avatar__status--offline { background: var(--text-tertiary); }
    .avatar__status--away { background: var(--warning); }
    .avatar__status--busy { background: var(--error); }
  `]
})
export class AvatarComponent {
  @Input() src?: string;
  @Input() name?: string;
  @Input() size: AvatarSize = 'md';
  @Input() color?: string;
  @Input() status?: 'online' | 'offline' | 'away' | 'busy';

  private defaultColors = [
    '#F97316', '#22C55E', '#3B82F6', '#8B5CF6',
    '#EC4899', '#14B8A6', '#F59E0B', '#EF4444'
  ];

  getInitials(): string {
    if (!this.name) return '?';
    
    const parts = this.name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return parts[0][0] + parts[1][0];
    }
    return parts[0]?.[0] || '?';
  }

  getClasses(): string {
    return `avatar avatar--${this.size}`;
  }

  getColor(): string {
    if (this.color) return this.color;
    if (!this.name) return this.defaultColors[0];
    
    let hash = 0;
    for (let i = 0; i < this.name.length; i++) {
      hash = this.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return this.defaultColors[Math.abs(hash) % this.defaultColors.length];
  }
}
