import { Routes } from '@angular/router';

export const AI_CONFIG_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./ai-config.component').then(m => m.AiConfigComponent)
  }
];
