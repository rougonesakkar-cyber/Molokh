import { parseTimerCommandPayload, type TimerCommandPayload } from '@molokh/core';

export function statusQueueTimerFromOutbox(
  topic: string,
  payload: unknown,
): TimerCommandPayload | null {
  const expectedCommand = topic === 'competition.status-queue.reconfirmation-requested.v1'
    ? 'EXPIRE_STATUS_QUEUE_RECONFIRMATION'
    : topic === 'competition.status-vacancy.single-candidate-window.v1'
      ? 'PROMOTE_SINGLE_GENESIS_CANDIDATE'
      : null;
  if (!expectedCommand) return null;
  if (typeof payload !== 'object' || payload === null || !('timer' in payload)) {
    throw new TypeError('Status queue outbox payload must contain a timer');
  }
  const timer = parseTimerCommandPayload((payload as { readonly timer: unknown }).timer);
  if (
    timer.commandType !== expectedCommand
    || timer.aggregateType !== 'ChallengeQueueEntry'
  ) {
    throw new TypeError('Status queue outbox timer does not match its topic');
  }
  return timer;
}
