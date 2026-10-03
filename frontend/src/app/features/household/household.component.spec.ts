import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { HouseholdComponent } from './household.component';
import { HouseholdService } from '../../core/services/household.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { I18nService } from '../../core/services/i18n.service';
import { ToastService } from '../../core/services/toast.service';
import type { Household } from '../../shared/models/household.model';
import { householdEn, householdEs } from '../../core/i18n/dict/household';

const HOUSEHOLD: Household = {
  id: 'synthetic-home',
  name: 'Casa sintética',
  inviteCode: 'SYNTHETIC1',
  members: [
    {
      id: 'synthetic-membership',
      userId: 'synthetic-user',
      name: 'Ada Synthetic',
      email: 'ada@example.test',
      role: 'admin',
      cookingLevel: 'intermediate',
      joinedAt: new Date('2026-01-02T03:04:05.000Z')
    }
  ],
  sharedPantry: true,
  shareRecipes: true,
  shareCalendar: true,
  myRole: 'admin',
  myPermissions: { members: { invite: true } } as Household['myPermissions'],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T03:04:05.000Z')
};

describe('HouseholdComponent', () => {
  let fixture: ComponentFixture<HouseholdComponent>;
  let component: HouseholdComponent;
  let service: ReturnType<typeof createHouseholdService>;
  let toast: jasmine.SpyObj<ToastService>;
  let confirm: jasmine.SpyObj<ConfirmService>;

  function createHouseholdService() {
    const householdState = signal<Household | null>(null);
    return {
      household: householdState,
      isLoading: signal(false),
      loadHousehold: jasmine.createSpy('loadHousehold'),
      isAdmin: jasmine
        .createSpy('isAdmin')
        .and.callFake(() => householdState()?.myRole === 'admin'),
      getInviteLink: jasmine
        .createSpy('getInviteLink')
        .and.callFake((code: string) => `https://app.example.test/invite/${code}`),
      createHousehold: jasmine.createSpy('createHousehold').and.returnValue(of(null)),
      joinHousehold: jasmine.createSpy('joinHousehold').and.returnValue(of(null)),
      updateSettings: jasmine.createSpy('updateSettings').and.returnValue(of(null)),
      regenerateInviteCode: jasmine.createSpy('regenerateInviteCode').and.returnValue(of(null)),
      leaveHousehold: jasmine.createSpy('leaveHousehold').and.returnValue(of(false))
    };
  }

  const i18n = {
    changeTick: signal(0),
    t: (key: string) => key,
    plural: (_count: number, singular: string, plural: string) => (_count === 1 ? singular : plural)
  };

  beforeEach(async () => {
    service = createHouseholdService();
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error']);
    confirm = jasmine.createSpyObj<ConfirmService>('ConfirmService', ['confirm']);
    confirm.confirm.and.resolveTo(true);

    await TestBed.configureTestingModule({
      imports: [HouseholdComponent],
      providers: [
        { provide: HouseholdService, useValue: service },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
        { provide: I18nService, useValue: i18n },
        provideRouter([])
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(HouseholdComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('only confirms copying the invite link after the clipboard write resolves', async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    let confirmWrite!: () => void;
    const writeText = jasmine.createSpy('writeText').and.returnValue(
      new Promise<void>((resolve) => {
        confirmWrite = resolve;
      })
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    try {
      service.household.set(HOUSEHOLD);
      fixture.detectChanges();
      component.copyLink();

      expect(writeText).toHaveBeenCalledWith('https://app.example.test/invite/SYNTHETIC1');
      expect(toast.success).not.toHaveBeenCalled();

      confirmWrite();
      await Promise.resolve();
      await Promise.resolve();

      expect(toast.success).toHaveBeenCalledWith(
        'household.copiado',
        'household.enlace_de_invitacion_copiado'
      );
      expect(toast.error).not.toHaveBeenCalled();
    } finally {
      confirmWrite();
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
      else Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    }
  });

  it('shows the translated copy error when the browser denies access to the clipboard', async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jasmine.createSpy('writeText').and.returnValue(Promise.reject()) }
    });

    try {
      service.household.set(HOUSEHOLD);
      fixture.detectChanges();
      component.copyLink();
      await Promise.resolve();
      await Promise.resolve();

      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith('ui.error', 'household.no_se_pudo_copiar');
      expect(householdEs['household.no_se_pudo_copiar']).toContain('manualmente');
      expect(householdEn['household.no_se_pudo_copiar']).toContain('manually');
    } finally {
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
      else Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    }
  });

  it('keeps create open and retryable when the service emits its failure sentinel', () => {
    service.createHousehold.and.returnValues(of(null), of(HOUSEHOLD));
    component.openCreateModal();
    component.createForm.name = 'Casa pendiente';

    component.createHousehold();

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('ui.error', 'household.no_se_pudo_crear');
    expect(component.isCreateModalOpen()).toBeTrue();
    expect(component.createForm.name).toBe('Casa pendiente');
    expect(component.isSaving()).toBeFalse();

    component.createHousehold();
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(component.isCreateModalOpen()).toBeFalse();
  });

  it('keeps join open and retryable when the service emits its failure sentinel', () => {
    service.joinHousehold.and.returnValues(of(null), of({ success: true }));
    component.openJoinModal();
    component.joinForm.inviteCode = 'SYNTHETIC1';

    component.joinHousehold();

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('ui.error', 'household.codigo_invalido_o_ya');
    expect(component.isJoinModalOpen()).toBeTrue();
    expect(component.joinForm.inviteCode).toBe('SYNTHETIC1');
    expect(component.isSaving()).toBeFalse();

    component.joinHousehold();
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(component.isJoinModalOpen()).toBeFalse();
  });

  it('rejects duplicate create and join submissions while their request is pending', () => {
    const pendingCreate = new Subject<Household | null>();
    service.createHousehold.and.returnValue(pendingCreate);
    component.createForm.name = 'Casa pendiente';
    component.createHousehold();
    component.createHousehold();
    expect(service.createHousehold).toHaveBeenCalledTimes(1);
    pendingCreate.next(null);
    pendingCreate.complete();
    expect(component.isSaving()).toBeFalse();

    const pendingJoin = new Subject<unknown>();
    service.joinHousehold.and.returnValue(pendingJoin);
    component.joinForm.inviteCode = 'SYNTHETIC1';
    component.joinHousehold();
    component.joinHousehold();
    expect(service.joinHousehold).toHaveBeenCalledTimes(1);
    pendingJoin.next(null);
    pendingJoin.complete();
    expect(component.isSaving()).toBeFalse();
  });

  it('reports settings sentinels as failures without replacing confirmed household state', () => {
    const updated = { ...HOUSEHOLD, shareRecipes: false };
    service.household.set(HOUSEHOLD);
    service.updateSettings.and.returnValues(of(null), of(updated));
    fixture.detectChanges();
    const checkbox = fixture.nativeElement.querySelectorAll(
      '.settings-section input[type="checkbox"]'
    )[1] as HTMLInputElement;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(checkbox.checked).toBeTrue();
    expect(service.household()).toBe(HOUSEHOLD);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('ui.error', 'household.no_se_pudo_actualizar');

    component.toggleSetting('shareRecipes', false);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('reports invite regeneration failure and only confirms a returned code', () => {
    service.regenerateInviteCode.and.returnValues(of(null), of('SYNTHETIC2'));

    component.regenerateCode();

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('ui.error', 'household.no_se_pudo_regenerar');

    component.regenerateCode();
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('does not leave after cancellation and treats a false leave sentinel as an error', async () => {
    confirm.confirm.and.resolveTo(false);
    await component.leaveHousehold();
    expect(service.leaveHousehold).not.toHaveBeenCalled();

    confirm.confirm.and.resolveTo(true);
    service.leaveHousehold.and.returnValues(of(false), of(true));
    await component.leaveHousehold();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('ui.error', 'household.no_se_pudo_salir');

    await component.leaveHousehold();
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('passes accessible titles to all three household dialogs', () => {
    component.openCreateModal();
    fixture.detectChanges();
    expect(dialogName()).toBe('household.crear_hogar');

    component.closeCreateModal();
    component.openJoinModal();
    fixture.detectChanges();
    expect(dialogName()).toBe('household.unirse_a_un_hogar');

    component.closeJoinModal();
    component.openInviteModal();
    fixture.detectChanges();
    expect(dialogName()).toBe('household.invitar_miembro');
  });

  it('provides translated error messages in Spanish and English', () => {
    const es = householdEs as Record<string, string>;
    const en = householdEn as Record<string, string>;
    expect(es['household.no_se_pudo_regenerar']).toContain('regenerar');
    expect(en['household.no_se_pudo_regenerar']).toContain('regenerate');
    expect(es['household.no_se_pudo_salir']).toContain('salir');
    expect(en['household.no_se_pudo_salir']).toContain('leave');
  });

  it('renders the confirmed household and resolves role/permission labels', () => {
    service.household.set(HOUSEHOLD);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.household-info__name')?.textContent).toContain(
      HOUSEHOLD.name
    );
    expect(component.miembrosLabel(1)).toBe('household.n_miembros_uno');
    expect(component.miembrosLabel(2)).toBe('household.n_miembros_varios');
    expect(component.isAdmin()).toBeTrue();
    expect(component.canInvite()).toBeTrue();
    expect(component.getRoleVariant('admin')).toBe('primary');
    expect(component.getRoleVariant('member')).toBe('secondary');
    expect(component.getRoleVariant('child')).toBe('neutral');
    expect(component.getRoleLabel('admin')).toBe('household.rol_admin');
    expect(component.getRoleLabel('member')).toBe('household.rol_miembro');
    expect(component.getRoleLabel('child')).toBe('household.rol_nino');
    expect(component.getRoleLabel('unknown')).toBe('unknown');
    expect(component.getLevelLabel('intermediate')).toBe('auth.intermediate');
  });

  function dialogName(): string | null {
    return (
      fixture.nativeElement.querySelector('[role="dialog"]')?.getAttribute('aria-label') ?? null
    );
  }
});
