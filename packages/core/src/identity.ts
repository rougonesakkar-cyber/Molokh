export type AgeDivision = 'YOUTH' | 'ADULT';
export type AccountState = 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
export type AccountVerificationState =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'REVOKED';

export type IdentityCapability =
  | 'USE_DISCOVERY'
  | 'EDIT_PROFILE'
  | 'BOOK_ORDINARY_TRAINING'
  | 'ACCOUNT_VERIFIED';

export type IdentityDenialCode =
  | 'ACCOUNT_RESTRICTED'
  | 'ACCOUNT_CLOSED'
  | 'PHONE_NOT_VERIFIED'
  | 'ACCOUNT_NOT_VERIFIED';

export interface IdentityCapabilityDenial {
  readonly capability: IdentityCapability;
  readonly code: IdentityDenialCode;
  readonly messageKey: string;
  readonly retryable: boolean;
}

export interface IdentityProjection {
  readonly userId: string;
  readonly displayName: string;
  readonly ageDivision: AgeDivision;
  readonly accountState: AccountState;
  readonly phoneVerified: boolean;
  readonly accountVerificationState: AccountVerificationState;
  readonly primarySport: string;
  readonly secondarySport: string | null;
  readonly discoveryRadiusKm: number;
  readonly version: number;
  readonly capabilities: readonly IdentityCapability[];
  readonly capabilityDenials: readonly IdentityCapabilityDenial[];
}

export interface ActivateIdentityInput {
  readonly userId: string;
  readonly phoneE164: string;
  readonly phoneVerifiedAt: string;
  readonly birthDate: string;
  readonly displayName: string;
  readonly locale: string;
  readonly primarySport: string;
  readonly secondarySport: string | null;
  readonly discoveryRadiusKm: number;
}

export interface ActivatedIdentity {
  readonly ageDivision: AgeDivision;
  readonly displayName: string;
  readonly phoneE164: string;
  readonly phoneVerifiedAt: string;
  readonly birthDate: string;
  readonly locale: string;
  readonly primarySport: string;
  readonly secondarySport: string | null;
  readonly discoveryRadiusKm: number;
}

export interface SportPreferences {
  readonly primarySport: string;
  readonly secondarySport: string | null;
}

export class MinimumAgeNotMetError extends Error {
  readonly code = 'MINIMUM_AGE_NOT_MET';

  constructor() {
    super('User must be at least 14 years old');
    this.name = 'MinimumAgeNotMetError';
  }
}

export class IdentityValidationError extends Error {
  readonly code = 'IDENTITY_VALIDATION_ERROR';

  constructor(readonly field: string) {
    super(`Identity field ${field} is invalid`);
    this.name = 'IdentityValidationError';
  }
}

export class InvalidIdentityTransitionError extends Error {
  readonly code = 'INVALID_STATE_TRANSITION';

  constructor(readonly transitionId: string) {
    super(`Identity transition ${transitionId} is not allowed from the current state`);
    this.name = 'InvalidIdentityTransitionError';
  }
}

export class IdentityPermissionDeniedError extends Error {
  readonly code = 'PERMISSION_DENIED';

  constructor() {
    super('Identity action is not permitted for this actor');
    this.name = 'IdentityPermissionDeniedError';
  }
}

export function normalizeChecklistVersion(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(normalized)) {
    throw new IdentityValidationError('moderationChecklistVersion');
  }
  return normalized;
}

export function startVerificationState(input: {
  readonly currentState: AccountVerificationState;
  readonly accountState: AccountState;
  readonly phoneVerified: boolean;
}): 'PENDING' {
  if (
    input.currentState !== 'NOT_STARTED' ||
    input.accountState !== 'ACTIVE' ||
    !input.phoneVerified
  ) {
    throw new InvalidIdentityTransitionError('V-01');
  }
  return 'PENDING';
}

export function approveVerificationState(input: {
  readonly currentState: AccountVerificationState;
  readonly accountState: AccountState;
  readonly phoneVerified: boolean;
  readonly moderationChecksPassed: boolean;
}): 'VERIFIED' {
  if (
    input.currentState !== 'PENDING' ||
    input.accountState !== 'ACTIVE' ||
    !input.phoneVerified ||
    !input.moderationChecksPassed
  ) {
    throw new InvalidIdentityTransitionError('V-02');
  }
  return 'VERIFIED';
}

function parseDate(value: string, field: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new IdentityValidationError(field);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new IdentityValidationError(field);
  }
  return date;
}

