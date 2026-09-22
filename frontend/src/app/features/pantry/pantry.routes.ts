import { Routes } from '@angular/router';

export const PANTRY_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pantry.component').then(m => m.PantryComponent)
  },
  // El gestor del inventario (HOGARIA-SPEC ## 12x): dos pantallas enrutadas, cada una con su ficha, para que
  // un F5 a media edicion no la tire y el boton atras del navegador signifique lo que significa en el resto
  // de la app. `new` es el alta, no un modal: misma pantalla, sin fila que editar.
  {
    path: 'categories',
    loadComponent: () => import('./pantry-categories.component').then(m => m.PantryCategoriesComponent)
  },
  {
    path: 'categories/:id',
    loadComponent: () => import('./pantry-categories.component').then(m => m.PantryCategoriesComponent)
  },
  // El visor del catalogo pre-registrado (## 12aa): sin `:id`, la pantalla no tiene ficha —el catalogo no se
  // edita, se recorre y se anade desde la fila—. Su estado (pasillo, busqueda, pagina) viaja en la query.
  {
    path: 'catalogo',
    loadComponent: () => import('./pantry-catalog.component').then(m => m.PantryCatalogComponent)
  },
  {
    path: 'products',
    loadComponent: () => import('./pantry-products.component').then(m => m.PantryProductsComponent)
  },
  {
    path: 'products/:id',
    loadComponent: () => import('./pantry-products.component').then(m => m.PantryProductsComponent)
  }
];
