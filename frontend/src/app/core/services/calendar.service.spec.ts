import { HttpRequest } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SILENT_TOAST } from '../interceptors/error.interceptor';
import { I18nService } from './i18n.service';
import { CalendarService } from './calendar.service';

const RANGE_A = { start: '2026-10-01', end: '2026-10-01' };
const RANGE_B = { start: '2026-10-02', end: '2026-10-02' };

const rangeRequest =
  (range: typeof RANGE_A) =>
  (request: HttpRequest<unknown>): boolean =>
    request.url === '/api/calendar/range' &&
    request.params.get('startDate') === range.start &&
    request.params.get('endDate') === range.end;

const eventRequest =
  (range: typeof RANGE_A) =>
  (request: HttpRequest<unknown>): boolean =>
    request.url === '/api/calendar/events' &&
    request.params.get('from') === range.start &&
    request.params.get('to') === range.end;

function rangeResponse(date: string, title: string, calories: number) {
  return {
    data: {
      startDate: date,
      endDate: date,
      goals: { type: 'balanced' as const, dailyCalories: calories, restrictions: [] },
      meals: [
        {
          id: `meal-${date}`,
          date,
          meal_type: 'lunch' as const,
          recipe_id: null,
          recipe_name: null,
          recipe_calories: null,
          custom_meal: title,
          time: '12:00',
          servings: 2,
          notes: null,
          completed: false
        }
      ]
    }
  };
}

function householdEvent(id: string, date: string, title: string) {
  return {
    id,
    date,
    title,
    kind: 'home' as const,
    startTime: null,
    endTime: null,
    allDay: true,
    color: null,
    notes: null,
    location: null,
    source: 'user',
    userId: 'synthetic-user',
    authorName: 'Synthetic User',
    editable: true
  };
}

