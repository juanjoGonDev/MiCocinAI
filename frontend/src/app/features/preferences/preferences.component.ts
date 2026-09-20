import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TasteProfileService } from '../../core/services/taste-profile.service';
import { IconComponent } from '../../shared/components/ui/icon/icon.component';
import type { IconName } from '../../shared/components/ui/icon/icon-paths';
import { ToastService } from '../../core/services/toast.service';
import { ButtonComponent } from '../../shared/components/ui/button/button.component';
import { ChipSelectComponent } from '../../shared/components/ui/chip-select/chip-select.component';
import { HomeProfilePickerComponent } from '../../shared/components/ui/home-profile-picker/home-profile-picker.component';
import {
  COOKING_LEVEL_LABELS,
  DEFAULT_HOME_PROFILE,
  HomeProfile,
  toHomeProfile
} from '../../shared/models/home-profile';
import {
  COMMON_ALLERGENS,
  COMMON_DISLIKES,
  COMMON_LIKES,
  GOAL_OPTIONS,
  TasteProfile,
  emptyTasteProfile
} from '../../shared/models/taste-profile';
import { syncTabWithUrl } from '../../core/utils/tab-url';
import { MEAL_TIME_DEFAULTS, MealTimes, resolveMealTimes } from '../../core/meal-times';
import { MEAL_ORDER, MEAL_TYPE_LABELS, MealType } from '../../shared/models/calendar.model';

/**
 * Preferencias del comensal: lo que la IA tiene en cuenta al cocinar.
 *
 * Es una seccion propia (no esta en Configuracion, que habla de la app: tema,
 * idioma...) y va por pestañas, una por asunto, porque mezclar 14 alérgenos,
 * los gustos y el objetivo en una sola página no se acaba nunca. La pestaña
 * viaja en la URL (/preferences?tab=goal) como en el resto de la app.
 */
type PreferencesTab = 'profile' | 'allergies' | 'tastes' | 'meals' | 'goal';

const PREFERENCES_TABS = ['profile', 'allergies', 'tastes', 'meals', 'goal'] as const;

