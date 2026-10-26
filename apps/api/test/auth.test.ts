import { describe, expect, it } from 'vitest';

import {
  AuthorizedAuthAdapter,
  DatabaseBearerAuthAdapter,
  hashBearerToken,
} from '../src/auth.js';

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

  it('rechecks current role authorization after authenticating the session', async () => {
    const authenticated = { userId: '0199a1b2-1234-7000-8000-000000000101' as const,
      familyId: '0199a1b2-1234-7000-8000-000000002001', familyVersion: 3,
      accessMode: 'FULL' as const };
    const delegate = { authenticate: async () => authenticated };
    let roleActive = true;
    const roleAware = new AuthorizedAuthAdapter(delegate, async (session) =>
      roleActive && session.userId === authenticated.userId);
    await expect(roleAware.authenticate('Bearer opaque')).resolves.toEqual(authenticated);
    roleActive = false;
    await expect(roleAware.authenticate('Bearer opaque')).resolves.toBeNull();
  });
});
