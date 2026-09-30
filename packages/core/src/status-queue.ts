export const STATUS_QUEUE_POLICY_VERSION = 'status-queue-mvp-v1' as const;
export const STATUS_QUEUE_RECONFIRMATION_HOURS = 24;
export const GENESIS_RESPONSE_HOURS = 48;
export const GENESIS_SINGLE_CANDIDATE_DAYS = 3;

export type CompetitionPhase =
  | 'FOUNDING_OPEN'
  | 'FOUNDING_CHALLENGE'
  | 'RUNNING'
  | 'CONTENDER_VACANT_OPEN'
  | 'CONTENDER_GENESIS'
  | 'CLOSED';

export type CompetitionAvailability = 'ACTIVE' | 'PAUSED' | 'CLOSED';
export type CompetitionStatus = 'ORDINARY' | 'CHAMPION' | 'CONTENDER';
export type QueueTargetStatus = 'CHAMPION' | 'CONTENDER';
export type QueueEntryKind = 'DIRECT_STATUS' | 'GENESIS_CANDIDATE' | 'PREBOOKED_CONVERSION';
export type QueueEntryState =
  | 'WAITING'
  | 'PAIRED_PENDING_ACCEPTANCE'
  | 'RECONFIRMATION_REQUIRED'
  | 'ACTIVATED'
  | 'CONSUMED'
  | 'WITHDRAWN'
  | 'INVALIDATED'
  | 'EXPIRED';

export type StatusQueueConflictCode =
  | 'ACCOUNT_NOT_ACTIVE'
  | 'ACCOUNT_NOT_VERIFIED'
  | 'COMMUNITY_NOT_ACTIVE'
  | 'MEMBERSHIP_NOT_ACTIVE'
  | 'AGE_CONTOUR_MISMATCH'
  | 'COMPETITION_NOT_ACTIVE'
  | 'COMPETITION_INTEGRITY_HOLD'
  | 'COMPETITION_PHASE_UNAVAILABLE'
  | 'ALREADY_STATUS_HOLDER'
  | 'LIVE_QUEUE_ENTRY_EXISTS'
  | 'PAIR_COOLDOWN_ACTIVE'
  | 'QUEUE_ENTRY_NOT_FOUND'
  | 'QUEUE_ENTRY_INITIATOR_REQUIRED'
  | 'QUEUE_ENTRY_NOT_WAITING'
  | 'QUEUE_ENTRY_NOT_HEAD'
  | 'STATUS_SLOT_OCCUPIED'
  | 'BOUND_HOLDER_CHANGED'
  | 'QUEUE_RECONFIRMATION_NOT_REQUIRED'
  | 'QUEUE_RECONFIRMATION_EXPIRED'
  | 'QUEUE_RECONFIRMATION_NOT_DUE'
  | 'GENESIS_CHALLENGE_NOT_FOUND'
  | 'GENESIS_PARTICIPANT_REQUIRED'
  | 'GENESIS_RESPONSE_NOT_PENDING'
  | 'GENESIS_RESPONSE_EXPIRED'
  | 'GENESIS_RESPONSE_NOT_DUE'
  | 'GENESIS_RESPONSE_ALREADY_RECORDED'
  | 'GENESIS_SINGLE_WINDOW_NOT_STARTED'
  | 'GENESIS_SINGLE_PROMOTION_NOT_DUE'
  | 'GENESIS_SINGLE_CANDIDATE_CHANGED'
  | 'RULESET_ACK_REQUIRED'
  | 'OFFICIAL_OBLIGATION_LIMIT';

export class StatusQueueConflictError extends Error {
  readonly code: StatusQueueConflictCode;

  constructor(readonly reason: StatusQueueConflictCode) {
    super(`Status queue action is not allowed: ${reason}`);
    this.name = 'StatusQueueConflictError';
    this.code = reason;
  }
}

export interface StatusQueueIntent {
  readonly kind: Exclude<QueueEntryKind, 'PREBOOKED_CONVERSION'>;
  readonly targetStatus: QueueTargetStatus;
  readonly boundHolderUserId: string | null;
}

export interface SubmitStatusQueueEligibility {
  readonly accountActive: boolean;
  readonly accountVerified: boolean;
  readonly communityActive: boolean;
  readonly membershipActive: boolean;
  readonly sameAgeContour: boolean;
  readonly competitionAvailability: CompetitionAvailability;
  readonly integrityHoldActive: boolean;
  readonly competitionPhase: CompetitionPhase;
  readonly actorStatus: CompetitionStatus;
  readonly contenderUserId: string | null;
  readonly hasLiveEntry: boolean;
  readonly pairCooldownActive: boolean;
}

