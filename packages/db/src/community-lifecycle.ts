import {
  COMMUNITY_LIFECYCLE_POLICY_VERSION,
  CommunityLifecycleConflictError,
  assertCommunityLifecycleTransition,
  type CommandEnvelope,
  type CommunityState,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand } from './platform-command.js';

export interface PauseCommunityPayload {
  readonly communityId: string;
  readonly reason: string;
}

export interface ReactivateCommunityPayload {
  readonly communityId: string;
  readonly reason: string;
}

export interface CommunityLifecycleEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly pauseId: string;
  readonly competitionEventIds: readonly string[];
}

export interface CommunityLifecycleProjection {
  readonly communityId: string;
  readonly state: Extract<CommunityState, 'ACTIVE' | 'PAUSED'>;
  readonly pauseStartedAt: string | null;
  readonly latestPauseDurationSeconds: number | null;
  readonly version: number;
  readonly competitions: readonly {
    readonly competitionId: string;
    readonly availability: 'ACTIVE' | 'PAUSED';
    readonly version: number;
  }[];
}

interface CommunityLifecycleRow {
  readonly community_id: string;
  readonly state: CommunityState;
  readonly pause_started_at: Date | null;
  readonly version: string;
}

interface CompetitionRow {
  readonly competition_id: string;
  readonly availability: 'ACTIVE' | 'PAUSED' | 'CLOSED';
  readonly version: string;
}

interface PauseIntervalRow {
  readonly pause_id: string;
  readonly started_at: Date;
  readonly duration_seconds: string | null;
}

