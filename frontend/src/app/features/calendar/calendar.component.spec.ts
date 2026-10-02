import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { CalendarService } from '../../core/services/calendar.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { HouseholdService } from '../../core/services/household.service';
import { I18nService } from '../../core/services/i18n.service';
import { ModulesService } from '../../core/services/modules.service';
import { PantryService } from '../../core/services/pantry.service';
import { RecipeService } from '../../core/services/recipe.service';
import { TasteProfileService } from '../../core/services/taste-profile.service';
import { ToastService } from '../../core/services/toast.service';
import { CalendarComponent } from './calendar.component';

describe('CalendarComponent meal deletion feedback', () => {
  let fixture: ComponentFixture<CalendarComponent>;
  let component: CalendarComponent;
  let calendar: jasmine.SpyObj<CalendarService>;
  let confirm: jasmine.SpyObj<ConfirmService>;
  let toast: jasmine.SpyObj<ToastService>;

  beforeEach(async () => {
    calendar = jasmine.createSpyObj<CalendarService>('CalendarService', [
      'loadRange',
      'loadHouseholdEvents',
      'deleteMeal'
    ]);
    Object.defineProperty(calendar, 'meals', { value: () => [] });
    calendar.deleteMeal.and.returnValue(of(false));
    confirm = jasmine.createSpyObj<ConfirmService>('ConfirmService', ['confirm']);
    confirm.confirm.and.returnValue(Promise.resolve(true));
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error']);

    await TestBed.configureTestingModule({
      imports: [CalendarComponent],
      providers: [
        { provide: CalendarService, useValue: calendar },
        { provide: ConfirmService, useValue: confirm },
        { provide: ToastService, useValue: toast },
        { provide: I18nService, useValue: { t: (key: string) => key } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } }
        },
        {
          provide: Router,
          useValue: {
            navigate: jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true))
          }
        },
        { provide: RecipeService, useValue: {} },
        { provide: TasteProfileService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: HouseholdService, useValue: {} },
        { provide: PantryService, useValue: {} },
        { provide: ModulesService, useValue: {} }
      ]
    })
      .overrideComponent(CalendarComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(CalendarComponent);
    component = fixture.componentInstance;
  });

  it('announces a confirmed deletion and closes the meal editor', async () => {
    calendar.deleteMeal.and.returnValue(of(true));
    component.isMealModalOpen.set(true);

    await component.removeMealById('meal-1', 'Synthetic meal');

    expect(toast.success).toHaveBeenCalledOnceWith('calendar.quitada', 'calendar.ya_no_esta_en_el');
    expect(toast.error).not.toHaveBeenCalled();
    expect(component.isMealModalOpen()).toBeFalse();
    expect(component.mealDeletionFailed()).toBeFalse();
  });

  it('announces a failed deletion without claiming success or closing the editor', async () => {
    calendar.deleteMeal.and.returnValue(of(false));
    component.isMealModalOpen.set(true);

    await component.removeMealById('meal-1', 'Synthetic meal');

    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(component.isMealModalOpen()).toBeTrue();
    expect(component.mealDeletionFailed()).toBeTrue();

    component.closeMealModal();
    expect(component.mealDeletionFailed()).toBeFalse();
  });

  it('does not issue a delete when confirmation is declined', async () => {
    confirm.confirm.and.returnValue(Promise.resolve(false));
    component.isMealModalOpen.set(true);

    await component.removeMealById('meal-1', 'Synthetic meal');

    expect(calendar.deleteMeal).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(component.isMealModalOpen()).toBeTrue();
    expect(component.mealDeletionFailed()).toBeFalse();
  });
});