export function statusQueueIntent(input: Pick<
  SubmitStatusQueueEligibility,
  'competitionPhase' | 'contenderUserId'
>): StatusQueueIntent {
  if (input.competitionPhase === 'FOUNDING_OPEN') {
    return {
      kind: 'GENESIS_CANDIDATE',
      targetStatus: 'CHAMPION',
      boundHolderUserId: null,
    };
  }
  if (input.competitionPhase === 'CONTENDER_VACANT_OPEN') {
    return {
      kind: 'GENESIS_CANDIDATE',
      targetStatus: 'CONTENDER',
      boundHolderUserId: null,
    };
  }
  if (input.competitionPhase === 'RUNNING' && input.contenderUserId !== null) {
    return {
      kind: 'DIRECT_STATUS',
      targetStatus: 'CONTENDER',
      boundHolderUserId: input.contenderUserId,
    };
  }
  throw new StatusQueueConflictError('COMPETITION_PHASE_UNAVAILABLE');
}

export function assertStatusQueueEntryCanBeSubmitted(
  input: SubmitStatusQueueEligibility,
): StatusQueueIntent {
  if (!input.accountActive) throw new StatusQueueConflictError('ACCOUNT_NOT_ACTIVE');
  if (!input.accountVerified) throw new StatusQueueConflictError('ACCOUNT_NOT_VERIFIED');
  if (!input.communityActive) throw new StatusQueueConflictError('COMMUNITY_NOT_ACTIVE');
  if (!input.membershipActive) throw new StatusQueueConflictError('MEMBERSHIP_NOT_ACTIVE');
  if (!input.sameAgeContour) throw new StatusQueueConflictError('AGE_CONTOUR_MISMATCH');
  if (input.competitionAvailability !== 'ACTIVE') {
    throw new StatusQueueConflictError('COMPETITION_NOT_ACTIVE');
  }
  if (input.integrityHoldActive) {
    throw new StatusQueueConflictError('COMPETITION_INTEGRITY_HOLD');
  }
  if (input.actorStatus !== 'ORDINARY') {
    throw new StatusQueueConflictError('ALREADY_STATUS_HOLDER');
  }
  if (input.hasLiveEntry) throw new StatusQueueConflictError('LIVE_QUEUE_ENTRY_EXISTS');
  if (input.pairCooldownActive) throw new StatusQueueConflictError('PAIR_COOLDOWN_ACTIVE');
  return statusQueueIntent(input);
}

export function assertStatusQueueEntryCanBeWithdrawn(input: {
  readonly actorUserId: string;
  readonly initiatorUserId: string;
  readonly state: QueueEntryState;
}): void {
  if (input.actorUserId !== input.initiatorUserId) {
    throw new StatusQueueConflictError('QUEUE_ENTRY_INITIATOR_REQUIRED');
  }
  if (input.state !== 'WAITING' && input.state !== 'RECONFIRMATION_REQUIRED') {
    throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_WAITING');
  }
}

export interface StatusQueueOrderKey {
  readonly submittedAt: string;
  readonly queueEntryId: string;
}

export function compareStatusQueueOrder(left: StatusQueueOrderKey, right: StatusQueueOrderKey): number {
  const byTime = left.submittedAt.localeCompare(right.submittedAt);
  return byTime === 0 ? left.queueEntryId.localeCompare(right.queueEntryId) : byTime;
}

export function genesisResponseDeadline(pairedAt: Date): Date {
  return new Date(pairedAt.getTime() + GENESIS_RESPONSE_HOURS * 60 * 60 * 1_000);
}

export function genesisSingleCandidateDeadline(singleSinceAt: Date): Date {
  if (!Number.isFinite(singleSinceAt.getTime())) {
    throw new RangeError('singleSinceAt must be a valid date');
  }
  return new Date(
    singleSinceAt.getTime() + GENESIS_SINGLE_CANDIDATE_DAYS * 24 * 60 * 60 * 1_000,
  );
}

export function assertSingleGenesisCandidateCanBePromoted(input: {
  readonly state: QueueEntryState;
  readonly kind: QueueEntryKind;
  readonly isOnlyCandidate: boolean;
  readonly singleCandidateSinceAt: Date | null;
  readonly occurredAt: Date;
}): void {
  if (input.state !== 'WAITING' || input.kind !== 'GENESIS_CANDIDATE') {
    throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_WAITING');
  }
  if (!input.isOnlyCandidate) {
    throw new StatusQueueConflictError('GENESIS_SINGLE_CANDIDATE_CHANGED');
  }
  if (input.singleCandidateSinceAt === null) {
    throw new StatusQueueConflictError('GENESIS_SINGLE_WINDOW_NOT_STARTED');
  }
  if (input.occurredAt < genesisSingleCandidateDeadline(input.singleCandidateSinceAt)) {
    throw new StatusQueueConflictError('GENESIS_SINGLE_PROMOTION_NOT_DUE');
  }
}

export function statusQueueReconfirmationDeadline(requestedAt: Date): Date {
  if (!Number.isFinite(requestedAt.getTime())) {
    throw new RangeError('requestedAt must be a valid date');
  }
  return new Date(requestedAt.getTime() + STATUS_QUEUE_RECONFIRMATION_HOURS * 60 * 60 * 1_000);
}

