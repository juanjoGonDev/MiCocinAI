import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom, tap, map, catchError, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  Ingredient,
  Utensil,
  PantryFilter,
  PantryStats,
  CreateIngredientInput,
  UpdateIngredientInput,
  CreateUtensilInput,
  UpdateUtensilInput,
  PantryCategory,
  PantryCategoryImpact,
  PantryCategoryInput,
  PantryCategoryKey,
  PantryCategoryListResult,
  PantryCategoryView,
  PantryProduct,
  PantryProductImpact,
  PantryProductInput,
  PantryProductListResult,
  PantryProductQuery,
  PantryRequest,
  PantryBulkImpact
} from '../../shared/models/pantry.model';

@Injectable({
  providedIn: 'root'
})
export class PantryService {
  private readonly apiUrl = `${environment.apiUrl}/pantry`;
  private http = inject(HttpClient);

  // Signals
  private ingredientsSignal = signal<Ingredient[]>([]);
  private utensilsSignal = signal<Utensil[]>([]);
  private statsSignal = signal<PantryStats | null>(null);
  private isLoadingSignal = signal(false);
  private totalSignal = signal(0);

  // Public readonly
  readonly ingredients = this.ingredientsSignal.asReadonly();
  readonly utensils = this.utensilsSignal.asReadonly();
  readonly stats = this.statsSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly total = this.totalSignal.asReadonly();

  // ═══════════════════════════════════════════════════════════════
  // Ingredients
  // ═══════════════════════════════════════════════════════════════

  loadIngredients(filter?: PantryFilter): void {
    this.isLoadingSignal.set(true);

    let params = new HttpParams();
    if (filter?.search) params = params.set('search', filter.search);
    if (filter?.category) params = params.set('category', filter.category);
    if (filter?.location) params = params.set('location', filter.location);
    if (filter?.expiringSoon) params = params.set('expiringSoon', 'true');
    if (filter?.expired) params = params.set('expired', 'true');
    if (filter?.page) params = params.set('page', String(filter.page));
    if (filter?.pageSize) params = params.set('pageSize', String(filter.pageSize));

    this.http.get<any>(`${this.apiUrl}/ingredients`, { params }).pipe(
      tap(response => {
        this.ingredientsSignal.set(response.data.ingredients);
        this.totalSignal.set(response.data.total);
        this.isLoadingSignal.set(false);
      }),
      catchError(() => {
        this.isLoadingSignal.set(false);
        return of(null);
      })
    ).subscribe();
  }

  getIngredient(id: string): Observable<Ingredient | null> {
    return this.http.get<any>(`${this.apiUrl}/ingredients/${id}`).pipe(
      tap(response => response.data),
      catchError(() => of(null))
    );
  }

  createIngredient(data: CreateIngredientInput): Observable<Ingredient | null> {
    return this.http.post<any>(`${this.apiUrl}/ingredients`, data).pipe(
      tap(response => {
        this.ingredientsSignal.update(list => [response.data, ...list]);
        this.loadStats();
      }),
      // Se propaga el error: si se silencia, la UI muestra "Agregado" aunque
      // el backend haya rechazado el alta con un 400.
      catchError(error => throwError(() => error))
    );
  }

  updateIngredient(id: string, data: UpdateIngredientInput): Observable<Ingredient | null> {
    return this.http.patch<any>(`${this.apiUrl}/ingredients/${id}`, data).pipe(
      tap(response => {
        this.ingredientsSignal.update(list =>
          list.map(i => i.id === id ? response.data : i)
        );
        this.loadStats();
      }),
      catchError(error => throwError(() => error))
    );
  }

