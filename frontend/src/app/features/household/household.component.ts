import { Component, inject, OnInit, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HouseholdService } from '../../core/services/household.service';
import { ToastService } from '../../core/services/toast.service';
import { ButtonComponent } from '../../shared/components/ui/button/button.component';
import { InputComponent } from '../../shared/components/ui/input/input.component';
import { BadgeComponent } from '../../shared/components/ui/badge/badge.component';
import { AvatarComponent } from '../../shared/components/ui/avatar/avatar.component';
import { ModalComponent } from '../../shared/components/ui/modal/modal.component';
import { LoadingComponent } from '../../shared/components/ui/loading/loading.component';

@Component({
  selector: 'app-household',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonComponent, InputComponent, BadgeComponent,
    AvatarComponent, ModalComponent, LoadingComponent
  ],
  template: `
    <div class="household">
      <!-- Header -->
      <div class="household__header">
        <h1 class="household__title">👨‍👩‍👧‍👦 Hogar</h1>
      </div>

      <!-- Loading -->
      <app-loading *ngIf="householdService.isLoading()" message="Cargando..."></app-loading>

      <!-- No Household -->
      <div *ngIf="!householdService.isLoading() && !householdService.household()" class="no-household">
        <div class="no-household__content">
          <span class="no-household__icon">🏠</span>
          <h2 class="no-household__title">No tienes un hogar</h2>
          <p class="no-household__text">
            Crea un hogar o únete a uno existente para compartir despensa y recetas.
          </p>
          
          <div class="no-household__actions">
            <app-button variant="primary" (onClick)="openCreateModal()">
              Crear hogar
            </app-button>
            <app-button variant="outline" (onClick)="openJoinModal()">
              Unirse con código
            </app-button>
          </div>
        </div>
      </div>

      <!-- Household Content -->
      <div *ngIf="householdService.household() as household" class="household__content">
        <!-- Household Info -->
        <div class="household-info">
          <div class="household-info__header">
            <div>
              <h2 class="household-info__name">{{ household.name }}</h2>
              <span class="household-info__members">{{ household.members?.length || 0 }} miembros</span>
            </div>
            <app-badge variant="primary">
              {{ household.sharedPantry ? 'Despensa compartida' : 'Despensa individual' }}
            </app-badge>
          </div>

          <!-- Invite Code -->
          <div class="invite-card">
            <div class="invite-card__content">
              <span class="invite-card__label">Enlace de invitación</span>
              <span class="invite-card__code">{{ inviteLink() }}</span>
            </div>
            <div class="invite-card__actions">
              <app-button variant="outline" size="sm" (onClick)="copyLink()">
                📋 Copiar enlace
              </app-button>
              <app-button variant="ghost" size="sm" (onClick)="regenerateCode()" *ngIf="canInvite()">
                🔄 Regenerar
              </app-button>
            </div>
          </div>
        </div>

        <!-- Members -->
        <div class="members-section">
          <div class="members-section__header">
            <h3>Miembros</h3>
            <app-button variant="outline" size="sm" (onClick)="openInviteModal()">
              + Invitar
            </app-button>
          </div>

          <div class="members-list">
            <div *ngFor="let member of household.members" class="member-card">
              <app-avatar [name]="member.name" size="md"></app-avatar>
              
              <div class="member-card__info">
                <span class="member-card__name">{{ member.name }}</span>
                <span class="member-card__email">{{ member.email }}</span>
              </div>

              <div class="member-card__meta">
                <app-badge [variant]="getRoleVariant(member.role)" size="sm">
                  {{ getRoleLabel(member.role) }}
                </app-badge>
                <app-badge variant="neutral" size="sm">
                  {{ getLevelLabel(member.cookingLevel) }}
                </app-badge>
              </div>
            </div>
          </div>
        </div>

        <!-- Sharing & Settings (admins only) -->
        <section class="settings-section" *ngIf="isAdmin()">
          <h3 class="settings-section__title">🔗 Compartir en el hogar</h3>
          <div class="settings-section__options">
            <label class="setting-toggle">
              <input type="checkbox" [checked]="household.sharedPantry" (change)="toggleSetting('sharedPantry', $any($event.target).checked)" />
              <span>Despensa compartida</span>
            </label>
            <label class="setting-toggle">
              <input type="checkbox" [checked]="household.shareRecipes" (change)="toggleSetting('shareRecipes', $any($event.target).checked)" />
              <span>Recetas compartidas</span>
            </label>
            <label class="setting-toggle">
              <input type="checkbox" [checked]="household.shareCalendar" (change)="toggleSetting('shareCalendar', $any($event.target).checked)" />
              <span>Calendario compartido</span>
            </label>
          </div>
        </section>

        <!-- Actions -->
        <div class="household__actions">
          <app-button variant="danger" (onClick)="leaveHousehold()">
            🚪 Salir del hogar
          </app-button>
        </div>
      </div>

      <!-- Create Modal -->
      <app-modal
        [isOpen]="isCreateModalOpen()"
        title="Crear Hogar"
        size="md"
        (onClose)="closeCreateModal()"
      >
        <form (ngSubmit)="createHousehold()" class="create-form">
          <app-input
            id="householdName"
            name="householdName"
            label="Nombre del hogar"
            placeholder="Ej: Mi hogar"
            [(ngModel)]="createForm.name"
            [required]="true"
          ></app-input>

          <div class="form-field">
            <label class="form-checkbox">
              <input type="checkbox" [(ngModel)]="createForm.sharedPantry" name="sharedPantry" />
              <span>Compartir despensa entre miembros</span>
            </label>
          </div>

          <div class="form-actions">
            <app-button variant="ghost" type="button" (onClick)="closeCreateModal()">Cancelar</app-button>
            <app-button variant="primary" type="submit" [loading]="isSaving()">Crear</app-button>
          </div>
        </form>
      </app-modal>

      <!-- Join Modal -->
      <app-modal
        [isOpen]="isJoinModalOpen()"
        title="Unirse a un Hogar"
        size="md"
        (onClose)="closeJoinModal()"
      >
        <form (ngSubmit)="joinHousehold()" class="join-form">
          <p class="join-form__description">
            Introduce el código de invitación que te ha compartido el administrador del hogar.
          </p>

          <app-input
            id="inviteCode"
            name="inviteCode"
            label="Código de invitación"
            placeholder="Ej: ABC12345"
            [(ngModel)]="joinForm.inviteCode"
            [required]="true"
          ></app-input>

          <div class="form-actions">
            <app-button variant="ghost" type="button" (onClick)="closeJoinModal()">Cancelar</app-button>
            <app-button variant="primary" type="submit" [loading]="isSaving()">Unirse</app-button>
          </div>
        </form>
      </app-modal>

      <!-- Invite Modal -->
      <app-modal
        [isOpen]="isInviteModalOpen()"
        title="Invitar Miembro"
        size="md"
        (onClose)="closeInviteModal()"
      >
        <div class="invite-modal">
          <p>Comparte este código con la persona que quieres invitar:</p>
          
          <div class="invite-code-display">
            <span class="invite-code-display__code">{{ householdService.household()?.inviteCode }}</span>
            <app-button variant="primary" (onClick)="copyCode()">
              📋 Copiar
            </app-button>
          </div>
        </div>
      </app-modal>
    </div>
  `,
  styles: [`
    .household {
      padding: var(--space-4);
      max-width: 800px;
      margin: 0 auto;
    }

    @media (min-width: 768px) {
      .household { padding: var(--space-6); }
    }

    .household__header {
      margin-bottom: var(--space-6);
    }

    .household__title {
      font-family: var(--font-display);
      font-size: var(--text-2xl);
      font-weight: var(--font-bold);
    }

    /* No Household */
    .no-household {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
    }

    .no-household__content {
      text-align: center;
      max-width: 400px;
    }

    .no-household__icon {
      font-size: 64px;
      display: block;
      margin-bottom: var(--space-4);
    }

    .no-household__title {
      font-family: var(--font-display);
      font-size: var(--text-2xl);
      font-weight: var(--font-bold);
      margin-bottom: var(--space-2);
    }

    .no-household__text {
      font-size: var(--text-sm);
      color: var(--text-secondary);
      margin-bottom: var(--space-6);
    }

    .no-household__actions {
      display: flex;
      gap: var(--space-3);
      justify-content: center;
    }

    /* Household Info */
    .household-info {
      margin-bottom: var(--space-6);
    }

    .household-info__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-4);
    }

    .household-info__name {
      font-family: var(--font-display);
      font-size: var(--text-xl);
      font-weight: var(--font-semibold);
    }

    .household-info__members {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    /* Invite Card */
    .invite-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4);
      background: var(--bg-tertiary);
      border-radius: var(--radius-lg);
    }

    .invite-card__content {
      display: flex;
      flex-direction: column;
    }

    .invite-card__label {
      font-size: var(--text-xs);
      color: var(--text-secondary);
    }

    .invite-card__code {
      font-family: var(--font-mono);
      font-size: var(--text-xl);
      font-weight: var(--font-bold);
      letter-spacing: var(--tracking-wider);
    }

    .invite-card__actions {
      display: flex;
      gap: var(--space-2);
    }

    /* Members */
    .members-section {
      margin-bottom: var(--space-6);
    }

    .members-section__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-4);

      h3 {
        font-size: var(--text-lg);
        font-weight: var(--font-semibold);
      }
    }

    .members-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .member-card {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3);
      background: var(--bg-secondary);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-default);
    }

    .member-card__info {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .member-card__name {
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
    }

    .member-card__email {
      font-size: var(--text-xs);
      color: var(--text-secondary);
    }

    .member-card__meta {
      display: flex;
      gap: var(--space-2);
    }

    /* Settings section */
    .settings-section {
      margin-bottom: var(--space-6);
      padding: var(--space-4);
      background: var(--bg-secondary);
      border-radius: var(--radius-xl);
      border: 1px solid var(--border-default);
    }
    .settings-section__title {
      font-size: var(--text-base);
      font-weight: var(--font-semibold);
      margin: 0 0 var(--space-3) 0;
    }
    .settings-section__options {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .setting-toggle {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-sm);
      cursor: pointer;
      input[type="checkbox"] { width: 18px; height: 18px; }
    }

    /* Actions */
    .household__actions {
      display: flex;
      gap: var(--space-3);
      justify-content: flex-end;
    }

    /* Forms */
    .create-form,
    .join-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .join-form__description {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .form-checkbox {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-sm);
      cursor: pointer;

      input[type="checkbox"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
      }
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-3);
      margin-top: var(--space-4);
    }

    /* Invite Modal */
    .invite-modal {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);

      p {
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
    }

    .invite-code-display {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4);
      background: var(--bg-tertiary);
      border-radius: var(--radius-lg);
    }

    .invite-code-display__code {
      font-family: var(--font-mono);
      font-size: var(--text-2xl);
      font-weight: var(--font-bold);
    }
  `]
})
export class HouseholdComponent implements OnInit {
  householdService = inject(HouseholdService);
  private toastService = inject(ToastService);

