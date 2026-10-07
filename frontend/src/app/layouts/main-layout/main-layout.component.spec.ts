import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { ModulesService } from '../../core/services/modules.service';
import { TasteProfileService } from '../../core/services/taste-profile.service';
import { HouseholdService } from '../../core/services/household.service';
import { of } from 'rxjs';
import { MainLayoutComponent } from './main-layout.component';

describe('MainLayoutComponent mobile drawer keyboard behavior', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<MainLayoutComponent>>;
  let mobileViewport: jasmine.Spy;
  let navigate: jasmine.Spy;
  let authLogout: jasmine.Spy;
  let currentUser: ReturnType<typeof signal<{ avatar?: string } | null>>;
  let isPathVisible: jasmine.Spy;
  let memberships: ReturnType<typeof signal<any[]>>;
  let activeHouseholdId: ReturnType<typeof signal<string | null>>;
  let membershipsFailed: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    mobileViewport = spyOn(window, 'matchMedia').and.returnValue({
      matches: true,
      media: '(max-width: 1023px)',
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false
    } as MediaQueryList);
    navigate = jasmine.createSpy('navigate');
    authLogout = jasmine.createSpy('logout');
    currentUser = signal<{ avatar?: string } | null>(null);
    memberships = signal<any[]>([]);
    activeHouseholdId = signal<string | null>(null);
    membershipsFailed = signal(false);
    isPathVisible = jasmine
      .createSpy('isPathVisible')
      .and.callFake((path: string) => path !== '/calendar');

    await TestBed.configureTestingModule({
      imports: [MainLayoutComponent],
      providers: [
        {
          provide: AuthService,
          useValue: { userName: signal('Test'), currentUser, logout: authLogout }
        },
        { provide: Router, useValue: { navigate } },
        {
          provide: TasteProfileService,
          useValue: { ensureLoaded: jasmine.createSpy('ensureLoaded') }
        },
        {
          provide: HouseholdService,
          useValue: {
            memberships,
            activeHouseholdId,
            membershipsFailed,
            loadMemberships: jasmine.createSpy('loadMemberships').and.returnValue(of([])),
            ensureHousehold: jasmine.createSpy('ensureHousehold')
          }
        },
        { provide: ModulesService, useValue: { isPathVisible } }
      ]
    })
      .overrideComponent(MainLayoutComponent, {
        set: {
          template: `
            <button type="button" class="header__menu" (click)="toggleSidebar($event)">Menú</button>
            <button type="button" class="sidebar__account-main" (click)="navigateToProfile()">Cuenta</button>
            <div *ngIf="isSidebarOpen()" class="sidebar-overlay"></div>
          `
        }
      })
      .compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    document
      .querySelectorAll('.modal-overlay[data-test="drawer-overlay-test"]')
      .forEach((node) => node.remove());
  });

  function pressEscape(): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  function createFixture(): HTMLButtonElement {
    fixture = TestBed.createComponent(MainLayoutComponent);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  }

  it('does nothing when the mobile drawer is already closed', () => {
    createFixture();

    pressEscape();

    expect(fixture.componentInstance.isSidebarOpen()).toBeFalse();
  });

  it('closes an open drawer and returns focus to its trigger', () => {
    const trigger = createFixture();
    trigger.focus();
    trigger.click();
    fixture.detectChanges();

    pressEscape();
    fixture.detectChanges();

    expect(fixture.componentInstance.isSidebarOpen()).toBeFalse();
    expect(document.activeElement).toBe(trigger);
  });

  it('leaves the drawer open when a dialog is above it', () => {
    const trigger = createFixture();
    trigger.click();
    fixture.detectChanges();
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.dataset['test'] = 'drawer-overlay-test';
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    modalOverlay.append(dialog);
    document.body.append(modalOverlay);

    pressEscape();

    expect(fixture.componentInstance.isSidebarOpen()).toBeTrue();
  });

  it('does not let Escape close the fixed desktop sidebar', () => {
    mobileViewport.and.returnValue({
      matches: false,
      media: '(max-width: 1023px)',
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false
    } as MediaQueryList);
    const trigger = createFixture();
    trigger.click();
    fixture.detectChanges();

    pressEscape();

    expect(fixture.componentInstance.isSidebarOpen()).toBeTrue();
  });

  it('closes the mobile drawer when navigating to the account profile', () => {
    const trigger = createFixture();
    trigger.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.isSidebarOpen()).toBeTrue();

    const accountButton = fixture.nativeElement.querySelector(
      '.sidebar__account-main'
    ) as HTMLButtonElement;
    accountButton.click();
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/account']);
    expect(fixture.componentInstance.isSidebarOpen()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.sidebar-overlay')).toBeNull();
  });

  it('filters desktop and mobile links using the enabled modules', () => {
    createFixture();
    const component = fixture.componentInstance;

    const desktopPaths = component.visibleNavItems().map((item) => item.path);
    const mobilePaths = component.visibleMobileNavItems().map((item) => item.path);

    expect(desktopPaths).toContain('/dashboard');
    expect(desktopPaths).not.toContain('/calendar');
    expect(mobilePaths).toContain('/dashboard');
    expect(mobilePaths).not.toContain('/calendar');
    expect(isPathVisible).toHaveBeenCalledWith('/calendar');
  });

  it('shows AI settings only in personal mode or for an active household settings manager', () => {
    createFixture();
    const component = fixture.componentInstance;
    const aiPathVisible = () => component.visibleNavItems().some((item) => item.path === '/ai-config');

    expect(aiPathVisible()).toBeTrue();
    memberships.set([
      {
        id: 'home-a',
        permissions: { settings: false }
      }
    ]);
    activeHouseholdId.set('home-a');
    expect(aiPathVisible()).toBeFalse();

    memberships.set([
      {
        id: 'home-a',
        permissions: { settings: true }
      }
    ]);
    expect(aiPathVisible()).toBeTrue();

    activeHouseholdId.set(null);
    expect(aiPathVisible()).toBeFalse();
    membershipsFailed.set(true);
    memberships.set([]);
    expect(aiPathVisible()).toBeFalse();
  });

  it('returns the current avatar and logs out through the auth service', () => {
    createFixture();
    currentUser.set({ avatar: 'avatar-data' });

    expect(fixture.componentInstance.userAvatar()).toBe('avatar-data');
    fixture.componentInstance.logout();

    expect(authLogout).toHaveBeenCalledTimes(1);
  });
});
