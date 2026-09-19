import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ShoppingService } from '../../core/services/shopping.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import {
  CreateItemInput,
  LIST_CATEGORIES,
  ShoppingListItem,
  formatMoney,
  formatQuantity,
  groupItemsByCategory,
  parseMoneyToMinor
} from '../../shared/models/shopping.model';
import { LongPressDirective, SwipeRowDirective } from '../../shared/directives/swipe-row.directive';

/** Autoguardado: 400 ms despues del ultimo tecleo, ni antes ni despues. */
const AUTOSAVE_MS = 400;
const UNDO_MS = 6000;
const UNITS = ['ud', 'kg', 'g', 'L', 'ml', 'pack'] as const;

/**
 * La lista, en pantalla.
 *
 * Es la pantalla donde el gesto importa: el pulgar desliza, marca y se va. Por eso
 * el orden visual es el de la tienda (las secciones agrupan), la casilla ocupa todo
 * el golpeteo facil, y ninguna accion vive solo en el gesto: el riel descubierto
 * muestra `Editar · Quitar`, y la ⋯ muestra lo mismo sin deslizar nada.
 */
@Component({
  selector: 'app-shopping-list-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SwipeRowDirective, LongPressDirective],
  template: `
    <div class="detail">
      <header class="detail__head">
        <a class="detail__back" routerLink="/shopping" aria-label="Volver a las listas">←</a>
        <div class="detail__heading">
          @if (renaming()) {
            <input
              class="detail__rename"
              name="listName"
              [(ngModel)]="draftName"
              (ngModelChange)="renameList()"
              maxlength="80"
              autofocus
            />
          } @else {
            <h1 class="detail__title" (click)="startRename()">
              {{ list()?.name ?? 'Lista' }}
              <span class="detail__pencil" aria-hidden="true">✎</span>
            </h1>
          }
          <p class="detail__meta">
            <span>{{ checkedCount() }}/{{ totalCount() }} compradas</span>
            @if (list()?.store) {
              <span class="detail__chip">{{ list()?.store }}</span>
            }
            <span class="detail__chip detail__chip--money">{{ money(estimate()?.totalMinor ?? 0) }}</span>
            @if (unpricedCount() > 0) {
              <span class="detail__chip detail__chip--warn">{{ unpricedCount() }} sin precio</span>
            }
          </p>
        </div>
        <span class="detail__status" [class.detail__status--busy]="saving()" aria-live="polite">
          {{ saving() ? 'Guardando…' : 'Guardado' }}
        </span>
      </header>

      <form class="detail__add" (ngSubmit)="addItem()">
        <input
          class="detail__add-input"
          data-test="add-input"
          name="newItem"
          [(ngModel)]="draftItem"
          placeholder="Añadir: 2 Leche, 1kg Tomates…"
          autocomplete="off"
          enterkeyhint="done"
        />
        <button type="submit" class="detail__add-btn" data-test="add-submit" [disabled]="!draftItem.trim()">Añadir</button>
        <button type="button" class="detail__ghost" data-test="paste-open" (click)="pasteOpen.set(!pasteOpen())" data-gesture-stop>
          Pegar
        </button>
      </form>

      @if (pasteOpen()) {
        <div class="detail__paste">
          <textarea
            data-test="paste-input"
            name="pasteText"
            rows="4"
            [(ngModel)]="draftPaste"
            placeholder="- 2 Leche&#10;- 1kg Tomates&#10;Pan de molde"
          ></textarea>
          <div class="detail__paste-actions">
            <span class="detail__hint">Una linea por producto; admite «2 Leche» o «1kg Tomates».</span>
            <button type="button" class="detail__primary" data-test="paste-submit" (click)="paste()" [disabled]="!draftPaste.trim()">
              Añadir a la lista
            </button>
          </div>
        </div>
      }

      <nav class="detail__tabs" aria-label="Filtro de lineas">
        <button
          type="button"
          class="detail__tab"
          data-test="tab-todo"
          [class.detail__tab--active]="tab() === 'todo'"
          (click)="selectTab('todo')"
        >
          Pendientes ({{ pendingCount() }})
        </button>
        <button
          type="button"
          class="detail__tab"
          data-test="tab-cart"
          [class.detail__tab--active]="tab() === 'checked'"
          (click)="selectTab('checked')"
        >
          En el carro ({{ checkedCount() }})
        </button>
        <button type="button" class="detail__ghost detail__tab-all" (click)="toggleSelectAll()">
          {{ selection().length > 0 ? 'Quitar selección' : 'Seleccionar todo' }}
        </button>
      </nav>

      @if (loading()) {
        <p class="detail__empty">Cargando la lista…</p>
      } @else if (visibleItems().length === 0) {
        <p class="detail__empty">
          {{
            tab() === 'todo'
              ? 'Nada pendiente. Si has pegado la lista de la semana, ya esta todo en el carro.'
              : 'Aun no has marcado nada como comprado.'
          }}
        </p>
      } @else {
        <ul class="detail__groups">
          @for (group of groups(); track group.category) {
            <li class="detail__group">
              <h2 class="detail__group-title">{{ group.category }}</h2>
              <ul class="detail__rows">
                @for (item of group.items; track item.id) {
                  <li
                    class="detail__row"
                    [class.detail__row--checked]="item.checked === 1"
                    [class.detail__row--selected]="isSelected(item.id)"
                    [appSwipeRow]="selection().length > 0"
                    (swipeRemove)="remove(item)"
                    (swipePlus)="plus(item)"
                    (gestureEnded)="noteGesture()"
                    data-test="item-row"
                  >
                    <div class="detail__rail" aria-hidden="true">
                      <button type="button" class="detail__rail-btn" data-test="rail-edit" (click)="openEdit(item)">Editar</button>
                      <button
                        type="button"
                        class="detail__rail-btn detail__rail-btn--danger"
                        data-test="rail-remove"
                        (click)="remove(item)"
                      >
                        Quitar
                      </button>
                    </div>
                    <div
                      class="detail__face"
                      appLongPress
                      [longPressDisabled]="selection().length > 0"
                      (longPress)="onLongPress(item)"
                      (click)="onTap(item)"
                    >
                      <button
                        type="button"
                        class="detail__check"
                        data-test="check"
                        data-gesture-stop
                        role="checkbox"
                        [attr.aria-checked]="item.checked === 1"
                        [attr.aria-label]="'Marcar ' + item.name"
                        (click)="toggle(item); $event.stopPropagation()"
                      >
                        @if (item.checked === 1) {
                          <span aria-hidden="true">✓</span>
                        }
                      </button>
                      <span class="detail__name">{{ item.name }}</span>
                      @if (qtyOf(item)) {
                        <span class="detail__qty">{{ qtyOf(item) }}</span>
                      }
                      <span class="detail__price" [class.detail__price--none]="item.price_minor === null">
                        {{ money(item.price_minor) }}
                      </span>
                      <button
                        type="button"
                        class="detail__more"
                        data-gesture-stop
                        aria-label="Acciones de la linea"
                        (click)="openEdit(item); $event.stopPropagation()"
                      >
                        ⋯
                      </button>
                    </div>
                  </li>
                }
              </ul>
            </li>
          }
        </ul>
      }

      <footer class="detail__bar">
        <div class="detail__totals">
          <span class="detail__totals-money" data-test="total">{{ money(estimate()?.totalMinor ?? 0) }}</span>
          <button type="button" class="detail__link" (click)="estimateOpen.set(!estimateOpen())">
            {{ estimateOpen() ? 'Ocultar desglose' : 'Ver desglose' }}
          </button>
        </div>
        <div class="detail__bar-actions">
          <button type="button" class="detail__ghost" (click)="clearChecked()" [disabled]="checkedCount() === 0">
            Vaciar carro
          </button>
          <button type="button" class="detail__primary" data-test="complete" (click)="complete()">Terminar compra</button>
        </div>
      </footer>

      @if (estimateOpen() && estimate(); as data) {
        <ul class="detail__estimate">
          @for (line of data.lines; track line.itemId) {
            <li class="detail__estimate-row">
              <span>{{ line.name }}</span>
              <span class="detail__estimate-src">{{ sourceLabel(line.source) }}</span>
              <span class="detail__estimate-money">{{ money(line.lineTotalMinor) }}</span>
            </li>
          }
        </ul>
      }

      @if (selection().length > 0) {
        <div class="detail__selection" data-test="selection-toolbar" role="toolbar" aria-label="Acciones de la seleccion">
          <span class="detail__selection-count">{{ selection().length }} seleccionadas</span>
          <button type="button" class="detail__ghost" data-test="bulk-check" (click)="bulkCheck(true)">Marcar comprado</button>
          <button type="button" class="detail__ghost" data-test="bulk-remove" (click)="bulkRemove()">Quitar</button>
          <button type="button" class="detail__ghost" (click)="selection.set([])">Cancelar</button>
        </div>
      }

      @if (editing(); as item) {
        <div class="detail__sheet-backdrop" (click)="closeEdit()">
          <section class="detail__sheet" data-test="edit-sheet" (click)="$event.stopPropagation()" aria-label="Editar linea">
            <h2 class="detail__sheet-title">{{ item.name }}</h2>
            <div class="detail__sheet-grid">
              <label class="detail__field">
                <span>Cantidad</span>
                <input
                  name="qty"
                  type="number"
                  min="0"
                  step="0.1"
                  [ngModel]="draft.quantity"
                  (ngModelChange)="patch({ quantity: $event })"
                />
              </label>
              <label class="detail__field">
                <span>Precio por unidad</span>
                <input
                  name="price"
                  data-test="price-input"
                  inputmode="decimal"
                  placeholder="1,95"
                  [ngModel]="draft.price"
                  (ngModelChange)="patchPrice($event)"
                  (blur)="commitPrice()"
                />
              </label>
            </div>
            <div class="detail__chips" role="group" aria-label="Unidad">
              @for (unit of units; track unit) {
                <button
                  type="button"
                  class="detail__chip-btn"
                  [class.detail__chip-btn--active]="draft.unit === unit"
                  (click)="patch({ unit: draft.unit === unit ? null : unit })"
                >
                  {{ unit }}
                </button>
              }
            </div>
            <label class="detail__field">
              <span>Seccion de la tienda</span>
              <select name="category" [ngModel]="draft.category" (ngModelChange)="patch({ category: $event })">
                <option [ngValue]="null">Sin seccion</option>
                @for (category of categories; track category) {
                  <option [ngValue]="category">{{ category }}</option>
                }
              </select>
            </label>
            <label class="detail__field">
              <span>Nota</span>
              <input
                name="note"
                placeholder="Semidesnatada, la de siempre"
                [ngModel]="draft.note"
                (ngModelChange)="patch({ note: $event })"
                maxlength="120"
              />
            </label>
            <div class="detail__sheet-actions">
              <button type="button" class="detail__ghost detail__ghost--danger" (click)="remove(item)">Quitar linea</button>
              <button type="button" class="detail__primary" (click)="closeEdit()">Hecho</button>
            </div>
            <p class="detail__hint">Los cambios se guardan solos, sin boton de guardar.</p>
          </section>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .detail {
        padding: var(--space-4) var(--space-4) var(--space-16);
        max-width: 760px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .detail__head {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: start;
        gap: var(--space-3);
      }
      .detail__back {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: var(--radius-full);
        background: var(--bg-secondary);
        border: 1px solid var(--border-default);
        color: var(--text-primary);
        text-decoration: none;
        font-size: var(--text-lg);
      }
      .detail__title {
        font-family: var(--font-display);
        font-size: var(--text-xl);
        font-weight: var(--font-bold);
        color: var(--text-primary);
        display: flex;
        align-items: center;
        gap: var(--space-2);
        cursor: pointer;
      }
      .detail__pencil {
        font-size: var(--text-sm);
        color: var(--text-tertiary);
      }
      .detail__rename {
        width: 100%;
        border: 1px solid var(--border-strong);
        border-radius: var(--radius-md);
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-size: var(--text-lg);
        padding: var(--space-2);
      }
      .detail__meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-2);
        margin-top: var(--space-1);
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
      .detail__chip {
        padding: 2px var(--space-2);
        border-radius: var(--radius-full);
        background: var(--bg-tertiary);
        font-size: var(--text-xs);
      }
      .detail__chip--money {
        background: var(--success-subtle);
        color: var(--success);
      }
      .detail__chip--warn {
        background: var(--warning-subtle);
        color: var(--warning);
      }
      .detail__status {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
        white-space: nowrap;
      }
      .detail__status--busy {
        color: var(--primary);
      }
      .detail__add {
        display: flex;
        gap: var(--space-2);
        align-items: center;
      }
      .detail__add-input {
        flex: 1;
        min-width: 0;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        background: var(--bg-secondary);
        color: var(--text-primary);
        padding: var(--space-3);
        font-size: var(--text-base);
        min-height: 48px;
      }
      .detail__add-btn,
      .detail__primary {
        border: none;
        border-radius: var(--radius-lg);
        background: var(--primary);
        color: var(--white);
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        padding: var(--space-3) var(--space-4);
        min-height: 48px;
        cursor: pointer;
      }
      .detail__add-btn:disabled,
      .detail__primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .detail__ghost {
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-size: var(--text-sm);
        padding: var(--space-2) var(--space-3);
        min-height: 44px;
        cursor: pointer;
      }
      .detail__ghost:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .detail__ghost--danger {
        color: var(--error);
      }
      .detail__paste {
        display: grid;
        gap: var(--space-2);
        padding: var(--space-3);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-xl);
        background: var(--bg-secondary);
      }
      .detail__paste textarea {
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        background: var(--bg-primary);
        color: var(--text-primary);
        padding: var(--space-2);
        font-size: var(--text-sm);
        font-family: inherit;
        resize: vertical;
      }
      .detail__paste-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }
      .detail__hint {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      .detail__tabs {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }
      .detail__tab {
        border: 1px solid var(--border-default);
        background: var(--bg-secondary);
        color: var(--text-secondary);
        border-radius: var(--radius-full);
        padding: var(--space-2) var(--space-3);
        font-size: var(--text-sm);
        cursor: pointer;
      }
      .detail__tab--active {
        background: var(--primary);
        border-color: var(--primary);
        color: var(--white);
      }
      .detail__tab-all {
        margin-left: auto;
        font-size: var(--text-xs);
      }
      .detail__empty {
        padding: var(--space-6);
        border: 1px dashed var(--border-default);
        border-radius: var(--radius-xl);
        text-align: center;
        color: var(--text-secondary);
        font-size: var(--text-sm);
      }
      .detail__groups,
      .detail__rows {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .detail__group {
        list-style: none;
      }
      .detail__group-title {
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        letter-spacing: var(--tracking-wider);
        text-transform: uppercase;
        color: var(--text-tertiary);
        margin: var(--space-3) 0 var(--space-2);
      }
      .detail__row {
        position: relative;
        border-radius: var(--radius-lg);
        overflow: hidden;
        background: var(--bg-tertiary);
      }
      .detail__rail {
        position: absolute;
        inset: 0 0 0 auto;
        display: flex;
        align-items: stretch;
      }
      .detail__rail-btn {
        border: none;
        width: 84px;
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-size: var(--text-sm);
        font-weight: var(--font-medium);
        cursor: pointer;
      }
      .detail__rail-btn--danger {
        background: var(--error);
        color: var(--white);
      }
      .detail__face {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
        min-height: 56px;
        background: var(--bg-secondary);
        border-radius: var(--radius-lg);
        transform: translateX(var(--swipe-x, 0px));
        transition: transform var(--duration-200) var(--ease-out);
        touch-action: pan-y;
        user-select: none;
      }
      .swipe-row--dragging .detail__face {
        transition: none;
      }
      .swipe-row--armed .detail__face {
        background: var(--error);
        color: var(--white);
      }
      .detail__check {
        flex: none;
        width: 30px;
        height: 30px;
        border-radius: var(--radius-full);
        border: 1.5px solid var(--border-strong);
        background: transparent;
        color: var(--white);
        display: grid;
        place-items: center;
        cursor: pointer;
        font-size: var(--text-sm);
      }
      .detail__row--checked .detail__check {
        background: var(--success);
        border-color: var(--success);
      }
      .detail__name {
        flex: 1;
        min-width: 0;
        font-size: var(--text-base);
        color: var(--text-primary);
        overflow-wrap: anywhere;
      }
      .detail__row--checked .detail__name {
        color: var(--text-tertiary);
        text-decoration: line-through;
      }
      .detail__qty {
        flex: none;
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }
      .detail__price {
        flex: none;
        font-size: var(--text-sm);
        font-variant-numeric: tabular-nums;
        color: var(--text-primary);
      }
      .detail__price--none {
        color: var(--warning);
      }
      .detail__more {
        flex: none;
        border: none;
        background: transparent;
        color: var(--text-tertiary);
        font-size: var(--text-lg);
        line-height: 1;
        padding: var(--space-1) var(--space-2);
        cursor: pointer;
      }
      .detail__row--selected .detail__face {
        outline: 2px solid var(--primary);
        outline-offset: -2px;
      }
      .detail__bar {
        position: sticky;
        bottom: calc(var(--bottom-nav-height) + var(--space-2));
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        flex-wrap: wrap;
        padding: var(--space-3);
        background: var(--bg-secondary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow-md);
      }
      .detail__totals {
        display: flex;
        align-items: baseline;
        gap: var(--space-2);
      }
      .detail__totals-money {
        font-family: var(--font-display);
        font-size: var(--text-xl);
        font-weight: var(--font-bold);
        font-variant-numeric: tabular-nums;
      }
      .detail__link {
        border: none;
        background: transparent;
        color: var(--primary);
        font-size: var(--text-xs);
        cursor: pointer;
        text-decoration: underline;
        padding: 0;
      }
      .detail__bar-actions {
        display: flex;
        gap: var(--space-2);
      }
      .detail__estimate {
        list-style: none;
        margin: 0;
        padding: var(--space-3);
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        background: var(--bg-secondary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        font-size: var(--text-sm);
      }
      .detail__estimate-row {
        display: flex;
        gap: var(--space-2);
        align-items: baseline;
      }
      .detail__estimate-src {
        flex: 1;
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      .detail__estimate-money {
        font-variant-numeric: tabular-nums;
      }
      .detail__selection {
        position: sticky;
        bottom: calc(var(--bottom-nav-height) + var(--space-10));
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
        padding: var(--space-2) var(--space-3);
        background: var(--primary);
        color: var(--white);
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow-lg);
      }
      .detail__selection .detail__ghost {
        background: transparent;
        border-color: transparent;
        color: var(--white);
        min-height: 36px;
      }
      .detail__selection-count {
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
      }
      .detail__sheet-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1200;
        background: rgba(0, 0, 0, 0.45);
        display: flex;
        align-items: flex-end;
      }
      .detail__sheet {
        width: 100%;
        max-width: 560px;
        margin: 0 auto;
        padding: var(--space-4);
        display: grid;
        gap: var(--space-3);
        background: var(--bg-secondary);
        border-radius: var(--radius-2xl) var(--radius-2xl) 0 0;
        animation: sheet-up var(--duration-300) var(--ease-out);
      }
      @keyframes sheet-up {
        from {
          transform: translateY(18px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      .detail__sheet-title {
        font-size: var(--text-lg);
        font-weight: var(--font-semibold);
        color: var(--text-primary);
      }
      .detail__sheet-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-3);
      }
      .detail__field {
        display: grid;
        gap: var(--space-1);
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
      .detail__field input,
      .detail__field select {
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        background: var(--bg-primary);
        color: var(--text-primary);
        padding: var(--space-3);
        font-size: var(--text-base);
        min-height: 48px;
      }
      .detail__chips {
        display: flex;
        gap: var(--space-1);
        flex-wrap: wrap;
      }
      .detail__chip-btn {
        border: 1px solid var(--border-default);
        background: var(--bg-primary);
        color: var(--text-secondary);
        border-radius: var(--radius-full);
        padding: var(--space-2) var(--space-3);
        font-size: var(--text-sm);
        cursor: pointer;
      }
      .detail__chip-btn--active {
        background: var(--primary);
        border-color: var(--primary);
        color: var(--white);
      }
      .detail__sheet-actions {
        display: flex;
        justify-content: space-between;
        gap: var(--space-2);
      }
    `
  ]
})
export class ShoppingListDetailComponent implements OnDestroy {
  private readonly shopping = inject(ShoppingService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);

  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Banderin de un solo uso: el proximo `click` es residual de un gesto. */
  private swallowNextTap = false;
  private gestureAt = 0;

