export const SOCIAL_POLICY_VERSION = 'social-mvp-v1' as const;
export const LIKE_TTL_DAYS = 30;
export const DISCOVERY_SUPPRESSION_DAYS = 15;

export type LikeState =
  | 'ACTIVE'
  | 'MATCHED'
  | 'EXPIRED'
  | 'WITHDRAWN'
  | 'REMOVED_BY_SKIP';

export type MatchState = 'ACTIVE' | 'ARCHIVED' | 'UNMATCHED' | 'BLOCKED';

export type SocialPairEndKind = 'UNMATCH' | 'BLOCK';

export interface SocialPairEndPolicy {
  readonly matchState: Extract<MatchState, 'UNMATCHED' | 'BLOCKED'>;
  readonly suppressionDays: number | null;
  readonly closePersonalChat: true;
  readonly closeOptionalPreAcceptanceIntents: true;
  readonly preserveAcceptedObligations: true;
  readonly preserveStatusPaths: true;
}

export type SocialActionDenialCode =
  | 'SELF_ACTION_NOT_ALLOWED'
  | 'IDENTITY_NOT_FOUND'
  | 'ACCOUNT_NOT_ACTIVE'
  | 'DISCOVERY_PAUSED'
  | 'AGE_CONTOUR_MISMATCH'
  | 'PAIR_BLOCKED'
  | 'PAIR_SUPPRESSED'
  | 'MATCH_EXISTS'
  | 'OUTBOUND_LIKE_EXISTS'
  | 'DISCOVERY_CANDIDATE_UNAVAILABLE'
  | 'MATCH_NOT_FOUND'
  | 'MATCH_NOT_ACTIVE'
  | 'MATCH_PARTICIPANT_REQUIRED'
  | 'BLOCK_ALREADY_ACTIVE'
  | 'BLOCK_NOT_ACTIVE'
  | 'BLOCK_OWNER_REQUIRED'
  | 'LIKE_NOT_ACTIVE'
  | 'LIKE_NOT_DUE'
  | 'SUPPRESSION_NOT_ACTIVE'
  | 'SUPPRESSION_NOT_DUE';

export class SocialActionDeniedError extends Error {
  readonly code: SocialActionDenialCode;

  constructor(readonly reason: SocialActionDenialCode) {
    super(`Social action is not allowed: ${reason}`);
    this.name = 'SocialActionDeniedError';
    this.code = reason;
  }
}

export interface SocialPair {
  readonly lowUserId: string;
  readonly highUserId: string;
  readonly key: string;
}

function assertValidDate(value: Date, field: string): void {
  if (!Number.isFinite(value.getTime())) throw new RangeError(`${field} must be a valid date`);
}

function plusDays(value: Date, days: number): Date {
  assertValidDate(value, 'occurredAt');
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1_000);
}

export function normalizeSocialPair(firstUserId: string, secondUserId: string): SocialPair {
  const first = firstUserId.trim().toLowerCase();
  const second = secondUserId.trim().toLowerCase();
  if (!first || !second) throw new SocialActionDeniedError('IDENTITY_NOT_FOUND');
  if (first === second) throw new SocialActionDeniedError('SELF_ACTION_NOT_ALLOWED');
  const [lowUserId, highUserId] = first < second ? [first, second] : [second, first];
  return { lowUserId, highUserId, key: `${lowUserId}:${highUserId}` };
}

export function assertSameAgeContour(
  first: 'YOUTH' | 'ADULT',
  second: 'YOUTH' | 'ADULT',
): void {
  if (first !== second) throw new SocialActionDeniedError('AGE_CONTOUR_MISMATCH');
}

export function likeExpiresAt(createdAt: Date): Date {
  return plusDays(createdAt, LIKE_TTL_DAYS);
}

export function discoverySuppressionEndsAt(startedAt: Date): Date {
  return plusDays(startedAt, DISCOVERY_SUPPRESSION_DAYS);
}

export function newLikeState(reverseLikeActive: boolean): Extract<LikeState, 'ACTIVE' | 'MATCHED'> {
  return reverseLikeActive ? 'MATCHED' : 'ACTIVE';
}

export function socialPairEndPolicy(kind: SocialPairEndKind): SocialPairEndPolicy {
  return {
    matchState: kind === 'UNMATCH' ? 'UNMATCHED' : 'BLOCKED',
    suppressionDays: kind === 'UNMATCH' ? DISCOVERY_SUPPRESSION_DAYS : null,
    closePersonalChat: true,
    closeOptionalPreAcceptanceIntents: true,
    preserveAcceptedObligations: true,
    preserveStatusPaths: true,
  };
}

export function assertCanEndMatch(
  state: MatchState,
  actorUserId: string,
  pairLowUserId: string,
  pairHighUserId: string,
): void {
  if (state !== 'ACTIVE' && state !== 'ARCHIVED') {
    throw new SocialActionDeniedError('MATCH_NOT_ACTIVE');
  }
  const actor = actorUserId.trim().toLowerCase();
  if (actor !== pairLowUserId.trim().toLowerCase() && actor !== pairHighUserId.trim().toLowerCase()) {
    throw new SocialActionDeniedError('MATCH_PARTICIPANT_REQUIRED');
  }
}

export function assertBlockOwner(actorUserId: string, blockerUserId: string): void {
  if (actorUserId.trim().toLowerCase() !== blockerUserId.trim().toLowerCase()) {
    throw new SocialActionDeniedError('BLOCK_OWNER_REQUIRED');
  }
}