@Component({
  selector: 'app-preferences',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ButtonComponent,
    ChipSelectComponent,
    HomeProfilePickerComponent,
    IconComponent
  ],
  template: `
    <div class="preferences-page">
      <header class="preferences__head">
        <div>
          <h1 class="preferences__title">Preferencias</h1>
          <p class="preferences__subtitle">
            Tu perfil, alergias, gustos y objetivo: lo que respondiste al registrarte y lo que lee la
            IA antes de proponerte un plato.
          </p>
        </div>
        <a class="preferences__redo" routerLink="/onboarding">Rehacer la configuración inicial</a>
      </header>

      <div class="preferences__tabs" role="tablist">
        <button
          *ngFor="let tab of tabs"
          type="button"
          class="tab"
          role="tab"
          [attr.aria-selected]="activeTab() === tab.id"
          [class.tab--active]="activeTab() === tab.id"
          [attr.data-test]="'preferences-tab-' + tab.id"
          (click)="switchTab(tab.id)"
        >
          <app-icon [name]="tab.icon" [size]="16" />
          {{ tab.label }}
          <span class="tab__count" *ngIf="tab.count() as count">{{ count }}</span>
        </button>
      </div>

      <p class="preferences__notice" *ngIf="!tasteService.hasProfile() && !profile.modules.length">
        Todavía no has marcado nada: la IA propone sin saber qué puedes comer.
      </p>

      <section class="preferences__panel" [ngSwitch]="activeTab()">
        <!-- ── Perfil del hogar: nivel y qué se quiere usar ── -->
        <ng-container *ngSwitchCase="'profile'">
          <h2 class="preferences__panel-title">Tu perfil</h2>
          <p class="preferences__panel-hint">
            Lo que contestaste al registrarte. El nivel no es una etiqueta: decide cuánto te explica la
            IA cada receta y qué tan al grano va el planificador. Las secciones de la app (lista de la
            compra, tickets, tareas) se activan en
            <a routerLink="/settings" class="preferences__inline-link">Configuración</a>: son de la
            app, no del comensal.
          </p>
          <app-home-profile-picker
            [(profile)]="profile"
            [askForModules]="false"
            levelLabel="¿Cómo andas de cocina?"
          ></app-home-profile-picker>
        </ng-container>

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
            <h3 class="preferences__field-title">
              <app-icon name="favorite" [size]="16" /> Me gusta
            </h3>
            <app-chip-select
              label="Lo que más te gusta"
              [options]="likeOptions"
              [(value)]="taste.likes"
              customPlaceholder="Otro alimento o tipo de cocina"
            ></app-chip-select>
          </div>

          <div class="preferences__field">
            <h3 class="preferences__field-title">
              <app-icon name="remove_circle" [size]="16" /> Mejor no
            </h3>
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

        <!-- ── Horarios de las comidas ── -->
        <ng-container *ngSwitchCase="'meals'">
          <h2 class="preferences__panel-title">¿A qué hora comes?</h2>
          <p class="preferences__panel-hint">
            No es un adorno: estas horas deciden donde se sienta cada comida en el calendario, con que hora
            nace un «añadir comida» y a que hora te propone comer la IA. Si manana cenan tarde, cambiarlo
            aqui lo cambia en los tres sitios.
          </p>

          <div class="preferences__times">
            <div class="preferences__time-row" *ngFor="let field of mealFields">
              <label class="preferences__time-label" [for]="'meal-' + field.type">{{ field.label }}</label>
              <input
                class="preferences__time"
                type="time"
                [id]="'meal-' + field.type"
                [name]="'meal-' + field.type"
                [attr.data-test]="'preferences-meal-time-' + field.type"
                [(ngModel)]="mealTimes[field.type]"
              />
              <span class="preferences__time-hint">{{ field.hint }}</span>
            </div>
          </div>

          <p class="preferences__footnote">
            Vaciar una casilla la deja en blanco y la comida vuelve a su hora de siempre (la que se
            indica abajo, entre parentesis). Guardar no inventa un horario que no has tocado.
          </p>
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
        <span class="preferences__state preferences__state--ok" *ngIf="saved() && !hasUnsavedChanges()">
          <app-icon name="check_circle" [size]="16" /> Todo guardado
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

      .preferences__times {
        display: grid;
        gap: var(--space-3);
      }

      .preferences__time-row {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: var(--space-2) var(--space-3);
        padding: var(--space-2) 0;
        border-bottom: 1px solid var(--border);
      }

      .preferences__time-label {
        font-weight: 600;
      }

      .preferences__time {
        font: inherit;
        padding: var(--space-1) var(--space-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--surface);
        color: var(--text);
      }

      .preferences__time-hint {
        grid-column: 1 / -1;
        font-size: var(--text-sm);
        color: var(--text-muted);
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
      .preferences__state--ok {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        color: var(--success);
      }

    `
  ]
})
export class PreferencesComponent implements OnInit {
  /** Publico: la plantilla lee el estado de guardado del servicio. */
  readonly tasteService = inject(TasteProfileService);
  private readonly toastService = inject(ToastService);

  readonly activeTab = signal<PreferencesTab>('profile');

  /**
   * Las pestanas, en una lista: anadir una seccion no es copiar y pegar un boton con su emoji.
   * El contador es una funcion porque lee senales: si no, se quedaria con el valor de la primera
   * pasada y la pestana dejaria de contar lo que se marca.
   */
  readonly tabs: Array<{ id: PreferencesTab; label: string; icon: IconName; count: () => string | number }> = [
    { id: 'profile', label: 'Perfil', icon: 'person', count: () => this.profileLabel() },
    { id: 'allergies', label: 'Alergias', icon: 'error_outline', count: () => this.taste.allergies.length },
    { id: 'tastes', label: 'Gustos', icon: 'favorite', count: () => this.taste.likes.length + this.taste.dislikes.length },
    { id: 'meals', label: 'Horarios', icon: 'schedule', count: () => this.mealTimesLabel() },
    { id: 'goal', label: 'Objetivo', icon: 'flag', count: () => this.goalLabel() }
  ];

