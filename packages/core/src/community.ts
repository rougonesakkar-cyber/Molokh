import type { AccountState, AccountVerificationState, AgeDivision } from './identity.js';

export type CommunityState = 'ACTIVE' | 'PAUSED' | 'CLOSING' | 'CLOSED';
export type MembershipState =
  | 'PENDING'
  | 'ACTIVE'
  | 'UNDER_REVIEW'
  | 'REJECTED'
  | 'LEFT'
  | 'REMOVED'
  | 'ARCHIVED';
export type CommunityRole =
  | 'PRIMARY_ADMIN'
  | 'GYM_ADMIN'
  | 'COACH'
  | 'CENTRAL_ADMIN';
export type RoleScopeType = 'VENUE' | 'COMMUNITY' | 'SESSION' | 'GLOBAL';

export const COMMUNITY_LIFECYCLE_POLICY_VERSION = 'community-lifecycle-mvp-v1' as const;
export const COMMUNITY_CONFIGURATION_POLICY_VERSION = 'community-configuration-mvp-v1' as const;

export type CommunityConfigurationConflictCode =
  | 'COMMUNITY_CONFIGURATION_ADMIN_REQUIRED'
  | 'COMMUNITY_CONFIGURATION_INVALID_STATE'
  | 'PAIR_COOLDOWN_OUT_OF_RANGE'
  | 'COMMUNITY_CONFIGURATION_UNCHANGED';

export class CommunityConfigurationConflictError extends Error {
  readonly code: CommunityConfigurationConflictCode;

  constructor(readonly reason: CommunityConfigurationConflictCode) {
    super(`Community configuration change is not allowed: ${reason}`);
    this.name = 'CommunityConfigurationConflictError';
    this.code = reason;
  }
}

export function assertCommunityPairCooldownChange(input: {
  readonly actorCanManage: boolean;
  readonly currentState: CommunityState;
  readonly currentPairCooldownDays: number;
  readonly nextPairCooldownDays: number;
}): void {
  if (!input.actorCanManage) {
    throw new CommunityConfigurationConflictError('COMMUNITY_CONFIGURATION_ADMIN_REQUIRED');
  }
  if (input.currentState !== 'ACTIVE' && input.currentState !== 'PAUSED') {
    throw new CommunityConfigurationConflictError('COMMUNITY_CONFIGURATION_INVALID_STATE');
  }
  if (
    !Number.isSafeInteger(input.nextPairCooldownDays)
    || input.nextPairCooldownDays < 7
    || input.nextPairCooldownDays > 30
  ) {
    throw new CommunityConfigurationConflictError('PAIR_COOLDOWN_OUT_OF_RANGE');
  }
  if (input.nextPairCooldownDays === input.currentPairCooldownDays) {
    throw new CommunityConfigurationConflictError('COMMUNITY_CONFIGURATION_UNCHANGED');
  }
}

export type CommunityLifecycleAction = 'PAUSE' | 'REACTIVATE';
export type CommunityClosureAction = 'SCHEDULE_CLOSURE' | 'FINALIZE_CLOSURE';
export type CommunityClosureSessionDisposition = 'RETAIN_TO_COMPLETION' | 'CANCEL_NO_FAULT';
export type CommunityLifecycleConflictCode =
  | 'COMMUNITY_LIFECYCLE_CENTRAL_REQUIRED'
  | 'COMMUNITY_LIFECYCLE_INVALID_STATE'
  | 'COMMUNITY_LIFECYCLE_REASON_REQUIRED'
  | 'COMMUNITY_CLOSURE_EFFECTIVE_AT_INVALID'
  | 'COMMUNITY_CLOSURE_SESSION_DISPOSITIONS_INVALID'
  | 'COMMUNITY_CLOSURE_NOT_DUE'
  | 'COMMUNITY_CLOSURE_RETAINED_SESSION_UNRESOLVED';

export class CommunityLifecycleConflictError extends Error {
  readonly code: CommunityLifecycleConflictCode;

  constructor(readonly reason: CommunityLifecycleConflictCode) {
    super(`Community lifecycle transition is not allowed: ${reason}`);
    this.name = 'CommunityLifecycleConflictError';
    this.code = reason;
  }
}

export function assertCommunityLifecycleTransition(input: {
  readonly action: CommunityLifecycleAction;
  readonly actorIsCentral: boolean;
  readonly currentState: CommunityState;
  readonly reason: string;
}): void {
  if (!input.actorIsCentral) {
    throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_CENTRAL_REQUIRED');
  }
  const reasonLength = input.reason.trim().length;
  if (reasonLength < 1 || reasonLength > 500) {
    throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_REASON_REQUIRED');
  }
  const expectedState: CommunityState = input.action === 'PAUSE' ? 'ACTIVE' : 'PAUSED';
  if (input.currentState !== expectedState) {
    throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_INVALID_STATE');
  }
}

