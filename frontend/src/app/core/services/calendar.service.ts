import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { WeeklyCalendar, Meal, MealType, NutritionalGoals } from '../../shared/models/calendar.model';

@Injectable({
  providedIn: 'root'
})
export class CalendarService {
  private readonly apiUrl = `${environment.apiUrl}/calendar`;
  private http = inject(HttpClient);

  // Signals
  private calendarSignal = signal<WeeklyCalendar | null>(null);
  private isLoadingSignal = signal(false);

  readonly calendar = this.calendarSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();

  loadCalendar(): void {
    this.isLoadingSignal.set(true);

    this.http.get<any>(this.apiUrl).pipe(
      tap(response => {
        this.calendarSignal.set(response.data);
        this.isLoadingSignal.set(false);
      }),
      catchError(() => {
        this.isLoadingSignal.set(false);
        return of(null);
      })
    ).subscribe();
  }

  createCalendar(weekStart: string, goals?: NutritionalGoals): Observable<WeeklyCalendar | null> {
    return this.http.post<any>(this.apiUrl, { weekStart, goals }).pipe(
      tap(response => {
        this.calendarSignal.set(response.data);
      }),
      catchError(() => of(null))
    );
  }

  addMeal(meal: {
    date: string;
    mealType: MealType;
    recipeId?: string;
    customMeal?: string;
    servings?: number;
  }): Observable<Meal | null> {
    return this.http.post<any>(`${this.apiUrl}/meals`, meal).pipe(
      tap(response => {
        // Reload calendar to get updated data
        this.loadCalendar();
      }),
      catchError(() => of(null))
    );
  }

  updateMeal(id: string, data: Partial<Meal>): Observable<Meal | null> {
    return this.http.patch<any>(`${this.apiUrl}/meals/${id}`, data).pipe(
      tap(() => this.loadCalendar()),
      catchError(() => of(null))
    );
  }

  deleteMeal(id: string): Observable<boolean> {
    return this.http.delete<any>(`${this.apiUrl}/meals/${id}`).pipe(
      tap(() => this.loadCalendar()),
      catchError(() => of(false))
    );
  }

  completeMeal(id: string, completed: boolean): void {
    this.http.patch<any>(`${this.apiUrl}/meals/${id}`, { completed }).pipe(
      tap(() => this.loadCalendar()),
      catchError(() => of(null))
    ).subscribe();
  }

  updateGoals(goals: NutritionalGoals): void {
    this.http.patch<any>(`${this.apiUrl}/goals`, goals).pipe(
      tap(() => this.loadCalendar()),
      catchError(() => of(null))
    ).subscribe();
  }

  generateWithAi(params: any): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/ai/plan-week`, params);
  }
}
