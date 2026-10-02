import { describe, expect, it } from 'vitest';

import {
  YouthConsentConflictError,
  YouthConsentValidationError,
  assertYouthConsentCanBeRequested,
  assertYouthConsentDecisionCanBeRecorded,
  assertYouthOfficialConsentReady,
  normalizeGuardianContact,
  normalizeGuardianIdentity,
} from '../src/index.js';

describe('Youth consent policy', () => {
  it('normalizes an e-mail and never needs a guardian account or document', () => {
    expect(normalizeGuardianContact({ channel: 'EMAIL', contact: ' Parent@Example.COM ' })).toEqual({
      normalized: 'parent@example.com',
      masked: 'pa****@example.com',
    });
    expect(normalizeGuardianIdentity({
      guardianDisplayName: '  Анна   Соколова ',
      relationship: ' мать ',
    })).toEqual({ guardianDisplayName: 'Анна Соколова', relationship: 'мать' });
  });

  it('requires explicit opt-in before SMS can be used', () => {
    expect(() => normalizeGuardianContact({ channel: 'SMS', contact: '+79990000000' }))
      .toThrowError(new YouthConsentConflictError('YOUTH_CONSENT_SMS_OPT_IN_REQUIRED'));
    expect(normalizeGuardianContact({ channel: 'SMS', contact: '+7 (999) 000-00-00', smsOptIn: true }))
      .toEqual({ normalized: '+79990000000', masked: '+79*******00' });
  });

  it('opens requests only for a Youth participant while the feature and response window are active', () => {
    const base = {
      featureEnabled: true,
      challengeState: 'AWAITING_RESPONSE',
      actorIsParticipant: true,
      actorAgeDivision: 'YOUTH' as const,
      expiresAt: new Date('2026-10-03T10:00:00.000Z'),
      occurredAt: new Date('2026-10-02T10:00:00.000Z'),
    };
    expect(() => assertYouthConsentCanBeRequested(base)).not.toThrow();
    expect(() => assertYouthConsentCanBeRequested({ ...base, featureEnabled: false }))
      .toThrowError(new YouthConsentConflictError('YOUTH_OFFICIAL_DISABLED'));
    expect(() => assertYouthConsentCanBeRequested({ ...base, actorAgeDivision: 'ADULT' }))
      .toThrowError(new YouthConsentConflictError('YOUTH_CONSENT_SUBJECT_REQUIRED'));
  });

  it('requires declared guardian identity and explicit text acceptance for grant', () => {
    expect(() => assertYouthConsentDecisionCanBeRecorded({
      state: 'PENDING', decision: 'GRANT', consentTextAccepted: false,
      expiresAt: new Date('2026-10-03T10:00:00.000Z'),
      occurredAt: new Date('2026-10-02T10:00:00.000Z'),
    })).toThrowError(new YouthConsentValidationError('consentTextAccepted'));
    expect(() => assertYouthConsentDecisionCanBeRecorded({
      state: 'PENDING', decision: 'GRANT', consentTextAccepted: true,
      expiresAt: new Date('2026-10-03T10:00:00.000Z'),
      occurredAt: new Date('2026-10-02T10:00:00.000Z'),
    })).not.toThrow();
  });

  it('allows revocation only after grant and before expiry', () => {
    const base = {
      decision: 'REVOKE' as const,
      expiresAt: new Date('2026-10-03T10:00:00.000Z'),
      occurredAt: new Date('2026-10-02T10:00:00.000Z'),
    };
    expect(() => assertYouthConsentDecisionCanBeRecorded({ ...base, state: 'GRANTED' })).not.toThrow();
    expect(() => assertYouthConsentDecisionCanBeRecorded({ ...base, state: 'PENDING' }))
      .toThrowError(new YouthConsentConflictError('YOUTH_CONSENT_INVALID_STATE'));
  });

  it('requires one independent grant for every Youth athlete (AC-055, AC-169)', () => {
    expect(() => assertYouthOfficialConsentReady({
      featureEnabled: true, youthParticipantCount: 2, grantedConsentCount: 2,
    })).not.toThrow();
    expect(() => assertYouthOfficialConsentReady({
      featureEnabled: true, youthParticipantCount: 2, grantedConsentCount: 1,
    })).toThrowError(new YouthConsentConflictError('YOUTH_CONSENT_REQUIRED'));
    expect(() => assertYouthOfficialConsentReady({
      featureEnabled: false, youthParticipantCount: 2, grantedConsentCount: 2,
    })).toThrowError(new YouthConsentConflictError('YOUTH_OFFICIAL_DISABLED'));
    expect(() => assertYouthOfficialConsentReady({
      featureEnabled: false, youthParticipantCount: 0, grantedConsentCount: 0,
    })).not.toThrow();
  });
});