export function assertStatusQueueReconfirmationCanBeRequested(input: {
  readonly state: QueueEntryState;
  readonly kind: QueueEntryKind;
  readonly boundHolderUserId: string | null;
  readonly currentContenderUserId: string | null;
}): void {
  if (input.state !== 'WAITING' || input.kind !== 'DIRECT_STATUS') {
    throw new StatusQueueConflictError('QUEUE_RECONFIRMATION_NOT_REQUIRED');
  }
  if (
    input.currentContenderUserId === null
    || input.boundHolderUserId === input.currentContenderUserId
  ) {
    throw new StatusQueueConflictError('QUEUE_RECONFIRMATION_NOT_REQUIRED');
  }
}

export function assertStatusQueueEntryCanBeReconfirmed(input: {
  readonly state: QueueEntryState;
  readonly actorUserId: string;
  readonly initiatorUserId: string;
  readonly boundHolderUserId: string | null;
  readonly currentContenderUserId: string | null;
  readonly reconfirmationDeadlineAt: Date | null;
  readonly occurredAt: Date;
}): void {
  if (input.state !== 'RECONFIRMATION_REQUIRED') {
    throw new StatusQueueConflictError('QUEUE_RECONFIRMATION_NOT_REQUIRED');
  }
  if (input.actorUserId !== input.initiatorUserId) {
    throw new StatusQueueConflictError('QUEUE_ENTRY_INITIATOR_REQUIRED');
  }
  if (
    input.boundHolderUserId === null
    || input.boundHolderUserId !== input.currentContenderUserId
  ) {
    throw new StatusQueueConflictError('BOUND_HOLDER_CHANGED');
  }
  if (
    input.reconfirmationDeadlineAt === null
    || input.occurredAt >= input.reconfirmationDeadlineAt
  ) {
    throw new StatusQueueConflictError('QUEUE_RECONFIRMATION_EXPIRED');
  }
}

export function assertStatusQueueReconfirmationCanExpire(input: {
  readonly state: QueueEntryState;
  readonly reconfirmationDeadlineAt: Date | null;
  readonly occurredAt: Date;
}): void {
  if (input.state !== 'RECONFIRMATION_REQUIRED') {
    throw new StatusQueueConflictError('QUEUE_RECONFIRMATION_NOT_REQUIRED');
  }
  if (
    input.reconfirmationDeadlineAt === null
    || input.occurredAt < input.reconfirmationDeadlineAt
  ) {
    throw new StatusQueueConflictError('QUEUE_RECONFIRMATION_NOT_DUE');
  }
}

export function assertDirectStatusQueueHeadCanBeActivated(input: {
  readonly state: QueueEntryState;
  readonly kind: QueueEntryKind;
  readonly strictHead: boolean;
  readonly competitionPhase: CompetitionPhase;
  readonly statusSlotFree: boolean;
  readonly boundHolderUserId: string | null;
  readonly currentContenderUserId: string | null;
}): void {
  if (input.state !== 'WAITING' || input.kind !== 'DIRECT_STATUS') {
    throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_WAITING');
  }
  if (!input.strictHead) throw new StatusQueueConflictError('QUEUE_ENTRY_NOT_HEAD');
  if (input.competitionPhase !== 'RUNNING' || input.currentContenderUserId === null) {
    throw new StatusQueueConflictError('COMPETITION_PHASE_UNAVAILABLE');
  }
  if (!input.statusSlotFree) throw new StatusQueueConflictError('STATUS_SLOT_OCCUPIED');
  if (input.boundHolderUserId !== input.currentContenderUserId) {
    throw new StatusQueueConflictError('BOUND_HOLDER_CHANGED');
  }
}

export function assertGenesisResponseCanBeRecorded(input: {
  readonly state: string;
  readonly actorIsParticipant: boolean;
  readonly responseDeadlineAt: Date;
  readonly occurredAt: Date;
  readonly existingDecision: 'ACCEPT' | 'DECLINE' | null;
}): void {
  if (!input.actorIsParticipant) {
    throw new StatusQueueConflictError('GENESIS_PARTICIPANT_REQUIRED');
  }
  if (input.state !== 'AWAITING_RESPONSE') {
    throw new StatusQueueConflictError('GENESIS_RESPONSE_NOT_PENDING');
  }
  if (input.occurredAt.getTime() >= input.responseDeadlineAt.getTime()) {
    throw new StatusQueueConflictError('GENESIS_RESPONSE_EXPIRED');
  }
  if (input.existingDecision !== null) {
    throw new StatusQueueConflictError('GENESIS_RESPONSE_ALREADY_RECORDED');
  }
}

export function assertGenesisChallengeCanExpire(input: {
  readonly state: string;
  readonly responseDeadlineAt: Date;
  readonly occurredAt: Date;
}): void {
  if (input.state !== 'AWAITING_RESPONSE') {
    throw new StatusQueueConflictError('GENESIS_RESPONSE_NOT_PENDING');
  }
  if (input.occurredAt.getTime() < input.responseDeadlineAt.getTime()) {
    throw new StatusQueueConflictError('GENESIS_RESPONSE_NOT_DUE');
  }
}
