import type {
  CommunityRole,
  CommunityState,
  RoleScopeType,
} from './community.js';
import type {
  AccountState,
  AccountVerificationState,
} from './identity.js';
import type { ResultState } from './result.js';
import type { SessionState } from './scheduling.js';

export const GUEST_COACH_HARD_EXPIRY_DAYS = 30;

export type RoleGrantState =
  | 'PENDING'
  | 'ACTIVE'
  | 'DECLINED'
  | 'REVOKED'
  | 'EXPIRED';

export interface RoleGrantProjection {
  readonly grantId: string;
  readonly userId: string;
  readonly role: CommunityRole;
  readonly scopeType: RoleScopeType;
  readonly scopeId: string | null;
  readonly state: RoleGrantState;
  readonly authorizedBy: string | null;
  readonly authorizedAt: string | null;
  readonly expiresAt: string | null;
  readonly version: number;
}

export class RoleGrantValidationError extends Error {
  readonly code = 'ROLE_GRANT_VALIDATION_FAILED';

  constructor(readonly field: string) {
    super(`Role grant field ${field} is invalid`);
    this.name = 'RoleGrantValidationError';
  }
}

export class RoleGrantPermissionDeniedError extends Error {
  readonly code = 'ROLE_GRANT_PERMISSION_DENIED';

  constructor() {
    super('Actor does not control the requested role scope');
    this.name = 'RoleGrantPermissionDeniedError';
  }
}

export class InvalidRoleGrantTransitionError extends Error {
  readonly code = 'INVALID_STATE_TRANSITION';

  constructor(readonly state: RoleGrantState | 'NONE') {
    super(`Role grant transition is not allowed from ${state}`);
    this.name = 'InvalidRoleGrantTransitionError';
  }
}

export function normalizeRoleReasonCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9_]{3,80}$/.test(normalized)) {
    throw new RoleGrantValidationError('reasonCode');
  }
  return normalized;
}

export interface InviteCoachPolicyInput {
  readonly actorControlsScope: boolean;
  readonly communityState: CommunityState;
  readonly targetAccountState: AccountState;
  readonly targetVerificationState: AccountVerificationState;
  readonly occurredAt: Date;
  readonly invitationTtlHours: number;
}

export interface PendingCoachGrantState {
  readonly state: 'PENDING';
  readonly expiresAt: string;
}

export function inviteCoachState(
  input: InviteCoachPolicyInput,
): PendingCoachGrantState {
  if (!input.actorControlsScope) throw new RoleGrantPermissionDeniedError();
  if (input.communityState !== 'ACTIVE') {
    throw new InvalidRoleGrantTransitionError('NONE');
  }
  if (input.targetAccountState !== 'ACTIVE') {
    throw new RoleGrantValidationError('targetAccountState');
  }
  if (input.targetVerificationState !== 'VERIFIED') {
    throw new RoleGrantValidationError('targetVerificationState');
  }
  if (
    !Number.isSafeInteger(input.invitationTtlHours) ||
    input.invitationTtlHours < 1 ||
    input.invitationTtlHours > 168
  ) {
    throw new RoleGrantValidationError('invitationTtlHours');
  }
  const expiresAt = new Date(
    input.occurredAt.getTime() + input.invitationTtlHours * 60 * 60 * 1000,
  );
  return { state: 'PENDING', expiresAt: expiresAt.toISOString() };
}

export interface AcceptCoachInvitePolicyInput {
  readonly actorIsInvitee: boolean;
  readonly currentState: RoleGrantState;
  readonly communityState: CommunityState;
  readonly targetAccountState: AccountState;
  readonly targetVerificationState: AccountVerificationState;
  readonly expiresAt: string | null;
  readonly occurredAt: Date;
}

export function acceptCoachInviteState(
  input: AcceptCoachInvitePolicyInput,
): 'ACTIVE' {
  if (!input.actorIsInvitee) throw new RoleGrantPermissionDeniedError();
  if (input.currentState !== 'PENDING') {
    throw new InvalidRoleGrantTransitionError(input.currentState);
  }
  if (input.communityState !== 'ACTIVE') {
    throw new InvalidRoleGrantTransitionError(input.currentState);
  }
  if (input.targetAccountState !== 'ACTIVE') {
    throw new RoleGrantValidationError('targetAccountState');
  }
  if (input.targetVerificationState !== 'VERIFIED') {
    throw new RoleGrantValidationError('targetVerificationState');
  }
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
    throw new RoleGrantValidationError('expiresAt');
  }
  if (input.occurredAt.getTime() >= expiresAt.getTime()) {
    throw new InvalidRoleGrantTransitionError('EXPIRED');
  }
  return 'ACTIVE';
}

export interface AuthorizeGuestCoachPolicyInput {
  readonly actorControlsScope: boolean;
  readonly sessionState: SessionState;
  readonly targetAccountState: AccountState;
  readonly targetVerificationState: AccountVerificationState;
  readonly targetIsAssignedCoach: boolean;
  readonly targetIsAthlete: boolean;
  readonly scheduledEndAt: Date;
}

