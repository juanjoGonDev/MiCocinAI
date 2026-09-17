import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService, Theme } from '../../core/services/theme.service';
import { I18nService, Language } from '../../core/services/i18n.service';
import { TranslatePipe } from '../../core/pipes/translate.pipe';

interface Option<T extends string> {
  value: T;
  labelKey: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    <div class="settings-page">
      <h1 class="settings-title">{{ 'settings.title' | t }}</h1>

      <section class="settings-group">
        <h2 class="settings-group__title">{{ 'settings.theme' | t }}</h2>
        <div class="settings-options">
          <button
            *ngFor="let opt of themeOptions"
            type="button"
            class="settings-option"
            [class.settings-option--active]="themeService.theme() === opt.value"
            (click)="setTheme(opt.value)"
          >
            {{ opt.labelKey | t }}
          </button>
        </div>
        <p class="settings-hint" *ngIf="themeService.theme() === 'system'">
          Detectado: {{ themeService.isDark() ? '🌙 Oscuro' : '☀️ Claro' }}
        </p>
      </section>

      <section class="settings-group">
        <h2 class="settings-group__title">{{ 'settings.language' | t }}</h2>
        <div class="settings-options">
          <button
            *ngFor="let opt of langOptions"
            type="button"
            class="settings-option"
            [class.settings-option--active]="i18n.lang() === opt.value"
            (click)="setLang(opt.value)"
          >
            {{ opt.labelKey | t }}
          </button>
        </div>
      </section>

    </div>
  `,
  styles: [`
    .settings-page {
      padding: var(--space-4);
      max-width: 640px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
    }

    @media (min-width: 768px) {
      .settings-page { padding: var(--space-8); }
    }

    .settings-title {
      font-family: var(--font-display);
      font-size: var(--text-2xl);
      font-weight: var(--font-bold);
    }

    .settings-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .settings-group__title {
      font-size: var(--text-base);
      font-weight: var(--font-semibold);
      color: var(--text-primary);
      margin: 0;
    }

    .settings-options {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-2);
    }

    @media (max-width: 480px) {
      .settings-options { grid-template-columns: 1fr; }
    }

    .settings-option {
      padding: var(--space-3) var(--space-4);
      background: var(--bg-secondary);
      border: 2px solid var(--border-default);
      border-radius: var(--radius-lg);
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--text-primary);
      cursor: pointer;
      transition: var(--transition-fast);
      text-align: center;

      &:hover {
        border-color: var(--border-strong);
      }

      &--active {
        border-color: var(--primary);
        background: var(--primary-subtle);
        color: var(--primary-dark);
        font-weight: var(--font-semibold);
      }
    }

    .settings-hint {
      font-size: var(--text-xs);
      color: var(--text-secondary);
      margin: 0;
    }

  `]
})
export class SettingsComponent {
  themeService = inject(ThemeService);
  i18n = inject(I18nService);

  themeOptions: Option<Theme>[] = [
    { value: 'light', labelKey: 'settings.theme.light' },
    { value: 'dark', labelKey: 'settings.theme.dark' },
    { value: 'system', labelKey: 'settings.theme.system' }
  ];

  langOptions: Option<Language>[] = [
    { value: 'auto', labelKey: 'settings.lang.auto' },
    { value: 'es', labelKey: 'settings.lang.es' },
    { value: 'en', labelKey: 'settings.lang.en' }
  ];

  setTheme(t: Theme): void {
    this.themeService.setTheme(t);
  }

  setLang(l: Language): void {
    this.i18n.setLang(l);
  }
}
