import type { AgeDivision } from './identity.js';

export const MEMBERSHIP_POLICY_VERSION = 'membership-mvp-v1' as const;
export const MEMBERSHIP_REQUEST_REMINDER_HOURS = 12;
export const MEMBERSHIP_REQUEST_ESCALATION_HOURS = 24;
export const MEMBERSHIP_REAPPLY_WAIT_DAYS = 7;

export const MEMBERSHIP_PUBLIC_REJECTION_REASON_CODES = [
  'CAPACITY_UNAVAILABLE',
  'COMMUNITY_REQUIREMENTS',
  'REQUEST_NOT_APPROVED',
] as const;
export type MembershipPublicRejectionReasonCode =
  typeof MEMBERSHIP_PUBLIC_REJECTION_REASON_CODES[number];

export const MEMBERSHIP_INTERNAL_REJECTION_REASON_CODES = [
  'CAPACITY_LIMIT',
  'ELIGIBILITY_REVIEW',
  'SAFETY_REVIEW',
  'ADMIN_OTHER',
] as const;
export type MembershipInternalRejectionReasonCode =
  typeof MEMBERSHIP_INTERNAL_REJECTION_REASON_CODES[number];

export type MembershipJoinPath = 'QR' | 'INVITE' | 'SELF_REQUEST';
export type MembershipTransition =
  | 'REQUEST'
  | 'ACTIVATE'
  | 'APPROVE'
  | 'REJECT'
  | 'WITHDRAW';
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
  | 'MEMBERSHIP_REQUESTER_REQUIRED'
  | 'MEMBERSHIP_REJECTION_REASON_INVALID'
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
  readonly actorIsRequester?: boolean;
  readonly inviteValid?: boolean;
  readonly publicRejectionReasonCode?: MembershipPublicRejectionReasonCode | null;
  readonly internalRejectionReasonCode?: MembershipInternalRejectionReasonCode | null;
  readonly internalCaseRef?: string | null;
  readonly now: Date;
}

export function assertMembershipTransition(input: MembershipTransitionInput): void {
  if (input.transition !== 'WITHDRAW' && input.accountState !== 'ACTIVE') {
    throw new MembershipConflictError('MEMBERSHIP_ACCOUNT_NOT_ACTIVE');
  }
  if (input.transition !== 'WITHDRAW' && input.communityState !== 'ACTIVE') {
    throw new MembershipConflictError('MEMBERSHIP_COMMUNITY_NOT_ACTIVE');
  }

  if (input.transition === 'APPROVE' || input.transition === 'REJECT') {
    if (!input.actorControlsVenue) {
      throw new MembershipConflictError('MEMBERSHIP_ADMIN_REQUIRED');
    }
    if (input.currentMembershipState !== 'PENDING') {
      throw new MembershipConflictError('MEMBERSHIP_NOT_PENDING');
    }
    if (
      input.transition === 'REJECT'
      && (
        !input.publicRejectionReasonCode
        || !MEMBERSHIP_PUBLIC_REJECTION_REASON_CODES.includes(input.publicRejectionReasonCode)
        || !input.internalRejectionReasonCode
        || !MEMBERSHIP_INTERNAL_REJECTION_REASON_CODES.includes(input.internalRejectionReasonCode)
        || (input.internalCaseRef !== undefined && input.internalCaseRef !== null
          && (input.internalCaseRef.trim().length < 3 || input.internalCaseRef.trim().length > 200))
        || (input.internalRejectionReasonCode === 'SAFETY_REVIEW'
          && !input.internalCaseRef?.trim())
      )
    ) {
      throw new MembershipConflictError('MEMBERSHIP_REJECTION_REASON_INVALID');
    }
  } else if (input.transition === 'WITHDRAW') {
    if (!input.actorIsRequester) {
      throw new MembershipConflictError('MEMBERSHIP_REQUESTER_REQUIRED');
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

  if (
    ['REQUEST', 'ACTIVATE', 'APPROVE'].includes(input.transition)
    && input.hasOtherActiveCompetitiveMembership
  ) {
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

export function membershipReapplyNotBefore(rejectedAt: Date): string {
  if (Number.isNaN(rejectedAt.getTime())) throw new RangeError('Rejection time must be valid');
  return new Date(
    rejectedAt.getTime() + MEMBERSHIP_REAPPLY_WAIT_DAYS * 24 * 60 * 60 * 1_000,
  ).toISOString();
}

export function membershipRequestDeadline(
  requestedAt: Date,
  hours: typeof MEMBERSHIP_REQUEST_REMINDER_HOURS
    | typeof MEMBERSHIP_REQUEST_ESCALATION_HOURS,
): string {
  if (Number.isNaN(requestedAt.getTime())) throw new RangeError('Request time must be valid');
  return new Date(requestedAt.getTime() + hours * 60 * 60 * 1_000).toISOString();
}