function ageAt(birthDate: Date, at: Date): number {
  let age = at.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    at.getUTCMonth() < birthDate.getUTCMonth() ||
    (at.getUTCMonth() === birthDate.getUTCMonth() &&
      at.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function deriveAgeDivision(birthDate: string, at: Date): AgeDivision {
  const age = ageAt(parseDate(birthDate, 'birthDate'), at);
  if (age < 14) throw new MinimumAgeNotMetError();
  return age < 18 ? 'YOUTH' : 'ADULT';
}

export function adultTransitionAt(birthDate: string): Date {
  const birth = parseDate(birthDate, 'birthDate');
  return new Date(Date.UTC(
    birth.getUTCFullYear() + 18,
    birth.getUTCMonth(),
    birth.getUTCDate(),
  ));
}

export function assertAgeDivisionCanTransition(input: {
  readonly currentAgeDivision: AgeDivision;
  readonly birthDate: string;
  readonly occurredAt: Date;
}): 'ADULT' {
  if (
    input.currentAgeDivision !== 'YOUTH'
    || deriveAgeDivision(input.birthDate, input.occurredAt) !== 'ADULT'
  ) {
    throw new InvalidIdentityTransitionError('AD-01');
  }
  return 'ADULT';
}

export function normalizeDisplayName(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 80) {
    throw new IdentityValidationError('displayName');
  }
  return normalized;
}

function assertSportCode(value: string, field: string): void {
  if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(value)) {
    throw new IdentityValidationError(field);
  }
}

export function normalizeSportPreferences(
  input: SportPreferences,
): SportPreferences {
  const primarySport = input.primarySport.trim().toUpperCase();
  const secondarySport = input.secondarySport?.trim().toUpperCase() || null;
  assertSportCode(primarySport, 'primarySport');
  if (secondarySport !== null) {
    assertSportCode(secondarySport, 'secondarySport');
    if (secondarySport === primarySport) {
      throw new IdentityValidationError('secondarySport');
    }
  }
  return { primarySport, secondarySport };
}

export function activateIdentity(input: ActivateIdentityInput, at: Date): ActivatedIdentity {
  if (!/^\+[1-9]\d{7,14}$/.test(input.phoneE164)) {
    throw new IdentityValidationError('phoneE164');
  }
  const phoneVerifiedAt = new Date(input.phoneVerifiedAt);
  if (Number.isNaN(phoneVerifiedAt.getTime()) || phoneVerifiedAt > at) {
    throw new IdentityValidationError('phoneVerifiedAt');
  }
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(input.locale)) {
    throw new IdentityValidationError('locale');
  }
  const sports = normalizeSportPreferences(input);
  if (!Number.isSafeInteger(input.discoveryRadiusKm) || input.discoveryRadiusKm < 1) {
    throw new IdentityValidationError('discoveryRadiusKm');
  }

  return {
    ageDivision: deriveAgeDivision(input.birthDate, at),
    displayName: normalizeDisplayName(input.displayName),
    phoneE164: input.phoneE164,
    phoneVerifiedAt: phoneVerifiedAt.toISOString(),
    birthDate: input.birthDate,
    locale: input.locale,
    primarySport: sports.primarySport,
    secondarySport: sports.secondarySport,
    discoveryRadiusKm: input.discoveryRadiusKm,
  };
}

function accountDenial(
  capability: IdentityCapability,
  accountState: Exclude<AccountState, 'ACTIVE'>,
): IdentityCapabilityDenial {
  return {
    capability,
    code: accountState === 'CLOSED' ? 'ACCOUNT_CLOSED' : 'ACCOUNT_RESTRICTED',
    messageKey:
      accountState === 'CLOSED' ? 'identity.account_closed' : 'identity.account_restricted',
    retryable: accountState === 'RESTRICTED',
  };
}

export function projectIdentityCapabilities(
  input: Omit<IdentityProjection, 'capabilities' | 'capabilityDenials'>,
): IdentityProjection {
  const all: readonly IdentityCapability[] = [
    'USE_DISCOVERY',
    'EDIT_PROFILE',
    'BOOK_ORDINARY_TRAINING',
    'ACCOUNT_VERIFIED',
  ];
  if (input.accountState !== 'ACTIVE') {
    return {
      ...input,
      capabilities: [],
      capabilityDenials: all.map((capability) =>
        accountDenial(capability, input.accountState as Exclude<AccountState, 'ACTIVE'>),
      ),
    };
  }

  const capabilities: IdentityCapability[] = ['USE_DISCOVERY', 'EDIT_PROFILE'];
  const capabilityDenials: IdentityCapabilityDenial[] = [];
  if (input.phoneVerified) {
    capabilities.push('BOOK_ORDINARY_TRAINING');
  } else {
    capabilityDenials.push({
      capability: 'BOOK_ORDINARY_TRAINING',
      code: 'PHONE_NOT_VERIFIED',
      messageKey: 'identity.phone_not_verified',
      retryable: true,
    });
  }

  if (input.phoneVerified && input.accountVerificationState === 'VERIFIED') {
    capabilities.push('ACCOUNT_VERIFIED');
  } else {
    capabilityDenials.push({
      capability: 'ACCOUNT_VERIFIED',
      code: input.phoneVerified ? 'ACCOUNT_NOT_VERIFIED' : 'PHONE_NOT_VERIFIED',
      messageKey: input.phoneVerified
        ? 'identity.account_not_verified'
        : 'identity.phone_not_verified',
      retryable: true,
    });
  }

  return { ...input, capabilities, capabilityDenials };
}
