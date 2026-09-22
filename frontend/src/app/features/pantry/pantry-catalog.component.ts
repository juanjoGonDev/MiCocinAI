import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { PantryService } from '../../core/services/pantry.service';
import { ToastService } from '../../core/services/toast.service';
import { I18nService } from '../../core/services/i18n.service';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { IconComponent } from '../../shared/components/ui/icon/icon.component';
import { InputComponent } from '../../shared/components/ui/input/input.component';
import { PantryCategoryLabelPipe } from '../../shared/pipes/pantry-category-label.pipe';
import { colorDeCategoria, offsetDeQuery, valorDeQuery } from './pantry-gestor.util';
import type { PantryCatalogCategory, PantryCatalogProduct } from '../../shared/models/pantry.model';

/**
 * El visor del catálogo pre-registrado (HOGARIA-SPEC ## 12aa).
 *
 * La idea que da forma a esta pantalla es que **el catálogo no es una lista para mirar, es una para tocar**:
 * cuarenta y siete pasillos y cuatrocientas setenta y una filas no se recorren de arriba abajo, se filtran por
 * pasillo y se añade con un clic desde la propia fila. De ahí las tres decisiones que la distinguen del gestor
 * de productos:
 *
 *  - **añadir no compra nada.** La fila del catálogo que se toca deja el producto en el inventario con una
 *    unidad, y la propia fila avisa en cuanto eso ya ha pasado: `inHousehold` viene del server por clave, así
 *    que «Leche entera» en casa apaga el botón de «Leche entera» en el catálogo pero no el de «Leche
 *    semidesnatada»;
 *  - **el pasillo padre filtra su subárbol.** Tocarlo no es una decoración del rail: el server responde todas
 *    sus hojas, y por eso el conteo del padre es la suma de las hijas —rail y lista cuentan igual—;
 *  - **el estado viaja en la URL** (`?cat=&q=&offset=`), como en los dos gestores: un F5 o compartir el enlace
 *    de «Lacteos» tiene que volver a pintar «Lacteos».
 *
 * PC y móvil compiten por el mismo DOM: el rail de pasillos es scroller horizontal en móvil y columna de
 * grupos en escritorio, y la fila pasa de dos líneas a tres columnas cuadradas a partir de 860px —mismo
 * criterio que las listas del gestor—.
 */
