import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { PantryService } from '../../core/services/pantry.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { I18nService } from '../../core/services/i18n.service';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { IconComponent } from '../../shared/components/ui/icon/icon.component';
import { InputComponent } from '../../shared/components/ui/input/input.component';
import { TagComponent } from '../../shared/components/ui/tag/tag.component';
import { BadgeComponent } from '../../shared/components/ui/badge/badge.component';
import { PickerComponent, type PickerOption } from '../../shared/components/ui/picker/picker.component';
import { PantryCategoryLabelPipe } from '../../shared/pipes/pantry-category-label.pipe';
import { pantryCategoryLabel } from '../../core/i18n/labels';
import type { PantryCategory, PantryCategoryView } from '../../shared/models/pantry.model';
import { clavesNoElegiblesComoPadre, colorDeCategoria, offsetDeQuery, valorDeQuery } from './pantry-gestor.util';

/**
 * El gestor de categorias del inventario (HOGARIA-SPEC ## 12x).
 *
 * Es UNA pantalla con dos rutas: `pantry/categories` es la lista, `pantry/categories/:id` es la ficha (y
 * `:new`, el alta). No es un ahorro de lineas: es lo que hace que un F5 en mitad de una edicion no la tire, y
 * que el boton «atras» del navegador funcione como la gente espera. En HogarIA no habia ninguna pantalla de
 * catalogo —ni para las secciones de la cesta—, asi que el molde se lo pone esta tanda: lista filtrada y
 * paginada arriba, ficha con su impacto de borrado abajo, y todo lo que borra pasa por el dialogo de la app.
 *
 * Lo que se delega y por que:
 *  - el filtro, la busqueda y los recuentos los hace el **server** (`?view=&q=&limit=&offset=`), porque el
 *    recuento de articulos por categoria necesita la tabla entera, no lo que hay en memoria;
 *  - lo que se puede elegir como padre lo decide aqui `clavesNoElegiblesComoPadre`, para no ofrecer una opcion
 *    que el server va a rechazar con 400;
 *  - y los codigos de error se traducen aqui, no se pinta el `message` del server: el server habla en castellano
 *    porque su mensaje viaja a los logs, y la pantalla tiene que hablar en el idioma de quien la mira.
 */
