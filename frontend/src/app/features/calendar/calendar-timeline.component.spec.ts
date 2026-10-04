import { SimpleChange } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CalendarDayView } from '../../shared/models/calendar.model';
import { I18nService } from '../../core/services/i18n.service';
import { CalendarTimelineComponent } from './calendar-timeline.component';

function day(iso: string, isToday = false): CalendarDayView {
  return {
    date: new Date(`${iso}T12:00:00`),
    iso,
    inCurrentMonth: true,
    isToday,
    meals: [],
    calories: 0,
    hasNutrition: false,
    slots: { breakfast: [], lunch: [], snack: [], dinner: [] },
    planned: 0,
    done: 0,
    events: []
  };
}

describe('CalendarTimelineComponent grid geometry', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarTimelineComponent],
      providers: [{ provide: I18nService, useValue: {} }]
    })
      .overrideComponent(CalendarTimelineComponent, { set: { template: '' } })
      .compileComponents();
  });

  it('keeps a non-zero day column when no days have loaded yet', () => {
    const component = TestBed.createComponent(CalendarTimelineComponent).componentInstance;
    const geometry = component as unknown as {
      columns: () => string;
      gridMinWidth: () => string;
    };

    expect(geometry.columns()).toBe('60px repeat(1, minmax(48px, 1fr))');
    expect(geometry.gridMinWidth()).toBe('108px');
  });

  it('allocates the same 48px minimum track for every day in a week', () => {
    const component = TestBed.createComponent(CalendarTimelineComponent).componentInstance;
    const geometry = component as unknown as {
      columns: () => string;
      gridMinWidth: () => string;
    };
    component.days = Array.from({ length: 7 }, () => ({})) as CalendarTimelineComponent['days'];

    expect(geometry.columns()).toBe('60px repeat(7, minmax(48px, 1fr))');
    expect(geometry.gridMinWidth()).toBe('396px');
  });

  it('resets the initial position only when the visible date range changes', () => {
    const component = TestBed.createComponent(CalendarTimelineComponent).componentInstance;
    const scroller = { scrollTop: 640 } as HTMLDivElement;
    (component as unknown as { scroller: { nativeElement: HTMLDivElement } }).scroller = {
      nativeElement: scroller
    };

    const firstRange = [day('2026-10-11')];
    component.days = firstRange;
    component.ngOnChanges({ days: new SimpleChange([], firstRange, true) });
    component.ngAfterViewInit();
    expect(scroller.scrollTop).toBe(0);

    scroller.scrollTop = 640;
    const refreshedDays = [day('2026-10-11')];
    component.days = refreshedDays;
    component.ngOnChanges({ days: new SimpleChange(firstRange, refreshedDays, false) });
    expect(scroller.scrollTop).toBe(640);

    component.ngOnChanges({ kitchen: new SimpleChange(true, false, false) });
    expect(scroller.scrollTop).toBe(640);
    component.ngOnChanges({});
    expect(scroller.scrollTop).toBe(640);

    const nextRange = [day('2026-10-18')];
    component.days = nextRange;
    component.ngOnChanges({ days: new SimpleChange(refreshedDays, nextRange, false) });
    expect(scroller.scrollTop).toBe(0);
  });
});
