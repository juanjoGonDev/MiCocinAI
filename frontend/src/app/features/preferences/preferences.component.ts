import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TasteProfileService } from '../../core/services/taste-profile.service';
import { AuthService } from '../../core/services/auth.service';
import { AvatarComponent } from '../../shared/components/ui/avatar/avatar.component';
import { IconComponent } from '../../shared/components/ui/icon/icon.component';
import type { IconName } from '../../shared/components/ui/icon/icon-paths';
import { avatarDataUrlFromFile, avatarFileError } from '../../core/avatar-image';
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

/**
 * Preferencias del comensal: lo que la IA tiene en cuenta al cocinar.
 *
 * Es una seccion propia (no esta en Configuracion, que habla de la app: tema,
 * idioma...) y va por pestañas, una por asunto, porque mezclar 14 alérgenos,
 * los gustos y el objetivo en una sola página no se acaba nunca. La pestaña
 * viaja en la URL (/preferences?tab=goal) como en el resto de la app.
 */
type PreferencesTab = 'account' | 'profile' | 'allergies' | 'tastes' | 'goal';

const PREFERENCES_TABS = ['account', 'profile', 'allergies', 'tastes', 'goal'] as const;

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
    AvatarComponent,
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
        <!-- ── La cuenta: nombre, foto y contrasena ── -->
        <ng-container *ngSwitchCase="'account'">
          <h2 class="preferences__panel-title">Tu cuenta</h2>
          <p class="preferences__panel-hint">
            Como te ve el resto de la casa: en los avisos de la compra, en los apuntes de la agenda y
            en el menu. Se guarda aqui mismo, sin esperar al boton de abajo.
          </p>

          <div class="account__identity">
            <app-avatar
              [name]="auth.userName() || 'H'"
              [src]="avatarUrl() ?? undefined"
              size="lg"
              data-test="account-avatar"
            ></app-avatar>
            <div class="account__identity-text">
              <p class="account__identity-name">{{ auth.userName() }}</p>
              <p class="account__identity-hint">
                Sin foto se ve tu inicial sobre un color; con foto, la foto con un anillo del mismo color.
              </p>
            </div>
          </div>

          <div class="account__photo-actions">
            <label class="account__file" for="account-photo" data-test="account-photo-label">
              <app-icon name="add_a_photo" [size]="16" />
              {{ uploading() ? 'Subiendo foto...' : 'Cambiar la foto' }}
              <input
                id="account-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                data-test="account-photo"
                [disabled]="uploading()"
                (change)="onPhotoPicked($event)"
              />
            </label>
            <app-button
              *ngIf="avatarUrl()"
              variant="ghost"
              size="sm"
              [disabled]="uploading()"
              data-test="account-photo-remove"
              (onClick)="removePhoto()"
            >
              Quitar la foto
            </app-button>
          </div>
          <p class="account__error" *ngIf="photoError()" data-test="account-photo-error">{{ photoError() }}</p>

          <div class="account__field">
            <label class="account__label" for="account-name">Nombre</label>
            <input
              id="account-name"
              class="account__input"
              type="text"
              maxlength="100"
              autocomplete="name"
              placeholder="Como te llamas en casa"
              data-test="account-name"
              [(ngModel)]="nameDraft"
              (ngModelChange)="onNameInput()"
            />
            <p class="account__error" *ngIf="nameError()" data-test="account-name-error">{{ nameError() }}</p>
            <div class="account__field-actions">
              <app-button
                variant="primary"
                size="sm"
                [loading]="savingName()"
                [disabled]="!nameDirty()"
                data-test="account-name-save"
                (onClick)="saveName()"
              >
                Guardar el nombre
              </app-button>
              <app-button
                *ngIf="nameDirty()"
                variant="ghost"
                size="sm"
                data-test="account-name-cancel"
                (onClick)="cancelName()"
              >
                Cancelar
              </app-button>
            </div>
          </div>

          <div class="account__field">
            <span class="account__label">Contrasena</span>
            <p class="account__hint">Seis caracteres como minimo, con una mayuscula y un numero.</p>
            <input
              class="account__input"
              type="password"
              autocomplete="current-password"
              placeholder="Contrasena actual"
              data-test="account-password-current"
              [(ngModel)]="passwordDraft.current"
            />
            <input
              class="account__input"
              type="password"
              autocomplete="new-password"
              placeholder="Nueva contrasena"
              data-test="account-password-new"
              [(ngModel)]="passwordDraft.fresh"
            />
            <input
              class="account__input"
              type="password"
              autocomplete="new-password"
              placeholder="Repite la nueva contrasena"
              data-test="account-password-repeat"
              [(ngModel)]="passwordDraft.repeat"
            />
            <div class="account__strength" *ngIf="passwordDraft.fresh">
              <span
                *ngFor="let level of [1, 2, 3, 4]"
                class="account__strength-dot"
                [class.account__strength-dot--on]="passwordStrength() >= level"
              ></span>
              <span class="account__strength-text">{{ passwordStrengthLabel() }}</span>
            </div>
            <p class="account__error" *ngIf="passwordError()" data-test="account-password-error">{{ passwordError() }}</p>
            <div class="account__field-actions">
              <app-button
                variant="primary"
                size="sm"
                [loading]="savingPassword()"
                [disabled]="!passwordDirty()"
                data-test="account-password-save"
                (onClick)="savePassword()"
              >
                Cambiar la contrasena
              </app-button>
              <app-button
                *ngIf="passwordDirty()"
                variant="ghost"
                size="sm"
                data-test="account-password-cancel"
                (onClick)="cancelPassword()"
              >
                Cancelar
              </app-button>
            </div>
          </div>
        </ng-container>

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

      <!-- La cuenta se guarda sola (habla con /api/auth, no con el perfil de gustos): aqui el
           boton de abajo no pinta nada y se quita. -->
      <footer class="preferences__actions" *ngIf="activeTab() !== 'account'">
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

      /* La cuenta: el avatar manda, porque es lo que la persona viene a cambiar. */
      .account__identity {
        display: flex;
        align-items: center;
        gap: var(--space-4);
        flex-wrap: wrap;
      }
      .account__identity-name {
        font-size: var(--text-base);
        font-weight: var(--font-semibold);
        color: var(--text-primary);
      }
      .account__identity-hint {
        font-size: var(--text-xs);
        color: var(--text-secondary);
        max-width: 46ch;
      }

      .account__photo-actions {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        flex-wrap: wrap;
      }
      /* El input[type=file] nativo es un boton feo con un texto largo dentro: se tapa y se
         pinta el label. Queda enfocable igual, y el anillo se lo ponemos al label. */
      .account__file {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-full);
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-size: var(--text-sm);
        font-weight: var(--font-medium);
        cursor: pointer;
        transition: var(--transition-fast);
      }
      .account__file:hover {
        border-color: var(--primary);
        color: var(--primary);
      }
      .account__file:has(input:focus-visible) {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      .account__file input {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        cursor: pointer;
      }
      .account__file input:disabled {
        cursor: wait;
      }

      .account__field {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        max-width: 420px;
        padding-top: var(--space-2);
        border-top: 1px solid var(--border-default);
      }
      .account__label {
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        color: var(--text-primary);
      }
      .account__input {
        width: 100%;
        padding: var(--space-2) var(--space-3);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-family: var(--font-sans);
        font-size: var(--text-sm);
        transition: var(--transition-fast);
      }
      .account__input:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 3px var(--primary-subtle);
      }
      .account__hint {
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }
      .account__error {
        font-size: var(--text-xs);
        color: var(--error);
      }
      .account__field-actions {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }

      /* Medidor de contrasena: cuatro puntos, sin numeritos ni porcentajes. */
      .account__strength {
        display: flex;
        align-items: center;
        gap: var(--space-1);
      }
      .account__strength-dot {
        width: 22px;
        height: 4px;
        border-radius: var(--radius-full);
        background: var(--border-default);
        transition: var(--transition-fast);
      }
      .account__strength-dot--on {
        background: var(--primary);
      }
      .account__strength-text {
        font-size: var(--text-xs);
        color: var(--text-secondary);
        margin-left: var(--space-2);
      }
    `
  ]
})
export class PreferencesComponent implements OnInit {
  /** Publico: la plantilla lee el estado de guardado del servicio. */
  readonly tasteService = inject(TasteProfileService);
  /** Publico: la plantilla muestra el nombre y la foto reales, no un duplicado local. */
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);

  readonly activeTab = signal<PreferencesTab>('account');

  /**
   * Las pestanas, en una lista: anadir una seccion no es copiar y pegar un boton con su emoji.
   * El contador es una funcion porque lee senales: si no, se quedaria con el valor de la primera
   * pasada y la pestana dejaria de contar lo que se marca.
   */
  readonly tabs: Array<{ id: PreferencesTab; label: string; icon: IconName; count: () => string | number }> = [
    { id: 'account', label: 'Cuenta', icon: 'account_circle', count: () => '' },
    { id: 'profile', label: 'Perfil', icon: 'person', count: () => this.profileLabel() },
    { id: 'allergies', label: 'Alergias', icon: 'error_outline', count: () => this.taste.allergies.length },
    { id: 'tastes', label: 'Gustos', icon: 'favorite', count: () => this.taste.likes.length + this.taste.dislikes.length },
    { id: 'goal', label: 'Objetivo', icon: 'flag', count: () => this.goalLabel() }
  ];

  /** Nombre y contrasena: borradores locales que solo viajan al pulsar su boton. */
  nameDraft = '';
  passwordDraft = { current: '', fresh: '', repeat: '' };
  readonly uploading = signal(false);
  readonly savingName = signal(false);
  readonly savingPassword = signal(false);
  readonly photoError = signal('');
  readonly nameError = signal('');
  readonly passwordError = signal('');
  readonly avatarUrl = signal<string | null>(null);
  /** Si se tocó el campo, ya no se pisa con lo guardado: quien escribe tiene la razon. */
  private readonly nameTouched = signal(false);

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
    // La foto es un fichero en el servidor: la URL vive en el usuario. Y el usuario puede llegar
    // del cache o estar refrescandose justo cuando se abre la pantalla, asi que el borrador del
    // nombre y la URL del avatar se sincronizan con lo que haya en la senal mientras nadie haya
    // escrito en el campo. Fijarlos una sola vez en el constructor dejaba el nombre en blanco.
    effect(() => {
      if (this.nameTouched()) return;
      const user = this.auth.currentUser();
      this.nameDraft = user?.name ?? '';
      this.avatarUrl.set(user?.avatar ?? null);
    });


    // Convencion de la app: la pestaña activa se refleja en la URL.
    syncTabWithUrl<PreferencesTab>({
      param: 'tab',
      values: PREFERENCES_TABS,
      fallback: 'account',
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
        this.markSaved();
      },
      error: () => this.toastService.error('Error', 'No se pudieron cargar tus preferencias')
    });
  }

  switchTab(tab: PreferencesTab): void {
    this.activeTab.set(tab);
  }

  /**
   * El archivo se elige, se recorta a 128 px y se comprime AQUI. Si pesa o no es un formato que
   * un canvas sepa decodificar, se dice antes de subir nada: el servidor lo rechazaria igual,
   * pero el mensaje tecnico no le sirve a nadie.
   */
  async onPhotoPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // el mismo fichero dos veces seguidas debe volver a disparar el change
    if (!file) return;

    const problem = avatarFileError(file);
    if (problem) {
      this.photoError.set(problem);
      return;
    }
    this.photoError.set('');
    this.uploading.set(true);
    try {
      const dataUrl = await avatarDataUrlFromFile(file);
      const avatar = await this.auth.uploadAvatar(dataUrl).toPromise();
      this.avatarUrl.set(avatar ?? null);
      this.toastService.success('Foto actualizada', 'Ya aparece en el menu y donde te vean.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      this.photoError.set(message && !message.includes('Http') ? message : 'No se pudo subir la foto. Intentalo otra vez.');
    } finally {
      this.uploading.set(false);
    }
  }

  async removePhoto(): Promise<void> {
    this.uploading.set(true);
    try {
      await this.auth.removeAvatar().toPromise();
      this.avatarUrl.set(null);
      this.photoError.set('');
    } catch {
      this.photoError.set('No se pudo quitar la foto.');
    } finally {
      this.uploading.set(false);
    }
  }

  onNameInput(): void {
    this.nameTouched.set(true);
    this.nameError.set('');
  }

  get savedName(): string {
    return this.auth.currentUser()?.name ?? '';
  }

  nameDirty(): boolean {
    return this.nameDraft.trim() !== this.savedName.trim();
  }

  saveName(): void {
    const name = this.nameDraft.trim();
    // La regla minima es la del servidor (2 caracteres); decirla aqui ahorra un viaje en balde.
    if (name.length < 2) {
      this.nameError.set('Escribe al menos dos caracteres.');
      return;
    }
    this.savingName.set(true);
    this.auth.updateProfile({ name }).subscribe({
      next: () => {
        this.savingName.set(false);
        this.nameError.set('');
        this.toastService.success('Nombre guardado', 'Asi te veran en la casa a partir de ahora.');
      },
      error: () => {
        this.savingName.set(false);
        this.nameError.set('No se pudo guardar el nombre. Intentalo otra vez.');
      }
    });
  }

  /** Cancelar vuelve a lo guardado: sin esto, cambiar de pestana se lo lleva puesto. */
  cancelName(): void {
    this.nameTouched.set(false);
    this.nameDraft = this.savedName;
    this.nameError.set('');
  }

  passwordDirty(): boolean {
    return Boolean(this.passwordDraft.current || this.passwordDraft.fresh || this.passwordDraft.repeat);
  }

  /** La misma regla que el servidor, contada en puntos para no mandar una contrasena floja. */
  passwordStrength(): number {
    const value = this.passwordDraft.fresh;
    let score = 0;
    if (value.length >= 6) score++;
    if (value.length >= 10) score++;
    if (/[A-Z]/.test(value) && /[0-9]/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value) || value.length >= 14) score++;
    return score;
  }

  passwordStrengthLabel(): string {
    return ['muy corta', 'justa', 'razonable', 'buena', 'fuerte'][Math.min(this.passwordStrength(), 4)];
  }

  savePassword(): void {
    const { current, fresh, repeat } = this.passwordDraft;
    if (!current) {
      this.passwordError.set('Falta la contrasena actual.');
      return;
    }
    if (!/[A-Z]/.test(fresh) || !/[0-9]/.test(fresh) || fresh.length < 6) {
      this.passwordError.set('La nueva contrasena necesita seis caracteres, una mayuscula y un numero.');
      return;
    }
    if (fresh !== repeat) {
      this.passwordError.set('Las dos contrasenas nuevas no coinciden.');
      return;
    }
    this.savingPassword.set(true);
    this.auth.changePassword(current, fresh).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.passwordError.set('');
        this.cancelPassword();
        this.toastService.success('Contrasena cambiada', 'La proxima vez entra con la nueva.');
      },
      error: (error) => {
        this.savingPassword.set(false);
        const message = typeof error?.error?.message === 'string' ? error.error.message : '';
        this.passwordError.set(
          message.includes('incorrect') ? 'La contrasena actual no es esa.' : 'No se pudo cambiar la contrasena.'
        );
      }
    });
  }

  cancelPassword(): void {
    this.passwordDraft = { current: '', fresh: '', repeat: '' };
    this.passwordError.set('');
  }

  /** El objetivo en palabras, para que la pestaña no muestre el valor interno. */
  goalLabel(): string {
    return this.goalOptions.find((goal) => goal.value === this.taste.goal)?.label ?? '—';
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
      .save(this.taste, undefined, { cookingLevel: this.profile.cookingLevel })
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
    const snapshot = JSON.parse(this.savedSnapshot) as { taste: TasteProfile; profile: HomeProfile };
    this.taste = snapshot.taste;
    this.profile = snapshot.profile;
    this.saved.set(false);
  }

  private snapshot(): string {
    return JSON.stringify({ taste: this.taste, profile: this.profile });
  }

  private markSaved(): void {
    this.savedSnapshot = this.snapshot();
  }
}
