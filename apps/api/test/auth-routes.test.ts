import { VersionConflictError, type CommandEnvelope } from '@molokh/core';
import type { ExecutedCommand } from '@molokh/db';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AuthAdapter } from '../src/auth.js';

const secret = 'test-auth-session-secret-with-at-least-32-bytes';
const userId = '0199a1b2-1234-7000-8000-000000000101';
const familyId = '0199a1b2-1234-7000-8000-000000002001';
const accessTokenId = '0199a1b2-1234-7000-8000-000000002002';
const refreshTokenId = '0199a1b2-1234-7000-8000-000000002003';
const eventId = '0199a1b2-1234-7000-8000-000000002004';

function executed<T>(response: T, status = 200): ExecutedCommand<T> {
  return { responseStatus: status, response, eventId, aggregateVersion: 1, replayed: false };
}

describe('authentication session routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('requests and verifies local OTP, rotates tokens and logs out without exposing secrets', async () => {
    const commands: CommandEnvelope<unknown>[] = [];
    const verifierHashes: string[] = [];
    const managedAuth: AuthAdapter = { authenticate: async () => ({ userId,
      familyId, familyVersion: 2, accessMode: 'FULL' }) };
    const app = await buildApp({ authentication: {
      auth: managedAuth,
      secret,
      localDevelopmentTransportEnabled: true,
      smsTransportAvailable: false,
      secureCookies: false,
      requestOtp: async (command, _ids, verifierHash) => {
        commands.push(command); verifierHashes.push(verifierHash);
        return executed({ challengeId: command.aggregateId, userId,
          phoneE164: command.payload.phoneE164, transport: command.payload.transport,
          state: 'PENDING', attempts: 0, maxAttempts: 5,
          expiresAt: '2026-10-04T10:10:00.000Z', version: 1 }, 202);
      },
      verifyOtp: async (command, _ids, hashes) => {
        commands.push(command); verifierHashes.push(hashes.suppliedCodeVerifierHash,
          hashes.accessTokenHash, hashes.refreshTokenHash, hashes.sessionReferenceHash);
        return executed({ outcome: 'VERIFIED', challenge: {
          challengeId: command.payload.challengeId, userId, phoneE164: '+79990000001',
          transport: 'LOCAL_DEVELOPMENT', state: 'VERIFIED', attempts: 0,
          maxAttempts: 5, expiresAt: '2026-10-04T10:10:00.000Z', version: 2,
        }, session: { userId, familyId, accessTokenId, refreshTokenId,
          generation: 1, accessExpiresAt: '2026-10-04T10:17:00.000Z',
          refreshExpiresAt: '2026-11-03T10:02:00.000Z' } });
      },
      readRefreshContext: async () => ({ userId, familyId, familyState: 'ACTIVE',
        familyVersion: 1, refreshTokenId, refreshTokenState: 'ACTIVE', generation: 1,
        refreshExpiresAt: '2026-11-03T10:02:00.000Z' }),
      rotateSession: async (command, _ids, hashes) => {
        commands.push(command); verifierHashes.push(hashes.currentRefreshTokenHash,
          hashes.nextAccessTokenHash, hashes.nextRefreshTokenHash);
        return executed({ userId, familyId, accessTokenId, refreshTokenId,
          generation: 2, accessExpiresAt: '2026-10-04T10:20:00.000Z',
          refreshExpiresAt: '2026-11-03T10:05:00.000Z' });
      },
      revokeSession: async (command) => {
        commands.push(command);
        return executed({ familyId, state: 'REVOKED' });
      },
    } });
    apps.push(app);

    const requested = await app.inject({ method: 'POST', url: '/api/v1/auth/otp/request',
      headers: { 'idempotency-key': 'request-login-1' },
      payload: { phoneE164: '+79990000001', transport: 'LOCAL_DEVELOPMENT', smsOptIn: false } });
    expect(requested.statusCode).toBe(202);
    const requestBody = requested.json();
    expect(requestBody.data).toMatchObject({ state: 'PENDING', version: 1 });
    expect(requestBody.data.developmentCode).toMatch(/^[0-9]{6}$/);
    expect(commands[0]).toMatchObject({ commandType: 'REQUEST_AUTH_OTP', expectedVersion: 0,
      payload: { phoneE164: '+79990000001', localDevelopmentTransportEnabled: true,
        smsOptedIn: false } });
    expect(verifierHashes[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(verifierHashes[0]).not.toContain(requestBody.data.developmentCode);

    const verified = await app.inject({ method: 'POST', url: '/api/v1/auth/otp/verify',
      headers: { 'idempotency-key': 'verify-login-1' }, payload: {
        challengeId: requestBody.data.challengeId, challengeVersion: 1,
        code: requestBody.data.developmentCode, clientKind: 'NATIVE',
        deviceLabel: 'Pilot browser',
      } });
    expect(verified.statusCode).toBe(200);
    const verifiedBody = verified.json();
    expect(verifiedBody.data).toMatchObject({ outcome: 'VERIFIED', session: {
      familyId, generation: 1, tokenType: 'Bearer', accessMode: 'FULL',
    } });
    expect(verifiedBody.data.session.accessToken).toHaveLength(43);
    expect(verifiedBody.data.session.refreshToken).toHaveLength(43);
    expect(JSON.stringify(commands)).not.toContain(verifiedBody.data.session.accessToken);
    expect(JSON.stringify(commands)).not.toContain(verifiedBody.data.session.refreshToken);

    const webVerified = await app.inject({ method: 'POST', url: '/api/v1/auth/otp/verify',
      headers: { 'idempotency-key': 'verify-login-web-1' }, payload: {
        challengeId: requestBody.data.challengeId, challengeVersion: 1,
        code: requestBody.data.developmentCode, clientKind: 'WEB',
        deviceLabel: 'Pilot web browser',
      } });
    expect(webVerified.statusCode).toBe(200);
    expect(webVerified.json().data.session.refreshToken).toBeNull();
    const rawWebCookie = webVerified.headers['set-cookie'];
    const webCookie = Array.isArray(rawWebCookie) ? rawWebCookie[0] : rawWebCookie;
    expect(webCookie).toContain('molokh_refresh=');
    expect(webCookie).toContain('HttpOnly');
    expect(webCookie).toContain('SameSite=Lax');
    const webRefreshed = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh',
      headers: { 'idempotency-key': 'refresh-login-web-1',
        cookie: webCookie!.split(';')[0]! }, payload: { clientKind: 'WEB' } });
    expect(webRefreshed.statusCode).toBe(200);
    expect(webRefreshed.json().data.refreshToken).toBeNull();
    expect(webRefreshed.headers['set-cookie']).toContain('HttpOnly');

    const refreshed = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh',
      headers: { 'idempotency-key': 'refresh-login-1' },
      payload: { clientKind: 'NATIVE', refreshToken: verifiedBody.data.session.refreshToken } });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().data).toMatchObject({ familyId, generation: 2,
      tokenType: 'Bearer' });
    expect(commands.at(-1)).toMatchObject({ commandType: 'ROTATE_AUTH_SESSION',
      expectedVersion: 1, payload: { familyId, generation: 1 } });

    const loggedOut = await app.inject({ method: 'POST', url: '/api/v1/auth/logout',
      headers: { authorization: `Bearer ${verifiedBody.data.session.accessToken}`,
        'idempotency-key': 'logout-login-1' } });
    expect(loggedOut.statusCode).toBe(200);
    expect(loggedOut.json().data).toEqual({ familyId, state: 'REVOKED' });
    expect(commands.at(-1)).toMatchObject({ commandType: 'REVOKE_AUTH_SESSION',
      expectedVersion: 2, payload: { reason: 'LOGOUT' } });

    const paths = app.swagger().paths;
    expect(paths).toHaveProperty('/api/v1/auth/otp/request');
    expect(paths).toHaveProperty('/api/v1/auth/otp/verify');
    expect(paths).toHaveProperty('/api/v1/auth/refresh');
    expect(paths).toHaveProperty('/api/v1/auth/logout');
  });

  it('revokes the whole family when a rotated refresh token is reused with a new key', async () => {
    let revokedReason: string | null = null;
    const unavailable = async (): Promise<never> => { throw new Error('not used'); };
    const app = await buildApp({ authentication: {
      auth: { authenticate: async () => null }, secret,
      localDevelopmentTransportEnabled: true, smsTransportAvailable: false,
      secureCookies: false,
      requestOtp: unavailable,
      verifyOtp: unavailable,
      readRefreshContext: async () => ({ userId, familyId, familyState: 'ACTIVE',
        familyVersion: 2, refreshTokenId, refreshTokenState: 'ROTATED', generation: 1,
        refreshExpiresAt: '2026-11-03T10:02:00.000Z' }),
      rotateSession: async () => { throw new VersionConflictError(1, 2); },
      revokeSession: async (command) => {
        revokedReason = command.payload.reason;
        return executed({ familyId, state: 'REVOKED' });
      },
    } });
    apps.push(app);
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh',
      headers: { 'idempotency-key': 'attacker-reuse-key' },
      payload: { clientKind: 'NATIVE',
        refreshToken: 'rotated-refresh-token-with-enough-entropy' } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'AUTH_REFRESH_REUSE_DETECTED' });
    expect(revokedReason).toBe('REFRESH_REUSE');
  });
});
