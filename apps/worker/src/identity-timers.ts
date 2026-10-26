import { parseTimerCommandPayload, type TimerCommandPayload } from '@molokh/core';

export function identityTimerFromOutbox(
  topic: string,
  payload: unknown,
): TimerCommandPayload | null {
  if (topic !== 'identity.age-division-timer.v1') return null;
  if (typeof payload !== 'object' || payload === null || !('timer' in payload)) {
    throw new TypeError('Identity outbox payload must contain a timer');
  }
  const timer = parseTimerCommandPayload((payload as { readonly timer: unknown }).timer);
  if (
    timer.commandType !== 'TRANSITION_TO_ADULT'
    || timer.aggregateType !== 'AgeDivisionTransition'
  ) {
    throw new TypeError('Identity outbox timer does not match its topic');
  }
  return timer;
}
