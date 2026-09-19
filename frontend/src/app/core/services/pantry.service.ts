import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap, map, catchError, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Ingredient,
  Utensil,
  PantryFilter,
  PantryStats,
  CreateIngredientInput,
  UpdateIngredientInput,
  CreateUtensilInput,
  UpdateUtensilInput
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
}