async function communityRow(
  database: Kysely<Database> | Transaction<Database>,
  communityId: string,
  lock = false,
): Promise<CommunityLifecycleRow | null> {
  const result = await sql<CommunityLifecycleRow>`
    select community_id, state, pause_started_at, version::text
    from community.communities
    where community_id = ${communityId}::uuid
    ${lock ? sql`for update` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function competitionRows(
  database: Kysely<Database> | Transaction<Database>,
  communityId: string,
  lock = false,
): Promise<readonly CompetitionRow[]> {
  const result = await sql<CompetitionRow>`
    select competition_id, availability, version::text
    from competition.competitions
    where community_id = ${communityId}::uuid and availability <> 'CLOSED'
    order by age_division, coalesce(discipline_key, ''), competition_id
    ${lock ? sql`for update` : sql``}
  `.execute(database);
  return result.rows;
}

async function openPauseInterval(
  database: Kysely<Database> | Transaction<Database>,
  communityId: string,
  lock = false,
): Promise<PauseIntervalRow | null> {
  const result = await sql<PauseIntervalRow>`
    select pause_id, started_at, duration_seconds::text
    from community.community_pause_intervals
    where community_id = ${communityId}::uuid and ended_at is null
    ${lock ? sql`for update` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function latestPauseDuration(
  database: Kysely<Database> | Transaction<Database>,
  communityId: string,
): Promise<number | null> {
  const result = await sql<{ readonly duration_seconds: string | null }>`
    select duration_seconds::text
    from community.community_pause_intervals
    where community_id = ${communityId}::uuid and ended_at is not null
    order by ended_at desc, pause_id
    limit 1
  `.execute(database);
  const value = result.rows[0]?.duration_seconds;
  return value === null || value === undefined ? null : Number(value);
}

async function actorIsCentral(
  database: Kysely<Database> | Transaction<Database>,
  actorUserId: string,
): Promise<boolean> {
  const result = await sql<{ readonly allowed: boolean }>`
    select exists (
      select 1 from community.role_grants
      where user_id = ${actorUserId}::uuid and role = 'CENTRAL_ADMIN'
        and scope_type = 'GLOBAL' and scope_id is null and state = 'ACTIVE'
        and (expires_at is null or expires_at > clock_timestamp())
    ) as allowed
  `.execute(database);
  return result.rows[0]?.allowed === true;
}

async function projection(
  database: Kysely<Database> | Transaction<Database>,
  row: CommunityLifecycleRow,
): Promise<CommunityLifecycleProjection> {
  if (row.state !== 'ACTIVE' && row.state !== 'PAUSED') {
    throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_INVALID_STATE');
  }
  const competitions = await competitionRows(database, row.community_id);
  return {
    communityId: row.community_id,
    state: row.state,
    pauseStartedAt: row.pause_started_at?.toISOString() ?? null,
    latestPauseDurationSeconds: await latestPauseDuration(database, row.community_id),
    version: Number(row.version),
    competitions: competitions.map((competition) => {
      if (competition.availability !== 'ACTIVE' && competition.availability !== 'PAUSED') {
        throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_INVALID_STATE');
      }
      return {
        competitionId: competition.competition_id,
        availability: competition.availability,
        version: Number(competition.version),
      };
    }),
  };
}

function assertCommand<T extends PauseCommunityPayload | ReactivateCommunityPayload>(
  command: CommandEnvelope<T>,
  commandType: 'PAUSE_COMMUNITY' | 'REACTIVATE_COMMUNITY',
): string {
  if (
    command.actor.type !== 'USER' || !command.actor.id
    || command.aggregateType !== 'Community'
    || command.aggregateId !== command.payload.communityId
    || command.commandType !== commandType
  ) {
    throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_CENTRAL_REQUIRED');
  }
  return command.actor.id;
}

function relatedCompetitionEvents(input: {
  readonly action: 'PAUSE' | 'REACTIVATE';
  readonly competitions: readonly CompetitionRow[];
  readonly effectIds: CommunityLifecycleEffectIds;
  readonly communityId: string;
  readonly pauseDurationSeconds: number | null;
}) {
  if (input.effectIds.competitionEventIds.length < input.competitions.length) {
    throw new TypeError('A competition event ID is required for every Community competition');
  }
  return input.competitions.map((competition, index) => ({
    eventId: input.effectIds.competitionEventIds[index]!,
    eventName: input.action === 'PAUSE' ? 'CompetitionPaused' : 'CompetitionReactivated',
    schemaVersion: 1,
    transitionId: input.action === 'PAUSE' ? 'CA-01' : 'CA-02',
    aggregateType: 'Competition',
    aggregateId: competition.competition_id,
    aggregateVersion: Number(competition.version) + 1,
    payload: {
      communityId: input.communityId,
      availability: input.action === 'PAUSE' ? 'PAUSED' : 'ACTIVE',
      pauseDurationSeconds: input.pauseDurationSeconds,
    },
    metadata: { policyVersion: COMMUNITY_LIFECYCLE_POLICY_VERSION },
  }));
}

export async function readCommunityLifecycle(
  database: Kysely<Database>,
  communityId: string,
): Promise<CommunityLifecycleProjection | null> {
  const row = await communityRow(database, communityId);
  return row ? projection(database, row) : null;
}

export async function pauseCommunity(
  database: Kysely<Database>,
  command: CommandEnvelope<PauseCommunityPayload>,
  ids: CommunityLifecycleEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<CommunityLifecycleProjection>> {
  const actorUserId = assertCommand(command, 'PAUSE_COMMUNITY');
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const community = await communityRow(transaction, command.payload.communityId, true);
      if (!community) throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_INVALID_STATE');
      assertCommunityLifecycleTransition({
        action: 'PAUSE',
        actorIsCentral: await actorIsCentral(transaction, actorUserId),
        currentState: community.state,
        reason: command.payload.reason,
      });
      const competitions = await competitionRows(transaction, community.community_id, true);
      if (competitions.some((competition) => competition.availability !== 'ACTIVE')) {
        throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_INVALID_STATE');
      }
      await sql`
        update community.communities
        set state = 'PAUSED', pause_started_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where community_id = ${community.community_id}::uuid and state = 'ACTIVE'
      `.execute(transaction);
      await sql`
        insert into community.community_pause_intervals (
          pause_id, community_id, reason, started_by, started_at
        ) values (
          ${ids.pauseId}::uuid, ${community.community_id}::uuid, ${command.payload.reason.trim()},
          ${actorUserId}::uuid, ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        update competition.competitions
        set availability = 'PAUSED', version = version + 1,
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where community_id = ${community.community_id}::uuid and availability = 'ACTIVE'
      `.execute(transaction);
      const updated = await communityRow(transaction, community.community_id);
      if (!updated) throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_INVALID_STATE');
      return {
        responseStatus: 200,
        response: await projection(transaction, updated),
        event: {
          eventId: ids.eventId, eventName: 'CommunityPaused', schemaVersion: 1,
          transitionId: 'CO-02', payload: {
            communityId: community.community_id, pauseId: ids.pauseId,
            reason: command.payload.reason.trim(), competitionActionsHeld: true,
            confirmedSessionsPreserved: true,
          }, metadata: { policyVersion: COMMUNITY_LIFECYCLE_POLICY_VERSION },
        },
        relatedEvents: relatedCompetitionEvents({
          action: 'PAUSE', competitions, effectIds: ids,
          communityId: community.community_id, pauseDurationSeconds: null,
        }),
        audit: {
          auditId: ids.auditId, action: 'PAUSE_COMMUNITY', transitionId: 'CO-02',
          reasonCode: 'CENTRAL_OPERATIONAL_HOLD', beforeState: 'ACTIVE', afterState: 'PAUSED',
          metadata: { reason: command.payload.reason.trim(), pauseId: ids.pauseId },
        },
        outbox: [{
          messageId: ids.outboxMessageId, topic: 'community.paused.v1', payload: {
            communityId: community.community_id, pauseId: ids.pauseId,
            startedAt: context.occurredAt.toISOString(),
          },
        }],
      };
    },
  });
}

