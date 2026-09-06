import { describe, expect, it } from 'vitest';

import {
  MinimumAgeNotMetError,
  activateIdentity,
  deriveAgeDivision,
  normalizeDisplayName,
  projectIdentityCapabilities,
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
        capability: 'CREATE_OFFICIAL_CHALLENGE',
        code: 'ACCOUNT_NOT_VERIFIED',
        messageKey: 'identity.account_not_verified',
        retryable: true,
      },
    ]);
  });
});