  deleteIngredient(id: string): Observable<boolean> {
    return this.http.delete<any>(`${this.apiUrl}/ingredients/${id}`).pipe(
      tap(() => {
        this.ingredientsSignal.update(list => list.filter(i => i.id !== id));
        this.loadStats();
      }),
      catchError(() => of(false))
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Utensils
  // ═══════════════════════════════════════════════════════════════

  /**
   * Devuelve el observable (no se suscribe aqui) para que el componente
   * sepa cuando termina la carga. Los errores NO se silencian: si el
   * servidor falla, el componente debe poder avisar al usuario.
   */
  loadUtensils(): Observable<Utensil[]> {
    return this.http.get<any>(`${this.apiUrl}/utensils`).pipe(
      tap(response => this.utensilsSignal.set(response.data ?? [])),
      map(response => (response.data ?? []) as Utensil[])
    );
  }

  createUtensil(data: CreateUtensilInput): Observable<Utensil> {
    return this.http.post<any>(`${this.apiUrl}/utensils`, data).pipe(
      tap(response => {
        this.utensilsSignal.update(list => [...list, response.data]);
      }),
      map(response => response.data)
    );
  }

  updateUtensil(id: string, data: UpdateUtensilInput): Observable<Utensil> {
    return this.http.patch<any>(`${this.apiUrl}/utensils/${id}`, data).pipe(
      tap(response => {
        this.utensilsSignal.update(list =>
          list.map(u => u.id === id ? response.data : u)
        );
      }),
      map(response => response.data)
    );
  }

  deleteUtensil(id: string): Observable<boolean> {
    return this.http.delete<any>(`${this.apiUrl}/utensils/${id}`).pipe(
      tap(() => {
        this.utensilsSignal.update(list => list.filter(u => u.id !== id));
      }),
      map(() => true)
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Stats
  // ═══════════════════════════════════════════════════════════════

  loadStats(): void {
    this.http.get<any>(`${this.apiUrl}/ingredients/stats`).pipe(
      tap(response => {
        // El backend cuenta los ingredientes reales de la despensa en
        // `data.total` (solo los que tienen quantity > 0); el modelo lo
        // expone como `totalItems`, asi que se mapea aqui en lugar de
        // guardar el payload tal cual.
        this.statsSignal.set({ ...response.data, totalItems: response.data.total });
      }),
      catchError(() => of(null))
    ).subscribe();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // El gestor del inventario: categorias y productos principales (HOGARIA-SPEC ## 12x)
  //
  // Estas llamadas devuelven una `Promise` con el resultado en una union, no un Observable, y no es un
  // capricho de estilo: lo que la pantalla tiene que hacer es «intenta borrar; si el server contesta que
  // todavia hay 42 articulos encima, ensenaselo antes de insistir». Con Observable eso es un arbol de
  // operadores sobre un error; aqui es un `await` y un `if`. Tampoco toastifica este servicio: el interceptor
  // ya avisa de lo que no debio fallar, y de los 4xx se ocupa quien tiene el contexto para nombrarlos.
  // ═══════════════════════════════════════════════════════════════════════════

  private readonly savingSignal = signal(false);
  readonly saving = this.savingSignal.asReadonly();

  private readonly categoriesSignal = signal<PantryCategory[]>([]);
  readonly categories = this.categoriesSignal.asReadonly();
  private categoriesLoaded = false;

  /** El catalogo, en cache. La pantalla lo pide al entrar y las mutaciones lo refrescan con `force`. */
  loadCategories(force = false): void {
    if (this.categoriesLoaded && !force) return;
    this.http
      .get<{ data: PantryCategory[] }>(`${this.apiUrl}/categories`, { params: { limit: 100 } })
      .pipe(
        map((response) => response.data ?? []),
        catchError(() => of([] as PantryCategory[]))
      )
      .subscribe((categorias) => {
        this.categoriesLoaded = true;
        this.categoriesSignal.set(categorias);
      });
  }

  listCategories(view: PantryCategoryView = 'all', q = '', limit = 100, offset = 0): Promise<PantryCategoryListResult | null> {
    let params = new HttpParams({ fromObject: { view, limit: String(limit), offset: String(offset) } });
    if (q) params = params.set('q', q);
    return this.request<PantryCategoryListResult>(() =>
      this.http.get<any>(`${this.apiUrl}/categories`, { params }).pipe(
        map((response) => ({ data: response.data ?? [], meta: response.meta, hasMore: Boolean(response.hasMore) }))
      )
    ).then((resultado) => (resultado.ok ? resultado.data : null));
  }

  createCategory(input: PantryCategoryInput): Promise<PantryRequest<PantryCategory>> {
    return this.request<PantryCategory>(() =>
      this.http.post<{ data: PantryCategory }>(`${this.apiUrl}/categories`, input).pipe(map((response) => response.data))
    ).then((resultado) => {
      if (resultado.ok) this.loadCategories(true);
      return resultado;
    });
  }

  updateCategory(id: string, input: Partial<PantryCategoryInput>): Promise<PantryRequest<PantryCategory>> {
    return this.request<PantryCategory>(() =>
      this.http
        .patch<{ data: PantryCategory }>(`${this.apiUrl}/categories/${id}`, input)
        .pipe(map((response) => response.data))
    ).then((resultado) => {
      if (resultado.ok) this.loadCategories(true);
      return resultado;
    });
  }

  categoryImpact(id: string): Promise<PantryCategoryImpact | null> {
    return this.request<PantryCategoryImpact>(() =>
      this.http
        .get<{ data: PantryCategoryImpact }>(`${this.apiUrl}/categories/${id}/delete-impact`)
        .pipe(map((response) => response.data))
    ).then((resultado) => (resultado.ok ? resultado.data : null));
  }

  deleteCategory(id: string): Promise<PantryRequest<null>> {
    return this.request<null>(() => this.http.delete<void>(`${this.apiUrl}/categories/${id}`).pipe(map(() => null))).then((resultado) => {
      this.loadCategories(true);
      return resultado;
    });
  }

  listProducts(query: PantryProductQuery = {}): Promise<PantryProductListResult | null> {
    let params = new HttpParams();
    if (query.q) params = params.set('q', query.q);
    if (query.category) params = params.set('category', query.category);
    if (query.filter) params = params.set('filter', query.filter);
    if (query.sort) params = params.set('sort', query.sort);
    params = params.set('limit', String(query.limit ?? 10)).set('offset', String(query.offset ?? 0));
    return this.request<PantryProductListResult>(() =>
      this.http.get<any>(`${this.apiUrl}/products`, { params }).pipe(
        map((response) => ({ data: (response.data ?? []) as PantryProduct[], meta: response.meta, hasMore: Boolean(response.hasMore) }))
      )
    ).then((resultado) => (resultado.ok ? resultado.data : null));
  }

  createProduct(input: PantryProductInput): Promise<PantryRequest<PantryProduct>> {
    return this.request<PantryProduct>(() =>
      this.http.post<{ data: PantryProduct }>(`${this.apiUrl}/products`, input).pipe(map((response) => response.data))
    );
  }

  updateProduct(id: string, input: Partial<PantryProductInput>): Promise<PantryRequest<PantryProduct>> {
    return this.request<PantryProduct>(() =>
      this.http.patch<{ data: PantryProduct }>(`${this.apiUrl}/products/${id}`, input).pipe(map((response) => response.data))
    );
  }

  productImpact(id: string): Promise<PantryProductImpact | null> {
    return this.request<PantryProductImpact>(() =>
      this.http
        .get<{ data: PantryProductImpact }>(`${this.apiUrl}/products/${id}/delete-impact`)
        .pipe(map((response) => response.data))
    ).then((resultado) => (resultado.ok ? resultado.data : null));
  }

  deleteProduct(id: string): Promise<PantryRequest<null>> {
    return this.request<null>(() => this.http.delete<void>(`${this.apiUrl}/products/${id}`).pipe(map(() => null)));
  }

  /** Lo que el dialogo de lote necesita saber antes de marcar nada: cuales se pueden y cuales estorban. */
  bulkProductImpact(ids: string[]): Promise<PantryBulkImpact | null> {
    return this.request<PantryBulkImpact>(() =>
      this.http
        .post<{ data: PantryBulkImpact }>(`${this.apiUrl}/products/bulk-delete-impact`, { ids })
        .pipe(map((response) => response.data))
    ).then((resultado) => (resultado.ok ? resultado.data : null));
  }

  bulkDeleteProducts(ids: string[]): Promise<PantryRequest<{ deleted: number }>> {
    return this.request<{ deleted: number }>(() =>
      this.http
        .post<{ data: { deleted: number } }>(`${this.apiUrl}/products/bulk-delete`, { ids })
        .pipe(map((response) => response.data))
    );
  }

  /** Un `key` del catalogo, para quien solo tiene la clave de una fila de la despensa. */
  categoryByKey(key: PantryCategoryKey | null | undefined): PantryCategory | undefined {
    if (!key) return undefined;
    return this.categoriesSignal().find((categoria) => categoria.key === key);
  }

  private async request<T>(factory: () => Observable<T>): Promise<PantryRequest<T>> {
    this.savingSignal.set(true);
    try {
      return { ok: true, data: await firstValueFrom(factory()) };
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        const cuerpo = (error.error ?? {}) as { error?: string; message?: string; details?: unknown };
        return {
          ok: false,
          status: error.status,
          error: cuerpo.error ?? 'UNKNOWN',
          message: cuerpo.message ?? error.statusText,
          ...(cuerpo.details === undefined ? {} : { details: cuerpo.details })
        };
      }
      return { ok: false, status: 0, error: 'NETWORK', message: error instanceof Error ? error.message : 'Error de red' };
    } finally {
      this.savingSignal.set(false);
    }
  }
}

