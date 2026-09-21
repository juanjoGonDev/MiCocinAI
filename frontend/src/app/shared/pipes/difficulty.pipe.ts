import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from '../../core/services/i18n.service';
import type { TranslationKey } from '../../core/i18n';

@Pipe({
  name: 'difficulty',
  standalone: true
})
export class DifficultyPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  /** La clave, no la frase: un pipe se pinta en los dos idiomas y aqui no hay quien escriba el otro. */
  private readonly labelKeys: Record<string, TranslationKey> = {
    easy: 'recipes.facil',
    medium: 'recipes.medio',
    hard: 'recipes.dificil'
  };

  private readonly icons: Record<string, string> = {
    easy: '🟢',
    medium: '🟡',
    hard: '🔴'
  };

  transform(value: string | null | undefined, showIcon = false): string {
    if (!value) return '';

    const key = this.labelKeys[value.toLowerCase()];
    const label = key ? this.i18n.t(key) : value;
    const icon = this.icons[value.toLowerCase()] || '';

    return showIcon ? `${icon} ${label}` : label;
  }
}
