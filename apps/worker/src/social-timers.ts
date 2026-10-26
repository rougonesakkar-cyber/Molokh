import { parseTimerCommandPayload, type TimerCommandPayload } from '@molokh/core';

export function socialTimerFromOutbox(
  topic: string,
  payload: unknown,
): TimerCommandPayload | null {
  const expected =
    topic === 'social.like.created.v1'
      ? { aggregateType: 'Like', commandType: 'EXPIRE_LIKE' }
      : topic === 'social.match.created.v1' || topic === 'chat.message.sent.v1'
        ? { aggregateType: 'Match', commandType: 'EXPIRE_INACTIVE_MATCH' }
      : topic === 'social.pair.suppressed.v1'
        ? {
            aggregateType: 'DiscoveryPairSuppression',
            commandType: 'EXPIRE_DISCOVERY_SUPPRESSION',
          }
        : null;
  if (!expected) return null;
  if (
    topic === 'chat.message.sent.v1'
    && (typeof payload !== 'object' || payload === null || !('timer' in payload))
  ) {
    return null;
  }
  if (typeof payload !== 'object' || payload === null || !('timer' in payload)) {
    throw new TypeError('Social outbox payload must contain a timer');
  }
  const timer = parseTimerCommandPayload((payload as { readonly timer: unknown }).timer);
  if (
    timer.commandType !== expected.commandType ||
    timer.aggregateType !== expected.aggregateType
  ) {
    throw new TypeError('Social outbox timer does not match its topic');
  }
  return timer;
}
