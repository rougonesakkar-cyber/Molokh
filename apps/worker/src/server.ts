import { randomUUID } from 'node:crypto';

import {
  SchedulingConflictError,
  StatusQueueConflictError,
  InvalidRoleGrantTransitionError,
  VersionConflictError,
  type CommandEnvelope,
  type TimerCommandPayload,
} from '@molokh/core';
import {
  activateBookingOfficialConversionFromQueue,
  invalidateActiveBookingOfficialConversion,
  invalidateCompetitiveSession,
  invalidateBookingOfficialConversionFromQueue,
  activateStatusQueueHead,
  claimInboxEvent,
  claimOutboxBatch,
  cleanupExpiredChatPayloads,
  createDatabase,
  archiveInactiveMatch,
  expireDiscoverySuppression,
  expireBookingIntent,
  expireBookingOfficialConversion,
  expireBookingSoloContinuation,
  expireBookingTrainingRetention,
  expireAccountExport,
  prepareAccountExport,
  expirePhoneChangeSecurityHold,
  expireGroupOffering,
  expireGroupPlan,
  expireGroupPlanOfficialConversion,
  expireOptionalChallenge,
  expireChallengeScheduling,
  expireGenesisChallenge,
  expireLike,
  finalizeResult,
  recordEvidenceScan,
  expireGuestCoachGrant,
  expireSlot,
  expireStatusQueueReconfirmation,
  applyChallengeResponseIncidentImpact,
  applyPausableDeadlineIncidentImpact,
  compensateMandatoryChallengeTimeout,
  compensatePlatformIncidentImpacts,
  transitionYouthToAdult,
  markOutboxPublished,
  remindMissingResultCoach,
  escalateMissingResultAdmin,
  openMissingResultReview,
  openSessionWindow,
  outboxRetryDelayMilliseconds,
  projectNotificationBatch,
  projectPendingMandatoryChallengeReminder,
  projectPendingMembershipNotification,
  projectPendingOptionalChallengeReminder,
  promoteSingleGenesisCandidate,
  readDiscoverySuppressionTimerSnapshot,
  readBookingIntentTimerSnapshot,
  readBookingOfficialConversionActivationCandidate,
  readInvalidActiveBookingOfficialConversionCandidate,
  readInvalidBookingOfficialConversionCandidate,
  readBookingOfficialConversionTimerSnapshot,
  readBookingSoloContinuationTimerSnapshot,
  readBookingTrainingRetentionTimerSnapshot,
  readAccountExportTimerSnapshot,
  readAccountAccessTimerSnapshot,
  readGroupOfferingTimerSnapshot,
  readGroupPlanTimerSnapshot,
  readGroupPlanOfficialConversionTimerSnapshot,
  listExpirableGuestCoachGrants,
  listInvalidPlannedTitleSessions,
  readLikeTimerSnapshot,
  readMatchTimerSnapshot,
  readMembershipTimerSnapshot,
  readResultTimerSnapshot,
  readMissingResultChallengeTimerSnapshot,
  readPlatformIncidentTimerSuppression,
  listChallengeResponseIncidentImpactCandidates,
  listPausableDeadlineImpactCandidates,
  listMandatoryTimeoutCompensationCandidates,
  readSessionTimerSnapshot,
  readChallengeTimerSnapshot,
  readOptionalChallengeReminderTimerSnapshot,
  readSlotTimerSnapshot,
  readStatusQueueActivationCandidate,
  readStatusQueueReconciliationCandidates,
  readStatusQueueTimerSnapshot,
  readAgeDivisionTransitionTimerSnapshot,
  readVacancyQueueReconciliationCandidate,
  reconcileVacancyQueue,
  requestStatusQueueReconfirmation,
  releaseOutboxFailure,
  type ExpireDiscoverySuppressionPayload,
  type ExpireBookingIntentPayload,
  type ExpireBookingOfficialConversionPayload,
  type InvalidateActiveBookingOfficialConversionPayload,
  type InvalidateCompetitiveSessionPayload,
  type ExpireBookingSoloContinuationPayload,
  type ExpireBookingTrainingRetentionPayload,
  type ExpireAccountExportPayload,
  type PrepareAccountExportPayload,
  type ExpirePhoneChangeHoldPayload,
  type ExpireGroupOfferingPayload,
  type ExpireGroupPlanPayload,
  type ExpireGroupPlanOfficialConversionPayload,
  type ExpireLikePayload,
  type ExpireInactiveMatchPayload,
  type FinalizeResultPayload,
  type ExpireGuestCoachPayload,
  type ExpireSlotPayload,
  type OpenSessionWindowPayload,
  type ExpireOptionalChallengePayload,
  type ExpireChallengeSchedulingPayload,
  type ExpireGenesisChallengePayload,
  type ActivateStatusQueueHeadPayload,
  type ExpireStatusQueueReconfirmationPayload,
  type ApplyIncidentDeadlineImpactPayload,
  type ApplyPausableDeadlineImpactPayload,
  type CompensateMandatoryTimeoutPayload,
  type CompensatePlatformIncidentPayload,
  type MissingResultTimerPayload,
  type RequestStatusQueueReconfirmationPayload,
  type PromoteSingleGenesisCandidatePayload,
  type ReconcileVacancyQueuePayload,
  type TransitionToAdultPayload,
} from '@molokh/db';
import { makeWorkerUtils, run } from 'graphile-worker';
import pino from 'pino';

import { startOutboxPolling } from './outbox-dispatcher.js';
import { parseNotificationProjection } from './notification-projection.js';
import { socialTimerFromOutbox } from './social-timers.js';
import { membershipTimerFromOutbox } from './membership-timers.js';
import { schedulingTimerFromOutbox } from './scheduling-timers.js';
import { challengeTimerFromOutbox } from './challenge-timers.js';
import { resultTimerFromOutbox } from './result-timers.js';
import { missingResultTimerFromOutbox } from './missing-result-timers.js';
import { statusQueueTimerFromOutbox } from './status-queue-timers.js';
import { createTaskList } from './tasks.js';
import { processTimer } from './timer-processor.js';
import { identityTimerFromOutbox } from './identity-timers.js';
import { incidentTimerFromOutbox } from './incident-timers.js';
import {
  accountExportIdFromRequestedOutbox,
  accountLifecycleTimerFromOutbox,
} from './account-lifecycle.js';
import { accountAccessTimerFromOutbox } from './account-access.js';
import {
  platformIncidentIdFromResolvedOutbox,
  reconcilePlatformIncidentEffects,
} from './platform-incident-reconciliation.js';
import {
  competitionIdFromCompetitiveSessionEvent,
} from './competitive-context-reconciliation.js';

const production = process.env.NODE_ENV === 'production';
const connectionString =
  process.env.DATABASE_URL ??
  (production
    ? undefined
    : 'postgres://molokh:local-only-password@localhost:5432/molokh');

if (!connectionString) {
  throw new Error('DATABASE_URL is required to start the worker');
}

const logger = pino({ name: 'molokh-worker' });
const database = createDatabase(connectionString);
const workerUtils = await makeWorkerUtils({ connectionString });

const scheduleTimer = async (payload: TimerCommandPayload, runAt: Date) => {
  await workerUtils.addJob('process_timer', payload, {
    jobKey: `timer:${payload.commandType}:${payload.aggregateId}:v${payload.expectedVersion}`,
    jobKeyMode: 'unsafe_dedupe',
    maxAttempts: 10,
    runAt,
  });
};

