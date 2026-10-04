import {
  SOCIAL_POLICY_VERSION,
  SocialActionDeniedError,
  assertBlockOwner,
  assertCanEndMatch,
  assertMatchCanBeArchived,
  assertSameAgeContour,
  discoverySuppressionEndsAt,
  likeExpiresAt,
  matchInactivityDeadline,
  newLikeState,
  normalizeSocialPair,
  socialPairEndPolicy,
  type CommandEnvelope,
  type LikeState,
  type MatchState,
  type TimerAggregateSnapshot,
} from '@molokh/core';
import { type Kysely, type Transaction, sql } from 'kysely';

import type { Database } from './index.js';
import {
  executeCriticalCommand,
  type ExecutedCommand,
  type RelatedDomainEventDraft,
} from './platform-command.js';

export interface CreateLikePayload {
  readonly targetUserId: string;
  readonly source: 'DISCOVERY';
}

export interface SkipDiscoveryPayload {
  readonly targetUserId: string;
}

export interface ExpireLikePayload {
  readonly likeId: string;
}

export interface ExpireDiscoverySuppressionPayload {
  readonly suppressionId: string;
}

export interface ExpireInactiveMatchPayload {
  readonly matchId: string;
}

export interface UnmatchPayload {
  readonly matchId: string;
}

export interface BlockUserPayload {
  readonly targetUserId: string;
  readonly reasonCode: string | null;
}

export interface UnblockUserPayload {
  readonly targetUserId: string;
}

export interface MatchProjection {
  readonly matchId: string;
  readonly chatId: string;
  readonly state: Extract<MatchState, 'ACTIVE' | 'ARCHIVED'>;
  readonly counterpartUserId: string;
  readonly counterpartDisplayName: string;
  readonly lastActivityAt: string;
  readonly version: number;
}

export interface LikeProjection {
  readonly likeId: string;
  readonly fromUserId: string;
  readonly toUserId: string;
  readonly state: LikeState;
  readonly expiresAt: string;
  readonly version: number;
}

export interface BlockProjection {
  readonly blockId: string;
  readonly blockedUserId: string;
  readonly blockedDisplayName: string;
  readonly state: 'ACTIVE' | 'REVOKED';
  readonly reasonCode: string | null;
  readonly createdAt: string;
  readonly revokedAt: string | null;
  readonly version: number;
}

export interface PreservedSocialObligationsProjection {
  readonly acceptedObligationsPreserved: true;
  readonly statusPathsPreserved: true;
  readonly optionalPreAcceptanceIntentsClosed: true;
}

export interface UnmatchProjection {
  readonly action: 'UNMATCHED';
  readonly matchId: string;
  readonly matchState: 'UNMATCHED';
  readonly chatId: string;
  readonly chatState: 'CLOSED';
  readonly suppressionUntil: string;
  readonly version: number;
  readonly preservation: PreservedSocialObligationsProjection;
}

export interface BlockActionProjection {
  readonly action: 'BLOCKED';
  readonly block: BlockProjection;
  readonly affectedMatch: {
    readonly matchId: string;
    readonly state: 'BLOCKED';
    readonly version: number;
  } | null;
  readonly personalChatClosed: boolean;
  readonly preservation: PreservedSocialObligationsProjection;
}

export interface UnblockActionProjection {
  readonly action: 'UNBLOCKED';
  readonly block: BlockProjection;
  readonly oldMatchRestored: false;
}

export type DiscoveryActionProjection =
  | {
      readonly action: 'LIKED';
      readonly like: LikeProjection;
      readonly match: null;
      readonly suppressionUntil: null;
    }
  | {
      readonly action: 'MATCHED';
      readonly like: LikeProjection;
      readonly match: MatchProjection;
      readonly suppressionUntil: null;
    }
  | {
      readonly action: 'SKIPPED';
      readonly like: null;
      readonly match: null;
      readonly suppressionUntil: string;
    };

export interface LikeEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly matchId: string;
  readonly chatId: string;
  readonly mutualEventId: string;
  readonly matchEventId: string;
  readonly chatEventId: string;
  readonly matchOutboxMessageId: string;
}

export interface SkipEffectIds {
  readonly suppressionId: string;
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly removedLikeEventId: string;
}

export interface ExpireLikeEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
}

export type ExpireDiscoverySuppressionEffectIds = ExpireLikeEffectIds;

export interface ExpireInactiveMatchEffectIds extends ExpireLikeEffectIds {
  readonly chatEventId: string;
}

export interface ArchivedMatchProjection {
  readonly matchId: string;
  readonly state: 'ARCHIVED';
  readonly chatId: string;
  readonly chatState: 'ARCHIVED';
  readonly lastActivityAt: string;
  readonly version: number;
}

export interface UnmatchEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly suppressionId: string;
  readonly suppressionEventId: string;
  readonly suppressionOutboxMessageId: string;
  readonly chatEventId: string;
}

export interface BlockEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly matchEventId: string;
  readonly chatEventId: string;
  readonly withdrawnLikeEventId: string;
}

export interface UnblockEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
}

interface PairIdentityRow {
  readonly user_id: string;
  readonly account_state: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
  readonly discovery_paused: boolean;
  readonly age_division: 'YOUTH' | 'ADULT';
  readonly city_code: string | null;
}

interface LikeRow {
  readonly like_id: string;
  readonly from_user_id: string;
  readonly to_user_id: string;
  readonly state: LikeState;
  readonly expires_at: Date;
  readonly version: string;
}

interface MatchRow {
  readonly match_id: string;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly state: MatchState;
  readonly chat_id: string;
  readonly version: string;
  readonly chat_state: 'OPEN' | 'ARCHIVED' | 'READ_ONLY' | 'CLOSED';
  readonly chat_version: string;
}

interface BlockRow {
  readonly block_id: string;
  readonly blocker_user_id: string;
  readonly blocked_user_id: string;
  readonly blocked_display_name: string;
  readonly state: 'ACTIVE' | 'REVOKED';
  readonly reason_code: string | null;
  readonly created_at: Date;
  readonly revoked_at: Date | null;
  readonly version: string;
}

const preservedSocialObligations: PreservedSocialObligationsProjection = {
  acceptedObligationsPreserved: true,
  statusPathsPreserved: true,
  optionalPreAcceptanceIntentsClosed: true,
};

function likeProjection(row: LikeRow): LikeProjection {
  return {
    likeId: row.like_id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    state: row.state,
    expiresAt: row.expires_at.toISOString(),
    version: Number(row.version),
  };
}

