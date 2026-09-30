import { describe, expect, it } from 'vitest';

import { idempotentResourceId, idempotentUuidV7, newUuidV7 } from '../src/uuid-v7.js';

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

describe('idempotent resource identity', () => {
  it('returns a stable RFC name-based UUID without exposing the key', () => {
    const first = idempotentResourceId('AccountVerification', 'USER-1', 'retry-key');
    const replay = idempotentResourceId('AccountVerification', 'USER-1', 'retry-key');
    const different = idempotentResourceId('AccountVerification', 'USER-1', 'other-key');

    expect(first).toBe(replay);
    expect(first).not.toBe(different);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first).not.toContain('retry-key');
  });

  it('derives a stable UUIDv7 from a retry key with an action timestamp', () => {
    const timestamp = 1_790_000_000_000;
    const key = `status-queue:join:competition:${timestamp.toString(36)}`;
    const first = idempotentUuidV7('ChallengeQueueEntry', 'USER-1', key);
    const replay = idempotentUuidV7('ChallengeQueueEntry', 'USER-1', key);

    expect(first).toBe(replay);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first.slice(0, 13).replace('-', '')).toBe(timestamp.toString(16).padStart(12, '0'));
  });
});
