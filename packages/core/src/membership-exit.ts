import {
  deriveStatusReleasePlan,
  type StatusReleaseConsequence,
  type StatusReleasePlan,
} from './status-release.js';

export const MEMBERSHIP_EXIT_POLICY_VERSION = 'membership-exit-mvp-v1' as const;
export const MEMBERSHIP_EXIT_PREVIEW_MINUTES = 15;

export type MembershipExitStatus = 'ORDINARY' | 'CHAMPION' | 'CONTENDER';
export type MembershipExitConsequence = 'ORDINARY_EXIT' | StatusReleaseConsequence;

export type MembershipExitConflictCode =
  | 'MEMBERSHIP_EXIT_ACCOUNT_NOT_ACTIVE'
  | 'MEMBERSHIP_EXIT_MEMBERSHIP_NOT_ACTIVE'
  | 'MEMBERSHIP_EXIT_COMMUNITY_NOT_ACTIVE'
  | 'MEMBERSHIP_EXIT_COMPETITION_NOT_ACTIVE'
  | 'MEMBERSHIP_EXIT_INTEGRITY_HOLD'
  | 'MEMBERSHIP_EXIT_ACTIVE_OBLIGATION'
  | 'MEMBERSHIP_EXIT_LIVE_STATUS_PROCESS'
  | 'MEMBERSHIP_EXIT_NOT_FOUND'
  | 'MEMBERSHIP_EXIT_OWNER_REQUIRED'
  | 'MEMBERSHIP_EXIT_NOT_PREVIEWED'
  | 'MEMBERSHIP_EXIT_PREVIEW_EXPIRED'
  | 'MEMBERSHIP_EXIT_TOKEN_INVALID'
  | 'MEMBERSHIP_EXIT_CONTEXT_CHANGED';

export class MembershipExitConflictError extends Error {
  readonly code: MembershipExitConflictCode;

  constructor(readonly reason: MembershipExitConflictCode) {
    super(`Membership exit is not allowed: ${reason}`);
    this.name = 'MembershipExitConflictError';
    this.code = reason;
  }
}

export interface MembershipExitPlan {
  readonly departingStatus: MembershipExitStatus;
  readonly consequence: MembershipExitConsequence;
  readonly statusRelease: StatusReleasePlan | null;
}

export function membershipExitPreviewExpiresAt(previewedAt: Date): Date {
  if (!Number.isFinite(previewedAt.getTime())) {
    throw new RangeError('previewedAt must be a valid date');
  }
  return new Date(previewedAt.getTime() + MEMBERSHIP_EXIT_PREVIEW_MINUTES * 60 * 1_000);
}

export function deriveMembershipExitPlan(input: {
  readonly actorUserId: string;
  readonly championUserId: string | null;
  readonly contenderUserId: string | null;
}): MembershipExitPlan {
  if (
    input.actorUserId === input.championUserId
    || input.actorUserId === input.contenderUserId
  ) {
    const statusRelease = deriveStatusReleasePlan(input);
    return {
      departingStatus: statusRelease.releasedStatus,
      consequence: statusRelease.consequence,
      statusRelease,
    };
  }
  return {
    departingStatus: 'ORDINARY',
    consequence: 'ORDINARY_EXIT',
    statusRelease: null,
  };
}

export function assertMembershipExitEligibility(input: {
  readonly accountActive: boolean;
  readonly membershipActive: boolean;
  readonly communityActive: boolean;
  readonly competitionActive: boolean;
  readonly integrityHoldActive: boolean;
  readonly hasActiveObligation: boolean;
  readonly hasLiveStatusProcess: boolean;
}): void {
  if (!input.accountActive) {
    throw new MembershipExitConflictError('MEMBERSHIP_EXIT_ACCOUNT_NOT_ACTIVE');
  }
  if (!input.membershipActive) {
    throw new MembershipExitConflictError('MEMBERSHIP_EXIT_MEMBERSHIP_NOT_ACTIVE');
  }
  if (!input.communityActive) {
    throw new MembershipExitConflictError('MEMBERSHIP_EXIT_COMMUNITY_NOT_ACTIVE');
  }
  if (!input.competitionActive) {
    throw new MembershipExitConflictError('MEMBERSHIP_EXIT_COMPETITION_NOT_ACTIVE');
  }
  if (input.integrityHoldActive) {
    throw new MembershipExitConflictError('MEMBERSHIP_EXIT_INTEGRITY_HOLD');
  }
  if (input.hasActiveObligation) {
    throw new MembershipExitConflictError('MEMBERSHIP_EXIT_ACTIVE_OBLIGATION');
  }
  if (input.hasLiveStatusProcess) {
    throw new MembershipExitConflictError('MEMBERSHIP_EXIT_LIVE_STATUS_PROCESS');
  }
}

export function assertMembershipExitCanBeConfirmed(input: {
  readonly state: string;
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly previewExpiresAt: Date;
  readonly occurredAt: Date;
  readonly tokenMatches: boolean;
  readonly previewMembershipVersion: number;
  readonly currentMembershipVersion: number;
  readonly previewStatusVersion: number;
  readonly currentStatusVersion: number;
  readonly previewChampionUserId: string | null;
  readonly currentChampionUserId: string | null;
  readonly previewContenderUserId: string | null;
  readonly currentContenderUserId: string | null;
}): void {
  if (input.state !== 'PREVIEWED') {
    throw new MembershipExitConflictError('MEMBERSHIP_EXIT_NOT_PREVIEWED');
  }
  if (input.actorUserId !== input.ownerUserId) {
    throw new MembershipExitConflictError('MEMBERSHIP_EXIT_OWNER_REQUIRED');
  }
  if (input.occurredAt >= input.previewExpiresAt) {
    throw new MembershipExitConflictError('MEMBERSHIP_EXIT_PREVIEW_EXPIRED');
  }
  if (!input.tokenMatches) {
    throw new MembershipExitConflictError('MEMBERSHIP_EXIT_TOKEN_INVALID');
  }
  if (
    input.previewMembershipVersion !== input.currentMembershipVersion
    || input.previewStatusVersion !== input.currentStatusVersion
    || input.previewChampionUserId !== input.currentChampionUserId
    || input.previewContenderUserId !== input.currentContenderUserId
  ) {
    throw new MembershipExitConflictError('MEMBERSHIP_EXIT_CONTEXT_CHANGED');
  }
}