const expireTerminalGuestCoachGrants = async (): Promise<void> => {
  const candidates = await listExpirableGuestCoachGrants(database, 100, new Date());
  for (const candidate of candidates) {
    const command: CommandEnvelope<ExpireGuestCoachPayload> = {
      commandId: randomUUID(), commandType: 'EXPIRE_GUEST_COACH',
      idempotencyKey: `guest-coach-expiry:${candidate.grantId}:v${candidate.version}`,
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'RoleGrant', aggregateId: candidate.grantId,
      expectedVersion: candidate.version, correlationId: randomUUID(), causationId: null,
      requestId: randomUUID(), source: 'scheduler', payloadVersion: 1,
      payload: {
        grantId: candidate.grantId, sessionId: candidate.sessionId, reason: candidate.reason,
      },
    };
    try {
      await expireGuestCoachGrant(database, command, {
        eventId: randomUUID(), auditId: randomUUID(), outboxMessageId: randomUUID(),
        notificationId: randomUUID(),
      });
    } catch (error) {
      if (error instanceof InvalidRoleGrantTransitionError || error instanceof VersionConflictError) {
        logger.info({ grantId: candidate.grantId }, 'stale Guest Coach expiry ignored');
        continue;
      }
      throw error;
    }
  }
};

const statusQueueActivationTopics = new Set([
  'competition.status-queue.submitted.v1',
  'competition.status-queue.head-released.v1',
  'competition.status-queue.withdrawn.v1',
  'competition.status-queue.reconfirmed.v1',
  'competition.challenge.withdrawn.v1',
  'competition.result.finalized.v1',
  'competition.appeal.decided.v1',
  'competition.integrity-case.decided.v1',
  'scheduling.booking.official-conversion-closed.v1',
]);

const reconcileInvalidCompetitiveSessions = async (
  competitionId: string,
  causationId: string,
): Promise<void> => {
  const candidates = await listInvalidPlannedTitleSessions(database, competitionId, 100);
  for (const candidate of candidates) {
    const command: CommandEnvelope<InvalidateCompetitiveSessionPayload> = {
      commandId: randomUUID(),
      commandType: 'INVALIDATE_COMPETITIVE_CONTEXT',
      idempotencyKey: `session:${candidate.sessionId}:invalidate-competitive-context:v${candidate.version}`,
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'Session',
      aggregateId: candidate.sessionId,
      expectedVersion: candidate.version,
      correlationId: randomUUID(),
      causationId,
      requestId: randomUUID(),
      source: 'scheduler',
      payloadVersion: 1,
      payload: { sessionId: candidate.sessionId },
    };
    try {
      await invalidateCompetitiveSession(database, command, {
        eventId: randomUUID(),
        auditId: randomUUID(),
        outboxMessageId: randomUUID(),
        challengeEventId: randomUUID(),
        challengeOutboxMessageId: randomUUID(),
        bookingEventId: randomUUID(),
        slotEventId: randomUUID(),
        retentionId: randomUUID(),
        retentionEventId: randomUUID(),
        retentionOutboxMessageId: randomUUID(),
        retentionTimerOutboxMessageId: randomUUID(),
        notificationOutboxMessageId: randomUUID(),
        notificationIds: [randomUUID(), randomUUID(), randomUUID()],
      });
    } catch (error) {
      if (error instanceof SchedulingConflictError || error instanceof VersionConflictError) {
        logger.info(
          { competitionId, sessionId: candidate.sessionId },
          'stale competitive Session invalidation ignored',
        );
        continue;
      }
      throw error;
    }
  }
};

const statusQueueHolderChangeTopics = new Set([
  'competition.result.finalized.v1',
  'competition.appeal.decided.v1',
  'competition.integrity-case.decided.v1',
]);

const vacancyQueueReconciliationTopics = new Set([
  'competition.status-released.v1',
  'competition.status-queue.submitted.v1',
  'competition.status-queue.withdrawn.v1',
  'competition.status-queue.head-released.v1',
  'competition.genesis.declined.v1',
  'competition.genesis.expired-no-fault.v1',
  'competition.status-vacancy.reconcile.v1',
  'competition.status-vacancy.single-promoted.v1',
]);

