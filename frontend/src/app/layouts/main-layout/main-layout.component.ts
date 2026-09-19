import { Component, computed, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ModulesService } from '../../core/services/modules.service';
import { TasteProfileService } from '../../core/services/taste-profile.service';
import { ToastComponent } from '../../shared/components/ui/toast/toast.component';
import { AvatarComponent } from '../../shared/components/ui/avatar/avatar.component';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { ConfirmDialogComponent } from '../../shared/components/ui/confirm-dialog/confirm-dialog.component';

interface NavItem {
  path: string;
  labelKey: string;
  icon: string;
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ToastComponent, AvatarComponent, TranslatePipe, ConfirmDialogComponent],
  template: `
    <div class="layout">
      <!-- Mobile Header -->
      <header class="header">
        <button type="button" class="header__menu" (click)="toggleSidebar()">
          ☰
        </button>
        <span class="header__title">🍳 {{ 'app.name' | t }}</span>
        <button type="button" class="header__profile" (click)="navigateToProfile()">
          <app-avatar 
            [name]="authService.userName()" 
            size="sm"
          ></app-avatar>
        </button>
      </header>

      <!-- Sidebar (Desktop) -->
      <aside class="sidebar" [class.sidebar--open]="isSidebarOpen()">
        <div class="sidebar__header">
          <span class="sidebar__logo">🍳 {{ 'app.name' | t }}</span>
          <button type="button" class="sidebar__close" (click)="closeSidebar()">✕</button>
        </div>
        
        <nav class="sidebar__nav">
          <a
            *ngFor="let item of visibleNavItems()"
            [routerLink]="item.path"
            routerLinkActive="sidebar__item--active"
            class="sidebar__item"
            (click)="closeSidebar()"
          >
            <span class="sidebar__icon">{{ item.icon }}</span>
            <span class="sidebar__label">{{ item.labelKey | t }}</span>
          </a>
        </nav>

        <div class="sidebar__footer">
          <a routerLink="/settings" class="sidebar__item" (click)="closeSidebar()">
            <span class="sidebar__icon">⚙️</span>
            <span class="sidebar__label">{{ 'nav.settings' | t }}</span>
          </a>
          <button type="button" class="sidebar__item sidebar__item--logout" (click)="logout()">
            <span class="sidebar__icon">🚪</span>
            <span class="sidebar__label">{{ 'nav.logout' | t }}</span>
          </button>
        </div>
      </aside>

      <!-- Overlay for mobile sidebar -->
      <div 
        *ngIf="isSidebarOpen()" 
        class="sidebar-overlay"
        (click)="closeSidebar()"
      ></div>

      <!-- Main Content -->
      <main class="main">
        <router-outlet></router-outlet>
      </main>

      <!-- Mobile Bottom Navigation -->
      <nav class="bottom-nav">
        <a
          *ngFor="let item of visibleMobileNavItems()"
          [routerLink]="item.path"
          routerLinkActive="bottom-nav__item--active"
          class="bottom-nav__item"
        >
          <span class="bottom-nav__icon">{{ item.icon }}</span>
          <span class="bottom-nav__label">{{ item.labelKey | t }}</span>
        </a>
      </nav>
    </div>

    <app-toast></app-toast>
    <app-confirm-dialog></app-confirm-dialog>
  `,
  styles: [`
    .layout {
      min-height: 100vh;
      background: var(--bg-primary);
    }

    /* Header */
    .header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 56px;
      padding: 0 var(--space-4);
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-default);

      @media (min-width: 1024px) {
        display: none;
      }
    }

    .header__menu,
    .header__profile {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: var(--radius-lg);
      background: none;
      border: none;
      cursor: pointer;
      font-size: var(--text-xl);
      color: var(--text-primary);
      transition: var(--transition-fast);

      &:hover {
        background: var(--bg-tertiary);
      }
    }

    .header__title {
      font-family: var(--font-display);
      font-size: var(--text-lg);
      font-weight: var(--font-bold);
      color: var(--primary);
    }

    /* Sidebar */
    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      z-index: 200;
      width: 280px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-default);
      display: flex;
      flex-direction: column;
      transform: translateX(-100%);
      transition: transform var(--duration-300) var(--ease-out);

      @media (min-width: 1024px) {
        transform: translateX(0);
      }
    }

    .sidebar--open {
      transform: translateX(0);
    }

    .sidebar__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4);
      border-bottom: 1px solid var(--border-default);
    }

    .sidebar__logo {
      font-family: var(--font-display);
      font-size: var(--text-xl);
      font-weight: var(--font-bold);
      color: var(--primary);
    }

    .sidebar__close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: var(--radius-md);
      background: none;
      border: none;
      cursor: pointer;
      font-size: var(--text-lg);
      color: var(--text-tertiary);

      @media (min-width: 1024px) {
        display: none;
      }
    }

    .sidebar__nav {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-4);
    }

    .sidebar__item {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3);
      margin-bottom: var(--space-1);
      color: var(--text-secondary);
      text-decoration: none;
      border-radius: var(--radius-lg);
      transition: var(--transition-fast);
      cursor: pointer;
      border: none;
      background: none;
      width: 100%;
      text-align: left;
      font-size: var(--text-sm);

      &:hover {
        background: var(--bg-tertiary);
        color: var(--text-primary);
      }
    }

    .sidebar__item--active {
      background: var(--primary-subtle);
      color: var(--primary-dark);
      font-weight: var(--font-medium);
    }

    .sidebar__item--logout {
      color: var(--error);

      &:hover {
        background: var(--error-subtle);
      }
    }

    .sidebar__icon {
      font-size: var(--text-lg);
      width: 24px;
      text-align: center;
    }

    .sidebar__footer {
      padding: var(--space-4);
      border-top: 1px solid var(--border-default);
    }

    /* Sidebar Overlay */
    .sidebar-overlay {
      position: fixed;
      inset: 0;
      z-index: 150;
      background: rgba(0, 0, 0, 0.5);

      @media (min-width: 1024px) {
        display: none;
      }
    }

    /* Main Content */
    .main {
      padding-top: 56px;
      padding-bottom: calc(64px + env(safe-area-inset-bottom));
      min-height: 100vh;

      @media (min-width: 1024px) {
        margin-left: 280px;
        padding-top: 0;
        padding-bottom: 0;
      }
    }

    /* Bottom Navigation */
    .bottom-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-around;
      height: 64px;
      padding-bottom: env(safe-area-inset-bottom);
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-default);

      @media (min-width: 1024px) {
        display: none;
      }
    }

    .bottom-nav__item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1);
      padding: var(--space-2);
      color: var(--text-tertiary);
      text-decoration: none;
      transition: var(--transition-fast);

      &--active {
        color: var(--primary);
      }

      &:hover {
        color: var(--text-primary);
      }
    }

    .bottom-nav__icon {
      font-size: var(--text-xl);
    }

    .bottom-nav__label {
      font-size: 10px;
      font-weight: var(--font-medium);
    }
  `]
})
export class MainLayoutComponent implements OnInit {
  authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly tasteService = inject(TasteProfileService);
  private readonly modules = inject(ModulesService);
  isSidebarOpen = signal(false);

