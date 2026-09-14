import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Recipe, RecipeFilter, RecipeListResponse } from '../../shared/models/recipe.model';

@Injectable({
  providedIn: 'root'
})
export class RecipeService {
  private readonly apiUrl = `${environment.apiUrl}/recipes`;
  private http = inject(HttpClient);

  // Signals
  private recipesSignal = signal<Recipe[]>([]);
  private currentRecipeSignal = signal<Recipe | null>(null);
  private isLoadingSignal = signal(false);
  private totalSignal = signal(0);

  readonly recipes = this.recipesSignal.asReadonly();
  readonly currentRecipe = this.currentRecipeSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly total = this.totalSignal.asReadonly();

  loadRecipes(filter?: RecipeFilter): void {
    this.isLoadingSignal.set(true);

    let params = new HttpParams();
    if (filter?.search) params = params.set('search', filter.search);
    if (filter?.difficulty) params = params.set('difficulty', filter.difficulty);
    if (filter?.mealType) params = params.set('mealType', filter.mealType);
    if (filter?.maxTime) params = params.set('maxTime', filter.maxTime.toString());
    if (filter?.isFavorite) params = params.set('isFavorite', 'true');
    if (filter?.author) params = params.set('author', filter.author);

    this.http.get<any>(this.apiUrl, { params }).pipe(
      tap(response => {
        this.recipesSignal.set(response.data.recipes);
        this.totalSignal.set(response.data.total);
        this.isLoadingSignal.set(false);
      }),
      catchError(() => {
        this.isLoadingSignal.set(false);
        return of(null);
      })
    ).subscribe();
  }

  getRecipe(id: string): Observable<Recipe | null> {
    return this.http.get<any>(`${this.apiUrl}/${id}`).pipe(
      tap(response => this.currentRecipeSignal.set(response.data)),
      catchError(() => of(null))
    );
  }

  createRecipe(recipe: Partial<Recipe>): Observable<Recipe | null> {
    return this.http.post<any>(this.apiUrl, recipe).pipe(
      tap(response => {
        this.recipesSignal.update(list => [response.data, ...list]);
      }),
      catchError(() => of(null))
    );
  }

  toggleFavorite(id: string): void {
    this.http.post<any>(`${this.apiUrl}/${id}/favorite`, {}).pipe(
      tap(response => {
        this.recipesSignal.update(list =>
          list.map(r => r.id === id ? { ...r, isFavorite: response.data.isFavorite } : r)
        );
      }),
      catchError(() => of(null))
    ).subscribe();
  }

  recordCooking(id: string): void {
    this.http.post<any>(`${this.apiUrl}/${id}/cook`, {}).pipe(
      tap(() => {
        this.recipesSignal.update(list =>
          list.map(r => r.id === id ? { ...r, timesCooked: r.timesCooked + 1 } : r)
        );
      }),
      catchError(() => of(null))
    ).subscribe();
  }

  adjustServings(id: string, servings: number): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/${id}/adjust-servings`, { servings });
  }

  deleteRecipe(id: string): Observable<boolean> {
    return this.http.delete<any>(`${this.apiUrl}/${id}`).pipe(
      tap(() => {
        this.recipesSignal.update(list => list.filter(r => r.id !== id));
      }),
      catchError(() => of(false))
    );
  }
}