function competitionIdFromOutbox(topic: string, payload: unknown): string | null {
  if (
    (!statusQueueActivationTopics.has(topic) && !vacancyQueueReconciliationTopics.has(topic))
    || typeof payload !== 'object'
    || payload === null
  ) {
    return null;
  }
  const value = (payload as Record<string, unknown>).competitionId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

const reconcileOpenVacancy = async (
  competitionId: string,
  causationId: string,
): Promise<void> => {
  const candidate = await readVacancyQueueReconciliationCandidate(database, competitionId);
  if (!candidate) return;
  const command: CommandEnvelope<ReconcileVacancyQueuePayload> = {
    commandId: randomUUID(),
    commandType: 'RECONCILE_VACANCY_QUEUE',
    idempotencyKey: `status-vacancy:${candidate.queueEntryId}:${candidate.action}:v${candidate.version}`,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'ChallengeQueueEntry',
    aggregateId: candidate.queueEntryId,
    expectedVersion: candidate.version,
    correlationId: randomUUID(),
    causationId,
    requestId: randomUUID(),
    source: 'scheduler',
    payloadVersion: 1,
    payload: {
      competitionId,
      queueEntryId: candidate.queueEntryId,
      action: candidate.action,
    },
  };
  try {
    await reconcileVacancyQueue(database, command, {
      eventId: randomUUID(),
      auditId: randomUUID(),
      outboxMessageId: randomUUID(),
      challengeId: randomUUID(),
      challengeEventId: randomUUID(),
      serviceChatId: randomUUID(),
      serviceChatEventId: randomUUID(),
      rulesetSnapshotId: randomUUID(),
      acknowledgmentId: randomUUID(),
      pairedQueueEventId: randomUUID(),
      timerOutboxMessageId: randomUUID(),
      staleQueueEventId: randomUUID(),
      staleQueueOutboxMessageId: randomUUID(),
      notificationOutboxMessageId: randomUUID(),
      notificationIds: [randomUUID(), randomUUID()],
    });
  } catch (error) {
    if (
      error instanceof StatusQueueConflictError
      && ['COMPETITION_PHASE_UNAVAILABLE', 'GENESIS_SINGLE_CANDIDATE_CHANGED',
        'OFFICIAL_OBLIGATION_LIMIT', 'COMMUNITY_NOT_ACTIVE'].includes(error.code)
    ) {
      logger.info({ competitionId, reason: error.code }, 'vacancy queue reconciliation deferred');
      return;
    }
    throw error;
  }
};

const activateWaitingStatusHead = async (
  competitionId: string,
  causationId: string,
): Promise<void> => {
  const invalidActiveConversion = await readInvalidActiveBookingOfficialConversionCandidate(
    database,
    competitionId,
  );
  if (invalidActiveConversion) {
    const command: CommandEnvelope<InvalidateActiveBookingOfficialConversionPayload> = {
      commandId: randomUUID(), commandType: 'CLOSE_INVALID_BOOKING_OFFICIAL_CONVERSION',
      idempotencyKey: `booking-conversion:${invalidActiveConversion.conversionId}:close-invalid:${invalidActiveConversion.reasonCode}:v${invalidActiveConversion.version}`,
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'BookingOfficialConversion',
      aggregateId: invalidActiveConversion.conversionId,
      expectedVersion: invalidActiveConversion.version,
      correlationId: randomUUID(), causationId, requestId: randomUUID(),
      source: 'scheduler', payloadVersion: 1,
      payload: { conversionId: invalidActiveConversion.conversionId,
        reasonCode: invalidActiveConversion.reasonCode },
    };
    try {
      await invalidateActiveBookingOfficialConversion(database, command, {
        eventId: randomUUID(), auditId: randomUUID(), outboxMessageId: randomUUID(),
        bookingEventId: randomUUID(), notificationOutboxMessageId: randomUUID(),
        notificationIds: [randomUUID(), randomUUID(), randomUUID()],
      });
    } catch (error) {
      if (error instanceof SchedulingConflictError && [
        'OFFICIAL_CONVERSION_NOT_PENDING', 'OFFICIAL_CONVERSION_NOT_ALLOWED',
      ].includes(error.code)) {
        logger.info({ competitionId, conversionId: invalidActiveConversion.conversionId,
          reason: error.code }, 'invalid active conversion already reconciled');
        return;
      }
      throw error;
    }
    return;
  }
  const invalidConversion = await readInvalidBookingOfficialConversionCandidate(
    database,
    competitionId,
  );
  if (invalidConversion) {
    const command: CommandEnvelope<{
      readonly conversionId: string;
      readonly queueEntryId: string;
      readonly reasonCode: 'BOUND_HOLDER_CHANGED' | 'PREBOOKED_SOURCE_UNAVAILABLE';
    }> = {
      commandId: randomUUID(), commandType: 'INVALIDATE_PREBOOKED_OFFICIAL_CONVERSION',
      idempotencyKey: `booking-conversion:${invalidConversion.conversionId}:invalidate:${invalidConversion.reasonCode}:v${invalidConversion.version}`,
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'BookingOfficialConversion', aggregateId: invalidConversion.conversionId,
      expectedVersion: invalidConversion.version, correlationId: randomUUID(), causationId,
      requestId: randomUUID(), source: 'scheduler', payloadVersion: 1,
      payload: { conversionId: invalidConversion.conversionId,
        queueEntryId: invalidConversion.queueEntryId, reasonCode: invalidConversion.reasonCode },
    };
    try {
      await invalidateBookingOfficialConversionFromQueue(database, command, {
        eventId: randomUUID(), auditId: randomUUID(), outboxMessageId: randomUUID(),
        queueEventId: randomUUID(), notificationOutboxMessageId: randomUUID(),
        notificationIds: [randomUUID(), randomUUID(), randomUUID()],
      });
    } catch (error) {
      if (error instanceof SchedulingConflictError && [
        'OFFICIAL_CONVERSION_FIFO_REQUIRED', 'OFFICIAL_CONVERSION_NOT_ALLOWED',
      ].includes(error.code)) {
        logger.info({ competitionId, conversionId: invalidConversion.conversionId,
          reason: error.code }, 'invalid prebooked conversion already reconciled');
        return;
      }
      throw error;
    }
    return;
  }
  const conversion = await readBookingOfficialConversionActivationCandidate(database, competitionId);
  if (conversion) {
    const command: CommandEnvelope<{
      readonly conversionId: string;
      readonly queueEntryId: string;
    }> = {
      commandId: randomUUID(), commandType: 'ACTIVATE_PREBOOKED_OFFICIAL_CONVERSION',
      idempotencyKey: `booking-conversion:${conversion.conversionId}:activate:v${conversion.version}`,
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'BookingOfficialConversion', aggregateId: conversion.conversionId,
      expectedVersion: conversion.version, correlationId: randomUUID(), causationId,
      requestId: randomUUID(), source: 'scheduler', payloadVersion: 1,
      payload: { conversionId: conversion.conversionId, queueEntryId: conversion.queueEntryId },
    };
    try {
      await activateBookingOfficialConversionFromQueue(database, command, {
        eventId: randomUUID(), auditId: randomUUID(), outboxMessageId: randomUUID(),
        queueEventId: randomUUID(), queueConsumedEventId: randomUUID(),
        bookingEventId: randomUUID(),
        timerOutboxMessageId: randomUUID(),
        notificationOutboxMessageId: randomUUID(),
        notificationIds: [randomUUID(), randomUUID(), randomUUID()],
      });
    } catch (error) {
      if (error instanceof SchedulingConflictError && [
        'OFFICIAL_CONVERSION_FIFO_REQUIRED', 'OFFICIAL_CONVERSION_NOT_ALLOWED',
      ].includes(error.code)) {
        logger.info({ competitionId, conversionId: conversion.conversionId, reason: error.code },
          'prebooked conversion activation deferred');
        return;
      }
      throw error;
    }
    return;
  }
  const candidate = await readStatusQueueActivationCandidate(database, competitionId);
  if (!candidate) return;
  const command: CommandEnvelope<ActivateStatusQueueHeadPayload> = {
    commandId: randomUUID(),
    commandType: 'ACTIVATE_STATUS_QUEUE_HEAD',
    idempotencyKey: `status-queue:${candidate.queueEntryId}:activate:v${candidate.version}`,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'ChallengeQueueEntry',
    aggregateId: candidate.queueEntryId,
    expectedVersion: candidate.version,
    correlationId: randomUUID(),
    causationId,
    requestId: randomUUID(),
    source: 'scheduler',
    payloadVersion: 1,
    payload: { competitionId, queueEntryId: candidate.queueEntryId },
  };
  try {
    await activateStatusQueueHead(database, command, {
      eventId: randomUUID(),
      auditId: randomUUID(),
      outboxMessageId: randomUUID(),
      challengeId: randomUUID(),
      challengeEventId: randomUUID(),
      serviceChatId: randomUUID(),
      serviceChatEventId: randomUUID(),
      rulesetSnapshotId: randomUUID(),
      acknowledgmentId: randomUUID(),
      pairedQueueEventId: randomUUID(),
      timerOutboxMessageId: randomUUID(),
      optionalReminderTimerOutboxMessageIds: [randomUUID(), randomUUID()],
      staleQueueEventId: randomUUID(),
      staleQueueOutboxMessageId: randomUUID(),
      notificationOutboxMessageId: randomUUID(),
      notificationIds: [randomUUID(), randomUUID()],
    });
  } catch (error) {
    if (
      error instanceof StatusQueueConflictError
      && ['QUEUE_ENTRY_NOT_FOUND', 'QUEUE_ENTRY_NOT_HEAD', 'QUEUE_ENTRY_NOT_WAITING',
        'STATUS_SLOT_OCCUPIED', 'BOUND_HOLDER_CHANGED', 'COMPETITION_PHASE_UNAVAILABLE',
        'COMPETITION_NOT_ACTIVE', 'COMPETITION_INTEGRITY_HOLD', 'COMMUNITY_NOT_ACTIVE',
        'RULESET_ACK_REQUIRED'].includes(error.code)
    ) {
      logger.info({ competitionId, reason: error.code }, 'status queue activation deferred');
      return;
    }
    throw error;
  }
};

const reconcileWaitingStatusEntries = async (
  competitionId: string,
  causationId: string,
): Promise<void> => {
  const candidates = await readStatusQueueReconciliationCandidates(database, competitionId);
  for (const candidate of candidates) {
    const command: CommandEnvelope<RequestStatusQueueReconfirmationPayload> = {
      commandId: randomUUID(),
      commandType: 'REQUEST_STATUS_QUEUE_RECONFIRMATION',
      idempotencyKey: `status-queue:${candidate.queueEntryId}:holder-change:v${candidate.version}`,
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'ChallengeQueueEntry',
      aggregateId: candidate.queueEntryId,
      expectedVersion: candidate.version,
      correlationId: randomUUID(),
      causationId,
      requestId: randomUUID(),
      source: 'scheduler',
      payloadVersion: 1,
      payload: { competitionId, queueEntryId: candidate.queueEntryId },
    };
    try {
      await requestStatusQueueReconfirmation(database, command, {
        eventId: randomUUID(),
        auditId: randomUUID(),
        outboxMessageId: randomUUID(),
        timerOutboxMessageId: randomUUID(),
        notificationOutboxMessageId: randomUUID(),
        notificationId: randomUUID(),
      });
    } catch (error) {
      if (
        error instanceof StatusQueueConflictError
        && ['QUEUE_ENTRY_NOT_FOUND', 'QUEUE_RECONFIRMATION_NOT_REQUIRED',
          'COMPETITION_PHASE_UNAVAILABLE'].includes(error.code)
      ) {
        logger.info(
          { competitionId, queueEntryId: candidate.queueEntryId, reason: error.code },
          'status queue holder reconciliation skipped',
        );
        continue;
      }
      throw error;
    }
  }
};

const executeLikeExpiry = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<ExpireLikePayload> = {
    commandId: randomUUID(),
    commandType: 'EXPIRE_LIKE',
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'Like',
    aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion,
    correlationId: randomUUID(),
    causationId: null,
    requestId: randomUUID(),
    source: 'scheduler',
    payloadVersion: 1,
    payload: { likeId: payload.aggregateId },
  };
  await expireLike(database, command, {
    eventId: randomUUID(),
    auditId: randomUUID(),
    outboxMessageId: randomUUID(),
  });
};