  isCreateModalOpen = signal(false);
  isJoinModalOpen = signal(false);
  isInviteModalOpen = signal(false);
  isSaving = signal(false);

  createForm = {
    name: '',
    sharedPantry: true
  };

  joinForm = {
    inviteCode: ''
  };

  inviteLink = signal('');

  constructor() {
    effect(() => {
      const h = this.householdService.household();
      if (h?.inviteCode) this.inviteLink.set(this.householdService.getInviteLink(h.inviteCode));
    });
  }

  ngOnInit(): void {
    this.householdService.loadHousehold();
  }

  isAdmin(): boolean {
    return this.householdService.isAdmin();
  }

  canInvite(): boolean {
    return !!this.householdService.household()?.myPermissions?.members?.invite || this.isAdmin();
  }

  copyLink(): void {
    navigator.clipboard.writeText(this.inviteLink());
    this.toastService.success('Copiado', 'Enlace de invitación copiado');
  }

  toggleSetting(key: 'sharedPantry' | 'shareRecipes' | 'shareCalendar', value: boolean): void {
    this.householdService.updateSettings({ [key]: value }).subscribe({
      next: () => this.toastService.success('Actualizado', 'Ajustes del hogar guardados'),
      error: () => this.toastService.error('Error', 'No se pudo actualizar')
    });
  }

