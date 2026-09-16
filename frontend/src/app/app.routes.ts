import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { MainLayoutComponent } from './layouts/main-layout/main-layout.component';
import { AuthLayoutComponent } from './layouts/auth-layout/auth-layout.component';
import { InviteComponent } from './features/invite/invite.component';

export const routes: Routes = [
  // Auth routes (no auth required)
  {
    path: 'auth',
    component: AuthLayoutComponent,
    loadChildren: () => import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES)
  },

  // Public invite page (works before & after login)
  { path: 'invite/:code', component: InviteComponent },

  // Configuración inicial (a pantalla completa, justo después de registrarse).
  // Fuera del layout principal a propósito: no es una vista a la que volver a
  // diario, es el questionario de bienvenida.
  {
    path: 'onboarding',
    canActivate: [authGuard],
    loadChildren: () => import('./features/onboarding/onboarding.routes').then(m => m.ONBOARDING_ROUTES)
  },

  // Protected routes with main layout
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        loadChildren: () => import('./features/dashboard/dashboard.routes').then(m => m.DASHBOARD_ROUTES)
      },
      {
        path: 'pantry',
        loadChildren: () => import('./features/pantry/pantry.routes').then(m => m.PANTRY_ROUTES)
      },
      {
        path: 'recipes',
        loadChildren: () => import('./features/recipes/recipes.routes').then(m => m.RECIPES_ROUTES)
      },
      {
        path: 'calendar',
        loadChildren: () => import('./features/calendar/calendar.routes').then(m => m.CALENDAR_ROUTES)
      },
      {
        path: 'household',
        loadChildren: () => import('./features/household/household.routes').then(m => m.HOUSEHOLD_ROUTES)
      },
      {
        path: 'ai-config',
        loadChildren: () => import('./features/ai-config/ai-config.routes').then(m => m.AI_CONFIG_ROUTES)
      },
      {
        path: 'logs',
        loadChildren: () => import('./features/logs/logs.routes').then(m => m.LOGS_ROUTES)
      },
      {
        path: 'settings',
        loadChildren: () => import('./features/settings/settings.routes').then(m => m.SETTINGS_ROUTES)
      }
    ]
  },

  // Wildcard
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
