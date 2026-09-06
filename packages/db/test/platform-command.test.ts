import { IdempotencyKeyReusedError, VersionConflictError, type CommandEnvelope } from '@molokh/core';
import { sql, type Transaction } from 'kysely';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  claimOutboxBatch,
  claimInboxEvent,
  createDatabase,
  executeCriticalCommand,
  hashCommandRequest,
  markOutboxPublished,
  markNotificationRead,
  projectNotificationBatch,
  releaseOutboxFailure,
  runMigrations,
  type CriticalCommandEffect,
  type Database,
} from '../src/index.js';

const ids = {
  actor: '0199a1b2-1234-7000-8000-000000000001',
  aggregate: '0199a1b2-1234-7000-8000-000000000002',
  command: '0199a1b2-1234-7000-8000-000000000003',
  correlation: '0199a1b2-1234-7000-8000-000000000004',
  request: '0199a1b2-1234-7000-8000-000000000005',
  event: '0199a1b2-1234-7000-8000-000000000006',
  audit: '0199a1b2-1234-7000-8000-000000000007',
  outbox: '0199a1b2-1234-7000-8000-000000000008',
  notificationOne: '0199a1b2-1234-7000-8000-000000000010',
  notificationTwo: '0199a1b2-1234-7000-8000-000000000011',
  recipientOne: '0199a1b2-1234-7000-8000-000000000012',
  recipientTwo: '0199a1b2-1234-7000-8000-000000000013',
} as const;

function command(
  overrides: Partial<CommandEnvelope<{ readonly amount: number }>> = {},
): CommandEnvelope<{ readonly amount: number }> {
  return {
    commandId: ids.command,
    commandType: 'INCREMENT_PLATFORM_PROBE',
    idempotencyKey: 'platform-probe-1',
    actor: {
      type: 'USER',
      id: ids.actor,
      roles: ['ATHLETE'],
      scopeIds: [],
    },
    aggregateType: 'PlatformProbe',
    aggregateId: ids.aggregate,
    expectedVersion: 0,
    correlationId: ids.correlation,
    causationId: null,
    requestId: ids.request,
    source: 'api',
    payloadVersion: 1,
    payload: { amount: 1 },
    ...overrides,
  };
}

function effect(nextVersion: number): CriticalCommandEffect<{
  readonly value: number;
  readonly version: number;
}> {
  return {
    responseStatus: 200,
    response: { value: 1, version: nextVersion },
    event: {
      eventId: ids.event,
      eventName: 'PlatformProbeIncremented',
      schemaVersion: 1,
      transitionId: 'M1-PROBE-01',
      payload: { amount: 1 },
      metadata: { policyVersion: 'm1-test' },
    },
    audit: {
      auditId: ids.audit,
      action: 'INCREMENT_PLATFORM_PROBE',
      transitionId: 'M1-PROBE-01',
      reasonCode: null,
      beforeState: 'EMPTY',
      afterState: 'ACTIVE',
      metadata: {},
    },
    outbox: [
      {
        messageId: ids.outbox,
        topic: 'platform.probe.incremented.v1',
        payload: { aggregateId: ids.aggregate, version: nextVersion },
      },
    ],
  };
}

describe('command request hashing', () => {
  it('is independent of JSON object key order and changes with semantic input', () => {
    const first = command({ payload: { amount: 1 } });
    const equivalent = command({ payload: { amount: 1 } });
    const changed = command({ payload: { amount: 2 } });

    expect(hashCommandRequest(first)).toBe(hashCommandRequest(equivalent));
    expect(hashCommandRequest(first)).not.toBe(hashCommandRequest(changed));
  });
});

const testConnectionString = process.env.DATABASE_TEST_URL;
const describePostgres = testConnectionString ? describe : describe.skip;

