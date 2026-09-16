import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, finalize, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  emptyTasteProfile,
  hasTasteProfile,
  OnboardingState,
  OnboardingStatus,
  TasteProfile,
  TasteResponse
} from '../../shared/models/taste-profile';

/**
 * Gustos, alergias y objetivo del comensal.
 *
 * Se rellena en el onboarding y se edita en Ajustes; el estado vive aquí para
 * que las dos vistas vean lo mismo sin recargar la página.
 */
@Injectable({
  providedIn: 'root'
})
export class TasteProfileService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/auth/taste`;

  readonly taste = signal<TasteProfile>(emptyTasteProfile());
  readonly onboarding = signal<OnboardingState>({ status: 'pending', completedAt: null });
  readonly isLoading = signal(false);
  readonly isLoaded = signal(false);

  readonly hasProfile = computed(() => hasTasteProfile(this.taste()));

  /** Carga una sola vez: lo usan las vistas que solo leen el perfil. */
  ensureLoaded(): void {
    if (this.isLoaded() || this.isLoading()) return;
    this.load().subscribe({ error: () => undefined });
  }

  load(): Observable<TasteResponse> {
    this.isLoading.set(true);

    return this.http.get<any>(this.apiUrl).pipe(
      map((response) => response.data as TasteResponse),
      tap((data) => this.apply(data)),
      finalize(() => this.isLoading.set(false))
    );
  }

  save(
    taste: Partial<TasteProfile>,
    onboardingStatus?: OnboardingStatus
  ): Observable<TasteResponse> {
    this.isLoading.set(true);

    return this.http
      .patch<any>(this.apiUrl, { taste, ...(onboardingStatus ? { onboardingStatus } : {}) })
      .pipe(
        map((response) => response.data as TasteResponse),
        tap((data) => this.apply(data)),
        finalize(() => this.isLoading.set(false))
      );
  }

  private apply(data: TasteResponse): void {
    if (!data) return;

    this.taste.set({ ...emptyTasteProfile(), ...data.taste });
    this.onboarding.set(data.onboarding ?? { status: 'pending', completedAt: null });
    this.isLoaded.set(true);
  }
}
