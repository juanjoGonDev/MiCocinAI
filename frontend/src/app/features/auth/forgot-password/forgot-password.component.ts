import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ButtonComponent } from '../../../shared/components/ui/button/button.component';
import { InputComponent } from '../../../shared/components/ui/input/input.component';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, ButtonComponent, InputComponent],
  template: `
    <form (ngSubmit)="onSubmit()" class="forgot-form">
      <h2 class="forgot-form__title">Recuperar Contraseña</h2>
      <p class="forgot-form__description">
        Introduce tu email y te enviaremos un enlace para restablecer tu contraseña.
      </p>
      
      <app-input
        id="email"
        type="email"
        label="Email"
        placeholder="tu@email.com"
        [(ngModel)]="email"
        [required]="true"
        [error]="emailError()"
      ></app-input>

      <app-button
        type="submit"
        variant="primary"
        size="lg"
        [fullWidth]="true"
        [loading]="isLoading()"
      >
        Enviar enlace
      </app-button>

      <div class="forgot-form__footer">
        <a routerLink="/auth/login" class="forgot-form__link">
          ← Volver al login
        </a>
      </div>
    </form>
  `,
  styles: [`
    .forgot-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
    }

    .forgot-form__title {
      font-family: var(--font-display);
      font-size: var(--text-2xl);
      font-weight: var(--font-bold);
      color: var(--text-primary);
      text-align: center;
    }

    .forgot-form__description {
      font-size: var(--text-sm);
      color: var(--text-secondary);
      text-align: center;
      line-height: var(--leading-relaxed);
    }

    .forgot-form__footer {
      text-align: center;
    }

    .forgot-form__link {
      font-size: var(--text-sm);
      color: var(--primary);
      text-decoration: none;

      &:hover {
        color: var(--primary-dark);
      }
    }
  `]
})
export class ForgotPasswordComponent {
  private authService = inject(AuthService);
  private toastService = inject(ToastService);

  email = '';
  isLoading = signal(false);
  emailError = signal('');

  onSubmit(): void {
    this.emailError.set('');

    if (!this.email) {
      this.emailError.set('El email es requerido');
      return;
    }

    this.isLoading.set(true);

    this.authService.forgotPassword(this.email).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.toastService.success(
          'Email enviado',
          'Si el email existe, recibirás un enlace para restablecer tu contraseña'
        );
      },
      error: () => {
        this.isLoading.set(false);
        this.toastService.success(
          'Email enviado',
          'Si el email existe, recibirás un enlace para restablecer tu contraseña'
        );
      }
    });
  }
}
