import { describe, expect, it, vi } from 'vitest';

import { dispatchOutboxBatch, type OutboxDispatcherStore } from '../src/outbox-dispatcher.js';

const message = {
  messageId: 'message-1',
  eventId: 'event-1',
  topic: 'platform.probe.v1',
  payload: { value: 1 },
  attemptCount: 2,
};

describe('outbox dispatcher', () => {
  it('marks a delivered message as published', async () => {
    const store: OutboxDispatcherStore = {
      claim: vi.fn().mockResolvedValue([message]),
      markPublished: vi.fn().mockResolvedValue(true),
      releaseFailure: vi.fn(),
    };
    const deliver = vi.fn().mockResolvedValue(undefined);

    const result = await dispatchOutboxBatch({
      workerId: 'worker-1',
      batchSize: 10,
      store,
      deliver,
      retryDelay: () => 2_000,
    });

    expect(deliver).toHaveBeenCalledWith(message);
    expect(store.markPublished).toHaveBeenCalledWith('message-1', 'worker-1');
    expect(store.releaseFailure).not.toHaveBeenCalled();
    expect(result).toEqual({ claimed: 1, published: 1, failed: 0, leaseLost: 0 });
  });

  it('releases a failed delivery with its calculated retry delay', async () => {
    const store: OutboxDispatcherStore = {
      claim: vi.fn().mockResolvedValue([message]),
      markPublished: vi.fn(),
      releaseFailure: vi.fn().mockResolvedValue(true),
    };

    const result = await dispatchOutboxBatch({
      workerId: 'worker-1',
      batchSize: 10,
      store,
      deliver: vi.fn().mockRejectedValue(new Error('provider unavailable')),
      retryDelay: (attemptCount) => attemptCount * 1_000,
    });

    expect(store.releaseFailure).toHaveBeenCalledWith(
      'message-1',
      'worker-1',
      'provider unavailable',
      2_000,
    );
    expect(result).toEqual({ claimed: 1, published: 0, failed: 1, leaseLost: 0 });
  });
});
