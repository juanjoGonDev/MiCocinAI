import { TestBed } from '@angular/core/testing';
import { I18nService } from '../../core/services/i18n.service';
import { CalendarTimelineComponent } from './calendar-timeline.component';

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
});
