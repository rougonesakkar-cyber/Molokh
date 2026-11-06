import type { AuthSessionTokens, VerifyAuthOtpResponse } from '@molokh/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-secure-store', () => storage);
vi.mock('./api', () => ({ requireApiUrl: () => 'http://localhost:3000',
  apiErrorMessage: async () => 'VERSION_CONFLICT' }));

import { requestAuthOtp, verifyAuthOtp } from './auth-session';

const challenge = { challengeId: '0199a1b2-1234-7000-8000-000000002001',
  transport: 'LOCAL_DEVELOPMENT' as const, state: 'PENDING' as const,
  attempts: 0, maxAttempts: 5 as const, expiresAt: '2026-11-03T10:10:00.000Z', version: 1 };
const session: AuthSessionTokens = { userId: '0199a1b2-1234-7000-8000-000000000101',
  familyId: '0199a1b2-1234-7000-8000-000000002002', generation: 1, tokenType: 'Bearer',
  accessToken: 'test-access-token-with-at-least-32-characters',
  refreshToken: 'test-refresh-token-with-at-least-32-characters', accessMode: 'FULL',
  accessExpiresAt: '2026-11-03T10:17:00.000Z', refreshExpiresAt: '2026-12-03T10:02:00.000Z' };
const meta = { requestId: '0199a1b2-1234-7000-8000-000000002003',
  eventId: '0199a1b2-1234-7000-8000-000000002004', replayed: false };
const input = { challengeId: challenge.challengeId, challengeVersion: 1,
  code: '000000', deviceLabel: 'Test client' };

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data, meta }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

describe('managed OTP recovery', () => {
  beforeEach(() => { vi.stubGlobal('__DEV__', true); vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('returns the canonical challenge after a wrong code, then verifies its updated version', async () => {
    const invalid: VerifyAuthOtpResponse['data'] = { outcome: 'INVALID_CODE', session: null,
      challenge: { ...challenge, attempts: 1, version: 2 } };
    const verified: VerifyAuthOtpResponse['data'] = { outcome: 'VERIFIED', session,
      challenge: { ...invalid.challenge, state: 'VERIFIED', version: 3 } };
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ ...challenge, developmentCode: '123456' }))
      .mockResolvedValueOnce(jsonResponse(invalid))
      .mockResolvedValueOnce(jsonResponse(verified));

    const requested = await requestAuthOtp('+79990000001');
    expect(requested.data).toMatchObject({ state: 'PENDING', version: 1 });
    const rejected = await verifyAuthOtp({ ...input, challengeVersion: requested.data.version });
    expect(rejected).toEqual(invalid);
    expect(storage.setItemAsync).not.toHaveBeenCalled();
    expect(storage.deleteItemAsync).not.toHaveBeenCalled();

    const accepted = await verifyAuthOtp({ ...input, challengeId: rejected.challenge.challengeId,
      challengeVersion: rejected.challenge.version, code: requested.data.developmentCode! });
    expect(accepted).toEqual(verified);
    expect(JSON.parse(fetchSpy.mock.calls[2]![1]!.body as string)).toMatchObject({
      challengeId: challenge.challengeId, challengeVersion: 2, code: '123456', clientKind: 'NATIVE',
    });
    expect(storage.setItemAsync).toHaveBeenCalledExactlyOnceWith(
      'molokh.auth.refresh-token', session.refreshToken);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls.every((call) => call[1]?.credentials === 'include')).toBe(true);
  });

  it.each(['EXPIRED', 'LOCKED'] as const)('preserves %s without persisting tokens', async (outcome) => {
    const data: VerifyAuthOtpResponse['data'] = { outcome, session: null,
      challenge: { ...challenge, state: outcome, attempts: outcome === 'LOCKED' ? 5 : 1, version: 2 } };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(data));
    await expect(verifyAuthOtp(input)).resolves.toEqual(data);
    expect(storage.setItemAsync).not.toHaveBeenCalled();
    expect(storage.deleteItemAsync).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not persist even an unexpected session on a non-VERIFIED outcome', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
      outcome: 'INVALID_CODE', challenge: { ...challenge, version: 2 }, session,
    }));
    await expect(verifyAuthOtp(input)).resolves.toMatchObject({ outcome: 'INVALID_CODE' });
    expect(storage.setItemAsync).not.toHaveBeenCalled();
  });

  it('propagates VERSION_CONFLICT without guessing a version or retrying', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 409 }));
    await expect(verifyAuthOtp(input)).rejects.toThrow('VERSION_CONFLICT');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(storage.setItemAsync).not.toHaveBeenCalled();
    expect(storage.deleteItemAsync).not.toHaveBeenCalled();
  });
});