  readonly tab = signal<'todo' | 'checked'>('todo');
  readonly selection = signal<string[]>([]);
  readonly editing = signal<ShoppingListItem | null>(null);
  readonly renaming = signal(false);
  readonly estimateOpen = signal(false);
  readonly pasteOpen = signal(false);

  draftItem = '';
  draftPaste = '';
  draftName = '';
  draft: { quantity: number; unit: string | null; price: string; category: string | null; note: string | null } = {
    quantity: 1,
    unit: null,
    price: '',
    category: null,
    note: null
  };

  readonly units = UNITS;
  readonly categories = LIST_CATEGORIES;
  readonly money = formatMoney;
  readonly listId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  readonly list = computed(() => this.shopping.list());
  readonly loading = computed(() => this.shopping.loadingList());
  readonly saving = computed(() => this.shopping.saving());
  readonly estimate = computed(() => this.shopping.estimate());

  readonly items = computed(() => this.shopping.items());
  readonly visibleItems = computed(() => {
    const want = this.tab() === 'checked' ? 1 : 0;
    return this.items().filter(item => item.checked === want);
  });
  readonly groups = computed(() =>
    this.tab() === 'checked'
      ? [{ category: 'En el carro', items: this.visibleItems() }]
      : groupItemsByCategory(this.visibleItems())
  );
  readonly pendingCount = computed(() => this.items().filter(item => item.checked === 0).length);
  readonly checkedCount = computed(() => this.items().filter(item => item.checked === 1).length);
  readonly totalCount = computed(() => this.items().length);
  readonly unpricedCount = computed(() => this.estimate()?.unpriced.length ?? 0);

