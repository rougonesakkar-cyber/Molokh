import {
  PlatformIncidentConflictError,
  evaluateTimer,
  type TimerAggregateSnapshot,
  type TimerCommandPayload,
  type TimerDecision,
} from '@molokh/core';

export interface TimerCommandHandler {
  loadSnapshot(payload: TimerCommandPayload): Promise<TimerAggregateSnapshot>;
  execute(payload: TimerCommandPayload): Promise<void>;
}

export interface ProcessTimerOptions {
  readonly handlers: Readonly<Record<string, TimerCommandHandler>>;
  readonly now: () => Date;
  readonly reschedule: (payload: TimerCommandPayload, runAt: Date) => Promise<void>;
  readonly recordStaleDiagnostic: (
    payload: TimerCommandPayload,
    decision: Extract<TimerDecision, { readonly kind: 'STALE' }>,
  ) => Promise<void> | void;
  readonly readIncidentSuppression?: (
    payload: TimerCommandPayload,
  ) => Promise<{ readonly retryAt: string } | null>;
}

export async function processTimer(
  payload: TimerCommandPayload,
  options: ProcessTimerOptions,
): Promise<TimerDecision> {
  const handler = options.handlers[payload.commandType];
  if (!handler) throw new Error(`No timer handler registered for ${payload.commandType}`);

  const suppression = await options.readIncidentSuppression?.(payload);
  if (suppression) {
    await options.reschedule(payload, new Date(suppression.retryAt));
    return { kind: 'NOT_DUE', retryAt: suppression.retryAt };
  }

  const snapshot = await handler.loadSnapshot(payload);
  const decision = evaluateTimer(payload, snapshot, options.now());

  if (decision.kind === 'NOT_DUE') {
    await options.reschedule(payload, new Date(decision.retryAt));
  } else if (decision.kind === 'STALE') {
    await options.recordStaleDiagnostic(payload, decision);
  } else {
    try {
      await handler.execute(payload);
    } catch (error) {
      if (error instanceof PlatformIncidentConflictError
        && error.code === 'PLATFORM_INCIDENT_TIMEOUT_SUPPRESSED') {
        const retryAt = new Date(options.now().getTime() + 5 * 60 * 1_000);
        await options.reschedule(payload, retryAt);
        return { kind: 'NOT_DUE', retryAt: retryAt.toISOString() };
      }
      throw error;
    }
  }

  return decision;
}