@Component({
  selector: 'app-pantry-categories',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslatePipe,
    IconComponent,
    InputComponent,
    TagComponent,
    BadgeComponent,
    PickerComponent,
    PantryCategoryLabelPipe
  ],
  template: `
    <div class="gestor">
      <header class="gestor__header">
        <button type="button" class="gestor__back" (click)="volver()" data-test="gestor-categorias-volver">
          <app-icon name="chevron_left" [size]="20" [label]="null" />
          <span>{{ 'pantry.volver_al_inventario' | t }}</span>
        </button>
        <h1 class="gestor__title">{{ 'pantry.gestor_categorias' | t }}</h1>
        <p class="gestor__ayuda">{{ 'pantry.gestor_categorias_ayuda' | t }}</p>
      </header>

      @if (!ficha) {
        <section class="gestor__toolbar" data-test="gestor-categorias-lista">
          <div class="gestor__vistas">
            @for (opcion of vistas; track opcion.value) {
              <app-tag
                [selected]="view === opcion.value"
                (onClick)="cambiarVista(opcion.value)"
                [attr.data-test]="'gestor-categorias-vista-' + opcion.value"
              >
                {{ opcion.clave | t }}
              </app-tag>
            }
          </div>

          <app-input
            class="gestor__buscar"
            id="gestor-categorias-q"
            name="gestor-categorias-q"
            type="search"
            [placeholder]="'pantry.buscar_categorias' | t"
            [(ngModel)]="q"
            (ngModelChange)="buscar()"
          ></app-input>

          <button type="button" class="gestor__nueva" (click)="abrirNueva()" data-test="gestor-categorias-nueva">
            <app-icon name="add" [size]="18" [label]="null" />
            <span>{{ 'pantry.nueva_categoria' | t }}</span>
          </button>
        </section>

        @if (cargando) {
          <p class="gestor__estado">{{ 'common.loading' | t }}</p>
        } @else if (lista.length === 0) {
          <p class="gestor__estado" data-test="gestor-categorias-vacia">{{ 'pantry.categorias_vacias' | t }}</p>
        } @else {
          <ul class="lista">
            @for (fila of lista; track fila.id) {
              <li
                class="fila"
                [class.fila--anidada]="!!fila.parentKey"
                [attr.data-test]="'gestor-categorias-fila-' + fila.key"
              >
                <button type="button" class="fila__cuerpo" (click)="abrir(fila)">
                  <span class="fila__punto" [style.background]="colorDeCategoria(fila)" aria-hidden="true"></span>
                  <span class="fila__nombres">
                    <span class="fila__nombre">{{ fila | category }}</span>
                    @if (fila.parentKey) {
                      <span class="fila__padre">{{ etiquetaClave(fila.parentKey) }}</span>
                    }
                  </span>
                  <span class="fila__cifras">
                    <span class="fila__cifra">{{ cuenta(fila) }}</span>
                    @if (fila.counts.children > 0) {
                      <span class="fila__cifra fila__cifra--suave">{{ cuentaHijos(fila) }}</span>
                    }
                  </span>
                  @if (fila.protected) {
                    <app-badge [size]="'sm'">{{ 'pantry.categoria_reservada_corta' | t }}</app-badge>
                  }
                </button>
                <button
                  type="button"
                  class="fila__accion"
                  [attr.aria-label]="'pantry.eliminar_categoria' | t"
                  [attr.title]="'pantry.eliminar_categoria' | t"
                  [disabled]="!fila.canDelete"
                  (click)="borrar(fila)"
                  [attr.data-test]="'gestor-categorias-borrar-' + fila.key"
                >
                  <app-icon name="delete" [size]="18" [label]="null" />
                </button>
              </li>
            }
          </ul>

          <nav class="paginador">
            <button type="button" (click)="mover(-1)" [disabled]="offset === 0" data-test="gestor-categorias-anterior">
              {{ 'common.anterior' | t }}
            </button>
            <span class="paginador__cifra">{{ rango }} / {{ total }}</span>
            <button
              type="button"
              (click)="mover(1)"
              [disabled]="offset + limit >= total"
              data-test="gestor-categorias-siguiente"
            >
              {{ 'pantry.siguiente' | t }}
            </button>
          </nav>
        }
      } @else {
        <section class="ficha" data-test="gestor-categorias-ficha">
          <h2 class="ficha__titulo">{{ (esNueva ? 'pantry.nueva_categoria' : 'pantry.editar_categoria') | t }}</h2>
          @if (ficha.protected) {
            <p class="ficha__aviso" data-test="gestor-categorias-reservada">
              <app-icon name="error_outline" [size]="16" [label]="null" />
              <span>{{ 'pantry.categoria_reservada' | t }}</span>
            </p>
          }

          <app-input
            id="gestor-categoria-nombre"
            name="gestor-categoria-nombre"
            type="text"
            [label]="'pantry.nombre_categoria' | t"
            [disabled]="ficha.protected"
            [(ngModel)]="formulario.name"
            data-test="gestor-categorias-campo-nombre"
          ></app-input>

          <div class="ficha__campo">
            <span class="ficha__etiqueta">{{ 'pantry.color_categoria' | t }}</span>
            <div class="swatches" role="group" [attr.aria-label]="'pantry.color_categoria' | t">
              @for (muestra of muestras; track muestra) {
                <button
                  type="button"
                  class="swatch"
                  [class.swatch--activa]="formulario.color.toUpperCase() === muestra"
                  [style.background]="muestra"
                  [attr.aria-label]="muestra"
                  (click)="pintar(muestra)"
                  [attr.data-test]="'gestor-categorias-color-' + muestra.toLowerCase()"
                ></button>
              }
            </div>
            <app-input
              id="gestor-categoria-color"
              name="gestor-categoria-color"
              type="text"
              [placeholder]="'#4CAF50'"
              [helper]="'pantry.color_ayuda' | t"
              [(ngModel)]="formulario.color"
              data-test="gestor-categorias-campo-color"
            ></app-input>
          </div>

          <div class="ficha__campo">
            <span class="ficha__etiqueta">{{ 'pantry.padre_categoria' | t }}</span>
            <app-picker
              [options]="opcionesPadre()"
              [value]="formulario.parentKey || null"
              (valueChange)="elegirPadre($event)"
              [placeholder]="('pantry.sin_padre' | t)"
              data-test="gestor-categorias-campo-padre"
            />
            @if (formulario.parentKey) {
              <button type="button" class="ficha__enlace" (click)="quitarPadre()" data-test="gestor-categorias-quitar-padre">
                {{ 'pantry.sin_padre' | t }}
              </button>
            }
          </div>

          <app-input
            id="gestor-categoria-descripcion"
            name="gestor-categoria-descripcion"
            type="text"
            [label]="'pantry.descripcion_categoria' | t"
            [(ngModel)]="formulario.description"
            data-test="gestor-categorias-campo-descripcion"
          ></app-input>

          @if (error) {
            <p class="ficha__error" role="alert" data-test="gestor-categorias-error">{{ error }}</p>
          }

          <div class="ficha__acciones">
            <button
              type="button"
              class="boton boton--primario"
              [disabled]="guardando"
              (click)="guardar()"
              data-test="gestor-categorias-guardar"
            >
              {{ (esNueva ? 'pantry.crear_categoria' : 'common.save') | t }}
            </button>
            @if (!esNueva) {
              <button
                type="button"
                class="boton boton--peligro"
                [disabled]="ficha.protected || !ficha.canDelete"
                (click)="borrar(ficha)"
                data-test="gestor-categorias-eliminar"
              >
                {{ 'pantry.eliminar_categoria' | t }}
              </button>
            }
            <button type="button" class="boton" (click)="volver()" data-test="gestor-categorias-cancelar">
              {{ 'common.cancel' | t }}
            </button>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    /* La pantalla entera se acota y se respira: lo que heredo de la despensa vecina (max-width de 1000px,
       padding del sistema y margen automatico) es lo que hace que al cambiar de pantalla nada salte de
       ancho. Un gestor sin contenedor, en un monitor de 27 pulgadas, es una linea de 2400px de larga y
       ninguna columna vuelve a cuadrar con la de arriba. */
    .gestor {
      display: flex; flex-direction: column; gap: var(--space-4);
      box-sizing: border-box; width: 100%; max-width: 1000px; margin: 0 auto;
      padding: var(--space-4) var(--space-4) var(--space-16);
    }
    @media (min-width: 768px) {
      .gestor { gap: var(--space-6); padding: var(--space-6) var(--space-6) var(--space-20); }
    }

    /* Cabecera con su propio aire y una linea de separacion: el titulo, la ayuda y el volver son tres cosas
       distintas y no pueden ir pegadas. */
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
    .gestor__ayuda {
      margin: var(--space-1) 0 0; max-width: 66ch; color: var(--text-secondary);
      font-size: var(--text-sm); line-height: var(--leading-relaxed);
    }
    @media (min-width: 768px) {
      .gestor__title { font-size: var(--text-2xl); }
      .gestor__ayuda { font-size: var(--text-base); }
    }

    /* La barra de trabajo es una superficie, no tres controles sueltos flotando en la pagina: se alinea por
       su linea de base (align-items al final) para que buscador, filtros y boton compartan alturas. */
    .gestor__toolbar {
      display: flex; flex-wrap: wrap; align-items: end; gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      background: var(--bg-secondary); border: 1px solid var(--border-default); border-radius: var(--radius-xl);
    }
    .gestor__vistas {
      display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center;
      margin-right: auto; padding: var(--space-1);
      background: var(--bg-tertiary); border-radius: var(--radius-full);
    }
    .gestor__buscar { flex: 1 1 220px; min-width: 180px; }
    .gestor__nueva {
      display: inline-flex; align-items: center; gap: var(--space-2);
      padding: var(--space-2) var(--space-4); font: inherit; font-size: var(--text-sm); font-weight: var(--font-semibold);
      color: var(--bg-secondary); background: var(--primary); border: 1px solid transparent;
      border-radius: var(--radius-full); cursor: pointer; transition: var(--transition-fast);
    }
    .gestor__nueva:hover { filter: brightness(1.06); }
    .gestor__nueva:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

    .gestor__estado {
      margin: 0; padding: var(--space-5) var(--space-4); text-align: center;
      color: var(--text-secondary); font-size: var(--text-sm);
      background: var(--bg-secondary); border: 1px dashed var(--border-default); border-radius: var(--radius-xl);
    }

    /* Una sola tarjeta con filas separadas por un hilo, en vez de fichitas con dos pixeles de hueco: es lo que
       hace que el ojo recorra la columna de numeros sin perder el sitio. */
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
      flex: 1 1 auto; min-width: 0; display: flex; flex-wrap: wrap; align-items: center;
      gap: var(--space-2) var(--space-4); padding: var(--space-4);
      font: inherit; color: inherit; text-align: left; background: none; border: none; cursor: pointer;
    }
    .fila__cuerpo:focus-visible { outline: 2px solid var(--primary); outline-offset: -3px; border-radius: var(--radius-md); }
    .fila__accion {
      flex: none; display: grid; place-items: center; width: 48px; padding: 0;
      color: var(--text-secondary); background: none; border: none; cursor: pointer;
      transition: var(--transition-fast);
    }
    .fila__accion:focus-visible { outline: 2px solid var(--primary); outline-offset: -3px; border-radius: var(--radius-md); }
    .fila__accion:disabled { opacity: 0.35; cursor: not-allowed; }

    @media (min-width: 860px) {
      /* Y a partir de aqui, columnas de verdad: los numeros se alinean entre filas porque el grid las declara,
         no porque a cada texto le quepa su hueco. */
      .fila__cuerpo { display: grid; flex-wrap: nowrap; gap: var(--space-6); }
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

    /* La ficha es un formulario, no una lista de campos pegados: una tarjeta con padding generoso, campos con
    su microetiqueta y dos columnas cuando el ancho lo permite. */
    .ficha {
      display: flex; flex-direction: column; gap: var(--space-5);
      padding: var(--space-4); background: var(--bg-secondary);
      border: 1px solid var(--border-default); border-radius: var(--radius-2xl);
    }
    @media (min-width: 768px) { .ficha { gap: var(--space-6); padding: var(--space-6); } }
    .ficha__titulo {
      margin: 0; font-family: var(--font-display); font-size: var(--text-lg); font-weight: var(--font-semibold);
      line-height: var(--leading-snug);
    }
    .ficha__etiqueta {
      font-size: var(--text-xs); font-weight: var(--font-semibold); letter-spacing: var(--tracking-wide);
      text-transform: uppercase; color: var(--text-tertiary);
    }
    .ficha__campo { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
    .form-row { display: grid; gap: var(--space-4); }
    @media (min-width: 720px) { .form-row { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .form-field { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }

    .ficha__aviso, .ficha__ayuda, .ficha__error {
      display: flex; align-items: flex-start; gap: var(--space-2); margin: 0;
      padding: var(--space-3) var(--space-4); font-size: var(--text-sm); line-height: var(--leading-relaxed);
      border-radius: var(--radius-lg); border-left: 3px solid var(--border-strong);
      background: var(--bg-tertiary); color: var(--text-primary);
    }
    .ficha__aviso { border-left-color: var(--warning); background: var(--warning-subtle); }
    .ficha__error { border-left-color: var(--error); background: var(--error-subtle); color: var(--error); }

    .ficha__acciones {
      display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3);
      padding-top: var(--space-4); border-top: 1px solid var(--border-default);
    }
    .ficha__enlace {
      align-self: flex-start; padding: var(--space-1) 0; font: inherit; font-size: var(--text-sm);
      color: var(--primary); background: none; border: none; cursor: pointer; text-decoration: underline;
      text-underline-offset: 2px;
    }
    .ficha__enlace:hover { color: var(--text-primary); }
    .ficha__enlace:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: var(--radius-sm); }

    .boton {
      display: inline-flex; align-items: center; gap: var(--space-2);
      padding: var(--space-2) var(--space-4); font: inherit; font-size: var(--text-sm); font-weight: var(--font-medium);
      color: var(--text-primary); background: var(--bg-tertiary);
      border: 1px solid var(--border-default); border-radius: var(--radius-full); cursor: pointer;
      transition: var(--transition-fast);
    }
    .boton:disabled { opacity: 0.5; cursor: not-allowed; }
    .boton--primario { color: var(--bg-secondary); background: var(--primary); border-color: transparent; font-weight: var(--font-semibold); margin-inline-start: auto; }
    .boton--peligro { color: var(--error); border-color: color-mix(in srgb, var(--error) 45%, transparent); }

    /* Pistas de la fila: punto, nombres, cifras y el distintivo de la reserva. Se declaran aqui y no en la
       hoja comun porque cada pantalla metio dentro lo que le hacia falta, y cuadricular mal es peor que no
       cuadricular: el ultimo hijo se iba a una segunda linea. */
    @media (min-width: 860px) {
      .fila__cuerpo { grid-template-columns: auto minmax(0, 1fr) auto auto; }
    }

    /* La lista esta aplanada y el arbol se tiene que VER: un hijo entra con un sangrado y un hilo a la
       izquierda, que es como Basketra deja claro quien cuelga de quien sin necesidad de un acordeon. */
    .fila--anidada .fila__cuerpo { padding-left: var(--space-8); position: relative; }
    .fila--anidada .fila__cuerpo::before {
      content: ""; position: absolute; left: var(--space-5); top: 50%; width: var(--space-3); height: 1px;
      background: var(--border-strong);
    }

    .fila__punto {
      flex: none; width: 12px; height: 12px; border-radius: var(--radius-full);
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
    }
    .fila__nombres { display: flex; flex-direction: column; min-width: 0; gap: var(--space-1); flex: 1 1 200px; }
    .fila__nombre {
      font-size: var(--text-base); font-weight: var(--font-medium); color: var(--text-primary);
      overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    }
    .fila__padre { font-size: var(--text-xs); color: var(--text-secondary); }
    .fila__cifras {
      display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-1);
      margin-left: auto; text-align: right;
    }
    .fila__cifra { font-size: var(--text-sm); font-variant-numeric: tabular-nums; color: var(--text-secondary); }
    .fila__cifra--suave { font-size: var(--text-xs); opacity: 0.8; }

    /* El color se elige tocandolo, y el hex se escribe: las dos cosas necesitan su hueco para no parecer un
       solo control apretujado. */
    .swatches { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
    .swatch {
      width: 28px; height: 28px; padding: 0; background-clip: padding-box;
      border: 1px solid var(--border-default); border-radius: var(--radius-full); cursor: pointer;
      transition: var(--transition-fast);
    }
    .swatch:hover { transform: scale(1.08); }
    .swatch:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .swatch--activa { box-shadow: 0 0 0 2px var(--bg-secondary), 0 0 0 4px var(--text-primary); }

    /* Que un boton se pueda pulsar se nota sin tocarlo: hover y foco visible en todo lo que acepta un click
       (regla 8 del sistema), incluido el boton primario, que si no parece deshabilitado junto al resto. */
    .fila__cuerpo:hover { background: color-mix(in srgb, var(--bg-tertiary) 40%, transparent); }
    .fila__accion:hover:not(:disabled) { color: var(--error); background: color-mix(in srgb, var(--error) 10%, transparent); }
    .boton:hover:not(:disabled) { border-color: var(--border-strong); background: var(--bg-secondary); }
    .boton:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .boton--primario:hover:not(:disabled) { filter: brightness(1.06); background: var(--primary); }
    .boton--primario:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
    .boton--peligro:hover:not(:disabled) { color: var(--bg-secondary); background: var(--error); border-color: var(--error); }
    .boton--peligro:focus-visible { outline: 2px solid var(--error); outline-offset: 2px; }
  `]
})
export class PantryCategoriesComponent implements OnInit {
  private readonly pantry = inject(PantryService);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly colorDeCategoria = colorDeCategoria;
  protected readonly muestras = ['#4CAF50', '#B26A00', '#E05A5A', '#4FA3D1', '#6C8AE4', '#C99A2E', '#8E5AC8', '#2FA79B'];

