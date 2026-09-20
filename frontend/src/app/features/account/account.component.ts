import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ShoppingService } from '../../core/services/shopping.service';
import { ToastService } from '../../core/services/toast.service';
import { timeZoneLabel } from '../../core/time';
import { COOKING_LEVEL_LABELS } from '../../shared/models/home-profile';
import { syncTabWithUrl } from '../../core/utils/tab-url';
import { avatarFileError } from '../../core/avatar-image';
import { AvatarEditorComponent } from './avatar-editor.component';
import { ModalComponent } from '../../shared/components/ui/modal/modal.component';
import { formatBytes, pendingLabel, shortId, storageUsage } from './account-info';
import { ButtonComponent } from '../../shared/components/ui/button/button.component';
import { AvatarComponent } from '../../shared/components/ui/avatar/avatar.component';
import { IconComponent } from '../../shared/components/ui/icon/icon.component';
import type { IconName } from '../../shared/components/ui/icon/icon-paths';
import { environment } from '../../../environments/environment';

/**
 * La cuenta de la persona, en su propia pagina (HOGARIA-SPEC §12l).
 *
 * Estaba dentro de Preferencias, y Preferencias habla del comensal: alergias, gustos, objetivo.
 * Son dos personas distintas en la misma pantalla —quien cocina y quien eres— y al pulsar tu cara
 * en el menu lo que se quiere tocar es la cara, no el ajo. Tres sub-secciones, una por asunto que
 * se puede estropear de una manera distinta: como te llamas y tu foto (aqui), tu contrasena y tu
 * sesion (aqui, y nada mas), y lo que la app tiene guardado en este navegador (aqui, porque antes
 * no habia donde mirarlo).
 */
type AccountTab = 'account' | 'security' | 'info';

