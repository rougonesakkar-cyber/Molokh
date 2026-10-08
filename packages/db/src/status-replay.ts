import { createHash } from 'node:crypto';

import {
  assertExpectedVersion,
  deriveProvisionalStatusTransition,
  type ChallengeStake,
  type CommandEnvelope,
  type ResultOutcomeCode,
} from '@molokh/core';
import { type Kysely, type Transaction, sql } from 'kysely';

import type { Database } from './index.js';
import {
  executeCriticalCommand,
  type ExecutedCommand,
} from './platform-command.js';

interface ReplayCheckpointRow {
  readonly competition_id: string;
  readonly applied_at: Date;
  readonly before_champion_user_id: string | null;
  readonly before_contender_user_id: string | null;
  readonly before_status_version: string;
}

interface ReplayTransitionRow {
  readonly transition_id: string;
  readonly result_id: string;
  readonly effective_stake: ChallengeStake;
  readonly recorded_outcome_code: ResultOutcomeCode;
  readonly recorded_winner_user_id: string | null;
  readonly recorded_loser_user_id: string | null;
  readonly result_state: string;
  readonly appeal_decision: string | null;
  readonly appeal_outcome_code: ResultOutcomeCode | null;
  readonly appeal_winner_user_id: string | null;
  readonly appeal_loser_user_id: string | null;
  readonly integrity_disposition: string | null;
  readonly integrity_outcome_code: ResultOutcomeCode | null;
  readonly integrity_winner_user_id: string | null;
  readonly integrity_loser_user_id: string | null;
}

export interface CompetitionStatusReplay {
  readonly championUserId: string | null;
  readonly contenderUserId: string | null;
  readonly replayHash: string;
  readonly journal: readonly Readonly<Record<string, unknown>>[];
}

export async function replayCompetitionStatusExcludingResults(input: {
  readonly transaction: Transaction<Database>;
  readonly sourceTransitionId: string;
  readonly excludedResultIds: readonly string[];
}): Promise<CompetitionStatusReplay> {
  const checkpointResult = await sql<ReplayCheckpointRow>`
    select competition_id, applied_at, before_champion_user_id,
      before_contender_user_id, before_status_version::text
    from competition.status_transitions
    where transition_id = ${input.sourceTransitionId}::uuid
  `.execute(input.transaction);
  const checkpoint = checkpointResult.rows[0];
  if (!checkpoint) throw new TypeError('Status replay checkpoint is required');

  const transitions = await sql<ReplayTransitionRow>`
    select transition.transition_id, result.result_id,
      coalesce(snapshot.effective_stake, challenge.stake) as effective_stake,
      result.recorded_outcome_code,
      result.winner_user_id as recorded_winner_user_id,
      result.loser_user_id as recorded_loser_user_id,
      result.state as result_state,
      appeal_decision.decision as appeal_decision,
      appeal_decision.effective_outcome_code as appeal_outcome_code,
      appeal_decision.effective_winner_user_id as appeal_winner_user_id,
      appeal_decision.effective_loser_user_id as appeal_loser_user_id,
      integrity_decision.effective_disposition as integrity_disposition,
      integrity_decision.effective_outcome_code as integrity_outcome_code,
      integrity_decision.effective_winner_user_id as integrity_winner_user_id,
      integrity_decision.effective_loser_user_id as integrity_loser_user_id
    from competition.status_transitions as transition
    join competition.results as result on result.result_id = transition.source_result_id
    join competition.challenges as challenge on challenge.challenge_id = result.challenge_id
    left join scheduling.session_competitive_snapshots as snapshot
      on snapshot.snapshot_id = result.competitive_snapshot_id
    left join competition.appeal_decisions as appeal_decision
      on appeal_decision.result_id = result.result_id
    left join competition.integrity_decisions as integrity_decision
      on integrity_decision.result_id = result.result_id
    where transition.competition_id = ${checkpoint.competition_id}::uuid
      and transition.applied_at >= ${checkpoint.applied_at.toISOString()}::timestamptz
    order by transition.applied_at, transition.transition_id
  `.execute(input.transaction);

  const excluded = new Set(input.excludedResultIds);
  let championUserId = checkpoint.before_champion_user_id;
  let contenderUserId = checkpoint.before_contender_user_id;
  let replayVersion = Number(checkpoint.before_status_version);
  const journal: Array<Readonly<Record<string, unknown>>> = [];
  for (const transition of transitions.rows) {
    let outcome: ResultOutcomeCode | null = null;
    let winnerUserId: string | null = null;
    let loserUserId: string | null = null;
    if (!excluded.has(transition.result_id)) {
      if (transition.integrity_disposition) {
        const removed = ['ANNUL', 'REPEAT'].includes(transition.integrity_disposition);
        outcome = removed ? null : transition.integrity_outcome_code;
        winnerUserId = removed ? null : transition.integrity_winner_user_id;
        loserUserId = removed ? null : transition.integrity_loser_user_id;
      } else if (transition.appeal_decision) {
        const removed = ['ANNUL', 'REPEAT'].includes(transition.appeal_decision);
        outcome = removed ? null : transition.appeal_outcome_code;
        winnerUserId = removed ? null : transition.appeal_winner_user_id;
        loserUserId = removed ? null : transition.appeal_loser_user_id;
      } else if (!['ANNULLED', 'REPEAT_ORDERED'].includes(transition.result_state)) {
        outcome = transition.recorded_outcome_code;
        winnerUserId = transition.recorded_winner_user_id;
        loserUserId = transition.recorded_loser_user_id;
      }
    }
    if (outcome !== null) {
      const derived = deriveProvisionalStatusTransition({
        stake: transition.effective_stake, outcomeCode: outcome,
        winnerUserId, loserUserId,
        snapshot: { championUserId, contenderUserId, statusVersion: replayVersion },
      });
      championUserId = derived.after.championUserId;
      contenderUserId = derived.after.contenderUserId;
      replayVersion = derived.after.statusVersion;
    }
    journal.push({ transitionId: transition.transition_id, resultId: transition.result_id,
      included: outcome !== null, outcomeCode: outcome, winnerUserId,
      championUserId, contenderUserId });
  }
  const replayHash = createHash('sha256').update(JSON.stringify({
    competitionId: checkpoint.competition_id,
    sourceTransitionId: input.sourceTransitionId,
    excludedResultIds: [...excluded].sort(), championUserId, contenderUserId, journal,
  })).digest('hex');
  return { championUserId, contenderUserId, replayHash, journal };
}