  constructor() {
    // Una sola carga inicial: el resto de la pantalla se actualiza con lo que
    // confirma el servidor, y el autoguardado ya se ocupa del resto.
    if (this.listId) this.shopping.loadList(this.listId);
  }

  ngOnDestroy(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }

  selectTab(tab: 'todo' | 'checked'): void {
    this.tab.set(tab);
    this.selection.set([]);
  }

  qtyOf(item: ShoppingListItem): string {
    return formatQuantity(item.quantity, item.unit);
  }

  isSelected(id: string): boolean {
    return this.selection().includes(id);
  }

  // ------------------------------------------------------------- anadir

  async addItem(): Promise<void> {
    const raw = this.draftItem.trim();
    if (!raw) return;
    this.draftItem = '';
    const parsed = this.parseLine(raw);
    await this.shopping.addItem(this.listId, parsed);
  }

  /** `1kg Tomates` / `2 Leche` -> cantidad + unidad antes de llamar al server. */
  private parseLine(raw: string): { name: string; quantity: number; unit: string | null } {
    const cleaned = raw.replace(/^[-•*]\s*/, '');
    const match = /^(\d+(?:[.,]\d+)?)\s*([a-zA-ZÀ-ÿ]{1,4})?\s+(.+)$/.exec(cleaned);
    if (!match) return { name: cleaned, quantity: 1, unit: null };
    const [, amount, maybeUnit, name] = match;
    const unit = (maybeUnit ?? '').toLowerCase();
    const known = (UNITS as readonly string[]).includes(unit) ? unit : null;
    return {
      name: name.trim(),
      quantity: Number.parseFloat(amount.replace(',', '.')) || 1,
      unit: known
    };
  }