const ACCOUNT_TABS = ['account', 'security', 'info'] as const;

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AvatarComponent, ButtonComponent, IconComponent, ModalComponent, AvatarEditorComponent],
  template: `
    <div class="account-page">
      <header class="account__head">
        <div>
          <p class="account__eyebrow">Hogar</p>
          <h1 class="account__title">Mi cuenta</h1>
          <p class="account__subtitle">
            Tu nombre, tu foto y tu acceso. Lo de comer —alergias, gustos y objetivo— se edita en
            <a routerLink="/preferences" class="account__inline-link">Preferencias</a>, y lo de la
            casa (las personas y lo que ve cada una) en
            <a routerLink="/household" class="account__inline-link">Hogar</a>.
          </p>
        </div>
      </header>

      <div class="account__tabs" role="tablist" data-test="account-tabs">
        <button
          *ngFor="let tab of tabs"
          type="button"
          class="tab"
          role="tab"
          [attr.aria-selected]="activeTab() === tab.id"
          [class.tab--active]="activeTab() === tab.id"
          [attr.data-test]="'account-tab-' + tab.id"
          (click)="switchTab(tab.id)"
        >
          <app-icon [name]="tab.icon" [size]="16" />
          {{ tab.label }}
        </button>
      </div>

      <section class="account__panel" [ngSwitch]="activeTab()">
        <!-- ── Como te llaman en casa ── -->
        <ng-container *ngSwitchCase="'account'">
          <div class="account__identity">
            <button
              type="button"
              class="account__face"
              data-test="account-avatar-button"
              [attr.aria-label]="(avatarUrl() ? 'Cambiar la foto de ' : 'Subir una foto para ') + (auth.userName() || 'tu cuenta')"
              (click)="openAvatarModal()"
            >
              <app-avatar
                [name]="auth.userName() || 'H'"
                [src]="avatarUrl() ?? undefined"
                size="xl"
                data-test="account-avatar"
                (imageError)="photoBroken.set(true)"
              />
              <span class="account__face-edit" data-test="account-avatar-edit">
                <app-icon name="photo_camera" [size]="14" />
                {{ avatarUrl() ? 'Cambiar' : 'Poner foto' }}
              </span>
            </button>
            <div class="account__identity-text">
              <p class="account__identity-name">{{ auth.userName() }}</p>
              <p class="account__identity-hint">
                Pulsa tu cara para cambiar la foto: se puede encuadrar y acercar antes de subirla.
                Sin foto se ve tu inicial sobre un color, y con foto un anillo alrededor.
              </p>
            </div>
          </div>

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
            <p class="account__hint">
              Aparece en el historial de cada lista y en los apuntes de la agenda. Cambiarlo no toca
              lo que ya paso: se veran tus lineas antiguas con tu nombre de hoy.
            </p>
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
        </ng-container>

        <!-- ── La contrasena y la sesion ── -->
        <ng-container *ngSwitchCase="'security'">
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

          <div class="account__field">
            <span class="account__label">Esta sesion</span>
            <p class="account__hint">
              La contrasena se guarda con hash: nadie puede leerla, ni esta app. El acceso vive en
              este navegador, y cerrar aqui no borra nada de la casa.
            </p>
            <div class="account__field-actions">
              <app-button variant="ghost" size="sm" data-test="account-logout" (onClick)="endSession()">
                <app-icon name="logout" [size]="16" />
                Cerrar sesion en este dispositivo
              </app-button>
            </div>
          </div>
        </ng-container>

        <!-- ── Lo que la app guarda de ti ── -->
        <ng-container *ngSwitchCase="'info'">
          <dl class="account__facts">
            <div class="account__fact">
              <dt>Correo</dt>
              <dd data-test="account-email">{{ email() }}</dd>
              <p class="account__fact-note">
                Con el que entras. No se cambia desde aqui: si se te va, se crea la cuenta con el
                correo nuevo y se vuelve a invitar a la casa.
              </p>
            </div>
            <div class="account__fact">
              <dt>Nivel de cocina</dt>
              <dd>
                <a routerLink="/preferences?tab=profile" class="account__inline-link" data-test="account-level-link">
                  {{ cookingLevel() }}
                </a>
              </dd>
              <p class="account__fact-note">Cuan larga o cuan al grano escribe la IA.</p>
            </div>
            <div class="account__fact">
              <dt>Casa</dt>
              <dd>
                <a *ngIf="householdId(); else noHousehold" routerLink="/household" class="account__inline-link"
                  >Personas de la casa</a
                >
                <ng-template #noHousehold>Sin casa, solo lo tuyo</ng-template>
              </dd>
              <p class="account__fact-note">Las listas y la agenda compartidas viven ahi.</p>
            </div>
            <div class="account__fact">
              <dt>En este navegador</dt>
              <dd data-test="account-storage">{{ storageText() }}</dd>
              <p class="account__fact-note" data-test="account-pending">{{ pendingText() }}</p>
            </div>
            <div class="account__fact">
              <dt>Version</dt>
              <dd data-test="account-version">{{ version() }}</dd>
              <p class="account__fact-note">
                La hora se muestra en {{ timezone() }}; es la del dispositivo, no hay que
                configurarla.
              </p>
            </div>
            <div class="account__fact">
              <dt>Identificador</dt>
              <dd class="account__mono" [title]="accountId()">{{ shortAccountId() }}</dd>
              <p class="account__fact-note">Para nombrar un problema en el registro de la app.</p>
            </div>
          </dl>
        </ng-container>
      </section>

      <!-- La foto, en dos pasos dentro del mismo modal: que hacer con la actual, y encuadrar la
           nueva. Dos modales apilados serian dos teclados de escape que cerrar. -->
      <app-modal
        [isOpen]="avatarModalOpen()"
        (isOpenChange)="onAvatarModalOpenChange($event)"
        [title]="avatarStep() === 'crop' ? 'Encuadrar la foto' : 'Tu foto'"
        size="sm"
      >
        @if (avatarStep() === 'crop') {
          <app-avatar-editor [file]="pendingPhoto()" (cancelled)="backToChoose()" (applied)="onCropped($event)" />
        } @else {
          <div class="avatar-choose">
            <div class="avatar-choose__preview">
              <app-avatar
                [name]="auth.userName() || 'H'"
                [src]="avatarUrl() ?? undefined"
                size="xl"
                (imageError)="photoBroken.set(true)"
              />
            </div>
            <p class="avatar-choose__hint" *ngIf="!avatarUrl()">
              Todavia no tienes foto. Sube una y recortala donde quieras: se guarda un cuadrado
              pequeno, no la foto entera del movil.
            </p>
            <p class="avatar-choose__broken" *ngIf="photoBroken()" data-test="avatar-broken">
              La foto guardada ya no esta en el servidor, y por eso se ve tu inicial en su lugar.
              Sube otra o quitala.
            </p>
            <div class="avatar-choose__actions">
              <label class="account__file" for="account-photo" data-test="account-photo-label">
                <app-icon name="add_a_photo" [size]="16" />
                {{ avatarUrl() ? 'Sustituir la foto' : 'Subir una foto' }}
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
            <p class="avatar-choose__busy" *ngIf="uploading()">Subiendo la foto...</p>
          </div>
        }
      </app-modal>
    </div>
  `,
  styles: [
    `
      .account-page {
        padding: var(--space-4);
        max-width: 720px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
      }

      .account__eyebrow {
        font-size: var(--text-xs);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-tertiary);
      }
      .account__title {
        font-family: var(--font-display);
        font-size: var(--text-2xl);
        font-weight: var(--font-bold);
        color: var(--text-primary);
      }
      .account__subtitle {
        margin-top: var(--space-1);
        font-size: var(--text-sm);
        color: var(--text-secondary);
        max-width: 62ch;
      }
      .account__inline-link {
        color: var(--primary);
      }

      .account__tabs {
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

      .account__panel {
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
      }

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

      /* La cara es el control: al pasar el dedo o el puntero se ve que se puede tocar. En una
         pantalla sin hover la etiqueta sale siempre, porque ahi no hay puntero que avise. */
      .account__face {
        position: relative;
        display: inline-flex;
        padding: 0;
        border: none;
        background: none;
        border-radius: var(--radius-full);
        cursor: pointer;
      }
      .account__face:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px var(--primary);
      }
      .account__face-edit {
        position: absolute;
        inset: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-1);
        border-radius: var(--radius-full);
        background: rgba(15, 16, 18, 0.62);
        color: var(--text-inverse);
        font-size: var(--text-xs);
        font-weight: var(--font-medium);
        opacity: 0;
        pointer-events: none;
        transition: var(--transition-fast);
      }
      .account__face:hover .account__face-edit,
      .account__face:focus-visible .account__face-edit {
        opacity: 1;
      }
      @media (hover: none) {
        .account__face-edit {
          opacity: 1;
        }
      }

      .avatar-choose {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: var(--space-3);
      }
      .avatar-choose__preview {
        align-self: center;
      }
      .avatar-choose__hint {
        margin: 0;
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }
      .avatar-choose__broken {
        margin: 0;
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-md);
        background: var(--warning-subtle);
        color: var(--text-primary);
        font-size: var(--text-xs);
      }
      .avatar-choose__actions {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        flex-wrap: wrap;
      }
      .avatar-choose__busy {
        margin: 0;
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      /* El input[type=file] nativo es un boton feo con un texto largo dentro: se tapa y se pinta
         el label. Sigue enfocable, y el anillo se lo ponemos al label. */
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
        padding-top: var(--space-3);
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

      /* Los datos de la cuenta son un diccionario, no un formulario: aqui no se toca nada. */
      .account__facts {
        display: grid;
        gap: var(--space-3);
        margin: 0;
      }
      .account__fact {
        display: grid;
        grid-template-columns: minmax(120px, 30%) 1fr;
        gap: 0 var(--space-4);
        align-items: baseline;
        padding-bottom: var(--space-3);
        border-bottom: 1px solid var(--border-default);
      }
      .account__fact dt {
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        color: var(--text-primary);
      }
      .account__fact dd {
        margin: 0;
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
      .account__fact-note {
        grid-column: 2;
        margin: 2px 0 0;
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      .account__mono {
        font-family: var(--font-mono);
        font-size: var(--text-xs);
      }

      @media (max-width: 560px) {
        .account__fact {
          grid-template-columns: 1fr;
          gap: 2px;
        }
        .account__fact-note {
          grid-column: 1;
        }
      }
    `
  ]
})
export class AccountComponent {
  /** Publico: la plantilla lee el usuario de la misma senal que el menu, no una copia. */
  readonly auth = inject(AuthService);
  private readonly shopping = inject(ShoppingService);
  private readonly toastService = inject(ToastService);

