import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TasteProfileService } from '../../core/services/taste-profile.service';
import { PantryService } from '../../core/services/pantry.service';
import { ToastService } from '../../core/services/toast.service';
import { ButtonComponent } from '../../shared/components/ui/button/button.component';
import { ChipSelectComponent } from '../../shared/components/ui/chip-select/chip-select.component';
import { HomeProfilePickerComponent } from '../../shared/components/ui/home-profile-picker/home-profile-picker.component';
import { DEFAULT_HOME_PROFILE, HomeProfile, toHomeProfile } from '../../shared/models/home-profile';
import { LoadingComponent } from '../../shared/components/ui/loading/loading.component';
import {
  COMMON_ALLERGENS,
  COMMON_DISLIKES,
  COMMON_LIKES,
  GOAL_OPTIONS,
  ONBOARDING_UTENSIL_CATEGORIES,
  TasteGoal,
  TasteProfile,
  emptyTasteProfile
} from '../../shared/models/taste-profile';
import { Utensil } from '../../shared/models/pantry.model';

type OnboardingStep = 'profile' | 'allergies' | 'tastes' | 'goal' | 'kitchen';

/**
 * Configuración inicial, nada más registrarse: alergias, gustos, objetivo y
 * con qué utensilios cuentas. Todo es opcional y se puede saltar (y editar
 * luego en Preferencias), pero es lo que usa la IA para no proponer lo que no
 * puedes comer.
 */