function blockProjection(row: BlockRow): BlockProjection {
  return {
    blockId: row.block_id,
    blockedUserId: row.blocked_user_id,
    blockedDisplayName: row.blocked_display_name,
    state: row.state,
    reasonCode: row.reason_code,
    createdAt: row.created_at.toISOString(),
    revokedAt: row.revoked_at?.toISOString() ?? null,
    version: Number(row.version),
  };
}

async function lockSocialPair(
  transaction: Transaction<Database>,
  firstUserId: string,
  secondUserId: string,
) {
  const pair = normalizeSocialPair(firstUserId, secondUserId);
  await sql`
    select pg_advisory_xact_lock(hashtextextended(${'SocialPair:' + pair.key}, 0))
  `.execute(transaction);
  return pair;
}

async function lockAndAssertDiscoveryPair(
  transaction: Transaction<Database>,
  viewerUserId: string,
  targetUserId: string,
): Promise<void> {
  const pair = await lockSocialPair(transaction, viewerUserId, targetUserId);

  const identityResult = await sql<PairIdentityRow>`
    select
      users.user_id,
      users.account_state,
      users.discovery_paused,
      users.age_division,
      venue.city_code
    from identity.users as users
    left join identity.athlete_profiles as profile on profile.user_id = users.user_id
    left join community.venues as venue on venue.venue_id = profile.home_venue_id
    where users.user_id in (${viewerUserId}::uuid, ${targetUserId}::uuid)
    for share of users
  `.execute(transaction);
  const identities = new Map(identityResult.rows.map((row) => [row.user_id, row]));
  const viewer = identities.get(viewerUserId);
  const target = identities.get(targetUserId);
  if (!viewer || !target) throw new SocialActionDeniedError('IDENTITY_NOT_FOUND');
  if (viewer.account_state !== 'ACTIVE' || target.account_state !== 'ACTIVE') {
    throw new SocialActionDeniedError('ACCOUNT_NOT_ACTIVE');
  }
  if (viewer.discovery_paused || target.discovery_paused) {
    throw new SocialActionDeniedError('DISCOVERY_PAUSED');
  }
  assertSameAgeContour(viewer.age_division, target.age_division);
  if (!viewer.city_code || viewer.city_code !== target.city_code) {
    throw new SocialActionDeniedError('DISCOVERY_CANDIDATE_UNAVAILABLE');
  }

  const gateResult = await sql<{
    readonly effective_block: boolean;
    readonly pair_suppressed: boolean;
    readonly live_match: boolean;
    readonly outbound_like: boolean;
  }>`
    select
      exists (
        select 1 from social.blocks as block
        where block.state = 'ACTIVE'
          and (
            (block.blocker_user_id = ${viewerUserId}::uuid and block.blocked_user_id = ${targetUserId}::uuid)
            or (block.blocker_user_id = ${targetUserId}::uuid and block.blocked_user_id = ${viewerUserId}::uuid)
          )
      ) as effective_block,
      exists (
        select 1 from social.discovery_pair_suppressions as suppression
        where suppression.pair_low_id = ${pair.lowUserId}::uuid
          and suppression.pair_high_id = ${pair.highUserId}::uuid
          and suppression.state = 'ACTIVE'
      ) as pair_suppressed,
      exists (
        select 1 from social.matches as matched
        where matched.pair_low_id = ${pair.lowUserId}::uuid
          and matched.pair_high_id = ${pair.highUserId}::uuid
          and matched.state in ('ACTIVE', 'ARCHIVED')
      ) as live_match,
      exists (
        select 1 from social.likes as outbound
        where outbound.from_user_id = ${viewerUserId}::uuid
          and outbound.to_user_id = ${targetUserId}::uuid
          and outbound.state = 'ACTIVE'
      ) as outbound_like
  `.execute(transaction);
  const gate = gateResult.rows[0];
  if (gate?.effective_block) throw new SocialActionDeniedError('PAIR_BLOCKED');
  if (gate?.pair_suppressed) throw new SocialActionDeniedError('PAIR_SUPPRESSED');
  if (gate?.live_match) throw new SocialActionDeniedError('MATCH_EXISTS');
  if (gate?.outbound_like) throw new SocialActionDeniedError('OUTBOUND_LIKE_EXISTS');
}

function timerPayload(like: LikeProjection) {
  return {
    commandType: 'EXPIRE_LIKE',
    aggregateType: 'Like',
    aggregateId: like.likeId,
    expectedState: 'ACTIVE',
    expectedVersion: like.version,
    deadlineAt: like.expiresAt,
    policyVersion: SOCIAL_POLICY_VERSION,
    idempotencyKey: `like:${like.likeId}:expire:v${like.version}`,
  } as const;
}

function suppressionTimerPayload(
  suppressionId: string,
  version: number,
  untilAt: Date,
) {
  return {
    commandType: 'EXPIRE_DISCOVERY_SUPPRESSION',
    aggregateType: 'DiscoveryPairSuppression',
    aggregateId: suppressionId,
    expectedState: 'ACTIVE',
    expectedVersion: version,
    deadlineAt: untilAt.toISOString(),
    policyVersion: SOCIAL_POLICY_VERSION,
    idempotencyKey: `discovery-suppression:${suppressionId}:expire:v${version}`,
  } as const;
}

export function matchTimerPayload(
  matchId: string,
  version: number,
  lastActivityAt: Date,
) {
  const deadlineAt = matchInactivityDeadline(lastActivityAt);
  return {
    commandType: 'EXPIRE_INACTIVE_MATCH',
    aggregateType: 'Match',
    aggregateId: matchId,
    expectedState: 'ACTIVE',
    expectedVersion: version,
    deadlineAt: deadlineAt.toISOString(),
    policyVersion: SOCIAL_POLICY_VERSION,
    idempotencyKey: `match:${matchId}:archive:v${version}`,
  } as const;
}

