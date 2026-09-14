import { Component, inject, OnInit, signal } from '@angular/core';
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
  INGREDIENT_CATEGORY_LABELS,
  STORAGE_LOCATION_LABELS
} from '../../shared/models/pantry.model';

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
          <span class="pantry__count">{{ pantryService.total() }} ingredientes</span>
        </div>
        <app-button variant="primary" (onClick)="openAddModal()">
          + Agregar
        </app-button>
      </div>

      <!-- Stats Cards -->
      <div class="pantry__stats" *ngIf="pantryService.stats() as stats">
        <div class="stat-card stat-card--total">
          <span class="stat-card__icon">📦</span>
          <div class="stat-card__content">
            <span class="stat-card__value">{{ stats.totalItems }}</span>
            <span class="stat-card__label">Total</span>
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
          type="search"
          placeholder="Buscar ingredientes..."
          [(ngModel)]="searchTerm"
          (ngModelChange)="onSearch()"
        ></app-input>

        <div class="pantry__filter-tags">
          <app-tag
            *ngFor="let cat of categories"
            [selected]="selectedCategory() === cat.value"
            (onClick)="filterByCategory(cat.value)"
          >
            {{ cat.icon }} {{ cat.label }}
          </app-tag>
        </div>
      </div>

      <!-- Loading -->
      <app-loading *ngIf="pantryService.isLoading()" message="Cargando ingredientes..."></app-loading>

      <!-- Ingredients List -->
      <div class="pantry__list" *ngIf="!pantryService.isLoading()">
        <div
          *ngFor="let ingredient of pantryService.ingredients(); trackBy: trackById"
          class="ingredient-item"
        >
          <div class="ingredient-item__icon">
            {{ getCategoryIcon(ingredient.category) }}
          </div>
          
          <div class="ingredient-item__info">
            <span class="ingredient-item__name">{{ ingredient.name }}</span>
            <span class="ingredient-item__quantity">
              {{ ingredient.quantity }} {{ ingredient.unit }}
            </span>
          </div>

          <div class="ingredient-item__meta">
            <app-badge
              *ngIf="getExpirationStatus(ingredient) as status"
              [variant]="status.variant"
              size="sm"
            >
              {{ status.label }}
            </app-badge>
            
            <span class="ingredient-item__location">
              {{ getLocationIcon(ingredient.location) }}
            </span>
          </div>

          <div class="ingredient-item__actions">
            <button type="button" class="action-btn" (click)="editIngredient(ingredient)">✏️</button>
            <button type="button" class="action-btn action-btn--danger" (click)="deleteIngredient(ingredient)">🗑️</button>
          </div>
        </div>

        <!-- Empty State -->
        <div *ngIf="pantryService.ingredients().length === 0" class="empty-state">
          <span class="empty-state__icon">📦</span>
          <h3 class="empty-state__title">Tu despensa está vacía</h3>
          <p class="empty-state__text">Agrega ingredientes para empezar a generar recetas</p>
          <app-button variant="primary" (onClick)="openAddModal()">
            Agregar primer ingrediente
          </app-button>
        </div>
      </div>

      <!-- Add/Edit Modal -->
      <app-modal
        [isOpen]="isModalOpen()"
        [title]="editingIngredient() ? 'Editar Ingrediente' : 'Agregar Ingrediente'"
        size="md"
        (onClose)="closeModal()"
      >
        <form (ngSubmit)="saveIngredient()" class="ingredient-form">
          <app-input
            id="name"
            label="Nombre"
            placeholder="Ej: Tomate"
            [(ngModel)]="formData.name"
            [required]="true"
            [error]="formErrors.name()"
          ></app-input>

          <div class="form-row">
            <app-input
              id="quantity"
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
                <option *ngFor="let cat of categories" [value]="cat.value">
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
            type="date"
            label="Fecha de caducidad (opcional)"
            [(ngModel)]="formData.expirationDate"
          ></app-input>

          <app-input
            id="notes"
            label="Notas (opcional)"
            placeholder="Ej: Comprado ayer"
            [(ngModel)]="formData.notes"
          ></app-input>

          <div class="form-actions">
            <app-button variant="ghost" type="button" (onClick)="closeModal()">
              Cancelar
            </app-button>
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
      max-width: 800px;
      margin: 0 auto;
    }

    @media (min-width: 768px) {
      .pantry {
        padding: var(--space-6);
      }
    }

    /* Header */
    .pantry__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-6);
    }

    .pantry__title-section {
      display: flex;
      align-items: baseline;
      gap: var(--space-3);
    }

    .pantry__title {
      font-family: var(--font-display);
      font-size: var(--text-2xl);
      font-weight: var(--font-bold);
    }

    .pantry__count {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    /* Stats */
    .pantry__stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-3);
      margin-bottom: var(--space-6);
    }

    .stat-card {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3);
      background: var(--bg-secondary);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-default);
    }

    .stat-card__icon {
      font-size: var(--text-2xl);
    }

    .stat-card__content {
      display: flex;
      flex-direction: column;
    }

    .stat-card__value {
      font-size: var(--text-xl);
      font-weight: var(--font-bold);
    }

    .stat-card__label {
      font-size: var(--text-xs);
      color: var(--text-secondary);
    }

    .stat-card--warning .stat-card__value {
      color: var(--warning);
    }

    .stat-card--danger .stat-card__value {
      color: var(--error);
    }

    /* Filters */
    .pantry__filters {
      margin-bottom: var(--space-6);
    }

    .pantry__filter-tags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }

    /* List */
    .pantry__list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    /* Ingredient Item */
    .ingredient-item {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3);
      background: var(--bg-secondary);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-default);
      transition: var(--transition-fast);

      &:hover {
        border-color: var(--border-strong);
      }
    }

    .ingredient-item__icon {
      font-size: var(--text-2xl);
      width: 40px;
      text-align: center;
    }

    .ingredient-item__info {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .ingredient-item__name {
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
    }

    .ingredient-item__quantity {
      font-size: var(--text-xs);
      color: var(--text-secondary);
    }

    .ingredient-item__meta {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .ingredient-item__location {
      font-size: var(--text-lg);
    }

    .ingredient-item__actions {
      display: flex;
      gap: var(--space-1);
      opacity: 0;
      transition: var(--transition-fast);
    }

    .ingredient-item:hover .ingredient-item__actions {
      opacity: 1;
    }

    .action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: var(--radius-md);
      background: none;
      border: none;
      cursor: pointer;
      transition: var(--transition-fast);

      &:hover {
        background: var(--bg-tertiary);
      }

      &--danger:hover {
        background: var(--error-subtle);
      }
    }

    /* Form */
    .ingredient-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-4);
    }

    .form-field {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .form-label {
      font-size: var(--text-sm);
      font-weight: var(--font-medium);
      color: var(--text-primary);
    }

    .form-select {
      width: 100%;
      padding: var(--space-2) var(--space-3);
      font-family: var(--font-sans);
      font-size: var(--text-base);
      color: var(--text-primary);
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      cursor: pointer;

      &:focus {
        outline: none;
        border-color: var(--primary);
      }
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-3);
      margin-top: var(--space-4);
    }

    /* Empty State */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--space-12);
      text-align: center;
    }

    .empty-state__icon {
      font-size: 64px;
      margin-bottom: var(--space-4);
    }

    .empty-state__title {
      font-family: var(--font-display);
      font-size: var(--text-xl);
      font-weight: var(--font-semibold);
      margin-bottom: var(--space-2);
    }

    .empty-state__text {
      font-size: var(--text-sm);
      color: var(--text-secondary);
      margin-bottom: var(--space-6);
    }

    @media (max-width: 480px) {
      .form-row {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class PantryComponent implements OnInit {
  pantryService = inject(PantryService);
  private toastService = inject(ToastService);

  searchTerm = '';
  selectedCategory = signal<IngredientCategory | ''>('');
  isModalOpen = signal(false);
  editingIngredient = signal<Ingredient | null>(null);
  isSaving = signal(false);
  formErrors = {
    name: signal(''),
    quantity: signal('')
  };

  formData = {
    name: '',
    quantity: 0,
    unit: 'g' as MeasurementUnit,
    category: 'other' as IngredientCategory,
    location: 'pantry' as StorageLocation,
    expirationDate: '',
    notes: ''
  };

  categories = [
    { value: '', label: 'Todos', icon: '📋' },
    { value: 'vegetables', label: 'Verduras', icon: '🥬' },
    { value: 'fruits', label: 'Frutas', icon: '🍎' },
    { value: 'meat', label: 'Carnes', icon: '🥩' },
    { value: 'fish', label: 'Pescados', icon: '🐟' },
    { value: 'dairy', label: 'Lácteos', icon: '🧀' },
    { value: 'grains', label: 'Cereales', icon: '🌾' },
    { value: 'spices', label: 'Especias', icon: '🧂' },
    { value: 'frozen', label: 'Congelados', icon: '❄️' }
  ];

  ngOnInit(): void {
    this.pantryService.loadIngredients();
    this.pantryService.loadStats();
  }

  onSearch(): void {
    this.pantryService.loadIngredients({
      search: this.searchTerm,
      category: this.selectedCategory() || undefined
    });
  }

  filterByCategory(category: string): void {
    this.selectedCategory.set(category as IngredientCategory | '');
    this.pantryService.loadIngredients({
      search: this.searchTerm,
      category: (category as IngredientCategory) || undefined
    });
  }

  openAddModal(): void {
    this.editingIngredient.set(null);
    this.resetForm();
    this.isModalOpen.set(true);
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
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.editingIngredient.set(null);
    this.resetForm();
  }

  saveIngredient(): void {
    this.formErrors.name.set('');
    this.formErrors.quantity.set('');

    if (!this.formData.name) {
      this.formErrors.name.set('El nombre es requerido');
      return;
    }

    if (!this.formData.quantity || this.formData.quantity <= 0) {
      this.formErrors.quantity.set('La cantidad debe ser mayor a 0');
      return;
    }

    this.isSaving.set(true);

    const data = {
      ...this.formData,
      expirationDate: this.formData.expirationDate || undefined
    };

    const obs = this.editingIngredient()
      ? this.pantryService.updateIngredient(this.editingIngredient()!.id, data)
      : this.pantryService.createIngredient(data);

    obs.subscribe({
      next: () => {
        this.toastService.success(
          this.editingIngredient() ? 'Actualizado' : 'Agregado',
          `${this.formData.name} ${this.editingIngredient() ? 'actualizado' : 'agregado'} correctamente`
        );
        this.closeModal();
        this.isSaving.set(false);
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
          this.toastService.success('Eliminado', `${ingredient.name} eliminado correctamente`);
        },
        error: () => {
          this.toastService.error('Error', 'No se pudo eliminar el ingrediente');
        }
      });
    }
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
    const daysUntil = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) {
      return { variant: 'error', label: 'Caducado' };
    } else if (daysUntil <= 3) {
      return { variant: 'warning', label: `${daysUntil}d` };
    }
    return null;
  }

  trackById(_index: number, item: Ingredient): string {
    return item.id;
  }

  private resetForm(): void {
    this.formData = {
      name: '',
      quantity: 0,
      unit: 'g' as MeasurementUnit,
      category: 'other',
      location: 'pantry',
      expirationDate: '',
      notes: ''
    };
    this.formErrors.name.set('');
    this.formErrors.quantity.set('');
  }
}
