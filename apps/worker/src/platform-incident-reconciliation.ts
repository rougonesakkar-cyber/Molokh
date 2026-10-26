export interface ChallengeResponseImpactCandidate {
  readonly challengeId: string;
  readonly version: number;
  readonly surface: string;
}

export interface PausableImpactCandidate {
  readonly aggregateType: 'Challenge' | 'Booking' | 'ChallengeQueueEntry' | 'BookingOfficialConversion';
  readonly aggregateId: string;
  readonly commandType: string;
  readonly deadlineKind: 'CHALLENGE_SCHEDULING' | 'BOOKING_SELECTION'
    | 'STATUS_QUEUE_RECONFIRMATION' | 'BOOKING_CONVERSION_CONFIRMATION'
    | 'GENESIS_PUBLIC_WINDOW';
  readonly surface: string;
  readonly version: number;
}

export interface MandatoryTimeoutImpactCandidate {
  readonly challengeId: string;
  readonly resultId: string;
  readonly version: number;
}

export interface PlatformIncidentReconciliationDependencies {
  readonly listChallengeResponseCandidates: () => Promise<readonly ChallengeResponseImpactCandidate[]>;
  readonly applyChallengeResponseImpact: (candidate: ChallengeResponseImpactCandidate) => Promise<void>;
  readonly listPausableCandidates: () => Promise<readonly PausableImpactCandidate[]>;
  readonly applyPausableImpact: (candidate: PausableImpactCandidate) => Promise<void>;
  readonly listMandatoryTimeoutCandidates: () => Promise<readonly MandatoryTimeoutImpactCandidate[]>;
  readonly applyMandatoryTimeoutCompensation: (
    candidate: MandatoryTimeoutImpactCandidate,
  ) => Promise<void>;
  readonly completeIncident: () => Promise<void>;
}

export interface PlatformIncidentReconciliationResult {
  readonly challengeResponseImpactCount: number;
  readonly pausableImpactCount: number;
  readonly mandatoryTimeoutCompensationCount: number;
}

export function platformIncidentIdFromResolvedOutbox(
  topic: string,
  payload: unknown,
): string | null {
  if (topic !== 'platform.incident.resolved.v1') return null;
  if (typeof payload !== 'object' || payload === null) {
    throw new TypeError('Resolved platform incident payload must be an object');
  }
  const incidentId = (payload as Record<string, unknown>).incidentId;
  if (typeof incidentId !== 'string' || incidentId.trim().length === 0) {
    throw new TypeError('Resolved platform incident payload must contain incidentId');
  }
  return incidentId;
}

export async function reconcilePlatformIncidentEffects(
  dependencies: PlatformIncidentReconciliationDependencies,
): Promise<PlatformIncidentReconciliationResult> {
  const challengeResponseCandidates = await dependencies.listChallengeResponseCandidates();
  for (const candidate of challengeResponseCandidates) {
    await dependencies.applyChallengeResponseImpact(candidate);
  }
  const pausableCandidates = await dependencies.listPausableCandidates();
  for (const candidate of pausableCandidates) {
    await dependencies.applyPausableImpact(candidate);
  }
  const mandatoryTimeoutCandidates = await dependencies.listMandatoryTimeoutCandidates();
  for (const candidate of mandatoryTimeoutCandidates) {
    await dependencies.applyMandatoryTimeoutCompensation(candidate);
  }

  const remaining = await Promise.all([
    dependencies.listChallengeResponseCandidates(),
    dependencies.listPausableCandidates(),
    dependencies.listMandatoryTimeoutCandidates(),
  ]);
  if (remaining.some((candidates) => candidates.length > 0)) {
    throw new Error('Platform incident reconciliation has remaining candidates');
  }
  await dependencies.completeIncident();
  return {
    challengeResponseImpactCount: challengeResponseCandidates.length,
    pausableImpactCount: pausableCandidates.length,
    mandatoryTimeoutCompensationCount: mandatoryTimeoutCandidates.length,
  };
}
