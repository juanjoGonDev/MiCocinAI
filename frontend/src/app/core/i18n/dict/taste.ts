/**
 * Los objetivos de la carta semanal, con su explicacion.
 *
 * `GOAL_OPTIONS` en `shared/models/taste-profile.ts` llevaba el texto de la etiqueta aqui; ahora lleva
 * la clave, y el icono y el `value` siguen siendo lo que se guarda. Los alérgenos y los gustos
 * (`COMMON_ALLERGENS`, `COMMON_LIKES`) NO estan: ahi lo que se ensena es el valor guardado, y traducirlo
 * haria que la pantalla mienta sobre lo que hay en la base de datos (12s-A).
 */
export const tasteEs = {
  'taste.goal.balanced': 'Equilibrada',
  'taste.goal.custom': 'Personalizada',
  'taste.goal.muscle-gain': 'Ganar músculo',
  'taste.goal.variety': 'Variada',
  'taste.goal.weight-gain': 'Ganar peso',
  'taste.goal.weight-loss': 'Perder peso',
  'taste.goalHint.balanced': 'De todo, sin obsesionarse',
  'taste.goalHint.custom': 'Te leemos el texto libre',
  'taste.goalHint.muscle-gain': 'Proteína en cada comida',
  'taste.goalHint.variety': 'Que no se repita la carta',
  'taste.goalHint.weight-gain': 'Más calorías, platos densos',
  'taste.goalHint.weight-loss': 'Raciones contenidas, poco frito',
} as const;

export const tasteEn: Record<keyof typeof tasteEs, string> = {
  'taste.goal.balanced': 'Balanced',
  'taste.goal.custom': 'Custom',
  'taste.goal.muscle-gain': 'Build muscle',
  'taste.goal.variety': 'Variety',
  'taste.goal.weight-gain': 'Gain weight',
  'taste.goal.weight-loss': 'Lose weight',
  'taste.goalHint.balanced': 'A bit of everything, no obsession',
  'taste.goalHint.custom': 'We read your free text',
  'taste.goalHint.muscle-gain': 'Protein at every meal',
  'taste.goalHint.variety': 'Keep the menu from repeating',
  'taste.goalHint.weight-gain': 'More calories, denser plates',
  'taste.goalHint.weight-loss': 'Controlled portions, little fried food',
};
