import { describe, expect, it } from 'vitest';

import {
  VersionConflictError,
  assertExpectedVersion,
  nextAggregateVersion,
} from '../src/index.js';

describe('aggregate concurrency primitives', () => {
  it('accepts the canonical expected version', () => {
    expect(() => assertExpectedVersion(7, 7)).not.toThrow();
    expect(nextAggregateVersion(7)).toBe(8);
  });

  it('rejects stale commands with a stable code', () => {
    expect(() => assertExpectedVersion(8, 7)).toThrowError(VersionConflictError);

    try {
      assertExpectedVersion(8, 7);
    } catch (error) {
      expect(error).toMatchObject({
        code: 'VERSION_CONFLICT',
        expectedVersion: 7,
        actualVersion: 8,
      });
    }
  });
});

