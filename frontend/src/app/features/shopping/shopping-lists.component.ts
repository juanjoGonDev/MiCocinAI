import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ShoppingService } from '../../core/services/shopping.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { formatMoney, ListsQuery, ListsSort, ShoppingList } from '../../shared/models/shopping.model';
import { IconComponent } from '../../shared/components/ui/icon/icon.component';
import { IconButtonComponent } from '../../shared/components/ui/icon-button/icon-button.component';
import { PickerComponent, PickerOption } from '../../shared/components/ui/picker/picker.component';

type StatusFilter = 'active' | 'done' | 'all';

const SORT_LABELS: Record<ListsSort, string> = {
  updated: 'Actualizado',
  name: 'Lista',
  total: 'Total',
  lines: 'Lineas'
};

const MIN_TOTALS: PickerOption[] = [
  { value: '', label: 'Cualquier total' },
  { value: '1000', label: 'mas de 10 €', hint: 'cestas medias' },
  { value: '2500', label: 'mas de 25 €' },
  { value: '5000', label: 'mas de 50 €' },
  { value: '10000', label: 'mas de 100 €' }
];

const PAGE_SIZES: PickerOption[] = [
  { value: '10', label: '10 por pagina' },
  { value: '25', label: '25 por pagina' },
  { value: '50', label: '50 por pagina' }
];

/**
 * Bandeja de listas (`/shopping`).
 *
 * Es una TABLA con filtros y paginacion, no una pila infinita de tarjetas: quien revisa
 * el gasto del mes necesita comparar importes por columna, y eso con tarjetas no se hace.
 * Y sigue siendo movil primero — en una pantalla pequena la misma fila se reordena en dos
 * lineas y la accion es un icono, no un boton de texto que se come la mitad del ancho.
 *
 * Estado en la URL: `?tab=&q=&store=&min=&from=&to=&sort=&dir=&page=&size=`. Compartir la
 * pantalla de "las de abril en Mercadona" es mandar un enlace, y volver atras desde una
 * lista devuelve la bandeja como se dejo.
 */
