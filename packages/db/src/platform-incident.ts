import {
  PLATFORM_INCIDENT_POLICY_VERSION,
  PlatformIncidentConflictError,
  assertPlatformIncidentCanBeCompensated,
  assertPlatformIncidentCanBeConfirmed,
  assertPlatformIncidentCanBeRejected,
  calculateExactIncidentOverlap,
  normalizePlatformIncidentDetection,
  normalizePlatformIncidentResolution,
  pausableTimerRegistry,
  timerPolicyForCommand,
  type CommandEnvelope,
  type PlatformIncidentSeverity,
  type PlatformIncidentState,
  type PlatformService,
  type PausableDeadlineKind,
  type TimerCommandPayload,
} from '@molokh/core';
import { type Kysely, type Transaction, sql } from 'kysely';

import type { Database } from './index.js';
import {
  executeCriticalCommand,
  type ExecutedCommand,
  type RelatedDomainEventDraft,
} from './platform-command.js';
import { replayCompetitionStatusExcludingResults } from './status-replay.js';

export interface DetectPlatformIncidentPayload {
  readonly startedAt: string;
  readonly affectedServices: readonly PlatformService[];
  readonly affectedSurfaces: readonly string[];
  readonly severity: PlatformIncidentSeverity;
  readonly monitoringEvidenceReference: string;
}

export interface ConfirmPlatformIncidentPayload {
  readonly incidentId: string;
  readonly reason: string;
}

export interface RejectPlatformIncidentPayload extends ConfirmPlatformIncidentPayload {}

export interface ResolvePlatformIncidentPayload extends ConfirmPlatformIncidentPayload {
  readonly endedAt: string;
}

export interface CompensatePlatformIncidentPayload {
  readonly incidentId: string;
}

export interface PlatformIncidentEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
}

export interface ApplyIncidentDeadlineImpactPayload {
  readonly incidentId: string;
  readonly challengeId: string;
  readonly deadlineKind: 'CHALLENGE_RESPONSE';
  readonly surface: string;
}

export interface IncidentDeadlineImpactEffectIds extends PlatformIncidentEffectIds {
  readonly impactId: string;
}

export interface IncidentDeadlineImpactProjection {
  readonly impactId: string;
  readonly incidentId: string;
  readonly aggregateType: 'Challenge';
  readonly aggregateId: string;
  readonly deadlineKind: 'CHALLENGE_RESPONSE';
  readonly oldDeadlineAt: string;
  readonly newDeadlineAt: string;
  readonly overlapMilliseconds: number;
  readonly version: number;
}

export interface PlatformIncidentTimerSuppression {
  readonly incidentId: string;
  readonly retryAt: string;
}

export interface ChallengeResponseIncidentImpactCandidate {
  readonly challengeId: string;
  readonly version: number;
  readonly surface: string;
}

export interface MandatoryTimeoutCompensationCandidate {
  readonly challengeId: string;
  readonly resultId: string;
  readonly version: number;
}

export interface CompensateMandatoryTimeoutPayload {
  readonly incidentId: string;
  readonly challengeId: string;
  readonly resultId: string;
}

export interface MandatoryTimeoutCompensationEffectIds extends PlatformIncidentEffectIds {
  readonly impactId: string;
  readonly compensationId: string;
  readonly resultEventId: string;
  readonly competitionEventId: string;
  readonly cooldownEventId: string;
}

export interface MandatoryTimeoutCompensationProjection {
  readonly incidentId: string;
  readonly impactId: string;
  readonly compensationId: string;
  readonly challengeId: string;
  readonly resultId: string;
  readonly challengeState: 'CANCELLED_NO_FAULT';
  readonly resultState: 'ANNULLED';
  readonly championUserId: string | null;
  readonly contenderUserId: string | null;
  readonly replayHash: string;
  readonly overlapMilliseconds: number;
  readonly version: number;
}

export interface PausableDeadlineImpactCandidate {
  readonly aggregateType: 'Challenge' | 'Booking' | 'ChallengeQueueEntry' | 'BookingOfficialConversion';
  readonly aggregateId: string;
  readonly commandType: string;
  readonly deadlineKind: Exclude<PausableDeadlineKind, 'CHALLENGE_RESPONSE'>;
  readonly surface: string;
  readonly version: number;
}

export interface ApplyPausableDeadlineImpactPayload {
  readonly incidentId: string;
  readonly deadlineKind: Exclude<PausableDeadlineKind, 'CHALLENGE_RESPONSE'>;
  readonly surface: string;
}

export interface PausableDeadlineImpactProjection {
  readonly impactId: string;
  readonly incidentId: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly deadlineKind: PausableDeadlineKind;
  readonly oldDeadlineAt: string;
  readonly newDeadlineAt: string;
  readonly overlapMilliseconds: number;
  readonly version: number;
}

export interface PlatformIncidentProjection {
  readonly incidentId: string;
  readonly state: PlatformIncidentState;
  readonly affectedServices: readonly PlatformService[];
  readonly affectedSurfaces: readonly string[];
  readonly severity: PlatformIncidentSeverity;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly monitoringEvidenceReference: string;
  readonly detectedAt: string;
  readonly confirmedBy: string | null;
  readonly confirmedAt: string | null;
  readonly confirmationReason: string | null;
  readonly rejectedBy: string | null;
  readonly rejectedAt: string | null;
  readonly rejectionReason: string | null;
  readonly resolvedBy: string | null;
  readonly resolvedByActorType: 'USER' | 'SYSTEM' | null;
  readonly resolvedAt: string | null;
  readonly resolutionReason: string | null;
  readonly compensatedAt: string | null;
  readonly impactCount: number;
  readonly version: number;
}

interface IncidentRow {
  readonly incident_id: string;
  readonly state: PlatformIncidentState;
  readonly affected_services: PlatformService[];
  readonly affected_surfaces: string[];
  readonly severity: PlatformIncidentSeverity;
  readonly started_at: Date;
  readonly ended_at: Date | null;
  readonly monitoring_evidence_reference: string;
  readonly detected_at: Date;
  readonly confirmed_by: string | null;
  readonly confirmed_at: Date | null;
  readonly confirmation_reason: string | null;
  readonly rejected_by: string | null;
  readonly rejected_at: Date | null;
  readonly rejection_reason: string | null;
  readonly resolved_by: string | null;
  readonly resolved_by_actor_type: 'USER' | 'SYSTEM' | null;
  readonly resolved_at: Date | null;
  readonly resolution_reason: string | null;
  readonly compensated_at: Date | null;
  readonly impact_count: number;
  readonly version: string;
}

async function hasCentralGrant(
  database: Kysely<Database> | Transaction<Database>, userId: string,
): Promise<boolean> {
  const result = await sql<{ readonly allowed: boolean }>`select exists (
    select 1 from community.role_grants where user_id = ${userId}::uuid
      and role = 'CENTRAL_ADMIN' and scope_type = 'GLOBAL' and scope_id is null
      and state = 'ACTIVE' and (expires_at is null or expires_at > clock_timestamp())
  ) as allowed`.execute(database);
  return result.rows[0]?.allowed === true;
}

async function incidentRows(
  database: Kysely<Database> | Transaction<Database>, incidentId?: string, lock = false,
): Promise<readonly IncidentRow[]> {
  const result = await sql<IncidentRow>`
    select incident_id, state, affected_services, affected_surfaces, severity,
      started_at, ended_at, monitoring_evidence_reference, detected_at,
      confirmed_by, confirmed_at, confirmation_reason, rejected_by, rejected_at,
      rejection_reason, resolved_by, resolved_by_actor_type, resolved_at,
      resolution_reason, compensated_at, impact_count, version::text
    from platform.platform_incidents
    where (${incidentId ?? null}::uuid is null or incident_id = ${incidentId ?? null}::uuid)
    order by started_at desc, incident_id
    ${lock ? sql`for update` : sql``}
  `.execute(database);
  return result.rows;
}

