import { Component, ElementRef, effect, inject, OnInit, computed, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { daysUntil, toDayKey } from '../../core/time';
import { PantryService } from '../../core/services/pantry.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { clearTabParam, syncTabWithUrl, writeTabParam } from '../../core/utils/tab-url';
import { ButtonComponent } from '../../shared/components/ui/button/button.component';
import { InputComponent } from '../../shared/components/ui/input/input.component';
import { CardComponent } from '../../shared/components/ui/card/card.component';
import { BadgeComponent } from '../../shared/components/ui/badge/badge.component';
import { TagComponent } from '../../shared/components/ui/tag/tag.component';
import { ModalComponent } from '../../shared/components/ui/modal/modal.component';
import { LoadingComponent } from '../../shared/components/ui/loading/loading.component';
import {
  Ingredient,
  IngredientCategory,
  MeasurementUnit,
  StorageLocation,
  Utensil,
  UtensilCategory,
  INGREDIENT_CATEGORY_LABELS,
  STORAGE_LOCATION_LABELS,
  UTENSIL_CATEGORY_LABELS
} from '../../shared/models/pantry.model';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { I18nService } from '../../core/services/i18n.service';

type PantryTab = 'ingredients' | 'utensils';

/** Pestañas de la despensa: cada una se refleja en la URL (?tab=...). */
const PANTRY_TABS = ['ingredients', 'utensils'] as const;

/**
 * El catálogo de utensilios son ~54 filas: como lista única no se acaba nunca.
 * Se agrupa por categoría y se corta en secciones de este tamaño, así que una
 * sección pueden ser varias categorías pequeñas juntas o un trozo de una grande
 * (Herramientas tiene 34). La sección activa viaja en la URL:
 *   /pantry?tab=utensils&section=tools-2
 * usando la categoría que la abre (y el número de vez, si se repite).
 */
const UTENSIL_SECTION_SIZE = 12;
const UTENSIL_SECTION_PARAM = 'section';

/**
 * La despensa se pinta entera en pantalla (sin paginacion), asi que se pide
 * una unica pagina amplia: con el tamano por defecto (20) solo se veian 20
 * de los 68 ingredientes sembrados al crear el hogar.
 */
const PAGE_SIZE = 100;

@Component({
  selector: 'app-pantry',
  standalone: true,
  imports: [
    TranslatePipe,
    
    CommonModule, FormsModule,
    ButtonComponent, InputComponent, CardComponent,
    BadgeComponent, TagComponent, ModalComponent, LoadingComponent
  ],
  template: `
    <div class="pantry">
      <!-- Header -->
      <div class="pantry__header">
        <div class="pantry__title-section">
          <h1 class="pantry__title">{{ 'pantry.title' | t }}</h1>
        </div>
        <app-button variant="primary" (onClick)="openAddModal()">
          {{ addButtonLabel() }}
        </app-button>
      </div>

      <!-- Tabs -->
      <div class="pantry__tabs">
        <button
          type="button"
          class="tab"
          [class.tab--active]="activeTab() === 'ingredients'"
          (click)="switchTab('ingredients')"
        >
          {{ 'pantry.ingredientes' | t }} <span class="tab__count">{{ inPantryCount() }}</span>
        </button>
        <button
          type="button"
          class="tab"
          [class.tab--active]="activeTab() === 'utensils'"
          (click)="switchTab('utensils')"
        >
          {{ 'pantry.utensilios' | t }} <span class="tab__count">{{ ownedUtensilsCount() }}</span>
        </button>
      </div>

      <!-- ═══════════════ INGREDIENTS TAB ═══════════════ -->
      <ng-container *ngIf="activeTab() === 'ingredients'">

        <!-- Stats Cards -->
        <div class="pantry__stats" *ngIf="pantryService.stats() as stats">
          <div class="stat-card stat-card--total">
            <span class="stat-card__icon">📦</span>
            <div class="stat-card__content">
              <span class="stat-card__value">{{ inPantryCount() }}</span>
              <span class="stat-card__label">{{ 'pantry.en_despensa' | t }}</span>
            </div>
          </div>
          <div class="stat-card stat-card--warning">
            <span class="stat-card__icon">⚠️</span>
            <div class="stat-card__content">
              <span class="stat-card__value">{{ stats.expiringSoon }}</span>
              <span class="stat-card__label">{{ 'pantry.por_caducar' | t }}</span>
            </div>
          </div>
          <div class="stat-card stat-card--danger">
            <span class="stat-card__icon">❌</span>
            <div class="stat-card__content">
              <span class="stat-card__value">{{ stats.expired }}</span>
              <span class="stat-card__label">{{ 'pantry.caducados' | t }}</span>
            </div>
          </div>
        </div>

        <!-- Search & Filters -->
        <div class="pantry__filters">
          <app-input
            id="search"
            name="search"
            type="search"
            [placeholder]="'pantry.buscar_ingredientes' | t"
            [(ngModel)]="searchTerm"
            (ngModelChange)="onSearch()"
          ></app-input>

          <div class="pantry__filter-tags">
            <app-tag
              *ngFor="let cat of ingredientCategories"
              [selected]="selectedIngCategory() === cat.value"
              (onClick)="filterByCategory(cat.value)"
            >
              {{ cat.icon }} {{ cat.label }}
            </app-tag>
          </div>
        </div>

        <app-loading *ngIf="pantryService.isLoading()" [message]="'pantry.cargando_ingredientes' | t"></app-loading>

        <div *ngIf="!pantryService.isLoading()">
          <!-- Suggestions chips (qty=0 items) -->
          <div class="suggestions" *ngIf="suggestions().length > 0">
            <div class="suggestions__header">
              <span class="suggestions__title">{{ 'pantry.sugerencias_comunes' | t }}</span>
              <span class="suggestions__hint">{{ 'pantry.toca_para_anadirlas_a' | t }}</span>
            </div>
            <div class="suggestions__chips">
              <button
                type="button"
                class="chip"
                *ngFor="let s of suggestions()"
                (click)="quickAddSuggestion(s)"
                [title]="s.name"
              >
                <span class="chip__icon">{{ getCategoryIcon(s.category) }}</span>
                <span class="chip__name">{{ s.name }}</span>
                <span class="chip__plus">+</span>
              </button>
            </div>
          </div>

          <!-- Ingredients List -->
          <div class="pantry__list">
            <div
              *ngFor="let ingredient of inPantry(); trackBy: trackById"
              class="ingredient-item"
            >
              <div class="ingredient-item__icon">{{ getCategoryIcon(ingredient.category) }}</div>
              <div class="ingredient-item__info">
                <span class="ingredient-item__name">{{ ingredient.name }}</span>
                <span class="ingredient-item__quantity">{{ ingredient.quantity }} {{ ingredient.unit }}</span>
              </div>
              <div class="ingredient-item__meta">
                <app-badge
                  *ngIf="getExpirationStatus(ingredient) as status"
                  [variant]="status.variant"
                  size="sm"
                >
                  {{ status.label }}
                </app-badge>
                <span class="ingredient-item__location">{{ getLocationIcon(ingredient.location) }}</span>
              </div>
              <div class="ingredient-item__actions">
                <button type="button" class="action-btn" (click)="editIngredient(ingredient)">✏️</button>
                <button type="button" class="action-btn action-btn--danger" (click)="deleteIngredient(ingredient)">🗑️</button>
              </div>
            </div>

            <div *ngIf="inPantry().length === 0 && suggestions().length === 0" class="empty-state">
              <span class="empty-state__icon">📦</span>
              <h3 class="empty-state__title">{{ 'pantry.empty' | t }}</h3>
              <p class="empty-state__text">{{ 'pantry.agrega_ingredientes_para_empezar' | t }}</p>
              <app-button variant="primary" (onClick)="openAddModal()">{{ 'pantry.agregar_primer_ingrediente' | t }}</app-button>
            </div>
          </div>
        </div>
      </ng-container>

      <!-- ═══════════════ UTENSILS TAB ═══════════════ -->
      <ng-container *ngIf="activeTab() === 'utensils'">
        <div class="utensils-intro">
          <p>{{ 'pantry.marca_los_utensilios_y' | t }}</p>
        </div>

        <app-loading *ngIf="utensilsLoading()" [message]="'onboarding.cargando_utensilios' | t"></app-loading>

        <div *ngIf="!utensilsLoading()" class="utensils" #utensilsTop>
          <!--
            El catálogo se recorre por secciones (UTENSIL_SECTION_SIZE filas
            cada una, agrupadas por categoría): como lista única de ~54 filas no
            lo acaba nadie. La sección activa viaja en la URL (?section=), así
            que se puede enlazar, sobrevive a la recarga y al «atrás».
          -->
          <div class="utensils-bar" *ngIf="utensilTotal() > 0">
            <span
              class="utensils-bar__step"
              *ngIf="!showAllUtensilGroups() && utensilSections().length > 1"
            >
              {{ 'pantry.seccion_de' | t:{index: activeUtensilSectionIndex() + 1, total: utensilSections().length, label: activeUtensilSectionLabel()} }}
            </span>
            <span class="utensils-bar__track" aria-hidden="true">
              <span class="utensils-bar__fill" [style.width.%]="utensilProgress()"></span>
            </span>
            <span class="utensils-bar__label">
              {{ 'pantry.de_marcados' | t:{owned: ownedUtensilsCount(), total: utensilTotal()} }}
            </span>
            <button type="button" class="utensils-bar__mode" (click)="toggleUtensilSections()">
              {{ showAllUtensilGroups() ? ('pantry.ver_por_secciones' | t) : ('pantry.ver_todo_de_golpe' | t) }}
            </button>
          </div>

          <!-- Atajo a cada categoría: salta a la sección donde cae -->
          <div
            class="utensils-sections"
            *ngIf="!showAllUtensilGroups() && utensilGroups().length > 1"
          >
            <button
              *ngFor="let category of utensilGroups()"
              type="button"
              class="utensils-section"
              [class.utensils-section--active]="isUtensilGroupActive(category.value)"
              (click)="showUtensilCategory(category.value)"
            >
              {{ category.icon }} {{ category.label }}
              <span class="utensils-section__count">
                {{ markedUtensilsIn(category) }}/{{ category.items.length }}
              </span>
            </button>
          </div>

          <div *ngIf="utensilTotal() === 0" class="empty-state">
            <span class="empty-state__icon">🍳</span>
            <h3 class="empty-state__title">{{ 'pantry.todavia_no_hay_utensilios' | t }}</h3>
            <p class="empty-state__text">
              {{ 'pantry.anade_los_que_uses' | t }}
            </p>
            <app-button variant="primary" (onClick)="openUtensilModal()">{{ 'pantry.anadir_utensilio' | t }}</app-button>
          </div>

          <div
            *ngFor="let group of visibleUtensilGroups(); trackBy: trackByCategory"
            class="utensil-group"
          >
            <div class="utensil-group__head">
              <h3 class="utensil-group__title">{{ group.icon }} {{ group.label }}</h3>
              <span class="utensil-group__meta">
                {{ 'pantry.marcados_en_grupo' | t:{owned: markedUtensilsIn(group), total: group.items.length} }}
              </span>
            </div>
            <div class="utensil-grid">
              <label
                *ngFor="let u of group.items; trackBy: trackById"
                class="utensil-card"
                [class.utensil-card--owned]="u.available"
              >
                <input
                  type="checkbox"
                  [checked]="u.available"
                  (change)="toggleUtensil(u)"
                  class="utensil-card__check"
                />
                <span class="utensil-card__name">{{ u.name }}</span>
                <button
                  type="button"
                  class="utensil-card__delete"
                  [attr.title]="'common.delete' | t"
                  (click)="deleteUtensil(u); $event.preventDefault()"
                  *ngIf="isCustomUtensil(u)"
                >🗑️</button>
              </label>
            </div>
          </div>

          <div class="utensils-nav" *ngIf="!showAllUtensilGroups() && utensilSections().length > 1">
            <app-button
              variant="ghost"
              size="sm"
              [disabled]="activeUtensilSectionIndex() === 0"
              (onClick)="prevUtensilSection()"
            >
              ← {{ previousSectionName() || ('common.anterior' | t) }}
            </app-button>
            <app-button
              [variant]="isLastUtensilSection() ? 'secondary' : 'primary'"
              size="sm"
              (onClick)="nextUtensilSection()"
            >
              {{
                isLastUtensilSection()
                  ? ('pantry.ver_todo_el_catalogo' | t)
                  : ('pantry.siguiente_seccion' | t:{name: nextSectionName()})
              }}
            </app-button>
          </div>

          <div class="utensils-add">
            <h3 class="utensils-add__title">{{ 'pantry.no_encuentras_un_utensilio' | t }}</h3>
            <p class="utensils-add__hint">
              {{ 'pantry.anade_los_que_no' | t }}
            </p>
            <app-button variant="secondary" size="sm" (onClick)="openUtensilModal()">
              {{ 'pantry.anadir_utensilio_personalizado' | t }}
            </app-button>
          </div>
        </div>
      </ng-container>

      <!-- Add/Edit Ingredient Modal -->
      <app-modal
        [isOpen]="isIngredientModalOpen()"
        [title]="editingIngredient() ? ('pantry.editar_ingrediente' | t) : ('pantry.agregar_ingrediente' | t)"
        size="md"
        (onClose)="closeIngredientModal()"
      >
        <form (ngSubmit)="saveIngredient()" class="ingredient-form">
          <app-input
            id="ingredientName"
            name="ingredientName"
            [label]="'auth.name' | t"
            [placeholder]="'pantry.ej_tomate' | t"
            [(ngModel)]="formData.name"
            [required]="true"
            [error]="formErrors.name()"
          ></app-input>

          <div class="form-row">
            <app-input
              id="quantity"
              name="quantity"
              type="number"
              [label]="'pantry.cantidad' | t"
              placeholder="0"
              [(ngModel)]="formData.quantity"
              [required]="true"
            ></app-input>

            <div class="form-field">
              <label class="form-label">{{ 'pantry.unidad' | t }}</label>
              <select [(ngModel)]="formData.unit" name="unit" class="form-select">
                <option value="g">{{ 'pantry.gramos_g' | t }}</option>
                <option value="kg">{{ 'pantry.kilogramos_kg' | t }}</option>
                <option value="ml">{{ 'pantry.mililitros_ml' | t }}</option>
                <option value="l">{{ 'pantry.litros_l' | t }}</option>
                <option value="unit">{{ 'pantry.unidades' | t }}</option>
                <option value="cup">{{ 'pantry.tazas' | t }}</option>
                <option value="tbsp">{{ 'pantry.cucharadas' | t }}</option>
                <option value="tsp">{{ 'pantry.cucharaditas' | t }}</option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-field">
              <label class="form-label">{{ 'pantry.categoria' | t }}</label>
              <select [(ngModel)]="formData.category" name="category" class="form-select">
                <option *ngFor="let cat of ingredientCategoriesNoAll" [value]="cat.value">
                  {{ cat.icon }} {{ cat.label }}
                </option>
              </select>
            </div>

            <div class="form-field">
              <label class="form-label">{{ 'pantry.ubicacion' | t }}</label>
              <select [(ngModel)]="formData.location" name="location" class="form-select">
                <option value="fridge">{{ 'pantry.nevera' | t }}</option>
                <option value="freezer">{{ 'pantry.congelador' | t }}</option>
                <option value="pantry">{{ 'pantry.title' | t }}</option>
                <option value="counter">{{ 'pantry.encimera' | t }}</option>
              </select>
            </div>
          </div>

          <app-input
            id="expiration"
            name="expiration"
            type="date"
            [label]="'pantry.fecha_de_caducidad_opcional' | t"
            [(ngModel)]="formData.expirationDate"
          ></app-input>

          <app-input
            id="notes"
            name="notes"
            [label]="'calendar.notas_opcional' | t"
            [placeholder]="'pantry.ej_comprado_ayer' | t"
            [(ngModel)]="formData.notes"
          ></app-input>

      <div class="form-actions">
        <app-button variant="ghost" type="button" (onClick)="closeIngredientModal()">{{ 'common.cancel' | t }}</app-button>
        <app-button variant="primary" type="submit" [loading]="isSaving()">
          {{ (editingIngredient() ? 'common.save' : 'pantry.agregar') | t }}
        </app-button>
      </div>
    </form>
  </app-modal>

      <!-- Add Custom Utensil Modal -->
      <app-modal
        [isOpen]="isUtensilModalOpen()"
        [attr.title]="'pantry.agregar_utensilio' | t"
        size="md"
        (onClose)="closeUtensilModal()"
      >
        <form (ngSubmit)="saveUtensil()" class="utensil-form">
          <app-input
            id="utensilName"
            name="utensilName"
            [label]="'auth.name' | t"
            [placeholder]="'pantry.ej_sous_vide_panificadora' | t"
            [(ngModel)]="utensilForm.name"
            [required]="true"
            [error]="utensilFormError()"
          ></app-input>

          <div class="form-field">
            <label class="form-label" for="utensilCategory">{{ 'pantry.categoria' | t }}</label>
            <select
              id="utensilCategory"
              name="utensilCategory"
              class="form-select"
              [(ngModel)]="utensilForm.category"
            >
              <option *ngFor="let cat of utensilCategoryOptions" [value]="cat.value">
                {{ cat.icon }} {{ cat.label }}
              </option>
            </select>
          </div>

          <label class="utensil-form__check">
            <input
              type="checkbox"
              id="utensilAvailable"
              name="utensilAvailable"
              [(ngModel)]="utensilForm.available"
            />
            <span>{{ 'pantry.lo_tengo_en_casa' | t }}</span>
          </label>

          <div class="form-actions">
            <app-button variant="ghost" type="button" (onClick)="closeUtensilModal()">{{ 'common.cancel' | t }}</app-button>
            <app-button variant="primary" type="submit" [loading]="isSavingUtensil()">{{ 'pantry.agregar' | t }}</app-button>
          </div>
        </form>
      </app-modal>
    </div>
  `,
  styles: [`
    .pantry {
      padding: var(--space-4);
      max-width: 1000px;
      margin: 0 auto;
    }
    @media (min-width: 768px) { .pantry { padding: var(--space-6); } }

    .pantry__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-4);
    }
    .pantry__title-section { display: flex; align-items: baseline; gap: var(--space-3); }
    .pantry__title {
      font-family: var(--font-display);
      font-size: var(--text-2xl);
      font-weight: var(--font-bold);
    }

    /* Tabs */
    .pantry__tabs {
      display: flex;
      gap: var(--space-2);
      border-bottom: 1px solid var(--border-default);
      margin-bottom: var(--space-5);
    }
    .tab {
      background: none;
      border: none;
      padding: var(--space-3) var(--space-4);
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      color: var(--text-secondary);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      transition: var(--transition-fast);
      &:hover { color: var(--text-primary); }
      &--active {
        color: var(--primary);
        border-bottom-color: var(--primary);
      }
    }
    .tab__count {
      background: var(--bg-tertiary);
      border-radius: var(--radius-full);
      padding: 1px 8px;
      font-size: var(--text-xs);
      color: var(--text-secondary);
    }
    .tab--active .tab__count {
      background: var(--primary-subtle);
      color: var(--primary-dark);
    }

    /* Stats */
    .pantry__stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-3);
      margin-bottom: var(--space-5);
    }
    .stat-card {
      display: flex; align-items: center; gap: var(--space-3);
      padding: var(--space-3); background: var(--bg-secondary);
      border-radius: var(--radius-lg); border: 1px solid var(--border-default);
    }
    .stat-card__icon { font-size: var(--text-2xl); }
    .stat-card__content { display: flex; flex-direction: column; }
    .stat-card__value { font-size: var(--text-xl); font-weight: var(--font-bold); }
    .stat-card__label { font-size: var(--text-xs); color: var(--text-secondary); }
    .stat-card--warning .stat-card__value { color: var(--warning); }
    .stat-card--danger .stat-card__value { color: var(--error); }

    .pantry__filters { margin-bottom: var(--space-5); }
    .pantry__filter-tags {
      display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3);
    }

    .pantry__list { display: flex; flex-direction: column; gap: var(--space-2); }

    /* Ingredient Item */
    .ingredient-item {
      display: flex; align-items: center; gap: var(--space-3);
      padding: var(--space-3); background: var(--bg-secondary);
      border-radius: var(--radius-lg); border: 1px solid var(--border-default);
      transition: var(--transition-fast);
      &:hover { border-color: var(--border-strong); }
    }
    .ingredient-item__icon { font-size: var(--text-2xl); width: 40px; text-align: center; }
    .ingredient-item__info { flex: 1; display: flex; flex-direction: column; }
    .ingredient-item__name { font-size: var(--text-sm); font-weight: var(--font-medium); }
    .ingredient-item__quantity { font-size: var(--text-xs); color: var(--text-secondary); }
    .ingredient-item__meta { display: flex; align-items: center; gap: var(--space-2); }
    .ingredient-item__location { font-size: var(--text-lg); }
    .ingredient-item__actions {
      display: flex; gap: var(--space-1); opacity: 0; transition: var(--transition-fast);
    }
    .ingredient-item:hover .ingredient-item__actions { opacity: 1; }
    .action-btn {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: var(--radius-md);
      background: none; border: none; cursor: pointer; transition: var(--transition-fast);
      &:hover { background: var(--bg-tertiary); }
      &--danger:hover { background: var(--error-subtle); }
    }

    /* Suggestions */
    .suggestions {
      background: var(--primary-subtle);
      border: 1px dashed var(--primary);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      margin-bottom: var(--space-5);
    }
    .suggestions__header {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: var(--space-3); flex-wrap: wrap; gap: var(--space-2);
    }
    .suggestions__title { font-weight: var(--font-semibold); font-size: var(--text-sm); }
    .suggestions__hint { font-size: var(--text-xs); color: var(--text-secondary); }
    .suggestions__chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .chip {
      display: inline-flex; align-items: center; gap: var(--space-1);
      padding: 6px 10px; background: var(--bg-primary);
      border: 1px solid var(--border-default); border-radius: var(--radius-full);
      font-size: var(--text-xs); cursor: pointer; transition: var(--transition-fast);
      font-family: var(--font-sans);
      &:hover {
        border-color: var(--primary); background: var(--bg-primary);
        transform: translateY(-1px);
      }
    }
    .chip__icon { font-size: 14px; }
    .chip__plus { color: var(--primary); font-weight: var(--font-bold); }

    /* Utensils */
    .utensils-intro {
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-3) var(--space-4);
      font-size: var(--text-sm);
      color: var(--text-secondary);
      margin-bottom: var(--space-5);
    }
    .utensils { display: flex; flex-direction: column; gap: var(--space-5); }
    .utensil-group__title {
      font-family: var(--font-display);
      font-size: var(--text-base);
      font-weight: var(--font-semibold);
      margin: 0 0 var(--space-2);
    }
    .utensil-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: var(--space-2);
    }
    .utensil-card {
      display: flex; align-items: center; gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      cursor: pointer; transition: var(--transition-fast);
      font-size: var(--text-sm);
      &:hover { border-color: var(--border-strong); }
      &--owned {
        background: var(--success-subtle);
        border-color: var(--success);
      }
    }
    .utensil-card__check { accent-color: var(--success); }
    .utensil-card__name { flex: 1; }
    .utensil-card__delete {
      background: none; border: none; cursor: pointer;
      opacity: 0; font-size: 12px; padding: 2px;
      .utensil-card:hover & { opacity: 1; }
    }
    /* Barra de progreso del repaso + cambio de modo */
    .utensils-bar {
      display: flex; align-items: center; gap: var(--space-3);
      flex-wrap: wrap;
    }
    .utensils-bar__track {
      flex: 1 1 120px; height: 6px; min-width: 80px;
      background: var(--bg-tertiary);
      border-radius: var(--radius-full);
      overflow: hidden;
    }
    .utensils-bar__fill {
      display: block; height: 100%;
      background: var(--success);
      border-radius: var(--radius-full);
      transition: width var(--duration-200) var(--ease-out);
    }
    .utensils-bar__label, .utensils-bar__step {
      font-size: var(--text-xs); color: var(--text-secondary);
      white-space: nowrap;
    }
    .utensils-bar__step {
      font-weight: var(--font-medium); color: var(--text-primary);
    }
    .utensils-bar__mode {
      background: none; border: 1px solid var(--border-default);
      border-radius: var(--radius-full);
      padding: 2px 10px; font-family: var(--font-sans);
      font-size: var(--text-xs); color: var(--text-secondary);
      cursor: pointer; transition: var(--transition-fast);
      &:hover { border-color: var(--primary); color: var(--primary); }
    }

    /* Navegador de secciones (una cada vez) */
    .utensils-sections {
      display: flex; flex-wrap: wrap; gap: var(--space-2);
    }
    .utensils-section {
      display: inline-flex; align-items: center; gap: var(--space-2);
      padding: var(--space-1) var(--space-3);
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-full);
      font-family: var(--font-sans); font-size: var(--text-xs);
      color: var(--text-secondary); cursor: pointer;
      transition: var(--transition-fast);
      &:hover { border-color: var(--border-strong); color: var(--text-primary); }
      &--active {
        background: var(--primary-subtle);
        border-color: var(--primary);
        color: var(--primary-dark);
      }
    }
    .utensils-section__count {
      font-size: 11px; font-variant-numeric: tabular-nums;
      background: var(--bg-tertiary);
      border-radius: var(--radius-full); padding: 0 6px;
      color: var(--text-tertiary);
      .utensils-section--active & { background: var(--bg-primary); color: var(--primary-dark); }
    }

    .utensil-group__head {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-2);
    }
    .utensil-group__head .utensil-group__title { margin: 0; }
    .utensil-group__meta { font-size: var(--text-xs); color: var(--text-tertiary); }

    .utensils-nav {
      display: flex; align-items: center; justify-content: space-between;
      gap: var(--space-3);
    }

    .utensils-add {
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
    }
    .utensils-add__title {
      font-family: var(--font-display);
      font-size: var(--text-base);
      font-weight: var(--font-semibold);
      margin: 0 0 var(--space-2);
    }
    .utensils-add__hint {
      font-size: var(--text-sm);
      color: var(--text-secondary);
      margin: 0 0 var(--space-3);
    }
    .utensil-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    .utensil-form__check {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-sm);
      color: var(--text-primary);
      cursor: pointer;
    }

    /* Form */
    .ingredient-form { display: flex; flex-direction: column; gap: var(--space-4); }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
    .form-field { display: flex; flex-direction: column; gap: var(--space-1); }
    .form-label { font-size: var(--text-sm); font-weight: var(--font-medium); color: var(--text-primary); }
    .form-select, .form-input {
      width: 100%; padding: var(--space-2) var(--space-3);
      font-family: var(--font-sans); font-size: var(--text-sm);
      color: var(--text-primary); background: var(--bg-secondary);
      border: 1px solid var(--border-default); border-radius: var(--radius-lg);
      &:focus { outline: none; border-color: var(--primary); }
    }
    .form-actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-4); }

    /* Empty */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      padding: var(--space-12); text-align: center;
    }
    .empty-state__icon { font-size: 64px; margin-bottom: var(--space-4); }
    .empty-state__title {
      font-family: var(--font-display); font-size: var(--text-xl);
      font-weight: var(--font-semibold); margin-bottom: var(--space-2);
    }
    .empty-state__text { font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-6); }

    @media (max-width: 480px) { .form-row { grid-template-columns: 1fr; } }
  `]
})
export class PantryComponent implements OnInit {
  private readonly i18n = inject(I18nService);
  pantryService = inject(PantryService);
  private toastService = inject(ToastService);
  private confirmService = inject(ConfirmService);

  // Tabs
  activeTab = signal<PantryTab>('ingredients');

  /** El boton "+ Agregar" abre el modal de la pestaña activa. */
  addButtonLabel = computed(() =>
    // Regla 18 (12t-i18n): la condicion decide la clave, el diccionario decide la frase.
    this.i18n.t(this.activeTab() === 'utensils' ? 'pantry.mas_agregar_utensilio' : 'pantry.mas_agregar')
  );

  // Ingredients
  searchTerm = '';
  selectedIngCategory = signal<IngredientCategory | ''>('');
  isIngredientModalOpen = signal(false);
  editingIngredient = signal<Ingredient | null>(null);
  isSaving = signal(false);
  utensilsLoading = signal(true);
  formErrors = { name: signal(''), quantity: signal('') };

  // Utensilios: modal de alta (el boton "+ Agregar" lo abre en esta pestaña)
  isUtensilModalOpen = signal(false);
  isSavingUtensil = signal(false);
  utensilFormError = signal('');
  utensilForm = {
    name: '',
    category: 'tools' as UtensilCategory,
    available: true
  };

  inPantry = computed(() =>
    this.pantryService.ingredients().filter(i => (i.quantity ?? 0) > 0)
  );
  suggestions = computed(() =>
    this.pantryService.ingredients().filter(i => (i.quantity ?? 0) <= 0)
  );
  inPantryCount = computed(() => this.inPantry().length);
  ownedUtensilsCount = computed(() => this.pantryService.utensils().filter(u => u.available).length);

  // Utensils grouped
  utensilGroups = computed(() => {
    const all = this.pantryService.utensils();
    return this.utensilCategoryOptions.map(cat => ({
      ...cat,
      items: all.filter(u => u.category === cat.value)
    })).filter(g => g.items.length > 0);
  });

  /**
   * Secciones del catálogo de utensilios (ver UTENSIL_SECTION_SIZE). El cursor
   * es un índice: la misma categoría puede abrir varias secciones (Herramientas
   * va por tramos), así que no sirve guardarlo como categoría.
   */
  private readonly utensilSectionSize = UTENSIL_SECTION_SIZE;
  private utensilSectionCursor = signal(0);
  showAllUtensilGroups = signal(false);
  private utensilsTop = viewChild<ElementRef<HTMLElement>>('utensilsTop');

  /** Sección pedida por URL antes de tener el catálogo cargado. */
  private pendingUtensilSection: string | null = null;

  utensilTotal = computed(() => this.pantryService.utensils().length);

  utensilProgress = computed(() =>
    this.utensilTotal() === 0
      ? 0
      : Math.round((this.ownedUtensilsCount() / this.utensilTotal()) * 100)
  );

  /** Grupos (categoría + sus utensilios) empaquetados en secciones. */
  utensilSections = computed(() => {
    const size = this.utensilSectionSize;
    type Slice = { value: UtensilCategory; label: string; icon: string; items: Utensil[] };

    // 1) las categorías que no caben en una sección se parten en tramos
    const slices: Slice[] = [];
    for (const group of this.utensilGroups()) {
      if (group.items.length <= size) {
        slices.push(group);
        continue;
      }
      for (let i = 0; i < group.items.length; i += size) {
        slices.push({ ...group, items: group.items.slice(i, i + size) });
      }
    }

    // 2) las categorías pequeñas rellenan la sección que esté abierta
    const sections: { label: string; groups: Slice[]; size: number }[] = [];
    for (const slice of slices) {
      const current = sections[sections.length - 1];
      if (current && current.size + slice.items.length <= size) {
        current.groups.push(slice);
        current.size += slice.items.length;
      } else {
        sections.push({ label: slice.label, groups: [slice], size: slice.items.length });
      }
    }
    return sections;
  });

  /** Índice dentro de rango: al borrar el último de una sección no nos salimos. */
  activeUtensilSectionIndex = computed(() => {
    const last = Math.max(this.utensilSections().length - 1, 0);
    return Math.min(Math.max(this.utensilSectionCursor(), 0), last);
  });

  activeUtensilSection = computed(() => this.utensilSections()[this.activeUtensilSectionIndex()]);

  /** 'Horno +1' para una sección que arrastra varias categorías pequeñas. */
  private utensilSectionLabel(index: number): string {
    const section = this.utensilSections()[index];
    const first = section?.groups[0];
    if (!first) return '';
    const extra = section.groups.length - 1;
    return extra > 0 ? `${first.label} +${extra}` : first.label;
  }

  activeUtensilSectionLabel = computed(() =>
    this.utensilSectionLabel(this.activeUtensilSectionIndex())
  );

  isLastUtensilSection = computed(
    () => this.activeUtensilSectionIndex() >= this.utensilSections().length - 1
  );

  /** En modo secciones solo se pinta la activa; en 'todas', el catálogo entero. */
  visibleUtensilGroups = computed(() => {
    if (this.showAllUtensilGroups()) return this.utensilGroups();
    return this.activeUtensilSection()?.groups ?? [];
  });

  markedUtensilsIn(group: { items: Utensil[] }): number {
    return group.items.filter(u => u.available).length;
  }

  /** Identificador de la sección para la URL: 'oven', 'tools', 'tools-2'... */
  private utensilSectionKey(index: number): string {
    const section = this.utensilSections()[index];
    if (!section) return '';
    const first = section.groups[0]?.value ?? '';
    const repeated = this.utensilSections()
      .slice(0, index)
      .filter(other => other.groups[0]?.value === first).length;
    return repeated === 0 ? first : `${first}-${repeated + 1}`;
  }

  private utensilSectionIndexOfKey(key: string): number {
    return this.utensilSections().findIndex((_, index) => this.utensilSectionKey(index) === key);
  }

  /** Salta a la sección donde cae esa categoría (atajo de los chips). */
  showUtensilCategory(category: UtensilCategory): void {
    const index = this.utensilSections().findIndex(section =>
      section.groups.some(group => group.value === category)
    );
    if (index >= 0) {
      this.showAllUtensilGroups.set(false);
      this.utensilSectionCursor.set(index);
      this.scrollToUtensils();
    }
  }

  isUtensilGroupActive(category: UtensilCategory): boolean {
    if (this.showAllUtensilGroups()) return false;
    return (this.activeUtensilSection()?.groups ?? []).some(group => group.value === category);
  }

  stepUtensilSection(delta: -1 | 1): void {
    const target = this.activeUtensilSectionIndex() + delta;
    if (target < 0 || target > this.utensilSections().length - 1) return;
    this.utensilSectionCursor.set(target);
    this.scrollToUtensils();
  }

  prevUtensilSection(): void {
    this.stepUtensilSection(-1);
  }

  /** En la última sección el botón pasa a "ver todo" (ya no hay siguiente). */
  nextUtensilSection(): void {
    if (this.isLastUtensilSection()) {
      this.showAllUtensilGroups.set(true);
      this.scrollToUtensils();
      return;
    }
    this.stepUtensilSection(1);
  }

  toggleUtensilSections(): void {
    this.showAllUtensilGroups.update(all => !all);
    this.scrollToUtensils();
  }

  previousSectionName(): string {
    return this.utensilSections()[this.activeUtensilSectionIndex() - 1]?.groups[0]?.label ?? '';
  }

  nextSectionName(): string {
    return this.utensilSections()[this.activeUtensilSectionIndex() + 1]?.groups[0]?.label ?? '';
  }

  /**
   * Deja visible la sección que contiene un utensilio concreto (tras darlo de
   * alta, si no, parece que no ha pasado nada: está en otra sección).
   */
  private revealUtensil(utensilId: string): void {
    const index = this.utensilSections().findIndex(section =>
      section.groups.some(group => group.items.some(u => u.id === utensilId))
    );
    if (index >= 0) {
      this.showAllUtensilGroups.set(false);
      this.utensilSectionCursor.set(index);
    }
  }

  /** Aplica la sección pedida en la URL (tras cargar el catálogo). */
  private applyUtensilSectionFromUrl(): void {
    const key = this.pendingUtensilSection ?? this.route.snapshot.queryParamMap.get(UTENSIL_SECTION_PARAM);
    this.pendingUtensilSection = null;

    const index = key ? this.utensilSectionIndexOfKey(key) : -1;
    if (index >= 0) this.utensilSectionCursor.set(index);
    this.syncUtensilSectionParam();
  }

  /** La sección activa se refleja en la URL (sección 0 = URL limpia). */
  private syncUtensilSectionParam(): void {
    const sectionInUrl =
      this.activeTab() === 'utensils' &&
      !this.showAllUtensilGroups() &&
      this.utensilSections().length > 1;

    if (!sectionInUrl) {
      clearTabParam(this.router, this.route, UTENSIL_SECTION_PARAM);
      return;
    }

    writeTabParam(
      this.router,
      this.route,
      UTENSIL_SECTION_PARAM,
      this.utensilSectionKey(this.activeUtensilSectionIndex()),
      this.utensilSectionKey(0)
    );
  }

  private scrollToUtensils(): void {
    this.utensilsTop()?.nativeElement.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  private router = inject(Router);
  private route = inject(ActivatedRoute);

  /**
   * La pestaña activa viaja en la URL (?tab=utensils), igual que en el resto de
   * vistas con pestañas de la aplicación. La sección del catálogo de utensilios
   * también (?section=tools-2) para que sea enlazable y sobreviva a la recarga.
   */
  constructor() {
    syncTabWithUrl<PantryTab>({
      param: 'tab',
      values: PANTRY_TABS,
      fallback: 'ingredients',
      current: () => this.activeTab(),
      onChange: tab => this.activeTab.set(tab)
    });

    // El catálogo aún no está cargado: la sección se guarda y se aplica al
    // terminar la carga (si no, el efecto de abajo la limpiaría de la URL).
    this.pendingUtensilSection = this.route.snapshot.queryParamMap.get(UTENSIL_SECTION_PARAM);

    effect(() => {
      // Se suscribe a lo que cambia la sección visible...
      if (this.utensilsLoading()) return;
      this.activeTab();
      this.showAllUtensilGroups();
      this.activeUtensilSectionIndex();
      // ...y lo escribe en la URL
      this.syncUtensilSectionParam();
    });
  }

  // Track which utensils are custom (no household seed match by name)
  // Simple heuristic: custom ones are those whose name doesn't exist in a fresh seed list.
  // We just let all have a delete button — deletes only affect items the user owns anyway.
  isCustomUtensil(_u: Utensil): boolean { return true; }

  formData = {
    name: '',
    quantity: 0,
    unit: 'g' as MeasurementUnit,
    category: 'other' as IngredientCategory,
    location: 'pantry' as StorageLocation,
    expirationDate: '',
    notes: ''
  };

  ingredientCategoriesNoAll = [
    { value: 'vegetables', label: 'Verduras', icon: '🥬' },
    { value: 'fruits', label: 'Frutas', icon: '🍎' },
    { value: 'meat', label: 'Carnes', icon: '🥩' },
    { value: 'fish', label: 'Pescados', icon: '🐟' },
    { value: 'dairy', label: 'Lácteos', icon: '🧀' },
    { value: 'grains', label: 'Cereales', icon: '🌾' },
    { value: 'spices', label: 'Especias', icon: '🧂' },
    { value: 'condiments', label: 'Condimentos', icon: '🫙' },
    { value: 'frozen', label: 'Congelados', icon: '❄️' },
    { value: 'canned', label: 'Enlatados', icon: '🥫' },
    { value: 'beverages', label: 'Bebidas', icon: '🥤' },
    { value: 'other', label: 'Otros', icon: '📦' }
  ];
  ingredientCategories = [
    { value: '', label: 'Todos', icon: '📋' },
    ...this.ingredientCategoriesNoAll
  ];

  /** Opciones del catálogo de utensilios (orden de secciones incluido). */
  utensilCategoryOptions: { value: UtensilCategory; label: string; icon: string }[] = [
    { value: 'oven', label: 'Horno', icon: '🔥' },
    { value: 'microwave', label: 'Microondas', icon: '📡' },
    { value: 'airfryer', label: 'Freidora de aire', icon: '🌪️' },
    { value: 'stovetop', label: 'Cocina / Placa', icon: '♨️' },
    { value: 'blender', label: 'Batidora vaso', icon: '🥤' },
    { value: 'mixer', label: 'Batidora mano', icon: '🌀' },
    { value: 'food-processor', label: 'Procesador / Robot', icon: '🤖' },
    { value: 'cookware', label: 'Ollas / Sartenes', icon: '🍳' },
    { value: 'bakeware', label: 'Horneado', icon: '🧁' },
    { value: 'tools', label: 'Herramientas', icon: '🔪' }
  ];

  ngOnInit(): void {
    this.pantryService.loadIngredients({ pageSize: PAGE_SIZE });
    this.pantryService.loadStats();
    this.loadUtensils();
  }

  private loadUtensils(): void {
    this.utensilsLoading.set(true);
    this.pantryService.loadUtensils().subscribe({
      next: () => {
        this.utensilsLoading.set(false);
        this.applyUtensilSectionFromUrl();
      },
      error: () => this.utensilsLoading.set(false)
    });
  }

  switchTab(tab: PantryTab): void {
    this.activeTab.set(tab);
  }

  onSearch(): void {
    this.pantryService.loadIngredients({
      search: this.searchTerm,
      category: this.selectedIngCategory() || undefined,
      pageSize: PAGE_SIZE
    });
  }

  filterByCategory(category: string): void {
    this.selectedIngCategory.set(category as IngredientCategory | '');
    this.pantryService.loadIngredients({
      search: this.searchTerm,
      category: (category as IngredientCategory) || undefined,
      pageSize: PAGE_SIZE
    });
  }

  /** El boton del header abre el modal de lo que se esta viendo. */
  openAddModal(prefill?: Partial<typeof this.formData>): void {
    if (this.activeTab() === 'utensils') {
      this.openUtensilModal();
      return;
    }

    this.editingIngredient.set(null);
    this.resetForm();
    if (prefill) Object.assign(this.formData, prefill);
    this.isIngredientModalOpen.set(true);
  }

  editIngredient(ingredient: Ingredient): void {
    this.editingIngredient.set(ingredient);
    this.formData = {
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      category: ingredient.category,
      location: ingredient.location,
      // `toDayKey` y no `toISOString()`: una fecha de caducidad es un DIA, y pasarla por un
      // instante la movia media jornada arriba o abajo segun la zona del dispositivo.
      expirationDate: toDayKey(ingredient.expirationDate),
      notes: ingredient.notes || ''
    };
    this.isIngredientModalOpen.set(true);
  }

  closeIngredientModal(): void {
    this.isIngredientModalOpen.set(false);
    this.editingIngredient.set(null);
    this.resetForm();
  }

  quickAddSuggestion(ing: Ingredient): void {
    // Open modal pre-filled; user sets quantity/unit/location
    this.openAddModal({
      name: ing.name,
      category: ing.category,
      unit: ing.unit,
      location: ing.location || 'pantry'
    });
  }

  /** Recarga la lista respetando la busqueda y la categoria activas. */
  private reloadIngredients(): void {
    this.pantryService.loadIngredients({
      search: this.searchTerm,
      category: this.selectedIngCategory() || undefined,
      pageSize: PAGE_SIZE
    });
    this.pantryService.loadStats();
  }

  saveIngredient(): void {
    this.formErrors.name.set('');
    this.formErrors.quantity.set('');
    if (!this.formData.name) { this.formErrors.name.set(this.i18n.t('pantry.el_nombre_es_requerido')); return; }
    if (!this.formData.quantity || this.formData.quantity <= 0) {
      this.formErrors.quantity.set(this.i18n.t('pantry.la_cantidad_debe_ser')); return;
    }
    this.isSaving.set(true);
    const data = { ...this.formData, expirationDate: this.formData.expirationDate || undefined };
    const obs = this.editingIngredient()
      ? this.pantryService.updateIngredient(this.editingIngredient()!.id, data)
      : this.pantryService.createIngredient(data);
    obs.subscribe({
      next: () => {
        this.toastService.success(
          this.editingIngredient() ? this.i18n.t('ai_config.actualizado') : this.i18n.t('pantry.agregado'),
          this.i18n.t(
            this.editingIngredient() ? 'pantry.ingrediente_actualizado' : 'pantry.ingrediente_agregado',
            { name: this.formData.name }
          )
        );
        this.closeIngredientModal();
        this.isSaving.set(false);
        this.reloadIngredients();
      },
      error: () => {
        this.toastService.error(this.i18n.t('ui.error'), this.i18n.t('pantry.no_se_pudo_guardar'));
        this.isSaving.set(false);
      }
    });
  }

  async deleteIngredient(ingredient: Ingredient): Promise<void> {
    const accepted = await this.confirmService.confirm({
      title: this.i18n.t('pantry.eliminar_ingrediente'),
      message: this.i18n.t('pantry.eliminar_de_la_despensa', { name: ingredient.name }),
      confirmText: this.i18n.t('common.delete')
    });
    if (!accepted) return;

    this.pantryService.deleteIngredient(ingredient.id).subscribe({
      next: () => {
        this.toastService.success(
          this.i18n.t('pantry.eliminado'),
          this.i18n.t('pantry.nombre_eliminado', { name: ingredient.name })
        );
        this.reloadIngredients();
      },
      error: () => this.toastService.error(this.i18n.t('ui.error'), this.i18n.t('pantry.no_se_pudo_eliminar'))
    });
  }

  // Utensils
  toggleUtensil(u: Utensil): void {
    this.pantryService.updateUtensil(u.id, { available: !u.available }).subscribe({
      next: () => this.toastService.success(
        u.available ? this.i18n.t('pantry.quitado') : this.i18n.t('pantry.anadido'),
        u.available
          ? this.i18n.t('pantry.utensilio_quitado', { name: u.name })
          : this.i18n.t('pantry.utensilio_anadido', { name: u.name })
      ),
      error: () => this.toastService.error(this.i18n.t('ui.error'), this.i18n.t('household.no_se_pudo_actualizar'))
    });
  }

  async deleteUtensil(u: Utensil): Promise<void> {
    const accepted = await this.confirmService.confirm({
      title: this.i18n.t('pantry.eliminar_utensilio'),
      message: this.i18n.t('pantry.quitar_del_catalogo', { name: u.name }),
      confirmText: this.i18n.t('common.delete')
    });
    if (!accepted) return;

    this.pantryService.deleteUtensil(u.id).subscribe({
      next: () => this.toastService.success(
        this.i18n.t('pantry.eliminado'),
        this.i18n.t('pantry.nombre_eliminado', { name: u.name })
      ),
      error: () => this.toastService.error(this.i18n.t('ui.error'), this.i18n.t('pantry.no_se_pudo_eliminar'))
    });
  }

  // Add custom utensil (modal)

  openUtensilModal(): void {
    this.utensilForm = { name: '', category: 'tools', available: true };
    this.utensilFormError.set('');
    this.isUtensilModalOpen.set(true);
  }

  closeUtensilModal(): void {
    this.isUtensilModalOpen.set(false);
    this.utensilForm = { name: '', category: 'tools', available: true };
    this.utensilFormError.set('');
  }

  saveUtensil(): void {
    const name = this.utensilForm.name.trim();
    if (!name) {
      this.utensilFormError.set(this.i18n.t('auth.el_nombre_es_requerido'));
      return;
    }

    const duplicated = this.pantryService
      .utensils()
      .some(u => u.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicated) {
      this.utensilFormError.set(this.i18n.t('pantry.ya_existe_un_utensilio'));
      return;
    }

    this.utensilFormError.set('');
    this.isSavingUtensil.set(true);
    this.pantryService.createUtensil({
      name,
      category: this.utensilForm.category,
      available: this.utensilForm.available
    }).subscribe({
      next: created => {
        this.toastService.success(this.i18n.t('pantry.anadido'), this.i18n.t('pantry.utensilio_anadido', { name }));
        this.closeUtensilModal();
        this.isSavingUtensil.set(false);
        // Se abre la sección donde ha caído: si no, parece que no se ha
        // añadido nada (el catálogo va por secciones).
        this.revealUtensil(created.id);
      },
      error: () => {
        this.toastService.error(this.i18n.t('ui.error'), this.i18n.t('pantry.no_se_pudo_anadir'));
        this.isSavingUtensil.set(false);
      }
    });
  }

  getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      dairy: '🧀', meat: '🥩', fish: '🐟', vegetables: '🥬',
      fruits: '🍎', grains: '🌾', spices: '🧂', condiments: '🫙',
      frozen: '❄️', canned: '🥫', beverages: '🥤', other: '📦'
    };
    return icons[category] || '📦';
  }
  getLocationIcon(location: string): string {
    const icons: Record<string, string> = {
      fridge: '🧊', freezer: '❄️', pantry: '📦', counter: '🍳'
    };
    return icons[location] || '📦';
  }
  /**
   * Dias de calendario, no milisegundos: con `Math.ceil` sobre el instante, a las 23:00 del dia
   * de la caducidad el yogur ya estaba «caducado» una noche antes de estarlo.
   */
  getExpirationStatus(ingredient: Ingredient): { variant: 'error' | 'warning' | 'success'; label: string } | null {
    const days = daysUntil(ingredient.expirationDate);
    if (days === null) return null;
    if (days < 0) return { variant: 'error', label: 'Caducado' };
    if (days === 0) return { variant: 'warning', label: 'Hoy' };
    if (days <= 3) return { variant: 'warning', label: `${days}d` };
    return null;
  }
  trackById(_i: number, item: Ingredient | Utensil): string { return item.id; }

  /**
   * Sin trackBy, al marcar un utensilio Angular destruia y volvia a crear
   * los 10 grupos (las filas del computed son objetos nuevos en cada
   * recalculo): el checkbox perdia el foco y la pagina saltaba arriba.
   */
  trackByCategory(_i: number, group: { value: string }): string { return group.value; }

  private resetForm(): void {
    this.formData = {
      name: '', quantity: 0, unit: 'g' as MeasurementUnit,
      category: 'other', location: 'pantry',
      expirationDate: '', notes: ''
    };
    this.formErrors.name.set('');
    this.formErrors.quantity.set('');
  }
}
