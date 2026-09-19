import { Injectable, computed, inject, signal } from '@angular/core';
import { HomeModule } from '../../shared/models/home-profile';
import { TasteProfileService } from './taste-profile.service';

/**
 * Módulos de HogarIA: qué secciones de la app tiene encendida esta cuenta.
 *
 * Es un flag de la APP (como el tema o el idioma), no del comensal: por eso se
 * edita en Configuración y no en Preferencias. El tour pregunta lo mismo, y lo
 * que se contesta ahí se puede cambiar aquí sin volver al tour.
 *
 * Tres reglas hacen que esto sea usable:
 *
 * 1. **Seleccion vacía = todo lo disponible.** Nadie pierde «Recetas» o
 *    «Despensa» por haber saltado el onboarding.
 * 2. **Se puede activar lo que aún no existe.** `available: false` significa
 *    «este build todavía no lo trae». Marcado se guarda, y la sección aparece
 *    sola cuando llegue el build que la contiene; mientras tanto no se enlaza,
 *    para no llevar a nadie a una ruta que no existe.
 * 3. **Se aplica sin recargar.** Todo deriva de la señal del perfil: la
 *    navegación y las tarjetas se repintan al pulsar el interruptor.
 */

export interface ModuleDefinition {
  id: HomeModule;
  label: string;
  hint: string;
  /** Si este build trae ya la sección. */
  available: boolean;
  /** Rutas de primer nivel que gobierna este módulo. */
  paths: string[];
}

/**
 * Registro único. Las rutas de un módulo son las que se ocultan si se apaga;
 * una ruta que no está aquí (Inicio, Hogar, Preferencias, Configuración, Logs)
 * es núcleo: siempre visible. Nadie se queda sin salidas de la app.
 */
export const MODULE_REGISTRY: readonly ModuleDefinition[] = [
  {
    id: 'meals',
    label: 'Comidas y recetas',
    hint: 'Planificador semanal, recetas y generador con IA',
    available: true,
    paths: ['/calendar', '/recipes']
  },
  {
    id: 'pantry',
    label: 'Despensa y caducidades',
    hint: 'Qué queda, qué caduca y el catálogo de utensilios',
    available: true,
    paths: ['/pantry']
  },
  {
    id: 'shopping',
    label: 'Lista de la compra y precios',
    hint: 'Cesta por tienda, histórico de precios y coste estimado',
    available: false,
    paths: ['/shopping']
  },
  {
    id: 'receipts',
    label: 'Tickets con OCR',
    hint: 'Foto al ticket: líneas, precios y caducidades a la despensa',
    available: false,
    paths: ['/receipts']
  },
  {
    id: 'home',
    label: 'Tareas del hogar',
    hint: 'Reparto de tareas y calendario conjunto',
    available: false,
    paths: ['/tasks']
  }
];

const REGISTRY_BY_PATH = new Map<string, ModuleDefinition>();
for (const definition of MODULE_REGISTRY) {
  for (const path of definition.paths) REGISTRY_BY_PATH.set(path, definition);
}

/** A qué módulo pertenece una ruta (undefined = núcleo, siempre visible). */
export function moduleOwningPath(path: string): ModuleDefinition | undefined {
  return REGISTRY_BY_PATH.get(path);
}

@Injectable({ providedIn: 'root' })
export class ModulesService {
  private readonly tasteService = inject(TasteProfileService);

  readonly registry = MODULE_REGISTRY;
  readonly isSaving = signal(false);

  /** Lo que hay guardado en la cuenta, sin interpretar. */
  readonly selected = computed(() => this.tasteService.profile().modules);

  /** Lo que de verdad está encendido: sin selección, todo lo del build. */
  readonly active = computed<HomeModule[]>(() => {
    const selected = this.selected();
    if (selected.length > 0) return selected;
    return MODULE_REGISTRY.filter((definition) => definition.available).map(
      (definition) => definition.id
    );
  });

  constructor() {
    // El perfil puede no haberse pedido nunca (entrada directa a Configuración).
    this.tasteService.ensureLoaded();
  }

  definition(id: HomeModule | string): ModuleDefinition | undefined {
    return MODULE_REGISTRY.find((definition) => definition.id === id);
  }

  isAvailable(id: HomeModule): boolean {
    return this.definition(id)?.available ?? false;
  }

  /** Marcado en la cuenta, exista o no la sección en este build. */
  isEnabled(id: HomeModule): boolean {
    return this.active().includes(id);
  }

  /**
   * Si una ruta debe aparecer en la navegación. Metodo, no signal: lo lee un
   * `computed` de la vista y asi la navegacion se repinta sola al pulsar.
   */
  isPathVisible(path: string): boolean {
    const owner = moduleOwningPath(path);
    if (!owner) return true;
    if (!owner.available) return false;
    return this.active().includes(owner.id);
  }

  /** Activa o apaga un módulo. Optimista: la UI responde al clic, no a la red. */
  toggle(id: HomeModule): void {
    const current = this.active();
    const next = this.isEnabled(id)
      ? current.filter((module) => module !== id)
      : [...current, id];

    this.apply(next);
  }

  private apply(next: HomeModule[]): void {
    const previous = this.tasteService.profile();
    this.tasteService.profile.set({ ...previous, modules: next });
    this.isSaving.set(true);

    this.tasteService.save({}, undefined, { modules: next }).subscribe({
      error: () => {
        // Rollback: sin esto la navegacion mentiria sobre lo guardado.
        this.tasteService.profile.set(previous);
      },
      complete: () => this.isSaving.set(false)
    });
  }
}