  readonly tabs: Array<{ id: AccountTab; label: string; icon: IconName }> = [
    { id: 'account', label: 'Cuenta', icon: 'account_circle' },
    { id: 'security', label: 'Seguridad', icon: 'settings' },
    { id: 'info', label: 'Informacion', icon: 'description' }
  ];
  readonly activeTab = signal<AccountTab>('account');

  /** Borradores locales: nada viaja al servidor hasta pulsar el boton de su bloque. */
  nameDraft = '';
  passwordDraft = { current: '', fresh: '', repeat: '' };
  readonly uploading = signal(false);
  readonly savingName = signal(false);
  readonly savingPassword = signal(false);
  readonly photoError = signal('');
  readonly nameError = signal('');
  readonly passwordError = signal('');
  readonly avatarUrl = signal<string | null>(null);
  /** Si la URL guardada no carga, eso es un estado que se puede arreglar: se dice, no se calla. */
  readonly photoBroken = signal(false);
  readonly avatarModalOpen = signal(false);
  /** Los dos pasos de la foto: que hacer con la actual, y encuadrar la nueva. */
  readonly avatarStep = signal<'choose' | 'crop'>('choose');
  readonly pendingPhoto = signal<File | null>(null);
  /** Si se toco el campo, ya no se pisa con lo guardado: quien escribe tiene la razon. */
  private readonly nameTouched = signal(false);

