import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import { syncTabWithUrl } from '../../core/utils/tab-url';

/**
 * Preferencias del comensal: lo que la IA tiene en cuenta al cocinar.
 *
 * Es una seccion propia (no esta en Configuracion, que habla de la app: tema,
 * idioma...) y va por pestañas, una por asunto, porque mezclar 14 alérgenos,
 * los gustos y el objetivo en una sola página no se acaba nunca. La pestaña
 * viaja en la URL (/preferences?tab=goal) como en el resto de la app.
 */
type PreferencesTab = 'allergies' | 'tastes' | 'goal';

const PREFERENCES_TABS = ['allergies', 'tastes', 'goal'] as const;

@Component({
  selector: 'app-preferences',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonComponent, ChipSelectComponent],
  template: `
    <div class="preferences-page">
      <header class="preferences__head">
        <div>
          <h1 class="preferences__title">🥗 Preferencias</h1>
          <p class="preferences__subtitle">
            Alergias, gustos y objetivo: lo que respondiste al registrarte y lo que lee la IA antes
            de proponerte un plato.
          </p>
        </div>
        <a class="preferences__redo" routerLink="/onboarding">Rehacer la configuración inicial</a>
      </header>

      <div class="preferences__tabs" role="tablist">
        <button
          type="button"
          class="tab"
          role="tab"
          [attr.aria-selected]="activeTab() === 'allergies'"
          [class.tab--active]="activeTab() === 'allergies'"
          (click)="switchTab('allergies')"
        >
          🚫 Alergias <span class="tab__count">{{ taste.allergies.length }}</span>
        </button>
        <button
          type="button"
          class="tab"
          role="tab"
          [attr.aria-selected]="activeTab() === 'tastes'"
          [class.tab--active]="activeTab() === 'tastes'"
          (click)="switchTab('tastes')"
        >
          👍 Gustos
          <span class="tab__count">{{ taste.likes.length + taste.dislikes.length }}</span>
        </button>
        <button
          type="button"
          class="tab"
          role="tab"
          [attr.aria-selected]="activeTab() === 'goal'"
          [class.tab--active]="activeTab() === 'goal'"
          (click)="switchTab('goal')"
        >
          🎯 Objetivo <span class="tab__count">{{ goalLabel() }}</span>
        </button>
      </div>

      <p class="preferences__notice" *ngIf="!tasteService.hasProfile()">
        Todavía no has marcado nada: la IA propone sin saber qué puedes comer.
      </p>

      <section class="preferences__panel" [ngSwitch]="activeTab()">
        <!-- ── Alergias e intolerancias ── -->
        <ng-container *ngSwitchCase="'allergies'">
          <h2 class="preferences__panel-title">¿Alergias o intolerancias?</h2>
          <p class="preferences__panel-hint">
            Marca todo lo que no puedas comer. La IA lo descarta de raíz, también como ingrediente
            escondido en un caldo o una salsa.
          </p>
          <app-chip-select
            label="Alergias e intolerancias"
            [options]="allergenOptions"
            [(value)]="taste.allergies"
            customPlaceholder="Otra alergia o intolerancia"
            hint="¿No está? Escríbelo y se añade a la lista."
          ></app-chip-select>
        </ng-container>

        <!-- ── Gustos ── -->
        <ng-container *ngSwitchCase="'tastes'">
          <h2 class="preferences__panel-title">¿Qué te gusta y qué no?</h2>
          <p class="preferences__panel-hint">
            Sirve para priorizar unos platos sobre otros. No hay respuesta mala.
          </p>

          <div class="preferences__field">
            <h3 class="preferences__field-title">Me gusta 👍</h3>
            <app-chip-select
              label="Lo que más te gusta"
              [options]="likeOptions"
              [(value)]="taste.likes"
              customPlaceholder="Otro alimento o tipo de cocina"
            ></app-chip-select>
          </div>

          <div class="preferences__field">
            <h3 class="preferences__field-title">Mejor no 👎</h3>
            <app-chip-select
              label="Lo que prefieres evitar"
              [options]="dislikeOptions"
              [(value)]="taste.dislikes"
              customPlaceholder="Otro alimento que no te gusta"
            ></app-chip-select>
          </div>

          <div class="preferences__field">
            <label class="preferences__field-title" for="tasteNotes">
              Otras notas para la IA
            </label>
            <textarea
              id="tasteNotes"
              name="tasteNotes"
              class="preferences__textarea"
              rows="3"
              maxlength="1000"
              placeholder="Ej: ceno pronto, nada de fritos, me va bien el tupper para comer en el trabajo, con dos niños en casa…"
              [(ngModel)]="taste.notes"
            ></textarea>
          </div>
        </ng-container>

        <!-- ── Objetivo ── -->
        <ng-container *ngSwitchCase="'goal'">
          <h2 class="preferences__panel-title">¿Cuál es tu objetivo?</h2>
          <p class="preferences__panel-hint">
            Marca el plato, no la dieta. Es el punto de partida del planificador de la semana.
          </p>

          <div class="preferences__goals">
            <button
              *ngFor="let goal of goalOptions"
              type="button"
              class="preferences__goal"
              [class.preferences__goal--on]="taste.goal === goal.value"
              (click)="taste.goal = goal.value"
            >
              <span class="preferences__goal-icon">{{ goal.icon }}</span>
              <span class="preferences__goal-label">{{ goal.label }}</span>
              <span class="preferences__goal-hint">{{ goal.hint }}</span>
            </button>
          </div>

          <div class="preferences__field">
            <label class="preferences__field-title" for="goalNotes">
              {{
                taste.goal === 'custom'
                  ? 'Describe tu objetivo'
                  : '¿Algo más sobre el objetivo? (opcional)'
              }}
            </label>
            <textarea
              id="goalNotes"
              name="goalNotes"
              class="preferences__textarea"
              rows="3"
              maxlength="500"
              [placeholder]="
                taste.goal === 'custom'
                  ? 'Ej: sin carne los lunes, cenas de una olla y algo de pasta dos veces por semana'
                  : 'Ej: prioriza proteína en la cena y poco pan'
              "
              [(ngModel)]="taste.goalNotes"
            ></textarea>
          </div>

          <p class="preferences__footnote">
            ¿Falta cacharro? Los utensilios se marcan en
            <a routerLink="/pantry" [queryParams]="{ tab: 'utensils' }">la despensa</a>: si no
            tienes horno, no te proponemos nada al horno.
          </p>
        </ng-container>
      </section>

      <footer class="preferences__actions">
        <app-button variant="primary" [loading]="tasteService.isLoading()" (onClick)="save()">
          Guardar preferencias
        </app-button>
        <app-button *ngIf="hasUnsavedChanges()" variant="ghost" (onClick)="discard()">
          Descartar cambios
        </app-button>
        <span class="preferences__state" *ngIf="saved() && !hasUnsavedChanges()">
          Todo guardado ✓
        </span>
        <span class="preferences__state" *ngIf="hasUnsavedChanges()">Hay cambios sin guardar</span>
      </footer>
    </div>
  `,
  styles: [
    `
      .preferences-page {
        padding: var(--space-4);
        max-width: 760px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
      }

      .preferences__head {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-3);
      }
      .preferences__title {
        font-family: var(--font-display);
        font-size: var(--text-2xl);
        font-weight: var(--font-bold);
        color: var(--text-primary);
      }
      .preferences__subtitle {
        margin-top: var(--space-1);
        font-size: var(--text-sm);
        color: var(--text-secondary);
        max-width: 52ch;
      }
      .preferences__redo {
        font-size: var(--text-sm);
        color: var(--primary);
        white-space: nowrap;
        &:hover {
          text-decoration: underline;
        }
      }

      .preferences__tabs {
        display: flex;
        gap: var(--space-2);
        border-bottom: 1px solid var(--border-default);
      }
      .tab {
        background: none;
        border: none;
        padding: var(--space-3) var(--space-4);
        font-family: var(--font-sans);
        font-size: var(--text-sm);
        font-weight: var(--font-medium);
        color: var(--text-secondary);
        cursor: pointer;
        border-bottom: 2px solid transparent;
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        transition: var(--transition-fast);
        &:hover {
          color: var(--text-primary);
        }
        &--active {
          color: var(--primary);
          border-bottom-color: var(--primary);
        }
      }
      .tab__count {
        background: var(--bg-tertiary);
        border-radius: var(--radius-full);
        padding: 1px 8px;
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }
      .tab--active .tab__count {
        background: var(--primary-subtle);
        color: var(--primary-dark);
      }

      .preferences__notice {
        font-size: var(--text-sm);
        color: var(--text-secondary);
        background: var(--bg-secondary);
        border: 1px dashed var(--border-default);
        border-radius: var(--radius-md);
        padding: var(--space-3) var(--space-4);
      }

      .preferences__panel {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }
      .preferences__panel-title {
        font-family: var(--font-display);
        font-size: var(--text-lg);
        font-weight: var(--font-semibold);
        color: var(--text-primary);
      }
      .preferences__panel-hint {
        font-size: var(--text-sm);
        color: var(--text-secondary);
        margin-top: calc(-1 * var(--space-3));
      }
      .preferences__field {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .preferences__field-title {
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        color: var(--text-primary);
      }
      .preferences__textarea {
        width: 100%;
        padding: var(--space-3);
        font-family: var(--font-sans);
        font-size: var(--text-sm);
        color: var(--text-primary);
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        resize: vertical;
        &:focus {
          outline: none;
          border-color: var(--primary);
        }
      }

      .preferences__goals {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: var(--space-3);
      }
      .preferences__goal {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: var(--space-3) var(--space-4);
        text-align: left;
        background: var(--bg-secondary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: var(--transition-fast);
        &:hover {
          border-color: var(--border-strong);
        }
        &--on {
          border-color: var(--primary);
          background: var(--primary-subtle);
        }
      }
      .preferences__goal-icon {
        font-size: var(--text-lg);
      }
      .preferences__goal-label {
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        color: var(--text-primary);
      }
      .preferences__goal-hint {
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }

      .preferences__footnote {
        font-size: var(--text-sm);
        color: var(--text-secondary);
        a {
          color: var(--primary);
        }
      }

      .preferences__actions {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding-top: var(--space-3);
        border-top: 1px solid var(--border-default);
      }
      .preferences__state {
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
    `
  ]
})
export class PreferencesComponent implements OnInit {
  /** Publico: la plantilla lee el estado de guardado del servicio. */
  readonly tasteService = inject(TasteProfileService);
  private readonly toastService = inject(ToastService);

