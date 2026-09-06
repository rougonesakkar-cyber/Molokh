import { describe, expect, it } from 'vitest';

import {
  MinimumAgeNotMetError,
  InvalidIdentityTransitionError,
  activateIdentity,
  approveVerificationState,
  deriveAgeDivision,
  normalizeDisplayName,
  normalizeChecklistVersion,
  projectIdentityCapabilities,
  startVerificationState,
} from '../src/identity.js';

const now = new Date('2026-09-06T12:00:00.000Z');

describe('identity rules', () => {
  it('rejects activation below 14 and separates Youth from Adult at date boundaries', () => {
    expect(() => deriveAgeDivision('2013-09-07', now)).toThrow(MinimumAgeNotMetError);
    expect(deriveAgeDivision('2012-09-06', now)).toBe('YOUTH');
    expect(deriveAgeDivision('2008-09-06', now)).toBe('ADULT');
  });

  it('accepts arbitrary non-empty display names without legal-name semantics', () => {
    expect(normalizeDisplayName('  Номер Один 🥊  ')).toBe('Номер Один 🥊');
    expect(() => normalizeDisplayName('   ')).toThrow('displayName');
  });

  it('validates and normalizes activation input', () => {
    expect(
      activateIdentity(
        {
          userId: '0199a1b2-1234-7000-8000-000000000101',
          phoneE164: '+79990000001',
          phoneVerifiedAt: '2026-09-06T10:00:00+03:00',
          birthDate: '1995-04-12',
          displayName: ' Athlete ',
          locale: 'ru-RU',
          primarySport: 'BOXING',
          secondarySport: null,
          discoveryRadiusKm: 15,
        },
        now,
      ),
    ).toMatchObject({
      ageDivision: 'ADULT',
      displayName: 'Athlete',
      phoneVerifiedAt: '2026-09-06T07:00:00.000Z',
    });
  });

  it('rejects a phone verification timestamp from the future', () => {
    expect(() =>
      activateIdentity(
        {
          userId: '0199a1b2-1234-7000-8000-000000000101',
          phoneE164: '+79990000001',
          phoneVerifiedAt: '2026-09-06T12:00:01.000Z',
          birthDate: '1995-04-12',
          displayName: 'Athlete',
          locale: 'ru-RU',
          primarySport: 'BOXING',
          secondarySport: null,
          discoveryRadiusKm: 15,
        },
        now,
      ),
    ).toThrow('phoneVerifiedAt');
  });

  it('allows Social and ordinary Training before Central verification', () => {
    const projection = projectIdentityCapabilities({
      userId: '0199a1b2-1234-7000-8000-000000000101',
      displayName: 'Athlete',
      ageDivision: 'ADULT',
      accountState: 'ACTIVE',
      phoneVerified: true,
      accountVerificationState: 'NOT_STARTED',
      primarySport: 'BOXING',
      secondarySport: null,
      discoveryRadiusKm: 15,
      version: 1,
    });

    expect(projection.capabilities).toEqual([
      'USE_DISCOVERY',
      'EDIT_PROFILE',
      'BOOK_ORDINARY_TRAINING',
    ]);
    expect(projection.capabilityDenials).toEqual([
      {
        capability: 'ACCOUNT_VERIFIED',
        code: 'ACCOUNT_NOT_VERIFIED',
        messageKey: 'identity.account_not_verified',
        retryable: true,
      },
    ]);
  });

  it('moves verification only through V-01 and V-02 with an opaque checklist version', () => {
    expect(normalizeChecklistVersion(' identity-v1 ')).toBe('identity-v1');
    expect(
      startVerificationState({
        currentState: 'NOT_STARTED',
        accountState: 'ACTIVE',
        phoneVerified: true,
      }),
    ).toBe('PENDING');
    expect(
      approveVerificationState({
        currentState: 'PENDING',
        accountState: 'ACTIVE',
        phoneVerified: true,
        moderationChecksPassed: true,
      }),
    ).toBe('VERIFIED');
    expect(() =>
      approveVerificationState({
        currentState: 'VERIFIED',
        accountState: 'ACTIVE',
        phoneVerified: true,
        moderationChecksPassed: true,
      }),
    ).toThrow(InvalidIdentityTransitionError);
    expect(() =>
      startVerificationState({
        currentState: 'NOT_STARTED',
        accountState: 'RESTRICTED',
        phoneVerified: true,
      }),
    ).toThrow(InvalidIdentityTransitionError);
  });
});
