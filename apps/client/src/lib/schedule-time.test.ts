import { describe, expect, it } from 'vitest';

import { formatVenueDateTime } from './schedule-time';

describe('Venue schedule display', () => {
  const instant = '2026-11-06T15:00:00.000Z';

  it('identifies the Venue timezone for the same UTC instant', () => {
    const utc = formatVenueDateTime(instant, 'UTC');
    const moscow = formatVenueDateTime(instant, 'Europe/Moscow');
    expect(utc).toContain('15:00');
    expect(moscow).toContain('18:00');
    expect(utc).toContain('GMT');
    expect(moscow).toContain('GMT+3');
    expect(moscow).toContain('время зала');
  });

  it('uses the Venue zone independently of the device zone', () => {
    const previous = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      const inUtcDevice = formatVenueDateTime(instant, 'Europe/Moscow');
      process.env.TZ = 'Europe/Moscow';
      expect(formatVenueDateTime(instant, 'Europe/Moscow')).toBe(inUtcDevice);
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });

  it('rolls the calendar date in the Venue zone', () => {
    const text = formatVenueDateTime('2026-11-06T22:30:00.000Z', 'Europe/Moscow');
    expect(text).toContain('07.11.2026');
    expect(text).toContain('01:30');
  });

  it('uses the offset on the event date rather than the current offset', () => {
    expect(formatVenueDateTime('2026-01-15T15:00:00.000Z', 'Europe/Berlin')).toContain('16:00 GMT+1');
    expect(formatVenueDateTime('2026-07-15T15:00:00.000Z', 'Europe/Berlin')).toContain('17:00 GMT+2');
  });

  it('does not guess a Venue timezone or display a fabricated invalid date', () => {
    for (const zone of [undefined, '', 'Not/A_Zone']) {
      expect(formatVenueDateTime(instant, zone)).toBe('Время зала недоступно');
    }
    for (const value of ['not-a-date', '2026-02-30T15:00:00.000Z', '2026-11-06T15:00:00']) {
      expect(formatVenueDateTime(value, 'Europe/Moscow')).toBe('Время зала недоступно');
    }
  });
});
