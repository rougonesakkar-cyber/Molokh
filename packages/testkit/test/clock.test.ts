import { describe, expect, it } from 'vitest';

import { FixedClock } from '../src/index.js';

describe('FixedClock', () => {
  it('advances deterministically', () => {
    const clock = new FixedClock(new Date('2026-09-04T10:00:00.000Z'));

    clock.advance(60_000);

    expect(clock.now().toISOString()).toBe('2026-09-04T10:01:00.000Z');
  });
});