  readonly tabs = PREFERENCES_TABS;
  readonly activeTab = signal<PreferencesTab>('allergies');

  allergenOptions = COMMON_ALLERGENS;
  likeOptions = COMMON_LIKES;
  dislikeOptions = COMMON_DISLIKES;
  goalOptions = GOAL_OPTIONS;

  /** Copia editable: nada viaja al backend hasta pulsar «Guardar preferencias». */
  taste: TasteProfile = emptyTasteProfile();

  readonly saved = signal(false);
  private savedSnapshot = JSON.stringify(this.taste);

  constructor() {
    // Convencion de la app: la pestaña activa se refleja en la URL.
    syncTabWithUrl<PreferencesTab>({
      param: 'tab',
      values: PREFERENCES_TABS,
      fallback: 'allergies',
      current: () => this.activeTab(),
      onChange: (tab) => this.activeTab.set(tab)
    });
  }

  ngOnInit(): void {
    // El onboarding puede haber cambiado el perfil hace un momento: se pide
    // siempre, no vale el que pudo cargar el layout al abrir la app.
    this.tasteService.load().subscribe({
      next: (data) => {
        this.taste = { ...emptyTasteProfile(), ...data.taste };
        this.markSaved();
      },
      error: () => this.toastService.error('Error', 'No se pudieron cargar tus preferencias')
    });
  }

  switchTab(tab: PreferencesTab): void {
    this.activeTab.set(tab);
  }

  /** El objetivo en palabras, para que la pestaña no muestre el valor interno. */
  goalLabel(): string {
    return this.goalOptions.find((goal) => goal.value === this.taste.goal)?.label ?? '—';
  }

  hasUnsavedChanges(): boolean {
    return JSON.stringify(this.taste) !== this.savedSnapshot;
  }

  save(): void {
    this.tasteService.save(this.taste).subscribe({
      next: () => {
        this.markSaved();
        this.saved.set(true);
        this.toastService.success('Guardado', 'La IA tendrá en cuenta tus preferencias.');
      },
      error: () => this.toastService.error('Error', 'No se pudo guardar')
    });
  }

  /** Vuelve a lo guardado sin recargar la página. */
  discard(): void {
    this.taste = JSON.parse(this.savedSnapshot) as TasteProfile;
    this.saved.set(false);
  }

  private markSaved(): void {
    this.savedSnapshot = JSON.stringify(this.taste);
  }
}
