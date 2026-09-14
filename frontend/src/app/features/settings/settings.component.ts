import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <h1>Configuración</h1>
      <p>Ajustes de la aplicación</p>
    </div>
  `,
  styles: [`
    .page {
      padding: var(--space-6);
    }
    h1 {
      font-family: var(--font-display);
      font-size: var(--text-2xl);
      font-weight: var(--font-bold);
      margin-bottom: var(--space-2);
    }
    p {
      color: var(--text-secondary);
    }
  `]
})
export class SettingsComponent {}