  async paste(): Promise<void> {
    const text = this.draftPaste.trim();
    if (!text) return;
    const result = await this.shopping.addLines(this.listId, text);
    if (!result) return;
    this.draftPaste = '';
    this.pasteOpen.set(false);
    const skipped = result.skipped.length;
    this.toast.success(
      `${result.added + result.merged} lineas anadidas`,
      skipped > 0 ? `${skipped} repetidas o vacias se han ignorado.` : 'Revisa las cantidades y los precios.'
    );
  }

  // ------------------------------------------------------------- marcado

  toggle(item: ShoppingListItem): void {
    if (this.selection().length > 0) {
      this.pick(item.id);
      return;
    }
    this.shopping.toggleItem(item.list_id, item);
  }

  onTap(item: ShoppingListItem): void {
    if (this.swallowNextTap) {
      this.swallowNextTap = false;
      if (Date.now() - this.gestureAt < 600) return;
    }
    if (this.selection().length > 0) {
      this.pick(item.id);
      return;
    }
    this.toggle(item);
  }

  /**
   * Soltar un arrastre dispara `click` para el navegador, igual que un toque. Se
   * resuelve con un banderin de un solo uso y no con una ventana de tiempo: en una
   * maquina lenta el click puede llegar 300 ms despues del gesto, y ahi un reloj
   * corto se come el toque siguiente mientras que el banderin, no. El plazo de 600
   * ms solo existe para que un gesto terminado fuera de la fila no deje la fila muda.
   */
  noteGesture(): void {
    this.swallowNextTap = true;
    this.gestureAt = Date.now();
  }

