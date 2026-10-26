import { describe, expect, it } from 'vitest';

import {
  PlatformIncidentConflictError,
  assertIncidentImpactIsUnique,
  assertPlatformIncidentCanBeCompensated,
  assertPlatformIncidentCanBeConfirmed,
  calculateExactIncidentOverlap,
  incidentAffectsTimer,
  normalizePlatformIncidentDetection,
  normalizePlatformIncidentResolution,
  pausableTimerRegistry,
  timerPolicyForCommand,
  type ActorSnapshot,
} from '../src/index.js';

const system: ActorSnapshot = { type: 'SYSTEM', id: null, roles: [], scopeIds: [] };
const central: ActorSnapshot = {
  type: 'USER', id: 'central-1', roles: ['CENTRAL_ADMIN'], scopeIds: [],
};
const athlete: ActorSnapshot = { type: 'USER', id: 'athlete-1', roles: [], scopeIds: [] };

describe('PlatformIncident policy', () => {
  it('calculates full and partial exact overlap over half-open intervals', () => {
    const full = calculateExactIncidentOverlap({
      clockStartedAt: new Date('2026-10-02T10:00:00.000Z'),
      deadlineAt: new Date('2026-10-02T11:00:00.000Z'),
      incidentStartedAt: new Date('2026-10-02T10:10:00.000Z'),
      incidentEndedAt: new Date('2026-10-02T10:47:00.000Z'),
    });
    expect(full.overlapMilliseconds).toBe(37 * 60 * 1_000);
    expect(full.newDeadlineAt.toISOString()).toBe('2026-10-02T11:37:00.000Z');

    const partial = calculateExactIncidentOverlap({
      clockStartedAt: new Date('2026-10-02T10:00:00.000Z'),
      deadlineAt: new Date('2026-10-02T10:30:00.000Z'),
      incidentStartedAt: new Date('2026-10-02T10:10:00.000Z'),
      incidentEndedAt: new Date('2026-10-02T10:47:00.000Z'),
    });
    expect(partial.overlapMilliseconds).toBe(20 * 60 * 1_000);
    expect(partial.newDeadlineAt.toISOString()).toBe('2026-10-02T10:50:00.000Z');
  });

  it('returns zero at touching boundaries and observes t-1ms/t/t+1ms', () => {
    const base = {
      clockStartedAt: new Date('2026-10-02T10:00:00.000Z'),
      deadlineAt: new Date('2026-10-02T11:00:00.000Z'),
    };
    expect(calculateExactIncidentOverlap({
      ...base,
      incidentStartedAt: new Date('2026-10-02T09:59:59.999Z'),
      incidentEndedAt: new Date('2026-10-02T10:00:00.000Z'),
    }).overlapMilliseconds).toBe(0);
    expect(calculateExactIncidentOverlap({
      ...base,
      incidentStartedAt: new Date('2026-10-02T10:59:59.999Z'),
      incidentEndedAt: new Date('2026-10-02T11:00:00.001Z'),
    }).overlapMilliseconds).toBe(1);
    expect(calculateExactIncidentOverlap({
      ...base,
      incidentStartedAt: new Date('2026-10-02T11:00:00.000Z'),
      incidentEndedAt: new Date('2026-10-02T11:00:00.001Z'),
    }).overlapMilliseconds).toBe(0);
  });

  it('guards PI actors, states, evidence, objective windows and duplicate windows', () => {
    expect(normalizePlatformIncidentDetection({
      actor: system,
      startedAt: new Date('2026-10-02T10:00:00.000Z'),
      affectedServices: ['CHALLENGE', 'CHALLENGE'],
      affectedSurfaces: ['api', 'api'],
      severity: 'MAJOR',
      monitoringEvidenceReference: 'monitor:latency:17',
    })).toMatchObject({ affectedServices: ['CHALLENGE'], affectedSurfaces: ['api'] });
    expect(() => normalizePlatformIncidentDetection({
      actor: athlete, startedAt: new Date(), affectedServices: ['CHALLENGE'],
      affectedSurfaces: ['api'], severity: 'INFO', monitoringEvidenceReference: 'complaint',
    })).toThrowError(expect.objectContaining<Partial<PlatformIncidentConflictError>>({
      code: 'PLATFORM_INCIDENT_SYSTEM_REQUIRED',
    }));
    expect(() => assertPlatformIncidentCanBeConfirmed({
      state: 'DETECTED', actor: central, reason: 'Confirmed by metrics.',
      hasOverlappingConfirmedWindow: true,
    })).toThrowError(expect.objectContaining<Partial<PlatformIncidentConflictError>>({
      code: 'PLATFORM_INCIDENT_DUPLICATE_ACTIVE_WINDOW',
    }));
    expect(() => normalizePlatformIncidentResolution({
      state: 'CONFIRMED_ACTIVE', actor: central,
      startedAt: new Date('2026-10-02T10:00:00.000Z'),
      endedAt: new Date('2026-10-02T10:00:00.000Z'), reason: 'Recovered.',
    })).toThrowError(expect.objectContaining<Partial<PlatformIncidentConflictError>>({
      code: 'PLATFORM_INCIDENT_INVALID_WINDOW',
    }));
    expect(() => assertPlatformIncidentCanBeCompensated({
      state: 'RESOLVED', actor: central,
    })).toThrowError(expect.objectContaining<Partial<PlatformIncidentConflictError>>({
      code: 'PLATFORM_INCIDENT_SYSTEM_REQUIRED',
    }));
  });

  it('registers only canonical pausable timers and requires matching service and surface', () => {
    expect(pausableTimerRegistry()).toHaveLength(8);
    expect(timerPolicyForCommand('EXPIRE_MANDATORY_CHALLENGE')).toMatchObject({
      aggregateType: 'Challenge', service: 'CHALLENGE',
      deadlineKind: 'CHALLENGE_RESPONSE', clockPolicy: 'PAUSABLE',
    });
    expect(pausableTimerRegistry().map((entry) => [entry.commandType, entry.aggregateType]))
      .toEqual([
        ['EXPIRE_OPTIONAL_CHALLENGE', 'Challenge'],
        ['EXPIRE_MANDATORY_CHALLENGE', 'Challenge'],
        ['EXPIRE_GENESIS_CHALLENGE', 'Challenge'],
        ['EXPIRE_CHALLENGE_SCHEDULING', 'Challenge'],
        ['EXPIRE_BOOKING_SELECTION', 'Booking'],
        ['EXPIRE_STATUS_QUEUE_RECONFIRMATION', 'ChallengeQueueEntry'],
        ['EXPIRE_BOOKING_OFFICIAL_CONVERSION', 'BookingOfficialConversion'],
        ['PROMOTE_SINGLE_GENESIS_CANDIDATE', 'ChallengeQueueEntry'],
      ]);
    expect(timerPolicyForCommand('EXPIRE_HOST_CONFIRMATION')).toBeNull();
    expect(timerPolicyForCommand('EXPIRE_BOOKING_TRAINING_RETENTION')).toBeNull();
    expect(incidentAffectsTimer({
      commandType: 'EXPIRE_MANDATORY_CHALLENGE', affectedServices: ['CHALLENGE'],
      affectedSurfaces: ['api'], surface: 'api',
    })).toBe(true);
    expect(incidentAffectsTimer({
      commandType: 'EXPIRE_MANDATORY_CHALLENGE', affectedServices: ['CHALLENGE'],
      affectedSurfaces: ['worker'], surface: 'api',
    })).toBe(false);
  });

  it('rejects duplicate impact application', () => {
    expect(() => assertIncidentImpactIsUnique(true)).toThrowError(
      expect.objectContaining<Partial<PlatformIncidentConflictError>>({
        code: 'PLATFORM_INCIDENT_DUPLICATE_IMPACT',
      }),
    );
    expect(assertIncidentImpactIsUnique(false)).toBeUndefined();
  });
});