function project(row: IncidentRow): PlatformIncidentProjection {
  return {
    incidentId: row.incident_id, state: row.state,
    affectedServices: row.affected_services, affectedSurfaces: row.affected_surfaces,
    severity: row.severity, startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at?.toISOString() ?? null,
    monitoringEvidenceReference: row.monitoring_evidence_reference,
    detectedAt: row.detected_at.toISOString(), confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at?.toISOString() ?? null,
    confirmationReason: row.confirmation_reason, rejectedBy: row.rejected_by,
    rejectedAt: row.rejected_at?.toISOString() ?? null, rejectionReason: row.rejection_reason,
    resolvedBy: row.resolved_by, resolvedByActorType: row.resolved_by_actor_type,
    resolvedAt: row.resolved_at?.toISOString() ?? null, resolutionReason: row.resolution_reason,
    compensatedAt: row.compensated_at?.toISOString() ?? null,
    impactCount: row.impact_count, version: Number(row.version),
  };
}

function assertIncidentCommand<T>(
  command: CommandEnvelope<T>, allowCreate = false,
): void {
  const incidentId = (command.payload as { readonly incidentId?: string }).incidentId;
  if (command.aggregateType !== 'PlatformIncident'
    || (!allowCreate && incidentId !== command.aggregateId)
    || (allowCreate && command.expectedVersion !== 0)) {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_STATE');
  }
}

async function assertCentral(transaction: Transaction<Database>, actorId: string | null): Promise<void> {
  if (!actorId || !(await hasCentralGrant(transaction, actorId))) {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_CENTRAL_REQUIRED');
  }
}

export async function listPlatformIncidents(
  database: Kysely<Database>, centralUserId: string,
): Promise<PlatformIncidentProjection[]> {
  if (!(await hasCentralGrant(database, centralUserId))) {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_CENTRAL_REQUIRED');
  }
  return (await incidentRows(database)).map(project);
}

export async function readPlatformIncident(
  database: Kysely<Database>, incidentId: string, centralUserId: string,
): Promise<PlatformIncidentProjection> {
  if (!(await hasCentralGrant(database, centralUserId))) {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_CENTRAL_REQUIRED');
  }
  const row = (await incidentRows(database, incidentId))[0];
  if (!row) throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_STATE');
  return project(row);
}

export async function detectPlatformIncident(
  database: Kysely<Database>, command: CommandEnvelope<DetectPlatformIncidentPayload>,
  ids: PlatformIncidentEffectIds, now?: () => Date,
): Promise<ExecutedCommand<PlatformIncidentProjection>> {
  assertIncidentCommand(command, true);
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}), mutate: async (transaction, context) => {
      const normalized = normalizePlatformIncidentDetection({
        actor: command.actor, startedAt: new Date(command.payload.startedAt),
        affectedServices: command.payload.affectedServices,
        affectedSurfaces: command.payload.affectedSurfaces,
        severity: command.payload.severity,
        monitoringEvidenceReference: command.payload.monitoringEvidenceReference,
      });
      await sql`insert into platform.platform_incidents (
        incident_id, state, affected_services, affected_surfaces, severity,
        started_at, monitoring_evidence_reference, detected_at, version, policy_version
      ) values (
        ${command.aggregateId}::uuid, 'DETECTED', ${[...normalized.affectedServices]}::text[],
        ${[...normalized.affectedSurfaces]}::text[], ${normalized.severity},
        ${normalized.startedAt.toISOString()}::timestamptz,
        ${normalized.monitoringEvidenceReference},
        ${context.occurredAt.toISOString()}::timestamptz, ${context.nextVersion},
        ${PLATFORM_INCIDENT_POLICY_VERSION}
      )`.execute(transaction);
      const response = project((await incidentRows(transaction, command.aggregateId))[0]!);
      return {
        responseStatus: 201, response,
        event: { eventId: ids.eventId, eventName: 'PlatformIncidentDetected', schemaVersion: 1,
          transitionId: 'PI-01', payload: { incidentId: response.incidentId,
            startedAt: response.startedAt, affectedServices: response.affectedServices,
            affectedSurfaces: response.affectedSurfaces, severity: response.severity },
          metadata: { policyVersion: PLATFORM_INCIDENT_POLICY_VERSION,
            monitoringEvidenceReference: response.monitoringEvidenceReference } },
        audit: { auditId: ids.auditId, action: 'DETECT_PLATFORM_INCIDENT',
          transitionId: 'PI-01', reasonCode: 'OBJECTIVE_MONITORING_ANOMALY',
          beforeState: null, afterState: 'DETECTED', metadata: {} },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'platform.incident.detected.v1',
          payload: { incidentId: response.incidentId, severity: response.severity } }],
      };
    },
  });
}

async function overlappingConfirmedWindow(
  transaction: Transaction<Database>, row: IncidentRow,
): Promise<boolean> {
  const result = await sql<{ readonly duplicate: boolean }>`select exists (
    select 1 from platform.platform_incidents as other
    where other.incident_id <> ${row.incident_id}::uuid
      and other.state in ('CONFIRMED_ACTIVE', 'RESOLVED', 'COMPENSATED')
      and other.affected_services && ${row.affected_services}::text[]
      and (other.ended_at is null or ${row.started_at.toISOString()}::timestamptz < other.ended_at)
  ) as duplicate`.execute(transaction);
  return result.rows[0]?.duplicate === true;
}

async function lockIncidentServices(
  transaction: Transaction<Database>, services: readonly string[],
): Promise<void> {
  for (const service of [...new Set(services)].sort()) {
    await sql`select pg_advisory_xact_lock(
      hashtextextended(${`platform-incident-service:${service}`}, 0)
    )`.execute(transaction);
  }
}

export async function confirmPlatformIncident(
  database: Kysely<Database>, command: CommandEnvelope<ConfirmPlatformIncidentPayload>,
  ids: PlatformIncidentEffectIds, now?: () => Date,
): Promise<ExecutedCommand<PlatformIncidentProjection>> {
  assertIncidentCommand(command);
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}), mutate: async (transaction, context) => {
      await assertCentral(transaction, command.actor.id);
      const row = (await incidentRows(transaction, command.aggregateId, true))[0];
      if (!row) throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_STATE');
      await lockIncidentServices(transaction, row.affected_services);
      const reason = assertPlatformIncidentCanBeConfirmed({ state: row.state, actor: command.actor,
        reason: command.payload.reason,
        hasOverlappingConfirmedWindow: await overlappingConfirmedWindow(transaction, row) });
      await sql`update platform.platform_incidents set state = 'CONFIRMED_ACTIVE',
        confirmed_by = ${command.actor.id}::uuid,
        confirmed_at = ${context.occurredAt.toISOString()}::timestamptz,
        confirmation_reason = ${reason}, version = ${context.nextVersion},
        updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where incident_id = ${row.incident_id}::uuid and state = 'DETECTED'`.execute(transaction);
      const response = project((await incidentRows(transaction, row.incident_id))[0]!);
      return transitionEffect(ids, response, 'PlatformIncidentConfirmed', 'PI-02',
        'CONFIRM_PLATFORM_INCIDENT', 'DETECTED', 'CONFIRMED_ACTIVE', reason,
        'platform.incident.confirmed.v1');
    },
  });
}

