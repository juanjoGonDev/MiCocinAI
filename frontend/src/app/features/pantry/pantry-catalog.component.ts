import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { PantryService } from '../../core/services/pantry.service';
import { ToastService } from '../../core/services/toast.service';
import { I18nService } from '../../core/services/i18n.service';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { pantryCategoryLabel } from '../../core/i18n/labels';
import { IconComponent } from '../../shared/components/ui/icon/icon.component';
import { InputComponent } from '../../shared/components/ui/input/input.component';
import { PickerComponent, type PickerOption } from '../../shared/components/ui/picker/picker.component';
import {
  DataTableComponent,
  DataTableCellDirective
} from '../../shared/components/ui/data-table/data-table.component';
import type { DataTableColumna } from '../../shared/components/ui/data-table/data-table.types';
import type { PantryCatalogCategory, PantryCatalogProduct } from '../../shared/models/pantry.model';
import { cargarTodasLasPaginas, clavesSubarbolDe, coincideGestor, colorDeCategoria, valorDeQuery } from './pantry-gestor.util';

/**
 * El visor del catálogo pre-registrado (HOGARIA-SPEC ## 12aa, tabla en la ## 12ac).
 *
 * La idea que da forma a esta pantalla es que **el catálogo no es una lista para mirar, es una para tocar**:
 * cuatro pasillos troncales, decenas de hojas y cerca de un millar de filas no se recorren de arriba abajo,
 * se filtran y se añaden con un clic desde la propia fila. Tres cosas cambian con la tanda 31, y las tres
 * persiguen lo mismo:
 *
 *  - **la lista es `app-data-table`**: orden por columna con Shift, menús de filtro estilo Excel, paginación
 *    y selección múltiple gratis;
 *  - **el conjunto completo, en cliente**: la pantalla carga TODAS las filas del catálogo (de 100 en 100,
 *    con el tope del visor) y busca/filtra sobre ellas —filtrar la página de 24 de antes era exactamente la
 *    mentira que la casa corrigió en el visor (## 12ab)—;
 *  - **el riel de pasillos se minimiza**: se convierte en el mismo `app-picker` del filtro de categorías del
 *    inventario, con la cuenta del subárbol y el color del pasillo.
 *
 * Lo que no cambia es el alma de la pantalla: **añadir no compra nada** —la fila deja el producto en casa con
 * una unidad y la propia fila avisa en cuanto eso ya ha pasado (`inHousehold`, por clave, no por parecidos)—,
 * el pasillo padre sigue respondiendo por todo su subárbol, y el estado (`?q=`, `?cat=`) viaja en la URL. La
 * página server-side (`?offset=`) queda jubilada: la tabla pagina en cliente.
 */
