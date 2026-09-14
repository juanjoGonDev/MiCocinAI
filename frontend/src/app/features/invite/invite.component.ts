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

@Component({
  selector: 'app-invite',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonComponent, LoadingComponent],
  template: `
    <div class="invite-page">
      <div class="invite-card">
        <span class="invite-card__icon">🏠</span>

        <ng-container *ngIf="loading(); else loaded">
          <app-loading message="Comprobando invitación..."></app-loading>
        </ng-container>

        <ng-template #loaded>
          <ng-container *ngIf="error(); else valid">
            <h1 class="invite-card__title">Invitación no válida</h1>
            <p class="invite-card__text">{{ error() }}</p>
            <a routerLink="/" class="invite-card__link">
              <app-button variant="primary">Ir al inicio</app-button>
            </a>
          </ng-container>

          <ng-template #valid>
            <h1 class="invite-card__title">Invitación a {{ preview()?.householdName }}</h1>
            <p class="invite-card__text">
              Te han invitado a unirte al hogar
              <strong>{{ preview()?.householdName }}</strong>
              ({{ preview()?.memberCount }} miembro{{ preview()!.memberCount! !== 1 ? 's' : '' }}).
            </p>

            <ng-container *ngIf="preview()?.alreadyMember; else joinActions">
              <p class="invite-card__info">Ya eres miembro de este hogar 👍</p>
              <a routerLink="/household" class="invite-card__link">
                <app-button variant="primary">Ir a mi hogar</app-button>
              </a>
            </ng-container>

            <ng-template #joinActions>
              <ng-container *ngIf="authService.isAuthenticated(); else loginCta">
                <div class="invite-card__actions">
                  <app-button variant="ghost" (onClick)="decline()">Cancelar</app-button>
                  <app-button variant="primary" [loading]="joining()" (onClick)="accept()">
                    Unirme al hogar
                  </app-button>
                </div>
              </ng-container>

              <ng-template #loginCta>
                <p class="invite-card__info">
                  Inicia sesión o crea una cuenta para unirte. Tras registrarte entrarás automáticamente en este hogar.
                </p>
                <div class="invite-card__actions">
                  <a [routerLink]="['/auth/login']" [queryParams]="{ code: inviteCode() }">
                    <app-button variant="primary">Iniciar sesión</app-button>
                  </a>
                  <a [routerLink]="['/auth/register']" [queryParams]="{ code: inviteCode() }">
                    <app-button variant="outline">Crear cuenta</app-button>
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
      this.error.set('Código de invitación no presente en la URL');
      this.loading.set(false);
      return;
    }
    this.http.get<any>(`${environment.apiUrl}/household/invite/${code}`).subscribe({
      next: (res) => {
        if (res?.success) {
          this.preview.set(res.data);
        } else {
          this.error.set(res?.message || 'Código de invitación inválido o caducado');
        }
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Código de invitación inválido o caducado');
        this.loading.set(false);
      }
    });
  }

  accept(): void {
    this.joining.set(true);
    this.householdService.joinByCode(this.inviteCode()).subscribe({
      next: () => {
        this.toastService.success('¡Unido!', 'Ahora eres miembro del hogar');
        this.joining.set(false);
        this.router.navigate(['/household']);
      },
      error: () => {
        this.toastService.error('Error', 'No se pudo unir al hogar');
        this.joining.set(false);
      }
    });
  }

  decline(): void {
    this.router.navigate(['/']);
  }
}