  constructor() {
    // La foto es un fichero en el servidor: la URL vive en el usuario. Y el usuario puede llegar
    // del cache o estar refrescandose justo cuando se abre la pantalla, asi que el borrador del
    // nombre y la URL del avatar se sincronizan con la senal mientras nadie haya escrito.
    effect(() => {
      if (this.nameTouched()) return;
      const user = this.auth.currentUser();
      this.nameDraft = user?.name ?? '';
      this.avatarUrl.set(user?.avatar ?? null);
      // Una foto nueva (o quitada) borra el aviso de foto rota: si no, el aviso se quedaria
      // pegado despues de arreglar justo lo que avisaba.
      this.photoBroken.set(false);
    });

    syncTabWithUrl<AccountTab>({
      param: 'tab',
      values: ACCOUNT_TABS,
      fallback: 'account',
      current: () => this.activeTab(),
      onChange: (tab) => this.activeTab.set(tab)
    });
  }

  switchTab(tab: AccountTab): void {
    this.activeTab.set(tab);
  }

  // ── La cara y el nombre ────────────────────────────────────────────────

  openAvatarModal(): void {
    this.avatarStep.set('choose');
    this.photoError.set('');
    this.avatarModalOpen.set(true);
  }

  /** El modal se cierra tambien con Escape y con el fondo: los tres caminos pasan por aqui. */
  onAvatarModalOpenChange(open: boolean): void {
    if (open) this.openAvatarModal();
    else this.closeAvatarModal();
  }

  closeAvatarModal(): void {
    this.avatarModalOpen.set(false);
    this.pendingPhoto.set(null);
    this.avatarStep.set('choose');
    this.photoError.set('');
  }

  backToChoose(): void {
    this.avatarStep.set('choose');
    this.pendingPhoto.set(null);
    this.photoError.set('');
  }

