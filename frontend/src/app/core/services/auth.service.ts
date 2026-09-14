import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  User,
  AuthCredentials,
  RegisterData,
  AuthResponse,
  TokenPayload
} from '../../shared/models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly apiUrl = `${environment.apiUrl}/auth`;
  private readonly TOKEN_KEY = 'auth_token';
  private readonly REFRESH_TOKEN_KEY = 'refresh_token';
  private readonly USER_KEY = 'current_user';

  // Signals for reactive state
  private currentUserSignal = signal<User | null>(null);
  private isAuthenticatedSignal = signal<boolean>(false);
  private isLoadingSignal = signal<boolean>(false);

  // Public computed signals
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = this.isAuthenticatedSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly userName = computed(() => this.currentUserSignal()?.name || '');
  readonly userId = computed(() => this.currentUserSignal()?.id || '');

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    this.initializeFromStorage();
  }

  private initializeFromStorage(): void {
    const token = this.getToken();
    const user = this.getStoredUser();

    if (token && user && !this.isTokenExpired(token)) {
      this.currentUserSignal.set(user);
      this.isAuthenticatedSignal.set(true);
    } else {
      this.clearStorage();
    }
  }

  login(credentials: AuthCredentials): Observable<AuthResponse> {
    this.isLoadingSignal.set(true);

    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, credentials).pipe(
      tap(response => {
        this.handleAuthResponse(response);
        this.isLoadingSignal.set(false);
      }),
      catchError(error => {
        this.isLoadingSignal.set(false);
        throw error;
      })
    );
  }

  register(data: RegisterData): Observable<AuthResponse> {
    this.isLoadingSignal.set(true);

    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, data).pipe(
      tap(response => {
        this.handleAuthResponse(response);
        this.isLoadingSignal.set(false);
      }),
      catchError(error => {
        this.isLoadingSignal.set(false);
        throw error;
      })
    );
  }

  logout(): void {
    this.clearStorage();
    this.currentUserSignal.set(null);
    this.isAuthenticatedSignal.set(false);
    this.router.navigate(['/auth/login']);
  }

  refreshToken(): Observable<AuthResponse> {
    const refreshToken = this.getRefreshToken();

    if (!refreshToken) {
      this.logout();
      return of();
    }

    return this.http.post<AuthResponse>(`${this.apiUrl}/refresh`, { refreshToken }).pipe(
      tap(response => this.handleAuthResponse(response)),
      catchError(() => {
        this.logout();
        return of();
      })
    );
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  private handleAuthResponse(response: AuthResponse): void {
    localStorage.setItem(this.TOKEN_KEY, response.token);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, response.refreshToken);
    localStorage.setItem(this.USER_KEY, JSON.stringify(response.user));

    this.currentUserSignal.set(response.user);
    this.isAuthenticatedSignal.set(true);
  }

  private clearStorage(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  private getStoredUser(): User | null {
    const userStr = localStorage.getItem(this.USER_KEY);
    if (!userStr) return null;

    try {
      return JSON.parse(userStr) as User;
    } catch {
      return null;
    }
  }

  private isTokenExpired(token: string): boolean {
    try {
      const payload = this.decodeToken(token);
      return payload.exp * 1000 < Date.now();
    } catch {
      return true;
    }
  }

  private decodeToken(token: string): TokenPayload {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload) as TokenPayload;
  }

  updateProfile(userData: Partial<User>): Observable<User> {
    return this.http.patch<User>(`${this.apiUrl}/profile`, userData).pipe(
      tap(user => {
        this.currentUserSignal.set(user);
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
      })
    );
  }

  changePassword(oldPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/change-password`, {
      oldPassword,
      newPassword
    });
  }

  forgotPassword(email: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/reset-password`, {
      token,
      newPassword
    });
  }
}