  protected lista: PantryCategory[] = [];
  protected ficha: PantryCategory | null = null;
  protected esNueva = false;
  protected view: PantryCategoryView = 'all';
  protected q = '';
  protected total = 0;
  protected limit = 10;
  protected offset = 0;
  protected cargando = true;
  protected guardando = false;
  protected error = '';
  protected formulario = { name: '', color: '', description: '', parentKey: '' };

  protected get rango(): string {
    if (this.total === 0) return '0';
    return `${this.offset + 1}-${Math.min(this.offset + this.limit, this.total)}`;
  }

  protected get vistas(): { value: PantryCategoryView; clave: 'pantry.categorias_todas' | 'pantry.categorias_sin_productos' | 'pantry.categorias_con_subcategorias' }[] {
    return [
      { value: 'all', clave: 'pantry.categorias_todas' },
      { value: 'without-products', clave: 'pantry.categorias_sin_productos' },
      { value: 'with-children', clave: 'pantry.categorias_con_subcategorias' }
    ];
  }

  ngOnInit(): void {
    this.pantry.loadCategories();
    // Lo mismo que en productos: la query es el estado, y al entrar se lee. `view` es el nombre que comparte con
    // el servidor para las vistas, no un detalle interno de la URL.
    const query = this.route.snapshot.queryParamMap;
    this.view = valorDeQuery(query, 'view', ['all', 'without-products', 'with-children'] as const, 'all');
    this.q = valorDeQuery(query, 'q', null, '');
    this.offset = offsetDeQuery(query);
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.abrirFicha(id);
    else void this.refrescar();
  }