  /**
   * Elegir el archivo NO sube nada: abre el encuadre. La foto del movil enteras son 4 MB y un
   * cuadrado de 128 px son veinte kilobytes, y entre las dos esta el gesto de decir donde esta la
   * cara —que antes no existia y por eso salian frentes cortadas.
   */
  onPhotoPicked(event: Event): void {
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
    this.pendingPhoto.set(file);
    this.avatarStep.set('crop');
  }

  /** Lo que emite el editor: la imagen ya recortada. Subirla es decision de esta pantalla. */
  async onCropped(dataUrl: string): Promise<void> {
    this.uploading.set(true);
    this.photoError.set('');
    try {
      const avatar = await this.auth.uploadAvatar(dataUrl).toPromise();
      this.avatarUrl.set(avatar ?? null);
      this.photoBroken.set(false);
      this.toastService.success('Imagen cambiada');
      this.closeAvatarModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      // Se dice el fallo sin cerrar el modal: la foto ya esta encuadrada y perder el encuadre por
      // un reintentar seria obligar a recortar otra vez.
      if (message.includes('UPLOAD_WRITE_FAILED')) {
        this.photoError.set(
          'La imagen ha llegado al servidor, pero el servidor no ha podido escribirla en disco. La ruta donde intenta guardarla sale en sus logs.'
        );
      } else {
        this.photoError.set(message && !message.includes('Http') ? message : 'No se pudo subir la foto. Intentalo otra vez.');
      }
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
      this.photoBroken.set(false);
      this.toastService.success('Imagen quitada');
      this.closeAvatarModal();
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
        // Vuelta a sincronizar con lo que hay guardado: si el servidor recorto algo, eso es lo
        // que se ve a partir de ahora, y no lo que se escribio.
        this.nameTouched.set(false);
        this.toastService.success('Nombre guardado');
      },
      error: () => {
        this.savingName.set(false);
        this.nameError.set('No se pudo guardar el nombre. Intentalo otra vez.');
      }
    });
  }

  cancelName(): void {
    this.nameTouched.set(false);
    this.nameDraft = this.savedName;
    this.nameError.set('');
  }

  // ── La contrasena ──────────────────────────────────────────────────────

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

  /** Cancelar limpia los tres campos: una contrasena no se queda escrita en la pantalla. */
  cancelPassword(): void {
    this.passwordDraft = { current: '', fresh: '', repeat: '' };
    this.passwordError.set('');
  }

  endSession(): void {
    this.auth.logout();
  }

  // ── Lo que la app guarda ───────────────────────────────────────────────

  readonly email = computed(() => this.auth.currentUser()?.email ?? '—');
  readonly accountId = computed(() => this.auth.userId());
  readonly householdId = computed(() => this.auth.currentUser()?.householdId ?? '');
  /** El nivel, con su nombre: la pantalla no imprime valores internos. */
  readonly cookingLevel = computed(() => {
    const level = this.auth.currentUser()?.cookingLevel;
    return (level && COOKING_LEVEL_LABELS[level]) || 'Sin marcar';
  });
  readonly version = computed(() => `${environment.appName} ${environment.version}`);
  readonly timezone = computed(() => timeZoneLabel());

  /** Corto y largo: los dos extremos, porque el id entero no cabe en una linea. */
  readonly shortAccountId = computed(() => shortId(this.accountId()));

  /** Lo que la app ocupa en este navegador, contando las claves propias de verdad. */
  readonly usage = computed(() => {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key) keys.push(key);
    }
    return storageUsage(keys, (key) => localStorage.getItem(key) ?? '', this.shopping.pendingWrites());
  });

  storageText(): string {
    const usage = this.usage();
    if (!usage.entries) return 'Nada guardado en este navegador';
    return `${formatBytes(usage.bytes)} en ${usage.entries} entradas`;
  }

  pendingText(): string {
    return pendingLabel(this.shopping.pendingWrites());
  }
}
