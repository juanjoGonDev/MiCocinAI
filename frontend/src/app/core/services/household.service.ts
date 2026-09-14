import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Household } from '../../shared/models/household.model';

@Injectable({
  providedIn: 'root'
})
export class HouseholdService {
  private readonly apiUrl = `${environment.apiUrl}/household`;
  private http = inject(HttpClient);

  private householdSignal = signal<Household | null>(null);
  private isLoadingSignal = signal(false);

  readonly household = this.householdSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();

  loadHousehold(): void {
    this.isLoadingSignal.set(true);

    this.http.get<any>(this.apiUrl).pipe(
      tap(response => {
        this.householdSignal.set(response.data);
        this.isLoadingSignal.set(false);
      }),
      catchError(() => {
        this.isLoadingSignal.set(false);
        return of(null);
      })
    ).subscribe();
  }

  createHousehold(name: string, sharedPantry = true): Observable<Household | null> {
    return this.http.post<any>(this.apiUrl, { name, sharedPantry }).pipe(
      tap(response => {
        this.householdSignal.set(response.data);
      }),
      catchError(() => of(null))
    );
  }

  joinHousehold(inviteCode: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/join`, { inviteCode }).pipe(
      tap(() => this.loadHousehold()),
      catchError(() => of(null))
    );
  }

  updateHousehold(data: Partial<Household>): Observable<Household | null> {
    return this.http.patch<any>(this.apiUrl, data).pipe(
      tap(response => {
        this.householdSignal.set(response.data);
      }),
      catchError(() => of(null))
    );
  }

  regenerateInviteCode(): Observable<string | null> {
    return this.http.post<any>(`${this.apiUrl}/regenerate-invite`, {}).pipe(
      tap(response => {
        this.householdSignal.update(h => h ? { ...h, inviteCode: response.data.inviteCode } : null);
      }),
      catchError(() => of(null))
    );
  }

  leaveHousehold(): Observable<boolean> {
    return this.http.delete<any>(`${this.apiUrl}/leave`).pipe(
      tap(() => {
        this.householdSignal.set(null);
      }),
      catchError(() => of(false))
    );
  }

  copyInviteCode(): void {
    const code = this.householdSignal()?.inviteCode;
    if (code) {
      navigator.clipboard.writeText(code);
    }
  }
}
