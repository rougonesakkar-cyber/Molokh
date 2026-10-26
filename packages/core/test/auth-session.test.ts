import { describe, expect, it } from 'vitest';

import {
  AuthSessionConflictError,
  assertAuthOtpCanBeRequested,
  assertAuthOtpCanBeVerified,
  assertAuthSessionCanBeRotated,
  authAccessTokenExpiresAt,
  authOtpExpiresAt,
  authRefreshTokenExpiresAt,
  deriveAuthAccessMode,
} from '../src/auth-session.js';

describe('authentication session policy', () => {
  it('keeps local OTP development-only and SMS explicitly opt-in', () => {
    const base = { phoneE164: '+79990000101', accountState: 'ACTIVE' as const,
      localDevelopmentTransportEnabled: true, smsTransportAvailable: false, smsOptedIn: false };
    expect(() => assertAuthOtpCanBeRequested({ ...base, transport: 'LOCAL_DEVELOPMENT' }))
      .not.toThrow();
    expect(() => assertAuthOtpCanBeRequested({ ...base, transport: 'SMS_OPT_IN' }))
      .toThrowError(expect.objectContaining<Partial<AuthSessionConflictError>>({
        code: 'AUTH_SMS_OPT_IN_REQUIRED',
      }));
    expect(() => assertAuthOtpCanBeRequested({ ...base, transport: 'LOCAL_DEVELOPMENT',
      localDevelopmentTransportEnabled: false }))
      .toThrowError(expect.objectContaining<Partial<AuthSessionConflictError>>({
        code: 'AUTH_TRANSPORT_UNAVAILABLE',
      }));
  });

  it('uses bounded OTP, access and refresh lifetimes', () => {
    const issuedAt = new Date('2026-10-04T10:00:00.000Z');
    expect(authOtpExpiresAt(issuedAt).toISOString()).toBe('2026-10-04T10:10:00.000Z');
    expect(authAccessTokenExpiresAt(issuedAt).toISOString()).toBe('2026-10-04T10:15:00.000Z');
    expect(authRefreshTokenExpiresAt(issuedAt).toISOString()).toBe('2026-11-03T10:00:00.000Z');
  });

  it('rejects expired OTPs, exhausted attempts and refresh-token reuse', () => {
    const expiresAt = new Date('2026-10-04T10:10:00.000Z');
    expect(() => assertAuthOtpCanBeVerified({ state: 'PENDING', attempts: 0,
      maxAttempts: 5, expiresAt, occurredAt: new Date('2026-10-04T10:09:59.999Z') }))
      .not.toThrow();
    expect(() => assertAuthOtpCanBeVerified({ state: 'PENDING', attempts: 5,
      maxAttempts: 5, expiresAt, occurredAt: new Date('2026-10-04T10:09:00.000Z') }))
      .toThrowError(expect.objectContaining<Partial<AuthSessionConflictError>>({
        code: 'AUTH_OTP_ATTEMPTS_EXHAUSTED',
      }));
    expect(() => assertAuthSessionCanBeRotated({ familyState: 'ACTIVE',
      refreshTokenState: 'ROTATED', refreshExpiresAt: new Date('2026-11-03T10:00:00.000Z'),
      occurredAt: new Date('2026-10-04T10:10:00.000Z') }))
      .toThrowError(expect.objectContaining<Partial<AuthSessionConflictError>>({
        code: 'AUTH_REFRESH_REUSE_DETECTED',
      }));
  });

  it('restricts a pre-change trusted session during the 24-hour security hold', () => {
    const holdStartedAt = new Date('2026-10-04T10:00:00.000Z');
    expect(deriveAuthAccessMode({ sensitiveHoldActive: true,
      trustedAt: new Date('2026-10-03T10:00:00.000Z'), holdStartedAt }))
      .toBe('SERVICE_RESPONSE_ONLY');
    expect(deriveAuthAccessMode({ sensitiveHoldActive: false,
      trustedAt: new Date('2026-10-03T10:00:00.000Z'), holdStartedAt }))
      .toBe('FULL');
  });
});