const executeInactiveMatchExpiry = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<ExpireInactiveMatchPayload> = {
    commandId: randomUUID(),
    commandType: 'EXPIRE_INACTIVE_MATCH',
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'Match',
    aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion,
    correlationId: randomUUID(),
    causationId: null,
    requestId: randomUUID(),
    source: 'scheduler',
    payloadVersion: 1,
    payload: { matchId: payload.aggregateId },
  };
  await archiveInactiveMatch(database, command, {
    eventId: randomUUID(),
    auditId: randomUUID(),
    outboxMessageId: randomUUID(),
    chatEventId: randomUUID(),
  });
};

const executeMembershipRequestNotification = async (payload: TimerCommandPayload) => {
  const kind = payload.commandType === 'REMIND_MEMBERSHIP_REQUEST'
    ? 'REMINDER'
    : 'ESCALATION';
  await projectPendingMembershipNotification(
    database,
    payload.aggregateId,
    kind,
    Array.from({ length: 20 }, () => randomUUID()),
  );
};

const executeOptionalChallengeReminder = async (payload: TimerCommandPayload) => {
  await projectPendingOptionalChallengeReminder(
    database,
    payload.aggregateId,
    payload.expectedVersion,
    payload.commandType === 'REMIND_OPTIONAL_CHALLENGE_RESPONSE_12H' ? '12H' : '24H',
    randomUUID(),
  );
};

const executeMandatoryChallengeReminder = async (payload: TimerCommandPayload) => {
  await projectPendingMandatoryChallengeReminder(
    database,
    payload.aggregateId,
    payload.expectedVersion,
    randomUUID(),
  );
};

const executeSuppressionExpiry = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<ExpireDiscoverySuppressionPayload> = {
    commandId: randomUUID(),
    commandType: 'EXPIRE_DISCOVERY_SUPPRESSION',
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'DiscoveryPairSuppression',
    aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion,
    correlationId: randomUUID(),
    causationId: null,
    requestId: randomUUID(),
    source: 'scheduler',
    payloadVersion: 1,
    payload: { suppressionId: payload.aggregateId },
  };
  await expireDiscoverySuppression(database, command, {
    eventId: randomUUID(),
    auditId: randomUUID(),
    outboxMessageId: randomUUID(),
  });
};

const executeSlotExpiry = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<ExpireSlotPayload> = {
    commandId: randomUUID(),
    commandType: 'EXPIRE_SLOT',
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'Slot',
    aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion,
    correlationId: randomUUID(),
    causationId: null,
    requestId: randomUUID(),
    source: 'scheduler',
    payloadVersion: 1,
    payload: { slotId: payload.aggregateId },
  };
  await expireSlot(database, command, {
    eventId: randomUUID(),
    auditId: randomUUID(),
    outboxMessageId: randomUUID(),
  });
};

const executeGroupOfferingExpiry = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<ExpireGroupOfferingPayload> = {
    commandId: randomUUID(),
    commandType: 'EXPIRE_GROUP_OFFERING',
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'GroupOffering',
    aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion,
    correlationId: randomUUID(),
    causationId: null,
    requestId: randomUUID(),
    source: 'scheduler',
    payloadVersion: 1,
    payload: { groupOfferingId: payload.aggregateId },
  };
  await expireGroupOffering(database, command, {
    eventId: randomUUID(),
    auditId: randomUUID(),
    outboxMessageId: randomUUID(),
  });
};

const executeBookingIntentExpiry = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<ExpireBookingIntentPayload> = {
    commandId: randomUUID(),
    commandType: payload.commandType,
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'Booking',
    aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion,
    correlationId: randomUUID(),
    causationId: null,
    requestId: randomUUID(),
    source: 'scheduler',
    payloadVersion: 1,
    payload: { bookingId: payload.aggregateId },
  };
  await expireBookingIntent(database, command, {
    eventId: randomUUID(),
    auditId: randomUUID(),
    outboxMessageId: randomUUID(),
    challengeEventId: randomUUID(),
    challengeOutboxMessageId: randomUUID(),
  });
};

const executeGroupPlanExpiry = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<ExpireGroupPlanPayload> = {
    commandId: randomUUID(),
    commandType: 'EXPIRE_GROUP_PLAN',
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'GroupPlan',
    aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion,
    correlationId: randomUUID(),
    causationId: null,
    requestId: randomUUID(),
    source: 'scheduler',
    payloadVersion: 1,
    payload: { groupPlanId: payload.aggregateId },
  };
  await expireGroupPlan(database, command, {
    eventId: randomUUID(),
    auditId: randomUUID(),
    outboxMessageId: randomUUID(),
  });
};

const executeOpenSessionWindow = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<OpenSessionWindowPayload> = {
    commandId: randomUUID(),
    commandType: 'OPEN_SESSION_WINDOW',
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'Session',
    aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion,
    correlationId: randomUUID(),
    causationId: null,
    requestId: randomUUID(),
    source: 'scheduler',
    payloadVersion: 1,
    payload: { sessionId: payload.aggregateId },
  };
  await openSessionWindow(database, command, {
    eventId: randomUUID(),
    auditId: randomUUID(),
    outboxMessageId: randomUUID(),
    competitiveSnapshotId: randomUUID(),
    bookingEventId: randomUUID(),
    conversionEventId: randomUUID(),
    conversionQueueEventId: randomUUID(),
    conversionOutboxMessageId: randomUUID(),
    conversionNotificationOutboxMessageId: randomUUID(),
    conversionNotificationIds: [randomUUID(), randomUUID(), randomUUID()],
  });
};