type CompetitionStatus = 'CHAMPION' | 'CONTENDER';

interface CanonicalProjectionEventRow {
  readonly event_id: string;
  readonly event_name: string;
  readonly aggregate_type: 'Competition' | 'PairCooldown';
  readonly aggregate_id: string;
  readonly aggregate_version: string;
  readonly transition_id: string | null;
  readonly occurred_at: Date;
  readonly payload: unknown;
}

interface CurrentCompetitionRow {
  readonly champion_user_id: string | null;
  readonly contender_user_id: string | null;
  readonly status_version: string;
  readonly status_lock_result_id: string | null;
  readonly version: string;
}

interface CurrentCooldownRow {
  readonly cooldown_id: string;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly source_result_id: string | null;
  readonly started_at: Date;
  readonly ends_at: Date;
  readonly invalidated_at: Date | null;
}

interface MutableTenure {
  readonly tenureId: string;
  readonly status: CompetitionStatus;
  readonly userId: string;
  readonly startedAt: string;
  endedAt: string | null;
  readonly startedByEventId: string;
  endedByEventId: string | null;
  endReasonCode: string | null;
  provisional: boolean;
  readonly compensatesTenureId: string | null;
}

export interface CompetitionStatusTenureProjection {
  readonly tenureId: string;
  readonly status: CompetitionStatus;
  readonly userId: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly startedByEventId: string;
  readonly endedByEventId: string | null;
  readonly endReasonCode: string | null;
  readonly provisional: boolean;
  readonly compensatesTenureId: string | null;
}

export interface CompetitionCooldownProjection {
  readonly cooldownId: string;
  readonly pairLowId: string;
  readonly pairHighId: string;
  readonly sourceResultId: string | null;
  readonly startedAt: string;
  readonly endsAt: string;
  readonly invalidatedAt: string | null;
}