  onLongPress(item: ShoppingListItem): void {
    this.noteGesture();
    if (this.selection().length === 0) this.selection.set([item.id]);
    else this.pick(item.id);
  }

  pick(id: string): void {
    this.selection.update(selected => (selected.includes(id) ? selected.filter(entry => entry !== id) : [...selected, id]));
  }

  toggleSelectAll(): void {
    if (this.selection().length > 0) {
      this.selection.set([]);
      return;
    }
    this.selection.set(this.visibleItems().map(item => item.id));
  }

  async bulkCheck(checked: boolean): Promise<void> {
    const ids = this.selection();
    this.shopping.bulkCheck(this.listId, ids, checked);
    this.selection.set([]);
  }

  async bulkRemove(): Promise<void> {
    const ids = this.selection();
    if (ids.length === 0) return;
    this.shopping.bulkRemove(this.listId, ids);
    this.selection.set([]);
    this.toast.show({
      type: 'info',
      title: `${ids.length} lineas quitadas`,
      duration: UNDO_MS,
      countdown: true,
      position: 'bottom',
      action: {
        label: 'Deshacer',
        run: () => ids.forEach(id => void this.shopping.restoreItem(this.listId, id))
      }
    });
  }

  plus(item: ShoppingListItem): void {
    this.shopping.bumpItem(item.list_id, item);
  }

