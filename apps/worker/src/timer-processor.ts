import {
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
}

export async function processTimer(
  payload: TimerCommandPayload,
  options: ProcessTimerOptions,
): Promise<TimerDecision> {
  const handler = options.handlers[payload.commandType];
  if (!handler) throw new Error(`No timer handler registered for ${payload.commandType}`);

  const snapshot = await handler.loadSnapshot(payload);
  const decision = evaluateTimer(payload, snapshot, options.now());

  if (decision.kind === 'NOT_DUE') {
    await options.reschedule(payload, new Date(decision.retryAt));
  } else if (decision.kind === 'STALE') {
    await options.recordStaleDiagnostic(payload, decision);
  } else {
    await handler.execute(payload);
  }

  return decision;
}