export async function rejectPlatformIncident(
  database: Kysely<Database>, command: CommandEnvelope<RejectPlatformIncidentPayload>,
  ids: PlatformIncidentEffectIds, now?: () => Date,
): Promise<ExecutedCommand<PlatformIncidentProjection>> {
  assertIncidentCommand(command);
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}), mutate: async (transaction, context) => {
      await assertCentral(transaction, command.actor.id);
      const row = (await incidentRows(transaction, command.aggregateId, true))[0];
      if (!row) throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_STATE');
      const reason = assertPlatformIncidentCanBeRejected({ state: row.state,
        actor: command.actor, reason: command.payload.reason });
      await sql`update platform.platform_incidents set state = 'REJECTED',
        rejected_by = ${command.actor.id}::uuid,
        rejected_at = ${context.occurredAt.toISOString()}::timestamptz,
        rejection_reason = ${reason}, version = ${context.nextVersion},
        updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where incident_id = ${row.incident_id}::uuid and state = 'DETECTED'`.execute(transaction);
      const response = project((await incidentRows(transaction, row.incident_id))[0]!);
      return transitionEffect(ids, response, 'PlatformIncidentRejected', 'PI-03',
        'REJECT_PLATFORM_INCIDENT', 'DETECTED', 'REJECTED', reason,
        'platform.incident.rejected.v1');
    },
  });
}

export async function resolvePlatformIncident(
  database: Kysely<Database>, command: CommandEnvelope<ResolvePlatformIncidentPayload>,
  ids: PlatformIncidentEffectIds, now?: () => Date,
): Promise<ExecutedCommand<PlatformIncidentProjection>> {
  assertIncidentCommand(command);
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}), mutate: async (transaction, context) => {
      if (command.actor.type !== 'SYSTEM') await assertCentral(transaction, command.actor.id);
      const row = (await incidentRows(transaction, command.aggregateId, true))[0];
      if (!row) throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_STATE');
      await lockIncidentServices(transaction, row.affected_services);
      const normalized = normalizePlatformIncidentResolution({ state: row.state,
        actor: command.actor, startedAt: row.started_at,
        endedAt: new Date(command.payload.endedAt), reason: command.payload.reason });
      await sql`update platform.platform_incidents set state = 'RESOLVED',
        ended_at = ${normalized.endedAt.toISOString()}::timestamptz,
        resolved_by = ${command.actor.id}::uuid, resolved_by_actor_type = ${command.actor.type},
        resolved_at = ${context.occurredAt.toISOString()}::timestamptz,
        resolution_reason = ${normalized.reason}, version = ${context.nextVersion},
        updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where incident_id = ${row.incident_id}::uuid and state = 'CONFIRMED_ACTIVE'`
        .execute(transaction);
      const response = project((await incidentRows(transaction, row.incident_id))[0]!);
      return transitionEffect(ids, response, 'PlatformIncidentResolved', 'PI-04',
        'RESOLVE_PLATFORM_INCIDENT', 'CONFIRMED_ACTIVE', 'RESOLVED', normalized.reason,
        'platform.incident.resolved.v1');
    },
  });
}

export async function compensatePlatformIncidentImpacts(
  database: Kysely<Database>, command: CommandEnvelope<CompensatePlatformIncidentPayload>,
  ids: PlatformIncidentEffectIds, now?: () => Date,
): Promise<ExecutedCommand<PlatformIncidentProjection>> {
  assertIncidentCommand(command);
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}), mutate: async (transaction, context) => {
      const row = (await incidentRows(transaction, command.aggregateId, true))[0];
      if (!row) throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_STATE');
      assertPlatformIncidentCanBeCompensated({ state: row.state, actor: command.actor });
      const impacts = await sql<{ readonly count: string }>`select count(*)::text as count
        from platform.incident_impacts where incident_id = ${row.incident_id}::uuid`
        .execute(transaction);
      const impactCount = Number(impacts.rows[0]?.count ?? '0');
      await sql`update platform.platform_incidents set state = 'COMPENSATED',
        compensated_at = ${context.occurredAt.toISOString()}::timestamptz,
        impact_count = ${impactCount}, version = ${context.nextVersion},
        updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where incident_id = ${row.incident_id}::uuid and state = 'RESOLVED'`.execute(transaction);
      const response = project((await incidentRows(transaction, row.incident_id))[0]!);
      return transitionEffect(ids, response, 'PlatformIncidentCompensated', 'PI-05',
        'COMPENSATE_INCIDENT_IMPACTS', 'RESOLVED', 'COMPENSATED', null,
        'platform.incident.compensated.v1');
    },
  });
}

function transitionEffect(
  ids: PlatformIncidentEffectIds, response: PlatformIncidentProjection,
  eventName: string, transitionId: string, action: string,
  beforeState: PlatformIncidentState, afterState: PlatformIncidentState,
  reason: string | null, topic: string,
) {
  return {
    responseStatus: 200, response,
    event: { eventId: ids.eventId, eventName, schemaVersion: 1, transitionId,
      payload: { incidentId: response.incidentId, state: response.state,
        startedAt: response.startedAt, endedAt: response.endedAt,
        impactCount: response.impactCount },
      metadata: { policyVersion: PLATFORM_INCIDENT_POLICY_VERSION } },
    audit: { auditId: ids.auditId, action, transitionId, reasonCode: reason,
      beforeState, afterState, metadata: {} },
    outbox: [{ messageId: ids.outboxMessageId, topic,
      payload: { incidentId: response.incidentId, state: response.state,
        startedAt: response.startedAt, endedAt: response.endedAt } }],
  } as const;
}

interface PausableTimerWindow {
  readonly clock_started_at: Date;
  readonly deadline_at: Date;
}

async function pausableTimerWindow(
  database: Kysely<Database> | Transaction<Database>,
  deadlineKind: PausableDeadlineKind, aggregateId: string,
): Promise<PausableTimerWindow | null> {
  if (deadlineKind === 'CHALLENGE_RESPONSE') {
    const result = await sql<PausableTimerWindow>`select created_at as clock_started_at,
      response_deadline_at as deadline_at from competition.challenges
      where challenge_id = ${aggregateId}::uuid and state = 'AWAITING_RESPONSE'`
      .execute(database);
    return result.rows[0] ?? null;
  }
  if (deadlineKind === 'CHALLENGE_SCHEDULING') {
    const result = await sql<PausableTimerWindow>`select accepted_at as clock_started_at,
      scheduling_deadline_at as deadline_at from competition.challenges
      where challenge_id = ${aggregateId}::uuid
        and state in ('ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING')
        and accepted_at is not null and scheduling_deadline_at is not null`
      .execute(database);
    return result.rows[0] ?? null;
  }
  if (deadlineKind === 'BOOKING_SELECTION') {
    const result = await sql<PausableTimerWindow>`select created_at as clock_started_at,
      selection_expires_at as deadline_at from scheduling.bookings
      where booking_id = ${aggregateId}::uuid and state = 'SELECTING'`
      .execute(database);
    return result.rows[0] ?? null;
  }
  if (deadlineKind === 'STATUS_QUEUE_RECONFIRMATION') {
    const result = await sql<PausableTimerWindow>`select updated_at as clock_started_at,
      reconfirmation_deadline_at as deadline_at from competition.challenge_queue_entries
      where queue_entry_id = ${aggregateId}::uuid and state = 'RECONFIRMATION_REQUIRED'
        and reconfirmation_deadline_at is not null`.execute(database);
    return result.rows[0] ?? null;
  }
  if (deadlineKind === 'BOOKING_CONVERSION_CONFIRMATION') {
    const result = await sql<PausableTimerWindow>`select updated_at as clock_started_at,
      confirmation_deadline_at as deadline_at from scheduling.booking_official_conversions
      where conversion_id = ${aggregateId}::uuid and state = 'PENDING_CONFIRMATION'
        and confirmation_deadline_at is not null`.execute(database);
    return result.rows[0] ?? null;
  }
  const result = await sql<PausableTimerWindow>`select single_candidate_since_at as clock_started_at,
    coalesce(single_candidate_deadline_at, single_candidate_since_at + interval '3 days') as deadline_at
    from competition.challenge_queue_entries where queue_entry_id = ${aggregateId}::uuid
      and kind = 'GENESIS_CANDIDATE' and state = 'WAITING'
      and single_candidate_since_at is not null`.execute(database);
  return result.rows[0] ?? null;
}