  // ── lista ──

  private async refrescar(): Promise<void> {
    this.cargando = true;
    const resultado = await this.pantry.listCategories(this.view, this.q, this.limit, this.offset);
    this.lista = resultado?.data ?? [];
    this.total = resultado?.meta.total ?? 0;
    this.cargando = false;
  }

  protected cambiarVista(value: PantryCategoryView): void {
    this.view = value;
    this.offset = 0;
    void this.escribirUrl();
  }

  protected buscar(): void {
    this.offset = 0;
    void this.escribirUrl();
  }

  /**
   * El estado de la pantalla vive en la URL, no solo en el componente. Es lo que hace que un F5, el boton atras
   * del navegador y compartir el enlace den la misma lista —y lo que Basketra comprueba en sus specs de
   * navegador—, y a diferencia de `localStorage` no deja la sorpresa de «por que mi lista aparece filtrada».
   */
  private async escribirUrl(): Promise<void> {
    await this.router.navigate(['../'], {
      relativeTo: this.route,
      queryParams: { view: this.view === 'all' ? null : this.view, q: this.q || null, offset: this.offset || null },
      queryParamsHandling: 'merge',
      replaceUrl: this.ficha === null
    });
    await this.refrescar();
  }

  protected mover(paso: number): void {
    const siguiente = Math.max(0, this.offset + paso * this.limit);
    if (siguiente + 1 > this.total && paso > 0) return;
    this.offset = siguiente;
    void this.escribirUrl();
  }