@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ButtonComponent,
    ChipSelectComponent,
    HomeProfilePickerComponent,
    LoadingComponent
  ],
  template: `
    <div class="onboarding">
      <div class="onboarding__card">
        <header class="onboarding__header">
          <span class="onboarding__logo">🏠</span>
          <h1 class="onboarding__title">Configura tu HogarIA</h1>
          <p class="onboarding__subtitle">
            {{ steps.length }} preguntas cortas. Con esto la IA te propone recetas que de verdad
            puedes comer y la app sabe qué quieres llevar desde aquí; podrás cambiarlo cuando
            quieras en Preferencias.
          </p>
        </header>

        <div class="onboarding__progress">
          <span class="onboarding__step-label">
            Paso {{ stepIndex() + 1 }} de {{ steps.length }} · {{ stepTitle() }}
          </span>
          <span class="onboarding__bar" aria-hidden="true">
            <span class="onboarding__bar-fill" [style.width.%]="progress()"></span>
          </span>
          <button type="button" class="onboarding__skip" (click)="skip()">Saltar por ahora</button>
        </div>

        <section class="onboarding__step" [ngSwitch]="steps[stepIndex()]">
          <!-- 1 · Alergias e intolerancias -->
          <ng-container *ngSwitchCase="'profile'">
            <h2 class="onboarding__step-title">Tu perfil</h2>
            <p class="onboarding__step-hint">
              HogarIA es cocina y casa: dinos cómo andas de cocina y qué quieres llevar desde la app.
            </p>
            <app-home-profile-picker
              [(profile)]="profile"
              (profileChange)="persistProgress()"
            ></app-home-profile-picker>
          </ng-container>

          <ng-container *ngSwitchCase="'allergies'">
            <h2 class="onboarding__step-title">¿Alergias o intolerancias?</h2>
            <p class="onboarding__step-hint">
              Marca todo lo que no puedas comer. La IA lo descarta de raíz, también como ingrediente
              escondido en un caldo o una salsa.
            </p>
            <app-chip-select
              label="Alergias e intolerancias"
              [options]="allergenOptions"
              [(value)]="taste.allergies"
              customPlaceholder="Otra alergia o intolerancia"
              hint="¿No está? Escríbelo y se añade a la lista."
            ></app-chip-select>
          </ng-container>

          <!-- 2 · Gustos -->
          <ng-container *ngSwitchCase="'tastes'">
            <h2 class="onboarding__step-title">¿Qué te gusta y qué no?</h2>
            <p class="onboarding__step-hint">
              Sirve para priorizar unos platos sobre otros. No hay respuesta mala.
            </p>

            <div class="onboarding__field">
              <h3 class="onboarding__field-title">Me gusta 👍</h3>
              <app-chip-select
                label="Lo que más te gusta"
                [options]="likeOptions"
                [(value)]="taste.likes"
                customPlaceholder="Otro alimento o tipo de cocina"
              ></app-chip-select>
            </div>

            <div class="onboarding__field">
              <h3 class="onboarding__field-title">Mejor no 👎</h3>
              <app-chip-select
                label="Lo que prefieres evitar"
                [options]="dislikeOptions"
                [(value)]="taste.dislikes"
                customPlaceholder="Otro alimento que no te gusta"
              ></app-chip-select>
            </div>

            <div class="onboarding__field">
              <label class="onboarding__field-title" for="tasteNotes">
                Y lo que quieras contarnos
              </label>
              <textarea
                id="tasteNotes"
                name="tasteNotes"
                class="onboarding__textarea"
                rows="3"
                maxlength="1000"
                placeholder="Ej: ceno pronto, nada de fritos, me va bien el tupper para comer en el trabajo, con dos niños en casa…"
                [(ngModel)]="taste.notes"
              ></textarea>
            </div>
          </ng-container>

          <!-- 3 · Objetivo -->
          <ng-container *ngSwitchCase="'goal'">
            <h2 class="onboarding__step-title">¿Cuál es tu objetivo?</h2>
            <p class="onboarding__step-hint">
              Marca el plato, no la dieta. Se lo pasamos al planificador de la semana.
            </p>

            <div class="onboarding__goals">
              <button
                *ngFor="let goal of goalOptions"
                type="button"
                class="onboarding__goal"
                [class.onboarding__goal--on]="taste.goal === goal.value"
                [attr.aria-pressed]="taste.goal === goal.value"
                (click)="selectGoal(goal.value)"
              >
                <span class="onboarding__goal-icon">{{ goal.icon }}</span>
                <span class="onboarding__goal-label">{{ goal.label }}</span>
                <span class="onboarding__goal-hint">{{ goal.hint }}</span>
              </button>
            </div>

            <div class="onboarding__field">
              <label class="onboarding__field-title" for="goalNotes">
                {{
                  taste.goal === 'custom'
                    ? 'Describe tu objetivo'
                    : '¿Algo más sobre el objetivo? (opcional)'
                }}
              </label>
              <textarea
                id="goalNotes"
                name="goalNotes"
                class="onboarding__textarea"
                rows="3"
                maxlength="500"
                [placeholder]="
                  taste.goal === 'custom'
                    ? 'Ej: sin carne los lunes, cenas de una olla y algo de pasta dos veces por semana'
                    : 'Ej: prioriza proteína en la cena y poco pan'
                "
                [(ngModel)]="taste.goalNotes"
              ></textarea>
            </div>
          </ng-container>

          <!-- 4 · Utensilios -->
          <ng-container *ngSwitchCase="'kitchen'">
            <h2 class="onboarding__step-title">¿Con qué cuentas en la cocina?</h2>
            <p class="onboarding__step-hint">
              Lo que no marques no se usa: si no tienes horno, no te proponemos nada al horno. El
              resto del catálogo (ollas, herramientas, tus utensilios propios) lo dejas marcado en
              la despensa.
            </p>

            <app-loading *ngIf="isLoadingUtensils()" message="Cargando utensilios..."></app-loading>

            <div class="utensil-grid" *ngIf="!isLoadingUtensils()">
              <label
                *ngFor="let utensil of applianceUtensils(); trackBy: trackById"
                class="utensil-card"
                [class.utensil-card--owned]="utensil.available"
              >
                <input
                  type="checkbox"
                  class="utensil-card__check"
                  [checked]="utensil.available"
                  (change)="toggleUtensil(utensil)"
                />
                <span class="utensil-card__name">{{ utensil.name }}</span>
              </label>
            </div>

            <p class="onboarding__link-row">
              <a
                routerLink="/pantry"
                [queryParams]="{ tab: 'utensils' }"
                (click)="persistProgress()"
              >
                Marcar el resto de utensilios →
              </a>
              <a
                routerLink="/pantry"
                [queryParams]="{ tab: 'ingredients' }"
                (click)="persistProgress()"
              >
                Revisar la despensa →
              </a>
            </p>
          </ng-container>
        </section>

        <footer class="onboarding__nav">
          <app-button
            variant="ghost"
            [disabled]="stepIndex() === 0 || isSaving()"
            (onClick)="back()"
          >
            ← Atrás
          </app-button>
          <app-button *ngIf="!isLastStep()" variant="primary" (onClick)="next()">
            Siguiente →
          </app-button>
          <app-button
            *ngIf="isLastStep()"
            variant="primary"
            [loading]="isSaving()"
            (onClick)="finish()"
          >
            Guardar y empezar
          </app-button>
        </footer>
      </div>

      <p class="onboarding__footnote">
        Se guarda en tu cuenta, no en el hogar: cada comensal puede tener lo suyo.
      </p>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--bg-secondary);
        padding: var(--space-6) var(--space-4);
      }
      .onboarding {
        max-width: 720px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .onboarding__card {
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-xl);
        padding: var(--space-6);
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
      }
      .onboarding__header {
        text-align: center;
      }
      .onboarding__logo {
        font-size: 40px;
        display: block;
        margin-bottom: var(--space-2);
      }
      .onboarding__title {
        font-family: var(--font-display);
        font-size: var(--text-2xl);
        font-weight: var(--font-bold);
        margin: 0 0 var(--space-2);
      }
      .onboarding__subtitle {
        margin: 0 auto;
        max-width: 46ch;
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }

      .onboarding__progress {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        flex-wrap: wrap;
      }
      .onboarding__step-label {
        font-size: var(--text-xs);
        font-weight: var(--font-medium);
        color: var(--text-secondary);
        white-space: nowrap;
      }
      .onboarding__bar {
        flex: 1 1 120px;
        min-width: 80px;
        height: 6px;
        background: var(--bg-tertiary);
        border-radius: var(--radius-full);
        overflow: hidden;
      }
      .onboarding__bar-fill {
        display: block;
        height: 100%;
        background: var(--primary);
        border-radius: var(--radius-full);
        transition: width var(--duration-300) var(--ease-out);
      }
      .onboarding__skip {
        background: none;
        border: none;
        cursor: pointer;
        font-family: var(--font-sans);
        font-size: var(--text-xs);
        color: var(--text-tertiary);
        text-decoration: underline;
        padding: 0;
        &:hover {
          color: var(--text-primary);
        }
      }

      .onboarding__step {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }
      .onboarding__step-title {
        font-family: var(--font-display);
        font-size: var(--text-lg);
        font-weight: var(--font-semibold);
        margin: 0;
      }
      .onboarding__step-hint {
        margin: 0;
        font-size: var(--text-sm);
        color: var(--text-secondary);
      }
      .onboarding__field {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .onboarding__field-title {
        font-size: var(--text-sm);
        font-weight: var(--font-medium);
        color: var(--text-primary);
      }
      .onboarding__textarea {
        width: 100%;
        resize: vertical;
        padding: var(--space-2) var(--space-3);
        font-family: var(--font-sans);
        font-size: var(--text-sm);
        color: var(--text-primary);
        background: var(--bg-secondary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        &:focus {
          outline: none;
          border-color: var(--primary);
        }
      }

      .onboarding__goals {
        display: grid;
        gap: var(--space-2);
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      }
      .onboarding__goal {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        text-align: left;
        padding: var(--space-3);
        background: var(--bg-secondary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        cursor: pointer;
        transition: var(--transition-fast);
        font-family: var(--font-sans);
        &:hover {
          border-color: var(--border-strong);
        }
        &--on {
          border-color: var(--primary);
          background: var(--primary-subtle);
        }
      }
      .onboarding__goal-icon {
        font-size: var(--text-xl);
      }
      .onboarding__goal-label {
        font-size: var(--text-sm);
        font-weight: var(--font-semibold);
        color: var(--text-primary);
      }
      .onboarding__goal-hint {
        font-size: var(--text-xs);
        color: var(--text-secondary);
      }

      .utensil-grid {
        display: grid;
        gap: var(--space-2);
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      }
      .utensil-card {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
        background: var(--bg-secondary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: var(--transition-fast);
        font-size: var(--text-sm);
        &:hover {
          border-color: var(--border-strong);
        }
        &--owned {
          background: var(--success-subtle);
          border-color: var(--success);
        }
      }
      .utensil-card__check {
        accent-color: var(--success);
      }
      .utensil-card__name {
        flex: 1;
      }

      .onboarding__link-row {
        display: flex;
        gap: var(--space-4);
        flex-wrap: wrap;
        margin: 0;
        font-size: var(--text-sm);
        a {
          color: var(--primary);
          text-decoration: none;
          &:hover {
            text-decoration: underline;
          }
        }
      }

      .onboarding__nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
      }
      .onboarding__footnote {
        margin: 0;
        text-align: center;
        font-size: var(--text-xs);
        color: var(--text-tertiary);
      }

      @media (max-width: 560px) {
        .onboarding__card {
          padding: var(--space-4);
        }
        .onboarding__goals {
          grid-template-columns: 1fr;
        }
      }
    `
  ]
})
export class OnboardingComponent implements OnInit {
  private readonly tasteService = inject(TasteProfileService);
  private readonly pantryService = inject(PantryService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);

