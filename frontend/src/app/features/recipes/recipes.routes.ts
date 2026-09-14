import { Routes } from '@angular/router';

export const RECIPES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./recipes.component').then(m => m.RecipesComponent)
  }
];
