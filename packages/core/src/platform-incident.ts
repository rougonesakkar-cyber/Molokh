import type { ActorSnapshot } from './command.js';

export const PLATFORM_INCIDENT_POLICY_VERSION = 'platform-incident-mvp-v1' as const;

export type PlatformIncidentState =
  | 'DETECTED'
  | 'CONFIRMED_ACTIVE'
  | 'RESOLVED'
  | 'COMPENSATED'
  | 'REJECTED';

export type PlatformIncidentCommand =
  | 'DETECT_PLATFORM_INCIDENT'
  | 'CONFIRM_PLATFORM_INCIDENT'
  | 'REJECT_PLATFORM_INCIDENT'
  | 'RESOLVE_PLATFORM_INCIDENT'
  | 'COMPENSATE_INCIDENT_IMPACTS';

export type PlatformIncidentSeverity = 'INFO' | 'MINOR' | 'MAJOR' | 'CRITICAL';

export type PausableDeadlineKind =
  | 'CHALLENGE_RESPONSE'
  | 'CHALLENGE_SCHEDULING'
  | 'BOOKING_SELECTION'
  | 'STATUS_QUEUE_RECONFIRMATION'
  | 'BOOKING_CONVERSION_CONFIRMATION'
  | 'GENESIS_PUBLIC_WINDOW';

export type PlatformService = 'CHALLENGE' | 'BOOKING' | 'STATUS_QUEUE' | 'COMPETITION';

export type ClockPolicy = 'PAUSABLE' | 'CONTINUOUS';

export interface TimerPolicyRegistration {
  readonly commandType: string;
  readonly aggregateType: 'Challenge' | 'Booking' | 'ChallengeQueueEntry' | 'BookingOfficialConversion';
  readonly service: PlatformService;
  readonly deadlineKind: PausableDeadlineKind;
  readonly clockPolicy: 'PAUSABLE';
}

const PAUSABLE_TIMER_REGISTRY = {
  EXPIRE_OPTIONAL_CHALLENGE: {
    commandType: 'EXPIRE_OPTIONAL_CHALLENGE', aggregateType: 'Challenge', service: 'CHALLENGE',
    deadlineKind: 'CHALLENGE_RESPONSE', clockPolicy: 'PAUSABLE',
  },
  EXPIRE_MANDATORY_CHALLENGE: {
    commandType: 'EXPIRE_MANDATORY_CHALLENGE', aggregateType: 'Challenge', service: 'CHALLENGE',
    deadlineKind: 'CHALLENGE_RESPONSE', clockPolicy: 'PAUSABLE',
  },
  EXPIRE_GENESIS_CHALLENGE: {
    commandType: 'EXPIRE_GENESIS_CHALLENGE', aggregateType: 'Challenge', service: 'CHALLENGE',
    deadlineKind: 'CHALLENGE_RESPONSE', clockPolicy: 'PAUSABLE',
  },
  EXPIRE_CHALLENGE_SCHEDULING: {
    commandType: 'EXPIRE_CHALLENGE_SCHEDULING', aggregateType: 'Challenge', service: 'CHALLENGE',
    deadlineKind: 'CHALLENGE_SCHEDULING', clockPolicy: 'PAUSABLE',
  },
  EXPIRE_BOOKING_SELECTION: {
    commandType: 'EXPIRE_BOOKING_SELECTION', aggregateType: 'Booking', service: 'BOOKING',
    deadlineKind: 'BOOKING_SELECTION', clockPolicy: 'PAUSABLE',
  },
  EXPIRE_STATUS_QUEUE_RECONFIRMATION: {
    commandType: 'EXPIRE_STATUS_QUEUE_RECONFIRMATION', aggregateType: 'ChallengeQueueEntry', service: 'STATUS_QUEUE',
    deadlineKind: 'STATUS_QUEUE_RECONFIRMATION', clockPolicy: 'PAUSABLE',
  },
  EXPIRE_BOOKING_OFFICIAL_CONVERSION: {
    commandType: 'EXPIRE_BOOKING_OFFICIAL_CONVERSION', aggregateType: 'BookingOfficialConversion', service: 'BOOKING',
    deadlineKind: 'BOOKING_CONVERSION_CONFIRMATION', clockPolicy: 'PAUSABLE',
  },
  PROMOTE_SINGLE_GENESIS_CANDIDATE: {
    commandType: 'PROMOTE_SINGLE_GENESIS_CANDIDATE', aggregateType: 'ChallengeQueueEntry', service: 'COMPETITION',
    deadlineKind: 'GENESIS_PUBLIC_WINDOW', clockPolicy: 'PAUSABLE',
  },
} as const satisfies Record<string, TimerPolicyRegistration>;