async function activeTimerIncident(
  database: Kysely<Database> | Transaction<Database>, input: {
    readonly commandType: string;
    readonly aggregateId: string;
    readonly surface?: string;
    readonly now: Date;
  },
): Promise<{ readonly incident_id: string } | null> {
  const policy = timerPolicyForCommand(input.commandType);
  if (!policy) return null;
  const surface = input.surface ?? policy.deadlineKind;
  const window = await pausableTimerWindow(
    database, policy.deadlineKind, input.aggregateId,
  );
  if (!window) return null;
  const result = await sql<{ readonly incident_id: string }>`
    select incident.incident_id
    from platform.platform_incidents as incident
    where (
        incident.state = 'CONFIRMED_ACTIVE'
        or (
          incident.state = 'RESOLVED'
          and not exists (
            select 1 from platform.incident_impacts as impact
            where impact.incident_id = incident.incident_id
              and impact.aggregate_type = ${policy.aggregateType}
              and impact.aggregate_id = ${input.aggregateId}::uuid
              and impact.deadline_kind = ${policy.deadlineKind}
          )
        )
      )
      and ${policy.service} = any(incident.affected_services)
      and ${surface} = any(incident.affected_surfaces)
      and ${window.clock_started_at.toISOString()}::timestamptz
        < coalesce(incident.ended_at, 'infinity'::timestamptz)
      and incident.started_at < ${window.deadline_at.toISOString()}::timestamptz
      and ${input.now.toISOString()}::timestamptz >= incident.started_at
    order by incident.started_at, incident.incident_id
    limit 1
  `.execute(database);
  return result.rows[0] ?? null;
}

export async function readPlatformIncidentTimerSuppression(
  database: Kysely<Database>, payload: TimerCommandPayload,
  now: Date, surface?: string,
): Promise<PlatformIncidentTimerSuppression | null> {
  const incident = await activeTimerIncident(database, {
    commandType: payload.commandType, aggregateId: payload.aggregateId,
    ...(surface ? { surface } : {}), now,
  });
  return incident
    ? { incidentId: incident.incident_id,
        retryAt: new Date(now.getTime() + 5 * 60 * 1_000).toISOString() }
    : null;
}

export async function assertNoActivePlatformIncidentForTimer(
  transaction: Transaction<Database>, input: {
    readonly commandType: string;
    readonly aggregateId: string;
    readonly occurredAt: Date;
    readonly surface?: string;
  },
): Promise<void> {
  const policy = timerPolicyForCommand(input.commandType);
  if (policy) await lockIncidentServices(transaction, [policy.service]);
  if (await activeTimerIncident(transaction, {
    commandType: input.commandType, aggregateId: input.aggregateId,
    ...(input.surface ? { surface: input.surface } : {}), now: input.occurredAt,
  })) {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_TIMEOUT_SUPPRESSED');
  }
}

export async function listChallengeResponseIncidentImpactCandidates(
  database: Kysely<Database>, incidentId: string,
): Promise<ChallengeResponseIncidentImpactCandidate[]> {
  const result = await sql<{
    readonly challenge_id: string;
    readonly version: string;
    readonly surface: string;
  }>`
    select challenge.challenge_id, challenge.version::text,
      'CHALLENGE_RESPONSE'::text as surface
    from platform.platform_incidents as incident
    join competition.challenges as challenge
      on challenge.created_at < incident.ended_at
      and incident.started_at < challenge.response_deadline_at
    where incident.incident_id = ${incidentId}::uuid
      and incident.state = 'RESOLVED'
      and 'CHALLENGE' = any(incident.affected_services)
      and 'CHALLENGE_RESPONSE' = any(incident.affected_surfaces)
      and challenge.state = 'AWAITING_RESPONSE'
      and not exists (
        select 1 from platform.incident_impacts as impact
        where impact.incident_id = incident.incident_id
          and impact.aggregate_type = 'Challenge'
          and impact.aggregate_id = challenge.challenge_id
          and impact.deadline_kind = 'CHALLENGE_RESPONSE'
      )
    order by challenge.challenge_id
  `.execute(database);
  return result.rows.map((row) => ({ challengeId: row.challenge_id,
    version: Number(row.version), surface: row.surface }));
}

export async function applyChallengeResponseIncidentImpact(
  database: Kysely<Database>, command: CommandEnvelope<ApplyIncidentDeadlineImpactPayload>,
  ids: IncidentDeadlineImpactEffectIds, now?: () => Date,
): Promise<ExecutedCommand<IncidentDeadlineImpactProjection>> {
  if (command.actor.type !== 'SYSTEM' || command.actor.id !== null
    || command.commandType !== 'APPLY_PLATFORM_INCIDENT_DEADLINE_IMPACT'
    || command.aggregateType !== 'Challenge'
    || command.aggregateId !== command.payload.challengeId
    || command.payload.deadlineKind !== 'CHALLENGE_RESPONSE') {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_SYSTEM_REQUIRED');
  }
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}), mutate: async (transaction, context) => {
      const incidentResult = await sql<{
        readonly state: PlatformIncidentState;
        readonly started_at: Date;
        readonly ended_at: Date | null;
        readonly affected_services: string[];
        readonly affected_surfaces: string[];
      }>`select state, started_at, ended_at, affected_services, affected_surfaces
        from platform.platform_incidents
        where incident_id = ${command.payload.incidentId}::uuid for update`
        .execute(transaction);
      const incident = incidentResult.rows[0];
      if (!incident || incident.state !== 'RESOLVED' || !incident.ended_at
        || !incident.affected_services.includes('CHALLENGE')
        || !incident.affected_surfaces.includes(command.payload.surface)) {
        throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_STATE');
      }
      await lockIncidentServices(transaction, ['CHALLENGE']);
      const challengeResult = await sql<{
        readonly state: string;
        readonly created_at: Date;
        readonly response_deadline_at: Date;
        readonly response_policy: string;
        readonly version: string;
      }>`select state, created_at, response_deadline_at, response_policy, version::text
        from competition.challenges where challenge_id = ${command.aggregateId}::uuid for update`
        .execute(transaction);
      const challenge = challengeResult.rows[0];
      if (!challenge || challenge.state !== 'AWAITING_RESPONSE'
        || Number(challenge.version) !== command.expectedVersion) {
        throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_STATE');
      }
      const overlap = calculateExactIncidentOverlap({ clockStartedAt: challenge.created_at,
        deadlineAt: challenge.response_deadline_at, incidentStartedAt: incident.started_at,
        incidentEndedAt: incident.ended_at });
      if (overlap.overlapMilliseconds === 0 || !overlap.overlapStartedAt || !overlap.overlapEndedAt) {
        throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_WINDOW');
      }
      await sql`insert into platform.incident_impacts (
        impact_id, incident_id, aggregate_type, aggregate_id, service, surface,
        deadline_kind, impact_type, clock_started_at, old_deadline_at, new_deadline_at,
        overlap_started_at, overlap_ended_at, overlap_milliseconds, compensating_event_id
      ) values (
        ${ids.impactId}::uuid, ${command.payload.incidentId}::uuid, 'Challenge',
        ${command.aggregateId}::uuid, 'CHALLENGE', ${command.payload.surface},
        'CHALLENGE_RESPONSE', 'DEADLINE_EXTENDED', ${challenge.created_at.toISOString()}::timestamptz,
        ${challenge.response_deadline_at.toISOString()}::timestamptz,
        ${overlap.newDeadlineAt.toISOString()}::timestamptz,
        ${overlap.overlapStartedAt.toISOString()}::timestamptz,
        ${overlap.overlapEndedAt.toISOString()}::timestamptz,
        ${overlap.overlapMilliseconds}, ${ids.eventId}::uuid
      )`.execute(transaction);
      await sql`update competition.challenges
        set response_deadline_at = ${overlap.newDeadlineAt.toISOString()}::timestamptz,
          version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where challenge_id = ${command.aggregateId}::uuid
          and state = 'AWAITING_RESPONSE' and version = ${command.expectedVersion}`
        .execute(transaction);
      const response: IncidentDeadlineImpactProjection = {
        impactId: ids.impactId, incidentId: command.payload.incidentId,
        aggregateType: 'Challenge', aggregateId: command.aggregateId,
        deadlineKind: 'CHALLENGE_RESPONSE',
        oldDeadlineAt: challenge.response_deadline_at.toISOString(),
        newDeadlineAt: overlap.newDeadlineAt.toISOString(),
        overlapMilliseconds: overlap.overlapMilliseconds, version: context.nextVersion,
      };
      const timerCommandType = challenge.response_policy === 'OPTIONAL'
        ? 'EXPIRE_OPTIONAL_CHALLENGE'
        : challenge.response_policy === 'MANDATORY'
          ? 'EXPIRE_MANDATORY_CHALLENGE'
          : 'EXPIRE_GENESIS_CHALLENGE';
      return {
        responseStatus: 200, response,
        event: { eventId: ids.eventId,
          eventName: 'PausableDeadlineExtendedByPlatformIncident', schemaVersion: 1,
          transitionId: null, payload: response,
          metadata: { policyVersion: PLATFORM_INCIDENT_POLICY_VERSION } },
        audit: { auditId: ids.auditId,
          action: 'APPLY_PLATFORM_INCIDENT_DEADLINE_IMPACT', transitionId: null,
          reasonCode: 'CONFIRMED_PLATFORM_INCIDENT', beforeState: challenge.state,
          afterState: challenge.state, metadata: { ...response } },
        outbox: [{ messageId: ids.outboxMessageId,
          topic: 'platform.incident.deadline-extended.v1', payload: {
            ...response, timer: { commandType: timerCommandType, aggregateType: 'Challenge',
              aggregateId: command.aggregateId, expectedState: challenge.state,
              expectedVersion: context.nextVersion, deadlineAt: overlap.newDeadlineAt.toISOString(),
              policyVersion: PLATFORM_INCIDENT_POLICY_VERSION,
              idempotencyKey: `incident:${command.payload.incidentId}:challenge:${command.aggregateId}:deadline`,
            },
          } }],
      };
    },
  });
}

