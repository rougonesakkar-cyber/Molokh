import { createHash } from 'node:crypto';

import {
  IdempotencyKeyReusedError,
  assertCommandEnvelope,
  assertExpectedVersion,
  commandIdempotencyScope,
  nextAggregateVersion,
  type CommandEnvelope,
} from '@molokh/core';
import { type Kysely, type Transaction, sql } from 'kysely';

import type { Database } from './index.js';

export interface DomainEventDraft {
  readonly eventId: string;
  readonly eventName: string;
  readonly schemaVersion: number;
  readonly transitionId: string | null;
  readonly payload: unknown;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface RelatedDomainEventDraft extends DomainEventDraft {
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
}

export interface AuditDraft {
  readonly auditId: string;
  readonly action: string;
  readonly transitionId: string | null;
  readonly reasonCode: string | null;
  readonly beforeState: string | null;
  readonly afterState: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface OutboxDraft {
  readonly messageId: string;
  readonly topic: string;
  readonly payload: unknown;
  readonly sourceEventId?: string;
}

export interface CriticalCommandEffect<TResponse> {
  readonly responseStatus: number;
  readonly response: TResponse;
  readonly event: DomainEventDraft;
  readonly relatedEvents?: readonly RelatedDomainEventDraft[];
  readonly audit: AuditDraft;
  readonly outbox: readonly OutboxDraft[];
}

export interface CommandMutationContext {
  readonly nextVersion: number;
  readonly occurredAt: Date;
}

export interface ExecuteCriticalCommandOptions<TPayload, TResponse> {
  readonly command: CommandEnvelope<TPayload>;
  readonly mutate: (
    transaction: Transaction<Database>,
    context: CommandMutationContext,
  ) => Promise<CriticalCommandEffect<TResponse>>;
  readonly now?: () => Date;
}

export interface ExecutedCommand<TResponse> {
  readonly responseStatus: number;
  readonly response: TResponse;
  readonly eventId: string;
  readonly aggregateVersion: number;
  readonly replayed: boolean;
}

interface ExistingIdempotencyRecord {
  readonly request_hash: string;
  readonly response_status: number;
  readonly response_body: unknown;
  readonly event_id: string;
}

interface AggregateVersionRow {
  readonly actual_version: string;
}

function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Command data must contain finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Command data must contain only JSON objects');
    }
    const object = value as Record<string, unknown>;
    const entries = Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`);
    return `{${entries.join(',')}}`;
  }
  throw new TypeError(`Command data contains unsupported ${typeof value} value`);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashCommandRequest<TPayload>(
  command: CommandEnvelope<TPayload>,
): string {
  return sha256(
    canonicalize({
      actorId: command.actor.id,
      actorType: command.actor.type,
      aggregateId: command.aggregateId,
      aggregateType: command.aggregateType,
      commandType: command.commandType,
      expectedVersion: command.expectedVersion,
      payload: command.payload,
      payloadVersion: command.payloadVersion,
    }),
  );
}

function assertEffect<TResponse>(effect: CriticalCommandEffect<TResponse>): void {
  if (!Number.isInteger(effect.responseStatus) || effect.responseStatus < 200 || effect.responseStatus > 299) {
    throw new RangeError('Successful command response status must be in the 2xx range');
  }
  if (effect.event.eventId.trim().length === 0 || effect.event.eventName.trim().length === 0) {
    throw new TypeError('Domain event identity is required');
  }
  if (!Number.isSafeInteger(effect.event.schemaVersion) || effect.event.schemaVersion < 1) {
    throw new RangeError('Domain event schema version must be a positive safe integer');
  }
  const eventIds = new Set([effect.event.eventId]);
  for (const related of effect.relatedEvents ?? []) {
    if (
      related.eventId.trim().length === 0 ||
      related.eventName.trim().length === 0 ||
      related.aggregateType.trim().length === 0 ||
      related.aggregateId.trim().length === 0
    ) {
      throw new TypeError('Related domain event identity is required');
    }
    if (
      !Number.isSafeInteger(related.schemaVersion) ||
      related.schemaVersion < 1 ||
      !Number.isSafeInteger(related.aggregateVersion) ||
      related.aggregateVersion < 1
    ) {
      throw new RangeError('Related domain event versions must be positive safe integers');
    }
    if (eventIds.has(related.eventId)) throw new TypeError('Domain event IDs must be unique');
    eventIds.add(related.eventId);
  }
  if (effect.audit.auditId.trim().length === 0 || effect.audit.action.trim().length === 0) {
    throw new TypeError('Audit identity and action are required');
  }
  if (effect.outbox.length === 0) {
    throw new TypeError('Critical command must produce at least one outbox message');
  }
  for (const message of effect.outbox) {
    if (message.messageId.trim().length === 0 || message.topic.trim().length === 0) {
      throw new TypeError('Outbox message identity and topic are required');
    }
    if (message.sourceEventId && !eventIds.has(message.sourceEventId)) {
      throw new TypeError('Outbox source event must belong to the command effect');
    }
  }

  canonicalize(effect.response);
  canonicalize(effect.event.payload);
  canonicalize(effect.event.metadata);
  for (const related of effect.relatedEvents ?? []) {
    canonicalize(related.payload);
    canonicalize(related.metadata);
  }
  canonicalize(effect.audit.metadata);
  for (const message of effect.outbox) canonicalize(message.payload);
}

export async function executeCriticalCommand<TPayload, TResponse>(
  database: Kysely<Database>,
  options: ExecuteCriticalCommandOptions<TPayload, TResponse>,
): Promise<ExecutedCommand<TResponse>> {
  const { command } = options;
  assertCommandEnvelope(command);

  const scope = commandIdempotencyScope(command);
  const idempotencyKeyHash = sha256(command.idempotencyKey);
  const requestHash = hashCommandRequest(command);
  const idempotencyLock = `${scope}:${idempotencyKeyHash}`;
  const aggregateLock = `${command.aggregateType}:${command.aggregateId}`;

  return database.transaction().execute(async (transaction) => {
    await sql`select pg_advisory_xact_lock(hashtextextended(${idempotencyLock}, 0))`.execute(
      transaction,
    );

    const existingResult = await sql<ExistingIdempotencyRecord>`
      select request_hash, response_status, response_body, event_id
      from platform.idempotency_records
      where scope = ${scope} and idempotency_key = ${idempotencyKeyHash}
    `.execute(transaction);
    const existing = existingResult.rows[0];

    if (existing) {
      if (existing.request_hash !== requestHash) {
        throw new IdempotencyKeyReusedError(scope);
      }
      return {
        responseStatus: existing.response_status,
        response: existing.response_body as TResponse,
        eventId: existing.event_id,
        aggregateVersion: command.expectedVersion + 1,
        replayed: true,
      };
    }

    await sql`select pg_advisory_xact_lock(hashtextextended(${aggregateLock}, 0))`.execute(
      transaction,
    );
    const versionResult = await sql<AggregateVersionRow>`
      select coalesce(max(aggregate_version), 0)::text as actual_version
      from platform.domain_events
      where aggregate_type = ${command.aggregateType}
        and aggregate_id = ${command.aggregateId}::uuid
    `.execute(transaction);
    const actualVersion = Number(versionResult.rows[0]?.actual_version ?? '0');
    assertExpectedVersion(actualVersion, command.expectedVersion);
    const nextVersion = nextAggregateVersion(actualVersion);
    const occurredAt = (options.now ?? (() => new Date()))();
    const effect = await options.mutate(transaction, { nextVersion, occurredAt });
    assertEffect(effect);

    const eventMetadata = {
      ...effect.event.metadata,
      commandId: command.commandId,
      payloadVersion: command.payloadVersion,
      requestId: command.requestId,
      source: command.source,
    };
    const auditMetadata = {
      ...effect.audit.metadata,
      commandId: command.commandId,
      commandType: command.commandType,
      idempotencyKeyHash,
      payloadVersion: command.payloadVersion,
      source: command.source,
    };

    await sql`
      insert into platform.domain_events (
        event_id, event_name, event_version, aggregate_type, aggregate_id,
        aggregate_version, transition_id, correlation_id, causation_id,
        actor_id, actor_type, actor_roles, actor_scope_ids, occurred_at,
        idempotency_key_hash, payload, metadata
      ) values (
        ${effect.event.eventId}::uuid, ${effect.event.eventName}, ${effect.event.schemaVersion},
        ${command.aggregateType}, ${command.aggregateId}::uuid, ${nextVersion},
        ${effect.event.transitionId}, ${command.correlationId}::uuid,
        ${command.causationId}::uuid, ${command.actor.id}::uuid,
        ${command.actor.type}, ${JSON.stringify(command.actor.roles)}::jsonb,
        ${[...command.actor.scopeIds]}::uuid[], ${occurredAt.toISOString()}::timestamptz,
        ${idempotencyKeyHash}, ${JSON.stringify(effect.event.payload)}::jsonb,
        ${JSON.stringify(eventMetadata)}::jsonb
      )
    `.execute(transaction);

    for (const related of effect.relatedEvents ?? []) {
      const relatedMetadata = {
        ...related.metadata,
        commandId: command.commandId,
        payloadVersion: command.payloadVersion,
        requestId: command.requestId,
        source: command.source,
      };
      await sql`
        insert into platform.domain_events (
          event_id, event_name, event_version, aggregate_type, aggregate_id,
          aggregate_version, transition_id, correlation_id, causation_id,
          actor_id, actor_type, actor_roles, actor_scope_ids, occurred_at,
          idempotency_key_hash, payload, metadata
        ) values (
          ${related.eventId}::uuid, ${related.eventName}, ${related.schemaVersion},
          ${related.aggregateType}, ${related.aggregateId}::uuid,
          ${related.aggregateVersion}, ${related.transitionId},
          ${command.correlationId}::uuid, ${effect.event.eventId}::uuid,
          ${command.actor.id}::uuid, ${command.actor.type},
          ${JSON.stringify(command.actor.roles)}::jsonb,
          ${[...command.actor.scopeIds]}::uuid[],
          ${occurredAt.toISOString()}::timestamptz, ${idempotencyKeyHash},
          ${JSON.stringify(related.payload)}::jsonb,
          ${JSON.stringify(relatedMetadata)}::jsonb
        )
      `.execute(transaction);
    }

    await sql`
      insert into platform.audit_events (
        audit_id, action, actor_id, actor_type, actor_roles, actor_scope_ids,
        aggregate_type, aggregate_id, transition_id, request_id,
        correlation_id, causation_id, reason_code, before_state, after_state,
        occurred_at, metadata
      ) values (
        ${effect.audit.auditId}::uuid, ${effect.audit.action}, ${command.actor.id}::uuid,
        ${command.actor.type},
        ${JSON.stringify(command.actor.roles)}::jsonb, ${[...command.actor.scopeIds]}::uuid[],
        ${command.aggregateType}, ${command.aggregateId}::uuid,
        ${effect.audit.transitionId}, ${command.requestId}::uuid,
        ${command.correlationId}::uuid, ${command.causationId}::uuid,
        ${effect.audit.reasonCode}, ${effect.audit.beforeState}, ${effect.audit.afterState},
        ${occurredAt.toISOString()}::timestamptz, ${JSON.stringify(auditMetadata)}::jsonb
      )
    `.execute(transaction);

    for (const message of effect.outbox) {
      const sourceEventId = message.sourceEventId ?? effect.event.eventId;
      await sql`
        insert into platform.outbox_messages (message_id, topic, event_id, payload)
        values (
          ${message.messageId}::uuid, ${message.topic}, ${sourceEventId}::uuid,
          ${JSON.stringify(message.payload)}::jsonb
        )
      `.execute(transaction);
    }

    await sql`
      insert into platform.idempotency_records (
        scope, idempotency_key, request_hash, command_id, event_id,
        response_status, response_body
      ) values (
        ${scope}, ${idempotencyKeyHash}, ${requestHash}, ${command.commandId}::uuid,
        ${effect.event.eventId}::uuid, ${effect.responseStatus},
        ${JSON.stringify(effect.response)}::jsonb
      )
    `.execute(transaction);

    return {
      responseStatus: effect.responseStatus,
      response: effect.response,
      eventId: effect.event.eventId,
      aggregateVersion: nextVersion,
      replayed: false,
    };
  });
}

export async function claimInboxEvent(
  database: Kysely<Database>,
  consumerName: string,
  eventId: string,
): Promise<boolean> {
  if (consumerName.trim().length === 0) throw new TypeError('Consumer name is required');

  const result = await sql<{ readonly event_id: string }>`
    insert into platform.inbox_receipts (consumer_name, event_id)
    values (${consumerName}, ${eventId}::uuid)
    on conflict do nothing
    returning event_id
  `.execute(database);
  return result.rows.length === 1;
}
