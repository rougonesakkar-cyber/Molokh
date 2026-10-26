export const YOUTH_CONSENT_POLICY_VERSION = 'youth-consent-mvp-v1' as const;

export type YouthConsentState = 'PENDING' | 'GRANTED' | 'DECLINED' | 'REVOKED' | 'EXPIRED';
export type YouthConsentChannel = 'EMAIL' | 'SMS';
export type YouthConsentDecision = 'GRANT' | 'DECLINE' | 'REVOKE';

export type YouthConsentConflictCode =
  | 'YOUTH_OFFICIAL_DISABLED'
  | 'YOUTH_CONSENT_NOT_FOUND'
  | 'YOUTH_CONSENT_REQUIRED'
  | 'YOUTH_CONSENT_SUBJECT_REQUIRED'
  | 'YOUTH_CONSENT_INVALID_STATE'
  | 'YOUTH_CONSENT_TOKEN_INVALID'
  | 'YOUTH_CONSENT_EXPIRED'
  | 'YOUTH_CONSENT_CHANNEL_NOT_VERIFIED'
  | 'YOUTH_CONSENT_SMS_OPT_IN_REQUIRED';

export class YouthConsentConflictError extends Error {
  readonly code: YouthConsentConflictCode;

  constructor(readonly reason: YouthConsentConflictCode) {
    super(`Youth consent action is not allowed: ${reason}`);
    this.name = 'YouthConsentConflictError';
    this.code = reason;
  }
}

export class YouthConsentValidationError extends Error {
  readonly code = 'YOUTH_CONSENT_VALIDATION_FAILED';

  constructor(readonly field: string) {
    super(`Youth consent field ${field} is invalid`);
    this.name = 'YouthConsentValidationError';
  }
}

function assertValidDate(value: Date, field: string): void {
  if (!Number.isFinite(value.getTime())) throw new YouthConsentValidationError(field);
}

export function normalizeGuardianContact(input: {
  readonly channel: YouthConsentChannel;
  readonly contact: string;
  readonly smsOptIn?: boolean;
}): { readonly normalized: string; readonly masked: string } {
  const candidate = input.contact.trim();
  if (input.channel === 'EMAIL') {
    const normalized = candidate.toLowerCase();
    const match = normalized.match(/^([^@\s]+)@([^@\s]+\.[^@\s]+)$/);
    if (!match) throw new YouthConsentValidationError('guardianContact');
    const local = match[1]!;
    const maskedLocal = local.length <= 2
      ? `${local[0] ?? '*'}*`
      : `${local.slice(0, 2)}${'*'.repeat(Math.min(6, local.length - 2))}`;
    return { normalized, masked: `${maskedLocal}@${match[2]}` };
  }

  if (input.smsOptIn !== true) {
    throw new YouthConsentConflictError('YOUTH_CONSENT_SMS_OPT_IN_REQUIRED');
  }
  const normalized = candidate.replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new YouthConsentValidationError('guardianContact');
  }
  return {
    normalized,
    masked: `${normalized.slice(0, 3)}${'*'.repeat(Math.max(3, normalized.length - 5))}${normalized.slice(-2)}`,
  };
}

export function normalizeGuardianIdentity(input: {
  readonly guardianDisplayName: string;
  readonly relationship: string;
}): { readonly guardianDisplayName: string; readonly relationship: string } {
  const guardianDisplayName = input.guardianDisplayName.trim().replace(/\s+/g, ' ');
  const relationship = input.relationship.trim().replace(/\s+/g, ' ');
  if (guardianDisplayName.length < 2 || guardianDisplayName.length > 120) {
    throw new YouthConsentValidationError('guardianDisplayName');
  }
  if (relationship.length < 2 || relationship.length > 80) {
    throw new YouthConsentValidationError('relationship');
  }
  return { guardianDisplayName, relationship };
}

export function assertYouthConsentCanBeRequested(input: {
  readonly featureEnabled: boolean;
  readonly challengeState: string;
  readonly actorIsParticipant: boolean;
  readonly actorAgeDivision: 'YOUTH' | 'ADULT';
  readonly expiresAt: Date;
  readonly occurredAt: Date;
}): void {
  if (!input.featureEnabled) throw new YouthConsentConflictError('YOUTH_OFFICIAL_DISABLED');
  if (!input.actorIsParticipant || input.actorAgeDivision !== 'YOUTH') {
    throw new YouthConsentConflictError('YOUTH_CONSENT_SUBJECT_REQUIRED');
  }
  if (input.challengeState !== 'AWAITING_RESPONSE') {
    throw new YouthConsentConflictError('YOUTH_CONSENT_INVALID_STATE');
  }
  assertValidDate(input.expiresAt, 'expiresAt');
  assertValidDate(input.occurredAt, 'occurredAt');
  if (input.occurredAt >= input.expiresAt) {
    throw new YouthConsentConflictError('YOUTH_CONSENT_EXPIRED');
  }
}

export function assertYouthConsentDecisionCanBeRecorded(input: {
  readonly state: YouthConsentState;
  readonly decision: YouthConsentDecision;
  readonly expiresAt: Date;
  readonly occurredAt: Date;
  readonly consentTextAccepted?: boolean;
}): void {
  assertValidDate(input.expiresAt, 'expiresAt');
  assertValidDate(input.occurredAt, 'occurredAt');
  if (input.occurredAt >= input.expiresAt) {
    throw new YouthConsentConflictError('YOUTH_CONSENT_EXPIRED');
  }
  if (input.decision === 'REVOKE') {
    if (input.state !== 'GRANTED') {
      throw new YouthConsentConflictError('YOUTH_CONSENT_INVALID_STATE');
    }
    return;
  }
  if (input.state !== 'PENDING') {
    throw new YouthConsentConflictError('YOUTH_CONSENT_INVALID_STATE');
  }
  if (input.decision === 'GRANT' && input.consentTextAccepted !== true) {
    throw new YouthConsentValidationError('consentTextAccepted');
  }
}

export function assertYouthOfficialConsentReady(input: {
  readonly featureEnabled: boolean;
  readonly youthParticipantCount: number;
  readonly grantedConsentCount: number;
}): void {
  if (!Number.isSafeInteger(input.youthParticipantCount) || input.youthParticipantCount < 0) {
    throw new YouthConsentValidationError('youthParticipantCount');
  }
  if (!Number.isSafeInteger(input.grantedConsentCount) || input.grantedConsentCount < 0) {
    throw new YouthConsentValidationError('grantedConsentCount');
  }
  if (input.youthParticipantCount === 0) return;
  if (!input.featureEnabled) throw new YouthConsentConflictError('YOUTH_OFFICIAL_DISABLED');
  if (input.grantedConsentCount !== input.youthParticipantCount) {
    throw new YouthConsentConflictError('YOUTH_CONSENT_REQUIRED');
  }
}