export async function listPausableDeadlineImpactCandidates(
  database: Kysely<Database>, incidentId: string,
): Promise<PausableDeadlineImpactCandidate[]> {
  const result = await sql<{
    readonly aggregate_type: PausableDeadlineImpactCandidate['aggregateType'];
    readonly aggregate_id: string;
    readonly command_type: string;
    readonly deadline_kind: PausableDeadlineImpactCandidate['deadlineKind'];
    readonly surface: string;
    readonly version: string;
  }>`
    with incident as (
      select * from platform.platform_incidents
      where incident_id = ${incidentId}::uuid and state = 'RESOLVED'
    ), candidates as (
      select 'Challenge'::text as aggregate_type, challenge.challenge_id as aggregate_id,
        'EXPIRE_CHALLENGE_SCHEDULING'::text as command_type,
        'CHALLENGE_SCHEDULING'::text as deadline_kind,
        challenge.accepted_at as clock_started_at,
        challenge.scheduling_deadline_at as deadline_at, challenge.version
      from incident, competition.challenges as challenge
      where challenge.state in ('ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING')
        and challenge.accepted_at is not null and challenge.scheduling_deadline_at is not null
        and 'CHALLENGE' = any(incident.affected_services)
        and 'CHALLENGE_SCHEDULING' = any(incident.affected_surfaces)
      union all
      select 'Booking', booking.booking_id, 'EXPIRE_BOOKING_SELECTION',
        'BOOKING_SELECTION', booking.created_at, booking.selection_expires_at, booking.version
      from incident, scheduling.bookings as booking
      where booking.state = 'SELECTING' and 'BOOKING' = any(incident.affected_services)
        and 'BOOKING_SELECTION' = any(incident.affected_surfaces)
      union all
      select 'ChallengeQueueEntry', entry.queue_entry_id,
        'EXPIRE_STATUS_QUEUE_RECONFIRMATION', 'STATUS_QUEUE_RECONFIRMATION',
        entry.updated_at, entry.reconfirmation_deadline_at, entry.version
      from incident, competition.challenge_queue_entries as entry
      where entry.state = 'RECONFIRMATION_REQUIRED'
        and entry.reconfirmation_deadline_at is not null
        and 'STATUS_QUEUE' = any(incident.affected_services)
        and 'STATUS_QUEUE_RECONFIRMATION' = any(incident.affected_surfaces)
      union all
      select 'BookingOfficialConversion', conversion.conversion_id,
        'EXPIRE_BOOKING_OFFICIAL_CONVERSION', 'BOOKING_CONVERSION_CONFIRMATION',
        conversion.updated_at, conversion.confirmation_deadline_at, conversion.version
      from incident, scheduling.booking_official_conversions as conversion
      where conversion.state = 'PENDING_CONFIRMATION'
        and conversion.confirmation_deadline_at is not null
        and 'BOOKING' = any(incident.affected_services)
        and 'BOOKING_CONVERSION_CONFIRMATION' = any(incident.affected_surfaces)
      union all
      select 'ChallengeQueueEntry', entry.queue_entry_id,
        'PROMOTE_SINGLE_GENESIS_CANDIDATE', 'GENESIS_PUBLIC_WINDOW',
        entry.single_candidate_since_at,
        coalesce(entry.single_candidate_deadline_at,
          entry.single_candidate_since_at + interval '3 days'), entry.version
      from incident, competition.challenge_queue_entries as entry
      where entry.kind = 'GENESIS_CANDIDATE' and entry.state = 'WAITING'
        and entry.single_candidate_since_at is not null
        and 'COMPETITION' = any(incident.affected_services)
        and 'GENESIS_PUBLIC_WINDOW' = any(incident.affected_surfaces)
    )
    select candidate.aggregate_type, candidate.aggregate_id,
      candidate.command_type, candidate.deadline_kind,
      candidate.deadline_kind as surface, candidate.version::text
    from candidates as candidate, incident
    where candidate.clock_started_at < incident.ended_at
      and incident.started_at < candidate.deadline_at
      and not exists (
        select 1 from platform.incident_impacts as impact
        where impact.incident_id = incident.incident_id
          and impact.aggregate_type = candidate.aggregate_type
          and impact.aggregate_id = candidate.aggregate_id
          and impact.deadline_kind = candidate.deadline_kind
      )
    order by candidate.deadline_kind, candidate.aggregate_id
  `.execute(database);
  return result.rows.map((row) => ({ aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id, commandType: row.command_type,
    deadlineKind: row.deadline_kind, surface: row.surface, version: Number(row.version) }));
}

interface LockedDeadlineRow extends PausableTimerWindow {
  readonly state: string;
  readonly version: string;
}

