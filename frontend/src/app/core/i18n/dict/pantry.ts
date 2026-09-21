/**
 * La despensa: lo que hay, lo que caduca.
 *
 * Un fichero por dominio porque con 600 claves en el service cada retoque habria generado conflictos
 * en todas las tandas a la vez. `as const` no es decoracion: es lo que da el tipo union de claves y, con
 * el `Record<keyof typeof es, string>` del lado ingles, hace que **una traduccion que falte sea un error
 * de compilacion** en lugar de una pantalla medio en espanol.
 */
export const pantryEs = {
  'pantry.add': '+ Añadir ingrediente',
  'pantry.empty': 'Tu despensa está vacía',
  'pantry.empty.desc': 'Añade ingredientes para empezar',
  'pantry.title': '📦 Despensa',
} as const;

export const pantryEn: Record<keyof typeof pantryEs, string> = {
  'pantry.add': '+ Add ingredient',
  'pantry.empty': 'Your pantry is empty',
  'pantry.empty.desc': 'Add ingredients to get started',
  'pantry.title': '📦 Pantry',
};
