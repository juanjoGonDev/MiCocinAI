import { Injectable, signal, computed, effect } from '@angular/core';
import { STORAGE_KEYS } from './storage.service';

export type Language = 'es' | 'en' | 'auto';
export type ResolvedLanguage = 'es' | 'en';

type Dict = Record<string, string>;

const es: Dict = {
  // Layout / nav
  'nav.dashboard': 'Inicio',
  'nav.pantry': 'Despensa',
  'nav.shopping': 'Compra',
  'nav.recipes': 'Recetas',
  'nav.calendar': 'Calendario',
  'nav.household': 'Hogar',
  'nav.ai-config': 'IA Config',
  'nav.logs': 'Logs',
  'nav.settings': 'Configuración',
  'nav.preferences': 'Preferencias',
  'nav.logout': 'Cerrar sesión',
  'app.name': 'HogarIA',

  // Auth
  'auth.login': 'Iniciar sesión',
  'auth.register': 'Crear cuenta',
  'auth.email': 'Email',
  'auth.password': 'Contraseña',
  'auth.name': 'Nombre',
  'auth.forgot': '¿Olvidaste la contraseña?',
  'auth.login.cta': 'Entrar',
  'auth.register.cta': 'Crear Cuenta',
  'auth.already': '¿Ya tienes cuenta?',
  'auth.noaccount': '¿No tienes cuenta?',
  'auth.cookingLevel': 'Nivel de cocina',
  'auth.beginner': 'Principiante',
  'auth.intermediate': 'Intermedio',
  'auth.expert': 'Experto',

  // Dashboard
  'dashboard.greeting': '¡Hola, {name}! 👋',
  'dashboard.subtitle': '¿Qué vamos a cocinar hoy?',
  'dashboard.ingredients': 'Ingredientes',
  'dashboard.recipes': 'Recetas',
  'dashboard.members': 'Miembros',
  'dashboard.cooked': 'Cocinadas',
  'dashboard.genAI': 'Generar con IA',
  'dashboard.pantry': 'Mi Despensa',
  'dashboard.plan': 'Planificar',
  'dashboard.todayMeals': 'Comidas de hoy',
  'dashboard.viewAll': 'Ver todo →',
  'dashboard.noMeals': 'No hay comidas planificadas para hoy',
  'dashboard.planNow': 'Planificar ahora',
  'dashboard.suggested': 'Recetas sugeridas',
  'dashboard.noSuggested': 'No hay recetas sugeridas',
  'dashboard.genAIRecipes': 'Generar con IA',
  'dashboard.weeklyProgress': 'Progreso semanal',
  'dashboard.calories': 'Calorías',
  'dashboard.protein': 'Proteínas',

  // Recipes
  'recipes.title': '📖 Recetas',
  'recipes.count': '{n} recetas',
  'recipes.filters': '🔍 Filtros',
  'recipes.genAI': '🤖 Generar IA',
  'recipes.all': 'Todas',
  'recipes.favs': 'Favoritas',
  'recipes.quick': 'Rápidas (<30m)',
  'recipes.none': 'No hay recetas',
  'recipes.none.desc': 'Genera tu primera receta con IA',
  'recipes.loading': 'Cargando recetas...',

  // Pantry
  'pantry.title': '📦 Despensa',
  'pantry.empty': 'Tu despensa está vacía',
  'pantry.empty.desc': 'Añade ingredientes para empezar',
  'pantry.add': '+ Añadir ingrediente',

  // Logs
  'logs.title': '📋 Logs',
  'logs.live': 'En vivo',
  'logs.disconnected': 'Desconectado',
  'logs.pause': '⏸ Pausar',
  'logs.resume': '▶ Reanudar',
  'logs.autoscroll': 'Auto-scroll',
  'logs.clear': '🗑 Limpiar',
  'logs.all': 'Todos',
  'logs.server': 'Servidor',
  'logs.browser': 'Cliente',
  'logs.levels.all': 'Todos los niveles',
  'logs.waiting': 'Esperando logs…',
  'logs.clearConfirm': '¿Borrar todos los logs?',

  // Settings
  'settings.title': '⚙️ Configuración',
  'settings.modules': '🧭 Módulos',
  'settings.modulesHint': 'Qué secciones de HogarIA tienes encendidas. Se aplican al momento, sin recargar.',
  'settings.modulesSoon': 'pronto',
  'settings.modulesAllOn': 'Sin marcar: se enseñan todas las secciones que trae esta version.',
  'settings.modulesFailed': 'No se pudo guardar el cambio; se ha vuelto al estado anterior.',
  'settings.modulesReset': 'Volver a ver todas las secciones disponibles',
  'settings.theme': 'Tema',
  'settings.theme.light': '☀️ Claro',
  'settings.theme.dark': '🌙 Oscuro',
  'settings.theme.system': '💻 Sistema',
  'settings.language': 'Idioma',
  'settings.lang.es': '🇪🇸 Español',
  'settings.lang.en': '🇬🇧 English',
  'settings.lang.auto': '🖥️ Detectar automáticamente',

  // Common
  'common.save': 'Guardar',
  'common.cancel': 'Cancelar',
  'common.delete': 'Eliminar',
  'common.edit': 'Editar',
  'common.create': 'Crear',
  'common.loading': 'Cargando...',
  'common.error': 'Error',
  'common.success': 'Éxito',
};