export type PlatformIncidentErrorCode =
  | 'PLATFORM_INCIDENT_SYSTEM_REQUIRED'
  | 'PLATFORM_INCIDENT_CENTRAL_REQUIRED'
  | 'PLATFORM_INCIDENT_INVALID_STATE'
  | 'PLATFORM_INCIDENT_INVALID_WINDOW'
  | 'PLATFORM_INCIDENT_SERVICES_REQUIRED'
  | 'PLATFORM_INCIDENT_SURFACES_REQUIRED'
  | 'PLATFORM_INCIDENT_EVIDENCE_REQUIRED'
  | 'PLATFORM_INCIDENT_REASON_REQUIRED'
  | 'PLATFORM_INCIDENT_DUPLICATE_ACTIVE_WINDOW'
  | 'PLATFORM_INCIDENT_DUPLICATE_IMPACT'
  | 'PLATFORM_INCIDENT_TIMEOUT_SUPPRESSED';

export class PlatformIncidentConflictError extends Error {
  constructor(readonly code: PlatformIncidentErrorCode) {
    super(code);
    this.name = 'PlatformIncidentConflictError';
  }
}

function assertValidDate(value: Date): void {
  if (!Number.isFinite(value.getTime())) {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_WINDOW');
  }
}

function requiredText(value: string, code: PlatformIncidentErrorCode): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new PlatformIncidentConflictError(code);
  return normalized;
}

function uniqueTexts(values: readonly string[], code: PlatformIncidentErrorCode): readonly string[] {
  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (normalized.length === 0) throw new PlatformIncidentConflictError(code);
  return normalized;
}

function isCentral(actor: ActorSnapshot): boolean {
  return actor.type === 'USER' && actor.roles.includes('CENTRAL_ADMIN');
}

export function assertPlatformIncidentSystemActor(actor: ActorSnapshot): void {
  if (actor.type !== 'SYSTEM') {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_SYSTEM_REQUIRED');
  }
}

export function assertPlatformIncidentCentralActor(actor: ActorSnapshot): void {
  if (!isCentral(actor)) {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_CENTRAL_REQUIRED');
  }
}

export function normalizePlatformIncidentDetection(input: {
  readonly actor: ActorSnapshot;
  readonly startedAt: Date;
  readonly affectedServices: readonly PlatformService[];
  readonly affectedSurfaces: readonly string[];
  readonly severity: PlatformIncidentSeverity;
  readonly monitoringEvidenceReference: string;
}): {
  readonly startedAt: Date;
  readonly affectedServices: readonly PlatformService[];
  readonly affectedSurfaces: readonly string[];
  readonly severity: PlatformIncidentSeverity;
  readonly monitoringEvidenceReference: string;
} {
  assertPlatformIncidentSystemActor(input.actor);
  assertValidDate(input.startedAt);
  return {
    startedAt: new Date(input.startedAt),
    affectedServices: uniqueTexts(
      input.affectedServices,
      'PLATFORM_INCIDENT_SERVICES_REQUIRED',
    ) as readonly PlatformService[],
    affectedSurfaces: uniqueTexts(input.affectedSurfaces, 'PLATFORM_INCIDENT_SURFACES_REQUIRED'),
    severity: input.severity,
    monitoringEvidenceReference: requiredText(
      input.monitoringEvidenceReference,
      'PLATFORM_INCIDENT_EVIDENCE_REQUIRED',
    ),
  };
}

export function assertPlatformIncidentCanBeConfirmed(input: {
  readonly state: PlatformIncidentState;
  readonly actor: ActorSnapshot;
  readonly reason: string;
  readonly hasOverlappingConfirmedWindow: boolean;
}): string {
  assertPlatformIncidentCentralActor(input.actor);
  if (input.state !== 'DETECTED') {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_STATE');
  }
  if (input.hasOverlappingConfirmedWindow) {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_DUPLICATE_ACTIVE_WINDOW');
  }
  return requiredText(input.reason, 'PLATFORM_INCIDENT_REASON_REQUIRED');
}

