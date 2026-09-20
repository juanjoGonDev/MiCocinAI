/**
 * La maquina del tour: los pasos, su numero y lo que significa haberlos saltado.
 *
 * Vive aqui y no dentro del componente porque es la parte que se puede equivocar sin que nadie lo vea
 * en un build: «Paso 3 de 5» con seis pasos, un paso que se salta y te deja en el mismo sitio, o un
 * tour saltado por completo que se registra como terminado son fallos de estado, no de pintura.
 *
 * Los pasos son una lista de ids, en el orden en que se preguntan. El numero que ve el usuario se
 * deriva de la posicion y el titulo de `STEP_TITLES`: anadir una pregunta es una linea aqui y un
 * bloque en la plantilla, no renumerar media pantalla a mano (que es como se queda un «Paso 4 de 6»
 * en la ultima).
 */
export const ONBOARDING_STEPS = ['profile', 'allergies', 'tastes', 'goal', 'meals', 'kitchen'] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const STEP_TITLES: Record<OnboardingStep, string> = {
  profile: 'Perfil',
  allergies: 'Alergias',
  tastes: 'Gustos',
  goal: 'Objetivo',
  meals: 'Horarios',
  kitchen: 'Cocina'
};

/** La cabecera de encima de la barra: numero derivado, titulo del paso y, si se ha saltado, eso mismo. */
export function stepLabel(
  index: number,
  steps: readonly OnboardingStep[] = ONBOARDING_STEPS,
  skipped = false
): string {
  const total = steps.length;
  const safe = Math.max(0, Math.min(total - 1, Math.trunc(index)));
  const title = STEP_TITLES[steps[safe]] ?? 'Paso';
  return `Paso ${safe + 1} de ${total} · ${title}${skipped ? ' · sin responder' : ''}`;
}

/** Siguiente paso, sin pasarse del ultimo: `next()` en el ultimo no puede irse a undefined. */
export function nextIndex(index: number, total: number): number {
  return Math.max(0, Math.min(total - 1, Math.trunc(index) + 1));
}

export function isLastIndex(index: number, total: number): boolean {
  return Math.trunc(index) >= total - 1;
}

/**
 * Si el usuario ha acabado el tour o lo ha saltado.
 *
 * Saltar los pasos UNO A UNO tiene que valer lo mismo que pulsar «Saltar por ahora»: el estado solo
 * dice «done» cuando algo se ha contestado de verdad. Con todos los pasos saltados no hay perfil, y
 * registrarlo como hecho es la forma elegante de que nadie vuelva a preguntar por las alergias.
 */
export function tourStatus(
  skipped: readonly string[],
  all: readonly OnboardingStep[] = ONBOARDING_STEPS
): 'done' | 'skipped' {
  const seen = new Set(skipped);
  return all.every((step) => seen.has(step)) ? 'skipped' : 'done';
}
