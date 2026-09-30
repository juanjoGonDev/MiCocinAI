import { runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { ConfirmService } from '../../core/services/confirm.service';
import { I18nService } from '../../core/services/i18n.service';
import { PantryService } from '../../core/services/pantry.service';
import { ToastService } from '../../core/services/toast.service';
import { PantryComponent } from './pantry.component';

describe('PantryComponent add action', () => {
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.resolveTo(true);

    TestBed.configureTestingModule({
      providers: [
        { provide: I18nService, useValue: { t: (key: string) => key, changeTick: signal(0) } },
        {
          provide: PantryService,
          useValue: {
            ingredients: signal([]),
            utensils: signal([]),
            categories: signal([]),
            stats: signal(null),
            isLoading: signal(false),
            total: signal(0)
          }
        },
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
});