@Component({
  selector: 'app-shopping-lists',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, IconButtonComponent, PickerComponent],
  template: `
    <div class="tray">
      <header class="tray__head">
        <div>
          <h1 class="tray__title">Lista de la compra</h1>
          <p class="tray__subtitle">Cesta por tienda, precio por linea y coste estimado. Se guarda sola.</p>
        </div>
        <div class="tray__head-actions">
          <app-icon-button icon="refresh" label="Actualizar" size="sm" variant="ghost" [spin]="refreshing()" (onClick)="refresh()" />
          <app-icon-button
            [icon]="creating() ? 'close' : 'add'"
            [label]="creating() ? 'Cancelar' : 'Nueva lista'"
            size="sm"
            variant="soft"
            (onClick)="creating.set(!creating())"
            data-test="new-list"
          />
          <button type="button" class="tray__new" (click)="creating.set(!creating())" data-test="new-list-text">
            <app-icon [name]="creating() ? 'close' : 'add'" [size]="18" [label]="null" />
            <span>{{ creating() ? 'Cancelar' : 'Nueva lista' }}</span>
          </button>
        </div>
      </header>

      @if (creating()) {
        <form class="tray__create" (ngSubmit)="create()">
          <label class="tray__field">
            <span>Nombre</span>
            <input
              data-test="list-name"
              name="listName"
              [(ngModel)]="draftName"
              placeholder="Compra semana 38"
              autocomplete="off"
              maxlength="80"
              (keydown.escape)="cancelCreate()"
            />
          </label>
          <label class="tray__field">
            <span>Tienda (opcional)</span>
            <input
              name="listStore"
              data-test="list-store"
              [(ngModel)]="draftStore"
              placeholder="Mercadona"
              autocomplete="off"
              maxlength="60"
              list="tray-known-stores"
              (keydown.escape)="cancelCreate()"
            />
          </label>
          <datalist id="tray-known-stores">
            @for (option of storeOptions(); track option.value) {
              <option [value]="option.value"></option>
            }
          </datalist>
          <div class="tray__create-actions">
            <button type="button" class="tray__ghost" (click)="cancelCreate()">Cancelar</button>
            <button type="submit" class="tray__primary" data-test="create-submit" [disabled]="!draftName.trim() || busy()">
              {{ busy() ? 'Creando…' : 'Crear y abrir' }}
            </button>
          </div>
        </form>
      }

      <nav class="tray__tabs" aria-label="Estado de las listas">
        @for (option of statusOptions; track option.value) {
          <button
            type="button"
            class="tray__tab"
            [class.tray__tab--active]="status() === option.value"
            [attr.aria-current]="status() === option.value ? 'true' : null"
            [attr.data-test]="option.value === 'done' ? 'tab-done' : null"
            (click)="setStatus(option.value)"
          >
            {{ option.label }}
          </button>
        }
        <span class="tray__tabs-spacer"></span>
        <button type="button" class="tray__filter-toggle" [class.tray__filter-toggle--on]="filtersOpen() || activeFilters() > 0" (click)="filtersOpen.set(!filtersOpen())" aria-controls="tray-filters">
          <app-icon name="filter_list" [size]="18" [label]="null" />
          <span>Filtros</span>
          @if (activeFilters() > 0) {
            <span class="tray__filter-count">{{ activeFilters() }}</span>
          }
        </button>
      </nav>

      @if (filtersOpen()) {
        <section class="tray__filters" id="tray-filters">
          <label class="tray__field tray__field--search">
            <app-icon name="search" [size]="18" [label]="null" />
            <input
              name="trayQuery"
              [(ngModel)]="queryDraft"
              (ngModelChange)="applySearch()"
              placeholder="Buscar en listas y productos"
              autocomplete="off"
              data-test="tray-search"
            />
            @if (queryDraft) {
              <button type="button" class="tray__clear" (click)="clearSearch()" aria-label="Quitar la busqueda">
                <app-icon name="close" [size]="16" [label]="null" />
              </button>
            }
          </label>
          <div class="tray__filters-grid">
            <app-picker
              label="Tienda"
              [options]="storeOptions()"
              [value]="store()"
              placeholder="Todas las tiendas"
              [filterFrom]="5"
              (valueChange)="setStore($event)"
            />
            <app-picker
              label="Total minimo"
              [options]="minTotalOptions"
              [value]="minTotal()"
              placeholder="Cualquier total"
              (valueChange)="setMinTotal($event)"
            />
            <label class="tray__field">
              <span>Desde</span>
              <input type="date" name="trayFrom" [ngModel]="from()" (ngModelChange)="setFrom($event)" max="{{ to() || '' }}" />
            </label>
            <label class="tray__field">
              <span>Hasta</span>
              <input type="date" name="trayTo" [ngModel]="to()" (ngModelChange)="setTo($event)" min="{{ from() || '' }}" />
            </label>
          </div>
          @if (activeFilters() > 0) {
            <button type="button" class="tray__ghost" (click)="clearFilters()">
              <app-icon name="delete_sweep" [size]="16" [label]="null" />
              Quitar los {{ activeFilters() }} filtros
            </button>
          }
        </section>
      }

      @if (saving()) {
        <p class="tray__saving" role="status">Guardando…</p>
      }
      @if (liveNote()) {
        <p class="tray__live" role="status" data-test="tray-live">
          <app-icon name="group" [size]="16" [label]="null" />
          {{ liveNote() }}
        </p>
      }

      @if (loading()) {
        <p class="tray__empty">Cargando listas…</p>
      } @else if (lists().length === 0) {
        <section class="tray__empty-card">
          <app-icon name="shopping_basket" [size]="36" [label]="null" />
          <h2 class="tray__empty-title">{{ emptyTitle() }}</h2>
          <p class="tray__empty-text">{{ emptyText() }}</p>
          @if (activeFilters() > 0) {
            <button type="button" class="tray__ghost" (click)="clearFilters()">Quitar los filtros</button>
          } @else if (status() === 'active') {
            <button type="button" class="tray__primary" (click)="creating.set(true)">Empezar una lista</button>
          }
        </section>
      } @else {
        <div class="tray__table" role="table" [attr.aria-label]="'Listas ' + statusLabel()">
          <div class="tray__row tray__row--head" role="row">
            @for (column of columns; track $index) {
              <button
                type="button"
                role="columnheader"
                class="tray__th"
                [class.tray__th--active]="sort() === column.key"
                [attr.aria-sort]="ariaSort(column.key)"
                (click)="sortBy(column.key)"
                [disabled]="!column.key"
              >
                <span>{{ column.label }}</span>
                @if (sort() === column.key) {
                  <app-icon [name]="dir() === 'asc' ? 'expand_less' : 'expand_more'" [size]="16" [label]="null" />
                }
              </button>
            }
          </div>

          @for (list of lists(); track list.id) {
            <div
              class="tray__row"
              role="row"
              [class.tray__row--muted]="list.status !== 'active'"
              [attr.data-test]="'list-row'"
            >
              <div class="tray__cell tray__cell--name" role="cell" data-label="Lista">
                @if (editingId() === list.id) {
                  <div class="tray__edit">
                    <input
                      #renameInput
                      class="tray__edit-input"
                      name="rename-{{ list.id }}"
                      [(ngModel)]="draftTitle"
                      maxlength="80"
                      (keydown.enter)="commitRename(list)"
                      (keydown.escape)="cancelRename()"
                      (blur)="onRenameBlur(list)"
                      data-test="rename-input"
                    />
                    <app-icon-button icon="check" label="Guardar el nombre" size="sm" variant="primary" (onClick)="commitRename(list)" />
                    <app-icon-button icon="close" label="Cancelar" size="sm" variant="ghost" (onClick)="cancelRename()" />
                  </div>
                } @else {
                  <a class="tray__name" [href]="hrefOf(list)" (click)="open(list, $event)" [attr.aria-label]="'Abrir ' + list.name">
                    <span>{{ list.name }}</span>
                  </a>
                  <div class="tray__name-tools">
                    <app-icon-button icon="edit" label="Renombrar" size="sm" (onClick)="startRename(list)" />
                    <app-icon-button icon="chevron_right" label="Abrir" size="sm" (onClick)="open(list, $event)" />
                  </div>
                }
              </div>

              <div class="tray__cell tray__cell--store" role="cell" data-label="Tienda">
                @if (list.store) {
                  <span class="tray__chip">{{ list.store }}</span>
                } @else {
                  <span class="tray__dash" aria-hidden="true">—</span>
                }
              </div>

              <div class="tray__cell tray__cell--progress" role="cell" data-label="Progreso">
                <span class="tray__bar" aria-hidden="true">
                  <span class="tray__bar-fill" [style.width.%]="progressOf(list)"></span>
                </span>
                <span class="tray__fraction">{{ list.checkedItems }}/{{ list.totalItems }}</span>
              </div>

              <div class="tray__cell tray__cell--total" role="cell" data-label="Total">
                <span class="tray__money">{{ money(list.pricedTotalMinor) }}</span>
              </div>

              <div class="tray__cell tray__cell--when" role="cell" data-label="Actualizado">
                <span class="tray__since">{{ since(list.updated_at) }}</span>
              </div>

              <div class="tray__cell tray__cell--actions" role="cell" data-label="Acciones">
                <app-icon-button
                  [icon]="list.status === 'done' ? 'undo' : 'check_circle'"
                  [label]="list.status === 'done' ? 'Reabrir' : 'Terminar lista'"
                  size="sm"
                  [attr.data-test]="'row-done-' + list.id"
                  (onClick)="archive(list)"
                />
                <app-icon-button icon="delete" label="Borrar lista" size="sm" variant="danger" (onClick)="remove(list)" />
              </div>
            </div>
          }
        </div>

        <nav class="tray__pager" aria-label="Paginas de listas">
          <app-icon-button icon="chevron_left" label="Pagina anterior" size="md" variant="soft" [disabled]="!canGoPrev()" (onClick)="go(-1)" />
          <span class="tray__pager-text">{{ rangeLabel() }} de {{ total() }}</span>
          <app-icon-button icon="chevron_right" label="Pagina siguiente" size="md" variant="soft" [disabled]="!canGoNext()" (onClick)="go(1)" />
          <span class="tray__pager-spacer"></span>
          <app-picker label="Tamano de pagina" [options]="pageSizes" [value]="pageSizeValue()" [filterFrom]="99" (valueChange)="setSize($event)" />
        </nav>
      }
    </div>
  `,
  styles: [
    `
      .tray {
        padding: var(--space-4);
        max-width: 1040px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .tray__head {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-3);
      }
      .tray__title {
        font-family: var(--font-display);
        font-size: var(--text-2xl);
        font-weight: var(--font-bold);
        color: var(--text-primary);
      }
      .tray__subtitle {
        margin-top: var(--space-1);
        font-size: var(--text-sm);
        color: var(--text-secondary);
        max-width: 52ch;
      }
      .tray__head-actions {
        display: flex;
        align-items: center;
        gap: var(--space-1);
      }
      .tray__new {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        border: none;
        border-radius: var(--radius-lg);
        background: var(--primary);
        color: var(--white);
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        font-family: inherit;
        padding: var(--space-2) var(--space-3);
        min-height: 40px;
        cursor: pointer;
      }
      /* En el movil el boton de texto sobra: el icono de mas ya dice lo mismo y deja
         leer el titulo. Se oculta el icono suelto, no la accion. */
      @media (max-width: 600px) {
        .tray__head-actions app-icon-button:first-child + app-icon-button {
          display: none;
        }
      }
      @media (min-width: 601px) {
        .tray__new {
          display: none;
        }
      }
      .tray__create {
        display: grid;
        gap: var(--space-3);
        padding: var(--space-4);
        background: var(--bg-secondary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-xl);
      }
      .tray__create-actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-2);
      }
      .tray__field {
        display: grid;
        gap: var(--space-1);
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
      .tray__field input,
      .tray__edit-input {
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        background: var(--bg-primary);
        color: var(--text-primary);
        padding: var(--space-2) var(--space-3);
        font-size: var(--text-sm);
        font-family: inherit;
        min-height: 40px;
      }
      .tray__field--search {
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: var(--space-2);
        padding: 0 var(--space-3);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        background: var(--bg-primary);
        min-height: 40px;
        color: var(--text-tertiary);
      }
      .tray__field--search input {
        border: none;
        background: transparent;
        padding: 0;
        min-height: 38px;
      }
      .tray__field--search input:focus {
        outline: none;
      }
      .tray__clear {
        border: none;
        background: transparent;
        color: var(--text-tertiary);
        cursor: pointer;
        display: inline-flex;
        padding: 2px;
      }
      .tray__tabs {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        padding: var(--space-1);
        background: var(--bg-tertiary);
        border-radius: var(--radius-full);
      }
      .tray__tabs-spacer {
        flex: 1 1 auto;
      }
      .tray__tab {
        border: none;
        background: transparent;
        color: var(--text-secondary);
        border-radius: var(--radius-full);
        padding: var(--space-2) var(--space-3);
        font-size: var(--text-sm);
        font-family: inherit;
        font-weight: var(--font-medium);
        cursor: pointer;
        min-height: 36px;
      }
      .tray__tab--active {
        background: var(--bg-secondary);
        color: var(--text-primary);
        box-shadow: var(--shadow-sm);
      }
      .tray__filter-toggle {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        border: none;
        background: transparent;
        color: var(--text-secondary);
        border-radius: var(--radius-full);
        padding: var(--space-2) var(--space-3);
        font-size: var(--text-sm);
        font-family: inherit;
        cursor: pointer;
        min-height: 36px;
      }
      .tray__filter-toggle--on {
        background: var(--bg-secondary);
        color: var(--primary);
      }
      .tray__filter-count {
        min-width: 18px;
        height: 18px;
        border-radius: var(--radius-full);
        background: var(--primary);
        color: var(--white);
        font-size: 11px;
        line-height: 18px;
        text-align: center;
      }
      .tray__filters {
        display: grid;
        gap: var(--space-2);
        padding: var(--space-3);
        background: var(--bg-secondary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-xl);
        animation: tray-filters-in 0.16s ease-out;
      }
      @keyframes tray-filters-in {
        from {
          opacity: 0;
          transform: translateY(-6px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .tray__filters-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: var(--space-2);
        align-items: end;
      }
      .tray__saving,
      .tray__live {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
        display: flex;
        align-items: center;
        gap: var(--space-1);
      }
      .tray__live {
        color: var(--primary);
      }
      .tray__empty {
        color: var(--text-secondary);
        font-size: var(--text-sm);
      }
      .tray__empty-card {
        display: grid;
        gap: var(--space-2);
        padding: var(--space-6);
        border: 1px dashed var(--border-default);
        border-radius: var(--radius-xl);
        text-align: center;
        justify-items: center;
        color: var(--text-secondary);
        font-size: var(--text-sm);
      }
      .tray__empty-title {
        font-size: var(--text-lg);
        font-weight: var(--font-semibold);
        color: var(--text-primary);
      }
      .tray__table {
        border: 1px solid var(--border-default);
        border-radius: var(--radius-xl);
        background: var(--bg-secondary);
        overflow: hidden;
      }
      .tray__row {
        display: grid;
        grid-template-columns: minmax(160px, 2.2fr) minmax(90px, 1fr) minmax(120px, 1.2fr) minmax(80px, 0.8fr) minmax(84px, 0.8fr) auto;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
        border-bottom: 1px solid var(--border-default);
        position: relative;
      }
      .tray__row:last-child {
        border-bottom: none;
      }
      .tray__row--head {
        background: var(--bg-tertiary);
        padding-block: var(--space-1);
      }
      .tray__row--muted .tray__name {
        color: var(--text-tertiary);
      }
      .tray__th {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        border: none;
        background: transparent;
        padding: var(--space-1) 0;
        font-size: var(--text-xs);
        font-family: inherit;
        font-weight: var(--font-semibold);
        color: var(--text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.02em;
        cursor: pointer;
        justify-self: start;
      }
      .tray__th:disabled {
        cursor: default;
      }
      .tray__th--active {
        color: var(--primary);
      }
      .tray__cell {
        min-width: 0;
        font-size: var(--text-sm);
        color: var(--text-primary);
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }
      .tray__cell--total,
      .tray__cell--when {
        justify-content: flex-end;
        text-align: right;
      }
      .tray__name {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        color: var(--text-primary);
        text-decoration: none;
        font-weight: var(--font-medium);
        min-width: 0;
      }
      .tray__name span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tray__cell--name {
        justify-content: space-between;
      }
      .tray__name-tools {
        display: inline-flex;
        gap: 0;
        opacity: 0;
        transition: var(--transition-fast);
      }
      .tray__row:hover .tray__name-tools,
      .tray__row:focus-within .tray__name-tools {
        opacity: 1;
      }
      .tray__edit {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        width: 100%;
      }
      .tray__edit-input {
        flex: 1 1 auto;
        min-width: 0;
      }
      .tray__chip {
        font-size: var(--text-xs);
        color: var(--text-secondary);
        background: var(--bg-tertiary);
        border-radius: var(--radius-full);
        padding: 2px var(--space-2);
        max-width: 12ch;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tray__dash {
        color: var(--text-tertiary);
      }
      .tray__bar {
        position: relative;
        flex: 1 1 auto;
        height: 6px;
        min-width: 44px;
        border-radius: var(--radius-full);
        background: var(--bg-tertiary);
        overflow: hidden;
      }
      .tray__bar-fill {
        position: absolute;
        inset: 0 auto 0 0;
        background: var(--primary);
        transition: width var(--transition-fast);
      }
      .tray__fraction {
        font-size: var(--text-xs);
        color: var(--text-secondary);
        font-variant-numeric: tabular-nums;
      }
      .tray__money {
        font-weight: var(--font-semibold);
        font-variant-numeric: tabular-nums;
      }
      .tray__since {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
        white-space: nowrap;
      }
      .tray__pager {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
      .tray__pager-text {
        font-variant-numeric: tabular-nums;
      }
      .tray__pager-spacer {
        flex: 1 1 auto;
      }
      .tray__ghost {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        border: 1px solid var(--border-default);
        background: transparent;
        color: var(--text-secondary);
        border-radius: var(--radius-md);
        padding: var(--space-2) var(--space-3);
        font-size: var(--text-sm);
        font-family: inherit;
        cursor: pointer;
        min-height: 38px;
      }
      .tray__primary {
        border: none;
        border-radius: var(--radius-lg);
        background: var(--primary);
        color: var(--white);
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        font-family: inherit;
        padding: var(--space-2) var(--space-4);
        min-height: 40px;
        cursor: pointer;
      }
      .tray__primary:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      /* El movil no tiene seis columnas: la misma fila se convierte en tarjeta de dos
         lineas y cada dato lleva delante la etiqueta que antes estaba en la cabecera. */
      @media (max-width: 720px) {
        .tray__row {
          grid-template-columns: 1fr auto;
          row-gap: var(--space-1);
          padding: var(--space-3);
        }
        .tray__row--head {
          display: none;
        }
        .tray__cell--name {
          grid-column: 1 / -1;
        }
        .tray__cell::before {
          content: attr(data-label);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-tertiary);
          margin-right: var(--space-1);
        }
        .tray__cell--store,
        .tray__cell--total,
        .tray__cell--when {
          justify-content: flex-start;
          text-align: left;
        }
        .tray__cell--actions {
          grid-row: 1;
          grid-column: 2;
        }
        .tray__name-tools {
          opacity: 1;
        }
      }
    `
  ]
})
export class ShoppingListsComponent {
  private readonly shopping = inject(ShoppingService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'active', label: 'Activas' },
    { value: 'done', label: 'Terminadas' },
    { value: 'all', label: 'Todas' }
  ];
  readonly minTotalOptions = MIN_TOTALS;
  readonly pageSizes = PAGE_SIZES;
  /** `key` vacia = columna que no se ordena (tienda y acciones). */
  readonly columns: { key: ListsSort | ''; label: string }[] = [
    { key: 'name', label: 'Lista' },
    { key: '', label: 'Tienda' },
    { key: 'lines', label: 'Progreso' },
    { key: 'total', label: 'Total' },
    { key: 'updated', label: 'Actualizado' },
    { key: '', label: '' }
  ];
  readonly pageSizeValue = computed(() => String(this.size()));

  readonly creating = signal(false);
  readonly busy = signal(false);
  readonly refreshing = signal(false);
  readonly filtersOpen = signal(false);
  readonly status = signal<StatusFilter>('active');
  queryDraft = '';
  readonly search = signal('');
  readonly store = signal<string | null>(null);
  readonly minTotal = signal<string | null>(null);
  readonly from = signal<string | null>(null);
  readonly to = signal<string | null>(null);
  readonly sort = signal<ListsSort>('updated');
  readonly dir = signal<'asc' | 'desc'>('desc');
  readonly page = signal(0);
  readonly size = signal(25);
  readonly editingId = signal<string | null>(null);
  readonly liveNote = signal<string | null>(null);
  draftName = '';
  draftStore = '';
  draftTitle = '';

  /** Para no comerse el commit del `blur` cuando lo que se pulsado es «cancelar». */
  private cancelingRename = false;

  readonly lists = computed(() => this.shopping.lists());
  readonly loading = computed(() => this.shopping.loadingLists());
  readonly saving = computed(() => this.shopping.saving());
  readonly money = formatMoney;

  readonly total = computed(() => this.shopping.listsMeta().total);
  readonly storeOptions = computed<PickerOption[]>(() =>
    this.shopping.stores().map((entry) => ({ value: entry.store, label: entry.store, hint: `${entry.lists} listas` }))
  );

  constructor() {
    this.readUrl();
    this.reload();
    this.shopping.loadStores();
    // La bandeja es la pantalla que se queda abierta mientras otra persona compra: sin
    // SSE habria que adivinar cuando volver a mirar.
    const close = this.shopping.openStream('lists', () => {
      this.reload();
      this.liveNote.set('Alguien del hogar ha tocado las listas');
      setTimeout(() => this.liveNote.set(null), 6000);
    });
    this.destroyRef.onDestroy(close);
  }

  // ------------------------------------------------------------- estado / URL

  private readUrl(): void {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status') ?? params.get('tab');
    if (status === 'hechas' || status === 'done') this.status.set('done');
    else if (status === 'all' || status === 'todas') this.status.set('all');
    const query = params.get('q');
    if (query) {
      this.queryDraft = query;
      this.search.set(query);
    }
    const store = params.get('store');
    if (store) this.store.set(store);
    const min = params.get('min');
    if (min) this.minTotal.set(min);
    const from = params.get('from');
    if (from) this.from.set(from);
    const to = params.get('to');
    if (to) this.to.set(to);
    const sort = params.get('sort') as ListsSort | null;
    if (sort && sort in SORT_LABELS) this.sort.set(sort);
    const dir = params.get('dir');
    if (dir === 'asc' || dir === 'desc') this.dir.set(dir);
    const page = Number(params.get('page'));
    if (Number.isFinite(page) && page >= 0) this.page.set(page);
    const size = Number(params.get('size'));
    if (size === 10 || size === 25 || size === 50) this.size.set(size);
    this.filtersOpen.set(this.activeFilters() > 0);
  }

  private writeUrl(): void {
    const params: Record<string, string | null> = {
      status: this.status() === 'active' ? null : this.status(),
      q: this.search() || null,
      store: this.store() || null,
      min: this.minTotal() || null,
      from: this.from() || null,
      to: this.to() || null,
      sort: this.sort() === 'updated' ? null : this.sort(),
      dir: this.dir() === 'desc' ? null : this.dir(),
      page: this.page() === 0 ? null : String(this.page()),
      size: this.size() === 25 ? null : String(this.size())
    };
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
  }

  private query(): ListsQuery {
    return {
      status: this.status(),
      q: this.search() || undefined,
      store: this.store() || undefined,
      minTotalMinor: this.minTotal() ? Number(this.minTotal()) : undefined,
      from: this.from() || undefined,
      to: this.to() || undefined,
      sort: this.sort(),
      dir: this.dir(),
      limit: this.size(),
      offset: this.page() * this.size()
    };
  }

  private reload(): void {
    this.shopping.loadLists(this.query());
  }

  refresh(): void {
    this.refreshing.set(true);
    this.shopping.loadStores();
    this.reload();
    setTimeout(() => this.refreshing.set(false), 500);
  }

  // ------------------------------------------------------------------ filtros

  setStatus(status: StatusFilter): void {
    if (this.status() === status) return;
    this.status.set(status);
    this.page.set(0);
    this.writeUrl();
    this.reload();
  }

  /** Se filtra al escribir, pero con una pausa: buscar "leche" no son cinco busquedas. */
  private searchTimer?: ReturnType<typeof setTimeout>;
  applySearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.search.set(String(this.queryDraft ?? '').trim());
      this.page.set(0);
      this.writeUrl();
      this.reload();
    }, 250);
  }

  clearSearch(): void {
    this.queryDraft = '';
    this.search.set('');
    this.writeUrl();
    this.reload();
  }

  setStore(value: string | null): void {
    this.store.set(value || null);
    this.page.set(0);
    this.writeUrl();
    this.reload();
  }

  setMinTotal(value: string | null): void {
    this.minTotal.set(value || null);
    this.page.set(0);
    this.writeUrl();
    this.reload();
  }

  setFrom(value: string | null): void {
    this.from.set(value || null);
    this.page.set(0);
    this.writeUrl();
    this.reload();
  }

  setTo(value: string | null): void {
    this.to.set(value || null);
    this.page.set(0);
    this.writeUrl();
    this.reload();
  }

  clearFilters(): void {
    this.queryDraft = '';
    this.search.set('');
    this.store.set(null);
    this.minTotal.set(null);
    this.from.set(null);
    this.to.set(null);
    this.page.set(0);
    this.writeUrl();
    this.reload();
  }

  activeFilters(): number {
    return [this.search(), this.store(), this.minTotal(), this.from(), this.to()].filter(Boolean).length;
  }

  sortBy(key: ListsSort | ''): void {
    if (!key) return;
    if (this.sort() === key) this.dir.set(this.dir() === 'asc' ? 'desc' : 'asc');
    else {
      this.sort.set(key);
      // Nombre se entiende arriba; lo demas, abajo: lo primero que se quiere ver es la
      // cesta mas cara, y la lista mas reciente.
      this.dir.set(key === 'name' ? 'asc' : 'desc');
    }
    this.page.set(0);
    this.writeUrl();
    this.reload();
  }

  ariaSort(key: ListsSort | ''): string | null {
    if (!key || this.sort() !== key) return null;
    return this.dir() === 'asc' ? 'ascending' : 'descending';
  }

  canGoPrev(): boolean {
    return this.page() > 0;
  }

  canGoNext(): boolean {
    return (this.page() + 1) * this.size() < this.total();
  }

  go(step: number): void {
    const next = Math.max(0, this.page() + step);
    if (next === this.page()) return;
    this.page.set(next);
    this.writeUrl();
    this.reload();
  }

  setSize(value: string | null): void {
    const size = Number(value ?? 25);
    if (!Number.isFinite(size) || size <= 0) return;
    this.size.set(size);
    this.page.set(0);
    this.writeUrl();
    this.reload();
  }

  rangeLabel(): string {
    const total = this.total();
    if (!total) return '0';
    const first = this.page() * this.size() + 1;
    const last = Math.min(total, first + this.lists().length - 1);
    return `${first}-${last}`;
  }

  statusLabel(): string {
    return this.statusOptions.find((option) => option.value === this.status())?.label ?? 'listas';
  }

  emptyTitle(): string {
    if (this.activeFilters() > 0) return 'Ninguna lista encaja con los filtros';
    return this.status() === 'active' ? 'Todavia no hay listas' : this.status() === 'done' ? 'Nada en el historial' : 'Ni activas ni terminadas';
  }

  emptyText(): string {
    if (this.activeFilters() > 0) return 'Prueba a quitar la busqueda, la tienda o el rango de fechas.';
    return this.status() === 'active'
      ? 'Crea la primera y manana solo tendras que marcar lo que cae en el carro.'
      : 'Las listas terminadas se guardan aqui con su gasto real.';
  }

  progressOf(list: ShoppingList): number {
    return list.totalItems ? (list.checkedItems / list.totalItems) * 100 : 0;
  }

  // ------------------------------------------------------------- renombrar fila

  startRename(list: ShoppingList): void {
    this.editingId.set(list.id);
    this.draftTitle = list.name;
    this.cancelingRename = false;
  }

  commitRename(list: ShoppingList): void {
    if (this.editingId() !== list.id) return;
    const name = this.draftTitle.trim();
    this.editingId.set(null);
    if (!name || name === list.name) return;
    void this.shopping.renameList(list.id, { name }, list.version).then((updated) => {
      if (updated) this.reload();
      else this.toast.error('No se ha podido renombrar', 'Otra persona cambio la lista. Vuelve a intentarlo.');
    });
  }

  /** Cancelar es lo que pide el cuerpo cuando el input se abre por error. */
  cancelRename(): void {
    this.cancelingRename = true;
    this.editingId.set(null);
    this.draftTitle = '';
    setTimeout(() => (this.cancelingRename = false));
  }

  onRenameBlur(list: ShoppingList): void {
    if (this.cancelingRename) return;
    this.commitRename(list);
  }

  // ------------------------------------------------------------------ acciones

  hrefOf(list: ShoppingList): string {
    return `/shopping/${list.id}`;
  }

  /**
   * Navegacion propia y no `routerLink` para poder prevenir el comportamiento por defecto:
   * el `href` se queda, y asi el boton central del raton y el «abrir en pestana nueva»
   * siguen siendo un enlace normal en vez de un boton disfrazado.
   */
  open(list: ShoppingList, event: Event): void {
    event.preventDefault();
    void this.router.navigate(['/shopping', list.id]);
  }

  cancelCreate(): void {
    this.creating.set(false);
    this.draftName = '';
    this.draftStore = '';
  }

  async create(): Promise<void> {
    const name = this.draftName.trim();
    if (!name || this.busy()) return;
    this.busy.set(true);
    const created = await this.shopping.createList(name, this.draftStore.trim() || null);
    this.busy.set(false);
    if (!created) return;
    this.cancelCreate();
    void this.router.navigate(['/shopping', created.id]);
  }

  /** Terminar una lista si es deshacible: la barra de aviso manda, no el boton. */
  async archive(list: ShoppingList): Promise<void> {
    const wasDone = list.status === 'done';
    await this.shopping.setStatus(list.id, wasDone ? 'active' : 'done');
    this.toast.show({
      type: 'success',
      title: wasDone ? 'Lista reabierta' : 'Lista terminada',
      message: `"${list.name}" ${wasDone ? 'vuelve a activas.' : 'pasa al historial.'}`,
      duration: 6000,
      countdown: true,
      position: 'bottom',
      action: { label: 'Deshacer', run: () => void this.shopping.setStatus(list.id, wasDone ? 'done' : 'active') }
    });
  }

  /** Borrar una lista NO es deshacible (sus lineas se van): por eso pide confirmacion. */
  async remove(list: ShoppingList): Promise<void> {
    const accepted = await this.confirm.confirm({
      title: '¿Borrar esta lista?',
      message: `Se borran "${list.name}" y sus ${list.totalItems} lineas. Los precios guardados se conservan.`,
      confirmText: 'Borrar',
      variant: 'danger'
    });
    if (!accepted) return;
    await this.shopping.deleteList(list.id);
    this.toast.info('Lista borrada', 'El historial de precios sigue intacto.');
  }

  since(value: string): string {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
    if (minutes < 1) return 'ahora';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    return `hace ${Math.round(hours / 24)} d`;
  }
}