async function lockPausableDeadlineRow(
  transaction: Transaction<Database>, deadlineKind: ApplyPausableDeadlineImpactPayload['deadlineKind'],
  aggregateId: string,
): Promise<LockedDeadlineRow | null> {
  if (deadlineKind === 'CHALLENGE_SCHEDULING') {
    const result = await sql<LockedDeadlineRow>`select state, version::text,
      accepted_at as clock_started_at, scheduling_deadline_at as deadline_at
      from competition.challenges where challenge_id = ${aggregateId}::uuid
        and state in ('ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING')
        and accepted_at is not null and scheduling_deadline_at is not null for update`
      .execute(transaction);
    return result.rows[0] ?? null;
  }
  if (deadlineKind === 'BOOKING_SELECTION') {
    const result = await sql<LockedDeadlineRow>`select state, version::text,
      created_at as clock_started_at, selection_expires_at as deadline_at
      from scheduling.bookings where booking_id = ${aggregateId}::uuid
        and state = 'SELECTING' for update`.execute(transaction);
    return result.rows[0] ?? null;
  }
  if (deadlineKind === 'STATUS_QUEUE_RECONFIRMATION') {
    const result = await sql<LockedDeadlineRow>`select state, version::text,
      updated_at as clock_started_at, reconfirmation_deadline_at as deadline_at
      from competition.challenge_queue_entries where queue_entry_id = ${aggregateId}::uuid
        and state = 'RECONFIRMATION_REQUIRED' and reconfirmation_deadline_at is not null
        for update`.execute(transaction);
    return result.rows[0] ?? null;
  }
  if (deadlineKind === 'BOOKING_CONVERSION_CONFIRMATION') {
    const result = await sql<LockedDeadlineRow>`select state, version::text,
      updated_at as clock_started_at, confirmation_deadline_at as deadline_at
      from scheduling.booking_official_conversions where conversion_id = ${aggregateId}::uuid
        and state = 'PENDING_CONFIRMATION' and confirmation_deadline_at is not null
        for update`.execute(transaction);
    return result.rows[0] ?? null;
  }
  const result = await sql<LockedDeadlineRow>`select state, version::text,
    single_candidate_since_at as clock_started_at,
    coalesce(single_candidate_deadline_at, single_candidate_since_at + interval '3 days')
      as deadline_at
    from competition.challenge_queue_entries where queue_entry_id = ${aggregateId}::uuid
      and kind = 'GENESIS_CANDIDATE' and state = 'WAITING'
      and single_candidate_since_at is not null for update`.execute(transaction);
  return result.rows[0] ?? null;
}

async function updatePausableDeadline(input: {
  readonly transaction: Transaction<Database>;
  readonly deadlineKind: ApplyPausableDeadlineImpactPayload['deadlineKind'];
  readonly aggregateId: string;
  readonly newDeadlineAt: Date;
  readonly nextVersion: number;
  readonly occurredAt: Date;
}): Promise<void> {
  const { transaction, deadlineKind, aggregateId, newDeadlineAt, nextVersion, occurredAt } = input;
  if (deadlineKind === 'CHALLENGE_SCHEDULING') {
    await sql`update competition.challenges set
      scheduling_deadline_at = ${newDeadlineAt.toISOString()}::timestamptz,
      version = ${nextVersion}, updated_at = ${occurredAt.toISOString()}::timestamptz
      where challenge_id = ${aggregateId}::uuid
        and state in ('ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING')`.execute(transaction);
  } else if (deadlineKind === 'BOOKING_SELECTION') {
    await sql`update scheduling.bookings set
      selection_expires_at = ${newDeadlineAt.toISOString()}::timestamptz,
      version = ${nextVersion}, updated_at = ${occurredAt.toISOString()}::timestamptz
      where booking_id = ${aggregateId}::uuid and state = 'SELECTING'`.execute(transaction);
  } else if (deadlineKind === 'STATUS_QUEUE_RECONFIRMATION') {
    await sql`update competition.challenge_queue_entries set
      reconfirmation_deadline_at = ${newDeadlineAt.toISOString()}::timestamptz,
      version = ${nextVersion}, updated_at = ${occurredAt.toISOString()}::timestamptz
      where queue_entry_id = ${aggregateId}::uuid and state = 'RECONFIRMATION_REQUIRED'`
      .execute(transaction);
  } else if (deadlineKind === 'BOOKING_CONVERSION_CONFIRMATION') {
    await sql`update scheduling.booking_official_conversions set
      confirmation_deadline_at = ${newDeadlineAt.toISOString()}::timestamptz,
      version = ${nextVersion}, updated_at = ${occurredAt.toISOString()}::timestamptz
      where conversion_id = ${aggregateId}::uuid and state = 'PENDING_CONFIRMATION'`
      .execute(transaction);
  } else {
    await sql`update competition.challenge_queue_entries set
      single_candidate_deadline_at = ${newDeadlineAt.toISOString()}::timestamptz,
      version = ${nextVersion}, updated_at = ${occurredAt.toISOString()}::timestamptz
      where queue_entry_id = ${aggregateId}::uuid
        and kind = 'GENESIS_CANDIDATE' and state = 'WAITING'`.execute(transaction);
  }
}

export async function applyPausableDeadlineIncidentImpact(
  database: Kysely<Database>, command: CommandEnvelope<ApplyPausableDeadlineImpactPayload>,
  ids: IncidentDeadlineImpactEffectIds, now?: () => Date,
): Promise<ExecutedCommand<PausableDeadlineImpactProjection>> {
  const policy = pausableTimerRegistry().find((entry) =>
    entry.deadlineKind === command.payload.deadlineKind);
  if (!policy || command.actor.type !== 'SYSTEM' || command.actor.id !== null
    || command.commandType !== 'APPLY_PLATFORM_INCIDENT_DEADLINE_IMPACT'
    || command.aggregateType !== policy.aggregateType) {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_SYSTEM_REQUIRED');
  }
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}), mutate: async (transaction, context) => {
      await lockIncidentServices(transaction, [policy.service]);
      const incidentResult = await sql<{
        readonly state: PlatformIncidentState;
        readonly started_at: Date;
        readonly ended_at: Date | null;
        readonly affected_services: string[];
        readonly affected_surfaces: string[];
      }>`select state, started_at, ended_at, affected_services, affected_surfaces
        from platform.platform_incidents where incident_id = ${command.payload.incidentId}::uuid
        for update`.execute(transaction);
      const incident = incidentResult.rows[0];
      if (!incident || incident.state !== 'RESOLVED' || !incident.ended_at
        || !incident.affected_services.includes(policy.service)
        || !incident.affected_surfaces.includes(command.payload.surface)) {
        throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_STATE');
      }
      const aggregate = await lockPausableDeadlineRow(
        transaction, command.payload.deadlineKind, command.aggregateId,
      );
      if (!aggregate || Number(aggregate.version) !== command.expectedVersion) {
        throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_STATE');
      }
      const overlap = calculateExactIncidentOverlap({
        clockStartedAt: aggregate.clock_started_at, deadlineAt: aggregate.deadline_at,
        incidentStartedAt: incident.started_at, incidentEndedAt: incident.ended_at,
      });
      if (overlap.overlapMilliseconds === 0 || !overlap.overlapStartedAt || !overlap.overlapEndedAt) {
        throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_WINDOW');
      }
      await sql`insert into platform.incident_impacts (
        impact_id, incident_id, aggregate_type, aggregate_id, service, surface,
        deadline_kind, impact_type, clock_started_at, old_deadline_at, new_deadline_at,
        overlap_started_at, overlap_ended_at, overlap_milliseconds, compensating_event_id
      ) values (
        ${ids.impactId}::uuid, ${command.payload.incidentId}::uuid,
        ${policy.aggregateType}, ${command.aggregateId}::uuid, ${policy.service},
        ${command.payload.surface}, ${command.payload.deadlineKind}, 'DEADLINE_EXTENDED',
        ${aggregate.clock_started_at.toISOString()}::timestamptz,
        ${aggregate.deadline_at.toISOString()}::timestamptz,
        ${overlap.newDeadlineAt.toISOString()}::timestamptz,
        ${overlap.overlapStartedAt.toISOString()}::timestamptz,
        ${overlap.overlapEndedAt.toISOString()}::timestamptz,
        ${overlap.overlapMilliseconds}, ${ids.eventId}::uuid
      )`.execute(transaction);
      await updatePausableDeadline({ transaction, deadlineKind: command.payload.deadlineKind,
        aggregateId: command.aggregateId, newDeadlineAt: overlap.newDeadlineAt,
        nextVersion: context.nextVersion, occurredAt: context.occurredAt });
      const response: PausableDeadlineImpactProjection = {
        impactId: ids.impactId, incidentId: command.payload.incidentId,
        aggregateType: policy.aggregateType, aggregateId: command.aggregateId,
        deadlineKind: command.payload.deadlineKind,
        oldDeadlineAt: aggregate.deadline_at.toISOString(),
        newDeadlineAt: overlap.newDeadlineAt.toISOString(),
        overlapMilliseconds: overlap.overlapMilliseconds, version: context.nextVersion,
      };
      return {
        responseStatus: 200, response,
        event: { eventId: ids.eventId,
          eventName: 'PausableDeadlineExtendedByPlatformIncident', schemaVersion: 1,
          transitionId: null, payload: response,
          metadata: { policyVersion: PLATFORM_INCIDENT_POLICY_VERSION } },
        audit: { auditId: ids.auditId,
          action: 'APPLY_PLATFORM_INCIDENT_DEADLINE_IMPACT', transitionId: null,
          reasonCode: 'CONFIRMED_PLATFORM_INCIDENT', beforeState: aggregate.state,
          afterState: aggregate.state, metadata: { ...response } },
        outbox: [{ messageId: ids.outboxMessageId,
          topic: 'platform.incident.deadline-extended.v1', payload: { ...response,
            timer: { commandType: policy.commandType, aggregateType: policy.aggregateType,
              aggregateId: command.aggregateId, expectedState: aggregate.state,
              expectedVersion: context.nextVersion,
              deadlineAt: overlap.newDeadlineAt.toISOString(),
              policyVersion: PLATFORM_INCIDENT_POLICY_VERSION,
              idempotencyKey: `incident:${command.payload.incidentId}:${policy.deadlineKind}:${command.aggregateId}`,
            } } }],
      };
    },
  });
}

