import { StatusQueueConflictError, type CommandEnvelope } from '@molokh/core';
import { describe, expect, it } from 'vitest';

import {
  submitStatusQueueEntry,
  withdrawStatusQueueEntry,
  type StatusQueueEffectIds,
  type SubmitStatusQueueEntryPayload,
  type WithdrawStatusQueueEntryPayload,
} from '../src/index.js';

const actorId = '0199a1b2-1234-7000-8000-000000000001';
const entryA = '0199a1b2-1234-7000-8000-000000000002';
const entryB = '0199a1b2-1234-7000-8000-000000000003';
const competitionId = '0199a1b2-1234-7000-8000-000000000004';

const ids: StatusQueueEffectIds = {
  eventId: entryA,
  auditId: entryA,
  outboxMessageId: entryA,
  challengeId: entryA,
  challengeEventId: entryA,
  serviceChatId: entryA,
  serviceChatEventId: entryA,
  rulesetSnapshotId: entryA,
  acknowledgmentId: entryA,
  pairedQueueEventId: entryA,
  timerOutboxMessageId: entryA,
  staleQueueEventId: entryA,
  staleQueueOutboxMessageId: entryA,
  notificationOutboxMessageId: entryA,
  notificationIds: [entryA, entryA],
};

const unavailableDatabase = undefined as unknown as Parameters<typeof submitStatusQueueEntry>[0];

function envelope<TPayload>(input: {
  readonly commandType: string;
  readonly aggregateId: string;
  readonly payload: TPayload;
}): CommandEnvelope<TPayload> {
  return {
    commandId: entryA,
    commandType: input.commandType,
    idempotencyKey: `boundary-${input.commandType}`,
    actor: { type: 'USER', id: actorId, roles: ['ATHLETE'], scopeIds: [] },
    aggregateType: 'ChallengeQueueEntry',
    aggregateId: input.aggregateId,
    expectedVersion: 0,
    correlationId: entryA,
    causationId: null,
    requestId: entryA,
    source: 'api',
    payloadVersion: 1,
    payload: input.payload,
  };
}

describe('status queue command boundary', () => {
  it('rejects a mismatched submit command before database access', async () => {
    await expect(submitStatusQueueEntry(
      unavailableDatabase,
      envelope<SubmitStatusQueueEntryPayload>({
        commandType: 'NOT_SUBMIT_STATUS_QUEUE_ENTRY',
        aggregateId: entryA,
        payload: { competitionId },
      }),
      ids,
    )).rejects.toMatchObject<Partial<StatusQueueConflictError>>({
      code: 'MEMBERSHIP_NOT_ACTIVE',
    });
  });

  it('cannot authorize one queue entry and mutate another aggregate', async () => {
    await expect(withdrawStatusQueueEntry(
      unavailableDatabase,
      envelope<WithdrawStatusQueueEntryPayload>({
        commandType: 'WITHDRAW_STATUS_QUEUE_ENTRY',
        aggregateId: entryA,
        payload: { queueEntryId: entryB },
      }),
      ids,
    )).rejects.toMatchObject<Partial<StatusQueueConflictError>>({
      code: 'QUEUE_ENTRY_INITIATOR_REQUIRED',
    });
  });
});