  remove(item: ShoppingListItem): void {
    const listId = item.list_id;
    void this.shopping.removeItem(listId, item).then(removed => {
      if (!removed) return;
      this.toast.show({
        type: 'info',
        title: `${item.name} quitada`,
        message: 'Tienes 6 segundos para cambiar de opinion.',
        duration: UNDO_MS,
        countdown: true,
        position: 'bottom',
        action: {
          label: 'Deshacer',
          run: () => {
            void this.shopping.restoreItem(listId, item.id);
          }
        }
      });
    });
  }

  async clearChecked(): Promise<void> {
    const items = this.items().filter(item => item.checked === 1);
    if (items.length === 0) return;
    await this.shopping.clearChecked(this.listId);
    this.toast.show({
      type: 'success',
      title: `${items.length} lineas vaciadas`,
      duration: UNDO_MS,
      countdown: true,
      position: 'bottom',
      action: {
        label: 'Deshacer',
        run: () => items.forEach(item => void this.shopping.restoreItem(this.listId, item.id))
      }
    });
  }

  // ------------------------------------------------------- hoja de edicion

  openEdit(item: ShoppingListItem): void {
    this.editing.set(item);
    this.draft = {
      quantity: item.quantity,
      unit: item.unit,
      price: item.price_minor === null ? '' : (item.price_minor / 100).toFixed(2).replace('.', ','),
      category: item.category,
      note: item.note
    };
  }

