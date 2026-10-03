import { describe, expect, it } from 'vitest';
import {
  dayFromISO,
  exceptionSet,
  expandOccurrences,
  isRecurrence,
  occursOn,
  parseExceptionDates,
  type RecurrenceRule
} from './calendar-recurrence.js';

// Un mes de octubre de 2026 como ventana: 31 dias, y el 1 de octubre de 2026 es jueves (UTC).
const OCTUBRE = { from: '2026-10-01', to: '2026-10-31' };

const serie = (extra: Partial<RecurrenceRule> & { date: string; recurrence: RecurrenceRule['recurrence'] }): RecurrenceRule => extra;

describe('calendario — fechas ISO', () => {
  it('lee una fecha real y rechaza la que no existe', () => {
    expect(dayFromISO('2026-10-01')).toBe(Date.UTC(2026, 9, 1));
    expect(dayFromISO('2026-02-30')).toBeNull(); // febrero no tiene dia 30
    expect(dayFromISO('2026-2-1')).toBeNull(); // sin relleno no es ISO
    expect(dayFromISO(null)).toBeNull();
    expect(dayFromISO(undefined)).toBeNull();
  });

  it('conoce los tres valores y solo los tres', () => {
    expect(isRecurrence('none')).toBe(true);
    expect(isRecurrence('daily')).toBe(true);
    expect(isRecurrence('weekly')).toBe(true);
    expect(isRecurrence('monthly')).toBe(false); // todavia no (12t-R: va al §13)
    expect(isRecurrence('')).toBe(false);
    expect(isRecurrence(null)).toBe(false);
  });
});