export async function createDiscoveryLike(
  database: Kysely<Database>,
  command: CommandEnvelope<CreateLikePayload>,
  ids: LikeEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<DiscoveryActionProjection>> {
  if (
    command.actor.id === null ||
    command.aggregateType !== 'Like' ||
    command.payload.source !== 'DISCOVERY'
  ) {
    throw new SocialActionDeniedError('DISCOVERY_CANDIDATE_UNAVAILABLE');
  }

  return executeCriticalCommand<CreateLikePayload, DiscoveryActionProjection>(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const actorId = command.actor.id!;
      await lockAndAssertDiscoveryPair(transaction, actorId, command.payload.targetUserId);
      const reverseResult = await sql<LikeRow>`
        select
          like_id, from_user_id, to_user_id, state, expires_at,
          version::text as version
        from social.likes
        where from_user_id = ${command.payload.targetUserId}::uuid
          and to_user_id = ${actorId}::uuid
          and state = 'ACTIVE'
        for update
      `.execute(transaction);
      const reverse = reverseResult.rows[0];
      const state = newLikeState(Boolean(reverse));
      const expiresAt = likeExpiresAt(context.occurredAt);
      await sql`
        insert into social.likes (
          like_id, from_user_id, to_user_id, state, source,
          created_at, expires_at, version, updated_at
        ) values (
          ${command.aggregateId}::uuid, ${actorId}::uuid,
          ${command.payload.targetUserId}::uuid, ${state}, 'DISCOVERY',
          ${context.occurredAt.toISOString()}::timestamptz,
          ${expiresAt.toISOString()}::timestamptz, ${context.nextVersion},
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      const createdLike: LikeProjection = {
        likeId: command.aggregateId,
        fromUserId: actorId,
        toUserId: command.payload.targetUserId,
        state,
        expiresAt: expiresAt.toISOString(),
        version: context.nextVersion,
      };

      if (!reverse) {
        return {
          responseStatus: 201,
          response: {
            action: 'LIKED',
            like: createdLike,
            match: null,
            suppressionUntil: null,
          } satisfies DiscoveryActionProjection,
          event: {
            eventId: ids.eventId,
            eventName: 'LikeCreated',
            schemaVersion: 1,
            transitionId: 'L-01',
            payload: { likeId: command.aggregateId, fromUserId: actorId, toUserId: command.payload.targetUserId },
            metadata: { policyVersion: SOCIAL_POLICY_VERSION },
          },
          audit: {
            auditId: ids.auditId,
            action: 'LIKE',
            transitionId: 'L-01',
            reasonCode: null,
            beforeState: null,
            afterState: 'ACTIVE',
            metadata: { source: 'DISCOVERY' },
          },
          outbox: [
            {
              messageId: ids.outboxMessageId,
              topic: 'social.like.created.v1',
              payload: { likeId: command.aggregateId, timer: timerPayload(createdLike) },
            },
          ],
        };
      }

      const pair = normalizeSocialPair(actorId, command.payload.targetUserId);
      const reverseVersion = Number(reverse.version) + 1;
      await sql`
        update social.likes
        set state = 'MATCHED', version = ${reverseVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where like_id = ${reverse.like_id}::uuid and state = 'ACTIVE'
      `.execute(transaction);
      await sql`
        insert into social.chats (chat_id, scope, state, version, created_at, updated_at)
        values (
          ${ids.chatId}::uuid, 'PERSONAL_MATCH', 'OPEN', 1,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into social.chat_participants (chat_id, user_id, joined_at)
        values
          (${ids.chatId}::uuid, ${pair.lowUserId}::uuid, ${context.occurredAt.toISOString()}::timestamptz),
          (${ids.chatId}::uuid, ${pair.highUserId}::uuid, ${context.occurredAt.toISOString()}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into social.matches (
          match_id, pair_low_id, pair_high_id, state, chat_id,
          last_activity_at, version, created_at, updated_at
        ) values (
          ${ids.matchId}::uuid, ${pair.lowUserId}::uuid, ${pair.highUserId}::uuid,
          'ACTIVE', ${ids.chatId}::uuid,
          ${context.occurredAt.toISOString()}::timestamptz, 1,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      const counterpartNameResult = await sql<{ readonly display_name: string }>`
        select display_name from identity.users where user_id = ${command.payload.targetUserId}::uuid
      `.execute(transaction);
      const matchedLike = { ...createdLike, state: 'MATCHED' } as const;
      const match: MatchProjection = {
        matchId: ids.matchId,
        chatId: ids.chatId,
        state: 'ACTIVE',
        counterpartUserId: command.payload.targetUserId,
        counterpartDisplayName: counterpartNameResult.rows[0]?.display_name ?? '',
        lastActivityAt: context.occurredAt.toISOString(),
        version: 1,
      };
      const relatedEvents: RelatedDomainEventDraft[] = [
        {
          eventId: ids.mutualEventId,
          eventName: 'MutualLikeDetected',
          schemaVersion: 1,
          transitionId: 'L-02',
          aggregateType: 'LikePair',
          aggregateId: ids.matchId,
          aggregateVersion: 1,
          payload: { likeIds: [reverse.like_id, command.aggregateId], matchId: ids.matchId },
          metadata: { policyVersion: SOCIAL_POLICY_VERSION },
        },
        {
          eventId: ids.matchEventId,
          eventName: 'MatchCreated',
          schemaVersion: 1,
          transitionId: 'MT-01',
          aggregateType: 'Match',
          aggregateId: ids.matchId,
          aggregateVersion: 1,
          payload: { matchId: ids.matchId, chatId: ids.chatId, pairLowId: pair.lowUserId, pairHighId: pair.highUserId },
          metadata: { policyVersion: SOCIAL_POLICY_VERSION },
        },
        {
          eventId: ids.chatEventId,
          eventName: 'ChatOpened',
          schemaVersion: 1,
          transitionId: 'CT-01',
          aggregateType: 'Chat',
          aggregateId: ids.chatId,
          aggregateVersion: 1,
          payload: {
            chatId: ids.chatId,
            scope: 'PERSONAL_MATCH',
            matchId: ids.matchId,
            participants: [pair.lowUserId, pair.highUserId],
          },
          metadata: { policyVersion: SOCIAL_POLICY_VERSION },
        },
      ];
      return {
        responseStatus: 201,
        response: {
          action: 'MATCHED',
          like: matchedLike,
          match,
          suppressionUntil: null,
        } satisfies DiscoveryActionProjection,
        event: {
          eventId: ids.eventId,
          eventName: 'LikeCreated',
          schemaVersion: 1,
          transitionId: 'L-01',
          payload: { likeId: command.aggregateId, fromUserId: actorId, toUserId: command.payload.targetUserId },
          metadata: { policyVersion: SOCIAL_POLICY_VERSION },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId,
          action: 'LIKE',
          transitionId: 'L-02',
          reasonCode: null,
          beforeState: null,
          afterState: 'MATCHED',
          metadata: { matchId: ids.matchId, reverseLikeId: reverse.like_id, source: 'DISCOVERY' },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'social.like.mutual.v1',
            sourceEventId: ids.mutualEventId,
            payload: { likeIds: [reverse.like_id, command.aggregateId], matchId: ids.matchId },
          },
          {
            messageId: ids.matchOutboxMessageId,
            topic: 'social.match.created.v1',
            sourceEventId: ids.matchEventId,
            payload: {
              matchId: ids.matchId,
              chatId: ids.chatId,
              participants: [pair.lowUserId, pair.highUserId],
              timer: matchTimerPayload(ids.matchId, 1, context.occurredAt),
            },
          },
        ],
      };
    },
  });
}

export async function skipDiscoveryCandidate(
  database: Kysely<Database>,
  command: CommandEnvelope<SkipDiscoveryPayload>,
  ids: SkipEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<DiscoveryActionProjection>> {
  if (
    command.actor.id === null ||
    command.aggregateType !== 'DiscoveryPairSuppression' ||
    command.aggregateId !== ids.suppressionId
  ) {
    throw new SocialActionDeniedError('DISCOVERY_CANDIDATE_UNAVAILABLE');
  }
  return executeCriticalCommand<SkipDiscoveryPayload, DiscoveryActionProjection>(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const actorId = command.actor.id!;
      await lockAndAssertDiscoveryPair(transaction, actorId, command.payload.targetUserId);
      const pair = normalizeSocialPair(actorId, command.payload.targetUserId);
      const inboundResult = await sql<LikeRow>`
        select like_id, from_user_id, to_user_id, state, expires_at, version::text as version
        from social.likes
        where from_user_id = ${command.payload.targetUserId}::uuid
          and to_user_id = ${actorId}::uuid
          and state = 'ACTIVE'
        for update
      `.execute(transaction);
      const inbound = inboundResult.rows[0];
      const untilAt = discoverySuppressionEndsAt(context.occurredAt);
      await sql`
        insert into social.discovery_pair_suppressions (
          suppression_id, pair_low_id, pair_high_id, reason, state,
          started_at, until_at, version, updated_at
        ) values (
          ${ids.suppressionId}::uuid, ${pair.lowUserId}::uuid, ${pair.highUserId}::uuid,
          'SKIP', 'ACTIVE', ${context.occurredAt.toISOString()}::timestamptz,
          ${untilAt.toISOString()}::timestamptz, ${context.nextVersion},
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      const relatedEvents: RelatedDomainEventDraft[] = [];
      if (inbound) {
        const nextLikeVersion = Number(inbound.version) + 1;
        await sql`
          update social.likes
          set state = 'REMOVED_BY_SKIP', version = ${nextLikeVersion},
              updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where like_id = ${inbound.like_id}::uuid and state = 'ACTIVE'
        `.execute(transaction);
        relatedEvents.push({
          eventId: ids.removedLikeEventId,
          eventName: 'LikeRemovedBySkip',
          schemaVersion: 1,
          transitionId: 'L-04',
          aggregateType: 'Like',
          aggregateId: inbound.like_id,
          aggregateVersion: nextLikeVersion,
          payload: { likeId: inbound.like_id, suppressionId: ids.suppressionId },
          metadata: { policyVersion: SOCIAL_POLICY_VERSION },
        });
      }
      return {
        responseStatus: 201,
        response: {
          action: 'SKIPPED',
          like: null,
          match: null,
          suppressionUntil: untilAt.toISOString(),
        } satisfies DiscoveryActionProjection,
        event: {
          eventId: ids.eventId,
          eventName: 'PairSuppressionStarted',
          schemaVersion: 1,
          transitionId: 'DS-01',
          payload: { suppressionId: ids.suppressionId, pairLowId: pair.lowUserId, pairHighId: pair.highUserId, reason: 'SKIP', untilAt: untilAt.toISOString() },
          metadata: { policyVersion: SOCIAL_POLICY_VERSION },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId,
          action: 'SKIP',
          transitionId: inbound ? 'L-04' : 'DS-01',
          reasonCode: null,
          beforeState: null,
          afterState: 'ACTIVE',
          metadata: { inboundLikeRemoved: Boolean(inbound), suppressionUntil: untilAt.toISOString() },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'social.pair.suppressed.v1',
            payload: {
              suppressionId: ids.suppressionId,
              reason: 'SKIP',
              untilAt: untilAt.toISOString(),
              timer: suppressionTimerPayload(
                ids.suppressionId,
                context.nextVersion,
                untilAt,
              ),
            },
          },
        ],
      };
    },
  });
}

export async function unmatchPair(
  database: Kysely<Database>,
  command: CommandEnvelope<UnmatchPayload>,
  ids: UnmatchEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<UnmatchProjection>> {
  if (
    command.actor.id === null ||
    command.aggregateType !== 'Match' ||
    command.aggregateId !== command.payload.matchId
  ) {
    throw new SocialActionDeniedError('MATCH_PARTICIPANT_REQUIRED');
  }
  return executeCriticalCommand<UnmatchPayload, UnmatchProjection>(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const candidateResult = await sql<Pick<MatchRow, 'pair_low_id' | 'pair_high_id'>>`
        select pair_low_id, pair_high_id
        from social.matches
        where match_id = ${command.aggregateId}::uuid
      `.execute(transaction);
      const candidate = candidateResult.rows[0];
      if (!candidate) throw new SocialActionDeniedError('MATCH_NOT_FOUND');
      await lockSocialPair(transaction, candidate.pair_low_id, candidate.pair_high_id);

      const matchResult = await sql<MatchRow>`
        select
          matched.match_id, matched.pair_low_id, matched.pair_high_id, matched.state,
          matched.chat_id, matched.version::text as version,
          chat.state as chat_state, chat.version::text as chat_version
        from social.matches as matched
        join social.chats as chat on chat.chat_id = matched.chat_id
        where matched.match_id = ${command.aggregateId}::uuid
        for update of matched, chat
      `.execute(transaction);
      const match = matchResult.rows[0];
      if (!match) throw new SocialActionDeniedError('MATCH_NOT_FOUND');
      assertCanEndMatch(
        match.state,
        command.actor.id!,
        match.pair_low_id,
        match.pair_high_id,
      );
      if (match.chat_state === 'CLOSED') {
        throw new SocialActionDeniedError('MATCH_NOT_ACTIVE');
      }

      const policy = socialPairEndPolicy('UNMATCH');
      const suppressionUntil = discoverySuppressionEndsAt(context.occurredAt);
      const chatVersion = Number(match.chat_version) + 1;
      await sql`
        update social.matches
        set state = ${policy.matchState}, unmatched_by = ${command.actor.id}::uuid,
            unmatched_at = ${context.occurredAt.toISOString()}::timestamptz,
            rediscovery_after = ${suppressionUntil.toISOString()}::timestamptz,
            version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where match_id = ${match.match_id}::uuid
      `.execute(transaction);
      await sql`
        update social.chats
        set state = 'CLOSED', version = ${chatVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where chat_id = ${match.chat_id}::uuid
      `.execute(transaction);
      await sql`
        insert into social.discovery_pair_suppressions (
          suppression_id, pair_low_id, pair_high_id, reason, state,
          started_at, until_at, version, updated_at
        ) values (
          ${ids.suppressionId}::uuid, ${match.pair_low_id}::uuid,
          ${match.pair_high_id}::uuid, 'UNMATCH', 'ACTIVE',
          ${context.occurredAt.toISOString()}::timestamptz,
          ${suppressionUntil.toISOString()}::timestamptz, 1,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);

      return {
        responseStatus: 200,
        response: {
          action: 'UNMATCHED',
          matchId: match.match_id,
          matchState: 'UNMATCHED',
          chatId: match.chat_id,
          chatState: 'CLOSED',
          suppressionUntil: suppressionUntil.toISOString(),
          version: context.nextVersion,
          preservation: preservedSocialObligations,
        },
        event: {
          eventId: ids.eventId,
          eventName: 'MatchEnded',
          schemaVersion: 1,
          transitionId: 'MT-04',
          payload: {
            matchId: match.match_id,
            endedBy: command.actor.id,
            suppressionId: ids.suppressionId,
            suppressionUntil: suppressionUntil.toISOString(),
          },
          metadata: { policyVersion: SOCIAL_POLICY_VERSION, preservation: preservedSocialObligations },
        },
        relatedEvents: [
          {
            eventId: ids.suppressionEventId,
            eventName: 'PairSuppressionStarted',
            schemaVersion: 1,
            transitionId: 'DS-01',
            aggregateType: 'DiscoveryPairSuppression',
            aggregateId: ids.suppressionId,
            aggregateVersion: 1,
            payload: {
              suppressionId: ids.suppressionId,
              pairLowId: match.pair_low_id,
              pairHighId: match.pair_high_id,
              reason: 'UNMATCH',
              untilAt: suppressionUntil.toISOString(),
            },
            metadata: { policyVersion: SOCIAL_POLICY_VERSION },
          },
          {
            eventId: ids.chatEventId,
            eventName: 'ChatClosed',
            schemaVersion: 1,
            transitionId: 'CT-06',
            aggregateType: 'Chat',
            aggregateId: match.chat_id,
            aggregateVersion: chatVersion,
            payload: { chatId: match.chat_id, source: 'UNMATCH', matchId: match.match_id },
            metadata: { policyVersion: SOCIAL_POLICY_VERSION },
          },
        ],
        audit: {
          auditId: ids.auditId,
          action: 'UNMATCH',
          transitionId: 'MT-04',
          reasonCode: null,
          beforeState: match.state,
          afterState: 'UNMATCHED',
          metadata: {
            chatId: match.chat_id,
            suppressionUntil: suppressionUntil.toISOString(),
            preservation: preservedSocialObligations,
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'social.match.ended.v1',
            payload: {
              matchId: match.match_id,
              pair: [match.pair_low_id, match.pair_high_id],
              preservation: preservedSocialObligations,
            },
          },
          {
            messageId: ids.suppressionOutboxMessageId,
            topic: 'social.pair.suppressed.v1',
            sourceEventId: ids.suppressionEventId,
            payload: {
              suppressionId: ids.suppressionId,
              reason: 'UNMATCH',
              untilAt: suppressionUntil.toISOString(),
              timer: suppressionTimerPayload(ids.suppressionId, 1, suppressionUntil),
            },
          },
        ],
      };
    },
  });
}

export async function blockUser(
  database: Kysely<Database>,
  command: CommandEnvelope<BlockUserPayload>,
  ids: BlockEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<BlockActionProjection>> {
  if (command.actor.id === null || command.aggregateType !== 'Block') {
    throw new SocialActionDeniedError('BLOCK_OWNER_REQUIRED');
  }
  normalizeSocialPair(command.actor.id, command.payload.targetUserId);
  return executeCriticalCommand<BlockUserPayload, BlockActionProjection>(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const actorId = command.actor.id!;
      const pair = await lockSocialPair(transaction, actorId, command.payload.targetUserId);
      const targetResult = await sql<{ readonly user_id: string; readonly display_name: string }>`
        select user_id, display_name
        from identity.users
        where user_id = ${command.payload.targetUserId}::uuid
        for share
      `.execute(transaction);
      const target = targetResult.rows[0];
      if (!target) throw new SocialActionDeniedError('IDENTITY_NOT_FOUND');
      const existingResult = await sql<{ readonly block_id: string }>`
        select block_id
        from social.blocks
        where blocker_user_id = ${actorId}::uuid
          and blocked_user_id = ${command.payload.targetUserId}::uuid
          and state = 'ACTIVE'
        for update
      `.execute(transaction);
      if (existingResult.rows[0]) throw new SocialActionDeniedError('BLOCK_ALREADY_ACTIVE');

      const activeLikeResult = await sql<LikeRow>`
        select like_id, from_user_id, to_user_id, state, expires_at, version::text as version
        from social.likes
        where state = 'ACTIVE'
          and from_user_id in (${pair.lowUserId}::uuid, ${pair.highUserId}::uuid)
          and to_user_id in (${pair.lowUserId}::uuid, ${pair.highUserId}::uuid)
        for update
      `.execute(transaction);
      const activeLike = activeLikeResult.rows[0];
      const matchResult = await sql<MatchRow>`
        select
          matched.match_id, matched.pair_low_id, matched.pair_high_id, matched.state,
          matched.chat_id, matched.version::text as version,
          chat.state as chat_state, chat.version::text as chat_version
        from social.matches as matched
        join social.chats as chat on chat.chat_id = matched.chat_id
        where matched.pair_low_id = ${pair.lowUserId}::uuid
          and matched.pair_high_id = ${pair.highUserId}::uuid
          and matched.state in ('ACTIVE', 'ARCHIVED')
        for update of matched, chat
      `.execute(transaction);
      const match = matchResult.rows[0];
      const relatedEvents: RelatedDomainEventDraft[] = [];

      if (activeLike) {
        const nextLikeVersion = Number(activeLike.version) + 1;
        await sql`
          update social.likes
          set state = 'WITHDRAWN', version = ${nextLikeVersion},
              updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where like_id = ${activeLike.like_id}::uuid and state = 'ACTIVE'
        `.execute(transaction);
        relatedEvents.push({
          eventId: ids.withdrawnLikeEventId,
          eventName: 'LikeWithdrawn',
          schemaVersion: 1,
          transitionId: 'L-03',
          aggregateType: 'Like',
          aggregateId: activeLike.like_id,
          aggregateVersion: nextLikeVersion,
          payload: { likeId: activeLike.like_id, source: 'BLOCK' },
          metadata: { policyVersion: SOCIAL_POLICY_VERSION },
        });
      }

      let affectedMatch: BlockActionProjection['affectedMatch'] = null;
      if (match) {
        const nextMatchVersion = Number(match.version) + 1;
        const nextChatVersion = Number(match.chat_version) + 1;
        await sql`
          update social.matches
          set state = 'BLOCKED', version = ${nextMatchVersion},
              updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where match_id = ${match.match_id}::uuid
        `.execute(transaction);
        await sql`
          update social.chats
          set state = 'CLOSED', version = ${nextChatVersion},
              updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where chat_id = ${match.chat_id}::uuid
        `.execute(transaction);
        relatedEvents.push(
          {
            eventId: ids.matchEventId,
            eventName: 'MatchBlocked',
            schemaVersion: 1,
            transitionId: 'MT-05',
            aggregateType: 'Match',
            aggregateId: match.match_id,
            aggregateVersion: nextMatchVersion,
            payload: { matchId: match.match_id, blockId: command.aggregateId },
            metadata: { policyVersion: SOCIAL_POLICY_VERSION, preservation: preservedSocialObligations },
          },
          {
            eventId: ids.chatEventId,
            eventName: 'ChatClosed',
            schemaVersion: 1,
            transitionId: 'CT-06',
            aggregateType: 'Chat',
            aggregateId: match.chat_id,
            aggregateVersion: nextChatVersion,
            payload: { chatId: match.chat_id, source: 'BLOCK', matchId: match.match_id },
            metadata: { policyVersion: SOCIAL_POLICY_VERSION },
          },
        );
        affectedMatch = { matchId: match.match_id, state: 'BLOCKED', version: nextMatchVersion };
      }

      await sql`
        insert into social.blocks (
          block_id, blocker_user_id, blocked_user_id, state,
          reason_code, version, created_at, revoked_at
        ) values (
          ${command.aggregateId}::uuid, ${actorId}::uuid,
          ${command.payload.targetUserId}::uuid, 'ACTIVE',
          ${command.payload.reasonCode}, ${context.nextVersion},
          ${context.occurredAt.toISOString()}::timestamptz, null
        )
      `.execute(transaction);
      const block: BlockProjection = {
        blockId: command.aggregateId,
        blockedUserId: target.user_id,
        blockedDisplayName: target.display_name,
        state: 'ACTIVE',
        reasonCode: command.payload.reasonCode,
        createdAt: context.occurredAt.toISOString(),
        revokedAt: null,
        version: context.nextVersion,
      };

      return {
        responseStatus: 201,
        response: {
          action: 'BLOCKED',
          block,
          affectedMatch,
          personalChatClosed: Boolean(match),
          preservation: preservedSocialObligations,
        },
        event: {
          eventId: ids.eventId,
          eventName: 'BlockCreated',
          schemaVersion: 1,
          transitionId: 'BL-01',
          payload: {
            blockId: command.aggregateId,
            blockerUserId: actorId,
            blockedUserId: command.payload.targetUserId,
            affectedMatchId: match?.match_id ?? null,
          },
          metadata: { policyVersion: SOCIAL_POLICY_VERSION, preservation: preservedSocialObligations },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId,
          action: 'BLOCK_USER',
          transitionId: 'BL-01',
          reasonCode: command.payload.reasonCode,
          beforeState: null,
          afterState: 'ACTIVE',
          metadata: {
            affectedMatchId: match?.match_id ?? null,
            personalChatClosed: Boolean(match),
            activeLikeWithdrawn: Boolean(activeLike),
            preservation: preservedSocialObligations,
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'social.block.created.v1',
            payload: {
              blockId: command.aggregateId,
              blockerUserId: actorId,
              blockedUserId: command.payload.targetUserId,
              affectedMatchId: match?.match_id ?? null,
              preservation: preservedSocialObligations,
            },
          },
        ],
      };
    },
  });
}

export async function readLatestDirectedBlock(
  database: Kysely<Database>,
  blockerUserId: string,
  blockedUserId: string,
): Promise<BlockProjection | null> {
  const result = await sql<BlockRow>`
    select
      block.block_id, block.blocker_user_id, block.blocked_user_id,
      blocked.display_name as blocked_display_name, block.state, block.reason_code,
      block.created_at, block.revoked_at, block.version::text as version
    from social.blocks as block
    join identity.users as blocked on blocked.user_id = block.blocked_user_id
    where block.blocker_user_id = ${blockerUserId}::uuid
      and block.blocked_user_id = ${blockedUserId}::uuid
    order by (block.state = 'ACTIVE') desc, block.created_at desc, block.block_id desc
    limit 1
  `.execute(database);
  return result.rows[0] ? blockProjection(result.rows[0]) : null;
}

export async function readActiveBlocks(
  database: Kysely<Database>,
  blockerUserId: string,
): Promise<readonly BlockProjection[]> {
  const result = await sql<BlockRow>`
    select
      block.block_id, block.blocker_user_id, block.blocked_user_id,
      blocked.display_name as blocked_display_name, block.state, block.reason_code,
      block.created_at, block.revoked_at, block.version::text as version
    from social.blocks as block
    join identity.users as blocked on blocked.user_id = block.blocked_user_id
    where block.blocker_user_id = ${blockerUserId}::uuid
      and block.state = 'ACTIVE'
    order by block.created_at desc, block.block_id
  `.execute(database);
  return result.rows.map(blockProjection);
}

export async function unblockUser(
  database: Kysely<Database>,
  command: CommandEnvelope<UnblockUserPayload>,
  ids: UnblockEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<UnblockActionProjection>> {
  if (command.actor.id === null || command.aggregateType !== 'Block') {
    throw new SocialActionDeniedError('BLOCK_OWNER_REQUIRED');
  }
  return executeCriticalCommand<UnblockUserPayload, UnblockActionProjection>(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const candidateResult = await sql<Pick<BlockRow, 'blocker_user_id' | 'blocked_user_id'>>`
        select blocker_user_id, blocked_user_id
        from social.blocks
        where block_id = ${command.aggregateId}::uuid
      `.execute(transaction);
      const candidate = candidateResult.rows[0];
      if (!candidate) throw new SocialActionDeniedError('BLOCK_NOT_ACTIVE');
      assertBlockOwner(command.actor.id!, candidate.blocker_user_id);
      if (candidate.blocked_user_id !== command.payload.targetUserId) {
        throw new SocialActionDeniedError('BLOCK_OWNER_REQUIRED');
      }
      await lockSocialPair(transaction, candidate.blocker_user_id, candidate.blocked_user_id);
      const blockResult = await sql<BlockRow>`
        select
          block.block_id, block.blocker_user_id, block.blocked_user_id,
          blocked.display_name as blocked_display_name, block.state, block.reason_code,
          block.created_at, block.revoked_at, block.version::text as version
        from social.blocks as block
        join identity.users as blocked on blocked.user_id = block.blocked_user_id
        where block.block_id = ${command.aggregateId}::uuid
        for update of block
      `.execute(transaction);
      const row = blockResult.rows[0];
      if (!row || row.state !== 'ACTIVE') {
        throw new SocialActionDeniedError('BLOCK_NOT_ACTIVE');
      }
      await sql`
        update social.blocks
        set state = 'REVOKED', version = ${context.nextVersion},
            revoked_at = ${context.occurredAt.toISOString()}::timestamptz
        where block_id = ${row.block_id}::uuid and state = 'ACTIVE'
      `.execute(transaction);
      const block: BlockProjection = {
        ...blockProjection(row),
        state: 'REVOKED',
        revokedAt: context.occurredAt.toISOString(),
        version: context.nextVersion,
      };
      return {
        responseStatus: 200,
        response: { action: 'UNBLOCKED', block, oldMatchRestored: false },
        event: {
          eventId: ids.eventId,
          eventName: 'BlockRevoked',
          schemaVersion: 1,
          transitionId: 'BL-02',
          payload: {
            blockId: row.block_id,
            blockerUserId: row.blocker_user_id,
            blockedUserId: row.blocked_user_id,
            oldMatchRestored: false,
          },
          metadata: { policyVersion: SOCIAL_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'UNBLOCK_USER',
          transitionId: 'BL-02',
          reasonCode: null,
          beforeState: 'ACTIVE',
          afterState: 'REVOKED',
          metadata: { oldMatchRestored: false },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'social.block.revoked.v1',
            payload: {
              blockId: row.block_id,
              blockerUserId: row.blocker_user_id,
              blockedUserId: row.blocked_user_id,
              oldMatchRestored: false,
            },
          },
        ],
      };
    },
  });
}

