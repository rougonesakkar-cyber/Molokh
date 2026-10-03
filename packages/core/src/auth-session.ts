export const AUTH_SESSION_POLICY_VERSION = 'auth-session-mvp-v1' as const;

export const AUTH_OTP_TTL_MINUTES = 10;
export const AUTH_OTP_MAX_ATTEMPTS = 5;
export const AUTH_ACCESS_TOKEN_TTL_MINUTES = 15;
export const AUTH_REFRESH_TOKEN_TTL_DAYS = 30;

export type AuthOtpTransport = 'LOCAL_DEVELOPMENT' | 'SMS_OPT_IN';
export type AuthOtpChallengeState = 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'LOCKED';
export type AuthSessionFamilyState = 'ACTIVE' | 'REVOKED';
export type AuthRefreshTokenState = 'ACTIVE' | 'ROTATED' | 'REVOKED' | 'EXPIRED';
export type AuthAccessMode = 'FULL' | 'SERVICE_RESPONSE_ONLY';

export type AuthSessionConflictCode =
  | 'AUTH_PHONE_INVALID'
  | 'AUTH_ACCOUNT_NOT_ACTIVE'
  | 'AUTH_TRANSPORT_UNAVAILABLE'
  | 'AUTH_SMS_OPT_IN_REQUIRED'
  | 'AUTH_OTP_INVALID_STATE'
  | 'AUTH_OTP_EXPIRED'
  | 'AUTH_OTP_ATTEMPTS_EXHAUSTED'
  | 'AUTH_SESSION_INVALID_STATE'
  | 'AUTH_REFRESH_EXPIRED'
  | 'AUTH_REFRESH_REUSE_DETECTED';

export class AuthSessionConflictError extends Error {
  constructor(readonly code: AuthSessionConflictCode) {
    super(`Authentication session action is not allowed: ${code}`);
    this.name = 'AuthSessionConflictError';
  }
}

function assertValidDate(value: Date, field: string): void {
  if (!Number.isFinite(value.getTime())) throw new RangeError(`${field} must be a valid date`);
}

function addDuration(value: Date, milliseconds: number, field: string): Date {
  assertValidDate(value, field);
  return new Date(value.getTime() + milliseconds);
}

export function authOtpExpiresAt(issuedAt: Date): Date {
  return addDuration(issuedAt, AUTH_OTP_TTL_MINUTES * 60 * 1_000, 'issuedAt');
}

export function authAccessTokenExpiresAt(issuedAt: Date): Date {
  return addDuration(issuedAt, AUTH_ACCESS_TOKEN_TTL_MINUTES * 60 * 1_000, 'issuedAt');
}

export function authRefreshTokenExpiresAt(issuedAt: Date): Date {
  return addDuration(issuedAt, AUTH_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1_000, 'issuedAt');
}

export function assertAuthOtpCanBeRequested(input: {
  readonly phoneE164: string;
  readonly accountState: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
  readonly transport: AuthOtpTransport;
  readonly localDevelopmentTransportEnabled: boolean;
  readonly smsTransportAvailable: boolean;
  readonly smsOptedIn: boolean;
}): void {
  if (!/^\+[1-9]\d{7,14}$/.test(input.phoneE164)) {
    throw new AuthSessionConflictError('AUTH_PHONE_INVALID');
  }
  if (input.accountState !== 'ACTIVE') {
    throw new AuthSessionConflictError('AUTH_ACCOUNT_NOT_ACTIVE');
  }
  if (input.transport === 'LOCAL_DEVELOPMENT') {
    if (!input.localDevelopmentTransportEnabled) {
      throw new AuthSessionConflictError('AUTH_TRANSPORT_UNAVAILABLE');
    }
    return;
  }
  if (!input.smsOptedIn) {
    throw new AuthSessionConflictError('AUTH_SMS_OPT_IN_REQUIRED');
  }
  if (!input.smsTransportAvailable) {
    throw new AuthSessionConflictError('AUTH_TRANSPORT_UNAVAILABLE');
  }
}

export function assertAuthOtpCanBeVerified(input: {
  readonly state: AuthOtpChallengeState;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly expiresAt: Date;
  readonly occurredAt: Date;
}): void {
  if (input.state !== 'PENDING') {
    throw new AuthSessionConflictError('AUTH_OTP_INVALID_STATE');
  }
  if (!Number.isInteger(input.attempts) || !Number.isInteger(input.maxAttempts)
    || input.attempts < 0 || input.maxAttempts < 1 || input.attempts >= input.maxAttempts) {
    throw new AuthSessionConflictError('AUTH_OTP_ATTEMPTS_EXHAUSTED');
  }
  assertValidDate(input.expiresAt, 'expiresAt');
  assertValidDate(input.occurredAt, 'occurredAt');
  if (input.occurredAt >= input.expiresAt) {
    throw new AuthSessionConflictError('AUTH_OTP_EXPIRED');
  }
}

export function assertAuthSessionCanBeRotated(input: {
  readonly familyState: AuthSessionFamilyState;
  readonly refreshTokenState: AuthRefreshTokenState;
  readonly refreshExpiresAt: Date;
  readonly occurredAt: Date;
}): void {
  if (input.familyState !== 'ACTIVE') {
    throw new AuthSessionConflictError('AUTH_SESSION_INVALID_STATE');
  }
  if (input.refreshTokenState === 'ROTATED' || input.refreshTokenState === 'REVOKED') {
    throw new AuthSessionConflictError('AUTH_REFRESH_REUSE_DETECTED');
  }
  if (input.refreshTokenState !== 'ACTIVE') {
    throw new AuthSessionConflictError('AUTH_SESSION_INVALID_STATE');
  }
  assertValidDate(input.refreshExpiresAt, 'refreshExpiresAt');
  assertValidDate(input.occurredAt, 'occurredAt');
  if (input.occurredAt >= input.refreshExpiresAt) {
    throw new AuthSessionConflictError('AUTH_REFRESH_EXPIRED');
  }
}

export function deriveAuthAccessMode(input: {
  readonly sensitiveHoldActive: boolean;
  readonly trustedAt: Date;
  readonly holdStartedAt: Date | null;
}): AuthAccessMode {
  assertValidDate(input.trustedAt, 'trustedAt');
  if (!input.sensitiveHoldActive || input.holdStartedAt === null) return 'FULL';
  assertValidDate(input.holdStartedAt, 'holdStartedAt');
  return input.trustedAt <= input.holdStartedAt ? 'SERVICE_RESPONSE_ONLY' : 'FULL';
}