export function assertCommunityClosureTransition(input: {
  readonly action: CommunityClosureAction;
  readonly actorIsCentral: boolean;
  readonly actorIsSystem?: boolean;
  readonly currentState: CommunityState;
  readonly reason: string;
  readonly effectiveAt: Date;
  readonly now: Date;
  readonly emergency: boolean;
  readonly dispositions?: readonly {
    readonly sessionId: string;
    readonly disposition: CommunityClosureSessionDisposition;
  }[];
  readonly unresolvedRetainedSessionCount?: number;
}): void {
  if (!input.actorIsCentral && !(input.action === 'FINALIZE_CLOSURE' && input.actorIsSystem)) {
    throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_CENTRAL_REQUIRED');
  }
  const reasonLength = input.reason.trim().length;
  if (reasonLength < 1 || reasonLength > 500) {
    throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_REASON_REQUIRED');
  }
  if (Number.isNaN(input.effectiveAt.getTime())) {
    throw new CommunityLifecycleConflictError('COMMUNITY_CLOSURE_EFFECTIVE_AT_INVALID');
  }

  if (input.action === 'SCHEDULE_CLOSURE') {
    if (input.currentState !== 'ACTIVE' && input.currentState !== 'PAUSED') {
      throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_INVALID_STATE');
    }
    if (!input.emergency && input.effectiveAt.getTime() <= input.now.getTime()) {
      throw new CommunityLifecycleConflictError('COMMUNITY_CLOSURE_EFFECTIVE_AT_INVALID');
    }
    const dispositions = input.dispositions ?? [];
    const sessionIds = new Set<string>();
    for (const disposition of dispositions) {
      if (
        disposition.sessionId.trim().length === 0
        || sessionIds.has(disposition.sessionId)
        || !['RETAIN_TO_COMPLETION', 'CANCEL_NO_FAULT'].includes(disposition.disposition)
      ) {
        throw new CommunityLifecycleConflictError(
          'COMMUNITY_CLOSURE_SESSION_DISPOSITIONS_INVALID',
        );
      }
      sessionIds.add(disposition.sessionId);
    }
    return;
  }

  if (input.currentState !== 'CLOSING') {
    throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_INVALID_STATE');
  }
  if (input.effectiveAt.getTime() > input.now.getTime()) {
    throw new CommunityLifecycleConflictError('COMMUNITY_CLOSURE_NOT_DUE');
  }
  if ((input.unresolvedRetainedSessionCount ?? 0) > 0) {
    throw new CommunityLifecycleConflictError(
      'COMMUNITY_CLOSURE_RETAINED_SESSION_UNRESOLVED',
    );
  }
}

export interface ActiveRoleGrant {
  readonly role: CommunityRole;
  readonly scopeType: RoleScopeType;
  readonly scopeId: string | null;
}

export interface CommunityMembershipAccess {
  readonly state: MembershipState;
  readonly ageDivision: AgeDivision;
  readonly competitionEnabled: boolean;
}

export type CommunityCapability =
  | 'VIEW_COMMUNITY'
  | 'REQUEST_MEMBERSHIP'
  | 'CREATE_OFFICIAL_CHALLENGE'
  | 'MANAGE_MEMBERSHIPS'
  | 'MANAGE_VENUE_OPERATIONS'
  | 'RECORD_COMMUNITY_RESULT'
  | 'TRANSFER_PRIMARY_ADMIN';

export type CommunityDenialCode =
  | 'ACCOUNT_NOT_ACTIVE'
  | 'ACCOUNT_NOT_VERIFIED'
  | 'COMMUNITY_NOT_ACTIVE'
  | 'MEMBERSHIP_ALREADY_EXISTS'
  | 'MEMBERSHIP_REAPPLY_WAIT'
  | 'MEMBERSHIP_NOT_ACTIVE'
  | 'AGE_CONTOUR_MISMATCH'
  | 'MVP_ACTIVE_COMMUNITY_LIMIT'
  | 'ROLE_SCOPE_MISMATCH'
  | 'CENTRAL_ONLY';

export interface CommunityCapabilityDenial {
  readonly capability: CommunityCapability;
  readonly code: CommunityDenialCode;
  readonly messageKey: string;
  readonly retryable: boolean;
}

export interface CommunityAccessInput {
  readonly userId: string;
  readonly accountState: AccountState;
  readonly accountVerificationState: AccountVerificationState;
  readonly ageDivision: AgeDivision;
  readonly venueId: string;
  readonly communityId: string;
  readonly communityState: CommunityState;
  readonly membership: CommunityMembershipAccess | null;
  readonly membershipReapplyBlocked: boolean;
  readonly hasOtherActiveCompetitiveMembership: boolean;
  readonly multiCommunityDisciplineEnabled?: boolean;
  readonly activeRoleGrants: readonly ActiveRoleGrant[];
}

export interface CommunityAccessProjection {
  readonly capabilities: readonly CommunityCapability[];
  readonly denials: readonly CommunityCapabilityDenial[];
}

