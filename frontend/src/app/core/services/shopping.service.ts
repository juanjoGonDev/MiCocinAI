import { Injectable, DestroyRef, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, fromEvent } from 'rxjs';
import { catchError, finalize, map, tap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastService } from './toast.service';
import {
  CreateItemInput,
  ListEstimate,
  PriceObservation,
  ShoppingList,
  ShoppingListItem,
  ShoppingListStatus
} from '../../shared/models/shopping.model';

/** Operacion de escritura en espera: la misma observable, reintentable tal cual. */
interface QueuedWrite {
  key: string;
  send: () => Observable<unknown>;
}

/**
 * Servicio de la lista de la compra.
 *
 * Tres decisiones que vienen de la pantalla, no del backend:
 *  1. Todo lo que se marca, se edita o se arrastra pinta YA y se guarda detras
 *     (autosave). El unico feedback de guardado es una barra fina: nadie mira una
 *     tiquisima animacion mientras tiene las manos llenas.
 *  2. Si la red falla, la escritura no se pierde: entra en una cola claveada (marcar
 *     dos veces la misma linea apila una sola operacion) y se reintenta sola al
 *     volver la conexion. La copia local es la verdad visible mientras tanto.
 *  3. Un conflicto de version (`LIST_VERSION_CONFLICT`) nunca pisa lo del otro
 *     aparato: se recarga la lista y se avisa.
 */
@Injectable({ providedIn: 'root' })
export class ShoppingService {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly apiUrl = '/api/shopping';

  private readonly queue: QueuedWrite[] = [];

  readonly lists = signal<ShoppingList[]>([]);
  readonly list = signal<ShoppingList | null>(null);
  readonly items = signal<ShoppingListItem[]>([]);
  readonly estimate = signal<ListEstimate | null>(null);
  readonly prices = signal<PriceObservation[]>([]);
  readonly loadingLists = signal(false);
  readonly loadingList = signal(false);
  readonly saving = signal(false);
  readonly pendingWrites = signal(0);

