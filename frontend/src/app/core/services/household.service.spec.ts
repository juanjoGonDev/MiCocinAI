import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SILENT_TOAST } from '../interceptors/error.interceptor';
import type {
  Household,
  HouseholdMember,
  InvitePreview,
  MemberPermissions
} from '../../shared/models/household.model';
import { HouseholdService } from './household.service';
import { STORAGE_KEYS } from './storage.service';

const API_URL = '/api/household';
const PERMISSIONS: MemberPermissions = {
  pantry: { view: true, edit: true, manage: true },
  recipes: { view: true, create: true, edit: true, delete: true, generateAI: true },
  calendar: { view: true, edit: true },
  members: { invite: true, kick: true, manageRoles: true },
  settings: true
};

type RawMember = Omit<HouseholdMember, 'avatar'> & { avatar?: string | null };

function member(overrides: Partial<RawMember> = {}): RawMember {
  return {
    id: 'membership-1',
    userId: 'current-user',
    name: 'Ada Lovelace',
    email: 'ada@example.test',
    role: 'admin',
    cookingLevel: 'intermediate',
    avatar: null,
    joinedAt: '2026-01-02T03:04:05.000Z' as unknown as Date,
    permissions: PERMISSIONS,
    ...overrides
  };
}

function household(overrides: Record<string, unknown> = {}) {
  return {
    id: 'home-1',
    name: 'Casa sintética',
    inviteCode: 'ABC12345',
    members: [member()],
    sharedPantry: true,
    shareRecipes: true,
    shareCalendar: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides
  };
}