  readonly steps: OnboardingStep[] = ['profile', 'allergies', 'tastes', 'goal', 'kitchen'];
  readonly stepIndex = signal(0);
  readonly isSaving = signal(false);
  readonly isLoadingUtensils = signal(false);
  /** Evita persistir por defecto antes de que la carga inicial haya terminado. */
  private loaded = false;

  /** Copia local: nada se guarda hasta «Guardar y empezar» o «Saltar». */
  taste: TasteProfile = emptyTasteProfile();
  profile: HomeProfile = DEFAULT_HOME_PROFILE;

  readonly allergenOptions = COMMON_ALLERGENS;
  readonly likeOptions = COMMON_LIKES;
  readonly dislikeOptions = COMMON_DISLIKES;
  readonly goalOptions = GOAL_OPTIONS;

  readonly stepTitle = computed(() => {
    switch (this.steps[this.stepIndex()]) {
      case 'profile':
        return 'Perfil';
      case 'allergies':
        return 'Alergias';
      case 'tastes':
        return 'Gustos';
      case 'goal':
        return 'Objetivo';
      default:
        return 'Cocina';
    }
  });

  readonly progress = computed(() => ((this.stepIndex() + 1) / this.steps.length) * 100);
  readonly isLastStep = computed(() => this.stepIndex() >= this.steps.length - 1);

