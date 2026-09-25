import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { HouseholdService } from '../../core/services/household.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ButtonComponent } from '../../shared/components/ui/button/button.component';
import { LoadingComponent } from '../../shared/components/ui/loading/loading.component';
import { environment } from '../../../environments/environment';
import { InvitePreview } from '../../shared/models/household.model';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { I18nService } from '../../core/services/i18n.service';

@Component({
  selector: 'app-invite',
  standalone: true,
  imports: [
    TranslatePipe,
    CommonModule, RouterLink, ButtonComponent, LoadingComponent],
  template: `
    <div class="invite-page">
      <div class="invite-card">
        <span class="invite-card__icon">🏠</span>

        <ng-container *ngIf="loading(); else loaded">
          <app-loading [message]="'invite.comprobando_invitacion' | t"></app-loading>
        </ng-container>

        <ng-template #loaded>
          <ng-container *ngIf="error(); else valid">
            <h1 class="invite-card__title">{{ 'invite.invitacion_no_valida' | t }}</h1>
            <p class="invite-card__text">{{ error() }}</p>
            <a routerLink="/" class="invite-card__link">
              <app-button variant="primary">{{ 'invite.ir_al_inicio' | t }}</app-button>
            </a>
          </ng-container>

          <ng-template #valid>
            <h1 class="invite-card__title">{{ 'invite.invitacion_a' | t:{household: preview()?.householdName} }}</h1>
            <p class="invite-card__text">
              {{ 'invite.te_han_invitado_a' | t }}
              <strong>{{ preview()?.householdName }}</strong>
              ({{ memberLabel() }}).
            </p>

            <ng-container *ngIf="preview()?.alreadyMember; else joinActions">
              <p class="invite-card__info">{{ 'invite.ya_eres_miembro_de' | t }}</p>
              <a routerLink="/household" class="invite-card__link">
                <app-button variant="primary">{{ 'invite.ir_a_mi_hogar' | t }}</app-button>
              </a>
            </ng-container>

            <ng-template #joinActions>
              <ng-container *ngIf="authService.isAuthenticated(); else loginCta">
                <div class="invite-card__actions">
                  <app-button variant="ghost" (onClick)="decline()">{{ 'common.cancel' | t }}</app-button>
                  <app-button variant="primary" [loading]="joining()" (onClick)="accept()">
                    {{ 'invite.unirme_al_hogar' | t }}
                  </app-button>
                </div>
              </ng-container>

              <ng-template #loginCta>
                <p class="invite-card__info">
                  {{ 'invite.inicia_sesion_o_crea' | t }}
                </p>
                <div class="invite-card__actions">
                  <a [routerLink]="['/auth/login']" [queryParams]="{ code: inviteCode() }">
                    <app-button variant="primary">{{ 'auth.login' | t }}</app-button>
                  </a>
                  <a [routerLink]="['/auth/register']" [queryParams]="{ code: inviteCode() }">
                    <app-button variant="outline">{{ 'auth.register' | t }}</app-button>
                  </a>
                </div>
              </ng-template>
            </ng-template>
          </ng-template>
        </ng-template>
      </div>
    </div>
  `,
  styles: [`
    .invite-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4);
      background: var(--bg-primary);
    }
    .invite-card {
      max-width: 460px;
      width: 100%;
      padding: var(--space-8);
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-xl);
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    .invite-card__icon { font-size: 64px; }
    .invite-card__title {
      font-family: var(--font-display);
      font-size: var(--text-2xl);
      font-weight: var(--font-bold);
      margin: 0;
    }
    .invite-card__text { color: var(--text-secondary); margin: 0; }
    .invite-card__info { color: var(--text-secondary); font-size: var(--text-sm); margin: 0; }
    .invite-card__actions {
      display: flex;
      gap: var(--space-3);
      justify-content: center;
      flex-wrap: wrap;
    }
    .invite-card__link { text-decoration: none; }
  `]
})
export class InviteComponent implements OnInit {

  /** El plural es del idioma, no de la frase: dos claves y la eleccion aqui, en el texto de la app. */
  memberLabel(): string {
    const n = this.preview()?.memberCount ?? 0;
    return this.i18n.t(n === 1 ? 'invite.miembro_uno' : 'invite.miembros', { n });
  }
  private readonly i18n = inject(I18nService);

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  private householdService = inject(HouseholdService);
  authService = inject(AuthService);
  private toastService = inject(ToastService);

  preview = signal<InvitePreview | null>(null);
  error = signal<string | null>(null);
  loading = signal(true);
  joining = signal(false);
  inviteCode = signal<string>('');

  ngOnInit(): void {
    const code = this.route.snapshot.paramMap.get('code') || '';
    this.inviteCode.set(code);
    if (!code) {
      this.error.set(this.i18n.t('ui.codigo_de_invitacion_no'));
      this.loading.set(false);
      return;
    }
    this.http.get<any>(`${environment.apiUrl}/household/invite/${code}`).subscribe({
      next: (res) => {
        if (res?.success) {
          this.preview.set(res.data);
        } else {
          this.error.set(res?.message || this.i18n.t('ui.codigo_de_invitacion_invalido'));
        }
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.i18n.t('ui.codigo_de_invitacion_invalido'));
        this.loading.set(false);
      }
    });
  }

  accept(): void {
    this.joining.set(true);
    this.householdService.joinByCode(this.inviteCode()).subscribe({
      next: () => {
        this.toastService.success(this.i18n.t('auth.unido'), this.i18n.t('household.ahora_eres_miembro_del'));
        this.joining.set(false);
        this.router.navigate(['/household']);
      },
      error: () => {
        this.toastService.error(this.i18n.t('ui.error'), this.i18n.t('ui.no_se_pudo_unir'));
        this.joining.set(false);
      }
    });
  }

  decline(): void {
    this.router.navigate(['/']);
  }
}