const executeOptionalChallengeExpiry = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<ExpireOptionalChallengePayload> = {
    commandId: randomUUID(),
    commandType: payload.commandType,
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'Challenge',
    aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion,
    correlationId: randomUUID(),
    causationId: null,
    requestId: randomUUID(),
    source: 'scheduler',
    payloadVersion: 1,
    payload: { challengeId: payload.aggregateId },
  };
  await expireOptionalChallenge(database, command, {
    eventId: randomUUID(),
    auditId: randomUUID(),
    outboxMessageId: randomUUID(),
    notificationId: randomUUID(),
    notificationOutboxMessageId: randomUUID(),
    resultId: randomUUID(),
    resultEventId: randomUUID(),
    statusTransitionId: randomUUID(),
    statusEventId: randomUUID(),
    cooldownId: randomUUID(),
    cooldownEventId: randomUUID(),
    timerOutboxMessageId: randomUUID(),
    notificationIds: [randomUUID(), randomUUID()],
  });
};

const executeChallengeSchedulingExpiry = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<ExpireChallengeSchedulingPayload> = {
    commandId: randomUUID(),
    commandType: 'EXPIRE_CHALLENGE_SCHEDULING',
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'Challenge',
    aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion,
    correlationId: randomUUID(),
    causationId: null,
    requestId: randomUUID(),
    source: 'scheduler',
    payloadVersion: 1,
    payload: { challengeId: payload.aggregateId },
  };
  await expireChallengeScheduling(database, command, {
    eventId: randomUUID(),
    auditId: randomUUID(),
    outboxMessageId: randomUUID(),
    notificationId: randomUUID(),
    notificationOutboxMessageId: randomUUID(),
    notificationIds: [randomUUID(), randomUUID()],
    bookingEventId: randomUUID(),
    bookingOutboxMessageId: randomUUID(),
  });
};

const executeGenesisChallengeExpiry = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<ExpireGenesisChallengePayload> = {
    commandId: randomUUID(),
    commandType: 'EXPIRE_GENESIS_CHALLENGE',
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'Challenge',
    aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion,
    correlationId: randomUUID(),
    causationId: null,
    requestId: randomUUID(),
    source: 'scheduler',
    payloadVersion: 1,
    payload: { challengeId: payload.aggregateId },
  };
  await expireGenesisChallenge(database, command, {
    eventId: randomUUID(),
    auditId: randomUUID(),
    outboxMessageId: randomUUID(),
    queueEventIds: [randomUUID(), randomUUID()],
    notificationOutboxMessageId: randomUUID(),
    notificationIds: [randomUUID(), randomUUID()],
  });
};

const executeStatusQueueReconfirmationExpiry = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<ExpireStatusQueueReconfirmationPayload> = {
    commandId: randomUUID(),
    commandType: 'EXPIRE_STATUS_QUEUE_RECONFIRMATION',
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'ChallengeQueueEntry',
    aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion,
    correlationId: randomUUID(),
    causationId: null,
    requestId: randomUUID(),
    source: 'scheduler',
    payloadVersion: 1,
    payload: { queueEntryId: payload.aggregateId },
  };
  await expireStatusQueueReconfirmation(database, command, {
    eventId: randomUUID(),
    auditId: randomUUID(),
    outboxMessageId: randomUUID(),
    timerOutboxMessageId: randomUUID(),
    notificationOutboxMessageId: randomUUID(),
    notificationId: randomUUID(),
  });
};

const executeSingleGenesisCandidatePromotion = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<PromoteSingleGenesisCandidatePayload> = {
    commandId: randomUUID(),
    commandType: 'PROMOTE_SINGLE_GENESIS_CANDIDATE',
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'ChallengeQueueEntry',
    aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion,
    correlationId: randomUUID(),
    causationId: null,
    requestId: randomUUID(),
    source: 'scheduler',
    payloadVersion: 1,
    payload: { queueEntryId: payload.aggregateId },
  };
  await promoteSingleGenesisCandidate(database, command, {
    eventId: randomUUID(),
    auditId: randomUUID(),
    outboxMessageId: randomUUID(),
    statusEventId: randomUUID(),
    notificationOutboxMessageId: randomUUID(),
    notificationId: randomUUID(),
  });
};

const executeBookingOfficialConversionExpiry = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<ExpireBookingOfficialConversionPayload> = {
    commandId: randomUUID(), commandType: 'EXPIRE_BOOKING_OFFICIAL_CONVERSION',
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'BookingOfficialConversion', aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion, correlationId: randomUUID(), causationId: null,
    requestId: randomUUID(), source: 'scheduler', payloadVersion: 1,
    payload: { conversionId: payload.aggregateId },
  };
  await expireBookingOfficialConversion(database, command, {
    eventId: randomUUID(), auditId: randomUUID(), outboxMessageId: randomUUID(),
    bookingEventId: randomUUID(),
    notificationOutboxMessageId: randomUUID(),
    notificationIds: [randomUUID(), randomUUID(), randomUUID()],
  });
};

const executeGroupPlanOfficialConversionExpiry = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<ExpireGroupPlanOfficialConversionPayload> = {
    commandId: randomUUID(), commandType: 'EXPIRE_GROUP_PLAN_OFFICIAL_CONVERSION',
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'GroupPlanOfficialConversion', aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion, correlationId: randomUUID(), causationId: null,
    requestId: randomUUID(), source: 'scheduler', payloadVersion: 1,
    payload: { conversionId: payload.aggregateId },
  };
  await expireGroupPlanOfficialConversion(database, command, {
    eventId: randomUUID(), auditId: randomUUID(), outboxMessageId: randomUUID(),
    groupPlanEventId: randomUUID(), groupPlanTimerOutboxMessageId: randomUUID(),
    notificationOutboxMessageId: randomUUID(),
    notificationIds: [randomUUID(), randomUUID(), randomUUID()],
  });
};

const executeBookingSoloContinuationExpiry = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<ExpireBookingSoloContinuationPayload> = {
    commandId: randomUUID(),
    commandType: 'EXPIRE_BOOKING_SOLO_CONTINUATION',
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'BookingSoloContinuation',
    aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion,
    correlationId: randomUUID(),
    causationId: null,
    requestId: randomUUID(),
    source: 'scheduler',
    payloadVersion: 1,
    payload: { continuationId: payload.aggregateId },
  };
  await expireBookingSoloContinuation(database, command, {
    eventId: randomUUID(),
    auditId: randomUUID(),
    outboxMessageId: randomUUID(),
    bookingEventId: randomUUID(),
    sessionEventId: randomUUID(),
    slotEventId: randomUUID(),
    notificationOutboxMessageId: randomUUID(),
    notificationIds: [randomUUID(), randomUUID()],
  });
};

const executeBookingTrainingRetentionExpiry = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<ExpireBookingTrainingRetentionPayload> = {
    commandId: randomUUID(), commandType: 'EXPIRE_BOOKING_TRAINING_RETENTION',
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'BookingTrainingRetention', aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion, correlationId: randomUUID(), causationId: null,
    requestId: randomUUID(), source: 'scheduler', payloadVersion: 1,
    payload: { retentionId: payload.aggregateId },
  };
  await expireBookingTrainingRetention(database, command, {
    eventId: randomUUID(), auditId: randomUUID(), outboxMessageId: randomUUID(),
    bookingEventId: randomUUID(), sessionEventId: randomUUID(), slotEventId: randomUUID(),
    notificationOutboxMessageId: randomUUID(),
    notificationIds: [randomUUID(), randomUUID(), randomUUID()],
  });
};

