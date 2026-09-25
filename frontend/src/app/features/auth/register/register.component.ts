import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { HouseholdService } from '../../../core/services/household.service';
import { ButtonComponent } from '../../../shared/components/ui/button/button.component';
import { InputComponent } from '../../../shared/components/ui/input/input.component';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { I18nService } from '../../../core/services/i18n.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    TranslatePipe,
    CommonModule, RouterLink, FormsModule, ButtonComponent, InputComponent],
  template: `
    <form (ngSubmit)="onSubmit()" class="register-form">
      <h2 class="register-form__title">{{ 'auth.register.cta' | t }}</h2>
      
      <app-input
        id="name"
        name="name"
        type="text"
        [label]="'auth.name' | t"
        [placeholder]="'auth.tu_nombre' | t"
        [(ngModel)]="name"
        [required]="true"
        [error]="nameError()"
      ></app-input>

      <app-input
        id="email"
        name="email"
        type="email"
        [label]="'auth.email' | t"
        [placeholder]="'auth.tu_email_com' | t"
        [(ngModel)]="email"
        [required]="true"
        [error]="emailError()"
      ></app-input>

      <app-input
        id="password"
        name="password"
        type="password"
        [label]="'auth.password' | t"
        placeholder="••••••••"
        [(ngModel)]="password"
        [required]="true"
        [error]="passwordError()"
        helper="Mínimo 6 caracteres, una mayúscula y un número"
      ></app-input>

      <p class="register-form__note">
        {{ 'auth.al_entrar_te_preguntamos' | t }}
      </p>

      <app-button
        type="submit"
        variant="primary"
        size="lg"
        [fullWidth]="true"
        [loading]="isLoading()"
      >
        {{ 'auth.register.cta' | t }}
      </app-button>

      <div class="register-form__footer">
        <span>{{ 'auth.already' | t }}</span>
        <a routerLink="/auth/login" class="register-form__link">
          {{ 'auth.inicia_sesion' | t }}
        </a>
      </div>
    </form>
  `,
  styles: [`
    .register-form__note {
      margin: 0;
      font-size: var(--text-xs);
      color: var(--text-secondary);
      line-height: 1.45;
    }
    .register-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }

    .register-form__title {
      font-family: var(--font-display);
      font-size: var(--text-2xl);
      font-weight: var(--font-bold);
      color: var(--text-primary);
      text-align: center;
    }

    .register-form__field {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .register-form__label {
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      color: var(--text-primary);
    }

    .register-form__footer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    .register-form__link {
      font-weight: var(--font-semibold);
      color: var(--primary);
      text-decoration: none;

      &:hover {
        color: var(--primary-dark);
      }
    }
  `]
})
export class RegisterComponent {
  private readonly i18n = inject(I18nService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private householdService = inject(HouseholdService);

  name = '';
  email = '';
  password = '';
  isLoading = signal(false);
  nameError = signal('');
  emailError = signal('');
  passwordError = signal('');

  private redirectAfterAuth(): void {
    const code = this.route.snapshot.queryParamMap.get('code');
    if (code) {
      this.householdService.joinByCode(code).subscribe({
        next: () => {
          this.toastService.success(this.i18n.t('auth.unido'), this.i18n.t('auth.te_has_unido_al'));
          this.router.navigate(['/household']);
        },
        error: () => this.router.navigate(['/dashboard'])
      });
    } else {
      // Antes del dashboard, cuatro preguntas de configuración (alergias,
      // gustos, objetivo y utensilios). Es saltable desde el propio flujo.
      this.router.navigate(['/onboarding']);
    }
  }

  onSubmit(): void {
    this.nameError.set('');
    this.emailError.set('');
    this.passwordError.set('');

    if (!this.name) {
      this.nameError.set(this.i18n.t('auth.el_nombre_es_requerido'));
      return;
    }

    if (!this.email) {
      this.emailError.set(this.i18n.t('auth.el_email_es_requerido'));
      return;
    }

    if (!this.password || this.password.length < 6) {
      this.passwordError.set(this.i18n.t('auth.la_contrasena_debe_tener'));
      return;
    }

    this.isLoading.set(true);

    // El nivel de cocina ya no se pregunta aqui: es parte del perfil y se
    // responde en el tour (y se edita en Preferencias › Perfil).
    this.authService.register({
      name: this.name,
      email: this.email,
      password: this.password
    }).subscribe({
      next: () => {
        this.toastService.success(this.i18n.t('auth.cuenta_creada'), this.i18n.t('auth.tu_cuenta_ha_sido'));
        this.householdService.loadHousehold();
        this.redirectAfterAuth();
      },
      error: (error) => {
        this.isLoading.set(false);
        this.toastService.error(this.i18n.t('ui.error'), error.message || this.i18n.t('auth.error_al_crear_la'));
      }
    });
  }
}
