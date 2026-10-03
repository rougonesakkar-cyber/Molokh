import { parseTimerCommandPayload, type TimerCommandPayload } from '@molokh/core';

export function accountAccessTimerFromOutbox(
  topic: string, payload: unknown,
): TimerCommandPayload | null {
  if (topic !== 'identity.account-recovery.phone-changed.v1') return null;
  if (typeof payload !== 'object' || payload === null || !('timer' in payload)) {
    throw new TypeError('Account recovery outbox payload must contain a timer');
  }
  const timer = parseTimerCommandPayload((payload as { readonly timer: unknown }).timer);
  if (timer.commandType !== 'EXPIRE_SECURITY_HOLD'
    || timer.aggregateType !== 'AccountAccessCase') {
    throw new TypeError('Account recovery timer does not match its topic');
  }
  return timer;
}