function denial(
  capability: CommunityCapability,
  code: CommunityDenialCode,
  retryable = true,
): CommunityCapabilityDenial {
  return {
    capability,
    code,
    messageKey: `community.${code.toLowerCase()}`,
    retryable,
  };
}

function hasGrant(
  input: CommunityAccessInput,
  roles: readonly CommunityRole[],
  scopeType: RoleScopeType,
  scopeId: string | null,
): boolean {
  return input.activeRoleGrants.some(
    (grant) =>
      roles.includes(grant.role) &&
      grant.scopeType === scopeType &&
      grant.scopeId === scopeId,
  );
}

function isCentral(input: CommunityAccessInput): boolean {
  return hasGrant(input, ['CENTRAL_ADMIN'], 'GLOBAL', null);
}

export function projectCommunityAccess(
  input: CommunityAccessInput,
): CommunityAccessProjection {
  const capabilities: CommunityCapability[] = [];
  const denials: CommunityCapabilityDenial[] = [];
  const accountActive = input.accountState === 'ACTIVE';
  const communityActive = input.communityState === 'ACTIVE';

  if (accountActive && input.communityState !== 'CLOSED') {
    capabilities.push('VIEW_COMMUNITY');
  } else {
    denials.push(
      denial(
        'VIEW_COMMUNITY',
        accountActive ? 'COMMUNITY_NOT_ACTIVE' : 'ACCOUNT_NOT_ACTIVE',
        false,
      ),
    );
  }

  const membershipCanBeRequested =
    input.membership === null ||
    ['REJECTED', 'LEFT', 'REMOVED', 'ARCHIVED'].includes(input.membership.state);
  if (
    accountActive &&
    communityActive &&
    membershipCanBeRequested &&
    !input.membershipReapplyBlocked &&
    (!input.hasOtherActiveCompetitiveMembership || input.multiCommunityDisciplineEnabled)
  ) {
    capabilities.push('REQUEST_MEMBERSHIP');
  } else {
    const code: CommunityDenialCode = !accountActive
      ? 'ACCOUNT_NOT_ACTIVE'
      : !communityActive
        ? 'COMMUNITY_NOT_ACTIVE'
        : input.hasOtherActiveCompetitiveMembership && !input.multiCommunityDisciplineEnabled
          ? 'MVP_ACTIVE_COMMUNITY_LIMIT'
          : input.membershipReapplyBlocked
            ? 'MEMBERSHIP_REAPPLY_WAIT'
          : 'MEMBERSHIP_ALREADY_EXISTS';
    denials.push(denial('REQUEST_MEMBERSHIP', code, code !== 'MEMBERSHIP_ALREADY_EXISTS'));
  }

  const membership = input.membership;
  if (
    accountActive &&
    input.accountVerificationState === 'VERIFIED' &&
    communityActive &&
    membership?.state === 'ACTIVE' &&
    membership.competitionEnabled &&
    membership.ageDivision === input.ageDivision
  ) {
    capabilities.push('CREATE_OFFICIAL_CHALLENGE');
  } else {
    const code: CommunityDenialCode = !accountActive
      ? 'ACCOUNT_NOT_ACTIVE'
      : input.accountVerificationState !== 'VERIFIED'
        ? 'ACCOUNT_NOT_VERIFIED'
        : !communityActive
          ? 'COMMUNITY_NOT_ACTIVE'
          : membership?.state !== 'ACTIVE' || !membership.competitionEnabled
            ? 'MEMBERSHIP_NOT_ACTIVE'
            : 'AGE_CONTOUR_MISMATCH';
    denials.push(denial('CREATE_OFFICIAL_CHALLENGE', code));
  }

  const venueAdmin =
    isCentral(input) ||
    hasGrant(input, ['PRIMARY_ADMIN', 'GYM_ADMIN'], 'VENUE', input.venueId);
  for (const capability of ['MANAGE_MEMBERSHIPS', 'MANAGE_VENUE_OPERATIONS'] as const) {
    if (accountActive && venueAdmin) capabilities.push(capability);
    else denials.push(denial(capability, accountActive ? 'ROLE_SCOPE_MISMATCH' : 'ACCOUNT_NOT_ACTIVE'));
  }

  if (
    accountActive &&
    hasGrant(input, ['COACH'], 'COMMUNITY', input.communityId)
  ) {
    capabilities.push('RECORD_COMMUNITY_RESULT');
  } else {
    denials.push(
      denial(
        'RECORD_COMMUNITY_RESULT',
        accountActive ? 'ROLE_SCOPE_MISMATCH' : 'ACCOUNT_NOT_ACTIVE',
      ),
    );
  }

  if (accountActive && isCentral(input)) capabilities.push('TRANSFER_PRIMARY_ADMIN');
  else denials.push(denial('TRANSFER_PRIMARY_ADMIN', accountActive ? 'CENTRAL_ONLY' : 'ACCOUNT_NOT_ACTIVE'));

  return { capabilities, denials };
}
