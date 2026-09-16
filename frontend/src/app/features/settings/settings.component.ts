import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TasteProfileService } from '../../core/services/taste-profile.service';
import { ToastService } from '../../core/services/toast.service';
import { ButtonComponent } from '../../shared/components/ui/button/button.component';
import { ChipSelectComponent } from '../../shared/components/ui/chip-select/chip-select.component';
import {
  COMMON_ALLERGENS,
  COMMON_DISLIKES,
  COMMON_LIKES,
  GOAL_OPTIONS,
  TasteProfile,
  emptyTasteProfile
} from '../../shared/models/taste-profile';
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
  imports: [CommonModule, FormsModule, TranslatePipe, RouterLink, ButtonComponent, ChipSelectComponent],
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
        Gustos, alergias y objetivo: lo mismo que se pregunta al registrarse
        (onboarding), editable a mano. Se usa en los prompts de la IA.
      -->
      <section class="settings-group">
        <div class="settings-group__head">
          <h2 class="settings-group__title">🥗 Gustos, alergias y objetivo</h2>
          <a class="settings-group__link" routerLink="/onboarding">Rehacer la configuración inicial</a>
        </div>

        <p class="settings-hint" *ngIf="!tasteService.hasProfile()">
          Todavía no has marcado nada: la IA propone sin saber qué puedes comer.
        </p>

        <div class="settings-field">
          <h3 class="settings-field__title">Alergias e intolerancias</h3>
          <app-chip-select
            label="Alergias e intolerancias"
            [options]="allergenOptions"
            [(value)]="taste.allergies"
            customPlaceholder="Otra alergia o intolerancia"
          ></app-chip-select>
        </div>

        <div class="settings-field">
          <h3 class="settings-field__title">Me gusta</h3>
          <app-chip-select
            label="Lo que más te gusta"
            [options]="likeOptions"
            [(value)]="taste.likes"
            customPlaceholder="Otro alimento o tipo de cocina"
          ></app-chip-select>
        </div>

        <div class="settings-field">
          <h3 class="settings-field__title">Mejor no</h3>
          <app-chip-select
            label="Lo que prefieres evitar"
            [options]="dislikeOptions"
            [(value)]="taste.dislikes"
            customPlaceholder="Otro alimento que no te gusta"
          ></app-chip-select>
        </div>

        <div class="settings-field">
          <h3 class="settings-field__title">Objetivo</h3>
          <div class="settings-options settings-options--goals">
            <button
              *ngFor="let goal of goalOptions"
              type="button"
              class="settings-option"
              [class.settings-option--active]="taste.goal === goal.value"
              (click)="taste.goal = goal.value"
            >
              {{ goal.icon }} {{ goal.label }}
            </button>
          </div>
          <textarea
            class="settings-textarea"
            name="goalNotes"
            id="goalNotes"
            rows="2"
            maxlength="500"
            placeholder="Sobre el objetivo: cenas ligeras, más proteína, sin fritos…"
            [(ngModel)]="taste.goalNotes"
          ></textarea>
        </div>

        <div class="settings-field">
          <h3 class="settings-field__title">Otras notas para la IA</h3>
          <textarea
            class="settings-textarea"
            name="tasteNotes"
            id="tasteNotes"
            rows="3"
            maxlength="1000"
            placeholder="Ej: ceno pronto, como en el trabajo con tupper, dos niños en casa…"
            [(ngModel)]="taste.notes"
          ></textarea>
        </div>

        <div class="settings-actions">
          <app-button
            variant="primary"
            [loading]="tasteService.isLoading()"
            (onClick)="saveTaste()"
          >
            Guardar gustos
          </app-button>
          <span class="settings-hint" *ngIf="tasteSaved() && !hasUnsavedChanges()">Todo guardado ✓</span>
          <span class="settings-hint" *ngIf="hasUnsavedChanges()">Hay cambios sin guardar</span>
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
    .settings-field {
      display: flex; flex-direction: column; gap: var(--space-2);
    }
    .settings-field__title {
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      color: var(--text-primary);
      margin: 0;
    }
    .settings-options--goals { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
    .settings-textarea {
      width: 100%; resize: vertical;
      padding: var(--space-2) var(--space-3);
      font-family: var(--font-sans); font-size: var(--text-sm);
      color: var(--text-primary);
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      &:focus { outline: none; border-color: var(--primary); }
    }
    .settings-actions {
      display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;
    }
  `]
})
export class SettingsComponent implements OnInit {
  themeService = inject(ThemeService);
  i18n = inject(I18nService);
  tasteService = inject(TasteProfileService);

  private readonly toastService = inject(ToastService);
  private savedSnapshot = '';

  /** Copia editable: se guarda al pulsar «Guardar gustos». */
  taste: TasteProfile = emptyTasteProfile();
  tasteSaved = signal(false);

  allergenOptions = COMMON_ALLERGENS;
  likeOptions = COMMON_LIKES;
  dislikeOptions = COMMON_DISLIKES;
  goalOptions = GOAL_OPTIONS;

  ngOnInit(): void {
    this.tasteService.load().subscribe({
      next: data => {
        this.taste = { ...emptyTasteProfile(), ...data.taste };
        this.markSaved();
      },
      error: () => this.toastService.error('Error', 'No se pudieron cargar tus gustos')
    });
  }

  hasUnsavedChanges(): boolean {
    return JSON.stringify(this.taste) !== this.savedSnapshot;
  }

  saveTaste(): void {
    this.tasteService.save(this.taste).subscribe({
      next: () => {
        this.markSaved();
        this.tasteSaved.set(true);
        this.toastService.success('Guardado', 'La IA tendrá en cuenta tus gustos y alergias');
      },
      error: () => this.toastService.error('Error', 'No se pudo guardar')
    });
  }

  private markSaved(): void {
    this.savedSnapshot = JSON.stringify(this.taste);
  }

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