describe('calendario — expandir una serie', () => {
  it('`none` es el dia de la fila, ni uno mas', () => {
    expect(expandOccurrences(serie({ date: '2026-10-08', recurrence: 'none' }), OCTUBRE).dates).toEqual([
      '2026-10-08'
    ]);
    // Fuera de la ventana no existe para quien mira.
    expect(expandOccurrences(serie({ date: '2026-09-08', recurrence: 'none' }), OCTUBRE).dates).toEqual([]);
  });

  it('`daily` llena la ventana desde el dia de la serie, y no antes', () => {
    const desdeEl25 = expandOccurrences(serie({ date: '2026-09-25', recurrence: 'daily' }), OCTUBRE);
    expect(desdeEl25.dates[0]).toBe('2026-10-01');
    expect(desdeEl25.dates).toHaveLength(31);
    expect(desdeEl25.truncated).toBe(false);

    // Una serie que empieza dentro de la ventana no puede rellenar los dias anteriores.
    const desdeEl12 = expandOccurrences(serie({ date: '2026-10-12', recurrence: 'daily' }), OCTUBRE);
    expect(desdeEl12.dates[0]).toBe('2026-10-12');
    expect(desdeEl12.dates).toHaveLength(20);
  });

  it('`weekly` cae siempre en el mismo dia de la semana, aunque la serie empiece hace anos', () => {
    // Jueves 1 de octubre de 2026; la serie empezo un jueves de enero.
    const rule = serie({ date: '2026-01-01', recurrence: 'weekly' });
    const { dates } = expandOccurrences(rule, OCTUBRE);
    expect(dates.length).toBeGreaterThan(3);
    for (const iso of dates) {
      expect(new Date(`${iso}T00:00:00.000Z`).getUTCDay()).toBe(4); // jueves
    }
    // Salto a la primera ocurrencia de la ventana: no se recorre enero-octubre a saltos de siete dias.
    expect(dates[0]! >= '2026-10-01').toBe(true);
    expect(dates[0]! <= '2026-10-07').toBe(true);
  });

  it('las excepciones quitan el dia, no la serie («solo este dia no»)', () => {
    const rule = serie({ date: '2026-10-01', recurrence: 'daily', exceptions: ['2026-10-13', '2026-10-14'] });
    const { dates } = expandOccurrences(rule, OCTUBRE);
    expect(dates).toHaveLength(29);
    expect(dates).not.toContain('2026-10-13');
    expect(dates).not.toContain('2026-10-14');
  });

  it('una excepcion fuera de la ventana no molesta, y una serie `none` si se puede quitar', () => {
    expect(expandOccurrences(serie({ date: '2026-10-08', recurrence: 'none', exceptions: ['2026-12-25'] }), OCTUBRE).dates).toEqual([
      '2026-10-08'
    ]);
    expect(expandOccurrences(serie({ date: '2026-10-08', recurrence: 'none', exceptions: ['2026-10-08'] }), OCTUBRE).dates).toEqual([]);
  });

  it('la columna es TEXT: acepta el JSON ya parseado y el que no', () => {
    const comoTexto = serie({ date: '2026-10-01', recurrence: 'daily', exceptions: '["2026-10-02"]' });
    expect(expandOccurrences(comoTexto, { from: '2026-10-01', to: '2026-10-03' }).dates).toEqual([
      '2026-10-01',
      '2026-10-03'
    ]);
    expect([...exceptionSet({ date: '2026-10-01', recurrence: 'daily', exceptions: 'no es JSON' })]).toEqual([]);
    expect([...exceptionSet({ date: '2026-10-01', recurrence: 'daily', exceptions: ['2026-10-05', 'basura'] })]).toEqual([
      '2026-10-05'
    ]);
  });

  it('una ventana al reves o una fecha ilegible no rompen nada', () => {
    expect(expandOccurrences(serie({ date: '2026-10-01', recurrence: 'daily' }), { from: '2026-10-31', to: '2026-10-01' })).toEqual({
      dates: [],
      truncated: false
    });
    expect(expandOccurrences(serie({ date: 'no-existe', recurrence: 'daily' }), OCTUBRE).dates).toEqual([]);
  });

  it('corta por seguridad y lo dice, en vez de colgarse con una ventana de cien anos', () => {
    const lejos = expandOccurrences(serie({ date: '2026-10-01', recurrence: 'daily' }), {
      from: '2026-10-01',
      to: '2126-10-01'
    });
    expect(lejos.dates).toHaveLength(400);
    expect(lejos.truncated).toBe(true);
  });

  it('sin ventana, `none` contesta su dia y el resto se corta por el maximo', () => {
    expect(expandOccurrences(serie({ date: '2026-10-08', recurrence: 'none' })).dates).toEqual(['2026-10-08']);
    expect(expandOccurrences(serie({ date: '2026-10-08', recurrence: 'daily' }), {}, 3).dates).toEqual([
      '2026-10-08',
      '2026-10-09',
      '2026-10-10'
    ]);
  });
});

describe('calendario — parseExceptionDates', () => {
  it('deja solo las fechas validas, en el orden de llegada y sin repetirlas', () => {
    expect(parseExceptionDates(['2026-10-05', '2026-10-02'])).toEqual(['2026-10-05', '2026-10-02']);
    expect(parseExceptionDates('["2026-10-05","2026-10-05",5,null,"basura"]')).toEqual(['2026-10-05']);
    expect(parseExceptionDates(null)).toEqual([]);
    expect(parseExceptionDates(undefined)).toEqual([]);
    expect(parseExceptionDates('{"no":"es una lista"}')).toEqual([]);
  });
});

describe('calendario — occursOn', () => {
  it('responde por un dia concreto, que es lo que pregunta el «quitar solo este dia»', () => {
    const rule = serie({ date: '2026-10-01', recurrence: 'weekly', exceptions: ['2026-10-15'] });
    expect(occursOn(rule, '2026-10-08')).toBe(true);
    expect(occursOn(rule, '2026-10-15')).toBe(false);
    expect(occursOn(rule, '2026-10-16')).toBe(false);
    expect(occursOn(serie({ date: '2026-10-08', recurrence: 'none' }), '2026-10-08')).toBe(true);
  });
});