const executeAccountExportExpiry = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<ExpireAccountExportPayload> = {
    commandId: randomUUID(), commandType: 'EXPIRE_ACCOUNT_EXPORT',
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'AccountDataExport', aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion, correlationId: randomUUID(), causationId: null,
    requestId: randomUUID(), source: 'scheduler', payloadVersion: 1,
    payload: { exportId: payload.aggregateId },
  };
  await expireAccountExport(database, command, {
    eventId: randomUUID(), auditId: randomUUID(), outboxMessageId: randomUUID(),
  });
};

const executeAccountAccessHoldExpiry = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<ExpirePhoneChangeHoldPayload> = {
    commandId: randomUUID(), commandType: 'EXPIRE_SECURITY_HOLD',
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'AccountAccessCase', aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion, correlationId: randomUUID(), causationId: null,
    requestId: randomUUID(), source: 'scheduler', payloadVersion: 1,
    payload: { caseId: payload.aggregateId },
  };
  await expirePhoneChangeSecurityHold(database, command, {
    eventId: randomUUID(), auditId: randomUUID(), outboxMessageId: randomUUID(),
  });
};

const prepareRequestedAccountExport = async (exportId: string, causationId: string) => {
  const command: CommandEnvelope<PrepareAccountExportPayload> = {
    commandId: randomUUID(), commandType: 'PREPARE_ACCOUNT_EXPORT',
    idempotencyKey: `account-export:${exportId}:prepare:v1`,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'AccountDataExport', aggregateId: exportId, expectedVersion: 1,
    correlationId: randomUUID(), causationId, requestId: randomUUID(),
    source: 'scheduler', payloadVersion: 1, payload: { exportId },
  };
  await prepareAccountExport(database, command, {
    eventId: randomUUID(), auditId: randomUUID(), outboxMessageId: randomUUID(),
  });
};

const executeResultFinalization = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<FinalizeResultPayload> = {
    commandId: randomUUID(),
    commandType: 'FINALIZE_RESULT',
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'Result',
    aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion,
    correlationId: randomUUID(),
    causationId: null,
    requestId: randomUUID(),
    source: 'scheduler',
    payloadVersion: 1,
    payload: { resultId: payload.aggregateId },
  };
  await finalizeResult(database, command, {
    eventId: randomUUID(),
    auditId: randomUUID(),
    outboxMessageId: randomUUID(),
    challengeEventId: randomUUID(),
    statusFinalizationId: randomUUID(),
    statusEventId: randomUUID(),
    genesisEventId: randomUUID(),
    notificationOutboxMessageId: randomUUID(),
    notificationIds: [randomUUID(), randomUUID()],
  });
};

const executeMissingResultTimer = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<MissingResultTimerPayload> = {
    commandId: randomUUID(), commandType: payload.commandType,
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'Challenge', aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion, correlationId: randomUUID(),
    causationId: null, requestId: randomUUID(), source: 'scheduler',
    payloadVersion: 1, payload: { challengeId: payload.aggregateId },
  };
  const ids = {
    eventId: randomUUID(), auditId: randomUUID(), outboxMessageId: randomUUID(),
    notificationOutboxMessageId: randomUUID(),
    notificationIds: Array.from({ length: 20 }, () => randomUUID()),
    reviewId: randomUUID(), reviewEventId: randomUUID(), operationalFollowupId: randomUUID(),
  };
  if (payload.commandType === 'REMIND_MISSING_RESULT_COACH') {
    await remindMissingResultCoach(database, command, ids);
  } else if (payload.commandType === 'ESCALATE_MISSING_RESULT_ADMIN') {
    await escalateMissingResultAdmin(database, command, ids);
  } else {
    await openMissingResultReview(database, command, ids);
  }
};

const executeAgeDivisionTransition = async (payload: TimerCommandPayload) => {
  const command: CommandEnvelope<TransitionToAdultPayload> = {
    commandId: randomUUID(), commandType: 'TRANSITION_TO_ADULT',
    idempotencyKey: payload.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: 'AgeDivisionTransition', aggregateId: payload.aggregateId,
    expectedVersion: payload.expectedVersion, correlationId: randomUUID(),
    causationId: null, requestId: randomUUID(), source: 'scheduler',
    payloadVersion: 1, payload: { userId: payload.aggregateId },
  };
  await transitionYouthToAdult(database, command, {
    transitionId: randomUUID(), eventId: randomUUID(), auditId: randomUUID(),
    outboxMessageId: randomUUID(), notificationOutboxMessageId: randomUUID(),
    notificationId: randomUUID(),
    relatedEventIds: Array.from({ length: 100 }, () => randomUUID()),
    retentionIds: Array.from({ length: 20 }, () => randomUUID()),
    retentionTimerOutboxMessageIds: Array.from({ length: 20 }, () => randomUUID()),
    statusOutboxMessageIds: Array.from({ length: 20 }, () => randomUUID()),
  });
};

const reconcileResolvedPlatformIncident = async (
  incidentId: string,
  causationId: string,
): Promise<void> => {
  const correlationId = randomUUID();
  const result = await reconcilePlatformIncidentEffects({
    listChallengeResponseCandidates: () =>
      listChallengeResponseIncidentImpactCandidates(database, incidentId),
    applyChallengeResponseImpact: async (candidate) => {
      const command: CommandEnvelope<ApplyIncidentDeadlineImpactPayload> = {
        commandId: randomUUID(),
        commandType: 'APPLY_PLATFORM_INCIDENT_DEADLINE_IMPACT',
        idempotencyKey: `incident:${incidentId}:challenge:${candidate.challengeId}:response`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'Challenge', aggregateId: candidate.challengeId,
        expectedVersion: candidate.version, correlationId, causationId,
        requestId: randomUUID(), source: 'scheduler', payloadVersion: 1,
        payload: { incidentId, challengeId: candidate.challengeId,
          deadlineKind: 'CHALLENGE_RESPONSE', surface: candidate.surface },
      };
      await applyChallengeResponseIncidentImpact(database, command, {
        impactId: randomUUID(), eventId: randomUUID(), auditId: randomUUID(),
        outboxMessageId: randomUUID(),
      });
    },
    listPausableCandidates: () =>
      listPausableDeadlineImpactCandidates(database, incidentId),
    applyPausableImpact: async (candidate) => {
      const command: CommandEnvelope<ApplyPausableDeadlineImpactPayload> = {
        commandId: randomUUID(),
        commandType: 'APPLY_PLATFORM_INCIDENT_DEADLINE_IMPACT',
        idempotencyKey: `incident:${incidentId}:${candidate.deadlineKind}:${candidate.aggregateId}`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: candidate.aggregateType, aggregateId: candidate.aggregateId,
        expectedVersion: candidate.version, correlationId, causationId,
        requestId: randomUUID(), source: 'scheduler', payloadVersion: 1,
        payload: { incidentId, deadlineKind: candidate.deadlineKind,
          surface: candidate.surface },
      };
      await applyPausableDeadlineIncidentImpact(database, command, {
        impactId: randomUUID(), eventId: randomUUID(), auditId: randomUUID(),
        outboxMessageId: randomUUID(),
      });
    },
    listMandatoryTimeoutCandidates: () =>
      listMandatoryTimeoutCompensationCandidates(database, incidentId),
    applyMandatoryTimeoutCompensation: async (candidate) => {
      const command: CommandEnvelope<CompensateMandatoryTimeoutPayload> = {
        commandId: randomUUID(),
        commandType: 'COMPENSATE_MANDATORY_CHALLENGE_TIMEOUT',
        idempotencyKey: `incident:${incidentId}:challenge:${candidate.challengeId}:timeout:${candidate.resultId}`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'Challenge', aggregateId: candidate.challengeId,
        expectedVersion: candidate.version, correlationId, causationId,
        requestId: randomUUID(), source: 'scheduler', payloadVersion: 1,
        payload: { incidentId, challengeId: candidate.challengeId,
          resultId: candidate.resultId },
      };
      await compensateMandatoryChallengeTimeout(database, command, {
        impactId: randomUUID(), compensationId: randomUUID(), eventId: randomUUID(),
        auditId: randomUUID(), outboxMessageId: randomUUID(), resultEventId: randomUUID(),
        competitionEventId: randomUUID(), cooldownEventId: randomUUID(),
      });
    },
    completeIncident: async () => {
      const command: CommandEnvelope<CompensatePlatformIncidentPayload> = {
        commandId: randomUUID(), commandType: 'COMPENSATE_INCIDENT_IMPACTS',
        idempotencyKey: `incident:${incidentId}:complete`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'PlatformIncident', aggregateId: incidentId, expectedVersion: 3,
        correlationId, causationId, requestId: randomUUID(), source: 'scheduler',
        payloadVersion: 1, payload: { incidentId },
      };
      await compensatePlatformIncidentImpacts(database, command, {
        eventId: randomUUID(), auditId: randomUUID(), outboxMessageId: randomUUID(),
      });
    },
  });
  logger.info({ incidentId, ...result }, 'platform incident effects reconciled');
};

