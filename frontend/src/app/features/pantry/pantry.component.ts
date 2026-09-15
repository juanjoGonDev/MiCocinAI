import { Component, inject, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PantryService } from '../../core/services/pantry.service';
import { ToastService } from '../../core/services/toast.service';
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

type PantryTab = 'ingredients' | 'utensils';

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
    CommonModule, FormsModule,
    ButtonComponent, InputComponent, CardComponent,
    BadgeComponent, TagComponent, ModalComponent, LoadingComponent
  ],
  template: `
    <div class="pantry">
      <!-- Header -->
      <div class="pantry__header">
        <div class="pantry__title-section">
          <h1 class="pantry__title">📦 Despensa</h1>
        </div>
        <app-button variant="primary" (onClick)="openAddModal()">
          + Agregar
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
          🥬 Ingredientes <span class="tab__count">{{ inPantryCount() }}</span>
        </button>
        <button
          type="button"
          class="tab"
          [class.tab--active]="activeTab() === 'utensils'"
          (click)="switchTab('utensils')"
        >
          🍳 Utensilios <span class="tab__count">{{ ownedUtensilsCount() }}</span>
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
              <span class="stat-card__label">En despensa</span>
            </div>
          </div>
          <div class="stat-card stat-card--warning">
            <span class="stat-card__icon">⚠️</span>
            <div class="stat-card__content">
              <span class="stat-card__value">{{ stats.expiringSoon }}</span>
              <span class="stat-card__label">Por caducar</span>
            </div>
          </div>
          <div class="stat-card stat-card--danger">
            <span class="stat-card__icon">❌</span>
            <div class="stat-card__content">
              <span class="stat-card__value">{{ stats.expired }}</span>
              <span class="stat-card__label">Caducados</span>
            </div>
          </div>
        </div>

        <!-- Search & Filters -->
        <div class="pantry__filters">
          <app-input
            id="search"
            name="search"
            type="search"
            placeholder="Buscar ingredientes..."
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

        <app-loading *ngIf="pantryService.isLoading()" message="Cargando ingredientes..."></app-loading>

        <div *ngIf="!pantryService.isLoading()">
          <!-- Suggestions chips (qty=0 items) -->
          <div class="suggestions" *ngIf="suggestions().length > 0">
            <div class="suggestions__header">
              <span class="suggestions__title">💡 Sugerencias comunes</span>
              <span class="suggestions__hint">Toca para añadirlas a tu despensa</span>
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
              <h3 class="empty-state__title">Tu despensa está vacía</h3>
              <p class="empty-state__text">Agrega ingredientes para empezar a generar recetas</p>
              <app-button variant="primary" (onClick)="openAddModal()">Agregar primer ingrediente</app-button>
            </div>
          </div>
        </div>
      </ng-container>

      <!-- ═══════════════ UTENSILS TAB ═══════════════ -->
      <ng-container *ngIf="activeTab() === 'utensils'">
        <div class="utensils-intro">
          <p>Marca los utensilios y electrodomésticos que tienes en casa. La IA los tendrá en cuenta al sugerirte recetas.</p>
        </div>

        <app-loading *ngIf="utensilsLoading()" message="Cargando utensilios..."></app-loading>

        <div *ngIf="!utensilsLoading()" class="utensils">
          <div *ngFor="let group of utensilGroups()" class="utensil-group">
            <h3 class="utensil-group__title">{{ group.icon }} {{ group.label }}</h3>
            <div class="utensil-grid">
              <label
                *ngFor="let u of group.items"
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
                  title="Eliminar"
                  (click)="deleteUtensil(u); $event.preventDefault()"
                  *ngIf="isCustomUtensil(u)"
                >🗑️</button>
              </label>
            </div>
          </div>

          <div class="utensils-add">
            <h3 class="utensils-add__title">➕ Añadir utensilio personalizado</h3>
            <form (ngSubmit)="addCustomUtensil()" class="utensils-add__form">
              <input
                type="text"
                [(ngModel)]="newUtensil.name"
                name="utensilName"
                placeholder="Ej: Sous vide, Panificadora..."
                class="form-input"
                required
              />
              <select [(ngModel)]="newUtensil.category" name="utensilCat" class="form-select">
                <option *ngFor="let cat of utensilCategoryOptions" [value]="cat.value">
                  {{ cat.icon }} {{ cat.label }}
                </option>
              </select>
              <app-button variant="primary" type="submit" size="sm">Añadir</app-button>
            </form>
          </div>
        </div>
      </ng-container>

      <!-- Add/Edit Ingredient Modal -->
      <app-modal
        [isOpen]="isIngredientModalOpen()"
        [title]="editingIngredient() ? 'Editar Ingrediente' : 'Agregar Ingrediente'"
        size="md"
        (onClose)="closeIngredientModal()"
      >
        <form (ngSubmit)="saveIngredient()" class="ingredient-form">
          <app-input
            id="ingredientName"
            name="ingredientName"
            label="Nombre"
            placeholder="Ej: Tomate"
            [(ngModel)]="formData.name"
            [required]="true"
            [error]="formErrors.name()"
          ></app-input>

          <div class="form-row">
            <app-input
              id="quantity"
              name="quantity"
              type="number"
              label="Cantidad"
              placeholder="0"
              [(ngModel)]="formData.quantity"
              [required]="true"
            ></app-input>

            <div class="form-field">
              <label class="form-label">Unidad</label>
              <select [(ngModel)]="formData.unit" name="unit" class="form-select">
                <option value="g">Gramos (g)</option>
                <option value="kg">Kilogramos (kg)</option>
                <option value="ml">Mililitros (ml)</option>
                <option value="l">Litros (l)</option>
                <option value="unit">Unidades</option>
                <option value="cup">Tazas</option>
                <option value="tbsp">Cucharadas</option>
                <option value="tsp">Cucharaditas</option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-field">
              <label class="form-label">Categoría</label>
              <select [(ngModel)]="formData.category" name="category" class="form-select">
                <option *ngFor="let cat of ingredientCategoriesNoAll" [value]="cat.value">
                  {{ cat.icon }} {{ cat.label }}
                </option>
              </select>
            </div>

            <div class="form-field">
              <label class="form-label">Ubicación</label>
              <select [(ngModel)]="formData.location" name="location" class="form-select">
                <option value="fridge">🧊 Nevera</option>
                <option value="freezer">❄️ Congelador</option>
                <option value="pantry">📦 Despensa</option>
                <option value="counter">🍳 Encimera</option>
              </select>
            </div>
          </div>

          <app-input
            id="expiration"
            name="expiration"
            type="date"
            label="Fecha de caducidad (opcional)"
            [(ngModel)]="formData.expirationDate"
          ></app-input>

          <app-input
            id="notes"
            name="notes"
            label="Notas (opcional)"
            placeholder="Ej: Comprado ayer"
            [(ngModel)]="formData.notes"
          ></app-input>

          <div class="form-actions">
            <app-button variant="ghost" type="button" (onClick)="closeIngredientModal()">Cancelar</app-button>
            <app-button variant="primary" type="submit" [loading]="isSaving()">
              {{ editingIngredient() ? 'Guardar' : 'Agregar' }}
            </app-button>
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
      margin: 0 0 var(--space-3);
    }
    .utensils-add__form {
      display: grid;
      grid-template-columns: 1fr 160px auto;
      gap: var(--space-2);
      @media (max-width: 640px) { grid-template-columns: 1fr; }
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
  pantryService = inject(PantryService);
  private toastService = inject(ToastService);

  // Tabs
  activeTab = signal<PantryTab>('ingredients');

  // Ingredients
  searchTerm = '';
  selectedIngCategory = signal<IngredientCategory | ''>('');
  isIngredientModalOpen = signal(false);
  editingIngredient = signal<Ingredient | null>(null);
  isSaving = signal(false);
  utensilsLoading = signal(true);
  formErrors = { name: signal(''), quantity: signal('') };

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

  newUtensil = { name: '', category: 'tools' as UtensilCategory };

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

  utensilCategoryOptions = [
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
    this.utensilsLoading.set(true);
    this.pantryService.loadUtensils();
    // Mark utensils loaded once first response arrives
    setTimeout(() => this.utensilsLoading.set(false), 600);
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

  openAddModal(prefill?: Partial<typeof this.formData>): void {
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
      expirationDate: ingredient.expirationDate ? new Date(ingredient.expirationDate).toISOString().split('T')[0] : '',
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
    if (!this.formData.name) { this.formErrors.name.set('El nombre es requerido'); return; }
    if (!this.formData.quantity || this.formData.quantity <= 0) {
      this.formErrors.quantity.set('La cantidad debe ser mayor a 0'); return;
    }
    this.isSaving.set(true);
    const data = { ...this.formData, expirationDate: this.formData.expirationDate || undefined };
    const obs = this.editingIngredient()
      ? this.pantryService.updateIngredient(this.editingIngredient()!.id, data)
      : this.pantryService.createIngredient(data);
    obs.subscribe({
      next: () => {
        this.toastService.success(
          this.editingIngredient() ? 'Actualizado' : 'Agregado',
          `${this.formData.name} ${this.editingIngredient() ? 'actualizado' : 'agregado'} correctamente`
        );
        this.closeIngredientModal();
        this.isSaving.set(false);
        this.reloadIngredients();
      },
      error: () => {
        this.toastService.error('Error', 'No se pudo guardar el ingrediente');
        this.isSaving.set(false);
      }
    });
  }

  deleteIngredient(ingredient: Ingredient): void {
    if (confirm(`¿Eliminar ${ingredient.name}?`)) {
      this.pantryService.deleteIngredient(ingredient.id).subscribe({
        next: () => {
          this.toastService.success('Eliminado', `${ingredient.name} eliminado`);
          this.reloadIngredients();
        },
        error: () => this.toastService.error('Error', 'No se pudo eliminar')
      });
    }
  }

  // Utensils
  toggleUtensil(u: Utensil): void {
    this.pantryService.updateUtensil(u.id, { available: !u.available }).subscribe({
      next: () => this.toastService.success(
        u.available ? 'Quitado' : 'Añadido',
        u.available ? `${u.name} quitado de tu cocina` : `${u.name} añadido a tu cocina`
      ),
      error: () => this.toastService.error('Error', 'No se pudo actualizar')
    });
  }

  deleteUtensil(u: Utensil): void {
    if (confirm(`¿Eliminar ${u.name}?`)) {
      this.pantryService.deleteUtensil(u.id).subscribe({
        next: () => this.toastService.success('Eliminado', `${u.name} eliminado`),
        error: () => this.toastService.error('Error', 'No se pudo eliminar')
      });
    }
  }

  addCustomUtensil(): void {
    if (!this.newUtensil.name.trim()) return;
    this.pantryService.createUtensil({
      name: this.newUtensil.name.trim(),
      category: this.newUtensil.category,
      available: true
    }).subscribe({
      next: () => {
        this.toastService.success('Añadido', `${this.newUtensil.name} añadido`);
        this.newUtensil.name = '';
      },
      error: () => this.toastService.error('Error', 'No se pudo añadir el utensilio')
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
  getExpirationStatus(ingredient: Ingredient): { variant: 'error' | 'warning' | 'success'; label: string } | null {
    if (!ingredient.expirationDate) return null;
    const now = new Date();
    const exp = new Date(ingredient.expirationDate);
    const days = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (days < 0) return { variant: 'error', label: 'Caducado' };
    if (days <= 3) return { variant: 'warning', label: `${days}d` };
    return null;
  }
  trackById(_i: number, item: Ingredient | Utensil): string { return item.id; }

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