@Component({
  selector: 'app-pantry-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, IconComponent, InputComponent, PickerComponent, DataTableComponent, DataTableCellDirective],
  template: `
    <div class="gestor">
      <header class="gestor__header">
        <button type="button" class="gestor__back" (click)="volver()" data-test="catalogo-volver">
          <app-icon name="chevron_left" [size]="20" [label]="null" />
          <span>{{ 'pantry.volver_al_inventario' | t }}</span>
        </button>
        <h1 class="gestor__title">{{ 'pantry.catalogo_titulo' | t }}</h1>
        <p class="gestor__ayuda">{{ 'pantry.catalogo_ayuda' | t }}</p>
      </header>

      <section class="gestor__toolbar">
        <app-input
          class="gestor__buscar"
          id="catalogo-q"
          name="catalogo-q"
          type="search"
          [placeholder]="'pantry.catalogo_buscar' | t"
          [ngModel]="q()"
          (ngModelChange)="escribirBusqueda($event)"
          data-test="catalogo-q"
        ></app-input>
        <div class="toolbar__picker">
          <app-picker
            [options]="opcionesPasillo()"
            [value]="cat()"
            [placeholder]="'pantry.catalogo_todas' | t"
            [label]="'pantry.catalogo_pasillos' | t"
            data-test="catalogo-filtro-pasillo"
            (valueChange)="elegirPasillo($event)"
          />
        </div>
        <button
          type="button"
          class="gestor__nueva"
          [disabled]="guardando || anadibles().length === 0"
          (click)="anadirFiltrados()"
          data-test="catalogo-anadir-filtrados"
        >
          <app-icon name="add_shopping_cart" [size]="18" [label]="null" />
          <span>{{ 'pantry.catalogo_anadir_filtrados' | t: { n: anadibles().length } }}</span>
        </button>
      </section>

      @if (error) {
        <p class="gestor__estado gestor__estado--error" role="alert" data-test="catalogo-error">{{ error }}</p>
      }

      @if (cargando) {
        <p class="gestor__estado">{{ 'common.loading' | t }}</p>
      } @else if (lista().length === 0) {
        <p class="gestor__estado" data-test="catalogo-vacia">{{ 'pantry.catalogo_vacio' | t }}</p>
      } @else {
        <p class="lista__cifra" data-test="catalogo-resultados">{{ 'pantry.catalogo_resultados' | t: { n: resultado().length } }}</p>
        <app-data-table
          #tablaCat
          data-test="catalogo-tabla"
          [filas]="filtradas()"
          [columnas]="columnas()"
          [seleccionable]="true"
          [etiquetaDeFila]="etiquetaFila"
          (seleccionChange)="seleccion.set($event)"
          (resultadoChange)="resultado.set($event)"
        >
          <div data-tabla-lote>
            @if (seleccion().length > 0) {
              <div class="lote" data-test="catalogo-lote">
                <span class="lote__cta">{{ 'pantry.seleccionados' | t: { n: seleccion().length } }}</span>
                <span class="lote__acciones">
                  <button type="button" class="lote__btn" (click)="anadirSeleccion()" data-test="catalogo-lote-anadir">
                    {{ 'pantry.catalogo_anadir' | t }}
                  </button>
                  <button type="button" class="lote__btn" (click)="loteAnular()" data-test="catalogo-lote-anular">
                    {{ 'pantry.lote_anular' | t }}
                  </button>
                </span>
              </div>
            }
          </div>

          <ng-template appDataTableCell="nombre" let-fila>
            <span class="celda celda--nombre">
              <span class="celda__punto" [style.background]="colorDe(fila)" aria-hidden="true"></span>
              {{ fila.name }}
            </span>
          </ng-template>

          <ng-template appDataTableCell="pasillo" let-fila>
            <span class="celda celda--pasillo">
              <span class="celda__punto" [style.background]="colorDe(fila)" aria-hidden="true"></span>
              {{ etiquetaPasillo(fila.category) }}
            </span>
          </ng-template>

          <ng-template appDataTableCell="acciones" let-fila>
            @if (fila.inHousehold) {
              <span class="celda__en-casa" data-test="catalogo-en-casa">
                <app-icon name="check_circle" [size]="18" [label]="null" />
                <span>{{ 'pantry.catalogo_en_casa' | t }}</span>
              </span>
            } @else {
              <button
                type="button"
                class="celda__accion"
                [attr.aria-label]="'pantry.catalogo_anadir' | t"
                [attr.title]="'pantry.catalogo_anadir' | t"
                [disabled]="guardando"
                (click)="anadir(fila)"
                [attr.data-test]="'catalogo-anadir-' + fila.id"
              >
                <app-icon name="add" [size]="18" [label]="null" />
              </button>
            }
          </ng-template>
        </app-data-table>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    /* Mismo contenedor que los dos gestores vecinos: al cambiar de pantalla nada salta de ancho. */
    .gestor {
      display: flex; flex-direction: column; gap: var(--space-4);
      box-sizing: border-box; width: 100%; max-width: 1000px; margin: 0 auto;
      padding: var(--space-4) var(--space-4) var(--space-16);
    }
    @media (min-width: 768px) {
      .gestor { gap: var(--space-6); padding: var(--space-6) var(--space-6) var(--space-20); }
    }

    .gestor__header {
      display: flex; flex-direction: column; gap: var(--space-1);
      padding-bottom: var(--space-4); border-bottom: 1px solid var(--border-default);
    }
    .gestor__back {
      display: inline-flex; align-items: center; gap: var(--space-1);
      align-self: flex-start; margin: 0 0 var(--space-2); padding: var(--space-1) var(--space-2) var(--space-1) 0;
      font: inherit; font-size: var(--text-xs); color: var(--text-secondary);
      background: none; border: none; border-radius: var(--radius-sm); cursor: pointer;
      transition: var(--transition-fast);
    }
    .gestor__back:hover { color: var(--text-primary); }
    .gestor__back:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .gestor__title {
      margin: 0; font-family: var(--font-display); font-size: var(--text-xl);
      font-weight: var(--font-bold); line-height: var(--leading-tight); letter-spacing: var(--tracking-tight);
      color: var(--text-primary);
    }
    .gestor__ayuda { margin: 0; max-width: 62ch; font-size: var(--text-sm); line-height: var(--leading-relaxed); color: var(--text-secondary); }

    .gestor__toolbar {
      display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-3) var(--space-4);
    }
    .gestor__buscar { flex: 1 1 280px; min-width: 0; }
    /* El pasillo minimizado (## 12ac): el mismo picker del filtro de categorias del visor, no un riel. */
    .toolbar__picker { flex: 0 1 280px; min-width: 200px; }
    .gestor__nueva {
      display: inline-flex; align-items: center; gap: var(--space-1);
      padding: var(--space-2) var(--space-4); font: inherit; font-size: var(--text-sm); font-weight: var(--font-semibold);
      color: var(--bg-secondary); background: var(--primary);
      border: none; border-radius: var(--radius-full); cursor: pointer;
      transition: var(--transition-fast); white-space: nowrap;
    }
    .gestor__nueva:hover:not(:disabled) { background: var(--primary-dark); }
    .gestor__nueva:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .gestor__nueva:disabled { opacity: 0.45; cursor: not-allowed; }

    .lista__cifra { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
    .gestor__estado {
      margin: 0; padding: var(--space-6); text-align: center; font-size: var(--text-sm); color: var(--text-secondary);
      background: var(--bg-secondary); border: 1px dashed var(--border-default); border-radius: var(--radius-xl);
    }
    .gestor__estado--error { color: var(--error); border-color: var(--error); border-style: solid; }

    .celda--nombre { display: inline-flex; align-items: center; gap: var(--space-2); font-weight: var(--font-semibold); color: var(--text-primary); }
    .celda--pasillo { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--text-secondary); }
    .celda__punto { flex: none; width: 8px; height: 8px; border-radius: var(--radius-full); }
    .celda__en-casa {
      display: inline-flex; align-items: center; gap: var(--space-1);
      font-size: var(--text-xs); color: var(--success); background: var(--success-subtle);
      border-radius: var(--radius-full); padding: 2px var(--space-2); white-space: nowrap;
    }
    .celda__accion {
      display: grid; place-items: center; width: 36px; height: 36px; padding: 0; margin-inline-start: auto;
      color: var(--text-secondary); background: none; border: none; cursor: pointer; border-radius: var(--radius-md);
      transition: var(--transition-fast);
    }
    .celda__accion:hover:not(:disabled) { color: var(--primary); background: color-mix(in srgb, var(--primary) 10%, transparent); }
    .celda__accion:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .celda__accion:disabled { opacity: 0.35; cursor: not-allowed; }

    /* El lote (## 12ac): la barra de acciones sobre la seleccion, anclada en la cabecera de la tabla. */
    .lote {
      display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
      flex-wrap: wrap; padding: var(--space-2) var(--space-3);
      background: var(--primary-subtle); border-radius: var(--radius-md);
    }
    .lote__cta { font-size: var(--text-xs); font-weight: var(--font-semibold); color: var(--text-primary); }
    .lote__acciones { display: flex; gap: var(--space-2); flex-wrap: wrap; }
    .lote__btn {
      font: inherit; font-size: var(--text-xs); padding: 6px 12px; cursor: pointer;
      background: var(--bg-primary); color: var(--text-primary);
      border: 1px solid var(--border-default); border-radius: var(--radius-md);
      transition: var(--transition-fast);
    }
    .lote__btn:hover { border-color: var(--primary); }
    .lote__btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    @media (max-width: 959px) {
      /* En movil el lote se queda pegado abajo: la seleccion no puede desaparecer al recorrer la lista. */
      .lote { position: sticky; bottom: var(--space-2); box-shadow: var(--shadow-md); }
    }
  `]
})
export class PantryCatalogComponent implements OnInit {
  private readonly pantry = inject(PantryService);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** El catalogo completo en memoria: ~un millar de filas, todas leidas de una vez (## 12ac). */
  protected readonly lista = signal<PantryCatalogProduct[]>([]);
  protected readonly catalogo = signal<PantryCatalogCategory[]>([]);
  protected readonly q = signal('');
  protected readonly cat = signal('');
  protected readonly seleccion = signal<readonly unknown[]>([]);
  /** Lo que la tabla deja en pie tras sus propios menus: la cuenta del boton de lote y del pie. */
  protected readonly resultado = signal<readonly unknown[]>([]);
  protected cargando = true;
  protected guardando = false;
  protected error = '';

  private readonly tablaCat = viewChild<DataTableComponent>('tablaCat');

  /** Las filas del conjunto, por pasillo (subarbol) y por busqueda normalizada. El resto lo ve la tabla. */
  protected readonly filtradas = computed<PantryCatalogProduct[]>(() => {
    const consulta = this.q();
    const raiz = this.cat();
    let filas = this.lista();
    if (raiz) {
      const permitidas = clavesSubarbolDe(this.catalogo().map((c) => ({ key: c.key, parentKey: c.parent })), raiz);
      filas = filas.filter((fila) => permitidas.has(fila.category));
    }
    if (consulta.trim()) filas = filas.filter((fila) => coincideGestor([fila.name], consulta));
    return filas;
  });

  /** Lo que el boton de pantalla puede añadir de verdad: sin lo que ya es de la casa. */
  protected readonly anadibles = computed<PantryCatalogProduct[]>(() =>
    (this.resultado() as PantryCatalogProduct[]).filter((fila) => !fila.inHousehold)
  );

  /** El picker del pasillo: «Todos», los troncales con su suma y las hojas agrupadas bajo su padre. */
  protected readonly opcionesPasillo = computed<PickerOption[]>(() => {
    this.i18n.changeTick();
    const filas = this.catalogo();
    const cuentaViva = (clave: string): number => {
      if (filas.length === 0) return 0;
      const permitidas = clavesSubarbolDe(filas.map((c) => ({ key: c.key, parentKey: c.parent })), clave);
      return this.lista().filter((fila) => permitidas.has(fila.category)).length;
    };
    const etiqueta = (fila: PantryCatalogCategory): string =>
      pantryCategoryLabel({ key: fila.key, name: fila.name }, (k) => this.i18n.t(k));
    const opciones: PickerOption[] = [{ value: '', label: this.i18n.t('pantry.catalogo_todas') }];
    for (const padre of filas.filter((fila) => fila.parent === null)) {
      opciones.push({
        value: padre.key,
        label: `${etiqueta(padre)} · ${cuentaViva(padre.key) || padre.productCount}`,
        color: padre.color
      });
    }
    for (const hoja of filas.filter((fila) => fila.parent !== null)) {
      const padre = filas.find((fila) => fila.key === hoja.parent);
      opciones.push({
        value: hoja.key,
        label: `${etiqueta(hoja)}`,
        color: hoja.color,
        group: padre ? etiqueta(padre) : undefined
      });
    }
    return opciones;
  });

  protected readonly columnas = computed<DataTableColumna[]>(() => {
    this.i18n.changeTick();
    return [
      { clave: 'name', etiqueta: this.i18n.t('pantry.columna_nombre'), celda: 'nombre' },
      {
        clave: 'category', etiqueta: this.i18n.t('pantry.columna_pasillo'), celda: 'pasillo',
        etiquetaValor: (v) => this.etiquetaPasillo(String(v))
      },
      { clave: 'unit', etiqueta: this.i18n.t('pantry.unidad') },
      { clave: 'acciones', etiqueta: this.i18n.t('pantry.acciones'), celda: 'acciones', ordenable: false, filtrable: false, alineacion: 'end', ancho: '64px' }
    ];
  });

  protected readonly etiquetaFila = (fila: unknown): string => (fila as PantryCatalogProduct).name ?? '';

  ngOnInit(): void {
    // El estado viajero es la query; la pagina server-side murio con la tabla, y con ella `?offset=`.
    const query = this.route.snapshot.queryParamMap;
    this.cat.set(valorDeQuery(query, 'cat', null, ''));
    this.q.set(valorDeQuery(query, 'q', null, ''));
    void this.pantry.listCatalogCategories().then((filas) => this.catalogo.set(filas));
    void this.cargar();
  }

  protected colorDe(fila: PantryCatalogProduct): string {
    return colorDeCategoria(this.catalogo().find((cat) => cat.key === fila.category));
  }

  protected etiquetaPasillo(clave: string): string {
    const fila = this.catalogo().find((cat) => cat.key === clave);
    return pantryCategoryLabel(fila ?? { key: clave }, (k) => this.i18n.t(k));
  }

  /** Carga el catalogo entero de 100 en 100: la tabla filtra y ordena sobre el conjunto, no sobre una pagina. */
  private async cargar(): Promise<void> {
    this.cargando = true;
    this.error = '';
    const filas = await cargarTodasLasPaginas<PantryCatalogProduct>(
      (offset, tamano) => this.pantry.listCatalog({ limit: tamano, offset }),
      100,
      2000
    );
    if (filas === null) {
      this.error = this.i18n.t('ui.ha_ocurrido_un_error');
      this.lista.set([]);
    } else {
      this.lista.set(filas);
    }
    this.cargando = false;
  }

  protected escribirBusqueda(valor: string): void {
    this.q.set(valor ?? '');
    void this.escribirUrl();
  }

  protected elegirPasillo(valor: string | null): void {
    this.cat.set(valor ?? '');
    void this.escribirUrl();
  }

  private async escribirUrl(): Promise<void> {
    await this.router.navigate(['.'], {
      relativeTo: this.route,
      queryParams: { cat: this.cat() || null, q: this.q().trim() || null },
      replaceUrl: true
    });
  }

  protected anadir(fila: PantryCatalogProduct): void {
    void this.anadirIds([fila.id], fila.name);
  }

  protected anadirFiltrados(): void {
    void this.anadirIds(this.anadibles().map((fila) => fila.id));
  }

  protected anadirSeleccion(): void {
    const ids = (this.seleccion() as PantryCatalogProduct[]).filter((fila) => !fila.inHousehold).map((fila) => fila.id);
    void this.anadirIds(ids);
  }

  protected loteAnular(): void {
    this.seleccion.set([]);
    this.tablaCat()?.limpiarSeleccion();
  }

  /**
   * El alta es siempre el mismo POST, con un id o con el lote: `added`/`skipped` los decide el server, que es
   * quien sabe si la ficha ya existía con cero unidades (sube a 1, cuenta como añadido) o con stock (se
   * respeta, cuenta como saltado). Aquí solo se traduce ese par de números al aviso.
   */
  private async anadirIds(ids: string[], nombre?: string): Promise<void> {
    if (ids.length === 0) return;
    this.guardando = true;
    const resultado = await this.pantry.addFromCatalog(ids);
    this.guardando = false;
    if (!resultado.ok) {
      this.error = resultado.message || this.i18n.t('ui.ha_ocurrido_un_error');
      return;
    }
    const { added, skipped } = resultado.data;
    if (added > 0) {
      const detalle = skipped > 0 ? ` · ${this.i18n.t(skipped === 1 ? 'pantry.catalogo_ya_estaba' : 'pantry.catalogo_ya_estaban', { n: skipped })}` : '';
      const titulo = added === 1 && nombre
        ? `${nombre} — ${this.i18n.t('pantry.catalogo_anadido')}`
        : this.i18n.t(added === 1 ? 'pantry.catalogo_anadido' : 'pantry.catalogo_anadidos', { n: added });
      this.toast.success(titulo, detalle ? detalle.slice(3) : this.i18n.t('pantry.catalogo_ayuda'));
      // Las categorias de la casa acaban de poder cambiar (una hoja nueva y su padre); el inventario que se
      // vea al volver tiene que traerlas, y `loadCategories` es la cache compartida de ambas pantallas.
      this.pantry.loadCategories(true);
      this.loteAnular();
      await this.cargar();
    } else {
      this.toast.info(this.i18n.t(skipped === 1 ? 'pantry.catalogo_ya_estaba' : 'pantry.catalogo_ya_estaban', { n: skipped }), this.i18n.t('pantry.catalogo_nada_que_anadir'));
      this.loteAnular();
      await this.cargar();
    }
  }

  protected async volver(): Promise<void> {
    await this.router.navigate(['/pantry']);
  }
}