export async function readMatches(
  database: Kysely<Database>,
  userId: string,
): Promise<readonly MatchProjection[]> {
  const result = await sql<{
    readonly match_id: string;
    readonly chat_id: string;
    readonly state: MatchProjection['state'];
    readonly counterpart_user_id: string;
    readonly counterpart_display_name: string;
    readonly last_activity_at: Date;
    readonly version: string;
  }>`
    select
      matched.match_id,
      matched.chat_id,
      matched.state,
      counterpart.user_id as counterpart_user_id,
      counterpart.display_name as counterpart_display_name,
      matched.last_activity_at,
      matched.version::text as version
    from social.matches as matched
    join identity.users as counterpart
      on counterpart.user_id = case
        when matched.pair_low_id = ${userId}::uuid then matched.pair_high_id
        else matched.pair_low_id
      end
    where ${userId}::uuid in (matched.pair_low_id, matched.pair_high_id)
      and matched.state in ('ACTIVE', 'ARCHIVED')
    order by matched.last_activity_at desc, matched.match_id
  `.execute(database);
  return result.rows.map((row) => ({
    matchId: row.match_id,
    chatId: row.chat_id,
    state: row.state,
    counterpartUserId: row.counterpart_user_id,
    counterpartDisplayName: row.counterpart_display_name,
    lastActivityAt: row.last_activity_at.toISOString(),
    version: Number(row.version),
  }));
}