  protected etiquetaClave(clave: string | null): string {
    if (!clave) return '';
    const fila = this.pantry.categoryByKey(clave);
    return pantryCategoryLabel(fila ?? { key: clave }, (key) => this.i18n.t(key));
  }

  protected cuenta(fila: PantryCategory): string {
    // `descendantProducts` es lo que se pinta cuando hay ramas: «2 articulos» en una categoria con una hija
    // llena dejaria de pie que la fila esta vacia cuando no lo esta.
    const n = fila.counts.children > 0 ? fila.counts.descendantProducts : fila.counts.products;
    if (n === 0) return this.i18n.t('pantry.cuenta_sin_articulos');
    return this.i18n.t(fila.counts.children > 0 ? 'pantry.cuenta_articulos_descendientes' : 'pantry.cuenta_articulos', { n });
  }

  protected cuentaHijos(fila: PantryCategory): string {
    return this.i18n.t('pantry.cuenta_subcategorias', { n: fila.counts.children });
  }

  // ── ficha ──

  protected abrir(fila: PantryCategory): void {
    void this.router.navigate([fila.id], { relativeTo: this.route });
  }

  protected abrirNueva(): void {
    void this.router.navigate(['new'], { relativeTo: this.route });
  }

  private async abrirFicha(id: string): Promise<void> {
    this.esNueva = id === 'new';
    if (this.esNueva) {
      this.ficha = {
        id: '',
        key: '',
        name: '',
        color: '',
        description: null,
        parentKey: null,
        parentName: null,
        position: 0,
        counts: { products: 0, children: 0, descendantProducts: 0 },
        protected: false,
        canDelete: false
      };
      this.formulario = { name: '', color: '', description: '', parentKey: '' };
      return;
    }
    const catalogo = this.pantry.categories();
    const encontrada = catalogo.find((fila) => fila.id === id) ?? (await this.buscarEnServidor(id, 0));
    if (!encontrada) {
      await this.router.navigate(['../'], { relativeTo: this.route });
      return;
    }
    this.ficha = encontrada;
    this.formulario = {
      name: encontrada.name,
      color: encontrada.color,
      description: encontrada.description ?? '',
      parentKey: encontrada.parentKey ?? ''
    };
  }

