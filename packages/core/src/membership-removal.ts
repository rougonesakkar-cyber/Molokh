import { deriveStatusReleasePlan, type StatusReleasePlan } from './status-release.js';

export const MEMBERSHIP_REMOVAL_POLICY_VERSION = 'membership-removal-mvp-v1' as const;
export const MEMBERSHIP_REMOVAL_APPEAL_HOURS = 48;

export type MembershipRemovalSubjectStatus = 'ORDINARY' | 'CHAMPION' | 'CONTENDER';
export type MembershipRemovalCaseState =
  | 'REMOVED_APPEALABLE'
  | 'UNDER_REVIEW'
  | 'APPEALED'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'OVERTURNED';
export type MembershipRemovalDecision = 'CONFIRM_REMOVAL' | 'REJECT_REMOVAL';

export type MembershipRemovalConflictCode =
  | 'MEMBERSHIP_REMOVAL_NOT_FOUND'
  | 'MEMBERSHIP_REMOVAL_MEMBERSHIP_NOT_ACTIVE'
  | 'MEMBERSHIP_REMOVAL_COMMUNITY_NOT_ACTIVE'
  | 'MEMBERSHIP_REMOVAL_ADMIN_REQUIRED'
  | 'MEMBERSHIP_REMOVAL_CENTRAL_REQUIRED'
  | 'MEMBERSHIP_REMOVAL_SELF_CONFLICT'
  | 'MEMBERSHIP_REMOVAL_REASON_REQUIRED'
  | 'MEMBERSHIP_REMOVAL_INVALID_STATE'
  | 'MEMBERSHIP_REMOVAL_SUBJECT_REQUIRED'
  | 'MEMBERSHIP_REMOVAL_APPEAL_WINDOW_CLOSED'
  | 'MEMBERSHIP_REMOVAL_ALREADY_APPEALED'
  | 'MEMBERSHIP_REMOVAL_CONTEXT_CHANGED'
  | 'MEMBERSHIP_REMOVAL_STARTED_SESSION';

export class MembershipRemovalConflictError extends Error {
  readonly code: MembershipRemovalConflictCode;

  constructor(readonly reason: MembershipRemovalConflictCode) {
    super(`Membership removal is not allowed: ${reason}`);
    this.name = 'MembershipRemovalConflictError';
    this.code = reason;
  }
}

export function membershipRemovalAppealDeadline(removedAt: Date): Date {
  if (!Number.isFinite(removedAt.getTime())) throw new RangeError('removedAt must be valid');
  return new Date(removedAt.getTime() + MEMBERSHIP_REMOVAL_APPEAL_HOURS * 60 * 60 * 1_000);
}

export function membershipRemovalSubjectStatus(input: {
  readonly subjectUserId: string;
  readonly championUserId: string | null;
  readonly contenderUserId: string | null;
}): MembershipRemovalSubjectStatus {
  return input.subjectUserId === input.championUserId
    ? 'CHAMPION'
    : input.subjectUserId === input.contenderUserId
      ? 'CONTENDER'
      : 'ORDINARY';
}

export function assertMembershipRemovalRequest(input: {
  readonly membershipActive: boolean;
  readonly communityActive: boolean;
  readonly actorIsScopedAdmin: boolean;
  readonly actorUserId: string;
  readonly subjectUserId: string;
  readonly reason: string;
}): void {
  if (!input.actorIsScopedAdmin) {
    throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_ADMIN_REQUIRED');
  }
  if (input.actorUserId === input.subjectUserId) {
    throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_SELF_CONFLICT');
  }
  if (!input.membershipActive) {
    throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_MEMBERSHIP_NOT_ACTIVE');
  }
  if (!input.communityActive) {
    throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_COMMUNITY_NOT_ACTIVE');
  }
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 1_000) {
    throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_REASON_REQUIRED');
  }
}

export function assertMembershipRemovalAppeal(input: {
  readonly state: MembershipRemovalCaseState;
  readonly actorUserId: string;
  readonly subjectUserId: string;
  readonly appealDeadlineAt: Date | null;
  readonly occurredAt: Date;
  readonly reason: string;
}): void {
  if (input.actorUserId !== input.subjectUserId) {
    throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_SUBJECT_REQUIRED');
  }
  if (input.state === 'APPEALED') {
    throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_ALREADY_APPEALED');
  }
  if (input.state !== 'REMOVED_APPEALABLE') {
    throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_INVALID_STATE');
  }
  if (!input.appealDeadlineAt || input.occurredAt >= input.appealDeadlineAt) {
    throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_APPEAL_WINDOW_CLOSED');
  }
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 1_000) {
    throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_REASON_REQUIRED');
  }
}

export function assertMembershipRemovalDecision(input: {
  readonly actorIsCentral: boolean;
  readonly state: MembershipRemovalCaseState;
  readonly subjectStatus: MembershipRemovalSubjectStatus;
  readonly decision: MembershipRemovalDecision;
  readonly reason: string;
}): void {
  if (!input.actorIsCentral) {
    throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_CENTRAL_REQUIRED');
  }
  if (input.state !== 'UNDER_REVIEW' && input.state !== 'APPEALED') {
    throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_INVALID_STATE');
  }
  if (
    (input.subjectStatus === 'ORDINARY' && input.state !== 'APPEALED')
    || (input.subjectStatus !== 'ORDINARY' && input.state !== 'UNDER_REVIEW')
  ) {
    throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_INVALID_STATE');
  }
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 1_000) {
    throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_REASON_REQUIRED');
  }
}

export function deriveConfirmedRemovalStatusPlan(input: {
  readonly subjectUserId: string;
  readonly subjectStatus: MembershipRemovalSubjectStatus;
  readonly championUserId: string | null;
  readonly contenderUserId: string | null;
}): StatusReleasePlan | null {
  if (input.subjectStatus === 'ORDINARY') return null;
  const currentStatus = membershipRemovalSubjectStatus(input);
  if (currentStatus !== input.subjectStatus) {
    throw new MembershipRemovalConflictError('MEMBERSHIP_REMOVAL_CONTEXT_CHANGED');
  }
  return deriveStatusReleasePlan({
    actorUserId: input.subjectUserId,
    championUserId: input.championUserId,
    contenderUserId: input.contenderUserId,
  });
}
