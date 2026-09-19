import { Component, Input, Output, EventEmitter, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  COOKING_LEVEL_OPTIONS,
  CookingLevel,
  detailLevelHint,
  HOME_MODULE_OPTIONS,
  HomeModule,
  HomeProfile,
  toggleHomeModule
} from '../../../models/home-profile';

/**
 * Selector de perfil del hogar: cuánto se cocina y qué se quiere llevar desde la
 * app. Es el mismo control en el tour y en Preferencias, para que lo que se
 * guarda en un sitio se vea igual en el otro.
 *
 * Sin iconos de emoji: el check es un SVG inline con `currentColor`, y la
 * animación de entrada usa `from`/`to` explícitos (regla de la marca).
 */
@Component({
  selector: 'app-home-profile-picker',
  standalone: true,
  imports: [CommonModule],
  template: `
    <fieldset class="profile-picker">
      <legend class="profile-picker__legend">
        {{ levelLabel }}
        <span class="profile-picker__required" *ngIf="askForLevel">*</span>
      </legend>
      <p class="profile-picker__hint" *ngIf="levelHint">{{ levelHint }}</p>

      <div class="profile-picker__levels" *ngIf="askForLevel">
        <button
          *ngFor="let option of levels"
          type="button"
          class="profile-picker__level"
          [class.profile-picker__level--on]="profile.cookingLevel === option.value"
          [attr.aria-pressed]="profile.cookingLevel === option.value"
          [attr.data-level]="option.value"
          (click)="setLevel(option.value)"
        >
          <span class="profile-picker__level-label">{{ option.label }}</span>
          <span class="profile-picker__level-hint">{{ option.hint }}</span>
          <svg
            class="profile-picker__check"
            viewBox="0 0 20 20"
            aria-hidden="true"
            *ngIf="profile.cookingLevel === option.value"
          >
            <path
              d="M4 10.5 8 14.5 16 6"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>

      <p class="profile-picker__effect" *ngIf="askForLevel">
        {{ effectHint }}
      </p>
    </fieldset>

    <fieldset class="profile-picker">
      <legend class="profile-picker__legend">{{ modulesLabel }}</legend>
      <p class="profile-picker__hint">{{ modulesHint }}</p>
      <div class="profile-picker__modules">
        <label
          *ngFor="let option of modules"
          class="profile-picker__module"
          [class.profile-picker__module--on]="isSelected(option.value)"
          [attr.data-module]="option.value"
        >
          <input
            type="checkbox"
            class="profile-picker__module-input"
            [checked]="isSelected(option.value)"
            [attr.data-module-input]="option.value"
            (change)="toggle(option.value)"
          />
          <span class="profile-picker__module-box" aria-hidden="true">
            <svg viewBox="0 0 20 20" *ngIf="isSelected(option.value)">
              <path
                d="M4 10.5 8 14.5 16 6"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <span class="profile-picker__module-text">
            <span class="profile-picker__module-label">
              {{ option.label }}
              <span class="profile-picker__soon" *ngIf="!option.available">pronto</span>
            </span>
            <span class="profile-picker__module-hint">{{ option.hint }}</span>
          </span>
        </label>
      </div>
      <p class="profile-picker__footnote">
        Lo que marques con «pronto» está en el plan: se activará solo cuando exista.
      </p>
    </fieldset>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .profile-picker {
        border: 0;
        padding: 0;
        margin: 0 0 var(--space-5);
      }
      .profile-picker__legend {
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: var(--font-bold);
        color: var(--text-primary);
        padding: 0;
        margin-bottom: var(--space-1);
      }
      .profile-picker__required {
        color: var(--danger);
      }
      .profile-picker__hint {
        margin: 0 0 var(--space-3);
        font-size: var(--text-xs);
        color: var(--text-secondary);
        max-width: 60ch;
      }
      .profile-picker__levels {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: var(--space-2);
      }
      .profile-picker__level {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 2px;
        text-align: left;
        padding: var(--space-3);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        background: var(--bg-primary);
        cursor: pointer;
        transition: border-color var(--duration-fast) ease, background var(--duration-fast) ease,
          transform var(--duration-fast) ease;
      }
      .profile-picker__level:hover {
        border-color: var(--primary);
      }
      .profile-picker__level:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      .profile-picker__level--on {
        border-color: var(--primary);
        background: var(--primary-alpha, rgba(249, 115, 22, 0.08));
        animation: profile-level-in var(--duration-fast) ease-out;
      }
      .profile-picker__level-label {
        font-size: var(--text-sm);
        font-weight: var(--font-bold);
        color: var(--text-primary);
      }
      .profile-picker__level-hint {
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }
      .profile-picker__check {
        position: absolute;
        top: var(--space-2);
        right: var(--space-2);
        width: 16px;
        height: 16px;
        color: var(--primary);
      }
      .profile-picker__effect {
        margin: var(--space-3) 0 0;
        font-size: var(--text-xs);
        color: var(--text-secondary);
        display: flex;
        gap: var(--space-2);
        flex-wrap: wrap;
      }
      .profile-picker__modules {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .profile-picker__module {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
        padding: var(--space-3);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        cursor: pointer;
        transition: border-color var(--duration-fast) ease, background var(--duration-fast) ease;
      }
      .profile-picker__module:hover {
        border-color: var(--primary);
      }
      .profile-picker__module--on {
        border-color: var(--primary);
        background: var(--primary-alpha, rgba(249, 115, 22, 0.08));
      }
      .profile-picker__module-input {
        position: absolute;
        opacity: 0;
        width: 1px;
        height: 1px;
      }
      .profile-picker__module-input:focus-visible + .profile-picker__module-box {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      .profile-picker__module-box {
        flex: none;
        width: 20px;
        height: 20px;
        margin-top: 1px;
        border: 1px solid var(--border-strong, var(--border-default));
        border-radius: var(--radius-sm);
        color: var(--primary);
        display: grid;
        place-items: center;
      }
      .profile-picker__module-box svg {
        width: 14px;
        height: 14px;
        animation: profile-check-in var(--duration-fast) ease-out;
      }
      .profile-picker__module-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .profile-picker__module-label {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-size: var(--text-sm);
        font-weight: var(--font-bold);
        color: var(--text-primary);
      }
      .profile-picker__soon {
        font-size: 10px;
        font-weight: var(--font-medium);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 1px 6px;
        border-radius: 999px;
        background: var(--bg-tertiary);
        color: var(--text-secondary);
      }
      .profile-picker__module-hint {
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }
      .profile-picker__footnote {
        margin: var(--space-2) 0 0;
        font-size: var(--text-xs);
        color: var(--text-tertiary, var(--text-secondary));
      }

      @keyframes profile-level-in {
        from {
          transform: scale(0.98);
        }
        to {
          transform: scale(1);
        }
      }
      @keyframes profile-check-in {
        from {
          opacity: 0;
          transform: scale(0.6);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .profile-picker__level,
        .profile-picker__module,
        .profile-picker__level--on,
        .profile-picker__module-box svg {
          animation: none;
          transition: none;
        }
      }
    `
  ]
})
export class HomeProfilePickerComponent {
  @Input({ required: true }) profile!: HomeProfile;
  @Output() profileChange = new EventEmitter<HomeProfile>();

  @Input() levelLabel = '¿Cómo andas de cocina?';
  @Input() levelHint =
    'No es una etiqueta: decide cuánto te explica la IA cada receta y qué tan al grano va el planificador.';
  @Input() modulesLabel = '¿Qué quieres llevar desde HogarIA?';
  @Input() modulesHint =
    'Marca lo que vas a usar. Lo que no marques sigue existiendo, solo que no te lo recordamos.';
  /** El tour pregunta las dos cosas; Preferencias también, pero se puede apagar. */
  @Input() askForLevel = true;

  readonly levels = COOKING_LEVEL_OPTIONS;
  readonly modules = HOME_MODULE_OPTIONS;

  readonly effectHint = computed(() => detailLevelHint(this.profile?.cookingLevel ?? 'beginner'));

  isSelected(module: HomeModule): boolean {
    return (this.profile?.modules ?? []).includes(module);
  }

  setLevel(level: CookingLevel): void {
    this.emit({ ...this.profile, cookingLevel: level });
  }

  toggle(module: HomeModule): void {
    this.emit({ ...this.profile, modules: toggleHomeModule(this.profile.modules, module) });
  }

  private emit(next: HomeProfile): void {
    this.profile = next;
    this.profileChange.emit(next);
  }
}
