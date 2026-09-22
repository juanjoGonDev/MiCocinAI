import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { PantryService } from '../../core/services/pantry.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { I18nService } from '../../core/services/i18n.service';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { IconComponent } from '../../shared/components/ui/icon/icon.component';
import { InputComponent } from '../../shared/components/ui/input/input.component';
import { TagComponent } from '../../shared/components/ui/tag/tag.component';
import { CheckboxComponent } from '../../shared/components/ui/checkbox/checkbox.component';
import { PickerComponent, type PickerOption } from '../../shared/components/ui/picker/picker.component';
import { PantryCategoryLabelPipe } from '../../shared/pipes/pantry-category-label.pipe';
import { pantryCategoryLabel } from '../../core/i18n/labels';
import { daysUntil } from '../../core/time';
import type {
  MeasurementUnit,
  PantryProduct,
  PantryProductFilter,
  PantryProductSort,
  PantryRequest
} from '../../shared/models/pantry.model';
import { aliasVisibles, colorDeCategoria, normalizarAlias, offsetDeQuery, valorDeQuery } from './pantry-gestor.util';

/**
 * El gestor de productos principales (HOGARIA-SPEC ## 12x).
 *
 * «Producto principal», en HogarIA, es una fila de la despensa con `quantity = 0`: algo que la casa conoce y
 * que ahora mismo no tiene. No se ha creado una tabla para esto porque no hacia falta un dato nuevo, hacia
 * falta una pantalla donde gestionarlos. De ahi las dos reglas que dan forma a la interfaz:
 *
 *  - **registrar no es comprar.** El alta deja la cantidad en 0, y por eso la cantidad solo se puede poner al
 *    crear y desde aqui se avisa de lo que significa; lo que hay dentro de la despensa se mueve en la despensa,
 *    con sus motivos de cambio, no desde una ficha del catalogo;
 *  - **borrar la ficha no borra la historia.** Las lineas de la cesta y las observaciones de precio guardan su
 *    propia copia del nombre y de la clave, asi que se puede quitar un basico del catalogo sin perder el martes
 *    en que se compro; lo que si bloquea el borrado es tener unidades dentro, y eso se dice con el numero.
 *
 * Como el de las categorias, son dos rutas y una clase: la lista filtra y pagina en el server, y la ficha vive
 * en su URL para que un F5 no la desperdicie.
 */
