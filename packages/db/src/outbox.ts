import { type Kysely, sql } from 'kysely';

import type { Database } from './index.js';

export interface ClaimedOutboxMessage {
  readonly messageId: string;
  readonly eventId: string;
  readonly topic: string;
  readonly payload: unknown;
  readonly attemptCount: number;
}

export interface ClaimOutboxOptions {
  readonly workerId: string;
  readonly batchSize?: number;
  readonly leaseMilliseconds?: number;
}

interface ClaimedOutboxRow {
  readonly message_id: string;
  readonly event_id: string;
  readonly topic: string;
  readonly payload: unknown;
  readonly attempt_count: number;
}

function assertWorkerId(workerId: string): void {
  if (workerId.trim().length === 0) throw new TypeError('Outbox worker ID is required');
}

export async function claimOutboxBatch(
  database: Kysely<Database>,
  options: ClaimOutboxOptions,
): Promise<readonly ClaimedOutboxMessage[]> {
  assertWorkerId(options.workerId);
  const batchSize = options.batchSize ?? 20;
  const leaseMilliseconds = options.leaseMilliseconds ?? 60_000;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new RangeError('Outbox batch size must be between 1 and 100');
  }
  if (!Number.isSafeInteger(leaseMilliseconds) || leaseMilliseconds < 1_000) {
    throw new RangeError('Outbox lease must be at least 1000 milliseconds');
  }

  const result = await sql<ClaimedOutboxRow>`
    with candidates as (
      select message_id
      from platform.outbox_messages
      where published_at is null
        and available_at <= clock_timestamp()
        and (
          locked_at is null
          or locked_at < clock_timestamp() - (
            ${leaseMilliseconds}::double precision * interval '1 millisecond'
          )
        )
      order by available_at, created_at, message_id
      for update skip locked
      limit ${batchSize}
    )
    update platform.outbox_messages as message
    set locked_at = clock_timestamp(),
        locked_by = ${options.workerId},
        attempt_count = message.attempt_count + 1
    from candidates
    where message.message_id = candidates.message_id
    returning
      message.message_id,
      message.event_id,
      message.topic,
      message.payload,
      message.attempt_count
  `.execute(database);

  return result.rows.map((row) => ({
    messageId: row.message_id,
    eventId: row.event_id,
    topic: row.topic,
    payload: row.payload,
    attemptCount: row.attempt_count,
  }));
}

export async function markOutboxPublished(
  database: Kysely<Database>,
  messageId: string,
  workerId: string,
): Promise<boolean> {
  assertWorkerId(workerId);
  const result = await sql<{ readonly message_id: string }>`
    update platform.outbox_messages
    set published_at = clock_timestamp(),
        locked_at = null,
        locked_by = null,
        last_error = null
    where message_id = ${messageId}::uuid
      and locked_by = ${workerId}
      and published_at is null
    returning message_id
  `.execute(database);
  return result.rows.length === 1;
}

export async function releaseOutboxFailure(
  database: Kysely<Database>,
  messageId: string,
  workerId: string,
  errorMessage: string,
  retryDelayMilliseconds: number,
): Promise<boolean> {
  assertWorkerId(workerId);
  if (!Number.isSafeInteger(retryDelayMilliseconds) || retryDelayMilliseconds < 0) {
    throw new RangeError('Outbox retry delay must be a non-negative safe integer');
  }
  const safeError = errorMessage.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 1_000);
  const result = await sql<{ readonly message_id: string }>`
    update platform.outbox_messages
    set available_at = clock_timestamp() + (
          ${retryDelayMilliseconds}::double precision * interval '1 millisecond'
        ),
        locked_at = null,
        locked_by = null,
        last_error = ${safeError}
    where message_id = ${messageId}::uuid
      and locked_by = ${workerId}
      and published_at is null
    returning message_id
  `.execute(database);
  return result.rows.length === 1;
}

export function outboxRetryDelayMilliseconds(attemptCount: number): number {
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 1) {
    throw new RangeError('Outbox attempt count must be a positive safe integer');
  }
  return Math.min(60_000, 1_000 * 2 ** Math.min(attemptCount - 1, 6));
}
