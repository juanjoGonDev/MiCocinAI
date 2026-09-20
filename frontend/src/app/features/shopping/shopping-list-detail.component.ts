import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ShoppingService } from '../../core/services/shopping.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import {
  CreateItemInput,
  DiscountScope,
  MissingPriceLine,
  LIST_CATEGORIES,
  ShoppingListItem,
  formatMoney,
  formatQuantity,
  groupItemsByCategory,
  parseMoneyToMinor,
  describeOffer,
  productKeyOf,
  offerOfItem,
  LineOffer,
  OFFER_PRESETS,
  CompletePriceInput,
  DiscountInput,
  PhotoLine,
} from '../../shared/models/shopping.model';
import { LongPressDirective, SwipeRowDirective } from '../../shared/directives/swipe-row.directive';
import { IconComponent } from '../../shared/components/ui/icon/icon.component';
import { IconButtonComponent } from '../../shared/components/ui/icon-button/icon-button.component';
import { PickerComponent, PickerOption } from '../../shared/components/ui/picker/picker.component';
import { AvatarComponent } from '../../shared/components/ui/avatar/avatar.component';

/** Una linea de la foto con lo que la persona toco: `keep` no existe en el contrato. */
export type KeptPhotoLine = PhotoLine & { keep: boolean };

/** Lo que devuelve `/photo/analyze`, con la marca de que la persona todavia no ha dicho nada. */
interface PhotoReview {
  listId: string;
  mode: 'auto' | 'ticket' | 'shelf';
  currency: string;
  warnings: string[];
  categories: { name: string; color: string }[];
  lines: KeptPhotoLine[];
}

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
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    SwipeRowDirective,
    LongPressDirective,
    IconComponent,
    IconButtonComponent,
    PickerComponent,
    AvatarComponent
  ],
  template: `
    <div class="detail">
      <header class="detail__head">
        <a class="detail__back" routerLink="/shopping" aria-label="Volver a las listas" data-test="back">
          <app-icon name="chevron_left" [size]="22" [label]="null" />
        </a>
        <div class="detail__heading">
          @if (renaming()) {
            <div class="detail__rename-row">
              <input
                class="detail__rename"
                name="listName"
                [(ngModel)]="draftName"
                (ngModelChange)="renameList()"
                maxlength="80"
                (keydown.enter)="commitRename()"
                (keydown.escape)="cancelRename()"
                (blur)="onRenameBlur()"
                data-test="rename-input"
                autofocus
              />
              <app-icon-button icon="check" label="Guardar el nombre" size="sm" variant="primary" (onClick)="commitRename()" />
              <app-icon-button icon="close" label="Cancelar" size="sm" variant="ghost" (onClick)="cancelRename()" />
            </div>
          } @else {
            <h1 class="detail__title" (click)="startRename()" [attr.title]="'Renombrar la lista'">
              {{ list()?.name ?? 'Lista' }}
              <app-icon class="detail__pencil" name="edit" [size]="14" [label]="null" />
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
        <button type="submit" class="detail__add-btn" data-test="add-submit" [disabled]="!draftItem.trim()">
          <app-icon name="add" [size]="18" [label]="null" />
          <span>Añadir</span>
        </button>
        <app-icon-button
          icon="content_paste"
          label="Pegar la lista de otra app"
          size="md"
          variant="soft"
          data-test="paste-open"
          [attr.aria-expanded]="pasteOpen()"
          (onClick)="pasteOpen.set(!pasteOpen())"
        />
        <app-icon-button
          icon="add_a_photo"
          label="Añadir desde una foto"
          size="md"
          variant="soft"
          data-test="photo-open"
          (onClick)="openPhoto()"
        />
        <app-icon-button
          icon="history"
          label="Quien ha tocado que"
          size="md"
          variant="soft"
          [attr.aria-expanded]="auditOpen()"
          (onClick)="toggleAudit()"
        />
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
          <app-icon name="radio_button_unchecked" [size]="16" [label]="null" />
          <span>Pendientes ({{ pendingCount() }})</span>
        </button>
        <button
          type="button"
          class="detail__tab"
          data-test="tab-cart"
          [class.detail__tab--active]="tab() === 'checked'"
          (click)="selectTab('checked')"
        >
          <app-icon name="shopping_cart" [size]="16" [label]="null" />
          <span>En el carro ({{ checkedCount() }})</span>
        </button>
        <span class="detail__tabs-spacer"></span>
        <app-icon-button
          [icon]="selection().length > 0 ? 'close' : 'select_all'"
          [label]="selection().length > 0 ? 'Quitar la seleccion' : 'Seleccionar todo'"
          size="sm"
          variant="soft"
          data-test="select-all"
          (onClick)="toggleSelectAll()"
        />
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
              <h2 class="detail__group-title">
                <span class="detail__group-dot" [style.background]="colorOf(group.category)" aria-hidden="true"></span>
                {{ group.category }}
              </h2>
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
                      <button type="button" class="detail__rail-btn" data-test="rail-edit" (click)="openEdit(item)">
                        <app-icon name="edit" [size]="18" [label]="null" />
                        <span>Editar</span>
                      </button>
                      <button
                        type="button"
                        class="detail__rail-btn detail__rail-btn--danger"
                        data-test="rail-remove"
                        (click)="remove(item)"
                      >
                        <app-icon name="delete" [size]="18" [label]="null" />
                        <span>Quitar</span>
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
                        <app-icon
                          [name]="item.checked === 1 ? 'shopping_cart' : 'radio_button_unchecked'"
                          [size]="22"
                          [label]="null"
                        />
                      </button>
                      <span class="detail__name">{{ item.name }}</span>
                      @if (qtyOf(item)) {
                        <span class="detail__qty">{{ qtyOf(item) }}</span>
                      }
                      @if (offerOf(item); as offer) {
                        <button
                          type="button"
                          class="detail__offer"
                          data-test="offer-chip"
                          [attr.title]="'Oferta ' + describeOffer(offer) + ': toca para quitarla'"
                          (click)="setOffer(item, null); $event.stopPropagation()"
                        >
                          {{ describeOffer(offer) }}
                        </button>
                      }
                      <span class="detail__price" [class.detail__price--none]="item.price_minor === null">
                        {{ money(item.price_minor) }}
                      </span>
                      @if (item.updated_by_name || item.added_by_name) {
                        <span class="detail__who" [attr.title]="'Ultimo cambio: ' + (item.updated_by_name ?? item.added_by_name)">
                          {{ initials(item.updated_by_name ?? item.added_by_name) }}
                        </span>
                      }
                      <button
                        type="button"
                        class="detail__more"
                        aria-label="Acciones de la linea"
                        (click)="openEdit(item); $event.stopPropagation()"
                      >
                        <app-icon name="more_vert" [size]="20" [label]="null" />
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
        <!-- Un boton con texto, no un icono suelto: «el porcentaje» es el ultimo sitio donde
             alguien busca el descuento que no encuentra, y aqui se ha pedido tres veces. Con
             texto en la barra se ve tambien CUANDO no hay ninguno, que es el caso por defecto. -->
        <div class="detail__bar-actions">
          <button
            type="button"
            class="detail__discount"
            [class.detail__discount--on]="!!list()?.discount"
            data-test="discount-open"
            (click)="openDiscount()"
          >
            <app-icon name="percent" [size]="16" [label]="null" />
            <span>{{ discountSummary() }}</span>
          </button>
          <app-icon-button
            icon="delete_sweep"
            label="Vaciar el carro"
            size="md"
            variant="soft"
            [disabled]="checkedCount() === 0"
            (onClick)="clearChecked()"
          />
          <button type="button" class="detail__ghost detail__ghost--text" (click)="clearChecked()" [disabled]="checkedCount() === 0">
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
          <button type="button" class="detail__ghost" data-test="bulk-discount" (click)="openDiscountForSelection()">
            <app-icon name="percent" [size]="16" [label]="null" />
            Descuento
          </button>
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
            <div class="detail__sheet-grid">
              <div class="detail__field">
                <span class="detail__field-label">Unidad</span>
                <div class="detail__chips" role="group" aria-label="Unidades rapidas">
                  @for (unit of quickUnits; track unit) {
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
                <app-picker
                  label="Unidad o formato"
                  [options]="unitOptions"
                  [value]="draft.unit"
                  placeholder="Otra unidad (bote de 400 g…)"
                  searchPlaceholder="Buscar unidad"
                  emptyText="Nada parecido: usa el texto que has escrito"
                  [allowCustom]="true"
                  [filterFrom]="6"
                  leadingIcon="unfold_more"
                  (valueChange)="patch({ unit: $event })"
                  data-test="unit-picker"
                />
              </div>
              <div class="detail__field">
                <span class="detail__field-label">Seccion de la tienda</span>
                <app-picker
                  label="Seccion"
                  [options]="categoryOptions()"
                  [value]="draft.category"
                  placeholder="Sin seccion"
                  searchPlaceholder="Buscar seccion"
                  emptyText="No existe: se creara con ese nombre"
                  [allowCustom]="true"
                  (valueChange)="setCategory($event)"
                  data-test="category-picker"
                />
              </div>
            </div>
            <div class="detail__field">
              <span class="detail__field-label">Oferta de la tienda</span>
              <div class="detail__chips" role="group" aria-label="Ofertas">
                @for (preset of offerPresets; track preset.label) {
                  <button
                    type="button"
                    class="detail__chip-btn"
                    [class.detail__chip-btn--active]="isOffer(preset)"
                    [attr.title]="preset.hint"
                    data-test="offer-preset"
                    (click)="setDraftOffer(preset)"
                  >
                    <app-icon name="local_offer" [size]="14" [label]="null" />
                    {{ preset.label }}
                  </button>
                }
                @if (draftOffer()) {
                  <button type="button" class="detail__chip-btn detail__chip-btn--muted" (click)="setDraftOffer(null)">
                    <app-icon name="close" [size]="14" [label]="null" />
                    Sin oferta
                  </button>
                }
              </div>
              <p class="detail__hint">
                {{ draftOffer() ? 'Se pagan ' + (draftOffer()!.buy - draftOffer()!.take) + ' de cada ' + draftOffer()!.buy + ': el desglose ya lo descuenta.' : 'Sin oferta: se paga cada unidad.' }}
              </p>
            </div>
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
            <div class="detail__field" data-test="product-link">
              <span class="detail__field-label">
                <app-icon name="link" [size]="14" [label]="null" />
                Es el mismo producto que
              </span>
              @if (item.product_key && item.product_key !== keyOf(item.name)) {
                <div class="detail__chips">
                  <span class="detail__chip detail__chip--linked" data-test="product-link-current">{{ item.product_key }}</span>
                  <button type="button" class="detail__link" data-test="product-link-clear" (click)="unlinkProduct(item)">
                    <app-icon name="link_off" [size]="14" [label]="null" />
                    Quitar el enlace
                  </button>
                </div>
              }
              <app-picker
                label="Productos con precio anotado"
                [options]="productLinkOptions()"
                [value]="item.product_key"
                placeholder="Busca entre lo que ya has pagado"
                searchPlaceholder="Buscar producto"
                emptyText="Nada aun: en cuanto anotes un precio aparecera aqui"
                leadingIcon="local_offer"
                (valueChange)="linkProduct(item, $event)"
                data-test="product-link-picker"
              />
              @if (linkVariants(item); as variants) {
                <p class="detail__hint" data-test="product-link-variants">{{ variants }}</p>
              }
            </div>
            <div class="detail__sheet-actions">
              <button type="button" class="detail__ghost detail__ghost--danger" (click)="remove(item)">Quitar linea</button>
              <button type="button" class="detail__primary" (click)="closeEdit()">Hecho</button>
            </div>
            <p class="detail__hint">Los cambios se guardan solos, sin boton de guardar.</p>
          </section>
        </div>
      }

      @if (discountOpen()) {
        <div class="detail__sheet-backdrop" (click)="discountOpen.set(false)">
          <section class="detail__sheet" data-test="discount-sheet" (click)="$event.stopPropagation()" aria-label="Descuento de la lista">
            <h2 class="detail__sheet-title">Descuento de la lista</h2>
<app-icon-button class="detail__sheet-x" icon="close" label="Cerrar sin cambiar el descuento" size="sm" variant="ghost" data-test="discount-close" (onClick)="discountOpen.set(false)" />
            <p class="detail__hint">
              El importe o el porcentaje se aplica a la cesta; con «primeras unidades» o
              «productos concretos», solo a lo que entre, y se reparte en proporcion a lo que
              pesa cada linea. Lo que no cuadra se dice: un descuento mayor que lo que cubre se
              recorta, no devuelve dinero.
            </p>
            <div class="detail__chips" role="group" aria-label="Tipo de descuento">
              @for (kind of discountKinds; track kind.value) {
                <button
                  type="button"
                  class="detail__chip-btn"
                  [class.detail__chip-btn--active]="discountDraft().kind === kind.value"
                  data-test="discount-kind"
                  (click)="setDiscountKind(kind.value)"
                >
                  <app-icon [name]="kind.icon" [size]="16" [label]="null" />
                  {{ kind.label }}
                </button>
              }
            </div>
            <div class="detail__sheet-grid">
              <label class="detail__field">
                <span>{{ discountDraft().kind === 'percent' ? 'Porcentaje' : 'Importe (€)' }}</span>
                @if (discountDraft().kind === 'percent') {
                  <app-picker
                    label="Porcentaje"
                    [options]="percentOptions"
                    [value]="percentDraft()"
                    placeholder="Escribe el porcentaje"
                    [allowCustom]="true"
                    [filterFrom]="99"
                    (valueChange)="setPercent($event)"
                    data-test="discount-percent"
                  />
                } @else {
                  <input
                    name="discountValue"
                    inputmode="decimal"
                    placeholder="3,50"
                    [ngModel]="amountDraft()"
                    (ngModelChange)="amountDraft.set($event)"
                    (blur)="commitAmount()"
                    data-test="discount-amount"
                  />
                }
              </label>
              <label class="detail__field">
                <span>Etiqueta (opcional)</span>
                <input
                  name="discountLabel"
                  placeholder="Fidelidad -5 %"
                  maxlength="60"
                  [ngModel]="discountDraft().label"
                  (ngModelChange)="patchDiscount({ label: $event || null })"
                />
              </label>
            </div>
            <div class="detail__field">
              <span class="detail__field-label">A que se aplica</span>
              <div class="detail__chips" role="group" aria-label="Alcance del descuento">
                @for (scope of discountScopes; track scope.value) {
                  <button
                    type="button"
                    class="detail__chip-btn"
                    [class.detail__chip-btn--active]="discountDraft().scope === scope.value"
                    [attr.title]="scope.hint"
                    data-test="discount-scope"
                    (click)="patchDiscount({ scope: scope.value })"
                  >
                    {{ scope.label }}
                  </button>
                }
              </div>
              @if (discountDraft().scope === 'product' || discountDraft().scope === 'category') {
                <div class="detail__targets" data-test="discount-targets">
                  <div class="detail__targets-head">
                    <span>{{ discountDraft().scope === 'category' ? 'Que pasillos entran' : 'Que lineas entran' }}</span>
                    <button type="button" class="detail__link" data-test="discount-targets-all" (click)="toggleAllTargets()">
                      {{ allTargetsSelected() ? 'Quitar todas' : 'Elegir todas' }}
                    </button>
                  </div>

                  @if (discountDraft().targets.length) {
                    <div class="detail__chips" role="list" aria-label="Elegidas">
                      @for (target of discountDraft().targets; track target) {
                        <button
                          type="button"
                          class="detail__chip-btn detail__chip-btn--active"
                          role="listitem"
                          [attr.aria-label]="'Quitar ' + target + ' del descuento'"
                          [attr.data-test]="'discount-target-chip-' + target"
                          (click)="toggleTarget(target)"
                        >
                          {{ target }}
                          <app-icon name="close" [size]="12" [label]="null" />
                        </button>
                      }
                    </div>
                  }

                  @if (discountDraft().scope === 'category') {
                    <div class="detail__chips" role="group" aria-label="Secciones de la lista">
                      @for (option of discountTargetOptions(); track option.value) {
                        <button
                          type="button"
                          class="detail__chip-btn"
                          [class.detail__chip-btn--active]="isTargetSelected(option.label)"
                          role="checkbox"
                          [attr.aria-checked]="isTargetSelected(option.label)"
                          [attr.data-test]="'discount-target-' + slug(option.value)"
                          (click)="toggleTarget(option.label)"
                        >
                          {{ option.label }}
                          <span class="detail__chip-hint">{{ option.hint }}</span>
                        </button>
                      }
                    </div>
                  } @else {
                    <ul class="detail__target-list" data-test="discount-target-list">
                      @for (option of discountTargetOptions(); track option.value) {
                        <li>
                          <button
                            type="button"
                            class="detail__target-row"
                            [class.is-on]="isTargetSelected(option.label)"
                            role="checkbox"
                            [attr.aria-checked]="isTargetSelected(option.label)"
                            [attr.data-test]="'discount-target-' + slug(option.value)"
                            (click)="toggleTarget(option.label)"
                          >
                            <app-icon
                              [name]="isTargetSelected(option.label) ? 'check_box' : 'check_box_outline_blank'"
                              [size]="20"
                              [label]="null"
                            />
                            <span class="detail__target-dot" [style.background]="option.color ?? 'transparent'"></span>
                            <span class="detail__target-name">{{ option.label }}</span>
                            <span class="detail__target-hint">{{ option.hint }}</span>
                          </button>
                        </li>
                      }
                      @if (!discountTargetOptions().length) {
                        <li class="detail__target-empty">La lista esta vacia: anade las lineas primero, o escribe el nombre abajo.</li>
                      }
                    </ul>
                  }

                  <div class="detail__target-add">
                    <input
                      name="targetAdd"
                      [ngModel]="targetDraft()"
                      (ngModelChange)="targetDraft.set($event)"
                      (keyup.enter)="addTarget()"
                      placeholder="Otro nombre (p. ej. jamon cocido)"
                      maxlength="80"
                      data-test="discount-target-input"
                    />
                    <button
                      type="button"
                      class="detail__ghost"
                      [disabled]="!targetDraft().trim()"
                      data-test="discount-target-add"
                      (click)="addTarget()"
                    >
                      <app-icon name="add" [size]="16" [label]="null" />
                      Anadir
                    </button>
                  </div>
                  <p class="detail__hint">
                    Se compara el nombre normalizado: «Jamon» no arrastra a «jamon curado», para
                    que un descuento no se aplique a lineas que nadie eligio.
                  </p>
                </div>
              }
              @if (discountDraft().scope === 'firstUnits') {
                <div class="detail__first-units">
                  <span>Primeras unidades</span>
                  <div class="detail__stepper">
                    <app-icon-button icon="remove" label="Quitar una unidad" size="sm" variant="soft" (onClick)="bumpFirstUnits(-1)" />
                    <input
                      name="firstUnits"
                      type="number"
                      min="1"
                      step="1"
                      [ngModel]="discountDraft().firstUnits ?? 1"
                      (ngModelChange)="setFirstUnits($event)"
                      data-test="discount-first-units"
                    />
                    <app-icon-button icon="add" label="Anadir una unidad" size="sm" variant="soft" (onClick)="bumpFirstUnits(1)" />
                  </div>
                </div>
              }
            </div>
            <div class="detail__sheet-actions">
              @if (list()?.discount) {
                <button type="button" class="detail__ghost detail__ghost--danger" data-test="discount-remove" (click)="removeDiscount()">
                  <app-icon name="delete" [size]="16" [label]="null" />
                  Quitar descuento
                </button>
              }
              <button type="button" class="detail__primary" data-test="discount-save" (click)="saveDiscount()">Guardar</button>
            </div>
          </section>
        </div>
      }

      @if (payOpen()) {
        <div class="detail__sheet-backdrop" (click)="closePay()">
          <section class="detail__sheet detail__sheet--wide" data-test="pay-sheet" (click)="$event.stopPropagation()" aria-label="Precios pagados por tienda">
            <h2 class="detail__sheet-title">Cuanto has pagado</h2>
            <app-icon-button
              class="detail__sheet-x"
              icon="close"
              label="Cerrar sin terminar la compra"
              size="sm"
              variant="ghost"
              data-test="pay-close"
              (onClick)="closePay()"
            />
            <p class="detail__hint">
              Se guarda por establecimiento y con el nombre que usa esa tienda: es lo que hace
              que la proxima lista en Mercadona sepa cuanto cuesta ahi el pan, en vez de
              recordar lo que valia en Lidl en marzo.
            </p>

            <div class="detail__field">
              <span class="detail__field-label">
                <app-icon name="storefront" [size]="14" [label]="null" />
                Establecimiento
              </span>
              @if (storeChips().length) {
                <div class="detail__chips" role="group" aria-label="Tiendas de esta casa">
                  @for (store of storeChips(); track store) {
                    <button
                      type="button"
                      class="detail__chip-btn"
                      [class.detail__chip-btn--active]="payStore().trim() === store"
                      [attr.data-test]="'pay-store-' + store"
                      (click)="choosePayStore(store)"
                    >
                      {{ store }}
                    </button>
                  }
                </div>
              }
              <input
                name="payStore"
                [ngModel]="payStore()"
                (ngModelChange)="setPayStore($event)"
                placeholder="Mercadona"
                maxlength="80"
                data-test="pay-store"
              />
              @if (payStoreError()) {
                <p class="detail__hint detail__hint--warn" data-test="pay-store-error">
                  Sin tienda no se guarda: un precio sin establecimiento no se puede volver a usar.
                </p>
              }
            </div>

            <ul class="detail__pay">
              @for (line of payLines(); track line.itemId) {
                <li class="detail__pay-row" [class.detail__pay-row--empty]="!payValue(line.itemId).trim()">
                  <div class="detail__pay-head">
                    <span class="detail__pay-name">{{ line.name }}</span>
                    <span class="detail__pay-qty">{{ line.quantity }}{{ line.unit ? ' ' + line.unit : '' }}</span>
                  </div>
                  @if (paySuggestion(line.itemId); as hint) {
                    <button
                      type="button"
                      class="detail__pay-suggest"
                      [attr.data-test]="'pay-suggest-' + line.itemId"
                      (click)="usePaySuggestion(line.itemId, hint.minor)"
                    >
                      <app-icon name="history" [size]="14" [label]="null" />
                      Usar {{ money(hint.minor) }} <span *ngIf="hint.store">({{ hint.store }})</span>
                    </button>
                  }
                  <div class="detail__pay-money">
                    <input
                      inputmode="decimal"
                      [placeholder]="payMode(line.itemId) === 'unit' ? '1,95 por unidad' : '3,90 en total'"
                      [ngModel]="payValue(line.itemId)"
                      (ngModelChange)="setPayValue(line.itemId, $event)"
                      [attr.data-test]="'pay-price-' + line.itemId"
                    />
                    <button type="button" class="detail__link" [attr.data-test]="'pay-mode-' + line.itemId" (click)="togglePayMode(line.itemId)">
                      {{ payMode(line.itemId) === 'unit' ? '€/unidad' : 'total pagado' }}
                    </button>
                  </div>
                  <input
                    class="detail__pay-alias"
                    [name]="'payAlias' + line.itemId"
                    [ngModel]="payAlias(line.itemId)"
                    (ngModelChange)="setPayAlias(line.itemId, $event)"
                    placeholder="Como se llama aqui (opcional)"
                    maxlength="120"
                    [attr.data-test]="'pay-alias-' + line.itemId"
                  />
                </li>
              }
            </ul>

            <div class="detail__sheet-actions">
              <button type="button" class="detail__ghost" data-test="pay-cancel" (click)="closePay()">Cancelar</button>
              <button
                type="button"
                class="detail__primary"
                data-test="pay-confirm"
                [disabled]="payMissing() > 0"
                (click)="finishPurchase()"
              >
                <app-icon name="done_all" [size]="16" [label]="null" />
                Guardar y terminar
              </button>
            </div>
            <p class="detail__hint" data-test="pay-foot">
              @if (payMissing() > 0) {
                Faltan {{ payMissing() }} {{ payMissing() === 1 ? 'linea' : 'lineas' }} por anotar ·
              }
              total {{ money(payTotal()) }} · lo que no se escribe aqui no entra en el historial.
            </p>
          </section>
        </div>
      }

      @if (photoOpen()) {
        <div class="detail__sheet-backdrop" (click)="closePhoto()">
          <section class="detail__sheet detail__sheet--wide" data-test="photo-sheet" (click)="$event.stopPropagation()" aria-label="Anadir desde una foto">
            <h2 class="detail__sheet-title">Desde una foto</h2>
<app-icon-button class="detail__sheet-x" icon="close" label="Cerrar la foto" size="sm" variant="ghost" data-test="photo-close" (onClick)="closePhoto()" />
            <p class="detail__hint">
              La foto la mira el modelo de IA configurado; aqui se repasa antes de escribir nada.
              Puedes cancelar cuantas veces quieras: la lista no cambia hasta que digas «Anadir».
            </p>

            <label class="detail__photo-drop" [class.detail__photo-drop--ready]="photoPreview()"> data-test="photo-drop">
              <input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" name="photoFile" (change)="onPhotoFile($event)" />
              @if (photoPreview()) {
                <img [src]="photoPreview()" alt="Foto que se va a analizar" />
              } @else {
                <app-icon name="add_a_photo" [size]="28" [label]="null" />
                <span>Foto del ticket o de la estanteria</span>
              }
            </label>

            <div class="detail__sheet-grid">
              <div class="detail__field">
                <span class="detail__field-label">Que es la foto</span>
                <app-picker label="Modo" [options]="photoModes" [value]="photoMode()" (valueChange)="setPhotoMode($event)" data-test="photo-mode" />
              </div>
              <label class="detail__field">
                <span>Nota para el modelo (opcional)</span>
                <input
                  name="photoNote"
                  placeholder="Es del chino, los precios son por pack"
                  maxlength="280"
                  [ngModel]="photoNote()"
                  (ngModelChange)="photoNote.set($event)"
                />
              </label>
            </div>

            @if (photoError()) {
              <p class="detail__photo-error" role="alert" data-test="photo-error">
                <app-icon name="error_outline" [size]="18" [label]="null" />
                <span>{{ photoError() }}</span>
                @if (photoRedirect()) {
                  <a class="detail__link" [routerLink]="photoRedirect()">Configurar la IA</a>
                }
              </p>
            }

            @if (photoBusy()) {
              <p class="detail__photo-busy" role="status"><app-icon name="refresh" [size]="16" [label]="null" /> Mirando la foto…</p>
            }

            @if (photoResult(); as result) {
              <ul class="detail__photo-lines">
                @for (line of result.lines; track $index) {
                  <li class="detail__photo-line" [class.detail__photo-line--off]="!line.keep">
                    <button
                      type="button"
                      class="detail__photo-keep"
                      role="checkbox"
                      [attr.aria-checked]="line.keep"
                      [attr.aria-label]="'Anadir ' + line.name"
                      (click)="line.keep = !line.keep"
                    >
                      <app-icon [name]="line.keep ? 'check_circle' : 'radio_button_unchecked'" [size]="20" [label]="null" />
                    </button>
                    <input class="detail__photo-name" name="photoName{{ $index }}" [ngModel]="line.name" (ngModelChange)="line.name = $event" maxlength="80" />
                    <input class="detail__photo-qty" name="photoQty{{ $index }}" type="number" min="0" step="0.1" [ngModel]="line.quantity" (ngModelChange)="setLineQuantity(line, $event)" />
                    <input
                      class="detail__photo-price"
                      name="photoPrice{{ $index }}"
                      inputmode="decimal"
                      placeholder="precio"
                      [ngModel]="minorToInput(line.priceMinor)"
                      (ngModelChange)="setLinePrice(line, $event)"
                    />
                    <span class="detail__photo-cat" [style.color]="colorOf(line.category)">
                      {{ line.category ?? 'sin seccion' }}
                      @if (line.createCategory) {
                        <span class="detail__photo-new">nueva</span>
                      }
                    </span>
                    @if (line.confidence !== undefined && line.confidence < 0.6) {
                      <span class="detail__photo-doubt" title="La IA no esta segura">baja confianza</span>
                    }
                  </li>
                }
              </ul>
              @if (result.warnings.length) {
                <ul class="detail__photo-warnings">
                  @for (warning of result.warnings; track $index) {
                    <li>{{ warning }}</li>
                  }
                </ul>
              }
              <div class="detail__sheet-actions">
                <button type="button" class="detail__ghost" (click)="analyzePhoto()">Otro intento</button>
                <button
                  type="button"
                  class="detail__primary"
                  data-test="photo-apply"
                  [disabled]="keptPhotoLines().length === 0 || photoApplying()"
                  (click)="applyPhoto()"
                >
                  {{ photoApplying() ? 'Anadiendo…' : 'Anadir ' + keptPhotoLines().length + ' lineas' }}
                </button>
              </div>
            } @else {
              <div class="detail__sheet-actions">
                <button type="button" class="detail__primary" data-test="photo-analyze" [disabled]="!photoData() || photoBusy()" (click)="analyzePhoto()">
                  {{ photoData() ? 'Analizar la foto' : 'Elige una foto' }}
                </button>
              </div>
            }
          </section>
        </div>
      }

      @if (auditOpen()) {
        <div class="detail__sheet-backdrop" (click)="auditOpen.set(false)">
          <section class="detail__sheet" data-test="audit-sheet" (click)="$event.stopPropagation()" aria-label="Quien ha tocado que">
            <h2 class="detail__sheet-title">Quien ha tocado que</h2>
<app-icon-button class="detail__sheet-x" icon="close" label="Cerrar el historial" size="sm" variant="ghost" data-test="audit-close" (onClick)="auditOpen.set(false)" />
            @if (events().length === 0) {
              <p class="detail__hint">Todavia no hay nada anotado en esta lista.</p>
            } @else {
              <ul class="detail__audit">
                @for (event of events(); track event.id) {
                  <li class="detail__audit-row" data-test="audit-row">
                    <app-avatar [name]="event.user_name ?? 'Alguien'" size="sm" />
                    <span class="detail__audit-text">{{ event.description }}</span>
                    <span class="detail__audit-when">{{ since(event.created_at) }}</span>
                  </li>
                }
              </ul>
            }
            <p class="detail__hint">Se actualiza solo mientras la pantalla esta abierta.</p>
          </section>
        </div>
      }
    </div>
  `,
  styles: [
    `

      .detail__group-title {
        display: flex;
        align-items: center;
        gap: var(--space-1);
      }
      .detail__group-dot {
        width: 8px;
        height: 8px;
        border-radius: var(--radius-full);
        /* Sin seccion conocida el punto no se pinta: un gris inventado pareceria un dato. */
        background: var(--bg-tertiary);
      }
      .detail__rename-row {
        display: flex;
        align-items: center;
        gap: var(--space-1);
      }
      .detail__rename-row .detail__rename {
        flex: 1 1 auto;
        min-width: 0;
      }
      .detail__tabs-spacer {
        flex: 1 1 auto;
      }
      .detail__tab {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
      }
      .detail__tab-count {
        min-width: 18px;
        padding: 0 4px;
        border-radius: var(--radius-full);
        background: var(--bg-tertiary);
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        color: var(--text-secondary);
      }
      .detail__check {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--text-tertiary);
      }
      .detail__row--checked .detail__check {
        color: var(--primary);
      }
      .detail__offer {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        border: none;
        background: var(--color-warning-50, rgba(201, 154, 46, 0.16));
        color: var(--warning, #b06e00);
        border-radius: var(--radius-full);
        padding: 1px 7px;
        font-size: 11px;
        font-weight: var(--font-semibold);
        font-family: inherit;
        cursor: pointer;
      }
      .detail__who {
        min-width: 22px;
        height: 22px;
        border-radius: var(--radius-full);
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        font-size: 10px;
        font-weight: var(--font-bold);
        display: inline-grid;
        place-items: center;
      }
      .detail__field-label {
        font-size: var(--text-xs);
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .detail__chip-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .detail__chip-btn--muted {
        color: var(--text-tertiary);
      }
      .detail__sheet--wide {
        max-width: 640px;
      }
      /* El picker del descuento se abre dentro de la hoja, que tiene su propio scroll;
         sin margen el panel tapa la linea de acciones. */
      .detail__target {
        margin-top: var(--space-2);
      }
      .detail__first-units {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        margin-top: var(--space-2);
        font-size: var(--text-sm);
      }
      .detail__stepper {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
      }
      .detail__stepper input {
        width: 62px;
        text-align: center;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        background: var(--bg-primary);
        color: var(--text-primary);
        min-height: 36px;
        font-family: inherit;
        font-size: var(--text-sm);
      }
      .detail__discount {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        border: 1px dashed var(--primary);
        background: transparent;
        color: var(--primary);
        border-radius: var(--radius-full);
        padding: 3px var(--space-2);
        font-size: var(--text-xs);
        font-family: inherit;
        cursor: pointer;
      }
      .detail__ghost--text {
        display: none;
      }
      @media (min-width: 721px) {
        .detail__ghost--text {
          display: none;
        }
      }
      .detail__photo-drop {
        position: relative;
        display: grid;
        gap: var(--space-1);
        justify-items: center;
        align-items: center;
        min-height: 132px;
        padding: var(--space-3);
        border: 1px dashed var(--border-strong);
        border-radius: var(--radius-xl);
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        font-size: var(--text-sm);
        cursor: pointer;
        overflow: hidden;
      }
      .detail__photo-drop input[type='file'] {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }
      .detail__photo-drop img {
        max-height: 200px;
        max-width: 100%;
        border-radius: var(--radius-lg);
        object-fit: contain;
      }
      .detail__photo-drop--ready {
        border-style: solid;
        border-color: var(--primary);
      }
      .detail__photo-error {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin: 0;
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-md);
        background: var(--color-error-50, rgba(224, 90, 90, 0.12));
        color: var(--error);
        font-size: var(--text-sm);
      }
      .detail__photo-busy {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
      .detail__photo-lines {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--space-1);
      }
      .detail__photo-line {
        display: grid;
        grid-template-columns: auto minmax(90px, 1.6fr) 62px 82px minmax(70px, 1fr);
        align-items: center;
        gap: var(--space-1);
        padding: var(--space-1) 0;
        border-bottom: 1px solid var(--border-default);
      }
      .detail__photo-line--off {
        opacity: 0.45;
      }
      .detail__photo-line input {
        border: 1px solid transparent;
        border-radius: var(--radius-sm);
        background: transparent;
        color: var(--text-primary);
        font-family: inherit;
        font-size: var(--text-sm);
        padding: 4px 6px;
        min-width: 0;
      }
      .detail__photo-line input:focus {
        outline: none;
        border-color: var(--primary);
        background: var(--bg-primary);
      }
      .detail__photo-qty,
      .detail__photo-price {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .detail__photo-cat {
        font-size: var(--text-xs);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .detail__photo-new {
        margin-left: 4px;
        color: var(--primary);
        font-size: 10px;
      }
      .detail__photo-doubt {
        font-size: 10px;
        color: var(--warning, #b06e00);
      }
      .detail__photo-keep {
        border: none;
        background: transparent;
        color: inherit;
        cursor: pointer;
        padding: 2px;
        display: inline-flex;
      }
      .detail__photo-warnings {
        margin: 0;
        padding-left: var(--space-4);
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      .detail__audit {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--space-1);
        max-height: 46vh;
        overflow-y: auto;
      }
      .detail__audit-row {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-1) 0;
        border-bottom: 1px solid var(--border-default);
        font-size: var(--text-sm);
      }
      .detail__audit-text {
        min-width: 0;
        color: var(--text-primary);
      }
      .detail__audit-when {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
        white-space: nowrap;
      }
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
      }
      /* El gesto ya ejecuto su accion: 250 ms de silencio para que el click
         residual del arrastre no abra la hoja de una linea recien borrada. */
      .detail__row.swipe-row--busy {
        pointer-events: none;
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
      /* La X arriba a la derecha, no un boton «Cancelar» mas abajo: en una hoja movida
         lo que se busca con el pulgar es el angulo, y el texto largo de un Cancelar
         estrencha el titulo. El backdrop tambien cierra; esto es lo que se ve. */
      .detail__sheet-x {
        position: absolute;
        top: var(--space-2);
        right: var(--space-2);
      }
      .detail__sheet {
        position: relative;
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

      /* ── descuento con varias dianas ─────────────────────────────── */
      /* La fila tocable es de 44 px minimo: quien elige los productos esta en la tienda,
         con una mano y el carrito delante, y una lista compacta de checkboxes es la receta
         para marcar la linea de al lado. */
      .detail__targets {
        display: grid;
        gap: var(--space-2);
        margin-top: var(--space-2);
      }
      .detail__targets-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--space-2);
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
      .detail__target-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 2px;
        max-height: 45vh;
        overflow-y: auto;
        overscroll-behavior: contain;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        background: var(--bg-primary);
      }
      .detail__target-row {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        width: 100%;
        min-height: 44px;
        padding: var(--space-2) var(--space-3);
        border: none;
        border-bottom: 1px solid var(--border-default);
        background: transparent;
        color: var(--text-primary);
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: var(--transition-fast);
      }
      .detail__target-row:last-child {
        border-bottom: none;
      }
      .detail__target-row.is-on {
        background: var(--primary-subtle);
      }
      .detail__target-row:active {
        transform: scale(0.99);
      }
      .detail__target-dot {
        width: 8px;
        height: 8px;
        border-radius: var(--radius-full);
        flex: 0 0 auto;
      }
      .detail__target-name {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .detail__target-hint,
      .detail__chip-hint {
        flex: 0 0 auto;
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      .detail__target-empty {
        padding: var(--space-3);
        font-size: var(--text-sm);
        color: var(--text-tertiary);
      }
      .detail__target-add {
        display: flex;
        gap: var(--space-2);
        align-items: center;
      }
      .detail__target-add input {
        flex: 1 1 auto;
        min-width: 0;
      }
      .detail__discount--on {
        border-style: solid;
        background: var(--primary-subtle);
      }

      /* ── hoja de precios del cierre ────────────────────────────────── */
      .detail__pay {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--space-3);
        max-height: 45vh;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      .detail__pay-row {
        display: grid;
        gap: var(--space-1);
        padding: var(--space-3);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        background: var(--bg-primary);
      }
      .detail__pay-row--empty {
        border-color: var(--warning, #d9822b);
      }
      .detail__pay-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--space-2);
      }
      .detail__pay-name {
        font-weight: 600;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .detail__pay-qty {
        flex: 0 0 auto;
        font-size: var(--text-sm);
        color: var(--text-tertiary);
        font-variant-numeric: tabular-nums;
      }
      .detail__pay-money {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }
      .detail__pay-money input {
        flex: 1 1 auto;
        min-width: 0;
        font-variant-numeric: tabular-nums;
      }
      .detail__pay-suggest {
        justify-self: start;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px var(--space-2);
        border: 1px dashed var(--border-default);
        border-radius: var(--radius-full);
        background: transparent;
        color: var(--text-secondary);
        font: inherit;
        font-size: var(--text-xs);
        cursor: pointer;
        transition: var(--transition-fast);
      }
      .detail__pay-suggest:hover {
        border-style: solid;
        color: var(--primary-dark);
      }
      .detail__pay-alias {
        font-size: var(--text-sm);
      }
      .detail__chip--linked {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px var(--space-2);
        border-radius: var(--radius-full);
        background: var(--primary-subtle);
        color: var(--primary-dark);
        font-size: var(--text-xs);
      }
      .detail__hint--warn {
        color: var(--danger, #c62828);
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
  readonly offerPresets = OFFER_PRESETS;
  readonly describeOffer = describeOffer;

  /** El modelo guarda `promo_buy`/`promo_take`; la UI solo habla de `LineOffer`. */
  offerOf(item: ShoppingListItem): LineOffer | null {
    return offerOfItem(item);
  }

  initials(name: string | null | undefined): string {
    const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
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
    if (this.listId) {
      this.shopping.loadList(this.listId);
      this.shopping.loadCategories();
    }
    // En vivo: si otra persona de la casa toca la lista, se vuelve a leer (nunca se pinta
    // el payload del aviso, que es una pista de refresco, no el estado).
    this.cancelStream = this.shopping.openStream(`lists/${this.listId}`, payload => {
      this.shopping.loadList(this.listId);
      if (this.auditOpen()) this.shopping.loadEvents(this.listId);
      const event = payload as { byName?: string | null; action?: string } | null;
      if (event?.byName) this.liveBy.set(event.byName);
    });
  }

  readonly liveBy = signal<string | null>(null);
  private cancelingRename = false;

  ngOnDestroy(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    this.cancelStream?.();
    this.cancelStream = null;
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
    void this.shopping.removeItem(listId, item).then(() => {
      // La barra sale pase lo que pase con la red: la fila ya no esta en la lista,
      // y dejar a alguien sin forma de devolverla es el peor resultado posible.
      // Si el server nunca se entero, Deshacer restaura una fila viva (404) y el
      // servicio lo cuenta; si se entero, Deshacer hace lo que promete.
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

  /** Al abrir la hoja se traen los productos con precio: el enlace se elige ahi, y no se
   *  puede elegir lo que no se ha cargado. */
  openEdit(item: ShoppingListItem): void {
    void this.shopping.loadKnownProducts();
    // Un ⋯ que llega tarde (el arrastre que lo precedio ya borro la linea) no abre
    // una hoja sobre una fila que ya no existe.
    if (!this.items().some(candidate => candidate.id === item.id)) return;
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
    // Una cantidad que no es positiva se deja en el campo pero no se envia: el
    // contrato la rechaza, y serie ruido de error por cada tecla intermedia.
    if (changes.quantity !== undefined && !(Number(changes.quantity) > 0)) return;
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

  /**
   * Terminar la compra. Decide el server (toda linea comprada necesita precio y tienda), y
   * su rechazo no se traduce a un toast: abre la hoja donde se escriben los precios, porque
   * quien cierra una lista esta de pie en el pasillo con el ticket en la mano, y lo ultimo
   * que necesita es otro sitio al que ir a buscar el boton.
   */
  async complete(): Promise<void> {
    const list = this.list();
    if (!list) return;
    const result = await this.shopping.complete(list.id);
    if (result.ok) {
      this.finishCompleteToast(result.paidMinor, result.pricesRecorded, result.store);
      return;
    }
    if (result.code === 'PRICES_MISSING') {
      this.openPay(result.missing);
      return;
    }
    if (result.code === 'STORE_REQUIRED') {
      this.payOpen.set(true);
      this.payStoreError.set(true);
      return;
    }
    if (result.code === 'STALE_LIST') {
      this.toast.show({ type: 'info', title: 'La lista habia cambiado', message: 'Se ha vuelto a cargar: vuelve a terminar la compra.' });
      this.shopping.loadList(list.id);
    }
  }

  private finishCompleteToast(paidMinor: number, recorded: number, store: string | null): void {
    const total = this.estimate()?.totalMinor ?? 0;
    const unpriced = this.unpricedCount();
    this.toast.success(
      'Compra terminada',
      `${formatMoney(paidMinor || total)} pagados${store ? ' en ' + store : ''} · ${recorded} ${
        recorded === 1 ? 'precio apuntado' : 'precios apuntados'
      }${unpriced > 0 ? ` · ${unpriced} ${unpriced === 1 ? 'linea pendiente' : 'lineas pendientes'} sin precio` : ''}.`
    );
    void this.router.navigate(['/shopping'], { queryParams: { tab: 'hechas' } });
  }

  // ------------------------------------------------ hoja de precios del cierre

  readonly payOpen = signal(false);
  readonly payLines = signal<MissingPriceLine[]>([]);
  readonly payStore = signal('');
  readonly payStoreError = signal(false);
  private payValues = new Map<string, string>();
  private payModes = new Map<string, 'unit' | 'total'>();
  private payAliases = new Map<string, string>();

  readonly storeChips = computed(() => this.shopping.stores().slice(0, 4).map(entry => entry.store));

  /**
   * Se parte de lo que el server ha rechazado, no de toda la lista: las lineas con precio
   * ya estan bien, y volver a pedirlas es desconfiar de quien lo acaba de escribir.
   */
  openPay(missing: MissingPriceLine[]): void {
    this.payLines.set(missing);
    this.payStore.set(this.list()?.store?.trim() ?? '');
    this.payStoreError.set(false);
    for (const line of missing) {
      const suggested = this.paySuggestion(line.itemId);
      if (suggested && !this.payValue(line.itemId).trim()) this.payValues.set(line.itemId, formatMoney(suggested.minor));
    }
    this.payOpen.set(true);
  }

  payValue(itemId: string): string {
    return this.payValues.get(itemId) ?? '';
  }

  setPayValue(itemId: string, value: string | null): void {
    this.payValues.set(itemId, String(value ?? ''));
  }

  setPayStore(value: string | null): void {
    this.payStore.set(String(value ?? ''));
    this.payStoreError.set(false);
  }

  choosePayStore(store: string): void {
    this.setPayStore(store);
  }

  payMode(itemId: string): 'unit' | 'total' {
    return this.payModes.get(itemId) ?? 'unit';
  }

  /**
   * Un ticket dice «3,90 €», una memoria dice «a 1,30». Se puede entrar cualquiera de las
   * dos y la otra se calcula: la division la hace el server sobre las unidades PAGADAS, que
   * con una oferta 3x2 no son las llevadas —y ahi es donde un reparto a mano enseña a la app
   * un precio un tercio mas barato del real, para siempre.
   */
  togglePayMode(itemId: string): void {
    this.payModes.set(itemId, this.payMode(itemId) === 'unit' ? 'total' : 'unit');
  }

  payAlias(itemId: string): string {
    return this.payAliases.get(itemId) ?? '';
  }

  setPayAlias(itemId: string, value: string | null): void {
    this.payAliases.set(itemId, String(value ?? ''));
  }

  paySuggestion(itemId: string): { minor: number; store: string | null } | null {
    const line = this.estimate()?.lines.find(entry => entry.itemId === itemId);
    if (!line || line.source === 'unpriced' || line.unitMinor == null) return null;
    const quantity = this.items().find(item => item.id === itemId)?.quantity ?? 1;
    return { minor: Math.max(0, Math.round(line.unitMinor * (quantity || 1))), store: line.store ?? null };
  }

  usePaySuggestion(itemId: string, minor: number): void {
    this.payModes.set(itemId, 'total');
    this.payValues.set(itemId, formatMoney(minor));
  }

  payMissing(): number {
    return this.payLines().filter(line => parseMoneyToMinor(this.payValue(line.itemId)) === null).length;
  }

  payTotal(): number {
    let total = 0;
    for (const line of this.payLines()) {
      const minor = parseMoneyToMinor(this.payValue(line.itemId));
      if (minor === null) continue;
      total += this.payMode(line.itemId) === 'unit' ? Math.round(minor * (line.quantity || 1)) : minor;
    }
    return total;
  }

  closePay(): void {
    this.payOpen.set(false);
    this.payStoreError.set(false);
  }

  /** Escribir los precios y cerrar va en la MISMA llamada: dos peticiones sueltas dejan la
   *  ventana en la que el cierre llega antes que el precio y la lista se archiva coja. */
  async finishPurchase(): Promise<void> {
    const list = this.list();
    if (!list) return;
    const store = this.payStore().trim();
    const prices: CompletePriceInput[] = [];
    for (const line of this.payLines()) {
      const minor = parseMoneyToMinor(this.payValue(line.itemId));
      if (minor === null) continue;
      const alias = this.payAlias(line.itemId).trim();
      prices.push(
        this.payMode(line.itemId) === 'unit'
          ? { itemId: line.itemId, priceMinor: minor, ...(alias ? { productName: alias } : {}) }
          : { itemId: line.itemId, totalPaidMinor: minor, quantity: line.quantity || 1, ...(alias ? { productName: alias } : {}) }
      );
    }
    const result = await this.shopping.complete(list.id, { store: store || null, prices });
    if (result.ok) {
      this.payOpen.set(false);
      this.finishCompleteToast(result.paidMinor, result.pricesRecorded, result.store || store || null);
      return;
    }
    if (result.code === 'PRICES_MISSING') {
      this.openPay(result.missing);
      return;
    }
    if (result.code === 'STORE_REQUIRED') this.payStoreError.set(true);
  }

  // ---------------------------------------------------------- enlace de producto

  /** La clave se compara como en el server: dos normalizaciones distintas es tener dos
   *  opiniones sobre si «Jamón Serrano» es el producto que ya tiene precio. */
  keyOf(name: string): string {
    return productKeyOf(name);
  }

  readonly productLinkOptions = computed<PickerOption[]>(() =>
    this.shopping.knownProducts().map(product => ({
      value: product.productKey,
      label: product.name,
      hint: product.variants.length > 1 ? product.variants.length + ' tiendas' : product.observations + ' precios'
    }))
  );

  /** Cuanto cuesta el producto enlazado en cada tienda: la frase que hace saber que el
   *  enlace existe y que los precios no son uno solo. */
  linkVariants(item: ShoppingListItem): string | null {
    const product = this.shopping.knownProducts().find(entry => entry.productKey === item.product_key);
    if (!product?.variants.length) return null;
    return product.variants.map(variant => `${variant.store ?? 'sin tienda'} ${formatMoney(variant.unitMinor)}`).join(' · ');
  }

  async linkProduct(item: ShoppingListItem, key: string | null): Promise<void> {
    if (!key || key === item.product_key) return;
    await this.shopping.updateItemSync(item.list_id, item, { productKey: key });
  }

  async unlinkProduct(item: ShoppingListItem): Promise<void> {
    await this.shopping.updateItemSync(item.list_id, item, { productKey: null });
  }

  sourceLabel(source: 'manual' | 'observed' | 'unpriced'): string {
    if (source === 'manual') return 'precio de esta lista';
    if (source === 'observed') return 'ultimo precio pagado';
    return 'sin precio';
  }

  // -------------------------------------------------- renombrar (con forma de salir)

  commitRename(): void {
    this.flush('list:name');
    const list = this.list();
    const name = this.draftName.trim();
    this.renaming.set(false);
    if (!list || !name || name === list.name) return;
    void this.shopping.renameList(list.id, { name }, list.version);
  }

  /** Cancelar NO es solo cerrar el input: el texto que se habia autoguardado se deshace. */
  cancelRename(): void {
    this.cancelingRename = true;
    const previous = this.list()?.name ?? '';
    this.draftName = previous;
    this.renaming.set(false);
    setTimeout(() => (this.cancelingRename = false));
  }

  onRenameBlur(): void {
    if (this.cancelingRename) return;
    this.commitRename();
  }

  // ------------------------------------------------------------------ unidades

  readonly quickUnits = ['ud', 'kg', 'L', 'pack'];
  readonly unitOptions: PickerOption[] = [
    { value: 'ud', label: 'unidad', hint: 'ud' },
    { value: 'kg', label: 'kilo', hint: 'kg' },
    { value: 'g', label: 'gramo', hint: 'g' },
    { value: 'L', label: 'litro', hint: 'L' },
    { value: 'ml', label: 'mililitro', hint: 'ml' },
    { value: 'pack', label: 'pack', hint: 'pack' },
    { value: 'bote', label: 'bote', hint: '400 g' },
    { value: 'lata', label: 'lata', hint: '33 cl' },
    { value: 'botella', label: 'botella', hint: '1 L' },
    { value: 'brick', label: 'brick', hint: '1 L' },
    { value: 'docena', label: 'docena', hint: '12 ud' },
    { value: 'paquete', label: 'paquete' },
    { value: 'sobre', label: 'sobre' },
    { value: 'cabeza', label: 'cabeza' },
    { value: 'manojo', label: 'manojo' }
  ];

  readonly categoryOptions = computed<PickerOption[]>(() => {
    const catalogue = this.shopping.categories();
    if (!catalogue.length) {
      return LIST_CATEGORIES.map((name, index) => ({ value: name, label: name, color: null as string | null }));
    }
    return catalogue.map((category) => ({ value: category.name, label: category.name, color: category.color }));
  });

  setCategory(value: string | null): void {
    this.patch({ category: value || null });
    const known = this.categoryOptions().some((option) => option.value === value);
    // Seccion nueva escrita a mano: se da de alta en el catalogo, que es lo que la hace
    // aparecer manana en la foto del pasillo y en el resto de listas de la casa.
    if (value && !known) void this.shopping.createCategory(value);
  }

  colorOf(category: string | null | undefined): string | null {
    if (!category) return null;
    return this.shopping.categories().find((entry) => entry.name === category)?.color ?? null;
  }

  // -------------------------------------------------------------------- ofertas

  readonly draftOffer = signal<LineOffer | null>(null);

  isOffer(preset: LineOffer): boolean {
    const draft = this.draftOffer();
    return !!draft && draft.buy === preset.buy && draft.take === preset.take;
  }

  setDraftOffer(offer: LineOffer | null): void {
    this.draftOffer.set(offer);
    const item = this.editing();
    if (!item) return;
    this.shopping.updateItem(item.list_id, item, { offer } as Partial<CreateItemInput>);
  }

  /** La oferta se toca desde la hoja de edicion o con un toque en la fila. */
  setOffer(item: ShoppingListItem, offer: LineOffer | null): void {
    this.shopping.updateItem(item.list_id, item, { offer } as Partial<CreateItemInput>);
  }

  // ------------------------------------------------------------------- descuento

  readonly discountOpen = signal(false);
  readonly discountKinds: { value: 'amount' | 'percent'; label: string; icon: 'payments' | 'percent' }[] = [
    { value: 'amount', label: 'Importe', icon: 'payments' },
    { value: 'percent', label: 'Porcentaje', icon: 'percent' }
  ];
  // Los cuatro alcances que se ven en el pasillo de verdad: la oferta de la cesta, la de
  // «los dos primeros», la del producto concretado en la etiqueta y la del pasillo entero.
  readonly discountScopes: { value: DiscountScope; label: string; hint: string }[] = [
    { value: 'all', label: 'Toda la cesta', hint: 'Se aplica al total' },
    { value: 'firstUnits', label: 'Primeras unidades', hint: 'Tipo «2 primeros cafés a 1 €»' },
    { value: 'product', label: 'En productos', hint: '«2 € en jamón y queso»: solo esas líneas bajan' },
    { value: 'category', label: 'En secciones', hint: 'Pasillos enteros, p. ej. lácteos y charcutería' }
  ];
  readonly percentOptions: PickerOption[] = [5, 10, 15, 20, 25, 50].map((value) => ({ value: String(value), label: value + ' %' }));
  readonly discountDraft = signal<{
    kind: 'amount' | 'percent';
    scope: DiscountScope;
    firstUnits: number | null;
    /**
     * Lo que entra en el descuento, en los nombres legibles de la lista. Es un array y no
     * un string porque el cartel del pasillo casi nunca habla de un producto: «2 € en
     * jamón, queso y pan» es UN descuento sobre tres lineas, y partirlo en tres seria
     * aplicar tres recortes donde la caja aplico uno.
     */
    targets: string[];
    label: string | null;
  }>({ kind: 'amount', scope: 'all', firstUnits: null, targets: [], label: null });
  /** Nombre escrito a mano para anadirlo a las dianas (lo que no esta en la lista). */
  readonly targetDraft = signal('');
  readonly amountDraft = signal('');
  readonly percentDraft = signal<string | null>(null);

  private discountHydrated = false;

  /** Al abrir la hoja se parte de lo que hay, no de un formulario en blanco. */
  hydrateDiscount(): void {
    const discount = this.list()?.discount;
    this.discountDraft.set({
      kind: discount?.kind ?? 'amount',
      scope: discount?.scope ?? 'all',
      firstUnits: discount?.first_units ?? null,
      // Con 'all' las dianas pueden venir de cuando era «en el jamón»: se limpian aqui para
      // que la hoja no muestre una diana que ya no esta aplicando nada.
      targets:
        discount && (discount.scope === 'product' || discount.scope === 'category')
          ? [...new Set([...(discount.targets ?? []), discount.target ?? null].filter((v): v is string => !!v))]
          : [],
      label: discount?.label ?? null
    });
    this.amountDraft.set(discount?.value_minor ? (discount.value_minor / 100).toFixed(2).replace('.', ',') : '');
    this.percentDraft.set(discount?.percent_bps ? String(discount.percent_bps / 100) : null);
  }

  setDiscountKind(kind: 'amount' | 'percent'): void {
    this.discountDraft.update((draft) => ({ ...draft, kind }));
  }

  patchDiscount(changes: Partial<{ scope: DiscountScope; firstUnits: number | null; label: string | null }>): void {
    this.discountDraft.update((draft) => ({ ...draft, ...changes }));
    // Cambiar de alcance deja de tener sentido la diana anterior (una seccion no es un
    // producto), y arrastrarla daria un descuento guardado con una nota que no se corresponde.
    if (changes.scope && changes.scope !== 'product' && changes.scope !== 'category') {
      this.discountDraft.update((draft) => ({ ...draft, targets: [] }));
    }
  }

  /** Clave de un `data-test`: los nombres de producto llevan espacios y acentos. */
  slug(value: string): string {
    return productKeyOf(value).replace(/\s+/g, '-');
  }

  isTargetSelected(name: string): boolean {
    return this.discountDraft().targets.includes(name);
  }

  /** Conmutar: deseleccionar es la unica forma de deshacer un toque en la hoja. */
  toggleTarget(name: string): void {
    const clean = String(name ?? '').trim();
    if (!clean) return;
    this.discountDraft.update((draft) => ({
      ...draft,
      targets: draft.targets.includes(clean) ? draft.targets.filter((entry) => entry !== clean) : [...draft.targets, clean]
    }));
  }

  addTarget(): void {
    const clean = this.targetDraft().trim();
    if (!clean) return;
    this.toggleTarget(clean);
    this.targetDraft.set('');
  }

  allTargetsSelected(): boolean {
    const options = this.discountTargetOptions();
    return options.length > 0 && options.every((option) => this.isTargetSelected(option.label));
  }

  toggleAllTargets(): void {
    const options = this.discountTargetOptions();
    this.discountDraft.update((draft) => ({
      ...draft,
      targets: this.allTargetsSelected() ? [] : options.map((option) => option.label)
    }));
  }

  /** La fila de totales: el descuento presente o ausente, pero dicho con palabras. */
  readonly discountSummary = computed(() => {
    const description = this.list()?.discountDescription;
    return description ? `Descuento · ${description}` : 'Anadir descuento';
  });

  /**
   * Dianas posibles del descuento, sacadas de LO QUE HAY EN LA LISTA: prometer un
   * descuento «en el pan de molde» cuando no está es el 0 € que nadie entiende. Con
   * `allowCustom` igualmente se puede escribir una marca que aun no has añadido.
   */
  readonly discountTargetOptions = computed<PickerOption[]>(() => {
    const scope = this.discountDraft().scope;
    const lines = this.items();
    if (scope === 'category') {
      const seen = new Set<string>();
      return lines
        .map((item) => String(item.category ?? '').trim())
        .filter((name) => name && !seen.has(name.toLocaleLowerCase('es')) && seen.add(name.toLocaleLowerCase('es')))
        .map((name) => ({
          value: name,
          label: name,
          hint: String(lines.filter((item) => item.category === name).length) + (name ? ' art.' : '')
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es'));
    }
    return lines
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .map((item) => ({
        // La clave del producto, si la tiene: es lo que compara el server, y dos listas
        // distintas con «Jamón» y «jamon » solo se entienden comparando la clave.
        value: item.product_key || item.name,
        label: item.name,
        color: this.colorOf(item.category),
        hint: String(item.quantity ?? 1) + (item.unit ? ' ' + item.unit : '')
      }));
  });

  setPercent(value: string | null): void {
    this.percentDraft.set(value);
  }

  commitAmount(): void {
    const raw = String(this.amountDraft() ?? '').trim();
    this.amountDraft.set(parseMoneyToMinor(raw) === null ? '' : raw);
  }

  bumpFirstUnits(step: number): void {
    this.discountDraft.update((draft) => ({ ...draft, firstUnits: Math.max(1, (draft.firstUnits ?? 1) + step) }));
  }

  async saveDiscount(): Promise<void> {
    const list = this.list();
    if (!list) return;
    const draft = this.discountDraft();
    const input: DiscountInput = { kind: draft.kind, scope: draft.scope };
    if (draft.kind === 'percent') {
      const percent = Number(String(this.percentDraft() ?? '').replace(',', '.'));
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
        this.toast.warning('El porcentaje no cuadra', 'Entre 1 % y 100 %.');
        return;
      }
      input.percentBps = Math.round(percent * 100);
    } else {
      const minor = parseMoneyToMinor(this.amountDraft());
      if (!minor || minor <= 0) {
        this.toast.warning('Falta el importe', 'Escribe cuanto descuentan, por ejemplo 3,50.');
        return;
      }
      input.valueMinor = minor;
    }
    if (draft.scope === 'firstUnits') input.firstUnits = draft.firstUnits ?? 1;
    if (draft.scope === 'product' || draft.scope === 'category') {
      const targets = [...new Set(draft.targets.map((entry) => String(entry).trim()).filter(Boolean))];
      if (!targets.length) {
        // Sin diana el server responderia 400, y un 400 despues de pulsar «Guardar» sabe a
        // castigo: se lo decimos antes, con la lista de lineas marcada.
        this.toast.warning('Dime donde', 'Elige al menos un producto o una sección a la que se aplica.');
        return;
      }
      input.targets = targets;
    }
    if (draft.label) input.label = draft.label;

    const saved = await this.shopping.setDiscount(list.id, input);
    this.discountOpen.set(false);
    if (saved) this.toast.success('Descuento aplicado', saved.description ?? undefined);
  }

  async removeDiscount(): Promise<void> {
    const list = this.list();
    if (!list) return;
    const previous = list.discount;
    await this.shopping.setDiscount(list.id, null);
    this.discountOpen.set(false);
    this.toast.show({
      type: 'info',
      title: 'Descuento quitado',
      duration: 6000,
      countdown: true,
      position: 'bottom',
      action: {
        label: 'Deshacer',
        run: () => {
          if (!previous) return;
          void this.shopping.setDiscount(list.id, {
            kind: previous.kind,
            valueMinor: previous.value_minor,
            percentBps: previous.percent_bps,
            scope: previous.scope,
            firstUnits: previous.first_units,
            label: previous.label
          });
        }
      }
    });
  }

  // ----------------------------------------------------------------------- foto

  readonly photoOpen = signal(false);
  readonly photoMode = signal<'auto' | 'ticket' | 'shelf'>('auto');
  readonly photoNote = signal('');
  readonly photoBusy = signal(false);
  readonly photoApplying = signal(false);
  readonly photoError = signal<string | null>(null);
  readonly photoRedirect = signal<string | null>(null);
  readonly photoData = signal<string | null>(null);
  readonly photoPreview = signal<string | null>(null);
  readonly photoResult = signal<PhotoReview | null>(null);
  readonly photoModes: PickerOption[] = [
    { value: 'auto', label: 'No lo se', hint: 'que lo juzgue el modelo' },
    { value: 'ticket', label: 'Ticket / factura', hint: 'lo pagado' },
    { value: 'shelf', label: 'Estanteria', hint: 'precio por unidad' }
  ];

  openDiscount(prefill?: string[]): void {
    this.hydrateDiscount();
    // Desde la seleccion multiple las lineas elegidas SON las dianas: es el gesto de
    // «esto tres, que me han dicho que llevan descuento», y no hay que volver a buscarlas.
    if (prefill?.length) {
      this.discountDraft.update((draft) => ({
        ...draft,
        scope: draft.scope === 'all' ? 'product' : draft.scope,
        targets: [...new Set([...draft.targets, ...prefill])]
      }));
    }
    this.discountOpen.set(true);
  }

  openDiscountForSelection(): void {
    const chosen = this.items().filter((item) => this.selection().includes(item.id)).map((item) => item.name);
    this.openDiscount(chosen.length ? chosen : undefined);
  }

  openPhoto(): void {
    this.photoOpen.set(true);
    this.photoError.set(null);
    this.photoRedirect.set(null);
    // El catalogo se tiene aqui antes de mirar la foto: el prompt lo necesita y la hoja
    // de repaso pinta los colores con el mismo dato.
    this.shopping.loadCategories(true);
  }

  closePhoto(): void {
    this.photoOpen.set(false);
    this.photoBusy.set(false);
  }

  onPhotoFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      this.photoError.set('Eso no es una foto (png, jpg o webp).');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      this.photoError.set('La foto pesa demasiado: hazla mas pequena o recortala.');
      return;
    }
    this.photoError.set(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      this.photoData.set(dataUrl);
      this.photoPreview.set(dataUrl);
      this.photoResult.set(null);
    };
    reader.onerror = () => this.photoError.set('No se ha podido leer el archivo.');
    reader.readAsDataURL(file);
  }

  async analyzePhoto(): Promise<void> {
    const data = this.photoData();
    if (!data || this.photoBusy()) return;
    this.photoBusy.set(true);
    this.photoError.set(null);
    this.photoRedirect.set(null);
    const outcome = await this.shopping.analyzePhoto(this.listId, data, this.photoMode(), this.photoNote().trim() || undefined);
    this.photoBusy.set(false);
    if (outcome.ok) {
      this.photoResult.set({
        listId: outcome.data.listId,
        mode: outcome.data.mode,
        currency: outcome.data.currency,
        warnings: outcome.data.warnings ?? [],
        categories: outcome.data.categories ?? [],
        // Todo entra marcado: desmarcar lo que sobra es mucho menos tecleo que marcar
        // lo que interesa, y el repaso existe justamente para eso.
        lines: (outcome.data.lines ?? []).map((line) => ({ ...line, keep: true }))
      });
      return;
    }
    this.photoResult.set(null);
    if (outcome.message === 'AI_NOT_CONFIGURED') {
      this.photoRedirect.set('/settings/ai');
      this.photoError.set('Falta configurar la IA para leer fotos.');
      return;
    }
    const labels: Record<string, string> = {
      IMAGE_TOO_LARGE: 'La foto es demasiado grande para el modelo.',
      AI_ANSWER_NOT_UNDERSTOOD: 'El modelo no ha contestado en el formato esperado.',
      AI_TIMEOUT: 'El modelo ha tardado demasiado. Intentalo otra vez.',
      INVALID_PHOTO: 'La imagen no se ha podido leer.'
    };
    this.photoError.set(labels[outcome.message] ?? 'El modelo no esta disponible ahora mismo.');
    if (outcome.message === 'AI_ANSWER_NOT_UNDERSTOOD') this.logSample(outcome.data);
  }

  private logSample(data: Record<string, unknown>): void {
    // La muestra del response crudo va al visor de logs: sin ella, un fallo de formato de
    // un modelo concreto es indepurgable desde la pantalla.
    const sample = typeof (data as { sample?: unknown })?.sample === 'string' ? String((data as { sample?: string }).sample) : '';
    if (sample) void fetch('/api/logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ level: 'warn', scope: 'shopping:photo', message: 'respuesta de IA no parseable', meta: { sample } }) }).catch(() => undefined);
  }

  keptPhotoLines(): PhotoLine[] {
    return (this.photoResult()?.lines ?? [])
      .filter((line) => line.keep && line.name.trim())
      .map((line) => {
        const { keep, ...rest } = line;
        return rest as PhotoLine;
      });
  }

  async applyPhoto(): Promise<void> {
    const lines = this.keptPhotoLines();
    if (!lines.length || this.photoApplying()) return;
    this.photoApplying.set(true);
    const applied = await this.shopping.applyPhotoLines(this.listId, lines);
    this.photoApplying.set(false);
    if (!applied) return;
    this.photoOpen.set(false);
    this.photoResult.set(null);
    this.photoData.set(null);
    this.photoPreview.set(null);
    const created = applied.createdCategories.length ? ', secciones nuevas: ' + applied.createdCategories.join(', ') : '';
    this.toast.success(
      'Lineas anadidas',
      `${applied.added} nuevas, ${applied.merged.length} sumadas a lo que ya estaba${created}.`
    );
  }

  minorToInput(minor: number | null | undefined): string {
    return minor === null || minor === undefined ? '' : (minor / 100).toFixed(2).replace('.', ',');
  }

  // Los numeros y el dinero se convierten en el componente: una plantilla no tiene
  // `Number` ni funciones del modulo, y copiar la conversion aqui dos veces es como
  // para que un dia diverjan el precio de la hoja y el de la fila.
  setLineQuantity(line: KeptPhotoLine, value: unknown): void {
    line.quantity = Number(value) > 0 ? Number(value) : 1;
  }

  setLinePrice(line: KeptPhotoLine, value: unknown): void {
    line.priceMinor = parseMoneyToMinor(typeof value === 'string' ? value : String(value ?? ''));
  }

  setFirstUnits(value: unknown): void {
    const units = Number(value);
    this.patchDiscount({ firstUnits: Number.isFinite(units) && units > 0 ? Math.floor(units) : 1 });
  }

  setPhotoMode(value: string | null): void {
    this.photoMode.set(value === 'ticket' || value === 'shelf' ? value : 'auto');
  }

  // ------------------------------------------------------------------ auditoria

  readonly auditOpen = signal(false);
  readonly events = computed(() => this.shopping.events());
  private cancelStream: (() => void) | null = null;

  toggleAudit(): void {
    this.auditOpen.set(!this.auditOpen());
    if (this.auditOpen()) this.shopping.loadEvents(this.listId);
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