@Component({
  selector: 'app-pantry-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, IconComponent, InputComponent, PantryCategoryLabelPipe],
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

      <div class="cuerpo">
      <nav class="pasillos" [attr.aria-label]="'pantry.catalogo_pasillos' | t" data-test="catalogo-pasillos">
        <button
          type="button"
          class="pasillo"
          [class.pasillo--activa]="cat === ''"
          (click)="filtrar('')"
          data-test="catalogo-filtro-todas"
        >
          <app-icon name="storefront" [size]="16" [label]="null" />
          <span>{{ 'pantry.catalogo_todas' | t }}</span>
        </button>
        @for (grupo of grupos; track grupo.padre.key) {
          <div class="pasillo__grupo">
            <button
              type="button"
              class="pasillo pasillo--padre"
              [class.pasillo--activa]="cat === grupo.padre.key"
              (click)="filtrar(grupo.padre.key)"
              [attr.data-test]="'catalogo-filtro-' + grupo.padre.key"
            >
              <span class="pasillo__punto" [style.background]="grupo.padre.color" aria-hidden="true"></span>
              <span class="pasillo__nombre">{{ grupo.padre.name | category }}</span>
              <span class="pasillo__cuenta">{{ grupo.total }}</span>
            </button>
            @for (hoja of grupo.hijas; track hoja.key) {
              <button
                type="button"
                class="pasillo pasillo--hoja"
                [class.pasillo--activa]="cat === hoja.key"
                (click)="filtrar(hoja.key)"
                [attr.data-test]="'catalogo-filtro-' + hoja.key"
              >
                <span class="pasillo__punto" [style.background]="hoja.color" aria-hidden="true"></span>
                <span class="pasillo__nombre">{{ hoja.name | category }}</span>
                <span class="pasillo__cuenta">{{ hoja.productCount }}</span>
              </button>
            }
          </div>
        }
      </nav>

      <div class="trabajo">
      <section class="gestor__toolbar">
        <app-input
          class="gestor__buscar"
          id="catalogo-q"
          name="catalogo-q"
          type="search"
          [placeholder]="'pantry.catalogo_buscar' | t"
          [(ngModel)]="q"
          (ngModelChange)="buscar()"
          data-test="catalogo-q"
        ></app-input>
        <button
          type="button"
          class="gestor__nueva"
          [disabled]="guardando || paginables === 0"
          (click)="anadirVisibles()"
          data-test="catalogo-anadir-visibles"
        >
          <app-icon name="add_shopping_cart" [size]="18" [label]="null" />
          <span>{{ 'pantry.catalogo_anadir_visibles' | t: { n: paginables } }}</span>
        </button>
      </section>

      @if (error) {
        <p class="gestor__estado gestor__estado--error" role="alert" data-test="catalogo-error">{{ error }}</p>
      }

      @if (cargando) {
        <p class="gestor__estado">{{ 'common.loading' | t }}</p>
      } @else if (lista.length === 0) {
        <p class="gestor__estado" data-test="catalogo-vacia">{{ 'pantry.catalogo_vacio' | t }}</p>
      } @else {
        <p class="lista__cifra" data-test="catalogo-resultados">{{ 'pantry.catalogo_resultados' | t: { n: total } }}</p>
        <ul class="lista">
          @for (fila of lista; track fila.id) {
            <li class="fila" [attr.data-test]="'catalogo-fila-' + fila.id">
              <div class="fila__cuerpo">
                <!-- El punto va pegado al nombre, como en el gestor: es el pasillo pintado, no un adorno. -->
                <span class="fila__nombre">
                  <span class="fila__punto" [style.background]="colorDe(fila)" aria-hidden="true"></span>
                  {{ fila.name }}
                </span>
                <span class="fila__meta">
                  <span class="fila__categoria">{{ fila.categoryLabel | category }}</span>
                  <span class="fila__unidad">{{ fila.unit }}</span>
                </span>
              </div>
              @if (fila.inHousehold) {
                <span class="fila__en-casa" data-test="catalogo-en-casa">
                  <app-icon name="check_circle" [size]="18" [label]="null" />
                  <span>{{ 'pantry.catalogo_en_casa' | t }}</span>
                </span>
              } @else {
                <button
                  type="button"
                  class="fila__accion"
                  [attr.aria-label]="'pantry.catalogo_anadir' | t"
                  [attr.title]="'pantry.catalogo_anadir' | t"
                  [disabled]="guardando"
                  (click)="anadir(fila)"
                  [attr.data-test]="'catalogo-anadir-' + fila.id"
                >
                  <app-icon name="add" [size]="18" [label]="null" />
                </button>
              }
            </li>
          }
        </ul>

        <nav class="paginador">
          <button type="button" (click)="mover(-1)" [disabled]="offset === 0" data-test="catalogo-anterior">
            {{ 'common.anterior' | t }}
          </button>
          <span class="paginador__cifra">{{ rango }} / {{ total }}</span>
          <button type="button" (click)="mover(1)" [disabled]="offset + limit >= total" data-test="catalogo-siguiente">
            {{ 'pantry.siguiente' | t }}
          </button>
        </nav>
      }
      </div>
      </div>
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

    .gestor__toolbar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-3); }
    .gestor__buscar { flex: 1 1 240px; min-width: 0; }
    .gestor__nueva {
      display: inline-flex; align-items: center; gap: var(--space-2);
      padding: var(--space-2) var(--space-4); font: inherit; font-size: var(--text-sm); font-weight: var(--font-semibold);
      color: var(--bg-secondary); background: var(--primary); border: 1px solid transparent;
      border-radius: var(--radius-full); cursor: pointer; transition: var(--transition-fast); white-space: nowrap;
    }
    .gestor__nueva:hover:not(:disabled) { filter: brightness(1.06); }
    .gestor__nueva:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .gestor__nueva:disabled { opacity: 0.45; cursor: not-allowed; }

    /* PC y movil del mismo DOM (## 12aa, spec D): por debajo de 960px, el grupo es display:contents y sus
       dos piezas se convierten en píldoras dentro de un scroller horizontal; a partir de 960px, el cuerpo se
       abre en dos columnas y el rail se queda a la izquierda —sticky, con su propio scroll— como una lista de
       seis microetiquetas con las hojas sangradas debajo. */
    .cuerpo { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }
    @media (min-width: 960px) {
      .cuerpo { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: var(--space-6); align-items: start; }
    }
    .trabajo { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }

    .pasillos {
      display: flex; flex-wrap: nowrap; gap: var(--space-2);
      overflow-x: auto; scrollbar-width: thin; -webkit-overflow-scrolling: touch; padding-bottom: 2px;
    }
    .pasillo {
      display: inline-flex; align-items: center; gap: var(--space-2); flex: none; min-height: 36px;
      padding: var(--space-2) var(--space-3); font: inherit; font-size: var(--text-sm);
      color: var(--text-secondary); background: var(--bg-secondary);
      border: 1px solid var(--border-default); border-radius: var(--radius-full); cursor: pointer;
      transition: var(--transition-fast); white-space: nowrap;
    }
    .pasillo:hover { border-color: var(--border-strong); background: var(--bg-tertiary); color: var(--text-primary); }
    .pasillo:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .pasillo--activa { color: var(--primary); border-color: var(--primary); background: color-mix(in srgb, var(--primary) 8%, var(--bg-secondary)); }
    .pasillo__punto { flex: none; width: 10px; height: 10px; border-radius: var(--radius-full); }
    .pasillo__nombre { overflow: hidden; text-overflow: ellipsis; }
    .pasillo__cuenta { font-variant-numeric: tabular-nums; font-size: var(--text-xs); color: var(--text-tertiary); }
    .pasillo__grupo { display: contents; }
    @media (min-width: 960px) {
      .pasillos {
        display: flex; flex-direction: column; flex-wrap: nowrap; align-items: stretch; overflow: auto;
        position: sticky; top: var(--space-4); max-height: calc(100vh - var(--space-16)); gap: var(--space-1);
        padding: var(--space-3); background: var(--bg-secondary);
        border: 1px solid var(--border-default); border-radius: var(--radius-xl);
      }
      .pasillo__grupo { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .pasillo__grupo + .pasillo__grupo { margin-top: var(--space-2); }
      .pasillos .pasillo { border-color: transparent; background: none; justify-content: flex-start; }
      .pasillo--padre {
        font-size: var(--text-xs); font-weight: var(--font-bold); text-transform: uppercase; letter-spacing: 0.04em;
        color: var(--text-tertiary);
      }
      .pasillo--padre:hover { color: var(--text-primary); }
      .pasillo--padre.pasillo--activa { color: var(--primary); background: color-mix(in srgb, var(--primary) 8%, transparent); }
      .pasillo--hoja { padding-left: var(--space-6); font-size: var(--text-sm); min-height: 32px; }
      .pasillo__nombre { overflow: hidden; text-overflow: ellipsis; }
    }

    .lista__cifra { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }

    .gestor__estado {
      margin: 0; padding: var(--space-6); text-align: center; font-size: var(--text-sm); color: var(--text-secondary);
      background: var(--bg-secondary); border: 1px dashed var(--border-default); border-radius: var(--radius-xl);
    }
    .gestor__estado--error { color: var(--error); border-color: var(--error); border-style: solid; }

    /* Una sola tarjeta con filas separadas por un hilo, igual que en los gestores: el ojo recorre la columna
       sin perder el sitio. */
    .lista {
      display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none;
      background: var(--bg-secondary); border: 1px solid var(--border-default);
      border-radius: var(--radius-xl); overflow: hidden;
    }
    .fila {
      display: flex; align-items: stretch; gap: 0;
      border-bottom: 1px solid var(--border-default); transition: var(--transition-fast);
    }
    .fila:last-child { border-bottom: none; }
    .fila:hover { background: color-mix(in srgb, var(--bg-tertiary) 55%, transparent); }
    .fila__cuerpo {
      flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; align-items: flex-start;
      gap: var(--space-1); padding: var(--space-3) var(--space-4);
    }
    .fila__nombre { display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); font-weight: var(--font-semibold); color: var(--text-primary); min-width: 0; }
    .fila__meta { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); font-size: var(--text-xs); color: var(--text-secondary); }
    .fila__punto { flex: none; width: 8px; height: 8px; border-radius: var(--radius-full); }
    .fila__unidad { padding: 1px var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-full); font-variant-numeric: tabular-nums; }
    .fila__en-casa {
      flex: none; display: inline-flex; align-items: center; gap: var(--space-1); padding: 0 var(--space-3);
      font-size: var(--text-xs); color: var(--success); background: var(--success-subtle);
      border-left: 1px solid var(--border-default);
    }
    .fila__accion {
      flex: none; display: grid; place-items: center; width: 48px; min-height: 44px; padding: 0;
      color: var(--text-secondary); background: none; border: none; cursor: pointer;
      transition: var(--transition-fast);
    }
    .fila__accion:hover:not(:disabled) { color: var(--primary); background: color-mix(in srgb, var(--primary) 10%, transparent); }
    .fila__accion:focus-visible { outline: 2px solid var(--primary); outline-offset: -3px; border-radius: var(--radius-md); }
    .fila__accion:disabled { opacity: 0.35; cursor: not-allowed; }
    @media (min-width: 860px) {
      .fila__cuerpo { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--space-6); }
    }

    .paginador {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end;
      gap: var(--space-3); padding: 0 var(--space-1);
      font-size: var(--text-sm); color: var(--text-secondary);
    }
    .paginador button {
      display: inline-flex; align-items: center; gap: var(--space-1);
      padding: var(--space-2) var(--space-3); font: inherit; font-size: var(--text-sm);
      color: var(--text-primary); background: var(--bg-secondary);
      border: 1px solid var(--border-default); border-radius: var(--radius-full); cursor: pointer;
      transition: var(--transition-fast);
    }
    .paginador button:hover:not(:disabled) { border-color: var(--border-strong); background: var(--bg-tertiary); }
    .paginador button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .paginador button:disabled { opacity: 0.45; cursor: not-allowed; }
    .paginador__cifra { font-variant-numeric: tabular-nums; }
  `]
})
export class PantryCatalogComponent implements OnInit {
  private readonly pantry = inject(PantryService);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected lista: PantryCatalogProduct[] = [];
  protected cat = '';
  protected q = '';
  protected total = 0;
  protected limit = 24;
  protected offset = 0;
  protected cargando = true;
  protected guardando = false;
  protected error = '';

  private catalogo: PantryCatalogCategory[] = [];

  /** Los seis grupos, con el conteo del padre sumado a mano para que rail y lista nunca discrepen. */
  protected get grupos(): { padre: PantryCatalogCategory; hijas: PantryCatalogCategory[]; total: number }[] {
    const padres = this.catalogo.filter((fila) => fila.parent === null);
    return padres.map((padre) => {
      const hijas = this.catalogo.filter((fila) => fila.parent === padre.key);
      const total = hijas.reduce((suma, hoja) => suma + hoja.productCount, 0);
      return { padre, hijas, total: total || padre.productCount };
    });
  }

  /** Lo que «añadir lo visible» puede añadir: la página actual sin lo que la casa ya tiene. */
  protected get paginables(): number {
    return this.lista.filter((fila) => !fila.inHousehold).length;
  }

  protected get rango(): string {
    if (this.total === 0) return '0';
    return `${this.offset + 1}-${Math.min(this.offset + this.limit, this.total)}`;
  }

  ngOnInit(): void {
    // Como en los gestores: el estado es la query, y aquí la query vuelve a ser estado (F5, enlace compartido).
    const query = this.route.snapshot.queryParamMap;
    this.cat = valorDeQuery(query, 'cat', null, '');
    this.q = valorDeQuery(query, 'q', null, '');
    this.offset = offsetDeQuery(query);
    void this.pantry.listCatalogCategories().then((filas) => {
      this.catalogo = filas;
    });
    void this.refrescar();
  }

  protected colorDe(fila: PantryCatalogProduct): string {
    return colorDeCategoria(this.catalogo.find((cat) => cat.key === fila.category));
  }

  private async refrescar(): Promise<void> {
    this.cargando = true;
    this.error = '';
    const resultado = await this.pantry.listCatalog({
      q: this.q || undefined,
      category: this.cat || undefined,
      limit: this.limit,
      offset: this.offset
    });
    if (!resultado) {
      this.error = this.i18n.t('ui.ha_ocurrido_un_error');
      this.lista = [];
      this.total = 0;
    } else {
      this.lista = resultado.data;
      this.total = resultado.meta.total;
    }
    this.cargando = false;
  }

  protected filtrar(clave: string): void {
    this.cat = clave;
    this.offset = 0;
    void this.escribirUrl();
  }

  protected buscar(): void {
    this.offset = 0;
    void this.escribirUrl();
  }

  protected mover(paso: number): void {
    const siguiente = Math.max(0, this.offset + paso * this.limit);
    if (paso > 0 && siguiente + 1 > this.total) return;
    this.offset = siguiente;
    void this.escribirUrl();
  }

  private async escribirUrl(): Promise<void> {
    await this.router.navigate(['.'], {
      relativeTo: this.route,
      queryParams: {
        cat: this.cat || null,
        q: this.q || null,
        offset: this.offset || null
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
    await this.refrescar();
  }

  protected anadir(fila: PantryCatalogProduct): void {
    void this.anadirIds([fila.id], fila.name);
  }

  protected anadirVisibles(): void {
    void this.anadirIds(this.lista.filter((fila) => !fila.inHousehold).map((fila) => fila.id));
  }

  /**
   * El alta es siempre el mismo POST, con un id o con la página entera: `added`/`skipped` los decide el server,
   * que es quien sabe si la ficha ya existía con cero unidades (sube a 1, cuenta como añadido) o con stock
   * (se respeta, cuenta como saltado). Aquí solo se traduce ese par de números al aviso.
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
      await this.refrescar();
    } else {
      this.toast.info(this.i18n.t(skipped === 1 ? 'pantry.catalogo_ya_estaba' : 'pantry.catalogo_ya_estaban', { n: skipped }), this.i18n.t('pantry.catalogo_nada_que_anadir'));
      await this.refrescar();
    }
  }

  protected async volver(): Promise<void> {
    await this.router.navigate(['/pantry']);
  }
}
