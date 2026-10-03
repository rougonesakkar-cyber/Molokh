import { parseTimerCommandPayload, type TimerCommandPayload } from '@molokh/core';

export function accountExportIdFromRequestedOutbox(topic: string, payload: unknown): string | null {
  if (topic !== 'identity.account-export.requested.v1') return null;
  if (typeof payload !== 'object' || payload === null
    || typeof (payload as Record<string, unknown>).exportId !== 'string') {
    throw new TypeError('Account export request payload must contain exportId');
  }
  return (payload as { readonly exportId: string }).exportId;
}

export function accountLifecycleTimerFromOutbox(
  topic: string, payload: unknown,
): TimerCommandPayload | null {
  if (topic !== 'identity.account-export.prepared.v1') return null;
  if (typeof payload !== 'object' || payload === null || !('timer' in payload)) {
    throw new TypeError('Account export outbox payload must contain a timer');
  }
  const timer = parseTimerCommandPayload((payload as { readonly timer: unknown }).timer);
  if (timer.commandType !== 'EXPIRE_ACCOUNT_EXPORT'
    || timer.aggregateType !== 'AccountDataExport') {
    throw new TypeError('Account export timer does not match its topic');
  }
  return timer;
}
