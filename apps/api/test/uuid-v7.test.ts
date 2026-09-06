import { describe, expect, it } from 'vitest';

import { newUuidV7 } from '../src/uuid-v7.js';

describe('UUIDv7 generation', () => {
  it('encodes the timestamp, version and RFC variant', () => {
    const id = newUuidV7({
      timestamp: 1_725_000_000_000,
      random: Uint8Array.from([0xab, 1, 0xff, 2, 3, 4, 5, 6, 7, 8]),
    });

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id.slice(0, 13).replace('-', '')).toBe('0191a2032200');
  });
});