  openCreateModal(): void {
    this.createForm = { name: '', sharedPantry: true };
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
  }

  openJoinModal(): void {
    this.joinForm = { inviteCode: '' };
    this.isJoinModalOpen.set(true);
  }

  closeJoinModal(): void {
    this.isJoinModalOpen.set(false);
  }

  openInviteModal(): void {
    this.isInviteModalOpen.set(true);
  }

  closeInviteModal(): void {
    this.isInviteModalOpen.set(false);
  }

  openSettingsModal(): void {
    // TODO
  }

  createHousehold(): void {
    if (!this.createForm.name) return;

    this.isSaving.set(true);
    this.householdService.createHousehold(this.createForm.name, this.createForm.sharedPantry).subscribe({
      next: () => {
        this.toastService.success('¡Creado!', 'Tu hogar ha sido creado');
        this.closeCreateModal();
        this.isSaving.set(false);
      },
      error: () => {
        this.toastService.error('Error', 'No se pudo crear el hogar');
        this.isSaving.set(false);
      }
    });
  }

  joinHousehold(): void {
    if (!this.joinForm.inviteCode) return;

    this.isSaving.set(true);
    this.householdService.joinHousehold(this.joinForm.inviteCode).subscribe({
      next: () => {
        this.toastService.success('¡Te has unido!', 'Ahora eres miembro del hogar');
        this.closeJoinModal();
        this.isSaving.set(false);
      },
      error: () => {
        this.toastService.error('Error', 'Código inválido o ya eres miembro');
        this.isSaving.set(false);
      }
    });
  }

  copyCode(): void {
    this.copyLink();
  }

  regenerateCode(): void {
    this.householdService.regenerateInviteCode().subscribe({
      next: () => {
        this.toastService.success('Regenerado', 'Nuevo código de invitación generado');
      }
    });
  }

  leaveHousehold(): void {
    if (confirm('¿Estás seguro de salir del hogar?')) {
      this.householdService.leaveHousehold().subscribe({
        next: () => {
          this.toastService.success('Saliste', 'Has salido del hogar');
        }
      });
    }
  }

  getRoleVariant(role: string): 'primary' | 'secondary' | 'neutral' {
    switch (role) {
      case 'admin': return 'primary';
      case 'member': return 'secondary';
      default: return 'neutral';
    }
  }

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      admin: 'Admin',
      member: 'Miembro',
      child: 'Niño'
    };
    return labels[role] || role;
  }

  getLevelLabel(level: string): string {
    const labels: Record<string, string> = {
      beginner: 'Principiante',
      intermediate: 'Intermedio',
      expert: 'Experto'
    };
    return labels[level] || level;
  }
}