export function assertPlatformIncidentCanBeRejected(input: {
  readonly state: PlatformIncidentState;
  readonly actor: ActorSnapshot;
  readonly reason: string;
}): string {
  assertPlatformIncidentCentralActor(input.actor);
  if (input.state !== 'DETECTED') {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_STATE');
  }
  return requiredText(input.reason, 'PLATFORM_INCIDENT_REASON_REQUIRED');
}

export function normalizePlatformIncidentResolution(input: {
  readonly state: PlatformIncidentState;
  readonly actor: ActorSnapshot;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly reason: string;
}): { readonly endedAt: Date; readonly reason: string } {
  if (input.actor.type !== 'SYSTEM' && !isCentral(input.actor)) {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_CENTRAL_REQUIRED');
  }
  if (input.state !== 'CONFIRMED_ACTIVE') {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_STATE');
  }
  assertValidDate(input.startedAt);
  assertValidDate(input.endedAt);
  if (input.endedAt <= input.startedAt) {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_WINDOW');
  }
  return {
    endedAt: new Date(input.endedAt),
    reason: requiredText(input.reason, 'PLATFORM_INCIDENT_REASON_REQUIRED'),
  };
}

export function assertPlatformIncidentCanBeCompensated(input: {
  readonly state: PlatformIncidentState;
  readonly actor: ActorSnapshot;
}): void {
  assertPlatformIncidentSystemActor(input.actor);
  if (input.state !== 'RESOLVED') {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_STATE');
  }
}

export interface ExactIncidentOverlap {
  readonly overlapMilliseconds: number;
  readonly overlapStartedAt: Date | null;
  readonly overlapEndedAt: Date | null;
  readonly newDeadlineAt: Date;
}

export function calculateExactIncidentOverlap(input: {
  readonly clockStartedAt: Date;
  readonly deadlineAt: Date;
  readonly incidentStartedAt: Date;
  readonly incidentEndedAt: Date;
}): ExactIncidentOverlap {
  assertValidDate(input.clockStartedAt);
  assertValidDate(input.deadlineAt);
  assertValidDate(input.incidentStartedAt);
  assertValidDate(input.incidentEndedAt);
  if (
    input.deadlineAt <= input.clockStartedAt
    || input.incidentEndedAt <= input.incidentStartedAt
  ) {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_INVALID_WINDOW');
  }
  const overlapStart = Math.max(input.clockStartedAt.getTime(), input.incidentStartedAt.getTime());
  const overlapEnd = Math.min(input.deadlineAt.getTime(), input.incidentEndedAt.getTime());
  const overlapMilliseconds = Math.max(0, overlapEnd - overlapStart);
  return {
    overlapMilliseconds,
    overlapStartedAt: overlapMilliseconds === 0 ? null : new Date(overlapStart),
    overlapEndedAt: overlapMilliseconds === 0 ? null : new Date(overlapEnd),
    newDeadlineAt: new Date(input.deadlineAt.getTime() + overlapMilliseconds),
  };
}

export function timerPolicyForCommand(commandType: string): TimerPolicyRegistration | null {
  return PAUSABLE_TIMER_REGISTRY[commandType as keyof typeof PAUSABLE_TIMER_REGISTRY] ?? null;
}

export function pausableTimerRegistry(): readonly TimerPolicyRegistration[] {
  return Object.values(PAUSABLE_TIMER_REGISTRY);
}

export function incidentAffectsTimer(input: {
  readonly commandType: string;
  readonly affectedServices: readonly string[];
  readonly affectedSurfaces: readonly string[];
  readonly surface: string;
}): boolean {
  const policy = timerPolicyForCommand(input.commandType);
  return policy !== null
    && input.affectedServices.includes(policy.service)
    && input.affectedSurfaces.includes(input.surface);
}

export function assertIncidentImpactIsUnique(alreadyExists: boolean): void {
  if (alreadyExists) {
    throw new PlatformIncidentConflictError('PLATFORM_INCIDENT_DUPLICATE_IMPACT');
  }
}
