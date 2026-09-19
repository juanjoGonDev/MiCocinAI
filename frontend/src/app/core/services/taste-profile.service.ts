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
import {
  DEFAULT_HOME_PROFILE,
  HomeModule,
  HomeProfile,
  toHomeProfile
} from '../../shared/models/home-profile';

/**
 * Gustos, alergias y objetivo del comensal.
 *
 * Se rellena en el onboarding y se edita en Preferencias; el estado vive aquí
 * que las dos vistas vean lo mismo sin recargar la página.
 */
@Injectable({
  providedIn: 'root'
})
export class TasteProfileService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/auth/taste`;

  readonly taste = signal<TasteProfile>(emptyTasteProfile());
  /** Nivel de cocina y secciones de la casa que quiere llevar. */
  readonly profile = signal<HomeProfile>(DEFAULT_HOME_PROFILE);
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
    onboardingStatus?: OnboardingStatus,
    profile?: Partial<HomeProfile>
  ): Observable<TasteResponse> {
    this.isLoading.set(true);

    return this.http
      .patch<any>(this.apiUrl, {
        taste,
        ...(onboardingStatus ? { onboardingStatus } : {}),
        ...(profile?.cookingLevel ? { cookingLevel: profile.cookingLevel } : {}),
        ...(profile?.modules ? { modules: profile.modules } : {})
      })
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
    this.profile.set(toHomeProfile(data.profile));
    this.isLoaded.set(true);
  }
}
