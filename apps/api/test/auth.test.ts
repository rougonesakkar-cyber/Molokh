import { describe, expect, it } from 'vitest';

import { DatabaseBearerAuthAdapter, hashBearerToken } from '../src/auth.js';

describe('database bearer authentication', () => {
  it('accepts full sessions and limits a pre-change session to service responses', async () => {
    const token = 'opaque-access-token-with-enough-entropy';
    const seenHashes: string[] = [];
    const restricted = new DatabaseBearerAuthAdapter(async (tokenHash) => {
      seenHashes.push(tokenHash);
      return { userId: '0199a1b2-1234-7000-8000-000000000101',
        familyId: '0199a1b2-1234-7000-8000-000000002001', familyVersion: 2,
        accessMode: 'SERVICE_RESPONSE_ONLY' };
    });
    await expect(restricted.authenticate(`Bearer ${token}`)).resolves.toBeNull();
    await expect(restricted.authenticate(`Bearer ${token}`, 'SERVICE_RESPONSE'))
      .resolves.toMatchObject({ accessMode: 'SERVICE_RESPONSE_ONLY', familyVersion: 2 });
    expect(seenHashes).toEqual([hashBearerToken(token), hashBearerToken(token)]);
  });
});
