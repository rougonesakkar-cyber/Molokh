import {
  PLATFORM_INCIDENT_POLICY_VERSION,
  PlatformIncidentConflictError,
  assertPlatformIncidentCanBeCompensated,
  assertPlatformIncidentCanBeConfirmed,
  assertPlatformIncidentCanBeRejected,
  normalizePlatformIncidentDetection,
  normalizePlatformIncidentResolution,
  type CommandEnvelope,
  type PlatformIncidentSeverity,
  type PlatformIncidentState,
  type PlatformService,
} from '@molokh/core';
import { type Kysely, type Transaction, sql } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand } from './platform-command.js';

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