describe('HouseholdService', () => {
  let service: HouseholdService;
  let http: HttpTestingController;
  let originalClipboard: PropertyDescriptor | undefined;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.currentUser);
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [HouseholdService]
    });
    service = TestBed.inject(HouseholdService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem(STORAGE_KEYS.currentUser);
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
      originalClipboard = undefined;
    } else {
      delete (navigator as unknown as { clipboard?: Clipboard }).clipboard;
    }
  });

  it('deduplicates ensure requests and caches a successful empty household response', () => {
    service.ensureHousehold();
    expect(service.isLoading()).toBeTrue();

    service.ensureHousehold();
    const request = http.expectOne(API_URL);
    expect(request.request.method).toBe('GET');
    request.flush({ success: true, data: null });

    expect(service.isLoading()).toBeFalse();
    expect(service.household()).toBeNull();
    service.ensureHousehold();
    http.expectNone(API_URL);
  });

  it('maps the matching member, permission flags and defaults, then avoids another ensure request', () => {
    localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify({ id: 'current-user' }));
    const other = member({
      id: 'membership-2',
      userId: 'other-user',
      name: 'Grace Hopper',
      role: 'member',
      avatar: 'https://example.test/avatar.png'
    });
    const current = member({ id: 'membership-3', avatar: null });
    const raw = household({
      members: [other, current],
      sharedPantry: 1,
      shareRecipes: false,
      shareCalendar: undefined
    });

    service.ensureHousehold();
    http.expectOne(API_URL).flush({ success: true, data: raw });

    const loaded = service.household();
    expect(loaded).toEqual(
      jasmine.objectContaining({
        id: 'home-1',
        inviteCode: 'ABC12345',
        sharedPantry: true,
        shareRecipes: false,
        shareCalendar: true,
        myRole: 'admin',
        myPermissions: PERMISSIONS,
        members: [
          jasmine.objectContaining({
            userId: 'other-user',
            avatar: 'https://example.test/avatar.png'
          }),
          jasmine.objectContaining({ userId: 'current-user', avatar: undefined })
        ]
      })
    );
    expect(service.isAdmin()).toBeTrue();

    service.ensureHousehold();
    http.expectNone(API_URL);
  });

  it('falls back to the first member and survives corrupt local user JSON', () => {
    localStorage.setItem(STORAGE_KEYS.currentUser, '{not-json');
    const first = member({ userId: 'first-user', role: 'member', permissions: undefined });
    const raw = household({
      members: [first, member({ userId: 'second-user', role: 'child' })],
      sharedPantry: false,
      shareRecipes: undefined,
      shareCalendar: false
    });

    service.loadHousehold();
    http.expectOne(API_URL).flush({ data: raw });

    expect(service.household()).toEqual(
      jasmine.objectContaining({
        sharedPantry: false,
        shareRecipes: true,
        shareCalendar: false,
        myRole: 'member',
        myPermissions: undefined,
        members: jasmine.arrayContaining([
          jasmine.objectContaining({ userId: 'first-user', avatar: undefined }),
          jasmine.objectContaining({ userId: 'second-user' })
        ])
      })
    );
    expect(service.isAdmin()).toBeFalse();
  });

  it('maps households with missing members and no stored user', () => {
    service.loadHousehold();
    http.expectOne(API_URL).flush({ data: household({ members: undefined }) });

    expect(service.household()).toEqual(
      jasmine.objectContaining({
        members: [],
        myRole: undefined,
        myPermissions: undefined
      })
    );
    expect(service.isAdmin()).toBeFalse();
  });

  it('clears loading after a failed ensure and retries successfully on the next ensure', () => {
    service.ensureHousehold();
    http
      .expectOne(API_URL)
      .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    expect(service.household()).toBeNull();
    expect(service.isLoading()).toBeFalse();

    service.ensureHousehold();
    expect(service.isLoading()).toBeTrue();
    http.expectOne(API_URL).flush({ data: household() });
    expect(service.household()?.id).toBe('home-1');
    expect(service.isLoading()).toBeFalse();
  });

  it('returns invite data rather than the HTTP envelope and returns null for empty/error responses', () => {
    const preview: InvitePreview = {
      householdId: 'home-1',
      householdName: 'Casa sintética',
      memberCount: 2,
      alreadyMember: false
    };
    let emitted: InvitePreview | null | undefined;

    service.previewInvite('ABC12345').subscribe((value) => (emitted = value));
    http.expectOne(`${API_URL}/invite/ABC12345`).flush({ success: true, data: preview });
    expect(emitted).toEqual(preview);

    emitted = undefined;
    service.previewInvite('EMPTY').subscribe((value) => (emitted = value));
    http.expectOne(`${API_URL}/invite/EMPTY`).flush(null);
    expect(emitted).toBeNull();

    emitted = undefined;
    service.previewInvite('INVALID').subscribe((value) => (emitted = value));
    http.expectOne(`${API_URL}/invite/INVALID`).flush({}, { status: 404, statusText: 'Not Found' });
    expect(emitted).toBeNull();
  });

  it('creates households with the declared entity contract, default, false flag and error handling', () => {
    localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify({ id: 'current-user' }));
    const raw = household();
    let created: Household | null | undefined;

    service.createHousehold('Casa sintética').subscribe((value) => (created = value));
    const create = http.expectOne(API_URL);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ name: 'Casa sintética', sharedPantry: true });
    expect(create.request.context.get(SILENT_TOAST)).toBeTrue();
    create.flush({ success: true, data: raw });
    expect(created).toEqual(jasmine.objectContaining({ id: 'home-1', inviteCode: 'ABC12345' }));
    expect(service.household()?.name).toBe('Casa sintética');

    let noData: Household | null | undefined;
    service
      .createHousehold('Sin despensa compartida', false)
      .subscribe((value) => (noData = value));
    const createWithoutPantry = http.expectOne(API_URL);
    expect(createWithoutPantry.request.body).toEqual({
      name: 'Sin despensa compartida',
      sharedPantry: false
    });
    createWithoutPantry.flush({ success: true, data: null });
    expect(noData).toBeNull();
    expect(service.household()).toBeNull();

    let failed: Household | null | undefined;
    service.createHousehold('No creada').subscribe((value) => (failed = value));
    http.expectOne(API_URL).flush({}, { status: 503, statusText: 'Unavailable' });
    expect(failed).toBeNull();
  });

  it('joins by path code, reloads the household and propagates join errors', () => {
    let joined: unknown;
    service.joinByCode('ABC12345').subscribe((value) => (joined = value));
    const join = http.expectOne(`${API_URL}/join/ABC12345`);
    expect(join.request.method).toBe('POST');
    expect(join.request.body).toEqual({});
    join.flush({ success: true, message: 'Joined household' });
    expect(joined).toEqual({ success: true, message: 'Joined household' });
    http.expectOne(API_URL).flush({ data: household() });
    expect(service.household()?.id).toBe('home-1');

    let joinError: unknown;
    service.joinByCode('BADCODE').subscribe({ error: (error) => (joinError = error) });
    http.expectOne(`${API_URL}/join/BADCODE`).flush({}, { status: 404, statusText: 'Not Found' });
    expect(joinError).toBeTruthy();
  });

  it('joins by request body, reloads on success and returns null on failure', () => {
    let joined: unknown;
    service.joinHousehold('JOINCODE').subscribe((value) => (joined = value));
    const join = http.expectOne(`${API_URL}/join`);
    expect(join.request.method).toBe('POST');
    expect(join.request.body).toEqual({ inviteCode: 'JOINCODE' });
    expect(join.request.context.get(SILENT_TOAST)).toBeTrue();
    join.flush({ success: true, message: 'Joined household' });
    expect(joined).toEqual({ success: true, message: 'Joined household' });
    http.expectOne(API_URL).flush({ data: null });

    let failed: unknown;
    service.joinHousehold('BADCODE').subscribe((value) => (failed = value));
    http.expectOne(`${API_URL}/join`).flush({}, { status: 404, statusText: 'Not Found' });
    expect(failed).toBeNull();
  });

  it('updates settings and emits the mapped household, with null on an empty response or error', () => {
    localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify({ id: 'current-user' }));
    const settings = {
      name: 'Casa renovada',
      sharedPantry: false,
      shareRecipes: false,
      shareCalendar: true
    };
    let updated: Household | null | undefined;

    service.updateSettings(settings).subscribe((value) => (updated = value));
    const update = http.expectOne(API_URL);
    expect(update.request.method).toBe('PATCH');
    expect(update.request.body).toEqual(settings);
    expect(update.request.context.get(SILENT_TOAST)).toBeTrue();
    update.flush({ success: true, data: household({ ...settings, inviteCode: 'NEWCODE' }) });
    expect(updated).toEqual(
      jasmine.objectContaining({ id: 'home-1', inviteCode: 'NEWCODE', name: 'Casa renovada' })
    );
    expect(service.household()?.sharedPantry).toBeFalse();

    let empty: Household | null | undefined;
    service.updateSettings({ shareCalendar: false }).subscribe((value) => (empty = value));
    http.expectOne(API_URL).flush({ success: true, data: null });
    expect(empty).toBeNull();

    let failed: Household | null | undefined;
    service.updateSettings({ name: 'Error' }).subscribe((value) => (failed = value));
    http.expectOne(API_URL).flush({}, { status: 403, statusText: 'Forbidden' });
    expect(failed).toBeNull();
  });

  it('regenerates and emits the invite code, preserves a null household, and catches errors', () => {
    service.loadHousehold();
    http.expectOne(API_URL).flush({ data: household() });

    let code: string | null | undefined;
    service.regenerateInviteCode().subscribe((value) => (code = value));
    const regenerate = http.expectOne(`${API_URL}/regenerate-invite`);
    expect(regenerate.request.method).toBe('POST');
    expect(regenerate.request.body).toEqual({});
    expect(regenerate.request.context.get(SILENT_TOAST)).toBeTrue();
    regenerate.flush({ success: true, data: { inviteCode: 'NEWCODE' } });
    expect(code).toBe('NEWCODE');
    expect(service.household()?.inviteCode).toBe('NEWCODE');

    service.leaveHousehold().subscribe();
    http.expectOne(`${API_URL}/leave`).flush({ success: true });
    expect(service.household()).toBeNull();

    let codeWithoutHouse: string | null | undefined;
    service.regenerateInviteCode().subscribe((value) => (codeWithoutHouse = value));
    http
      .expectOne(`${API_URL}/regenerate-invite`)
      .flush({ success: true, data: { inviteCode: 'UNATTACHED' } });
    expect(codeWithoutHouse).toBe('UNATTACHED');
    expect(service.household()).toBeNull();

    let failed: string | null | undefined;
    service.regenerateInviteCode().subscribe((value) => (failed = value));
    http
      .expectOne(`${API_URL}/regenerate-invite`)
      .flush({}, { status: 403, statusText: 'Forbidden' });
    expect(failed).toBeNull();
  });

  it('leaves the household, emits true on success and false on error', () => {
    service.loadHousehold();
    http.expectOne(API_URL).flush({ data: household() });
    let left: boolean | undefined;

    service.leaveHousehold().subscribe((value) => (left = value));
    const leave = http.expectOne(`${API_URL}/leave`);
    expect(leave.request.method).toBe('DELETE');
    expect(leave.request.context.get(SILENT_TOAST)).toBeTrue();
    leave.flush({ success: true, message: 'Left household' });
    expect(left).toBeTrue();
    expect(service.household()).toBeNull();

    let failed: boolean | undefined;
    service.leaveHousehold().subscribe((value) => (failed = value));
    http.expectOne(`${API_URL}/leave`).flush({}, { status: 404, statusText: 'Not Found' });
    expect(failed).toBeFalse();
  });

  it('copies a current invite URL and covers explicit/fallback link and admin states', () => {
    const writeText = jasmine.createSpy('writeText').and.returnValue(Promise.resolve());
    originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    expect(service.isAdmin()).toBeFalse();
    expect(service.getInviteLink('EXPLICIT')).toBe(`${window.location.origin}/invite/EXPLICIT`);
    expect(service.getInviteLink()).toBe(`${window.location.origin}/invite/undefined`);
    service.copyInviteCode();
    expect(writeText).not.toHaveBeenCalled();

    service.loadHousehold();
    http.expectOne(API_URL).flush({ data: household() });
    expect(service.isAdmin()).toBeTrue();
    expect(service.getInviteLink()).toBe(`${window.location.origin}/invite/ABC12345`);
    service.copyInviteCode();
    expect(writeText).toHaveBeenCalledOnceWith(`${window.location.origin}/invite/ABC12345`);
  });
});