@Component({
  selector: 'app-pantry-products',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslatePipe,
    IconComponent,
    InputComponent,
    TagComponent,
    CheckboxComponent,
    PickerComponent,
    PantryCategoryLabelPipe
  ],
  template: `
    <div class="gestor">
      <header class="gestor__header">
        <button type="button" class="gestor__back" (click)="volver()" data-test="gestor-productos-volver">
          <app-icon name="chevron_left" [size]="20" [label]="null" />
          <span>{{ 'pantry.volver_al_inventario' | t }}</span>
        </button>
        <h1 class="gestor__title">{{ 'pantry.gestor_productos' | t }}</h1>
        <p class="gestor__ayuda">{{ 'pantry.gestor_productos_ayuda' | t }}</p>
      </header>

      @if (!ficha) {
        <section class="gestor__toolbar" data-test="gestor-productos-lista">
          <div class="gestor__vistas">
            @for (opcion of filtros; track opcion.value) {
              <app-tag
                [selected]="filtro === opcion.value"
                (onClick)="cambiarFiltro(opcion.value)"
                [attr.data-test]="'gestor-productos-filtro-' + opcion.value"
              >
                {{ opcion.clave | t }}
              </app-tag>
            }
          </div>

          <app-input
            class="gestor__buscar"
            id="gestor-productos-q"
            name="gestor-productos-q"
            type="search"
            [placeholder]="'pantry.buscar_productos' | t"
            [(ngModel)]="q"
            (ngModelChange)="buscar()"
          ></app-input>

          <app-picker
            class="gestor__orden"
            [options]="opcionesOrden"
            [value]="orden"
            (valueChange)="cambiarOrden($event)"
            [label]="''"
          />

          <button type="button" class="gestor__nueva" (click)="abrirNueva()" data-test="gestor-productos-nueva">
            <app-icon name="add" [size]="18" [label]="null" />
            <span>{{ 'pantry.registrar_producto' | t }}</span>
          </button>
        </section>

        @if (cargando) {
          <p class="gestor__estado">{{ 'common.loading' | t }}</p>
        } @else if (lista.length === 0) {
          <p class="gestor__estado" data-test="gestor-productos-vacia">{{ 'pantry.productos_vacios' | t }}</p>
        } @else {
          <ul class="lista">
            @for (fila of lista; track fila.id) {
              <li class="fila" [attr.data-test]="'gestor-productos-fila-' + fila.id">
                <app-checkbox
                  class="fila__marca"
                  [checked]="marcado(fila.id)"
                  [hideLabel]="true"
                  [label]="fila.name"
                  (onChange)="marcar(fila.id, $event)"
                />
                <button type="button" class="fila__cuerpo" (click)="abrir(fila)">
                  <span class="fila__nombre">{{ fila.name }}</span>
                  <span class="fila__meta">
                    <span class="fila__punto" [style.background]="colorDeCategoria(catalogo.get(fila.category))" aria-hidden="true"></span>
                    <span class="fila__categoria">{{ fila.categoryName | category }}</span>
                    @if (fila.inPantry) {
                      <span class="fila__stock">{{ fila.quantity }} {{ fila.unit }}</span>
                    }
                    @if (fila.expirationDate) {
                      <span class="fila__caduca" [class.fila__caduca--cerca]="caducaPronto(fila)">{{ caducidad(fila) }}</span>
                    }
                    @for (alias of aliasVisibles(fila.aliases).visibles; track alias) {
                      <span class="fila__alias">{{ alias }}</span>
                    }
                    @if (aliasVisibles(fila.aliases).ocultos > 0) {
                      <span class="fila__alias fila__alias--mas">+{{ aliasVisibles(fila.aliases).ocultos }}</span>
                    }
                  </span>
                  @if (fila.impact.listLines > 0) {
                    <span class="fila__impacto">{{ 'pantry.lineas_de_cesta' | t: { n: fila.impact.listLines } }}</span>
                  }
                </button>
                <button
                  type="button"
                  class="fila__accion"
                  [attr.aria-label]="'pantry.eliminar_producto' | t"
                  [attr.title]="'pantry.eliminar_producto' | t"
                  [disabled]="fila.inPantry"
                  (click)="borrar(fila)"
                  [attr.data-test]="'gestor-productos-borrar-' + fila.id"
                >
                  <app-icon name="delete" [size]="18" [label]="null" />
                </button>
              </li>
            }
          </ul>

          <div class="lote" *ngIf="seleccion.length > 0" data-test="gestor-productos-lote">
            <span>{{ 'pantry.seleccionados' | t: { n: seleccion.length } }}</span>
            <button type="button" class="boton boton--peligro" (click)="borrarLote()">
              {{ 'pantry.borrar_seleccionados' | t }}
            </button>
          </div>

          <nav class="paginador">
            <button type="button" (click)="mover(-1)" [disabled]="offset === 0" data-test="gestor-productos-anterior">
              {{ 'common.anterior' | t }}
            </button>
            <span class="paginador__cifra">{{ rango }} / {{ total }}</span>
            <button
              type="button"
              (click)="mover(1)"
              [disabled]="offset + limit >= total"
              data-test="gestor-productos-siguiente"
            >
              {{ 'pantry.siguiente' | t }}
            </button>
          </nav>
        }
      } @else {
        <section class="ficha" data-test="gestor-productos-ficha">
          <div class="ficha__cabecera">
            <h2 class="ficha__titulo">{{ (esNueva ? 'pantry.nuevo_producto' : 'pantry.ficha_producto') | t }}</h2>
            @if (!esNueva) {
              <button type="button" class="ficha__enlace" (click)="verEnLaDespensa()" data-test="gestor-productos-ver-despensa">
                {{ 'pantry.ver_en_la_despensa' | t }}
              </button>
            }
          </div>
          <app-input
            id="gestor-producto-nombre"
            name="gestor-producto-nombre"
            type="text"
            [label]="'pantry.producto_nombre' | t"
            [required]="true"
            [error]="errorNombre"
            [(ngModel)]="formulario.name"
            data-test="gestor-productos-campo-nombre"
          ></app-input>

          <div class="form-row">
            <div class="form-field">
              <span class="ficha__etiqueta">{{ 'pantry.categoria' | t }}</span>
              <app-picker
                [options]="opcionesCategoria()"
                [value]="formulario.category"
                (valueChange)="elegirCategoria($event)"
                data-test="gestor-productos-campo-categoria"
              />
            </div>
            <div class="form-field">
              <span class="ficha__etiqueta">{{ 'pantry.unidad_producto' | t }}</span>
              <app-picker
                [options]="opcionesUnidad"
                [value]="formulario.unit"
                (valueChange)="elegirUnidad($event)"
                data-test="gestor-productos-campo-unidad"
              />
            </div>
          </div>

          <div class="form-row">
            <app-input
              *ngIf="esNueva"
              id="gestor-producto-cantidad"
              name="gestor-producto-cantidad"
              type="number"
              [label]="'pantry.cantidad_inicial' | t"
              [helper]="('pantry.cantidad_inicial_ayuda' | t)"
              [(ngModel)]="formulario.quantity"
              data-test="gestor-productos-campo-cantidad"
            ></app-input>

            <app-input
              id="gestor-producto-caducidad"
              name="gestor-producto-caducidad"
              type="date"
              [label]="'pantry.caducidad_producto' | t"
              [(ngModel)]="formulario.expirationDate"
              data-test="gestor-productos-campo-caducidad"
            ></app-input>
          </div>

          <app-input
            id="gestor-producto-nota"
            name="gestor-producto-nota"
            type="text"
            [label]="'pantry.notas_producto' | t"
            [(ngModel)]="formulario.notes"
            data-test="gestor-productos-campo-nota"
          ></app-input>

          <div class="ficha__campo">
            <span class="ficha__etiqueta">{{ 'pantry.aliases' | t }}</span>
            <p class="ficha__ayuda">{{ 'pantry.aliases_ayuda' | t }}</p>
            <div class="alias" *ngIf="formulario.aliases.length > 0">
              @for (alias of formulario.aliases; track alias) {
                <!-- El botoncito de quitar lo nombra el propio tag con su clave ui.remove_tag: no hace falta repetirlo
                   aqui, y un backtick en un comentario de estos cierra el template literal antes de tiempo. -->
                <app-tag [removable]="true" (onRemove)="quitarAlias(alias)">{{ alias }}</app-tag>
              }
            </div>
            <div class="alias__nuevo">
              <app-input
                id="gestor-producto-alias"
                name="gestor-producto-alias"
                type="text"
                [placeholder]="'pantry.anadir_alias' | t"
                [(ngModel)]="aliasNuevo"
              ></app-input>
              <button type="button" class="boton" (click)="anadirAlias()" data-test="gestor-productos-anadir-alias">
                {{ 'pantry.anadir_alias' | t }}
              </button>
            </div>
          </div>

          @if (!esNueva) {
            <p class="ficha__cifras" data-test="gestor-productos-impacto">
              <span>{{ 'pantry.lineas_de_cesta' | t: { n: ficha.impact.listLines } }}</span>
              <span>{{ 'pantry.observaciones_precio' | t: { n: ficha.impact.priceObservations } }}</span>
              <span *ngIf="ficha.inPantry">{{ 'pantry.en_despensa_cantidad' | t: { cantidad: ficha.quantity + ' ' + ficha.unit } }}</span>
            </p>
          }

          @if (error) {
            <p class="ficha__error" role="alert" data-test="gestor-productos-error">{{ error }}</p>
          }

          <div class="ficha__acciones">
            <button
              type="button"
              class="boton boton--primario"
              [disabled]="guardando"
              (click)="guardar()"
              data-test="gestor-productos-guardar"
            >
              {{ (esNueva ? 'pantry.registrar_producto' : 'pantry.guardar_producto') | t }}
            </button>
            @if (!esNueva) {
              <button
                type="button"
                class="boton boton--peligro"
                [disabled]="ficha.inPantry"
                (click)="borrar(ficha)"
                data-test="gestor-productos-eliminar"
              >
                {{ 'pantry.eliminar_producto' | t }}
              </button>
            }
            <button type="button" class="boton" (click)="volver()" data-test="gestor-productos-cancelar">
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

    /* Pistas de la fila: nombre, la linea de etiquetas y el impacto. El nombre no puede comerse el ancho de
       las etiquetas, y el impacto se queda a la derecha del todo en todas las filas. */
    @media (min-width: 860px) {
      .fila__cuerpo { grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.6fr) auto; }
    }

    /* La casilla de lote abre la fila: 48px de ancho y centrada, para que el punto de toque no se solape con
       el nombre y las filas con y sin casilla cuadren igual. */
    .fila__marca { flex: none; display: grid; place-items: center; width: 48px; padding-left: var(--space-2); }

    .fila__nombre {
      min-width: 0; font-size: var(--text-base); font-weight: var(--font-medium); color: var(--text-primary);
      overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    }
    .fila__meta {
      display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-2);
      min-width: 0; color: var(--text-secondary); font-size: var(--text-xs);
    }
    .fila__punto {
      flex: none; width: 10px; height: 10px; border-radius: var(--radius-full);
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
    }
    /* Cada dato de la fila es una etiqueta, y las etiquetas se pintan igual en las dos pantallas: relleno
       redondeado, numero tabular y un hueco constante entre ellas. */
    .fila__categoria, .fila__stock, .fila__caduca, .fila__alias, .fila__impacto {
      padding: var(--space-1) var(--space-2); border-radius: var(--radius-full); background: var(--bg-tertiary);
      font-size: var(--text-xs); font-variant-numeric: tabular-nums; white-space: nowrap;
    }
    .fila__categoria { color: var(--text-secondary); }
    .fila__stock { color: var(--success); background: var(--success-subtle); }
    .fila__caduca { color: var(--text-secondary); }
    .fila__caduca--cerca { color: var(--warning); background: var(--warning-subtle); }
    .fila__alias { color: var(--text-secondary); background: none; border: 1px dashed var(--border-default); }
    .fila__alias--mas { opacity: 0.7; }
    .fila__impacto { margin-left: auto; color: var(--text-tertiary); background: none; }
    @media (min-width: 860px) { .fila__impacto { margin-left: 0; } }

    /* La barra de lote se queda pegada abajo mientras se marca: es el unico sitio donde tiene sentido que
       aparezca una accion destructiva, y no debe tapar la fila que se esta mirando. */
    .lote {
      position: sticky; bottom: var(--space-3); z-index: 5;
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      background: var(--bg-secondary); border: 1px solid var(--border-strong);
      border-radius: var(--radius-full); box-shadow: var(--shadow-lg);
      font-size: var(--text-sm);
    }

    .ficha__cabecera {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2) var(--space-4);
      padding-bottom: var(--space-4); border-bottom: 1px solid var(--border-default);
    }
    .ficha__cifras {
      display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); margin: 0;
      color: var(--text-secondary); font-size: var(--text-sm);
    }
    .ficha__cifras span { padding: var(--space-1) var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-full); }

    /* El editor de alias: lo que hay dentro, y debajo la forma de anadir uno. Sin relleno, los dos se leen como
       un mismo campo y nadie encuentra el boton. */
    .alias { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
    .alias__nuevo {
      display: flex; flex-wrap: wrap; align-items: end; gap: var(--space-2);
      padding: var(--space-3); background: var(--bg-tertiary); border-radius: var(--radius-lg);
    }
    .alias__nuevo app-input { flex: 1 1 200px; min-width: 160px; }
    .gestor__orden { flex: 0 0 auto; min-width: 190px; }

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
export class PantryProductsComponent implements OnInit {
  private readonly pantry = inject(PantryService);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly colorDeCategoria = colorDeCategoria;
  protected readonly aliasVisibles = aliasVisibles;

  protected lista: PantryProduct[] = [];
  protected ficha: PantryProduct | null = null;
  protected esNueva = false;
  protected filtro: PantryProductFilter = 'staples';
  protected orden: PantryProductSort = 'name';
  protected q = '';
  protected total = 0;
  protected limit = 10;
  protected offset = 0;
  protected cargando = true;
  protected guardando = false;
  protected error = '';
  protected errorNombre = '';
  protected seleccion: string[] = [];
  protected aliasNuevo = '';
  protected formulario = {
    name: '',
    category: 'other',
    unit: 'unit' as MeasurementUnit,
    quantity: 0,
    expirationDate: '',
    notes: '',
    aliases: [] as string[]
  };

  protected readonly filtros: { value: PantryProductFilter; clave: 'pantry.productos_sin_stock' | 'pantry.productos_con_stock' | 'pantry.productos_todos' | 'pantry.productos_caducan' }[] = [
    { value: 'staples', clave: 'pantry.productos_sin_stock' },
    { value: 'in-pantry', clave: 'pantry.productos_con_stock' },
    { value: 'all', clave: 'pantry.productos_todos' },
    { value: 'expiring', clave: 'pantry.productos_caducan' }
  ];

  protected readonly opcionesOrden: PickerOption[] = [
    { value: 'name', label: this.i18n.t('pantry.orden_por_nombre') },
    { value: 'recent', label: this.i18n.t('pantry.orden_recientes') }
  ];

  protected readonly opcionesUnidad: PickerOption[] = [
    { value: 'g', label: this.i18n.t('pantry.gramos_g') },
    { value: 'kg', label: this.i18n.t('pantry.kilogramos_kg') },
    { value: 'ml', label: this.i18n.t('pantry.mililitros_ml') },
    { value: 'l', label: this.i18n.t('pantry.litros_l') },
    { value: 'unit', label: this.i18n.t('pantry.unidades') },
    { value: 'cup', label: this.i18n.t('pantry.tazas') },
    { value: 'tbsp', label: this.i18n.t('pantry.cucharadas') },
    { value: 'tsp', label: this.i18n.t('pantry.cucharaditas') }
  ];

  protected get catalogo(): Map<string, { key: string; name: string; color: string; parentKey: string | null; parentName: string | null }> {
    return new Map(this.pantry.categories().map((fila) => [fila.key, fila]));
  }

  protected get rango(): string {
    if (this.total === 0) return '0';
    return `${this.offset + 1}-${Math.min(this.offset + this.limit, this.total)}`;
  }

  ngOnInit(): void {
    this.pantry.loadCategories();
    // El estado de la lista es la query, y aqui es donde la query vuelve a ser estado: entrar por
    // `/pantry/products?filter=in-pantry` o sobrevivir a un F5 tiene que pintar el filtro, la busqueda y la
    // pagina que dice la URL. Sin esto se ignoraba y la pantalla caia al de fabrica —el bug que encontro el CI—.
    const query = this.route.snapshot.queryParamMap;
    this.filtro = valorDeQuery(query, 'filter', ['all', 'staples', 'in-pantry', 'expiring'] as const, 'staples');
    this.orden = valorDeQuery(query, 'sort', ['name', 'recent'] as const, 'name');
    this.q = valorDeQuery(query, 'q', null, '');
    this.offset = offsetDeQuery(query);
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.abrirFicha(id);
    else void this.refrescar();
  }

  // ── lista ──

  private async refrescar(): Promise<void> {
    this.cargando = true;
    const resultado = await this.pantry.listProducts({
      filter: this.filtro,
      sort: this.orden,
      q: this.q || undefined,
      limit: this.limit,
      offset: this.offset
    });
    this.lista = resultado?.data ?? [];
    this.total = resultado?.meta.total ?? 0;
    this.cargando = false;
  }

  protected cambiarFiltro(value: PantryProductFilter): void {
    this.filtro = value;
    this.offset = 0;
    this.seleccion = [];
    void this.escribirUrl();
  }

  protected cambiarOrden(value: string | null): void {
    this.orden = value === 'recent' ? 'recent' : 'name';
    void this.escribirUrl();
  }

  protected buscar(): void {
    this.offset = 0;
    void this.escribirUrl();
  }

  /** Lo mismo que en las categorias: el estado de la pantalla esta en la URL, no solo en el componente. */
  private async escribirUrl(): Promise<void> {
    await this.router.navigate(['../'], {
      relativeTo: this.route,
      queryParams: {
        filter: this.filtro === 'staples' ? null : this.filtro,
        sort: this.orden === 'name' ? null : this.orden,
        q: this.q || null,
        offset: this.offset || null
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
    await this.refrescar();
  }

  protected mover(paso: number): void {
    const siguiente = Math.max(0, this.offset + paso * this.limit);
    if (paso > 0 && siguiente + 1 > this.total) return;
    this.offset = siguiente;
    void this.escribirUrl();
  }

  protected marcado(id: string): boolean {
    return this.seleccion.includes(id);
  }

  protected marcar(id: string, valor: boolean): void {
    this.seleccion = valor ? [...this.seleccion, id] : this.seleccion.filter((previo) => previo !== id);
  }

  protected caducaPronto(fila: PantryProduct): boolean {
    const dias = this.dias(fila);
    return dias !== null && dias <= 3;
  }

  protected caducidad(fila: PantryProduct): string {
    const dias = this.dias(fila);
    if (dias === null) return '';
    return this.i18n.t(dias < 0 ? 'pantry.caducado' : dias === 0 ? 'pantry.caduca_hoy' : 'pantry.caduca_en_dias', { days: dias });
  }

  private dias(fila: PantryProduct): number | null {
    if (!fila.expirationDate) return null;
    return daysUntil(fila.expirationDate);
  }

  // ── ficha ──

  protected abrir(fila: PantryProduct): void {
    void this.router.navigate([fila.id], { relativeTo: this.route });
  }

  protected abrirNueva(): void {
    void this.router.navigate(['new'], { relativeTo: this.route });
  }

  private abrirFicha(id: string): void {
    this.esNueva = id === 'new';
    if (this.esNueva) {
      // La plantilla decide «lista o ficha» con `@if (!ficha)`, así que el alta necesita una ficha EN BLANCO, no
      // `null`: con `null` el botón de crear volvía a pintar la lista y el formulario del alta no existía. Es el
      // mismo truco que en las categorías, y lo que de una fila inexistente no se puede decir (impacto, pie de
      // ficha, borrado) ya está tapado por `@if (!esNueva)`.
      this.ficha = {
        id: '',
        name: '',
        category: 'other',
        categoryKey: 'other',
        categoryName: '',
        quantity: 0,
        unit: 'unit',
        inPantry: false,
        expirationDate: null,
        location: 'pantry',
        barcode: null,
        notes: null,
        aliases: [],
        createdAt: '',
        updatedAt: '',
        impact: { listLines: 0, priceObservations: 0 }
      };
      this.formulario = { name: '', category: 'other', unit: 'unit', quantity: 0, expirationDate: '', notes: '', aliases: [] };
      return;
    }
    // La ficha viene de la lista que se esta viendo; si se entra directo por URL (F5, enlace) se busca en el
    // server con la busqueda por nombre, que es lo unico que la URL puede transportar.
    const enLista = this.lista.find((fila) => fila.id === id);
    if (enLista) this.usar(enLista);
    else void this.buscarPorId(id);
  }

  private async buscarPorId(id: string): Promise<void> {
    const resultado = await this.pantry.listProducts({ filter: 'all', limit: 100 });
    const fila = resultado?.data.find((candidata) => candidata.id === id);
    if (!fila) {
      await this.router.navigate(['../'], { relativeTo: this.route });
      return;
    }
    this.usar(fila);
  }

  private usar(fila: PantryProduct): void {
    this.ficha = fila;
    this.formulario = {
      name: fila.name,
      category: fila.category,
      unit: fila.unit,
      quantity: fila.quantity,
      expirationDate: fila.expirationDate ?? '',
      notes: fila.notes ?? '',
      aliases: [...fila.aliases]
    };
  }

  protected opcionesCategoria(): PickerOption[] {
    return this.pantry.categories().map((fila) => ({
      value: fila.key,
      label: pantryCategoryLabel(fila, (key) => this.i18n.t(key)),
      color: fila.color,
      group: fila.parentName ? pantryCategoryLabel({ key: fila.parentKey, name: fila.parentName }, (key) => this.i18n.t(key)) : undefined
    }));
  }

  /** Lleva a la despensa con el nombre escrito en la busqueda: la ficha no es donde se mueve el stock. */
  protected verEnLaDespensa(): void {
    void this.router.navigate(['/pantry'], { queryParams: { buscar: this.ficha?.name ?? '' } });
  }

  protected elegirCategoria(valor: string | null): void {
    this.formulario.category = valor ?? 'other';
  }

  protected elegirUnidad(valor: string | null): void {
    this.formulario.unit = (valor ?? 'unit') as MeasurementUnit;
  }

  protected anadirAlias(): void {
    const resultado = normalizarAlias(this.aliasNuevo, this.formulario.name, this.formulario.aliases);
    if (!resultado) {
      this.toast.warning(this.i18n.t('pantry.aliases'), this.i18n.t('pantry.aliases_ayuda'));
      this.aliasNuevo = '';
      return;
    }
    if ('error' in resultado) {
      // `repetido` y `vacio` no merecen un aviso: el alias no se anade y el cuadro se queda como estaba, que es
      // lo que la persona queria decir. `es-el-nombre` si: ahi se esta intentando llamar a la ficha por dos
      // nombres a la vez, y eso hay que decirlo.
      if (resultado.error === 'es-el-nombre') {
        this.error = this.i18n.t('pantry.error_alias_de_otro', { alias: this.aliasNuevo.trim() });
        return;
      }
      this.aliasNuevo = '';
      return;
    }
    this.formulario.aliases = [...this.formulario.aliases, resultado.valor];
    this.aliasNuevo = '';
  }

  protected quitarAlias(alias: string): void {
    this.formulario.aliases = this.formulario.aliases.filter((previo) => previo !== alias);
  }

  protected async guardar(): Promise<void> {
    const nombre = this.formulario.name.trim();
    this.error = '';
    this.errorNombre = '';
    if (!nombre) {
      this.errorNombre = this.i18n.t('pantry.el_nombre_es_requerido');
      return;
    }
    const entrada = {
      name: nombre,
      category: this.formulario.category,
      unit: this.formulario.unit,
      notes: this.formulario.notes.trim() || null,
      aliases: this.formulario.aliases,
      ...(this.formulario.expirationDate ? { expirationDate: this.formulario.expirationDate } : { expirationDate: null })
    };
    this.guardando = true;
    const resultado = this.esNueva
      ? await this.pantry.createProduct({ ...entrada, quantity: Number(this.formulario.quantity) || 0 })
      : await this.pantry.updateProduct(this.ficha!.id, entrada);
    this.guardando = false;
    if (!resultado.ok) {
      this.error = this.frase(resultado);
      return;
    }
    this.toast.success(this.i18n.t(this.esNueva ? 'pantry.producto_registrado' : 'pantry.producto_guardado'));
    await this.volver();
  }

  private frase(resultado: { error: string; message: string; details?: unknown }): string {
    const t = (clave: Parameters<I18nService['t']>[0], params?: Record<string, string | number>) => this.i18n.t(clave, params);
    const detalles = (resultado.details ?? {}) as { alias?: string; quantity?: number };
    switch (resultado.error) {
      case 'PANTRY_PRODUCT_ALIAS_CLASH':
        return t('pantry.error_alias_de_otro', { alias: detalles.alias ?? '' });
      case 'PANTRY_CATEGORY_UNKNOWN':
        return t('pantry.error_categoria_desconocida');
      case 'PANTRY_PRODUCT_IN_PANTRY':
        return t('pantry.error_en_despensa', { cantidad: String(detalles.quantity ?? '') });
      case 'NETWORK':
        return t('ui.sin_conexion');
      default:
        return resultado.message || t('ui.no_se_ha_podido');
    }
  }

  protected async borrar(fila: PantryProduct): Promise<void> {
    const aceptado = await this.confirm.confirm({
      title: this.i18n.t('pantry.eliminar_producto'),
      message: `${this.i18n.t('pantry.confirmar_borrar_producto', { name: fila.name })} ${this.i18n.t('pantry.impacto_borrar_producto')}`,
      confirmText: this.i18n.t('common.delete'),
      cancelText: this.i18n.t('common.cancel'),
      variant: 'danger'
    });
    if (!aceptado) return;
    const resultado = await this.pantry.deleteProduct(fila.id);
    if (!resultado.ok) {
      this.toast.error(this.i18n.t('ui.no_se_ha_podido'), this.frase(resultado));
      return;
    }
    this.toast.success(this.i18n.t('pantry.producto_borrado'));
    if (this.ficha) await this.volver();
    else await this.refrescar();
  }

  /**
   * El lote se anuncia con el impacto del server, no con una cuenta hecha aqui: «4 de los seleccionados tienen
   * stock dentro» tiene que ser verdad en el momento de pulsar, y eso solo lo sabe el server. Si alguno
   * estorba, no se borra ninguno —el contrato de `bulk-delete` es todo-o-nada—, y la pantalla lo dice en vez de
   * dejar una seleccion a medias.
   */
  protected async borrarLote(): Promise<void> {
    const ids = [...this.seleccion];
    const impacto = await this.pantry.bulkProductImpact(ids);
    if (!impacto) {
      this.toast.error(this.i18n.t('ui.no_se_ha_podido'));
      return;
    }
    if (!impacto.canDelete) {
      this.toast.warning(
        this.i18n.t('pantry.borrar_seleccionados'),
        this.i18n.t('pantry.error_lote_bloqueado', { n: impacto.blocked.length })
      );
      return;
    }
    const aceptado = await this.confirm.confirm({
      title: this.i18n.t('pantry.borrar_seleccionados'),
      message: this.i18n.t('pantry.impacto_borrar_producto'),
      confirmText: this.i18n.t('common.delete'),
      cancelText: this.i18n.t('common.cancel'),
      variant: 'danger'
    });
    if (!aceptado) return;
    const resultado: PantryRequest<{ deleted: number }> = await this.pantry.bulkDeleteProducts(ids);
    if (!resultado.ok) {
      this.toast.error(this.i18n.t('ui.no_se_ha_podido'), this.frase(resultado));
      return;
    }
    this.seleccion = [];
    this.toast.success(this.i18n.t('pantry.n_productos_borrados', { n: resultado.data.deleted }));
    await this.refrescar();
  }

  /**
   * Volver. El boton vive en la cabecera de las DOS pantallas, o sea que las dos tienen que llevar a algun
   * lado: de la ficha a la lista, y de la lista al inventario. Antes estaba guardado por «esto es una ficha?»,
   * que en la lista es falso, y el resultado era un boton que no hacia nada —lo que se oyo fue «el boton de
   * volver al inventario no funciona»—. Se decide por la URL (existe el segmento `:id`?), no por el estado:
   * `ficha` se muda durante el guardado y del borrado, y «volver» tiene que significar lo mismo en los dos
   * momentos de la misma pantalla.
   */
  protected async volver(): Promise<void> {
    if (this.route.snapshot.paramMap.has('id')) {
      await this.router.navigate(['../'], { relativeTo: this.route });
      return;
    }
    await this.router.navigate(['/pantry']);
  }
}