describePostgres('PostgreSQL critical command transaction', () => {
  if (!testConnectionString) return;

  const databaseName = new URL(testConnectionString).pathname.slice(1);
  if (!databaseName.endsWith('_test')) {
    throw new Error('DATABASE_TEST_URL must target a database whose name ends with _test');
  }

  const database = createDatabase(testConnectionString);

  beforeAll(async () => {
    await runMigrations(testConnectionString);
    await sql`create schema if not exists test_support`.execute(database);
    await sql`
      create table if not exists test_support.probe_aggregates (
        aggregate_id uuid primary key,
        version bigint not null,
        value integer not null
      )
    `.execute(database);
  });

  beforeEach(async () => {
    await sql`
      truncate table
        test_support.probe_aggregates,
        platform.notifications,
        platform.notification_preferences,
        platform.outbox_messages,
        platform.idempotency_records,
        platform.inbox_receipts,
        platform.audit_events,
        platform.domain_events
    `.execute(database);
  });

  const mutate = async (
    transaction: Transaction<Database>,
    nextVersion: number,
  ) => {
    await sql`
      insert into test_support.probe_aggregates (aggregate_id, version, value)
      values (${ids.aggregate}::uuid, ${nextVersion}, 1)
    `.execute(transaction);
    return effect(nextVersion);
  };

  it('commits once, replays the response and rejects changed payload or stale version', async () => {
    let mutationCount = 0;
    const execute = (input: CommandEnvelope<{ readonly amount: number }>) =>
      executeCriticalCommand(database, {
        command: input,
        now: () => new Date('2026-09-04T18:00:00.000Z'),
        mutate: async (transaction, context) => {
          mutationCount += 1;
          return mutate(transaction, context.nextVersion);
        },
      });

    const [first, duplicate] = await Promise.all([execute(command()), execute(command())]);
    expect([first.replayed, duplicate.replayed].sort()).toEqual([false, true]);
    expect(first.response).toEqual(duplicate.response);
    expect(mutationCount).toBe(1);

    await expect(
      execute(command({ payload: { amount: 2 } })),
    ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
    await expect(
      execute(
        command({
          commandId: '0199a1b2-1234-7000-8000-000000000009',
          idempotencyKey: 'platform-probe-2',
        }),
      ),
    ).rejects.toBeInstanceOf(VersionConflictError);

    const counts = await sql<{
      readonly aggregates: string;
      readonly audits: string;
      readonly events: string;
      readonly idempotency: string;
      readonly outbox: string;
    }>`
      select
        (select count(*) from test_support.probe_aggregates)::text as aggregates,
        (select count(*) from platform.audit_events)::text as audits,
        (select count(*) from platform.domain_events)::text as events,
        (select count(*) from platform.idempotency_records)::text as idempotency,
        (select count(*) from platform.outbox_messages)::text as outbox
    `.execute(database);
    expect(counts.rows[0]).toEqual({
      aggregates: '1',
      audits: '1',
      events: '1',
      idempotency: '1',
      outbox: '1',
    });

    expect(await claimInboxEvent(database, 'projection-test', ids.event)).toBe(true);
    expect(await claimInboxEvent(database, 'projection-test', ids.event)).toBe(false);
  });

  it('rolls the aggregate mutation back when the command fails', async () => {
    await expect(
      executeCriticalCommand(database, {
        command: command(),
        mutate: async (transaction, context) => {
          await mutate(transaction, context.nextVersion);
          throw new Error('simulated command failure');
        },
      }),
    ).rejects.toThrow('simulated command failure');

    const counts = await sql<{ readonly aggregates: string; readonly events: string }>`
      select
        (select count(*) from test_support.probe_aggregates)::text as aggregates,
        (select count(*) from platform.domain_events)::text as events
    `.execute(database);
    expect(counts.rows[0]).toEqual({ aggregates: '0', events: '0' });
  });

  it('leases outbox work once and makes failed delivery retryable', async () => {
    await executeCriticalCommand(database, {
      command: command(),
      mutate: (transaction, context) => mutate(transaction, context.nextVersion),
    });

    const [firstWorker, secondWorker] = await Promise.all([
      claimOutboxBatch(database, { workerId: 'worker-1', batchSize: 10 }),
      claimOutboxBatch(database, { workerId: 'worker-2', batchSize: 10 }),
    ]);
    const claimed = [...firstWorker, ...secondWorker];
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      messageId: ids.outbox,
      eventId: ids.event,
      attemptCount: 1,
    });

    const leaseOwner = firstWorker.length === 1 ? 'worker-1' : 'worker-2';
    expect(
      await releaseOutboxFailure(
        database,
        ids.outbox,
        leaseOwner,
        'temporary provider failure',
        0,
      ),
    ).toBe(true);

    const retry = await claimOutboxBatch(database, {
      workerId: 'worker-3',
      batchSize: 10,
    });
    expect(retry).toHaveLength(1);
    expect(retry[0]?.attemptCount).toBe(2);
    expect(await markOutboxPublished(database, ids.outbox, 'worker-3')).toBe(true);
    expect(await markOutboxPublished(database, ids.outbox, 'worker-3')).toBe(false);
    expect(
      await claimOutboxBatch(database, { workerId: 'worker-4', batchSize: 10 }),
    ).toEqual([]);
  });

  it('projects an event into recipient notifications once and marks reads idempotently', async () => {
    await executeCriticalCommand(database, {
      command: command(),
      mutate: (transaction, context) => mutate(transaction, context.nextVersion),
    });

    const drafts = [
      {
        notificationId: ids.notificationOne,
        recipientUserId: ids.recipientOne,
        category: 'MANDATORY' as const,
        renderKey: 'challenge.response_required',
        actionTarget: { type: 'CHALLENGE', id: ids.aggregate },
        payload: { responseHours: 48 },
        deadlineAt: '2026-09-06T20:00:00.000Z',
      },
      {
        notificationId: ids.notificationTwo,
        recipientUserId: ids.recipientTwo,
        category: 'SERVICE' as const,
        renderKey: 'challenge.created',
        actionTarget: { type: 'CHALLENGE', id: ids.aggregate },
        payload: {},
        deadlineAt: null,
      },
    ];

    await expect(projectNotificationBatch(database, ids.event, drafts)).resolves.toEqual({
      replayed: false,
      createdCount: 2,
    });
    await expect(projectNotificationBatch(database, ids.event, drafts)).resolves.toEqual({
      replayed: true,
      createdCount: 0,
    });

    const count = await sql<{ readonly notifications: string }>`
      select count(*)::text as notifications from platform.notifications
    `.execute(database);
    expect(count.rows[0]?.notifications).toBe('2');
    await expect(
      markNotificationRead(database, ids.notificationOne, ids.recipientOne),
    ).resolves.toBe(true);
    await expect(
      markNotificationRead(database, ids.notificationOne, ids.recipientOne),
    ).resolves.toBe(true);
    await expect(
      markNotificationRead(database, ids.notificationOne, ids.recipientTwo),
    ).resolves.toBe(false);
  });
});
