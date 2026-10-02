import {
  parseTimerCommandPayload,
  timerPolicyForCommand,
  type TimerCommandPayload,
} from '@molokh/core';

export function incidentTimerFromOutbox(
  topic: string,
  payload: unknown,
): TimerCommandPayload | null {
  if (topic !== 'platform.incident.deadline-extended.v1') return null;
  if (typeof payload !== 'object' || payload === null || !('timer' in payload)) {
    throw new TypeError('Platform incident deadline extension must contain a timer');
  }
  const timer = parseTimerCommandPayload((payload as { readonly timer: unknown }).timer);
  const policy = timerPolicyForCommand(timer.commandType);
  if (!policy || timer.aggregateType !== policy.aggregateType) {
    throw new TypeError('Platform incident timer is not registered as pausable');
  }
  return timer;
}
