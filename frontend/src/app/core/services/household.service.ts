import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Household, InvitePreview } from '../../shared/models/household.model';
import { STORAGE_KEYS } from './storage.service';

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
        this.householdSignal.set(response.data ? this.mapHousehold(response.data) : null);
        this.isLoadingSignal.set(false);
      }),
      catchError(() => {
        this.isLoadingSignal.set(false);
        return of(null);
      })
    ).subscribe();
  }

  /** Fetch public info about an invite code (no auth needed on backend, but we have cookie/token anyway). */
  previewInvite(code: string): Observable<InvitePreview | null> {
    return this.http.get<any>(`${this.apiUrl}/invite/${code}`).pipe(
      tap(r => r?.data),
      catchError(() => of(null))
    );
  }

  /** Join household by invite code (for already-logged-in users). */
  joinByCode(code: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/join/${code}`, {}).pipe(
      tap(() => this.loadHousehold()),
      catchError((err) => { throw err; })
    );
  }

  createHousehold(name: string, sharedPantry = true): Observable<Household | null> {
    return this.http.post<any>(this.apiUrl, { name, sharedPantry }).pipe(
      tap(response => {
        this.householdSignal.set(response.data ? this.mapHousehold(response.data) : null);
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

  updateSettings(data: {
    name?: string;
    sharedPantry?: boolean;
    shareRecipes?: boolean;
    shareCalendar?: boolean;
  }): Observable<Household | null> {
    return this.http.patch<any>(this.apiUrl, data).pipe(
      tap(response => {
        this.householdSignal.set(response.data ? this.mapHousehold(response.data) : null);
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
      const url = `${window.location.origin}/invite/${code}`;
      navigator.clipboard.writeText(url);
    }
  }

  getInviteLink(code?: string): string {
    const c = code ?? this.householdSignal()?.inviteCode;
    return `${window.location.origin}/invite/${c}`;
  }

  isAdmin(): boolean {
    return this.householdSignal()?.myRole === 'admin';
  }

  /** Map snake_case DB row to camelCase Household. */
  private mapHousehold(raw: any): Household {
    const me = raw.members?.find((m: any) => m.userId === this.currentUserId())
      || raw.members?.[0];
    return {
      id: raw.id,
      name: raw.name,
      inviteCode: raw.inviteCode,
      members: (raw.members || []).map((m: any) => ({
        id: m.id,
        userId: m.userId,
        name: m.name,
        email: m.email,
        avatar: m.avatar ?? undefined,
        role: m.role,
        cookingLevel: m.cookingLevel,
        joinedAt: m.joinedAt,
        permissions: m.permissions
      })),
      sharedPantry: !!raw.sharedPantry,
      shareRecipes: raw.shareRecipes !== false,
      shareCalendar: raw.shareCalendar !== false,
      myRole: me?.role,
      myPermissions: me?.permissions,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    };
  }

  private currentUserId(): string | null {
    try {
      // Read from localStorage without importing AuthService to avoid circular imports.
      const user = localStorage.getItem(STORAGE_KEYS.currentUser);
      return user ? JSON.parse(user).id : null;
    } catch { return null; }
  }
}