  /**
   * Las cuatro comidas con su defecto, en el orden del dia. Es un dato, no cuatro bloques de plantilla:
   * si manana «merienda» deja de existir o sale un almuerzo largo, esto es una linea.
   */
  readonly mealFields = MEAL_ORDER.map((type) => ({
    type,
    label: MEAL_TYPE_LABELS[type],
    hint: `En blanco: ${MEAL_TIME_DEFAULTS[type]}`
  }));

  /** Copia editable de las horas de la casa; lo guardado se compara contra `savedMealTimes`. */
  mealTimes: MealTimes = resolveMealTimes(null);
  private savedMealTimes: MealTimes = resolveMealTimes(null);

  allergenOptions = COMMON_ALLERGENS;
  likeOptions = COMMON_LIKES;
  dislikeOptions = COMMON_DISLIKES;
  goalOptions = GOAL_OPTIONS;

  /** Copia editable: nada viaja al backend hasta pulsar «Guardar preferencias». */
  taste: TasteProfile = emptyTasteProfile();
  profile: HomeProfile = DEFAULT_HOME_PROFILE;

  readonly saved = signal(false);
  private savedSnapshot = this.snapshot();

  constructor() {

    // Convencion de la app: la pestaña activa se refleja en la URL.
    syncTabWithUrl<PreferencesTab>({
      param: 'tab',
      values: PREFERENCES_TABS,
      fallback: 'profile',
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
        this.profile = toHomeProfile(data.profile);
        // El servicio ya ha normalizado (y la API contesta siempre las cuatro): aqui no se vuelve a
        // resolver el JSON, se copia lo que hay para poder editarlo.
        this.mealTimes = this.tasteService.mealTimes();
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

  /**
   * El resumen de la pestana: de la primera a la ultima hora del dia. Muestra las dos que mas se
   * miran (cuando se desayuna y cuando se cena) y, sobre todo, cambia de aspecto en cuanto se toca.
   */
  mealTimesLabel(): string {
    return `${this.mealTimes.breakfast}\u2013${this.mealTimes.dinner}`;
  }

  hasUnsavedChanges(): boolean {
    return this.snapshot() !== this.savedSnapshot;
  }

  /** En la pestaña no se muestra el valor interno ('none'), sino su nombre. */
  profileLabel(): string {
    return COOKING_LEVEL_LABELS[this.profile.cookingLevel] ?? '—';
  }

  save(): void {
    // Solo el nivel: los modulos son de Configuracion y no se pisan desde aqui.
    this.tasteService
      .save(this.taste, undefined, { cookingLevel: this.profile.cookingLevel }, this.mealTimesPatch())
      .subscribe({
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
    const snapshot = JSON.parse(this.savedSnapshot) as {
      taste: TasteProfile;
      profile: HomeProfile;
      mealTimes: MealTimes;
    };
    this.taste = snapshot.taste;
    this.profile = snapshot.profile;
    this.mealTimes = { ...snapshot.mealTimes };
    this.saved.set(false);
  }

  /**
   * Solo las horas que han cambiado. Un «no he tocado la cena» no puede reescribir la cena con el valor
   * que se ve en pantalla, porque eso fijaria el defecto de hoy y manana el cambio de la app no llegaria
   * a esta casa. Y una casilla vaciada se manda como null: el server lo lee como «quita el horario».
   */
  private mealTimesPatch(): Partial<Record<MealType, string | null>> | undefined {
    const patch: Partial<Record<MealType, string | null>> = {};
    let touched = false;
    for (const type of MEAL_ORDER) {
      const value = (this.mealTimes[type] ?? '').trim();
      if (value === this.savedMealTimes[type]) continue;
      touched = true;
      patch[type] = value || null;
    }
    return touched ? patch : undefined;
  }

  private snapshot(): string {
    return JSON.stringify({ taste: this.taste, profile: this.profile, mealTimes: this.mealTimes });
  }

  private markSaved(): void {
    this.savedSnapshot = this.snapshot();
    this.savedMealTimes = { ...this.mealTimes };
  }
}