export interface ActiveGuestCoachGrantState {
  readonly state: 'ACTIVE';
  readonly expiresAt: string;
}

export function authorizeGuestCoachState(
  input: AuthorizeGuestCoachPolicyInput,
): ActiveGuestCoachGrantState {
  if (!input.actorControlsScope) throw new RoleGrantPermissionDeniedError();
  if (input.sessionState !== 'SCHEDULED' && input.sessionState !== 'READY_FOR_COACH') {
    throw new InvalidRoleGrantTransitionError('NONE');
  }
  if (input.targetAccountState !== 'ACTIVE') {
    throw new RoleGrantValidationError('targetAccountState');
  }
  if (input.targetVerificationState !== 'VERIFIED') {
    throw new RoleGrantValidationError('targetVerificationState');
  }
  if (!input.targetIsAssignedCoach) {
    throw new RoleGrantValidationError('assignedCoach');
  }
  if (input.targetIsAthlete) {
    throw new RoleGrantValidationError('coachConflict');
  }
  const expiresAt = new Date(
    input.scheduledEndAt.getTime() + GUEST_COACH_HARD_EXPIRY_DAYS * 24 * 60 * 60 * 1_000,
  );
  return { state: 'ACTIVE', expiresAt: expiresAt.toISOString() };
}

export type GuestCoachExpirationReason =
  | 'SESSION_CANCELLED'
  | 'RESULT_FINAL'
  | 'HARD_EXPIRY';

export interface ExpireGuestCoachPolicyInput {
  readonly currentState: RoleGrantState;
  readonly sessionState: SessionState;
  readonly resultState: ResultState | null;
  readonly expiresAt: string | null;
  readonly occurredAt: Date;
  readonly reason: GuestCoachExpirationReason;
}

export function expireGuestCoachState(
  input: ExpireGuestCoachPolicyInput,
): 'EXPIRED' {
  if (input.currentState !== 'ACTIVE') {
    throw new InvalidRoleGrantTransitionError(input.currentState);
  }
  const terminalResult = input.resultState !== null
    && ['FINAL', 'REVERSED', 'ANNULLED', 'REPEAT_ORDERED'].includes(input.resultState);
  const hardExpiry = input.expiresAt === null ? null : new Date(input.expiresAt);
  if (input.reason === 'SESSION_CANCELLED' && input.sessionState !== 'CANCELLED') {
    throw new InvalidRoleGrantTransitionError(input.currentState);
  }
  if (input.reason === 'RESULT_FINAL' && !terminalResult) {
    throw new InvalidRoleGrantTransitionError(input.currentState);
  }
  if (
    input.reason === 'HARD_EXPIRY'
    && (!hardExpiry || Number.isNaN(hardExpiry.getTime())
      || input.occurredAt.getTime() < hardExpiry.getTime())
  ) {
    throw new InvalidRoleGrantTransitionError(input.currentState);
  }
  return 'EXPIRED';
}

export type VenueState = 'PENDING_VERIFICATION' | 'ACTIVE' | 'PAUSED' | 'CLOSED';

export interface AppointGymAdminPolicyInput {
  readonly actorIsCentral: boolean;
  readonly venueState: VenueState;
  readonly targetAccountState: AccountState;
  readonly targetVerificationState: AccountVerificationState;
}

export function appointGymAdminState(
  input: AppointGymAdminPolicyInput,
): 'ACTIVE' {
  if (!input.actorIsCentral) throw new RoleGrantPermissionDeniedError();
  if (input.venueState !== 'ACTIVE') {
    throw new InvalidRoleGrantTransitionError('NONE');
  }
  if (input.targetAccountState !== 'ACTIVE') {
    throw new RoleGrantValidationError('targetAccountState');
  }
  if (input.targetVerificationState !== 'VERIFIED') {
    throw new RoleGrantValidationError('targetVerificationState');
  }
  return 'ACTIVE';
}

export interface ChangePrimaryAdminPolicyInput extends AppointGymAdminPolicyInput {
  readonly targetHasActiveGymAdmin: boolean;
  readonly currentPrimaryAdminUserId: string | null;
  readonly targetUserId: string;
}

export type PrimaryAdminChange = 'APPOINTED' | 'TRANSFERRED';

export function changePrimaryAdminState(
  input: ChangePrimaryAdminPolicyInput,
): PrimaryAdminChange {
  appointGymAdminState(input);
  if (!input.targetHasActiveGymAdmin) {
    throw new RoleGrantValidationError('targetGymAdminGrant');
  }
  if (input.currentPrimaryAdminUserId === input.targetUserId) {
    throw new InvalidRoleGrantTransitionError('ACTIVE');
  }
  return input.currentPrimaryAdminUserId ? 'TRANSFERRED' : 'APPOINTED';
}