export async function reactivateCommunity(
  database: Kysely<Database>,
  command: CommandEnvelope<ReactivateCommunityPayload>,
  ids: CommunityLifecycleEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<CommunityLifecycleProjection>> {
  const actorUserId = assertCommand(command, 'REACTIVATE_COMMUNITY');
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const community = await communityRow(transaction, command.payload.communityId, true);
      if (!community) throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_INVALID_STATE');
      assertCommunityLifecycleTransition({
        action: 'REACTIVATE',
        actorIsCentral: await actorIsCentral(transaction, actorUserId),
        currentState: community.state,
        reason: command.payload.reason,
      });
      const interval = await openPauseInterval(transaction, community.community_id, true);
      if (!interval || community.pause_started_at?.getTime() !== interval.started_at.getTime()) {
        throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_INVALID_STATE');
      }
      const competitions = await competitionRows(transaction, community.community_id, true);
      if (competitions.some((competition) => competition.availability !== 'PAUSED')) {
        throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_INVALID_STATE');
      }
      const durationSeconds = Math.max(
        0,
        Math.floor((context.occurredAt.getTime() - interval.started_at.getTime()) / 1_000),
      );
      const extendedChallenges = await sql<{ readonly challenge_id: string }>`
        update competition.challenges as challenge
        set response_deadline_at = case
              when challenge.state = 'AWAITING_RESPONSE'
                then challenge.response_deadline_at + ${durationSeconds} * interval '1 second'
              else challenge.response_deadline_at
            end,
            scheduling_deadline_at = case
              when challenge.state in ('ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING')
                then challenge.scheduling_deadline_at + ${durationSeconds} * interval '1 second'
              else challenge.scheduling_deadline_at
            end,
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        from competition.competitions as competition
        where challenge.competition_id = competition.competition_id
          and competition.community_id = ${community.community_id}::uuid
          and (
            (challenge.state = 'AWAITING_RESPONSE'
              and challenge.response_deadline_at > ${interval.started_at.toISOString()}::timestamptz)
            or
            (challenge.state in ('ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING')
              and challenge.scheduling_deadline_at > ${interval.started_at.toISOString()}::timestamptz)
          )
        returning challenge.challenge_id
      `.execute(transaction);
      await sql`
        update community.community_pause_intervals
        set ended_by = ${actorUserId}::uuid,
          ended_at = ${context.occurredAt.toISOString()}::timestamptz,
          resolution_reason = ${command.payload.reason.trim()},
          duration_seconds = ${durationSeconds}
        where pause_id = ${interval.pause_id}::uuid and ended_at is null
      `.execute(transaction);
      await sql`
        update community.communities
        set state = 'ACTIVE', pause_started_at = null, version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where community_id = ${community.community_id}::uuid and state = 'PAUSED'
      `.execute(transaction);
      await sql`
        update competition.competitions
        set availability = 'ACTIVE', version = version + 1,
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where community_id = ${community.community_id}::uuid and availability = 'PAUSED'
      `.execute(transaction);
      const updated = await communityRow(transaction, community.community_id);
      if (!updated) throw new CommunityLifecycleConflictError('COMMUNITY_LIFECYCLE_INVALID_STATE');
      return {
        responseStatus: 200,
        response: await projection(transaction, updated),
        event: {
          eventId: ids.eventId, eventName: 'CommunityReactivated', schemaVersion: 1,
          transitionId: 'CO-03', payload: {
            communityId: community.community_id, pauseId: interval.pause_id,
            resolutionReason: command.payload.reason.trim(), durationSeconds,
            extendedChallengeCount: extendedChallenges.rows.length,
          }, metadata: { policyVersion: COMMUNITY_LIFECYCLE_POLICY_VERSION },
        },
        relatedEvents: relatedCompetitionEvents({
          action: 'REACTIVATE', competitions, effectIds: ids,
          communityId: community.community_id, pauseDurationSeconds: durationSeconds,
        }),
        audit: {
          auditId: ids.auditId, action: 'REACTIVATE_COMMUNITY', transitionId: 'CO-03',
          reasonCode: 'CENTRAL_OPERATIONAL_HOLD_RESOLVED', beforeState: 'PAUSED',
          afterState: 'ACTIVE', metadata: {
            resolutionReason: command.payload.reason.trim(), pauseId: interval.pause_id,
            durationSeconds, extendedChallengeCount: extendedChallenges.rows.length,
          },
        },
        outbox: [{
          messageId: ids.outboxMessageId, topic: 'community.reactivated.v1', payload: {
            communityId: community.community_id, pauseId: interval.pause_id,
            reactivatedAt: context.occurredAt.toISOString(), durationSeconds,
          },
        }],
      };
    },
  });
}