  ngOnInit(): void {
    // Gustos/alergias/objetivo se leen en varias vistas (planificador semanal,
    // Preferencias): se cargan al montar el layout para que estén listos al abrir
    // cualquiera de ellas, sin esperas ni dobles peticiones.
    this.tasteService.ensureLoaded();
  }

  navItems: NavItem[] = [
    { path: '/dashboard', labelKey: 'nav.dashboard', icon: '🏠' },
    { path: '/pantry', labelKey: 'nav.pantry', icon: '📦' },
    { path: '/recipes', labelKey: 'nav.recipes', icon: '📖' },
    { path: '/calendar', labelKey: 'nav.calendar', icon: '📅' },
    { path: '/household', labelKey: 'nav.household', icon: '👨‍👩‍👧‍👦' },
    { path: '/preferences', labelKey: 'nav.preferences', icon: '👤' },
    { path: '/ai-config', labelKey: 'nav.ai-config', icon: '🤖' },
    { path: '/logs', labelKey: 'nav.logs', icon: '📋' }
  ];

  mobileNavItems: NavItem[] = [
    { path: '/dashboard', labelKey: 'nav.dashboard', icon: '🏠' },
    { path: '/pantry', labelKey: 'nav.pantry', icon: '📦' },
    { path: '/recipes', labelKey: 'nav.recipes', icon: '📖' },
    { path: '/calendar', labelKey: 'nav.calendar', icon: '📅' },
    { path: '/settings', labelKey: 'nav.settings', icon: '⚙️' }
  ];

  /**
   * La navegacion deriva de los modulos: al activar o apagar uno en
   * Configuracion se repinta sola, sin recargar la pagina.
   */
  readonly visibleNavItems = computed(() => this.navItems.filter((item) => this.modules.isPathVisible(item.path)));
  readonly visibleMobileNavItems = computed(() =>
    this.mobileNavItems.filter((item) => this.modules.isPathVisible(item.path))
  );

  toggleSidebar(): void {
    this.isSidebarOpen.update(v => !v);
  }

  closeSidebar(): void {
    this.isSidebarOpen.set(false);
  }

  navigateToProfile(): void {
    // El avatar habla de la persona, no de la app: lleva a Preferencias
    // (gustos, alergias y objetivo). Configuracion queda para tema e idioma.
    this.router.navigate(['/preferences']);
  }

  logout(): void {
    this.authService.logout();
  }
}