  closeEdit(): void {
    this.editing.set(null);
  }

  /** Autoguardado con retardo: se escribe cuando dejas de teclear, no a cada letra. */
  patch(changes: Partial<{ quantity: number; unit: string | null; category: string | null; note: string | null }>): void {
    const item = this.editing();
    if (!item) return;
    Object.assign(this.draft, changes);
    this.commit({
      quantity: this.draft.quantity,
      unit: this.draft.unit,
      category: this.draft.category,
      note: this.draft.note,
      priceMinor: parseMoneyToMinor(this.draft.price)
    });
  }

  private commit(patch: Partial<CreateItemInput>): void {
    const item = this.editing();
    if (!item) return;
    this.debounced(`item:${item.id}`, () => {
      this.shopping.updateItem(item.list_id, item, patch);
    });
  }

  patchPrice(value: string): void {
    this.draft.price = value;
    const minor = parseMoneyToMinor(value);
    if (minor === null && value.trim() !== '') return;
    this.commit({ priceMinor: value.trim() === '' ? null : minor });
  }

  commitPrice(): void {
    const item = this.editing();
    if (!item) return;
    const value = this.draft.price.trim();
    const minor = value === '' ? null : parseMoneyToMinor(value);
    if (value !== '' && minor === null) {
      this.toast.warning('Precio no valido', 'Escribe algo como «1,95».');
      return;
    }
    this.flush(`item:${item.id}`);
    this.shopping.updateItem(item.list_id, item, { priceMinor: minor });
  }

