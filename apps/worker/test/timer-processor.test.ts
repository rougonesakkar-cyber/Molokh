import { describe, expect, it, vi } from 'vitest';
import { PlatformIncidentConflictError, VersionConflictError } from '@molokh/core';

import { processTimer } from '../src/timer-processor.js';

const payload = {
  commandType: 'EXPIRE_PROBE',
  aggregateType: 'PlatformProbe',
  aggregateId: 'aggregate-1',
  expectedState: 'PENDING',
  expectedVersion: 3,
  deadlineAt: '2026-09-05T12:00:00.000Z',
  policyVersion: 'policy-1',
  idempotencyKey: 'expire-probe-1',
} as const;

function options(state: string, version: number, now: string) {
  const execute = vi.fn().mockResolvedValue(undefined);
  const reschedule = vi.fn().mockResolvedValue(undefined);
  const recordStaleDiagnostic = vi.fn();
  return {
    execute,
    reschedule,
    recordStaleDiagnostic,
    value: {
      handlers: {
        EXPIRE_PROBE: {
          loadSnapshot: vi.fn().mockResolvedValue({ state, version }),
          execute,
        },
      },
      now: () => new Date(now),
      reschedule,
      recordStaleDiagnostic,
    },
  };
}

describe('timer processor', () => {
  it('executes only a due timer with the expected state and version', async () => {
    const test = options('PENDING', 3, payload.deadlineAt);
    await expect(processTimer(payload, test.value)).resolves.toEqual({ kind: 'DUE' });
    expect(test.execute).toHaveBeenCalledOnce();
    expect(test.reschedule).not.toHaveBeenCalled();
    expect(test.recordStaleDiagnostic).not.toHaveBeenCalled();
  });

  it('records stale diagnostics without executing a domain command', async () => {
    const test = options('ACCEPTED', 4, '2026-09-05T12:00:01.000Z');
    await expect(processTimer(payload, test.value)).resolves.toMatchObject({
      kind: 'STALE',
      reason: 'STATE_CHANGED',
    });
    expect(test.execute).not.toHaveBeenCalled();
    expect(test.recordStaleDiagnostic).toHaveBeenCalledOnce();
  });

  it('[AC-138] turns an accept-vs-expiry compare-and-set race into a stale no-op', async () => {
    const test = options('PENDING', 3, payload.deadlineAt);
    const loadSnapshot = test.value.handlers.EXPIRE_PROBE.loadSnapshot;
    loadSnapshot
      .mockResolvedValueOnce({ state: 'PENDING', version: 3 })
      .mockResolvedValueOnce({ state: 'ACCEPTED', version: 4 });
    test.execute.mockRejectedValueOnce(new VersionConflictError(3, 4));

    await expect(processTimer(payload, test.value)).resolves.toEqual({
      kind: 'STALE',
      reason: 'STATE_CHANGED',
      actualState: 'ACCEPTED',
      actualVersion: 4,
    });
    expect(test.execute).toHaveBeenCalledOnce();
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    expect(test.reschedule).not.toHaveBeenCalled();
    expect(test.recordStaleDiagnostic).toHaveBeenCalledOnce();
  });

  it('reschedules an early delivery at the canonical deadline', async () => {
    const test = options('PENDING', 3, '2026-09-05T11:59:59.999Z');
    await expect(processTimer(payload, test.value)).resolves.toMatchObject({ kind: 'NOT_DUE' });
    expect(test.reschedule).toHaveBeenCalledWith(payload, new Date(payload.deadlineAt));
    expect(test.execute).not.toHaveBeenCalled();
  });

  it('reschedules an incident-suppressed timer without loading or executing the aggregate', async () => {
    const test = options('PENDING', 3, payload.deadlineAt);
    const loadSnapshot = test.value.handlers.EXPIRE_PROBE.loadSnapshot;
    const value = {
      ...test.value,
      readIncidentSuppression: vi.fn().mockResolvedValue({
        retryAt: '2026-09-05T12:05:00.000Z',
      }),
    };
    await expect(processTimer(payload, value)).resolves.toEqual({
      kind: 'NOT_DUE', retryAt: '2026-09-05T12:05:00.000Z',
    });
    expect(test.reschedule).toHaveBeenCalledWith(
      payload, new Date('2026-09-05T12:05:00.000Z'),
    );
    expect(loadSnapshot).not.toHaveBeenCalled();
    expect(test.execute).not.toHaveBeenCalled();
  });

  it('reschedules when the transactional incident recheck wins the race', async () => {
    const test = options('PENDING', 3, payload.deadlineAt);
    test.execute.mockRejectedValueOnce(
      new PlatformIncidentConflictError('PLATFORM_INCIDENT_TIMEOUT_SUPPRESSED'),
    );
    await expect(processTimer(payload, test.value)).resolves.toEqual({
      kind: 'NOT_DUE', retryAt: '2026-09-05T12:05:00.000Z',
    });
    expect(test.reschedule).toHaveBeenCalledWith(
      payload, new Date('2026-09-05T12:05:00.000Z'),
    );
  });
});
