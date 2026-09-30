import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService, Theme } from '../../core/services/theme.service';
import { I18nService, Language } from '../../core/services/i18n.service';
import { ModulesService } from '../../core/services/modules.service';
import type { HomeModule } from '../../shared/models/home-profile';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import type { TranslationKey } from '../../core/i18n';
import { IconComponent } from '../../shared/components/ui/icon/icon.component';

interface Option<T extends string> {
  value: T;
  labelKey: TranslationKey;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, TranslatePipe, IconComponent],
  template: `
    <div class="settings-page">
      <h1 class="settings-title">
        <app-icon name="settings" [size]="24" [label]="null" />
        {{ 'settings.title' | t }}
      </h1>

      <section class="settings-group">
        <h2 class="settings-group__title">{{ 'settings.theme' | t }}</h2>
        <div class="settings-options">
          <button
            *ngFor="let opt of themeOptions"
            type="button"
            class="settings-option"
            [class.settings-option--active]="themeService.theme() === opt.value"
            [attr.aria-pressed]="themeService.theme() === opt.value"
            (click)="setTheme(opt.value)"
          >
            {{ opt.labelKey | t }}
          </button>
        </div>
        <p class="settings-hint" *ngIf="themeService.theme() === 'system'">
          {{
            'settings.themeDetected'
              | t
                : {
                    theme: themeService.isDark()
                      ? ('settings.theme.dark' | t)
                      : ('settings.theme.light' | t)
                  }
          }}
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
            [attr.aria-pressed]="i18n.lang() === opt.value"
            [attr.data-test]="'settings-lang-' + opt.value"
            (click)="setLang(opt.value)"
          >
            {{ opt.labelKey | t }}
          </button>
        </div>
      </section>

      <section class="settings-group">
        <h2 class="settings-group__title">
          <app-icon name="tune" [size]="18" [label]="null" />
          {{ 'settings.modules' | t }}
        </h2>
        <p class="settings-hint">{{ 'settings.modulesHint' | t }}</p>

        <ul class="settings-modules">
          <li
            *ngFor="let def of modules.registry"
            class="settings-module"
            [attr.data-module]="def.id"
          >
            <span class="settings-module__text">
              <span class="settings-module__label">
                {{ def.labelKey | t }}
                <span class="settings-module__soon" *ngIf="!def.available">
                  {{ 'settings.modulesSoon' | t }}
                </span>
              </span>
              <span class="settings-module__hint">{{ def.hintKey | t }}</span>
            </span>
            <button
              type="button"
              class="settings-module__switch"
              role="switch"
              [attr.data-module-switch]="def.id"
              [attr.aria-checked]="modules.isEnabled(def.id)"
              [attr.aria-label]="def.labelKey | t"
              [disabled]="!modules.canSwitchOff(def.id)"
              [attr.aria-disabled]="modules.isSaving() || !modules.canSwitchOff(def.id)"
              [attr.data-on]="modules.isEnabled(def.id)"
              (click)="toggleModule(def.id)"
            >
              <span class="settings-module__knob" aria-hidden="true"></span>
            </button>
          </li>
        </ul>

        <p class="settings-hint" *ngIf="modules.selected().length === 0">
          {{ 'settings.modulesAllOn' | t }}
        </p>
        <button
          type="button"
          class="settings-modules__reset"
          *ngIf="modules.selected().length > 0"
          [disabled]="modules.isSaving()"
          (click)="modules.resetSelection()"
          data-modules-reset
        >
          {{ 'settings.modulesReset' | t }}
        </button>
        <p
          class="settings-hint settings-hint--error"
          role="alert"
          aria-atomic="true"
          *ngIf="modules.lastError()"
        >
          {{ 'settings.modulesFailed' | t }}
        </p>
      </section>
    </div>
  `,
  styles: [
    `
      /*
     * ── Estados de interaccion (HOGARIA-SPEC 12q-B) ───────────────────────────────────────────
     *
     * Todo lo que se pulsa avisa antes de que se pulse. Va aqui arriba, junto, en lugar de repartido por
     * las reglas de cada control: asi la proxima clase que se anada se compara con esta lista, y el
     * check-ui (regla boton-sin-afecto) no deja a nadie poner un boton sin su hover. Van sin :hover los
     * deshabilitados —un boton apagado que se ilumina es la manera mas rapida de ensenar a desconfiar.
     */
      .settings-modules__reset:hover:not(:disabled) {
        color: var(--primary-dark);
        background: var(--primary-subtle);
      }

      .settings-modules__reset:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }

      .settings-page {
        padding: var(--space-4);
        max-width: 640px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: var(--space-6);
      }

      @media (min-width: 768px) {
        .settings-page {
          padding: var(--space-8);
        }
      }

      .settings-title {
        font-family: var(--font-display);
        font-size: var(--text-2xl);
        font-weight: var(--font-bold);
      }

      .settings-modules__reset {
        margin-top: var(--space-2);
        background: none;
        border: 0;
        padding: 0;
        font: inherit;
        font-size: var(--text-xs);
        color: var(--primary);
        text-decoration: underline;
        cursor: pointer;
      }

      .settings-modules {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .settings-module {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        padding: var(--space-3);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        background: var(--bg-secondary);
      }

      .settings-module__text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .settings-module__label {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-size: var(--text-sm);
        font-weight: var(--font-bold);
      }

      .settings-module__soon {
        font-size: 10px;
        font-weight: var(--font-medium);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 1px 6px;
        border-radius: 999px;
        background: var(--bg-tertiary);
        color: var(--text-secondary);
      }

      .settings-module__hint {
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }

      .settings-module__switch {
        position: relative;
        flex: none;
        width: 46px;
        height: 44px;
        padding: 2px;
        border: 0;
        border-radius: 0;
        background: transparent;
        cursor: pointer;
        display: flex;
        align-items: center;
        transition:
          background var(--duration-150) ease,
          border-color var(--duration-150) ease;
      }

      .settings-module__switch::before {
        position: absolute;
        inset: 50% 0 auto;
        height: 26px;
        transform: translateY(-50%);
        content: '';
        border: 1px solid var(--border-default);
        border-radius: 999px;
        background: var(--bg-tertiary);
      }

      .settings-module__switch[aria-checked='true']::before {
        background: var(--primary);
        border-color: var(--primary);
      }

      .settings-module__switch[aria-checked='true'] {
        justify-content: flex-end;
      }

      .settings-module__switch:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }

      .settings-module__switch:disabled,
      .settings-module__switch[aria-disabled='true'] {
        opacity: 0.6;
      }

      .settings-module__switch:disabled {
        cursor: not-allowed;
      }

      .settings-module__switch[aria-disabled='true']:not(:disabled) {
        cursor: progress;
      }

      .settings-module__knob {
        position: relative;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--bg-primary);
        animation: settings-knob-in var(--duration-150) ease-out;
      }

      @keyframes settings-knob-in {
        from {
          transform: scale(0.85);
          opacity: 0.6;
        }
        to {
          transform: scale(1);
          opacity: 1;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .settings-module__knob,
        .settings-module__switch {
          animation: none;
          transition: none;
        }
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
        .settings-options {
          grid-template-columns: 1fr;
        }
      }

      .settings-option {
        min-height: 44px;
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
    `
  ]
})
export class SettingsComponent {
  themeService = inject(ThemeService);
  i18n = inject(I18nService);
  /** Secciones de la app: se activan aqui y se aplican sin recargar. */
  modules = inject(ModulesService);

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

  toggleModule(id: HomeModule): void {
    if (this.modules.isSaving() || !this.modules.canSwitchOff(id)) return;
    this.modules.toggle(id);
  }
}