export async function readMatchTimerSnapshot(
  database: Kysely<Database>,
  matchId: string,
): Promise<TimerAggregateSnapshot> {
  const result = await sql<{
    readonly state: MatchState;
    readonly version: string;
    readonly last_activity_at: Date;
  }>`
    select state, version::text as version, last_activity_at
    from social.matches
    where match_id = ${matchId}::uuid
  `.execute(database);
  const row = result.rows[0];
  return row
    ? {
        state: row.state,
        version: Number(row.version),
        deadlineAt: matchInactivityDeadline(row.last_activity_at).toISOString(),
      }
    : { state: 'MISSING', version: 0 };
}

export async function archiveInactiveMatch(
  database: Kysely<Database>,
  command: CommandEnvelope<ExpireInactiveMatchPayload>,
  ids: ExpireInactiveMatchEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<ArchivedMatchProjection>> {
  if (
    command.actor.type !== 'SYSTEM'
    || command.actor.id !== null
    || command.aggregateType !== 'Match'
    || command.commandType !== 'EXPIRE_INACTIVE_MATCH'
    || command.payload.matchId !== command.aggregateId
  ) {
    throw new SocialActionDeniedError('MATCH_NOT_ACTIVE');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const result = await sql<{
        readonly match_id: string;
        readonly state: MatchState;
        readonly chat_id: string;
        readonly last_activity_at: Date;
        readonly version: string;
        readonly chat_state: 'OPEN' | 'ARCHIVED' | 'READ_ONLY' | 'CLOSED';
        readonly chat_version: string;
      }>`
        select matched.match_id, matched.state, matched.chat_id,
          matched.last_activity_at, matched.version::text as version,
          chat.state as chat_state, chat.version::text as chat_version
        from social.matches as matched
        join social.chats as chat on chat.chat_id = matched.chat_id
        where matched.match_id = ${command.aggregateId}::uuid
        for update of matched, chat
      `.execute(transaction);
      const current = result.rows[0];
      if (!current) throw new SocialActionDeniedError('MATCH_NOT_FOUND');
      assertMatchCanBeArchived(current.state, current.last_activity_at, context.occurredAt);
      if (current.chat_state !== 'OPEN') {
        throw new SocialActionDeniedError('MATCH_NOT_ACTIVE');
      }
      const chatVersion = Number(current.chat_version) + 1;
      await sql`
        update social.matches
        set state = 'ARCHIVED', version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where match_id = ${current.match_id}::uuid and state = 'ACTIVE'
      `.execute(transaction);
      await sql`
        update social.chats
        set state = 'ARCHIVED', version = ${chatVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where chat_id = ${current.chat_id}::uuid and state = 'OPEN'
      `.execute(transaction);
      const response: ArchivedMatchProjection = {
        matchId: current.match_id,
        state: 'ARCHIVED',
        chatId: current.chat_id,
        chatState: 'ARCHIVED',
        lastActivityAt: current.last_activity_at.toISOString(),
        version: context.nextVersion,
      };
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'MatchArchived',
          schemaVersion: 1,
          transitionId: 'MT-02',
          payload: {
            matchId: current.match_id,
            chatId: current.chat_id,
            lastActivityAt: current.last_activity_at.toISOString(),
          },
          metadata: { policyVersion: SOCIAL_POLICY_VERSION },
        },
        relatedEvents: [{
          eventId: ids.chatEventId,
          eventName: 'ChatArchived',
          schemaVersion: 1,
          aggregateType: 'Chat',
          aggregateId: current.chat_id,
          aggregateVersion: chatVersion,
          transitionId: 'CT-02',
          payload: { chatId: current.chat_id, matchId: current.match_id },
          metadata: { policyVersion: SOCIAL_POLICY_VERSION },
        }],
        audit: {
          auditId: ids.auditId,
          action: 'ARCHIVE_INACTIVE_MATCH',
          transitionId: 'MT-02',
          reasonCode: 'INACTIVE_30_DAYS',
          beforeState: 'ACTIVE',
          afterState: 'ARCHIVED',
          metadata: {
            chatId: current.chat_id,
            lastActivityAt: current.last_activity_at.toISOString(),
          },
        },
        outbox: [{
          messageId: ids.outboxMessageId,
          topic: 'social.match.archived.v1',
          payload: { matchId: current.match_id, chatId: current.chat_id },
        }],
      };
    },
  });
}