  private debounced(key: string, run: () => void): void {
    const pending = this.timers.get(key);
    if (pending) clearTimeout(pending);
    this.timers.set(key, setTimeout(() => {
      this.timers.delete(key);
      run();
    }, AUTOSAVE_MS));
  }

  private flush(key: string): void {
    const pending = this.timers.get(key);
    if (!pending) return;
    clearTimeout(pending);
    this.timers.delete(key);
  }

  // ------------------------------------------------------------ cabecera

  startRename(): void {
    this.draftName = this.list()?.name ?? '';
    this.renaming.set(true);
  }

  renameList(): void {
    const list = this.list();
    const name = this.draftName.trim();
    if (!list || !name || name === list.name) return;
    this.debounced('list:name', () => void this.shopping.renameList(list.id, { name }, list.version));
  }

  async complete(): Promise<void> {
    const list = this.list();
    if (!list) return;
    const total = this.estimate()?.totalMinor ?? 0;
    const unpriced = this.unpricedCount();
    await this.shopping.setStatus(list.id, 'done');
    this.toast.success(
      'Compra terminada',
      unpriced > 0
        ? `${formatMoney(total)} contados y ${unpriced} lineas sin precio.`
        : `${formatMoney(total)} en total. Los precios se quedan para la proxima lista.`
    );
    void this.router.navigate(['/shopping'], { queryParams: { tab: 'hechas' } });
  }

  sourceLabel(source: 'manual' | 'observed' | 'unpriced'): string {
    if (source === 'manual') return 'precio de esta lista';
    if (source === 'observed') return 'ultimo precio pagado';
    return 'sin precio';
  }
}
