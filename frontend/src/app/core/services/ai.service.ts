import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AIProviderConfig,
  AIRecipeRequest,
  AIRecipeResponse,
  AITestConnectionResponse
} from '../../shared/models/ai-config.model';

@Injectable({
  providedIn: 'root'
})
export class AiService {
  private readonly apiUrl = `${environment.apiUrl}/ai`;
  private http = inject(HttpClient);

  // Signals
  private configsSignal = signal<AIProviderConfig[]>([]);
  private isGeneratingSignal = signal(false);
  private generatedRecipeSignal = signal<AIRecipeResponse | null>(null);
  private generatedRecipesSignal = signal<AIRecipeResponse[]>([]);

  readonly configs = this.configsSignal.asReadonly();
  readonly isGenerating = this.isGeneratingSignal.asReadonly();
  readonly generatedRecipe = this.generatedRecipeSignal.asReadonly();
  readonly generatedRecipes = this.generatedRecipesSignal.asReadonly();

  // ═══════════════════════════════════════════════════════════════
  // Configurations
  // ═══════════════════════════════════════════════════════════════

  loadConfigs(): void {
    this.http.get<any>(`${this.apiUrl}/configs`).pipe(
      tap(response => this.configsSignal.set(response.data)),
      catchError(() => of(null))
    ).subscribe();
  }

  createConfig(config: Partial<AIProviderConfig>): Observable<AIProviderConfig | null> {
    return this.http.post<any>(`${this.apiUrl}/configs`, config).pipe(
      tap(response => {
        this.configsSignal.update(list => [...list, response.data]);
      }),
      catchError(() => of(null))
    );
  }

  updateConfig(id: string, config: Partial<AIProviderConfig>): Observable<AIProviderConfig | null> {
    return this.http.patch<any>(`${this.apiUrl}/configs/${id}`, config).pipe(
      tap(response => {
        this.configsSignal.update(list =>
          list.map(c => c.id === id ? response.data : c)
        );
      }),
      catchError(() => of(null))
    );
  }

  deleteConfig(id: string): Observable<boolean> {
    return this.http.delete<any>(`${this.apiUrl}/configs/${id}`).pipe(
      tap(() => {
        this.configsSignal.update(list => list.filter(c => c.id !== id));
      }),
      catchError(() => of(false))
    );
  }

  testConnection(configId?: string): Observable<AITestConnectionResponse | null> {
    return this.http.post<any>(`${this.apiUrl}/test-connection`, { configId }).pipe(
      catchError(() => of(null))
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Recipe Generation
  // ═══════════════════════════════════════════════════════════════

  generateRecipe(request: AIRecipeRequest): Observable<AIRecipeResponse | null> {
    this.isGeneratingSignal.set(true);

    return this.http.post<any>(`${this.apiUrl}/generate-recipe`, request).pipe(
      tap(response => {
        this.generatedRecipeSignal.set(response.data);
        this.isGeneratingSignal.set(false);
      }),
      catchError(() => {
        this.isGeneratingSignal.set(false);
        return of(null);
      })
    );
  }

  generateMultipleRecipes(request: AIRecipeRequest): Observable<AIRecipeResponse[] | null> {
    this.isGeneratingSignal.set(true);

    return this.http.post<any>(`${this.apiUrl}/generate-multiple-recipes`, request).pipe(
      tap(response => {
        this.generatedRecipesSignal.set(response.data);
        this.isGeneratingSignal.set(false);
      }),
      catchError(() => {
        this.isGeneratingSignal.set(false);
        return of(null);
      })
    );
  }

  getRecommendations(params: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/recommendations`, params);
  }

  generateWeeklyPlan(params: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/plan-week`, params);
  }

  clearGenerated(): void {
    this.generatedRecipeSignal.set(null);
    this.generatedRecipesSignal.set([]);
  }
}