const taskList = createTaskList({
  onRuntimeProbe: (message) => logger.info({ message }, 'runtime probe'),
  onEvidenceScan: async (payload) => {
    await recordEvidenceScan(database, {
      commandId: randomUUID(), commandType: 'RECORD_EVIDENCE_SCAN',
      idempotencyKey: `evidence-scan:${payload.attachmentId}:v${payload.expectedVersion}`,
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'EvidenceAttachment', aggregateId: payload.attachmentId,
      expectedVersion: payload.expectedVersion, correlationId: randomUUID(),
      causationId: null, requestId: randomUUID(), source: 'scheduler', payloadVersion: 1,
      payload: { attachmentId: payload.attachmentId, outcome: payload.outcome,
        reasonCode: payload.reasonCode, scanProviderReference: payload.scanProviderReference },
    }, { eventId: randomUUID(), auditId: randomUUID(), outboxMessageId: randomUUID() });
  },
  onChatRetentionCleanup: async () => {
    for (const recordClass of ['PERSONAL_CHAT', 'SERVICE_CHAT'] as const) {
      const result = await cleanupExpiredChatPayloads(database, recordClass, {
        runId: randomUUID(), auditId: randomUUID(), requestId: randomUUID(),
      });
      logger.info(result, 'Chat retention cleanup completed');
    }
  },
  onGuestCoachExpirySweep: expireTerminalGuestCoachGrants,
  onTimer: async (payload) => {
    await processTimer(payload, {
      handlers: {
        TRANSITION_TO_ADULT: {
          loadSnapshot: (timer) =>
            readAgeDivisionTransitionTimerSnapshot(database, timer.aggregateId),
          execute: executeAgeDivisionTransition,
        },
        EXPIRE_ACCOUNT_EXPORT: {
          loadSnapshot: (timer) => readAccountExportTimerSnapshot(database, timer.aggregateId),
          execute: executeAccountExportExpiry,
        },
        EXPIRE_SECURITY_HOLD: {
          loadSnapshot: (timer) => readAccountAccessTimerSnapshot(database, timer.aggregateId),
          execute: executeAccountAccessHoldExpiry,
        },
        EXPIRE_LIKE: {
          loadSnapshot: (timer) => readLikeTimerSnapshot(database, timer.aggregateId),
          execute: executeLikeExpiry,
        },
        EXPIRE_INACTIVE_MATCH: {
          loadSnapshot: (timer) => readMatchTimerSnapshot(database, timer.aggregateId),
          execute: executeInactiveMatchExpiry,
        },
        REMIND_MEMBERSHIP_REQUEST: {
          loadSnapshot: (timer) => readMembershipTimerSnapshot(database, timer.aggregateId),
          execute: executeMembershipRequestNotification,
        },
        ESCALATE_MEMBERSHIP_REQUEST: {
          loadSnapshot: (timer) => readMembershipTimerSnapshot(database, timer.aggregateId),
          execute: executeMembershipRequestNotification,
        },
        EXPIRE_DISCOVERY_SUPPRESSION: {
          loadSnapshot: (timer) =>
            readDiscoverySuppressionTimerSnapshot(database, timer.aggregateId),
          execute: executeSuppressionExpiry,
        },
        EXPIRE_SLOT: {
          loadSnapshot: (timer) => readSlotTimerSnapshot(database, timer.aggregateId),
          execute: executeSlotExpiry,
        },
        EXPIRE_GROUP_OFFERING: {
          loadSnapshot: (timer) =>
            readGroupOfferingTimerSnapshot(database, timer.aggregateId),
          execute: executeGroupOfferingExpiry,
        },
        EXPIRE_BOOKING_SELECTION: {
          loadSnapshot: (timer) =>
            readBookingIntentTimerSnapshot(database, timer.aggregateId),
          execute: executeBookingIntentExpiry,
        },
        EXPIRE_HOST_CONFIRMATION: {
          loadSnapshot: (timer) =>
            readBookingIntentTimerSnapshot(database, timer.aggregateId),
          execute: executeBookingIntentExpiry,
        },
        EXPIRE_GROUP_PLAN: {
          loadSnapshot: (timer) => readGroupPlanTimerSnapshot(database, timer.aggregateId),
          execute: executeGroupPlanExpiry,
        },
        OPEN_SESSION_WINDOW: {
          loadSnapshot: (timer) =>
            readSessionTimerSnapshot(database, timer.aggregateId),
          execute: executeOpenSessionWindow,
        },
        EXPIRE_OPTIONAL_CHALLENGE: {
          loadSnapshot: (timer) =>
            readChallengeTimerSnapshot(database, timer.aggregateId),
          execute: executeOptionalChallengeExpiry,
        },
        REMIND_OPTIONAL_CHALLENGE_RESPONSE_12H: {
          loadSnapshot: (timer) =>
            readOptionalChallengeReminderTimerSnapshot(database, timer.aggregateId),
          execute: executeOptionalChallengeReminder,
        },
        REMIND_OPTIONAL_CHALLENGE_RESPONSE_24H: {
          loadSnapshot: (timer) =>
            readOptionalChallengeReminderTimerSnapshot(database, timer.aggregateId),
          execute: executeOptionalChallengeReminder,
        },
        REMIND_MANDATORY_CHALLENGE_RESPONSE_48H: {
          loadSnapshot: (timer) =>
            readOptionalChallengeReminderTimerSnapshot(database, timer.aggregateId),
          execute: executeMandatoryChallengeReminder,
        },
        EXPIRE_MANDATORY_CHALLENGE: {
          loadSnapshot: (timer) =>
            readChallengeTimerSnapshot(database, timer.aggregateId),
          execute: executeOptionalChallengeExpiry,
        },
        EXPIRE_GENESIS_CHALLENGE: {
          loadSnapshot: (timer) =>
            readChallengeTimerSnapshot(database, timer.aggregateId),
          execute: executeGenesisChallengeExpiry,
        },
        EXPIRE_CHALLENGE_SCHEDULING: {
          loadSnapshot: (timer) =>
            readChallengeTimerSnapshot(database, timer.aggregateId),
          execute: executeChallengeSchedulingExpiry,
        },
        EXPIRE_STATUS_QUEUE_RECONFIRMATION: {
          loadSnapshot: (timer) =>
            readStatusQueueTimerSnapshot(database, timer.aggregateId),
          execute: executeStatusQueueReconfirmationExpiry,
        },
        PROMOTE_SINGLE_GENESIS_CANDIDATE: {
          loadSnapshot: (timer) =>
            readStatusQueueTimerSnapshot(database, timer.aggregateId),
          execute: executeSingleGenesisCandidatePromotion,
        },
        EXPIRE_BOOKING_OFFICIAL_CONVERSION: {
          loadSnapshot: (timer) =>
            readBookingOfficialConversionTimerSnapshot(database, timer.aggregateId),
          execute: executeBookingOfficialConversionExpiry,
        },
        EXPIRE_GROUP_PLAN_OFFICIAL_CONVERSION: {
          loadSnapshot: (timer) =>
            readGroupPlanOfficialConversionTimerSnapshot(database, timer.aggregateId),
          execute: executeGroupPlanOfficialConversionExpiry,
        },
        EXPIRE_BOOKING_SOLO_CONTINUATION: {
          loadSnapshot: (timer) =>
            readBookingSoloContinuationTimerSnapshot(database, timer.aggregateId),
          execute: executeBookingSoloContinuationExpiry,
        },
        EXPIRE_BOOKING_TRAINING_RETENTION: {
          loadSnapshot: (timer) =>
            readBookingTrainingRetentionTimerSnapshot(database, timer.aggregateId),
          execute: executeBookingTrainingRetentionExpiry,
        },
        FINALIZE_RESULT: {
          loadSnapshot: (timer) => readResultTimerSnapshot(database, timer.aggregateId),
          execute: executeResultFinalization,
        },
        REMIND_MISSING_RESULT_COACH: {
          loadSnapshot: (timer) => readMissingResultChallengeTimerSnapshot(database, timer.aggregateId),
          execute: executeMissingResultTimer,
        },
        ESCALATE_MISSING_RESULT_ADMIN: {
          loadSnapshot: (timer) => readMissingResultChallengeTimerSnapshot(database, timer.aggregateId),
          execute: executeMissingResultTimer,
        },
        OPEN_MISSING_RESULT_REVIEW: {
          loadSnapshot: (timer) => readMissingResultChallengeTimerSnapshot(database, timer.aggregateId),
          execute: executeMissingResultTimer,
        },
      },
      now: () => new Date(),
      readIncidentSuppression: (timer) =>
        readPlatformIncidentTimerSuppression(database, timer, new Date()),
      reschedule: scheduleTimer,
      recordStaleDiagnostic: async (timer, decision) => {
        logger.info(
          {
            actualState: decision.actualState,
            actualVersion: decision.actualVersion,
            aggregateId: timer.aggregateId,
            commandType: timer.commandType,
            reason: decision.reason,
          },
          'stale timer ignored',
        );
      },
    });
  },
  onOutboxEvent: async (message) => {
    const notifications = parseNotificationProjection(message);
    if (notifications) {
      const result = await projectNotificationBatch(database, message.eventId, notifications);
      logger.info(
        {
          createdCount: result.createdCount,
          createdPushIntentCount: result.createdPushIntentCount,
          createdSmsIntentCount: result.createdSmsIntentCount,
          eventId: message.eventId,
          messageId: message.messageId,
          replayed: result.replayed,
        },
        'notification inbox projection handled',
      );
      return;
    }
    const incidentId = platformIncidentIdFromResolvedOutbox(message.topic, message.payload);
    if (incidentId) {
      await reconcileResolvedPlatformIncident(incidentId, message.eventId);
    }
    const requestedExportId = accountExportIdFromRequestedOutbox(message.topic, message.payload);
    if (requestedExportId) {
      await prepareRequestedAccountExport(requestedExportId, message.eventId);
    }
    const competitiveCompetitionId = competitionIdFromCompetitiveSessionEvent(
      message.topic,
      message.payload,
    );
    if (competitiveCompetitionId) {
      await reconcileInvalidCompetitiveSessions(competitiveCompetitionId, message.eventId);
    }
    const competitionId = competitionIdFromOutbox(message.topic, message.payload);
    if (competitionId) {
      if (vacancyQueueReconciliationTopics.has(message.topic)) {
        await reconcileOpenVacancy(competitionId, message.eventId);
      }
      if (statusQueueActivationTopics.has(message.topic)) {
        if (statusQueueHolderChangeTopics.has(message.topic)) {
          await reconcileWaitingStatusEntries(competitionId, message.eventId);
        }
        await activateWaitingStatusHead(competitionId, message.eventId);
      }
    }
    const claimed = await claimInboxEvent(database, `outbox:${message.topic}`, message.eventId);
    if (!claimed) {
      logger.info(
        { eventId: message.eventId, messageId: message.messageId, topic: message.topic },
        'duplicate outbox event ignored',
      );
      return;
    }
    logger.info(
      { eventId: message.eventId, messageId: message.messageId, topic: message.topic },
      'outbox event delivered to local sink',
    );
  },
});
const runner = await run({
  connectionString,
  concurrency: 2,
  crontab: '15 3 * * * cleanup_chat_payloads\n* * * * * expire_guest_coach_grants',
  pollInterval: 1_000,
  taskList,
});
const outboxWorkerId = `outbox-${process.pid}-${randomUUID()}`;
const outboxPolling = startOutboxPolling({
  workerId: outboxWorkerId,
  batchSize: 20,
  pollIntervalMilliseconds: 1_000,
  retryDelay: outboxRetryDelayMilliseconds,
  store: {
    claim: (workerId, batchSize) =>
      claimOutboxBatch(database, { workerId, batchSize }),
    markPublished: (messageId, workerId) =>
      markOutboxPublished(database, messageId, workerId),
    releaseFailure: (messageId, workerId, errorMessage, retryDelayMilliseconds) =>
      releaseOutboxFailure(
        database,
        messageId,
        workerId,
        errorMessage,
        retryDelayMilliseconds,
      ),
  },
  deliver: async (message) => {
    const socialTimer = socialTimerFromOutbox(message.topic, message.payload);
    const timer = socialTimer
      ?? membershipTimerFromOutbox(message.topic, message.payload)
      ?? incidentTimerFromOutbox(message.topic, message.payload)
      ?? accountAccessTimerFromOutbox(message.topic, message.payload)
      ?? accountLifecycleTimerFromOutbox(message.topic, message.payload)
      ?? identityTimerFromOutbox(message.topic, message.payload)
      ?? schedulingTimerFromOutbox(message.topic, message.payload)
      ?? challengeTimerFromOutbox(message.topic, message.payload)
      ?? statusQueueTimerFromOutbox(message.topic, message.payload)
      ?? missingResultTimerFromOutbox(message.topic, message.payload)
      ?? resultTimerFromOutbox(message.topic, message.payload);
    if (timer) {
      await scheduleTimer(timer, new Date(timer.deadlineAt));
    }
    await runner.addJob(
      'deliver_outbox_event',
      {
        messageId: message.messageId,
        eventId: message.eventId,
        topic: message.topic,
        payload: message.payload,
      },
      {
        jobKey: `outbox:${message.messageId}`,
        jobKeyMode: 'unsafe_dedupe',
        maxAttempts: 10,
      },
    );
  },
  onError: (error) => logger.error({ err: error }, 'outbox polling failed'),
});

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await outboxPolling.stop();
  await runner.stop();
  await workerUtils.release();
  await database.destroy();
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
