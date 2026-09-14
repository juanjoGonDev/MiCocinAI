import { TimeFormatPipe } from './time-format.pipe';

describe('TimeFormatPipe', () => {
  let pipe: TimeFormatPipe;

  beforeEach(() => {
    pipe = new TimeFormatPipe();
  });

  it('should create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should format seconds to mm:ss', () => {
    expect(pipe.transform(0)).toBe('00:00');
    expect(pipe.transform(30)).toBe('00:30');
    expect(pipe.transform(60)).toBe('01:00');
    expect(pipe.transform(90)).toBe('01:30');
    expect(pipe.transform(125)).toBe('02:05');
  });

  it('should format minutes to readable text', () => {
    expect(pipe.transform(0, 'minutes')).toBe('0 min');
    expect(pipe.transform(30, 'minutes')).toBe('30 min');
    expect(pipe.transform(60, 'minutes')).toBe('1h');
    expect(pipe.transform(90, 'minutes')).toBe('1h 30min');
    expect(pipe.transform(120, 'minutes')).toBe('2h');
  });

  it('should handle null/undefined', () => {
    expect(pipe.transform(null as any)).toBe('00:00');
    expect(pipe.transform(undefined as any)).toBe('00:00');
  });
});
