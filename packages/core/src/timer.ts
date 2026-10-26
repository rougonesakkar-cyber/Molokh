export interface TimerCommandPayload {
  readonly commandType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly expectedState: string;
  readonly expectedVersion: number;
  readonly deadlineAt: string;
  readonly policyVersion: string;
  readonly idempotencyKey: string;
}

export interface TimerAggregateSnapshot {
  readonly state: string;
  readonly version: number;
  /**
   * Current projection deadline. A lifecycle hold may move a deadline after the
   * timer message was scheduled; the worker must trust this value when present.
   */
  readonly deadlineAt?: string;
}

export type TimerDecision =
  | { readonly kind: 'NOT_DUE'; readonly retryAt: string }
  | {
      readonly kind: 'STALE';
      readonly reason: 'STATE_CHANGED' | 'VERSION_CHANGED';
      readonly actualState: string;
      readonly actualVersion: number;
    }
  | { readonly kind: 'DUE' };

export class InvalidTimerPayloadError extends Error {
  readonly code = 'INVALID_TIMER_PAYLOAD';

  constructor(readonly field: string) {
    super(`Timer payload field ${field} is invalid`);
    this.name = 'InvalidTimerPayloadError';
  }
}

function requiredString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidTimerPayloadError(field);
  }
}

export function parseTimerCommandPayload(value: unknown): TimerCommandPayload {
  if (typeof value !== 'object' || value === null) {
    throw new InvalidTimerPayloadError('payload');
  }
  const payload = value as Record<string, unknown>;
  requiredString(payload.commandType, 'commandType');
  requiredString(payload.aggregateType, 'aggregateType');
  requiredString(payload.aggregateId, 'aggregateId');
  requiredString(payload.expectedState, 'expectedState');
  requiredString(payload.deadlineAt, 'deadlineAt');
  requiredString(payload.policyVersion, 'policyVersion');
  requiredString(payload.idempotencyKey, 'idempotencyKey');
  if (
    !Number.isSafeInteger(payload.expectedVersion) ||
    (payload.expectedVersion as number) < 0
  ) {
    throw new InvalidTimerPayloadError('expectedVersion');
  }
  if (!Number.isFinite(Date.parse(payload.deadlineAt))) {
    throw new InvalidTimerPayloadError('deadlineAt');
  }

  return {
    commandType: payload.commandType,
    aggregateType: payload.aggregateType,
    aggregateId: payload.aggregateId,
    expectedState: payload.expectedState,
    expectedVersion: payload.expectedVersion as number,
    deadlineAt: payload.deadlineAt,
    policyVersion: payload.policyVersion,
    idempotencyKey: payload.idempotencyKey,
  };
}

export function evaluateTimer(
  payload: TimerCommandPayload,
  snapshot: TimerAggregateSnapshot,
  now: Date,
): TimerDecision {
  if (!Number.isFinite(now.getTime())) throw new RangeError('Timer clock must be valid');
  if (snapshot.state !== payload.expectedState) {
    return {
      kind: 'STALE',
      reason: 'STATE_CHANGED',
      actualState: snapshot.state,
      actualVersion: snapshot.version,
    };
  }
  if (snapshot.version !== payload.expectedVersion) {
    return {
      kind: 'STALE',
      reason: 'VERSION_CHANGED',
      actualState: snapshot.state,
      actualVersion: snapshot.version,
    };
  }
  const effectiveDeadlineAt = snapshot.deadlineAt ?? payload.deadlineAt;
  const deadline = Date.parse(effectiveDeadlineAt);
  if (!Number.isFinite(deadline)) throw new RangeError('Timer snapshot deadline must be valid');
  if (now.getTime() < deadline) return { kind: 'NOT_DUE', retryAt: effectiveDeadlineAt };
  return { kind: 'DUE' };
}
