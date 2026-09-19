import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { ToastComponent } from '../../shared/components/ui/toast/toast.component';
import { ConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ToastComponent, ConfirmDialogComponent],
  template: `
    <div class="auth-layout">
      <div class="auth-layout__background"></div>
      
      <div class="auth-layout__container">
        <div class="auth-layout__header">
          <span class="auth-layout__logo">🏠</span>
          <h1 class="auth-layout__title">HogarIA</h1>
          <p class="auth-layout__subtitle">Tu asistente de cocina inteligente</p>
        </div>
        
        <div class="auth-layout__content">
          <router-outlet></router-outlet>
        </div>
      </div>
    </div>

    <app-toast></app-toast>
    <app-confirm-dialog></app-confirm-dialog>
  `,
  styles: [`
    .auth-layout {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4);
      position: relative;
      overflow: hidden;
    }

    .auth-layout__background {
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, var(--primary-subtle) 0%, var(--bg-primary) 50%, var(--secondary-subtle) 100%);
      z-index: 0;
    }

    .auth-layout__container {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 400px;
      display: flex;
      flex-direction: column;
      gap: var(--space-8);
    }

    .auth-layout__header {
      text-align: center;
    }

    .auth-layout__logo {
      font-size: 64px;
      display: block;
      margin-bottom: var(--space-4);
    }

    .auth-layout__title {
      font-family: var(--font-display);
      font-size: var(--text-4xl);
      font-weight: var(--font-extrabold);
      color: var(--text-primary);
      margin-bottom: var(--space-2);
    }

    .auth-layout__subtitle {
      font-size: var(--text-lg);
      color: var(--text-secondary);
    }

    .auth-layout__content {
      background: var(--bg-secondary);
      border-radius: var(--radius-2xl);
      box-shadow: var(--shadow-xl);
      padding: var(--space-8);
    }

    @media (max-width: 480px) {
      .auth-layout__content {
        padding: var(--space-6);
      }
    }
  `]
})
export class AuthLayoutComponent {}