  /** Un F5 en la ficha no puede depender de que el catalogo quepa en la primera pagina: se pide por su sitio. */
  private async buscarEnServidor(id: string, pagina: number): Promise<PantryCategory | null> {
    const resultado = await this.pantry.listCategories('all', '', 100, pagina * 100);
    const fila = resultado?.data.find((candidata) => candidata.id === id) ?? null;
    if (fila || !resultado || resultado.data.length < 100) return fila;
    return this.buscarEnServidor(id, pagina + 1);
  }

  protected opcionesPadre(): PickerOption[] {
    const prohibidas = clavesNoElegiblesComoPadre(this.pantry.categories(), this.esNueva ? null : this.ficha?.id ?? null);
    return this.pantry
      .categories()
      .filter((fila) => !prohibidas.has(fila.key))
      .map((fila) => ({
        value: fila.key,
        label: pantryCategoryLabel(fila, (key) => this.i18n.t(key)),
        color: fila.color,
        group: fila.parentName ? pantryCategoryLabel({ key: fila.parentKey, name: fila.parentName }, (key) => this.i18n.t(key)) : undefined
      }));
  }

  /**
   * Las dos comprobaciones estructurales, hechas en la pantalla antes de llamar al server.
   *
   * No son confianza de mas: `assertPlacement` del server ya las hace, y las hara aunque esta funcione mal —la
   * unica garantia que cuenta es la de ahi—, pero lo que se evita aqui es que la persona guarde, espere y vea un
   * 400 escrito en el idioma del log. Y el techo de cuatro niveles es de los que se saltan sin darse cuenta: la
   * lista se ve bien, lo que ya no cabe es la pantalla.
   */
  private comprobarFormaDelArbol(): string | null {
    const padre = this.formulario.parentKey.trim();
    if (!padre) return null;
    const propia = this.esNueva ? null : this.ficha?.key ?? null;
    if (propia && padre === propia) return this.i18n.t('pantry.error_ciclo');
    let cadena = padre;
    const vistas = new Set<string>();
    let profundidadPadre = 0;
    while (cadena && !vistas.has(cadena)) {
      vistas.add(cadena);
      profundidadPadre++;
      if (propia && cadena === propia) return this.i18n.t('pantry.error_ciclo');
      cadena = this.pantry.categoryByKey(cadena)?.parentKey ?? '';
    }
    if (profundidadPadre + this.altura(propia ?? '') > 4) return this.i18n.t('pantry.error_profundidad');
    return null;
  }

