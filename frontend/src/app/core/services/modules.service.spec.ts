import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import { DEFAULT_HOME_PROFILE, HOME_MODULE_OPTIONS, HomeModule, HomeProfile } from '../../shared/models/home-profile';
import { TasteProfileService } from './taste-profile.service';
import { MODULE_REGISTRY, ModulesService, moduleOwningPath } from './modules.service';

/**
 * El servicio de modulos se prueba contra un `TasteProfileService` de pega: lo
 * que importa es como interpreta el perfil, como pinta la navegacion y como se
 * comporta cuando la red falla. El guardado se controla a mano (next/error)
 * para poder ver el estado optimista antes de la respuesta.
 */

interface Deferred {
  next: (value: HomeProfile) => void;
  error: (value: unknown) => void;
}

describe('ModulesService', () => {
  let current: HomeProfile;
  let saved: HomeProfile[];
  let pending: Deferred[];
  let ensureLoadedCalls: number;
  let service: ModulesService;

  class FakeTasteService {
    /** Sinal de pega: llamable y con `.set`, como la del servicio real. */
    readonly profile = Object.assign(() => current, {
      set: (value: HomeProfile) => {
        current = value;
      }
    });

    ensureLoaded(): void {
      ensureLoadedCalls++;
    }

    save(_taste: unknown, _status: unknown, patch?: Partial<HomeProfile>): Observable<unknown> {
      const state = { ...current, ...(patch ?? {}) };
      saved.push(state);
      return new Observable<unknown>((subscriber) => {
        pending.push({
          next: (value) => {
            subscriber.next(value);
            subscriber.complete();
          },
          error: (value) => subscriber.error(value)
        });
      });
    }
  }

  function configure(initial: Partial<HomeProfile> = {}): void {
    current = { ...DEFAULT_HOME_PROFILE, ...initial };
    saved = [];
    pending = [];
    ensureLoadedCalls = 0;

    TestBed.configureTestingModule({
      providers: [{ provide: TasteProfileService, useClass: FakeTasteService }]
    });

    service = TestBed.inject(ModulesService);
  }

  /** Estado guardado real (lo que veria el servidor tras resolver). */
  function storedModules(): HomeModule[] {
    return current.modules;
  }

  it('pide el perfil al crearse, para no llegar a Configuracion sin datos', () => {
    configure();
    expect(ensureLoadedCalls).toBe(1);
  });

  it('sin seleccion deja visibles todos los modulos que trae el build', () => {
    configure({ modules: [] });

    expect(service.active()).toEqual(['meals', 'pantry']);
    expect(service.isPathVisible('/calendar')).toBeTrue();
    expect(service.isPathVisible('/recipes')).toBeTrue();
    expect(service.isPathVisible('/pantry')).toBeTrue();
  });

  it('el nucleo nunca se oculta: inicio, hogar, preferencias y ajustes', () => {
    configure({ modules: [] });

    for (const path of ['/dashboard', '/household', '/preferences', '/settings', '/logs', '/ai-config']) {
      expect(service.isPathVisible(path)).withContext(path).toBeTrue();
    }
    expect(moduleOwningPath('/settings')).toBeUndefined();
  });

  it('una seleccion explicita filtra: lo que no esta marcado, fuera', () => {
    configure({ modules: ['pantry'] });

    expect(service.isPathVisible('/pantry')).toBeTrue();
    expect(service.isPathVisible('/calendar')).toBeFalse();
    expect(service.isPathVisible('/recipes')).toBeFalse();
  });

  it('un modulo marcado que el build no trae no anade ninguna ruta', () => {
    configure({ modules: ['meals', 'shopping'] });

    expect(service.isEnabled('shopping')).toBeTrue();
    expect(service.isAvailable('shopping')).toBeFalse();
    // Todavia no existe la pantalla: enlazarla seria mandarle a un 404.
    expect(service.isPathVisible('/shopping')).toBeFalse();
    expect(service.isPathVisible('/calendar')).toBeTrue();
  });

  it('apagar un modulo quita sus rutas al instante, sin recargar', () => {
    configure({ modules: [] });
    expect(service.isPathVisible('/pantry')).toBeTrue();

    service.toggle('pantry');

    // Optimista: la navegacion ya refleja el cambio, sin respuesta del server.
    expect(service.selected()).toEqual(['meals']);
    expect(service.isPathVisible('/pantry')).toBeFalse();
    expect(service.isPathVisible('/calendar')).toBeTrue();

    pending[0].next(current);
    expect(storedModules()).toEqual(['meals']);
    expect(service.isSaving()).toBeFalse();
  });

  it('encender un modulo disponible anade sus rutas y lo guarda', () => {
    configure({ modules: ['pantry'] });

    service.toggle('meals');

    expect(service.selected()).toEqual(['pantry', 'meals']);
    expect(service.isPathVisible('/calendar')).toBeTrue();
    expect(saved.length).toBe(1);
    expect(saved[0].modules).toEqual(['pantry', 'meals']);
    expect(service.isSaving()).toBeTrue();

    pending[0].next(current);
    expect(service.isSaving()).toBeFalse();
    expect(service.lastError()).toBeNull();
  });

  it('si el guardado falla, se vuelve al estado anterior', () => {
    configure({ modules: ['pantry'] });

    service.toggle('pantry');
    expect(service.isPathVisible('/pantry')).toBeFalse();

    pending[0].error(new Error('500'));

    expect(storedModules()).toEqual(['pantry']);
    expect(service.isPathVisible('/pantry')).toBeTrue();
    expect(service.isSaving()).toBeFalse();
    expect(service.lastError()).toBe('MODULE_SAVE_FAILED');
  });

  it('el rollback no toca el resto del perfil (el nivel de cocina sigue)', () => {
    configure({ cookingLevel: 'expert', modules: ['pantry'] });

    service.toggle('meals');
    expect(service.isEnabled('meals')).toBeTrue();

    pending[0].error(new Error('500'));

    expect(current.cookingLevel).toBe('expert');
    expect(storedModules()).toEqual(['pantry']);
    expect(service.isEnabled('meals')).toBeFalse();
  });

  it('no deja apagar la ultima seccion visible (si no, la seleccion vacia la reviviria)', () => {
    configure({ modules: [] });

    expect(service.visibleNow()).toEqual(['meals', 'pantry']);
    expect(service.canSwitchOff('pantry')).toBeTrue();

    service.toggle('pantry');
    pending[0].next(current);

    expect(service.visibleNow()).toEqual(['meals']);
    expect(service.canSwitchOff('meals')).toBeFalse();
  });

  it('lo que el build no trae se puede apagar siempre: no ocupa navegacion', () => {
    configure({ modules: ['meals', 'pantry', 'shopping'] });

    expect(service.canSwitchOff('shopping')).toBeTrue();
    expect(service.canSwitchOff('meals')).toBeTrue();
  });

  it('restablecer vuelve a la seleccion vacia, que significa todo lo disponible', () => {
    configure({ modules: ['pantry'] });

    service.resetSelection();
    pending[0].next(current);

    expect(service.selected()).toEqual([]);
    expect(service.isPathVisible('/calendar')).toBeTrue();
    expect(service.isPathVisible('/pantry')).toBeTrue();
  });

  it('restablecer cuando ya estaba vacio no dispara ninguna peticion', () => {
    configure({ modules: [] });

    service.resetSelection();

    expect(saved.length).toBe(0);
    expect(service.isSaving()).toBeFalse();
  });

  it('un id desconocido no rompe nada: ni definicion, ni disponibilidad', () => {
    configure();

    expect(service.definition('no-existe' as never)).toBeUndefined();
    expect(service.isAvailable('no-existe' as never)).toBeFalse();
    expect(service.isPathVisible('/no-existe')).toBeTrue();
  });

  it('el registro cubre los modulos del modelo, sin rutas repetidas', () => {
    const paths = MODULE_REGISTRY.flatMap((definition) => definition.paths);
    const ids = MODULE_REGISTRY.map((definition) => definition.id);

    expect(MODULE_REGISTRY.length).toBe(HOME_MODULE_OPTIONS.length);
    expect(ids.sort()).toEqual(HOME_MODULE_OPTIONS.map((option) => option.value).sort());
    expect(new Set(paths).size).toBe(paths.length);
    expect(MODULE_REGISTRY.every((definition) => definition.hint.length > 0)).toBeTrue();
    expect(MODULE_REGISTRY.filter((definition) => definition.available).length).toBe(2);
  });
});