const en: Dict = {
  'nav.dashboard': 'Home',
  'nav.pantry': 'Pantry',
  'nav.shopping': 'Shopping',
  'nav.recipes': 'Recipes',
  'nav.calendar': 'Calendar',
  'nav.household': 'Household',
  'nav.ai-config': 'AI Config',
  'nav.logs': 'Logs',
  'nav.settings': 'Settings',
  'nav.preferences': 'Preferences',
  'nav.logout': 'Log out',
  'app.name': 'HogarIA',

  'auth.login': 'Log in',
  'auth.register': 'Sign up',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.name': 'Name',
  'auth.forgot': 'Forgot password?',
  'auth.login.cta': 'Sign in',
  'auth.register.cta': 'Create account',
  'auth.already': 'Already have an account?',
  'auth.noaccount': "Don't have an account?",
  'auth.cookingLevel': 'Cooking level',
  'auth.beginner': 'Beginner',
  'auth.intermediate': 'Intermediate',
  'auth.expert': 'Expert',

  'dashboard.greeting': 'Hi, {name}! 👋',
  'dashboard.subtitle': "What are we cooking today?",
  'dashboard.ingredients': 'Ingredients',
  'dashboard.recipes': 'Recipes',
  'dashboard.members': 'Members',
  'dashboard.cooked': 'Cooked',
  'dashboard.genAI': 'Generate with AI',
  'dashboard.pantry': 'My Pantry',
  'dashboard.plan': 'Plan',
  'dashboard.todayMeals': "Today's meals",
  'dashboard.viewAll': 'See all →',
  'dashboard.noMeals': 'No meals planned for today',
  'dashboard.planNow': 'Plan now',
  'dashboard.suggested': 'Suggested recipes',
  'dashboard.noSuggested': 'No suggested recipes',
  'dashboard.genAIRecipes': 'Generate with AI',
  'dashboard.weeklyProgress': 'Weekly progress',
  'dashboard.calories': 'Calories',
  'dashboard.protein': 'Protein',

  'recipes.title': '📖 Recipes',
  'recipes.count': '{n} recipes',
  'recipes.filters': '🔍 Filters',
  'recipes.genAI': '🤖 Generate AI',
  'recipes.all': 'All',
  'recipes.favs': 'Favorites',
  'recipes.quick': 'Quick (<30m)',
  'recipes.none': 'No recipes',
  'recipes.none.desc': 'Generate your first recipe with AI',
  'recipes.loading': 'Loading recipes...',

  'pantry.title': '📦 Pantry',
  'pantry.empty': 'Your pantry is empty',
  'pantry.empty.desc': 'Add ingredients to get started',
  'pantry.add': '+ Add ingredient',

  'logs.title': '📋 Logs',
  'logs.live': 'Live',
  'logs.disconnected': 'Disconnected',
  'logs.pause': '⏸ Pause',
  'logs.resume': '▶ Resume',
  'logs.autoscroll': 'Auto-scroll',
  'logs.clear': '🗑 Clear',
  'logs.all': 'All',
  'logs.server': 'Server',
  'logs.browser': 'Client',
  'logs.levels.all': 'All levels',
  'logs.waiting': 'Waiting for logs…',
  'logs.clearConfirm': 'Clear all logs?',

  'settings.title': '⚙️ Settings',
  'settings.modules': '🧭 Modules',
  'settings.modulesHint': 'Which HogarIA sections you have switched on. Applied right away, no reload.',
  'settings.modulesSoon': 'soon',
  'settings.modulesAllOn': 'Nothing selected: every section this build ships is shown.',
  'settings.modulesFailed': 'Could not save the change; reverted to the previous state.',
  'settings.modulesReset': 'Show every available section again',
  'settings.theme': 'Theme',
  'settings.theme.light': '☀️ Light',
  'settings.theme.dark': '🌙 Dark',
  'settings.theme.system': '💻 System',
  'settings.language': 'Language',
  'settings.lang.es': '🇪🇸 Spanish',
  'settings.lang.en': '🇬🇧 English',
  'settings.lang.auto': '🖥️ Auto-detect',

  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.create': 'Create',
  'common.loading': 'Loading...',
  'common.error': 'Error',
  'common.success': 'Success',
};

const DICTS: Record<ResolvedLanguage, Dict> = { es, en };

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

  /** Translate a key with simple {placeholder} substitution. */
  t(key: string, params?: Record<string, string | number>): string {
    const dict = DICTS[this.resolvedSignal()];
    let str = dict[key] ?? DICTS.es[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
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