export interface CompetitionProjection {
  readonly competitionId: string;
  readonly championUserId: string | null;
  readonly contenderUserId: string | null;
  readonly statusVersion: number;
  readonly statusLockResultId: string | null;
  readonly tenures: readonly CompetitionStatusTenureProjection[];
  readonly cooldowns: readonly CompetitionCooldownProjection[];
  readonly projectionHash: string;
  readonly sourceEventCount: number;
}

export interface RebuildCompetitionProjectionPayload {
  readonly competitionId: string;
  readonly reason: string;
}

export interface RebuildCompetitionProjectionEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
}

export type CompetitionProjectionConflictCode =
  | 'COMPETITION_PROJECTION_CANONICAL_EVENT_INVALID'
  | 'COMPETITION_PROJECTION_REASON_INVALID'
  | 'COMPETITION_PROJECTION_NOT_FOUND'
  | 'COMPETITION_PROJECTION_REPLAY_MISMATCH';

export class CompetitionProjectionConflictError extends Error {
  readonly code: CompetitionProjectionConflictCode;

  constructor(readonly reason: CompetitionProjectionConflictCode) {
    super(`Competition projection action is not allowed: ${reason}`);
    this.name = 'CompetitionProjectionConflictError';
    this.code = reason;
  }
}

export class CompetitionProjectionPermissionDeniedError extends Error {
  readonly code = 'COMPETITION_PROJECTION_PERMISSION_DENIED' as const;

  constructor() {
    super('Competition projection action is outside the actor scope');
    this.name = 'CompetitionProjectionPermissionDeniedError';
  }
}

const PROJECTION_REBUILD_POLICY_VERSION = 'competition-projection-rebuild-v1';

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;
}

function nullableString(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(value, key)) return undefined;
  const field = value[key];
  return field === null ? null : typeof field === 'string' ? field : undefined;
}

function numberField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): number | undefined {
  const field = value[key];
  if (typeof field === 'number' && Number.isSafeInteger(field) && field >= 0) return field;
  if (typeof field === 'string' && /^\d+$/.test(field)) return Number(field);
  return undefined;
}

