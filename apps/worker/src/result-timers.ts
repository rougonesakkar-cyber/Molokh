import { parseTimerCommandPayload, type TimerCommandPayload } from '@molokh/core';

const resultTimerTopics = new Set([
  'competition.result.recorded.v1',
  'competition.result.appeal-waived.v1',
]);

export function resultTimerFromOutbox(
  topic: string,
  payload: unknown,
): TimerCommandPayload | null {
  if (!resultTimerTopics.has(topic)) return null;
  if (typeof payload !== 'object' || payload === null || !('timer' in payload)) {
    throw new TypeError('Result outbox payload must contain a timer');
  }
  const timer = parseTimerCommandPayload((payload as { readonly timer: unknown }).timer);
  if (timer.commandType !== 'FINALIZE_RESULT' || timer.aggregateType !== 'Result') {
    throw new TypeError('Result outbox timer does not match its topic');
  }
  return timer;
}
