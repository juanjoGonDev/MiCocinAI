import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ShoppingService } from '../../core/services/shopping.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ToastService } from '../../core/services/toast.service';
import { formatMoney, ShoppingList } from '../../shared/models/shopping.model';
import { SwipeRowDirective } from '../../shared/directives/swipe-row.directive';

type ListsTab = 'activas' | 'hechas';

/**
 * Bandeja de listas (`/shopping`).
 *
 * Una decision por fila (abrir, archivar, borrar) y un sitio donde nace una lista.
 * Todo lo demas vive dentro: la bandeja se tiene que poder leer con una mano y con
 * prisa, que es exactamente como se llega aqui desde el pasillo del super.
 */
@Component({
  selector: 'app-shopping-lists',
  standalone: true,
  imports: [CommonModule, FormsModule, SwipeRowDirective],
  template: `
    <div class="shopping">
      <header class="shopping__head">
        <div>
          <h1 class="shopping__title">Lista de la compra</h1>
          <p class="shopping__subtitle">
            Cesta por tienda, precio por linea y coste estimado. Se guarda sola.
          </p>
        </div>
        <button type="button" class="shopping__primary" data-test="new-list" (click)="creating.set(!creating())">
          {{ creating() ? 'Cancelar' : '+ Nueva lista' }}
        </button>
      </header>

      @if (creating()) {
        <form class="shopping__create" (ngSubmit)="create()">
          <label class="shopping__field">
            <span>Nombre</span>
            <input
              data-test="list-name"
              name="listName"
              [(ngModel)]="draftName"
              placeholder="Compra semana 38"
              autocomplete="off"
              maxlength="80"
            />
          </label>
          <label class="shopping__field">
            <span>Tienda (opcional)</span>
            <input
              name="listStore"
              [(ngModel)]="draftStore"
              placeholder="Mercadona"
              autocomplete="off"
              maxlength="60"
            />
          </label>
          <button type="submit" class="shopping__primary" data-test="create-submit" [disabled]="!draftName.trim() || busy()">
            {{ busy() ? 'Creando…' : 'Crear y abrir' }}
          </button>
        </form>
      }

      <nav class="shopping__tabs" aria-label="Estado de las listas">
        <button
          type="button"
          class="shopping__tab"
          [class.shopping__tab--active]="tab() === 'activas'"
          [attr.aria-current]="tab() === 'activas' ? 'true' : null"
          (click)="selectTab('activas')"
        >
          Activas
        </button>
        <button
          type="button"
          class="shopping__tab"
          [class.shopping__tab--active]="tab() === 'hechas'"
          [attr.aria-current]="tab() === 'hechas' ? 'true' : null"
          data-test="tab-done"
          (click)="selectTab('hechas')"
        >
          Terminadas
        </button>
      </nav>

      @if (saving()) {
        <p class="shopping__saving" role="status">Guardando…</p>
      }

      @if (loading()) {
        <p class="shopping__empty">Cargando listas…</p>
      } @else if (lists().length === 0) {
        <section class="shopping__empty-card">
          <h2 class="shopping__empty-title">
            {{ tab() === 'activas' ? 'Todavia no hay listas' : 'Nada en el historial' }}
          </h2>
          <p class="shopping__empty-text">
            {{
              tab() === 'activas'
                ? 'Crea la primera y manana solo tendras que marcar lo que cae en el carro.'
                : 'Las listas terminadas se guardan aqui con su gasto real.'
            }}
          </p>
          @if (tab() === 'activas') {
            <button type="button" class="shopping__primary" (click)="creating.set(true)">
              + Nueva lista
            </button>
          }
        </section>
      } @else {
        <ul class="shopping__rows">
          @for (list of lists(); track list.id) {
            <li
              class="shopping__row"
              [appSwipeRow]="false"
              (swipeRemove)="archive(list)"
              (gestureEnded)="noteGesture()"
              data-test="list-row"
            >
              <div class="shopping__rail" aria-hidden="true">
                <button type="button" class="shopping__rail-btn" (click)="archive(list)">Terminar</button>
                <button
                  type="button"
                  class="shopping__rail-btn shopping__rail-btn--danger"
                  (click)="remove(list)"
                >
                  Borrar
                </button>
              </div>
              <a
                class="shopping__face"
                [href]="hrefOf(list)"
                (click)="open(list, $event)"
                [class.shopping__face--muted]="list.status !== 'active'"
              >
                <div class="shopping__row-top">
                  <span class="shopping__row-name">{{ list.name }}</span>
                  <span class="shopping__row-when">{{ since(list.updated_at) }}</span>
                </div>
                @if (list.store) {
                  <span class="shopping__chip">{{ list.store }}</span>
                }
                <div class="shopping__row-meta">
                  <span class="shopping__progress">
                    <span
                      class="shopping__progress-bar"
                      [style.width.%]="list.totalItems ? (list.checkedItems / list.totalItems) * 100 : 0"
                    ></span>
                  </span>
                  <span class="shopping__count">{{ list.checkedItems }}/{{ list.totalItems }}</span>
                  <span class="shopping__money">{{ money(list.pricedTotalMinor) }}</span>
                </div>
              </a>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: [
    `
      .shopping {
        padding: var(--space-4);
        max-width: 760px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }
      .shopping__head {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-3);
      }
      .shopping__title {
        font-family: var(--font-display);
        font-size: var(--text-2xl);
        font-weight: var(--font-bold);
        color: var(--text-primary);
      }
      .shopping__subtitle {
        margin-top: var(--space-1);
        font-size: var(--text-sm);
        color: var(--text-secondary);
        max-width: 52ch;
      }
      .shopping__primary {
        border: none;
        border-radius: var(--radius-lg);
        background: var(--primary);
        color: var(--white);
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        padding: var(--space-3) var(--space-4);
        min-height: 44px;
        cursor: pointer;
      }
      .shopping__primary:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .shopping__create {
        display: grid;
        gap: var(--space-3);
        padding: var(--space-4);
        background: var(--bg-secondary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-xl);
      }
      .shopping__field {
        display: grid;
        gap: var(--space-1);
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
      .shopping__field input {
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        background: var(--bg-primary);
        color: var(--text-primary);
        padding: var(--space-3);
        font-size: var(--text-base);
        min-height: 44px;
      }
      .shopping__tabs {
        display: inline-flex;
        gap: var(--space-1);
        padding: var(--space-1);
        background: var(--bg-tertiary);
        border-radius: var(--radius-full);
        width: fit-content;
      }
      .shopping__tab {
        border: none;
        background: transparent;
        color: var(--text-secondary);
        border-radius: var(--radius-full);
        padding: var(--space-2) var(--space-4);
        font-size: var(--text-sm);
        font-weight: var(--font-medium);
        cursor: pointer;
        min-height: 40px;
      }
      .shopping__tab--active {
        background: var(--bg-secondary);
        color: var(--text-primary);
        box-shadow: var(--shadow-sm);
      }
      .shopping__saving {
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }
      .shopping__rows {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .shopping__empty,
      .shopping__empty-card {
        color: var(--text-secondary);
        font-size: var(--text-sm);
      }
      .shopping__empty-card {
        display: grid;
        gap: var(--space-2);
        padding: var(--space-6);
        border: 1px dashed var(--border-default);
        border-radius: var(--radius-xl);
        text-align: center;
        justify-items: center;
      }
      .shopping__empty-title {
        font-size: var(--text-lg);
        font-weight: var(--font-semibold);
        color: var(--text-primary);
      }
      .shopping__empty-text {
        max-width: 46ch;
      }
    `
  ]
})
export class ShoppingListsComponent {
  private readonly shopping = inject(ShoppingService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly tab = signal<ListsTab>('activas');
  readonly creating = signal(false);
  readonly busy = signal(false);
  draftName = '';
  draftStore = '';

  readonly lists = computed(() => this.shopping.lists());
  readonly loading = computed(() => this.shopping.loadingLists());
  readonly saving = computed(() => this.shopping.saving());
  readonly money = formatMoney;
  private swallowNextTap = false;
  private gestureAt = 0;

  constructor() {
    this.readTabFromUrl();
    this.shopping.loadLists(this.tab() === 'activas' ? 'active' : 'done');
  }

  selectTab(tab: ListsTab): void {
    if (this.tab() === tab) return;
    this.tab.set(tab);
    void this.router.navigate([], {
      queryParams: tab === 'activas' ? null : { tab },
      queryParamsHandling: 'merge'
    });
    this.shopping.loadLists(tab === 'activas' ? 'active' : 'done');
  }

  /** La pestana vive en la URL: volver atras desde una lista no debe cambiar de pestana. */
  private readTabFromUrl(): void {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'hechas' || tab === 'done') this.tab.set('hechas');
  }

  noteGesture(): void {
    this.swallowNextTap = true;
    this.gestureAt = Date.now();
  }

  hrefOf(list: ShoppingList): string {
    return `/shopping/${list.id}`;
  }

  /**
   * Navegacion propia, no `routerLink`: el navegador dispara `click` tambien cuando
   * lo que se ha hecho es un arrastre para descubrir el riel, y ahi nadie quiere
   * entrar en la lista. Se conserva el `href` para que el boton central del raton
   * y el «abrir en pestana nueva» sigan siendo un enlace normal.
   */
  open(list: ShoppingList, event: Event): void {
    event.preventDefault();
    if (this.swallowNextTap) {
      this.swallowNextTap = false;
      if (Date.now() - this.gestureAt < 600) return;
    }
    void this.router.navigate(['/shopping', list.id]);
  }

  async create(): Promise<void> {
    const name = this.draftName.trim();
    if (!name || this.busy()) return;
    this.busy.set(true);
    const created = await this.shopping.createList(name, this.draftStore.trim() || null);
    this.busy.set(false);
    if (!created) return;
    this.draftName = '';
    this.draftStore = '';
    this.creating.set(false);
    void this.router.navigate(['/shopping', created.id]);
  }

  /** Terminar una lista si es deshacible: la barra de aviso manda, no el boton. */
  async archive(list: ShoppingList): Promise<void> {
    await this.shopping.setStatus(list.id, list.status === 'done' ? 'active' : 'done');
    this.toast.show({
      type: 'success',
      title: list.status === 'done' ? 'Lista reabierta' : 'Lista terminada',
      message: `"${list.name}" ${list.status === 'done' ? 'vuelve a activas.' : 'pasa al historial.'}`,
      duration: 6000,
      countdown: true,
      position: 'bottom',
      action: {
        label: 'Deshacer',
        run: () => {
          void this.shopping.setStatus(list.id, list.status === 'done' ? 'active' : 'done');
        }
      }
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
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    return `hace ${Math.round(hours / 24)} d`;
  }
}