export async function listMandatoryTimeoutCompensationCandidates(
  database: Kysely<Database>, incidentId: string,
): Promise<MandatoryTimeoutCompensationCandidate[]> {
  const result = await sql<{
    readonly challenge_id: string;
    readonly result_id: string;
    readonly version: string;
  }>`
    select challenge.challenge_id, result.result_id, challenge.version::text
    from platform.platform_incidents as incident
    join competition.challenges as challenge
      on challenge.created_at < incident.ended_at
      and incident.started_at < challenge.response_deadline_at
    join competition.results as result on result.challenge_id = challenge.challenge_id
      and result.origin = 'ADMINISTRATIVE_FORFEIT'
      and result.reason_code = 'MANDATORY_RESPONSE_EXPIRED'
    join platform.domain_events as timeout_event
      on timeout_event.aggregate_type = 'Challenge'
      and timeout_event.aggregate_id = challenge.challenge_id
      and timeout_event.event_name = 'MandatoryChallengeExpired'
      and timeout_event.payload->>'resultId' = result.result_id::text
      and timeout_event.occurred_at >= incident.started_at
      and timeout_event.occurred_at < incident.ended_at
    where incident.incident_id = ${incidentId}::uuid
      and incident.state = 'RESOLVED'
      and 'CHALLENGE' = any(incident.affected_services)
      and 'CHALLENGE_RESPONSE' = any(incident.affected_surfaces)
      and challenge.state in ('RESULT_RECORDED', 'COMPLETED')
      and not exists (
        select 1 from platform.incident_impacts as impact
        where impact.incident_id = incident.incident_id
          and impact.aggregate_type = 'Challenge'
          and impact.aggregate_id = challenge.challenge_id
          and impact.deadline_kind = 'CHALLENGE_RESPONSE'
      )
    order by timeout_event.occurred_at, challenge.challenge_id
  `.execute(database);
  return result.rows.map((row) => ({ challengeId: row.challenge_id,
    resultId: row.result_id, version: Number(row.version) }));
}

interface MandatoryTimeoutRow {
  readonly challenge_id: string;
  readonly challenge_state: string;
  readonly challenge_version: string;
  readonly created_at: Date;
  readonly response_deadline_at: Date;
  readonly result_id: string;
  readonly result_state: string;
  readonly result_version: string;
  readonly recorded_at: Date;
  readonly source_timeout_event_id: string;
  readonly timeout_occurred_at: Date;
  readonly status_transition_id: string;
  readonly status_transition_event_id: string;
  readonly competition_id: string;
  readonly competition_version: string;
  readonly competition_status_version: string;
  readonly status_lock_result_id: string | null;
  readonly cooldown_id: string;
}

