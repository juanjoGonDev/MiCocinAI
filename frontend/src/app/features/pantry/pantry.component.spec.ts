import { runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { ConfirmService } from '../../core/services/confirm.service';
import { I18nService } from '../../core/services/i18n.service';
import { PantryService } from '../../core/services/pantry.service';
import { ToastService } from '../../core/services/toast.service';
import { of } from 'rxjs';
import type { Ingredient } from '../../shared/models/pantry.model';
import { PantryComponent } from './pantry.component';

describe('PantryComponent add action', () => {
  let router: jasmine.SpyObj<Router>;
  let pantryService: jasmine.SpyObj<PantryService>;

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.resolveTo(true);
    pantryService = jasmine.createSpyObj<PantryService>(
      'PantryService',
      ['updateIngredient', 'cargarInventarioCompleto', 'loadStats'],
      {
        ingredients: signal([]),
        utensils: signal([]),
        categories: signal([]),
        stats: signal(null),
        isLoading: signal(false),
        total: signal(0)
      }
    );
    pantryService.updateIngredient.and.returnValue(of(null));
    pantryService.cargarInventarioCompleto.and.resolveTo();

    TestBed.configureTestingModule({
      providers: [
        { provide: I18nService, useValue: { t: (key: string) => key, changeTick: signal(0) } },
        { provide: PantryService, useValue: pantryService },
        { provide: ToastService, useValue: {} },
        { provide: ConfirmService, useValue: {} },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } }
        }
      ]
    });
  });

  function createComponent(): PantryComponent {
    return TestBed.runInInjectionContext(() => new PantryComponent());
  }

  it('opens a clean ingredient form from the ingredients tab', () => {
    const component = createComponent();
    component.formData.name = 'stale value';
    component.isUtensilModalOpen.set(false);

    expect(component.addButtonLabel()).toBe('pantry.mas_agregar');
    component.openAddModal();

    expect(component.isIngredientModalOpen()).toBeTrue();
    expect(component.isUtensilModalOpen()).toBeFalse();
    expect(component.formData.name).toBe('');
  });

  it('opens the utensil form instead of the ingredient form from the utensils tab', () => {
    const component = createComponent();
    component.activeTab.set('utensils');

    expect(component.addButtonLabel()).toBe('pantry.mas_agregar_utensilio');
    component.openAddModal();

    expect(component.isUtensilModalOpen()).toBeTrue();
    expect(component.isIngredientModalOpen()).toBeFalse();
  });

  it('applies a suggested ingredient name when opening the prefilled form', () => {
    const component = createComponent();

    component.openAddModal({ name: 'harina' });

    expect(component.isIngredientModalOpen()).toBeTrue();
    expect(component.formData.name).toBe('harina');
  });

  it('keeps unused emoji metadata out of pantry category controls', () => {
    const component = createComponent();
    const categories = [
      ...component.ingredientCategoriesNoAll,
      ...component.utensilCategoryOptions
    ];

    expect(categories.every((category) => !Object.hasOwn(category, 'icon'))).toBeTrue();
  });

  it('does not decrement below zero and applies one-unit stock changes', () => {
    const component = createComponent();
    const ingredient = { id: 'ingredient-1', quantity: 0 } as Ingredient;

    component.quitarUnidad(ingredient);
    expect(pantryService.updateIngredient).not.toHaveBeenCalled();

    component.anadirUnidad(ingredient);
    expect(pantryService.updateIngredient).toHaveBeenCalledOnceWith('ingredient-1', {
      quantity: 1
    });

    component.anadirUnidad({ id: 'ingredient-2' } as Ingredient);
    expect(pantryService.updateIngredient).toHaveBeenCalledWith('ingredient-2', { quantity: 1 });
  });

  it('restores keyboard focus to the same stepper action after inventory reload', async () => {
    const component = createComponent();
    const beforeReload = document.createElement('button');
    beforeReload.dataset['test'] = 'pantry-stock-mas-ingredient-1';
    const afterReload = document.createElement('button');
    afterReload.dataset['test'] = 'pantry-stock-mas-ingredient-1';
    document.body.append(beforeReload);
    beforeReload.focus();
    pantryService.cargarInventarioCompleto.and.callFake(async () => {
      document.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      beforeReload.remove();
      document.body.append(afterReload);
    });

    try {
      component.anadirUnidad(
        { id: 'ingredient-1', quantity: 1 } as Ingredient,
        {
          currentTarget: beforeReload
        } as unknown as Event
      );
      await new Promise<void>((resolve) => window.setTimeout(resolve, 100));

      expect(document.activeElement).toBe(afterReload);
    } finally {
      beforeReload.remove();
      afterReload.remove();
    }
  });

  it('moves keyboard focus to the add action when reducing to zero removes the row', async () => {
    const component = createComponent();
    const beforeReload = document.createElement('button');
    beforeReload.dataset['test'] = 'pantry-stock-menos-ingredient-1';
    const addAction = document.createElement('app-button');
    addAction.dataset['test'] = 'pantry-agregar';
    const addButton = document.createElement('button');
    addAction.append(addButton);
    document.body.append(beforeReload, addAction);
    beforeReload.focus();
    pantryService.cargarInventarioCompleto.and.callFake(async () => {
      beforeReload.remove();
    });

    try {
      component.quitarUnidad(
        { id: 'ingredient-1', quantity: 1 } as Ingredient,
        { currentTarget: beforeReload } as unknown as Event
      );
      await new Promise<void>((resolve) => window.setTimeout(resolve, 100));

      expect(document.activeElement).toBe(addButton);
    } finally {
      beforeReload.remove();
      addAction.remove();
    }
  });

  it('moves keyboard focus to another visible stepper when the current row disappears', async () => {
    const component = createComponent();
    const beforeReload = document.createElement('button');
    beforeReload.dataset['test'] = 'pantry-stock-menos-ingredient-1';
    const offscreenStepper = document.createElement('button');
    offscreenStepper.dataset['test'] = 'pantry-stock-menos-ingredient-2';
    Object.defineProperty(offscreenStepper, 'getBoundingClientRect', {
      value: () => new DOMRect(10, 900, 44, 44)
    });
    const nextRowStepper = document.createElement('button');
    nextRowStepper.dataset['test'] = 'pantry-stock-menos-ingredient-3';
    Object.defineProperty(nextRowStepper, 'getBoundingClientRect', {
      value: () => new DOMRect(10, 10, 44, 44)
    });
    document.body.append(beforeReload);
    beforeReload.focus();
    pantryService.cargarInventarioCompleto.and.callFake(async () => {
      beforeReload.remove();
      document.body.append(offscreenStepper, nextRowStepper);
    });

    try {
      component.quitarUnidad(
        { id: 'ingredient-1', quantity: 1 } as Ingredient,
        { currentTarget: beforeReload } as unknown as Event
      );
      await new Promise<void>((resolve) => window.setTimeout(resolve, 100));

      expect(document.activeElement).toBe(nextRowStepper);
    } finally {
      beforeReload.remove();
      offscreenStepper.remove();
      nextRowStepper.remove();
    }
  });

  it('does not reclaim focus if the user moved it while the request was pending', async () => {
    const component = createComponent();
    const stepper = document.createElement('button');
    stepper.dataset['test'] = 'pantry-stock-mas-ingredient-1';
    const otherAction = document.createElement('button');
    document.body.append(stepper, otherAction);
    stepper.focus();

    let finishReload!: () => void;
    pantryService.cargarInventarioCompleto.and.callFake(
      () => new Promise<void>((resolve) => (finishReload = resolve))
    );

    try {
      component.anadirUnidad(
        { id: 'ingredient-1', quantity: 1 } as Ingredient,
        { currentTarget: stepper } as unknown as Event
      );
      otherAction.focus();
      finishReload();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 100));

      expect(document.activeElement).toBe(otherAction);
    } finally {
      stepper.remove();
      otherAction.remove();
    }
  });

  it('preserves another focused row action when the inventory refresh replaces the row', async () => {
    const component = createComponent();
    const stepper = document.createElement('button');
    stepper.dataset['test'] = 'pantry-stock-mas-ingredient-1';
    const editBeforeReload = document.createElement('button');
    editBeforeReload.dataset['test'] = 'pantry-editar-ingredient-1';
    const editAfterReload = document.createElement('button');
    editAfterReload.dataset['test'] = 'pantry-editar-ingredient-1';
    document.body.append(stepper, editBeforeReload);
    stepper.focus();

    let finishReload!: () => void;
    pantryService.cargarInventarioCompleto.and.callFake(
      () =>
        new Promise<void>((resolve) => {
          finishReload = () => {
            stepper.remove();
            editBeforeReload.remove();
            document.body.append(editAfterReload);
            resolve();
          };
        })
    );

    try {
      component.anadirUnidad(
        { id: 'ingredient-1', quantity: 1 } as Ingredient,
        { currentTarget: stepper } as unknown as Event
      );
      editBeforeReload.focus();
      finishReload();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 100));

      expect(document.activeElement).toBe(editAfterReload);
    } finally {
      stepper.remove();
      editBeforeReload.remove();
      editAfterReload.remove();
    }
  });

  it('does not restore stale focus after the pantry component is destroyed', async () => {
    const fixture = TestBed.createComponent(PantryComponent);
    const component = fixture.componentInstance;
    const removeListener = spyOn(document, 'removeEventListener').and.callThrough();
    const beforeReload = document.createElement('button');
    beforeReload.dataset['test'] = 'pantry-stock-mas-ingredient-1';
    const afterNavigation = document.createElement('button');
    afterNavigation.dataset['test'] = 'pantry-stock-mas-ingredient-1';
    document.body.append(beforeReload);
    beforeReload.focus();

    let finishReload!: () => void;
    pantryService.cargarInventarioCompleto.and.callFake(
      () => new Promise<void>((resolve) => (finishReload = resolve))
    );

    component.anadirUnidad(
      { id: 'ingredient-1', quantity: 1 } as Ingredient,
      { currentTarget: beforeReload } as unknown as Event
    );
    fixture.destroy();
    expect(removeListener).toHaveBeenCalledWith('focusin', jasmine.any(Function));
    beforeReload.remove();
    document.body.append(afterNavigation);
    finishReload();

    try {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
      expect(document.activeElement).not.toBe(afterNavigation);
    } finally {
      beforeReload.remove();
      afterNavigation.remove();
    }
  });
});
