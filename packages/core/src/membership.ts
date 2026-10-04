import type { AgeDivision } from './identity.js';

export const MEMBERSHIP_POLICY_VERSION = 'membership-mvp-v1' as const;
export const MEMBERSHIP_REQUEST_REMINDER_HOURS = 12;
export const MEMBERSHIP_REQUEST_ESCALATION_HOURS = 24;

export type MembershipJoinPath = 'QR' | 'INVITE' | 'SELF_REQUEST';
export type MembershipTransition = 'REQUEST' | 'ACTIVATE' | 'APPROVE';
export type MembershipConflictCode =
  | 'MEMBERSHIP_ACCOUNT_NOT_ACTIVE'
  | 'MEMBERSHIP_COMMUNITY_NOT_ACTIVE'
  | 'MEMBERSHIP_RELATIONSHIP_EXISTS'
  | 'MEMBERSHIP_REAPPLY_NOT_DUE'
  | 'MVP_ACTIVE_COMMUNITY_LIMIT'
  | 'MEMBERSHIP_INVITE_INVALID'
  | 'MEMBERSHIP_AGE_CONTOUR_MISMATCH'
  | 'MEMBERSHIP_NOT_PENDING'
  | 'MEMBERSHIP_ADMIN_REQUIRED'
  | 'MEMBERSHIP_NOT_FOUND';

export class MembershipConflictError extends Error {
  readonly code: MembershipConflictCode;

  constructor(readonly reason: MembershipConflictCode) {
    super(`Membership transition is not allowed: ${reason}`);
    this.name = 'MembershipConflictError';
    this.code = reason;
  }
}

export interface MembershipTransitionInput {
  readonly transition: MembershipTransition;
  readonly accountState: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
  readonly communityState: 'ACTIVE' | 'PAUSED' | 'CLOSING' | 'CLOSED';
  readonly userAgeDivision: AgeDivision;
  readonly inviteAgeDivision?: AgeDivision | null;
  readonly currentMembershipState?:
    | 'PENDING'
    | 'ACTIVE'
    | 'UNDER_REVIEW'
    | 'REJECTED'
    | 'LEFT'
    | 'REMOVED'
    | 'ARCHIVED'
    | null;
  readonly hasCurrentRelationship: boolean;
  readonly hasOtherActiveCompetitiveMembership: boolean;
  readonly reapplyNotBeforeAt?: string | null;
  readonly actorControlsVenue?: boolean;
  readonly inviteValid?: boolean;
  readonly now: Date;
}

export function assertMembershipTransition(input: MembershipTransitionInput): void {
  if (input.accountState !== 'ACTIVE') {
    throw new MembershipConflictError('MEMBERSHIP_ACCOUNT_NOT_ACTIVE');
  }
  if (input.communityState !== 'ACTIVE') {
    throw new MembershipConflictError('MEMBERSHIP_COMMUNITY_NOT_ACTIVE');
  }

  if (input.transition === 'APPROVE') {
    if (!input.actorControlsVenue) {
      throw new MembershipConflictError('MEMBERSHIP_ADMIN_REQUIRED');
    }
    if (input.currentMembershipState !== 'PENDING') {
      throw new MembershipConflictError('MEMBERSHIP_NOT_PENDING');
    }
  } else {
    if (input.transition === 'ACTIVATE' && !input.inviteValid) {
      throw new MembershipConflictError('MEMBERSHIP_INVITE_INVALID');
    }
    if (input.hasCurrentRelationship) {
      throw new MembershipConflictError('MEMBERSHIP_RELATIONSHIP_EXISTS');
    }
    if (
      input.transition === 'REQUEST'
      && input.reapplyNotBeforeAt
      && Date.parse(input.reapplyNotBeforeAt) > input.now.getTime()
    ) {
      throw new MembershipConflictError('MEMBERSHIP_REAPPLY_NOT_DUE');
    }
  }

  if (input.hasOtherActiveCompetitiveMembership) {
    throw new MembershipConflictError('MVP_ACTIVE_COMMUNITY_LIMIT');
  }
  if (
    input.transition === 'ACTIVATE'
    && input.inviteAgeDivision
    && input.inviteAgeDivision !== input.userAgeDivision
  ) {
    throw new MembershipConflictError('MEMBERSHIP_AGE_CONTOUR_MISMATCH');
  }
}

export function membershipRequestDeadline(
  requestedAt: Date,
  hours: typeof MEMBERSHIP_REQUEST_REMINDER_HOURS
    | typeof MEMBERSHIP_REQUEST_ESCALATION_HOURS,
): string {
  if (Number.isNaN(requestedAt.getTime())) throw new RangeError('Request time must be valid');
  return new Date(requestedAt.getTime() + hours * 60 * 60 * 1_000).toISOString();
}