  /** Electrodomésticos del catálogo: los que cambian qué recetas son posibles. */
  readonly applianceUtensils = computed(() =>
    this.pantryService
      .utensils()
      .filter((u) => (ONBOARDING_UTENSIL_CATEGORIES as readonly string[]).includes(u.category))
  );

  ngOnInit(): void {
    // Si ya lo hizo (o lo saltó), no se le vuelve a preguntar: entra y edita.
    this.tasteService.load().subscribe({
      next: (data) => {
        this.taste = { ...emptyTasteProfile(), ...data.taste };
        this.profile = toHomeProfile(data.profile);
        this.loaded = true;
      },
      error: () => {
        this.taste = emptyTasteProfile();
        this.profile = DEFAULT_HOME_PROFILE;
        this.loaded = true;
      }
    });

    this.ensureUtensils();
  }

  /**
   * El paso 4 no tiene mas datos que la lista de utensilios: si aquella carga
   * fallo, el usuario se quedaria con el paso vacio y sin manera de salir salvo
   * recargar. Al entrar se vuelve a pedir si no hay nada en pantalla.
   */
  private ensureUtensils(): void {
    if (this.isLoadingUtensils() || this.pantryService.utensils().length > 0) return;

    this.isLoadingUtensils.set(true);
    this.pantryService.loadUtensils().subscribe({
      next: () => this.isLoadingUtensils.set(false),
      error: () => this.isLoadingUtensils.set(false)
    });
  }

  trackById(_index: number, utensil: Utensil): string {
    return utensil.id;
  }

  selectGoal(goal: TasteGoal): void {
    this.taste.goal = goal;
  }

  toggleUtensil(utensil: Utensil): void {
    this.pantryService.updateUtensil(utensil.id, { available: !utensil.available }).subscribe({
      error: () => this.toastService.error('Error', 'No se pudo guardar el utensilio')
    });
  }

  /**
   * Guarda lo lleva contestado sin cerrar el flujo: si el usuario se va a la
   * despensa a mitad, no pierde lo que ya ha marcado.
   */
  persistProgress(): void {
    if (!this.loaded) return;
    this.tasteService.save(this.taste, undefined, this.profile).subscribe({ error: () => undefined });
  }

  next(): void {
    const target = Math.min(this.stepIndex() + 1, this.steps.length - 1);
    this.stepIndex.set(target);
    if (this.steps[target] === 'kitchen') this.ensureUtensils();
  }

  back(): void {
    if (this.stepIndex() === 0) return;
    this.stepIndex.update((step) => step - 1);
  }

  finish(): void {
    this.save('done', 'Listo', 'Tu perfil y tus preferencias ya están: la IA lo tendrá en cuenta.');
  }

  /** Se salta, pero lo que haya escrito se guarda igualmente. */
  skip(): void {
    this.save('skipped', 'Guardado', 'Puedes completarlo cuando quieras en Preferencias.');
  }

  private save(status: 'done' | 'skipped', title: string, body: string): void {
    this.isSaving.set(true);

    this.tasteService.save(this.taste, status, this.profile).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.toastService.success(title, body);
        this.router.navigate(['/dashboard']);
      },
      error: () => {
        this.isSaving.set(false);
        this.toastService.error('Error', 'No se pudo guardar la configuración');
      }
    });
  }
}
