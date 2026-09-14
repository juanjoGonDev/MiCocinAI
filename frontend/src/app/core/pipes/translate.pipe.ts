import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from '../services/i18n.service';

/**
 * Usage in templates:
 *   {{ 'nav.dashboard' | t }}
 *   {{ 'dashboard.greeting' | t:{name: userName()} }}
 */
@Pipe({ name: 't', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private i18n = inject(I18nService);

  transform(key: string, params?: Record<string, string | number>): string {
    // Read the change tick so the pipe re-evaluates on language change
    this.i18n.changeTick();
    return this.i18n.t(key, params);
  }
}
