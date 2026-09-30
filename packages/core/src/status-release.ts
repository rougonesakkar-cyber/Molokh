export const STATUS_RELEASE_POLICY_VERSION = 'status-release-mvp-v1' as const;
export const STATUS_RELEASE_PREVIEW_MINUTES = 15;

export type ReleasableCompetitionStatus = 'CHAMPION' | 'CONTENDER';
export type StatusReleaseConsequence =
  | 'CHAMPION_SUCCESSION'
  | 'CHAMPION_VACANCY'
  | 'CONTENDER_VACANCY';

export type StatusReleaseConflictCode =
  | 'STATUS_RELEASE_ACCOUNT_NOT_ACTIVE'
  | 'STATUS_RELEASE_MEMBERSHIP_NOT_ACTIVE'
  | 'STATUS_RELEASE_COMPETITION_NOT_ACTIVE'
  | 'STATUS_RELEASE_INTEGRITY_HOLD'
  | 'STATUS_RELEASE_NOT_STATUS_HOLDER'
  | 'STATUS_RELEASE_ACTIVE_OBLIGATION'
  | 'STATUS_RELEASE_LIVE_CHALLENGE'
  | 'STATUS_RELEASE_NOT_FOUND'
  | 'STATUS_RELEASE_OWNER_REQUIRED'
  | 'STATUS_RELEASE_NOT_PREVIEWED'
  | 'STATUS_RELEASE_PREVIEW_EXPIRED'
  | 'STATUS_RELEASE_TOKEN_INVALID'
  | 'STATUS_RELEASE_STATUS_CHANGED';

export class StatusReleaseConflictError extends Error {
  readonly code: StatusReleaseConflictCode;

  constructor(readonly reason: StatusReleaseConflictCode) {
    super(`Status release is not allowed: ${reason}`);
    this.name = 'StatusReleaseConflictError';
    this.code = reason;
  }
}

export interface StatusReleasePlan {
  readonly releasedStatus: ReleasableCompetitionStatus;
  readonly consequence: StatusReleaseConsequence;
  readonly transitionId: 'ST-09' | 'ST-10' | 'ST-14';
  readonly eventName: 'ChampionSuccessionApplied' | 'ContenderVacated' | 'ChampionVacated';
  readonly afterChampionUserId: string | null;
  readonly afterContenderUserId: null;
  readonly afterPhase: 'CONTENDER_VACANT_OPEN' | 'FOUNDING_OPEN';
}

export function statusReleasePreviewExpiresAt(previewedAt: Date): Date {
  if (!Number.isFinite(previewedAt.getTime())) {
    throw new RangeError('previewedAt must be a valid date');
  }
  return new Date(previewedAt.getTime() + STATUS_RELEASE_PREVIEW_MINUTES * 60 * 1_000);
}

export function deriveStatusReleasePlan(input: {
  readonly actorUserId: string;
  readonly championUserId: string | null;
  readonly contenderUserId: string | null;
}): StatusReleasePlan {
  if (input.actorUserId === input.championUserId) {
    if (input.contenderUserId !== null) {
      return {
        releasedStatus: 'CHAMPION',
        consequence: 'CHAMPION_SUCCESSION',
        transitionId: 'ST-09',
        eventName: 'ChampionSuccessionApplied',
        afterChampionUserId: input.contenderUserId,
        afterContenderUserId: null,
        afterPhase: 'CONTENDER_VACANT_OPEN',
      };
    }
    return {
      releasedStatus: 'CHAMPION',
      consequence: 'CHAMPION_VACANCY',
      transitionId: 'ST-14',
      eventName: 'ChampionVacated',
      afterChampionUserId: null,
      afterContenderUserId: null,
      afterPhase: 'FOUNDING_OPEN',
    };
  }
  if (input.actorUserId === input.contenderUserId) {
    return {
      releasedStatus: 'CONTENDER',
      consequence: 'CONTENDER_VACANCY',
      transitionId: 'ST-10',
      eventName: 'ContenderVacated',
      afterChampionUserId: input.championUserId,
      afterContenderUserId: null,
      afterPhase: 'CONTENDER_VACANT_OPEN',
    };
  }
  throw new StatusReleaseConflictError('STATUS_RELEASE_NOT_STATUS_HOLDER');
}

export function assertStatusReleaseEligibility(input: {
  readonly accountActive: boolean;
  readonly membershipActive: boolean;
  readonly competitionActive: boolean;
  readonly integrityHoldActive: boolean;
  readonly hasActiveObligation: boolean;
  readonly hasBlockingLiveChallenge: boolean;
}): void {
  if (!input.accountActive) {
    throw new StatusReleaseConflictError('STATUS_RELEASE_ACCOUNT_NOT_ACTIVE');
  }
  if (!input.membershipActive) {
    throw new StatusReleaseConflictError('STATUS_RELEASE_MEMBERSHIP_NOT_ACTIVE');
  }
  if (!input.competitionActive) {
    throw new StatusReleaseConflictError('STATUS_RELEASE_COMPETITION_NOT_ACTIVE');
  }
  if (input.integrityHoldActive) {
    throw new StatusReleaseConflictError('STATUS_RELEASE_INTEGRITY_HOLD');
  }
  if (input.hasActiveObligation) {
    throw new StatusReleaseConflictError('STATUS_RELEASE_ACTIVE_OBLIGATION');
  }
  if (input.hasBlockingLiveChallenge) {
    throw new StatusReleaseConflictError('STATUS_RELEASE_LIVE_CHALLENGE');
  }
}

export function assertStatusReleaseCanBeConfirmed(input: {
  readonly state: string;
  readonly actorUserId: string;
  readonly ownerUserId: string;
  readonly previewExpiresAt: Date;
  readonly occurredAt: Date;
  readonly tokenMatches: boolean;
  readonly previewStatusVersion: number;
  readonly currentStatusVersion: number;
  readonly previewChampionUserId: string | null;
  readonly currentChampionUserId: string | null;
  readonly previewContenderUserId: string | null;
  readonly currentContenderUserId: string | null;
}): void {
  if (input.state !== 'PREVIEWED') {
    throw new StatusReleaseConflictError('STATUS_RELEASE_NOT_PREVIEWED');
  }
  if (input.actorUserId !== input.ownerUserId) {
    throw new StatusReleaseConflictError('STATUS_RELEASE_OWNER_REQUIRED');
  }
  if (input.occurredAt >= input.previewExpiresAt) {
    throw new StatusReleaseConflictError('STATUS_RELEASE_PREVIEW_EXPIRED');
  }
  if (!input.tokenMatches) {
    throw new StatusReleaseConflictError('STATUS_RELEASE_TOKEN_INVALID');
  }
  if (
    input.previewStatusVersion !== input.currentStatusVersion
    || input.previewChampionUserId !== input.currentChampionUserId
    || input.previewContenderUserId !== input.currentContenderUserId
  ) {
    throw new StatusReleaseConflictError('STATUS_RELEASE_STATUS_CHANGED');
  }
}