export async function readLikeTimerSnapshot(
  database: Kysely<Database>,
  likeId: string,
): Promise<TimerAggregateSnapshot> {
  const result = await sql<{ readonly state: LikeState; readonly version: string }>`
    select state, version::text as version
    from social.likes
    where like_id = ${likeId}::uuid
  `.execute(database);
  const row = result.rows[0];
  return row ? { state: row.state, version: Number(row.version) } : { state: 'MISSING', version: 0 };
}

export async function readDiscoverySuppressionTimerSnapshot(
  database: Kysely<Database>,
  suppressionId: string,
): Promise<TimerAggregateSnapshot> {
  const result = await sql<{ readonly state: 'ACTIVE' | 'EXPIRED'; readonly version: string }>`
    select state, version::text as version
    from social.discovery_pair_suppressions
    where suppression_id = ${suppressionId}::uuid
  `.execute(database);
  const row = result.rows[0];
  return row ? { state: row.state, version: Number(row.version) } : { state: 'MISSING', version: 0 };
}

export async function expireLike(
  database: Kysely<Database>,
  command: CommandEnvelope<ExpireLikePayload>,
  ids: ExpireLikeEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<LikeProjection>> {
  if (command.actor.type !== 'SYSTEM' || command.payload.likeId !== command.aggregateId) {
    throw new SocialActionDeniedError('LIKE_NOT_ACTIVE');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const result = await sql<LikeRow>`
        select like_id, from_user_id, to_user_id, state, expires_at, version::text as version
        from social.likes where like_id = ${command.aggregateId}::uuid
        for update
      `.execute(transaction);
      const current = result.rows[0];
      if (!current || current.state !== 'ACTIVE') {
        throw new SocialActionDeniedError('LIKE_NOT_ACTIVE');
      }
      if (current.expires_at.getTime() > context.occurredAt.getTime()) {
        throw new SocialActionDeniedError('LIKE_NOT_DUE');
      }
      await sql`
        update social.likes
        set state = 'EXPIRED', version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where like_id = ${command.aggregateId}::uuid and state = 'ACTIVE'
      `.execute(transaction);
      const response = likeProjection({
        ...current,
        state: 'EXPIRED',
        version: String(context.nextVersion),
      });
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'LikeExpired',
          schemaVersion: 1,
          transitionId: 'L-05',
          payload: { likeId: command.aggregateId },
          metadata: { policyVersion: SOCIAL_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'EXPIRE_LIKE',
          transitionId: 'L-05',
          reasonCode: null,
          beforeState: 'ACTIVE',
          afterState: 'EXPIRED',
          metadata: {},
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'social.like.expired.v1',
            payload: { likeId: command.aggregateId },
          },
        ],
      };
    },
  });
}

