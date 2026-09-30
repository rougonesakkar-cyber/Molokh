import { parseTimerCommandPayload, type TimerCommandPayload } from '@molokh/core';

const topics = new Set([
  'competition.challenge.result-required.v1',
  'competition.challenge.missing-result-escalated.v1',
]);

const commands = new Set([
  'REMIND_MISSING_RESULT_COACH',
  'ESCALATE_MISSING_RESULT_ADMIN',
  'OPEN_MISSING_RESULT_REVIEW',
]);

export function missingResultTimerFromOutbox(
  topic: string,
  payload: unknown,
): TimerCommandPayload | null {
  if (!topics.has(topic)) return null;
  if (typeof payload !== 'object' || payload === null || !('timer' in payload)) {
    throw new TypeError('Missing Result outbox payload must contain a timer');
  }
  const timer = parseTimerCommandPayload((payload as { readonly timer: unknown }).timer);
  if (!commands.has(timer.commandType) || timer.aggregateType !== 'Challenge') {
    throw new TypeError('Missing Result timer does not match its topic');
  }
  return timer;
}
