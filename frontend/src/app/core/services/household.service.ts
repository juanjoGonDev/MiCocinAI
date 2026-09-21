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
  private failedSignal = signal(false);
  /** Si la casa ya se pidio y la respuesta fue buena, incluso cuando la respuesta fue «no tienes casa». */
  private askedSignal = signal(false);

  readonly household = this.householdSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();

  /**
   * Carga la casa si aun no la tenemos, y solo una vez.
   *
   * Existe porque `loadHousehold()` se llamaba desde el login, el registro, el dashboard y la pagina de
   * la casa: cualquiera que abriera /calendar directamente (o recargara ahi) no tenia casa en memoria, y
   * eso convertia «invitar a alguien» en un control que simplemente no estaba. Cada pantalla que
   * necesita la casa tiene que poder pedirla sin saber que la pidio otra.
   *
   * Si la peticiona fallo se permite reintentar la proxima vez: un `attempted` a secas dejaria la
   * pantalla sin casa para siempre despues de un 401 o un modo avion.
   */
  ensureHousehold(): void {
    // Ya la tenemos, o esta pidiendose: en los dos casos no hay nada que hacer. El `askedSignal` existe
    // porque «no tienes casa» TAMBIEN es una respuesta buena: sin el, cada visita al calendario
    // volveria a preguntar por una casa que no existe.
    if (this.householdSignal() || this.isLoadingSignal() || this.askedSignal()) return;
    // Un fallo anterior no es una condena: se limpia la marca y se reintenta. Sin esto, un 401 durante
    // el arranque dejaba la pantalla sin casa (y sin boton de invitar) hasta recargar.
    this.failedSignal.set(false);
    this.loadHousehold();
  }

  loadHousehold(): void {
    this.isLoadingSignal.set(true);

    this.http.get<any>(this.apiUrl).pipe(
      tap(response => {
        this.householdSignal.set(response.data ? this.mapHousehold(response.data) : null);
        this.isLoadingSignal.set(false);
        this.askedSignal.set(true);
        this.failedSignal.set(false);
      }),
      catchError(() => {
        // Se apunta el fallo, no se finge una casa vacia: `household() === null` significa «no lo
        // sabemos», y una pantalla que lo interpreta como «no tienes casa» esconde un boton que manana
        // si existe.
        this.isLoadingSignal.set(false);
        this.failedSignal.set(true);
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