describe('CalendarService visible range concurrency', () => {
  let service: CalendarService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [CalendarService, { provide: I18nService, useValue: { t: () => 'load failed' } }]
    });
    service = TestBed.inject(CalendarService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('ignores an older successful meal range while the latest visible range is pending', () => {
    service.loadRange(RANGE_A.start, RANGE_A.end);
    const older = http.expectOne(rangeRequest(RANGE_A));
    service.loadRange(RANGE_B.start, RANGE_B.end);
    const latest = http.expectOne(rangeRequest(RANGE_B));

    older.flush(rangeResponse(RANGE_A.start, 'Older meal', 1700));

    expect(service.isLoading()).toBeTrue();
    expect(service.range()).toBeNull();
    expect(service.meals()).toEqual([]);
    expect(service.goals()).toBeNull();
    latest.flush(rangeResponse(RANGE_B.start, 'Latest meal', 2100));

    expect(service.range()).toEqual(RANGE_B);
    expect(service.meals().map((meal) => meal.title)).toEqual(['Latest meal']);
    expect(service.targetCalories()).toBe(2100);
    expect(service.isLoading()).toBeFalse();
  });

  it('ignores an older meal-range failure without changing loading, error, or deduplication', () => {
    service.loadRange(RANGE_A.start, RANGE_A.end);
    const older = http.expectOne(rangeRequest(RANGE_A));
    service.loadRange(RANGE_B.start, RANGE_B.end);
    const latest = http.expectOne(rangeRequest(RANGE_B));

    older.flush({}, { status: 503, statusText: 'Unavailable' });

    expect(service.isLoading()).toBeTrue();
    expect(service.error()).toBeNull();
    service.loadRange(RANGE_B.start, RANGE_B.end);
    http.expectNone(rangeRequest(RANGE_B));
    latest.flush(rangeResponse(RANGE_B.start, 'Latest meal', 2100));

    expect(service.range()).toEqual(RANGE_B);
    expect(service.meals().map((meal) => meal.title)).toEqual(['Latest meal']);
    expect(service.error()).toBeNull();
    expect(service.isLoading()).toBeFalse();
  });

  it('keeps loaded meal data after the current request fails and permits retry', () => {
    service.loadRange(RANGE_A.start, RANGE_A.end);
    http.expectOne(rangeRequest(RANGE_A)).flush(rangeResponse(RANGE_A.start, 'Saved meal', 1800));

    service.loadRange(RANGE_B.start, RANGE_B.end);
    http.expectOne(rangeRequest(RANGE_B)).flush({}, { status: 503, statusText: 'Unavailable' });

    expect(service.range()).toEqual(RANGE_A);
    expect(service.meals().map((meal) => meal.title)).toEqual(['Saved meal']);
    expect(service.targetCalories()).toBe(1800);
    expect(service.error()).toBe('load failed');
    expect(service.isLoading()).toBeFalse();

    service.loadRange(RANGE_B.start, RANGE_B.end);
    http
      .expectOne(rangeRequest(RANGE_B))
      .flush(rangeResponse(RANGE_B.start, 'Recovered meal', 2200));

    expect(service.range()).toEqual(RANGE_B);
    expect(service.meals().map((meal) => meal.title)).toEqual(['Recovered meal']);
    expect(service.error()).toBeNull();
    expect(service.isLoading()).toBeFalse();
  });

  it('keeps only the latest forced meal refresh for the same range', () => {
    service.loadRange(RANGE_A.start, RANGE_A.end);
    http.expectOne(rangeRequest(RANGE_A)).flush(rangeResponse(RANGE_A.start, 'Initial meal', 1800));

    service.loadRange(RANGE_A.start, RANGE_A.end, true);
    const olderRefresh = http.expectOne(rangeRequest(RANGE_A));
    service.loadRange(RANGE_A.start, RANGE_A.end, true);
    const latestRefresh = http.expectOne(rangeRequest(RANGE_A));

    latestRefresh.flush(rangeResponse(RANGE_A.start, 'Latest refresh', 2300));
    olderRefresh.flush(rangeResponse(RANGE_A.start, 'Stale refresh', 1600));

    expect(service.meals().map((meal) => meal.title)).toEqual(['Latest refresh']);
    expect(service.targetCalories()).toBe(2300);
    expect(service.isLoading()).toBeFalse();
  });

  it('ignores an older successful household-event range', () => {
    service.loadHouseholdEvents(RANGE_A.start, RANGE_A.end);
    const older = http.expectOne(eventRequest(RANGE_A));
    service.loadHouseholdEvents(RANGE_B.start, RANGE_B.end);
    const latest = http.expectOne(eventRequest(RANGE_B));

    latest.flush({ data: [householdEvent('event-latest', RANGE_B.start, 'Latest event')] });
    older.flush({ data: [householdEvent('event-old', RANGE_A.start, 'Older event')] });

    expect(service.householdEvents().map((event) => event.title)).toEqual(['Latest event']);
    expect(service.eventsError()).toBeNull();
    expect(service.eventsLoading()).toBeFalse();
  });

  it('ignores an older household-event failure without releasing the latest request', () => {
    service.loadHouseholdEvents(RANGE_A.start, RANGE_A.end);
    const older = http.expectOne(eventRequest(RANGE_A));
    service.loadHouseholdEvents(RANGE_B.start, RANGE_B.end);
    const latest = http.expectOne(eventRequest(RANGE_B));

    older.flush({}, { status: 503, statusText: 'Unavailable' });

    expect(service.eventsLoading()).toBeTrue();
    expect(service.eventsError()).toBeNull();
    service.loadHouseholdEvents(RANGE_B.start, RANGE_B.end);
    http.expectNone(eventRequest(RANGE_B));
    latest.flush({ data: [householdEvent('event-latest', RANGE_B.start, 'Latest event')] });

    expect(service.householdEvents().map((event) => event.title)).toEqual(['Latest event']);
    expect(service.eventsError()).toBeNull();
    expect(service.eventsLoading()).toBeFalse();
  });

  it('reports a current household-event failure and allows retrying the same window', () => {
    service.loadHouseholdEvents(RANGE_A.start, RANGE_A.end);
    http.expectOne(eventRequest(RANGE_A)).flush({}, { status: 503, statusText: 'Unavailable' });

    expect(service.eventsError()).toBe('load failed');
    expect(service.eventsLoading()).toBeFalse();

    service.loadHouseholdEvents(RANGE_A.start, RANGE_A.end);
    http.expectOne(eventRequest(RANGE_A)).flush({
      data: [householdEvent('event-recovered', RANGE_A.start, 'Recovered event')]
    });

    expect(service.householdEvents().map((event) => event.title)).toEqual(['Recovered event']);
    expect(service.eventsError()).toBeNull();
    expect(service.eventsLoading()).toBeFalse();
  });

  it('keeps only the latest forced household-event refresh for the same range', () => {
    service.loadHouseholdEvents(RANGE_A.start, RANGE_A.end);
    http
      .expectOne(eventRequest(RANGE_A))
      .flush({ data: [householdEvent('event-initial', RANGE_A.start, 'Initial event')] });

    service.loadHouseholdEvents(RANGE_A.start, RANGE_A.end, true);
    const olderRefresh = http.expectOne(eventRequest(RANGE_A));
    service.loadHouseholdEvents(RANGE_A.start, RANGE_A.end, true);
    const latestRefresh = http.expectOne(eventRequest(RANGE_A));

    latestRefresh.flush({ data: [householdEvent('event-latest', RANGE_A.start, 'Latest event')] });
    olderRefresh.flush({ data: [householdEvent('event-old', RANGE_A.start, 'Stale event')] });

    expect(service.householdEvents().map((event) => event.title)).toEqual(['Latest event']);
    expect(service.eventsLoading()).toBeFalse();
  });

  it('returns false and restores the meal after a failed delete without a duplicate global toast', () => {
    service.loadRange(RANGE_A.start, RANGE_A.end);
    http.expectOne(rangeRequest(RANGE_A)).flush(rangeResponse(RANGE_A.start, 'Saved meal', 1800));

    const results: boolean[] = [];
    service.deleteMeal(`meal-${RANGE_A.start}`).subscribe((result) => results.push(result));

    const deletion = http.expectOne((request) =>
      request.url.endsWith(`/calendar/meals/meal-${RANGE_A.start}`)
    );
    expect(deletion.request.method).toBe('DELETE');
    expect(deletion.request.context.get(SILENT_TOAST)).toBeTrue();
    deletion.flush({}, { status: 503, statusText: 'Unavailable' });

    expect(results).toEqual([false]);
    expect(service.meals()).toEqual([]);

    http.expectOne(rangeRequest(RANGE_A)).flush(rangeResponse(RANGE_A.start, 'Saved meal', 1800));
    expect(service.meals().map((meal) => meal.title)).toEqual(['Saved meal']);
  });

  it('returns true and refreshes the range after a successful delete', () => {
    service.loadRange(RANGE_A.start, RANGE_A.end);
    const existingRange = rangeResponse(RANGE_A.start, 'Saved meal', 1800);
    http.expectOne(rangeRequest(RANGE_A)).flush(existingRange);

    const results: boolean[] = [];
    service.deleteMeal(`meal-${RANGE_A.start}`).subscribe((result) => results.push(result));

    const deletion = http.expectOne((request) =>
      request.url.endsWith(`/calendar/meals/meal-${RANGE_A.start}`)
    );
    expect(deletion.request.method).toBe('DELETE');
    expect(deletion.request.context.get(SILENT_TOAST)).toBeTrue();
    deletion.flush({ success: true });

    expect(results).toEqual([true]);
    const refreshedRange = { ...existingRange, data: { ...existingRange.data, meals: [] } };
    http.expectOne(rangeRequest(RANGE_A)).flush(refreshedRange);
    expect(service.meals()).toEqual([]);
  });
});
