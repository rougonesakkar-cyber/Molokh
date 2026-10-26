import { describe, expect, it, vi } from 'vitest';

import {
  platformIncidentIdFromResolvedOutbox,
  reconcilePlatformIncidentEffects,
} from '../src/platform-incident-reconciliation.js';

describe('platform incident reconciliation', () => {
  it('recognizes only a resolved incident event with an incident ID', () => {
    expect(platformIncidentIdFromResolvedOutbox(
      'platform.incident.resolved.v1',
      { incidentId: 'incident-1' },
    )).toBe('incident-1');
    expect(platformIncidentIdFromResolvedOutbox('platform.incident.detected.v1', {})).toBeNull();
    expect(() => platformIncidentIdFromResolvedOutbox(
      'platform.incident.resolved.v1',
      {},
    )).toThrow('incidentId');
  });

  it('applies all candidate classes, verifies exhaustion, then completes PI-05', async () => {
    const response = [{ challengeId: 'challenge-1', version: 1, surface: 'CHALLENGE_RESPONSE' }];
    const pausable = [{ aggregateType: 'Booking' as const, aggregateId: 'booking-1',
      commandType: 'EXPIRE_BOOKING_SELECTION', deadlineKind: 'BOOKING_SELECTION',
      surface: 'BOOKING_SELECTION', version: 1 }];
    const timeout = [{ challengeId: 'challenge-2', resultId: 'result-1', version: 4 }];
    const completeIncident = vi.fn().mockResolvedValue(undefined);
    const result = await reconcilePlatformIncidentEffects({
      listChallengeResponseCandidates: vi.fn()
        .mockResolvedValueOnce(response).mockResolvedValueOnce([]),
      applyChallengeResponseImpact: vi.fn().mockResolvedValue(undefined),
      listPausableCandidates: vi.fn()
        .mockResolvedValueOnce(pausable).mockResolvedValueOnce([]),
      applyPausableImpact: vi.fn().mockResolvedValue(undefined),
      listMandatoryTimeoutCandidates: vi.fn()
        .mockResolvedValueOnce(timeout).mockResolvedValueOnce([]),
      applyMandatoryTimeoutCompensation: vi.fn().mockResolvedValue(undefined),
      completeIncident,
    });
    expect(result).toEqual({ challengeResponseImpactCount: 1, pausableImpactCount: 1,
      mandatoryTimeoutCompensationCount: 1 });
    expect(completeIncident).toHaveBeenCalledOnce();
  });

  it('does not mark PI-05 complete while a candidate remains', async () => {
    const completeIncident = vi.fn();
    await expect(reconcilePlatformIncidentEffects({
      listChallengeResponseCandidates: vi.fn()
        .mockResolvedValueOnce([]).mockResolvedValueOnce([
          { challengeId: 'challenge-race', version: 2, surface: 'CHALLENGE_RESPONSE' },
        ]),
      applyChallengeResponseImpact: vi.fn(),
      listPausableCandidates: vi.fn().mockResolvedValue([]),
      applyPausableImpact: vi.fn(),
      listMandatoryTimeoutCandidates: vi.fn().mockResolvedValue([]),
      applyMandatoryTimeoutCompensation: vi.fn(),
      completeIncident,
    })).rejects.toThrow('remaining candidates');
    expect(completeIncident).not.toHaveBeenCalled();
  });
});
