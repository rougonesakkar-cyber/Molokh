import type { ClaimedOutboxMessage } from '@molokh/db';

export interface OutboxDispatcherStore {
  claim(workerId: string, batchSize: number): Promise<readonly ClaimedOutboxMessage[]>;
  markPublished(messageId: string, workerId: string): Promise<boolean>;
  releaseFailure(
    messageId: string,
    workerId: string,
    errorMessage: string,
    retryDelayMilliseconds: number,
  ): Promise<boolean>;
}

export interface DispatchOutboxOptions {
  readonly workerId: string;
  readonly batchSize: number;
  readonly store: OutboxDispatcherStore;
  readonly deliver: (message: ClaimedOutboxMessage) => Promise<void>;
  readonly retryDelay: (attemptCount: number) => number;
}

export interface DispatchOutboxResult {
  readonly claimed: number;
  readonly published: number;
  readonly failed: number;
  readonly leaseLost: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function dispatchOutboxBatch(
  options: DispatchOutboxOptions,
): Promise<DispatchOutboxResult> {
  const messages = await options.store.claim(options.workerId, options.batchSize);
  let published = 0;
  let failed = 0;
  let leaseLost = 0;

  for (const message of messages) {
    try {
      await options.deliver(message);
      if (await options.store.markPublished(message.messageId, options.workerId)) {
        published += 1;
      } else {
        leaseLost += 1;
      }
    } catch (error) {
      const released = await options.store.releaseFailure(
        message.messageId,
        options.workerId,
        errorMessage(error),
        options.retryDelay(message.attemptCount),
      );
      if (released) failed += 1;
      else leaseLost += 1;
    }
  }

  return { claimed: messages.length, published, failed, leaseLost };
}

export interface StartOutboxPollingOptions extends DispatchOutboxOptions {
  readonly pollIntervalMilliseconds: number;
  readonly onError: (error: unknown) => void;
}

export interface OutboxPollingHandle {
  stop(): Promise<void>;
}

export function startOutboxPolling(
  options: StartOutboxPollingOptions,
): OutboxPollingHandle {
  let stopped = false;
  let inFlight: Promise<void> | null = null;

  const tick = () => {
    if (stopped || inFlight) return;
    inFlight = dispatchOutboxBatch(options)
      .then(() => undefined)
      .catch(options.onError)
      .finally(() => {
        inFlight = null;
      });
  };

  const timer = setInterval(tick, options.pollIntervalMilliseconds);
  tick();

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}
