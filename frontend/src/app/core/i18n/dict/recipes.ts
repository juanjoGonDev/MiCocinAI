/**
 * El Catalogo de recetas y sus filtros.
 *
 * Un fichero por dominio porque con 600 claves en el service cada retoque habria generado conflictos
 * en todas las tandas a la vez. `as const` no es decoracion: es lo que da el tipo union de claves y, con
 * el `Record<keyof typeof es, string>` del lado ingles, hace que **una traduccion que falte sea un error
 * de compilacion** en lugar de una pantalla medio en espanol.
 */
export const recipesEs = {
  'recipes.all': 'Todas',
  'recipes.count': '{n} recetas',
  'recipes.favs': 'Favoritas',
  'recipes.filters': '🔍 Filtros',
  'recipes.genAI': '🤖 Generar IA',
  'recipes.loading': 'Cargando recetas...',
  'recipes.none': 'No hay recetas',
  'recipes.none.desc': 'Genera tu primera receta con IA',
  'recipes.quick': 'Rápidas (<30m)',
  'recipes.title': '📖 Recetas',
} as const;

export const recipesEn: Record<keyof typeof recipesEs, string> = {
  'recipes.all': 'All',
  'recipes.count': '{n} recipes',
  'recipes.favs': 'Favorites',
  'recipes.filters': '🔍 Filters',
  'recipes.genAI': '🤖 Generate AI',
  'recipes.loading': 'Loading recipes...',
  'recipes.none': 'No recipes',
  'recipes.none.desc': 'Generate your first recipe with AI',
  'recipes.quick': 'Quick (<30m)',
  'recipes.title': '📖 Recipes',
};