export async function compensateMandatoryChallengeTimeout(
  database: Kysely<Database>, command: CommandEnvelope<CompensateMandatoryTimeoutPayload>,
  ids: MandatoryTimeoutCompensationEffectIds, now?: () => Date,
): Promise<ExecutedCommand<MandatoryTimeoutCompensationProjection>> {
  if (command.actor.type !== 'SYSTEM' || command.actor.id !== null
    || command.commandType !== 'COMPENSATE_MANDATORY_CHALLENGE_TIMEOUT'
    || command.aggregateType !== 'Challenge'
    || command.aggregateId !== command.payload.challengeId) {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_SYSTEM_REQUIRED');
  }
  return executeCriticalCommand(database, {
    command, ...(now ? { now } : {}), mutate: async (transaction, context) => {
      await lockIncidentServices(transaction, ['CHALLENGE']);
      const incidentResult = await sql<{
        readonly state: PlatformIncidentState;
        readonly started_at: Date;
        readonly ended_at: Date | null;
        readonly affected_services: string[];
        readonly affected_surfaces: string[];
      }>`select state, started_at, ended_at, affected_services, affected_surfaces
        from platform.platform_incidents
        where incident_id = ${command.payload.incidentId}::uuid for update`
        .execute(transaction);
      const incident = incidentResult.rows[0];
      if (!incident || incident.state !== 'RESOLVED' || !incident.ended_at
        || !incident.affected_services.includes('CHALLENGE')
        || !incident.affected_surfaces.includes('CHALLENGE_RESPONSE')) {
        throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_STATE');
      }
      const sourceResult = await sql<MandatoryTimeoutRow>`
        select challenge.challenge_id, challenge.state as challenge_state,
          challenge.version::text as challenge_version, challenge.created_at,
          challenge.response_deadline_at, result.result_id,
          result.state as result_state, result.version::text as result_version,
          result.recorded_at, timeout_event.event_id as source_timeout_event_id,
          timeout_event.occurred_at as timeout_occurred_at,
          transition.transition_id as status_transition_id,
          result.status_transition_event_id,
          competition.competition_id,
          competition.version::text as competition_version,
          competition.status_version::text as competition_status_version,
          competition.status_lock_result_id, cooldown.cooldown_id
        from competition.challenges as challenge
        join competition.results as result on result.challenge_id = challenge.challenge_id
          and result.result_id = ${command.payload.resultId}::uuid
          and result.origin = 'ADMINISTRATIVE_FORFEIT'
          and result.reason_code = 'MANDATORY_RESPONSE_EXPIRED'
        join competition.status_transitions as transition
          on transition.source_result_id = result.result_id
        join competition.competitions as competition
          on competition.competition_id = challenge.competition_id
        join competition.pair_cooldowns as cooldown
          on cooldown.source_result_id = result.result_id
        join platform.domain_events as timeout_event
          on timeout_event.aggregate_type = 'Challenge'
          and timeout_event.aggregate_id = challenge.challenge_id
          and timeout_event.event_name = 'MandatoryChallengeExpired'
          and timeout_event.payload->>'resultId' = result.result_id::text
        where challenge.challenge_id = ${command.aggregateId}::uuid
        for update of challenge, result, competition
      `.execute(transaction);
      const row = sourceResult.rows[0];
      if (!row || !['RESULT_RECORDED', 'COMPLETED'].includes(row.challenge_state)
        || !['RECORDED', 'FINAL'].includes(row.result_state)
        || row.timeout_occurred_at < incident.started_at
        || row.timeout_occurred_at >= incident.ended_at
        || Number(row.challenge_version) !== command.expectedVersion) {
        throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_STATE');
      }
      const overlap = calculateExactIncidentOverlap({ clockStartedAt: row.created_at,
        deadlineAt: row.response_deadline_at, incidentStartedAt: incident.started_at,
        incidentEndedAt: incident.ended_at });
      if (overlap.overlapMilliseconds === 0 || !overlap.overlapStartedAt || !overlap.overlapEndedAt) {
        throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_WINDOW');
      }
      const replay = await replayCompetitionStatusExcludingResults({ transaction,
        sourceTransitionId: row.status_transition_id, excludedResultIds: [row.result_id] });
      const resultNextVersion = Number(row.result_version) + 1;
      const competitionNextVersion = Number(row.competition_version) + 1;
      const competitionStatusVersion = Number(row.competition_status_version) + 1;

      await sql`insert into platform.incident_impacts (
        impact_id, incident_id, aggregate_type, aggregate_id, service, surface,
        deadline_kind, impact_type, clock_started_at, old_deadline_at, new_deadline_at,
        overlap_started_at, overlap_ended_at, overlap_milliseconds,
        source_timeout_event_id, source_result_id, source_status_event_id,
        compensating_event_id
      ) values (
        ${ids.impactId}::uuid, ${command.payload.incidentId}::uuid, 'Challenge',
        ${row.challenge_id}::uuid, 'CHALLENGE', 'CHALLENGE_RESPONSE',
        'CHALLENGE_RESPONSE', 'TIMEOUT_COMPENSATED', ${row.created_at.toISOString()}::timestamptz,
        ${row.response_deadline_at.toISOString()}::timestamptz,
        ${overlap.newDeadlineAt.toISOString()}::timestamptz,
        ${overlap.overlapStartedAt.toISOString()}::timestamptz,
        ${overlap.overlapEndedAt.toISOString()}::timestamptz, ${overlap.overlapMilliseconds},
        ${row.source_timeout_event_id}::uuid, ${row.result_id}::uuid,
        ${row.status_transition_event_id}::uuid, ${ids.eventId}::uuid
      )`.execute(transaction);
      await sql`insert into platform.incident_timeout_compensations (
        compensation_id, impact_id, incident_id, challenge_id,
        source_timeout_event_id, source_result_id, source_status_transition_id,
        replay_hash, compensating_event_id, compensated_at, policy_version
      ) values (
        ${ids.compensationId}::uuid, ${ids.impactId}::uuid,
        ${command.payload.incidentId}::uuid, ${row.challenge_id}::uuid,
        ${row.source_timeout_event_id}::uuid, ${row.result_id}::uuid,
        ${row.status_transition_id}::uuid, ${replay.replayHash}, ${ids.eventId}::uuid,
        ${context.occurredAt.toISOString()}::timestamptz,
        ${PLATFORM_INCIDENT_POLICY_VERSION}
      )`.execute(transaction);
      await sql`update competition.challenges set state = 'CANCELLED_NO_FAULT',
        version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where challenge_id = ${row.challenge_id}::uuid
          and state in ('RESULT_RECORDED', 'COMPLETED')`.execute(transaction);
      await sql`update competition.results set state = 'ANNULLED',
        finalized_at = coalesce(finalized_at, ${context.occurredAt.toISOString()}::timestamptz),
        version = ${resultNextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where result_id = ${row.result_id}::uuid and state in ('RECORDED', 'FINAL')`
        .execute(transaction);
      await sql`update competition.competitions set
        champion_user_id = ${replay.championUserId}::uuid,
        contender_user_id = ${replay.contenderUserId}::uuid,
        status_version = ${competitionStatusVersion},
        status_lock_result_id = case when status_lock_result_id = ${row.result_id}::uuid
          then null else status_lock_result_id end,
        version = ${competitionNextVersion},
        updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where competition_id = ${row.competition_id}::uuid`.execute(transaction);
      await sql`update competition.pair_cooldowns
        set invalidated_at = coalesce(invalidated_at, ${context.occurredAt.toISOString()}::timestamptz)
        where cooldown_id = ${row.cooldown_id}::uuid`.execute(transaction);
      await sql`update competition.challenge_participant_obligations
        set released_at = ${context.occurredAt.toISOString()}::timestamptz,
          release_reason = 'INCIDENT_TIMEOUT_COMPENSATED_NO_FAULT'
        where challenge_id = ${row.challenge_id}::uuid and released_at is null`
        .execute(transaction);

      const response: MandatoryTimeoutCompensationProjection = {
        incidentId: command.payload.incidentId, impactId: ids.impactId,
        compensationId: ids.compensationId, challengeId: row.challenge_id,
        resultId: row.result_id, challengeState: 'CANCELLED_NO_FAULT',
        resultState: 'ANNULLED', championUserId: replay.championUserId,
        contenderUserId: replay.contenderUserId, replayHash: replay.replayHash,
        overlapMilliseconds: overlap.overlapMilliseconds, version: context.nextVersion,
      };
      const relatedEvents: RelatedDomainEventDraft[] = [
        { eventId: ids.resultEventId, eventName: 'IncidentResultCompensatedNoFault',
          schemaVersion: 1, aggregateType: 'Result', aggregateId: row.result_id,
          aggregateVersion: resultNextVersion, transitionId: null,
          payload: { incidentId: command.payload.incidentId, impactId: ids.impactId,
            sourceTimeoutEventId: row.source_timeout_event_id,
            sourceOutcomeCode: 'FORFEIT', effectiveOutcomeCode: null },
          metadata: { policyVersion: PLATFORM_INCIDENT_POLICY_VERSION } },
        { eventId: ids.competitionEventId,
          eventName: 'CompetitionStatusReplayedAfterPlatformIncident', schemaVersion: 1,
          aggregateType: 'Competition', aggregateId: row.competition_id,
          aggregateVersion: competitionNextVersion, transitionId: null,
          payload: { incidentId: command.payload.incidentId, sourceResultId: row.result_id,
            championUserId: replay.championUserId, contenderUserId: replay.contenderUserId,
            statusVersion: competitionStatusVersion, replayHash: replay.replayHash },
          metadata: { policyVersion: PLATFORM_INCIDENT_POLICY_VERSION } },
        { eventId: ids.cooldownEventId, eventName: 'PairCooldownCompensatedNoFault',
          schemaVersion: 1, aggregateType: 'PairCooldown', aggregateId: row.cooldown_id,
          aggregateVersion: 2, transitionId: 'CD-03',
          payload: { incidentId: command.payload.incidentId,
            sourceResultId: row.result_id, cooldownId: row.cooldown_id },
          metadata: { policyVersion: PLATFORM_INCIDENT_POLICY_VERSION } },
      ];
      return {
        responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'IncidentTimeoutCompensatedNoFault',
          schemaVersion: 1, transitionId: null, payload: response,
          metadata: { policyVersion: PLATFORM_INCIDENT_POLICY_VERSION,
            sourceTimeoutEventId: row.source_timeout_event_id } },
        relatedEvents,
        audit: { auditId: ids.auditId,
          action: 'COMPENSATE_MANDATORY_CHALLENGE_TIMEOUT', transitionId: null,
          reasonCode: 'CONFIRMED_PLATFORM_INCIDENT', beforeState: row.challenge_state,
          afterState: 'CANCELLED_NO_FAULT', metadata: { replayHash: replay.replayHash,
            sourceResultId: row.result_id, impactId: ids.impactId } },
        outbox: [{ messageId: ids.outboxMessageId,
          topic: 'platform.incident.timeout-compensated-no-fault.v1', payload: response }],
      };
    },
  });
}