  private altura(clave: string): number {
    if (!clave) return 1;
    const hijas = this.pantry.categories().filter((fila) => fila.parentKey === clave);
    return 1 + (hijas.length > 0 ? Math.max(...hijas.map((hija) => this.altura(hija.key))) : 0);
  }

  protected pintar(color: string): void {
    this.formulario.color = color;
  }

  protected quitarPadre(): void {
    this.formulario.parentKey = '';
  }

  /** `null` es el hueco del picker: aqui significa «sin padre», que es justo lo que el server espera. */
  protected elegirPadre(valor: string | null): void {
    this.formulario.parentKey = valor ?? '';
  }

  protected async guardar(): Promise<void> {
    const nombre = this.formulario.name.trim();
    this.error = '';
    if (!nombre) {
      this.error = this.i18n.t('pantry.el_nombre_es_requerido');
      return;
    }
    const antesDelCambio = this.comprobarFormaDelArbol();
    if (antesDelCambio) {
      this.error = antesDelCambio;
      return;
    }
    const color = this.formulario.color.trim();
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      this.error = this.i18n.t('pantry.error_color_invalido');
      return;
    }
    const entrada = {
      name: nombre,
      color: color || null,
      description: this.formulario.description.trim() || null,
      parentKey: this.formulario.parentKey.trim() || null
    };
    this.guardando = true;
    const resultado = this.esNueva
      ? await this.pantry.createCategory(entrada)
      : await this.pantry.updateCategory(this.ficha!.id, entrada);
    this.guardando = false;
    if (!resultado.ok) {
      this.error = this.frase(resultado.error, resultado.message, color);
      return;
    }
    this.toast.success(this.i18n.t(this.esNueva ? 'pantry.categoria_creada' : 'pantry.categoria_guardada'));
    await this.volver();
  }

  /** El codigo del server, en la frase del idioma activo. El `message` del server solo vale de respaldo. */
  private frase(codigo: string, message: string, color: string): string {
    const t = (clave: Parameters<I18nService['t']>[0]) => this.i18n.t(clave);
    switch (codigo) {
      case 'PANTRY_CATEGORY_EXISTS':
        return t('pantry.error_nombre_repetido');
      case 'PANTRY_CATEGORY_PROTECTED':
        return t('pantry.error_reservada');
      case 'PANTRY_CATEGORY_PARENT_NOT_FOUND':
        return t('pantry.error_padre_no_existe');
      case 'PANTRY_CATEGORY_IN_USE':
        return t('pantry.error_en_uso');
      case 'PANTRY_CATEGORY_INVALID':
        return !color || /^#[0-9a-fA-F]{6}$/.test(color) ? message || t('ui.datos_de_entrada_invalidos') : t('pantry.error_color_invalido');
      case 'NETWORK':
        return t('ui.sin_conexion');
      default:
        return message || t('ui.no_se_ha_podido');
    }
  }

  protected async borrar(fila: PantryCategory): Promise<void> {
    const etiqueta = pantryCategoryLabel(fila, (key) => this.i18n.t(key));
    const impacto = await this.pantry.categoryImpact(fila.id);
    if (impacto && !impacto.canDelete) {
      // No se abre un dialogo para decir «no»: se dice con los numeros, que son la unica informacion que sirve.
      this.toast.warning(
        this.i18n.t('pantry.error_en_uso'),
        this.i18n.t('pantry.impacto_borrar_categoria', {
          articulos: this.i18n.t('pantry.cuenta_articulos', { n: impacto.products }),
          subcategorias: this.i18n.t('pantry.cuenta_subcategorias', { n: impacto.children })
        })
      );
      return;
    }
    const aceptado = await this.confirm.confirm({
      title: this.i18n.t('pantry.eliminar_categoria'),
      message: this.i18n.t('pantry.confirmar_borrar_categoria', { name: etiqueta }),
      confirmText: this.i18n.t('common.delete'),
      cancelText: this.i18n.t('common.cancel'),
      variant: 'danger'
    });
    if (!aceptado) return;
    const resultado = await this.pantry.deleteCategory(fila.id);
    if (!resultado.ok) {
      this.toast.error(this.i18n.t('ui.no_se_ha_podido'), this.frase(resultado.error, resultado.message, ''));
      return;
    }
    this.toast.success(this.i18n.t('pantry.categoria_borrada'));
    if (this.ficha) await this.volver();
    else await this.refrescar();
  }

  protected async volver(): Promise<void> {
    if (this.ficha) await this.router.navigate(['../'], { relativeTo: this.route });
  }
}