export async function expireDiscoverySuppression(
  database: Kysely<Database>,
  command: CommandEnvelope<ExpireDiscoverySuppressionPayload>,
  ids: ExpireDiscoverySuppressionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<{ readonly suppressionId: string; readonly state: 'EXPIRED'; readonly version: number }>> {
  if (
    command.actor.type !== 'SYSTEM' ||
    command.aggregateType !== 'DiscoveryPairSuppression' ||
    command.payload.suppressionId !== command.aggregateId
  ) {
    throw new SocialActionDeniedError('SUPPRESSION_NOT_ACTIVE');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const result = await sql<{
        readonly state: 'ACTIVE' | 'EXPIRED';
        readonly until_at: Date;
      }>`
        select state, until_at
        from social.discovery_pair_suppressions
        where suppression_id = ${command.aggregateId}::uuid
        for update
      `.execute(transaction);
      const current = result.rows[0];
      if (!current || current.state !== 'ACTIVE') {
        throw new SocialActionDeniedError('SUPPRESSION_NOT_ACTIVE');
      }
      if (current.until_at.getTime() > context.occurredAt.getTime()) {
        throw new SocialActionDeniedError('SUPPRESSION_NOT_DUE');
      }
      await sql`
        update social.discovery_pair_suppressions
        set state = 'EXPIRED', version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where suppression_id = ${command.aggregateId}::uuid and state = 'ACTIVE'
      `.execute(transaction);
      return {
        responseStatus: 200,
        response: {
          suppressionId: command.aggregateId,
          state: 'EXPIRED' as const,
          version: context.nextVersion,
        },
        event: {
          eventId: ids.eventId,
          eventName: 'PairSuppressionExpired',
          schemaVersion: 1,
          transitionId: 'DS-02',
          payload: { suppressionId: command.aggregateId },
          metadata: { policyVersion: SOCIAL_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'EXPIRE_DISCOVERY_SUPPRESSION',
          transitionId: 'DS-02',
          reasonCode: null,
          beforeState: 'ACTIVE',
          afterState: 'EXPIRED',
          metadata: {},
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'social.pair.suppression-expired.v1',
            payload: { suppressionId: command.aggregateId },
          },
        ],
      };
    },
  });
}