  constructor() {
    // Al volver la conexion, la cola sale en orden. Sin reintentos agresivos:
    // un 4xx es un error de datos, no de red, y reintentarlo solo gastaria bateria.
    fromEvent(window, 'online')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.flush());
  }

  // ---------------------------------------------------------------- listas

  loadLists(status: ShoppingListStatus = 'active'): void {
    this.loadingLists.set(true);
    const params = new HttpParams().set('status', status);
    this.http
      .get<{ data: ShoppingList[] }>(`${this.apiUrl}/lists`, { params })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.lists.set(response.data);
          this.loadingLists.set(false);
        },
        error: () => this.loadingLists.set(false)
      });
  }

  createList(name: string, store?: string | null): Promise<ShoppingList | null> {
    return this.request<ShoppingList>(() =>
      this.http.post<{ data: ShoppingList }>(`${this.apiUrl}/lists`, { name, store: store || null }).pipe(
        map(response => response.data),
        tap(() => this.loadLists())
      )
    );
  }

  /**
   * El `version` del body es el CAS del server: se manda la version que uno tiene en
   * la mano y, si no coincide, llega 409 en lugar de pisar el cambio de la otra persona.
   */
  renameList(id: string, patch: { name?: string; store?: string | null; status?: ShoppingListStatus }, version?: number): Promise<ShoppingList | null> {
    const expected = version ?? this.list()?.version ?? this.lists().find(list => list.id === id)?.version ?? 1;
    return this.request<ShoppingList>(() =>
      this.http
        .patch<{ data: ShoppingList }>(`${this.apiUrl}/lists/${id}`, { ...patch, version: expected })
        .pipe(map(response => response.data), tap(list => this.list.update(current => (current && current.id === list.id ? list : current))))
    );
  }

  /**
   * `done` pasa por `/complete`, que ademas de archivar aprende los precios pagados.
   * Volver atras (el Deshacer de la barra) es un PATCH de estado: reabrir no necesita
   * endpoint propio, el estado es una columna mas.
   */
  setStatus(id: string, status: ShoppingListStatus): Promise<unknown> {
    if (status === 'done') {
      return this.request<unknown>(() =>
        this.http.post<{ data: unknown }>(`${this.apiUrl}/lists/${id}/complete`, {}).pipe(tap(() => this.loadLists()))
      );
    }
    return this.renameList(id, { status }).then(list => {
      this.loadLists();
      return list;
    });
  }

  deleteList(id: string): Promise<unknown> {
    return this.request<unknown>(() =>
      this.http.delete(`${this.apiUrl}/lists/${id}`).pipe(tap(() => this.loadLists()))
    );
  }

  // ----------------------------------------------------------------- lineas

  loadList(id: string): void {
    this.loadingList.set(true);
    this.http
      .get<{ data: ShoppingList & { items?: ShoppingListItem[] } }>(`${this.apiUrl}/lists/${id}`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          // El server devuelve la lista CON las lineas dentro: una sola ida por abrir.
          const { items, ...list } = response.data;
          this.list.set(list);
          this.items.set(items ?? []);
          this.loadingList.set(false);
          void this.loadEstimate(id);
        },
        error: () => this.loadingList.set(false)
      });
  }

  addItem(listId: string, input: CreateItemInput): Promise<ShoppingListItem | null> {
    const body = {
      name: input.name,
      quantity: input.quantity ?? 1,
      unit: input.unit ?? null,
      category: input.category ?? null,
      priceMinor: input.priceMinor ?? null,
      note: input.note ?? null
    };
    return this.request<ShoppingListItem>(() =>
      this.http
        .post<{ data: { item: ShoppingListItem; merged: boolean } }>(`${this.apiUrl}/lists/${listId}/items`, body)
        .pipe(map(response => response.data.item), tap(item => this.pushItem(item)))
    );
  }

  /** Pegar una lista entera (el portapapeles del movil) en una sola transaccion. */
  addLines(listId: string, text: string): Promise<{ added: number; merged: number; skipped: { name: string; reason: string }[] } | null> {
    return this.request(() =>
      this.http
        .post<{ data: { added: number; merged: number; skipped: { name: string; reason: string }[] } }>(
          `${this.apiUrl}/lists/${listId}/items/bulk`,
          { lines: text }
        )
        .pipe(
          map(response => response.data),
          tap(() => this.loadList(listId))
        )
    );
  }

  /**
   * Autoguardado: pinta el cambio al instante y encola el PATCH. La clave es el item
   * y no el campo, porque teclear «1,9» y despues «5» en el precio es UNA escritura.
   */
  updateItem(listId: string, item: ShoppingListItem, patch: Partial<CreateItemInput>): void {
    this.replaceItem({ ...item, ...this.fromPatch(patch) } as ShoppingListItem);
    this.enqueue(`item:${item.id}:patch`, () =>
      this.http
        .patch<{ data: ShoppingListItem }>(`${this.apiUrl}/lists/${listId}/items/${item.id}`, patch)
        .pipe(
          map(response => response.data),
          tap(next => {
            this.replaceItem(next);
            void this.loadEstimate(listId);
          })
        )
    );
  }

  private fromPatch(patch: Partial<CreateItemInput>): Partial<ShoppingListItem> {
    return {
      ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
      ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
      ...(patch.priceMinor !== undefined ? { price_minor: patch.priceMinor } : {})
    };
  }

  /** Optimista: la casilla se marca al tocar, no cuando conteste el servidor. */
  toggleItem(listId: string, item: ShoppingListItem): void {
    const checked = item.checked ? 0 : 1;
    this.replaceItem({ ...item, checked });
    this.enqueue(`item:${item.id}:checked`, () =>
      this.http
        .patch<{ data: ShoppingListItem }>(`${this.apiUrl}/lists/${listId}/items/${item.id}`, { checked })
        .pipe(map(response => response.data), tap(next => this.replaceItem(next)))
    );
  }

  bumpItem(listId: string, item: ShoppingListItem): void {
    const quantity = item.quantity + 1;
    this.replaceItem({ ...item, quantity });
    this.enqueue(`item:${item.id}:qty`, () =>
      this.http
        .patch<{ data: ShoppingListItem }>(`${this.apiUrl}/lists/${listId}/items/${item.id}`, { quantity })
        .pipe(
          map(response => response.data),
          tap(next => {
            this.replaceItem(next);
            void this.loadEstimate(listId);
          })
        )
    );
  }

  /** Borrado logico: la linea puede volver durante la ventana de deshacer. */
  removeItem(listId: string, item: ShoppingListItem): Promise<boolean> {
    this.items.update(items => items.filter(candidate => candidate.id !== item.id));
    return this.request<unknown>(() =>
      this.http.delete(`${this.apiUrl}/lists/${listId}/items/${item.id}`).pipe(tap(() => void this.loadEstimate(listId)))
    ).then(result => result !== null);
  }

  restoreItem(listId: string, itemId: string): Promise<unknown> {
    return this.request<unknown>(() =>
      this.http
        .post(`${this.apiUrl}/lists/${listId}/items/${itemId}/restore`, {})
        .pipe(tap(() => this.loadList(listId)))
    );
  }

  clearChecked(listId: string): Promise<unknown> {
    return this.request<unknown>(() =>
      this.http
        .post<{ data: { removed: number } }>(`${this.apiUrl}/lists/${listId}/clear-checked`, {})
        .pipe(tap(() => this.loadList(listId)))
    );
  }

  /**
   * No hay endpoint de multi-accion en el server, y no lo pedimos: marcar veinte
   * casillas son veinte escrituras conmutativas que entran por la misma cola. La
   * seleccion multiple gana asi su Deshacer linea a linea sin contratos nuevos.
   */
  bulkCheck(listId: string, itemIds: string[], checked: boolean): void {
    for (const id of itemIds) {
      const item = this.items().find(candidate => candidate.id === id);
      if (!item) continue;
      this.toggleItem(listId, { ...item, checked: checked ? 0 : 1 });
    }
  }

  bulkRemove(listId: string, itemIds: string[]): void {
    for (const id of itemIds) {
      const item = this.items().find(candidate => candidate.id === id);
      if (item) this.removeItem(listId, item);
    }
  }

  reorder(listId: string, orderedItemIds: string[]): Promise<unknown> {
    return this.request<unknown>(() =>
      this.http
        .put<{ data: unknown }>(`${this.apiUrl}/lists/${listId}/order`, {
          itemIds: orderedItemIds,
          version: this.list()?.version ?? 1
        })
        .pipe(tap(() => this.loadList(listId)))
    );
  }

  // ------------------------------------------------------------ estimacion

  loadEstimate(listId: string): Promise<ListEstimate | null> {
    return this.request<ListEstimate>(() =>
      this.http
        .get<{ data: ListEstimate }>(`${this.apiUrl}/lists/${listId}/estimate`)
        .pipe(map(response => response.data), tap(estimate => this.estimate.set(estimate)))
    );
  }

  // --------------------------------------------------------------- precios

  loadPrices(): void {
    this.http
      .get<{ data: PriceObservation[] }>(`${this.apiUrl}/prices`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: response => this.prices.set(response.data), error: () => this.prices.set([]) });
  }

  addPrice(input: {
    productName: string;
    priceMinor: number;
    quantity?: number;
    unit?: string | null;
    storeName?: string | null;
  }): Promise<PriceObservation | null> {
    return this.request<PriceObservation>(() =>
      this.http
        .post<{ data: PriceObservation }>(`${this.apiUrl}/prices`, input)
        .pipe(map(response => response.data), tap(() => this.loadPrices()))
    );
  }

  deletePrice(id: string): Promise<unknown> {
    this.prices.update(prices => prices.filter(price => price.id !== id));
    return this.request<unknown>(() => this.http.delete(`${this.apiUrl}/prices/${id}`).pipe(tap(() => this.loadPrices())));
  }

  // ---------------------------------------------------------------- infra

  /** Numero de escrituras pendientes de confirmar, para la barra de estado. */
  private track<T>(source: Observable<T>): Observable<T> {
    this.pendingWrites.update(count => count + 1);
    this.saving.set(true);
    return source.pipe(
      finalize(() => {
        const left = Math.max(0, this.pendingWrites() - 1);
        this.pendingWrites.set(left);
        this.saving.set(left > 0);
      })
    );
  }

  /**
   * Encola en vez de perder la escritura. La clave evita el acoso: tocar cuatro
   * veces la casilla de una linea es una intencion, no cuatro peticiones.
   */
  private enqueue(key: string, send: () => Observable<unknown>): void {
    const existing = this.queue.findIndex(entry => entry.key === key);
    const entry: QueuedWrite = { key, send: () => this.track(send()) };
    if (existing === -1) this.queue.push(entry);
    else this.queue[existing] = entry;
    void this.flush();
  }

  private flushing = false;

  private async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    while (this.queue.length > 0) {
      const entry = this.queue[0];
      try {
        await firstValue(entry.send());
        this.queue.shift();
      } catch (error) {
        // Error de negocio (4xx): reintentar no lo arregla, se descarta y se avisa.
        if (isConflict(error)) {
          this.queue.shift();
          this.toast.warning('La lista cambio en otro aparato', 'Se han vuelto a cargar los datos.');
          const listId = this.list()?.id;
          if (listId) this.loadList(listId);
          continue;
        }
        if (isNetworkError(error)) continue; // se queda en la cola hasta tener red
        this.queue.shift();
      }
    }
    this.flushing = false;
  }

  /** Petición corta: se espera, se propaga el fallo al llamador y ya. */
  private async request<T>(factory: () => Observable<T>): Promise<T | null> {
    try {
      return await firstValue(this.track(factory()));
    } catch (error) {
      if (isConflict(error)) {
        const listId = this.list()?.id;
        this.toast.warning('La lista cambio en otro aparato', listId ? 'Se han vuelto a cargar los datos.' : undefined);
        if (listId) this.loadList(listId);
      } else if (isNetworkError(error)) {
        this.toast.warning('Sin conexion', 'El cambio se reintentara automaticamente.');
      } else if (error instanceof HttpErrorResponse && error.status !== 0) {
        this.toast.error('No se ha podido guardar', errorMessage(error));
      }
      return null;
    }
  }

  private pushItem(item: ShoppingListItem): void {
    this.items.update(items => (items.some(candidate => candidate.id === item.id) ? items.map(candidate => (candidate.id === item.id ? item : candidate)) : [...items, item]));
    void this.loadEstimate(item.list_id);
  }

  private replaceItem(next: ShoppingListItem): void {
    if (!next?.id) return;
    this.items.update(items => items.map(item => (item.id === next.id ? { ...item, ...next } : item)));
  }
}

function firstValue<T>(source: Observable<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const subscription = source.subscribe({
      next: value => {
        settled = true;
        resolve(value);
        setTimeout(() => subscription.unsubscribe(), 0);
      },
      error: error => {
        if (!settled) reject(error);
      },
      complete: () => {
        if (!settled) reject(new Error('respuesta vacia'));
      }
    });
  });
}

function isConflict(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status === 409 || error.error?.code === 'LIST_VERSION_CONFLICT');
}

function isNetworkError(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status === 0 || error.status === 502 || error.status === 504);
}

function errorMessage(error: HttpErrorResponse): string {
  const message = error.error?.message;
  return typeof message === 'string' && message ? message : `Error ${error.status}`;
}
