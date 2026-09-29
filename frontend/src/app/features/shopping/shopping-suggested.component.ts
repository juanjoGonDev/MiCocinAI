import { Component, computed, inject, OnInit, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { I18nService } from '../../core/services/i18n.service';
import { ShoppingService } from '../../core/services/shopping.service';
import { ToastService } from '../../core/services/toast.service';
import { ButtonComponent } from '../../shared/components/ui/button/button.component';
import { BadgeComponent } from '../../shared/components/ui/badge/badge.component';
import type { TranslationKey } from '../../core/i18n';
import type { MotivoDeSugerencia, SugerenciaRow } from '../../shared/models/shopping.model';

/**
 * La tarjeta de la lista sugerida (HOGARIA-SPEC ## 12al), arriba de la bandeja de compras.
 *
 * Es una SUGERENCIA, no un facto automatico: se ensena lo que el motor estadistico del server
 * calcularia (ritmo de compra, stock, caducidad y plan de la semana, sin IA) y la lista solo
 * nace cuando se pulsa el boton. Si ya hay una lista sugerida abierta, el boton pasa a ser
 * «Actualizar»: se creo hace dias, la casa ha seguido comprando y apuntando, y lo honesto es
 * refrescarla —sin tocar lo comprado ni lo anadido a mano, eso lo garantiza el server.
 *
 * En cada fila se dice el PORQUE (el motivo, con su color) y el DONDE (la tienda mas barata
 * que la casa conoce): «sin stock» y «mejor en Lidl» juntos son una decision ya tomada.
 */

/** Cuantas filas se ensenan antes del «y N mas»: la tarjeta es un resumen, no la lista. */
const FILAS_VISIBLES = 5;

const MOTIVO_CLAVE: Record<MotivoDeSugerencia, TranslationKey> = {
  caduca: 'shopping_suggested.motivo.caduca',
  sin_stock: 'shopping_suggested.motivo.sin_stock',
  se_acaba: 'shopping_suggested.motivo.se_acaba',
  para_el_plan: 'shopping_suggested.motivo.para_el_plan'
};

const MOTIVO_VARIANTE: Record<MotivoDeSugerencia, 'error' | 'warning' | 'primary' | 'neutral'> = {
  caduca: 'error',
  sin_stock: 'warning',
  se_acaba: 'primary',
  para_el_plan: 'neutral'
};

@Component({
  selector: 'app-shopping-suggested',
  standalone: true,
  imports: [CommonModule, TranslatePipe, ButtonComponent, BadgeComponent],
  template: `
    <section class="sug" data-test="sugerida-card">
      <header class="sug__head">
        <div class="sug__titular">
          <h2 class="sug__titulo">{{ 'shopping_suggested.titulo' | t }}</h2>
          <p class="sug__subtitulo">{{ 'shopping_suggested.subtitulo' | t }}</p>
        </div>
        @if (sePuedeAplicar()) {
          <app-button
            [variant]="listaAbierta() ? 'secondary' : 'primary'"
            type="button"
            [loading]="trabajando()"
            (onClick)="aplicar()"
            [attr.data-test]="listaAbierta() ? 'sugerida-actualizar' : 'sugerida-crear'"
          >
            {{ (listaAbierta() ? 'shopping_suggested.actualizar' : 'shopping_suggested.crear') | t }}
          </app-button>
        }
      </header>

      @if (shopping.cargandoSugerencia()) {
        <p class="sug__carga" data-test="sugerida-cargando">…</p>
      } @else if (filas().length === 0) {
        <div class="sug__vacio">
          <span>{{ 'shopping_suggested.vacio' | t }}</span>
          <span class="sug__vacio-hint">{{ 'shopping_suggested.vacio_hint' | t }}</span>
        </div>
      } @else {
        <ul class="sug__lista">
          @for (fila of primeras(); track fila.name) {
            <li class="sug__fila" [attr.data-test]="'sugerida-item-' + fila.name">
              <span class="sug__nombre">{{ fila.name }}</span>
              <span class="sug__cantidad"
                >×{{ fila.quantity }}{{ fila.unit ? ' ' + fila.unit : '' }}</span
              >
              <app-badge [variant]="varianteDe(fila)" size="sm">{{
                MOTIVO_CLAVE[fila.motivo] | t
              }}</app-badge>
              @if (fila.mejorTienda) {
                <span class="sug__tienda">{{
                  'shopping_suggested.mejor_en' | t: { tienda: fila.mejorTienda }
                }}</span>
              }
              <span class="sug__precio">{{
                fila.precioEstimadoMinor !== null
                  ? ('shopping_suggested.total' | t: { total: euros(fila.precioEstimadoMinor) })
                  : ('shopping_suggested.sin_precio' | t)
              }}</span>
            </li>
          }
        </ul>
        @if (restantes() > 0) {
          <span class="sug__mas">{{
            'shopping_suggested.y_n_mas' | t: { n: restantes() }
          }}</span>
        }
        @if (totalMinor() !== null) {
          <span class="sug__total" data-test="sugerida-total">{{
            'shopping_suggested.total' | t: { total: euros(totalMinor()!) }
          }}</span>
        }
        @if (listaAbierta(); as abierta) {
          <p class="sug__abierta" data-test="sugerida-abierta">{{
            'shopping_suggested.lista_abierta' | t: { n: abierta.itemsPendientes }
          }}</p>
        }
      }
    </section>
  `,
  styles: [
    `
      .sug {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
        padding: var(--space-4, 16px);
        border: 1px solid var(--border-strong, #e5e7eb);
        border-radius: var(--radius-lg, 14px);
        background: var(--bg-secondary, #fff);
      }

      .sug__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-3, 12px);
        flex-wrap: wrap;
      }

      .sug__titulo {
        margin: 0;
        font-size: var(--text-lg, 18px);
        font-weight: 600;
        color: var(--text-primary, #111);
      }

      .sug__subtitulo {
        margin: var(--space-1, 4px) 0 0;
        font-size: var(--text-sm, 14px);
        color: var(--text-tertiary, #666);
        max-width: 56ch;
      }

      .sug__carga {
        margin: 0;
        color: var(--text-tertiary, #666);
      }

      .sug__vacio {
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 4px);
        font-size: var(--text-sm, 14px);
        color: var(--text-secondary, #444);
      }

      .sug__vacio-hint {
        color: var(--text-tertiary, #666);
      }

      .sug__lista {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .sug__fila {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        flex-wrap: wrap;
        font-size: var(--text-sm, 14px);
      }

      .sug__nombre {
        font-weight: 500;
        color: var(--text-primary, #111);
      }

      .sug__cantidad {
        color: var(--text-secondary, #444);
        font-variant-numeric: tabular-nums;
      }

      .sug__tienda {
        color: var(--text-tertiary, #666);
      }

      .sug__precio {
        margin-left: auto;
        color: var(--text-secondary, #444);
        font-variant-numeric: tabular-nums;
      }

      .sug__mas,
      .sug__total {
        font-size: var(--text-sm, 14px);
        color: var(--text-tertiary, #666);
      }

      .sug__total {
        font-weight: 600;
        color: var(--text-primary, #111);
      }

      .sug__abierta {
        margin: 0;
        padding: var(--space-2, 8px) var(--space-3, 12px);
        border-radius: var(--radius-md, 10px);
        background: var(--bg-primary, #f5f5f5);
        font-size: var(--text-sm, 14px);
        color: var(--text-secondary, #444);
      }
    `
  ]
})
export class ShoppingSuggestedComponent implements OnInit {
  readonly shopping = inject(ShoppingService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  /** Aviso a la bandeja: la lista acaba de nacer o de refrescarse. */
  readonly aplicada = output<void>();

  readonly trabajando = signal(false);
  protected readonly MOTIVO_CLAVE = MOTIVO_CLAVE;

  readonly filas = computed<SugerenciaRow[]>(() => this.shopping.sugerencia()?.sugerencias ?? []);
  readonly listaAbierta = computed(() => this.shopping.sugerencia()?.lista ?? null);
  readonly primeras = computed(() => this.filas().slice(0, FILAS_VISIBLES));
  readonly restantes = computed(() => Math.max(0, this.filas().length - FILAS_VISIBLES));
  readonly totalMinor = computed(() =>
    this.filas().reduce(
      (suma, fila) => (fila.precioEstimadoMinor !== null ? suma + fila.precioEstimadoMinor : suma),
      0
    )
  );
  /** Con lista abierta y nada nuevo que decir, la tarjeta solo ensena el estado y el boton. */
  readonly sePuedeAplicar = computed(() => this.filas().length > 0 || this.listaAbierta() !== null);

  ngOnInit(): void {
    this.shopping.cargarSugerencia();
  }

  varianteDe(fila: SugerenciaRow): 'error' | 'warning' | 'primary' | 'neutral' {
    return MOTIVO_VARIANTE[fila.motivo];
  }

  /** 660 -> «6,60 €»: el dinero de la app es espanol hasta en el separador. */
  euros(minor: number): string {
    return `${(minor / 100).toFixed(2).replace('.', ',')} €`;
  }

  async aplicar(): Promise<void> {
    if (this.trabajando()) return;
    this.trabajando.set(true);
    const resultado = await this.shopping.aplicarSugerida();
    this.trabajando.set(false);
    if (!resultado) return; // el toast del error ya lo ha dicho el service
    const actualizo = !resultado.creada;
    this.toast.success(
      this.i18n.t(actualizo ? 'shopping_suggested.actualizada_ok' : 'shopping_suggested.creada_ok'),
      this.i18n.t('shopping_suggested.n_lineas', { n: resultado.sugeridos })
    );
    this.aplicada.emit();
  }
}
