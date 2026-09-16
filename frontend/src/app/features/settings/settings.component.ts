import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
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
  imports: [CommonModule, TranslatePipe, RouterLink],
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

      <!--
        Gustos, alergias y objetivo ya no viven aqui: la configuracion habla de
        la app (tema, idioma) y lo del comensal tiene su seccion, con sus
        pestañas. El enlace existe solo para que se sepa donde esta.
      -->
      <section class="settings-group">
        <div class="settings-group__head">
          <h2 class="settings-group__title">🥗 Preferencias</h2>
          <a class="settings-group__link" routerLink="/preferences">Ver preferencias</a>
        </div>
        <p class="settings-hint">
          Alergias, gustos y objetivo: lo que tiene en cuenta la IA al cocinar. Se pregunta al
          registrarse y se edita en su propia sección.
        </p>
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

    .settings-group__head {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: var(--space-3); flex-wrap: wrap;
    }
    .settings-group__link {
      font-size: var(--text-xs);
      color: var(--primary);
      text-decoration: none;
      &:hover { text-decoration: underline; }
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
