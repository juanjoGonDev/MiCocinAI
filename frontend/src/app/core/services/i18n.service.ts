import { Injectable, signal, effect } from '@angular/core';
import { STORAGE_KEYS } from './storage.service';
import { DICTS, type TranslationKey, type TranslationParams } from '../i18n';

/**
 * El idioma de la aplicacion, y donde se busca un texto.
 *
 * Lo que ha cambiado en la ronda 20: los diccionarios ya no viven aqui. Con 600 y pico cadenas en el mismo
 * fichero, el service era a la vez el registro de textos y el mecanismo, y cada pantalla nueva ponia su
 * literal en la plantilla porque anadir una clave costaba mas que escribirla a mano —asi se colaron 502
 * textos en espanol fijo. Ahora `core/i18n/dict/<dominio>.ts` es el sitio de cada pantalla, y el tipo
 * `TranslationKey` (la union de claves, en `core/i18n/index.ts`) hace que inventarse una clave no compile.
 *
 * El idioma por defecto es el del navegador, y eso tiene una consecuencia que no es obvia: los e2e
 * assertan texto en espanol, asi que `playwright.config.ts` ancla `locale: 'es-ES'`. Sin ese ancla, la
 * suite entera dependeria del idioma de la maquina que la ejecuta, que no es un test.
 */

export type Language = 'es' | 'en' | 'auto';
export type ResolvedLanguage = 'es' | 'en';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly LANG_KEY = STORAGE_KEYS.language;
  private langSignal = signal<Language>(this.getStoredLang());
  private resolvedSignal = signal<ResolvedLanguage>(this.resolve(this.getStoredLang()));

  readonly lang = this.langSignal.asReadonly();
  readonly resolved = this.resolvedSignal.asReadonly();
  // Expose as a signal to drive re-rendering in templates (use via t() fn)
  readonly changeTick = signal(0);

  constructor() {
    if (typeof window !== 'undefined') {
      // React to browser language changes when in 'auto' mode
      window.addEventListener('languagechange', () => {
        if (this.langSignal() === 'auto') {
          this.resolvedSignal.set(this.detectBrowserLang());
          this.changeTick.update(v => v + 1);
        }
      });
    }

    effect(() => {
      this.langSignal();
      this.resolvedSignal.set(this.resolve(this.langSignal()));
      this.changeTick.update(v => v + 1);
      document.documentElement.lang = this.resolvedSignal();
    });
  }

  setLang(lang: Language): void {
    this.langSignal.set(lang);
    localStorage.setItem(this.LANG_KEY, lang);
  }

  /**
   * El texto de una clave, con sustitucion simple de {placeholder}.
   *
   * `key` es `TranslationKey`, no `string`: es lo que hace que un `t('shoping.title')` con una errata se
   * pare en el compilador en lugar de enseiar la clave en crudo en la pantalla. El fallback sigue siendo
   * el espanol y, si tampoco esta, la clave —por si el diccionario llega a medias de una rama larga.
   */
  t(key: TranslationKey, params?: TranslationParams): string {
    const dict = DICTS[this.resolvedSignal()];
    let str: string = dict[key] ?? DICTS.es[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v == null ? '' : String(v));
      }
    }
    return str;
  }

  private resolve(l: Language): ResolvedLanguage {
    if (l === 'auto') return this.detectBrowserLang();
    return l;
  }

  private detectBrowserLang(): ResolvedLanguage {
    if (typeof navigator === 'undefined') return 'es';
    const lang = (navigator.language || 'es').toLowerCase();
    return lang.startsWith('en') ? 'en' : 'es';
  }

  private getStoredLang(): Language {
    const stored = localStorage.getItem(this.LANG_KEY);
    if (stored && ['es', 'en', 'auto'].includes(stored)) return stored as Language;
    return 'auto';
  }
}