function deterministicTenureId(eventId: string, status: CompetitionStatus, userId: string): string {
  const hex = createHash('sha256').update(`${eventId}:${status}:${userId}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function normalizedPair(participantIds: unknown): readonly [string, string] | null {
  if (!Array.isArray(participantIds) || participantIds.length !== 2
    || participantIds.some((item) => typeof item !== 'string')) return null;
  const [first, second] = participantIds as [string, string];
  return first < second ? [first, second] : [second, first];
}

function projectionHash(input: Omit<CompetitionProjection, 'projectionHash' | 'sourceEventCount'>): string {
  return createHash('sha256').update(JSON.stringify({
    competitionId: input.competitionId,
    championUserId: input.championUserId,
    contenderUserId: input.contenderUserId,
    statusVersion: input.statusVersion,
    statusLockResultId: input.statusLockResultId,
    tenures: input.tenures,
    cooldowns: input.cooldowns,
  })).digest('hex');
}

function closeAndOpenTenure(input: {
  readonly status: CompetitionStatus;
  readonly previousUserId: string | null;
  readonly nextUserId: string | null;
  readonly event: CanonicalProjectionEventRow;
  readonly provisional: boolean;
  readonly compensating: boolean;
  readonly tenures: MutableTenure[];
}): void {
  const open = [...input.tenures].reverse().find((tenure) =>
    tenure.status === input.status && tenure.endedAt === null);
  if (input.previousUserId === input.nextUserId) return;
  if (open) {
    open.endedAt = input.event.occurred_at.toISOString();
    open.endedByEventId = input.event.event_id;
    open.endReasonCode = input.event.event_name;
  }
  if (!input.nextUserId) return;
  input.tenures.push({
    tenureId: deterministicTenureId(input.event.event_id, input.status, input.nextUserId),
    status: input.status,
    userId: input.nextUserId,
    startedAt: input.event.occurred_at.toISOString(),
    endedAt: null,
    startedByEventId: input.event.event_id,
    endedByEventId: null,
    endReasonCode: null,
    provisional: input.provisional,
    compensatesTenureId: input.compensating ? open?.tenureId ?? null : null,
  });
}

function statusProjectionFromEvents(
  events: readonly CanonicalProjectionEventRow[],
): Omit<CompetitionProjection, 'competitionId' | 'cooldowns' | 'projectionHash' | 'sourceEventCount'> {
  let championUserId: string | null = null;
  let contenderUserId: string | null = null;
  let statusVersion = 0;
  let statusLockResultId: string | null = null;
  const tenures: MutableTenure[] = [];

  for (const event of events.filter((item) => item.aggregate_type === 'Competition')) {
    const payload = record(event.payload);
    if (!payload) continue;
    if (event.event_name === 'StatusTransitionFinalized') {
      const finalizedVersion = numberField(payload, 'statusVersion');
      statusVersion = finalizedVersion ?? statusVersion + 1;
      statusLockResultId = null;
      for (const tenure of tenures) {
        if (tenure.endedAt === null) tenure.provisional = false;
      }
      continue;
    }

    let nextChampion: string | null | undefined;
    let nextContender: string | null | undefined;
    let nextVersion: number | undefined;
    const after = record(payload.after);
    const to = record(payload.to);
    if (after) {
      nextChampion = nullableString(after, 'championUserId');
      nextContender = nullableString(after, 'contenderUserId');
      nextVersion = numberField(after, 'statusVersion');
    } else if (to) {
      nextChampion = nullableString(to, 'championUserId');
      nextContender = nullableString(to, 'contenderUserId');
      nextVersion = numberField(payload, 'statusVersion');
    } else if (Object.prototype.hasOwnProperty.call(payload, 'afterChampionUserId')
      || Object.prototype.hasOwnProperty.call(payload, 'afterContenderUserId')) {
      nextChampion = nullableString(payload, 'afterChampionUserId');
      nextContender = nullableString(payload, 'afterContenderUserId');
      nextVersion = numberField(payload, 'statusVersion') ?? numberField(payload, 'afterStatusVersion');
    } else if (Object.prototype.hasOwnProperty.call(payload, 'championUserId')
      || Object.prototype.hasOwnProperty.call(payload, 'contenderUserId')) {
      nextChampion = nullableString(payload, 'championUserId');
      nextContender = nullableString(payload, 'contenderUserId');
      nextVersion = numberField(payload, 'statusVersion');
    } else if (typeof payload.assignedStatus === 'string' && typeof payload.userId === 'string') {
      nextChampion = payload.assignedStatus === 'CHAMPION' ? payload.userId : championUserId;
      nextContender = payload.assignedStatus === 'CONTENDER' ? payload.userId : contenderUserId;
      nextVersion = numberField(payload, 'statusVersion');
    } else if (event.event_name === 'CompetitionClosed') {
      nextChampion = null;
      nextContender = null;
      nextVersion = statusVersion + 1;
    } else {
      continue;
    }

    nextChampion ??= nextChampion === null ? null : championUserId;
    nextContender ??= nextContender === null ? null : contenderUserId;
    if (nextChampion && nextChampion === nextContender) {
      throw new CompetitionProjectionConflictError('COMPETITION_PROJECTION_CANONICAL_EVENT_INVALID');
    }
    const holdersChanged = championUserId !== nextChampion || contenderUserId !== nextContender;
    const replayedIntegrityTransition = event.event_name === 'CompetitionProjectionRebuilt'
      && event.transition_id !== null;
    nextVersion ??= holdersChanged || replayedIntegrityTransition
      ? statusVersion + 1
      : statusVersion;
    if (nextVersion < statusVersion) {
      throw new CompetitionProjectionConflictError('COMPETITION_PROJECTION_CANONICAL_EVENT_INVALID');
    }
    const provisional = payload.provisional === true;
    const compensating = /Compensated|RolledBack|ProjectionRebuilt|Replayed/.test(event.event_name);
    closeAndOpenTenure({ status: 'CHAMPION', previousUserId: championUserId,
      nextUserId: nextChampion, event, provisional, compensating, tenures });
    closeAndOpenTenure({ status: 'CONTENDER', previousUserId: contenderUserId,
      nextUserId: nextContender, event, provisional, compensating, tenures });
    championUserId = nextChampion;
    contenderUserId = nextContender;
    statusVersion = nextVersion;

    const explicitLock = nullableString(payload, 'statusLockResultId');
    if (explicitLock !== undefined) statusLockResultId = explicitLock;
    else if (provisional && typeof payload.sourceResultId === 'string') {
      statusLockResultId = payload.sourceResultId;
    } else if (/Compensated|RolledBack|Replayed/.test(event.event_name)) {
      statusLockResultId = null;
    }
  }
  return { championUserId, contenderUserId, statusVersion, statusLockResultId, tenures };
}

function cooldownProjectionFromEvents(
  events: readonly CanonicalProjectionEventRow[],
): readonly CompetitionCooldownProjection[] {
  const cooldowns = new Map<string, CompetitionCooldownProjection>();
  for (const event of events.filter((item) => item.aggregate_type === 'PairCooldown')) {
    const payload = record(event.payload);
    if (!payload) continue;
    if (event.event_name === 'PairCooldownStarted') {
      const pair = normalizedPair(payload.participantIds);
      const cooldownId = typeof payload.cooldownId === 'string' ? payload.cooldownId : event.aggregate_id;
      const startedAt = typeof payload.startedAt === 'string' ? payload.startedAt : null;
      const endsAt = typeof payload.endsAt === 'string' ? payload.endsAt : null;
      if (!pair || !startedAt || !endsAt) {
        throw new CompetitionProjectionConflictError('COMPETITION_PROJECTION_CANONICAL_EVENT_INVALID');
      }
      cooldowns.set(cooldownId, {
        cooldownId, pairLowId: pair[0], pairHighId: pair[1],
        sourceResultId: typeof payload.sourceResultId === 'string' ? payload.sourceResultId : null,
        startedAt: new Date(startedAt).toISOString(), endsAt: new Date(endsAt).toISOString(),
        invalidatedAt: null,
      });
    } else if (/PairCooldown(Removed|Compensated)/.test(event.event_name)) {
      const current = cooldowns.get(event.aggregate_id);
      if (current) cooldowns.set(event.aggregate_id, {
        ...current, invalidatedAt: event.occurred_at.toISOString(),
      });
    }
  }
  return [...cooldowns.values()].sort((left, right) =>
    left.startedAt.localeCompare(right.startedAt) || left.cooldownId.localeCompare(right.cooldownId));
}

async function canonicalProjectionEvents(
  database: Kysely<Database> | Transaction<Database>,
  competitionId: string,
): Promise<readonly CanonicalProjectionEventRow[]> {
  const result = await sql<CanonicalProjectionEventRow>`
    with target_cooldowns as (
      select distinct aggregate_id
      from platform.domain_events
      where aggregate_type = 'PairCooldown'
        and event_name = 'PairCooldownStarted'
        and payload->>'competitionId' = ${competitionId}
    )
    select event_id, event_name, aggregate_type, aggregate_id,
      aggregate_version::text, transition_id, occurred_at, payload
    from platform.domain_events
    where (aggregate_type = 'Competition' and aggregate_id = ${competitionId}::uuid)
      or (aggregate_type = 'PairCooldown' and aggregate_id in (select aggregate_id from target_cooldowns))
    order by aggregate_type, aggregate_id, aggregate_version, event_id
  `.execute(database);
  return result.rows;
}

export async function replayCompetitionProjection(
  database: Kysely<Database> | Transaction<Database>,
  competitionId: string,
): Promise<CompetitionProjection> {
  const events = await canonicalProjectionEvents(database, competitionId);
  const status = statusProjectionFromEvents(events);
  const cooldowns = cooldownProjectionFromEvents(events);
  const projectionWithoutHash = {
    competitionId,
    championUserId: status.championUserId,
    contenderUserId: status.contenderUserId,
    statusVersion: status.statusVersion,
    statusLockResultId: status.statusLockResultId,
    tenures: status.tenures,
    cooldowns,
  };
  return {
    ...projectionWithoutHash,
    projectionHash: projectionHash(projectionWithoutHash),
    sourceEventCount: events.length,
  };
}

async function currentCooldowns(
  database: Kysely<Database> | Transaction<Database>,
  competitionId: string,
): Promise<readonly CompetitionCooldownProjection[]> {
  const result = await sql<CurrentCooldownRow>`
    select cooldown_id, pair_low_id, pair_high_id, source_result_id,
      started_at, ends_at, invalidated_at
    from competition.pair_cooldowns
    where competition_id = ${competitionId}::uuid
    order by started_at, cooldown_id
  `.execute(database);
  return result.rows.map((row) => ({
    cooldownId: row.cooldown_id, pairLowId: row.pair_low_id, pairHighId: row.pair_high_id,
    sourceResultId: row.source_result_id, startedAt: row.started_at.toISOString(),
    endsAt: row.ends_at.toISOString(), invalidatedAt: row.invalidated_at?.toISOString() ?? null,
  }));
}

export async function readCompetitionProjection(
  database: Kysely<Database> | Transaction<Database>,
  competitionId: string,
): Promise<CompetitionProjection | null> {
  const competitionResult = await sql<CurrentCompetitionRow>`
    select champion_user_id, contender_user_id, status_version::text,
      status_lock_result_id, version::text
    from competition.competitions
    where competition_id = ${competitionId}::uuid
  `.execute(database);
  const competition = competitionResult.rows[0];
  if (!competition) return null;
  const replayed = await replayCompetitionProjection(database, competitionId);
  const cooldowns = await currentCooldowns(database, competitionId);
  const projectionWithoutHash = {
    competitionId,
    championUserId: competition.champion_user_id,
    contenderUserId: competition.contender_user_id,
    statusVersion: Number(competition.status_version),
    statusLockResultId: competition.status_lock_result_id,
    tenures: replayed.tenures,
    cooldowns,
  };
  return {
    ...projectionWithoutHash,
    projectionHash: projectionHash(projectionWithoutHash),
    sourceEventCount: replayed.sourceEventCount,
  };
}

async function hasCentralGrant(
  transaction: Transaction<Database>,
  actorId: string,
): Promise<boolean> {
  const result = await sql<{ readonly grant_id: string }>`
    select grant_id from community.role_grants
    where user_id = ${actorId}::uuid and role = 'CENTRAL_ADMIN'
      and scope_type = 'GLOBAL' and scope_id is null and state = 'ACTIVE'
    limit 1 for share
  `.execute(transaction);
  return result.rows.length === 1;
}

async function replaceCooldownProjection(
  transaction: Transaction<Database>,
  competitionId: string,
  expected: readonly CompetitionCooldownProjection[],
): Promise<void> {
  const existing = await sql<{ readonly cooldown_id: string }>`
    select cooldown_id from competition.pair_cooldowns
    where competition_id = ${competitionId}::uuid for update
  `.execute(transaction);
  const expectedIds = new Set(expected.map((cooldown) => cooldown.cooldownId));
  for (const row of existing.rows) {
    if (!expectedIds.has(row.cooldown_id)) {
      await sql`delete from competition.pair_cooldowns
        where cooldown_id = ${row.cooldown_id}::uuid`.execute(transaction);
    }
  }
  for (const cooldown of expected) {
    await sql`
      insert into competition.pair_cooldowns (
        cooldown_id, competition_id, pair_low_id, pair_high_id,
        source_result_id, started_at, ends_at, invalidated_at
      ) values (
        ${cooldown.cooldownId}::uuid, ${competitionId}::uuid,
        ${cooldown.pairLowId}::uuid, ${cooldown.pairHighId}::uuid,
        ${cooldown.sourceResultId}::uuid, ${cooldown.startedAt}::timestamptz,
        ${cooldown.endsAt}::timestamptz, ${cooldown.invalidatedAt}::timestamptz
      ) on conflict (cooldown_id) do update set
        competition_id = excluded.competition_id,
        pair_low_id = excluded.pair_low_id,
        pair_high_id = excluded.pair_high_id,
        source_result_id = excluded.source_result_id,
        started_at = excluded.started_at,
        ends_at = excluded.ends_at,
        invalidated_at = excluded.invalidated_at
    `.execute(transaction);
  }
}

export async function rebuildCompetitionProjection(
  database: Kysely<Database>,
  command: CommandEnvelope<RebuildCompetitionProjectionPayload>,
  ids: RebuildCompetitionProjectionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<CompetitionProjection>> {
  if (!command.actor.id || command.actor.type !== 'USER'
    || command.commandType !== 'REBUILD_COMPETITION_PROJECTION'
    || command.aggregateType !== 'Competition'
    || command.aggregateId !== command.payload.competitionId) {
    throw new CompetitionProjectionPermissionDeniedError();
  }
  const reason = command.payload.reason.trim();
  if (reason.length < 1 || reason.length > 500) {
    throw new CompetitionProjectionConflictError('COMPETITION_PROJECTION_REASON_INVALID');
  }
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      if (!(await hasCentralGrant(transaction, command.actor.id!))) {
        throw new CompetitionProjectionPermissionDeniedError();
      }
      const lockedResult = await sql<CurrentCompetitionRow>`
        select champion_user_id, contender_user_id, status_version::text,
          status_lock_result_id, version::text
        from competition.competitions
        where competition_id = ${command.aggregateId}::uuid
        for update
      `.execute(transaction);
      const locked = lockedResult.rows[0];
      if (!locked) throw new CompetitionProjectionConflictError('COMPETITION_PROJECTION_NOT_FOUND');
      const canonicalVersionResult = await sql<{ readonly actual_version: string }>`
        select coalesce(max(aggregate_version), 0)::text as actual_version
        from platform.domain_events
        where aggregate_type = 'Competition'
          and aggregate_id = ${command.aggregateId}::uuid
      `.execute(transaction);
      assertExpectedVersion(
        Number(canonicalVersionResult.rows[0]?.actual_version ?? '0'),
        command.expectedVersion,
      );
      const before = await readCompetitionProjection(transaction, command.aggregateId);
      if (!before) throw new CompetitionProjectionConflictError('COMPETITION_PROJECTION_NOT_FOUND');
      const replayed = await replayCompetitionProjection(transaction, command.aggregateId);

      await replaceCooldownProjection(transaction, command.aggregateId, replayed.cooldowns);
      await sql`
        update competition.competitions
        set champion_user_id = ${replayed.championUserId}::uuid,
          contender_user_id = ${replayed.contenderUserId}::uuid,
          status_version = ${replayed.statusVersion},
          status_lock_result_id = ${replayed.statusLockResultId}::uuid,
          version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where competition_id = ${command.aggregateId}::uuid
      `.execute(transaction);
      const rebuilt = await readCompetitionProjection(transaction, command.aggregateId);
      if (!rebuilt || rebuilt.projectionHash !== replayed.projectionHash) {
        throw new CompetitionProjectionConflictError('COMPETITION_PROJECTION_REPLAY_MISMATCH');
      }
      const publicPayload = {
        competitionId: command.aggregateId,
        projectionHash: rebuilt.projectionHash,
        championUserId: rebuilt.championUserId,
        contenderUserId: rebuilt.contenderUserId,
        statusVersion: rebuilt.statusVersion,
        statusLockResultId: rebuilt.statusLockResultId,
        tenureCount: rebuilt.tenures.length,
        cooldownCount: rebuilt.cooldowns.length,
        sourceEventCount: rebuilt.sourceEventCount,
      };
      return {
        responseStatus: 200,
        response: rebuilt,
        event: {
          eventId: ids.eventId,
          eventName: 'CompetitionProjectionRebuilt',
          schemaVersion: 1,
          transitionId: null,
          payload: publicPayload,
          metadata: { policyVersion: PROJECTION_REBUILD_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'REBUILD_COMPETITION_PROJECTION',
          transitionId: null,
          reasonCode: 'PROJECTION_REBUILD',
          beforeState: before.projectionHash,
          afterState: rebuilt.projectionHash,
          metadata: {
            reason,
            beforeHash: before.projectionHash,
            afterHash: rebuilt.projectionHash,
            sourceEventCount: rebuilt.sourceEventCount,
          },
        },
        outbox: [{
          messageId: ids.outboxMessageId,
          topic: 'competition.projection.rebuilt.v1',
          payload: publicPayload,
        }],
      };
    },
  });
}
