import { createHash } from 'node:crypto';

import {
  AccountAccessConflictError,
  AccountLifecycleConflictError,
  CommunityConfigurationConflictError,
  IdempotencyKeyReusedError,
  PlatformIncidentConflictError,
  IdentityPermissionDeniedError,
  IdentityValidationError,
  InvalidCommandEnvelopeError,
  InvalidRoleGrantTransitionError,
  MembershipConflictError,
  RoleGrantPermissionDeniedError,
  RoleGrantValidationError,
  ResultConflictError,
  ResultPermissionDeniedError,
  ResultValidationError,
  SchedulingConflictError,
  SchedulingPermissionDeniedError,
  VersionConflictError,
  ChatActionDeniedError,
  YouthConsentConflictError,
  type ActivateIdentityInput,
  type CommandEnvelope,
} from '@molokh/core';
import { sql, type Transaction } from 'kysely';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  approvePhoneChange,
  completeVerifiedRecovery,
  expirePhoneChangeSecurityHold,
  openDuplicateAccountReview,
  readMyAccountAccess,
  requestAccountRecovery,
  resolveDuplicateAccountReview,
  activateUser,
  requestAccountClosure,
  requestAccountExport,
  cancelAccountClosure,
  executeAccountClosure,
  prepareAccountExport,
  expireAccountExport,
  readAccountExportPayload,
  readMyAccountLifecycle,
  listAccountClosuresForCentral,
  activateBookingOfficialConversionFromQueue,
  addAppealResponse,
  acceptCoachInvite,
  appointGymAdmin,
  approveAccountVerification,
  approveMembership,
  activateMembershipByInvite,
  decideBookingOfficialConversion,
  decideBookingSoloContinuation,
  decideBookingTrainingRetention,
  invalidateActiveBookingOfficialConversion,
  changeDisplayName,
  changeHomeVenue,
  changeCommunityPairCooldown,
  changeSports,
  changePrimaryAdmin,
  decideAppeal,
  blockUser,
  archiveInactiveMatch,
  createDiscoveryLike,
  editChatMessage,
  expireDiscoverySuppression,
  expireBookingOfficialConversion,
  expireBookingSoloContinuation,
  expireStatusQueueReconfirmation,
  extendAppealSla,
  claimOutboxBatch,
  claimInboxEvent,
  cleanupExpiredChatPayloads,
  createDatabase,
  detectPlatformIncident,
  confirmPlatformIncident,
  rejectPlatformIncident,
  resolvePlatformIncident,
  compensatePlatformIncidentImpacts,
  listPlatformIncidents,
  listChallengeResponseIncidentImpactCandidates,
  applyChallengeResponseIncidentImpact,
  listPausableDeadlineImpactCandidates,
  applyPausableDeadlineIncidentImpact,
  readPlatformIncidentTimerSuppression,
  listMandatoryTimeoutCompensationCandidates,
  compensateMandatoryChallengeTimeout,
  rebuildCompetitionProjection,
  readCompetitionProjection,
  replayCompetitionProjection,
  replayCompetitionStatusExcludingResults,
  executeCriticalCommand,
  ensureLocalPilotCommunity,
  ensureLocalPilotCompetition,
  hashCommandRequest,
  hideChatMessageForUser,
  markOutboxPublished,
  markNotificationRead,
  listPendingVerifications,
  listPendingCoachInvites,
  listPendingMemberships,
  listAppealsForCentral,
  projectNotificationBatch,
  projectPendingMandatoryChallengeReminder,
  projectPendingMembershipNotification,
  projectPendingOptionalChallengeReminder,
  rejectMembership,
  readCommunityContext,
  readBookingOfficialConversionForSession,
  readBookingSoloContinuationForSession,
  readBookingTrainingRetentionForSession,
  readBookingOfficialConversionActivationCandidate,
  readInvalidActiveBookingOfficialConversionCandidate,
  readCompetitionStatus,
  readStatusQueueActivationCandidate,
  readStatusQueueReconciliationCandidates,
  previewStatusRelease,
  confirmStatusRelease,
  hasActiveCentralRole,
  previewMembershipExit,
  confirmMembershipExit,
  appealMembershipRemoval,
  decideMembershipRemoval,
  listMembershipRemovalsForCentral,
  listVenueMembersForAdmin,
  requestMembershipRemoval,
  requestMembership,
  withdrawMembershipRequest,
  readMembershipTimerSnapshot,
  readVacancyQueueReconciliationCandidate,
  reconcileVacancyQueue,
  promoteSingleGenesisCandidate,
  readActiveBlocks,
  readDiscoveryCards,
  readIdentityProjection,
  readHomeVenueSettings,
  readAgeDivisionTransitionTimerSnapshot,
  readDiscoverySuppressionTimerSnapshot,
  readLikeTimerSnapshot,
  readMatchTimerSnapshot,
  readMatches,
  readResult,
  readResultTimerSnapshot,
  readChatMessages,
  readVenueRoleSummary,
  authorizeGuestCoach,
  expireGuestCoachGrant,
  listExpirableGuestCoachGrants,
  inviteCoach,
  MigrationChecksumMismatchError,
  releaseOutboxFailure,
  reportChatMessage,
  runMigrations,
  skipDiscoveryCandidate,
  sendChatMessage,
  startAccountVerification,
  startAppealReview,
  unblockUser,
  unmatchPair,
  expireLike,
  expireGroupOffering,
  expireGroupPlan,
  expireBookingIntent,
  publishGroupOffering,
  publishSlot,
  updateGroupOffering,
  updateSlot,
  withdrawGroupOffering,
  withdrawSlot,
  withdrawBookingRequest,
  proposeGroupPlan,
  confirmGroupPlan,
  requestGroupPlanOfficialConversion,
  decideGroupPlanOfficialConversion,
  listGroupPlanOfficialConversionsForViewer,
  confirmBookingHost,
  rejectBookingHost,
  readHostConfirmationQueue,
  readVenueAdminDashboard,
  readGroupOfferingTimerSnapshot,
  readGroupPlanTimerSnapshot,
  readMySessions,
  readSession,
  readSessionTimerSnapshot,
  readTrainingOptions,
  requestBookingOfficialConversion,
  requestTrainingParticipantCancellation,
  selectSameSlot,
  selectSlot,
  openSessionWindow,
  recordSessionAttendance,
  recordSessionResult,
  reviseResultMetadata,
  endSession,
  replaceSessionCoach,
  cancelSessionAfterCoachReplacement,
  failSessionExternal,
  cancelOfficialSessionByAthlete,
  createDirectOpenChallenge,
  expireOptionalChallenge,
  expireChallengeScheduling,
  acceptOptionalChallenge,
  activateStatusQueueHead,
  declineOptionalChallenge,
  finalizeResult,
  readChatChallenge,
  readChallengeTimerSnapshot,
  readOptionalChallengeReminderTimerSnapshot,
  proposeMutualChallengeReschedule,
  confirmMutualChallengeReschedule,
  rescheduleChallengeByAthlete,
  remindMissingResultCoach,
  escalateMissingResultAdmin,
  openMissingResultReview,
  submitMissingResultStatement,
  submitStatusQueueEntry,
  requestStatusQueueReconfirmation,
  reconfirmStatusQueueEntry,
  respondToGenesisChallenge,
  confirmMissingResultVenue,
  startMissingResultReview,
  assignMissingResultReviewerCoach,
  readMissingResultReview,
  openIntegrityCase,
  pauseCommunity,
  reactivateCommunity,
  readCommunityLifecycle,
  scheduleCommunityClosure,
  finalizeCommunityClosure,
  readCommunityClosure,
  startIntegrityReview,
  decideIntegrityCase,
  assertYouthChallengeConsentReady,
  decideYouthConsent,
  readYouthConsentSummary,
  requestYouthConsent,
  youthConsentTokenHash,
  readIntegrityCase,
  listTechnicalCorrectionsForCentral,
  listTechnicalCorrectionsForViewer,
  requestTechnicalCorrection,
  approveTechnicalCorrection,
  rejectTechnicalCorrection,
  startTechnicalCorrectionReview,
  submitResultAppeal,
  waiveResultAppeal,
  transitionYouthToAdult,
  withdrawAppeal,
  authenticateAccessToken,
  readRefreshTokenContext,
  requestAuthOtp,
  revokeAuthSession,
  rotateAuthSession,
  verifyAuthOtp,
  type CreateLikePayload,
  type BlockEffectIds,
  type BlockUserPayload,
  type CriticalCommandEffect,
  type Database,
  type DetectPlatformIncidentPayload,
  type ConfirmPlatformIncidentPayload,
  type RejectPlatformIncidentPayload,
  type ResolvePlatformIncidentPayload,
  type CompensatePlatformIncidentPayload,
  type ApplyIncidentDeadlineImpactPayload,
  type ApplyPausableDeadlineImpactPayload,
  type CompensateMandatoryTimeoutPayload,
  type LikeEffectIds,
  type EditChatMessagePayload,
  type HideChatMessagePayload,
  type ReportChatMessagePayload,
  type SendChatMessagePayload,
  type SkipDiscoveryPayload,
  type SkipEffectIds,
  type UnblockUserPayload,
  type UnmatchPayload,
  type ExpireGroupOfferingPayload,
  type ExpireInactiveMatchPayload,
  type ExpireStatusQueueReconfirmationPayload,
  type PublishGroupOfferingPayload,
  type PublishSlotPayload,
  type RejectBookingHostPayload,
  type UpdateGroupOfferingPayload,
  type UpdateSlotPayload,
  type WithdrawGroupOfferingPayload,
  type WithdrawSlotPayload,
  type WithdrawBookingRequestPayload,
  type AthleteChallengeRescheduleEffectIds,
  type ProposeMutualChallengeReschedulePayload,
  type ProposeMutualChallengeRescheduleEffectIds,
  type ConfirmMutualChallengeReschedulePayload,
  type ConfirmMutualChallengeRescheduleEffectIds,
  type RescheduleChallengeByAthletePayload,
  type ConfirmGroupPlanPayload,
  type RequestGroupPlanOfficialConversionPayload,
  type DecideGroupPlanOfficialConversionPayload,
  type GroupPlanOfficialConversionEffectIds,
  type ConfirmBookingHostPayload,
  type DecideBookingOfficialConversionPayload,
  type DecideBookingSoloContinuationPayload,
  type DecideBookingTrainingRetentionPayload,
  type ExpireBookingOfficialConversionPayload,
  type ExpireBookingSoloContinuationPayload,
  type InvalidateActiveBookingOfficialConversionPayload,
  type ExpireGroupPlanPayload,
  type ExpireBookingIntentPayload,
  type ExpireChallengeSchedulingPayload,
  type ExpireOptionalChallengePayload,
  type ProposeGroupPlanPayload,
  type SelectSameSlotPayload,
  type SelectSlotPayload,
  type OpenSessionWindowPayload,
  type RecordAttendancePayload,
  type SessionEffectIds,
  type EndSessionPayload,
  type ReplaceSessionCoachPayload,
  type CancelAfterCoachReplacementPayload,
  type FailSessionExternalPayload,
  type CancelOfficialSessionByAthletePayload,
  type AuthorizeGuestCoachPayload,
  type ExpireGuestCoachPayload,
  type DecideYouthConsentPayload,
  type RequestYouthConsentPayload,
  type YouthConsentEffectIds,
  type RecordSessionResultPayload,
  type ReviseResultMetadataPayload,
  type RebuildCompetitionProjectionPayload,
  type SubmitResultAppealPayload,
  type WaiveResultAppealPayload,
  type AddAppealResponsePayload,
  type ExtendAppealSlaPayload,
  type WithdrawAppealPayload,
  type StartAppealReviewPayload,
  type DecideAppealPayload,
  type MissingResultTimerPayload,
  type SubmitMissingResultStatementPayload,
  type ConfirmMissingResultVenuePayload,
  type StartMissingResultReviewPayload,
  type AssignMissingResultCoachPayload,
  type OpenIntegrityCasePayload,
  type RequestTechnicalCorrectionPayload,
  type ApproveTechnicalCorrectionPayload,
  type TechnicalCorrectionApprovalEffectIds,
  type RejectTechnicalCorrectionPayload,
  type StartTechnicalCorrectionReviewPayload,
  type StartIntegrityReviewPayload,
  type DecideIntegrityCasePayload,
  type SubmitStatusQueueEntryPayload,
  type ActivateStatusQueueHeadPayload,
  type FinalizeResultPayload,
  type GenesisResponsePayload,
  type RespondToChallengePayload,
  type RequestStatusQueueReconfirmationPayload,
  type ReconfirmStatusQueueEntryPayload,
  type PreviewStatusReleasePayload,
  type ConfirmStatusReleasePayload,
  type PreviewMembershipExitPayload,
  type ConfirmMembershipExitPayload,
  type AppealMembershipRemovalPayload,
  type DecideMembershipRemovalPayload,
  type RequestMembershipRemovalPayload,
  type ReconcileVacancyQueuePayload,
  type PromoteSingleGenesisCandidatePayload,
  type RequestBookingOfficialConversionPayload,
  type RequestTrainingParticipantCancellationPayload,
  type PauseCommunityPayload,
  type ReactivateCommunityPayload,
  type ScheduleCommunityClosurePayload,
  type FinalizeCommunityClosurePayload,
  type TransitionToAdultPayload,
} from '../src/index.js';

const ids = {
  actor: '0199a1b2-1234-7000-8000-000000000001',
  aggregate: '0199a1b2-1234-7000-8000-000000000002',
  command: '0199a1b2-1234-7000-8000-000000000003',
  correlation: '0199a1b2-1234-7000-8000-000000000004',
  request: '0199a1b2-1234-7000-8000-000000000005',
  event: '0199a1b2-1234-7000-8000-000000000006',
  audit: '0199a1b2-1234-7000-8000-000000000007',
  outbox: '0199a1b2-1234-7000-8000-000000000008',
  notificationOne: '0199a1b2-1234-7000-8000-000000000010',
  notificationTwo: '0199a1b2-1234-7000-8000-000000000011',
  recipientOne: '0199a1b2-1234-7000-8000-000000000012',
  recipientTwo: '0199a1b2-1234-7000-8000-000000000013',
  identityUser: '0199a1b2-1234-7000-8000-000000000201',
  activationCommand: '0199a1b2-1234-7000-8000-000000000202',
  activationEvent: '0199a1b2-1234-7000-8000-000000000203',
  activationAudit: '0199a1b2-1234-7000-8000-000000000204',
  activationOutbox: '0199a1b2-1234-7000-8000-000000000205',
  displayNameCommand: '0199a1b2-1234-7000-8000-000000000206',
  displayNameEvent: '0199a1b2-1234-7000-8000-000000000207',
  displayNameAudit: '0199a1b2-1234-7000-8000-000000000208',
  displayNameOutbox: '0199a1b2-1234-7000-8000-000000000209',
  identityCorrelation: '0199a1b2-1234-7000-8000-000000000210',
  identityRequest: '0199a1b2-1234-7000-8000-000000000211',
  venue: '0199a1b2-1234-7000-8000-000000000220',
  venueConfiguration: '0199a1b2-1234-7000-8000-000000000221',
  community: '0199a1b2-1234-7000-8000-000000000222',
  communityConfiguration: '0199a1b2-1234-7000-8000-000000000223',
  membership: '0199a1b2-1234-7000-8000-000000000224',
  centralActor: '0199a1b2-1234-7000-8000-000000000225',
  centralGrant: '0199a1b2-1234-7000-8000-000000000226',
  verification: '0199a1b2-1234-7000-8000-000000000230',
  verificationStartCommand: '0199a1b2-1234-7000-8000-000000000231',
  verificationStartEvent: '0199a1b2-1234-7000-8000-000000000232',
  verificationStartAudit: '0199a1b2-1234-7000-8000-000000000233',
  verificationStartOutbox: '0199a1b2-1234-7000-8000-000000000234',
  verificationApproveCommand: '0199a1b2-1234-7000-8000-000000000235',
  verificationApproveEvent: '0199a1b2-1234-7000-8000-000000000236',
  verificationApproveAudit: '0199a1b2-1234-7000-8000-000000000237',
  verificationApproveOutbox: '0199a1b2-1234-7000-8000-000000000238',
  roleCoach: '0199a1b2-1234-7000-8000-000000000240',
  roleUnverified: '0199a1b2-1234-7000-8000-000000000241',
  roleGrant: '0199a1b2-1234-7000-8000-000000000242',
  roleInviteCommand: '0199a1b2-1234-7000-8000-000000000243',
  roleInviteEvent: '0199a1b2-1234-7000-8000-000000000244',
  roleInviteAudit: '0199a1b2-1234-7000-8000-000000000245',
  roleInviteOutbox: '0199a1b2-1234-7000-8000-000000000246',
  roleInviteNotification: '0199a1b2-1234-7000-8000-000000000259',
  roleAcceptCommand: '0199a1b2-1234-7000-8000-000000000247',
  roleAcceptEvent: '0199a1b2-1234-7000-8000-000000000248',
  roleAcceptAudit: '0199a1b2-1234-7000-8000-000000000249',
  roleAcceptOutbox: '0199a1b2-1234-7000-8000-000000000250',
  roleAcceptNotification: '0199a1b2-1234-7000-8000-000000000260',
} as const;

function testId(value: number): string {
  return `0199a1b2-1234-7000-8000-${String(value).padStart(12, '0')}`;
}

function command(
  overrides: Partial<CommandEnvelope<{ readonly amount: number }>> = {},
): CommandEnvelope<{ readonly amount: number }> {
  return {
    commandId: ids.command,
    commandType: 'INCREMENT_PLATFORM_PROBE',
    idempotencyKey: 'platform-probe-1',
    actor: {
      type: 'USER',
      id: ids.actor,
      roles: ['ATHLETE'],
      scopeIds: [],
    },
    aggregateType: 'PlatformProbe',
    aggregateId: ids.aggregate,
    expectedVersion: 0,
    correlationId: ids.correlation,
    causationId: null,
    requestId: ids.request,
    source: 'api',
    payloadVersion: 1,
    payload: { amount: 1 },
    ...overrides,
  };
}

function effect(nextVersion: number): CriticalCommandEffect<{
  readonly value: number;
  readonly version: number;
}> {
  return {
    responseStatus: 200,
    response: { value: 1, version: nextVersion },
    event: {
      eventId: ids.event,
      eventName: 'PlatformProbeIncremented',
      schemaVersion: 1,
      transitionId: 'M1-PROBE-01',
      payload: { amount: 1 },
      metadata: { policyVersion: 'm1-test' },
    },
    audit: {
      auditId: ids.audit,
      action: 'INCREMENT_PLATFORM_PROBE',
      transitionId: 'M1-PROBE-01',
      reasonCode: null,
      beforeState: 'EMPTY',
      afterState: 'ACTIVE',
      metadata: {},
    },
    outbox: [
      {
        messageId: ids.outbox,
        topic: 'platform.probe.incremented.v1',
        payload: { aggregateId: ids.aggregate, version: nextVersion },
      },
    ],
  };
}

describe('command request hashing', () => {
  it('is independent of JSON object key order and changes with semantic input', () => {
    const first = command({ payload: { amount: 1 } });
    const equivalent = command({ payload: { amount: 1 } });
    const changed = command({ payload: { amount: 2 } });

    expect(hashCommandRequest(first)).toBe(hashCommandRequest(equivalent));
    expect(hashCommandRequest(first)).not.toBe(hashCommandRequest(changed));
  });

});

async function verifySchedulingPublication(
  database: ReturnType<typeof createDatabase>,
): Promise<void> {
    const occurredAt = new Date('2026-09-07T09:00:00.000Z');
    const athleteA = testId(1100);
    const athleteB = testId(1101);
    const athleteC = testId(1105);
    const athleteD = testId(1106);
    const athleteE = testId(2570);
    const athleteF = testId(2571);
    const coach = testId(1102);
    const replacementCoach = testId(1109);
    const admin = testId(1103);
    const central = testId(1104);
    const venue = testId(1110);
    const community = testId(1111);
    const chat = testId(1112);
    const matched = testId(1113);
    const secondChat = testId(1107);
    const secondMatch = testId(1108);
    const thirdChat = testId(2572);
    const thirdMatch = testId(2573);
    const slot = testId(1120);
    const offering = testId(1130);

    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values
        (${athleteA}::uuid, '+79991101100', ${occurredAt.toISOString()}::timestamptz, '1995-01-01', 'ADULT', 'Атлет А', 'ACTIVE', 'ru-RU', 1, ${occurredAt.toISOString()}::timestamptz),
        (${athleteB}::uuid, '+79991101101', ${occurredAt.toISOString()}::timestamptz, '1995-01-01', 'ADULT', 'Атлет Б', 'ACTIVE', 'ru-RU', 1, ${occurredAt.toISOString()}::timestamptz),
        (${athleteC}::uuid, '+79991101105', ${occurredAt.toISOString()}::timestamptz, '1995-01-01', 'ADULT', 'Атлет В', 'ACTIVE', 'ru-RU', 1, ${occurredAt.toISOString()}::timestamptz),
        (${athleteD}::uuid, '+79991101106', ${occurredAt.toISOString()}::timestamptz, '1995-01-01', 'ADULT', 'Атлет Г', 'ACTIVE', 'ru-RU', 1, ${occurredAt.toISOString()}::timestamptz),
        (${athleteE}::uuid, '+79991102570', ${occurredAt.toISOString()}::timestamptz, '1995-01-01', 'ADULT', 'Атлет Д', 'ACTIVE', 'ru-RU', 1, ${occurredAt.toISOString()}::timestamptz),
        (${athleteF}::uuid, '+79991102571', ${occurredAt.toISOString()}::timestamptz, '1995-01-01', 'ADULT', 'Атлет Е', 'ACTIVE', 'ru-RU', 1, ${occurredAt.toISOString()}::timestamptz),
        (${coach}::uuid, '+79991101102', ${occurredAt.toISOString()}::timestamptz, '1988-01-01', 'ADULT', 'Тренер', 'ACTIVE', 'ru-RU', 1, ${occurredAt.toISOString()}::timestamptz),
        (${replacementCoach}::uuid, '+79991101109', ${occurredAt.toISOString()}::timestamptz, '1987-01-01', 'ADULT', 'Резервный тренер', 'ACTIVE', 'ru-RU', 1, ${occurredAt.toISOString()}::timestamptz),
        (${admin}::uuid, '+79991101103', ${occurredAt.toISOString()}::timestamptz, '1988-01-01', 'ADULT', 'Администратор', 'ACTIVE', 'ru-RU', 1, ${occurredAt.toISOString()}::timestamptz),
        (${central}::uuid, '+79991101104', ${occurredAt.toISOString()}::timestamptz, '1988-01-01', 'ADULT', 'Central', 'ACTIVE', 'ru-RU', 1, ${occurredAt.toISOString()}::timestamptz)
    `.execute(database);
    await ensureLocalPilotCommunity(database, {
      venueId: venue,
      venueConfigurationId: testId(1114),
      communityId: community,
      communityConfigurationId: testId(1115),
      membershipId: testId(1116),
      centralGrantId: testId(1117),
      athleteUserId: athleteA,
      centralActorId: central,
      legalName: 'Пилотный зал',
      venueDisplayName: 'Molokh Pilot Gym',
      communityName: 'Пилотное сообщество',
      address: 'Москва',
      cityCode: 'MOSCOW',
      timezone: 'Europe/Moscow',
      contactPayload: { phone: '+79990000501', note: 'Уточните наличие мест' },
      occurredAt: occurredAt.toISOString(),
    });
    await sql`
      insert into identity.account_verifications (
        verification_id, user_id, state, method, moderation_checklist_version,
        is_current, verified_at, decided_by, decision_reason, version
      ) values
        (${testId(30001)}::uuid, ${athleteA}::uuid, 'VERIFIED', 'CENTRAL_MODERATION',
          'identity-mvp-v1', true, ${occurredAt.toISOString()}::timestamptz,
          ${central}::uuid, 'TEST_APPROVED', 1),
        (${testId(30002)}::uuid, ${athleteB}::uuid, 'VERIFIED', 'CENTRAL_MODERATION',
          'identity-mvp-v1', true, ${occurredAt.toISOString()}::timestamptz,
          ${central}::uuid, 'TEST_APPROVED', 1)
    `.execute(database);
    const competition = testId(30000);
    await ensureLocalPilotCompetition(database, {
      competitionId: competition,
      communityId: community,
      centralActorId: central,
      occurredAt: occurredAt.toISOString(),
      memberships: [
        { membershipId: testId(1116), userId: athleteA },
        { membershipId: testId(30003), userId: athleteB },
      ],
    });
    await sql`
      insert into community.role_grants (
        grant_id, user_id, role, scope_type, scope_id, state,
        authorized_by, authorized_at, version
      ) values
        (${testId(1118)}::uuid, ${coach}::uuid, 'COACH', 'COMMUNITY', ${community}::uuid, 'ACTIVE', ${central}::uuid, ${occurredAt.toISOString()}::timestamptz, 1),
        (${testId(1150)}::uuid, ${replacementCoach}::uuid, 'COACH', 'COMMUNITY', ${community}::uuid, 'ACTIVE', ${central}::uuid, ${occurredAt.toISOString()}::timestamptz, 1),
        (${testId(1119)}::uuid, ${admin}::uuid, 'GYM_ADMIN', 'VENUE', ${venue}::uuid, 'ACTIVE', ${central}::uuid, ${occurredAt.toISOString()}::timestamptz, 1)
    `.execute(database);
    await database.transaction().execute(async (transaction) => {
      await sql`
        insert into social.chats (chat_id, scope, state, version, created_at, updated_at)
        values
          (${chat}::uuid, 'PERSONAL_MATCH', 'OPEN', 1, ${occurredAt.toISOString()}::timestamptz, ${occurredAt.toISOString()}::timestamptz),
          (${secondChat}::uuid, 'PERSONAL_MATCH', 'OPEN', 1, ${occurredAt.toISOString()}::timestamptz, ${occurredAt.toISOString()}::timestamptz),
          (${thirdChat}::uuid, 'PERSONAL_MATCH', 'OPEN', 1, ${occurredAt.toISOString()}::timestamptz, ${occurredAt.toISOString()}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into social.chat_participants (chat_id, user_id, joined_at)
        values
          (${chat}::uuid, ${athleteA}::uuid, ${occurredAt.toISOString()}::timestamptz),
          (${chat}::uuid, ${athleteB}::uuid, ${occurredAt.toISOString()}::timestamptz),
          (${secondChat}::uuid, ${athleteC}::uuid, ${occurredAt.toISOString()}::timestamptz),
          (${secondChat}::uuid, ${athleteD}::uuid, ${occurredAt.toISOString()}::timestamptz),
          (${thirdChat}::uuid, ${athleteE}::uuid, ${occurredAt.toISOString()}::timestamptz),
          (${thirdChat}::uuid, ${athleteF}::uuid, ${occurredAt.toISOString()}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into social.matches (
          match_id, pair_low_id, pair_high_id, state, chat_id,
          last_activity_at, version, created_at, updated_at
        ) values
          (
            ${matched}::uuid, least(${athleteA}::uuid, ${athleteB}::uuid),
            greatest(${athleteA}::uuid, ${athleteB}::uuid), 'ACTIVE', ${chat}::uuid,
            ${occurredAt.toISOString()}::timestamptz, 1,
            ${occurredAt.toISOString()}::timestamptz, ${occurredAt.toISOString()}::timestamptz
          ),
          (
            ${secondMatch}::uuid, least(${athleteC}::uuid, ${athleteD}::uuid),
            greatest(${athleteC}::uuid, ${athleteD}::uuid), 'ACTIVE', ${secondChat}::uuid,
            ${occurredAt.toISOString()}::timestamptz, 1,
            ${occurredAt.toISOString()}::timestamptz, ${occurredAt.toISOString()}::timestamptz
          ),
          (
            ${thirdMatch}::uuid, least(${athleteE}::uuid, ${athleteF}::uuid),
            greatest(${athleteE}::uuid, ${athleteF}::uuid), 'ACTIVE', ${thirdChat}::uuid,
            ${occurredAt.toISOString()}::timestamptz, 1,
            ${occurredAt.toISOString()}::timestamptz, ${occurredAt.toISOString()}::timestamptz
          )
      `.execute(transaction);
    });

    const slotPayload: PublishSlotPayload = {
      venueId: venue,
      coachUserId: coach,
      startAt: '2026-09-10T14:00:00.000Z',
      endAt: '2026-09-10T15:00:00.000Z',
      priceAmount: '1500.00',
      priceCurrency: 'rub',
      priceText: 'Оплата напрямую залу',
      cancellationTermsText: 'Уточните условия у зала',
    };
    const slotCommand: CommandEnvelope<PublishSlotPayload> = {
      commandId: testId(1121),
      commandType: 'PUBLISH_SLOT',
      idempotencyKey: 'scheduling-slot-1',
      actor: { type: 'USER', id: admin, roles: ['GYM_ADMIN'], scopeIds: [venue] },
      aggregateType: 'Slot',
      aggregateId: slot,
      expectedVersion: 0,
      correlationId: testId(1122),
      causationId: null,
      requestId: testId(1123),
      source: 'api',
      payloadVersion: 1,
      payload: slotPayload,
    };
    const slotIds = {
      eventId: testId(1124),
      auditId: testId(1125),
      outboxMessageId: testId(1126),
    };
    const publishedSlot = await publishSlot(database, slotCommand, slotIds, () => occurredAt);
    expect(publishedSlot.response).toMatchObject({
      slotId: slot,
      state: 'PUBLISHED',
      priceCurrency: 'RUB',
      commercialVersion: 1,
    });
    const replayedSlot = await publishSlot(database, slotCommand, slotIds, () => occurredAt);
    expect(replayedSlot).toMatchObject({ replayed: true, eventId: slotIds.eventId });
    await expect(
      publishSlot(
        database,
        {
          ...slotCommand,
          commandId: testId(1127),
          idempotencyKey: 'scheduling-slot-overlap',
          aggregateId: testId(1128),
          payload: {
            ...slotPayload,
            startAt: '2026-09-10T14:30:00.000Z',
            endAt: '2026-09-10T15:30:00.000Z',
          },
        },
        {
          eventId: testId(1129),
          auditId: testId(1140),
          outboxMessageId: testId(1141),
        },
        () => occurredAt,
      ),
    ).rejects.toBeInstanceOf(SchedulingConflictError);

    const offeringPayload: PublishGroupOfferingPayload = {
      venueId: venue,
      coachUserId: coach,
      sportCode: 'boxing',
      classLabel: '  Открытая группа по боксу  ',
      startAt: '2026-09-11T16:00:00.000Z',
      endAt: '2026-09-11T17:00:00.000Z',
      coachDisplayName: 'Тренер',
      priceText: 'Уточните стоимость у зала',
      externalInfoUrl: null,
    };
    const offeringCommand: CommandEnvelope<PublishGroupOfferingPayload> = {
      commandId: testId(1131),
      commandType: 'PUBLISH_GROUP_OFFERING',
      idempotencyKey: 'scheduling-group-1',
      actor: { type: 'USER', id: admin, roles: ['GYM_ADMIN'], scopeIds: [venue] },
      aggregateType: 'GroupOffering',
      aggregateId: offering,
      expectedVersion: 0,
      correlationId: testId(1132),
      causationId: null,
      requestId: testId(1133),
      source: 'api',
      payloadVersion: 1,
      payload: offeringPayload,
    };
    const offeringIds = {
      eventId: testId(1134),
      auditId: testId(1135),
      outboxMessageId: testId(1136),
    };
    const publishedOffering = await publishGroupOffering(
      database,
      offeringCommand,
      offeringIds,
      () => occurredAt,
    );
    expect(publishedOffering.response).toMatchObject({
      groupOfferingId: offering,
      classLabel: 'Открытая группа по боксу',
      capacityDisclaimerKey: 'group.capacity.confirm-with-venue',
      contact: { phone: '+79990000501' },
    });
    const initialAdminDashboard = await readVenueAdminDashboard(
      database,
      admin,
      venue,
      occurredAt,
    );
    expect(initialAdminDashboard).toMatchObject({
      venue: {
        venueId: venue,
        displayName: 'Molokh Pilot Gym',
        timezone: 'Europe/Moscow',
        slotPublishHorizonDays: 30,
      },
      slots: [expect.objectContaining({ slotId: slot, state: 'PUBLISHED' })],
      groupOfferings: [
        expect.objectContaining({ groupOfferingId: offering, state: 'PUBLISHED' }),
      ],
      hostConfirmations: [],
      groupInterests: [],
    });
    expect(initialAdminDashboard.coaches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: coach, displayName: 'Тренер' }),
        expect.objectContaining({
          userId: replacementCoach,
          displayName: 'Резервный тренер',
        }),
      ]),
    );
    await expect(
      readVenueAdminDashboard(database, athleteA, venue, occurredAt),
    ).rejects.toBeInstanceOf(SchedulingPermissionDeniedError);

    const editableSlot = testId(2500);
    await publishSlot(
      database,
      {
        ...slotCommand,
        commandId: testId(2501),
        idempotencyKey: 'scheduling-editable-slot',
        aggregateId: editableSlot,
        correlationId: testId(2502),
        requestId: testId(2503),
        payload: {
          ...slotPayload,
          startAt: '2026-09-12T14:00:00.000Z',
          endAt: '2026-09-12T15:00:00.000Z',
        },
      },
      {
        eventId: testId(2504), auditId: testId(2505),
        outboxMessageId: testId(2506),
      },
      () => occurredAt,
    );
    const updatedSlotCommand: CommandEnvelope<UpdateSlotPayload> = {
      commandId: testId(2507),
      commandType: 'UPDATE_SLOT',
      idempotencyKey: 'scheduling-update-slot',
      actor: { type: 'USER', id: admin, roles: ['GYM_ADMIN'], scopeIds: [venue] },
      aggregateType: 'Slot',
      aggregateId: editableSlot,
      expectedVersion: 1,
      correlationId: testId(2508),
      causationId: testId(2504),
      requestId: testId(2509),
      source: 'api',
      payloadVersion: 1,
      payload: {
        slotId: editableSlot,
        coachUserId: replacementCoach,
        startAt: '2026-09-12T15:00:00.000Z',
        endAt: '2026-09-12T16:00:00.000Z',
        priceAmount: '1750',
        priceCurrency: 'rub',
        priceText: null,
        cancellationTermsText: 'Предупредите зал заранее',
      },
    };
    const updatedSlot = await updateSlot(
      database,
      updatedSlotCommand,
      {
        eventId: testId(2510), auditId: testId(2511),
        outboxMessageId: testId(2512),
      },
      () => occurredAt,
    );
    expect(updatedSlot.response).toMatchObject({
      slotId: editableSlot,
      coachUserId: replacementCoach,
      commercialVersion: 2,
      version: 2,
    });
    const withdrawnSlot = await withdrawSlot(
      database,
      {
        commandId: testId(2513),
        commandType: 'WITHDRAW_SLOT',
        idempotencyKey: 'scheduling-withdraw-slot',
        actor: { type: 'USER', id: admin, roles: ['GYM_ADMIN'], scopeIds: [venue] },
        aggregateType: 'Slot',
        aggregateId: editableSlot,
        expectedVersion: 2,
        correlationId: testId(2514),
        causationId: testId(2510),
        requestId: testId(2515),
        source: 'api',
        payloadVersion: 1,
        payload: {
          slotId: editableSlot,
          reasonCode: 'SCHEDULE_CHANGED',
          reasonNote: 'Пилотная проверка снятия',
        },
      } satisfies CommandEnvelope<WithdrawSlotPayload>,
      {
        eventId: testId(2516), auditId: testId(2517),
        outboxMessageId: testId(2518),
      },
      () => occurredAt,
    );
    expect(withdrawnSlot.response).toMatchObject({ state: 'WITHDRAWN', version: 3 });

    const editableOffering = testId(2530);
    await publishGroupOffering(
      database,
      {
        ...offeringCommand,
        commandId: testId(2531),
        idempotencyKey: 'scheduling-editable-offering',
        aggregateId: editableOffering,
        correlationId: testId(2532),
        requestId: testId(2533),
        payload: {
          ...offeringPayload,
          startAt: '2026-09-13T16:00:00.000Z',
          endAt: '2026-09-13T17:00:00.000Z',
        },
      },
      {
        eventId: testId(2534), auditId: testId(2535),
        outboxMessageId: testId(2536),
      },
      () => occurredAt,
    );
    const updatedOffering = await updateGroupOffering(
      database,
      {
        commandId: testId(2537),
        commandType: 'UPDATE_GROUP_OFFERING',
        idempotencyKey: 'scheduling-update-offering',
        actor: { type: 'USER', id: admin, roles: ['GYM_ADMIN'], scopeIds: [venue] },
        aggregateType: 'GroupOffering',
        aggregateId: editableOffering,
        expectedVersion: 1,
        correlationId: testId(2538),
        causationId: testId(2534),
        requestId: testId(2539),
        source: 'api',
        payloadVersion: 1,
        payload: {
          groupOfferingId: editableOffering,
          sportCode: 'boxing',
          classLabel: 'Обновлённая группа',
          startAt: '2026-09-13T17:00:00.000Z',
          endAt: '2026-09-13T18:00:00.000Z',
          coachDisplayName: 'Резервный тренер',
          priceText: null,
          externalInfoUrl: null,
        },
      } satisfies CommandEnvelope<UpdateGroupOfferingPayload>,
      {
        eventId: testId(2540), auditId: testId(2541),
        outboxMessageId: testId(2542),
      },
      () => occurredAt,
    );
    expect(updatedOffering.response).toMatchObject({
      classLabel: 'Обновлённая группа',
      version: 2,
    });
    const withdrawnOffering = await withdrawGroupOffering(
      database,
      {
        commandId: testId(2543),
        commandType: 'WITHDRAW_GROUP_OFFERING',
        idempotencyKey: 'scheduling-withdraw-offering',
        actor: { type: 'USER', id: admin, roles: ['GYM_ADMIN'], scopeIds: [venue] },
        aggregateType: 'GroupOffering',
        aggregateId: editableOffering,
        expectedVersion: 2,
        correlationId: testId(2544),
        causationId: testId(2540),
        requestId: testId(2545),
        source: 'api',
        payloadVersion: 1,
        payload: {
          groupOfferingId: editableOffering,
          reasonCode: 'VENUE_UNAVAILABLE',
          reasonNote: null,
        },
      } satisfies CommandEnvelope<WithdrawGroupOfferingPayload>,
      {
        eventId: testId(2546), auditId: testId(2547),
        outboxMessageId: testId(2548),
      },
      () => occurredAt,
    );
    expect(withdrawnOffering.response).toMatchObject({ state: 'WITHDRAWN', version: 3 });

    const rejectedSlotId = testId(2574);
    const rejectedBookingId = testId(2575);
    await publishSlot(
      database,
      {
        ...slotCommand,
        commandId: testId(2580),
        idempotencyKey: 'scheduling-host-reject-slot',
        aggregateId: rejectedSlotId,
        correlationId: testId(2581),
        requestId: testId(2582),
        payload: {
          ...slotPayload,
          startAt: '2026-09-14T14:00:00.000Z',
          endAt: '2026-09-14T15:00:00.000Z',
        },
      },
      {
        eventId: testId(2583), auditId: testId(2584),
        outboxMessageId: testId(2585),
      },
      () => occurredAt,
    );
    await selectSlot(
      database,
      {
        commandId: testId(2586),
        commandType: 'SELECT_SLOT',
        idempotencyKey: 'scheduling-host-reject-select',
        actor: { type: 'USER', id: athleteE, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking',
        aggregateId: rejectedBookingId,
        expectedVersion: 0,
        correlationId: testId(2587),
        causationId: null,
        requestId: testId(2588),
        source: 'api',
        payloadVersion: 1,
        payload: {
          chatId: thirdChat,
          slotId: rejectedSlotId,
          commercialVersion: 1,
        },
      },
      {
        eventId: testId(2589), auditId: testId(2590),
        outboxMessageId: testId(2591), notificationId: testId(2592),
        notificationOutboxMessageId: testId(2593),
      },
      () => occurredAt,
    );
    await selectSameSlot(
      database,
      {
        commandId: testId(2594),
        commandType: 'SELECT_SAME_SLOT',
        idempotencyKey: 'scheduling-host-reject-select-same',
        actor: { type: 'USER', id: athleteF, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking',
        aggregateId: rejectedBookingId,
        expectedVersion: 1,
        correlationId: testId(2595),
        causationId: testId(2589),
        requestId: testId(2596),
        source: 'api',
        payloadVersion: 1,
        payload: { bookingId: rejectedBookingId, commercialVersion: 1 },
      },
      {
        eventId: testId(2597), auditId: testId(2598),
        outboxMessageId: testId(2599), notificationId: testId(2600),
        notificationOutboxMessageId: testId(2601),
      },
      () => new Date('2026-09-07T09:10:00.000Z'),
    );
    const hostRejected = await rejectBookingHost(
      database,
      {
        commandId: testId(2602),
        commandType: 'REJECT_BOOKING_HOST',
        idempotencyKey: 'scheduling-host-reject',
        actor: { type: 'USER', id: admin, roles: ['GYM_ADMIN'], scopeIds: [venue] },
        aggregateType: 'Booking',
        aggregateId: rejectedBookingId,
        expectedVersion: 2,
        correlationId: testId(2603),
        causationId: testId(2597),
        requestId: testId(2604),
        source: 'api',
        payloadVersion: 1,
        payload: {
          bookingId: rejectedBookingId,
          reasonCode: 'COACH_UNAVAILABLE',
          reasonNote: 'Coach заболел',
        },
      } satisfies CommandEnvelope<RejectBookingHostPayload>,
      {
        eventId: testId(2605), auditId: testId(2606),
        outboxMessageId: testId(2607),
        notificationIds: [testId(2608), testId(2609)],
        notificationOutboxMessageId: testId(2610),
      },
      () => new Date('2026-09-07T09:15:00.000Z'),
    );
    expect(hostRejected.response).toMatchObject({
      booking: { bookingId: rejectedBookingId, state: 'REJECTED', version: 3 },
      reasonCode: 'COACH_UNAVAILABLE',
      reasonNote: 'Coach заболел',
    });
    await expect(
      readHostConfirmationQueue(database, admin, new Date('2026-09-07T09:15:00.000Z')),
    ).resolves.toEqual([]);

    const options = await readTrainingOptions(database, chat, athleteA, occurredAt);
    expect(options.slots).toEqual(expect.arrayContaining([
      expect.objectContaining({ slotId: slot }),
      expect.objectContaining({ slotId: rejectedSlotId }),
    ]));
    expect(options.groupOfferings).toEqual(expect.arrayContaining([
      expect.objectContaining({ groupOfferingId: offering }),
    ]));
    expect(options).toMatchObject({
      activeIntent: { booking: null, groupPlan: null },
      reservationPolicy: 'NO_RESERVATION_BEFORE_HOST_CONFIRMATION',
    });
    await withdrawSlot(
      database,
      {
        commandId: testId(2630),
        commandType: 'WITHDRAW_SLOT',
        idempotencyKey: 'scheduling-withdraw-after-host-reject',
        actor: { type: 'USER', id: admin, roles: ['GYM_ADMIN'], scopeIds: [venue] },
        aggregateType: 'Slot',
        aggregateId: rejectedSlotId,
        expectedVersion: 1,
        correlationId: testId(2631),
        causationId: testId(2605),
        requestId: testId(2632),
        source: 'api',
        payloadVersion: 1,
        payload: {
          slotId: rejectedSlotId,
          reasonCode: 'COACH_UNAVAILABLE',
          reasonNote: 'Снимается отдельным действием после отказа',
        },
      } satisfies CommandEnvelope<WithdrawSlotPayload>,
      {
        eventId: testId(2633), auditId: testId(2634),
        outboxMessageId: testId(2635),
      },
      () => new Date('2026-09-07T09:16:00.000Z'),
    );
    await expect(readTrainingOptions(database, chat, admin, occurredAt)).rejects.toBeInstanceOf(
      SchedulingPermissionDeniedError,
    );
    await expect(
      publishGroupOffering(
        database,
        {
          ...offeringCommand,
          commandId: testId(1142),
          idempotencyKey: 'scheduling-group-unauthorized',
          aggregateId: testId(1143),
          actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
        },
        {
          eventId: testId(1144),
          auditId: testId(1145),
          outboxMessageId: testId(1146),
        },
        () => occurredAt,
      ),
    ).rejects.toBeInstanceOf(SchedulingPermissionDeniedError);

    const bookingId = testId(1170);
    const selectCommand: CommandEnvelope<SelectSlotPayload> = {
      commandId: testId(1171),
      commandType: 'SELECT_SLOT',
      idempotencyKey: 'scheduling-select-slot-1',
      actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Booking',
      aggregateId: bookingId,
      expectedVersion: 0,
      correlationId: testId(1172),
      causationId: null,
      requestId: testId(1173),
      source: 'api',
      payloadVersion: 1,
      payload: { chatId: chat, slotId: slot, commercialVersion: 1 },
    };
    const selected = await selectSlot(
      database,
      selectCommand,
      { eventId: testId(1174), auditId: testId(1175), outboxMessageId: testId(1176), notificationId: testId(1230), notificationOutboxMessageId: testId(1231) },
      () => occurredAt,
    );
    expect(selected.response).toMatchObject({
      bookingId,
      state: 'SELECTING',
      selectedByUserIds: [athleteA],
      commercialTermsSnapshot: null,
      version: 1,
    });
    expect(selected.response.selectionExpiresAt).toBe('2026-09-07T10:00:00.000Z');
    await expect(
      updateSlot(
        database,
        {
          commandId: testId(2620),
          commandType: 'UPDATE_SLOT',
          idempotencyKey: 'scheduling-update-slot-with-active-intent',
          actor: { type: 'USER', id: admin, roles: ['GYM_ADMIN'], scopeIds: [venue] },
          aggregateType: 'Slot',
          aggregateId: slot,
          expectedVersion: 1,
          correlationId: testId(2621),
          causationId: testId(1174),
          requestId: testId(2622),
          source: 'api',
          payloadVersion: 1,
          payload: { slotId: slot, ...slotPayload },
        },
        {
          eventId: testId(2623), auditId: testId(2624),
          outboxMessageId: testId(2625),
        },
        () => occurredAt,
      ),
    ).rejects.toMatchObject<Partial<SchedulingConflictError>>({
      reason: 'SCHEDULE_HAS_ACTIVE_INTENT',
    });
    await expect(
      selectSameSlot(
        database,
        {
          commandId: testId(1177),
          commandType: 'SELECT_SAME_SLOT',
          idempotencyKey: 'scheduling-self-select-same',
          actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
          aggregateType: 'Booking',
          aggregateId: bookingId,
          expectedVersion: 1,
          correlationId: testId(1178),
          causationId: testId(1174),
          requestId: testId(1179),
          source: 'api',
          payloadVersion: 1,
          payload: { bookingId, commercialVersion: 1 },
        },
        { eventId: testId(1180), auditId: testId(1181), outboxMessageId: testId(1182), notificationId: testId(1232), notificationOutboxMessageId: testId(1233) },
        () => new Date('2026-09-07T09:05:00.000Z'),
      ),
    ).rejects.toMatchObject<Partial<SchedulingConflictError>>({
      reason: 'ACTOR_ALREADY_SELECTED',
    });

    const sameSlotCommand: CommandEnvelope<SelectSameSlotPayload> = {
      commandId: testId(1183),
      commandType: 'SELECT_SAME_SLOT',
      idempotencyKey: 'scheduling-select-same-1',
      actor: { type: 'USER', id: athleteB, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Booking',
      aggregateId: bookingId,
      expectedVersion: 1,
      correlationId: testId(1184),
      causationId: testId(1174),
      requestId: testId(1185),
      source: 'api',
      payloadVersion: 1,
      payload: { bookingId, commercialVersion: 1 },
    };
    const mutuallySelected = await selectSameSlot(
      database,
      sameSlotCommand,
      { eventId: testId(1186), auditId: testId(1187), outboxMessageId: testId(1188), notificationId: testId(1234), notificationOutboxMessageId: testId(1235) },
      () => new Date('2026-09-07T09:10:00.000Z'),
    );
    expect(mutuallySelected.response).toMatchObject({
      state: 'HOST_CONFIRMATION_PENDING',
      selectedByUserIds: [athleteA, athleteB],
      commercialTermsSnapshot: {
        slotId: slot,
        priceAmount: '1500.00',
        priceCurrency: 'RUB',
        commercialVersion: 1,
      },
      version: 2,
    });
    expect(mutuallySelected.response.hostConfirmationDeadlineAt).toBe(
      '2026-09-10T06:00:00.000Z',
    );
    await expect(sql`
      update scheduling.bookings
      set commercial_terms_snapshot = jsonb_set(commercial_terms_snapshot, '{priceAmount}', '"999"')
      where booking_id = ${bookingId}::uuid
    `.execute(database)).rejects.toThrow('snapshot is immutable');

    const competingBookingId = testId(1240);
    await selectSlot(
      database,
      {
        commandId: testId(1241),
        commandType: 'SELECT_SLOT',
        idempotencyKey: 'scheduling-select-competing-slot',
        actor: { type: 'USER', id: athleteC, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking',
        aggregateId: competingBookingId,
        expectedVersion: 0,
        correlationId: testId(1242),
        causationId: null,
        requestId: testId(1243),
        source: 'api',
        payloadVersion: 1,
        payload: { chatId: secondChat, slotId: slot, commercialVersion: 1 },
      },
      {
        eventId: testId(1244),
        auditId: testId(1245),
        outboxMessageId: testId(1246),
        notificationId: testId(1247),
        notificationOutboxMessageId: testId(1248),
      },
      () => new Date('2026-09-07T09:11:00.000Z'),
    );
    await selectSameSlot(
      database,
      {
        commandId: testId(1249),
        commandType: 'SELECT_SAME_SLOT',
        idempotencyKey: 'scheduling-select-same-competing-slot',
        actor: { type: 'USER', id: athleteD, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking',
        aggregateId: competingBookingId,
        expectedVersion: 1,
        correlationId: testId(1250),
        causationId: testId(1244),
        requestId: testId(1251),
        source: 'api',
        payloadVersion: 1,
        payload: { bookingId: competingBookingId, commercialVersion: 1 },
      },
      {
        eventId: testId(1252),
        auditId: testId(1253),
        outboxMessageId: testId(1254),
        notificationId: testId(1255),
        notificationOutboxMessageId: testId(1256),
      },
      () => new Date('2026-09-07T09:12:00.000Z'),
    );
    await expect(
      readHostConfirmationQueue(database, coach, new Date('2026-09-07T09:12:00.000Z')),
    ).resolves.toHaveLength(2);

    const hostCommand = (
      confirmedBookingId: string,
      offset: number,
    ): CommandEnvelope<ConfirmBookingHostPayload> => ({
      commandId: testId(offset),
      commandType: 'CONFIRM_BOOKING_HOST',
      idempotencyKey: `confirm-booking-host-${confirmedBookingId}`,
      actor: { type: 'USER', id: coach, roles: ['COACH'], scopeIds: [community] },
      aggregateType: 'Booking',
      aggregateId: confirmedBookingId,
      expectedVersion: 2,
      correlationId: testId(offset + 1),
      causationId: null,
      requestId: testId(offset + 2),
      source: 'api',
      payloadVersion: 1,
      payload: { bookingId: confirmedBookingId },
    });
    const hostEffects = (offset: number) => ({
      eventId: testId(offset),
      auditId: testId(offset + 1),
      outboxMessageId: testId(offset + 2),
      slotEventId: testId(offset + 3),
      sessionEventId: testId(offset + 4),
      sessionTimerOutboxMessageId: testId(offset + 9),
      sessionId: testId(offset + 5),
      notificationIds: [testId(offset + 6), testId(offset + 7)] as const,
      notificationOutboxMessageId: testId(offset + 8),
    });
    const confirmationResults = await Promise.all([
      confirmBookingHost(
        database,
        hostCommand(bookingId, 1260),
        hostEffects(1270),
        () => new Date('2026-09-07T09:20:00.000Z'),
      ),
      confirmBookingHost(
        database,
        hostCommand(competingBookingId, 1280),
        hostEffects(1290),
        () => new Date('2026-09-07T09:20:00.000Z'),
      ),
    ]);
    expect(confirmationResults.map((result) => result.response.outcome).sort()).toEqual([
      'CONFIRMED',
      'REJECTED_SLOT_UNAVAILABLE',
    ]);
    const confirmedResult = confirmationResults.find(
      (result) => result.response.outcome === 'CONFIRMED',
    );
    expect(confirmedResult?.response).toMatchObject({
      booking: { state: 'CONFIRMED_PAIR', hostConfirmedAt: '2026-09-07T09:20:00.000Z' },
      session: { state: 'SCHEDULED', coachUserId: coach },
    });
    const sessionRows = await sql<{ readonly count: string }>`
      select count(*)::text as count from scheduling.sessions
    `.execute(database);
    expect(sessionRows.rows[0]?.count).toBe('1');
    const claimedSlot = await sql<{ readonly state: string; readonly booking_id: string }>`
      select state, booking_id from scheduling.slots where slot_id = ${slot}::uuid
    `.execute(database);
    expect(claimedSlot.rows[0]).toEqual({
      state: 'BOOKED',
      booking_id: confirmedResult?.response.booking.bookingId,
    });
    await expect(
      readHostConfirmationQueue(database, coach, new Date('2026-09-07T09:20:00.000Z')),
    ).resolves.toEqual([]);
    const activeConfirmedBooking = await readTrainingOptions(
      database,
      chat,
      athleteA,
      new Date('2026-09-07T09:20:00.000Z'),
    );
    if (confirmedResult?.response.booking.bookingId === bookingId) {
      expect(activeConfirmedBooking.activeIntent.booking).toMatchObject({
        bookingId,
        state: 'CONFIRMED_PAIR',
        sessionId: confirmedResult.response.session?.sessionId,
      });
    } else {
      expect(activeConfirmedBooking.activeIntent.booking).toBeNull();
    }

    const confirmedSession = confirmedResult?.response.session;
    if (!confirmedSession) throw new Error('Expected the winning Booking to create a Session');
    const [sessionAthleteA, sessionAthleteB] = confirmedSession.athleteUserIds;
    await expect(readSessionTimerSnapshot(database, confirmedSession.sessionId)).resolves.toEqual({
      state: 'SCHEDULED',
      version: 1,
    });
    await expect(readMySessions(database, sessionAthleteA)).resolves.toMatchObject({
      sessions: [expect.objectContaining({ state: 'SCHEDULED', attendance: [] })],
      completedTrainingCount: 0,
    });

    await expect(readMySessions(database, admin)).resolves.toMatchObject({
      sessions: [expect.objectContaining({
        sessionId: confirmedSession.sessionId,
        viewerCanAdminister: true,
        replacementCoachOptions: [{ userId: replacementCoach, displayName: 'Резервный тренер' }],
      })],
    });
    const replacementCommand: CommandEnvelope<ReplaceSessionCoachPayload> = {
      commandId: testId(1350),
      commandType: 'REPLACE_SESSION_COACH',
      idempotencyKey: `replace-session-coach-${confirmedSession.sessionId}`,
      actor: { type: 'USER', id: admin, roles: ['GYM_ADMIN'], scopeIds: [venue] },
      aggregateType: 'Session',
      aggregateId: confirmedSession.sessionId,
      expectedVersion: 1,
      correlationId: testId(1351),
      causationId: null,
      requestId: testId(1352),
      source: 'api',
      payloadVersion: 1,
      payload: { sessionId: confirmedSession.sessionId, replacementCoachUserId: replacementCoach },
    };
    const replaced = await replaceSessionCoach(
      database,
      replacementCommand,
      {
        eventId: testId(1353), auditId: testId(1354), outboxMessageId: testId(1355),
        replacementId: testId(1356), assignmentRevisionId: testId(1357),
        bookingEventId: testId(1358), slotEventId: testId(1359),
        notificationOutboxMessageId: testId(1360),
        notificationIds: [testId(1361), testId(1362)],
      },
      () => new Date('2026-09-07T09:30:00.000Z'),
    );
    expect(replaced.response).toMatchObject({
      coachUserId: replacementCoach,
      coachDisplayName: 'Резервный тренер',
      latestCoachReplacementAt: '2026-09-07T09:30:00.000Z',
      viewerCanAdminister: true,
      version: 2,
    });
    await expect(readSession(database, confirmedSession.sessionId, sessionAthleteA))
      .resolves.toMatchObject({ viewerCanRequestNoFaultReschedule: true });
    const replacementHistory = await sql<{ readonly count: string }>`
      select count(*)::text as count
      from scheduling.session_coach_assignment_revisions
      where session_id = ${confirmedSession.sessionId}::uuid
    `.execute(database);
    expect(replacementHistory.rows[0]?.count).toBe('1');

    const openWindowCommand: CommandEnvelope<OpenSessionWindowPayload> = {
      commandId: testId(1300),
      commandType: 'OPEN_SESSION_WINDOW',
      idempotencyKey: `open-session-${confirmedSession.sessionId}-v1`,
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'Session',
      aggregateId: confirmedSession.sessionId,
      expectedVersion: 2,
      correlationId: testId(1301),
      causationId: null,
      requestId: testId(1302),
      source: 'scheduler',
      payloadVersion: 1,
      payload: { sessionId: confirmedSession.sessionId },
    };
    const opened = await openSessionWindow(
      database,
      openWindowCommand,
      { eventId: testId(1303), auditId: testId(1304), outboxMessageId: testId(1305) },
      () => new Date('2026-09-10T14:00:00.000Z'),
    );
    expect(opened.response).toMatchObject({
      state: 'READY_FOR_COACH',
      windowOpenedAt: '2026-09-10T14:00:00.000Z',
      actualStartAt: null,
      attendance: [],
      version: 3,
    });

    const attendanceCommand = (
      athleteUserId: string,
      status: 'PRESENT' | 'LATE',
      expectedVersion: number,
      offset: number,
    ): CommandEnvelope<RecordAttendancePayload> => ({
      commandId: testId(offset),
      commandType: 'RECORD_ATTENDANCE',
      idempotencyKey: `session-attendance-${athleteUserId}`,
      actor: { type: 'USER', id: replacementCoach, roles: ['COACH'], scopeIds: [community] },
      aggregateType: 'Session',
      aggregateId: confirmedSession.sessionId,
      expectedVersion,
      correlationId: testId(offset + 1),
      causationId: null,
      requestId: testId(offset + 2),
      source: 'api',
      payloadVersion: 1,
      payload: { sessionId: confirmedSession.sessionId, athleteUserId, status, comment: null },
    });
    await expect(
      recordSessionAttendance(
        database,
        {
          ...attendanceCommand(sessionAthleteA, 'PRESENT', 3, 1310),
          actor: { type: 'USER', id: sessionAthleteA, roles: ['ATHLETE'], scopeIds: [] },
          idempotencyKey: 'athlete-cannot-record-attendance',
        },
        {
          eventId: testId(1313), auditId: testId(1314), outboxMessageId: testId(1315),
          attendanceId: testId(1316), attendanceEventId: testId(1317),
        },
        () => new Date('2026-09-10T14:01:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(SchedulingPermissionDeniedError);
    const firstAttendance = await recordSessionAttendance(
      database,
      attendanceCommand(sessionAthleteA, 'PRESENT', 3, 1320),
      {
        eventId: testId(1323), auditId: testId(1324), outboxMessageId: testId(1325),
        attendanceId: testId(1326), attendanceEventId: testId(1327),
      },
      () => new Date('2026-09-10T14:01:00.000Z'),
    );
    expect(firstAttendance.response).toMatchObject({
      state: 'IN_PROGRESS',
      actualStartAt: '2026-09-10T14:01:00.000Z',
      attendance: [{ athleteUserId: sessionAthleteA, status: 'PRESENT' }],
      version: 4,
    });
    const secondAttendance = await recordSessionAttendance(
      database,
      attendanceCommand(sessionAthleteB, 'LATE', 4, 1330),
      {
        eventId: testId(1333), auditId: testId(1334), outboxMessageId: testId(1335),
        attendanceId: testId(1336), attendanceEventId: testId(1337),
      },
      () => new Date('2026-09-10T14:05:00.000Z'),
    );
    expect(secondAttendance.response.attendance).toHaveLength(2);

    const endCommand: CommandEnvelope<EndSessionPayload> = {
      commandId: testId(1340),
      commandType: 'END_SESSION',
      idempotencyKey: `end-session-${confirmedSession.sessionId}-v4`,
      actor: { type: 'USER', id: replacementCoach, roles: ['COACH'], scopeIds: [community] },
      aggregateType: 'Session',
      aggregateId: confirmedSession.sessionId,
      expectedVersion: 5,
      correlationId: testId(1341),
      causationId: null,
      requestId: testId(1342),
      source: 'api',
      payloadVersion: 1,
      payload: { sessionId: confirmedSession.sessionId },
    };
    const ended = await endSession(
      database,
      endCommand,
      {
        eventId: testId(1343), auditId: testId(1344), outboxMessageId: testId(1345),
        bookingEventId: testId(1346), slotEventId: testId(1347),
      },
      () => new Date('2026-09-10T14:50:00.000Z'),
    );
    expect(ended.response).toMatchObject({
      state: 'ENDED',
      actualEndAt: '2026-09-10T14:50:00.000Z',
      version: 6,
    });
    await expect(readMySessions(database, sessionAthleteA)).resolves.toMatchObject({
      completedTrainingCount: 1,
    });
    await expect(readMySessions(database, sessionAthleteB)).resolves.toMatchObject({
      completedTrainingCount: 1,
    });
    await expect(readSession(database, confirmedSession.sessionId, replacementCoach)).resolves.toMatchObject({
      state: 'ENDED',
      viewerCanManage: true,
    });

    const createConfirmedSession = async (
      base: number,
      startAt: string,
      endAt: string,
      suffix: string,
    ) => {
      const createdSlotId = testId(base);
      const createdBookingId = testId(base + 1);
      await publishSlot(
        database,
        {
          ...slotCommand,
          commandId: testId(base + 2),
          idempotencyKey: `scheduling-slot-${suffix}`,
          aggregateId: createdSlotId,
          correlationId: testId(base + 3),
          requestId: testId(base + 4),
          payload: { ...slotPayload, startAt, endAt },
        },
        {
          eventId: testId(base + 5), auditId: testId(base + 6),
          outboxMessageId: testId(base + 7),
        },
        () => occurredAt,
      );
      await selectSlot(
        database,
        {
          ...selectCommand,
          commandId: testId(base + 8),
          idempotencyKey: `scheduling-select-${suffix}`,
          aggregateId: createdBookingId,
          correlationId: testId(base + 9),
          requestId: testId(base + 10),
          payload: { chatId: chat, slotId: createdSlotId, commercialVersion: 1 },
        },
        {
          eventId: testId(base + 11), auditId: testId(base + 12),
          outboxMessageId: testId(base + 13), notificationId: testId(base + 14),
          notificationOutboxMessageId: testId(base + 15),
        },
        () => occurredAt,
      );
      await selectSameSlot(
        database,
        {
          ...sameSlotCommand,
          commandId: testId(base + 16),
          idempotencyKey: `scheduling-select-same-${suffix}`,
          aggregateId: createdBookingId,
          expectedVersion: 1,
          correlationId: testId(base + 17),
          requestId: testId(base + 18),
          payload: { bookingId: createdBookingId, commercialVersion: 1 },
        },
        {
          eventId: testId(base + 19), auditId: testId(base + 20),
          outboxMessageId: testId(base + 21), notificationId: testId(base + 22),
          notificationOutboxMessageId: testId(base + 23),
        },
        () => new Date('2026-09-07T09:10:00.000Z'),
      );
      const confirmed = await confirmBookingHost(
        database,
        {
          ...hostCommand(createdBookingId, base + 24),
          idempotencyKey: `confirm-booking-${suffix}`,
          commandId: testId(base + 24), correlationId: testId(base + 25),
          requestId: testId(base + 26),
        },
        {
          eventId: testId(base + 27), auditId: testId(base + 28),
          outboxMessageId: testId(base + 29), slotEventId: testId(base + 30),
          sessionEventId: testId(base + 31), sessionTimerOutboxMessageId: testId(base + 32),
          sessionId: testId(base + 33),
          notificationIds: [testId(base + 34), testId(base + 35)],
          notificationOutboxMessageId: testId(base + 36),
        },
        () => new Date('2026-09-07T09:20:00.000Z'),
      );
      if (!confirmed.response.session) throw new Error('Expected a confirmed Session');
      return confirmed.response.session;
    };

    const noShowSession = await createConfirmedSession(
      2700, '2026-09-15T14:00:00.000Z', '2026-09-15T15:00:00.000Z', 'ordinary-no-show',
    );
    const [presentAthleteId, absentAthleteId] = noShowSession.athleteUserIds;
    const beforeNoShowPresent = await readMySessions(database, presentAthleteId);
    const beforeNoShowAbsent = await readMySessions(database, absentAthleteId);
    await openSessionWindow(
      database,
      {
        commandId: testId(2740), commandType: 'OPEN_SESSION_WINDOW',
        idempotencyKey: `open-no-show-session-${noShowSession.sessionId}`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'Session', aggregateId: noShowSession.sessionId, expectedVersion: 1,
        correlationId: testId(2741), causationId: null, requestId: testId(2742),
        source: 'scheduler', payloadVersion: 1,
        payload: { sessionId: noShowSession.sessionId },
      } satisfies CommandEnvelope<OpenSessionWindowPayload>,
      { eventId: testId(2743), auditId: testId(2744), outboxMessageId: testId(2745) },
      () => new Date('2026-09-15T14:00:00.000Z'),
    );
    const ordinaryAttendance = async (
      athleteUserId: string,
      status: 'PRESENT' | 'NO_SHOW',
      expectedVersion: number,
      base: number,
      occurredAt: string,
    ) => recordSessionAttendance(
      database,
      {
        commandId: testId(base), commandType: 'RECORD_ATTENDANCE',
        idempotencyKey: `ordinary-no-show-${athleteUserId}`,
        actor: { type: 'USER', id: coach, roles: ['COACH'], scopeIds: [community] },
        aggregateType: 'Session', aggregateId: noShowSession.sessionId, expectedVersion,
        correlationId: testId(base + 1), causationId: testId(2743), requestId: testId(base + 2),
        source: 'api', payloadVersion: 1,
        payload: { sessionId: noShowSession.sessionId, athleteUserId, status, comment: null },
      } satisfies CommandEnvelope<RecordAttendancePayload>,
      {
        eventId: testId(base + 3), auditId: testId(base + 4), outboxMessageId: testId(base + 5),
        attendanceId: testId(base + 6), attendanceEventId: testId(base + 7),
      },
      () => new Date(occurredAt),
    );
    await ordinaryAttendance(
      presentAthleteId, 'PRESENT', 2, 2750, '2026-09-15T14:01:00.000Z',
    );
    const absentAttendance = await ordinaryAttendance(
      absentAthleteId, 'NO_SHOW', 3, 2760, '2026-09-15T14:15:00.000Z',
    );
    expect(absentAttendance.response.attendance).toEqual(expect.arrayContaining([
      expect.objectContaining({ athleteUserId: presentAthleteId, status: 'PRESENT' }),
      expect.objectContaining({ athleteUserId: absentAthleteId, status: 'NO_SHOW' }),
    ]));
    await endSession(
      database,
      {
        commandId: testId(2770), commandType: 'END_SESSION',
        idempotencyKey: `end-no-show-session-${noShowSession.sessionId}`,
        actor: { type: 'USER', id: coach, roles: ['COACH'], scopeIds: [community] },
        aggregateType: 'Session', aggregateId: noShowSession.sessionId, expectedVersion: 4,
        correlationId: testId(2771), causationId: testId(2763), requestId: testId(2772),
        source: 'api', payloadVersion: 1,
        payload: { sessionId: noShowSession.sessionId },
      } satisfies CommandEnvelope<EndSessionPayload>,
      {
        eventId: testId(2773), auditId: testId(2774), outboxMessageId: testId(2775),
        bookingEventId: testId(2776), slotEventId: testId(2777),
      },
      () => new Date('2026-09-15T14:20:00.000Z'),
    );
    await expect(readMySessions(database, presentAthleteId)).resolves.toMatchObject({
      completedTrainingCount: beforeNoShowPresent.completedTrainingCount + 1,
    });
    await expect(readMySessions(database, absentAthleteId)).resolves.toMatchObject({
      completedTrainingCount: beforeNoShowAbsent.completedTrainingCount,
    });
    const noShowCompetitionEffects = await sql<{
      readonly results: string;
      readonly cooldowns: string;
    }>`
      select
        (select count(*)::text from competition.results) as results,
        (select count(*)::text from competition.pair_cooldowns) as cooldowns
    `.execute(database);
    expect(noShowCompetitionEffects.rows[0]).toEqual({ results: '0', cooldowns: '0' });

    const rejectableSession = await createConfirmedSession(
      1400, '2026-09-12T14:00:00.000Z', '2026-09-12T15:00:00.000Z', 'reject-replacement',
    );
    const rejectableReplaced = await replaceSessionCoach(
      database,
      {
        commandId: testId(1437), commandType: 'REPLACE_SESSION_COACH',
        idempotencyKey: 'replace-before-athlete-rejection',
        actor: { type: 'USER', id: admin, roles: ['GYM_ADMIN'], scopeIds: [venue] },
        aggregateType: 'Session', aggregateId: rejectableSession.sessionId,
        expectedVersion: 1, correlationId: testId(1438), causationId: null,
        requestId: testId(1439), source: 'api', payloadVersion: 1,
        payload: { sessionId: rejectableSession.sessionId, replacementCoachUserId: replacementCoach },
      } satisfies CommandEnvelope<ReplaceSessionCoachPayload>,
      {
        eventId: testId(1440), auditId: testId(1441), outboxMessageId: testId(1442),
        replacementId: testId(1443), assignmentRevisionId: testId(1444),
        bookingEventId: testId(1445), slotEventId: testId(1446),
        notificationOutboxMessageId: testId(1447),
        notificationIds: [testId(1448), testId(1449)],
      },
      () => new Date('2026-09-07T09:30:00.000Z'),
    );
    const rejectedReplacement = await cancelSessionAfterCoachReplacement(
      database,
      {
        commandId: testId(1500), commandType: 'REQUEST_RESCHEDULE_AFTER_COACH_REPLACEMENT',
        idempotencyKey: 'athlete-rejects-coach-replacement',
        actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Session', aggregateId: rejectableSession.sessionId,
        expectedVersion: rejectableReplaced.response.version,
        correlationId: testId(1501), causationId: testId(1440), requestId: testId(1502),
        source: 'api', payloadVersion: 1,
        payload: { sessionId: rejectableSession.sessionId },
      } satisfies CommandEnvelope<CancelAfterCoachReplacementPayload>,
      {
        eventId: testId(1503), auditId: testId(1504), outboxMessageId: testId(1505),
        bookingEventId: testId(1506), slotEventId: testId(1507),
        notificationOutboxMessageId: testId(1508),
        notificationIds: [testId(1509), testId(1510)],
      },
      () => new Date('2026-09-07T09:40:00.000Z'),
    );
    expect(rejectedReplacement.response).toMatchObject({
      state: 'CANCELLED', cancellationReasonCode: 'COACH_REPLACEMENT_REJECTED',
      viewerCanRequestNoFaultReschedule: false,
    });
    const rejectedResources = await sql<{
      readonly booking_state: string; readonly slot_state: string;
    }>`
      select booking.state as booking_state, slot.state as slot_state
      from scheduling.bookings as booking
      join scheduling.slots as slot on slot.slot_id = booking.slot_id
      where booking.booking_id = ${rejectableSession.bookingId}::uuid
    `.execute(database);
    expect(rejectedResources.rows[0]).toEqual({
      booking_state: 'CANCELLED', slot_state: 'CANCELLED',
    });

    const failedSession = await createConfirmedSession(
      1520, '2026-09-13T14:00:00.000Z', '2026-09-13T15:00:00.000Z', 'external-failure',
    );
    const failed = await failSessionExternal(
      database,
      {
        commandId: testId(1557), commandType: 'FAIL_SESSION_EXTERNAL',
        idempotencyKey: 'venue-fails-session',
        actor: { type: 'USER', id: admin, roles: ['GYM_ADMIN'], scopeIds: [venue] },
        aggregateType: 'Session', aggregateId: failedSession.sessionId,
        expectedVersion: 1, correlationId: testId(1558), causationId: null,
        requestId: testId(1559), source: 'api', payloadVersion: 1,
        payload: { sessionId: failedSession.sessionId, reasonCode: 'VENUE_UNAVAILABLE' },
      } satisfies CommandEnvelope<FailSessionExternalPayload>,
      {
        eventId: testId(1560), auditId: testId(1561), outboxMessageId: testId(1562),
        bookingEventId: testId(1563), slotEventId: testId(1564),
        notificationOutboxMessageId: testId(1565),
        notificationIds: [testId(1566), testId(1567)],
      },
      () => new Date('2026-09-07T09:40:00.000Z'),
    );
    expect(failed.response).toMatchObject({
      state: 'CANCELLED', cancellationReasonCode: 'VENUE_UNAVAILABLE',
    });

    const groupPlanId = testId(1190);
    const proposed = await proposeGroupPlan(
      database,
      {
        commandId: testId(1191),
        commandType: 'PROPOSE_GROUP_PLAN',
        idempotencyKey: 'scheduling-group-plan-1',
        actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'GroupPlan',
        aggregateId: groupPlanId,
        expectedVersion: 0,
        correlationId: testId(1192),
        causationId: null,
        requestId: testId(1193),
        source: 'api',
        payloadVersion: 1,
        payload: { chatId: chat, groupOfferingId: offering, offeringVersion: 1 },
      } satisfies CommandEnvelope<ProposeGroupPlanPayload>,
      { eventId: testId(1194), auditId: testId(1195), outboxMessageId: testId(1196), notificationId: testId(1236), notificationOutboxMessageId: testId(1237) },
      () => occurredAt,
    );
    expect(proposed.response).toMatchObject({
      groupPlanId,
      state: 'PROPOSED',
      proposedByUserId: athleteA,
      confirmedByPeer: false,
      offeringSnapshot: { contact: { phone: '+79990000501' } },
    });
    const confirmedPlan = await confirmGroupPlan(
      database,
      {
        commandId: testId(1197),
        commandType: 'CONFIRM_GROUP_PLAN',
        idempotencyKey: 'scheduling-group-plan-confirm-1',
        actor: { type: 'USER', id: athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'GroupPlan',
        aggregateId: groupPlanId,
        expectedVersion: 1,
        correlationId: testId(1198),
        causationId: testId(1194),
        requestId: testId(1199),
        source: 'api',
        payloadVersion: 1,
        payload: { groupPlanId },
      } satisfies CommandEnvelope<ConfirmGroupPlanPayload>,
      { eventId: testId(1200), auditId: testId(1201), outboxMessageId: testId(1202), notificationId: testId(1238), notificationOutboxMessageId: testId(1239) },
      () => new Date('2026-09-07T09:15:00.000Z'),
    );
    expect(confirmedPlan.response).toMatchObject({
      state: 'NOTIFIED',
      confirmedByPeer: true,
      version: 2,
    });
    const dashboardWithGroupInterest = await readVenueAdminDashboard(
      database,
      admin,
      venue,
      new Date('2026-09-07T09:20:00.000Z'),
    );
    expect(dashboardWithGroupInterest.groupInterests).toEqual([
      expect.objectContaining({
        groupPlanId,
        groupOfferingId: offering,
        athleteDisplayNames: expect.arrayContaining(['Атлет А', 'Атлет Б']),
        classLabel: 'Открытая группа по боксу',
        startAt: '2026-09-11T16:00:00.000Z',
        state: 'NOTIFIED',
        version: 2,
      }),
    ]);
    const notificationOutbox = await sql<{
      readonly payload: {
        readonly notifications: readonly [{ readonly recipientUserId: string; readonly renderKey: string }];
      };
    }>`
      select payload from platform.outbox_messages
      where topic = 'notification.in_app.v1'
      order by created_at, message_id
    `.execute(database);
    expect(notificationOutbox.rows.map((row) => row.payload.notifications[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recipientUserId: athleteB, renderKey: 'booking.slot-selected-by-partner' }),
        expect.objectContaining({ recipientUserId: coach, renderKey: 'booking.host-confirmation-required' }),
        expect.objectContaining({ recipientUserId: athleteB, renderKey: 'group-plan.proposed-by-partner' }),
        expect.objectContaining({ recipientUserId: admin, renderKey: 'group-plan.venue-interest-notice' }),
      ]),
    );
    const activePlans = await readTrainingOptions(
      database,
      chat,
      athleteA,
      new Date('2026-09-07T09:20:00.000Z'),
    );
    expect(activePlans.activeIntent.groupPlan).toMatchObject({
      groupPlanId,
      state: 'NOTIFIED',
    });
    expect(activePlans.activeIntent.booking).toBeNull();

    const expirePlanCommand: CommandEnvelope<ExpireGroupPlanPayload> = {
      commandId: testId(1220),
      commandType: 'EXPIRE_GROUP_PLAN',
      idempotencyKey: `groupplan:${groupPlanId}:expire_group_plan:v2`,
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'GroupPlan',
      aggregateId: groupPlanId,
      expectedVersion: 2,
      correlationId: testId(1221),
      causationId: testId(1200),
      requestId: testId(1222),
      source: 'scheduler',
      payloadVersion: 1,
      payload: { groupPlanId },
    };
    await expireGroupPlan(
      database,
      expirePlanCommand,
      { eventId: testId(1223), auditId: testId(1224), outboxMessageId: testId(1225) },
      () => new Date(offeringPayload.startAt),
    );
    await expect(readGroupPlanTimerSnapshot(database, groupPlanId)).resolves.toEqual({
      state: 'EXPIRED',
      version: 3,
    });

    const expireOfferingCommand: CommandEnvelope<ExpireGroupOfferingPayload> = {
      commandId: testId(1160),
      commandType: 'EXPIRE_GROUP_OFFERING',
      idempotencyKey: `groupoffering:${offering}:expire:v1`,
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'GroupOffering',
      aggregateId: offering,
      expectedVersion: 1,
      correlationId: testId(1161),
      causationId: offeringIds.eventId,
      requestId: testId(1162),
      source: 'scheduler',
      payloadVersion: 1,
      payload: { groupOfferingId: offering },
    };
    await expireGroupOffering(
      database,
      expireOfferingCommand,
      { eventId: testId(1163), auditId: testId(1164), outboxMessageId: testId(1165) },
      () => new Date(offeringPayload.startAt),
    );
    await expect(readGroupOfferingTimerSnapshot(database, offering)).resolves.toEqual({
      state: 'EXPIRED',
      version: 2,
    });
    const finalOptions = await readTrainingOptions(
      database,
      chat,
      athleteA,
      new Date('2026-09-07T10:00:00.000Z'),
    );
    expect(finalOptions.slots).toEqual([]);
    expect(finalOptions.groupOfferings).toEqual([]);
    expect(finalOptions.activeIntent.groupPlan).toBeNull();
    expect(finalOptions.reservationPolicy).toBe('NO_RESERVATION_BEFORE_HOST_CONFIRMATION');

    const conversionOfferingId = testId(30010);
    await publishGroupOffering(
      database,
      {
        commandId: testId(30011), commandType: 'PUBLISH_GROUP_OFFERING',
        idempotencyKey: 'group-official-offering',
        actor: { type: 'USER', id: admin, roles: ['GYM_ADMIN'], scopeIds: [venue] },
        aggregateType: 'GroupOffering', aggregateId: conversionOfferingId,
        expectedVersion: 0, correlationId: testId(30012), causationId: null,
        requestId: testId(30013), source: 'api', payloadVersion: 1,
        payload: {
          venueId: venue, coachUserId: coach, sportCode: 'BOXING',
          classLabel: 'Группа для Official', startAt: '2026-09-12T16:00:00.000Z',
          endAt: '2026-09-12T17:00:00.000Z', coachDisplayName: 'Тренер',
          priceText: 'Оплата залу', externalInfoUrl: null,
        },
      } satisfies CommandEnvelope<PublishGroupOfferingPayload>,
      { eventId: testId(30014), auditId: testId(30015), outboxMessageId: testId(30016) },
      () => occurredAt,
    );
    const conversionPlanId = testId(30017);
    await proposeGroupPlan(
      database,
      {
        commandId: testId(30018), commandType: 'PROPOSE_GROUP_PLAN',
        idempotencyKey: 'group-official-plan',
        actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'GroupPlan', aggregateId: conversionPlanId, expectedVersion: 0,
        correlationId: testId(30019), causationId: null, requestId: testId(30020),
        source: 'api', payloadVersion: 1,
        payload: { chatId: chat, groupOfferingId: conversionOfferingId, offeringVersion: 1 },
      } satisfies CommandEnvelope<ProposeGroupPlanPayload>,
      { eventId: testId(30021), auditId: testId(30022), outboxMessageId: testId(30023),
        notificationId: testId(30024), notificationOutboxMessageId: testId(30025) },
      () => occurredAt,
    );
    await confirmGroupPlan(
      database,
      {
        commandId: testId(30026), commandType: 'CONFIRM_GROUP_PLAN',
        idempotencyKey: 'group-official-plan-confirm',
        actor: { type: 'USER', id: athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'GroupPlan', aggregateId: conversionPlanId, expectedVersion: 1,
        correlationId: testId(30027), causationId: testId(30021), requestId: testId(30028),
        source: 'api', payloadVersion: 1, payload: { groupPlanId: conversionPlanId },
      } satisfies CommandEnvelope<ConfirmGroupPlanPayload>,
      { eventId: testId(30029), auditId: testId(30030), outboxMessageId: testId(30031),
        notificationId: testId(30032), notificationOutboxMessageId: testId(30033) },
      () => new Date('2026-09-07T09:10:00.000Z'),
    );

    const conversionIds = (
      base: number,
      conversionId: string,
    ): GroupPlanOfficialConversionEffectIds => ({
      eventId: testId(base), auditId: testId(base + 1), outboxMessageId: testId(base + 2),
      conversionId, conversionEventId: testId(base + 3), confirmationId: testId(base + 4),
      timerOutboxMessageId: testId(base + 5), groupPlanEventId: testId(base + 6),
      challengeId: testId(base + 7), challengeEventId: testId(base + 8),
      serviceChatId: testId(base + 9), serviceChatEventId: testId(base + 10),
      rulesetSnapshotId: testId(base + 11),
      acknowledgmentIds: [testId(base + 12), testId(base + 13)],
      obligationIds: [testId(base + 14), testId(base + 15)],
      slotId: testId(base + 16), slotEventId: testId(base + 17),
      bookingId: testId(base + 18), bookingEventId: testId(base + 19),
      sessionId: testId(base + 20), sessionEventId: testId(base + 21),
      sessionTimerOutboxMessageId: testId(base + 22),
      groupPlanTimerOutboxMessageId: testId(base + 23),
      notificationOutboxMessageId: testId(base + 24),
      notificationIds: [testId(base + 25), testId(base + 26), testId(base + 27)],
    });
    const declinedConversionId = testId(30100);
    const declinedRequest = await requestGroupPlanOfficialConversion(
      database,
      {
        commandId: testId(30101), commandType: 'REQUEST_GROUP_PLAN_OFFICIAL_CONVERSION',
        idempotencyKey: 'group-official-request-declined',
        actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'GroupPlan', aggregateId: conversionPlanId, expectedVersion: 2,
        correlationId: testId(30102), causationId: testId(30029), requestId: testId(30103),
        source: 'api', payloadVersion: 1,
        payload: { groupPlanId: conversionPlanId, explicitRulesetAcknowledged: true },
      } satisfies CommandEnvelope<RequestGroupPlanOfficialConversionPayload>,
      conversionIds(30110, declinedConversionId),
      () => new Date('2026-09-07T09:20:00.000Z'),
    );
    expect(declinedRequest.response).toMatchObject({
      state: 'PENDING_CONFIRMATION', confirmationDeadlineAt: '2026-09-10T09:20:00.000Z',
      challengeId: null, bookingId: null, sessionId: null,
      confirmations: [expect.objectContaining({ actorUserId: athleteA, decision: 'ACCEPT' })],
    });
    const declined = await decideGroupPlanOfficialConversion(
      database,
      {
        commandId: testId(30140), commandType: 'DECIDE_GROUP_PLAN_OFFICIAL_CONVERSION',
        idempotencyKey: 'group-official-coach-declines',
        actor: { type: 'USER', id: coach, roles: ['COACH'], scopeIds: [community] },
        aggregateType: 'GroupPlanOfficialConversion', aggregateId: declinedConversionId,
        expectedVersion: 1, correlationId: testId(30141), causationId: testId(30110),
        requestId: testId(30142), source: 'api', payloadVersion: 1,
        payload: { conversionId: declinedConversionId, decision: 'DECLINE' },
      } satisfies CommandEnvelope<DecideGroupPlanOfficialConversionPayload>,
      conversionIds(30150, declinedConversionId),
      () => new Date('2026-09-07T09:25:00.000Z'),
    );
    expect(declined.response).toMatchObject({
      state: 'DECLINED', challengeId: null, bookingId: null, sessionId: null,
    });
    const preservedPlan = await readTrainingOptions(
      database, chat, athleteA, new Date('2026-09-07T09:26:00.000Z'),
    );
    expect(preservedPlan.activeIntent.groupPlan).toMatchObject({
      groupPlanId: conversionPlanId, state: 'NOTIFIED', version: 4,
    });

    const convertedId = testId(30200);
    const secondRequest = await requestGroupPlanOfficialConversion(
      database,
      {
        commandId: testId(30201), commandType: 'REQUEST_GROUP_PLAN_OFFICIAL_CONVERSION',
        idempotencyKey: 'group-official-request-converted',
        actor: { type: 'USER', id: athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'GroupPlan', aggregateId: conversionPlanId, expectedVersion: 4,
        correlationId: testId(30202), causationId: testId(30150), requestId: testId(30203),
        source: 'api', payloadVersion: 1,
        payload: { groupPlanId: conversionPlanId, explicitRulesetAcknowledged: true },
      } satisfies CommandEnvelope<RequestGroupPlanOfficialConversionPayload>,
      conversionIds(30210, convertedId),
      () => new Date('2026-09-07T09:30:00.000Z'),
    );
    expect(secondRequest.response.confirmations).toEqual([
      expect.objectContaining({ actorUserId: athleteB, decision: 'ACCEPT' }),
    ]);
    const peerAccepted = await decideGroupPlanOfficialConversion(
      database,
      {
        commandId: testId(30240), commandType: 'DECIDE_GROUP_PLAN_OFFICIAL_CONVERSION',
        idempotencyKey: 'group-official-peer-accepts',
        actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'GroupPlanOfficialConversion', aggregateId: convertedId,
        expectedVersion: 1, correlationId: testId(30241), causationId: testId(30210),
        requestId: testId(30242), source: 'api', payloadVersion: 1,
        payload: { conversionId: convertedId, decision: 'ACCEPT',
          explicitRulesetAcknowledged: true },
      } satisfies CommandEnvelope<DecideGroupPlanOfficialConversionPayload>,
      conversionIds(30250, convertedId),
      () => new Date('2026-09-07T09:35:00.000Z'),
    );
    expect(peerAccepted.response).toMatchObject({
      state: 'PENDING_CONFIRMATION', challengeId: null, bookingId: null, sessionId: null,
      version: 2,
    });
    const pendingResources = await sql<{
      readonly challenges: string; readonly sessions: string; readonly obligations: string;
    }>`select
      (select count(*)::text from competition.challenges where challenge_id = ${testId(30307)}::uuid) as challenges,
      (select count(*)::text from scheduling.sessions where session_id = ${testId(30320)}::uuid) as sessions,
      (select count(*)::text from competition.challenge_participant_obligations obligation
        where obligation.challenge_id = ${testId(30307)}::uuid) as obligations
    `.execute(database);
    expect(pendingResources.rows[0]).toEqual({ challenges: '0', sessions: '0', obligations: '0' });
    await expect(listGroupPlanOfficialConversionsForViewer(database, coach)).resolves.toEqual([
      expect.objectContaining({ conversionId: convertedId, viewerRequiredRole: 'COACH',
        viewerCanConfirm: true }),
    ]);
    const coachAccepted = await decideGroupPlanOfficialConversion(
      database,
      {
        commandId: testId(30280), commandType: 'DECIDE_GROUP_PLAN_OFFICIAL_CONVERSION',
        idempotencyKey: 'group-official-coach-accepts',
        actor: { type: 'USER', id: coach, roles: ['COACH'], scopeIds: [community] },
        aggregateType: 'GroupPlanOfficialConversion', aggregateId: convertedId,
        expectedVersion: 2, correlationId: testId(30281), causationId: testId(30250),
        requestId: testId(30282), source: 'api', payloadVersion: 1,
        payload: { conversionId: convertedId, decision: 'ACCEPT' },
      } satisfies CommandEnvelope<DecideGroupPlanOfficialConversionPayload>,
      conversionIds(30300, convertedId),
      () => new Date('2026-09-07T09:40:00.000Z'),
    );
    expect(coachAccepted.response).toMatchObject({
      state: 'CONVERTED', challengeId: testId(30307), bookingId: testId(30318),
      sessionId: testId(30320), version: 3,
    });
    const convertedResources = await sql<{
      readonly plan_state: string; readonly challenge_state: string;
      readonly booking_state: string; readonly session_state: string;
      readonly slot_state: string; readonly capacity_reserved: boolean;
      readonly obligations: string;
    }>`
      select plan.state as plan_state, challenge.state as challenge_state,
        booking.state as booking_state, session.state as session_state,
        slot.state as slot_state,
        (booking.commercial_terms_snapshot->>'capacityReserved')::boolean as capacity_reserved,
        (select count(*)::text from competition.challenge_participant_obligations obligation
          where obligation.challenge_id = challenge.challenge_id and obligation.released_at is null
        ) as obligations
      from scheduling.group_plans plan
      join scheduling.group_offerings offering on offering.group_offering_id = plan.group_offering_id
      join scheduling.group_plan_official_conversions conversion
        on conversion.group_plan_id = plan.group_plan_id and conversion.state = 'CONVERTED'
      join competition.challenges challenge on challenge.challenge_id = conversion.challenge_id
      join scheduling.bookings booking on booking.booking_id = conversion.booking_id
      join scheduling.sessions session on session.session_id = conversion.session_id
      join scheduling.slots slot on slot.slot_id = booking.slot_id
      where plan.group_plan_id = ${conversionPlanId}::uuid
    `.execute(database);
    expect(convertedResources.rows[0]).toEqual({
      plan_state: 'CONVERTED', challenge_state: 'BOOKED', booking_state: 'CONFIRMED_PAIR',
      session_state: 'SCHEDULED', slot_state: 'BOOKED', capacity_reserved: false,
      obligations: '2',
    });
}

const testConnectionString = process.env.DATABASE_TEST_URL;
const describePostgres = testConnectionString ? describe : describe.skip;

describePostgres('PostgreSQL critical command transaction', () => {
  if (!testConnectionString) return;

  const databaseName = new URL(testConnectionString).pathname.slice(1);
  if (!databaseName.endsWith('_test')) {
    throw new Error('DATABASE_TEST_URL must target a database whose name ends with _test');
  }

  const database = createDatabase(testConnectionString);

  beforeAll(async () => {
    await runMigrations(testConnectionString);
    await sql`create schema if not exists test_support`.execute(database);
    await sql`
      create table if not exists test_support.probe_aggregates (
        aggregate_id uuid primary key,
        version bigint not null,
        value integer not null
      )
    `.execute(database);
  });

  beforeEach(async () => {
    await sql`
      truncate table
        test_support.probe_aggregates,
        platform.incident_timeout_compensations,
        platform.incident_impacts,
        platform.platform_incidents,
        identity.account_data_exports,
        identity.account_closure_requests,
        identity.duplicate_account_aliases,
        identity.duplicate_account_processes,
        identity.duplicate_account_case_users,
        identity.duplicate_account_cases,
        identity.user_sensitive_action_holds,
        identity.auth_access_tokens,
        identity.auth_refresh_tokens,
        identity.auth_session_families,
        identity.auth_otp_challenges,
        identity.trusted_sessions,
        identity.account_access_cases,
        community.community_closure_status_dispositions,
        community.community_closure_session_dispositions,
        community.community_closure_plans,
        community.voluntary_membership_exits,
        identity.age_division_transitions,
        competition.process_holds,
        community.membership_removal_cases,
        scheduling.booking_training_retention_confirmations,
        scheduling.booking_training_retentions,
        scheduling.booking_solo_confirmations,
        scheduling.booking_solo_continuations,
        scheduling.booking_conversion_confirmations,
        scheduling.booking_official_conversions,
        scheduling.group_plan_conversion_confirmations,
        scheduling.group_plan_official_conversions,
        competition.voluntary_status_releases,
        competition.challenge_ruleset_acknowledgments,
        competition.challenge_participant_obligations,
        competition.genesis_candidate_responses,
        competition.challenge_queue_entries,
        competition.optional_pair_quiet_periods,
        competition.integrity_status_compensations,
        competition.integrity_decisions,
        competition.integrity_cases,
        competition.status_transition_compensations,
        competition.appeal_sla_extensions,
        competition.appeal_withdrawals,
        competition.appeal_responses,
        competition.appeal_decisions,
        competition.appeal_waivers,
        competition.appeals,
        competition.missing_result_venue_confirmations,
        competition.missing_result_statements,
        competition.missing_result_reviews,
        competition.technical_correction_status_compensations,
        competition.technical_correction_decisions,
        competition.technical_correction_requests,
        competition.result_metadata_revisions,
        competition.status_transition_finalizations,
        competition.status_transitions,
        competition.pair_cooldowns,
        competition.results,
        governance.youth_challenge_consents,
        competition.challenge_mutual_reschedule_requests,
        competition.challenge_reschedules,
        competition.challenges,
        competition.ruleset_snapshots,
        competition.competitions,
        scheduling.group_plans,
        scheduling.attendance,
        scheduling.session_competitive_snapshots,
        scheduling.session_coach_assignment_revisions,
        scheduling.booking_coach_replacements,
        scheduling.booking_host_rejections,
        scheduling.sessions,
        scheduling.bookings,
        scheduling.group_offerings,
        scheduling.slots,
        social.chat_message_reports,
        social.chat_message_user_visibility,
        social.chat_message_revisions,
        social.chat_messages,
        social.chat_participants,
        social.chats,
        social.discovery_pair_suppressions,
        social.blocks,
        social.matches,
        social.likes,
        community.community_pause_intervals,
        community.role_grants,
        community.membership_invites,
        community.community_memberships,
        community.community_configuration_versions,
        community.communities,
        community.venue_configuration_versions,
        community.venues,
        identity.display_name_audit,
        identity.account_verifications,
        identity.athlete_profiles,
        identity.users,
        platform.feature_flags,
        platform.notification_delivery_intents,
        platform.notifications,
        platform.notification_preferences,
        platform.outbox_messages,
        platform.idempotency_records,
        platform.inbox_receipts,
        platform.audit_events,
        platform.domain_events
    `.execute(database);
    await sql`
      insert into platform.feature_flags (feature_key, enabled, reason, version)
      values ('YOUTH_OFFICIAL', false, 'Reset by integration test', 1)
    `.execute(database);
  });

  const seedConfirmedTrainingForConversion = async (base: number) => {
    const athleteA = testId(base);
    const athleteB = testId(base + 1);
    const coach = testId(base + 2);
    const central = testId(base + 3);
    const venue = testId(base + 4);
    const community = testId(base + 5);
    const competition = testId(base + 6);
    const chat = testId(base + 7);
    const match = testId(base + 8);
    const slot = testId(base + 9);
    const booking = testId(base + 10);
    const session = testId(base + 11);
    const occurredAt = '2026-09-27T10:00:00.000Z';
    const scheduledStartAt = '2026-10-01T10:00:00.000Z';
    const scheduledEndAt = '2026-10-01T11:00:00.000Z';

    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values
        (${athleteA}::uuid, ${`+7999${String(base).padStart(7, '0')}`}, ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'Conversion Athlete A', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${athleteB}::uuid, ${`+7999${String(base + 1).padStart(7, '0')}`}, ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'Conversion Athlete B', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${coach}::uuid, ${`+7999${String(base + 2).padStart(7, '0')}`}, ${occurredAt}::timestamptz, '1985-01-01', 'ADULT', 'Conversion Coach', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${central}::uuid, ${`+7999${String(base + 3).padStart(7, '0')}`}, ${occurredAt}::timestamptz, '1985-01-01', 'ADULT', 'Conversion Central', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz)
    `.execute(database);
    await sql`
      insert into identity.account_verifications (
        verification_id, user_id, state, method, moderation_checklist_version,
        is_current, verified_at, decided_by, decision_reason, version
      ) values
        (${testId(base + 12)}::uuid, ${athleteA}::uuid, 'VERIFIED', 'CENTRAL_MODERATION', 'identity-mvp-v1', true, ${occurredAt}::timestamptz, ${central}::uuid, 'TEST_APPROVED', 1),
        (${testId(base + 13)}::uuid, ${athleteB}::uuid, 'VERIFIED', 'CENTRAL_MODERATION', 'identity-mvp-v1', true, ${occurredAt}::timestamptz, ${central}::uuid, 'TEST_APPROVED', 1)
    `.execute(database);
    await ensureLocalPilotCommunity(database, {
      venueId: venue,
      venueConfigurationId: testId(base + 14),
      communityId: community,
      communityConfigurationId: testId(base + 15),
      membershipId: testId(base + 16),
      centralGrantId: testId(base + 17),
      athleteUserId: athleteA,
      centralActorId: central,
      legalName: 'Conversion Pilot Gym LLC',
      venueDisplayName: 'Conversion Pilot Gym',
      communityName: 'Conversion Community',
      address: 'Москва',
      cityCode: 'MOSCOW',
      timezone: 'Europe/Moscow',
      contactPayload: { phone: '+79990000501' },
      occurredAt,
    });
    await ensureLocalPilotCompetition(database, {
      competitionId: competition,
      communityId: community,
      centralActorId: central,
      occurredAt,
      memberships: [
        { membershipId: testId(base + 16), userId: athleteA },
        { membershipId: testId(base + 18), userId: athleteB },
      ],
    });
    await sql`
      insert into community.role_grants (
        grant_id, user_id, role, scope_type, scope_id, state,
        authorized_by, authorized_at, version
      ) values (
        ${testId(base + 19)}::uuid, ${coach}::uuid, 'COACH', 'COMMUNITY',
        ${community}::uuid, 'ACTIVE', ${central}::uuid, ${occurredAt}::timestamptz, 1
      )
    `.execute(database);
    await database.transaction().execute(async (transaction) => {
      await sql`set constraints all deferred`.execute(transaction);
      await sql`
        insert into social.chats (chat_id, scope, state, version, created_at, updated_at)
        values (${chat}::uuid, 'PERSONAL_MATCH', 'OPEN', 1, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into social.chat_participants (chat_id, user_id, joined_at) values
          (${chat}::uuid, ${athleteA}::uuid, ${occurredAt}::timestamptz),
          (${chat}::uuid, ${athleteB}::uuid, ${occurredAt}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into social.matches (
          match_id, pair_low_id, pair_high_id, state, chat_id,
          last_activity_at, version, created_at, updated_at
        ) values (
          ${match}::uuid, least(${athleteA}::uuid, ${athleteB}::uuid),
          greatest(${athleteA}::uuid, ${athleteB}::uuid), 'ACTIVE', ${chat}::uuid,
          ${occurredAt}::timestamptz, 1, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into scheduling.slots (
          slot_id, venue_id, coach_user_id, start_at, end_at, slot_type,
          state, price_amount, price_currency, price_text, cancellation_terms_text,
          commercial_version, booking_id, published_by, version, created_at, updated_at
        ) values (
          ${slot}::uuid, ${venue}::uuid, ${coach}::uuid,
          ${scheduledStartAt}::timestamptz, ${scheduledEndAt}::timestamptz,
          'PERSONAL', 'BOOKED', 1500, 'RUB', 'Оплата напрямую залу',
          'Уточните условия у зала', 1, ${booking}::uuid, ${coach}::uuid, 2,
          ${occurredAt}::timestamptz, ${occurredAt}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into scheduling.bookings (
          booking_id, chat_id, match_id, slot_id, pair_low_id, pair_high_id,
          purpose, state, initiated_by, selected_by_low_at, selected_by_high_at,
          selection_expires_at, host_confirmation_deadline_at, commercial_terms_snapshot,
          host_confirmed_by, host_confirmed_at, version, created_at, updated_at
        ) values (
          ${booking}::uuid, ${chat}::uuid, ${match}::uuid, ${slot}::uuid,
          least(${athleteA}::uuid, ${athleteB}::uuid), greatest(${athleteA}::uuid, ${athleteB}::uuid),
          'TRAINING', 'CONFIRMED_PAIR', ${athleteA}::uuid,
          ${occurredAt}::timestamptz, ${occurredAt}::timestamptz,
          '2026-09-27T11:00:00.000Z'::timestamptz, '2026-09-29T10:00:00.000Z'::timestamptz,
          ${JSON.stringify({ priceAmount: '1500.00', priceCurrency: 'RUB', commercialVersion: 1 })}::jsonb,
          ${coach}::uuid, ${occurredAt}::timestamptz, 3,
          ${occurredAt}::timestamptz, ${occurredAt}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into scheduling.sessions (
          session_id, booking_id, venue_id, coach_user_id, pair_low_id, pair_high_id,
          purpose, state, scheduled_start_at, scheduled_end_at, commercial_terms_snapshot,
          version, created_at, updated_at
        ) values (
          ${session}::uuid, ${booking}::uuid, ${venue}::uuid, ${coach}::uuid,
          least(${athleteA}::uuid, ${athleteB}::uuid), greatest(${athleteA}::uuid, ${athleteB}::uuid),
          'TRAINING', 'SCHEDULED', ${scheduledStartAt}::timestamptz,
          ${scheduledEndAt}::timestamptz,
          ${JSON.stringify({ priceAmount: '1500.00', priceCurrency: 'RUB', commercialVersion: 1 })}::jsonb,
          1, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into platform.domain_events (
          event_id, event_name, event_version, aggregate_type, aggregate_id,
          aggregate_version, transition_id, correlation_id, causation_id, actor_id,
          occurred_at, payload, idempotency_key_hash
        ) values (
          ${testId(base + 20)}::uuid, 'SessionScheduled', 1, 'Session',
          ${session}::uuid, 1, 'S-01', ${testId(base + 21)}::uuid,
          null, ${coach}::uuid, ${occurredAt}::timestamptz,
          ${JSON.stringify({ sessionId: session, bookingId: booking })}::jsonb,
          ${`fixture:session:${session}`}
        )
      `.execute(transaction);
    });
    return {
      athleteA, athleteB, booking, central, chat, coach, community, competition, match, session,
      slot, venue,
      scheduledStartAt,
    };
  };

  const bookingConversionEffects = (base: number, conversionId: string) => ({
    eventId: testId(base),
    auditId: testId(base + 1),
    outboxMessageId: testId(base + 2),
    conversionId,
    queueEntryId: testId(base + 3),
    queueEventId: testId(base + 4),
    queueConsumedEventId: testId(base + 5),
    timerOutboxMessageId: testId(base + 6),
    confirmationId: testId(base + 7),
    challengeId: testId(base + 8),
    challengeEventId: testId(base + 9),
    serviceChatId: testId(base + 10),
    serviceChatEventId: testId(base + 11),
    rulesetSnapshotId: testId(base + 12),
    acknowledgmentIds: [testId(base + 13), testId(base + 14)] as const,
    obligationIds: [testId(base + 15), testId(base + 16)] as const,
    bookingEventId: testId(base + 17),
    sessionEventId: testId(base + 18),
    notificationOutboxMessageId: testId(base + 19),
    notificationIds: [testId(base + 20), testId(base + 21), testId(base + 22)] as const,
    sessionTimerOutboxMessageId: testId(base + 23),
  });

  const bookingSoloEffects = (base: number, continuationId: string) => ({
    eventId: testId(base),
    auditId: testId(base + 1),
    outboxMessageId: testId(base + 2),
    continuationId,
    confirmationId: testId(base + 3),
    bookingEventId: testId(base + 4),
    sessionEventId: testId(base + 5),
    slotEventId: testId(base + 6),
    conversionEventId: testId(base + 7),
    conversionQueueEventId: testId(base + 8),
    conversionOutboxMessageId: testId(base + 9),
    timerOutboxMessageId: testId(base + 10),
    notificationOutboxMessageId: testId(base + 11),
    notificationIds: [testId(base + 12), testId(base + 13)] as const,
    sessionTimerOutboxMessageId: testId(base + 14),
  });

  const seedYouthOfficialAtAgeBoundary = async (base: number, started: boolean) => {
    const seeded = await seedConfirmedTrainingForConversion(base);
    const athleteC = testId(base + 22);
    const athleteAMembership = testId(base + 16);
    const athleteBMembership = testId(base + 18);
    const athleteCMembership = testId(base + 23);
    const adultCompetition = testId(base + 24);
    const rulesetSnapshot = testId(base + 25);
    const challenge = testId(base + 26);
    const consent = testId(base + 27);
    const queueEntry = testId(base + 28);
    const competitiveSnapshot = testId(base + 29);
    const chat = testId(base + 7);
    const communityConfiguration = testId(base + 15);
    const boundary = '2026-10-02T00:00:00.000Z';
    const guardianContactHash = createHash('sha256')
      .update(`guardian-contact:${base}`).digest('hex');
    const guardianTokenHash = createHash('sha256')
      .update(`guardian-token:${base}`).digest('hex');
    const guardianAuditHash = createHash('sha256')
      .update(`guardian-audit:${base}`).digest('hex');
    const scheduledStart = started
      ? '2026-10-01T23:30:00.000Z'
      : '2026-10-03T10:00:00.000Z';
    const scheduledEnd = started
      ? '2026-10-02T00:30:00.000Z'
      : '2026-10-03T11:00:00.000Z';

    await sql`
      update identity.users set birth_date = '2008-10-02', age_division = 'YOUTH'
      where user_id = ${seeded.athleteA}::uuid
    `.execute(database);
    await sql`
      update identity.users set birth_date = '2009-01-01', age_division = 'YOUTH'
      where user_id = ${seeded.athleteB}::uuid
    `.execute(database);
    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values (
        ${athleteC}::uuid, ${`+7998${String(base).padStart(7, '0')}`},
        '2026-09-27T10:00:00.000Z', '2009-02-01', 'YOUTH',
        'Youth Queue Athlete', 'ACTIVE', 'ru-RU', 1, '2026-09-27T10:00:00.000Z'
      )
    `.execute(database);
    await sql`
      insert into identity.athlete_profiles (
        user_id, primary_sport, discovery_radius_km
      ) values (${athleteC}::uuid, 'BOXING', 15)
    `.execute(database);
    await sql`
      update community.community_memberships
      set age_division = 'YOUTH'
      where membership_id in (${athleteAMembership}::uuid, ${athleteBMembership}::uuid)
    `.execute(database);
    await sql`
      insert into community.community_memberships (
        membership_id, community_id, user_id, age_division, state,
        competition_enabled, join_path, decided_at, decided_by, version
      ) values (
        ${athleteCMembership}::uuid, ${seeded.community}::uuid, ${athleteC}::uuid,
        'YOUTH', 'ACTIVE', true, 'INVITE', '2026-09-27T10:00:00.000Z',
        ${seeded.athleteA}::uuid, 1
      )
    `.execute(database);
    await sql`
      update competition.competitions
      set age_division = 'YOUTH', phase = ${started ? 'FOUNDING_OPEN' : 'RUNNING'},
        champion_user_id = ${started ? null : seeded.athleteB}::uuid,
        contender_user_id = ${started ? null : seeded.athleteA}::uuid,
        status_version = ${started ? 0 : 2}
      where competition_id = ${seeded.competition}::uuid
    `.execute(database);
    await sql`
      insert into competition.competitions (
        competition_id, community_id, age_division, phase, availability,
        status_version, version, created_at, updated_at
      ) values (
        ${adultCompetition}::uuid, ${seeded.community}::uuid, 'ADULT',
        'FOUNDING_OPEN', 'ACTIVE', 0, 1,
        '2026-09-27T10:00:00.000Z', '2026-09-27T10:00:00.000Z'
      )
    `.execute(database);
    await sql`
      insert into competition.ruleset_snapshots (
        ruleset_snapshot_id, competition_id, community_configuration_id,
        ruleset_ref, ruleset_ack_mode, policy_version, created_at
      ) values (
        ${rulesetSnapshot}::uuid, ${seeded.competition}::uuid,
        ${communityConfiguration}::uuid, 'pilot-boxing-v1',
        'IMPLICIT_ON_ACCEPT', 'challenge-mvp-v1', '2026-09-27T10:00:00.000Z'
      )
    `.execute(database);
    await sql`
      insert into competition.challenges (
        challenge_id, competition_id, source_chat_id, service_chat_id,
        initiator_user_id, recipient_user_id, pair_low_id, pair_high_id,
        response_policy, stake, state, ruleset_snapshot_id,
        response_deadline_at, accepted_at, scheduling_deadline_at,
        version, created_at, updated_at
      ) values (
        ${challenge}::uuid, ${seeded.competition}::uuid, ${chat}::uuid, ${chat}::uuid,
        ${seeded.athleteA}::uuid, ${seeded.athleteB}::uuid,
        least(${seeded.athleteA}::uuid, ${seeded.athleteB}::uuid),
        greatest(${seeded.athleteA}::uuid, ${seeded.athleteB}::uuid),
        'MANDATORY', ${started ? 'NONE' : 'TITLE'}, ${started ? 'IN_SESSION' : 'BOOKED'},
        ${rulesetSnapshot}::uuid, '2026-09-29T10:00:00.000Z',
        '2026-09-27T10:00:00.000Z', '2026-10-11T10:00:00.000Z',
        4, '2026-09-27T10:00:00.000Z', '2026-09-27T10:00:00.000Z'
      )
    `.execute(database);
    await sql`
      update scheduling.slots
      set start_at = ${scheduledStart}::timestamptz,
        end_at = ${scheduledEnd}::timestamptz
      where slot_id = ${seeded.slot}::uuid
    `.execute(database);
    await sql`
      update scheduling.bookings
      set purpose = 'OFFICIAL_CHALLENGE', challenge_id = ${challenge}::uuid
      where booking_id = ${seeded.booking}::uuid
    `.execute(database);
    await sql`
      update scheduling.sessions
      set purpose = 'OFFICIAL_CHALLENGE', challenge_id = ${challenge}::uuid,
        scheduled_start_at = ${scheduledStart}::timestamptz,
        scheduled_end_at = ${scheduledEnd}::timestamptz,
        state = ${started ? 'IN_PROGRESS' : 'SCHEDULED'},
        window_opened_at = ${started ? '2026-10-01T23:30:00.000Z' : null}::timestamptz,
        actual_start_at = ${started ? '2026-10-01T23:50:00.000Z' : null}::timestamptz
      where session_id = ${seeded.session}::uuid
    `.execute(database);
    await sql`
      insert into competition.challenge_participant_obligations (
        obligation_id, challenge_id, user_id, accepted_at
      ) values
        (${testId(base + 30)}::uuid, ${challenge}::uuid, ${seeded.athleteA}::uuid,
          '2026-09-27T10:00:00.000Z'),
        (${testId(base + 31)}::uuid, ${challenge}::uuid, ${seeded.athleteB}::uuid,
          '2026-09-27T10:00:00.000Z')
    `.execute(database);
    await sql`
      insert into governance.youth_challenge_consents (
        consent_id, challenge_id, athlete_user_id, policy_version, state,
        channel, contact_hash, masked_contact, token_hash,
        guardian_display_name, relationship, consent_audit_hash,
        request_event_id, decision_event_id, requested_at, decided_at,
        expires_at, version
      ) values (
        ${consent}::uuid, ${challenge}::uuid, ${seeded.athleteA}::uuid,
        'youth-consent-mvp-v1', 'GRANTED', 'EMAIL', ${guardianContactHash},
        'g***@example.test', ${guardianTokenHash}, 'Guardian', 'PARENT',
        ${guardianAuditHash}, ${testId(base + 32)}::uuid, ${testId(base + 33)}::uuid,
        '2026-09-27T09:00:00.000Z', '2026-09-27T10:00:00.000Z',
        '2026-10-11T10:00:00.000Z', 2
      )
    `.execute(database);

    if (started) {
      await sql`
        insert into scheduling.session_competitive_snapshots (
          snapshot_id, session_id, challenge_id, competition_id,
          ruleset_snapshot_id, community_configuration_id, planned_stake,
          effective_stake, champion_user_id, contender_user_id,
          competition_status_version, venue_id, coach_user_id,
          pair_low_id, pair_high_id, scheduled_start_at, scheduled_end_at, created_at
        ) values (
          ${competitiveSnapshot}::uuid, ${seeded.session}::uuid, ${challenge}::uuid,
          ${seeded.competition}::uuid, ${rulesetSnapshot}::uuid,
          ${communityConfiguration}::uuid, 'NONE', 'NONE', null, null, 0,
          ${testId(base + 4)}::uuid, ${seeded.coach}::uuid,
          least(${seeded.athleteA}::uuid, ${seeded.athleteB}::uuid),
          greatest(${seeded.athleteA}::uuid, ${seeded.athleteB}::uuid),
          ${scheduledStart}::timestamptz, ${scheduledEnd}::timestamptz,
          '2026-10-01T23:30:00.000Z'
        )
      `.execute(database);
    } else {
      await sql`
        insert into competition.challenge_queue_entries (
          queue_entry_id, competition_id, initiator_user_id, target_status,
          kind, state, bound_holder_user_id, source_type,
          submitted_at, version, created_at, updated_at
        ) values (
          ${queueEntry}::uuid, ${seeded.competition}::uuid, ${athleteC}::uuid,
          'CONTENDER', 'DIRECT_STATUS', 'WAITING', ${seeded.athleteA}::uuid,
          'DIRECT', '2026-09-28T10:00:00.000Z', 1,
          '2026-09-28T10:00:00.000Z', '2026-09-28T10:00:00.000Z'
        )
      `.execute(database);
    }

    return {
      ...seeded, athleteC, athleteAMembership, adultCompetition, rulesetSnapshot,
      challenge, consent, queueEntry, competitiveSnapshot, boundary,
      scheduledStart, scheduledEnd,
    };
  };

  const ageTransitionEffects = (base: number) => ({
    transitionId: testId(base), eventId: testId(base + 1), auditId: testId(base + 2),
    outboxMessageId: testId(base + 3), notificationOutboxMessageId: testId(base + 4),
    notificationId: testId(base + 5),
    relatedEventIds: Array.from({ length: 30 }, (_, index) => testId(base + 10 + index)),
    retentionIds: Array.from({ length: 4 }, (_, index) => testId(base + 50 + index)),
    retentionTimerOutboxMessageIds: Array.from(
      { length: 4 }, (_, index) => testId(base + 60 + index),
    ),
    statusOutboxMessageIds: Array.from({ length: 4 }, (_, index) => testId(base + 70 + index)),
  });

  const mutate = async (
    transaction: Transaction<Database>,
    nextVersion: number,
  ) => {
    await sql`
      insert into test_support.probe_aggregates (aggregate_id, version, value)
      values (${ids.aggregate}::uuid, ${nextVersion}, 1)
    `.execute(transaction);
    return effect(nextVersion);
  };

  it('detects drift in an already applied migration', async () => {
    const migrationName = '0001_platform_foundation.sql';
    await sql`
      update platform.schema_migrations
      set migration_sha256 = ${'0'.repeat(64)}
      where migration_name = ${migrationName}
    `.execute(database);

    try {
      await expect(runMigrations(testConnectionString)).rejects.toEqual(
        new MigrationChecksumMismatchError(migrationName),
      );
    } finally {
      await sql`
        update platform.schema_migrations
        set migration_sha256 = null
        where migration_name = ${migrationName}
      `.execute(database);
      await runMigrations(testConnectionString);
    }
  });

  it('[AC-135][AC-136][AC-137] commits once, replays the response and rejects changed payload or stale version', async () => {
    let mutationCount = 0;
    const execute = (input: CommandEnvelope<{ readonly amount: number }>) =>
      executeCriticalCommand(database, {
        command: input,
        now: () => new Date('2026-09-04T18:00:00.000Z'),
        mutate: async (transaction, context) => {
          mutationCount += 1;
          return mutate(transaction, context.nextVersion);
        },
      });

    const [first, duplicate] = await Promise.all([execute(command()), execute(command())]);
    expect([first.replayed, duplicate.replayed].sort()).toEqual([false, true]);
    expect(first.response).toEqual(duplicate.response);
    expect(mutationCount).toBe(1);

    await expect(
      execute(command({ payload: { amount: 2 } })),
    ).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
    await expect(
      execute(
        command({
          commandId: '0199a1b2-1234-7000-8000-000000000009',
          idempotencyKey: 'platform-probe-2',
        }),
      ),
    ).rejects.toBeInstanceOf(VersionConflictError);

    const counts = await sql<{
      readonly aggregates: string;
      readonly audits: string;
      readonly events: string;
      readonly idempotency: string;
      readonly outbox: string;
    }>`
      select
        (select count(*) from test_support.probe_aggregates)::text as aggregates,
        (select count(*) from platform.audit_events)::text as audits,
        (select count(*) from platform.domain_events)::text as events,
        (select count(*) from platform.idempotency_records)::text as idempotency,
        (select count(*) from platform.outbox_messages)::text as outbox
    `.execute(database);
    expect(counts.rows[0]).toEqual({
      aggregates: '1',
      audits: '1',
      events: '1',
      idempotency: '1',
      outbox: '1',
    });

    expect(await claimInboxEvent(database, 'projection-test', ids.event)).toBe(true);
    expect(await claimInboxEvent(database, 'projection-test', ids.event)).toBe(false);
  });

  it('rolls the aggregate mutation back when the command fails', async () => {
    await expect(
      executeCriticalCommand(database, {
        command: command(),
        mutate: async (transaction, context) => {
          await mutate(transaction, context.nextVersion);
          throw new Error('simulated command failure');
        },
      }),
    ).rejects.toThrow('simulated command failure');

    const counts = await sql<{ readonly aggregates: string; readonly events: string }>`
      select
        (select count(*) from test_support.probe_aggregates)::text as aggregates,
        (select count(*) from platform.domain_events)::text as events
    `.execute(database);
    expect(counts.rows[0]).toEqual({ aggregates: '0', events: '0' });
  });

  it('[AC-142] leases outbox work once and makes failed delivery retryable', async () => {
    await executeCriticalCommand(database, {
      command: command(),
      mutate: (transaction, context) => mutate(transaction, context.nextVersion),
    });
    const [firstWorker, secondWorker] = await Promise.all([
      claimOutboxBatch(database, { workerId: 'worker-1', batchSize: 10 }),
      claimOutboxBatch(database, { workerId: 'worker-2', batchSize: 10 }),
    ]);
    const claimed = [...firstWorker, ...secondWorker];
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      messageId: ids.outbox,
      eventId: ids.event,
      attemptCount: 1,
    });

    const leaseOwner = firstWorker.length === 1 ? 'worker-1' : 'worker-2';
    expect(
      await releaseOutboxFailure(
        database,
        ids.outbox,
        leaseOwner,
        'temporary provider failure',
        0,
      ),
    ).toBe(true);

    const retry = await claimOutboxBatch(database, {
      workerId: 'worker-3',
      batchSize: 10,
    });
    expect(retry).toHaveLength(1);
    expect(retry[0]?.attemptCount).toBe(2);
    expect(await markOutboxPublished(database, ids.outbox, 'worker-3')).toBe(true);
    expect(await markOutboxPublished(database, ids.outbox, 'worker-3')).toBe(false);
    expect(
      await claimOutboxBatch(database, { workerId: 'worker-4', batchSize: 10 }),
    ).toEqual([]);
  });

  it('[AC-141][AC-164] projects canonical notifications and opt-in external delivery intents once', async () => {
    await executeCriticalCommand(database, {
      command: command(),
      mutate: (transaction, context) => mutate(transaction, context.nextVersion),
    });
    await sql`
      insert into platform.notification_preferences (user_id, event_sms_opt_in)
      values (${ids.recipientTwo}::uuid, true)
    `.execute(database);

    const drafts = [
      {
        notificationId: ids.notificationOne,
        recipientUserId: ids.recipientOne,
        category: 'MANDATORY' as const,
        renderKey: 'challenge.response_required',
        actionTarget: { type: 'CHALLENGE', id: ids.aggregate },
        payload: { responseHours: 48 },
        deadlineAt: '2026-09-06T20:00:00.000Z',
      },
      {
        notificationId: ids.notificationTwo,
        recipientUserId: ids.recipientTwo,
        category: 'MANDATORY' as const,
        renderKey: 'challenge.created',
        actionTarget: { type: 'CHALLENGE', id: ids.aggregate },
        payload: {},
        deadlineAt: null,
      },
    ];

    await expect(projectNotificationBatch(database, ids.event, drafts)).resolves.toEqual({
      replayed: false,
      createdCount: 2,
      createdPushIntentCount: 2,
      createdSmsIntentCount: 1,
    });
    await expect(projectNotificationBatch(database, ids.event, drafts)).resolves.toEqual({
      replayed: true,
      createdCount: 0,
      createdPushIntentCount: 0,
      createdSmsIntentCount: 0,
    });

    const count = await sql<{ readonly notifications: string }>`
      select count(*)::text as notifications from platform.notifications
    `.execute(database);
    expect(count.rows[0]?.notifications).toBe('2');
    const intents = await sql<{
      readonly channel: string;
      readonly delivery_class: string;
      readonly recipient_user_id: string;
      readonly state: string;
    }>`
      select channel, delivery_class, recipient_user_id, state
      from platform.notification_delivery_intents
      order by recipient_user_id, channel
    `.execute(database);
    expect(intents.rows).toEqual([{
      channel: 'PUSH',
      delivery_class: 'CRITICAL',
      recipient_user_id: ids.recipientOne,
      state: 'PENDING',
    }, {
      channel: 'PUSH',
      delivery_class: 'CRITICAL',
      recipient_user_id: ids.recipientTwo,
      state: 'PENDING',
    }, {
      channel: 'SMS',
      delivery_class: 'CRITICAL',
      recipient_user_id: ids.recipientTwo,
      state: 'PENDING',
    }]);
    const deadlineBeforeRead = await sql<{ readonly deadline_at: Date }>`
      select deadline_at from platform.notifications
      where notification_id = ${ids.notificationOne}::uuid
    `.execute(database);
    await expect(
      markNotificationRead(database, ids.notificationOne, ids.recipientOne),
    ).resolves.toBe(true);
    await expect(
      markNotificationRead(database, ids.notificationOne, ids.recipientOne),
    ).resolves.toBe(true);
    await expect(
      markNotificationRead(database, ids.notificationOne, ids.recipientTwo),
    ).resolves.toBe(false);
    const deadlineAfterRead = await sql<{ readonly deadline_at: Date }>`
      select deadline_at from platform.notifications
      where notification_id = ${ids.notificationOne}::uuid
    `.execute(database);
    expect(deadlineAfterRead.rows[0]?.deadline_at.toISOString()).toBe(
      deadlineBeforeRead.rows[0]?.deadline_at.toISOString(),
    );
  });

  it('[AC-017][AC-168][AC-192] changes profile priorities without identity or Competition drift', async () => {
    const activation: CommandEnvelope<ActivateIdentityInput> = {
      commandId: ids.activationCommand,
      commandType: 'ACTIVATE_ACCOUNT',
      idempotencyKey: 'identity-activation-1',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'User',
      aggregateId: ids.identityUser,
      expectedVersion: 0,
      correlationId: ids.identityCorrelation,
      causationId: null,
      requestId: ids.identityRequest,
      source: 'scheduler',
      payloadVersion: 1,
      payload: {
        userId: ids.identityUser,
        phoneE164: '+79990000201',
        phoneVerifiedAt: '2026-09-06T08:00:00.000Z',
        birthDate: '2000-04-12',
        displayName: 'Свободный атлет',
        locale: 'ru-RU',
        primarySport: 'BOXING',
        secondarySport: 'RUNNING',
        discoveryRadiusKm: 15,
      },
    };
    await expect(
      activateUser(
        database,
        { ...activation, aggregateId: ids.aggregate },
        {
          eventId: ids.activationEvent,
          auditId: ids.activationAudit,
          outboxMessageId: ids.activationOutbox,
        },
      ),
    ).rejects.toBeInstanceOf(IdentityValidationError);
    const activated = await activateUser(database, activation, {
      eventId: ids.activationEvent,
      auditId: ids.activationAudit,
      outboxMessageId: ids.activationOutbox,
    });

    expect(activated).toMatchObject({
      replayed: false,
      responseStatus: 201,
      response: {
        userId: ids.identityUser,
        displayName: 'Свободный атлет',
        accountVerificationState: 'NOT_STARTED',
        version: 1,
        capabilities: ['USE_DISCOVERY', 'EDIT_PROFILE', 'BOOK_ORDINARY_TRAINING'],
      },
    });

    const rename: CommandEnvelope<{ readonly displayName: string }> = {
      commandId: ids.displayNameCommand,
      commandType: 'CHANGE_DISPLAY_NAME',
      idempotencyKey: 'identity-display-name-1',
      actor: {
        type: 'USER',
        id: ids.identityUser,
        roles: ['ATHLETE'],
        scopeIds: [],
      },
      aggregateType: 'User',
      aggregateId: ids.identityUser,
      expectedVersion: 1,
      correlationId: ids.identityCorrelation,
      causationId: ids.activationEvent,
      requestId: ids.identityRequest,
      source: 'api',
      payloadVersion: 1,
      payload: { displayName: 'Номер Один' },
    };
    const renameIds = {
      eventId: ids.displayNameEvent,
      auditId: ids.displayNameAudit,
      outboxMessageId: ids.displayNameOutbox,
    };
    const first = await changeDisplayName(database, rename, renameIds);
    const replay = await changeDisplayName(database, rename, renameIds);

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.response).toEqual(first.response);
    expect(first.response).toMatchObject({
      displayName: 'Номер Один',
      accountVerificationState: 'NOT_STARTED',
      version: 2,
    });
    expect(await readIdentityProjection(database, ids.identityUser)).toEqual(first.response);
    expect(first.response).not.toHaveProperty('phoneE164');
    expect(first.response).not.toHaveProperty('birthDate');

    const audit = await sql<{
      readonly previous_display_name: string;
      readonly new_display_name: string;
    }>`
      select previous_display_name, new_display_name
      from identity.display_name_audit
      where user_id = ${ids.identityUser}::uuid
    `.execute(database);
    expect(audit.rows).toEqual([
      {
        previous_display_name: 'Свободный атлет',
        new_display_name: 'Номер Один',
      },
    ]);

    const sports = await changeSports(
      database,
      {
        commandId: testId(12000),
        commandType: 'CHANGE_SPORTS',
        idempotencyKey: 'identity-sports-1',
        actor: {
          type: 'USER',
          id: ids.identityUser,
          roles: ['ATHLETE'],
          scopeIds: [],
        },
        aggregateType: 'User',
        aggregateId: ids.identityUser,
        expectedVersion: 2,
        correlationId: ids.identityCorrelation,
        causationId: ids.displayNameEvent,
        requestId: ids.identityRequest,
        source: 'api',
        payloadVersion: 1,
        payload: { primarySport: 'RUNNING', secondarySport: 'BOXING' },
      },
      {
        eventId: testId(12001),
        auditId: testId(12002),
        outboxMessageId: testId(12003),
      },
    );
    expect(sports.response).toMatchObject({
      primarySport: 'RUNNING',
      secondarySport: 'BOXING',
      version: 3,
    });
    expect(await readIdentityProjection(database, ids.identityUser)).toEqual(sports.response);

    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values (
        ${ids.centralActor}::uuid, '+79990000225', '2026-09-05T08:00:00Z',
        '1990-01-01', 'ADULT', 'Central Operator', 'ACTIVE', 'ru-RU', 1,
        '2026-09-06T08:00:00Z'
      )
    `.execute(database);
    await sql`
      insert into identity.athlete_profiles (
        user_id, primary_sport, secondary_sport, discovery_radius_km
      ) values (${ids.centralActor}::uuid, 'BOXING', null, 15)
    `.execute(database);

    const fixture = {
      venueId: ids.venue,
      venueConfigurationId: ids.venueConfiguration,
      communityId: ids.community,
      communityConfigurationId: ids.communityConfiguration,
      membershipId: ids.membership,
      centralGrantId: ids.centralGrant,
      athleteUserId: ids.identityUser,
      centralActorId: ids.centralActor,
      legalName: 'Pilot Legal Name',
      venueDisplayName: 'Pilot Gym',
      communityName: 'Pilot Community',
      address: 'Pilot address',
      cityCode: 'MOSCOW',
      timezone: 'Europe/Moscow',
      contactPayload: { phone: '+79990000220' },
      occurredAt: '2026-09-06T08:00:00.000Z',
    } as const;
    await ensureLocalPilotCommunity(database, fixture);
    await ensureLocalPilotCommunity(database, fixture);

    const communityContext = await readCommunityContext(
      database,
      ids.identityUser,
      ids.community,
    );
    expect(communityContext).toMatchObject({
      venue: { venueId: ids.venue, displayName: 'Pilot Gym' },
      community: {
        communityId: ids.community,
        state: 'ACTIVE',
        pairCooldownDays: 15,
        noShowGraceMinutes: 15,
      },
      membership: {
        membershipId: ids.membership,
        state: 'ACTIVE',
        competitionEnabled: true,
      },
    });
    expect(communityContext?.access.denials).toContainEqual(
      expect.objectContaining({
        capability: 'CREATE_OFFICIAL_CHALLENGE',
        code: 'ACCOUNT_NOT_VERIFIED',
      }),
    );
    const fixtureCounts = await sql<{
      readonly venues: string;
      readonly communities: string;
      readonly memberships: string;
    }>`
      select
        (select count(*) from community.venues)::text as venues,
        (select count(*) from community.communities)::text as communities,
        (select count(*) from community.community_memberships)::text as memberships
    `.execute(database);
    expect(fixtureCounts.rows[0]).toEqual({
      venues: '1',
      communities: '1',
      memberships: '1',
    });

    const secondVenueId = testId(12010);
    const secondVenueConfigurationId = testId(12011);
    await database.transaction().execute(async (transaction) => {
      await sql`set constraints all deferred`.execute(transaction);
      await sql`
        insert into community.venues (
          venue_id, legal_name, display_name, address, city_code, timezone, state,
          minimum_booking_notice_hours, slot_publish_horizon_days, contact_payload,
          configuration_version_id, version
        ) values (
          ${secondVenueId}::uuid, 'Second Legal Gym', 'Second Gym', 'Second address',
          'MOSCOW', 'Europe/Moscow', 'ACTIVE', 8, 30, '{}'::jsonb,
          ${secondVenueConfigurationId}::uuid, 1
        )
      `.execute(transaction);
      await sql`
        insert into community.venue_configuration_versions (
          configuration_id, venue_id, configuration_version,
          minimum_booking_notice_hours, slot_publish_horizon_days, contact_payload,
          created_by, effective_at
        ) values (
          ${secondVenueConfigurationId}::uuid, ${secondVenueId}::uuid, 1,
          8, 30, '{}'::jsonb, ${ids.centralActor}::uuid, '2026-09-06T08:00:00Z'
        )
      `.execute(transaction);
    });
    expect(await readHomeVenueSettings(database, ids.identityUser)).toMatchObject({
      homeVenueId: null, userVersion: 3,
      options: expect.arrayContaining([
        expect.objectContaining({ venueId: ids.venue, displayName: 'Pilot Gym' }),
        expect.objectContaining({ venueId: secondVenueId, displayName: 'Second Gym' }),
      ]),
    });
    const membershipBeforeHomeVenueChange = await sql<Record<string, unknown>>`
      select * from community.community_memberships
      where membership_id = ${ids.membership}::uuid
    `.execute(database);
    const changeHomeVenueCommand = {
      commandId: testId(12012), commandType: 'CHANGE_HOME_VENUE',
      idempotencyKey: 'identity-home-venue-1',
      actor: { type: 'USER', id: ids.identityUser, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'User', aggregateId: ids.identityUser, expectedVersion: 3,
      correlationId: ids.identityCorrelation, causationId: testId(12001),
      requestId: ids.identityRequest, source: 'api', payloadVersion: 1,
      payload: { venueId: secondVenueId },
    } satisfies CommandEnvelope<{ readonly venueId: string }>;
    const homeVenueEffectIds = { eventId: testId(12013), auditId: testId(12014),
      outboxMessageId: testId(12015) };
    const changedHomeVenue = await changeHomeVenue(
      database, changeHomeVenueCommand, homeVenueEffectIds,
    );
    const changedHomeVenueReplay = await changeHomeVenue(
      database, changeHomeVenueCommand, homeVenueEffectIds,
    );
    expect(changedHomeVenue.response).toEqual({
      homeVenueId: secondVenueId, venueDisplayName: 'Second Gym', version: 4,
    });
    expect(changedHomeVenueReplay).toMatchObject({ replayed: true,
      response: changedHomeVenue.response });
    expect((await readHomeVenueSettings(database, ids.identityUser))?.homeVenueId)
      .toBe(secondVenueId);
    const membershipAfterHomeVenueChange = await sql<Record<string, unknown>>`
      select * from community.community_memberships
      where membership_id = ${ids.membership}::uuid
    `.execute(database);
    expect(membershipAfterHomeVenueChange.rows).toEqual(membershipBeforeHomeVenueChange.rows);
    const homeVenueAudit = await sql<{ readonly metadata: Record<string, unknown> }>`
      select metadata from platform.audit_events where audit_id = ${testId(12014)}::uuid
    `.execute(database);
    expect(homeVenueAudit.rows[0]?.metadata).toMatchObject({
      previousHomeVenueId: null, homeVenueId: secondVenueId,
      competitionStateChanged: false,
    });

    const verificationStart: CommandEnvelope<{
      readonly userId: string;
      readonly moderationChecklistVersion: string;
    }> = {
      commandId: ids.verificationStartCommand,
      commandType: 'START_VERIFICATION',
      idempotencyKey: 'identity-verification-start-1',
      actor: {
        type: 'USER',
        id: ids.identityUser,
        roles: ['ATHLETE'],
        scopeIds: [],
      },
      aggregateType: 'AccountVerification',
      aggregateId: ids.verification,
      expectedVersion: 0,
      correlationId: ids.identityCorrelation,
      causationId: null,
      requestId: ids.identityRequest,
      source: 'api',
      payloadVersion: 1,
      payload: {
        userId: ids.identityUser,
        moderationChecklistVersion: 'identity-mvp-v1',
      },
    };
    const verificationStartIds = {
      eventId: ids.verificationStartEvent,
      auditId: ids.verificationStartAudit,
      outboxMessageId: ids.verificationStartOutbox,
    };
    const pending = await startAccountVerification(
      database,
      verificationStart,
      verificationStartIds,
    );
    const pendingReplay = await startAccountVerification(
      database,
      verificationStart,
      verificationStartIds,
    );
    expect(pending.response.accountVerificationState).toBe('PENDING');
    expect(pendingReplay.replayed).toBe(true);
    expect(await listPendingVerifications(database, ids.centralActor)).toMatchObject([
      {
        verificationId: ids.verification,
        userId: ids.identityUser,
        displayName: 'Номер Один',
        moderationChecklistVersion: 'identity-mvp-v1',
        version: 1,
      },
    ]);

    const verificationApproval: CommandEnvelope<{
      readonly userId: string;
      readonly moderationChecklistVersion: string;
    }> = {
      commandId: ids.verificationApproveCommand,
      commandType: 'APPROVE_VERIFICATION',
      idempotencyKey: 'identity-verification-approve-1',
      actor: {
        type: 'USER',
        id: ids.centralActor,
        roles: ['CENTRAL_ADMIN'],
        scopeIds: [],
      },
      aggregateType: 'AccountVerification',
      aggregateId: ids.verification,
      expectedVersion: 1,
      correlationId: ids.identityCorrelation,
      causationId: ids.verificationStartEvent,
      requestId: ids.identityRequest,
      source: 'admin',
      payloadVersion: 1,
      payload: {
        userId: ids.identityUser,
        moderationChecklistVersion: 'identity-mvp-v1',
      },
    };
    await expect(
      approveAccountVerification(
        database,
        {
          ...verificationApproval,
          commandId: '0199a1b2-1234-7000-8000-000000000239',
          idempotencyKey: 'identity-verification-unauthorized',
          actor: {
            type: 'USER',
            id: ids.identityUser,
            roles: ['ATHLETE'],
            scopeIds: [],
          },
        },
        {
          eventId: ids.verificationApproveEvent,
          auditId: ids.verificationApproveAudit,
          outboxMessageId: ids.verificationApproveOutbox,
        },
      ),
    ).rejects.toBeInstanceOf(IdentityPermissionDeniedError);
    const approved = await approveAccountVerification(
      database,
      verificationApproval,
      {
        eventId: ids.verificationApproveEvent,
        auditId: ids.verificationApproveAudit,
        outboxMessageId: ids.verificationApproveOutbox,
      },
    );
    expect(approved.response.accountVerificationState).toBe('VERIFIED');
    expect(await listPendingVerifications(database, ids.centralActor)).toEqual([]);
    expect(
      (await readCommunityContext(database, ids.identityUser, ids.community))?.access
        .capabilities,
    ).toContain('CREATE_OFFICIAL_CHALLENGE');

    const verificationEvent = await sql<{ readonly payload: Record<string, unknown> }>`
      select payload
      from platform.domain_events
      where event_id = ${ids.verificationApproveEvent}::uuid
    `.execute(database);
    expect(verificationEvent.rows[0]?.payload).not.toHaveProperty('document');
    expect(verificationEvent.rows[0]?.payload).not.toHaveProperty('evidence');

    await sql`
      update identity.users set account_state = 'RESTRICTED'
      where user_id = ${ids.identityUser}::uuid
    `.execute(database);
    await expect(
      changeDisplayName(
        database,
        {
          ...rename,
          commandId: '0199a1b2-1234-7000-8000-000000000212',
          idempotencyKey: 'identity-display-name-restricted',
          expectedVersion: 4,
          payload: { displayName: 'Скрытая смена' },
        },
        renameIds,
      ),
    ).rejects.toBeInstanceOf(IdentityValidationError);
  });

  it('[AC-166] versions Pair Cooldown without rewriting existing Challenge or Session snapshots', async () => {
    const athleteA = testId(39000);
    const athleteB = testId(39001);
    const athleteC = testId(39002);
    const athleteD = testId(39003);
    const admin = testId(39004);
    const central = testId(39005);
    const coach = testId(39006);
    const venue = testId(39007);
    const venueConfiguration = testId(39008);
    const community = testId(39009);
    const originalConfiguration = testId(39010);
    const competition = testId(39011);
    const originalChat = testId(39020);
    const nextChat = testId(39021);
    const originalMatch = testId(39022);
    const nextMatch = testId(39023);
    const occurredAt = '2026-10-01T09:00:00.000Z';

    await database.transaction().execute(async (transaction) => {
      for (const [userId, phone, displayName] of [
        [athleteA, '+79990390000', 'Config Athlete A'],
        [athleteB, '+79990390001', 'Config Athlete B'],
        [athleteC, '+79990390002', 'Config Athlete C'],
        [athleteD, '+79990390003', 'Config Athlete D'],
        [admin, '+79990390004', 'Config Gym Admin'],
        [central, '+79990390005', 'Config Central'],
        [coach, '+79990390006', 'Config Coach'],
      ] as const) {
        await sql`
          insert into identity.users (
            user_id, phone_e164, phone_verified_at, birth_date, age_division,
            display_name, account_state, locale, version, activated_at
          ) values (
            ${userId}::uuid, ${phone}, ${occurredAt}::timestamptz,
            '1990-01-01', 'ADULT', ${displayName}, 'ACTIVE', 'ru-RU', 1,
            ${occurredAt}::timestamptz
          )
        `.execute(transaction);
      }
      for (const athlete of [athleteA, athleteB, athleteC, athleteD]) {
        await sql`
          insert into identity.athlete_profiles (
            user_id, primary_sport, discovery_radius_km
          ) values (${athlete}::uuid, 'BOXING', 15)
        `.execute(transaction);
        await sql`
          insert into identity.account_verifications (
            verification_id, user_id, state, method, moderation_checklist_version,
            verified_at, decided_by, decision_reason, is_current, version
          ) values (
            ${athlete}::uuid, ${athlete}::uuid, 'VERIFIED', 'CENTRAL_MODERATION',
            'identity-mvp-v1', ${occurredAt}::timestamptz, ${central}::uuid,
            'TEST_APPROVED', true, 1
          )
        `.execute(transaction);
      }
    });
    await ensureLocalPilotCommunity(database, {
      venueId: venue, venueConfigurationId: venueConfiguration,
      communityId: community, communityConfigurationId: originalConfiguration,
      membershipId: testId(39012), centralGrantId: testId(39016),
      athleteUserId: athleteA, centralActorId: central,
      legalName: 'Config Gym LLC', venueDisplayName: 'Config Gym',
      communityName: 'Config Community', address: 'Москва', cityCode: 'MOSCOW',
      timezone: 'Europe/Moscow', contactPayload: {}, occurredAt,
    });
    await ensureLocalPilotCompetition(database, {
      competitionId: competition, communityId: community,
      centralActorId: central, occurredAt,
      memberships: [
        { membershipId: testId(39012), userId: athleteA },
        { membershipId: testId(39013), userId: athleteB },
        { membershipId: testId(39014), userId: athleteC },
        { membershipId: testId(39015), userId: athleteD },
      ],
    });
    await sql`
      insert into community.role_grants (
        grant_id, user_id, role, scope_type, scope_id, state,
        authorized_by, authorized_at, version
      ) values
        (${testId(39017)}::uuid, ${admin}::uuid, 'GYM_ADMIN', 'VENUE', ${venue}::uuid,
          'ACTIVE', ${central}::uuid, ${occurredAt}::timestamptz, 1),
        (${testId(39018)}::uuid, ${coach}::uuid, 'COACH', 'COMMUNITY', ${community}::uuid,
          'ACTIVE', ${central}::uuid, ${occurredAt}::timestamptz, 1)
    `.execute(database);
    await database.transaction().execute(async (transaction) => {
      await sql`
        insert into social.chats (chat_id, scope, state, version, created_at, updated_at)
        values
          (${originalChat}::uuid, 'PERSONAL_MATCH', 'OPEN', 1,
            ${occurredAt}::timestamptz, ${occurredAt}::timestamptz),
          (${nextChat}::uuid, 'PERSONAL_MATCH', 'OPEN', 1,
            ${occurredAt}::timestamptz, ${occurredAt}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into social.chat_participants (chat_id, user_id, joined_at)
        values
          (${originalChat}::uuid, ${athleteA}::uuid, ${occurredAt}::timestamptz),
          (${originalChat}::uuid, ${athleteB}::uuid, ${occurredAt}::timestamptz),
          (${nextChat}::uuid, ${athleteC}::uuid, ${occurredAt}::timestamptz),
          (${nextChat}::uuid, ${athleteD}::uuid, ${occurredAt}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into social.matches (
          match_id, pair_low_id, pair_high_id, state, chat_id,
          last_activity_at, version, created_at, updated_at
        ) values
          (${originalMatch}::uuid, ${athleteA}::uuid, ${athleteB}::uuid, 'ACTIVE',
            ${originalChat}::uuid, ${occurredAt}::timestamptz, 1,
            ${occurredAt}::timestamptz, ${occurredAt}::timestamptz),
          (${nextMatch}::uuid, ${athleteC}::uuid, ${athleteD}::uuid, 'ACTIVE',
            ${nextChat}::uuid, ${occurredAt}::timestamptz, 1,
            ${occurredAt}::timestamptz, ${occurredAt}::timestamptz)
      `.execute(transaction);
    });

    const originalChallenge = testId(39030);
    const originalRulesetSnapshot = testId(39038);
    await createDirectOpenChallenge(database, {
      commandId: testId(39031), commandType: 'CREATE_DIRECT_OPEN_CHALLENGE',
      idempotencyKey: 'community-config-original-challenge',
      actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: originalChallenge, expectedVersion: 0,
      correlationId: testId(39032), causationId: null, requestId: testId(39033),
      source: 'api', payloadVersion: 1, payload: { sourceChatId: originalChat },
    }, {
      eventId: testId(39034), auditId: testId(39035), outboxMessageId: testId(39036),
      notificationId: testId(39037), notificationOutboxMessageId: testId(39039),
      serviceChatId: testId(39040), serviceChatEventId: testId(39041),
      rulesetSnapshotId: originalRulesetSnapshot, acknowledgmentId: testId(39042),
      reminderTimerOutboxMessageIds: [testId(39043), testId(39044)],
    }, () => new Date('2026-10-01T10:00:00.000Z'));
    await acceptOptionalChallenge(database, {
      commandId: testId(39045), commandType: 'ACCEPT_OPTIONAL_CHALLENGE',
      idempotencyKey: 'community-config-original-accept',
      actor: { type: 'USER', id: athleteB, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: originalChallenge, expectedVersion: 1,
      correlationId: testId(39046), causationId: testId(39034), requestId: testId(39047),
      source: 'api', payloadVersion: 1, payload: { challengeId: originalChallenge },
    }, {
      eventId: testId(39048), auditId: testId(39049), outboxMessageId: testId(39050),
      notificationId: testId(39051), notificationOutboxMessageId: testId(39052),
      acknowledgmentId: testId(39053), obligationIds: [testId(39054), testId(39055)],
    }, () => new Date('2026-10-01T11:00:00.000Z'));

    const booking = testId(39056);
    const slot = testId(39057);
    const session = testId(39058);
    const sessionSnapshot = testId(39059);
    await database.transaction().execute(async (transaction) => {
      await sql`set constraints all deferred`.execute(transaction);
      await sql`
        insert into scheduling.slots (
          slot_id, venue_id, coach_user_id, start_at, end_at, slot_type, state,
          commercial_version, booking_id, published_by, version
        ) values (
          ${slot}::uuid, ${venue}::uuid, ${coach}::uuid,
          '2026-10-02T08:00:00Z', '2026-10-02T09:00:00Z', 'PERSONAL', 'BOOKED',
          1, ${booking}::uuid, ${admin}::uuid, 2
        )
      `.execute(transaction);
      await sql`
        insert into scheduling.bookings (
          booking_id, chat_id, match_id, slot_id, pair_low_id, pair_high_id,
          purpose, state, initiated_by, selected_by_low_at, selected_by_high_at,
          selection_expires_at, host_confirmation_deadline_at,
          commercial_terms_snapshot, host_confirmed_by, host_confirmed_at,
          version, created_at, updated_at, challenge_id
        ) values (
          ${booking}::uuid, ${originalChat}::uuid, ${originalMatch}::uuid, ${slot}::uuid,
          ${athleteA}::uuid, ${athleteB}::uuid, 'OFFICIAL_CHALLENGE', 'CONFIRMED_PAIR',
          ${athleteA}::uuid, '2026-10-01T12:00:00Z', '2026-10-01T12:01:00Z',
          '2026-10-01T13:00:00Z', '2026-10-02T12:00:00Z', '{}'::jsonb,
          ${admin}::uuid, '2026-10-01T12:02:00Z', 3,
          '2026-10-01T12:00:00Z', '2026-10-01T12:02:00Z', ${originalChallenge}::uuid
        )
      `.execute(transaction);
      await sql`
        insert into scheduling.sessions (
          session_id, booking_id, venue_id, coach_user_id, pair_low_id, pair_high_id,
          purpose, state, scheduled_start_at, scheduled_end_at, window_opened_at,
          commercial_terms_snapshot, version, created_at, updated_at, challenge_id
        ) values (
          ${session}::uuid, ${booking}::uuid, ${venue}::uuid, ${coach}::uuid,
          ${athleteA}::uuid, ${athleteB}::uuid, 'OFFICIAL_CHALLENGE', 'READY_FOR_COACH',
          '2026-10-02T08:00:00Z', '2026-10-02T09:00:00Z', '2026-10-02T08:00:00Z',
          '{}'::jsonb, 1,
          '2026-10-01T12:02:00Z', '2026-10-01T12:02:00Z', ${originalChallenge}::uuid
        )
      `.execute(transaction);
      await sql`
        insert into scheduling.session_competitive_snapshots (
          snapshot_id, session_id, challenge_id, competition_id, ruleset_snapshot_id,
          community_configuration_id, planned_stake, effective_stake,
          competition_status_version, venue_id, coach_user_id, pair_low_id, pair_high_id,
          scheduled_start_at, scheduled_end_at, created_at
        ) values (
          ${sessionSnapshot}::uuid, ${session}::uuid, ${originalChallenge}::uuid,
          ${competition}::uuid, ${originalRulesetSnapshot}::uuid,
          ${originalConfiguration}::uuid, 'NONE', 'NONE', 0, ${venue}::uuid,
          ${coach}::uuid, ${athleteA}::uuid, ${athleteB}::uuid,
          '2026-10-02T08:00:00Z', '2026-10-02T09:00:00Z', '2026-10-02T08:00:00Z'
        )
      `.execute(transaction);
      await sql`
        insert into competition.pair_cooldowns (
          cooldown_id, competition_id, pair_low_id, pair_high_id, started_at, ends_at
        ) values (
          ${testId(39067)}::uuid, ${competition}::uuid,
          ${athleteA}::uuid, ${athleteB}::uuid,
          '2026-10-01T12:00:00Z', '2026-10-16T12:00:00Z'
        )
      `.execute(transaction);
    });

    const configurationCommand = {
      commandId: testId(39060), commandType: 'CHANGE_COMMUNITY_PAIR_COOLDOWN',
      idempotencyKey: 'community-config-cooldown-20',
      actor: { type: 'USER', id: admin, roles: ['GYM_ADMIN'], scopeIds: [venue] },
      aggregateType: 'Community', aggregateId: community, expectedVersion: 1,
      correlationId: testId(39061), causationId: null, requestId: testId(39062),
      source: 'admin', payloadVersion: 1,
      payload: { communityId: community, pairCooldownDays: 20 },
    } satisfies CommandEnvelope<{
      readonly communityId: string;
      readonly pairCooldownDays: number;
    }>;
    const configurationIds = {
      configurationId: testId(39063), eventId: testId(39064),
      auditId: testId(39065), outboxMessageId: testId(39066),
    };
    const changed = await changeCommunityPairCooldown(
      database, configurationCommand, configurationIds,
      () => new Date('2026-10-02T09:00:00.000Z'),
    );
    const replayed = await changeCommunityPairCooldown(
      database, configurationCommand, configurationIds,
      () => new Date('2026-10-02T09:00:00.000Z'),
    );
    expect(changed.response).toMatchObject({
      communityId: community, configurationId: configurationIds.configurationId,
      configurationVersion: 2, pairCooldownDays: 20,
      noShowGraceMinutes: 15, version: 2,
    });
    expect(replayed).toMatchObject({ replayed: true, response: changed.response });
    expect(await readCommunityContext(database, admin, community)).toMatchObject({
      community: {
        configurationId: configurationIds.configurationId,
        configurationVersion: 2, pairCooldownDays: 20, version: 2,
      },
    });

    const nextChallenge = testId(39070);
    const nextRulesetSnapshot = testId(39078);
    await createDirectOpenChallenge(database, {
      commandId: testId(39071), commandType: 'CREATE_DIRECT_OPEN_CHALLENGE',
      idempotencyKey: 'community-config-next-challenge',
      actor: { type: 'USER', id: athleteC, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: nextChallenge, expectedVersion: 0,
      correlationId: testId(39072), causationId: null, requestId: testId(39073),
      source: 'api', payloadVersion: 1, payload: { sourceChatId: nextChat },
    }, {
      eventId: testId(39074), auditId: testId(39075), outboxMessageId: testId(39076),
      notificationId: testId(39077), notificationOutboxMessageId: testId(39079),
      serviceChatId: testId(39080), serviceChatEventId: testId(39081),
      rulesetSnapshotId: nextRulesetSnapshot, acknowledgmentId: testId(39082),
      reminderTimerOutboxMessageIds: [testId(39083), testId(39084)],
    }, () => new Date('2026-10-02T10:00:00.000Z'));

    const frozenReferences = await sql<{
      readonly original_ruleset_configuration: string;
      readonly session_configuration: string;
      readonly next_ruleset_configuration: string;
    }>`
      select
        (select community_configuration_id::text from competition.ruleset_snapshots
          where ruleset_snapshot_id = ${originalRulesetSnapshot}::uuid)
          as original_ruleset_configuration,
        (select community_configuration_id::text from scheduling.session_competitive_snapshots
          where snapshot_id = ${sessionSnapshot}::uuid) as session_configuration,
        (select community_configuration_id::text from competition.ruleset_snapshots
          where ruleset_snapshot_id = ${nextRulesetSnapshot}::uuid)
          as next_ruleset_configuration
    `.execute(database);
    expect(frozenReferences.rows[0]).toEqual({
      original_ruleset_configuration: originalConfiguration,
      session_configuration: originalConfiguration,
      next_ruleset_configuration: configurationIds.configurationId,
    });
    const versions = await sql<{
      readonly configuration_version: number;
      readonly pair_cooldown_days: number;
    }>`
      select configuration_version, pair_cooldown_days
      from community.community_configuration_versions
      where community_id = ${community}::uuid
      order by configuration_version
    `.execute(database);
    expect(versions.rows).toEqual([
      { configuration_version: 1, pair_cooldown_days: 15 },
      { configuration_version: 2, pair_cooldown_days: 20 },
    ]);
    const preservedCooldown = await sql<{ readonly ends_at: Date }>`
      select ends_at from competition.pair_cooldowns
      where cooldown_id = ${testId(39067)}::uuid
    `.execute(database);
    expect(preservedCooldown.rows[0]?.ends_at.toISOString())
      .toBe('2026-10-16T12:00:00.000Z');

    await expect(changeCommunityPairCooldown(database, {
      ...configurationCommand, commandId: testId(39085),
      idempotencyKey: 'community-config-out-of-range', expectedVersion: 2,
      payload: { communityId: community, pairCooldownDays: 31 },
    }, {
      configurationId: testId(39086), eventId: testId(39087),
      auditId: testId(39088), outboxMessageId: testId(39089),
    })).rejects.toMatchObject({ code: 'PAIR_COOLDOWN_OUT_OF_RANGE' });
    await expect(changeCommunityPairCooldown(database, {
      ...configurationCommand, commandId: testId(39090),
      idempotencyKey: 'community-config-unauthorized', expectedVersion: 2,
      actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
      payload: { communityId: community, pairCooldownDays: 21 },
    }, {
      configurationId: testId(39091), eventId: testId(39092),
      auditId: testId(39093), outboxMessageId: testId(39094),
    })).rejects.toBeInstanceOf(CommunityConfigurationConflictError);
    await expect(changeCommunityPairCooldown(database, {
      ...configurationCommand, commandId: testId(39095),
      idempotencyKey: 'community-config-stale', expectedVersion: 1,
      payload: { communityId: community, pairCooldownDays: 21 },
    }, {
      configurationId: testId(39096), eventId: testId(39097),
      auditId: testId(39098), outboxMessageId: testId(39099),
    })).rejects.toBeInstanceOf(VersionConflictError);
    const sideEffects = await sql<{
      readonly events: string;
      readonly audits: string;
      readonly outbox: string;
      readonly cooldowns: string;
    }>`
      select
        (select count(*)::text from platform.domain_events
          where event_id = ${configurationIds.eventId}::uuid) as events,
        (select count(*)::text from platform.audit_events
          where audit_id = ${configurationIds.auditId}::uuid) as audits,
        (select count(*)::text from platform.outbox_messages
          where message_id = ${configurationIds.outboxMessageId}::uuid) as outbox,
        (select count(*)::text from competition.pair_cooldowns) as cooldowns
    `.execute(database);
    expect(sideEffects.rows[0]).toEqual({
      events: '1', audits: '1', outbox: '1', cooldowns: '1',
    });
  });

  it('[AC-018] invites and authorizes a verified Community Coach with database-backed scope checks', async () => {
    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values
        (${ids.centralActor}::uuid, '+79990000225', '2026-09-05T08:00:00Z',
          '1990-01-01', 'ADULT', 'Central', 'ACTIVE', 'ru-RU', 1, '2026-09-05T08:00:00Z'),
        (${ids.roleCoach}::uuid, '+79990000240', '2026-09-05T08:00:00Z',
          '1991-01-01', 'ADULT', 'Coach', 'ACTIVE', 'ru-RU', 1, '2026-09-05T08:00:00Z'),
        (${ids.roleUnverified}::uuid, '+79990000241', '2026-09-05T08:00:00Z',
          '1992-01-01', 'ADULT', 'Unverified', 'ACTIVE', 'ru-RU', 1, '2026-09-05T08:00:00Z')
    `.execute(database);
    await sql`
      insert into identity.athlete_profiles (
        user_id, primary_sport, secondary_sport, discovery_radius_km
      ) values
        (${ids.centralActor}::uuid, 'BOXING', null, 15),
        (${ids.roleCoach}::uuid, 'BOXING', null, 15),
        (${ids.roleUnverified}::uuid, 'BOXING', null, 15)
    `.execute(database);
    await sql`
      insert into identity.account_verifications (
        verification_id, user_id, state, method, moderation_checklist_version,
        verified_at, decided_by, decision_reason, is_current, version
      ) values (
        '0199a1b2-1234-7000-8000-000000000251'::uuid,
        ${ids.roleCoach}::uuid, 'VERIFIED', 'CENTRAL_MODERATION', 'identity-mvp-v1',
        '2026-09-05T08:30:00Z', ${ids.centralActor}::uuid,
        'PROFILE_PHONE_DUPLICATE_CHECKS_PASSED', true, 2
      )
    `.execute(database);
    await ensureLocalPilotCommunity(database, {
      venueId: ids.venue,
      venueConfigurationId: ids.venueConfiguration,
      communityId: ids.community,
      communityConfigurationId: ids.communityConfiguration,
      membershipId: ids.membership,
      centralGrantId: ids.centralGrant,
      athleteUserId: ids.roleCoach,
      centralActorId: ids.centralActor,
      legalName: 'Pilot Legal Name',
      venueDisplayName: 'Pilot Gym',
      communityName: 'Pilot Community',
      address: 'Pilot address',
      cityCode: 'MOSCOW',
      timezone: 'Europe/Moscow',
      contactPayload: { phone: '+79990000220' },
      occurredAt: '2026-09-06T08:00:00.000Z',
    });
    await expect(hasActiveCentralRole(database, ids.centralActor)).resolves.toBe(true);
    await expect(hasActiveCentralRole(database, ids.roleCoach)).resolves.toBe(false);

    const invitation: CommandEnvelope<{
      readonly userId: string;
      readonly communityId: string;
      readonly reasonCode: string;
      readonly invitationTtlHours: number;
    }> = {
      commandId: ids.roleInviteCommand,
      commandType: 'INVITE_COACH',
      idempotencyKey: 'role-invite-1',
      actor: {
        type: 'USER',
        id: ids.centralActor,
        roles: ['CENTRAL_ADMIN'],
        scopeIds: [ids.community],
      },
      aggregateType: 'RoleGrant',
      aggregateId: ids.roleGrant,
      expectedVersion: 0,
      correlationId: ids.identityCorrelation,
      causationId: null,
      requestId: ids.identityRequest,
      source: 'admin',
      payloadVersion: 1,
      payload: {
        userId: ids.roleCoach,
        communityId: ids.community,
        reasonCode: 'PILOT_COACH',
        invitationTtlHours: 72,
      },
    };
    const invitationIds = {
      eventId: ids.roleInviteEvent,
      auditId: ids.roleInviteAudit,
      outboxMessageId: ids.roleInviteOutbox,
      notificationId: ids.roleInviteNotification,
    };
    const invited = await inviteCoach(database, invitation, invitationIds);
    const replay = await inviteCoach(database, invitation, invitationIds);
    expect(invited).toMatchObject({
      replayed: false,
      responseStatus: 201,
      response: {
        grantId: ids.roleGrant,
        state: 'PENDING',
        role: 'COACH',
        scopeId: ids.community,
        version: 1,
      },
    });
    expect(replay.replayed).toBe(true);
    expect(await listPendingCoachInvites(database, ids.roleCoach)).toMatchObject([
      { grantId: ids.roleGrant, state: 'PENDING' },
    ]);
    const inviteOutbox = await sql<{
      readonly topic: string;
      readonly payload: {
        readonly notifications: ReadonlyArray<{
          readonly notificationId: string;
          readonly recipientUserId: string;
          readonly renderKey: string;
        }>;
      };
    }>`
      select topic, payload
      from platform.outbox_messages
      where message_id = ${ids.roleInviteOutbox}::uuid
    `.execute(database);
    expect(inviteOutbox.rows[0]).toMatchObject({
      topic: 'notification.in_app.v1',
      payload: {
        notifications: [
          {
            notificationId: ids.roleInviteNotification,
            recipientUserId: ids.roleCoach,
            renderKey: 'community.coach_invited',
          },
        ],
      },
    });

    await expect(
      inviteCoach(
        database,
        {
          ...invitation,
          commandId: '0199a1b2-1234-7000-8000-000000000252',
          aggregateId: '0199a1b2-1234-7000-8000-000000000253',
          idempotencyKey: 'role-invite-unscoped',
          actor: {
            type: 'USER',
            id: ids.roleCoach,
            roles: ['ATHLETE'],
            scopeIds: [],
          },
        },
        invitationIds,
      ),
    ).rejects.toBeInstanceOf(RoleGrantPermissionDeniedError);
    await expect(
      inviteCoach(
        database,
        {
          ...invitation,
          commandId: '0199a1b2-1234-7000-8000-000000000254',
          aggregateId: '0199a1b2-1234-7000-8000-000000000255',
          idempotencyKey: 'role-invite-unverified',
          payload: { ...invitation.payload, userId: ids.roleUnverified },
        },
        invitationIds,
      ),
    ).rejects.toBeInstanceOf(RoleGrantValidationError);

    const acceptance: CommandEnvelope<{ readonly userId: string }> = {
      commandId: ids.roleAcceptCommand,
      commandType: 'ACCEPT_COACH_ROLE',
      idempotencyKey: 'role-accept-1',
      actor: {
        type: 'USER',
        id: ids.roleCoach,
        roles: ['ATHLETE'],
        scopeIds: [],
      },
      aggregateType: 'RoleGrant',
      aggregateId: ids.roleGrant,
      expectedVersion: 1,
      correlationId: ids.identityCorrelation,
      causationId: ids.roleInviteEvent,
      requestId: ids.identityRequest,
      source: 'api',
      payloadVersion: 1,
      payload: { userId: ids.roleCoach },
    };
    await expect(
      acceptCoachInvite(
        database,
        {
          ...acceptance,
          commandId: '0199a1b2-1234-7000-8000-000000000256',
          idempotencyKey: 'role-accept-wrong-user',
          actor: {
            type: 'USER',
            id: ids.centralActor,
            roles: ['CENTRAL_ADMIN'],
            scopeIds: [],
          },
        },
        {
          eventId: ids.roleAcceptEvent,
          auditId: ids.roleAcceptAudit,
          outboxMessageId: ids.roleAcceptOutbox,
          notificationId: ids.roleAcceptNotification,
        },
      ),
    ).rejects.toBeInstanceOf(RoleGrantPermissionDeniedError);
    const accepted = await acceptCoachInvite(database, acceptance, {
      eventId: ids.roleAcceptEvent,
      auditId: ids.roleAcceptAudit,
      outboxMessageId: ids.roleAcceptOutbox,
      notificationId: ids.roleAcceptNotification,
    });
    expect(accepted.response).toMatchObject({
      state: 'ACTIVE',
      authorizedBy: ids.centralActor,
      version: 2,
    });
    expect(accepted.response.authorizedAt).not.toBeNull();
    expect(accepted.response.expiresAt).toBeNull();
    expect(await listPendingCoachInvites(database, ids.roleCoach)).toEqual([]);
    expect(
      (await readCommunityContext(database, ids.roleCoach, ids.community))?.access
        .capabilities,
    ).toContain('RECORD_COMMUNITY_RESULT');

    await expect(
      inviteCoach(
        database,
        {
          ...invitation,
          commandId: '0199a1b2-1234-7000-8000-000000000257',
          aggregateId: '0199a1b2-1234-7000-8000-000000000258',
          idempotencyKey: 'role-invite-duplicate-active',
        },
        invitationIds,
      ),
    ).rejects.toBeInstanceOf(InvalidRoleGrantTransitionError);

    const audit = await sql<{ readonly reason_code: string | null }>`
      select reason_code
      from platform.audit_events
      where audit_id = ${ids.roleInviteAudit}::uuid
    `.execute(database);
    expect(audit.rows[0]?.reason_code).toBe('PILOT_COACH');

    const adminCommand = (
      userId: string,
      aggregateId: string,
      commandId: string,
      idempotencyKey: string,
      actorId: string = ids.centralActor,
    ): CommandEnvelope<{
      readonly userId: string;
      readonly venueId: string;
      readonly reasonCode: string;
    }> => ({
      commandId,
      commandType: 'APPOINT_ADMIN',
      idempotencyKey,
      actor: { type: 'USER', id: actorId, roles: [], scopeIds: [] },
      aggregateType: 'RoleGrant',
      aggregateId,
      expectedVersion: 0,
      correlationId: ids.identityCorrelation,
      causationId: null,
      requestId: ids.identityRequest,
      source: 'admin',
      payloadVersion: 1,
      payload: { userId, venueId: ids.venue, reasonCode: 'PILOT_ADMIN' },
    });
    const roleEffects = (offset: number) => ({
      eventId: testId(offset),
      auditId: testId(offset + 1),
      outboxMessageId: testId(offset + 2),
      notificationId: testId(offset + 3),
    });

    await expect(
      appointGymAdmin(
        database,
        adminCommand(
          ids.roleCoach,
          testId(300),
          testId(301),
          'admin-appoint-not-central',
          ids.roleCoach,
        ),
        roleEffects(302),
      ),
    ).rejects.toBeInstanceOf(RoleGrantPermissionDeniedError);
    await expect(
      appointGymAdmin(
        database,
        adminCommand(
          ids.roleUnverified,
          testId(306),
          testId(307),
          'admin-appoint-unverified',
        ),
        roleEffects(308),
      ),
    ).rejects.toBeInstanceOf(RoleGrantValidationError);

    await sql`
      insert into identity.account_verifications (
        verification_id, user_id, state, method, moderation_checklist_version,
        verified_at, decided_by, decision_reason, is_current, version
      ) values (
        ${testId(312)}::uuid, ${ids.roleUnverified}::uuid,
        'VERIFIED', 'CENTRAL_MODERATION', 'identity-mvp-v1',
        '2026-09-06T09:00:00Z', ${ids.centralActor}::uuid,
        'PROFILE_PHONE_DUPLICATE_CHECKS_PASSED', true, 2
      )
    `.execute(database);
    const firstAdminGrantId = testId(313);
    const secondAdminGrantId = testId(319);
    const firstAdmin = await appointGymAdmin(
      database,
      adminCommand(ids.roleCoach, firstAdminGrantId, testId(314), 'admin-appoint-first'),
      roleEffects(315),
    );
    const secondAdmin = await appointGymAdmin(
      database,
      adminCommand(
        ids.roleUnverified,
        secondAdminGrantId,
        testId(320),
        'admin-appoint-second',
      ),
      roleEffects(321),
    );
    expect(firstAdmin.response).toMatchObject({
      role: 'GYM_ADMIN',
      state: 'ACTIVE',
      userId: ids.roleCoach,
    });
    expect(secondAdmin.response).toMatchObject({
      role: 'GYM_ADMIN',
      state: 'ACTIVE',
      userId: ids.roleUnverified,
    });

    const primaryCommand = (
      userId: string,
      expectedVersion: number,
      commandId: string,
      idempotencyKey: string,
    ): CommandEnvelope<{
      readonly userId: string;
      readonly venueId: string;
      readonly reasonCode: string;
    }> => ({
      commandId,
      commandType: 'SET_PRIMARY_ADMIN',
      idempotencyKey,
      actor: {
        type: 'USER',
        id: ids.centralActor,
        roles: ['CENTRAL_ADMIN'],
        scopeIds: [],
      },
      aggregateType: 'VenuePrimaryAdmin',
      aggregateId: ids.venue,
      expectedVersion,
      correlationId: ids.identityCorrelation,
      causationId: null,
      requestId: ids.identityRequest,
      source: 'admin',
      payloadVersion: 1,
      payload: { userId, venueId: ids.venue, reasonCode: 'PRIMARY_SUCCESSION' },
    });
    const primaryEffects = (offset: number) => ({
      eventId: testId(offset),
      auditId: testId(offset + 1),
      outboxMessageId: testId(offset + 2),
      primaryGrantId: testId(offset + 3),
      targetNotificationId: testId(offset + 4),
      previousNotificationId: testId(offset + 5),
    });

    const appointedPrimary = await changePrimaryAdmin(
      database,
      primaryCommand(ids.roleCoach, 0, testId(325), 'primary-appoint-first'),
      primaryEffects(326),
    );
    expect(appointedPrimary.response).toMatchObject({
      change: 'APPOINTED',
      primaryAdminUserId: ids.roleCoach,
      previousPrimaryAdminUserId: null,
      version: 1,
    });
    const transferredPrimary = await changePrimaryAdmin(
      database,
      primaryCommand(ids.roleUnverified, 1, testId(332), 'primary-transfer-second'),
      primaryEffects(333),
    );
    expect(transferredPrimary.response).toMatchObject({
      change: 'TRANSFERRED',
      primaryAdminUserId: ids.roleUnverified,
      previousPrimaryAdminUserId: ids.roleCoach,
      version: 2,
    });

    const racingTransfers = await Promise.allSettled([
      changePrimaryAdmin(
        database,
        primaryCommand(ids.roleCoach, 2, testId(339), 'primary-race-one'),
        primaryEffects(340),
      ),
      changePrimaryAdmin(
        database,
        primaryCommand(ids.roleCoach, 2, testId(346), 'primary-race-two'),
        primaryEffects(347),
      ),
    ]);
    expect(racingTransfers.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejectedRace = racingTransfers.find((result) => result.status === 'rejected');
    expect(rejectedRace).toMatchObject({
      status: 'rejected',
      reason: expect.any(VersionConflictError),
    });
    const activePrimary = await sql<{ readonly user_id: string; readonly count: string }>`
      select min(user_id::text) as user_id, count(*)::text as count
      from community.role_grants
      where role = 'PRIMARY_ADMIN'
        and scope_type = 'VENUE'
        and scope_id = ${ids.venue}::uuid
        and state = 'ACTIVE'
    `.execute(database);
    expect(activePrimary.rows[0]).toEqual({ user_id: ids.roleCoach, count: '1' });
    const roleSummary = await readVenueRoleSummary(
      database,
      ids.centralActor,
      ids.venue,
    );
    expect(roleSummary).toMatchObject({
      venueId: ids.venue,
      primaryAdminVersion: 3,
      activeGrants: expect.arrayContaining([
        expect.objectContaining({ userId: ids.roleCoach, role: 'GYM_ADMIN' }),
        expect.objectContaining({ userId: ids.roleUnverified, role: 'GYM_ADMIN' }),
        expect.objectContaining({ userId: ids.roleCoach, role: 'PRIMARY_ADMIN' }),
      ]),
    });
  });

  it('[AC-019] scopes a verified Guest Coach to one Session and expires the grant after cancellation', async () => {
    const fixture = await seedConfirmedTrainingForConversion(125000);
    const other = await seedConfirmedTrainingForConversion(125100);
    const grantId = testId(125200);
    const authorizedAt = new Date('2026-09-28T10:00:00.000Z');

    await sql`
      delete from community.role_grants
      where user_id = ${fixture.coach}::uuid and role = 'COACH'
    `.execute(database);
    await sql`
      insert into identity.account_verifications (
        verification_id, user_id, state, method, moderation_checklist_version,
        is_current, verified_at, decided_by, decision_reason, version
      ) values (
        ${testId(125201)}::uuid, ${fixture.coach}::uuid, 'VERIFIED',
        'CENTRAL_MODERATION', 'identity-mvp-v1', true,
        ${authorizedAt.toISOString()}::timestamptz, ${fixture.central}::uuid,
        'GUEST_COACH_CHECKS_PASSED', 1
      )
    `.execute(database);
    await sql`
      update scheduling.sessions
      set coach_user_id = ${fixture.coach}::uuid
      where session_id = ${other.session}::uuid
    `.execute(database);

    const authorizationCommand = {
      commandId: testId(125202), commandType: 'AUTHORIZE_GUEST_COACH',
      idempotencyKey: `session:${fixture.session}:guest-coach:${fixture.coach}:v1`,
      actor: {
        type: 'USER' as const, id: fixture.central,
        roles: ['CENTRAL_ADMIN'], scopeIds: [],
      },
      aggregateType: 'RoleGrant', aggregateId: grantId, expectedVersion: 0,
      correlationId: testId(125203), causationId: null,
      requestId: testId(125204), source: 'api', payloadVersion: 1,
      payload: {
        userId: fixture.coach, sessionId: fixture.session,
        reasonCode: 'SESSION_GUEST_COVERAGE',
      },
    } satisfies CommandEnvelope<AuthorizeGuestCoachPayload>;
    const authorizationEffects = {
      eventId: testId(125205), auditId: testId(125206),
      outboxMessageId: testId(125207), notificationId: testId(125208),
    };
    const authorized = await authorizeGuestCoach(
      database, authorizationCommand, authorizationEffects, () => authorizedAt,
    );
    expect(authorized.response).toMatchObject({
      grantId, userId: fixture.coach, role: 'COACH', scopeType: 'SESSION',
      scopeId: fixture.session, state: 'ACTIVE', version: 1,
      expiresAt: '2026-10-31T11:00:00.000Z',
    });
    await expect(authorizeGuestCoach(
      database, authorizationCommand, authorizationEffects, () => authorizedAt,
    )).resolves.toMatchObject({ replayed: true, response: { grantId, version: 1 } });
    await expect(authorizeGuestCoach(database, {
      ...authorizationCommand,
      payload: { ...authorizationCommand.payload, reasonCode: 'DIFFERENT_REASON' },
    }, authorizationEffects, () => authorizedAt)).rejects.toBeInstanceOf(
      IdempotencyKeyReusedError,
    );
    await expect(authorizeGuestCoach(database, {
      ...authorizationCommand,
      commandId: testId(125209), idempotencyKey: 'guest-coach-stale-version',
      expectedVersion: 1,
    }, {
      eventId: testId(125210), auditId: testId(125211),
      outboxMessageId: testId(125212), notificationId: testId(125213),
    }, () => authorizedAt)).rejects.toBeInstanceOf(VersionConflictError);
    await expect(authorizeGuestCoach(database, {
      ...authorizationCommand,
      commandId: testId(125214), idempotencyKey: 'guest-coach-unauthorized',
      aggregateId: testId(125215),
      actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
    }, {
      eventId: testId(125216), auditId: testId(125217),
      outboxMessageId: testId(125218), notificationId: testId(125219),
    }, () => authorizedAt)).rejects.toBeInstanceOf(RoleGrantPermissionDeniedError);

    await expect(readSession(database, fixture.session, fixture.coach)).resolves.toMatchObject({
      guestCoachGrantId: grantId,
      guestCoachGrantState: 'ACTIVE',
      viewerCanManage: true,
    });
    await expect(readSession(database, other.session, fixture.coach)).resolves.toMatchObject({
      guestCoachGrantId: null,
      viewerCanManage: false,
    });

    const cancellationAt = new Date('2026-09-28T10:30:00.000Z');
    await failSessionExternal(database, {
      commandId: testId(125220), commandType: 'FAIL_SESSION_EXTERNAL',
      idempotencyKey: `session:${fixture.session}:external-failure:v1`,
      actor: {
        type: 'USER', id: fixture.central, roles: ['CENTRAL_ADMIN'], scopeIds: [],
      },
      aggregateType: 'Session', aggregateId: fixture.session, expectedVersion: 1,
      correlationId: testId(125221), causationId: authorizationEffects.eventId,
      requestId: testId(125222), source: 'api', payloadVersion: 1,
      payload: { sessionId: fixture.session, reasonCode: 'VENUE_UNAVAILABLE' },
    } satisfies CommandEnvelope<FailSessionExternalPayload>, {
      eventId: testId(125223), auditId: testId(125224),
      outboxMessageId: testId(125225), bookingEventId: testId(125226),
      slotEventId: testId(125227), notificationOutboxMessageId: testId(125228),
      notificationIds: [testId(125229), testId(125230)],
    }, () => cancellationAt);
    await expect(readSession(database, fixture.session, fixture.coach)).resolves.toMatchObject({
      state: 'CANCELLED', guestCoachGrantState: 'ACTIVE', viewerCanManage: false,
    });

    const candidates = await listExpirableGuestCoachGrants(
      database, 100, new Date('2026-09-28T10:31:00.000Z'),
    );
    expect(candidates).toContainEqual({
      grantId, sessionId: fixture.session, version: 1, reason: 'SESSION_CANCELLED',
    });
    const expiryAt = new Date('2026-09-28T10:31:00.000Z');
    const expiryCommand = {
      commandId: testId(125231), commandType: 'EXPIRE_GUEST_COACH',
      idempotencyKey: `role-grant:${grantId}:expire:v1`,
      actor: { type: 'SYSTEM' as const, id: null, roles: [], scopeIds: [] },
      aggregateType: 'RoleGrant', aggregateId: grantId, expectedVersion: 1,
      correlationId: testId(125232), causationId: testId(125223),
      requestId: testId(125233), source: 'scheduler', payloadVersion: 1,
      payload: {
        grantId, sessionId: fixture.session, reason: 'SESSION_CANCELLED' as const,
      },
    } satisfies CommandEnvelope<ExpireGuestCoachPayload>;
    const expiryEffects = {
      eventId: testId(125234), auditId: testId(125235),
      outboxMessageId: testId(125236), notificationId: testId(125237),
    };
    const expired = await expireGuestCoachGrant(
      database, expiryCommand, expiryEffects, () => expiryAt,
    );
    expect(expired.response).toMatchObject({
      grantId, state: 'EXPIRED', expiresAt: expiryAt.toISOString(), version: 2,
    });
    await expect(expireGuestCoachGrant(
      database, expiryCommand, expiryEffects, () => expiryAt,
    )).resolves.toMatchObject({ replayed: true, response: { state: 'EXPIRED', version: 2 } });
    await expect(readSession(database, fixture.session, fixture.coach)).resolves.toMatchObject({
      state: 'CANCELLED', guestCoachGrantState: 'EXPIRED', viewerCanManage: false,
    });

    const lineage = await sql<{
      readonly state: string;
      readonly version: string;
      readonly authorized_by: string;
      readonly events: string;
      readonly audits: string;
      readonly outbox: string;
      readonly denied_effects: string;
      readonly authorized_actor_role: string;
    }>`
      select role_grant.state, role_grant.version::text as version,
        role_grant.authorized_by,
        (select count(*)::text from platform.domain_events
          where event_id in (${authorizationEffects.eventId}::uuid, ${expiryEffects.eventId}::uuid)) as events,
        (select count(*)::text from platform.audit_events
          where audit_id in (${authorizationEffects.auditId}::uuid, ${expiryEffects.auditId}::uuid)) as audits,
        (select count(*)::text from platform.outbox_messages
          where message_id in (${authorizationEffects.outboxMessageId}::uuid, ${expiryEffects.outboxMessageId}::uuid)) as outbox,
        (select count(*)::text from platform.domain_events
          where event_id = ${testId(125216)}::uuid) as denied_effects,
        (select metadata ->> 'authorizedActorRole' from platform.audit_events
          where audit_id = ${authorizationEffects.auditId}::uuid) as authorized_actor_role
      from community.role_grants as role_grant
      where role_grant.grant_id = ${grantId}::uuid
    `.execute(database);
    expect(lineage.rows[0]).toEqual({
      state: 'EXPIRED', version: '2', authorized_by: fixture.central,
      events: '2', audits: '2', outbox: '2', denied_effects: '0',
      authorized_actor_role: 'CENTRAL_ADMIN',
    });
  });

  it('[AC-012] projects only eligible Discovery cards with visible deterministic rank reasons', async () => {
    const viewerId = testId(400);
    const eligibleId = testId(401);
    const youthId = testId(402);
    const blockedId = testId(403);
    const suppressedId = testId(404);
    const matchedId = testId(405);
    const pausedId = testId(406);
    const centralId = testId(407);
    const venueId = testId(408);
    const userValues = [
      [viewerId, '+79991000400', '1994-01-01', 'ADULT', 'Viewer', false],
      [eligibleId, '+79991000401', '1995-01-01', 'ADULT', 'Visible Candidate', false],
      [youthId, '+79991000402', '2010-01-01', 'YOUTH', 'Youth Candidate', false],
      [blockedId, '+79991000403', '1993-01-01', 'ADULT', 'Blocked Candidate', false],
      [suppressedId, '+79991000404', '1992-01-01', 'ADULT', 'Suppressed Candidate', false],
      [matchedId, '+79991000405', '1991-01-01', 'ADULT', 'Matched Candidate', false],
      [pausedId, '+79991000406', '1990-01-01', 'ADULT', 'Paused Candidate', true],
      [centralId, '+79991000407', '1989-01-01', 'ADULT', 'Central', false],
    ] as const;
    for (const [userId, phone, birthDate, ageDivision, displayName, paused] of userValues) {
      await sql`
        insert into identity.users (
          user_id, phone_e164, phone_verified_at, birth_date, age_division,
          display_name, account_state, discovery_paused, locale, version, activated_at
        ) values (
          ${userId}::uuid, ${phone}, '2026-09-01T09:00:00Z', ${birthDate}::date,
          ${ageDivision}, ${displayName}, 'ACTIVE', ${paused}, 'ru-RU', 1,
          '2026-09-01T09:00:00Z'
        )
      `.execute(database);
    }
    for (const [userId, primarySport, secondarySport] of [
      [viewerId, 'BOXING', null],
      [eligibleId, 'BOXING', 'FUNCTIONAL_TRAINING'],
      [youthId, 'BOXING', null],
      [blockedId, 'BOXING', null],
      [suppressedId, 'RUNNING', null],
      [matchedId, 'BOXING', null],
      [pausedId, 'BOXING', null],
    ] as const) {
      await sql`
        insert into identity.athlete_profiles (
          user_id, primary_sport, secondary_sport, home_venue_id,
          discovery_radius_km, experience_text
        ) values (
          ${userId}::uuid, ${primarySport}, ${secondarySport}, ${venueId}::uuid,
          15, 'Test experience'
        )
      `.execute(database);
    }
    await ensureLocalPilotCommunity(database, {
      venueId,
      venueConfigurationId: testId(409),
      communityId: testId(410),
      communityConfigurationId: testId(411),
      membershipId: testId(412),
      centralGrantId: testId(413),
      athleteUserId: viewerId,
      centralActorId: centralId,
      legalName: 'Discovery test venue',
      venueDisplayName: 'Discovery Gym',
      communityName: 'Discovery Community',
      address: 'Moscow',
      cityCode: 'MOSCOW',
      timezone: 'Europe/Moscow',
      contactPayload: {},
      occurredAt: '2026-09-01T09:00:00.000Z',
    });
    await sql`
      insert into social.likes (
        like_id, from_user_id, to_user_id, state, source,
        created_at, expires_at, version
      ) values (
        ${testId(414)}::uuid, ${eligibleId}::uuid, ${viewerId}::uuid,
        'ACTIVE', 'DISCOVERY', '2026-09-01T09:00:00Z',
        '2026-10-01T09:00:00Z', 1
      )
    `.execute(database);
    await sql`
      insert into social.blocks (
        block_id, blocker_user_id, blocked_user_id, state, created_at, version
      ) values (
        ${testId(415)}::uuid, ${viewerId}::uuid, ${blockedId}::uuid,
        'ACTIVE', '2026-09-01T09:00:00Z', 1
      )
    `.execute(database);
    await sql`
      insert into social.discovery_pair_suppressions (
        suppression_id, pair_low_id, pair_high_id, reason, state,
        started_at, until_at, version
      ) values (
        ${testId(416)}::uuid, least(${viewerId}::uuid, ${suppressedId}::uuid),
        greatest(${viewerId}::uuid, ${suppressedId}::uuid), 'SKIP', 'ACTIVE',
        '2026-09-01T09:00:00Z', '2026-09-16T09:00:00Z', 1
      )
    `.execute(database);
    await sql`
      insert into social.chats (chat_id, scope, state, version, created_at)
      values (
        ${testId(418)}::uuid, 'PERSONAL_MATCH', 'ARCHIVED', 1,
        '2026-09-01T09:00:00Z'
      )
    `.execute(database);
    await sql`
      insert into social.matches (
        match_id, pair_low_id, pair_high_id, state, chat_id,
        last_activity_at, version
      ) values (
        ${testId(417)}::uuid, least(${viewerId}::uuid, ${matchedId}::uuid),
        greatest(${viewerId}::uuid, ${matchedId}::uuid), 'ARCHIVED',
        ${testId(418)}::uuid, '2026-09-01T09:00:00Z', 1
      )
    `.execute(database);

    const cards = await readDiscoveryCards(
      database,
      viewerId,
      20,
      new Date('2026-09-06T09:00:00.000Z'),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      candidateUserId: eligibleId,
      displayName: 'Visible Candidate',
      geographyTier: 'WITHIN_RADIUS',
      inboundLike: true,
      sportOverlap: 'PRIMARY',
      distanceKm: 0,
      rankingConfigVersion: 'discovery-mvp-v1',
      rankingReasons: [
        'WITHIN_RADIUS',
        'INBOUND_INTEREST',
        'PRIMARY_SPORT_OVERLAP',
      ],
    });
  });

  it('[AC-005][AC-006][AC-007][AC-008][AC-009] keeps Like, mutual Match, inactivity archive/reactivation, Skip and expiry atomic', async () => {
    const athleteA = testId(430);
    const athleteB = testId(431);
    const athleteC = testId(432);
    const athleteD = testId(433);
    const centralId = testId(434);
    const venueId = testId(435);
    const occurredAt = new Date('2026-09-06T12:00:00.000Z');
    for (const [userId, phone, displayName] of [
      [athleteA, '+79991000430', 'Athlete A'],
      [athleteB, '+79991000431', 'Athlete B'],
      [athleteC, '+79991000432', 'Athlete C'],
      [athleteD, '+79991000433', 'Athlete D'],
      [centralId, '+79991000434', 'Central'],
    ] as const) {
      await sql`
        insert into identity.users (
          user_id, phone_e164, phone_verified_at, birth_date, age_division,
          display_name, account_state, discovery_paused, locale, version, activated_at
        ) values (
          ${userId}::uuid, ${phone}, '2026-09-01T09:00:00Z', '1994-01-01'::date,
          'ADULT', ${displayName}, 'ACTIVE', false, 'ru-RU', 1,
          '2026-09-01T09:00:00Z'
        )
      `.execute(database);
    }
    await ensureLocalPilotCommunity(database, {
      venueId,
      venueConfigurationId: testId(436),
      communityId: testId(437),
      communityConfigurationId: testId(438),
      membershipId: testId(439),
      centralGrantId: testId(440),
      athleteUserId: athleteA,
      centralActorId: centralId,
      legalName: 'Social test venue',
      venueDisplayName: 'Social Gym',
      communityName: 'Social Community',
      address: 'Moscow',
      cityCode: 'MOSCOW',
      timezone: 'Europe/Moscow',
      contactPayload: {},
      occurredAt: occurredAt.toISOString(),
    });
    for (const userId of [athleteA, athleteB, athleteC, athleteD]) {
      await sql`
        insert into identity.athlete_profiles (
          user_id, primary_sport, home_venue_id, discovery_radius_km
        ) values (${userId}::uuid, 'BOXING', ${venueId}::uuid, 15)
      `.execute(database);
    }

    const likeCommand = (
      actorId: string,
      targetUserId: string,
      likeId: string,
      commandId: string,
      idempotencyKey: string,
    ): CommandEnvelope<CreateLikePayload> => ({
      commandId,
      commandType: 'LIKE',
      idempotencyKey,
      actor: { type: 'USER', id: actorId, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Like',
      aggregateId: likeId,
      expectedVersion: 0,
      correlationId: testId(Number(commandId.slice(-3)) + 100),
      causationId: null,
      requestId: testId(Number(commandId.slice(-3)) + 200),
      source: 'api',
      payloadVersion: 1,
      payload: { targetUserId, source: 'DISCOVERY' },
    });
    const likeIds = (offset: number): LikeEffectIds => ({
      eventId: testId(offset),
      auditId: testId(offset + 1),
      outboxMessageId: testId(offset + 2),
      matchId: testId(offset + 3),
      chatId: testId(offset + 4),
      mutualEventId: testId(offset + 5),
      matchEventId: testId(offset + 6),
      chatEventId: testId(offset + 7),
      matchOutboxMessageId: testId(offset + 8),
    });

    const concurrent = await Promise.all([
      createDiscoveryLike(
        database,
        likeCommand(athleteA, athleteB, testId(441), testId(442), 'social-like-a-b'),
        likeIds(450),
        () => occurredAt,
      ),
      createDiscoveryLike(
        database,
        likeCommand(athleteB, athleteA, testId(443), testId(444), 'social-like-b-a'),
        likeIds(460),
        () => occurredAt,
      ),
    ]);
    expect(concurrent.map((result) => result.response.action).sort()).toEqual([
      'LIKED',
      'MATCHED',
    ]);
    const matchRows = await sql<{ readonly count: string }>`
      select count(*)::text as count from social.matches
      where pair_low_id = least(${athleteA}::uuid, ${athleteB}::uuid)
        and pair_high_id = greatest(${athleteA}::uuid, ${athleteB}::uuid)
        and state = 'ACTIVE'
    `.execute(database);
    expect(matchRows.rows[0]?.count).toBe('1');
    const matchedLikes = await sql<{ readonly state: string }>`
      select state from social.likes
      where from_user_id in (${athleteA}::uuid, ${athleteB}::uuid)
        and to_user_id in (${athleteA}::uuid, ${athleteB}::uuid)
      order by like_id
    `.execute(database);
    expect(matchedLikes.rows.map((row) => row.state)).toEqual(['MATCHED', 'MATCHED']);
    await expect(readMatches(database, athleteA)).resolves.toEqual([
      expect.objectContaining({ counterpartUserId: athleteB, state: 'ACTIVE' }),
    ]);
    const eventNames = await sql<{ readonly event_name: string }>`
      select event_name from platform.domain_events
      where event_name in ('LikeCreated', 'MutualLikeDetected', 'MatchCreated', 'ChatOpened')
      order by occurred_at, event_name
    `.execute(database);
    expect(eventNames.rows.map((row) => row.event_name).sort()).toEqual([
      'ChatOpened',
      'LikeCreated',
      'LikeCreated',
      'MatchCreated',
      'MutualLikeDetected',
    ]);

    const incoming = await createDiscoveryLike(
      database,
      likeCommand(athleteC, athleteA, testId(470), testId(471), 'social-like-c-a'),
      likeIds(472),
      () => occurredAt,
    );
    expect(incoming.response.action).toBe('LIKED');
    const suppressionId = testId(480);
    const skipCommand: CommandEnvelope<SkipDiscoveryPayload> = {
      commandId: testId(481),
      commandType: 'SKIP',
      idempotencyKey: 'social-skip-a-c',
      actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'DiscoveryPairSuppression',
      aggregateId: suppressionId,
      expectedVersion: 0,
      correlationId: testId(482),
      causationId: null,
      requestId: testId(483),
      source: 'api',
      payloadVersion: 1,
      payload: { targetUserId: athleteC },
    };
    const skipIds: SkipEffectIds = {
      suppressionId,
      eventId: testId(484),
      auditId: testId(485),
      outboxMessageId: testId(486),
      removedLikeEventId: testId(487),
    };
    const skipped = await skipDiscoveryCandidate(
      database,
      skipCommand,
      skipIds,
      () => occurredAt,
    );
    expect(skipped.response).toMatchObject({
      action: 'SKIPPED',
      suppressionUntil: '2026-09-21T12:00:00.000Z',
    });
    const removedLike = await sql<{ readonly state: string }>`
      select state from social.likes where like_id = ${testId(470)}::uuid
    `.execute(database);
    expect(removedLike.rows[0]?.state).toBe('REMOVED_BY_SKIP');
    await expect(
      readDiscoverySuppressionTimerSnapshot(database, suppressionId),
    ).resolves.toEqual({ state: 'ACTIVE', version: 1 });
    const expiredSuppression = await expireDiscoverySuppression(
      database,
      {
        commandId: testId(526),
        commandType: 'EXPIRE_DISCOVERY_SUPPRESSION',
        idempotencyKey: `discovery-suppression:${suppressionId}:expire:v1`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'DiscoveryPairSuppression',
        aggregateId: suppressionId,
        expectedVersion: 1,
        correlationId: testId(527),
        causationId: null,
        requestId: testId(528),
        source: 'scheduler',
        payloadVersion: 1,
        payload: { suppressionId },
      },
      { eventId: testId(529), auditId: testId(530), outboxMessageId: testId(531) },
      () => new Date('2026-09-21T12:00:00.000Z'),
    );
    expect(expiredSuppression.response).toEqual({
      suppressionId,
      state: 'EXPIRED',
      version: 2,
    });

    const expiring = await createDiscoveryLike(
      database,
      likeCommand(athleteA, athleteD, testId(490), testId(491), 'social-like-a-d'),
      likeIds(492),
      () => occurredAt,
    );
    expect(expiring.response).toMatchObject({ action: 'LIKED' });
    await expect(readLikeTimerSnapshot(database, testId(490))).resolves.toEqual({
      state: 'ACTIVE',
      version: 1,
    });
    const expired = await expireLike(
      database,
      {
        commandId: testId(520),
        commandType: 'EXPIRE_LIKE',
        idempotencyKey: `like:${testId(490)}:expire:v1`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'Like',
        aggregateId: testId(490),
        expectedVersion: 1,
        correlationId: testId(521),
        causationId: null,
        requestId: testId(522),
        source: 'scheduler',
        payloadVersion: 1,
        payload: { likeId: testId(490) },
      },
      { eventId: testId(523), auditId: testId(524), outboxMessageId: testId(525) },
      () => new Date('2026-10-06T12:00:00.000Z'),
    );
    expect(expired.response.state).toBe('EXPIRED');

    const activeMatch = (await readMatches(database, athleteA))[0]!;
    const unmatchCommand: CommandEnvelope<UnmatchPayload> = {
      commandId: testId(532),
      commandType: 'UNMATCH',
      idempotencyKey: 'social-unmatch-a-b',
      actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Match',
      aggregateId: activeMatch.matchId,
      expectedVersion: 1,
      correlationId: testId(533),
      causationId: null,
      requestId: testId(534),
      source: 'api',
      payloadVersion: 1,
      payload: { matchId: activeMatch.matchId },
    };
    const unmatched = await unmatchPair(
      database,
      unmatchCommand,
      {
        eventId: testId(535),
        auditId: testId(536),
        outboxMessageId: testId(537),
        suppressionId: testId(538),
        suppressionEventId: testId(539),
        suppressionOutboxMessageId: testId(540),
        chatEventId: testId(541),
      },
      () => occurredAt,
    );
    expect(unmatched.response).toMatchObject({
      action: 'UNMATCHED',
      matchState: 'UNMATCHED',
      chatState: 'CLOSED',
      suppressionUntil: '2026-09-21T12:00:00.000Z',
      preservation: {
        acceptedObligationsPreserved: true,
        statusPathsPreserved: true,
      },
    });
    const unmatchedState = await sql<{
      readonly match_state: string;
      readonly chat_state: string;
      readonly reason: string;
    }>`
      select matched.state as match_state, chat.state as chat_state, suppression.reason
      from social.matches as matched
      join social.chats as chat on chat.chat_id = matched.chat_id
      join social.discovery_pair_suppressions as suppression
        on suppression.pair_low_id = matched.pair_low_id
       and suppression.pair_high_id = matched.pair_high_id
       and suppression.state = 'ACTIVE'
      where matched.match_id = ${activeMatch.matchId}::uuid
    `.execute(database);
    expect(unmatchedState.rows[0]).toEqual({
      match_state: 'UNMATCHED',
      chat_state: 'CLOSED',
      reason: 'UNMATCH',
    });

    await createDiscoveryLike(
      database,
      likeCommand(athleteC, athleteD, testId(550), testId(551), 'social-like-c-d'),
      likeIds(560),
      () => occurredAt,
    );
    const matchedCd = await createDiscoveryLike(
      database,
      likeCommand(athleteD, athleteC, testId(570), testId(571), 'social-like-d-c'),
      likeIds(580),
      () => occurredAt,
    );
    expect(matchedCd.response.action).toBe('MATCHED');
    const cdMatch = matchedCd.response.match!;
    const blockCommand: CommandEnvelope<BlockUserPayload> = {
      commandId: testId(601),
      commandType: 'BLOCK_USER',
      idempotencyKey: 'social-block-c-d',
      actor: { type: 'USER', id: athleteC, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Block',
      aggregateId: testId(600),
      expectedVersion: 0,
      correlationId: testId(602),
      causationId: null,
      requestId: testId(603),
      source: 'api',
      payloadVersion: 1,
      payload: { targetUserId: athleteD, reasonCode: null },
    };
    const blockIds: BlockEffectIds = {
      eventId: testId(604),
      auditId: testId(605),
      outboxMessageId: testId(606),
      matchEventId: testId(607),
      chatEventId: testId(608),
      withdrawnLikeEventId: testId(609),
    };
    const blocked = await blockUser(database, blockCommand, blockIds, () => occurredAt);
    expect(blocked.response).toMatchObject({
      action: 'BLOCKED',
      affectedMatch: { matchId: cdMatch.matchId, state: 'BLOCKED', version: 2 },
      personalChatClosed: true,
      preservation: {
        acceptedObligationsPreserved: true,
        statusPathsPreserved: true,
      },
    });
    await expect(readMatches(database, athleteC)).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ matchId: cdMatch.matchId })]),
    );
    await expect(readActiveBlocks(database, athleteC)).resolves.toEqual([
      expect.objectContaining({
        blockId: testId(600),
        blockedUserId: athleteD,
        state: 'ACTIVE',
        version: 1,
      }),
    ]);

    const unblockCommand: CommandEnvelope<UnblockUserPayload> = {
      commandId: testId(610),
      commandType: 'UNBLOCK_USER',
      idempotencyKey: 'social-unblock-c-d',
      actor: { type: 'USER', id: athleteC, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Block',
      aggregateId: testId(600),
      expectedVersion: 1,
      correlationId: testId(611),
      causationId: null,
      requestId: testId(612),
      source: 'api',
      payloadVersion: 1,
      payload: { targetUserId: athleteD },
    };
    const unblockIds = {
      eventId: testId(613),
      auditId: testId(614),
      outboxMessageId: testId(615),
    };
    const unblocked = await unblockUser(
      database,
      unblockCommand,
      unblockIds,
      () => occurredAt,
    );
    const replayedUnblock = await unblockUser(
      database,
      unblockCommand,
      unblockIds,
      () => occurredAt,
    );
    expect(unblocked.response).toMatchObject({
      action: 'UNBLOCKED',
      block: { state: 'REVOKED', version: 2 },
      oldMatchRestored: false,
    });
    expect(replayedUnblock.replayed).toBe(true);
    await expect(readActiveBlocks(database, athleteC)).resolves.toEqual([]);
    const preservedBlockedMatch = await sql<{ readonly state: string }>`
      select state from social.matches where match_id = ${cdMatch.matchId}::uuid
    `.execute(database);
    expect(preservedBlockedMatch.rows[0]?.state).toBe('BLOCKED');

    await createDiscoveryLike(
      database,
      likeCommand(athleteC, athleteD, testId(620), testId(621), 'social-rematch-c-d'),
      likeIds(630),
      () => occurredAt,
    );
    const rematchedCd = await createDiscoveryLike(
      database,
      likeCommand(athleteD, athleteC, testId(640), testId(641), 'social-rematch-d-c'),
      likeIds(650),
      () => occurredAt,
    );
    const chatId = rematchedCd.response.match!.chatId;
    const messageId = testId(900);
    const sendCommand: CommandEnvelope<SendChatMessagePayload> = {
      commandId: testId(901),
      commandType: 'SEND_MESSAGE',
      idempotencyKey: 'chat-send-c-d-1',
      actor: { type: 'USER', id: athleteC, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'ChatMessage',
      aggregateId: messageId,
      expectedVersion: 0,
      correlationId: testId(902),
      causationId: null,
      requestId: testId(903),
      source: 'api',
      payloadVersion: 1,
      payload: {
        chatId,
        content: { kind: 'PERSONAL_TEXT', text: '  Пойдём на тренировку?  ' },
      },
    };
    const sent = await sendChatMessage(
      database,
      sendCommand,
      {
        eventId: testId(904),
        auditId: testId(905),
        outboxMessageId: testId(906),
        revisionId: testId(907),
        matchEventId: testId(908),
        chatEventId: testId(909),
      },
      () => new Date('2026-09-07T10:00:00.000Z'),
    );
    expect(sent.response).toMatchObject({
      content: { kind: 'PERSONAL_TEXT', text: 'Пойдём на тренировку?' },
      revisionNo: 1,
      edited: false,
      version: 1,
    });
    await expect(readChatMessages(database, chatId, athleteD, 20, null)).resolves.toMatchObject({
      messages: [expect.objectContaining({ messageId, senderUserId: athleteC })],
      chatState: 'OPEN',
      nextCursor: null,
    });

    const editCommand: CommandEnvelope<EditChatMessagePayload> = {
      commandId: testId(910),
      commandType: 'EDIT_MESSAGE',
      idempotencyKey: 'chat-edit-c-d-1',
      actor: { type: 'USER', id: athleteC, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'ChatMessage',
      aggregateId: messageId,
      expectedVersion: 1,
      correlationId: testId(911),
      causationId: testId(904),
      requestId: testId(912),
      source: 'api',
      payloadVersion: 1,
      payload: { messageId, text: 'Пойдём на групповую тренировку?' },
    };
    const edited = await editChatMessage(
      database,
      editCommand,
      {
        eventId: testId(913),
        auditId: testId(914),
        outboxMessageId: testId(915),
        revisionId: testId(916),
      },
      () => new Date('2026-09-07T10:10:00.000Z'),
    );
    expect(edited.response).toMatchObject({
      content: { kind: 'PERSONAL_TEXT', text: 'Пойдём на групповую тренировку?' },
      revisionNo: 2,
      edited: true,
      version: 2,
    });
    await expect(
      editChatMessage(
        database,
        { ...editCommand, commandId: testId(917), idempotencyKey: 'chat-edit-c-d-late', expectedVersion: 2 },
        {
          eventId: testId(918),
          auditId: testId(919),
          outboxMessageId: testId(920),
          revisionId: testId(921),
        },
        () => new Date('2026-09-07T10:16:00.000Z'),
      ),
    ).rejects.toMatchObject<Partial<ChatActionDeniedError>>({
      code: 'MESSAGE_EDIT_WINDOW_CLOSED',
    });

    const hideCommand: CommandEnvelope<HideChatMessagePayload> = {
      commandId: testId(922),
      commandType: 'DELETE_MESSAGE_FOR_SELF',
      idempotencyKey: 'chat-hide-c-d-1',
      actor: { type: 'USER', id: athleteC, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'ChatMessageVisibility',
      aggregateId: testId(923),
      expectedVersion: 0,
      correlationId: testId(924),
      causationId: null,
      requestId: testId(925),
      source: 'api',
      payloadVersion: 1,
      payload: { messageId },
    };
    await hideChatMessageForUser(
      database,
      hideCommand,
      { eventId: testId(926), auditId: testId(927), outboxMessageId: testId(928) },
      () => new Date('2026-09-07T10:11:00.000Z'),
    );
    await expect(readChatMessages(database, chatId, athleteC, 20, null)).resolves.toMatchObject({
      messages: [],
    });
    await expect(readChatMessages(database, chatId, athleteD, 20, null)).resolves.toMatchObject({
      messages: [expect.objectContaining({ messageId, revisionNo: 2 })],
    });

    const reportCommand: CommandEnvelope<ReportChatMessagePayload> = {
      commandId: testId(930),
      commandType: 'REPORT_MESSAGE',
      idempotencyKey: 'chat-report-c-d-1',
      actor: { type: 'USER', id: athleteD, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'ChatMessage',
      aggregateId: messageId,
      expectedVersion: 2,
      correlationId: testId(931),
      causationId: null,
      requestId: testId(932),
      source: 'api',
      payloadVersion: 1,
      payload: { messageId, reasonCode: 'ABUSE' },
    };
    const reported = await reportChatMessage(
      database,
      reportCommand,
      {
        eventId: testId(933),
        auditId: testId(934),
        outboxMessageId: testId(935),
        reportId: testId(936),
      },
      () => new Date('2026-09-07T10:12:00.000Z'),
    );
    expect(reported.response).toMatchObject({
      action: 'REPORTED',
      state: 'PENDING_CENTRAL',
      version: 3,
    });
    const reportSnapshot = await sql<{ readonly revision_count: number }>`
      select jsonb_array_length(evidence_snapshot->'revisions') as revision_count
      from social.chat_message_reports
      where report_id = ${testId(936)}::uuid
    `.execute(database);
    expect(reportSnapshot.rows[0]?.revision_count).toBe(2);
    await expect(
      editChatMessage(
        database,
        { ...editCommand, commandId: testId(937), idempotencyKey: 'chat-edit-after-report', expectedVersion: 3 },
        {
          eventId: testId(938),
          auditId: testId(939),
          outboxMessageId: testId(940),
          revisionId: testId(941),
        },
        () => new Date('2026-09-07T10:13:00.000Z'),
      ),
    ).rejects.toMatchObject<Partial<ChatActionDeniedError>>({ code: 'MESSAGE_REPORTED' });

    const actionMessageId = testId(950);
    const actionSent = await sendChatMessage(
      database,
      {
        commandId: testId(951),
        commandType: 'SEND_MESSAGE',
        idempotencyKey: 'chat-action-slot-1',
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'ChatMessage',
        aggregateId: actionMessageId,
        expectedVersion: 0,
        correlationId: testId(952),
        causationId: null,
        requestId: testId(953),
        source: 'scheduler',
        payloadVersion: 1,
        payload: {
          chatId,
          content: {
            kind: 'ACTION',
            actionType: 'SELECT_SLOT',
            resourceType: 'Slot',
            resourceId: testId(954),
            stateVersion: 1,
            renderKey: 'chat.action.select-slot',
            data: { venueName: 'Social Gym' },
          },
        },
      },
      {
        eventId: testId(955),
        auditId: testId(956),
        outboxMessageId: testId(957),
        revisionId: testId(958),
        matchEventId: testId(959),
        chatEventId: testId(960),
      },
      () => new Date('2026-09-07T10:14:00.000Z'),
    );
    expect(actionSent.response.content).toMatchObject({
      kind: 'ACTION',
      actionType: 'SELECT_SLOT',
      resourceId: testId(954),
      stateVersion: 1,
    });
    await expect(
      editChatMessage(
        database,
        {
          ...editCommand,
          commandId: testId(961),
          idempotencyKey: 'chat-edit-action',
          aggregateId: actionMessageId,
          expectedVersion: 1,
          payload: { messageId: actionMessageId, text: 'Подменить карточку' },
        },
        {
          eventId: testId(962),
          auditId: testId(963),
          outboxMessageId: testId(964),
          revisionId: testId(965),
        },
        () => new Date('2026-09-07T10:14:30.000Z'),
      ),
    ).rejects.toMatchObject<Partial<ChatActionDeniedError>>({
      code: 'SERVICE_MESSAGE_IMMUTABLE',
    });

    const activeRematch = rematchedCd.response.match!;
    await expect(readMatchTimerSnapshot(database, activeRematch.matchId)).resolves.toEqual({
      state: 'ACTIVE',
      version: 1,
      deadlineAt: '2026-10-07T10:14:00.000Z',
    });
    await expect(archiveInactiveMatch(
      database,
      {
        commandId: testId(970), commandType: 'EXPIRE_INACTIVE_MATCH',
        idempotencyKey: `match:${activeRematch.matchId}:archive:v1`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'Match', aggregateId: activeRematch.matchId, expectedVersion: 1,
        correlationId: testId(971), causationId: testId(955), requestId: testId(972),
        source: 'scheduler', payloadVersion: 1,
        payload: { matchId: activeRematch.matchId },
      } satisfies CommandEnvelope<ExpireInactiveMatchPayload>,
      {
        eventId: testId(973), auditId: testId(974), outboxMessageId: testId(975),
        chatEventId: testId(976),
      },
      () => new Date('2026-10-07T10:13:59.999Z'),
    )).rejects.toMatchObject({ code: 'MATCH_NOT_DUE' });
    const archivedMatch = await archiveInactiveMatch(
      database,
      {
        commandId: testId(970), commandType: 'EXPIRE_INACTIVE_MATCH',
        idempotencyKey: `match:${activeRematch.matchId}:archive:v1`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'Match', aggregateId: activeRematch.matchId, expectedVersion: 1,
        correlationId: testId(971), causationId: testId(955), requestId: testId(972),
        source: 'scheduler', payloadVersion: 1,
        payload: { matchId: activeRematch.matchId },
      } satisfies CommandEnvelope<ExpireInactiveMatchPayload>,
      {
        eventId: testId(973), auditId: testId(974), outboxMessageId: testId(975),
        chatEventId: testId(976),
      },
      () => new Date('2026-10-07T10:14:00.000Z'),
    );
    expect(archivedMatch.response).toMatchObject({
      matchId: activeRematch.matchId,
      state: 'ARCHIVED',
      chatId,
      chatState: 'ARCHIVED',
      version: 2,
    });
    await expect(readMatches(database, athleteC)).resolves.toEqual([
      expect.objectContaining({ matchId: activeRematch.matchId, state: 'ARCHIVED', version: 2 }),
    ]);

    const reactivationMessageId = testId(977);
    await sendChatMessage(
      database,
      {
        commandId: testId(978), commandType: 'SEND_MESSAGE',
        idempotencyKey: 'chat-reactivate-c-d',
        actor: { type: 'USER', id: athleteD, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'ChatMessage', aggregateId: reactivationMessageId, expectedVersion: 0,
        correlationId: testId(979), causationId: testId(973), requestId: testId(980),
        source: 'api', payloadVersion: 1,
        payload: {
          chatId,
          content: { kind: 'PERSONAL_TEXT', text: 'Возобновим тренировку?' },
        },
      } satisfies CommandEnvelope<SendChatMessagePayload>,
      {
        eventId: testId(981), auditId: testId(982), outboxMessageId: testId(983),
        revisionId: testId(984), matchEventId: testId(985), chatEventId: testId(986),
      },
      () => new Date('2026-10-07T10:15:00.000Z'),
    );
    await expect(readMatches(database, athleteC)).resolves.toEqual([
      expect.objectContaining({
        matchId: activeRematch.matchId,
        state: 'ACTIVE',
        lastActivityAt: '2026-10-07T10:15:00.000Z',
        version: 3,
      }),
    ]);
    await expect(readChatMessages(database, chatId, athleteC, 20, null)).resolves.toMatchObject({
      chatState: 'OPEN',
      messages: expect.arrayContaining([
        expect.objectContaining({ messageId: reactivationMessageId }),
      ]),
    });
  });

  it('[AC-214] deletes expired unreported Chat payloads while retaining checksums, evidence and audit', async () => {
    const athleteA = testId(110000);
    const athleteB = testId(110001);
    const personalChat = testId(110002);
    const serviceChat = testId(110003);
    const deletedMessage = testId(110004);
    const preservedMessage = testId(110005);
    const serviceMessage = testId(110006);
    const deletedRevision = testId(110007);
    const preservedRevision = testId(110008);
    const serviceRevision = testId(110009);
    const oldActivity = '2026-09-01T10:00:00.000Z';

    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values
        (${athleteA}::uuid, '+79991100000', ${oldActivity}::timestamptz,
          '1990-01-01', 'ADULT', 'Retention A', 'ACTIVE', 'ru-RU', 1,
          ${oldActivity}::timestamptz),
        (${athleteB}::uuid, '+79991100001', ${oldActivity}::timestamptz,
          '1990-01-01', 'ADULT', 'Retention B', 'ACTIVE', 'ru-RU', 1,
          ${oldActivity}::timestamptz)
    `.execute(database);
    await database.transaction().execute(async (transaction) => {
      await sql`set constraints all deferred`.execute(transaction);
      await sql`
        insert into social.chats (chat_id, scope, state, version, created_at, updated_at)
        values
          (${personalChat}::uuid, 'PERSONAL_MATCH', 'CLOSED', 1,
            ${oldActivity}::timestamptz, ${oldActivity}::timestamptz),
          (${serviceChat}::uuid, 'CHALLENGE_SERVICE', 'CLOSED', 1,
            ${oldActivity}::timestamptz, ${oldActivity}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into social.chat_participants (chat_id, user_id, joined_at)
        values
          (${personalChat}::uuid, ${athleteA}::uuid, ${oldActivity}::timestamptz),
          (${personalChat}::uuid, ${athleteB}::uuid, ${oldActivity}::timestamptz),
          (${serviceChat}::uuid, ${athleteA}::uuid, ${oldActivity}::timestamptz),
          (${serviceChat}::uuid, ${athleteB}::uuid, ${oldActivity}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into social.chat_messages (
          message_id, chat_id, sender_user_id, payload_type, current_revision_id,
          state, version, created_at, updated_at
        ) values
          (${deletedMessage}::uuid, ${personalChat}::uuid, ${athleteA}::uuid,
            'PERSONAL_TEXT', ${deletedRevision}::uuid, 'ACTIVE', 1,
            ${oldActivity}::timestamptz, ${oldActivity}::timestamptz),
          (${preservedMessage}::uuid, ${personalChat}::uuid, ${athleteA}::uuid,
            'PERSONAL_TEXT', ${preservedRevision}::uuid, 'ACTIVE', 1,
            ${oldActivity}::timestamptz, ${oldActivity}::timestamptz),
          (${serviceMessage}::uuid, ${serviceChat}::uuid, ${athleteA}::uuid,
            'PERSONAL_TEXT', ${serviceRevision}::uuid, 'ACTIVE', 1,
            ${oldActivity}::timestamptz, ${oldActivity}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into social.chat_message_revisions (
          revision_id, message_id, revision_no, payload, created_by, created_at
        ) values
          (${deletedRevision}::uuid, ${deletedMessage}::uuid, 1,
            ${JSON.stringify({ kind: 'PERSONAL_TEXT', text: 'delete after retention' })}::jsonb,
            ${athleteA}::uuid, ${oldActivity}::timestamptz),
          (${preservedRevision}::uuid, ${preservedMessage}::uuid, 1,
            ${JSON.stringify({ kind: 'PERSONAL_TEXT', text: 'case evidence' })}::jsonb,
            ${athleteA}::uuid, ${oldActivity}::timestamptz),
          (${serviceRevision}::uuid, ${serviceMessage}::uuid, 1,
            ${JSON.stringify({ kind: 'PERSONAL_TEXT', text: 'three year service retention' })}::jsonb,
            ${athleteA}::uuid, ${oldActivity}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into social.chat_message_reports (
          report_id, message_id, reporter_user_id, reason_code, state,
          evidence_snapshot, created_at
        ) values (
          ${testId(110010)}::uuid, ${preservedMessage}::uuid, ${athleteB}::uuid,
          'SAFETY', 'RESOLVED', ${JSON.stringify({ revisions: [{ text: 'case evidence' }] })}::jsonb,
          ${oldActivity}::timestamptz
        )
      `.execute(transaction);
    });

    const personal = await cleanupExpiredChatPayloads(database, 'PERSONAL_CHAT', {
      runId: testId(110011), auditId: testId(110012), requestId: testId(110013),
    }, { now: () => new Date('2027-10-04T10:00:00.000Z') });
    expect(personal).toMatchObject({
      recordClass: 'PERSONAL_CHAT', policyVersion: 'data-lifecycle-mvp-v1',
      retentionSeconds: 31_536_000, deletedCount: 1,
      payloadSetSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });

    const revisions = await sql<{
      readonly revision_id: string;
      readonly payload: unknown | null;
      readonly payload_sha256: string | null;
      readonly retention_policy_version: string | null;
    }>`
      select revision_id, payload, payload_sha256, retention_policy_version
      from social.chat_message_revisions order by revision_id
    `.execute(database);
    expect(revisions.rows.find((row) => row.revision_id === deletedRevision)).toMatchObject({
      payload: null, payload_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      retention_policy_version: 'data-lifecycle-mvp-v1',
    });
    expect(revisions.rows.find((row) => row.revision_id === preservedRevision)?.payload)
      .toMatchObject({ text: 'case evidence' });
    expect(revisions.rows.find((row) => row.revision_id === serviceRevision)?.payload)
      .toMatchObject({ text: 'three year service retention' });
    await expect(readChatMessages(database, personalChat, athleteB, 20, null))
      .resolves.toMatchObject({
        messages: [expect.objectContaining({ messageId: preservedMessage })],
      });

    const replay = await cleanupExpiredChatPayloads(database, 'PERSONAL_CHAT', {
      runId: testId(110014), auditId: testId(110015), requestId: testId(110016),
    }, { now: () => new Date('2027-10-04T10:05:00.000Z') });
    expect(replay.deletedCount).toBe(0);

    const service = await cleanupExpiredChatPayloads(database, 'SERVICE_CHAT', {
      runId: testId(110017), auditId: testId(110018), requestId: testId(110019),
    }, { now: () => new Date('2030-10-04T10:00:00.000Z') });
    expect(service).toMatchObject({ retentionSeconds: 94_608_000, deletedCount: 1 });
    const audits = await sql<{ readonly count: string }>`
      select count(*)::text as count from platform.audit_events
      where action = 'DELETE_RETAINED_CHAT_PAYLOADS'
    `.execute(database);
    expect(audits.rows[0]?.count).toBe('2');
  });

  it('[AC-023][AC-024][AC-025][AC-026][AC-027][AC-028][AC-033][AC-034][AC-038][AC-039][AC-173][AC-174][AC-200][AC-201][AC-207][AC-208] completes ordinary scheduling, Group Plan conversion, NO_SHOW, Coach replacement and external no-fault cancellation', async () => {
    await verifySchedulingPublication(database);
  });

  it('[AC-153] serializes overlapping host confirmations around the shared Athlete', async () => {
    const occurredAt = '2026-10-05T08:00:00.000Z';
    const sharedAthlete = testId(120000);
    const firstPeer = testId(120001);
    const secondPeer = testId(120002);
    const firstCoach = testId(120003);
    const secondCoach = testId(120004);
    const admin = testId(120005);
    const central = testId(120006);
    const venue = testId(120007);
    const community = testId(120008);
    const firstChat = testId(120009);
    const secondChat = testId(120010);
    const firstMatch = testId(120011);
    const secondMatch = testId(120012);
    const firstSlot = testId(120013);
    const secondSlot = testId(120014);
    const firstBooking = testId(120015);
    const secondBooking = testId(120016);
    const firstStart = '2026-10-06T10:00:00.000Z';
    const firstEnd = '2026-10-06T11:00:00.000Z';
    const secondStart = '2026-10-06T10:30:00.000Z';
    const secondEnd = '2026-10-06T11:30:00.000Z';

    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values
        (${sharedAthlete}::uuid, '+79992000000', ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'Shared Athlete', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${firstPeer}::uuid, '+79992000001', ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'First Peer', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${secondPeer}::uuid, '+79992000002', ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'Second Peer', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${firstCoach}::uuid, '+79992000003', ${occurredAt}::timestamptz, '1985-01-01', 'ADULT', 'First Coach', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${secondCoach}::uuid, '+79992000004', ${occurredAt}::timestamptz, '1985-01-01', 'ADULT', 'Second Coach', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${admin}::uuid, '+79992000005', ${occurredAt}::timestamptz, '1985-01-01', 'ADULT', 'Venue Admin', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${central}::uuid, '+79992000006', ${occurredAt}::timestamptz, '1985-01-01', 'ADULT', 'Central', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz)
    `.execute(database);
    await ensureLocalPilotCommunity(database, {
      venueId: venue,
      venueConfigurationId: testId(120020),
      communityId: community,
      communityConfigurationId: testId(120021),
      membershipId: testId(120022),
      centralGrantId: testId(120023),
      athleteUserId: sharedAthlete,
      centralActorId: central,
      legalName: 'Conflict Test Gym LLC',
      venueDisplayName: 'Conflict Test Gym',
      communityName: 'Conflict Test Community',
      address: 'Москва',
      cityCode: 'MOSCOW',
      timezone: 'Europe/Moscow',
      contactPayload: { phone: '+79990000501' },
      occurredAt,
    });
    await sql`
      insert into community.role_grants (
        grant_id, user_id, role, scope_type, scope_id, state,
        authorized_by, authorized_at, version
      ) values
        (${testId(120024)}::uuid, ${firstCoach}::uuid, 'COACH', 'COMMUNITY', ${community}::uuid, 'ACTIVE', ${central}::uuid, ${occurredAt}::timestamptz, 1),
        (${testId(120025)}::uuid, ${secondCoach}::uuid, 'COACH', 'COMMUNITY', ${community}::uuid, 'ACTIVE', ${central}::uuid, ${occurredAt}::timestamptz, 1),
        (${testId(120026)}::uuid, ${admin}::uuid, 'GYM_ADMIN', 'VENUE', ${venue}::uuid, 'ACTIVE', ${central}::uuid, ${occurredAt}::timestamptz, 1)
    `.execute(database);
    await database.transaction().execute(async (transaction) => {
      await sql`
        insert into social.chats (chat_id, scope, state, version, created_at, updated_at)
        values
          (${firstChat}::uuid, 'PERSONAL_MATCH', 'OPEN', 1, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz),
          (${secondChat}::uuid, 'PERSONAL_MATCH', 'OPEN', 1, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into social.chat_participants (chat_id, user_id, joined_at) values
          (${firstChat}::uuid, ${sharedAthlete}::uuid, ${occurredAt}::timestamptz),
          (${firstChat}::uuid, ${firstPeer}::uuid, ${occurredAt}::timestamptz),
          (${secondChat}::uuid, ${sharedAthlete}::uuid, ${occurredAt}::timestamptz),
          (${secondChat}::uuid, ${secondPeer}::uuid, ${occurredAt}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into social.matches (
          match_id, pair_low_id, pair_high_id, state, chat_id,
          last_activity_at, version, created_at, updated_at
        ) values
          (${firstMatch}::uuid, least(${sharedAthlete}::uuid, ${firstPeer}::uuid), greatest(${sharedAthlete}::uuid, ${firstPeer}::uuid), 'ACTIVE', ${firstChat}::uuid, ${occurredAt}::timestamptz, 1, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz),
          (${secondMatch}::uuid, least(${sharedAthlete}::uuid, ${secondPeer}::uuid), greatest(${sharedAthlete}::uuid, ${secondPeer}::uuid), 'ACTIVE', ${secondChat}::uuid, ${occurredAt}::timestamptz, 1, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into scheduling.slots (
          slot_id, venue_id, coach_user_id, start_at, end_at, slot_type,
          state, commercial_version, published_by, version, created_at, updated_at
        ) values
          (${firstSlot}::uuid, ${venue}::uuid, ${firstCoach}::uuid, ${firstStart}::timestamptz, ${firstEnd}::timestamptz, 'PERSONAL', 'PUBLISHED', 1, ${admin}::uuid, 1, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz),
          (${secondSlot}::uuid, ${venue}::uuid, ${secondCoach}::uuid, ${secondStart}::timestamptz, ${secondEnd}::timestamptz, 'PERSONAL', 'PUBLISHED', 1, ${admin}::uuid, 1, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz)
      `.execute(transaction);
      const firstSnapshot = JSON.stringify({
        slotId: firstSlot, venueId: venue, venueDisplayName: 'Conflict Test Gym',
        coachUserId: firstCoach, coachDisplayName: 'First Coach',
        startAt: firstStart, endAt: firstEnd, priceAmount: null,
        priceCurrency: null, priceText: null, cancellationTermsText: null,
        commercialVersion: 1,
      });
      const secondSnapshot = JSON.stringify({
        slotId: secondSlot, venueId: venue, venueDisplayName: 'Conflict Test Gym',
        coachUserId: secondCoach, coachDisplayName: 'Second Coach',
        startAt: secondStart, endAt: secondEnd, priceAmount: null,
        priceCurrency: null, priceText: null, cancellationTermsText: null,
        commercialVersion: 1,
      });
      await sql`
        insert into scheduling.bookings (
          booking_id, chat_id, match_id, slot_id, pair_low_id, pair_high_id,
          purpose, state, initiated_by, selected_by_low_at, selected_by_high_at,
          selection_expires_at, host_confirmation_deadline_at,
          commercial_terms_snapshot, version, created_at, updated_at
        ) values
          (${firstBooking}::uuid, ${firstChat}::uuid, ${firstMatch}::uuid, ${firstSlot}::uuid, least(${sharedAthlete}::uuid, ${firstPeer}::uuid), greatest(${sharedAthlete}::uuid, ${firstPeer}::uuid), 'TRAINING', 'HOST_CONFIRMATION_PENDING', ${sharedAthlete}::uuid, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz, '2026-10-05T09:00:00.000Z'::timestamptz, '2026-10-06T02:00:00.000Z'::timestamptz, ${firstSnapshot}::jsonb, 2, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz),
          (${secondBooking}::uuid, ${secondChat}::uuid, ${secondMatch}::uuid, ${secondSlot}::uuid, least(${sharedAthlete}::uuid, ${secondPeer}::uuid), greatest(${sharedAthlete}::uuid, ${secondPeer}::uuid), 'TRAINING', 'HOST_CONFIRMATION_PENDING', ${sharedAthlete}::uuid, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz, '2026-10-05T09:00:00.000Z'::timestamptz, '2026-10-06T02:30:00.000Z'::timestamptz, ${secondSnapshot}::jsonb, 2, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into platform.domain_events (
          event_id, event_name, event_version, aggregate_type, aggregate_id,
          aggregate_version, transition_id, correlation_id, actor_id, occurred_at,
          payload, idempotency_key_hash
        ) values
          (${testId(120027)}::uuid, 'SlotMutuallySelected', 1, 'Booking', ${firstBooking}::uuid, 2, 'B-02', ${testId(120028)}::uuid, ${sharedAthlete}::uuid, ${occurredAt}::timestamptz, ${JSON.stringify({ bookingId: firstBooking, slotId: firstSlot })}::jsonb, 'fixture:first-mutual-selection'),
          (${testId(120029)}::uuid, 'SlotMutuallySelected', 1, 'Booking', ${secondBooking}::uuid, 2, 'B-02', ${testId(120030)}::uuid, ${sharedAthlete}::uuid, ${occurredAt}::timestamptz, ${JSON.stringify({ bookingId: secondBooking, slotId: secondSlot })}::jsonb, 'fixture:second-mutual-selection')
      `.execute(transaction);
    });

    const commandFor = (bookingId: string, base: number): CommandEnvelope<ConfirmBookingHostPayload> => ({
      commandId: testId(base), commandType: 'CONFIRM_BOOKING_HOST',
      idempotencyKey: `athlete-overlap:${bookingId}`,
      actor: { type: 'USER', id: admin, roles: ['GYM_ADMIN'], scopeIds: [venue] },
      aggregateType: 'Booking', aggregateId: bookingId, expectedVersion: 2,
      correlationId: testId(base + 1), causationId: null, requestId: testId(base + 2),
      source: 'api', payloadVersion: 1, payload: { bookingId },
    });
    const effectsFor = (base: number) => ({
      eventId: testId(base), auditId: testId(base + 1), outboxMessageId: testId(base + 2),
      slotEventId: testId(base + 3), sessionEventId: testId(base + 4),
      sessionId: testId(base + 5), notificationIds: [testId(base + 6), testId(base + 7)] as const,
      notificationOutboxMessageId: testId(base + 8), sessionTimerOutboxMessageId: testId(base + 9),
    });
    const results = await Promise.allSettled([
      confirmBookingHost(database, commandFor(firstBooking, 120100), effectsFor(120110),
        () => new Date('2026-10-05T08:15:00.000Z')),
      confirmBookingHost(database, commandFor(secondBooking, 120200), effectsFor(120210),
        () => new Date('2026-10-05T08:15:00.000Z')),
    ]);
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof confirmBookingHost>>> =>
        result.status === 'fulfilled',
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    const resultDiagnostics = results.map((result) => result.status === 'fulfilled'
      ? `fulfilled:${result.value.response.outcome}`
      : result.reason instanceof Error
        ? `rejected:${result.reason.name}:${result.reason.message}`
        : `rejected:${String(result.reason)}`);
    expect(fulfilled, resultDiagnostics.join('\n')).toHaveLength(1);
    expect(fulfilled[0]?.value.response.outcome).toBe('CONFIRMED');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(SchedulingConflictError);
    expect(rejected[0]?.reason).toMatchObject({ reason: 'ATHLETE_SCHEDULE_CONFLICT' });

    const sessions = await sql<{ readonly count: string }>`
      select count(*)::text as count from scheduling.sessions
      where ${sharedAthlete}::uuid in (pair_low_id, pair_high_id)
    `.execute(database);
    expect(sessions.rows[0]?.count).toBe('1');
    const resources = await sql<{
      readonly slot_state: string;
      readonly booking_state: string;
    }>`
      select slot.state as slot_state, booking.state as booking_state
      from scheduling.slots slot
      join scheduling.bookings booking on booking.slot_id = slot.slot_id
      order by slot.slot_id
    `.execute(database);
    expect(resources.rows.map((row) => `${row.slot_state}/${row.booking_state}`).sort()).toEqual([
      'BOOKED/CONFIRMED_PAIR',
      'PUBLISHED/HOST_CONFIRMATION_PENDING',
    ]);
  });

  it('[AC-155] converts a confirmed Training only after both Athletes and the assigned Coach accept', async () => {
    const fixture = await seedConfirmedTrainingForConversion(18000);
    const conversionId = testId(18100);
    const requested = await requestBookingOfficialConversion(
      database,
      {
        commandId: testId(18101), commandType: 'REQUEST_BOOKING_OFFICIAL_CONVERSION',
        idempotencyKey: 'conversion-request-complete',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'BookingOfficialConversion', aggregateId: conversionId,
        expectedVersion: 0, correlationId: testId(18102), causationId: null,
        requestId: testId(18103), source: 'api', payloadVersion: 1,
        payload: { sessionId: fixture.session },
      } satisfies CommandEnvelope<RequestBookingOfficialConversionPayload>,
      bookingConversionEffects(18110, conversionId),
      () => new Date('2026-09-27T10:05:00.000Z'),
    );
    expect(requested.response).toMatchObject({
      conversionId, state: 'PENDING_CONFIRMATION', stake: 'NONE',
      confirmationDeadlineAt: '2026-09-30T10:05:00.000Z', version: 1,
    });
    expect(requested.response.confirmations).toEqual([
      expect.objectContaining({ actorUserId: fixture.athleteA, decision: 'ACCEPT' }),
    ]);

    const acceptedByPeer = await decideBookingOfficialConversion(
      database,
      {
        commandId: testId(18201), commandType: 'DECIDE_BOOKING_OFFICIAL_CONVERSION',
        idempotencyKey: 'conversion-peer-accept',
        actor: { type: 'USER', id: fixture.athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'BookingOfficialConversion', aggregateId: conversionId,
        expectedVersion: 1, correlationId: testId(18202), causationId: testId(18110),
        requestId: testId(18203), source: 'api', payloadVersion: 1,
        payload: { conversionId, decision: 'ACCEPT' },
      } satisfies CommandEnvelope<DecideBookingOfficialConversionPayload>,
      bookingConversionEffects(18210, conversionId),
      () => new Date('2026-09-27T11:00:00.000Z'),
    );
    expect(acceptedByPeer.response).toMatchObject({
      state: 'PENDING_CONFIRMATION', challengeId: null, version: 2,
    });

    const acceptedByCoach = await decideBookingOfficialConversion(
      database,
      {
        commandId: testId(18301), commandType: 'DECIDE_BOOKING_OFFICIAL_CONVERSION',
        idempotencyKey: 'conversion-coach-accept',
        actor: { type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community] },
        aggregateType: 'BookingOfficialConversion', aggregateId: conversionId,
        expectedVersion: 2, correlationId: testId(18302), causationId: testId(18210),
        requestId: testId(18303), source: 'api', payloadVersion: 1,
        payload: { conversionId, decision: 'ACCEPT' },
      } satisfies CommandEnvelope<DecideBookingOfficialConversionPayload>,
      bookingConversionEffects(18310, conversionId),
      () => new Date('2026-09-27T12:00:00.000Z'),
    );
    expect(acceptedByCoach.response).toMatchObject({
      state: 'CONVERTED', stake: 'NONE', challengeId: testId(18318), version: 3,
    });
    expect(acceptedByCoach.response.confirmations).toHaveLength(3);
    await expect(readSession(database, fixture.session, fixture.athleteA)).resolves.toMatchObject({
      purpose: 'OFFICIAL_CHALLENGE', challengeId: testId(18318), state: 'SCHEDULED',
    });
    const officialWindowTimer = await sql<{ readonly payload: {
      readonly sessionId: string;
      readonly timer: { readonly expectedVersion: number; readonly idempotencyKey: string };
    } }>`
      select payload from platform.outbox_messages
      where message_id = ${testId(18333)}::uuid
    `.execute(database);
    expect(officialWindowTimer.rows[0]?.payload).toEqual(expect.objectContaining({
      sessionId: fixture.session,
      timer: expect.objectContaining({
        expectedVersion: 2,
        idempotencyKey: `session:${fixture.session}:open-session-window:v2`,
      }),
    }));
    const committed = await sql<{
      readonly booking_purpose: string;
      readonly booking_state: string;
      readonly session_purpose: string;
      readonly challenge_state: string;
      readonly obligation_count: string;
    }>`
      select booking.purpose as booking_purpose, booking.state as booking_state,
        session.purpose as session_purpose, challenge.state as challenge_state,
        (select count(*)::text from competition.challenge_participant_obligations obligation
          where obligation.challenge_id = challenge.challenge_id) as obligation_count
      from scheduling.bookings booking
      join scheduling.sessions session on session.booking_id = booking.booking_id
      join competition.challenges challenge on challenge.challenge_id = booking.challenge_id
      where booking.booking_id = ${fixture.booking}::uuid
    `.execute(database);
    expect(committed.rows[0]).toEqual({
      booking_purpose: 'OFFICIAL_CHALLENGE', booking_state: 'CONFIRMED_PAIR',
      session_purpose: 'OFFICIAL_CHALLENGE', challenge_state: 'BOOKED', obligation_count: '2',
    });
  });

  it('[AC-156] preserves the confirmed Training when a required party declines conversion', async () => {
    const fixture = await seedConfirmedTrainingForConversion(18400);
    const conversionId = testId(18500);
    await requestBookingOfficialConversion(
      database,
      {
        commandId: testId(18501), commandType: 'REQUEST_BOOKING_OFFICIAL_CONVERSION',
        idempotencyKey: 'conversion-request-decline',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'BookingOfficialConversion', aggregateId: conversionId,
        expectedVersion: 0, correlationId: testId(18502), causationId: null,
        requestId: testId(18503), source: 'api', payloadVersion: 1,
        payload: { sessionId: fixture.session },
      } satisfies CommandEnvelope<RequestBookingOfficialConversionPayload>,
      bookingConversionEffects(18510, conversionId),
      () => new Date('2026-09-27T10:05:00.000Z'),
    );
    const declined = await decideBookingOfficialConversion(
      database,
      {
        commandId: testId(18601), commandType: 'DECIDE_BOOKING_OFFICIAL_CONVERSION',
        idempotencyKey: 'conversion-peer-decline',
        actor: { type: 'USER', id: fixture.athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'BookingOfficialConversion', aggregateId: conversionId,
        expectedVersion: 1, correlationId: testId(18602), causationId: testId(18510),
        requestId: testId(18603), source: 'api', payloadVersion: 1,
        payload: { conversionId, decision: 'DECLINE' },
      } satisfies CommandEnvelope<DecideBookingOfficialConversionPayload>,
      bookingConversionEffects(18610, conversionId),
      () => new Date('2026-09-27T11:00:00.000Z'),
    );
    expect(declined.response).toMatchObject({ state: 'DECLINED', challengeId: null, version: 2 });
    await expect(readSession(database, fixture.session, fixture.athleteA)).resolves.toMatchObject({
      purpose: 'TRAINING', state: 'SCHEDULED', officialConversion: expect.objectContaining({
        state: 'DECLINED', viewerCanConfirm: false,
      }),
    });
    const source = await sql<{ readonly state: string; readonly purpose: string }>`
      select state, purpose from scheduling.bookings where booking_id = ${fixture.booking}::uuid
    `.execute(database);
    expect(source.rows[0]).toEqual({ state: 'CONFIRMED_PAIR', purpose: 'TRAINING' });
  });

  it('[AC-157] closes a pending conversion at Session start and opens ordinary Training', async () => {
    const fixture = await seedConfirmedTrainingForConversion(18700);
    const conversionId = testId(18800);
    await requestBookingOfficialConversion(
      database,
      {
        commandId: testId(18801), commandType: 'REQUEST_BOOKING_OFFICIAL_CONVERSION',
        idempotencyKey: 'conversion-request-start-boundary',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'BookingOfficialConversion', aggregateId: conversionId,
        expectedVersion: 0, correlationId: testId(18802), causationId: null,
        requestId: testId(18803), source: 'api', payloadVersion: 1,
        payload: { sessionId: fixture.session },
      } satisfies CommandEnvelope<RequestBookingOfficialConversionPayload>,
      bookingConversionEffects(18810, conversionId),
      () => new Date('2026-09-27T10:05:00.000Z'),
    );
    const opened = await openSessionWindow(
      database,
      {
        commandId: testId(18900), commandType: 'OPEN_SESSION_WINDOW',
        idempotencyKey: 'conversion-open-source-session',
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'Session', aggregateId: fixture.session, expectedVersion: 1,
        correlationId: testId(18901), causationId: testId(18810), requestId: testId(18902),
        source: 'scheduler', payloadVersion: 1, payload: { sessionId: fixture.session },
      } satisfies CommandEnvelope<OpenSessionWindowPayload>,
      {
        eventId: testId(18903), auditId: testId(18904), outboxMessageId: testId(18905),
        bookingEventId: testId(18906), conversionEventId: testId(18907),
        conversionOutboxMessageId: testId(18908),
        conversionNotificationOutboxMessageId: testId(18909),
        conversionNotificationIds: [testId(18910), testId(18911), testId(18912)],
      },
      () => new Date(fixture.scheduledStartAt),
    );
    expect(opened.response).toMatchObject({ purpose: 'TRAINING', state: 'READY_FOR_COACH' });
    await expect(
      readBookingOfficialConversionForSession(database, fixture.session, fixture.athleteB),
    ).resolves.toMatchObject({ state: 'EXPIRED', challengeId: null, version: 2 });
    const source = await sql<{ readonly state: string; readonly purpose: string }>`
      select state, purpose from scheduling.bookings where booking_id = ${fixture.booking}::uuid
    `.execute(database);
    expect(source.rows[0]).toEqual({ state: 'CONFIRMED_PAIR', purpose: 'TRAINING' });
  });

  it('[AC-161] expires an unconfirmed conversion after its capped 72-hour deadline', async () => {
    const fixture = await seedConfirmedTrainingForConversion(19000);
    const conversionId = testId(19100);
    const requested = await requestBookingOfficialConversion(
      database,
      {
        commandId: testId(19101), commandType: 'REQUEST_BOOKING_OFFICIAL_CONVERSION',
        idempotencyKey: 'conversion-request-expiry',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'BookingOfficialConversion', aggregateId: conversionId,
        expectedVersion: 0, correlationId: testId(19102), causationId: null,
        requestId: testId(19103), source: 'api', payloadVersion: 1,
        payload: { sessionId: fixture.session },
      } satisfies CommandEnvelope<RequestBookingOfficialConversionPayload>,
      bookingConversionEffects(19110, conversionId),
      () => new Date('2026-09-27T10:05:00.000Z'),
    );
    const expired = await expireBookingOfficialConversion(
      database,
      {
        commandId: testId(19200), commandType: 'EXPIRE_BOOKING_OFFICIAL_CONVERSION',
        idempotencyKey: 'conversion-expire-after-deadline',
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'BookingOfficialConversion', aggregateId: conversionId,
        expectedVersion: requested.response.version, correlationId: testId(19201),
        causationId: testId(19110), requestId: testId(19202), source: 'scheduler',
        payloadVersion: 1, payload: { conversionId },
      } satisfies CommandEnvelope<ExpireBookingOfficialConversionPayload>,
      bookingConversionEffects(19210, conversionId),
      () => new Date(requested.response.confirmationDeadlineAt!),
    );
    expect(expired.response).toMatchObject({ state: 'EXPIRED', challengeId: null, version: 2 });
    const source = await sql<{ readonly state: string; readonly purpose: string }>`
      select state, purpose from scheduling.bookings where booking_id = ${fixture.booking}::uuid
    `.execute(database);
    expect(source.rows[0]).toEqual({ state: 'CONFIRMED_PAIR', purpose: 'TRAINING' });
  });

  it('[AC-158][AC-159] queues a Contender conversion behind the older FIFO entry before activation', async () => {
    const fixture = await seedConfirmedTrainingForConversion(19300);
    await sql`
      update competition.competitions
      set phase = 'RUNNING', contender_user_id = ${fixture.athleteA}::uuid,
        status_version = 1, version = 2, updated_at = '2026-09-27T10:01:00.000Z'
      where competition_id = ${fixture.competition}::uuid
    `.execute(database);
    const olderEntryId = testId(19400);
    await sql`
      insert into competition.challenge_queue_entries (
        queue_entry_id, competition_id, initiator_user_id, target_status,
        kind, state, bound_holder_user_id, source_type, source_id,
        submitted_at, version, created_at, updated_at
      ) values (
        ${olderEntryId}::uuid, ${fixture.competition}::uuid, ${fixture.athleteB}::uuid,
        'CONTENDER', 'DIRECT_STATUS', 'WAITING', ${fixture.athleteA}::uuid,
        'DIRECT', null, '2026-09-27T10:02:00.000Z'::timestamptz, 1,
        '2026-09-27T10:02:00.000Z'::timestamptz, '2026-09-27T10:02:00.000Z'::timestamptz
      )
    `.execute(database);
    const conversionId = testId(19500);
    const requested = await requestBookingOfficialConversion(
      database,
      {
        commandId: testId(19501), commandType: 'REQUEST_BOOKING_OFFICIAL_CONVERSION',
        idempotencyKey: 'conversion-request-fifo',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'BookingOfficialConversion', aggregateId: conversionId,
        expectedVersion: 0, correlationId: testId(19502), causationId: null,
        requestId: testId(19503), source: 'api', payloadVersion: 1,
        payload: { sessionId: fixture.session },
      } satisfies CommandEnvelope<RequestBookingOfficialConversionPayload>,
      bookingConversionEffects(19510, conversionId),
      () => new Date('2026-09-27T10:05:00.000Z'),
    );
    expect(requested.response).toMatchObject({
      state: 'WAITING_FIFO', stake: 'CONTENDER', queuePosition: 2,
      confirmationDeadlineAt: null, version: 1,
    });
    await expect(
      readBookingOfficialConversionActivationCandidate(
        database, fixture.competition, () => new Date('2026-09-27T10:05:00.000Z'),
      ),
    ).resolves.toBeNull();
    const stillTraining = await sql<{ readonly state: string; readonly purpose: string }>`
      select state, purpose from scheduling.bookings where booking_id = ${fixture.booking}::uuid
    `.execute(database);
    expect(stillTraining.rows[0]).toEqual({ state: 'CONFIRMED_PAIR', purpose: 'TRAINING' });

    await sql`
      update competition.challenge_queue_entries
      set state = 'WITHDRAWN', decided_at = '2026-09-27T10:06:00.000Z'::timestamptz,
        terminal_reason = 'TEST_HEAD_RELEASED', version = 2,
        updated_at = '2026-09-27T10:06:00.000Z'::timestamptz
      where queue_entry_id = ${olderEntryId}::uuid
    `.execute(database);
    const candidate = await readBookingOfficialConversionActivationCandidate(
      database,
      fixture.competition,
      () => new Date('2026-09-27T10:06:00.000Z'),
    );
    expect(candidate).toMatchObject({ conversionId, version: 1 });
    const activated = await activateBookingOfficialConversionFromQueue(
      database,
      {
        commandId: testId(19600), commandType: 'ACTIVATE_PREBOOKED_OFFICIAL_CONVERSION',
        idempotencyKey: 'conversion-activate-fifo-head',
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'BookingOfficialConversion', aggregateId: conversionId,
        expectedVersion: 1, correlationId: testId(19601), causationId: testId(19510),
        requestId: testId(19602), source: 'scheduler', payloadVersion: 1,
        payload: { conversionId, queueEntryId: requested.response.queueEntryId! },
      },
      bookingConversionEffects(19610, conversionId),
      () => new Date('2026-09-27T10:07:00.000Z'),
    );
    expect(activated.response).toMatchObject({
      state: 'PENDING_CONFIRMATION', queuePosition: null, version: 2,
    });

    await decideBookingOfficialConversion(
      database,
      {
        commandId: testId(19700), commandType: 'DECIDE_BOOKING_OFFICIAL_CONVERSION',
        idempotencyKey: 'conversion-fifo-peer-accept',
        actor: { type: 'USER', id: fixture.athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'BookingOfficialConversion', aggregateId: conversionId,
        expectedVersion: 2, correlationId: testId(19701), causationId: testId(19610),
        requestId: testId(19702), source: 'api', payloadVersion: 1,
        payload: { conversionId, decision: 'ACCEPT' },
      } satisfies CommandEnvelope<DecideBookingOfficialConversionPayload>,
      bookingConversionEffects(19710, conversionId),
      () => new Date('2026-09-27T10:08:00.000Z'),
    );
    const converted = await decideBookingOfficialConversion(
      database,
      {
        commandId: testId(19800), commandType: 'DECIDE_BOOKING_OFFICIAL_CONVERSION',
        idempotencyKey: 'conversion-fifo-coach-accept',
        actor: { type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community] },
        aggregateType: 'BookingOfficialConversion', aggregateId: conversionId,
        expectedVersion: 3, correlationId: testId(19801), causationId: testId(19710),
        requestId: testId(19802), source: 'api', payloadVersion: 1,
        payload: { conversionId, decision: 'ACCEPT' },
      } satisfies CommandEnvelope<DecideBookingOfficialConversionPayload>,
      bookingConversionEffects(19810, conversionId),
      () => new Date('2026-09-27T10:09:00.000Z'),
    );
    expect(converted.response).toMatchObject({
      state: 'CONVERTED', stake: 'CONTENDER', challengeId: testId(19818), version: 4,
    });
  });

  it('[AC-160] invalidates a waiting prebooked conversion when its Training starts', async () => {
    const fixture = await seedConfirmedTrainingForConversion(19900);
    await sql`
      update competition.competitions
      set phase = 'RUNNING', contender_user_id = ${fixture.athleteA}::uuid,
        status_version = 1, version = 2, updated_at = '2026-09-27T10:01:00.000Z'
      where competition_id = ${fixture.competition}::uuid
    `.execute(database);
    const conversionId = testId(20000);
    const requested = await requestBookingOfficialConversion(
      database,
      {
        commandId: testId(20001), commandType: 'REQUEST_BOOKING_OFFICIAL_CONVERSION',
        idempotencyKey: 'conversion-request-waiting-start',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'BookingOfficialConversion', aggregateId: conversionId,
        expectedVersion: 0, correlationId: testId(20002), causationId: null,
        requestId: testId(20003), source: 'api', payloadVersion: 1,
        payload: { sessionId: fixture.session },
      } satisfies CommandEnvelope<RequestBookingOfficialConversionPayload>,
      bookingConversionEffects(20010, conversionId),
      () => new Date('2026-09-27T10:05:00.000Z'),
    );
    expect(requested.response.state).toBe('WAITING_FIFO');
    const opened = await openSessionWindow(
      database,
      {
        commandId: testId(20100), commandType: 'OPEN_SESSION_WINDOW',
        idempotencyKey: 'conversion-open-waiting-source-session',
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'Session', aggregateId: fixture.session, expectedVersion: 1,
        correlationId: testId(20101), causationId: testId(20010), requestId: testId(20102),
        source: 'scheduler', payloadVersion: 1, payload: { sessionId: fixture.session },
      } satisfies CommandEnvelope<OpenSessionWindowPayload>,
      {
        eventId: testId(20103), auditId: testId(20104), outboxMessageId: testId(20105),
        conversionEventId: testId(20106), conversionQueueEventId: testId(20107),
        conversionOutboxMessageId: testId(20108),
        conversionNotificationOutboxMessageId: testId(20109),
        conversionNotificationIds: [testId(20110), testId(20111), testId(20112)],
      },
      () => new Date(fixture.scheduledStartAt),
    );
    expect(opened.response).toMatchObject({ purpose: 'TRAINING', state: 'READY_FOR_COACH' });
    await expect(
      readBookingOfficialConversionForSession(database, fixture.session, fixture.athleteA),
    ).resolves.toMatchObject({ state: 'INVALIDATED', challengeId: null, version: 2 });
    const queue = await sql<{ readonly state: string; readonly terminal_reason: string }>`
      select state, terminal_reason from competition.challenge_queue_entries
      where queue_entry_id = ${requested.response.queueEntryId}::uuid
    `.execute(database);
    expect(queue.rows[0]).toEqual({
      state: 'INVALIDATED', terminal_reason: 'PREBOOKED_SOURCE_STARTED',
    });
  });

  it('[AC-162] closes conversion no-fault when Coach authorization is lost before commitment', async () => {
    const fixture = await seedConfirmedTrainingForConversion(20200);
    const conversionId = testId(20300);
    await requestBookingOfficialConversion(
      database,
      {
        commandId: testId(20301), commandType: 'REQUEST_BOOKING_OFFICIAL_CONVERSION',
        idempotencyKey: 'conversion-request-coach-authorization-loss',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'BookingOfficialConversion', aggregateId: conversionId,
        expectedVersion: 0, correlationId: testId(20302), causationId: null,
        requestId: testId(20303), source: 'api', payloadVersion: 1,
        payload: { sessionId: fixture.session },
      } satisfies CommandEnvelope<RequestBookingOfficialConversionPayload>,
      bookingConversionEffects(20310, conversionId),
      () => new Date('2026-09-27T10:05:00.000Z'),
    );
    await sql`
      update community.role_grants
      set state = 'REVOKED', version = version + 1,
        updated_at = '2026-09-27T10:06:00.000Z'::timestamptz
      where user_id = ${fixture.coach}::uuid and role = 'COACH'
        and scope_type = 'COMMUNITY' and scope_id = ${fixture.community}::uuid
    `.execute(database);
    const candidate = await readInvalidActiveBookingOfficialConversionCandidate(
      database,
      fixture.competition,
    );
    expect(candidate).toEqual({
      conversionId,
      competitionId: fixture.competition,
      version: 1,
      reasonCode: 'OFFICIAL_ELIGIBILITY_LOST',
    });
    const closed = await invalidateActiveBookingOfficialConversion(
      database,
      {
        commandId: testId(20400), commandType: 'CLOSE_INVALID_BOOKING_OFFICIAL_CONVERSION',
        idempotencyKey: 'conversion-event-close-invalid-coach',
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'BookingOfficialConversion', aggregateId: conversionId,
        expectedVersion: 1, correlationId: testId(20401), causationId: testId(20310),
        requestId: testId(20402), source: 'scheduler', payloadVersion: 1,
        payload: { conversionId, reasonCode: candidate!.reasonCode },
      } satisfies CommandEnvelope<InvalidateActiveBookingOfficialConversionPayload>,
      bookingConversionEffects(20410, conversionId),
      () => new Date('2026-09-27T10:07:00.000Z'),
    );
    expect(closed.response).toMatchObject({ state: 'INVALIDATED', challengeId: null, version: 2 });
    const source = await sql<{ readonly state: string; readonly purpose: string }>`
      select state, purpose from scheduling.bookings where booking_id = ${fixture.booking}::uuid
    `.execute(database);
    expect(source.rows[0]).toEqual({ state: 'CONFIRMED_PAIR', purpose: 'TRAINING' });
    const effects = await sql<{
      readonly challenges: string;
      readonly obligations: string;
      readonly cooldowns: string;
    }>`
      select (select count(*)::text from competition.challenges) as challenges,
        (select count(*)::text from competition.challenge_participant_obligations) as obligations,
        (select count(*)::text from competition.pair_cooldowns) as cooldowns
    `.execute(database);
    expect(effects.rows[0]).toEqual({ challenges: '0', obligations: '0', cooldowns: '0' });
  });

  it('[AC-035][AC-036][AC-163] closes a pending conversion and confirms the remaining Athlete as solo', async () => {
    const fixture = await seedConfirmedTrainingForConversion(20500);
    const conversionId = testId(20600);
    await requestBookingOfficialConversion(
      database,
      {
        commandId: testId(20601), commandType: 'REQUEST_BOOKING_OFFICIAL_CONVERSION',
        idempotencyKey: 'solo-close-pending-conversion',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'BookingOfficialConversion', aggregateId: conversionId,
        expectedVersion: 0, correlationId: testId(20602), causationId: null,
        requestId: testId(20603), source: 'api', payloadVersion: 1,
        payload: { sessionId: fixture.session },
      } satisfies CommandEnvelope<RequestBookingOfficialConversionPayload>,
      bookingConversionEffects(20610, conversionId),
      () => new Date('2026-09-27T10:05:00.000Z'),
    );

    const continuationId = testId(20700);
    const cancelled = await requestTrainingParticipantCancellation(
      database,
      {
        commandId: testId(20701), commandType: 'CANCEL_TRAINING_PARTICIPATION',
        idempotencyKey: 'solo-cancel-athlete-a',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'BookingSoloContinuation', aggregateId: continuationId,
        expectedVersion: 0, correlationId: testId(20702), causationId: null,
        requestId: testId(20703), source: 'api', payloadVersion: 1,
        payload: { sessionId: fixture.session },
      } satisfies CommandEnvelope<RequestTrainingParticipantCancellationPayload>,
      bookingSoloEffects(20710, continuationId),
      () => new Date('2026-09-27T10:10:00.000Z'),
    );
    expect(cancelled.response).toMatchObject({
      state: 'PENDING', remainingAthleteUserId: fixture.athleteB,
      deadlineAt: '2026-09-27T11:10:00.000Z', version: 1,
    });
    await expect(
      readBookingOfficialConversionForSession(database, fixture.session, fixture.athleteA),
    ).resolves.toMatchObject({ state: 'INVALIDATED', challengeId: null, version: 2 });
    const pendingSource = await sql<{
      readonly state: string;
      readonly session_state: string;
      readonly competitive_effects: string;
    }>`
      select booking.state, session.state as session_state,
        ((select count(*) from competition.challenges)
          + (select count(*) from competition.results)
          + (select count(*) from competition.pair_cooldowns))::text as competitive_effects
      from scheduling.bookings booking
      join scheduling.sessions session on session.booking_id = booking.booking_id
      where booking.booking_id = ${fixture.booking}::uuid
    `.execute(database);
    expect(pendingSource.rows[0]).toEqual({
      state: 'SOLO_DECISION_PENDING', session_state: 'SCHEDULED', competitive_effects: '0',
    });

    const athleteAccepted = await decideBookingSoloContinuation(
      database,
      {
        commandId: testId(20800), commandType: 'DECIDE_BOOKING_SOLO_CONTINUATION',
        idempotencyKey: 'solo-remaining-athlete-accept',
        actor: { type: 'USER', id: fixture.athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'BookingSoloContinuation', aggregateId: continuationId,
        expectedVersion: 1, correlationId: testId(20801), causationId: testId(20710),
        requestId: testId(20802), source: 'api', payloadVersion: 1,
        payload: { continuationId, decision: 'ACCEPT' },
      } satisfies CommandEnvelope<DecideBookingSoloContinuationPayload>,
      bookingSoloEffects(20810, continuationId),
      () => new Date('2026-09-27T10:20:00.000Z'),
    );
    expect(athleteAccepted.response).toMatchObject({ state: 'PENDING', version: 2 });

    const coachAccepted = await decideBookingSoloContinuation(
      database,
      {
        commandId: testId(20900), commandType: 'DECIDE_BOOKING_SOLO_CONTINUATION',
        idempotencyKey: 'solo-coach-accept',
        actor: { type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community] },
        aggregateType: 'BookingSoloContinuation', aggregateId: continuationId,
        expectedVersion: 2, correlationId: testId(20901), causationId: testId(20810),
        requestId: testId(20902), source: 'api', payloadVersion: 1,
        payload: { continuationId, decision: 'ACCEPT' },
      } satisfies CommandEnvelope<DecideBookingSoloContinuationPayload>,
      bookingSoloEffects(20910, continuationId),
      () => new Date('2026-09-27T10:25:00.000Z'),
    );
    expect(coachAccepted.response).toMatchObject({ state: 'CONFIRMED', version: 3 });
    const confirmedSource = await sql<{
      readonly booking_state: string;
      readonly session_state: string;
      readonly solo_athlete_user_id: string;
      readonly slot_state: string;
    }>`
      select booking.state as booking_state, session.state as session_state,
        session.solo_athlete_user_id, slot.state as slot_state
      from scheduling.bookings booking
      join scheduling.sessions session on session.booking_id = booking.booking_id
      join scheduling.slots slot on slot.slot_id = booking.slot_id
      where booking.booking_id = ${fixture.booking}::uuid
    `.execute(database);
    expect(confirmedSource.rows[0]).toEqual({
      booking_state: 'CONFIRMED_SOLO', session_state: 'SCHEDULED',
      solo_athlete_user_id: fixture.athleteB, slot_state: 'BOOKED',
    });
    await expect(readSession(database, fixture.session, fixture.athleteB)).resolves.toMatchObject({
      activeAthleteUserIds: [fixture.athleteB],
      activeAthleteDisplayNames: ['Conversion Athlete B'],
      viewerCanCancelTraining: false,
      soloContinuation: { state: 'CONFIRMED', remainingAthleteUserId: fixture.athleteB },
    });
    const soloWindowTimer = await sql<{ readonly payload: {
      readonly sessionId: string;
      readonly timer: { readonly expectedVersion: number; readonly idempotencyKey: string };
    } }>`
      select payload from platform.outbox_messages
      where message_id = ${testId(20924)}::uuid
    `.execute(database);
    expect(soloWindowTimer.rows[0]?.payload).toEqual(expect.objectContaining({
      sessionId: fixture.session,
      timer: expect.objectContaining({
        expectedVersion: 2,
        idempotencyKey: `session:${fixture.session}:open-session-window:v2`,
      }),
    }));
  });

  it('[AC-037] expires solo continuation and releases all resources without competition effects', async () => {
    const fixture = await seedConfirmedTrainingForConversion(21000);
    const continuationId = testId(21100);
    const cancelled = await requestTrainingParticipantCancellation(
      database,
      {
        commandId: testId(21101), commandType: 'CANCEL_TRAINING_PARTICIPATION',
        idempotencyKey: 'solo-expiry-cancel-athlete-a',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'BookingSoloContinuation', aggregateId: continuationId,
        expectedVersion: 0, correlationId: testId(21102), causationId: null,
        requestId: testId(21103), source: 'api', payloadVersion: 1,
        payload: { sessionId: fixture.session },
      } satisfies CommandEnvelope<RequestTrainingParticipantCancellationPayload>,
      bookingSoloEffects(21110, continuationId),
      () => new Date('2026-09-27T10:10:00.000Z'),
    );
    expect(cancelled.response).toMatchObject({
      state: 'PENDING', deadlineAt: '2026-09-27T11:10:00.000Z', version: 1,
    });

    const athleteAccepted = await decideBookingSoloContinuation(
      database,
      {
        commandId: testId(21200), commandType: 'DECIDE_BOOKING_SOLO_CONTINUATION',
        idempotencyKey: 'solo-expiry-athlete-accept',
        actor: { type: 'USER', id: fixture.athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'BookingSoloContinuation', aggregateId: continuationId,
        expectedVersion: 1, correlationId: testId(21201), causationId: testId(21110),
        requestId: testId(21202), source: 'api', payloadVersion: 1,
        payload: { continuationId, decision: 'ACCEPT' },
      } satisfies CommandEnvelope<DecideBookingSoloContinuationPayload>,
      bookingSoloEffects(21210, continuationId),
      () => new Date('2026-09-27T10:20:00.000Z'),
    );
    expect(athleteAccepted.response).toMatchObject({ state: 'PENDING', version: 2 });

    const expired = await expireBookingSoloContinuation(
      database,
      {
        commandId: testId(21300), commandType: 'EXPIRE_BOOKING_SOLO_CONTINUATION',
        idempotencyKey: 'solo-expiry-deadline',
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'BookingSoloContinuation', aggregateId: continuationId,
        expectedVersion: 2, correlationId: testId(21301), causationId: testId(21210),
        requestId: testId(21302), source: 'scheduler', payloadVersion: 1,
        payload: { continuationId },
      } satisfies CommandEnvelope<ExpireBookingSoloContinuationPayload>,
      bookingSoloEffects(21310, continuationId),
      () => new Date('2026-09-27T11:10:00.000Z'),
    );
    expect(expired.response).toMatchObject({ state: 'EXPIRED', version: 3 });
    const closedSource = await sql<{
      readonly booking_state: string;
      readonly session_state: string;
      readonly slot_state: string;
      readonly competitive_effects: string;
    }>`
      select booking.state as booking_state, session.state as session_state,
        slot.state as slot_state,
        ((select count(*) from competition.challenges)
          + (select count(*) from competition.results)
          + (select count(*) from competition.pair_cooldowns))::text as competitive_effects
      from scheduling.bookings booking
      join scheduling.sessions session on session.booking_id = booking.booking_id
      join scheduling.slots slot on slot.slot_id = booking.slot_id
      where booking.booking_id = ${fixture.booking}::uuid
    `.execute(database);
    expect(closedSource.rows[0]).toEqual({
      booking_state: 'CANCELLED', session_state: 'CANCELLED',
      slot_state: 'CANCELLED', competitive_effects: '0',
    });
    await expect(
      readBookingSoloContinuationForSession(database, fixture.session, fixture.athleteB),
    ).resolves.toMatchObject({ state: 'EXPIRED', version: 3 });
  });

  it('[AC-061][AC-062][AC-063][AC-065][AC-066] withdraws, reschedules or forfeits an Official Slot and serializes confirmation', async () => {
    const fixture = await seedConfirmedTrainingForConversion(21400);
    const sourceChatId = testId(21407);
    await database.transaction().execute(async (transaction) => {
      await sql`set constraints all deferred`.execute(transaction);
      await sql`
        update scheduling.slots
        set state = 'PUBLISHED', booking_id = null, version = 1
        where slot_id = ${fixture.slot}::uuid
      `.execute(transaction);
      await sql`
        delete from scheduling.sessions where session_id = ${fixture.session}::uuid
      `.execute(transaction);
      await sql`
        delete from scheduling.bookings where booking_id = ${fixture.booking}::uuid
      `.execute(transaction);
    });

    const challengeId = testId(21500);
    await createDirectOpenChallenge(
      database,
      {
        commandId: testId(21501), commandType: 'CREATE_DIRECT_OPEN_CHALLENGE',
        idempotencyKey: 'withdraw-booking-challenge-create',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Challenge', aggregateId: challengeId, expectedVersion: 0,
        correlationId: testId(21502), causationId: null, requestId: testId(21503),
        source: 'api', payloadVersion: 1, payload: { sourceChatId },
      },
      {
        eventId: testId(21504), auditId: testId(21505), outboxMessageId: testId(21506),
        notificationId: testId(21507), notificationOutboxMessageId: testId(21508),
        serviceChatId: testId(21509), serviceChatEventId: testId(21510),
        rulesetSnapshotId: testId(21511), acknowledgmentId: testId(21512),
        reminderTimerOutboxMessageIds: [testId(32001), testId(32002)],
      },
      () => new Date('2026-09-27T10:01:00.000Z'),
    );
    const accepted = await acceptOptionalChallenge(
      database,
      {
        commandId: testId(21513), commandType: 'ACCEPT_OPTIONAL_CHALLENGE',
        idempotencyKey: 'withdraw-booking-challenge-accept',
        actor: { type: 'USER', id: fixture.athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Challenge', aggregateId: challengeId, expectedVersion: 1,
        correlationId: testId(21514), causationId: testId(21504), requestId: testId(21515),
        source: 'api', payloadVersion: 1, payload: { challengeId },
      },
      {
        eventId: testId(21516), auditId: testId(21517), outboxMessageId: testId(21518),
        notificationId: testId(21519), notificationOutboxMessageId: testId(21520),
        acknowledgmentId: testId(21521), obligationIds: [testId(21522), testId(21523)],
      },
      () => new Date('2026-09-27T10:02:00.000Z'),
    );
    expect(accepted.response).toMatchObject({
      state: 'ACCEPTED_UNSCHEDULED',
      schedulingDeadlineAt: '2026-10-11T10:02:00.000Z',
      version: 2,
    });

    const bookingId = testId(21600);
    await selectSlot(
      database,
      {
        commandId: testId(21601), commandType: 'SELECT_SLOT',
        idempotencyKey: 'withdraw-booking-select',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking', aggregateId: bookingId, expectedVersion: 0,
        correlationId: testId(21602), causationId: testId(21516), requestId: testId(21603),
        source: 'api', payloadVersion: 1,
        payload: { chatId: sourceChatId, slotId: fixture.slot, commercialVersion: 1, challengeId },
      } satisfies CommandEnvelope<SelectSlotPayload>,
      {
        eventId: testId(21604), auditId: testId(21605), outboxMessageId: testId(21606),
        notificationId: testId(21607), notificationOutboxMessageId: testId(21608),
        challengeEventId: testId(21609), challengeOutboxMessageId: testId(21610),
      },
      () => new Date('2026-09-27T10:03:00.000Z'),
    );
    await selectSameSlot(
      database,
      {
        commandId: testId(21611), commandType: 'SELECT_SAME_SLOT',
        idempotencyKey: 'withdraw-booking-select-same',
        actor: { type: 'USER', id: fixture.athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking', aggregateId: bookingId, expectedVersion: 1,
        correlationId: testId(21612), causationId: testId(21604), requestId: testId(21613),
        source: 'api', payloadVersion: 1,
        payload: { bookingId, commercialVersion: 1 },
      } satisfies CommandEnvelope<SelectSameSlotPayload>,
      {
        eventId: testId(21614), auditId: testId(21615), outboxMessageId: testId(21616),
        notificationId: testId(21617), notificationOutboxMessageId: testId(21618),
      },
      () => new Date('2026-09-27T10:04:00.000Z'),
    );
    const withdrawalCommand = {
      commandId: testId(21620), commandType: 'WITHDRAW_SLOT_REQUEST',
      idempotencyKey: 'withdraw-booking-request',
      actor: { type: 'USER' as const, id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Booking', aggregateId: bookingId, expectedVersion: 2,
      correlationId: testId(21621), causationId: testId(21614), requestId: testId(21622),
      source: 'api', payloadVersion: 1, payload: { bookingId },
    } satisfies CommandEnvelope<WithdrawBookingRequestPayload>;
    const withdrawalEffects = {
      eventId: testId(21623), auditId: testId(21624), outboxMessageId: testId(21625),
      notificationIds: [testId(21626), testId(21627)] as const,
      notificationOutboxMessageId: testId(21628), challengeEventId: testId(21629),
      challengeOutboxMessageId: testId(21630),
    };
    const withdrawn = await withdrawBookingRequest(
      database, withdrawalCommand, withdrawalEffects,
      () => new Date('2026-09-27T10:05:00.000Z'),
    );
    expect(withdrawn.response).toMatchObject({
      bookingId, challengeId, state: 'CANCELLED', version: 3,
    });
    const replayed = await withdrawBookingRequest(
      database, withdrawalCommand, withdrawalEffects,
      () => new Date('2026-09-27T10:06:00.000Z'),
    );
    expect(replayed).toMatchObject({ replayed: true, response: { state: 'CANCELLED' } });
    await expect(withdrawBookingRequest(
      database,
      {
        ...withdrawalCommand,
        commandId: testId(21631), idempotencyKey: 'withdraw-booking-request-stale',
      },
      { ...withdrawalEffects, eventId: testId(21632), auditId: testId(21633) },
      () => new Date('2026-09-27T10:06:00.000Z'),
    )).rejects.toBeInstanceOf(VersionConflictError);

    const released = await sql<{
      readonly booking_state: string;
      readonly slot_state: string;
      readonly slot_booking_id: string | null;
      readonly challenge_state: string;
      readonly scheduling_deadline_at: Date;
      readonly obligations: string;
      readonly sessions: string;
      readonly results: string;
      readonly cooldowns: string;
    }>`
      select booking.state as booking_state, slot.state as slot_state,
        slot.booking_id::text as slot_booking_id, challenge.state as challenge_state,
        challenge.scheduling_deadline_at,
        (select count(*)::text from competition.challenge_participant_obligations obligation
          where obligation.challenge_id = challenge.challenge_id and obligation.released_at is null) as obligations,
        (select count(*)::text from scheduling.sessions session
          where session.challenge_id = challenge.challenge_id) as sessions,
        (select count(*)::text from competition.results result
          where result.challenge_id = challenge.challenge_id) as results,
        (select count(*)::text from competition.pair_cooldowns cooldown
          where cooldown.source_result_id in (
            select result.result_id from competition.results result
            where result.challenge_id = challenge.challenge_id
          )) as cooldowns
      from scheduling.bookings booking
      join scheduling.slots slot on slot.slot_id = booking.slot_id
      join competition.challenges challenge on challenge.challenge_id = booking.challenge_id
      where booking.booking_id = ${bookingId}::uuid
    `.execute(database);
    expect(released.rows[0]).toMatchObject({
      booking_state: 'CANCELLED', slot_state: 'PUBLISHED', slot_booking_id: null,
      challenge_state: 'ACCEPTED_UNSCHEDULED',
      scheduling_deadline_at: new Date('2026-10-11T10:02:00.000Z'),
      obligations: '2', sessions: '0', results: '0', cooldowns: '0',
    });
    const withdrawalNotifications = await sql<{ readonly payload: {
      readonly notifications: readonly { readonly recipientUserId: string }[];
    } }>`
      select payload from platform.outbox_messages
      where message_id = ${withdrawalEffects.notificationOutboxMessageId}::uuid
    `.execute(database);
    expect(withdrawalNotifications.rows[0]?.payload.notifications.map(
      (notification) => notification.recipientUserId,
    )).toEqual([fixture.athleteB, fixture.coach]);

    const rescheduleBookingId = testId(21700);
    await selectSlot(
      database,
      {
        commandId: testId(21701), commandType: 'SELECT_SLOT',
        idempotencyKey: 'withdraw-booking-race-after-reschedule-select',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking', aggregateId: rescheduleBookingId, expectedVersion: 0,
        correlationId: testId(21702), causationId: testId(21629), requestId: testId(21703),
        source: 'api', payloadVersion: 1,
        payload: { chatId: sourceChatId, slotId: fixture.slot, commercialVersion: 1, challengeId },
      } satisfies CommandEnvelope<SelectSlotPayload>,
      {
        eventId: testId(21704), auditId: testId(21705), outboxMessageId: testId(21706),
        notificationId: testId(21707), notificationOutboxMessageId: testId(21708),
        challengeEventId: testId(21709), challengeOutboxMessageId: testId(21710),
      },
      () => new Date('2026-09-27T10:07:00.000Z'),
    );
    await selectSameSlot(
      database,
      {
        commandId: testId(21711), commandType: 'SELECT_SAME_SLOT',
        idempotencyKey: 'withdraw-booking-race-after-reschedule-select-same',
        actor: { type: 'USER', id: fixture.athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking', aggregateId: rescheduleBookingId, expectedVersion: 1,
        correlationId: testId(21712), causationId: testId(21704), requestId: testId(21713),
        source: 'api', payloadVersion: 1,
        payload: { bookingId: rescheduleBookingId, commercialVersion: 1 },
      } satisfies CommandEnvelope<SelectSameSlotPayload>,
      {
        eventId: testId(21714), auditId: testId(21715), outboxMessageId: testId(21716),
        notificationId: testId(21717), notificationOutboxMessageId: testId(21718),
      },
      () => new Date('2026-09-27T10:08:00.000Z'),
    );

    const rescheduleCommand = {
      commandId: testId(21720), commandType: 'RESCHEDULE_CHALLENGE_BY_ATHLETE',
      idempotencyKey: 'challenge-athlete-reschedule-first',
      actor: { type: 'USER' as const, id: fixture.athleteB, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: challengeId, expectedVersion: 5,
      correlationId: testId(21721), causationId: testId(21714), requestId: testId(21722),
      source: 'api', payloadVersion: 1,
      payload: {
        challengeId, reasonCode: 'SCHEDULE_CHANGED' as const,
        reasonNote: 'Личная причина видна только в защищённом журнале.',
      },
    } satisfies CommandEnvelope<RescheduleChallengeByAthletePayload>;
    const rescheduleEffects = {
      eventId: testId(21723), auditId: testId(21724), outboxMessageId: testId(21725),
      notificationOutboxMessageId: testId(21726), rescheduleId: testId(21727),
      bookingEventId: testId(21728), bookingOutboxMessageId: testId(21729),
      hostNotificationOutboxMessageId: testId(21736),
      notificationId: testId(21735),
      notificationIds: [testId(21730), testId(21731)] as const,
    } satisfies AthleteChallengeRescheduleEffectIds;
    const rescheduled = await rescheduleChallengeByAthlete(
      database, rescheduleCommand, rescheduleEffects,
      () => new Date('2026-09-27T10:09:00.000Z'),
    );
    expect(rescheduled.response).toMatchObject({
      challengeId, state: 'ACCEPTED_UNSCHEDULED', userRescheduleCount: 1,
      schedulingDeadlineAt: '2026-10-11T10:02:00.000Z', version: 6,
    });
    await expect(rescheduleChallengeByAthlete(
      database, rescheduleCommand, rescheduleEffects,
      () => new Date('2026-09-27T10:10:00.000Z'),
    )).resolves.toMatchObject({ replayed: true, response: { userRescheduleCount: 1 } });
    await expect(rescheduleChallengeByAthlete(
      database,
      {
        ...rescheduleCommand,
        commandId: testId(21732), idempotencyKey: 'challenge-athlete-reschedule-stale',
      },
      { ...rescheduleEffects, eventId: testId(21733), auditId: testId(21734) },
      () => new Date('2026-09-27T10:10:00.000Z'),
    )).rejects.toBeInstanceOf(VersionConflictError);

    const rescheduleState = await sql<{
      readonly booking_state: string;
      readonly slot_state: string;
      readonly slot_booking_id: string | null;
      readonly challenge_state: string;
      readonly user_reschedule_count: number;
      readonly scheduling_deadline_at: Date;
      readonly obligations: string;
      readonly results: string;
      readonly cooldowns: string;
      readonly initiated_by_user_id: string;
      readonly booking_id: string | null;
      readonly fault_attribution: string;
      readonly fault_user_id: string | null;
      readonly reason_code: string;
      readonly reason_note: string | null;
    }>`
      select booking.state as booking_state, slot.state as slot_state,
        slot.booking_id::text as slot_booking_id, challenge.state as challenge_state,
        challenge.user_reschedule_count, challenge.scheduling_deadline_at,
        (select count(*)::text from competition.challenge_participant_obligations obligation
          where obligation.challenge_id = challenge.challenge_id and obligation.released_at is null) as obligations,
        (select count(*)::text from competition.results result
          where result.challenge_id = challenge.challenge_id) as results,
        (select count(*)::text from competition.pair_cooldowns cooldown
          where cooldown.source_result_id in (
            select result.result_id from competition.results result
            where result.challenge_id = challenge.challenge_id
          )) as cooldowns,
        reschedule.initiated_by_user_id::text, reschedule.booking_id::text,
        reschedule.fault_attribution, reschedule.fault_user_id::text,
        reschedule.reason_code, reschedule.reason_note
      from scheduling.bookings booking
      join scheduling.slots slot on slot.slot_id = booking.slot_id
      join competition.challenges challenge on challenge.challenge_id = booking.challenge_id
      join competition.challenge_reschedules reschedule
        on reschedule.challenge_id = challenge.challenge_id
      where booking.booking_id = ${rescheduleBookingId}::uuid
        and reschedule.reschedule_id = ${rescheduleEffects.rescheduleId}::uuid
    `.execute(database);
    expect(rescheduleState.rows[0]).toEqual({
      booking_state: 'CANCELLED', slot_state: 'PUBLISHED', slot_booking_id: null,
      challenge_state: 'ACCEPTED_UNSCHEDULED', user_reschedule_count: 1,
      scheduling_deadline_at: new Date('2026-10-11T10:02:00.000Z'),
      obligations: '2', results: '0', cooldowns: '0',
      initiated_by_user_id: fixture.athleteB, booking_id: rescheduleBookingId,
      fault_attribution: 'B', fault_user_id: fixture.athleteB,
      reason_code: 'SCHEDULE_CHANGED',
      reason_note: 'Личная причина видна только в защищённом журнале.',
    });
    const rescheduleEffectsState = await sql<{
      readonly event_payload: Record<string, unknown>;
      readonly audit_metadata: Record<string, unknown>;
      readonly outbox_payload: {
        readonly timer: { readonly deadlineAt: string; readonly expectedVersion: number };
      };
      readonly notification_payload: {
        readonly notifications: readonly { readonly recipientUserId: string }[];
      };
    }>`
      select event.payload as event_payload, audit.metadata as audit_metadata,
        outbox.payload as outbox_payload,
        notification_outbox.payload as notification_payload
      from platform.domain_events event
      join platform.audit_events audit on audit.audit_id = ${rescheduleEffects.auditId}::uuid
      join platform.outbox_messages outbox
        on outbox.message_id = ${rescheduleEffects.outboxMessageId}::uuid
      join platform.outbox_messages notification_outbox
        on notification_outbox.message_id = ${rescheduleEffects.notificationOutboxMessageId}::uuid
      where event.event_id = ${rescheduleEffects.eventId}::uuid
    `.execute(database);
    expect(rescheduleEffectsState.rows[0]?.event_payload).not.toHaveProperty('reasonNote');
    expect(rescheduleEffectsState.rows[0]?.audit_metadata).toMatchObject({
      reasonNote: 'Личная причина видна только в защищённом журнале.',
    });
    expect(rescheduleEffectsState.rows[0]?.outbox_payload).not.toHaveProperty('reasonNote');
    expect(rescheduleEffectsState.rows[0]?.outbox_payload.timer).toMatchObject({
      deadlineAt: '2026-10-11T10:02:00.000Z', expectedVersion: 6,
    });
    expect(rescheduleEffectsState.rows[0]?.notification_payload.notifications.map(
      (notification) => notification.recipientUserId,
    )).toEqual([fixture.athleteA, fixture.coach]);
    await expect(sql`
      update competition.challenge_reschedules
      set reason_code = 'OTHER'
      where reschedule_id = ${rescheduleEffects.rescheduleId}::uuid
    `.execute(database)).rejects.toThrow();

    const raceBookingId = testId(21900);
    await selectSlot(
      database,
      {
        commandId: testId(21901), commandType: 'SELECT_SLOT',
        idempotencyKey: 'withdraw-booking-race-select',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking', aggregateId: raceBookingId, expectedVersion: 0,
        correlationId: testId(21902), causationId: testId(21723), requestId: testId(21903),
        source: 'api', payloadVersion: 1,
        payload: { chatId: sourceChatId, slotId: fixture.slot, commercialVersion: 1, challengeId },
      } satisfies CommandEnvelope<SelectSlotPayload>,
      {
        eventId: testId(21904), auditId: testId(21905), outboxMessageId: testId(21906),
        notificationId: testId(21907), notificationOutboxMessageId: testId(21908),
        challengeEventId: testId(21909), challengeOutboxMessageId: testId(21910),
      },
      () => new Date('2026-09-27T10:11:00.000Z'),
    );
    await selectSameSlot(
      database,
      {
        commandId: testId(21911), commandType: 'SELECT_SAME_SLOT',
        idempotencyKey: 'withdraw-booking-race-select-same',
        actor: { type: 'USER', id: fixture.athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking', aggregateId: raceBookingId, expectedVersion: 1,
        correlationId: testId(21912), causationId: testId(21904), requestId: testId(21913),
        source: 'api', payloadVersion: 1,
        payload: { bookingId: raceBookingId, commercialVersion: 1 },
      } satisfies CommandEnvelope<SelectSameSlotPayload>,
      {
        eventId: testId(21914), auditId: testId(21915), outboxMessageId: testId(21916),
        notificationId: testId(21917), notificationOutboxMessageId: testId(21918),
      },
      () => new Date('2026-09-27T10:12:00.000Z'),
    );
    const raced = await Promise.allSettled([
      withdrawBookingRequest(
        database,
        {
          commandId: testId(21920), commandType: 'WITHDRAW_SLOT_REQUEST',
          idempotencyKey: 'withdraw-booking-race-withdraw',
          actor: { type: 'USER', id: fixture.athleteB, roles: ['ATHLETE'], scopeIds: [] },
          aggregateType: 'Booking', aggregateId: raceBookingId, expectedVersion: 2,
          correlationId: testId(21921), causationId: testId(21914), requestId: testId(21922),
          source: 'api', payloadVersion: 1, payload: { bookingId: raceBookingId },
        } satisfies CommandEnvelope<WithdrawBookingRequestPayload>,
        {
          eventId: testId(21923), auditId: testId(21924), outboxMessageId: testId(21925),
          notificationIds: [testId(21926), testId(21927)],
          notificationOutboxMessageId: testId(21928), challengeEventId: testId(21929),
          challengeOutboxMessageId: testId(21930),
        },
        () => new Date('2026-09-27T10:13:00.000Z'),
      ),
      confirmBookingHost(
        database,
        {
          commandId: testId(22000), commandType: 'CONFIRM_BOOKING_HOST',
          idempotencyKey: 'withdraw-booking-race-confirm',
          actor: { type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [] },
          aggregateType: 'Booking', aggregateId: raceBookingId, expectedVersion: 2,
          correlationId: testId(22001), causationId: testId(21914), requestId: testId(22002),
          source: 'api', payloadVersion: 1, payload: { bookingId: raceBookingId },
        } satisfies CommandEnvelope<ConfirmBookingHostPayload>,
        {
          eventId: testId(22003), auditId: testId(22004), outboxMessageId: testId(22005),
          slotEventId: testId(22006), sessionEventId: testId(22007), sessionId: testId(22008),
          sessionTimerOutboxMessageId: testId(22009),
          notificationIds: [testId(22010), testId(22011)],
          notificationOutboxMessageId: testId(22012), challengeEventId: testId(22013),
          challengeOutboxMessageId: testId(22014),
        },
        () => new Date('2026-09-27T10:13:00.000Z'),
      ),
    ]);
    expect(raced.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const raceState = await sql<{
      readonly booking_state: string;
      readonly slot_state: string;
      readonly slot_booking_id: string | null;
      readonly challenge_state: string;
      readonly sessions: string;
    }>`
      select booking.state as booking_state, slot.state as slot_state,
        slot.booking_id::text as slot_booking_id, challenge.state as challenge_state,
        (select count(*)::text from scheduling.sessions session
          where session.booking_id = booking.booking_id) as sessions
      from scheduling.bookings booking
      join scheduling.slots slot on slot.slot_id = booking.slot_id
      join competition.challenges challenge on challenge.challenge_id = booking.challenge_id
      where booking.booking_id = ${raceBookingId}::uuid
    `.execute(database);
    expect([
      {
        booking_state: 'CANCELLED', slot_state: 'PUBLISHED', slot_booking_id: null,
        challenge_state: 'ACCEPTED_UNSCHEDULED', sessions: '0',
      },
      {
        booking_state: 'CONFIRMED_PAIR', slot_state: 'BOOKED',
        slot_booking_id: raceBookingId, challenge_state: 'BOOKED', sessions: '1',
      },
    ]).toContainEqual(raceState.rows[0]);

    let mutualBookingId = raceBookingId;
    let mutualSessionId = testId(22008);
    if (raceState.rows[0]?.booking_state === 'CANCELLED') {
      mutualBookingId = testId(22100);
      mutualSessionId = testId(22128);
      await selectSlot(
        database,
        {
          commandId: testId(22101), commandType: 'SELECT_SLOT',
          idempotencyKey: 'mutual-reschedule-select-after-race',
          actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
          aggregateType: 'Booking', aggregateId: mutualBookingId, expectedVersion: 0,
          correlationId: testId(22102), causationId: testId(21929), requestId: testId(22103),
          source: 'api', payloadVersion: 1,
          payload: {
            chatId: sourceChatId, slotId: fixture.slot, commercialVersion: 1, challengeId,
          },
        } satisfies CommandEnvelope<SelectSlotPayload>,
        {
          eventId: testId(22104), auditId: testId(22105), outboxMessageId: testId(22106),
          notificationId: testId(22107), notificationOutboxMessageId: testId(22108),
          challengeEventId: testId(22109), challengeOutboxMessageId: testId(22110),
        },
        () => new Date('2026-09-27T10:14:00.000Z'),
      );
      await selectSameSlot(
        database,
        {
          commandId: testId(22111), commandType: 'SELECT_SAME_SLOT',
          idempotencyKey: 'mutual-reschedule-select-same-after-race',
          actor: { type: 'USER', id: fixture.athleteB, roles: ['ATHLETE'], scopeIds: [] },
          aggregateType: 'Booking', aggregateId: mutualBookingId, expectedVersion: 1,
          correlationId: testId(22112), causationId: testId(22104), requestId: testId(22113),
          source: 'api', payloadVersion: 1,
          payload: { bookingId: mutualBookingId, commercialVersion: 1 },
        } satisfies CommandEnvelope<SelectSameSlotPayload>,
        {
          eventId: testId(22114), auditId: testId(22115), outboxMessageId: testId(22116),
          notificationId: testId(22117), notificationOutboxMessageId: testId(22118),
        },
        () => new Date('2026-09-27T10:15:00.000Z'),
      );
      await confirmBookingHost(
        database,
        {
          commandId: testId(22120), commandType: 'CONFIRM_BOOKING_HOST',
          idempotencyKey: 'mutual-reschedule-confirm-host-after-race',
          actor: { type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [] },
          aggregateType: 'Booking', aggregateId: mutualBookingId, expectedVersion: 2,
          correlationId: testId(22121), causationId: testId(22114), requestId: testId(22122),
          source: 'api', payloadVersion: 1, payload: { bookingId: mutualBookingId },
        } satisfies CommandEnvelope<ConfirmBookingHostPayload>,
        {
          eventId: testId(22123), auditId: testId(22124), outboxMessageId: testId(22125),
          slotEventId: testId(22126), sessionEventId: testId(22127),
          sessionId: mutualSessionId, sessionTimerOutboxMessageId: testId(22129),
          notificationIds: [testId(22130), testId(22131)],
          notificationOutboxMessageId: testId(22132), challengeEventId: testId(22133),
          challengeOutboxMessageId: testId(22134),
        },
        () => new Date('2026-09-27T10:16:00.000Z'),
      );
    }

    const bookedChallenge = await sql<{
      readonly version: string;
      readonly user_reschedule_count: number;
    }>`
      select version::text, user_reschedule_count
      from competition.challenges where challenge_id = ${challengeId}::uuid
    `.execute(database);
    const bookedChallengeVersion = Number(bookedChallenge.rows[0]?.version);
    expect(bookedChallenge.rows[0]?.user_reschedule_count).toBe(1);

    const mutualRequestId = testId(22200);
    const proposalCommand = {
      commandId: testId(22201), commandType: 'PROPOSE_MUTUAL_CHALLENGE_RESCHEDULE',
      idempotencyKey: 'challenge-mutual-reschedule-propose',
      actor: { type: 'USER' as const, id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'ChallengeMutualReschedule', aggregateId: mutualRequestId,
      expectedVersion: 0, correlationId: testId(22202), causationId: testId(22003),
      requestId: testId(22203), source: 'api', payloadVersion: 1,
      payload: {
        challengeId, challengeVersion: bookedChallengeVersion,
        reasonCode: 'SCHEDULE_CHANGED' as const,
        reasonNote: 'Оба спортсмена согласовали перенос в личном чате.',
      },
    } satisfies CommandEnvelope<ProposeMutualChallengeReschedulePayload>;
    const proposalEffects = {
      eventId: testId(22204), auditId: testId(22205), outboxMessageId: testId(22206),
      notificationId: testId(22207), notificationOutboxMessageId: testId(22208),
    } satisfies ProposeMutualChallengeRescheduleEffectIds;
    const proposed = await proposeMutualChallengeReschedule(
      database, proposalCommand, proposalEffects,
      () => new Date('2026-09-27T10:17:00.000Z'),
    );
    expect(proposed.response).toMatchObject({
      requestId: mutualRequestId, challengeId, bookingId: mutualBookingId,
      sessionId: mutualSessionId, proposedByUserId: fixture.athleteA,
      confirmedByUserId: null, state: 'PROPOSED', version: 1,
    });
    await expect(readChatChallenge(database, sourceChatId, fixture.athleteB)).resolves
      .toMatchObject({
        mutualRescheduleRequest: {
          requestId: mutualRequestId, state: 'PROPOSED', version: 1,
        },
      });
    const unchangedBeforeConfirmation = await sql<{
      readonly challenge_state: string;
      readonly user_reschedule_count: number;
      readonly booking_state: string;
      readonly session_state: string;
      readonly slot_state: string;
    }>`
      select challenge.state as challenge_state, challenge.user_reschedule_count,
        booking.state as booking_state, session.state as session_state, slot.state as slot_state
      from competition.challenges challenge
      join scheduling.bookings booking on booking.booking_id = ${mutualBookingId}::uuid
      join scheduling.sessions session on session.session_id = ${mutualSessionId}::uuid
      join scheduling.slots slot on slot.slot_id = booking.slot_id
      where challenge.challenge_id = ${challengeId}::uuid
    `.execute(database);
    expect(unchangedBeforeConfirmation.rows[0]).toEqual({
      challenge_state: 'BOOKED', user_reschedule_count: 1,
      booking_state: 'CONFIRMED_PAIR', session_state: 'SCHEDULED', slot_state: 'BOOKED',
    });

    const selfConfirmEffects = {
      eventId: testId(22304), auditId: testId(22305), outboxMessageId: testId(22306),
      notificationId: testId(22307), notificationOutboxMessageId: testId(22308),
      rescheduleId: testId(22309), requestEventId: testId(22310),
      bookingEventId: testId(22311), slotEventId: testId(22312),
      sessionEventId: testId(22313), bookingOutboxMessageId: testId(22314),
      notificationIds: [testId(22315), testId(22316), testId(22317)],
    } satisfies ConfirmMutualChallengeRescheduleEffectIds;
    await expect(confirmMutualChallengeReschedule(
      database,
      {
        commandId: testId(22301), commandType: 'CONFIRM_MUTUAL_CHALLENGE_RESCHEDULE',
        idempotencyKey: 'challenge-mutual-reschedule-self-confirm',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Challenge', aggregateId: challengeId,
        expectedVersion: bookedChallengeVersion, correlationId: testId(22302),
        causationId: testId(22204), requestId: testId(22303), source: 'api',
        payloadVersion: 1,
        payload: { challengeId, requestId: mutualRequestId, requestVersion: 1 },
      } satisfies CommandEnvelope<ConfirmMutualChallengeReschedulePayload>,
      selfConfirmEffects,
      () => new Date('2026-09-27T10:18:00.000Z'),
    )).rejects.toMatchObject({ code: 'CHALLENGE_MUTUAL_RESCHEDULE_PEER_REQUIRED' });

    const confirmCommand = {
      commandId: testId(22401), commandType: 'CONFIRM_MUTUAL_CHALLENGE_RESCHEDULE',
      idempotencyKey: 'challenge-mutual-reschedule-confirm',
      actor: { type: 'USER' as const, id: fixture.athleteB, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: challengeId,
      expectedVersion: bookedChallengeVersion, correlationId: testId(22402),
      causationId: testId(22204), requestId: testId(22403), source: 'api',
      payloadVersion: 1,
      payload: { challengeId, requestId: mutualRequestId, requestVersion: 1 },
    } satisfies CommandEnvelope<ConfirmMutualChallengeReschedulePayload>;
    const confirmEffects = {
      eventId: testId(22404), auditId: testId(22405), outboxMessageId: testId(22406),
      notificationId: testId(22407), notificationOutboxMessageId: testId(22408),
      rescheduleId: testId(22409), requestEventId: testId(22410),
      bookingEventId: testId(22411), slotEventId: testId(22412),
      sessionEventId: testId(22413), bookingOutboxMessageId: testId(22414),
      notificationIds: [testId(22415), testId(22416), testId(22417)],
    } satisfies ConfirmMutualChallengeRescheduleEffectIds;
    const mutuallyRescheduled = await confirmMutualChallengeReschedule(
      database, confirmCommand, confirmEffects,
      () => new Date('2026-09-27T10:19:00.000Z'),
    );
    expect(mutuallyRescheduled.response).toMatchObject({
      challengeId, state: 'ACCEPTED_UNSCHEDULED', userRescheduleCount: 2,
      schedulingDeadlineAt: '2026-10-11T10:02:00.000Z',
      version: bookedChallengeVersion + 1,
    });
    await expect(confirmMutualChallengeReschedule(
      database, confirmCommand, confirmEffects,
      () => new Date('2026-09-27T10:20:00.000Z'),
    )).resolves.toMatchObject({ replayed: true, response: { userRescheduleCount: 2 } });
    await expect(confirmMutualChallengeReschedule(
      database,
      {
        ...confirmCommand, commandId: testId(22418),
        idempotencyKey: 'challenge-mutual-reschedule-confirm-stale',
      },
      { ...confirmEffects, eventId: testId(22419), auditId: testId(22420) },
      () => new Date('2026-09-27T10:20:00.000Z'),
    )).rejects.toBeInstanceOf(VersionConflictError);

    const mutualState = await sql<{
      readonly challenge_state: string;
      readonly challenge_version: string;
      readonly user_reschedule_count: number;
      readonly scheduling_deadline_at: Date;
      readonly booking_state: string;
      readonly session_state: string;
      readonly slot_state: string;
      readonly request_state: string;
      readonly request_version: string;
      readonly proposed_by_user_id: string;
      readonly confirmed_by_user_id: string | null;
      readonly initiated_by_user_id: string;
      readonly fault_attribution: string;
      readonly fault_user_id: string | null;
      readonly reason_note: string | null;
      readonly reschedules: string;
      readonly obligations: string;
      readonly results: string;
      readonly cooldowns: string;
    }>`
      select challenge.state as challenge_state, challenge.version::text as challenge_version,
        challenge.user_reschedule_count, challenge.scheduling_deadline_at,
        booking.state as booking_state, session.state as session_state, slot.state as slot_state,
        request.state as request_state, request.version as request_version,
        request.proposed_by_user_id::text, request.confirmed_by_user_id::text,
        reschedule.initiated_by_user_id::text, reschedule.fault_attribution,
        reschedule.fault_user_id::text, reschedule.reason_note,
        (select count(*)::text from competition.challenge_reschedules item
          where item.challenge_id = challenge.challenge_id) as reschedules,
        (select count(*)::text from competition.challenge_participant_obligations obligation
          where obligation.challenge_id = challenge.challenge_id and obligation.released_at is null) as obligations,
        (select count(*)::text from competition.results result
          where result.challenge_id = challenge.challenge_id) as results,
        (select count(*)::text from competition.pair_cooldowns cooldown
          where cooldown.source_result_id in (
            select result.result_id from competition.results result
            where result.challenge_id = challenge.challenge_id
          )) as cooldowns
      from competition.challenges challenge
      join competition.challenge_mutual_reschedule_requests request
        on request.request_id = ${mutualRequestId}::uuid
      join competition.challenge_reschedules reschedule
        on reschedule.reschedule_id = ${confirmEffects.rescheduleId}::uuid
      join scheduling.bookings booking on booking.booking_id = ${mutualBookingId}::uuid
      join scheduling.sessions session on session.session_id = ${mutualSessionId}::uuid
      join scheduling.slots slot on slot.slot_id = booking.slot_id
      where challenge.challenge_id = ${challengeId}::uuid
    `.execute(database);
    expect(mutualState.rows[0]).toEqual({
      challenge_state: 'ACCEPTED_UNSCHEDULED',
      challenge_version: String(bookedChallengeVersion + 1), user_reschedule_count: 2,
      scheduling_deadline_at: new Date('2026-10-11T10:02:00.000Z'),
      booking_state: 'CANCELLED', session_state: 'CANCELLED', slot_state: 'CANCELLED',
      request_state: 'CONFIRMED', request_version: '2',
      proposed_by_user_id: fixture.athleteA, confirmed_by_user_id: fixture.athleteB,
      initiated_by_user_id: fixture.athleteA, fault_attribution: 'MUTUAL',
      fault_user_id: null,
      reason_note: 'Оба спортсмена согласовали перенос в личном чате.',
      reschedules: '2', obligations: '2', results: '0', cooldowns: '0',
    });
    const mutualEffectsState = await sql<{
      readonly proposal_payload: Record<string, unknown>;
      readonly confirmation_payload: Record<string, unknown>;
      readonly audit_metadata: Record<string, unknown>;
      readonly outbox_payload: {
        readonly timer: { readonly deadlineAt: string; readonly expectedVersion: number };
      };
      readonly notification_payload: {
        readonly notifications: readonly { readonly recipientUserId: string }[];
      };
    }>`
      select proposal.payload as proposal_payload,
        confirmation.payload as confirmation_payload, audit.metadata as audit_metadata,
        outbox.payload as outbox_payload, notification.payload as notification_payload
      from platform.domain_events proposal
      join platform.domain_events confirmation
        on confirmation.event_id = ${confirmEffects.eventId}::uuid
      join platform.audit_events audit on audit.audit_id = ${confirmEffects.auditId}::uuid
      join platform.outbox_messages outbox
        on outbox.message_id = ${confirmEffects.outboxMessageId}::uuid
      join platform.outbox_messages notification
        on notification.message_id = ${confirmEffects.notificationOutboxMessageId}::uuid
      where proposal.event_id = ${proposalEffects.eventId}::uuid
    `.execute(database);
    expect(mutualEffectsState.rows[0]?.proposal_payload).not.toHaveProperty('reasonNote');
    expect(mutualEffectsState.rows[0]?.confirmation_payload).not.toHaveProperty('reasonNote');
    expect(mutualEffectsState.rows[0]?.audit_metadata).toMatchObject({
      reasonNote: 'Оба спортсмена согласовали перенос в личном чате.',
      faultAttribution: 'MUTUAL', userRescheduleCount: 2,
    });
    expect(mutualEffectsState.rows[0]?.outbox_payload).not.toHaveProperty('reasonNote');
    expect(mutualEffectsState.rows[0]?.outbox_payload.timer).toEqual({
      commandType: 'EXPIRE_CHALLENGE_SCHEDULING', aggregateType: 'Challenge',
      aggregateId: challengeId, deadlineAt: '2026-10-11T10:02:00.000Z',
      expectedState: 'ACCEPTED_UNSCHEDULED', expectedVersion: bookedChallengeVersion + 1,
      policyVersion: 'challenge-mvp-v1',
      idempotencyKey: `challenge:${challengeId}:expire-scheduling:v${bookedChallengeVersion + 1}`,
    });
    expect(mutualEffectsState.rows[0]?.notification_payload.notifications
      .map((notification) => notification.recipientUserId).sort())
      .toEqual([fixture.athleteA, fixture.athleteB, fixture.coach].sort());
    await expect(proposeMutualChallengeReschedule(
      database,
      {
        ...proposalCommand, commandId: testId(22501), aggregateId: testId(22500),
        idempotencyKey: 'challenge-mutual-reschedule-third-denied',
        payload: { ...proposalCommand.payload, challengeVersion: bookedChallengeVersion + 1 },
      },
      {
        eventId: testId(22504), auditId: testId(22505), outboxMessageId: testId(22506),
        notificationId: testId(22507), notificationOutboxMessageId: testId(22508),
      },
      () => new Date('2026-09-27T10:21:00.000Z'),
    )).rejects.toMatchObject({ code: 'CHALLENGE_RESCHEDULE_LIMIT_REACHED' });

    const externalSlotId = testId(22600);
    await publishSlot(
      database,
      {
        commandId: testId(22601), commandType: 'PUBLISH_SLOT',
        idempotencyKey: 'external-reschedule-slot',
        actor: {
          type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community],
        },
        aggregateType: 'Slot', aggregateId: externalSlotId, expectedVersion: 0,
        correlationId: testId(22602), causationId: null, requestId: testId(22603),
        source: 'api', payloadVersion: 1,
        payload: {
          venueId: fixture.venue, coachUserId: fixture.coach,
          startAt: '2026-10-03T10:00:00.000Z', endAt: '2026-10-03T11:00:00.000Z',
          priceAmount: '1500.00', priceCurrency: 'RUB',
          priceText: 'Оплата напрямую залу', cancellationTermsText: 'Уточните условия у зала',
        },
      } satisfies CommandEnvelope<PublishSlotPayload>,
      {
        eventId: testId(22604), auditId: testId(22605), outboxMessageId: testId(22606),
      },
      () => new Date('2026-09-27T10:22:00.000Z'),
    );
    const externalBookingId = testId(22700);
    await selectSlot(
      database,
      {
        commandId: testId(22701), commandType: 'SELECT_SLOT',
        idempotencyKey: 'external-reschedule-select',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking', aggregateId: externalBookingId, expectedVersion: 0,
        correlationId: testId(22702), causationId: testId(22604), requestId: testId(22703),
        source: 'api', payloadVersion: 1,
        payload: {
          chatId: sourceChatId, slotId: externalSlotId,
          commercialVersion: 1, challengeId,
        },
      } satisfies CommandEnvelope<SelectSlotPayload>,
      {
        eventId: testId(22704), auditId: testId(22705), outboxMessageId: testId(22706),
        notificationId: testId(22707), notificationOutboxMessageId: testId(22708),
        challengeEventId: testId(22709), challengeOutboxMessageId: testId(22710),
      },
      () => new Date('2026-09-27T10:23:00.000Z'),
    );
    await selectSameSlot(
      database,
      {
        commandId: testId(22711), commandType: 'SELECT_SAME_SLOT',
        idempotencyKey: 'external-reschedule-select-same',
        actor: { type: 'USER', id: fixture.athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking', aggregateId: externalBookingId, expectedVersion: 1,
        correlationId: testId(22712), causationId: testId(22704), requestId: testId(22713),
        source: 'api', payloadVersion: 1,
        payload: { bookingId: externalBookingId, commercialVersion: 1 },
      } satisfies CommandEnvelope<SelectSameSlotPayload>,
      {
        eventId: testId(22714), auditId: testId(22715), outboxMessageId: testId(22716),
        notificationId: testId(22717), notificationOutboxMessageId: testId(22718),
      },
      () => new Date('2026-09-27T10:24:00.000Z'),
    );
    const externalSessionId = testId(22808);
    const externallyBookable = await confirmBookingHost(
      database,
      {
        commandId: testId(22800), commandType: 'CONFIRM_BOOKING_HOST',
        idempotencyKey: 'external-reschedule-confirm-host',
        actor: { type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [] },
        aggregateType: 'Booking', aggregateId: externalBookingId, expectedVersion: 2,
        correlationId: testId(22801), causationId: testId(22714), requestId: testId(22802),
        source: 'api', payloadVersion: 1, payload: { bookingId: externalBookingId },
      } satisfies CommandEnvelope<ConfirmBookingHostPayload>,
      {
        eventId: testId(22803), auditId: testId(22804), outboxMessageId: testId(22805),
        slotEventId: testId(22806), sessionEventId: testId(22807),
        sessionId: externalSessionId, sessionTimerOutboxMessageId: testId(22809),
        notificationIds: [testId(22810), testId(22811)],
        notificationOutboxMessageId: testId(22812), challengeEventId: testId(22813),
        challengeOutboxMessageId: testId(22814),
      },
      () => new Date('2026-09-27T10:25:00.000Z'),
    );
    if (!externallyBookable.response.session) throw new Error('Expected Official Session');
    expect(externallyBookable.response.session).toMatchObject({
      sessionId: externalSessionId, purpose: 'OFFICIAL_CHALLENGE', state: 'SCHEDULED',
    });
    const challengeBeforeExternal = await readChatChallenge(
      database, sourceChatId, fixture.athleteA,
    );
    const officialChallengeVersion = challengeBeforeExternal.challenge!.version;
    await openSessionWindow(
      database,
      {
        commandId: testId(22840), commandType: 'OPEN_SESSION_WINDOW',
        idempotencyKey: `session:${externalSessionId}:open-session-window:v1`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'Session', aggregateId: externalSessionId, expectedVersion: 1,
        correlationId: testId(22841), causationId: testId(22807), requestId: testId(22842),
        source: 'scheduler', payloadVersion: 1, payload: { sessionId: externalSessionId },
      } satisfies CommandEnvelope<OpenSessionWindowPayload>,
      {
        eventId: testId(22843), auditId: testId(22844), outboxMessageId: testId(22845),
        competitiveSnapshotId: testId(22846),
      },
      () => new Date('2026-10-03T10:00:00.000Z'),
    );

    await expect(failSessionExternal(
      database,
      {
        commandId: testId(22820), commandType: 'FAIL_SESSION_EXTERNAL',
        idempotencyKey: 'external-reschedule-athlete-denied',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Session', aggregateId: externalSessionId, expectedVersion: 2,
        correlationId: testId(22821), causationId: testId(22807), requestId: testId(22822),
        source: 'api', payloadVersion: 1,
        payload: { sessionId: externalSessionId, reasonCode: 'COACH_UNAVAILABLE' },
      } satisfies CommandEnvelope<FailSessionExternalPayload>,
      {
        eventId: testId(22823), auditId: testId(22824), outboxMessageId: testId(22825),
        bookingEventId: testId(22826), slotEventId: testId(22827),
        notificationOutboxMessageId: testId(22828),
        notificationIds: [testId(22829), testId(22830)],
        challengeEventId: testId(22831), challengeOutboxMessageId: testId(22832),
        rescheduleId: testId(22833),
      },
      () => new Date('2026-10-03T10:00:30.000Z'),
    )).rejects.toBeInstanceOf(SchedulingPermissionDeniedError);

    const externalCommand = {
      commandId: testId(22901), commandType: 'FAIL_SESSION_EXTERNAL',
      idempotencyKey: 'external-reschedule-coach-confirmed',
      actor: { type: 'USER' as const, id: fixture.coach, roles: ['COACH'], scopeIds: [] },
      aggregateType: 'Session', aggregateId: externalSessionId, expectedVersion: 2,
      correlationId: testId(22902), causationId: testId(22807), requestId: testId(22903),
      source: 'api', payloadVersion: 1,
      payload: { sessionId: externalSessionId, reasonCode: 'COACH_UNAVAILABLE' as const },
    } satisfies CommandEnvelope<FailSessionExternalPayload>;
    const externalEffects = {
      eventId: testId(22904), auditId: testId(22905), outboxMessageId: testId(22906),
      bookingEventId: testId(22907), slotEventId: testId(22908),
      notificationOutboxMessageId: testId(22909),
      notificationIds: [testId(22910), testId(22911)],
      challengeEventId: testId(22912), challengeOutboxMessageId: testId(22913),
      rescheduleId: testId(22914),
    } satisfies SessionEffectIds;
    const externallyRescheduled = await failSessionExternal(
      database, externalCommand, externalEffects,
      () => new Date('2026-10-03T10:01:00.000Z'),
    );
    expect(externallyRescheduled.response).toMatchObject({
      sessionId: externalSessionId, state: 'CANCELLED',
      cancellationReasonCode: 'COACH_UNAVAILABLE',
      challengeId, challengeState: 'ACCEPTED_UNSCHEDULED',
      challengeVersion: officialChallengeVersion + 1,
    });
    await expect(failSessionExternal(
      database, externalCommand, externalEffects,
      () => new Date('2026-10-03T10:02:00.000Z'),
    )).resolves.toMatchObject({ replayed: true, response: { challengeState: 'ACCEPTED_UNSCHEDULED' } });
    await expect(failSessionExternal(
      database,
      {
        ...externalCommand, commandId: testId(22915),
        idempotencyKey: 'external-reschedule-coach-stale',
      },
      { ...externalEffects, eventId: testId(22916), auditId: testId(22917) },
      () => new Date('2026-10-03T10:02:00.000Z'),
    )).rejects.toBeInstanceOf(VersionConflictError);

    const externalState = await sql<{
      readonly challenge_state: string;
      readonly challenge_version: string;
      readonly user_reschedule_count: number;
      readonly scheduling_deadline_at: Date;
      readonly booking_state: string;
      readonly session_state: string;
      readonly actual_start_at: Date | null;
      readonly slot_state: string;
      readonly initiated_by_user_id: string;
      readonly fault_attribution: string;
      readonly fault_user_id: string | null;
      readonly reason_code: string;
      readonly reason_note: string | null;
      readonly obligations: string;
      readonly results: string;
      readonly cooldowns: string;
      readonly snapshots: string;
    }>`
      select challenge.state as challenge_state, challenge.version::text as challenge_version,
        challenge.user_reschedule_count, challenge.scheduling_deadline_at,
        booking.state as booking_state, session.state as session_state,
        session.actual_start_at, slot.state as slot_state,
        reschedule.initiated_by_user_id::text, reschedule.fault_attribution,
        reschedule.fault_user_id::text, reschedule.reason_code, reschedule.reason_note,
        (select count(*)::text from competition.challenge_participant_obligations obligation
          where obligation.challenge_id = challenge.challenge_id and obligation.released_at is null) as obligations,
        (select count(*)::text from competition.results result
          where result.challenge_id = challenge.challenge_id) as results,
        (select count(*)::text from competition.pair_cooldowns cooldown
          where cooldown.source_result_id in (
            select result.result_id from competition.results result
            where result.challenge_id = challenge.challenge_id
          )) as cooldowns,
        (select count(*)::text from scheduling.session_competitive_snapshots snapshot
          where snapshot.session_id = session.session_id) as snapshots
      from competition.challenges challenge
      join scheduling.bookings booking on booking.booking_id = ${externalBookingId}::uuid
      join scheduling.sessions session on session.session_id = ${externalSessionId}::uuid
      join scheduling.slots slot on slot.slot_id = booking.slot_id
      join competition.challenge_reschedules reschedule
        on reschedule.reschedule_id = ${externalEffects.rescheduleId}::uuid
      where challenge.challenge_id = ${challengeId}::uuid
    `.execute(database);
    expect(externalState.rows[0]).toEqual({
      challenge_state: 'ACCEPTED_UNSCHEDULED',
      challenge_version: String(officialChallengeVersion + 1),
      user_reschedule_count: 2,
      scheduling_deadline_at: new Date('2026-10-11T10:02:00.000Z'),
      booking_state: 'CANCELLED', session_state: 'CANCELLED', actual_start_at: null,
      slot_state: 'CANCELLED',
      initiated_by_user_id: fixture.coach, fault_attribution: 'EXTERNAL',
      fault_user_id: null, reason_code: 'COACH_UNAVAILABLE', reason_note: null,
      obligations: '2', results: '0', cooldowns: '0', snapshots: '1',
    });
    const externalEffectsState = await sql<{
      readonly session_transition_id: string;
      readonly event_payload: Record<string, unknown>;
      readonly audit_metadata: Record<string, unknown>;
      readonly outbox_payload: {
        readonly sessionId: string;
        readonly timer: { readonly deadlineAt: string; readonly expectedVersion: number };
      };
      readonly notification_payload: {
        readonly notifications: readonly {
          readonly recipientUserId: string;
          readonly renderKey: string;
          readonly payload: { readonly challengeId: string; readonly challengeState: string };
        }[];
      };
    }>`
      select (select session_event.transition_id from platform.domain_events session_event
          where session_event.event_id = ${externalEffects.eventId}::uuid) as session_transition_id,
        event.payload as event_payload, audit.metadata as audit_metadata,
        outbox.payload as outbox_payload, notification.payload as notification_payload
      from platform.domain_events event
      join platform.audit_events audit on audit.audit_id = ${externalEffects.auditId}::uuid
      join platform.outbox_messages outbox
        on outbox.message_id = ${externalEffects.challengeOutboxMessageId}::uuid
      join platform.outbox_messages notification
        on notification.message_id = ${externalEffects.notificationOutboxMessageId}::uuid
      where event.event_id = ${externalEffects.challengeEventId}::uuid
        and event.transition_id = 'CH-21'
    `.execute(database);
    expect(externalEffectsState.rows[0]?.session_transition_id).toBe('S-11');
    expect(externalEffectsState.rows[0]?.event_payload).toMatchObject({
      challengeId, bookingId: externalBookingId, sessionId: externalSessionId,
      faultAttribution: 'EXTERNAL', reasonCode: 'COACH_UNAVAILABLE',
      userRescheduleCount: 2,
    });
    expect(externalEffectsState.rows[0]?.event_payload).not.toHaveProperty('reasonNote');
    expect(externalEffectsState.rows[0]?.audit_metadata).toMatchObject({
      fault: 'EXTERNAL', challengeId, rescheduleId: externalEffects.rescheduleId,
      userRescheduleCounted: false, userRescheduleCount: 2,
    });
    expect(externalEffectsState.rows[0]?.outbox_payload).not.toHaveProperty('reasonNote');
    expect(externalEffectsState.rows[0]?.outbox_payload).toMatchObject({
      sessionId: externalSessionId,
      timer: {
        deadlineAt: '2026-10-11T10:02:00.000Z',
        expectedVersion: officialChallengeVersion + 1,
      },
    });
    expect(externalEffectsState.rows[0]?.notification_payload.notifications.map(
      (notification) => ({
        recipientUserId: notification.recipientUserId,
        renderKey: notification.renderKey,
        challengeId: notification.payload.challengeId,
        challengeState: notification.payload.challengeState,
      }),
    )).toEqual([
      {
        recipientUserId: fixture.athleteA,
        renderKey: 'challenge.external-rescheduled',
        challengeId, challengeState: 'ACCEPTED_UNSCHEDULED',
      },
      {
        recipientUserId: fixture.athleteB,
        renderKey: 'challenge.external-rescheduled',
        challengeId, challengeState: 'ACCEPTED_UNSCHEDULED',
      },
    ]);

    const cancellationSlotId = testId(23000);
    await publishSlot(
      database,
      {
        commandId: testId(23001), commandType: 'PUBLISH_SLOT',
        idempotencyKey: 'official-cancellation-slot',
        actor: { type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [] },
        aggregateType: 'Slot', aggregateId: cancellationSlotId, expectedVersion: 0,
        correlationId: testId(23002), causationId: null, requestId: testId(23003),
        source: 'api', payloadVersion: 1,
        payload: {
          venueId: fixture.venue, coachUserId: fixture.coach,
          startAt: '2026-10-05T10:00:00.000Z', endAt: '2026-10-05T11:00:00.000Z',
          priceAmount: '1500.00', priceCurrency: 'RUB',
          priceText: 'Оплата напрямую залу', cancellationTermsText: 'Уточните условия у зала',
        },
      } satisfies CommandEnvelope<PublishSlotPayload>,
      { eventId: testId(23004), auditId: testId(23005), outboxMessageId: testId(23006) },
      () => new Date('2026-10-03T10:02:00.000Z'),
    );
    const cancellationBookingId = testId(23100);
    await selectSlot(
      database,
      {
        commandId: testId(23101), commandType: 'SELECT_SLOT',
        idempotencyKey: 'official-cancellation-select',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking', aggregateId: cancellationBookingId, expectedVersion: 0,
        correlationId: testId(23102), causationId: testId(23004), requestId: testId(23103),
        source: 'api', payloadVersion: 1,
        payload: {
          chatId: sourceChatId, slotId: cancellationSlotId,
          commercialVersion: 1, challengeId,
        },
      } satisfies CommandEnvelope<SelectSlotPayload>,
      {
        eventId: testId(23104), auditId: testId(23105), outboxMessageId: testId(23106),
        notificationId: testId(23107), notificationOutboxMessageId: testId(23108),
        challengeEventId: testId(23109), challengeOutboxMessageId: testId(23110),
      },
      () => new Date('2026-10-03T10:03:00.000Z'),
    );
    await selectSameSlot(
      database,
      {
        commandId: testId(23111), commandType: 'SELECT_SAME_SLOT',
        idempotencyKey: 'official-cancellation-select-same',
        actor: { type: 'USER', id: fixture.athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking', aggregateId: cancellationBookingId, expectedVersion: 1,
        correlationId: testId(23112), causationId: testId(23104), requestId: testId(23113),
        source: 'api', payloadVersion: 1,
        payload: { bookingId: cancellationBookingId, commercialVersion: 1 },
      } satisfies CommandEnvelope<SelectSameSlotPayload>,
      {
        eventId: testId(23114), auditId: testId(23115), outboxMessageId: testId(23116),
        notificationId: testId(23117), notificationOutboxMessageId: testId(23118),
      },
      () => new Date('2026-10-03T10:04:00.000Z'),
    );
    const cancellationSessionId = testId(23208);
    const confirmedForCancellation = await confirmBookingHost(
      database,
      {
        commandId: testId(23200), commandType: 'CONFIRM_BOOKING_HOST',
        idempotencyKey: 'official-cancellation-confirm-host',
        actor: { type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [] },
        aggregateType: 'Booking', aggregateId: cancellationBookingId, expectedVersion: 2,
        correlationId: testId(23201), causationId: testId(23114), requestId: testId(23202),
        source: 'api', payloadVersion: 1, payload: { bookingId: cancellationBookingId },
      } satisfies CommandEnvelope<ConfirmBookingHostPayload>,
      {
        eventId: testId(23203), auditId: testId(23204), outboxMessageId: testId(23205),
        slotEventId: testId(23206), sessionEventId: testId(23207),
        sessionId: cancellationSessionId, sessionTimerOutboxMessageId: testId(23209),
        notificationIds: [testId(23210), testId(23211)],
        notificationOutboxMessageId: testId(23212), challengeEventId: testId(23213),
        challengeOutboxMessageId: testId(23214),
      },
      () => new Date('2026-10-03T10:05:00.000Z'),
    );
    expect(confirmedForCancellation.response.session).toMatchObject({
      sessionId: cancellationSessionId, state: 'SCHEDULED', purpose: 'OFFICIAL_CHALLENGE',
    });
    await openSessionWindow(
      database,
      {
        commandId: testId(23240), commandType: 'OPEN_SESSION_WINDOW',
        idempotencyKey: `session:${cancellationSessionId}:open-session-window:v1`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'Session', aggregateId: cancellationSessionId, expectedVersion: 1,
        correlationId: testId(23241), causationId: testId(23207), requestId: testId(23242),
        source: 'scheduler', payloadVersion: 1, payload: { sessionId: cancellationSessionId },
      } satisfies CommandEnvelope<OpenSessionWindowPayload>,
      {
        eventId: testId(23243), auditId: testId(23244), outboxMessageId: testId(23245),
        competitiveSnapshotId: testId(23246),
      },
      () => new Date('2026-10-05T10:00:00.000Z'),
    );
    await expect(readSession(database, cancellationSessionId, fixture.athleteA))
      .resolves.toMatchObject({
        state: 'READY_FOR_COACH', viewerCanCancelOfficial: true, resultId: null,
      });

    const officialCancellationIds: SessionEffectIds = {
      eventId: testId(23404), auditId: testId(23405), outboxMessageId: testId(23406),
      bookingEventId: testId(23407), slotEventId: testId(23408),
      challengeEventId: testId(23409), resultId: testId(23410),
      resultEventId: testId(23411), statusTransitionId: testId(23412),
      statusEventId: testId(23413), cooldownId: testId(23414),
      cooldownEventId: testId(23415), resultOutboxMessageId: testId(23416),
      resultNotificationOutboxMessageId: testId(23417),
      resultNotificationIds: [testId(23418), testId(23419), testId(23420)],
    };
    await expect(cancelOfficialSessionByAthlete(
      database,
      {
        commandId: testId(23300), commandType: 'CANCEL_OFFICIAL_BY_ATHLETE',
        idempotencyKey: 'official-cancellation-coach-denied',
        actor: { type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [] },
        aggregateType: 'Session', aggregateId: cancellationSessionId, expectedVersion: 2,
        correlationId: testId(23301), causationId: testId(23243), requestId: testId(23302),
        source: 'api', payloadVersion: 1, payload: { sessionId: cancellationSessionId },
      } satisfies CommandEnvelope<CancelOfficialSessionByAthletePayload>,
      officialCancellationIds,
      () => new Date('2026-10-05T10:00:10.000Z'),
    )).rejects.toBeInstanceOf(SchedulingPermissionDeniedError);

    const cancellationCommand = {
      commandId: testId(23400), commandType: 'CANCEL_OFFICIAL_BY_ATHLETE',
      idempotencyKey: 'official-cancellation-athlete-confirmed',
      actor: { type: 'USER' as const, id: fixture.athleteA, roles: [], scopeIds: [] },
      aggregateType: 'Session', aggregateId: cancellationSessionId, expectedVersion: 2,
      correlationId: testId(23401), causationId: testId(23243), requestId: testId(23402),
      source: 'api', payloadVersion: 1, payload: { sessionId: cancellationSessionId },
    } satisfies CommandEnvelope<CancelOfficialSessionByAthletePayload>;
    const cancelledOfficial = await cancelOfficialSessionByAthlete(
      database,
      cancellationCommand,
      officialCancellationIds,
      () => new Date('2026-10-05T10:00:30.000Z'),
    );
    expect(cancelledOfficial.response).toMatchObject({
      state: 'CANCELLED', cancellationReasonCode: 'ATHLETE_CANCELLED_OFFICIAL',
      challengeState: 'RESULT_RECORDED', resultId: officialCancellationIds.resultId,
      viewerCanCancelOfficial: false, version: 3,
    });
    await expect(cancelOfficialSessionByAthlete(
      database,
      cancellationCommand,
      officialCancellationIds,
      () => new Date('2026-10-05T10:01:00.000Z'),
    )).resolves.toMatchObject({ replayed: true, response: { resultId: officialCancellationIds.resultId } });
    await expect(cancelOfficialSessionByAthlete(
      database,
      {
        ...cancellationCommand, commandId: testId(23421),
        idempotencyKey: 'official-cancellation-athlete-stale',
      },
      { ...officialCancellationIds, eventId: testId(23422), auditId: testId(23423) },
      () => new Date('2026-10-05T10:01:00.000Z'),
    )).rejects.toBeInstanceOf(VersionConflictError);

    const cancellationState = await sql<{
      readonly session_state: string;
      readonly booking_state: string;
      readonly slot_state: string;
      readonly challenge_state: string;
      readonly user_reschedule_count: number;
      readonly obligations: string;
      readonly snapshots: string;
      readonly reschedules_for_booking: string;
      readonly result_origin: string;
      readonly outcome_code: string;
      readonly winner_user_id: string;
      readonly loser_user_id: string;
      readonly result_session_id: string | null;
      readonly appeal_deadline_at: Date;
      readonly cooldowns: string;
      readonly status_transitions: string;
    }>`
      select session.state as session_state, booking.state as booking_state,
        slot.state as slot_state, challenge.state as challenge_state,
        challenge.user_reschedule_count,
        (select count(*)::text from competition.challenge_participant_obligations obligation
          where obligation.challenge_id = challenge.challenge_id
            and obligation.released_at is null) as obligations,
        (select count(*)::text from scheduling.session_competitive_snapshots snapshot
          where snapshot.session_id = session.session_id) as snapshots,
        (select count(*)::text from competition.challenge_reschedules reschedule
          where reschedule.booking_id = booking.booking_id) as reschedules_for_booking,
        result.origin as result_origin, result.recorded_outcome_code as outcome_code,
        result.winner_user_id::text, result.loser_user_id::text,
        result.session_id::text as result_session_id, result.appeal_deadline_at,
        (select count(*)::text from competition.pair_cooldowns cooldown
          where cooldown.source_result_id = result.result_id) as cooldowns,
        (select count(*)::text from competition.status_transitions status_transition
          where status_transition.source_result_id = result.result_id) as status_transitions
      from scheduling.sessions session
      join scheduling.bookings booking on booking.booking_id = session.booking_id
      join scheduling.slots slot on slot.slot_id = booking.slot_id
      join competition.challenges challenge on challenge.challenge_id = session.challenge_id
      join competition.results result on result.result_id = ${officialCancellationIds.resultId}::uuid
      where session.session_id = ${cancellationSessionId}::uuid
    `.execute(database);
    expect(cancellationState.rows[0]).toEqual({
      session_state: 'CANCELLED', booking_state: 'CANCELLED', slot_state: 'CANCELLED',
      challenge_state: 'RESULT_RECORDED', user_reschedule_count: 2,
      obligations: '2', snapshots: '1', reschedules_for_booking: '0',
      result_origin: 'ADMINISTRATIVE_FORFEIT', outcome_code: 'FORFEIT',
      winner_user_id: fixture.athleteB, loser_user_id: fixture.athleteA,
      result_session_id: null, appeal_deadline_at: new Date('2026-10-07T10:00:30.000Z'),
      cooldowns: '1', status_transitions: '0',
    });
    await expect(readResult(
      database,
      officialCancellationIds.resultId!,
      fixture.coach,
      new Date('2026-10-05T10:01:00.000Z'),
    )).resolves.toMatchObject({
      outcomeCode: 'FORFEIT', winnerUserId: fixture.athleteB,
      loserUserId: fixture.athleteA, viewerCanAppeal: false,
    });
    const cancellationEffects = await sql<{
      readonly transitions: string[];
      readonly audit_metadata: Record<string, unknown>;
      readonly result_outbox_payload: Record<string, unknown>;
      readonly notification_payload: {
        readonly notifications: readonly { readonly recipientUserId: string }[];
      };
    }>`
      select array_agg(event.transition_id order by event.transition_id)::text[] as transitions,
        audit.metadata as audit_metadata,
        result_outbox.payload as result_outbox_payload,
        notification.payload as notification_payload
      from platform.domain_events event
      cross join platform.audit_events audit
      cross join platform.outbox_messages result_outbox
      cross join platform.outbox_messages notification
      where event.event_id in (
          ${officialCancellationIds.eventId}::uuid,
          ${officialCancellationIds.bookingEventId}::uuid,
          ${officialCancellationIds.slotEventId}::uuid,
          ${officialCancellationIds.challengeEventId}::uuid,
          ${officialCancellationIds.resultEventId}::uuid
        )
        and audit.audit_id = ${officialCancellationIds.auditId}::uuid
        and result_outbox.message_id = ${officialCancellationIds.resultOutboxMessageId}::uuid
        and notification.message_id = ${officialCancellationIds.resultNotificationOutboxMessageId}::uuid
      group by audit.metadata, result_outbox.payload, notification.payload
    `.execute(database);
    expect(cancellationEffects.rows[0]?.transitions).toEqual(['B-14', 'CH-12', 'R-01', 'S-04', 'SL-06']);
    expect(cancellationEffects.rows[0]?.audit_metadata).toMatchObject({
      bookingId: cancellationBookingId, challengeId, resultId: officialCancellationIds.resultId,
      winnerUserId: fixture.athleteB, loserUserId: fixture.athleteA,
      statusTransitionType: 'NONE',
    });
    expect(cancellationEffects.rows[0]?.result_outbox_payload).not.toHaveProperty('comment');
    expect(cancellationEffects.rows[0]?.notification_payload.notifications
      .map((notification) => notification.recipientUserId).sort())
      .toEqual([fixture.athleteA, fixture.athleteB, fixture.coach].sort());
  });

  it('[AC-064] converts a confirmed third culpable reschedule attempt into an appealable Forfeit', async () => {
    const fixture = await seedConfirmedTrainingForConversion(23500);
    const sourceChatId = testId(23507);
    await database.transaction().execute(async (transaction) => {
      await sql`set constraints all deferred`.execute(transaction);
      await sql`
        update scheduling.slots
        set state = 'PUBLISHED', booking_id = null, version = 1
        where slot_id = ${fixture.slot}::uuid
      `.execute(transaction);
      await sql`delete from scheduling.sessions where session_id = ${fixture.session}::uuid`
        .execute(transaction);
      await sql`delete from scheduling.bookings where booking_id = ${fixture.booking}::uuid`
        .execute(transaction);
    });

    const challengeId = testId(23600);
    await createDirectOpenChallenge(
      database,
      {
        commandId: testId(23601), commandType: 'CREATE_DIRECT_OPEN_CHALLENGE',
        idempotencyKey: 'reschedule-limit-create',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Challenge', aggregateId: challengeId, expectedVersion: 0,
        correlationId: testId(23602), causationId: null, requestId: testId(23603),
        source: 'api', payloadVersion: 1, payload: { sourceChatId },
      },
      {
        eventId: testId(23604), auditId: testId(23605), outboxMessageId: testId(23606),
        notificationId: testId(23607), notificationOutboxMessageId: testId(23608),
        serviceChatId: testId(23609), serviceChatEventId: testId(23610),
        rulesetSnapshotId: testId(23611), acknowledgmentId: testId(23612),
        reminderTimerOutboxMessageIds: [testId(32003), testId(32004)],
      },
      () => new Date('2026-09-27T10:01:00.000Z'),
    );
    await acceptOptionalChallenge(
      database,
      {
        commandId: testId(23613), commandType: 'ACCEPT_OPTIONAL_CHALLENGE',
        idempotencyKey: 'reschedule-limit-accept',
        actor: { type: 'USER', id: fixture.athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Challenge', aggregateId: challengeId, expectedVersion: 1,
        correlationId: testId(23614), causationId: testId(23604), requestId: testId(23615),
        source: 'api', payloadVersion: 1, payload: { challengeId },
      },
      {
        eventId: testId(23616), auditId: testId(23617), outboxMessageId: testId(23618),
        notificationId: testId(23619), notificationOutboxMessageId: testId(23620),
        acknowledgmentId: testId(23621), obligationIds: [testId(23622), testId(23623)],
      },
      () => new Date('2026-09-27T10:02:00.000Z'),
    );
    await sql`
      update competition.challenges set user_reschedule_count = 2
      where challenge_id = ${challengeId}::uuid
    `.execute(database);

    const bookingId = testId(23700);
    await selectSlot(
      database,
      {
        commandId: testId(23701), commandType: 'SELECT_SLOT',
        idempotencyKey: 'reschedule-limit-select',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking', aggregateId: bookingId, expectedVersion: 0,
        correlationId: testId(23702), causationId: testId(23616), requestId: testId(23703),
        source: 'api', payloadVersion: 1,
        payload: {
          chatId: sourceChatId, slotId: fixture.slot,
          commercialVersion: 1, challengeId,
        },
      } satisfies CommandEnvelope<SelectSlotPayload>,
      {
        eventId: testId(23704), auditId: testId(23705), outboxMessageId: testId(23706),
        notificationId: testId(23707), notificationOutboxMessageId: testId(23708),
        challengeEventId: testId(23709), challengeOutboxMessageId: testId(23710),
      },
      () => new Date('2026-09-27T10:03:00.000Z'),
    );
    await selectSameSlot(
      database,
      {
        commandId: testId(23711), commandType: 'SELECT_SAME_SLOT',
        idempotencyKey: 'reschedule-limit-select-same',
        actor: { type: 'USER', id: fixture.athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking', aggregateId: bookingId, expectedVersion: 1,
        correlationId: testId(23712), causationId: testId(23704), requestId: testId(23713),
        source: 'api', payloadVersion: 1,
        payload: { bookingId, commercialVersion: 1 },
      } satisfies CommandEnvelope<SelectSameSlotPayload>,
      {
        eventId: testId(23714), auditId: testId(23715), outboxMessageId: testId(23716),
        notificationId: testId(23717), notificationOutboxMessageId: testId(23718),
      },
      () => new Date('2026-09-27T10:04:00.000Z'),
    );
    await expect(readChatChallenge(database, sourceChatId, fixture.athleteA))
      .resolves.toMatchObject({
        challenge: {
          challengeId, state: 'BOOKING_PENDING', userRescheduleCount: 2, version: 3,
        },
      });

    const effects = {
      eventId: testId(23820), auditId: testId(23821), outboxMessageId: testId(23822),
      notificationId: testId(23823), notificationOutboxMessageId: testId(23824),
      rescheduleId: testId(23825), bookingEventId: testId(23826),
      bookingOutboxMessageId: testId(23827),
      hostNotificationOutboxMessageId: testId(23828),
      notificationIds: [testId(23829), testId(23830)] as const,
      resultId: testId(23831), resultEventId: testId(23832),
      statusTransitionId: testId(23833), statusEventId: testId(23834),
      cooldownId: testId(23835), cooldownEventId: testId(23836),
      timerOutboxMessageId: testId(23837),
    } satisfies AthleteChallengeRescheduleEffectIds;
    const baseCommand = {
      commandId: testId(23800), commandType: 'RESCHEDULE_CHALLENGE_BY_ATHLETE',
      idempotencyKey: 'reschedule-limit-unconfirmed',
      actor: { type: 'USER' as const, id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: challengeId, expectedVersion: 3,
      correlationId: testId(23801), causationId: testId(23714), requestId: testId(23802),
      source: 'api', payloadVersion: 1,
      payload: {
        challengeId, reasonCode: 'OTHER' as const,
        reasonNote: 'Закрытая причина не должна выйти в публичные payload.',
        confirmForfeit: false,
      },
    } satisfies CommandEnvelope<RescheduleChallengeByAthletePayload>;
    await expect(rescheduleChallengeByAthlete(
      database, baseCommand, effects,
      () => new Date('2026-09-27T10:05:00.000Z'),
    )).rejects.toMatchObject({
      code: 'CHALLENGE_RESCHEDULE_FORFEIT_CONFIRMATION_REQUIRED',
    });
    await expect(rescheduleChallengeByAthlete(
      database,
      {
        ...baseCommand, commandId: testId(23803), idempotencyKey: 'reschedule-limit-outsider',
        actor: { type: 'USER', id: fixture.coach, roles: ['ATHLETE'], scopeIds: [] },
        payload: { ...baseCommand.payload, confirmForfeit: true },
      },
      effects,
      () => new Date('2026-09-27T10:05:00.000Z'),
    )).rejects.toMatchObject({ code: 'CHALLENGE_PARTICIPANT_REQUIRED' });

    const confirmedCommand = {
      ...baseCommand,
      commandId: testId(23810), idempotencyKey: 'reschedule-limit-confirmed',
      payload: { ...baseCommand.payload, confirmForfeit: true },
    } satisfies CommandEnvelope<RescheduleChallengeByAthletePayload>;
    const forfeited = await rescheduleChallengeByAthlete(
      database, confirmedCommand, effects,
      () => new Date('2026-09-27T10:06:00.000Z'),
    );
    expect(forfeited.response).toMatchObject({
      challengeId, state: 'RESULT_RECORDED', userRescheduleCount: 2, version: 4,
    });
    await expect(rescheduleChallengeByAthlete(
      database, confirmedCommand, effects,
      () => new Date('2026-09-27T10:07:00.000Z'),
    )).resolves.toMatchObject({ replayed: true, response: { state: 'RESULT_RECORDED' } });
    await expect(rescheduleChallengeByAthlete(
      database,
      {
        ...confirmedCommand, commandId: testId(23811),
        idempotencyKey: 'reschedule-limit-confirmed-stale',
      },
      { ...effects, eventId: testId(23812), auditId: testId(23813) },
      () => new Date('2026-09-27T10:07:00.000Z'),
    )).rejects.toBeInstanceOf(VersionConflictError);

    const state = await sql<{
      readonly booking_state: string;
      readonly booking_cancel_actor: string | null;
      readonly booking_cancel_reason: string | null;
      readonly slot_state: string;
      readonly slot_booking_id: string | null;
      readonly challenge_state: string;
      readonly user_reschedule_count: number;
      readonly reschedules: string;
      readonly obligations: string;
      readonly result_origin: string;
      readonly outcome_code: string;
      readonly winner_user_id: string;
      readonly loser_user_id: string;
      readonly appeal_deadline_at: Date;
      readonly cooldowns: string;
    }>`
      select booking.state as booking_state, booking.cancel_actor::text as booking_cancel_actor,
        booking.cancel_reason as booking_cancel_reason, slot.state as slot_state,
        slot.booking_id::text as slot_booking_id, challenge.state as challenge_state,
        challenge.user_reschedule_count,
        (select count(*)::text from competition.challenge_reschedules reschedule
          where reschedule.challenge_id = challenge.challenge_id) as reschedules,
        (select count(*)::text from competition.challenge_participant_obligations obligation
          where obligation.challenge_id = challenge.challenge_id
            and obligation.released_at is null) as obligations,
        result.origin as result_origin, result.recorded_outcome_code as outcome_code,
        result.winner_user_id::text, result.loser_user_id::text, result.appeal_deadline_at,
        (select count(*)::text from competition.pair_cooldowns cooldown
          where cooldown.source_result_id = result.result_id) as cooldowns
      from scheduling.bookings booking
      join scheduling.slots slot on slot.slot_id = booking.slot_id
      join competition.challenges challenge on challenge.challenge_id = booking.challenge_id
      join competition.results result on result.result_id = ${effects.resultId}::uuid
      where booking.booking_id = ${bookingId}::uuid
    `.execute(database);
    expect(state.rows[0]).toEqual({
      booking_state: 'CANCELLED', booking_cancel_actor: fixture.athleteA,
      booking_cancel_reason: 'CHALLENGE_RESCHEDULE_LIMIT_FORFEIT',
      slot_state: 'PUBLISHED', slot_booking_id: null,
      challenge_state: 'RESULT_RECORDED', user_reschedule_count: 2,
      reschedules: '0', obligations: '2', result_origin: 'ADMINISTRATIVE_FORFEIT',
      outcome_code: 'FORFEIT', winner_user_id: fixture.athleteB,
      loser_user_id: fixture.athleteA,
      appeal_deadline_at: new Date('2026-09-29T10:06:00.000Z'), cooldowns: '1',
    });
    await expect(readResult(
      database, effects.resultId!, fixture.athleteA,
      new Date('2026-09-27T10:07:00.000Z'),
    )).resolves.toMatchObject({
      outcomeCode: 'FORFEIT', winnerUserId: fixture.athleteB,
      loserUserId: fixture.athleteA, viewerCanAppeal: true,
    });

    const effectsState = await sql<{
      readonly transitions: string[];
      readonly audit_metadata: Record<string, unknown>;
      readonly event_payload: Record<string, unknown>;
      readonly outbox_payload: Record<string, unknown>;
      readonly athlete_notifications: { readonly notifications: readonly {
        readonly recipientUserId: string;
      }[] };
      readonly host_notifications: { readonly notifications: readonly {
        readonly recipientUserId: string;
        readonly actionTarget: { readonly type: string; readonly bookingId: string };
      }[] };
    }>`
      select array_agg(event.transition_id order by event.transition_id)::text[] as transitions,
        audit.metadata as audit_metadata, primary_event.payload as event_payload,
        primary_outbox.payload as outbox_payload,
        athlete_notification.payload as athlete_notifications,
        host_notification.payload as host_notifications
      from platform.domain_events event
      cross join platform.domain_events primary_event
      cross join platform.audit_events audit
      cross join platform.outbox_messages primary_outbox
      cross join platform.outbox_messages athlete_notification
      cross join platform.outbox_messages host_notification
      where event.event_id in (
          ${effects.eventId}::uuid, ${effects.bookingEventId}::uuid,
          ${effects.resultEventId}::uuid, ${effects.cooldownEventId}::uuid
        )
        and primary_event.event_id = ${effects.eventId}::uuid
        and audit.audit_id = ${effects.auditId}::uuid
        and primary_outbox.message_id = ${effects.outboxMessageId}::uuid
        and athlete_notification.message_id = ${effects.notificationOutboxMessageId}::uuid
        and host_notification.message_id = ${effects.hostNotificationOutboxMessageId}::uuid
      group by audit.metadata, primary_event.payload, primary_outbox.payload,
        athlete_notification.payload, host_notification.payload
    `.execute(database);
    expect(effectsState.rows[0]?.transitions).toEqual(['B-04', 'CD-01', 'CH-23', 'R-01']);
    expect(effectsState.rows[0]?.event_payload).toMatchObject({
      challengeId, resultId: effects.resultId, bookingId,
      winnerUserId: fixture.athleteB, loserUserId: fixture.athleteA,
      userRescheduleCount: 2,
    });
    expect(effectsState.rows[0]?.event_payload).not.toHaveProperty('reasonNote');
    expect(effectsState.rows[0]?.outbox_payload).not.toHaveProperty('reasonNote');
    expect(effectsState.rows[0]?.audit_metadata).toMatchObject({
      resultId: effects.resultId, bookingId,
      reasonNote: 'Закрытая причина не должна выйти в публичные payload.',
      userRescheduleCount: 2,
    });
    expect(effectsState.rows[0]?.athlete_notifications.notifications
      .map((notification) => notification.recipientUserId).sort())
      .toEqual([fixture.athleteA, fixture.athleteB].sort());
    expect(effectsState.rows[0]?.host_notifications.notifications).toEqual([
      expect.objectContaining({
        recipientUserId: fixture.coach,
        actionTarget: { type: 'BOOKING', bookingId },
      }),
    ]);
  });

  it('[AC-029][AC-030][AC-031][AC-032][AC-041][AC-050][AC-051][AC-054][AC-056][AC-058][AC-070][AC-071][AC-075][AC-076][AC-077][AC-078][AC-079][AC-080][AC-111][AC-113][AC-117][AC-118][AC-144][AC-148][AC-167][AC-171][AC-175][AC-179][AC-205][AC-206] runs a media-free Official Result through Missing Result Review and Central Appeal atomically', async () => {
    const athleteA = testId(1101);
    const athleteB = testId(1102);
    const venueId = testId(1103);
    const venueConfigId = testId(1104);
    const communityId = testId(1105);
    const communityConfigId = testId(1106);
    const competitionId = testId(1107);
    const sourceChatId = testId(1108);
    const matchId = testId(1109);
    const coachId = testId(1800);
    const adminId = testId(1801);
    const centralId = testId(1804);
    const reviewerCoachId = testId(1806);
    await database.transaction().execute(async (transaction) => {
      await sql`set constraints all deferred`.execute(transaction);
      for (const [userId, name, phone] of [
        [athleteA, 'Первый участник', '+79990001101'],
        [athleteB, 'Второй участник', '+79990001102'],
      ] as const) {
        await sql`insert into identity.users (user_id, phone_e164, phone_verified_at, birth_date, age_division, display_name, account_state, locale, version, activated_at) values (${userId}::uuid, ${phone}, '2026-09-01T09:00:00Z', '1995-01-01', 'ADULT', ${name}, 'ACTIVE', 'ru-RU', 1, '2026-09-01T09:00:00Z')`.execute(transaction);
        await sql`insert into identity.athlete_profiles (user_id, primary_sport, discovery_radius_km) values (${userId}::uuid, 'BOXING', 15)`.execute(transaction);
        await sql`insert into identity.account_verifications (verification_id, user_id, state, method, moderation_checklist_version, is_current, verified_at, decided_by, decision_reason, version) values (${userId}::uuid, ${userId}::uuid, 'VERIFIED', 'CENTRAL_MODERATION', 'identity-mvp-v1', true, '2026-09-01T09:00:00Z', ${athleteA}::uuid, 'TEST_APPROVED', 1)`.execute(transaction);
      }
      await sql`insert into identity.users (user_id, phone_e164, phone_verified_at, birth_date, age_division, display_name, account_state, locale, version, activated_at) values (${coachId}::uuid, '+79990001800', '2026-09-01T09:00:00Z', '1988-01-01', 'ADULT', 'Challenge Coach', 'ACTIVE', 'ru-RU', 1, '2026-09-01T09:00:00Z'), (${adminId}::uuid, '+79990001801', '2026-09-01T09:00:00Z', '1987-01-01', 'ADULT', 'Challenge Admin', 'ACTIVE', 'ru-RU', 1, '2026-09-01T09:00:00Z'), (${centralId}::uuid, '+79990001804', '2026-09-01T09:00:00Z', '1986-01-01', 'ADULT', 'Central Reviewer', 'ACTIVE', 'ru-RU', 1, '2026-09-01T09:00:00Z'), (${reviewerCoachId}::uuid, '+79990001806', '2026-09-01T09:00:00Z', '1985-01-01', 'ADULT', 'Independent Coach', 'ACTIVE', 'ru-RU', 1, '2026-09-01T09:00:00Z')`.execute(transaction);
      await sql`insert into community.venues (venue_id, legal_name, display_name, address, city_code, timezone, state, minimum_booking_notice_hours, slot_publish_horizon_days, configuration_version_id, version) values (${venueId}::uuid, 'Challenge Gym LLC', 'Challenge Gym', 'Москва', 'MOSCOW', 'Europe/Moscow', 'ACTIVE', 8, 30, ${venueConfigId}::uuid, 1)`.execute(transaction);
      await sql`insert into community.venue_configuration_versions (configuration_id, venue_id, configuration_version, minimum_booking_notice_hours, slot_publish_horizon_days, contact_payload, created_by, effective_at) values (${venueConfigId}::uuid, ${venueId}::uuid, 1, 8, 30, '{}'::jsonb, ${athleteA}::uuid, '2026-09-01T09:00:00Z')`.execute(transaction);
      await sql`insert into community.communities (community_id, venue_id, name, state, configuration_id, created_by_central_id, version) values (${communityId}::uuid, ${venueId}::uuid, 'Challenge Community', 'ACTIVE', ${communityConfigId}::uuid, ${athleteA}::uuid, 1)`.execute(transaction);
      await sql`insert into community.community_configuration_versions (configuration_id, community_id, configuration_version, pair_cooldown_days, no_show_grace_minutes, ruleset_ref, ruleset_ack_mode, created_by, effective_at) values (${communityConfigId}::uuid, ${communityId}::uuid, 1, 15, 15, 'MOLOKH_RECOMMENDED_V1', 'IMPLICIT_ON_ACCEPT', ${athleteA}::uuid, '2026-09-01T09:00:00Z')`.execute(transaction);
      await sql`insert into community.community_memberships (membership_id, community_id, user_id, age_division, state, competition_enabled, join_path, decided_at, decided_by, version) values (${testId(1110)}::uuid, ${communityId}::uuid, ${athleteA}::uuid, 'ADULT', 'ACTIVE', true, 'INVITE', '2026-09-01T09:00:00Z', ${athleteA}::uuid, 1), (${testId(1111)}::uuid, ${communityId}::uuid, ${athleteB}::uuid, 'ADULT', 'ACTIVE', true, 'INVITE', '2026-09-01T09:00:00Z', ${athleteA}::uuid, 1)`.execute(transaction);
      await sql`insert into community.role_grants (grant_id, user_id, role, scope_type, scope_id, state, authorized_by, authorized_at, version) values (${testId(1802)}::uuid, ${coachId}::uuid, 'COACH', 'COMMUNITY', ${communityId}::uuid, 'ACTIVE', ${athleteA}::uuid, '2026-09-01T09:00:00Z', 1), (${testId(1803)}::uuid, ${adminId}::uuid, 'GYM_ADMIN', 'VENUE', ${venueId}::uuid, 'ACTIVE', ${athleteA}::uuid, '2026-09-01T09:00:00Z', 1), (${testId(1805)}::uuid, ${centralId}::uuid, 'CENTRAL_ADMIN', 'GLOBAL', null, 'ACTIVE', ${centralId}::uuid, '2026-09-01T09:00:00Z', 1), (${testId(1807)}::uuid, ${reviewerCoachId}::uuid, 'COACH', 'COMMUNITY', ${communityId}::uuid, 'ACTIVE', ${centralId}::uuid, '2026-09-01T09:00:00Z', 1)`.execute(transaction);
      await sql`insert into competition.competitions (competition_id, community_id, age_division, phase, availability, version, created_at, updated_at) values (${competitionId}::uuid, ${communityId}::uuid, 'ADULT', 'FOUNDING_OPEN', 'ACTIVE', 1, '2026-09-01T09:00:00Z', '2026-09-01T09:00:00Z')`.execute(transaction);
      await sql`insert into social.chats (chat_id, scope, state, version, created_at, updated_at) values (${sourceChatId}::uuid, 'PERSONAL_MATCH', 'OPEN', 1, '2026-09-01T09:00:00Z', '2026-09-01T09:00:00Z')`.execute(transaction);
      await sql`insert into social.chat_participants (chat_id, user_id) values (${sourceChatId}::uuid, ${athleteA}::uuid), (${sourceChatId}::uuid, ${athleteB}::uuid)`.execute(transaction);
      await sql`insert into social.matches (match_id, pair_low_id, pair_high_id, state, chat_id, last_activity_at, version) values (${matchId}::uuid, ${athleteA}::uuid, ${athleteB}::uuid, 'ACTIVE', ${sourceChatId}::uuid, '2026-09-08T09:00:00Z', 1)`.execute(transaction);
    });

    await expect(readChatChallenge(database, sourceChatId, athleteA)).resolves.toMatchObject({
      challenge: null,
      canCreate: true,
      createDenialCode: null,
    });

    const challengeId = testId(1112);
    const created = await createDirectOpenChallenge(
      database,
      {
        commandId: testId(1113), commandType: 'CREATE_DIRECT_OPEN_CHALLENGE',
        idempotencyKey: 'challenge-db-create-1',
        actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Challenge', aggregateId: challengeId, expectedVersion: 0,
        correlationId: testId(1114), causationId: null, requestId: testId(1115),
        source: 'api', payloadVersion: 1, payload: { sourceChatId },
      },
      {
        eventId: testId(1116), auditId: testId(1117), outboxMessageId: testId(1118),
        notificationId: testId(1119), notificationOutboxMessageId: testId(1120),
        serviceChatId: testId(1121), serviceChatEventId: testId(1122),
        rulesetSnapshotId: testId(1123), acknowledgmentId: testId(1124),
        reminderTimerOutboxMessageIds: [testId(32005), testId(32006)],
      },
      () => new Date('2026-09-08T10:00:00.000Z'),
    );
    expect(created.response).toMatchObject({
      state: 'AWAITING_RESPONSE', responsePolicy: 'OPTIONAL', stake: 'NONE',
      responseDeadlineAt: '2026-09-10T10:00:00.000Z', viewerRole: 'INITIATOR',
    });
    await expect(readChatChallenge(database, sourceChatId, athleteB)).resolves.toMatchObject({
      canCreate: false,
      createDenialCode: 'PAIR_CHALLENGE_EXISTS',
      challenge: { challengeId, viewerRole: 'RECIPIENT' },
    });

    const accepted = await acceptOptionalChallenge(
      database,
      {
        commandId: testId(1125), commandType: 'ACCEPT_OPTIONAL_CHALLENGE',
        idempotencyKey: 'challenge-db-accept-1',
        actor: { type: 'USER', id: athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Challenge', aggregateId: challengeId, expectedVersion: 1,
        correlationId: testId(1126), causationId: testId(1116), requestId: testId(1127),
        source: 'api', payloadVersion: 1, payload: { challengeId },
      },
      {
        eventId: testId(1128), auditId: testId(1129), outboxMessageId: testId(1130),
        notificationId: testId(1131), notificationOutboxMessageId: testId(1132),
        acknowledgmentId: testId(1133), obligationIds: [testId(1134), testId(1135)],
      },
      () => new Date('2026-09-08T11:00:00.000Z'),
    );
    expect(accepted.response).toMatchObject({
      state: 'ACCEPTED_UNSCHEDULED', acceptedAt: '2026-09-08T11:00:00.000Z',
      schedulingDeadlineAt: '2026-09-22T11:00:00.000Z', version: 2,
    });
    const obligations = await sql<{ readonly total: string }>`select count(*)::text as total from competition.challenge_participant_obligations where challenge_id = ${challengeId}::uuid and released_at is null`.execute(database);
    expect(obligations.rows[0]?.total).toBe('2');
    const acknowledgments = await sql<{ readonly total: string }>`select count(*)::text as total from competition.challenge_ruleset_acknowledgments where challenge_id = ${challengeId}::uuid`.execute(database);
    expect(acknowledgments.rows[0]?.total).toBe('2');

    const slotId = testId(1810);
    await publishSlot(
      database,
      {
        commandId: testId(1811), commandType: 'PUBLISH_SLOT',
        idempotencyKey: 'challenge-official-slot-publish',
        actor: { type: 'USER', id: adminId, roles: ['GYM_ADMIN'], scopeIds: [venueId] },
        aggregateType: 'Slot', aggregateId: slotId, expectedVersion: 0,
        correlationId: testId(1812), causationId: null, requestId: testId(1813),
        source: 'api', payloadVersion: 1,
        payload: {
          venueId, coachUserId: coachId,
          startAt: '2026-09-12T14:00:00.000Z', endAt: '2026-09-12T15:00:00.000Z',
          priceAmount: null, priceCurrency: null, priceText: 'Оплата напрямую залу',
          cancellationTermsText: 'Условия уточняются у зала',
        },
      } satisfies CommandEnvelope<PublishSlotPayload>,
      { eventId: testId(1814), auditId: testId(1815), outboxMessageId: testId(1816) },
      () => new Date('2026-09-08T11:01:00.000Z'),
    );

    const expiredBookingId = testId(1870);
    await selectSlot(
      database,
      {
        commandId: testId(1871), commandType: 'SELECT_SLOT',
        idempotencyKey: 'challenge-official-slot-expiring',
        actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking', aggregateId: expiredBookingId, expectedVersion: 0,
        correlationId: testId(1872), causationId: testId(1128), requestId: testId(1873),
        source: 'api', payloadVersion: 1,
        payload: { chatId: sourceChatId, slotId, commercialVersion: 1, challengeId },
      } satisfies CommandEnvelope<SelectSlotPayload>,
      {
        eventId: testId(1874), auditId: testId(1875), outboxMessageId: testId(1876),
        notificationId: testId(1877), notificationOutboxMessageId: testId(1878),
        challengeEventId: testId(1879), challengeOutboxMessageId: testId(1880),
      },
      () => new Date('2026-09-08T11:02:00.000Z'),
    );
    const expired = await expireBookingIntent(
      database,
      {
        commandId: testId(1881), commandType: 'EXPIRE_BOOKING_SELECTION',
        idempotencyKey: `booking:${expiredBookingId}:expire-selection:v1`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'Booking', aggregateId: expiredBookingId, expectedVersion: 1,
        correlationId: testId(1882), causationId: testId(1874), requestId: testId(1883),
        source: 'scheduler', payloadVersion: 1, payload: { bookingId: expiredBookingId },
      } satisfies CommandEnvelope<ExpireBookingIntentPayload>,
      {
        eventId: testId(1884), auditId: testId(1885), outboxMessageId: testId(1886),
        challengeEventId: testId(1887), challengeOutboxMessageId: testId(1888),
      },
      () => new Date('2026-09-08T12:02:00.000Z'),
    );
    expect(expired.response).toMatchObject({ state: 'EXPIRED', challengeId });
    await expect(readChatChallenge(database, sourceChatId, athleteA)).resolves.toMatchObject({
      challenge: {
        challengeId,
        state: 'ACCEPTED_UNSCHEDULED',
        schedulingDeadlineAt: '2026-09-22T11:00:00.000Z',
        version: 4,
      },
    });

    const bookingId = testId(1820);
    const selected = await selectSlot(
      database,
      {
        commandId: testId(1821), commandType: 'SELECT_SLOT',
        idempotencyKey: 'challenge-official-slot-select',
        actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking', aggregateId: bookingId, expectedVersion: 0,
        correlationId: testId(1822), causationId: testId(1128), requestId: testId(1823),
        source: 'api', payloadVersion: 1,
        payload: { chatId: sourceChatId, slotId, commercialVersion: 1, challengeId },
      } satisfies CommandEnvelope<SelectSlotPayload>,
      {
        eventId: testId(1824), auditId: testId(1825), outboxMessageId: testId(1826),
        notificationId: testId(1827), notificationOutboxMessageId: testId(1828),
        challengeEventId: testId(1829), challengeOutboxMessageId: testId(1830),
      },
      () => new Date('2026-09-08T12:05:00.000Z'),
    );
    expect(selected.response).toMatchObject({
      purpose: 'OFFICIAL_CHALLENGE', challengeId, state: 'SELECTING', version: 1,
    });
    await expect(readChatChallenge(database, sourceChatId, athleteA)).resolves.toMatchObject({
      challenge: { challengeId, state: 'BOOKING_PENDING', version: 5 },
    });

    const mutuallySelected = await selectSameSlot(
      database,
      {
        commandId: testId(1831), commandType: 'SELECT_SAME_SLOT',
        idempotencyKey: 'challenge-official-slot-select-same',
        actor: { type: 'USER', id: athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking', aggregateId: bookingId, expectedVersion: 1,
        correlationId: testId(1832), causationId: testId(1824), requestId: testId(1833),
        source: 'api', payloadVersion: 1, payload: { bookingId, commercialVersion: 1 },
      } satisfies CommandEnvelope<SelectSameSlotPayload>,
      {
        eventId: testId(1834), auditId: testId(1835), outboxMessageId: testId(1836),
        notificationId: testId(1837), notificationOutboxMessageId: testId(1838),
        challengeEventId: testId(1839), challengeOutboxMessageId: testId(1840),
      },
      () => new Date('2026-09-08T12:10:00.000Z'),
    );
    expect(mutuallySelected.response).toMatchObject({
      purpose: 'OFFICIAL_CHALLENGE', challengeId, state: 'HOST_CONFIRMATION_PENDING',
    });
    await expect(
      readHostConfirmationQueue(database, adminId, new Date('2026-09-08T12:10:00.000Z')),
    ).resolves.toEqual([
      expect.objectContaining({
        booking: expect.objectContaining({ purpose: 'OFFICIAL_CHALLENGE', challengeId }),
      }),
    ]);

    const sessionId = testId(1850);
    const confirmed = await confirmBookingHost(
      database,
      {
        commandId: testId(1851), commandType: 'CONFIRM_BOOKING_HOST',
        idempotencyKey: 'challenge-official-host-confirm',
        actor: { type: 'USER', id: adminId, roles: ['GYM_ADMIN'], scopeIds: [venueId] },
        aggregateType: 'Booking', aggregateId: bookingId, expectedVersion: 2,
        correlationId: testId(1852), causationId: testId(1834), requestId: testId(1853),
        source: 'api', payloadVersion: 1, payload: { bookingId },
      } satisfies CommandEnvelope<ConfirmBookingHostPayload>,
      {
        eventId: testId(1854), auditId: testId(1855), outboxMessageId: testId(1856),
        slotEventId: testId(1857), sessionEventId: testId(1858), sessionId,
        sessionTimerOutboxMessageId: testId(1859),
        notificationIds: [testId(1860), testId(1861)],
        notificationOutboxMessageId: testId(1862),
        challengeEventId: testId(1863), challengeOutboxMessageId: testId(1864),
      },
      () => new Date('2026-09-08T12:20:00.000Z'),
    );
    expect(confirmed.response).toMatchObject({
      outcome: 'CONFIRMED',
      booking: { purpose: 'OFFICIAL_CHALLENGE', challengeId, state: 'CONFIRMED_PAIR' },
      session: { sessionId, purpose: 'OFFICIAL_CHALLENGE', challengeId, state: 'SCHEDULED' },
    });
    await expect(readChatChallenge(database, sourceChatId, athleteB)).resolves.toMatchObject({
      challenge: { challengeId, state: 'BOOKED', version: 6 },
    });
    await expect(readSession(database, sessionId, athleteA)).resolves.toMatchObject({
      sessionId, bookingId, challengeId, purpose: 'OFFICIAL_CHALLENGE', state: 'SCHEDULED',
    });
    await sql`
      update competition.competitions
      set contender_user_id = ${athleteA}::uuid, status_version = 1,
        version = 2, updated_at = '2026-09-12T13:59:00Z'
      where competition_id = ${competitionId}::uuid
    `.execute(database);

    const openedOfficial = await openSessionWindow(
      database,
      {
        commandId: testId(1890), commandType: 'OPEN_SESSION_WINDOW',
        idempotencyKey: `session:${sessionId}:open-session-window:v1`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'Session', aggregateId: sessionId, expectedVersion: 1,
        correlationId: testId(1891), causationId: testId(1858), requestId: testId(1892),
        source: 'scheduler', payloadVersion: 1, payload: { sessionId },
      } satisfies CommandEnvelope<OpenSessionWindowPayload>,
      {
        eventId: testId(1893), auditId: testId(1894), outboxMessageId: testId(1895),
        competitiveSnapshotId: testId(1896),
      },
      () => new Date('2026-09-12T14:00:00.000Z'),
    );
    expect(openedOfficial.response).toMatchObject({ state: 'READY_FOR_COACH', version: 2 });
    await expect(readChatChallenge(database, sourceChatId, athleteA)).resolves.toMatchObject({
      challenge: { challengeId, state: 'BOOKED', version: 6 },
    });
    const snapshot = await sql<{
      readonly effective_stake: string;
      readonly competition_status_version: string;
    }>`
      select effective_stake, competition_status_version::text as competition_status_version
      from scheduling.session_competitive_snapshots
      where session_id = ${sessionId}::uuid
    `.execute(database);
    expect(snapshot.rows[0]).toEqual({
      effective_stake: 'CONTENDER', competition_status_version: '1',
    });

    const recordOfficialAttendance = async (
      athleteUserId: string,
      expectedVersion: number,
      base: number,
    ) => recordSessionAttendance(
      database,
      {
        commandId: testId(base), commandType: 'RECORD_ATTENDANCE',
        idempotencyKey: `official-attendance-${athleteUserId}`,
        actor: { type: 'USER', id: coachId, roles: ['COACH'], scopeIds: [communityId] },
        aggregateType: 'Session', aggregateId: sessionId, expectedVersion,
        correlationId: testId(base + 1), causationId: testId(1893), requestId: testId(base + 2),
        source: 'api', payloadVersion: 1,
        payload: { sessionId, athleteUserId, status: 'PRESENT', comment: null },
      } satisfies CommandEnvelope<RecordAttendancePayload>,
      {
        eventId: testId(base + 3), auditId: testId(base + 4), outboxMessageId: testId(base + 5),
        attendanceId: testId(base + 6), attendanceEventId: testId(base + 7),
        challengeEventId: testId(base + 8), challengeOutboxMessageId: testId(base + 9),
      },
      () => new Date(`2026-09-12T14:0${expectedVersion}:00.000Z`),
    );
    const firstOfficialAttendance = await recordOfficialAttendance(athleteA, 2, 1910);
    expect(firstOfficialAttendance.response).toMatchObject({
      state: 'IN_PROGRESS', actualStartAt: '2026-09-12T14:02:00.000Z', version: 3,
    });
    await expect(readChatChallenge(database, sourceChatId, athleteA)).resolves.toMatchObject({
      challenge: { challengeId, state: 'IN_SESSION', version: 7 },
    });
    await recordOfficialAttendance(athleteB, 3, 1920);

    const endedOfficial = await endSession(
      database,
      {
        commandId: testId(1930), commandType: 'END_SESSION',
        idempotencyKey: `end-official-session-${sessionId}`,
        actor: { type: 'USER', id: coachId, roles: ['COACH'], scopeIds: [communityId] },
        aggregateType: 'Session', aggregateId: sessionId, expectedVersion: 4,
        correlationId: testId(1931), causationId: testId(1913), requestId: testId(1932),
        source: 'api', payloadVersion: 1, payload: { sessionId },
      } satisfies CommandEnvelope<EndSessionPayload>,
      {
        eventId: testId(1933), auditId: testId(1934), outboxMessageId: testId(1935),
        bookingEventId: testId(1936), slotEventId: testId(1937),
        challengeEventId: testId(1938), challengeOutboxMessageId: testId(1939),
      },
      () => new Date('2026-09-12T14:55:00.000Z'),
    );
    expect(endedOfficial.response).toMatchObject({ state: 'ENDED', version: 5 });
    await expect(readChatChallenge(database, sourceChatId, athleteB)).resolves.toMatchObject({
      challenge: { challengeId, state: 'RESULT_PENDING', version: 8 },
    });

    const missingResultTimerCommand = (
      commandType: string,
      expectedVersion: number,
      base: number,
    ): CommandEnvelope<MissingResultTimerPayload> => ({
      commandId: testId(base), commandType,
      idempotencyKey: `missing-result:${challengeId}:${commandType}:v${expectedVersion}`,
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: challengeId, expectedVersion,
      correlationId: testId(base + 1), causationId: testId(1933), requestId: testId(base + 2),
      source: 'scheduler', payloadVersion: 1, payload: { challengeId },
    });
    await remindMissingResultCoach(
      database,
      missingResultTimerCommand('REMIND_MISSING_RESULT_COACH', 8, 2300),
      {
        eventId: testId(2303), auditId: testId(2304), outboxMessageId: testId(2305),
        notificationOutboxMessageId: testId(2306), notificationIds: [testId(2307)],
      },
      () => new Date('2026-09-12T16:55:00.000Z'),
    );
    await escalateMissingResultAdmin(
      database,
      missingResultTimerCommand('ESCALATE_MISSING_RESULT_ADMIN', 9, 2310),
      {
        eventId: testId(2313), auditId: testId(2314), outboxMessageId: testId(2315),
        notificationOutboxMessageId: testId(2316), notificationIds: [testId(2317)],
      },
      () => new Date('2026-09-13T02:55:00.000Z'),
    );
    const missingResultReviewId = testId(2320);
    await openMissingResultReview(
      database,
      missingResultTimerCommand('OPEN_MISSING_RESULT_REVIEW', 10, 2321),
      {
        eventId: testId(2324), auditId: testId(2325), outboxMessageId: testId(2326),
        notificationOutboxMessageId: testId(2327), notificationIds: [testId(2328)],
        reviewId: missingResultReviewId, reviewEventId: testId(2329),
        operationalFollowupId: testId(2330),
      },
      () => new Date('2026-09-13T14:55:00.000Z'),
    );
    const submitMissingStatement = async (
      actorId: string,
      expectedVersion: number,
      base: number,
    ) => submitMissingResultStatement(
      database,
      {
        commandId: testId(base), commandType: 'SUBMIT_MISSING_RESULT_STATEMENT',
        idempotencyKey: `missing-result-statement:${actorId}`,
        actor: { type: 'USER', id: actorId, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'MissingResultReview', aggregateId: missingResultReviewId,
        expectedVersion, correlationId: testId(base + 1), causationId: testId(2329),
        requestId: testId(base + 2), source: 'api', payloadVersion: 1,
        payload: {
          reviewId: missingResultReviewId, outcomeCode: 'WIN_B',
          statement: 'Оба участника подтверждают победу второго спортсмена.',
        },
      } satisfies CommandEnvelope<SubmitMissingResultStatementPayload>,
      {
        eventId: testId(base + 3), auditId: testId(base + 4),
        outboxMessageId: testId(base + 5), statementId: testId(base + 6),
      },
      () => new Date(`2026-09-13T14:5${expectedVersion}:00.000Z`),
    );
    const firstStatement = await submitMissingStatement(athleteA, 1, 2340);
    expect(firstStatement.response.statements).toHaveLength(1);
    const secondStatement = await submitMissingStatement(athleteB, 2, 2350);
    expect(secondStatement.response.statements).toHaveLength(2);
    await expect(confirmMissingResultVenue(
      database,
      {
        commandId: testId(2390), commandType: 'CONFIRM_MISSING_RESULT_VENUE',
        idempotencyKey: `missing-result-venue-unauthorized:${missingResultReviewId}`,
        actor: { type: 'USER', id: athleteA, roles: ['GYM_ADMIN'], scopeIds: [venueId] },
        aggregateType: 'MissingResultReview', aggregateId: missingResultReviewId,
        expectedVersion: 3, correlationId: testId(2391), causationId: testId(2329),
        requestId: testId(2392), source: 'api', payloadVersion: 1,
        payload: {
          reviewId: missingResultReviewId, attendanceConfirmed: true,
          note: 'Заявленная роль не заменяет действующий grant.',
        },
      } satisfies CommandEnvelope<ConfirmMissingResultVenuePayload>,
      {
        eventId: testId(2393), auditId: testId(2394),
        outboxMessageId: testId(2395), confirmationId: testId(2396),
      },
      () => new Date('2026-09-13T14:57:00.000Z'),
    )).rejects.toMatchObject({ code: 'RESULT_PERMISSION_DENIED' });
    await confirmMissingResultVenue(
      database,
      {
        commandId: testId(2360), commandType: 'CONFIRM_MISSING_RESULT_VENUE',
        idempotencyKey: `missing-result-venue:${missingResultReviewId}`,
        actor: { type: 'USER', id: adminId, roles: ['GYM_ADMIN'], scopeIds: [venueId] },
        aggregateType: 'MissingResultReview', aggregateId: missingResultReviewId,
        expectedVersion: 3, correlationId: testId(2361), causationId: testId(2329),
        requestId: testId(2362), source: 'api', payloadVersion: 1,
        payload: {
          reviewId: missingResultReviewId, attendanceConfirmed: true,
          note: 'Администратор подтвердил присутствие обоих участников.',
        },
      } satisfies CommandEnvelope<ConfirmMissingResultVenuePayload>,
      {
        eventId: testId(2363), auditId: testId(2364),
        outboxMessageId: testId(2365), confirmationId: testId(2366),
      },
      () => new Date('2026-09-13T14:58:00.000Z'),
    );
    await startMissingResultReview(
      database,
      {
        commandId: testId(2370), commandType: 'START_MISSING_RESULT_REVIEW',
        idempotencyKey: `missing-result-start:${missingResultReviewId}`,
        actor: { type: 'USER', id: centralId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
        aggregateType: 'MissingResultReview', aggregateId: missingResultReviewId,
        expectedVersion: 4, correlationId: testId(2371), causationId: testId(2329),
        requestId: testId(2372), source: 'api', payloadVersion: 1,
        payload: { reviewId: missingResultReviewId },
      } satisfies CommandEnvelope<StartMissingResultReviewPayload>,
      { eventId: testId(2373), auditId: testId(2374), outboxMessageId: testId(2375) },
      () => new Date('2026-09-13T14:59:00.000Z'),
    );
    const assignedReview = await assignMissingResultReviewerCoach(
      database,
      {
        commandId: testId(2380), commandType: 'ASSIGN_RESULT_REVIEWER_COACH',
        idempotencyKey: `missing-result-assign:${missingResultReviewId}`,
        actor: { type: 'USER', id: centralId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
        aggregateType: 'MissingResultReview', aggregateId: missingResultReviewId,
        expectedVersion: 5, correlationId: testId(2381), causationId: testId(2373),
        requestId: testId(2382), source: 'api', payloadVersion: 1,
        payload: {
          reviewId: missingResultReviewId, reviewerCoachUserId: reviewerCoachId,
          repeatObjectivelyImpossible: false,
          reason: 'Версии участников совпадают, присутствие подтверждено залом.',
        },
      } satisfies CommandEnvelope<AssignMissingResultCoachPayload>,
      { eventId: testId(2383), auditId: testId(2384), outboxMessageId: testId(2385) },
      () => new Date('2026-09-13T15:00:00.000Z'),
    );
    expect(assignedReview.response).toMatchObject({
      state: 'REVIEWER_ASSIGNED', assignedReviewerCoachUserId: reviewerCoachId,
      allowedOutcomeCode: 'WIN_B', allowedWinnerUserId: athleteB, version: 6,
    });
    await expect(readSession(database, sessionId, reviewerCoachId)).resolves.toMatchObject({
      sessionId, viewerCanManage: false, viewerCanRecordResult: true,
    });
    await expect(readMySessions(database, reviewerCoachId)).resolves.toMatchObject({
      sessions: [expect.objectContaining({ sessionId, viewerCanRecordResult: true })],
    });

    const resultId = testId(1940);
    const recordResultCommand = {
      commandId: testId(1941), commandType: 'RECORD_SESSION_RESULT',
      idempotencyKey: `record-result-${challengeId}`,
      actor: { type: 'USER', id: reviewerCoachId, roles: ['COACH'], scopeIds: [communityId] },
      aggregateType: 'Challenge', aggregateId: challengeId, expectedVersion: 11,
      correlationId: testId(1942), causationId: testId(1933), requestId: testId(1943),
      source: 'api', payloadVersion: 1,
      payload: {
        challengeId, sessionId, outcomeCode: 'WIN_B', winnerUserId: null,
        reasonCode: null, comment: null, methodCode: null, methodText: null,
        scorePayload: null, methodPayload: null,
      },
    } satisfies CommandEnvelope<RecordSessionResultPayload>;
    const recordResultIds = {
      eventId: testId(1944), auditId: testId(1945), outboxMessageId: testId(1946),
      resultId, resultEventId: testId(1947), statusTransitionId: testId(1948),
      statusEventId: testId(1949), cooldownId: testId(1950), cooldownEventId: testId(1951),
      timerOutboxMessageId: testId(1952), notificationOutboxMessageId: testId(1953),
      notificationIds: [testId(1954), testId(1955)],
      missingResultReviewEventId: testId(1956),
    };
    const recordedResult = await recordSessionResult(
      database, recordResultCommand, recordResultIds,
      () => new Date('2026-09-13T15:01:00.000Z'),
    );
    expect(recordedResult.response).toMatchObject({
      resultId, challengeId, state: 'RECORDED', outcomeCode: 'WIN_B',
      winnerUserId: athleteB, loserUserId: athleteA,
      appealDeadlineAt: '2026-09-15T15:01:00.000Z',
      statusTransitionType: 'CONTENDER_TRANSFERRED', provisional: true,
      statusBefore: { contenderUserId: athleteA, statusVersion: 1 },
      statusAfter: { contenderUserId: athleteB, statusVersion: 2 },
      version: 1,
    });
    await expect(recordSessionResult(database, recordResultCommand, recordResultIds))
      .resolves.toMatchObject({
        replayed: true, eventId: recordResultIds.eventId, response: recordedResult.response,
      });
    await expect(recordSessionResult(database, {
      ...recordResultCommand,
      commandId: testId(1970),
      payload: { ...recordResultCommand.payload, outcomeCode: 'WIN_A' },
    }, {
      eventId: testId(1971), auditId: testId(1972), outboxMessageId: testId(1973),
      resultId: testId(1974), resultEventId: testId(1975), statusTransitionId: testId(1976),
      statusEventId: testId(1977), cooldownId: testId(1978), cooldownEventId: testId(1979),
      timerOutboxMessageId: testId(1980), notificationOutboxMessageId: testId(1981),
      notificationIds: [testId(1982), testId(1983)],
    })).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
    expect(JSON.stringify(recordedResult.response)).not.toMatch(
      /media|photo|video|upload|objectKey|uploadToken/i,
    );
    const resultPublicDocuments = await sql<{ readonly document: unknown }>`
      select payload as document
      from platform.domain_events
      where event_id in (${testId(1944)}::uuid, ${testId(1947)}::uuid)
      union all
      select metadata as document
      from platform.audit_events
      where audit_id = ${testId(1945)}::uuid
      union all
      select payload as document
      from platform.outbox_messages
      where message_id in (${testId(1946)}::uuid, ${testId(1953)}::uuid)
    `.execute(database);
    expect(resultPublicDocuments.rows).toHaveLength(5);
    expect(JSON.stringify(resultPublicDocuments.rows)).not.toMatch(
      /media|photo|video|upload|objectKey|uploadToken/i,
    );
    const resultMediaStorage = await sql<{ readonly count: string }>`
      select count(*)::text as count
      from information_schema.tables
      where table_schema = 'competition'
        and table_name in ('result_attachments', 'result_media', 'result_uploads')
    `.execute(database);
    expect(resultMediaStorage.rows[0]?.count).toBe('0');
    await expect(
      readResult(database, resultId, athleteA, new Date('2026-09-13T15:01:00.000Z')),
    ).resolves.toMatchObject({
      viewerCanAppeal: true, viewerCanWaiveAppeal: true,
    });
    await expect(
      readResult(database, resultId, coachId, new Date('2026-09-13T15:01:00.000Z')),
    ).resolves.toMatchObject({ viewerCanAppeal: false, viewerCanWaiveAppeal: false });
    await expect(readSession(database, sessionId, coachId)).resolves.toMatchObject({
      challengeState: 'RESULT_RECORDED', challengeVersion: 12, resultId,
    });
    await expect(readMissingResultReview(database, missingResultReviewId, centralId)).resolves.toMatchObject({
      state: 'RESOLVED', resolution: 'RESULT_CONFIRMED', version: 7,
    });
    const cooldown = await sql<{ readonly ends_at: Date }>`
      select ends_at from competition.pair_cooldowns
      where source_result_id = ${resultId}::uuid
    `.execute(database);
    expect(cooldown.rows[0]?.ends_at.toISOString()).toBe('2026-09-28T15:01:00.000Z');
    const provisionalStatus = await sql<{
      readonly contender_user_id: string;
      readonly status_lock_result_id: string;
      readonly status_version: string;
    }>`
      select contender_user_id, status_lock_result_id,
        status_version::text as status_version
      from competition.competitions where competition_id = ${competitionId}::uuid
    `.execute(database);
    expect(provisionalStatus.rows[0]).toEqual({
      contender_user_id: athleteB, status_lock_result_id: resultId, status_version: '2',
    });

    const reviseMetadataCommand = {
      commandId: testId(47004), commandType: 'REVISE_RESULT_METADATA',
      idempotencyKey: `revise-result-metadata-${resultId}`,
      actor: { type: 'USER', id: coachId, roles: ['COACH'], scopeIds: [communityId] },
      aggregateType: 'Result', aggregateId: resultId, expectedVersion: 1,
      correlationId: testId(47005), causationId: testId(1947), requestId: testId(47006),
      source: 'api', payloadVersion: 1,
      payload: {
        resultId, methodCode: 'DECISION', methodText: '  Победа решением судьи  ',
        scorePayload: { display: '3:0', rounds: [10, 9, 10] },
        methodPayload: { ruleset: 'pilot-v1' },
      },
    } satisfies CommandEnvelope<ReviseResultMetadataPayload>;
    const reviseMetadataIds = {
      revisionId: testId(47000), eventId: testId(47001),
      auditId: testId(47002), outboxMessageId: testId(47003),
    };
    await expect(reviseResultMetadata(database, {
      ...reviseMetadataCommand, commandId: testId(47010),
      idempotencyKey: `revise-result-metadata-athlete-${resultId}`,
      actor: { type: 'USER', id: athleteA, roles: ['COACH'], scopeIds: [communityId] },
    }, {
      revisionId: testId(47011), eventId: testId(47012),
      auditId: testId(47013), outboxMessageId: testId(47014),
    }, () => new Date('2026-09-13T15:02:00.000Z')))
      .rejects.toBeInstanceOf(ResultPermissionDeniedError);
    await expect(reviseResultMetadata(database, {
      ...reviseMetadataCommand, commandId: testId(47020),
      idempotencyKey: `revise-result-metadata-expired-${resultId}`,
    }, {
      revisionId: testId(47021), eventId: testId(47022),
      auditId: testId(47023), outboxMessageId: testId(47024),
    }, () => new Date('2026-09-14T15:01:00.000Z')))
      .rejects.toMatchObject({ code: 'RESULT_METADATA_REVISION_WINDOW_CLOSED' });
    const revisedMetadata = await reviseResultMetadata(
      database, reviseMetadataCommand, reviseMetadataIds,
      () => new Date('2026-09-13T15:02:00.000Z'),
    );
    expect(revisedMetadata.response).toMatchObject({
      resultId, state: 'RECORDED', outcomeCode: 'WIN_B', winnerUserId: athleteB,
      loserUserId: athleteA, methodCode: 'DECISION',
      methodText: 'Победа решением судьи',
      scorePayload: { display: '3:0', rounds: [10, 9, 10] },
      methodPayload: { ruleset: 'pilot-v1' },
      recordedMethodCode: null, recordedMethodText: null,
      recordedScorePayload: null, recordedMethodPayload: null,
      latestMetadataRevisionId: reviseMetadataIds.revisionId,
      metadataRevisionCount: 1,
      metadataRevisionDeadlineAt: '2026-09-14T15:01:00.000Z',
      viewerCanReviseMetadata: true,
      appealDeadlineAt: '2026-09-15T15:01:00.000Z', version: 2,
    });
    await expect(reviseResultMetadata(database, reviseMetadataCommand, reviseMetadataIds))
      .resolves.toMatchObject({ replayed: true, response: revisedMetadata.response });
    await expect(reviseResultMetadata(database, {
      ...reviseMetadataCommand, commandId: testId(47030),
      payload: { ...reviseMetadataCommand.payload, methodText: 'Другой метод' },
    }, {
      revisionId: testId(47031), eventId: testId(47032),
      auditId: testId(47033), outboxMessageId: testId(47034),
    })).rejects.toBeInstanceOf(IdempotencyKeyReusedError);
    await expect(reviseResultMetadata(database, {
      ...reviseMetadataCommand, commandId: testId(47040),
      idempotencyKey: `revise-result-metadata-stale-${resultId}`,
    }, {
      revisionId: testId(47041), eventId: testId(47042),
      auditId: testId(47043), outboxMessageId: testId(47044),
    })).rejects.toBeInstanceOf(VersionConflictError);
    await expect(readResult(
      database, resultId, athleteA, new Date('2026-09-13T15:03:00.000Z'),
    )).resolves.toMatchObject({
      methodText: 'Победа решением судьи', scorePayload: { display: '3:0' },
      viewerCanReviseMetadata: false, version: 2,
    });
    const metadataRevisionProof = await sql<{
      readonly recorded_outcome_code: string;
      readonly winner_user_id: string;
      readonly loser_user_id: string;
      readonly source_method_code: string | null;
      readonly source_method_text: string | null;
      readonly source_score_payload: unknown;
      readonly source_method_payload: unknown;
      readonly result_state: string;
      readonly result_version: string;
      readonly challenge_state: string;
      readonly challenge_version: string;
      readonly status_lock_result_id: string;
      readonly status_version: string;
      readonly cooldown_ends_at: Date;
      readonly appeal_deadline_at: Date;
      readonly revision_count: string;
      readonly event_transition_id: string;
      readonly event_payload: unknown;
      readonly outbox_payload: unknown;
      readonly audit_metadata: unknown;
      readonly failed_effect_count: string;
    }>`
      select result.recorded_outcome_code, result.winner_user_id, result.loser_user_id,
        result.method_code as source_method_code,
        result.method_text as source_method_text,
        result.score_payload as source_score_payload,
        result.method_payload as source_method_payload,
        result.state as result_state, result.version::text as result_version,
        result.appeal_deadline_at, challenge.state as challenge_state,
        challenge.version::text as challenge_version,
        competition.status_lock_result_id,
        competition.status_version::text as status_version,
        cooldown.ends_at as cooldown_ends_at,
        (select count(*)::text from competition.result_metadata_revisions revision
          where revision.result_id = result.result_id) as revision_count,
        event.transition_id as event_transition_id,
        event.payload as event_payload, outbox.payload as outbox_payload,
        audit.metadata as audit_metadata,
        (
          (select count(*) from platform.domain_events failed_event
            where failed_event.event_id in (${testId(47012)}::uuid, ${testId(47022)}::uuid,
              ${testId(47032)}::uuid, ${testId(47042)}::uuid))
          + (select count(*) from platform.audit_events failed_audit
            where failed_audit.audit_id in (${testId(47013)}::uuid, ${testId(47023)}::uuid,
              ${testId(47033)}::uuid, ${testId(47043)}::uuid))
          + (select count(*) from platform.outbox_messages failed_outbox
            where failed_outbox.message_id in (${testId(47014)}::uuid, ${testId(47024)}::uuid,
              ${testId(47034)}::uuid, ${testId(47044)}::uuid))
        )::text as failed_effect_count
      from competition.results result
      join competition.challenges challenge on challenge.challenge_id = result.challenge_id
      join competition.competitions competition
        on competition.competition_id = challenge.competition_id
      join competition.pair_cooldowns cooldown on cooldown.source_result_id = result.result_id
      join platform.domain_events event on event.event_id = ${reviseMetadataIds.eventId}::uuid
      join platform.audit_events audit on audit.audit_id = ${reviseMetadataIds.auditId}::uuid
      join platform.outbox_messages outbox
        on outbox.message_id = ${reviseMetadataIds.outboxMessageId}::uuid
      where result.result_id = ${resultId}::uuid
    `.execute(database);
    expect(metadataRevisionProof.rows[0]).toMatchObject({
      recorded_outcome_code: 'WIN_B', winner_user_id: athleteB, loser_user_id: athleteA,
      source_method_code: null, source_method_text: null,
      source_score_payload: null, source_method_payload: null,
      result_state: 'RECORDED', result_version: '2',
      challenge_state: 'RESULT_RECORDED', challenge_version: '12',
      status_lock_result_id: resultId, status_version: '2',
      cooldown_ends_at: new Date('2026-09-28T15:01:00.000Z'),
      appeal_deadline_at: new Date('2026-09-15T15:01:00.000Z'),
      revision_count: '1', failed_effect_count: '0',
      event_transition_id: 'R-02',
      event_payload: {
        resultId, revisionId: reviseMetadataIds.revisionId,
        resultVersion: 2, revisedAt: '2026-09-13T15:02:00.000Z',
      },
      outbox_payload: {
        resultId, revisionId: reviseMetadataIds.revisionId, resultVersion: 2,
      },
      audit_metadata: expect.objectContaining({
        revisionId: reviseMetadataIds.revisionId,
        before: { methodCode: null, methodText: null, scorePayload: null, methodPayload: null },
        after: {
          methodCode: 'DECISION', methodText: 'Победа решением судьи',
          scorePayload: { display: '3:0', rounds: [10, 9, 10] },
          methodPayload: { ruleset: 'pilot-v1' },
        },
      }),
    });
    expect(JSON.stringify({
      event: metadataRevisionProof.rows[0]?.event_payload,
      outbox: metadataRevisionProof.rows[0]?.outbox_payload,
    })).not.toMatch(/Победа решением судьи|3:0|pilot-v1/);
    await expect(sql`update competition.result_metadata_revisions
      set after_method_text = 'changed' where revision_id = ${reviseMetadataIds.revisionId}::uuid`
      .execute(database)).rejects.toThrow(/append-only/i);
    await expect(sql`delete from competition.result_metadata_revisions
      where revision_id = ${reviseMetadataIds.revisionId}::uuid`
      .execute(database)).rejects.toThrow(/append-only/i);

    const beforeCorrection = await sql<{
      readonly result_state: string;
      readonly result_version: string;
      readonly status_version: string;
      readonly status_lock_result_id: string | null;
      readonly cooldown_count: string;
      readonly appeal_count: string;
    }>`select result.state as result_state, result.version::text as result_version,
        competition.status_version::text as status_version,
        competition.status_lock_result_id,
        (select count(*)::text from competition.pair_cooldowns cooldown
          where cooldown.source_result_id = result.result_id) as cooldown_count,
        (select count(*)::text from competition.appeals appeal
          where appeal.result_id = result.result_id) as appeal_count
      from competition.results result
      join competition.challenges challenge on challenge.challenge_id = result.challenge_id
      join competition.competitions competition
        on competition.competition_id = challenge.competition_id
      where result.result_id = ${resultId}::uuid`.execute(database);
    const correctionPayload: RequestTechnicalCorrectionPayload = {
      resultId,
      expectedResultVersion: 2,
      category: 'OUTCOME_OR_WINNER_ERROR',
      proposedOutcomeCode: 'WIN_A',
      proposedWinnerUserId: athleteA,
      internalReason: '  Победитель внесён не в тот угол.  ',
      evidenceReference: '  session-log:result-1101  ',
    };
    const correctionCommand = (suffix: number): CommandEnvelope<RequestTechnicalCorrectionPayload> => ({
      commandId: testId(35000 + suffix),
      commandType: 'REQUEST_TECHNICAL_CORRECTION',
      idempotencyKey: `technical-correction-${suffix}-${resultId}`,
      actor: { type: 'USER', id: coachId, roles: ['COACH'], scopeIds: [communityId] },
      aggregateType: 'TechnicalCorrection',
      aggregateId: testId(35010 + suffix),
      expectedVersion: 0,
      correlationId: testId(35020 + suffix),
      causationId: testId(1944),
      requestId: testId(35030 + suffix),
      source: 'api',
      payloadVersion: 1,
      payload: correctionPayload,
    });
    const correctionIds = (suffix: number) => ({
      correctionId: testId(35010 + suffix),
      eventId: testId(35040 + suffix),
      auditId: testId(35050 + suffix),
      outboxMessageId: testId(35060 + suffix),
      notificationOutboxMessageId: testId(35070 + suffix),
      notificationId: testId(35080 + suffix),
    });

    await expect(requestTechnicalCorrection(
      database,
      {
        ...correctionCommand(1),
        commandId: testId(35090),
        idempotencyKey: `technical-correction-athlete-${resultId}`,
        actor: { type: 'USER', id: athleteA, roles: ['COACH'], scopeIds: [communityId] },
        aggregateId: testId(35091),
      },
      { ...correctionIds(1), correctionId: testId(35091), eventId: testId(35092),
        auditId: testId(35093), outboxMessageId: testId(35094),
        notificationOutboxMessageId: testId(35095), notificationId: testId(35096) },
    )).rejects.toBeInstanceOf(ResultPermissionDeniedError);
    await expect(requestTechnicalCorrection(
      database,
      {
        ...correctionCommand(2),
        commandId: testId(35100),
        idempotencyKey: `technical-correction-stale-${resultId}`,
        aggregateId: testId(35101),
        payload: { ...correctionPayload, expectedResultVersion: 3 },
      },
      { ...correctionIds(2), correctionId: testId(35101), eventId: testId(35102),
        auditId: testId(35103), outboxMessageId: testId(35104),
        notificationOutboxMessageId: testId(35105), notificationId: testId(35106) },
    )).rejects.toBeInstanceOf(VersionConflictError);

    const competingCommands = [correctionCommand(3), correctionCommand(4)] as const;
    const competingIds = [correctionIds(3), correctionIds(4)] as const;
    const competing = await Promise.allSettled(competingCommands.map((command, index) =>
      requestTechnicalCorrection(database, command, competingIds[index]!)));
    const acceptedCorrectionIndex = competing.findIndex((entry) => entry.status === 'fulfilled');
    expect(acceptedCorrectionIndex).toBeGreaterThanOrEqual(0);
    expect(competing.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    expect(competing.filter((entry) => entry.status === 'rejected')).toHaveLength(1);
    const rejectedCorrection = competing.find((entry) => entry.status === 'rejected');
    expect(rejectedCorrection).toMatchObject({
      reason: expect.objectContaining({ code: 'TECHNICAL_CORRECTION_ALREADY_OPEN' }),
    });
    const acceptedCorrection = competing[acceptedCorrectionIndex]!;
    if (acceptedCorrection.status !== 'fulfilled') throw new Error('Expected one correction request');
    const acceptedEffectIds = competingIds[acceptedCorrectionIndex]!;
    const acceptedCorrectionId = acceptedEffectIds.correctionId;
    expect(acceptedCorrection.value.response).toMatchObject({
      resultId,
      requesterUserId: coachId,
      category: 'OUTCOME_OR_WINNER_ERROR',
      state: 'SUBMITTED',
      originalOutcomeCode: 'WIN_B',
      originalWinnerUserId: athleteB,
      proposedOutcomeCode: 'WIN_A',
      proposedWinnerUserId: athleteA,
      internalReason: 'Победитель внесён не в тот угол.',
      evidenceReference: 'session-log:result-1101',
      version: 1,
    });
    const replayedCorrection = await requestTechnicalCorrection(
      database,
      competingCommands[acceptedCorrectionIndex]!,
      competingIds[acceptedCorrectionIndex]!,
    );
    expect(replayedCorrection.replayed).toBe(true);
    expect(replayedCorrection.response).toEqual(acceptedCorrection.value.response);

    await expect(listTechnicalCorrectionsForViewer(database, coachId)).resolves.toEqual([
      expect.objectContaining({ resultId, internalReason: 'Победитель внесён не в тот угол.' }),
    ]);
    await expect(listTechnicalCorrectionsForViewer(database, athleteA)).resolves.toEqual([]);
    await expect(listTechnicalCorrectionsForCentral(database, centralId)).resolves.toEqual([
      expect.objectContaining({ resultId, evidenceReference: 'session-log:result-1101' }),
    ]);
    await expect(requestTechnicalCorrection(
      database,
      {
        ...correctionCommand(5),
        actor: { type: 'USER', id: centralId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      },
      correctionIds(5),
    )).rejects.toMatchObject({ code: 'TECHNICAL_CORRECTION_ALREADY_OPEN' });

    const startCorrectionReviewCommand: CommandEnvelope<StartTechnicalCorrectionReviewPayload> = {
      commandId: testId(35110), commandType: 'START_TECHNICAL_CORRECTION_REVIEW',
      idempotencyKey: `technical-correction-start-${acceptedCorrectionId}`,
      actor: { type: 'USER', id: centralId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'TechnicalCorrection', aggregateId: acceptedCorrectionId,
      expectedVersion: 1, correlationId: testId(35111), causationId: acceptedEffectIds.eventId,
      requestId: testId(35112), source: 'admin', payloadVersion: 1,
      payload: { correctionId: acceptedCorrectionId },
    };
    const startCorrectionReviewIds = {
      eventId: testId(35113), auditId: testId(35114), outboxMessageId: testId(35115),
    };
    await expect(startTechnicalCorrectionReview(database, {
      ...startCorrectionReviewCommand, commandId: testId(35116),
      idempotencyKey: `technical-correction-start-coach-${acceptedCorrectionId}`,
      actor: { type: 'USER', id: coachId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
    }, { eventId: testId(35117), auditId: testId(35118), outboxMessageId: testId(35119) }))
      .rejects.toBeInstanceOf(ResultPermissionDeniedError);
    await expect(startTechnicalCorrectionReview(database, {
      ...startCorrectionReviewCommand, commandId: testId(35120),
      idempotencyKey: `technical-correction-start-stale-${acceptedCorrectionId}`,
      expectedVersion: 2,
    }, { eventId: testId(35121), auditId: testId(35122), outboxMessageId: testId(35123) }))
      .rejects.toBeInstanceOf(VersionConflictError);
    const startedCorrectionReview = await startTechnicalCorrectionReview(
      database, startCorrectionReviewCommand, startCorrectionReviewIds,
      () => new Date('2026-09-13T15:03:00.000Z'),
    );
    expect(startedCorrectionReview.response).toMatchObject({
      correctionId: acceptedCorrectionId, state: 'UNDER_REVIEW',
      assignedReviewerUserId: centralId, reviewStartedAt: '2026-09-13T15:03:00.000Z',
      decisionReason: null, version: 2,
    });
    expect((await startTechnicalCorrectionReview(
      database, startCorrectionReviewCommand, startCorrectionReviewIds,
    )).replayed).toBe(true);

    await sql`insert into community.role_grants (
      grant_id, user_id, role, scope_type, scope_id, state, authorized_by, authorized_at, version
    ) values (${testId(35124)}::uuid, ${adminId}::uuid, 'CENTRAL_ADMIN', 'GLOBAL', null,
      'ACTIVE', ${centralId}::uuid, '2026-09-13T15:03:30.000Z', 1)`.execute(database);
    const rejectCorrectionCommand: CommandEnvelope<RejectTechnicalCorrectionPayload> = {
      commandId: testId(35125), commandType: 'REJECT_TECHNICAL_CORRECTION',
      idempotencyKey: `technical-correction-reject-${acceptedCorrectionId}`,
      actor: { type: 'USER', id: centralId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'TechnicalCorrection', aggregateId: acceptedCorrectionId,
      expectedVersion: 2, correlationId: testId(35126),
      causationId: startCorrectionReviewIds.eventId, requestId: testId(35127), source: 'admin',
      payloadVersion: 1, payload: { correctionId: acceptedCorrectionId,
        reason: '  Evidence does not support changing the official Result.  ' },
    };
    const rejectCorrectionIds = {
      eventId: testId(35128), auditId: testId(35129), outboxMessageId: testId(35130),
      notificationOutboxMessageId: testId(35131), notificationId: testId(35132),
    };
    await expect(rejectTechnicalCorrection(database, {
      ...rejectCorrectionCommand, commandId: testId(35133),
      idempotencyKey: `technical-correction-reject-other-${acceptedCorrectionId}`,
      actor: { type: 'USER', id: adminId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
    }, { eventId: testId(35134), auditId: testId(35135), outboxMessageId: testId(35136),
      notificationOutboxMessageId: testId(35137), notificationId: testId(35138) }))
      .rejects.toMatchObject({ code: 'TECHNICAL_CORRECTION_REVIEWER_MISMATCH' });
    const rejectedCorrectionResult = await rejectTechnicalCorrection(
      database, rejectCorrectionCommand, rejectCorrectionIds,
      () => new Date('2026-09-13T15:04:00.000Z'),
    );
    expect(rejectedCorrectionResult.response).toMatchObject({
      state: 'REJECTED', assignedReviewerUserId: centralId,
      decisionReason: 'Evidence does not support changing the official Result.',
      decidedAt: '2026-09-13T15:04:00.000Z', version: 3,
    });
    expect((await rejectTechnicalCorrection(
      database, rejectCorrectionCommand, rejectCorrectionIds,
    )).replayed).toBe(true);
    await expect(listTechnicalCorrectionsForCentral(database, centralId)).resolves.toEqual([]);
    await expect(listTechnicalCorrectionsForViewer(database, coachId)).resolves.toEqual([
      expect.objectContaining({ state: 'REJECTED', decisionReason: null, version: 3 }),
    ]);

    const correctionDecisionEffects = await sql<{
      readonly audit_metadata: unknown;
      readonly event_payload: unknown;
      readonly outbox_payload: unknown;
      readonly notification_payload: unknown;
      readonly start_audit_count: string;
      readonly reject_audit_count: string;
    }>`select audit.metadata as audit_metadata, event.payload as event_payload,
        outbox.payload as outbox_payload, notification.payload as notification_payload,
        (select count(*)::text from platform.audit_events
          where action = 'START_TECHNICAL_CORRECTION_REVIEW') as start_audit_count,
        (select count(*)::text from platform.audit_events
          where action = 'REJECT_TECHNICAL_CORRECTION') as reject_audit_count
      from platform.audit_events audit, platform.domain_events event,
        platform.outbox_messages outbox, platform.outbox_messages notification
      where audit.audit_id = ${rejectCorrectionIds.auditId}::uuid
        and event.event_id = ${rejectCorrectionIds.eventId}::uuid
        and outbox.message_id = ${rejectCorrectionIds.outboxMessageId}::uuid
        and notification.message_id = ${rejectCorrectionIds.notificationOutboxMessageId}::uuid`
      .execute(database);
    expect(correctionDecisionEffects.rows[0]).toMatchObject({
      start_audit_count: '1', reject_audit_count: '1',
      audit_metadata: { decisionReason: 'Evidence does not support changing the official Result.' },
      notification_payload: { notifications: [{ recipientUserId: coachId,
        renderKey: 'result.technical-correction-rejected',
        payload: { correctionId: acceptedCorrectionId, state: 'REJECTED' } }] },
    });
    expect(JSON.stringify({ event: correctionDecisionEffects.rows[0]?.event_payload,
      outbox: correctionDecisionEffects.rows[0]?.outbox_payload,
      notification: correctionDecisionEffects.rows[0]?.notification_payload }))
      .not.toContain('Evidence does not support');

    const afterCorrection = await sql<{
      readonly result_state: string;
      readonly result_version: string;
      readonly status_version: string;
      readonly status_lock_result_id: string | null;
      readonly cooldown_count: string;
      readonly appeal_count: string;
    }>`select result.state as result_state, result.version::text as result_version,
        competition.status_version::text as status_version,
        competition.status_lock_result_id,
        (select count(*)::text from competition.pair_cooldowns cooldown
          where cooldown.source_result_id = result.result_id) as cooldown_count,
        (select count(*)::text from competition.appeals appeal
          where appeal.result_id = result.result_id) as appeal_count
      from competition.results result
      join competition.challenges challenge on challenge.challenge_id = result.challenge_id
      join competition.competitions competition
        on competition.competition_id = challenge.competition_id
      where result.result_id = ${resultId}::uuid`.execute(database);
    expect(afterCorrection.rows).toEqual(beforeCorrection.rows);
    const correctionEffects = await sql<{
      readonly event_payload: unknown;
      readonly event_metadata: unknown;
      readonly audit_metadata: unknown;
      readonly outbox_payload: unknown;
      readonly notification_payload: unknown;
      readonly audit_count: string;
    }>`select event.payload as event_payload, event.metadata as event_metadata,
        audit.metadata as audit_metadata, outbox.payload as outbox_payload,
        notification.payload as notification_payload,
        (select count(*)::text from platform.audit_events
          where action = 'REQUEST_TECHNICAL_CORRECTION') as audit_count
      from platform.domain_events event, platform.audit_events audit,
        platform.outbox_messages outbox, platform.outbox_messages notification
      where event.event_id = ${acceptedEffectIds.eventId}::uuid
        and audit.audit_id = ${acceptedEffectIds.auditId}::uuid
        and outbox.message_id = ${acceptedEffectIds.outboxMessageId}::uuid
        and notification.message_id = ${acceptedEffectIds.notificationOutboxMessageId}::uuid`
      .execute(database);
    expect(correctionEffects.rows).toHaveLength(1);
    expect(correctionEffects.rows[0]?.audit_count).toBe('1');
    expect(JSON.stringify({
      event: correctionEffects.rows[0]?.event_payload,
      metadata: correctionEffects.rows[0]?.event_metadata,
      outbox: correctionEffects.rows[0]?.outbox_payload,
      notification: correctionEffects.rows[0]?.notification_payload,
    })).not.toMatch(/Победитель|session-log:result-1101/);
    expect(correctionEffects.rows[0]?.audit_metadata).toMatchObject({
      internalReason: 'Победитель внесён не в тот угол.',
      evidenceReference: 'session-log:result-1101',
    });
    expect(correctionEffects.rows[0]?.notification_payload).toMatchObject({
      notifications: [{
        recipientUserId: centralId,
        renderKey: 'result.technical-correction-requested',
        payload: { resultId },
      }],
    });
    await expect(sql`update competition.technical_correction_requests
      set internal_reason = 'changed' where correction_id = ${acceptedCorrectionId}::uuid`
      .execute(database)).rejects.toThrow(/immutable/);
    await expect(sql`delete from competition.technical_correction_requests
      where correction_id = ${acceptedCorrectionId}::uuid`.execute(database)).rejects.toThrow();

    await expect(recordSessionResult(
      database,
      {
        commandId: testId(1960), commandType: 'RECORD_SESSION_RESULT',
        idempotencyKey: `record-result-duplicate-${challengeId}`,
        actor: { type: 'USER', id: reviewerCoachId, roles: ['COACH'], scopeIds: [communityId] },
        aggregateType: 'Challenge', aggregateId: challengeId, expectedVersion: 12,
        correlationId: testId(1961), causationId: testId(1944), requestId: testId(1962),
        source: 'api', payloadVersion: 1,
        payload: {
          challengeId, sessionId, outcomeCode: 'WIN_A', winnerUserId: null,
          reasonCode: null, comment: null, methodCode: null, methodText: null,
          scorePayload: null, methodPayload: null,
        },
      } satisfies CommandEnvelope<RecordSessionResultPayload>,
      {
        eventId: testId(1963), auditId: testId(1964), outboxMessageId: testId(1965),
        resultId: testId(1966), resultEventId: testId(1967),
        timerOutboxMessageId: testId(1968), notificationOutboxMessageId: testId(1969),
        notificationIds: [testId(1984), testId(1985)],
      },
      () => new Date('2026-09-13T15:02:00.000Z'),
    )).rejects.toMatchObject<Partial<ResultConflictError>>({
      code: 'RESULT_ALREADY_RECORDED',
    });
    const immutableResult = await sql<{
      readonly recorded_outcome_code: string;
      readonly winner_user_id: string;
      readonly loser_user_id: string;
      readonly result_version: string;
      readonly challenge_state: string;
      readonly challenge_version: string;
      readonly status_lock_result_id: string;
      readonly status_version: string;
      readonly appeal_deadline_at: Date;
      readonly snapshot_contender_user_id: string;
      readonly snapshot_status_version: string;
      readonly transition_count: string;
      readonly cooldown_count: string;
      readonly failed_effect_count: string;
    }>`
      select result.recorded_outcome_code, result.winner_user_id, result.loser_user_id,
        result.version::text as result_version, result.appeal_deadline_at,
        snapshot.contender_user_id as snapshot_contender_user_id,
        snapshot.competition_status_version::text as snapshot_status_version,
        challenge.state as challenge_state, challenge.version::text as challenge_version,
        competition.status_lock_result_id,
        competition.status_version::text as status_version,
        (select count(*)::text from competition.status_transitions transition
          where transition.source_result_id = result.result_id) as transition_count,
        (select count(*)::text from competition.pair_cooldowns cooldown
          where cooldown.source_result_id = result.result_id) as cooldown_count,
        (
          (select count(*) from platform.domain_events event
            where event.event_id in (${testId(1963)}::uuid, ${testId(1967)}::uuid,
              ${testId(1971)}::uuid, ${testId(1975)}::uuid))
          + (select count(*) from platform.audit_events audit
            where audit.audit_id in (${testId(1964)}::uuid, ${testId(1972)}::uuid))
          + (select count(*) from platform.outbox_messages outbox
            where outbox.message_id in (${testId(1965)}::uuid, ${testId(1969)}::uuid,
              ${testId(1973)}::uuid, ${testId(1981)}::uuid))
        )::text as failed_effect_count
      from competition.results result
      join competition.challenges challenge on challenge.challenge_id = result.challenge_id
      join competition.competitions competition
        on competition.competition_id = challenge.competition_id
      join scheduling.session_competitive_snapshots snapshot
        on snapshot.snapshot_id = result.competitive_snapshot_id
      where result.result_id = ${resultId}::uuid
    `.execute(database);
    expect(immutableResult.rows[0]).toEqual({
      recorded_outcome_code: 'WIN_B', winner_user_id: athleteB, loser_user_id: athleteA,
      result_version: '2', appeal_deadline_at: new Date('2026-09-15T15:01:00.000Z'),
      snapshot_contender_user_id: athleteA, snapshot_status_version: '1',
      challenge_state: 'RESULT_RECORDED', challenge_version: '12',
      status_lock_result_id: resultId, status_version: '2', transition_count: '1',
      cooldown_count: '1', failed_effect_count: '0',
    });

    const appealId = testId(2000);
    const appealed = await submitResultAppeal(
      database,
      {
        commandId: testId(2001), commandType: 'SUBMIT_RESULT_APPEAL',
        idempotencyKey: `appeal-result-${resultId}`,
        actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Result', aggregateId: resultId, expectedVersion: 2,
        correlationId: testId(2002), causationId: testId(1947), requestId: testId(2003),
        source: 'api', payloadVersion: 1,
        payload: { resultId, reasonCode: 'WRONG_WINNER', statement: 'Победитель указан неверно.' },
      } satisfies CommandEnvelope<SubmitResultAppealPayload>,
      {
        eventId: testId(2004), auditId: testId(2005), outboxMessageId: testId(2006),
        appealId, appealEventId: testId(2007), challengeEventId: testId(2008),
        notificationOutboxMessageId: testId(2009),
        notificationIds: [testId(2010), testId(2011)],
      },
      () => new Date('2026-09-13T15:05:00.000Z'),
    );
    expect(appealed.response).toMatchObject({
      resultId, state: 'UNDER_APPEAL', provisional: true, version: 3,
    });
    await expect(listAppealsForCentral(database, centralId)).resolves.toEqual([
      expect.objectContaining({
        appealId, resultId, state: 'SUBMITTED', viewerCanStartReview: true, version: 1,
      }),
    ]);

    const opponentResponse = await addAppealResponse(
      database,
      {
        commandId: testId(2100), commandType: 'ADD_APPEAL_RESPONSE',
        idempotencyKey: `respond-appeal-opponent-${appealId}`,
        actor: { type: 'USER', id: athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Appeal', aggregateId: appealId, expectedVersion: 1,
        correlationId: testId(2101), causationId: testId(2007), requestId: testId(2102),
        source: 'api', payloadVersion: 1,
        payload: { appealId, statement: 'Результат был записан верно.' },
      } satisfies CommandEnvelope<AddAppealResponsePayload>,
      {
        eventId: testId(2103), auditId: testId(2104), outboxMessageId: testId(2105),
        responseId: testId(2106),
      },
      () => new Date('2026-09-13T15:06:00.000Z'),
    );
    expect(opponentResponse.response).toMatchObject({
      appealId, version: 2,
      responses: [{ responderUserId: athleteB, responderRole: 'OPPONENT' }],
    });

    const coachResponse = await addAppealResponse(
      database,
      {
        commandId: testId(2110), commandType: 'ADD_APPEAL_RESPONSE',
        idempotencyKey: `respond-appeal-coach-${appealId}`,
        actor: { type: 'USER', id: reviewerCoachId, roles: ['COACH'], scopeIds: [] },
        aggregateType: 'Appeal', aggregateId: appealId, expectedVersion: 2,
        correlationId: testId(2111), causationId: testId(2103), requestId: testId(2112),
        source: 'api', payloadVersion: 1,
        payload: { appealId, statement: 'Coach подтверждает ошибку в записи.' },
      } satisfies CommandEnvelope<AddAppealResponsePayload>,
      {
        eventId: testId(2113), auditId: testId(2114), outboxMessageId: testId(2115),
        responseId: testId(2116),
      },
      () => new Date('2026-09-13T15:07:00.000Z'),
    );
    expect(coachResponse.response.responses).toHaveLength(2);

    const review = await startAppealReview(
      database,
      {
        commandId: testId(2012), commandType: 'START_APPEAL_REVIEW',
        idempotencyKey: `start-appeal-review-${appealId}`,
        actor: { type: 'USER', id: centralId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
        aggregateType: 'Appeal', aggregateId: appealId, expectedVersion: 3,
        correlationId: testId(2013), causationId: testId(2007), requestId: testId(2014),
        source: 'api', payloadVersion: 1, payload: { appealId },
      } satisfies CommandEnvelope<StartAppealReviewPayload>,
      {
        eventId: testId(2015), auditId: testId(2016), outboxMessageId: testId(2017),
        notificationOutboxMessageId: testId(2018),
        notificationIds: [testId(2019), testId(2020), testId(2021)],
      },
      () => new Date('2026-09-13T15:10:00.000Z'),
    );
    expect(review.response).toMatchObject({
      appealId, state: 'UNDER_REVIEW', assignedReviewerUserId: centralId,
      viewerCanDecide: true, viewerCanExtendSla: true, version: 4,
    });

    const extended = await extendAppealSla(
      database,
      {
        commandId: testId(2120), commandType: 'EXTEND_APPEAL_SLA',
        idempotencyKey: `extend-appeal-${appealId}`,
        actor: { type: 'USER', id: centralId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
        aggregateType: 'Appeal', aggregateId: appealId, expectedVersion: 4,
        correlationId: testId(2121), causationId: testId(2015), requestId: testId(2122),
        source: 'api', payloadVersion: 1,
        payload: { appealId, durationHours: 24, reason: 'Нужна сверка видеозаписи.' },
      } satisfies CommandEnvelope<ExtendAppealSlaPayload>,
      {
        eventId: testId(2123), auditId: testId(2124), outboxMessageId: testId(2125),
        extensionId: testId(2126), notificationOutboxMessageId: testId(2127),
        notificationIds: [testId(2128), testId(2129), testId(2130)],
      },
      () => new Date('2026-09-13T15:11:00.000Z'),
    );
    expect(extended.response).toMatchObject({
      appealId, version: 5, viewerCanExtendSla: false,
      slaExtension: { durationHours: 24, reason: 'Нужна сверка видеозаписи.' },
    });

    const decideCommand = {
      commandId: testId(2022), commandType: 'DECIDE_APPEAL',
      idempotencyKey: `reverse-appeal-${appealId}`,
      actor: { type: 'USER', id: centralId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'Appeal', aggregateId: appealId, expectedVersion: 5,
      correlationId: testId(2023), causationId: testId(2015), requestId: testId(2024),
      source: 'api', payloadVersion: 1,
      payload: { appealId, decision: 'REVERSE', reason: 'Coach подтвердил ошибку победителя.' },
    } satisfies CommandEnvelope<DecideAppealPayload>;
    const decideIds = {
      eventId: testId(2025), auditId: testId(2026), outboxMessageId: testId(2027),
      decisionId: testId(2028), resultEventId: testId(2029), challengeEventId: testId(2030),
      statusCompensationId: testId(2031), statusEventId: testId(2032),
      cooldownEventId: testId(2033), notificationOutboxMessageId: testId(2034),
      notificationIds: [testId(2035), testId(2036), testId(2037)],
    };
    const decided = await decideAppeal(
      database, decideCommand, decideIds,
      () => new Date('2026-09-13T15:20:00.000Z'),
    );
    expect(decided.response).toMatchObject({
      appealId, state: 'DECIDED_REVERSED', decision: 'REVERSE',
      resultState: 'REVERSED', recordedWinnerUserId: athleteB,
      effectiveWinnerUserId: athleteA, version: 6,
    });
    await expect(readResult(database, resultId, athleteA)).resolves.toMatchObject({
      state: 'REVERSED', outcomeCode: 'WIN_A', winnerUserId: athleteA,
      loserUserId: athleteB, decision: 'REVERSE',
      decisionReason: 'Coach подтвердил ошибку победителя.', provisional: false,
    });
    await expect(readResultTimerSnapshot(database, resultId)).resolves.toEqual({
      state: 'REVERSED', version: 4,
    });
    const finalStatus = await sql<{
      readonly contender_user_id: string;
      readonly status_lock_result_id: string | null;
      readonly status_version: string;
    }>`
      select contender_user_id, status_lock_result_id,
        status_version::text as status_version
      from competition.competitions where competition_id = ${competitionId}::uuid
    `.execute(database);
    expect(finalStatus.rows[0]).toEqual({
      contender_user_id: athleteA, status_lock_result_id: null, status_version: '3',
    });
    const compensation = await sql<{
      readonly corrected_transition_type: string;
      readonly to_contender_user_id: string;
    }>`
      select corrected_transition_type, to_contender_user_id
      from competition.status_transition_compensations
      where source_result_id = ${resultId}::uuid
    `.execute(database);
    expect(compensation.rows[0]).toEqual({
      corrected_transition_type: 'CONTENDER_DEFENDED', to_contender_user_id: athleteA,
    });

    const replayedDecision = await decideAppeal(
      database, decideCommand, decideIds,
      () => new Date('2026-09-13T15:21:00.000Z'),
    );
    expect(replayedDecision.replayed).toBe(true);
    expect(replayedDecision.response).toEqual(decided.response);

    interface CriticalRoleAuditRow {
      readonly audit_id: string;
      readonly action: string;
      readonly actor_id: string;
      readonly actor_type: string;
      readonly actor_roles: readonly string[];
      readonly actor_scope_ids: readonly string[];
      readonly aggregate_type: string;
      readonly aggregate_id: string;
      readonly transition_id: string | null;
      readonly request_id: string;
      readonly correlation_id: string;
      readonly causation_id: string | null;
      readonly reason_code: string | null;
      readonly before_state: string | null;
      readonly after_state: string | null;
      readonly occurred_at: Date;
      readonly metadata: Readonly<Record<string, unknown>>;
    }
    const criticalRoleAudits = await sql<CriticalRoleAuditRow>`
      select audit_id, action, actor_id, actor_type, actor_roles, actor_scope_ids,
        aggregate_type, aggregate_id, transition_id, request_id, correlation_id,
        causation_id, reason_code, before_state, after_state, occurred_at, metadata
      from platform.audit_events
      where audit_id in (
        ${testId(2364)}::uuid, ${testId(1945)}::uuid, ${testId(2026)}::uuid
      )
      order by occurred_at
    `.execute(database);
    expect(criticalRoleAudits.rows).toEqual([
      expect.objectContaining({
        audit_id: testId(2364), action: 'CONFIRM_MISSING_RESULT_VENUE',
        actor_id: adminId, actor_type: 'USER', actor_roles: ['GYM_ADMIN'],
        actor_scope_ids: [venueId], aggregate_type: 'MissingResultReview',
        aggregate_id: missingResultReviewId, transition_id: null,
        request_id: testId(2362), correlation_id: testId(2361), causation_id: testId(2329),
        reason_code: 'ATTENDANCE_CONFIRMED', before_state: 'OPEN', after_state: 'OPEN',
        occurred_at: new Date('2026-09-13T14:58:00.000Z'),
        metadata: expect.objectContaining({
          commandId: testId(2360), commandType: 'CONFIRM_MISSING_RESULT_VENUE',
          confirmationId: testId(2366), source: 'api',
        }),
      }),
      expect.objectContaining({
        audit_id: testId(1945), action: 'RECORD_RESULT', actor_id: reviewerCoachId,
        actor_type: 'USER', actor_roles: ['COACH'], actor_scope_ids: [communityId],
        aggregate_type: 'Challenge', aggregate_id: challengeId, transition_id: 'CH-15',
        request_id: testId(1943), correlation_id: testId(1942), causation_id: testId(1933),
        reason_code: null, before_state: 'RESULT_PENDING', after_state: 'RESULT_RECORDED',
        occurred_at: new Date('2026-09-13T15:01:00.000Z'),
        metadata: expect.objectContaining({
          commandId: testId(1941), commandType: 'RECORD_SESSION_RESULT', resultId,
          statusTransitionType: 'CONTENDER_TRANSFERRED', source: 'api',
        }),
      }),
      expect.objectContaining({
        audit_id: testId(2026), action: 'DECIDE_APPEAL_REVERSE', actor_id: centralId,
        actor_type: 'USER', actor_roles: ['CENTRAL_ADMIN'], actor_scope_ids: [],
        aggregate_type: 'Appeal', aggregate_id: appealId, transition_id: 'A-07',
        request_id: testId(2024), correlation_id: testId(2023), causation_id: testId(2015),
        reason_code: 'REVERSE', before_state: 'UNDER_REVIEW', after_state: 'DECIDED_REVERSED',
        occurred_at: new Date('2026-09-13T15:20:00.000Z'),
        metadata: expect.objectContaining({
          commandId: testId(2022), commandType: 'DECIDE_APPEAL', resultId,
          decisionId: testId(2028), reason: 'Coach подтвердил ошибку победителя.', source: 'api',
        }),
      }),
    ]);
    const forbiddenAuditCount = await sql<{ readonly count: string }>`
      select count(*)::text as count from platform.audit_events
      where audit_id in (${testId(2394)}::uuid, ${testId(1964)}::uuid)
    `.execute(database);
    expect(forbiddenAuditCount.rows[0]?.count).toBe('0');

    const centralPublicDocuments = await sql<{ readonly document: unknown }>`
      select payload as document from platform.domain_events
      where event_id in (
        ${testId(2025)}::uuid, ${testId(2029)}::uuid,
        ${testId(2030)}::uuid, ${testId(2032)}::uuid
      )
      union all
      select payload as document from platform.outbox_messages
      where message_id in (${testId(2027)}::uuid, ${testId(2034)}::uuid)
    `.execute(database);
    expect(centralPublicDocuments.rows).toHaveLength(6);
    expect(JSON.stringify(centralPublicDocuments.rows)).not.toContain(
      'Coach подтвердил ошибку победителя.',
    );

    await expect(sql`
      update platform.audit_events set action = 'MUTATED'
      where audit_id = ${testId(2026)}::uuid
    `.execute(database)).rejects.toThrow(/append-only table audit_events cannot be mutated/);
    await expect(sql`
      delete from platform.audit_events where audit_id = ${testId(2026)}::uuid
    `.execute(database)).rejects.toThrow(/append-only table audit_events cannot be mutated/);

    const withdrawalChallengeId = testId(2200);
    const withdrawalResultId = testId(2201);
    const withdrawalAppealId = testId(2202);
    await database.transaction().execute(async (transaction) => {
      await sql`
        insert into competition.challenges (
          challenge_id, competition_id, source_match_id, source_chat_id, service_chat_id,
          initiator_user_id, recipient_user_id, pair_low_id, pair_high_id,
          response_policy, stake, state, ruleset_snapshot_id, response_deadline_at,
          accepted_at, scheduling_deadline_at, version, created_at, updated_at
        ) values (
          ${withdrawalChallengeId}::uuid, ${competitionId}::uuid, ${matchId}::uuid,
          ${sourceChatId}::uuid, ${sourceChatId}::uuid,
          ${athleteA}::uuid, ${athleteB}::uuid, ${athleteA}::uuid, ${athleteB}::uuid,
          'OPTIONAL', 'CONTENDER', 'UNDER_APPEAL', ${testId(1123)}::uuid,
          '2026-09-13T12:00:00Z', '2026-09-12T12:00:00Z', '2026-09-26T12:00:00Z',
          1, '2026-09-12T12:00:00Z', '2026-09-12T12:00:00Z'
        )
      `.execute(transaction);
      await sql`
        insert into competition.challenge_participant_obligations (
          obligation_id, challenge_id, user_id, accepted_at
        ) values
          (${testId(2203)}::uuid, ${withdrawalChallengeId}::uuid, ${athleteA}::uuid, '2026-09-12T12:00:00Z'),
          (${testId(2204)}::uuid, ${withdrawalChallengeId}::uuid, ${athleteB}::uuid, '2026-09-12T12:00:00Z')
      `.execute(transaction);
      await sql`
        insert into competition.results (
          result_id, challenge_id, session_id, competitive_snapshot_id, cycle_no, origin,
          state, recorded_outcome_code, winner_user_id, loser_user_id, actual_time,
          venue_id, coach_user_id, recorded_by, recorded_at, appeal_deadline_at,
          pre_status_snapshot, version, updated_at
        ) select
          ${withdrawalResultId}::uuid, ${withdrawalChallengeId}::uuid, null,
          null, 1, 'ADMINISTRATIVE_FORFEIT', 'UNDER_APPEAL',
          'WIN_A', ${athleteA}::uuid, ${athleteB}::uuid, '2026-09-12T12:00:00Z',
          null, null, ${coachId}::uuid,
          '2026-09-12T12:00:00Z', '2026-09-14T12:00:00Z', '{}'::jsonb, 1,
          '2026-09-12T12:00:00Z'
        from competition.results where result_id = ${resultId}::uuid
      `.execute(transaction);
      await sql`
        insert into competition.appeals (
          appeal_id, result_id, challenge_id, appellant_user_id, state, reason_code,
          statement, submitted_at, response_deadline_at, sla_due_at, version
        ) values (
          ${withdrawalAppealId}::uuid, ${withdrawalResultId}::uuid,
          ${withdrawalChallengeId}::uuid, ${athleteB}::uuid, 'SUBMITTED',
          'RESULT_DISPUTED', 'Отзыв будет проверен транзакционно.',
          '2026-09-12T12:05:00Z', '2026-09-13T12:05:00Z', '2026-09-15T12:05:00Z', 1
        )
      `.execute(transaction);
      await sql`
        insert into platform.domain_events (
          event_id, event_name, event_version, aggregate_type, aggregate_id,
          aggregate_version, transition_id, correlation_id, causation_id, actor_id,
          occurred_at, payload, idempotency_key_hash
        ) values (
          ${testId(2205)}::uuid, 'AppealSubmitted', 1, 'Appeal',
          ${withdrawalAppealId}::uuid, 1, 'A-01', ${testId(2206)}::uuid,
          null, ${athleteB}::uuid, '2026-09-12T12:05:00Z', '{}'::jsonb,
          'fixture:withdrawal-appeal'
        )
      `.execute(transaction);
    });

    const withdrawn = await withdrawAppeal(
      database,
      {
        commandId: testId(2210), commandType: 'WITHDRAW_APPEAL',
        idempotencyKey: `withdraw-appeal-${withdrawalAppealId}`,
        actor: { type: 'USER', id: athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Appeal', aggregateId: withdrawalAppealId, expectedVersion: 1,
        correlationId: testId(2211), causationId: testId(2202), requestId: testId(2212),
        source: 'api', payloadVersion: 1, payload: { appealId: withdrawalAppealId },
      } satisfies CommandEnvelope<WithdrawAppealPayload>,
      {
        eventId: testId(2213), auditId: testId(2214), outboxMessageId: testId(2215),
        withdrawalId: testId(2216), resultEventId: testId(2217),
        challengeEventId: testId(2218), notificationOutboxMessageId: testId(2219),
        notificationIds: [testId(2220), testId(2221), testId(2222)],
      },
      () => new Date('2026-09-12T12:10:00.000Z'),
    );
    expect(withdrawn.response).toMatchObject({
      appealId: withdrawalAppealId, state: 'WITHDRAWN', resultState: 'FINAL',
      withdrawnAt: '2026-09-12T12:10:00.000Z', viewerCanWithdraw: false, version: 2,
    });
    await expect(readResult(database, withdrawalResultId, athleteB)).resolves.toMatchObject({
      state: 'FINAL', provisional: false, version: 2,
    });

    const integrityCaseId = testId(13000);
    const integrityTransitionId = testId(13001);
    await database.transaction().execute(async (transaction) => {
      await sql`
        insert into competition.status_transitions (
          transition_id, source_result_id, source_event_id, competition_id,
          transition_type, before_champion_user_id, before_contender_user_id,
          before_status_version, after_champion_user_id, after_contender_user_id,
          after_status_version, competitive_snapshot_id, provisional, applied_at
        ) select
          ${integrityTransitionId}::uuid, result_id, ${testId(13002)}::uuid,
          ${competitionId}::uuid, 'CONTENDER_DEFENDED', null, ${athleteA}::uuid,
          3, null, ${athleteA}::uuid, 4, competitive_snapshot_id, true,
          '2026-09-14T09:00:00Z'
        from competition.results where result_id = ${withdrawalResultId}::uuid
      `.execute(transaction);
      await sql`
        insert into competition.status_transition_finalizations (
          finalization_id, transition_id, result_id, finalized_by_event_id,
          competition_status_version, finalized_at
        ) values (
          ${testId(13003)}::uuid, ${integrityTransitionId}::uuid,
          ${withdrawalResultId}::uuid, ${testId(13004)}::uuid, 4,
          '2026-09-14T09:00:00Z'
        )
      `.execute(transaction);
      await sql`
        update competition.competitions set contender_user_id = ${athleteA}::uuid,
          status_version = 4, version = version + 1, updated_at = '2026-09-14T09:00:00Z'
        where competition_id = ${competitionId}::uuid and status_version = 3
      `.execute(transaction);
    });

    const openedIntegrity = await openIntegrityCase(
      database,
      {
        commandId: testId(13010), commandType: 'OPEN_INTEGRITY_CASE',
        idempotencyKey: `open-integrity-${withdrawalResultId}`,
        actor: { type: 'USER', id: centralId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
        aggregateType: 'IntegrityCase', aggregateId: integrityCaseId, expectedVersion: 0,
        correlationId: testId(13011), causationId: testId(2217), requestId: testId(13012),
        source: 'admin', payloadVersion: 1,
        payload: {
          resultId: withdrawalResultId, expectedResultVersion: 2,
          category: 'SYSTEM_ERROR', evidenceReference: 'audit://result/withdrawal-fixture',
          internalReason: 'Журнал исхода расходится с финальной записью.',
        },
      } satisfies CommandEnvelope<OpenIntegrityCasePayload>,
      {
        caseId: integrityCaseId, eventId: testId(13013), auditId: testId(13014),
        outboxMessageId: testId(13015), notificationOutboxMessageId: testId(13016),
        notificationIds: [testId(13017), testId(13018), testId(13019)],
      },
      () => new Date('2026-09-14T10:00:00.000Z'),
    );
    expect(openedIntegrity.response).toMatchObject({
      caseId: integrityCaseId, resultId: withdrawalResultId, state: 'OPEN',
      category: 'SYSTEM_ERROR', evidenceReference: 'audit://result/withdrawal-fixture',
      version: 1,
    });
    await expect(readIntegrityCase(database, integrityCaseId, athleteA)).resolves.toMatchObject({
      caseId: integrityCaseId, evidenceReference: null, internalReason: null,
      publicReasonCategory: 'SYSTEM_ERROR', viewerCanStartReview: false,
    });

    const startedIntegrity = await startIntegrityReview(
      database,
      {
        commandId: testId(13020), commandType: 'START_INTEGRITY_REVIEW',
        idempotencyKey: `start-integrity-${integrityCaseId}`,
        actor: { type: 'USER', id: centralId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
        aggregateType: 'IntegrityCase', aggregateId: integrityCaseId, expectedVersion: 1,
        correlationId: testId(13021), causationId: testId(13013), requestId: testId(13022),
        source: 'admin', payloadVersion: 1, payload: { caseId: integrityCaseId },
      } satisfies CommandEnvelope<StartIntegrityReviewPayload>,
      {
        eventId: testId(13023), auditId: testId(13024), outboxMessageId: testId(13025),
        competitionEventId: testId(13026),
      },
      () => new Date('2026-09-14T10:05:00.000Z'),
    );
    expect(startedIntegrity.response).toMatchObject({
      state: 'UNDER_REVIEW', assignedReviewerUserId: centralId,
      viewerCanDecide: true, version: 2,
    });

    const decidedIntegrity = await decideIntegrityCase(
      database,
      {
        commandId: testId(13030), commandType: 'DECIDE_INTEGRITY_CASE',
        idempotencyKey: `decide-integrity-${integrityCaseId}`,
        actor: { type: 'USER', id: centralId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
        aggregateType: 'IntegrityCase', aggregateId: integrityCaseId, expectedVersion: 2,
        correlationId: testId(13031), causationId: testId(13023), requestId: testId(13032),
        source: 'admin', payloadVersion: 1,
        payload: {
          caseId: integrityCaseId, disposition: 'CORRECT', correctedOutcomeCode: 'WIN_B',
          reason: 'Независимый журнал подтверждает победу второго участника.',
        },
      } satisfies CommandEnvelope<DecideIntegrityCasePayload>,
      {
        eventId: testId(13033), auditId: testId(13034), outboxMessageId: testId(13035),
        decisionId: testId(13036), resultEventId: testId(13037),
        challengeEventId: testId(13038), competitionEventId: testId(13039),
        compensationId: testId(13040), notificationOutboxMessageId: testId(13041),
        notificationIds: [testId(13042), testId(13043), testId(13044)],
      },
      () => new Date('2026-09-14T10:10:00.000Z'),
    );
    expect(decidedIntegrity.response).toMatchObject({
      state: 'DECIDED_CORRECTED', requestedDisposition: 'CORRECT',
      effectiveDisposition: 'CORRECT', effectiveOutcomeCode: 'WIN_B',
      effectiveWinnerUserId: athleteB, version: 3,
    });
    expect(decidedIntegrity.response.replayHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(readResult(database, withdrawalResultId, athleteA)).resolves.toMatchObject({
      state: 'REVERSED', outcomeCode: 'WIN_B', winnerUserId: athleteB,
      loserUserId: athleteA, integrityReviewState: 'DECIDED_CORRECTED',
      integrityReviewCategory: 'SYSTEM_ERROR',
    });
    const integrityStatus = await sql<{
      readonly contender_user_id: string;
      readonly status_version: string;
      readonly integrity_hold_case_id: string | null;
    }>`select contender_user_id, status_version::text as status_version,
      integrity_hold_case_id from competition.competitions
      where competition_id = ${competitionId}::uuid`.execute(database);
    expect(integrityStatus.rows[0]).toEqual({
      contender_user_id: athleteB, status_version: '5', integrity_hold_case_id: null,
    });
    const immutableSource = await sql<{
      readonly recorded_outcome_code: string;
      readonly winner_user_id: string;
    }>`select recorded_outcome_code, winner_user_id from competition.results
      where result_id = ${withdrawalResultId}::uuid`.execute(database);
    expect(immutableSource.rows[0]).toEqual({
      recorded_outcome_code: 'WIN_A', winner_user_id: athleteA,
    });
    await expect(sql`update competition.integrity_cases
      set evidence_reference = 'changed' where case_id = ${integrityCaseId}::uuid`
      .execute(database)).rejects.toThrow(/immutable/i);

    const lineageEvents = await sql<{ readonly transition_id: string }>`
      select transition_id from platform.domain_events
      where aggregate_type = 'Challenge' and aggregate_id = ${challengeId}::uuid
      order by aggregate_version
    `.execute(database);
    expect(lineageEvents.rows.map((row) => row.transition_id)).toEqual([
      'CH-01', 'CH-02', 'CH-08', 'CH-09', 'CH-08', 'CH-10', 'CH-13', 'CH-14',
      null, null, 'MR-01', 'CH-15', 'CH-16', 'CH-19',
    ]);
  });

  it('[AC-090][AC-099][AC-178][AC-190][AC-191] pairs GENESIS FIFO and preserves the survivor position', async () => {
    const athleteA = testId(14000);
    const athleteB = testId(14001);
    const central = testId(14002);
    const venue = testId(14003);
    const community = testId(14004);
    const competition = testId(14005);
    const membershipA = testId(14006);
    const coach = testId(14013);
    const entryA = testId(14020);
    const entryB = testId(14021);
    const entryASecond = testId(14022);
    const entryBSecond = testId(14023);
    const occurredAt = '2026-09-26T10:00:00.000Z';

    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values
        (${athleteA}::uuid, '+79991400000', ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'Атлет А', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${athleteB}::uuid, '+79991400001', ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'Атлет Б', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${central}::uuid, '+79991400002', ${occurredAt}::timestamptz, '1985-01-01', 'ADULT', 'Central', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${coach}::uuid, '+79991400003', ${occurredAt}::timestamptz, '1985-01-01', 'ADULT', 'Coach', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz)
    `.execute(database);
    await sql`
      insert into identity.account_verifications (
        verification_id, user_id, state, method, moderation_checklist_version,
        is_current, verified_at, decided_by, decision_reason, version
      ) values
        (${testId(14007)}::uuid, ${athleteA}::uuid, 'VERIFIED', 'CENTRAL_MODERATION', 'identity-mvp-v1', true, ${occurredAt}::timestamptz, ${central}::uuid, 'TEST_APPROVED', 1),
        (${testId(14008)}::uuid, ${athleteB}::uuid, 'VERIFIED', 'CENTRAL_MODERATION', 'identity-mvp-v1', true, ${occurredAt}::timestamptz, ${central}::uuid, 'TEST_APPROVED', 1)
    `.execute(database);
    await ensureLocalPilotCommunity(database, {
      venueId: venue,
      venueConfigurationId: testId(14009),
      communityId: community,
      communityConfigurationId: testId(14010),
      membershipId: membershipA,
      centralGrantId: testId(14011),
      athleteUserId: athleteA,
      centralActorId: central,
      legalName: 'FIFO Pilot Gym LLC',
      venueDisplayName: 'FIFO Pilot Gym',
      communityName: 'FIFO Community',
      address: 'Москва',
      cityCode: 'MOSCOW',
      timezone: 'Europe/Moscow',
      contactPayload: { phone: '+79990000501' },
      occurredAt,
    });
    await ensureLocalPilotCompetition(database, {
      competitionId: competition,
      communityId: community,
      centralActorId: central,
      occurredAt,
      memberships: [
        { membershipId: membershipA, userId: athleteA },
        { membershipId: testId(14012), userId: athleteB },
      ],
    });

    const submit = async (userId: string, queueEntryId: string, offset: number) =>
      submitStatusQueueEntry(
        database,
        {
          commandId: testId(offset),
          commandType: 'SUBMIT_STATUS_QUEUE_ENTRY',
          idempotencyKey: `status-queue-submit-${queueEntryId}`,
          actor: { type: 'USER', id: userId, roles: ['ATHLETE'], scopeIds: [] },
          aggregateType: 'ChallengeQueueEntry',
          aggregateId: queueEntryId,
          expectedVersion: 0,
          correlationId: testId(offset + 1),
          causationId: null,
          requestId: testId(offset + 2),
          source: 'api',
          payloadVersion: 1,
          payload: { competitionId: competition },
        } satisfies CommandEnvelope<SubmitStatusQueueEntryPayload>,
        {
          eventId: testId(offset + 3),
          auditId: testId(offset + 4),
          outboxMessageId: testId(offset + 5),
          challengeId: testId(offset + 6),
          challengeEventId: testId(offset + 7),
          serviceChatId: testId(offset + 8),
          serviceChatEventId: testId(offset + 9),
          rulesetSnapshotId: testId(offset + 10),
          acknowledgmentId: testId(offset + 18),
          pairedQueueEventId: testId(offset + 11),
          timerOutboxMessageId: testId(offset + 12),
          staleQueueEventId: testId(offset + 13),
          staleQueueOutboxMessageId: testId(offset + 14),
          notificationOutboxMessageId: testId(offset + 15),
          notificationIds: [testId(offset + 16), testId(offset + 17)],
        },
      );

    await sql`
      update identity.account_verifications
      set state = 'EXPIRED', expires_at = '2026-09-26T09:59:59.000Z'::timestamptz
      where user_id = ${athleteA}::uuid and is_current
    `.execute(database);
    await expect(submit(athleteA, entryA, 14030))
      .rejects.toMatchObject({ code: 'ACCOUNT_NOT_VERIFIED' });
    await sql`
      update identity.account_verifications set state = 'VERIFIED', expires_at = null
      where user_id = ${athleteA}::uuid and is_current
    `.execute(database);
    await sql`
      update competition.competitions set age_division = 'YOUTH'
      where competition_id = ${competition}::uuid
    `.execute(database);
    await expect(submit(athleteA, entryA, 14030))
      .rejects.toMatchObject({ code: 'AGE_CONTOUR_MISMATCH' });
    await sql`
      update competition.competitions set age_division = 'ADULT'
      where competition_id = ${competition}::uuid
    `.execute(database);

    const first = await submit(athleteA, entryA, 14030);
    await sql`
      update identity.users set account_state = 'RESTRICTED' where user_id = ${athleteA}::uuid
    `.execute(database);
    const second = await submit(athleteB, entryB, 14040);
    expect(first.response).toMatchObject({ state: 'WAITING', position: 1 });
    expect(second.response).toMatchObject({ state: 'WAITING', position: 1 });
    const invalidatedHead = await sql<{
      readonly state: string;
      readonly terminal_reason: string | null;
    }>`select state, terminal_reason from competition.challenge_queue_entries
      where queue_entry_id = ${entryA}::uuid`.execute(database);
    expect(invalidatedHead.rows[0]).toEqual({
      state: 'INVALIDATED', terminal_reason: 'ACCOUNT_NOT_ACTIVE',
    });
    await sql`
      update identity.users set account_state = 'ACTIVE' where user_id = ${athleteA}::uuid
    `.execute(database);
    const pairedEntry = await submit(athleteA, entryASecond, 14060);
    expect(pairedEntry.response).toMatchObject({ state: 'PAIRED_PENDING_ACCEPTANCE', position: 2 });

    await expect(readCompetitionStatus(database, competition, athleteB)).resolves.toMatchObject({
      phase: 'FOUNDING_CHALLENGE',
      visibility: 'FULL',
      queueSize: 2,
      queue: [
        { queueEntryId: entryB, state: 'PAIRED_PENDING_ACCEPTANCE', position: 1, initiatorDisplayName: 'Атлет Б' },
        { queueEntryId: entryASecond, state: 'PAIRED_PENDING_ACCEPTANCE', position: 2, initiatorDisplayName: 'Атлет А' },
      ],
      viewerGenesisAction: {
        challengeId: testId(14066),
        opponentDisplayName: 'Атлет А',
        acceptedCount: 0,
        canAccept: true,
      },
    });
    await expect(readCompetitionStatus(database, competition, central)).resolves.toMatchObject({
      visibility: 'AGGREGATE',
      queueSize: 2,
      queue: [],
    });

    const respond = async (
      userId: string,
      challengeId: string,
      decision: 'ACCEPT' | 'DECLINE',
      expectedVersion: number,
      offset: number,
    ) => respondToGenesisChallenge(
      database,
      {
        commandId: testId(offset),
        commandType: `${decision}_GENESIS_CHALLENGE`,
        idempotencyKey: `genesis-${challengeId}-${userId}-${decision}`,
        actor: { type: 'USER', id: userId, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Challenge',
        aggregateId: challengeId,
        expectedVersion,
        correlationId: testId(offset + 1),
        causationId: null,
        requestId: testId(offset + 2),
        source: 'api',
        payloadVersion: 1,
        payload: { challengeId, explicitRulesetAcknowledged: true },
      } satisfies CommandEnvelope<GenesisResponsePayload>,
      decision,
      {
        eventId: testId(offset + 3),
        auditId: testId(offset + 4),
        outboxMessageId: testId(offset + 5),
        responseId: testId(offset + 6),
        acknowledgmentId: testId(offset + 7),
        obligationIds: [testId(offset + 8), testId(offset + 9)],
        queueEventIds: [testId(offset + 10), testId(offset + 11)],
        notificationOutboxMessageId: testId(offset + 12),
        notificationIds: [testId(offset + 13), testId(offset + 14)],
      },
    );

    const firstChallengeId = testId(14066);
    await sql`
      update identity.users set account_state = 'RESTRICTED' where user_id = ${athleteB}::uuid
    `.execute(database);
    await expect(readCompetitionStatus(database, competition, athleteA)).resolves.toMatchObject({
      viewerGenesisAction: { canAccept: false, canDecline: true },
    });
    await expect(respond(athleteA, firstChallengeId, 'ACCEPT', 1, 14080))
      .rejects.toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE' });
    await sql`
      update identity.users set account_state = 'ACTIVE' where user_id = ${athleteB}::uuid
    `.execute(database);
    await expect(readCompetitionStatus(database, competition, athleteA)).resolves.toMatchObject({
      viewerGenesisAction: { canAccept: true, canDecline: true },
    });
    const acceptedByA = await respond(athleteA, firstChallengeId, 'ACCEPT', 1, 14100);
    expect(acceptedByA.response).toMatchObject({
      state: 'AWAITING_RESPONSE',
      viewerDecision: 'ACCEPT',
      acceptedCount: 1,
    });
    const declinedByB = await respond(athleteB, firstChallengeId, 'DECLINE', 2, 14120);
    expect(declinedByB.response).toMatchObject({ state: 'DECLINED', acceptedCount: 1 });

    await expect(readCompetitionStatus(database, competition, athleteA)).resolves.toMatchObject({
      phase: 'FOUNDING_OPEN',
      queue: [{ queueEntryId: entryASecond, state: 'WAITING', position: 1 }],
      viewerQueueEntryId: entryASecond,
      joinDenialCode: 'LIVE_QUEUE_ENTRY_EXISTS',
    });

    const reentered = await submit(athleteB, entryBSecond, 14200);
    const secondChallengeId = testId(14206);
    expect(reentered.response).toMatchObject({ state: 'PAIRED_PENDING_ACCEPTANCE', position: 2 });
    await respond(athleteB, secondChallengeId, 'ACCEPT', 1, 14220);
    const acceptedByASecond = await respond(athleteA, secondChallengeId, 'ACCEPT', 2, 14240);
    expect(acceptedByASecond.response).toMatchObject({
      state: 'ACCEPTED_UNSCHEDULED',
      acceptedCount: 2,
    });
    await expect(readCompetitionStatus(database, competition, athleteA)).resolves.toMatchObject({
      phase: 'FOUNDING_CHALLENGE',
      queueSize: 0,
      queue: [],
      viewerQueueEntryId: null,
      viewerGenesisAction: {
        challengeId: secondChallengeId,
        state: 'ACCEPTED_UNSCHEDULED',
        acceptedCount: 2,
      },
    });
    const obligations = await sql<{ readonly count: string }>`
      select count(*)::text as count
      from competition.challenge_participant_obligations
      where challenge_id = ${secondChallengeId}::uuid and released_at is null
    `.execute(database);
    expect(obligations.rows[0]?.count).toBe('2');

    const genesisServiceChatId = testId(14208);
    const genesisSlotId = testId(14260);
    const genesisBookingId = testId(14261);
    await expect(readChatChallenge(
      database,
      genesisServiceChatId,
      athleteA,
    )).resolves.toMatchObject({
      canCreate: false,
      challenge: {
        challengeId: secondChallengeId,
        responsePolicy: 'MUTUAL_GENESIS',
        state: 'ACCEPTED_UNSCHEDULED',
      },
    });
    await sql`
      insert into scheduling.slots (
        slot_id, venue_id, coach_user_id, start_at, end_at, slot_type, state,
        price_text, cancellation_terms_text, commercial_version, published_by,
        version, created_at, updated_at
      ) values (
        ${genesisSlotId}::uuid, ${venue}::uuid, ${coach}::uuid,
        '2026-10-02T15:00:00.000Z'::timestamptz,
        '2026-10-02T16:00:00.000Z'::timestamptz,
        'PERSONAL', 'PUBLISHED', 'Оплата залу', 'Перенос по правилам зала', 1,
        ${central}::uuid, 1, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz
      )
    `.execute(database);
    await expect(readTrainingOptions(
      database,
      genesisServiceChatId,
      athleteA,
      new Date('2026-09-27T12:00:00.000Z'),
    )).resolves.toMatchObject({
      slots: [{ slotId: genesisSlotId }],
    });
    const selectedGenesisSlot = await selectSlot(
      database,
      {
        commandId: testId(14262),
        commandType: 'SELECT_SLOT',
        idempotencyKey: `genesis-slot-${genesisBookingId}`,
        actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Booking',
        aggregateId: genesisBookingId,
        expectedVersion: 0,
        correlationId: testId(14263),
        causationId: null,
        requestId: testId(14264),
        source: 'api',
        payloadVersion: 1,
        payload: {
          chatId: genesisServiceChatId,
          slotId: genesisSlotId,
          commercialVersion: 1,
          challengeId: secondChallengeId,
        },
      } satisfies CommandEnvelope<SelectSlotPayload>,
      {
        eventId: testId(14265),
        auditId: testId(14266),
        outboxMessageId: testId(14267),
        notificationId: testId(14268),
        notificationOutboxMessageId: testId(14269),
        challengeEventId: testId(14270),
        challengeOutboxMessageId: testId(14271),
      },
      () => new Date('2026-09-27T12:00:00.000Z'),
    );
    expect(selectedGenesisSlot.response).toMatchObject({
      bookingId: genesisBookingId,
      chatId: genesisServiceChatId,
      purpose: 'OFFICIAL_CHALLENGE',
      challengeId: secondChallengeId,
      state: 'SELECTING',
    });
    const bookingLineage = await sql<{ readonly match_id: string | null }>`
      select match_id from scheduling.bookings where booking_id = ${genesisBookingId}::uuid
    `.execute(database);
    expect(bookingLineage.rows[0]?.match_id).toBeNull();
  });

  it('[AC-044][AC-052][AC-095][AC-096][AC-097][AC-138][AC-164] runs direct FIFO, mandatory delivery, Forfeit and holder reconfirmation', async () => {
    const setup = async (base: number, phonePrefix: string) => {
      const challenger = testId(base);
      const contender = testId(base + 1);
      const champion = testId(base + 2);
      const central = testId(base + 3);
      const follower = testId(base + 15);
      const venue = testId(base + 4);
      const community = testId(base + 5);
      const competition = testId(base + 6);
      const queueEntryId = testId(base + 20);
      const occurredAt = '2026-09-28T10:00:00.000Z';
      await sql`
        insert into identity.users (
          user_id, phone_e164, phone_verified_at, birth_date, age_division,
          display_name, account_state, locale, version, activated_at
        ) values
          (${challenger}::uuid, ${`${phonePrefix}0`}, ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', ${`Challenger ${base}`}, 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
          (${contender}::uuid, ${`${phonePrefix}1`}, ${occurredAt}::timestamptz, '1994-01-01', 'ADULT', ${`Contender ${base}`}, 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
          (${champion}::uuid, ${`${phonePrefix}2`}, ${occurredAt}::timestamptz, '1993-01-01', 'ADULT', ${`Champion ${base}`}, 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
          (${central}::uuid, ${`${phonePrefix}3`}, ${occurredAt}::timestamptz, '1985-01-01', 'ADULT', ${`Central ${base}`}, 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
          (${follower}::uuid, ${`${phonePrefix}4`}, ${occurredAt}::timestamptz, '1996-01-01', 'ADULT', ${`Follower ${base}`}, 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz)
      `.execute(database);
      await sql`
        insert into identity.account_verifications (
          verification_id, user_id, state, method, moderation_checklist_version,
          is_current, verified_at, decided_by, decision_reason, version
        ) values
          (${testId(base + 7)}::uuid, ${challenger}::uuid, 'VERIFIED', 'CENTRAL_MODERATION', 'identity-mvp-v1', true, ${occurredAt}::timestamptz, ${central}::uuid, 'TEST_APPROVED', 1),
          (${testId(base + 8)}::uuid, ${contender}::uuid, 'VERIFIED', 'CENTRAL_MODERATION', 'identity-mvp-v1', true, ${occurredAt}::timestamptz, ${central}::uuid, 'TEST_APPROVED', 1),
          (${testId(base + 16)}::uuid, ${follower}::uuid, 'VERIFIED', 'CENTRAL_MODERATION', 'identity-mvp-v1', true, ${occurredAt}::timestamptz, ${central}::uuid, 'TEST_APPROVED', 1)
      `.execute(database);
      await ensureLocalPilotCommunity(database, {
        venueId: venue,
        venueConfigurationId: testId(base + 9),
        communityId: community,
        communityConfigurationId: testId(base + 10),
        membershipId: testId(base + 11),
        centralGrantId: testId(base + 12),
        athleteUserId: challenger,
        centralActorId: central,
        legalName: `Direct Status Gym ${base}`,
        venueDisplayName: `Direct Status Gym ${base}`,
        communityName: `Direct Status Community ${base}`,
        address: 'Москва',
        cityCode: 'MOSCOW',
        timezone: 'Europe/Moscow',
        contactPayload: {},
        occurredAt,
      });
      await ensureLocalPilotCompetition(database, {
        competitionId: competition,
        communityId: community,
        centralActorId: central,
        occurredAt,
        memberships: [
          { membershipId: testId(base + 11), userId: challenger },
          { membershipId: testId(base + 13), userId: contender },
          { membershipId: testId(base + 14), userId: champion },
          { membershipId: testId(base + 17), userId: follower },
        ],
      });
      await sql`
        update competition.competitions
        set phase = 'RUNNING', champion_user_id = ${champion}::uuid,
          contender_user_id = ${contender}::uuid, status_version = 2,
          version = version + 1
        where competition_id = ${competition}::uuid
      `.execute(database);
      await submitStatusQueueEntry(
        database,
        {
          commandId: testId(base + 21),
          commandType: 'SUBMIT_STATUS_QUEUE_ENTRY',
          idempotencyKey: `direct-status-submit-${queueEntryId}`,
          actor: { type: 'USER', id: challenger, roles: ['ATHLETE'], scopeIds: [] },
          aggregateType: 'ChallengeQueueEntry', aggregateId: queueEntryId,
          expectedVersion: 0, correlationId: testId(base + 22), causationId: null,
          requestId: testId(base + 23), source: 'api', payloadVersion: 1,
          payload: { competitionId: competition },
        } satisfies CommandEnvelope<SubmitStatusQueueEntryPayload>,
        {
          eventId: testId(base + 24), auditId: testId(base + 25),
          outboxMessageId: testId(base + 26), challengeId: testId(base + 27),
          challengeEventId: testId(base + 28), serviceChatId: testId(base + 29),
          serviceChatEventId: testId(base + 30), rulesetSnapshotId: testId(base + 31),
          acknowledgmentId: testId(base + 32), pairedQueueEventId: testId(base + 33),
          timerOutboxMessageId: testId(base + 34), staleQueueEventId: testId(base + 35),
          staleQueueOutboxMessageId: testId(base + 36),
          notificationOutboxMessageId: testId(base + 37),
          notificationIds: [testId(base + 38), testId(base + 39)],
        },
      );
      const candidate = await readStatusQueueActivationCandidate(database, competition);
      expect(candidate).toEqual({ competitionId: competition, queueEntryId, version: 1 });
      const challengeId = testId(base + 46);
      const serviceChatId = testId(base + 48);
      const activated = await activateStatusQueueHead(
        database,
        {
          commandId: testId(base + 40),
          commandType: 'ACTIVATE_STATUS_QUEUE_HEAD',
          idempotencyKey: `direct-status-activate-${queueEntryId}`,
          actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
          aggregateType: 'ChallengeQueueEntry', aggregateId: queueEntryId,
          expectedVersion: 1, correlationId: testId(base + 41),
          causationId: testId(base + 24), requestId: testId(base + 42),
          source: 'scheduler', payloadVersion: 1,
          payload: { competitionId: competition, queueEntryId },
        } satisfies CommandEnvelope<ActivateStatusQueueHeadPayload>,
        {
          eventId: testId(base + 43), auditId: testId(base + 44),
          outboxMessageId: testId(base + 45), challengeId,
          challengeEventId: testId(base + 47), serviceChatId,
          serviceChatEventId: testId(base + 49), rulesetSnapshotId: testId(base + 50),
          acknowledgmentId: testId(base + 51), pairedQueueEventId: testId(base + 52),
          timerOutboxMessageId: testId(base + 53), staleQueueEventId: testId(base + 54),
          mandatoryReminderTimerOutboxMessageId: testId(base + 59),
          staleQueueOutboxMessageId: testId(base + 55),
          notificationOutboxMessageId: testId(base + 56),
          notificationIds: [testId(base + 57), testId(base + 58)],
        },
        () => new Date(occurredAt),
      );
      expect(activated.response).toMatchObject({ state: 'CONSUMED', position: null });
      await expect(readChatChallenge(database, serviceChatId, contender)).resolves.toMatchObject({
        canCreate: false,
        challenge: {
          challengeId,
          responsePolicy: 'MANDATORY',
          stake: 'CONTENDER',
          state: 'AWAITING_RESPONSE',
          responseDeadlineAt: '2026-10-01T10:00:00.000Z',
          viewerRole: 'RECIPIENT',
        },
      });
      await expect(readCompetitionStatus(database, competition, challenger)).resolves.toMatchObject({
        activeChallenge: { challengeId, serviceChatId, viewerIsParticipant: true },
        queueSize: 0,
      });
      return {
        challenger,
        contender,
        champion,
        follower,
        competition,
        challengeId,
        serviceChatId,
        activationEventId: testId(base + 43),
        mandatoryReminderTimerOutboxMessageId: testId(base + 59),
        notificationOutboxMessageId: testId(base + 56),
        challengeNotificationId: testId(base + 57),
      };
    };

    const acceptedFixture = await setup(15000, '+7999150000');
    const mandatoryReminderOutbox = await sql<{
      readonly topic: string;
      readonly payload: { readonly timer: {
        readonly commandType: string;
        readonly expectedState: string;
        readonly expectedVersion: number;
        readonly deadlineAt: string;
      } };
    }>`
      select topic, payload from platform.outbox_messages
      where message_id = ${acceptedFixture.mandatoryReminderTimerOutboxMessageId}::uuid
    `.execute(database);
    expect(mandatoryReminderOutbox.rows[0]).toEqual({
      topic: 'competition.challenge.mandatory-response-reminder-48h-timer.v1',
      payload: expect.objectContaining({ timer: expect.objectContaining({
        commandType: 'REMIND_MANDATORY_CHALLENGE_RESPONSE_48H',
        expectedState: 'AWAITING_RESPONSE', expectedVersion: 1,
        deadlineAt: '2026-09-30T10:00:00.000Z',
      }) }),
    });
    const mandatoryOutbox = await sql<{
      readonly event_id: string;
      readonly payload: { readonly notifications: readonly unknown[] };
    }>`
      select event_id, payload
      from platform.outbox_messages
      where message_id = ${acceptedFixture.notificationOutboxMessageId}::uuid
    `.execute(database);
    const mandatoryProjection = mandatoryOutbox.rows[0];
    if (!mandatoryProjection) throw new Error('Mandatory notification outbox is missing');
    expect(mandatoryProjection.event_id).toBe(acceptedFixture.activationEventId);
    expect(JSON.stringify(mandatoryProjection.payload)).not.toContain('+7999');
    await expect(projectNotificationBatch(
      database,
      mandatoryProjection.event_id,
      mandatoryProjection.payload.notifications as Parameters<typeof projectNotificationBatch>[2],
    )).resolves.toEqual({
      replayed: false,
      createdCount: 2,
      createdPushIntentCount: 2,
      createdSmsIntentCount: 0,
    });
    await expect(projectNotificationBatch(
      database,
      mandatoryProjection.event_id,
      mandatoryProjection.payload.notifications as Parameters<typeof projectNotificationBatch>[2],
    )).resolves.toEqual({
      replayed: true,
      createdCount: 0,
      createdPushIntentCount: 0,
      createdSmsIntentCount: 0,
    });
    const challengeDelivery = await sql<{
      readonly channel: string;
      readonly delivery_class: string;
      readonly recipient_user_id: string;
    }>`
      select channel, delivery_class, recipient_user_id
      from platform.notification_delivery_intents
      where notification_id = ${acceptedFixture.challengeNotificationId}::uuid
    `.execute(database);
    expect(challengeDelivery.rows).toEqual([{
      channel: 'PUSH',
      delivery_class: 'CRITICAL',
      recipient_user_id: acceptedFixture.contender,
    }]);
    const challengeBeforeRead = await sql<{
      readonly response_deadline_at: Date;
      readonly state: string;
      readonly version: string;
    }>`
      select response_deadline_at, state, version::text
      from competition.challenges
      where challenge_id = ${acceptedFixture.challengeId}::uuid
    `.execute(database);
    await expect(markNotificationRead(
      database,
      acceptedFixture.challengeNotificationId,
      acceptedFixture.contender,
    )).resolves.toBe(true);
    const challengeAfterRead = await sql<{
      readonly response_deadline_at: Date;
      readonly state: string;
      readonly version: string;
    }>`
      select response_deadline_at, state, version::text
      from competition.challenges
      where challenge_id = ${acceptedFixture.challengeId}::uuid
    `.execute(database);
    expect(challengeAfterRead.rows[0]).toEqual(challengeBeforeRead.rows[0]);
    const acceptCommand = {
      commandId: testId(15100), commandType: 'ACCEPT_MANDATORY_CHALLENGE',
      idempotencyKey: `mandatory-accept-${acceptedFixture.challengeId}`,
      actor: { type: 'USER', id: acceptedFixture.contender, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: acceptedFixture.challengeId,
      expectedVersion: 1, correlationId: testId(15101), causationId: null,
      requestId: testId(15102), source: 'api', payloadVersion: 1,
      payload: { challengeId: acceptedFixture.challengeId },
    } satisfies CommandEnvelope<RespondToChallengePayload>;
    const acceptEffectIds = {
      eventId: testId(15103), auditId: testId(15104), outboxMessageId: testId(15105),
      notificationId: testId(15106), notificationOutboxMessageId: testId(15107),
      acknowledgmentId: testId(15108), obligationIds: [testId(15109), testId(15110)] as const,
    };
    const acceptedAt = '2026-10-01T09:59:59.999Z';
    const schedulingDeadlineAt = '2026-10-15T09:59:59.999Z';
    const accepted = await acceptOptionalChallenge(
      database, acceptCommand, acceptEffectIds, () => new Date(acceptedAt),
    );
    expect(accepted.response).toMatchObject({
      state: 'ACCEPTED_UNSCHEDULED',
      version: 2,
      responseDeadlineAt: '2026-10-01T10:00:00.000Z',
      schedulingDeadlineAt,
    });
    await expect(acceptOptionalChallenge(
      database, acceptCommand, acceptEffectIds, () => new Date(acceptedAt),
    )).resolves.toMatchObject({ replayed: true, eventId: acceptEffectIds.eventId });
    await expect(readChallengeTimerSnapshot(
      database, acceptedFixture.challengeId,
    )).resolves.toEqual({
      state: 'ACCEPTED_UNSCHEDULED', version: 2, deadlineAt: schedulingDeadlineAt,
    });
    const acceptedFacts = await sql<{
      readonly champion_user_id: string;
      readonly contender_user_id: string;
      readonly status_lock_result_id: string | null;
      readonly obligations: string;
      readonly results: string;
      readonly status_transitions: string;
      readonly cooldowns: string;
      readonly accepted_events: string;
      readonly expiry_events: string;
      readonly accept_audits: string;
      readonly accept_outbox: string;
      readonly idempotency_records: string;
    }>`
      select competition.champion_user_id, competition.contender_user_id,
        competition.status_lock_result_id,
        (select count(*)::text from competition.challenge_participant_obligations
          where challenge_id = ${acceptedFixture.challengeId}::uuid
            and released_at is null) as obligations,
        (select count(*)::text from competition.results
          where challenge_id = ${acceptedFixture.challengeId}::uuid) as results,
        (select count(*)::text from competition.status_transitions as transition
          join competition.results as result
            on result.result_id = transition.source_result_id
          where result.challenge_id = ${acceptedFixture.challengeId}::uuid) as status_transitions,
        (select count(*)::text from competition.pair_cooldowns as cooldown
          join competition.results as result
            on result.result_id = cooldown.source_result_id
          where result.challenge_id = ${acceptedFixture.challengeId}::uuid) as cooldowns,
        (select count(*)::text from platform.domain_events
          where aggregate_type = 'Challenge'
            and aggregate_id = ${acceptedFixture.challengeId}::uuid
            and event_name = 'ChallengeAccepted') as accepted_events,
        (select count(*)::text from platform.domain_events
          where aggregate_type = 'Challenge'
            and aggregate_id = ${acceptedFixture.challengeId}::uuid
            and event_name = 'MandatoryChallengeExpired') as expiry_events,
        (select count(*)::text from platform.audit_events
          where aggregate_type = 'Challenge'
            and aggregate_id = ${acceptedFixture.challengeId}::uuid
            and action = 'ACCEPT_MANDATORY_CHALLENGE') as accept_audits,
        (select count(*)::text from platform.outbox_messages
          where event_id = ${acceptEffectIds.eventId}::uuid) as accept_outbox,
        (select count(*)::text from platform.idempotency_records
          where event_id = ${acceptEffectIds.eventId}::uuid) as idempotency_records
      from competition.competitions as competition
      where competition.competition_id = ${acceptedFixture.competition}::uuid
    `.execute(database);
    expect(acceptedFacts.rows[0]).toEqual({
      champion_user_id: acceptedFixture.champion,
      contender_user_id: acceptedFixture.contender,
      status_lock_result_id: null,
      obligations: '2', results: '0', status_transitions: '0', cooldowns: '0',
      accepted_events: '1', expiry_events: '0', accept_audits: '1',
      accept_outbox: '2', idempotency_records: '1',
    });

    const refusedFixture = await setup(15400, '+7999154000');
    const followerQueueEntryId = testId(15600);
    await submitStatusQueueEntry(
      database,
      {
        commandId: testId(15601), commandType: 'SUBMIT_STATUS_QUEUE_ENTRY',
        idempotencyKey: `direct-status-submit-${followerQueueEntryId}`,
        actor: { type: 'USER', id: refusedFixture.follower, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'ChallengeQueueEntry', aggregateId: followerQueueEntryId,
        expectedVersion: 0, correlationId: testId(15602), causationId: null,
        requestId: testId(15603), source: 'api', payloadVersion: 1,
        payload: { competitionId: refusedFixture.competition },
      } satisfies CommandEnvelope<SubmitStatusQueueEntryPayload>,
      {
        eventId: testId(15604), auditId: testId(15605), outboxMessageId: testId(15606),
        challengeId: testId(15607), challengeEventId: testId(15608),
        serviceChatId: testId(15609), serviceChatEventId: testId(15610),
        rulesetSnapshotId: testId(15611), acknowledgmentId: testId(15612),
        pairedQueueEventId: testId(15613), timerOutboxMessageId: testId(15614),
        staleQueueEventId: testId(15615), staleQueueOutboxMessageId: testId(15616),
        notificationOutboxMessageId: testId(15617),
        notificationIds: [testId(15618), testId(15619)],
      },
    );
    const followerBefore = await readCompetitionStatus(
      database,
      refusedFixture.competition,
      refusedFixture.follower,
    );
    expect(followerBefore?.queue).toMatchObject([{
      queueEntryId: followerQueueEntryId,
      state: 'WAITING',
      boundHolderUserId: refusedFixture.contender,
      position: 1,
    }]);
    const originalSubmittedAt = followerBefore?.queue[0]?.submittedAt;
    const resultId = testId(15520);
    const refused = await declineOptionalChallenge(
      database,
      {
        commandId: testId(15500), commandType: 'DECLINE_MANDATORY_CHALLENGE',
        idempotencyKey: `mandatory-decline-${refusedFixture.challengeId}`,
        actor: { type: 'USER', id: refusedFixture.contender, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Challenge', aggregateId: refusedFixture.challengeId,
        expectedVersion: 1, correlationId: testId(15501), causationId: null,
        requestId: testId(15502), source: 'api', payloadVersion: 1,
        payload: { challengeId: refusedFixture.challengeId },
      } satisfies CommandEnvelope<RespondToChallengePayload>,
      {
        eventId: testId(15503), auditId: testId(15504), outboxMessageId: testId(15505),
        notificationId: testId(15506), notificationOutboxMessageId: testId(15507),
        quietPeriodId: testId(15508), resultId, resultEventId: testId(15509),
        statusTransitionId: testId(15510), statusEventId: testId(15511),
        cooldownId: testId(15512), cooldownEventId: testId(15513),
        timerOutboxMessageId: testId(15514),
        notificationIds: [testId(15515), testId(15516)],
      },
      () => new Date('2026-09-28T12:00:00.000Z'),
    );
    expect(refused.response).toMatchObject({ state: 'RESULT_RECORDED' });
    const administrativeResult = await sql<{
      readonly origin: string;
      readonly competitive_snapshot_id: string | null;
    }>`
      select origin, competitive_snapshot_id from competition.results
      where result_id = ${resultId}::uuid
    `.execute(database);
    expect(administrativeResult.rows[0]).toEqual({
      origin: 'ADMINISTRATIVE_FORFEIT', competitive_snapshot_id: null,
    });
    await expect(readResult(
      database,
      resultId,
      refusedFixture.contender,
      new Date('2026-09-28T12:30:00.000Z'),
    )).resolves.toMatchObject({
      outcomeCode: 'FORFEIT',
      winnerUserId: refusedFixture.challenger,
      loserUserId: refusedFixture.contender,
      statusTransitionType: 'CONTENDER_TRANSFERRED',
      statusBefore: { contenderUserId: refusedFixture.contender, statusVersion: 2 },
      statusAfter: { contenderUserId: refusedFixture.challenger, statusVersion: 3 },
      viewerCanAppeal: true,
    });
    const lockedCompetition = await sql<{
      readonly contender_user_id: string;
      readonly status_lock_result_id: string;
    }>`
      select contender_user_id, status_lock_result_id
      from competition.competitions where competition_id = ${refusedFixture.competition}::uuid
    `.execute(database);
    expect(lockedCompetition.rows[0]).toEqual({
      contender_user_id: refusedFixture.challenger,
      status_lock_result_id: resultId,
    });

    await finalizeResult(
      database,
      {
        commandId: testId(15620), commandType: 'FINALIZE_RESULT',
        idempotencyKey: `finalize-admin-forfeit-${resultId}`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'Result', aggregateId: resultId,
        expectedVersion: 1, correlationId: testId(15621), causationId: testId(15503),
        requestId: testId(15622), source: 'scheduler', payloadVersion: 1,
        payload: { resultId },
      } satisfies CommandEnvelope<FinalizeResultPayload>,
      {
        eventId: testId(15623), auditId: testId(15624), outboxMessageId: testId(15625),
        challengeEventId: testId(15626), statusFinalizationId: testId(15627),
        statusEventId: testId(15628), notificationOutboxMessageId: testId(15629),
        notificationIds: [testId(15630), testId(15631)],
      },
      () => new Date('2026-09-30T12:00:00.000Z'),
    );
    const reconciliationCandidates = await readStatusQueueReconciliationCandidates(
      database,
      refusedFixture.competition,
    );
    expect(reconciliationCandidates).toEqual([{
      competitionId: refusedFixture.competition,
      queueEntryId: followerQueueEntryId,
      version: 1,
    }]);
    const reconfirmation = await requestStatusQueueReconfirmation(
      database,
      {
        commandId: testId(15632), commandType: 'REQUEST_STATUS_QUEUE_RECONFIRMATION',
        idempotencyKey: `holder-change-${followerQueueEntryId}-v1`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'ChallengeQueueEntry', aggregateId: followerQueueEntryId,
        expectedVersion: 1, correlationId: testId(15633), causationId: testId(15623),
        requestId: testId(15634), source: 'scheduler', payloadVersion: 1,
        payload: {
          competitionId: refusedFixture.competition,
          queueEntryId: followerQueueEntryId,
        },
      } satisfies CommandEnvelope<RequestStatusQueueReconfirmationPayload>,
      {
        eventId: testId(15635), auditId: testId(15636), outboxMessageId: testId(15637),
        timerOutboxMessageId: testId(15638), notificationOutboxMessageId: testId(15639),
        notificationId: testId(15640),
      },
      () => new Date('2026-09-30T12:00:00.000Z'),
    );
    expect(reconfirmation.response).toMatchObject({
      state: 'RECONFIRMATION_REQUIRED',
      boundHolderUserId: refusedFixture.challenger,
      submittedAt: originalSubmittedAt,
      reconfirmationDeadlineAt: '2026-10-01T12:00:00.000Z',
      position: 1,
      version: 2,
    });
    await expect(readStatusQueueActivationCandidate(
      database,
      refusedFixture.competition,
    )).resolves.toBeNull();
    const reconfirmed = await reconfirmStatusQueueEntry(
      database,
      {
        commandId: testId(15641), commandType: 'RECONFIRM_STATUS_QUEUE_ENTRY',
        idempotencyKey: `reconfirm-${followerQueueEntryId}-v2`,
        actor: { type: 'USER', id: refusedFixture.follower, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'ChallengeQueueEntry', aggregateId: followerQueueEntryId,
        expectedVersion: 2, correlationId: testId(15642), causationId: testId(15635),
        requestId: testId(15643), source: 'api', payloadVersion: 1,
        payload: { queueEntryId: followerQueueEntryId },
      } satisfies CommandEnvelope<ReconfirmStatusQueueEntryPayload>,
      {
        eventId: testId(15644), auditId: testId(15645), outboxMessageId: testId(15646),
        timerOutboxMessageId: testId(15647), notificationOutboxMessageId: testId(15648),
        notificationId: testId(15649),
      },
      () => new Date('2026-09-30T13:00:00.000Z'),
    );
    expect(reconfirmed.response).toMatchObject({
      state: 'WAITING',
      boundHolderUserId: refusedFixture.challenger,
      submittedAt: originalSubmittedAt,
      reconfirmationDeadlineAt: null,
      position: 1,
      version: 3,
    });
    await expect(readStatusQueueActivationCandidate(
      database,
      refusedFixture.competition,
    )).resolves.toEqual({
      competitionId: refusedFixture.competition,
      queueEntryId: followerQueueEntryId,
      version: 3,
    });

    await sql`
      update competition.competitions
      set contender_user_id = ${refusedFixture.contender}::uuid,
        status_version = status_version + 1, version = version + 1
      where competition_id = ${refusedFixture.competition}::uuid
    `.execute(database);
    await requestStatusQueueReconfirmation(
      database,
      {
        commandId: testId(15650), commandType: 'REQUEST_STATUS_QUEUE_RECONFIRMATION',
        idempotencyKey: `holder-change-${followerQueueEntryId}-v3`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'ChallengeQueueEntry', aggregateId: followerQueueEntryId,
        expectedVersion: 3, correlationId: testId(15651), causationId: testId(15644),
        requestId: testId(15652), source: 'scheduler', payloadVersion: 1,
        payload: {
          competitionId: refusedFixture.competition,
          queueEntryId: followerQueueEntryId,
        },
      } satisfies CommandEnvelope<RequestStatusQueueReconfirmationPayload>,
      {
        eventId: testId(15653), auditId: testId(15654), outboxMessageId: testId(15655),
        timerOutboxMessageId: testId(15656), notificationOutboxMessageId: testId(15657),
        notificationId: testId(15658),
      },
      () => new Date('2026-10-02T12:00:00.000Z'),
    );
    const expired = await expireStatusQueueReconfirmation(
      database,
      {
        commandId: testId(15659), commandType: 'EXPIRE_STATUS_QUEUE_RECONFIRMATION',
        idempotencyKey: `expire-reconfirmation-${followerQueueEntryId}-v4`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'ChallengeQueueEntry', aggregateId: followerQueueEntryId,
        expectedVersion: 4, correlationId: testId(15660), causationId: testId(15653),
        requestId: testId(15661), source: 'scheduler', payloadVersion: 1,
        payload: { queueEntryId: followerQueueEntryId },
      } satisfies CommandEnvelope<ExpireStatusQueueReconfirmationPayload>,
      {
        eventId: testId(15662), auditId: testId(15663), outboxMessageId: testId(15664),
        timerOutboxMessageId: testId(15665), notificationOutboxMessageId: testId(15666),
        notificationId: testId(15667),
      },
      () => new Date('2026-10-03T12:00:00.000Z'),
    );
    expect(expired.response).toMatchObject({
      state: 'EXPIRED',
      submittedAt: originalSubmittedAt,
      reconfirmationDeadlineAt: null,
      position: null,
      version: 5,
    });
  });

  it('[AC-053][AC-139] reminds Champion at 48h and serializes duplicate TITLE expiry jobs at 72h', async () => {
    const contender = testId(28000);
    const champion = testId(28001);
    const central = testId(28002);
    const venue = testId(28003);
    const community = testId(28004);
    const configuration = testId(28005);
    const competition = testId(28006);
    const challenge = testId(28007);
    const chat = testId(28008);
    const rulesetSnapshot = testId(28009);
    const challengeCreatedEvent = testId(28010);
    const createdAt = '2026-10-01T10:00:00.000Z';
    const deadlineAt = '2026-10-04T10:00:00.000Z';

    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values
        (${contender}::uuid, '+79992800000', ${createdAt}::timestamptz,
          '1995-01-01', 'ADULT', 'TITLE Contender', 'ACTIVE', 'ru-RU', 1,
          ${createdAt}::timestamptz),
        (${champion}::uuid, '+79992800001', ${createdAt}::timestamptz,
          '1994-01-01', 'ADULT', 'TITLE Champion', 'ACTIVE', 'ru-RU', 1,
          ${createdAt}::timestamptz),
        (${central}::uuid, '+79992800002', ${createdAt}::timestamptz,
          '1985-01-01', 'ADULT', 'TITLE Central', 'ACTIVE', 'ru-RU', 1,
          ${createdAt}::timestamptz)
    `.execute(database);
    await ensureLocalPilotCommunity(database, {
      venueId: venue,
      venueConfigurationId: testId(28011),
      communityId: community,
      communityConfigurationId: configuration,
      membershipId: testId(28012),
      centralGrantId: testId(28013),
      athleteUserId: contender,
      centralActorId: central,
      legalName: 'AC-053 TITLE Gym',
      venueDisplayName: 'AC-053 TITLE Gym',
      communityName: 'AC-053 TITLE Community',
      address: 'Москва',
      cityCode: 'MOSCOW',
      timezone: 'Europe/Moscow',
      contactPayload: {},
      occurredAt: createdAt,
    });
    await ensureLocalPilotCompetition(database, {
      competitionId: competition,
      communityId: community,
      centralActorId: central,
      occurredAt: createdAt,
      memberships: [
        { membershipId: testId(28012), userId: contender },
        { membershipId: testId(28014), userId: champion },
      ],
    });
    await sql`
      update competition.competitions
      set phase = 'RUNNING', champion_user_id = ${champion}::uuid,
        contender_user_id = ${contender}::uuid, status_version = 2,
        version = version + 1
      where competition_id = ${competition}::uuid
    `.execute(database);
    await sql`
      insert into social.chats (chat_id, scope, state, version, created_at, updated_at)
      values (${chat}::uuid, 'CHALLENGE_SERVICE', 'OPEN', 1,
        ${createdAt}::timestamptz, ${createdAt}::timestamptz)
    `.execute(database);
    await sql`
      insert into social.chat_participants (chat_id, user_id, joined_at)
      values (${chat}::uuid, ${contender}::uuid, ${createdAt}::timestamptz),
        (${chat}::uuid, ${champion}::uuid, ${createdAt}::timestamptz)
    `.execute(database);
    await sql`
      insert into competition.ruleset_snapshots (
        ruleset_snapshot_id, competition_id, community_configuration_id,
        ruleset_ref, ruleset_ack_mode, policy_version, created_at
      ) values (${rulesetSnapshot}::uuid, ${competition}::uuid, ${configuration}::uuid,
        'molokh-recommended-v1', 'IMPLICIT_ON_ACCEPT', 'challenge-mvp-v1',
        ${createdAt}::timestamptz)
    `.execute(database);
    await sql`
      insert into competition.challenges (
        challenge_id, competition_id, source_match_id, source_chat_id, service_chat_id,
        initiator_user_id, recipient_user_id, pair_low_id, pair_high_id,
        response_policy, stake, state, ruleset_snapshot_id, response_deadline_at,
        version, created_at, updated_at
      ) values (${challenge}::uuid, ${competition}::uuid, null, ${chat}::uuid, ${chat}::uuid,
        ${contender}::uuid, ${champion}::uuid,
        least(${contender}::uuid, ${champion}::uuid),
        greatest(${contender}::uuid, ${champion}::uuid),
        'MANDATORY', 'TITLE', 'AWAITING_RESPONSE', ${rulesetSnapshot}::uuid,
        ${deadlineAt}::timestamptz, 1, ${createdAt}::timestamptz, ${createdAt}::timestamptz)
    `.execute(database);
    await sql`
      insert into platform.domain_events (
        event_id, event_name, event_version, aggregate_type, aggregate_id,
        aggregate_version, transition_id, correlation_id, causation_id, actor_id,
        actor_type, actor_roles, actor_scope_ids, occurred_at, idempotency_key_hash,
        payload, metadata
      ) values (${challengeCreatedEvent}::uuid, 'ChallengeCreated', 1, 'Challenge',
        ${challenge}::uuid, 1, 'CH-01', ${testId(28015)}::uuid, null, ${contender}::uuid,
        'USER', '["ATHLETE"]'::jsonb, '{}'::uuid[], ${createdAt}::timestamptz,
        'ac-053-title-created',
        ${JSON.stringify({ challengeId: challenge, competitionId: competition,
          participants: [contender, champion], responsePolicy: 'MANDATORY', stake: 'TITLE',
          responseDeadlineAt: deadlineAt })}::jsonb,
        ${JSON.stringify({ policyVersion: 'challenge-mvp-v1', rulesetSnapshotId: rulesetSnapshot })}::jsonb)
    `.execute(database);

    const reminderNotificationId = testId(28016);
    await expect(projectPendingMandatoryChallengeReminder(
      database, challenge, 1, reminderNotificationId,
    )).resolves.toBe(1);
    await expect(projectPendingMandatoryChallengeReminder(
      database, challenge, 1, reminderNotificationId,
    )).resolves.toBe(0);
    const reminderFacts = await sql<{
      readonly recipient_user_id: string;
      readonly render_key: string;
      readonly deadline_at: Date;
      readonly channels: string[];
    }>`
      select notification.recipient_user_id, notification.render_key,
        notification.deadline_at,
        array_agg(intent.channel order by intent.channel)::text[] as channels
      from platform.notifications as notification
      join platform.notification_delivery_intents as intent
        on intent.notification_id = notification.notification_id
      where notification.notification_id = ${reminderNotificationId}::uuid
      group by notification.notification_id
    `.execute(database);
    expect(reminderFacts.rows[0]).toEqual({
      recipient_user_id: champion,
      render_key: 'challenge.mandatory-response-reminder-48h',
      deadline_at: new Date(deadlineAt),
      channels: ['PUSH'],
    });

    const primaryResultId = testId(28020);
    const command = {
      commandId: testId(28021), commandType: 'EXPIRE_MANDATORY_CHALLENGE',
      idempotencyKey: `challenge:${challenge}:expire-mandatory:v1`,
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: challenge, expectedVersion: 1,
      correlationId: testId(28015), causationId: challengeCreatedEvent,
      requestId: testId(28022), source: 'scheduler', payloadVersion: 1,
      payload: { challengeId: challenge },
    } satisfies CommandEnvelope<ExpireOptionalChallengePayload>;
    const effectIds = {
      eventId: testId(28023), auditId: testId(28024),
      outboxMessageId: testId(28025), notificationId: testId(28026),
      notificationOutboxMessageId: testId(28027), resultId: primaryResultId,
      resultEventId: testId(28028), statusTransitionId: testId(28029),
      statusEventId: testId(28030), cooldownId: testId(28031),
      cooldownEventId: testId(28032), timerOutboxMessageId: testId(28033),
      notificationIds: [testId(28034), testId(28035)] as const,
    };
    const duplicateCommand = {
      ...command,
      commandId: testId(28040),
      correlationId: testId(28041),
      requestId: testId(28042),
    } satisfies CommandEnvelope<ExpireOptionalChallengePayload>;
    const duplicateEffectIds = {
      eventId: testId(28043), auditId: testId(28044),
      outboxMessageId: testId(28045), notificationId: testId(28046),
      notificationOutboxMessageId: testId(28047), resultId: testId(28048),
      resultEventId: testId(28049), statusTransitionId: testId(28050),
      statusEventId: testId(28051), cooldownId: testId(28052),
      cooldownEventId: testId(28053), timerOutboxMessageId: testId(28054),
      notificationIds: [testId(28055), testId(28056)] as const,
    };
    await expect(expireOptionalChallenge(
      database, command, effectIds,
      () => new Date('2026-10-04T09:59:59.999Z'),
    )).rejects.toThrow('CHALLENGE_RESPONSE_NOT_DUE');
    const outcomes = await Promise.all([
      expireOptionalChallenge(database, command, effectIds, () => new Date(deadlineAt)),
      expireOptionalChallenge(
        database, duplicateCommand, duplicateEffectIds, () => new Date(deadlineAt),
      ),
    ]);
    expect(outcomes.map((outcome) => outcome.replayed).sort()).toEqual([false, true]);
    expect(outcomes[0].response).toEqual(outcomes[1].response);
    expect(outcomes[0].response).toMatchObject({ state: 'RESULT_RECORDED', version: 2 });
    expect(outcomes[0].eventId).toBe(outcomes[1].eventId);
    const committedIds = outcomes[0].replayed ? duplicateEffectIds : effectIds;
    const resultId = committedIds.resultId;
    const timeoutEventId = outcomes[0].eventId;
    await expect(projectPendingMandatoryChallengeReminder(
      database, challenge, 1, testId(28036),
    )).resolves.toBe(0);
    await expect(readResult(
      database, resultId, champion, new Date('2026-10-04T10:01:00.000Z'),
    )).resolves.toMatchObject({
      state: 'RECORDED',
      outcomeCode: 'FORFEIT',
      winnerUserId: contender,
      loserUserId: champion,
      appealDeadlineAt: '2026-10-06T10:00:00.000Z',
      statusTransitionType: 'TITLE_TRANSFERRED',
      statusBefore: { championUserId: champion, contenderUserId: contender, statusVersion: 2 },
      statusAfter: { championUserId: contender, contenderUserId: champion, statusVersion: 3 },
      viewerCanAppeal: true,
    });
    const facts = await sql<{
      readonly champion_user_id: string;
      readonly contender_user_id: string;
      readonly status_lock_result_id: string;
      readonly result_count: string;
      readonly transition_count: string;
      readonly cooldown_count: string;
      readonly timeout_event_count: string;
      readonly result_event_count: string;
      readonly audit_count: string;
      readonly result_outbox_count: string;
      readonly notification_outbox_count: string;
      readonly idempotency_count: string;
    }>`
      select competition.champion_user_id, competition.contender_user_id,
        competition.status_lock_result_id,
        (select count(*)::text from competition.results
          where challenge_id = ${challenge}::uuid) as result_count,
        (select count(*)::text from competition.status_transitions
          where source_result_id = ${resultId}::uuid) as transition_count,
        (select count(*)::text from competition.pair_cooldowns
          where source_result_id = ${resultId}::uuid) as cooldown_count,
        (select count(*)::text from platform.domain_events
          where aggregate_type = 'Challenge' and aggregate_id = ${challenge}::uuid
            and event_name = 'MandatoryChallengeExpired') as timeout_event_count,
        (select count(*)::text from platform.domain_events
          where aggregate_type = 'Result' and aggregate_id = ${resultId}::uuid
            and event_name = 'ResultRecorded') as result_event_count,
        (select count(*)::text from platform.audit_events
          where aggregate_type = 'Challenge' and aggregate_id = ${challenge}::uuid
            and action = 'MandatoryChallengeExpired') as audit_count,
        (select count(*)::text from platform.outbox_messages
          where event_id = ${committedIds.resultEventId}::uuid
            and topic = 'competition.result.recorded.v1') as result_outbox_count,
        (select count(*)::text from platform.outbox_messages
          where event_id = ${timeoutEventId}::uuid
            and topic = 'notification.in_app.v1') as notification_outbox_count,
        (select count(*)::text from platform.idempotency_records
          where event_id = ${timeoutEventId}::uuid) as idempotency_count
      from competition.competitions as competition
      where competition.competition_id = ${competition}::uuid
    `.execute(database);
    expect(facts.rows[0]).toEqual({
      champion_user_id: contender,
      contender_user_id: champion,
      status_lock_result_id: resultId,
      result_count: '1', transition_count: '1', cooldown_count: '1',
      timeout_event_count: '1', result_event_count: '1', audit_count: '1',
      result_outbox_count: '1', notification_outbox_count: '1', idempotency_count: '1',
    });
  });

  it('[AC-147] approves a Technical Correction without rewriting the recorded Result', async () => {
    const base = 43000;
    const fixture = await seedConfirmedTrainingForConversion(base);
    const rulesetSnapshotId = testId(43030);
    const challengeId = testId(43031);
    const snapshotId = testId(43032);
    const resultId = testId(43033);
    const transitionId = testId(43034);
    const cooldownId = testId(43035);
    const correctionId = testId(43036);
    const recordedAt = new Date('2026-10-03T12:00:00.000Z');

    await database.transaction().execute(async (transaction) => {
      await sql`set constraints all deferred`.execute(transaction);
      await sql`
        update competition.competitions
        set phase = 'RUNNING', champion_user_id = null,
          contender_user_id = ${fixture.athleteA}::uuid, status_version = 1,
          status_lock_result_id = null, version = 2,
          updated_at = '2026-10-03T10:00:00.000Z'
        where competition_id = ${fixture.competition}::uuid
      `.execute(transaction);
      await sql`
        insert into competition.ruleset_snapshots (
          ruleset_snapshot_id, competition_id, community_configuration_id,
          ruleset_ref, ruleset_ack_mode, policy_version, created_at
        ) values (
          ${rulesetSnapshotId}::uuid, ${fixture.competition}::uuid,
          ${testId(base + 15)}::uuid, 'pilot-boxing-v1', 'IMPLICIT_ON_ACCEPT',
          'challenge-mvp-v1', '2026-10-03T10:00:00.000Z'
        )
      `.execute(transaction);
      await sql`
        insert into competition.challenges (
          challenge_id, competition_id, source_match_id, source_chat_id, service_chat_id,
          initiator_user_id, recipient_user_id, pair_low_id, pair_high_id,
          response_policy, stake, state, ruleset_snapshot_id, response_deadline_at,
          accepted_at, scheduling_deadline_at, version, created_at, updated_at
        ) values (
          ${challengeId}::uuid, ${fixture.competition}::uuid, ${fixture.match}::uuid,
          ${fixture.chat}::uuid, ${fixture.chat}::uuid, ${fixture.athleteA}::uuid,
          ${fixture.athleteB}::uuid, least(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid),
          greatest(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid), 'MANDATORY',
          'CONTENDER', 'RESULT_PENDING', ${rulesetSnapshotId}::uuid,
          '2026-10-01T10:00:00.000Z', '2026-09-29T10:00:00.000Z',
          '2026-10-13T10:00:00.000Z', 4, '2026-09-29T10:00:00.000Z',
          '2026-10-03T10:00:00.000Z'
        )
      `.execute(transaction);
      await sql`
        insert into competition.challenge_participant_obligations (
          obligation_id, challenge_id, user_id, accepted_at
        ) values
          (${testId(43037)}::uuid, ${challengeId}::uuid, ${fixture.athleteA}::uuid,
            '2026-09-29T10:00:00.000Z'),
          (${testId(43038)}::uuid, ${challengeId}::uuid, ${fixture.athleteB}::uuid,
            '2026-09-29T10:00:00.000Z')
      `.execute(transaction);
      await sql`
        update scheduling.bookings
        set purpose = 'OFFICIAL_CHALLENGE', challenge_id = ${challengeId}::uuid
        where booking_id = ${fixture.booking}::uuid
      `.execute(transaction);
      await sql`
        update scheduling.sessions
        set purpose = 'OFFICIAL_CHALLENGE', challenge_id = ${challengeId}::uuid,
          state = 'ENDED', window_opened_at = '2026-10-03T10:00:00.000Z',
          actual_start_at = '2026-10-03T10:01:00.000Z',
          actual_end_at = '2026-10-03T10:55:00.000Z', version = 5,
          updated_at = '2026-10-03T10:55:00.000Z'
        where session_id = ${fixture.session}::uuid
      `.execute(transaction);
      await sql`
        insert into scheduling.session_competitive_snapshots (
          snapshot_id, session_id, challenge_id, competition_id, ruleset_snapshot_id,
          community_configuration_id, planned_stake, effective_stake, champion_user_id,
          contender_user_id, competition_status_version, venue_id, coach_user_id,
          pair_low_id, pair_high_id, scheduled_start_at, scheduled_end_at, created_at
        ) values (
          ${snapshotId}::uuid, ${fixture.session}::uuid, ${challengeId}::uuid,
          ${fixture.competition}::uuid, ${rulesetSnapshotId}::uuid,
          ${testId(base + 15)}::uuid, 'CONTENDER', 'CONTENDER', null,
          ${fixture.athleteA}::uuid, 1, ${fixture.venue}::uuid, ${fixture.coach}::uuid,
          least(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid),
          greatest(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid),
          ${fixture.scheduledStartAt}::timestamptz, '2026-10-01T11:00:00.000Z',
          '2026-10-03T10:00:00.000Z'
        )
      `.execute(transaction);
      await sql`
        insert into platform.domain_events (
          event_id, event_name, event_version, aggregate_type, aggregate_id,
          aggregate_version, transition_id, correlation_id, causation_id, actor_id,
          occurred_at, payload, idempotency_key_hash
        ) values (
          ${testId(43039)}::uuid, 'ChallengeResultPending', 1, 'Challenge',
          ${challengeId}::uuid, 4, 'CH-14', ${testId(43029)}::uuid, null,
          ${fixture.coach}::uuid, '2026-10-03T10:55:00.000Z',
          ${JSON.stringify({ challengeId, sessionId: fixture.session })}::jsonb,
          'fixture:ac-147:result-pending'
        )
      `.execute(transaction);
    });

    const recorded = await recordSessionResult(database, {
      commandId: testId(43040), commandType: 'RECORD_SESSION_RESULT',
      idempotencyKey: 'ac-147-record-result',
      actor: { type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community] },
      aggregateType: 'Challenge', aggregateId: challengeId, expectedVersion: 4,
      correlationId: testId(43041), causationId: testId(43039), requestId: testId(43042),
      source: 'api', payloadVersion: 1,
      payload: { challengeId, sessionId: fixture.session, outcomeCode: 'WIN_B',
        winnerUserId: null, reasonCode: null, comment: 'private-score-comment',
        methodCode: null, methodText: null, scorePayload: null, methodPayload: null },
    } satisfies CommandEnvelope<RecordSessionResultPayload>, {
      eventId: testId(43043), auditId: testId(43044), outboxMessageId: testId(43045),
      resultId, resultEventId: testId(43046), statusTransitionId: transitionId,
      statusEventId: testId(43047), cooldownId, cooldownEventId: testId(43048),
      timerOutboxMessageId: testId(43049), notificationOutboxMessageId: testId(43050),
      notificationIds: [testId(43051), testId(43052)],
    }, () => recordedAt);
    expect(recorded.response).toMatchObject({
      outcomeCode: 'WIN_B', recordedOutcomeCode: 'WIN_B',
      winnerUserId: fixture.athleteB, statusTransitionType: 'CONTENDER_TRANSFERRED',
    });
    const snapshotBefore = await sql<{ readonly document: unknown }>`
      select to_jsonb(snapshot) as document
      from scheduling.session_competitive_snapshots snapshot
      where snapshot_id = ${snapshotId}::uuid
    `.execute(database);

    const requested = await requestTechnicalCorrection(database, {
      commandId: testId(43060), commandType: 'REQUEST_TECHNICAL_CORRECTION',
      idempotencyKey: 'ac-147-request',
      actor: { type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community] },
      aggregateType: 'TechnicalCorrection', aggregateId: correctionId, expectedVersion: 0,
      correlationId: testId(43061), causationId: testId(43043), requestId: testId(43062),
      source: 'api', payloadVersion: 1,
      payload: { resultId, expectedResultVersion: 1,
        category: 'OUTCOME_OR_WINNER_ERROR', proposedOutcomeCode: 'WIN_A',
        proposedWinnerUserId: fixture.athleteA,
        internalReason: 'private-correction-evidence-description',
        evidenceReference: 'private-session-journal:ac-147' },
    } satisfies CommandEnvelope<RequestTechnicalCorrectionPayload>, {
      correctionId, eventId: testId(43063), auditId: testId(43064),
      outboxMessageId: testId(43065), notificationOutboxMessageId: testId(43066),
      notificationId: testId(43067),
    }, () => new Date('2026-10-03T12:05:00.000Z'));
    expect(requested.response).toMatchObject({ state: 'SUBMITTED', version: 1 });
    const reviewed = await startTechnicalCorrectionReview(database, {
      commandId: testId(43070), commandType: 'START_TECHNICAL_CORRECTION_REVIEW',
      idempotencyKey: 'ac-147-start-review',
      actor: { type: 'USER', id: fixture.central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'TechnicalCorrection', aggregateId: correctionId, expectedVersion: 1,
      correlationId: testId(43071), causationId: testId(43063), requestId: testId(43072),
      source: 'admin', payloadVersion: 1, payload: { correctionId },
    } satisfies CommandEnvelope<StartTechnicalCorrectionReviewPayload>, {
      eventId: testId(43073), auditId: testId(43074), outboxMessageId: testId(43075),
    }, () => new Date('2026-10-03T12:10:00.000Z'));
    expect(reviewed.response).toMatchObject({ state: 'UNDER_REVIEW', version: 2 });

    const approvalCommand = {
      commandId: testId(43080), commandType: 'APPROVE_TECHNICAL_CORRECTION',
      idempotencyKey: 'ac-147-approve',
      actor: { type: 'USER', id: fixture.central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'TechnicalCorrection', aggregateId: correctionId, expectedVersion: 2,
      correlationId: testId(43081), causationId: testId(43073), requestId: testId(43082),
      source: 'admin', payloadVersion: 1,
      payload: { correctionId, reason: '  Session journal confirms the opposite winner.  ' },
    } satisfies CommandEnvelope<ApproveTechnicalCorrectionPayload>;
    const approvalIds: TechnicalCorrectionApprovalEffectIds = {
      eventId: testId(43083), auditId: testId(43084), outboxMessageId: testId(43085),
      decisionId: testId(43086), statusCompensationId: testId(43087),
      statusTransitionId: testId(43088), statusEventId: testId(43089),
      cooldownId: testId(43090), cooldownEventId: testId(43091),
      notificationOutboxMessageId: testId(43092),
      notificationIds: [testId(43093), testId(43094), testId(43095)],
    };
    await expect(approveTechnicalCorrection(database, {
      ...approvalCommand, commandId: testId(43096), idempotencyKey: 'ac-147-approve-coach',
      actor: { type: 'USER', id: fixture.coach, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
    }, { ...approvalIds, eventId: testId(43097), auditId: testId(43098),
      outboxMessageId: testId(43099) })).rejects.toBeInstanceOf(ResultPermissionDeniedError);
    await expect(approveTechnicalCorrection(database, {
      ...approvalCommand, commandId: testId(43100), idempotencyKey: 'ac-147-approve-stale',
      expectedVersion: 1,
    }, { ...approvalIds, eventId: testId(43101), auditId: testId(43102),
      outboxMessageId: testId(43103) })).rejects.toBeInstanceOf(VersionConflictError);

    const approved = await approveTechnicalCorrection(
      database, approvalCommand, approvalIds,
      () => new Date('2026-10-03T12:15:00.000Z'),
    );
    expect(approved.response).toMatchObject({
      state: 'APPROVED', version: 3,
      decisionReason: 'Session journal confirms the opposite winner.',
      originalOutcomeCode: 'WIN_B', proposedOutcomeCode: 'WIN_A',
    });
    await expect(approveTechnicalCorrection(database, approvalCommand, approvalIds))
      .resolves.toMatchObject({ replayed: true, eventId: approvalIds.eventId,
        response: approved.response });

    await expect(readResult(database, resultId, fixture.athleteA)).resolves.toMatchObject({
      state: 'RECORDED', outcomeCode: 'WIN_A', recordedOutcomeCode: 'WIN_B',
      winnerUserId: fixture.athleteA, loserUserId: fixture.athleteB,
      recordedWinnerUserId: fixture.athleteB, recordedLoserUserId: fixture.athleteA,
      technicalCorrectionDecisionId: approvalIds.decisionId,
      statusTransitionType: 'CONTENDER_DEFENDED',
      statusBefore: { contenderUserId: fixture.athleteA, statusVersion: 1 },
      statusAfter: { contenderUserId: fixture.athleteA, statusVersion: 3 },
      viewerCanAppeal: false, viewerCanWaiveAppeal: false, version: 1,
    });
    await expect(readResult(
      database, resultId, fixture.athleteB, new Date('2026-10-03T12:15:00.000Z'),
    )).resolves.toMatchObject({
      viewerCanAppeal: true, viewerCanWaiveAppeal: true,
    });
    await expect(readResultTimerSnapshot(database, resultId)).resolves.toEqual({
      state: 'RECORDED', version: 1,
    });
    await expect(listTechnicalCorrectionsForCentral(database, fixture.central)).resolves.toEqual([]);
    await expect(listTechnicalCorrectionsForViewer(database, fixture.coach)).resolves.toEqual([
      expect.objectContaining({ state: 'APPROVED', decisionReason: null, version: 3 }),
    ]);

    const persisted = await sql<{
      readonly recorded_outcome_code: string;
      readonly recorded_winner_user_id: string;
      readonly result_version: string;
      readonly effective_outcome_code: string;
      readonly effective_winner_user_id: string;
      readonly contender_user_id: string;
      readonly status_version: string;
      readonly status_lock_result_id: string;
      readonly corrected_transition_type: string;
      readonly to_contender_user_id: string;
      readonly cooldown_count: string;
      readonly invalidated_at: Date | null;
      readonly appeal_count: string;
    }>`
      select result.recorded_outcome_code,
        result.winner_user_id as recorded_winner_user_id,
        result.version::text as result_version,
        decision.effective_outcome_code, decision.effective_winner_user_id,
        competition.contender_user_id, competition.status_version::text as status_version,
        competition.status_lock_result_id, compensation.corrected_transition_type,
        compensation.to_contender_user_id,
        (select count(*)::text from competition.pair_cooldowns item
          where item.source_result_id = result.result_id) as cooldown_count,
        cooldown.invalidated_at,
        (select count(*)::text from competition.appeals appeal
          where appeal.result_id = result.result_id) as appeal_count
      from competition.results result
      join competition.technical_correction_decisions decision
        on decision.result_id = result.result_id
      join competition.technical_correction_status_compensations compensation
        on compensation.decision_id = decision.decision_id
      join competition.challenges challenge on challenge.challenge_id = result.challenge_id
      join competition.competitions competition
        on competition.competition_id = challenge.competition_id
      join competition.pair_cooldowns cooldown on cooldown.cooldown_id = ${cooldownId}::uuid
      where result.result_id = ${resultId}::uuid
    `.execute(database);
    expect(persisted.rows[0]).toEqual({
      recorded_outcome_code: 'WIN_B', recorded_winner_user_id: fixture.athleteB,
      result_version: '1', effective_outcome_code: 'WIN_A',
      effective_winner_user_id: fixture.athleteA,
      contender_user_id: fixture.athleteA, status_version: '3',
      status_lock_result_id: resultId, corrected_transition_type: 'CONTENDER_DEFENDED',
      to_contender_user_id: fixture.athleteA, cooldown_count: '1',
      invalidated_at: null, appeal_count: '0',
    });
    const snapshotAfter = await sql<{ readonly document: unknown }>`
      select to_jsonb(snapshot) as document
      from scheduling.session_competitive_snapshots snapshot
      where snapshot_id = ${snapshotId}::uuid
    `.execute(database);
    expect(snapshotAfter.rows).toEqual(snapshotBefore.rows);

    const replay = await database.transaction().execute((transaction) =>
      replayCompetitionStatusExcludingResults({ transaction,
        sourceTransitionId: transitionId, excludedResultIds: [] }));
    expect(replay).toMatchObject({
      championUserId: null, contenderUserId: fixture.athleteA,
      journal: [expect.objectContaining({ resultId, outcomeCode: 'WIN_A',
        winnerUserId: fixture.athleteA })],
    });

    const effects = await sql<{
      readonly audit_metadata: unknown;
      readonly event_payload: unknown;
      readonly outbox_payload: unknown;
      readonly notification_payload: unknown;
      readonly decision_count: string;
      readonly compensation_count: string;
    }>`
      select audit.metadata as audit_metadata, event.payload as event_payload,
        outbox.payload as outbox_payload, notification.payload as notification_payload,
        (select count(*)::text from competition.technical_correction_decisions
          where result_id = ${resultId}::uuid) as decision_count,
        (select count(*)::text from competition.technical_correction_status_compensations
          where source_result_id = ${resultId}::uuid) as compensation_count
      from platform.audit_events audit, platform.domain_events event,
        platform.outbox_messages outbox, platform.outbox_messages notification
      where audit.audit_id = ${approvalIds.auditId}::uuid
        and event.event_id = ${approvalIds.eventId}::uuid
        and outbox.message_id = ${approvalIds.outboxMessageId}::uuid
        and notification.message_id = ${approvalIds.notificationOutboxMessageId}::uuid
    `.execute(database);
    expect(effects.rows[0]).toMatchObject({
      decision_count: '1', compensation_count: '1',
      audit_metadata: { decisionReason: 'Session journal confirms the opposite winner.' },
      notification_payload: { notifications: [
        { recipientUserId: fixture.coach, renderKey: 'result.technical-correction-approved' },
        { recipientUserId: fixture.athleteA, renderKey: 'result.technical-correction-approved' },
        { recipientUserId: fixture.athleteB, renderKey: 'result.technical-correction-approved' },
      ] },
    });
    expect(JSON.stringify({ event: effects.rows[0]?.event_payload,
      outbox: effects.rows[0]?.outbox_payload,
      notification: effects.rows[0]?.notification_payload }))
      .not.toMatch(/Session journal confirms|private-correction|private-session-journal|private-score/);
    await expect(sql`update competition.technical_correction_decisions
      set reason = 'changed' where decision_id = ${approvalIds.decisionId}::uuid`
      .execute(database)).rejects.toThrow(/append-only/);
  });

  it('[AC-150] annuls a provisional status Result with replayable tenure lineage', async () => {
    const base = 44000;
    const fixture = await seedConfirmedTrainingForConversion(base);
    const rulesetSnapshotId = testId(44030);
    const challengeId = testId(44031);
    const snapshotId = testId(44032);
    const resultId = testId(44033);
    const transitionId = testId(44034);
    const cooldownId = testId(44035);
    const queueEntryId = testId(44036);
    const appealId = testId(44060);
    const initialStatusEventId = testId(44028);
    const resultPendingEventId = testId(44029);
    const recordedAt = new Date('2026-10-04T12:00:00.000Z');

    await database.transaction().execute(async (transaction) => {
      await sql`set constraints all deferred`.execute(transaction);
      await sql`
        update competition.competitions
        set phase = 'RUNNING', champion_user_id = null,
          contender_user_id = ${fixture.athleteA}::uuid, status_version = 1,
          status_lock_result_id = null, version = 2,
          updated_at = '2026-10-04T09:00:00.000Z'
        where competition_id = ${fixture.competition}::uuid
      `.execute(transaction);
      await sql`
        insert into competition.ruleset_snapshots (
          ruleset_snapshot_id, competition_id, community_configuration_id,
          ruleset_ref, ruleset_ack_mode, policy_version, created_at
        ) values (
          ${rulesetSnapshotId}::uuid, ${fixture.competition}::uuid,
          ${testId(base + 15)}::uuid, 'pilot-boxing-v1', 'IMPLICIT_ON_ACCEPT',
          'challenge-mvp-v1', '2026-10-04T09:00:00.000Z'
        )
      `.execute(transaction);
      await sql`
        insert into competition.challenges (
          challenge_id, competition_id, source_match_id, source_chat_id, service_chat_id,
          initiator_user_id, recipient_user_id, pair_low_id, pair_high_id,
          response_policy, stake, state, ruleset_snapshot_id, response_deadline_at,
          accepted_at, scheduling_deadline_at, version, created_at, updated_at
        ) values (
          ${challengeId}::uuid, ${fixture.competition}::uuid, ${fixture.match}::uuid,
          ${fixture.chat}::uuid, ${fixture.chat}::uuid, ${fixture.athleteA}::uuid,
          ${fixture.athleteB}::uuid,
          least(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid),
          greatest(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid),
          'MANDATORY', 'CONTENDER', 'RESULT_PENDING', ${rulesetSnapshotId}::uuid,
          '2026-10-02T10:00:00.000Z', '2026-09-30T10:00:00.000Z',
          '2026-10-14T10:00:00.000Z', 4, '2026-09-30T10:00:00.000Z',
          '2026-10-04T10:55:00.000Z'
        )
      `.execute(transaction);
      await sql`
        insert into competition.challenge_participant_obligations (
          obligation_id, challenge_id, user_id, accepted_at
        ) values
          (${testId(44037)}::uuid, ${challengeId}::uuid, ${fixture.athleteA}::uuid,
            '2026-09-30T10:00:00.000Z'),
          (${testId(44038)}::uuid, ${challengeId}::uuid, ${fixture.athleteB}::uuid,
            '2026-09-30T10:00:00.000Z')
      `.execute(transaction);
      await sql`
        insert into competition.challenge_queue_entries (
          queue_entry_id, competition_id, initiator_user_id, target_status, kind, state,
          bound_holder_user_id, source_type, submitted_at, version, created_at, updated_at
        ) values (
          ${queueEntryId}::uuid, ${fixture.competition}::uuid,
          ${fixture.athleteB}::uuid, 'CHAMPION', 'DIRECT_STATUS', 'WAITING', null,
          'DIRECT', '2026-09-29T08:00:00.000Z', 1,
          '2026-09-29T08:00:00.000Z', '2026-09-29T08:00:00.000Z'
        )
      `.execute(transaction);
      await sql`
        update scheduling.bookings
        set purpose = 'OFFICIAL_CHALLENGE', challenge_id = ${challengeId}::uuid
        where booking_id = ${fixture.booking}::uuid
      `.execute(transaction);
      await sql`
        update scheduling.sessions
        set purpose = 'OFFICIAL_CHALLENGE', challenge_id = ${challengeId}::uuid,
          state = 'ENDED', window_opened_at = '2026-10-04T10:00:00.000Z',
          actual_start_at = '2026-10-04T10:01:00.000Z',
          actual_end_at = '2026-10-04T10:55:00.000Z', version = 5,
          updated_at = '2026-10-04T10:55:00.000Z'
        where session_id = ${fixture.session}::uuid
      `.execute(transaction);
      await sql`
        insert into scheduling.session_competitive_snapshots (
          snapshot_id, session_id, challenge_id, competition_id, ruleset_snapshot_id,
          community_configuration_id, planned_stake, effective_stake, champion_user_id,
          contender_user_id, competition_status_version, venue_id, coach_user_id,
          pair_low_id, pair_high_id, scheduled_start_at, scheduled_end_at, created_at
        ) values (
          ${snapshotId}::uuid, ${fixture.session}::uuid, ${challengeId}::uuid,
          ${fixture.competition}::uuid, ${rulesetSnapshotId}::uuid,
          ${testId(base + 15)}::uuid, 'CONTENDER', 'CONTENDER', null,
          ${fixture.athleteA}::uuid, 1, ${fixture.venue}::uuid, ${fixture.coach}::uuid,
          least(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid),
          greatest(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid),
          ${fixture.scheduledStartAt}::timestamptz, '2026-10-01T11:00:00.000Z',
          '2026-10-04T10:00:00.000Z'
        )
      `.execute(transaction);
      await sql`
        insert into platform.domain_events (
          event_id, event_name, event_version, aggregate_type, aggregate_id,
          aggregate_version, transition_id, correlation_id, causation_id, actor_id,
          occurred_at, payload, idempotency_key_hash
        ) values
          (${initialStatusEventId}::uuid, 'ContenderAssigned', 1, 'Competition',
            ${fixture.competition}::uuid, 2, 'ST-04', ${testId(44027)}::uuid, null,
            ${fixture.central}::uuid, '2026-10-04T09:00:00.000Z',
            ${JSON.stringify({
              before: { championUserId: null, contenderUserId: null, statusVersion: 0 },
              after: { championUserId: null,
                contenderUserId: fixture.athleteA, statusVersion: 1 },
              transitionType: 'CONTENDER_ASSIGNED', provisional: false,
            })}::jsonb, 'fixture:ac-150:initial-status'),
          (${resultPendingEventId}::uuid, 'ChallengeResultPending', 1, 'Challenge',
            ${challengeId}::uuid, 4, 'CH-14', ${testId(44026)}::uuid, null,
            ${fixture.coach}::uuid, '2026-10-04T10:55:00.000Z',
            ${JSON.stringify({ challengeId, sessionId: fixture.session })}::jsonb,
            'fixture:ac-150:result-pending')
      `.execute(transaction);
    });

    const recorded = await recordSessionResult(database, {
      commandId: testId(44040), commandType: 'RECORD_SESSION_RESULT',
      idempotencyKey: 'ac-150-record-result',
      actor: { type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community] },
      aggregateType: 'Challenge', aggregateId: challengeId, expectedVersion: 4,
      correlationId: testId(44041), causationId: resultPendingEventId,
      requestId: testId(44042), source: 'api', payloadVersion: 1,
      payload: { challengeId, sessionId: fixture.session, outcomeCode: 'WIN_B',
        winnerUserId: null, reasonCode: null, comment: 'private-annulled-score',
        methodCode: null, methodText: null, scorePayload: null, methodPayload: null },
    } satisfies CommandEnvelope<RecordSessionResultPayload>, {
      eventId: testId(44043), auditId: testId(44044), outboxMessageId: testId(44045),
      resultId, resultEventId: testId(44046), statusTransitionId: transitionId,
      statusEventId: testId(44047), cooldownId, cooldownEventId: testId(44048),
      timerOutboxMessageId: testId(44049), notificationOutboxMessageId: testId(44050),
      notificationIds: [testId(44051), testId(44052)],
    }, () => recordedAt);
    expect(recorded.response).toMatchObject({
      state: 'RECORDED', outcomeCode: 'WIN_B', winnerUserId: fixture.athleteB,
      statusTransitionType: 'CONTENDER_TRANSFERRED', provisional: true,
      statusBefore: { contenderUserId: fixture.athleteA, statusVersion: 1 },
      statusAfter: { contenderUserId: fixture.athleteB, statusVersion: 2 },
    });

    const canonicalBefore = await sql<{ readonly result_facts: unknown;
      readonly snapshot: unknown; readonly transition: unknown }>`
      select jsonb_build_object(
          'recordedOutcomeCode', result.recorded_outcome_code,
          'winnerUserId', result.winner_user_id,
          'loserUserId', result.loser_user_id,
          'competitiveSnapshotId', result.competitive_snapshot_id,
          'preStatusSnapshot', result.pre_status_snapshot,
          'comment', result.comment,
          'recordedAt', result.recorded_at,
          'appealDeadlineAt', result.appeal_deadline_at
        ) as result_facts,
        to_jsonb(snapshot) as snapshot, to_jsonb(transition) as transition
      from competition.results result
      join scheduling.session_competitive_snapshots snapshot
        on snapshot.snapshot_id = result.competitive_snapshot_id
      join competition.status_transitions transition
        on transition.source_result_id = result.result_id
      where result.result_id = ${resultId}::uuid
    `.execute(database);
    const projectionBeforeAppeal = await readCompetitionProjection(
      database, fixture.competition,
    );
    expect(projectionBeforeAppeal).toMatchObject({
      championUserId: null, contenderUserId: fixture.athleteB,
      statusVersion: 2, statusLockResultId: resultId,
      tenures: [
        { userId: fixture.athleteA, status: 'CONTENDER', provisional: false,
          endedByEventId: testId(44047) },
        { userId: fixture.athleteB, status: 'CONTENDER', provisional: true, endedAt: null },
      ],
      cooldowns: [{ cooldownId, sourceResultId: resultId, invalidatedAt: null }],
    });

    const submitted = await submitResultAppeal(database, {
      commandId: testId(44061), commandType: 'SUBMIT_RESULT_APPEAL',
      idempotencyKey: 'ac-150-submit-appeal',
      actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Result', aggregateId: resultId, expectedVersion: 1,
      correlationId: testId(44062), causationId: testId(44046), requestId: testId(44063),
      source: 'api', payloadVersion: 1,
      payload: { resultId, reasonCode: 'INVALID_CONTEXT',
        statement: 'Прошу аннулировать спорный официальный Result.' },
    } satisfies CommandEnvelope<SubmitResultAppealPayload>, {
      eventId: testId(44064), auditId: testId(44065), outboxMessageId: testId(44066),
      appealId, appealEventId: testId(44067), challengeEventId: testId(44068),
      notificationOutboxMessageId: testId(44069),
      notificationIds: [testId(44070), testId(44071)],
    }, () => new Date('2026-10-04T12:05:00.000Z'));
    expect(submitted.response).toMatchObject({ state: 'UNDER_APPEAL', version: 2 });

    const review = await startAppealReview(database, {
      commandId: testId(44072), commandType: 'START_APPEAL_REVIEW',
      idempotencyKey: 'ac-150-start-review',
      actor: { type: 'USER', id: fixture.central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'Appeal', aggregateId: appealId, expectedVersion: 1,
      correlationId: testId(44073), causationId: testId(44067), requestId: testId(44074),
      source: 'admin', payloadVersion: 1, payload: { appealId },
    } satisfies CommandEnvelope<StartAppealReviewPayload>, {
      eventId: testId(44075), auditId: testId(44076), outboxMessageId: testId(44077),
      notificationOutboxMessageId: testId(44078),
      notificationIds: [testId(44079), testId(44080), testId(44081)],
    }, () => new Date('2026-10-04T12:10:00.000Z'));
    expect(review.response).toMatchObject({
      state: 'UNDER_REVIEW', assignedReviewerUserId: fixture.central, version: 2,
    });

    const privateReason = 'private-central-annul-evidence-reference';
    const decisionCommand = {
      commandId: testId(44082), commandType: 'DECIDE_APPEAL',
      idempotencyKey: 'ac-150-annul',
      actor: { type: 'USER', id: fixture.central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'Appeal', aggregateId: appealId, expectedVersion: 2,
      correlationId: testId(44083), causationId: testId(44075), requestId: testId(44084),
      source: 'admin', payloadVersion: 1,
      payload: { appealId, decision: 'ANNUL', reason: privateReason },
    } satisfies CommandEnvelope<DecideAppealPayload>;
    const decisionIds = {
      eventId: testId(44085), auditId: testId(44086), outboxMessageId: testId(44087),
      decisionId: testId(44088), resultEventId: testId(44089),
      challengeEventId: testId(44090), statusCompensationId: testId(44091),
      statusEventId: testId(44092), cooldownEventId: testId(44093),
      notificationOutboxMessageId: testId(44094),
      notificationIds: [testId(44095), testId(44096), testId(44097)],
    };
    await expect(decideAppeal(database, {
      ...decisionCommand, commandId: testId(44110), idempotencyKey: 'ac-150-annul-coach',
      actor: { type: 'USER', id: fixture.coach, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
    }, { ...decisionIds, eventId: testId(44111), auditId: testId(44112),
      outboxMessageId: testId(44113) })).rejects.toBeInstanceOf(ResultPermissionDeniedError);
    await expect(decideAppeal(database, {
      ...decisionCommand, commandId: testId(44114), idempotencyKey: 'ac-150-annul-stale',
      expectedVersion: 1,
    }, { ...decisionIds, eventId: testId(44115), auditId: testId(44116),
      outboxMessageId: testId(44117) })).rejects.toBeInstanceOf(VersionConflictError);

    const decided = await decideAppeal(
      database, decisionCommand, decisionIds,
      () => new Date('2026-10-04T12:20:00.000Z'),
    );
    expect(decided.response).toMatchObject({
      appealId, state: 'DECIDED_ANNULLED', decision: 'ANNUL',
      resultState: 'ANNULLED', recordedOutcomeCode: 'WIN_B',
      effectiveOutcomeCode: null, recordedWinnerUserId: fixture.athleteB,
      effectiveWinnerUserId: null, version: 3,
    });
    await expect(decideAppeal(database, decisionCommand, decisionIds))
      .resolves.toMatchObject({ replayed: true, eventId: decisionIds.eventId,
        response: decided.response });
    await expect(readResult(database, resultId, fixture.athleteA)).resolves.toMatchObject({
      state: 'ANNULLED', recordedOutcomeCode: 'WIN_B', recordedWinnerUserId: fixture.athleteB,
      winnerUserId: null, loserUserId: null, decision: 'ANNUL', provisional: false,
    });

    const canonicalAfter = await sql<{ readonly result_facts: unknown;
      readonly snapshot: unknown; readonly transition: unknown }>`
      select jsonb_build_object(
          'recordedOutcomeCode', result.recorded_outcome_code,
          'winnerUserId', result.winner_user_id,
          'loserUserId', result.loser_user_id,
          'competitiveSnapshotId', result.competitive_snapshot_id,
          'preStatusSnapshot', result.pre_status_snapshot,
          'comment', result.comment,
          'recordedAt', result.recorded_at,
          'appealDeadlineAt', result.appeal_deadline_at
        ) as result_facts,
        to_jsonb(snapshot) as snapshot, to_jsonb(transition) as transition
      from competition.results result
      join scheduling.session_competitive_snapshots snapshot
        on snapshot.snapshot_id = result.competitive_snapshot_id
      join competition.status_transitions transition
        on transition.source_result_id = result.result_id
      where result.result_id = ${resultId}::uuid
    `.execute(database);
    expect(canonicalAfter.rows).toEqual(canonicalBefore.rows);

    const facts = await sql<{
      readonly result_state: string; readonly result_version: string;
      readonly challenge_state: string; readonly challenge_version: string;
      readonly champion_user_id: string | null; readonly contender_user_id: string;
      readonly status_version: string; readonly status_lock_result_id: string | null;
      readonly obligation_count: string; readonly released_obligation_count: string;
      readonly transition_count: string; readonly compensation_count: string;
      readonly compensation_mode: string; readonly corrected_transition_type: string | null;
      readonly to_contender_user_id: string; readonly cooldown_count: string;
      readonly cooldown_invalidated_at: Date; readonly queue_state: string;
      readonly queue_submitted_at: Date; readonly decision_count: string;
    }>`
      select result.state as result_state, result.version::text as result_version,
        challenge.state as challenge_state, challenge.version::text as challenge_version,
        competition.champion_user_id, competition.contender_user_id,
        competition.status_version::text as status_version,
        competition.status_lock_result_id,
        (select count(*)::text from competition.challenge_participant_obligations obligation
          where obligation.challenge_id = challenge.challenge_id) as obligation_count,
        (select count(*)::text from competition.challenge_participant_obligations obligation
          where obligation.challenge_id = challenge.challenge_id
            and obligation.released_at is not null) as released_obligation_count,
        (select count(*)::text from competition.status_transitions item
          where item.source_result_id = result.result_id) as transition_count,
        (select count(*)::text from competition.status_transition_compensations item
          where item.source_result_id = result.result_id) as compensation_count,
        compensation.compensation_mode, compensation.corrected_transition_type,
        compensation.to_contender_user_id,
        (select count(*)::text from competition.pair_cooldowns item
          where item.source_result_id = result.result_id) as cooldown_count,
        cooldown.invalidated_at as cooldown_invalidated_at,
        queue.state as queue_state, queue.submitted_at as queue_submitted_at,
        (select count(*)::text from competition.appeal_decisions item
          where item.result_id = result.result_id) as decision_count
      from competition.results result
      join competition.challenges challenge on challenge.challenge_id = result.challenge_id
      join competition.competitions competition
        on competition.competition_id = challenge.competition_id
      join competition.status_transition_compensations compensation
        on compensation.source_result_id = result.result_id
      join competition.pair_cooldowns cooldown on cooldown.source_result_id = result.result_id
      join competition.challenge_queue_entries queue
        on queue.queue_entry_id = ${queueEntryId}::uuid
      where result.result_id = ${resultId}::uuid
    `.execute(database);
    expect(facts.rows[0]).toEqual({
      result_state: 'ANNULLED', result_version: '3',
      challenge_state: 'COMPLETED', challenge_version: '7',
      champion_user_id: null, contender_user_id: fixture.athleteA,
      status_version: '3', status_lock_result_id: null,
      obligation_count: '2', released_obligation_count: '2',
      transition_count: '1', compensation_count: '1',
      compensation_mode: 'RESTORE_PRE_RESULT', corrected_transition_type: null,
      to_contender_user_id: fixture.athleteA, cooldown_count: '1',
      cooldown_invalidated_at: new Date('2026-10-04T12:20:00.000Z'),
      queue_state: 'WAITING', queue_submitted_at: new Date('2026-09-29T08:00:00.000Z'),
      decision_count: '1',
    });

    const projectionAfterAnnul = await readCompetitionProjection(database, fixture.competition);
    const replayAfterAnnul = await replayCompetitionProjection(database, fixture.competition);
    expect(projectionAfterAnnul).toMatchObject({
      championUserId: null, contenderUserId: fixture.athleteA,
      statusVersion: 3, statusLockResultId: null,
      tenures: [
        { userId: fixture.athleteA, status: 'CONTENDER', provisional: false,
          endedByEventId: testId(44047) },
        { userId: fixture.athleteB, status: 'CONTENDER', provisional: true,
          endedByEventId: decisionIds.statusEventId, endReasonCode: 'StatusTransitionRolledBack' },
        { userId: fixture.athleteA, status: 'CONTENDER', provisional: false, endedAt: null,
          startedByEventId: decisionIds.statusEventId,
          compensatesTenureId: projectionBeforeAppeal?.tenures[1]?.tenureId },
      ],
      cooldowns: [{ cooldownId, sourceResultId: resultId,
        invalidatedAt: '2026-10-04T12:20:00.000Z' }],
    });
    expect(replayAfterAnnul).toEqual(projectionAfterAnnul);
    const stableProjection = projectionAfterAnnul!;

    await sql`
      update competition.competitions
      set champion_user_id = null, contender_user_id = null,
        status_version = 0, status_lock_result_id = null
      where competition_id = ${fixture.competition}::uuid
    `.execute(database);
    await sql`delete from competition.pair_cooldowns
      where competition_id = ${fixture.competition}::uuid`.execute(database);
    const rebuilt = await rebuildCompetitionProjection(database, {
      commandId: testId(44100), commandType: 'REBUILD_COMPETITION_PROJECTION',
      idempotencyKey: 'ac-150-rebuild-after-annul',
      actor: { type: 'USER', id: fixture.central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'Competition', aggregateId: fixture.competition, expectedVersion: 4,
      correlationId: testId(44101), causationId: decisionIds.statusEventId,
      requestId: testId(44102), source: 'admin', payloadVersion: 1,
      payload: { competitionId: fixture.competition,
        reason: 'private-ac-150-rebuild-verification' },
    } satisfies CommandEnvelope<RebuildCompetitionProjectionPayload>, {
      eventId: testId(44103), auditId: testId(44104), outboxMessageId: testId(44105),
    }, () => new Date('2026-10-04T12:30:00.000Z'));
    expect(rebuilt.response).toMatchObject({
      championUserId: stableProjection.championUserId,
      contenderUserId: stableProjection.contenderUserId,
      statusVersion: stableProjection.statusVersion,
      statusLockResultId: stableProjection.statusLockResultId,
      tenures: stableProjection.tenures,
      cooldowns: stableProjection.cooldowns,
      projectionHash: stableProjection.projectionHash,
    });
    await expect(rebuildCompetitionProjection(database, {
      commandId: testId(44100), commandType: 'REBUILD_COMPETITION_PROJECTION',
      idempotencyKey: 'ac-150-rebuild-after-annul',
      actor: { type: 'USER', id: fixture.central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'Competition', aggregateId: fixture.competition, expectedVersion: 4,
      correlationId: testId(44101), causationId: decisionIds.statusEventId,
      requestId: testId(44102), source: 'admin', payloadVersion: 1,
      payload: { competitionId: fixture.competition,
        reason: 'private-ac-150-rebuild-verification' },
    }, { eventId: testId(44103), auditId: testId(44104), outboxMessageId: testId(44105) }))
      .resolves.toMatchObject({ replayed: true, eventId: testId(44103) });
    const afterRebuild = await readCompetitionProjection(database, fixture.competition);
    expect(afterRebuild).toMatchObject({
      championUserId: stableProjection.championUserId,
      contenderUserId: stableProjection.contenderUserId,
      statusVersion: stableProjection.statusVersion,
      statusLockResultId: stableProjection.statusLockResultId,
      tenures: stableProjection.tenures,
      cooldowns: stableProjection.cooldowns,
      projectionHash: stableProjection.projectionHash,
    });

    const effects = await sql<{ readonly audit_metadata: unknown;
      readonly public_documents: unknown; readonly decision_events: string;
      readonly compensation_events: string; readonly cooldown_events: string;
      readonly notification_count: string }>`
      select audit.metadata as audit_metadata,
        jsonb_build_array(decision_event.payload, result_event.payload,
          status_event.payload, cooldown_event.payload, outbox.payload, notification.payload)
          as public_documents,
        (select count(*)::text from platform.domain_events
          where event_id = ${decisionIds.eventId}::uuid) as decision_events,
        (select count(*)::text from platform.domain_events
          where event_id = ${decisionIds.statusEventId}::uuid) as compensation_events,
        (select count(*)::text from platform.domain_events
          where event_id = ${decisionIds.cooldownEventId}::uuid) as cooldown_events,
        jsonb_array_length(notification.payload -> 'notifications')::text
          as notification_count
      from platform.audit_events audit, platform.domain_events decision_event,
        platform.domain_events result_event, platform.domain_events status_event,
        platform.domain_events cooldown_event, platform.outbox_messages outbox,
        platform.outbox_messages notification
      where audit.audit_id = ${decisionIds.auditId}::uuid
        and decision_event.event_id = ${decisionIds.eventId}::uuid
        and result_event.event_id = ${decisionIds.resultEventId}::uuid
        and status_event.event_id = ${decisionIds.statusEventId}::uuid
        and cooldown_event.event_id = ${decisionIds.cooldownEventId}::uuid
        and outbox.message_id = ${decisionIds.outboxMessageId}::uuid
        and notification.message_id = ${decisionIds.notificationOutboxMessageId}::uuid
    `.execute(database);
    expect(effects.rows[0]).toMatchObject({
      audit_metadata: { reason: privateReason }, decision_events: '1',
      compensation_events: '1', cooldown_events: '1', notification_count: '3',
    });
    expect(JSON.stringify(effects.rows[0]?.public_documents))
      .not.toMatch(/private-central-annul|private-annulled-score/);
    await expect(sql`update competition.status_transition_compensations
      set compensation_mode = 'RESTORE_AND_REPEAT'
      where source_result_id = ${resultId}::uuid`.execute(database)).rejects.toThrow(/append-only/);
  });

  it('[AC-140] serializes competing status Results on the Competition row lock', async () => {
    const base = 41000;
    const fixture = await seedConfirmedTrainingForConversion(base);
    const athleteC = testId(41030);
    const secondChat = testId(41033);
    const secondMatch = testId(41034);
    const secondSlot = testId(41035);
    const secondBooking = testId(41036);
    const secondSession = testId(41037);
    const rulesetSnapshot = testId(41038);
    const titleChallenge = testId(41039);
    const contenderChallenge = testId(41040);
    const titleSnapshot = testId(41041);
    const contenderSnapshot = testId(41042);
    const occurredAt = '2026-10-01T14:00:00.000Z';

    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values (
        ${athleteC}::uuid, '+79994100030', ${occurredAt}::timestamptz,
        '1996-01-01', 'ADULT', 'Concurrent Challenger', 'ACTIVE', 'ru-RU', 1,
        ${occurredAt}::timestamptz
      )
    `.execute(database);
    await sql`
      insert into identity.account_verifications (
        verification_id, user_id, state, method, moderation_checklist_version,
        is_current, verified_at, decided_by, decision_reason, version
      ) values (
        ${testId(41031)}::uuid, ${athleteC}::uuid, 'VERIFIED', 'CENTRAL_MODERATION',
        'identity-mvp-v1', true, ${occurredAt}::timestamptz, ${fixture.coach}::uuid,
        'TEST_APPROVED', 1
      )
    `.execute(database);
    await sql`
      insert into community.community_memberships (
        membership_id, community_id, user_id, age_division, state,
        competition_enabled, join_path, decided_at, decided_by, version
      ) values (
        ${testId(41032)}::uuid, ${fixture.community}::uuid, ${athleteC}::uuid,
        'ADULT', 'ACTIVE', true, 'INVITE', ${occurredAt}::timestamptz,
        ${fixture.coach}::uuid, 1
      )
    `.execute(database);
    await sql`
      update competition.competitions
      set phase = 'RUNNING', champion_user_id = ${fixture.athleteB}::uuid,
        contender_user_id = ${fixture.athleteA}::uuid, status_version = 1,
        status_lock_result_id = null, version = 2, updated_at = ${occurredAt}::timestamptz
      where competition_id = ${fixture.competition}::uuid
    `.execute(database);
    await sql`
      insert into social.chats (chat_id, scope, state, version, created_at, updated_at)
      values (${secondChat}::uuid, 'PERSONAL_MATCH', 'OPEN', 1,
        ${occurredAt}::timestamptz, ${occurredAt}::timestamptz)
    `.execute(database);
    await sql`
      insert into social.chat_participants (chat_id, user_id, joined_at) values
        (${secondChat}::uuid, ${fixture.athleteA}::uuid, ${occurredAt}::timestamptz),
        (${secondChat}::uuid, ${athleteC}::uuid, ${occurredAt}::timestamptz)
    `.execute(database);
    await sql`
      insert into social.matches (
        match_id, pair_low_id, pair_high_id, state, chat_id,
        last_activity_at, version, created_at, updated_at
      ) values (
        ${secondMatch}::uuid, least(${fixture.athleteA}::uuid, ${athleteC}::uuid),
        greatest(${fixture.athleteA}::uuid, ${athleteC}::uuid), 'ACTIVE',
        ${secondChat}::uuid, ${occurredAt}::timestamptz, 1,
        ${occurredAt}::timestamptz, ${occurredAt}::timestamptz
      )
    `.execute(database);

    await database.transaction().execute(async (transaction) => {
      await sql`set constraints all deferred`.execute(transaction);
      await sql`
        insert into competition.ruleset_snapshots (
          ruleset_snapshot_id, competition_id, community_configuration_id,
          ruleset_ref, ruleset_ack_mode, policy_version, created_at
        ) values (
          ${rulesetSnapshot}::uuid, ${fixture.competition}::uuid, ${testId(base + 15)}::uuid,
          'pilot-boxing-v1', 'IMPLICIT_ON_ACCEPT', 'challenge-mvp-v1',
          ${occurredAt}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into competition.challenges (
          challenge_id, competition_id, source_match_id, source_chat_id, service_chat_id,
          initiator_user_id, recipient_user_id, pair_low_id, pair_high_id,
          response_policy, stake, state, ruleset_snapshot_id, response_deadline_at,
          accepted_at, scheduling_deadline_at, version, created_at, updated_at
        ) values
          (${titleChallenge}::uuid, ${fixture.competition}::uuid, ${testId(base + 8)}::uuid,
            ${testId(base + 7)}::uuid, ${testId(base + 7)}::uuid,
            ${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid,
            least(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid),
            greatest(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid),
            'MANDATORY', 'TITLE', 'RESULT_PENDING', ${rulesetSnapshot}::uuid,
            '2026-09-29T10:00:00.000Z', '2026-09-27T10:00:00.000Z',
            '2026-10-11T10:00:00.000Z', 4, ${occurredAt}::timestamptz,
            ${occurredAt}::timestamptz),
          (${contenderChallenge}::uuid, ${fixture.competition}::uuid, ${secondMatch}::uuid,
            ${secondChat}::uuid, ${secondChat}::uuid, ${fixture.athleteA}::uuid,
            ${athleteC}::uuid, least(${fixture.athleteA}::uuid, ${athleteC}::uuid),
            greatest(${fixture.athleteA}::uuid, ${athleteC}::uuid),
            'MANDATORY', 'CONTENDER', 'RESULT_PENDING', ${rulesetSnapshot}::uuid,
            '2026-09-29T12:00:00.000Z', '2026-09-27T12:00:00.000Z',
            '2026-10-11T12:00:00.000Z', 4, ${occurredAt}::timestamptz,
            ${occurredAt}::timestamptz)
      `.execute(transaction);
      await sql`
        update scheduling.bookings
        set purpose = 'OFFICIAL_CHALLENGE', challenge_id = ${titleChallenge}::uuid
        where booking_id = ${fixture.booking}::uuid
      `.execute(transaction);
      await sql`
        update scheduling.sessions
        set purpose = 'OFFICIAL_CHALLENGE', challenge_id = ${titleChallenge}::uuid,
          state = 'ENDED', window_opened_at = '2026-10-01T10:00:00.000Z',
          actual_start_at = '2026-10-01T10:01:00.000Z',
          actual_end_at = '2026-10-01T10:55:00.000Z', version = 5,
          updated_at = ${occurredAt}::timestamptz
        where session_id = ${fixture.session}::uuid
      `.execute(transaction);
      await sql`
        insert into scheduling.slots (
          slot_id, venue_id, coach_user_id, start_at, end_at, slot_type, state,
          price_text, cancellation_terms_text, commercial_version, booking_id,
          published_by, version, created_at, updated_at
        ) values (
          ${secondSlot}::uuid, ${fixture.venue}::uuid, ${fixture.coach}::uuid,
          '2026-10-01T12:00:00.000Z', '2026-10-01T13:00:00.000Z', 'PERSONAL',
          'BOOKED', 'Оплата залу', 'Условия зала', 1, ${secondBooking}::uuid,
          ${fixture.coach}::uuid, 2, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into scheduling.bookings (
          booking_id, chat_id, match_id, slot_id, pair_low_id, pair_high_id,
          purpose, state, initiated_by, selected_by_low_at, selected_by_high_at,
          selection_expires_at, host_confirmation_deadline_at, commercial_terms_snapshot,
          host_confirmed_by, host_confirmed_at, version, created_at, updated_at, challenge_id
        ) values (
          ${secondBooking}::uuid, ${secondChat}::uuid, ${secondMatch}::uuid,
          ${secondSlot}::uuid, least(${fixture.athleteA}::uuid, ${athleteC}::uuid),
          greatest(${fixture.athleteA}::uuid, ${athleteC}::uuid), 'OFFICIAL_CHALLENGE',
          'CONFIRMED_PAIR', ${fixture.athleteA}::uuid, ${occurredAt}::timestamptz,
          ${occurredAt}::timestamptz, '2026-09-27T13:00:00.000Z',
          '2026-09-29T12:00:00.000Z', '{}'::jsonb, ${fixture.coach}::uuid,
          ${occurredAt}::timestamptz, 3, ${occurredAt}::timestamptz,
          ${occurredAt}::timestamptz, ${contenderChallenge}::uuid
        )
      `.execute(transaction);
      await sql`
        insert into scheduling.sessions (
          session_id, booking_id, venue_id, coach_user_id, pair_low_id, pair_high_id,
          purpose, state, scheduled_start_at, scheduled_end_at, commercial_terms_snapshot,
          version, created_at, updated_at, window_opened_at, actual_start_at,
          actual_end_at, challenge_id
        ) values (
          ${secondSession}::uuid, ${secondBooking}::uuid, ${fixture.venue}::uuid,
          ${fixture.coach}::uuid, least(${fixture.athleteA}::uuid, ${athleteC}::uuid),
          greatest(${fixture.athleteA}::uuid, ${athleteC}::uuid), 'OFFICIAL_CHALLENGE',
          'ENDED', '2026-10-01T12:00:00.000Z', '2026-10-01T13:00:00.000Z',
          '{}'::jsonb, 5, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz,
          '2026-10-01T12:00:00.000Z', '2026-10-01T12:01:00.000Z',
          '2026-10-01T12:55:00.000Z', ${contenderChallenge}::uuid
        )
      `.execute(transaction);
      await sql`
        insert into scheduling.session_competitive_snapshots (
          snapshot_id, session_id, challenge_id, competition_id, ruleset_snapshot_id,
          community_configuration_id, planned_stake, effective_stake, champion_user_id,
          contender_user_id, competition_status_version, venue_id, coach_user_id,
          pair_low_id, pair_high_id, scheduled_start_at, scheduled_end_at, created_at
        ) values
          (${titleSnapshot}::uuid, ${fixture.session}::uuid, ${titleChallenge}::uuid,
            ${fixture.competition}::uuid, ${rulesetSnapshot}::uuid, ${testId(base + 15)}::uuid,
            'TITLE', 'TITLE', ${fixture.athleteB}::uuid, ${fixture.athleteA}::uuid, 1,
            ${fixture.venue}::uuid, ${fixture.coach}::uuid,
            least(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid),
            greatest(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid),
            '2026-10-01T10:00:00.000Z', '2026-10-01T11:00:00.000Z',
            ${occurredAt}::timestamptz),
          (${contenderSnapshot}::uuid, ${secondSession}::uuid, ${contenderChallenge}::uuid,
            ${fixture.competition}::uuid, ${rulesetSnapshot}::uuid, ${testId(base + 15)}::uuid,
            'CONTENDER', 'CONTENDER', ${fixture.athleteB}::uuid,
            ${fixture.athleteA}::uuid, 1, ${fixture.venue}::uuid,
            ${fixture.coach}::uuid, least(${fixture.athleteA}::uuid, ${athleteC}::uuid),
            greatest(${fixture.athleteA}::uuid, ${athleteC}::uuid),
            '2026-10-01T12:00:00.000Z', '2026-10-01T13:00:00.000Z',
            ${occurredAt}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into platform.domain_events (
          event_id, event_name, event_version, aggregate_type, aggregate_id,
          aggregate_version, transition_id, correlation_id, causation_id, actor_id,
          occurred_at, payload, idempotency_key_hash
        ) values
          (${testId(41043)}::uuid, 'ChallengeResultPending', 1, 'Challenge',
            ${titleChallenge}::uuid, 4, 'CH-14', ${testId(41045)}::uuid, null,
            ${fixture.coach}::uuid, ${occurredAt}::timestamptz,
            ${JSON.stringify({ challengeId: titleChallenge, sessionId: fixture.session })}::jsonb,
            'fixture:ac-140:title'),
          (${testId(41044)}::uuid, 'ChallengeResultPending', 1, 'Challenge',
            ${contenderChallenge}::uuid, 4, 'CH-14', ${testId(41046)}::uuid, null,
            ${fixture.coach}::uuid, ${occurredAt}::timestamptz,
            ${JSON.stringify({ challengeId: contenderChallenge, sessionId: secondSession })}::jsonb,
            'fixture:ac-140:contender')
      `.execute(transaction);
    });

    const snapshotsBefore = await sql<{ readonly value: unknown }>`
      select jsonb_agg(to_jsonb(snapshot) order by snapshot.snapshot_id) as value
      from scheduling.session_competitive_snapshots as snapshot
      where snapshot.snapshot_id in (${titleSnapshot}::uuid, ${contenderSnapshot}::uuid)
    `.execute(database);
    const resultAttempt = (input: {
      readonly challengeId: string;
      readonly sessionId: string;
      readonly outcomeCode: 'WIN_A' | 'WIN_B';
      readonly baseId: number;
      readonly privateMarker: string;
    }) => {
      const command = {
        commandId: testId(input.baseId), commandType: 'RECORD_SESSION_RESULT',
        idempotencyKey: `ac-140-result:${input.challengeId}`,
        actor: {
          type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community],
        },
        aggregateType: 'Challenge', aggregateId: input.challengeId, expectedVersion: 4,
        correlationId: testId(input.baseId + 1), causationId: null,
        requestId: testId(input.baseId + 2), source: 'api', payloadVersion: 1,
        payload: {
          challengeId: input.challengeId, sessionId: input.sessionId,
          outcomeCode: input.outcomeCode, winnerUserId: null, reasonCode: null,
          comment: input.privateMarker, methodCode: null, methodText: null,
          scorePayload: { privateMarker: input.privateMarker }, methodPayload: null,
        },
      } satisfies CommandEnvelope<RecordSessionResultPayload>;
      const ids = {
        eventId: testId(input.baseId + 3), auditId: testId(input.baseId + 4),
        outboxMessageId: testId(input.baseId + 5), resultId: testId(input.baseId + 6),
        resultEventId: testId(input.baseId + 7), statusTransitionId: testId(input.baseId + 8),
        statusEventId: testId(input.baseId + 9), cooldownId: testId(input.baseId + 10),
        cooldownEventId: testId(input.baseId + 11),
        timerOutboxMessageId: testId(input.baseId + 12),
        notificationOutboxMessageId: testId(input.baseId + 13),
        notificationIds: [testId(input.baseId + 14), testId(input.baseId + 15)] as const,
      };
      return { command, ids };
    };
    const attempts = [
      resultAttempt({
        challengeId: titleChallenge, sessionId: fixture.session,
        outcomeCode: 'WIN_A', baseId: 41100, privateMarker: 'private-score-title',
      }),
      resultAttempt({
        challengeId: contenderChallenge, sessionId: secondSession,
        outcomeCode: 'WIN_B', baseId: 41200, privateMarker: 'private-score-contender',
      }),
    ] as const;
    const outcomes = await Promise.allSettled(attempts.map((attempt) =>
      recordSessionResult(database, attempt.command, attempt.ids, () => new Date(occurredAt))));
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    const winnerIndex = outcomes[0]?.status === 'fulfilled' ? 0 : 1;
    const loserIndex = winnerIndex === 0 ? 1 : 0;
    const winner = attempts[winnerIndex];
    const loser = attempts[loserIndex];
    const fulfilled = outcomes[winnerIndex];
    const rejected = outcomes[loserIndex];
    if (fulfilled?.status !== 'fulfilled' || rejected?.status !== 'rejected') {
      throw new Error('Expected one committed and one rejected Result command');
    }
    expect(rejected.reason).toMatchObject<Partial<ResultConflictError>>({
      code: 'COMPETITION_STATUS_LOCKED',
    });
    expect(fulfilled.value.response).toMatchObject({
      resultId: winner.ids.resultId, state: 'RECORDED', provisional: true,
      appealDeadlineAt: '2026-10-03T14:00:00.000Z',
      statusTransitionType: winnerIndex === 0 ? 'TITLE_TRANSFERRED' : 'CONTENDER_TRANSFERRED',
    });
    await expect(recordSessionResult(
      database, winner.command, winner.ids, () => new Date(occurredAt),
    )).resolves.toMatchObject({ replayed: true, eventId: winner.ids.eventId });
    await expect(recordSessionResult(
      database, loser.command, loser.ids, () => new Date(occurredAt),
    )).rejects.toMatchObject<Partial<ResultConflictError>>({
      code: 'COMPETITION_STATUS_LOCKED',
    });

    const snapshotsAfter = await sql<{ readonly value: unknown }>`
      select jsonb_agg(to_jsonb(snapshot) order by snapshot.snapshot_id) as value
      from scheduling.session_competitive_snapshots as snapshot
      where snapshot.snapshot_id in (${titleSnapshot}::uuid, ${contenderSnapshot}::uuid)
    `.execute(database);
    expect(snapshotsAfter.rows[0]?.value).toEqual(snapshotsBefore.rows[0]?.value);
    const expectedChampion = winnerIndex === 0 ? fixture.athleteA : fixture.athleteB;
    const expectedContender = winnerIndex === 0 ? fixture.athleteB : athleteC;
    const facts = await sql<{
      readonly champion_user_id: string;
      readonly contender_user_id: string;
      readonly status_version: string;
      readonly status_lock_result_id: string;
      readonly result_count: string;
      readonly transition_count: string;
      readonly cooldown_count: string;
      readonly recorded_challenges: string;
      readonly pending_challenges: string;
      readonly audit_count: string;
      readonly outbox_count: string;
      readonly idempotency_count: string;
    }>`
      select competition.champion_user_id, competition.contender_user_id,
        competition.status_version::text as status_version,
        competition.status_lock_result_id,
        (select count(*)::text from competition.results
          where challenge_id in (${titleChallenge}::uuid, ${contenderChallenge}::uuid))
          as result_count,
        (select count(*)::text from competition.status_transitions
          where competition_id = ${fixture.competition}::uuid) as transition_count,
        (select count(*)::text from competition.pair_cooldowns
          where competition_id = ${fixture.competition}::uuid) as cooldown_count,
        (select count(*)::text from competition.challenges
          where challenge_id in (${titleChallenge}::uuid, ${contenderChallenge}::uuid)
            and state = 'RESULT_RECORDED') as recorded_challenges,
        (select count(*)::text from competition.challenges
          where challenge_id in (${titleChallenge}::uuid, ${contenderChallenge}::uuid)
            and state = 'RESULT_PENDING') as pending_challenges,
        (select count(*)::text from platform.audit_events
          where aggregate_type = 'Challenge'
            and aggregate_id in (${titleChallenge}::uuid, ${contenderChallenge}::uuid)
            and action = 'RECORD_RESULT') as audit_count,
        (select count(*)::text from platform.outbox_messages
          where message_id in (
            ${attempts[0].ids.outboxMessageId}::uuid,
            ${attempts[0].ids.notificationOutboxMessageId}::uuid,
            ${attempts[1].ids.outboxMessageId}::uuid,
            ${attempts[1].ids.notificationOutboxMessageId}::uuid
          )) as outbox_count,
        (select count(*)::text from platform.idempotency_records
          where event_id in (${attempts[0].ids.eventId}::uuid, ${attempts[1].ids.eventId}::uuid))
          as idempotency_count
      from competition.competitions as competition
      where competition.competition_id = ${fixture.competition}::uuid
    `.execute(database);
    expect(facts.rows[0]).toEqual({
      champion_user_id: expectedChampion, contender_user_id: expectedContender,
      status_version: '2', status_lock_result_id: winner.ids.resultId,
      result_count: '1', transition_count: '1', cooldown_count: '1',
      recorded_challenges: '1', pending_challenges: '1', audit_count: '1',
      outbox_count: '2', idempotency_count: '1',
    });
    const publicDocuments = await sql<{ readonly document: unknown }>`
      select payload as document from platform.domain_events
      where metadata ->> 'commandId' = ${winner.command.commandId}
      union all
      select payload as document from platform.outbox_messages
      where message_id in (
        ${winner.ids.outboxMessageId}::uuid, ${winner.ids.notificationOutboxMessageId}::uuid
      )
    `.execute(database);
    expect(JSON.stringify(publicDocuments.rows)).not.toContain('private-score');
  });

  it('[AC-112] lets either DRAW Athlete win one atomic Appeal race', async () => {
    const base = 45000;
    const fixture = await seedConfirmedTrainingForConversion(base);
    const rulesetSnapshotId = testId(45030);
    const challengeId = testId(45031);
    const snapshotId = testId(45032);
    const resultId = testId(45033);
    const recordedAt = new Date('2026-10-03T12:00:00.000Z');

    await database.transaction().execute(async (transaction) => {
      await sql`set constraints all deferred`.execute(transaction);
      await sql`
        update competition.competitions
        set phase = 'RUNNING', champion_user_id = null,
          contender_user_id = ${fixture.athleteA}::uuid, status_version = 1,
          status_lock_result_id = null, version = 2,
          updated_at = '2026-10-03T10:00:00.000Z'
        where competition_id = ${fixture.competition}::uuid
      `.execute(transaction);
      await sql`
        insert into competition.ruleset_snapshots (
          ruleset_snapshot_id, competition_id, community_configuration_id,
          ruleset_ref, ruleset_ack_mode, policy_version, created_at
        ) values (
          ${rulesetSnapshotId}::uuid, ${fixture.competition}::uuid,
          ${testId(base + 15)}::uuid, 'pilot-boxing-v1', 'IMPLICIT_ON_ACCEPT',
          'challenge-mvp-v1', '2026-10-03T10:00:00.000Z'
        )
      `.execute(transaction);
      await sql`
        insert into competition.challenges (
          challenge_id, competition_id, source_match_id, source_chat_id, service_chat_id,
          initiator_user_id, recipient_user_id, pair_low_id, pair_high_id,
          response_policy, stake, state, ruleset_snapshot_id, response_deadline_at,
          accepted_at, scheduling_deadline_at, version, created_at, updated_at
        ) values (
          ${challengeId}::uuid, ${fixture.competition}::uuid, ${fixture.match}::uuid,
          ${fixture.chat}::uuid, ${fixture.chat}::uuid, ${fixture.athleteA}::uuid,
          ${fixture.athleteB}::uuid, least(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid),
          greatest(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid), 'MANDATORY',
          'CONTENDER', 'RESULT_PENDING', ${rulesetSnapshotId}::uuid,
          '2026-10-01T10:00:00.000Z', '2026-09-29T10:00:00.000Z',
          '2026-10-13T10:00:00.000Z', 4, '2026-09-29T10:00:00.000Z',
          '2026-10-03T10:00:00.000Z'
        )
      `.execute(transaction);
      await sql`
        insert into competition.challenge_participant_obligations (
          obligation_id, challenge_id, user_id, accepted_at
        ) values
          (${testId(45034)}::uuid, ${challengeId}::uuid, ${fixture.athleteA}::uuid,
            '2026-09-29T10:00:00.000Z'),
          (${testId(45035)}::uuid, ${challengeId}::uuid, ${fixture.athleteB}::uuid,
            '2026-09-29T10:00:00.000Z')
      `.execute(transaction);
      await sql`
        update scheduling.bookings
        set purpose = 'OFFICIAL_CHALLENGE', challenge_id = ${challengeId}::uuid
        where booking_id = ${fixture.booking}::uuid
      `.execute(transaction);
      await sql`
        update scheduling.sessions
        set purpose = 'OFFICIAL_CHALLENGE', challenge_id = ${challengeId}::uuid,
          state = 'ENDED', window_opened_at = '2026-10-03T10:00:00.000Z',
          actual_start_at = '2026-10-03T10:01:00.000Z',
          actual_end_at = '2026-10-03T10:55:00.000Z', version = 5,
          updated_at = '2026-10-03T10:55:00.000Z'
        where session_id = ${fixture.session}::uuid
      `.execute(transaction);
      await sql`
        insert into scheduling.session_competitive_snapshots (
          snapshot_id, session_id, challenge_id, competition_id, ruleset_snapshot_id,
          community_configuration_id, planned_stake, effective_stake, champion_user_id,
          contender_user_id, competition_status_version, venue_id, coach_user_id,
          pair_low_id, pair_high_id, scheduled_start_at, scheduled_end_at, created_at
        ) values (
          ${snapshotId}::uuid, ${fixture.session}::uuid, ${challengeId}::uuid,
          ${fixture.competition}::uuid, ${rulesetSnapshotId}::uuid,
          ${testId(base + 15)}::uuid, 'CONTENDER', 'CONTENDER', null,
          ${fixture.athleteA}::uuid, 1, ${fixture.venue}::uuid, ${fixture.coach}::uuid,
          least(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid),
          greatest(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid),
          ${fixture.scheduledStartAt}::timestamptz, '2026-10-01T11:00:00.000Z',
          '2026-10-03T10:00:00.000Z'
        )
      `.execute(transaction);
      await sql`
        insert into platform.domain_events (
          event_id, event_name, event_version, aggregate_type, aggregate_id,
          aggregate_version, transition_id, correlation_id, causation_id, actor_id,
          occurred_at, payload, idempotency_key_hash
        ) values (
          ${testId(45036)}::uuid, 'ChallengeResultPending', 1, 'Challenge',
          ${challengeId}::uuid, 4, 'CH-14', ${testId(45037)}::uuid, null,
          ${fixture.coach}::uuid, '2026-10-03T10:55:00.000Z',
          ${JSON.stringify({ challengeId, sessionId: fixture.session })}::jsonb,
          'fixture:ac-112:result-pending'
        )
      `.execute(transaction);
    });

    const snapshotBefore = await sql<{ readonly document: unknown }>`
      select to_jsonb(snapshot) as document
      from scheduling.session_competitive_snapshots as snapshot
      where snapshot_id = ${snapshotId}::uuid
    `.execute(database);
    const recorded = await recordSessionResult(database, {
      commandId: testId(45040), commandType: 'RECORD_SESSION_RESULT',
      idempotencyKey: 'ac-112-record-draw',
      actor: { type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community] },
      aggregateType: 'Challenge', aggregateId: challengeId, expectedVersion: 4,
      correlationId: testId(45041), causationId: testId(45036), requestId: testId(45042),
      source: 'api', payloadVersion: 1,
      payload: {
        challengeId, sessionId: fixture.session, outcomeCode: 'DRAW', winnerUserId: null,
        reasonCode: null, comment: null, methodCode: null, methodText: null,
        scorePayload: null, methodPayload: null,
      },
    } satisfies CommandEnvelope<RecordSessionResultPayload>, {
      eventId: testId(45043), auditId: testId(45044), outboxMessageId: testId(45045),
      resultId, resultEventId: testId(45046), statusTransitionId: testId(45047),
      statusEventId: testId(45048), cooldownId: testId(45049),
      cooldownEventId: testId(45050), timerOutboxMessageId: testId(45051),
      notificationOutboxMessageId: testId(45052),
      notificationIds: [testId(45053), testId(45054)],
    }, () => recordedAt);
    expect(recorded.response).toMatchObject({
      state: 'RECORDED', outcomeCode: 'DRAW', recordedOutcomeCode: 'DRAW',
      winnerUserId: null, loserUserId: null, statusTransitionType: 'NONE',
      statusBefore: { contenderUserId: fixture.athleteA, statusVersion: 1 },
      statusAfter: { contenderUserId: fixture.athleteA, statusVersion: 1 },
      appealDeadlineAt: '2026-10-05T12:00:00.000Z', viewerCanAppeal: false,
    });
    for (const athleteUserId of [fixture.athleteA, fixture.athleteB]) {
      await expect(readResult(
        database, resultId, athleteUserId, new Date('2026-10-03T12:01:00.000Z'),
      )).resolves.toMatchObject({
        state: 'RECORDED', outcomeCode: 'DRAW', winnerUserId: null, loserUserId: null,
        statusTransitionType: 'NONE', viewerCanAppeal: true, viewerCanWaiveAppeal: true,
      });
    }
    await expect(readResult(
      database, resultId, fixture.coach, new Date('2026-10-03T12:01:00.000Z'),
    )).resolves.toMatchObject({ viewerCanAppeal: false, viewerCanWaiveAppeal: false });

    const appealAttempt = (input: {
      readonly athleteUserId: string;
      readonly baseId: number;
      readonly idempotencyKey: string;
      readonly statement: string;
    }) => ({
      command: {
        commandId: testId(input.baseId), commandType: 'SUBMIT_RESULT_APPEAL',
        idempotencyKey: input.idempotencyKey,
        actor: { type: 'USER', id: input.athleteUserId, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Result', aggregateId: resultId, expectedVersion: 1,
        correlationId: testId(input.baseId + 1), causationId: testId(45046),
        requestId: testId(input.baseId + 2), source: 'api', payloadVersion: 1,
        payload: { resultId, reasonCode: 'DRAW_DISPUTED', statement: input.statement },
      } satisfies CommandEnvelope<SubmitResultAppealPayload>,
      ids: {
        eventId: testId(input.baseId + 3), auditId: testId(input.baseId + 4),
        outboxMessageId: testId(input.baseId + 5), appealId: testId(input.baseId + 6),
        appealEventId: testId(input.baseId + 7), challengeEventId: testId(input.baseId + 8),
        notificationOutboxMessageId: testId(input.baseId + 9),
        notificationIds: [testId(input.baseId + 10), testId(input.baseId + 11)] as const,
      },
    });
    const deniedCoach = appealAttempt({
      athleteUserId: fixture.coach, baseId: 45100,
      idempotencyKey: 'ac-112-coach-denied', statement: 'coach-private-statement',
    });
    await expect(submitResultAppeal(
      database, {
        ...deniedCoach.command,
        actor: { type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community] },
      }, deniedCoach.ids, () => new Date('2026-10-03T12:05:00.000Z'),
    )).rejects.toBeInstanceOf(ResultPermissionDeniedError);
    const deniedOutsider = appealAttempt({
      athleteUserId: fixture.central, baseId: 45120,
      idempotencyKey: 'ac-112-outsider-denied', statement: 'outsider-private-statement',
    });
    await expect(submitResultAppeal(
      database, {
        ...deniedOutsider.command,
        actor: { type: 'USER', id: fixture.central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      }, deniedOutsider.ids, () => new Date('2026-10-03T12:05:00.000Z'),
    )).rejects.toBeInstanceOf(ResultPermissionDeniedError);
    const expired = appealAttempt({
      athleteUserId: fixture.athleteA, baseId: 45140,
      idempotencyKey: 'ac-112-expired', statement: 'expired-private-statement',
    });
    await expect(submitResultAppeal(
      database, expired.command, expired.ids, () => new Date('2026-10-05T12:00:00.000Z'),
    )).rejects.toMatchObject<Partial<ResultConflictError>>({
      code: 'RESULT_APPEAL_WINDOW_CLOSED',
    });

    const attempts = [
      appealAttempt({
        athleteUserId: fixture.athleteA, baseId: 45160,
        idempotencyKey: 'ac-112-athlete-a', statement: 'private-draw-statement-a',
      }),
      appealAttempt({
        athleteUserId: fixture.athleteB, baseId: 45180,
        idempotencyKey: 'ac-112-athlete-b', statement: 'private-draw-statement-b',
      }),
    ] as const;
    const outcomes = await Promise.allSettled(attempts.map((attempt) => submitResultAppeal(
      database, attempt.command, attempt.ids, () => new Date('2026-10-03T12:10:00.000Z'),
    )));
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    const winnerIndex = outcomes[0]?.status === 'fulfilled' ? 0 : 1;
    const loserIndex = winnerIndex === 0 ? 1 : 0;
    const winner = attempts[winnerIndex];
    const fulfilled = outcomes[winnerIndex];
    const rejected = outcomes[loserIndex];
    if (fulfilled?.status !== 'fulfilled' || rejected?.status !== 'rejected') {
      throw new Error('Expected one committed and one rejected DRAW Appeal command');
    }
    expect(fulfilled.value.response).toMatchObject({
      state: 'UNDER_APPEAL', outcomeCode: 'DRAW', winnerUserId: null,
      loserUserId: null, statusTransitionType: 'NONE', viewerCanAppeal: false, version: 2,
    });
    expect(rejected.reason).toBeInstanceOf(VersionConflictError);
    await expect(submitResultAppeal(
      database, winner.command, winner.ids, () => new Date('2026-10-03T12:10:00.000Z'),
    )).resolves.toMatchObject({
      replayed: true, eventId: winner.ids.eventId, response: fulfilled.value.response,
    });

    const notificationOutbox = await sql<{
      readonly event_id: string;
      readonly payload: {
        readonly notifications: readonly {
          readonly notificationId: string;
          readonly recipientUserId: string;
          readonly category: 'MANDATORY';
          readonly renderKey: string;
          readonly actionTarget: Readonly<Record<string, unknown>>;
          readonly payload: Readonly<Record<string, unknown>>;
          readonly deadlineAt: string;
        }[];
      };
    }>`
      select event_id, payload from platform.outbox_messages
      where message_id = ${winner.ids.notificationOutboxMessageId}::uuid
    `.execute(database);
    const notificationRow = notificationOutbox.rows[0];
    expect(notificationRow?.payload.notifications.map((item) => item.recipientUserId).sort())
      .toEqual([
        winnerIndex === 0 ? fixture.athleteB : fixture.athleteA,
        fixture.coach,
      ].sort());
    if (!notificationRow) throw new Error('Expected committed Appeal notifications');
    await expect(projectNotificationBatch(
      database, notificationRow.event_id, notificationRow.payload.notifications,
    )).resolves.toMatchObject({ createdCount: 2, replayed: false });
    const peerNotification = notificationRow.payload.notifications.find(
      (item) => item.recipientUserId !== fixture.coach,
    );
    if (!peerNotification) throw new Error('Expected peer Appeal notification');
    await expect(markNotificationRead(
      database, peerNotification.notificationId, peerNotification.recipientUserId,
    )).resolves.toBe(true);
    await expect(readResult(
      database, resultId, fixture.athleteA, new Date('2026-10-03T12:11:00.000Z'),
    )).resolves.toMatchObject({
      state: 'UNDER_APPEAL', appealDeadlineAt: '2026-10-05T12:00:00.000Z',
      viewerCanAppeal: false, version: 2,
    });

    const snapshotAfter = await sql<{ readonly document: unknown }>`
      select to_jsonb(snapshot) as document
      from scheduling.session_competitive_snapshots as snapshot
      where snapshot_id = ${snapshotId}::uuid
    `.execute(database);
    expect(snapshotAfter.rows[0]?.document).toEqual(snapshotBefore.rows[0]?.document);
    const facts = await sql<{
      readonly result_state: string;
      readonly recorded_outcome_code: string;
      readonly winner_user_id: string | null;
      readonly loser_user_id: string | null;
      readonly appeal_deadline_at: Date;
      readonly challenge_state: string;
      readonly challenge_version: string;
      readonly champion_user_id: string | null;
      readonly contender_user_id: string | null;
      readonly status_version: string;
      readonly status_lock_result_id: string | null;
      readonly appeal_count: string;
      readonly appeal_state: string;
      readonly appellant_user_id: string;
      readonly statement: string;
      readonly response_deadline_at: Date;
      readonly sla_due_at: Date;
      readonly transition_count: string;
      readonly cooldown_count: string;
      readonly active_obligation_count: string;
      readonly result_appeal_event_count: string;
      readonly challenge_appeal_event_count: string;
      readonly audit_count: string;
      readonly outbox_count: string;
      readonly idempotency_count: string;
    }>`
      select result.state as result_state, result.recorded_outcome_code,
        result.winner_user_id, result.loser_user_id, result.appeal_deadline_at,
        challenge.state as challenge_state, challenge.version::text as challenge_version,
        competition.champion_user_id, competition.contender_user_id,
        competition.status_version::text as status_version, competition.status_lock_result_id,
        (select count(*)::text from competition.appeals
          where result_id = ${resultId}::uuid) as appeal_count,
        appeal.state as appeal_state, appeal.appellant_user_id, appeal.statement,
        appeal.response_deadline_at, appeal.sla_due_at,
        (select count(*)::text from competition.status_transitions
          where source_result_id = ${resultId}::uuid) as transition_count,
        (select count(*)::text from competition.pair_cooldowns
          where source_result_id = ${resultId}::uuid) as cooldown_count,
        (select count(*)::text from competition.challenge_participant_obligations
          where challenge_id = ${challengeId}::uuid and released_at is null)
          as active_obligation_count,
        (select count(*)::text from platform.domain_events
          where aggregate_type = 'Result' and aggregate_id = ${resultId}::uuid
            and event_name = 'ResultPutUnderAppeal') as result_appeal_event_count,
        (select count(*)::text from platform.domain_events
          where aggregate_type = 'Challenge' and aggregate_id = ${challengeId}::uuid
            and event_name = 'AppealSubmitted') as challenge_appeal_event_count,
        (select count(*)::text from platform.audit_events
          where aggregate_type = 'Result' and aggregate_id = ${resultId}::uuid
            and action = 'SUBMIT_APPEAL') as audit_count,
        (select count(*)::text from platform.outbox_messages
          where message_id in (${winner.ids.outboxMessageId}::uuid,
            ${winner.ids.notificationOutboxMessageId}::uuid)) as outbox_count,
        (select count(*)::text from platform.idempotency_records
          where event_id = ${winner.ids.eventId}::uuid) as idempotency_count
      from competition.results as result
      join competition.challenges as challenge on challenge.challenge_id = result.challenge_id
      join competition.competitions as competition
        on competition.competition_id = challenge.competition_id
      join competition.appeals as appeal on appeal.result_id = result.result_id
      where result.result_id = ${resultId}::uuid
    `.execute(database);
    expect(facts.rows[0]).toEqual({
      result_state: 'UNDER_APPEAL', recorded_outcome_code: 'DRAW',
      winner_user_id: null, loser_user_id: null,
      appeal_deadline_at: new Date('2026-10-05T12:00:00.000Z'),
      challenge_state: 'UNDER_APPEAL', challenge_version: '6',
      champion_user_id: null, contender_user_id: fixture.athleteA,
      status_version: '1', status_lock_result_id: null,
      appeal_count: '1', appeal_state: 'SUBMITTED',
      appellant_user_id: winner.command.actor.id,
      statement: winner.command.payload.statement,
      response_deadline_at: new Date('2026-10-04T12:10:00.000Z'),
      sla_due_at: new Date('2026-10-06T12:10:00.000Z'),
      transition_count: '0', cooldown_count: '0', active_obligation_count: '2',
      result_appeal_event_count: '1', challenge_appeal_event_count: '1',
      audit_count: '1', outbox_count: '2', idempotency_count: '1',
    });
    const publicDocuments = await sql<{ readonly document: unknown }>`
      select payload as document from platform.domain_events
      where metadata ->> 'commandId' = ${winner.command.commandId}
      union all
      select payload as document from platform.outbox_messages
      where message_id in (
        ${winner.ids.outboxMessageId}::uuid, ${winner.ids.notificationOutboxMessageId}::uuid
      )
    `.execute(database);
    expect(JSON.stringify(publicDocuments.rows)).not.toContain('private-draw-statement');
  });

  it('[AC-122] persists an irreversible decisive Appeal waiver and finalizes once', async () => {
    const base = 46000;
    const fixture = await seedConfirmedTrainingForConversion(base);
    const rulesetSnapshotId = testId(46030);
    const challengeId = testId(46031);
    const snapshotId = testId(46032);
    const resultId = testId(46033);
    const transitionId = testId(46034);
    const cooldownId = testId(46035);
    const recordedAt = new Date('2026-10-03T12:00:00.000Z');

    await database.transaction().execute(async (transaction) => {
      await sql`set constraints all deferred`.execute(transaction);
      await sql`
        update competition.competitions
        set phase = 'RUNNING', champion_user_id = null,
          contender_user_id = ${fixture.athleteA}::uuid, status_version = 1,
          status_lock_result_id = null, version = 2,
          updated_at = '2026-10-03T10:00:00.000Z'
        where competition_id = ${fixture.competition}::uuid
      `.execute(transaction);
      await sql`
        insert into competition.ruleset_snapshots (
          ruleset_snapshot_id, competition_id, community_configuration_id,
          ruleset_ref, ruleset_ack_mode, policy_version, created_at
        ) values (
          ${rulesetSnapshotId}::uuid, ${fixture.competition}::uuid,
          ${testId(base + 15)}::uuid, 'pilot-boxing-v1', 'IMPLICIT_ON_ACCEPT',
          'challenge-mvp-v1', '2026-10-03T10:00:00.000Z'
        )
      `.execute(transaction);
      await sql`
        insert into competition.challenges (
          challenge_id, competition_id, source_match_id, source_chat_id, service_chat_id,
          initiator_user_id, recipient_user_id, pair_low_id, pair_high_id,
          response_policy, stake, state, ruleset_snapshot_id, response_deadline_at,
          accepted_at, scheduling_deadline_at, version, created_at, updated_at
        ) values (
          ${challengeId}::uuid, ${fixture.competition}::uuid, ${fixture.match}::uuid,
          ${fixture.chat}::uuid, ${fixture.chat}::uuid, ${fixture.athleteA}::uuid,
          ${fixture.athleteB}::uuid, least(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid),
          greatest(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid), 'MANDATORY',
          'CONTENDER', 'RESULT_PENDING', ${rulesetSnapshotId}::uuid,
          '2026-10-01T10:00:00.000Z', '2026-09-29T10:00:00.000Z',
          '2026-10-13T10:00:00.000Z', 4, '2026-09-29T10:00:00.000Z',
          '2026-10-03T10:00:00.000Z'
        )
      `.execute(transaction);
      await sql`
        insert into competition.challenge_participant_obligations (
          obligation_id, challenge_id, user_id, accepted_at
        ) values
          (${testId(46036)}::uuid, ${challengeId}::uuid, ${fixture.athleteA}::uuid,
            '2026-09-29T10:00:00.000Z'),
          (${testId(46037)}::uuid, ${challengeId}::uuid, ${fixture.athleteB}::uuid,
            '2026-09-29T10:00:00.000Z')
      `.execute(transaction);
      await sql`
        update scheduling.bookings
        set purpose = 'OFFICIAL_CHALLENGE', challenge_id = ${challengeId}::uuid
        where booking_id = ${fixture.booking}::uuid
      `.execute(transaction);
      await sql`
        update scheduling.sessions
        set purpose = 'OFFICIAL_CHALLENGE', challenge_id = ${challengeId}::uuid,
          state = 'ENDED', window_opened_at = '2026-10-03T10:00:00.000Z',
          actual_start_at = '2026-10-03T10:01:00.000Z',
          actual_end_at = '2026-10-03T10:55:00.000Z', version = 5,
          updated_at = '2026-10-03T10:55:00.000Z'
        where session_id = ${fixture.session}::uuid
      `.execute(transaction);
      await sql`
        insert into scheduling.session_competitive_snapshots (
          snapshot_id, session_id, challenge_id, competition_id, ruleset_snapshot_id,
          community_configuration_id, planned_stake, effective_stake, champion_user_id,
          contender_user_id, competition_status_version, venue_id, coach_user_id,
          pair_low_id, pair_high_id, scheduled_start_at, scheduled_end_at, created_at
        ) values (
          ${snapshotId}::uuid, ${fixture.session}::uuid, ${challengeId}::uuid,
          ${fixture.competition}::uuid, ${rulesetSnapshotId}::uuid,
          ${testId(base + 15)}::uuid, 'CONTENDER', 'CONTENDER', null,
          ${fixture.athleteA}::uuid, 1, ${fixture.venue}::uuid, ${fixture.coach}::uuid,
          least(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid),
          greatest(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid),
          ${fixture.scheduledStartAt}::timestamptz, '2026-10-01T11:00:00.000Z',
          '2026-10-03T10:00:00.000Z'
        )
      `.execute(transaction);
      await sql`
        insert into platform.domain_events (
          event_id, event_name, event_version, aggregate_type, aggregate_id,
          aggregate_version, transition_id, correlation_id, causation_id, actor_id,
          occurred_at, payload, idempotency_key_hash
        ) values (
          ${testId(46038)}::uuid, 'ChallengeResultPending', 1, 'Challenge',
          ${challengeId}::uuid, 4, 'CH-14', ${testId(46039)}::uuid, null,
          ${fixture.coach}::uuid, '2026-10-03T10:55:00.000Z',
          ${JSON.stringify({ challengeId, sessionId: fixture.session })}::jsonb,
          'fixture:ac-122:result-pending'
        )
      `.execute(transaction);
    });

    const snapshotBefore = await sql<{ readonly document: unknown }>`
      select to_jsonb(snapshot) as document
      from scheduling.session_competitive_snapshots snapshot
      where snapshot_id = ${snapshotId}::uuid
    `.execute(database);
    const recorded = await recordSessionResult(database, {
      commandId: testId(46040), commandType: 'RECORD_SESSION_RESULT',
      idempotencyKey: 'ac-122-record-result',
      actor: { type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community] },
      aggregateType: 'Challenge', aggregateId: challengeId, expectedVersion: 4,
      correlationId: testId(46041), causationId: testId(46038), requestId: testId(46042),
      source: 'api', payloadVersion: 1,
      payload: {
        challengeId, sessionId: fixture.session, outcomeCode: 'WIN_B', winnerUserId: null,
        reasonCode: null, comment: null, methodCode: null, methodText: null,
        scorePayload: null, methodPayload: null,
      },
    } satisfies CommandEnvelope<RecordSessionResultPayload>, {
      eventId: testId(46043), auditId: testId(46044), outboxMessageId: testId(46045),
      resultId, resultEventId: testId(46046), statusTransitionId: transitionId,
      statusEventId: testId(46047), cooldownId, cooldownEventId: testId(46048),
      timerOutboxMessageId: testId(46049), notificationOutboxMessageId: testId(46050),
      notificationIds: [testId(46051), testId(46052)],
    }, () => recordedAt);
    expect(recorded.response).toMatchObject({
      state: 'RECORDED', outcomeCode: 'WIN_B', recordedOutcomeCode: 'WIN_B',
      winnerUserId: fixture.athleteB, loserUserId: fixture.athleteA,
      statusTransitionType: 'CONTENDER_TRANSFERRED', version: 1,
    });
    await expect(readResult(
      database, resultId, fixture.athleteA, new Date('2026-10-03T12:01:00.000Z'),
    )).resolves.toMatchObject({ viewerCanAppeal: true, viewerCanWaiveAppeal: true });
    await expect(readResult(
      database, resultId, fixture.athleteB, new Date('2026-10-03T12:01:00.000Z'),
    )).resolves.toMatchObject({ viewerCanAppeal: false, viewerCanWaiveAppeal: false });

    const waiverAttempt = (input: {
      readonly actorUserId: string;
      readonly actorRole: 'ATHLETE' | 'COACH' | 'CENTRAL_ADMIN';
      readonly baseId: number;
      readonly idempotencyKey: string;
      readonly expectedVersion?: number;
    }) => ({
      command: {
        commandId: testId(input.baseId), commandType: 'WAIVE_RESULT_APPEAL',
        idempotencyKey: input.idempotencyKey,
        actor: { type: 'USER', id: input.actorUserId, roles: [input.actorRole],
          scopeIds: input.actorRole === 'COACH' ? [fixture.community] : [] },
        aggregateType: 'Result', aggregateId: resultId,
        expectedVersion: input.expectedVersion ?? 1,
        correlationId: testId(input.baseId + 1), causationId: testId(46046),
        requestId: testId(input.baseId + 2), source: 'api', payloadVersion: 1,
        payload: { resultId },
      } satisfies CommandEnvelope<WaiveResultAppealPayload>,
      ids: {
        eventId: testId(input.baseId + 3), auditId: testId(input.baseId + 4),
        outboxMessageId: testId(input.baseId + 5), waiverId: testId(input.baseId + 6),
        waiverEventId: testId(input.baseId + 7), challengeEventId: testId(input.baseId + 8),
        statusFinalizationId: testId(input.baseId + 9), statusEventId: testId(input.baseId + 10),
        notificationOutboxMessageId: testId(input.baseId + 11),
        notificationIds: [testId(input.baseId + 12), testId(input.baseId + 13)] as const,
      },
    });
    const deniedWinner = waiverAttempt({
      actorUserId: fixture.athleteB, actorRole: 'ATHLETE', baseId: 46100,
      idempotencyKey: 'ac-122-winner-denied',
    });
    await expect(waiveResultAppeal(
      database, deniedWinner.command, deniedWinner.ids,
      () => new Date('2026-10-03T12:05:00.000Z'),
    )).rejects.toMatchObject<Partial<ResultConflictError>>({
      code: 'RESULT_APPEAL_ACTOR_NOT_ELIGIBLE',
    });
    for (const denied of [
      waiverAttempt({ actorUserId: fixture.coach, actorRole: 'COACH', baseId: 46120,
        idempotencyKey: 'ac-122-coach-denied' }),
      waiverAttempt({ actorUserId: fixture.central, actorRole: 'CENTRAL_ADMIN', baseId: 46140,
        idempotencyKey: 'ac-122-outsider-denied' }),
    ]) {
      await expect(waiveResultAppeal(
        database, denied.command, denied.ids, () => new Date('2026-10-03T12:05:00.000Z'),
      )).rejects.toBeInstanceOf(ResultPermissionDeniedError);
    }
    const expired = waiverAttempt({
      actorUserId: fixture.athleteA, actorRole: 'ATHLETE', baseId: 46160,
      idempotencyKey: 'ac-122-expired',
    });
    await expect(waiveResultAppeal(
      database, expired.command, expired.ids, () => new Date('2026-10-05T12:00:00.000Z'),
    )).rejects.toMatchObject<Partial<ResultConflictError>>({
      code: 'RESULT_APPEAL_WINDOW_CLOSED',
    });

    const accepted = waiverAttempt({
      actorUserId: fixture.athleteA, actorRole: 'ATHLETE', baseId: 46200,
      idempotencyKey: 'ac-122-loser-waives',
    });
    const waivedAt = new Date('2026-10-03T12:10:00.000Z');
    const waived = await waiveResultAppeal(database, accepted.command, accepted.ids, () => waivedAt);
    expect(waived.response).toMatchObject({
      state: 'FINAL', outcomeCode: 'WIN_B', recordedOutcomeCode: 'WIN_B',
      winnerUserId: fixture.athleteB, loserUserId: fixture.athleteA,
      statusTransitionType: 'CONTENDER_TRANSFERRED', provisional: false,
      finalizedAt: waivedAt.toISOString(), viewerCanAppeal: false,
      viewerCanWaiveAppeal: false, version: 2,
    });
    await expect(waiveResultAppeal(database, accepted.command, accepted.ids))
      .resolves.toMatchObject({ replayed: true, eventId: accepted.ids.eventId,
        response: waived.response });
    const staleWaiver = waiverAttempt({
      actorUserId: fixture.athleteA, actorRole: 'ATHLETE', baseId: 46220,
      idempotencyKey: 'ac-122-loser-waives-again',
    });
    await expect(waiveResultAppeal(database, staleWaiver.command, staleWaiver.ids))
      .rejects.toBeInstanceOf(VersionConflictError);

    const deniedAppealIds = {
      eventId: testId(46243), auditId: testId(46244), outboxMessageId: testId(46245),
      appealId: testId(46246), appealEventId: testId(46247), challengeEventId: testId(46248),
      notificationOutboxMessageId: testId(46249),
      notificationIds: [testId(46250), testId(46251)] as const,
    };
    await expect(submitResultAppeal(database, {
      commandId: testId(46240), commandType: 'SUBMIT_RESULT_APPEAL',
      idempotencyKey: 'ac-122-appeal-after-waiver',
      actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Result', aggregateId: resultId, expectedVersion: 2,
      correlationId: testId(46241), causationId: accepted.ids.eventId,
      requestId: testId(46242), source: 'api', payloadVersion: 1,
      payload: {
        resultId, reasonCode: 'OUTCOME_DISPUTED',
        statement: 'private-statement-after-irreversible-waiver',
      },
    } satisfies CommandEnvelope<SubmitResultAppealPayload>, deniedAppealIds,
    () => new Date('2026-10-03T12:11:00.000Z'))).rejects
      .toMatchObject<Partial<ResultConflictError>>({ code: 'RESULT_APPEAL_ALREADY_WAIVED' });

    const snapshotAfter = await sql<{ readonly document: unknown }>`
      select to_jsonb(snapshot) as document
      from scheduling.session_competitive_snapshots snapshot
      where snapshot_id = ${snapshotId}::uuid
    `.execute(database);
    expect(snapshotAfter.rows).toEqual(snapshotBefore.rows);
    const facts = await sql<{
      readonly result_state: string;
      readonly result_version: string;
      readonly recorded_outcome_code: string;
      readonly winner_user_id: string;
      readonly loser_user_id: string;
      readonly challenge_state: string;
      readonly challenge_version: string;
      readonly champion_user_id: string | null;
      readonly contender_user_id: string;
      readonly status_version: string;
      readonly status_lock_result_id: string | null;
      readonly waiver_count: string;
      readonly waiver_user_id: string;
      readonly waiver_reason: string;
      readonly waived_at: Date;
      readonly appeal_count: string;
      readonly transition_count: string;
      readonly finalization_count: string;
      readonly cooldown_count: string;
      readonly cooldown_invalidated_at: Date | null;
      readonly active_obligation_count: string;
      readonly released_obligation_count: string;
      readonly result_finalized_event_count: string;
      readonly waiver_event_count: string;
      readonly challenge_completed_event_count: string;
      readonly audit_count: string;
      readonly outbox_count: string;
      readonly idempotency_count: string;
    }>`
      select result.state as result_state, result.version::text as result_version,
        result.recorded_outcome_code, result.winner_user_id, result.loser_user_id,
        challenge.state as challenge_state, challenge.version::text as challenge_version,
        competition.champion_user_id, competition.contender_user_id,
        competition.status_version::text as status_version,
        competition.status_lock_result_id,
        (select count(*)::text from competition.appeal_waivers waiver
          where waiver.result_id = result.result_id) as waiver_count,
        waiver.user_id as waiver_user_id, waiver.reason_context as waiver_reason,
        waiver.waived_at,
        (select count(*)::text from competition.appeals appeal
          where appeal.result_id = result.result_id) as appeal_count,
        (select count(*)::text from competition.status_transitions transition
          where transition.source_result_id = result.result_id) as transition_count,
        (select count(*)::text from competition.status_transition_finalizations finalization
          where finalization.result_id = result.result_id) as finalization_count,
        (select count(*)::text from competition.pair_cooldowns cooldown
          where cooldown.source_result_id = result.result_id) as cooldown_count,
        cooldown.invalidated_at as cooldown_invalidated_at,
        (select count(*)::text from competition.challenge_participant_obligations obligation
          where obligation.challenge_id = challenge.challenge_id
            and obligation.released_at is null) as active_obligation_count,
        (select count(*)::text from competition.challenge_participant_obligations obligation
          where obligation.challenge_id = challenge.challenge_id
            and obligation.release_reason = 'RESULT_FINAL') as released_obligation_count,
        (select count(*)::text from platform.domain_events event
          where event.event_id = ${accepted.ids.eventId}::uuid
            and event.event_name = 'ResultFinalized') as result_finalized_event_count,
        (select count(*)::text from platform.domain_events event
          where event.event_id = ${accepted.ids.waiverEventId}::uuid
            and event.event_name = 'AppealWaived') as waiver_event_count,
        (select count(*)::text from platform.domain_events event
          where event.event_id = ${accepted.ids.challengeEventId}::uuid
            and event.event_name = 'ChallengeCompleted') as challenge_completed_event_count,
        (select count(*)::text from platform.audit_events audit
          where audit.audit_id = ${accepted.ids.auditId}::uuid
            and audit.action = 'FINALIZE_RESULT') as audit_count,
        (select count(*)::text from platform.outbox_messages outbox
          where outbox.message_id in (${accepted.ids.outboxMessageId}::uuid,
            ${accepted.ids.notificationOutboxMessageId}::uuid)) as outbox_count,
        (select count(*)::text from platform.idempotency_records idempotency
          where idempotency.event_id = ${accepted.ids.eventId}::uuid) as idempotency_count
      from competition.results result
      join competition.challenges challenge on challenge.challenge_id = result.challenge_id
      join competition.competitions competition
        on competition.competition_id = challenge.competition_id
      join competition.appeal_waivers waiver on waiver.result_id = result.result_id
      join competition.pair_cooldowns cooldown on cooldown.source_result_id = result.result_id
      where result.result_id = ${resultId}::uuid
    `.execute(database);
    expect(facts.rows[0]).toEqual({
      result_state: 'FINAL', result_version: '2', recorded_outcome_code: 'WIN_B',
      winner_user_id: fixture.athleteB, loser_user_id: fixture.athleteA,
      challenge_state: 'COMPLETED', challenge_version: '6', champion_user_id: null,
      contender_user_id: fixture.athleteB, status_version: '3', status_lock_result_id: null,
      waiver_count: '1', waiver_user_id: fixture.athleteA,
      waiver_reason: 'EARLY_UNLOCK', waived_at: waivedAt, appeal_count: '0',
      transition_count: '1', finalization_count: '1', cooldown_count: '1',
      cooldown_invalidated_at: null, active_obligation_count: '0',
      released_obligation_count: '2', result_finalized_event_count: '1',
      waiver_event_count: '1', challenge_completed_event_count: '1',
      audit_count: '1', outbox_count: '2', idempotency_count: '1',
    });
    await expect(readResult(
      database, resultId, fixture.athleteA, new Date('2026-10-03T12:12:00.000Z'),
    )).resolves.toMatchObject({
      state: 'FINAL', viewerCanAppeal: false, viewerCanWaiveAppeal: false,
    });
    const failedEffects = await sql<{ readonly effect_count: string }>`
      select (
        (select count(*) from competition.appeals
          where appeal_id = ${deniedAppealIds.appealId}::uuid)
        + (select count(*) from platform.domain_events
          where event_id in (${staleWaiver.ids.eventId}::uuid, ${deniedAppealIds.eventId}::uuid))
        + (select count(*) from platform.audit_events
          where audit_id in (${staleWaiver.ids.auditId}::uuid, ${deniedAppealIds.auditId}::uuid))
        + (select count(*) from platform.outbox_messages
          where message_id in (${staleWaiver.ids.outboxMessageId}::uuid,
            ${deniedAppealIds.outboxMessageId}::uuid,
            ${deniedAppealIds.notificationOutboxMessageId}::uuid))
      )::text as effect_count
    `.execute(database);
    expect(failedEffects.rows[0]?.effect_count).toBe('0');
    expect(JSON.stringify(await sql<{ readonly document: unknown }>`
      select payload as document from platform.domain_events
        where metadata ->> 'commandId' = ${accepted.command.commandId}
      union all
      select payload as document from platform.outbox_messages
        where message_id in (${accepted.ids.outboxMessageId}::uuid,
          ${accepted.ids.notificationOutboxMessageId}::uuid)
    `.execute(database))).not.toContain('private-statement-after-irreversible-waiver');
    await expect(sql`
      update competition.appeal_waivers set reason_context = 'MEMBERSHIP_RESIGNATION'
      where waiver_id = ${accepted.ids.waiverId}::uuid
    `.execute(database)).rejects.toThrow(/append-only/);
  });

  it('[AC-143] rebuilds the Competition projection from its canonical event journal', async () => {
    const base = 42000;
    const fixture = await seedConfirmedTrainingForConversion(base);
    const central = testId(base + 3);
    const genesisEventId = testId(42040);
    const contenderEventId = testId(42041);
    const cooldownId = testId(42042);
    const cooldownEventId = testId(42043);
    const finalizationEventId = testId(42047);
    const genesisAt = '2026-10-02T10:00:00.000Z';
    const contenderAt = '2026-10-02T11:00:00.000Z';
    const finalizationAt = '2026-10-02T11:30:00.000Z';
    const cooldownAt = '2026-10-02T12:00:00.000Z';
    const cooldownEndsAt = '2026-10-17T12:00:00.000Z';

    await sql`
      insert into platform.domain_events (
        event_id, event_name, event_version, aggregate_type, aggregate_id,
        aggregate_version, transition_id, correlation_id, causation_id, actor_id,
        occurred_at, payload, idempotency_key_hash
      ) values
        (${genesisEventId}::uuid, 'GenesisWithoutOpponent', 1, 'Competition',
          ${fixture.competition}::uuid, 2, 'C-03', ${testId(42044)}::uuid, null,
          ${central}::uuid, ${genesisAt}::timestamptz,
          ${JSON.stringify({ userId: fixture.athleteA, assignedStatus: 'CHAMPION',
            statusVersion: 1, phase: 'RUNNING', noOpponent: true })}::jsonb,
          'fixture:ac-143:genesis'),
        (${contenderEventId}::uuid, 'ContenderAssigned', 1, 'Competition',
          ${fixture.competition}::uuid, 3, 'ST-04', ${testId(42045)}::uuid,
          ${genesisEventId}::uuid, ${central}::uuid, ${contenderAt}::timestamptz,
          ${JSON.stringify({
            before: { championUserId: fixture.athleteA, contenderUserId: null, statusVersion: 1 },
            after: { championUserId: fixture.athleteA,
              contenderUserId: fixture.athleteB, statusVersion: 2 },
            sourceResultId: testId(42048), transitionType: 'CONTENDER_ASSIGNED', provisional: true,
          })}::jsonb, 'fixture:ac-143:contender'),
        (${finalizationEventId}::uuid, 'StatusTransitionFinalized', 1, 'Competition',
          ${fixture.competition}::uuid, 4, 'ST-13', ${testId(42049)}::uuid,
          ${contenderEventId}::uuid, ${central}::uuid, ${finalizationAt}::timestamptz,
          ${JSON.stringify({ resultId: testId(42048), transitionId: testId(42049) })}::jsonb,
          'fixture:ac-143:finalization'),
        (${cooldownEventId}::uuid, 'PairCooldownStarted', 1, 'PairCooldown',
          ${cooldownId}::uuid, 1, 'CD-01', ${testId(42046)}::uuid,
          ${contenderEventId}::uuid, ${central}::uuid, ${cooldownAt}::timestamptz,
          ${JSON.stringify({ cooldownId, competitionId: fixture.competition,
            participantIds: [fixture.athleteA, fixture.athleteB], sourceResultId: null,
            startedAt: cooldownAt, endsAt: cooldownEndsAt })}::jsonb,
          'fixture:ac-143:cooldown')
    `.execute(database);
    await sql`
      update competition.competitions
      set phase = 'RUNNING', champion_user_id = ${fixture.athleteA}::uuid,
        contender_user_id = ${fixture.athleteB}::uuid, status_version = 3,
        status_lock_result_id = null, version = 4,
        updated_at = ${cooldownAt}::timestamptz
      where competition_id = ${fixture.competition}::uuid
    `.execute(database);
    await sql`
      insert into competition.pair_cooldowns (
        cooldown_id, competition_id, pair_low_id, pair_high_id,
        source_result_id, started_at, ends_at
      ) values (
        ${cooldownId}::uuid, ${fixture.competition}::uuid,
        least(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid),
        greatest(${fixture.athleteA}::uuid, ${fixture.athleteB}::uuid),
        null, ${cooldownAt}::timestamptz, ${cooldownEndsAt}::timestamptz
      )
    `.execute(database);

    const before = await readCompetitionProjection(database, fixture.competition);
    expect(before).toMatchObject({
      championUserId: fixture.athleteA,
      contenderUserId: fixture.athleteB,
      statusVersion: 3,
      statusLockResultId: null,
      sourceEventCount: 5,
      tenures: [
        { status: 'CHAMPION', userId: fixture.athleteA, provisional: false, endedAt: null },
        { status: 'CONTENDER', userId: fixture.athleteB, provisional: false, endedAt: null },
      ],
      cooldowns: [{
        cooldownId, sourceResultId: null, startedAt: cooldownAt,
        endsAt: cooldownEndsAt, invalidatedAt: null,
      }],
    });
    expect(before?.projectionHash).toMatch(/^[0-9a-f]{64}$/);

    await expect(rebuildCompetitionProjection(
      database,
      {
        commandId: testId(42050), commandType: 'REBUILD_COMPETITION_PROJECTION',
        idempotencyKey: 'ac-143-rebuild-unauthorized',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Competition', aggregateId: fixture.competition, expectedVersion: 4,
        correlationId: testId(42051), causationId: null, requestId: testId(42052),
        source: 'api', payloadVersion: 1,
        payload: { competitionId: fixture.competition, reason: 'Attempt outside Central scope' },
      } satisfies CommandEnvelope<RebuildCompetitionProjectionPayload>,
      { eventId: testId(42053), auditId: testId(42054), outboxMessageId: testId(42055) },
      () => new Date('2026-10-02T12:30:00.000Z'),
    )).rejects.toMatchObject({ code: 'COMPETITION_PROJECTION_PERMISSION_DENIED' });

    await sql`
      update competition.competitions
      set champion_user_id = null, contender_user_id = null,
        status_version = 0, status_lock_result_id = null
      where competition_id = ${fixture.competition}::uuid
    `.execute(database);
    await sql`delete from competition.pair_cooldowns
      where competition_id = ${fixture.competition}::uuid`.execute(database);
    const deleted = await readCompetitionProjection(database, fixture.competition);
    expect(deleted).toMatchObject({
      championUserId: null, contenderUserId: null, statusVersion: 0, cooldowns: [],
    });
    expect(deleted?.projectionHash).not.toBe(before?.projectionHash);

    const privateReason = 'private-rebuild-incident-reference';
    const command = {
      commandId: testId(42100), commandType: 'REBUILD_COMPETITION_PROJECTION',
      idempotencyKey: 'ac-143-rebuild',
      actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'Competition', aggregateId: fixture.competition, expectedVersion: 4,
      correlationId: testId(42101), causationId: null, requestId: testId(42102),
      source: 'api', payloadVersion: 1,
      payload: { competitionId: fixture.competition, reason: privateReason },
    } satisfies CommandEnvelope<RebuildCompetitionProjectionPayload>;
    const effectIds = {
      eventId: testId(42103), auditId: testId(42104), outboxMessageId: testId(42105),
    };
    const rebuilt = await rebuildCompetitionProjection(
      database, command, effectIds, () => new Date('2026-10-02T13:00:00.000Z'),
    );
    expect(rebuilt.response).toMatchObject({
      championUserId: before?.championUserId,
      contenderUserId: before?.contenderUserId,
      statusVersion: before?.statusVersion,
      statusLockResultId: before?.statusLockResultId,
      tenures: before?.tenures,
      cooldowns: before?.cooldowns,
      projectionHash: before?.projectionHash,
      sourceEventCount: 5,
    });
    const after = await readCompetitionProjection(database, fixture.competition);
    expect(after).toMatchObject({
      championUserId: before?.championUserId,
      contenderUserId: before?.contenderUserId,
      statusVersion: before?.statusVersion,
      statusLockResultId: before?.statusLockResultId,
      tenures: before?.tenures,
      cooldowns: before?.cooldowns,
      projectionHash: before?.projectionHash,
    });
    expect(after?.sourceEventCount).toBe(6);

    await expect(rebuildCompetitionProjection(
      database, command, effectIds, () => new Date('2026-10-02T13:01:00.000Z'),
    )).resolves.toMatchObject({ replayed: true, eventId: effectIds.eventId });
    await expect(rebuildCompetitionProjection(
      database,
      {
        ...command, commandId: testId(42110), idempotencyKey: 'ac-143-stale-rebuild',
        requestId: testId(42111),
      },
      { eventId: testId(42112), auditId: testId(42113), outboxMessageId: testId(42114) },
      () => new Date('2026-10-02T13:02:00.000Z'),
    )).rejects.toBeInstanceOf(VersionConflictError);

    const facts = await sql<{
      readonly canonical_events: string;
      readonly rebuild_events: string;
      readonly audits: string;
      readonly outbox: string;
      readonly idempotency: string;
      readonly audit_document: unknown;
      readonly public_documents: unknown;
    }>`
      select
        (select count(*)::text from platform.domain_events
          where event_id in (${genesisEventId}::uuid, ${contenderEventId}::uuid,
            ${finalizationEventId}::uuid, ${cooldownEventId}::uuid)) as canonical_events,
        (select count(*)::text from platform.domain_events
          where event_id = ${effectIds.eventId}::uuid) as rebuild_events,
        (select count(*)::text from platform.audit_events
          where audit_id = ${effectIds.auditId}::uuid) as audits,
        (select count(*)::text from platform.outbox_messages
          where message_id = ${effectIds.outboxMessageId}::uuid) as outbox,
        (select count(*)::text from platform.idempotency_records
          where event_id = ${effectIds.eventId}::uuid) as idempotency,
        (select metadata from platform.audit_events
          where audit_id = ${effectIds.auditId}::uuid) as audit_document,
        jsonb_build_array(
          (select payload from platform.domain_events where event_id = ${effectIds.eventId}::uuid),
          (select payload from platform.outbox_messages
            where message_id = ${effectIds.outboxMessageId}::uuid)
        ) as public_documents
    `.execute(database);
    expect(facts.rows[0]).toMatchObject({
      canonical_events: '4', rebuild_events: '1', audits: '1', outbox: '1', idempotency: '1',
    });
    expect(JSON.stringify(facts.rows[0]?.audit_document)).toContain(privateReason);
    expect(JSON.stringify(facts.rows[0]?.public_documents)).not.toContain(privateReason);
  });

  it('[AC-106][AC-108][AC-186] releases only the status and preserves Membership plus FIFO', async () => {
    const champion = testId(15700);
    const contender = testId(15701);
    const queuedAthlete = testId(15702);
    const central = testId(15703);
    const venue = testId(15704);
    const community = testId(15705);
    const competition = testId(15706);
    const queueEntry = testId(15707);
    const releaseId = testId(15708);
    const confirmationToken = testId(15709);
    const occurredAt = '2026-09-28T10:00:00.000Z';

    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values
        (${champion}::uuid, '+79991570000', ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'Чемпион', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${contender}::uuid, '+79991570001', ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'Претендент', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${queuedAthlete}::uuid, '+79991570002', ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'Кандидат', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${central}::uuid, '+79991570003', ${occurredAt}::timestamptz, '1985-01-01', 'ADULT', 'Central', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz)
    `.execute(database);
    await sql`
      insert into identity.account_verifications (
        verification_id, user_id, state, method, moderation_checklist_version,
        is_current, verified_at, decided_by, decision_reason, version
      ) values (
        ${testId(15716)}::uuid, ${queuedAthlete}::uuid, 'VERIFIED',
        'CENTRAL_MODERATION', 'identity-mvp-v1', true,
        ${occurredAt}::timestamptz, ${central}::uuid, 'TEST_APPROVED', 1
      )
    `.execute(database);
    await ensureLocalPilotCommunity(database, {
      venueId: venue,
      venueConfigurationId: testId(15710),
      communityId: community,
      communityConfigurationId: testId(15711),
      membershipId: testId(15712),
      centralGrantId: testId(15713),
      athleteUserId: champion,
      centralActorId: central,
      legalName: 'Status Release Pilot LLC',
      venueDisplayName: 'Status Release Pilot',
      communityName: 'Status Release Community',
      address: 'Москва',
      cityCode: 'MOSCOW',
      timezone: 'Europe/Moscow',
      contactPayload: { phone: '+79990000570' },
      occurredAt,
    });
    await ensureLocalPilotCompetition(database, {
      competitionId: competition,
      communityId: community,
      centralActorId: central,
      occurredAt,
      memberships: [
        { membershipId: testId(15712), userId: champion },
        { membershipId: testId(15714), userId: contender },
        { membershipId: testId(15715), userId: queuedAthlete },
      ],
    });
    await sql`
      update competition.competitions
      set phase = 'RUNNING', champion_user_id = ${champion}::uuid,
        contender_user_id = ${contender}::uuid, status_version = 7, version = 8
      where competition_id = ${competition}::uuid
    `.execute(database);
    const submitted = await submitStatusQueueEntry(
      database,
      {
        commandId: testId(15740), commandType: 'SUBMIT_STATUS_QUEUE_ENTRY',
        idempotencyKey: `status-release-queue-${queueEntry}`,
        actor: { type: 'USER', id: queuedAthlete, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'ChallengeQueueEntry', aggregateId: queueEntry,
        expectedVersion: 0, correlationId: testId(15741), causationId: null,
        requestId: testId(15742), source: 'api', payloadVersion: 1,
        payload: { competitionId: competition },
      } satisfies CommandEnvelope<SubmitStatusQueueEntryPayload>,
      {
        eventId: testId(15743), auditId: testId(15744), outboxMessageId: testId(15745),
        challengeId: testId(15746), challengeEventId: testId(15747),
        serviceChatId: testId(15748), serviceChatEventId: testId(15749),
        rulesetSnapshotId: testId(15750), acknowledgmentId: testId(15751),
        pairedQueueEventId: testId(15752), timerOutboxMessageId: testId(15753),
        staleQueueEventId: testId(15754), staleQueueOutboxMessageId: testId(15755),
        notificationOutboxMessageId: testId(15756),
        notificationIds: [testId(15757), testId(15758)],
      },
    );
    const originalSubmittedAt = submitted.response.submittedAt;

    const preview = await previewStatusRelease(
      database,
      {
        commandId: testId(15720), commandType: 'PREVIEW_STATUS_RELEASE',
        idempotencyKey: `preview-status-release-${releaseId}`,
        actor: { type: 'USER', id: contender, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'VoluntaryStatusRelease', aggregateId: releaseId,
        expectedVersion: 0, correlationId: testId(15721), causationId: null,
        requestId: testId(15722), source: 'api', payloadVersion: 1,
        payload: { competitionId: competition },
      } satisfies CommandEnvelope<PreviewStatusReleasePayload>,
      {
        eventId: testId(15723), auditId: testId(15724), outboxMessageId: testId(15725),
        competitionEventId: testId(15726), notificationOutboxMessageId: testId(15727),
        notificationIds: [testId(15728), testId(15729)],
      },
      confirmationToken,
      () => new Date('2026-09-28T11:00:00.000Z'),
    );
    expect(preview.response).toMatchObject({
      releasedStatus: 'CONTENDER',
      consequence: 'CONTENDER_VACANCY',
      state: 'PREVIEWED',
      beforeStatusVersion: 7,
      confirmationToken,
      membershipRemainsActive: true,
      createsResult: false,
      createsLoss: false,
      createsCooldown: false,
      version: 1,
    });

    const confirmed = await confirmStatusRelease(
      database,
      {
        commandId: testId(15730), commandType: 'CONFIRM_STATUS_RELEASE',
        idempotencyKey: `confirm-status-release-${releaseId}`,
        actor: { type: 'USER', id: contender, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'VoluntaryStatusRelease', aggregateId: releaseId,
        expectedVersion: 1, correlationId: testId(15731), causationId: testId(15723),
        requestId: testId(15732), source: 'api', payloadVersion: 1,
        payload: { releaseId, confirmationToken },
      } satisfies CommandEnvelope<ConfirmStatusReleasePayload>,
      {
        eventId: testId(15733), auditId: testId(15734), outboxMessageId: testId(15735),
        competitionEventId: testId(15736), notificationOutboxMessageId: testId(15737),
        notificationIds: [testId(15738), testId(15739)],
      },
      () => new Date('2026-09-28T11:05:00.000Z'),
    );
    expect(confirmed.response).toMatchObject({
      state: 'CONFIRMED',
      confirmationToken: null,
      afterStatusVersion: 8,
      version: 2,
    });

    const competitionRow = await sql<{
      readonly champion_user_id: string;
      readonly contender_user_id: string | null;
      readonly phase: string;
      readonly status_version: string;
    }>`
      select champion_user_id, contender_user_id, phase, status_version::text
      from competition.competitions where competition_id = ${competition}::uuid
    `.execute(database);
    expect(competitionRow.rows[0]).toEqual({
      champion_user_id: champion,
      contender_user_id: null,
      phase: 'CONTENDER_VACANT_OPEN',
      status_version: '8',
    });
    const queueRow = await sql<{
      readonly kind: string;
      readonly state: string;
      readonly target_status: string;
      readonly bound_holder_user_id: string | null;
      readonly submitted_at: Date;
      readonly version: string;
    }>`
      select kind, state, target_status, bound_holder_user_id, submitted_at, version::text
      from competition.challenge_queue_entries where queue_entry_id = ${queueEntry}::uuid
    `.execute(database);
    expect(queueRow.rows[0]).toEqual({
      kind: 'GENESIS_CANDIDATE',
      state: 'WAITING',
      target_status: 'CONTENDER',
      bound_holder_user_id: null,
      submitted_at: new Date(originalSubmittedAt),
      version: '1',
    });
    const membership = await sql<{ readonly state: string }>`
      select state from community.community_memberships
      where community_id = ${community}::uuid and user_id = ${contender}::uuid
    `.execute(database);
    expect(membership.rows[0]?.state).toBe('ACTIVE');

    await expect(readVacancyQueueReconciliationCandidate(database, competition))
      .resolves.toEqual({
        competitionId: competition,
        queueEntryId: queueEntry,
        version: 1,
        action: 'START_SINGLE_WINDOW',
      });
    const singleWindow = await reconcileVacancyQueue(
      database,
      {
        commandId: testId(15760), commandType: 'RECONCILE_VACANCY_QUEUE',
        idempotencyKey: `start-single-window-${queueEntry}-v1`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'ChallengeQueueEntry', aggregateId: queueEntry,
        expectedVersion: 1, correlationId: testId(15761), causationId: testId(15733),
        requestId: testId(15762), source: 'scheduler', payloadVersion: 1,
        payload: {
          competitionId: competition,
          queueEntryId: queueEntry,
          action: 'START_SINGLE_WINDOW',
        },
      } satisfies CommandEnvelope<ReconcileVacancyQueuePayload>,
      {
        eventId: testId(15763), auditId: testId(15764), outboxMessageId: testId(15765),
        challengeId: testId(15766), challengeEventId: testId(15767),
        serviceChatId: testId(15768), serviceChatEventId: testId(15769),
        rulesetSnapshotId: testId(15770), acknowledgmentId: testId(15771),
        pairedQueueEventId: testId(15772), timerOutboxMessageId: testId(15773),
        staleQueueEventId: testId(15774), staleQueueOutboxMessageId: testId(15775),
        notificationOutboxMessageId: testId(15776),
        notificationIds: [testId(15777), testId(15778)],
      },
      () => new Date('2026-09-28T11:06:00.000Z'),
    );
    expect(singleWindow.response).toMatchObject({
      queueEntryId: queueEntry,
      state: 'WAITING',
      submittedAt: originalSubmittedAt,
      version: 2,
    });
    await expect(readVacancyQueueReconciliationCandidate(database, competition))
      .resolves.toBeNull();

    const promoted = await promoteSingleGenesisCandidate(
      database,
      {
        commandId: testId(15780), commandType: 'PROMOTE_SINGLE_GENESIS_CANDIDATE',
        idempotencyKey: `single-promote-${queueEntry}-v2`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'ChallengeQueueEntry', aggregateId: queueEntry,
        expectedVersion: 2, correlationId: testId(15781), causationId: testId(15763),
        requestId: testId(15782), source: 'scheduler', payloadVersion: 1,
        payload: { queueEntryId: queueEntry },
      } satisfies CommandEnvelope<PromoteSingleGenesisCandidatePayload>,
      {
        eventId: testId(15783), auditId: testId(15784), outboxMessageId: testId(15785),
        statusEventId: testId(15786), notificationOutboxMessageId: testId(15787),
        notificationId: testId(15788),
      },
      () => new Date('2026-10-01T11:06:00.000Z'),
    );
    expect(promoted.response).toMatchObject({
      queueEntryId: queueEntry,
      state: 'CONSUMED',
      submittedAt: originalSubmittedAt,
      version: 3,
    });
    const promotedCompetition = await sql<{
      readonly champion_user_id: string;
      readonly contender_user_id: string;
      readonly phase: string;
      readonly status_version: string;
    }>`
      select champion_user_id, contender_user_id, phase, status_version::text
      from competition.competitions where competition_id = ${competition}::uuid
    `.execute(database);
    expect(promotedCompetition.rows[0]).toEqual({
      champion_user_id: champion,
      contender_user_id: queuedAthlete,
      phase: 'RUNNING',
      status_version: '9',
    });
    const sideEffects = await sql<{
      readonly results: string;
      readonly cooldowns: string;
    }>`
      select
        (select count(*)::text from competition.results) as results,
        (select count(*)::text from competition.pair_cooldowns) as cooldowns
    `.execute(database);
    expect(sideEffects.rows[0]).toEqual({ results: '0', cooldowns: '0' });
  });

  it('[AC-093] pairs the first two preserved FIFO candidates after a status vacancy', async () => {
    const champion = testId(15800);
    const contender = testId(15801);
    const candidateA = testId(15802);
    const candidateB = testId(15803);
    const central = testId(15804);
    const venue = testId(15805);
    const community = testId(15806);
    const competition = testId(15807);
    const entryA = testId(15808);
    const entryB = testId(15809);
    const releaseId = testId(15810);
    const confirmationToken = testId(15811);
    const occurredAt = '2026-09-28T10:00:00.000Z';
    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values
        (${champion}::uuid, '+79991580000', ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'Чемпион 2', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${contender}::uuid, '+79991580001', ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'Претендент 2', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${candidateA}::uuid, '+79991580002', ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'Кандидат А', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${candidateB}::uuid, '+79991580003', ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'Кандидат Б', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${central}::uuid, '+79991580004', ${occurredAt}::timestamptz, '1985-01-01', 'ADULT', 'Central 2', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz)
    `.execute(database);
    await sql`
      insert into identity.account_verifications (
        verification_id, user_id, state, method, moderation_checklist_version,
        is_current, verified_at, decided_by, decision_reason, version
      ) values
        (${testId(15812)}::uuid, ${candidateA}::uuid, 'VERIFIED', 'CENTRAL_MODERATION', 'identity-mvp-v1', true, ${occurredAt}::timestamptz, ${central}::uuid, 'TEST_APPROVED', 1),
        (${testId(15813)}::uuid, ${candidateB}::uuid, 'VERIFIED', 'CENTRAL_MODERATION', 'identity-mvp-v1', true, ${occurredAt}::timestamptz, ${central}::uuid, 'TEST_APPROVED', 1)
    `.execute(database);
    await ensureLocalPilotCommunity(database, {
      venueId: venue, venueConfigurationId: testId(15814), communityId: community,
      communityConfigurationId: testId(15815), membershipId: testId(15816),
      centralGrantId: testId(15817), athleteUserId: champion, centralActorId: central,
      legalName: 'Vacancy Pair Pilot LLC', venueDisplayName: 'Vacancy Pair Pilot',
      communityName: 'Vacancy Pair Community', address: 'Москва', cityCode: 'MOSCOW',
      timezone: 'Europe/Moscow', contactPayload: { phone: '+79990000580' }, occurredAt,
    });
    await ensureLocalPilotCompetition(database, {
      competitionId: competition, communityId: community, centralActorId: central, occurredAt,
      memberships: [
        { membershipId: testId(15816), userId: champion },
        { membershipId: testId(15818), userId: contender },
        { membershipId: testId(15819), userId: candidateA },
        { membershipId: testId(15820), userId: candidateB },
      ],
    });
    await sql`
      update competition.competitions
      set phase = 'RUNNING', champion_user_id = ${champion}::uuid,
        contender_user_id = ${contender}::uuid, status_version = 3, version = 4
      where competition_id = ${competition}::uuid
    `.execute(database);
    const submitDirect = async (userId: string, entryId: string, offset: number) =>
      submitStatusQueueEntry(
        database,
        {
          commandId: testId(offset), commandType: 'SUBMIT_STATUS_QUEUE_ENTRY',
          idempotencyKey: `vacancy-pair-submit-${entryId}`,
          actor: { type: 'USER', id: userId, roles: ['ATHLETE'], scopeIds: [] },
          aggregateType: 'ChallengeQueueEntry', aggregateId: entryId,
          expectedVersion: 0, correlationId: testId(offset + 1), causationId: null,
          requestId: testId(offset + 2), source: 'api', payloadVersion: 1,
          payload: { competitionId: competition },
        } satisfies CommandEnvelope<SubmitStatusQueueEntryPayload>,
        {
          eventId: testId(offset + 3), auditId: testId(offset + 4),
          outboxMessageId: testId(offset + 5), challengeId: testId(offset + 6),
          challengeEventId: testId(offset + 7), serviceChatId: testId(offset + 8),
          serviceChatEventId: testId(offset + 9), rulesetSnapshotId: testId(offset + 10),
          acknowledgmentId: testId(offset + 11), pairedQueueEventId: testId(offset + 12),
          timerOutboxMessageId: testId(offset + 13), staleQueueEventId: testId(offset + 14),
          staleQueueOutboxMessageId: testId(offset + 15),
          notificationOutboxMessageId: testId(offset + 16),
          notificationIds: [testId(offset + 17), testId(offset + 18)],
        },
      );
    const first = await submitDirect(candidateA, entryA, 15830);
    const second = await submitDirect(candidateB, entryB, 15850);
    expect(first.response.kind).toBe('DIRECT_STATUS');
    expect(second.response.kind).toBe('DIRECT_STATUS');

    await previewStatusRelease(
      database,
      {
        commandId: testId(15870), commandType: 'PREVIEW_STATUS_RELEASE',
        idempotencyKey: `vacancy-pair-preview-${releaseId}`,
        actor: { type: 'USER', id: contender, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'VoluntaryStatusRelease', aggregateId: releaseId,
        expectedVersion: 0, correlationId: testId(15871), causationId: null,
        requestId: testId(15872), source: 'api', payloadVersion: 1,
        payload: { competitionId: competition },
      } satisfies CommandEnvelope<PreviewStatusReleasePayload>,
      {
        eventId: testId(15873), auditId: testId(15874), outboxMessageId: testId(15875),
        competitionEventId: testId(15876), notificationOutboxMessageId: testId(15877),
        notificationIds: [testId(15878), testId(15879)],
      },
      confirmationToken,
      () => new Date('2026-09-28T11:00:00.000Z'),
    );
    await confirmStatusRelease(
      database,
      {
        commandId: testId(15880), commandType: 'CONFIRM_STATUS_RELEASE',
        idempotencyKey: `vacancy-pair-confirm-${releaseId}`,
        actor: { type: 'USER', id: contender, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'VoluntaryStatusRelease', aggregateId: releaseId,
        expectedVersion: 1, correlationId: testId(15881), causationId: testId(15873),
        requestId: testId(15882), source: 'api', payloadVersion: 1,
        payload: { releaseId, confirmationToken },
      } satisfies CommandEnvelope<ConfirmStatusReleasePayload>,
      {
        eventId: testId(15883), auditId: testId(15884), outboxMessageId: testId(15885),
        competitionEventId: testId(15886), notificationOutboxMessageId: testId(15887),
        notificationIds: [testId(15888), testId(15889)],
      },
      () => new Date('2026-09-28T11:05:00.000Z'),
    );
    const action = await readVacancyQueueReconciliationCandidate(database, competition);
    expect(action).toMatchObject({
      competitionId: competition,
      queueEntryId: entryA,
      version: 1,
      action: 'PAIR_CANDIDATES',
    });
    const paired = await reconcileVacancyQueue(
      database,
      {
        commandId: testId(15890), commandType: 'RECONCILE_VACANCY_QUEUE',
        idempotencyKey: `vacancy-pair-${entryA}-v1`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'ChallengeQueueEntry', aggregateId: entryA,
        expectedVersion: 1, correlationId: testId(15891), causationId: testId(15883),
        requestId: testId(15892), source: 'scheduler', payloadVersion: 1,
        payload: { competitionId: competition, queueEntryId: entryA, action: 'PAIR_CANDIDATES' },
      } satisfies CommandEnvelope<ReconcileVacancyQueuePayload>,
      {
        eventId: testId(15893), auditId: testId(15894), outboxMessageId: testId(15895),
        challengeId: testId(15896), challengeEventId: testId(15897),
        serviceChatId: testId(15898), serviceChatEventId: testId(15899),
        rulesetSnapshotId: testId(15900), acknowledgmentId: testId(15901),
        pairedQueueEventId: testId(15902), timerOutboxMessageId: testId(15903),
        staleQueueEventId: testId(15904), staleQueueOutboxMessageId: testId(15905),
        notificationOutboxMessageId: testId(15906),
        notificationIds: [testId(15907), testId(15908)],
      },
      () => new Date('2026-09-28T11:06:00.000Z'),
    );
    expect(paired.response).toMatchObject({
      queueEntryId: entryA,
      state: 'PAIRED_PENDING_ACCEPTANCE',
      submittedAt: first.response.submittedAt,
      version: 2,
    });
    const pairedState = await sql<{
      readonly phase: string;
      readonly challenge_count: string;
      readonly paired_count: string;
    }>`
      select competitive.phase,
        (select count(*)::text from competition.challenges as challenge
          where challenge.competition_id = competitive.competition_id
            and challenge.response_policy = 'MUTUAL_GENESIS') as challenge_count,
        (select count(*)::text from competition.challenge_queue_entries as entry
          where entry.competition_id = competitive.competition_id
            and entry.state = 'PAIRED_PENDING_ACCEPTANCE'
            and entry.single_candidate_since_at is null) as paired_count
      from competition.competitions as competitive
      where competitive.competition_id = ${competition}::uuid
    `.execute(database);
    expect(pairedState.rows[0]).toEqual({
      phase: 'CONTENDER_GENESIS', challenge_count: '1', paired_count: '2',
    });
  });

  it('[AC-067][AC-068][AC-177] governs Community pause and permanent closure without hidden status migration', async () => {
    const athlete = testId(16000);
    const secondAthlete = testId(16001);
    const central = testId(16002);
    const coach = testId(16040);
    const venue = testId(16003);
    const community = testId(16004);
    const competition = testId(16005);
    const occurredAt = '2026-09-28T10:00:00.000Z';
    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values
        (${athlete}::uuid, '+79991600000', ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'Pause Athlete', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${secondAthlete}::uuid, '+79991600001', ${occurredAt}::timestamptz, '1994-01-01', 'ADULT', 'Cooldown Athlete', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${central}::uuid, '+79991600002', ${occurredAt}::timestamptz, '1985-01-01', 'ADULT', 'Pause Central', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${coach}::uuid, '+79991600040', ${occurredAt}::timestamptz, '1987-01-01', 'ADULT', 'Pause Coach', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz)
    `.execute(database);
    await sql`
      insert into identity.account_verifications (
        verification_id, user_id, state, method, moderation_checklist_version,
        is_current, verified_at, decided_by, decision_reason, version
      ) values (
        ${testId(16006)}::uuid, ${athlete}::uuid, 'VERIFIED', 'CENTRAL_MODERATION',
        'identity-mvp-v1', true, ${occurredAt}::timestamptz, ${central}::uuid,
        'TEST_APPROVED', 1
      )
    `.execute(database);
    await ensureLocalPilotCommunity(database, {
      venueId: venue,
      venueConfigurationId: testId(16007),
      communityId: community,
      communityConfigurationId: testId(16008),
      membershipId: testId(16009),
      centralGrantId: testId(16010),
      athleteUserId: athlete,
      centralActorId: central,
      legalName: 'Pause Pilot LLC',
      venueDisplayName: 'Pause Pilot',
      communityName: 'Pause Community',
      address: 'Москва',
      cityCode: 'MOSCOW',
      timezone: 'Europe/Moscow',
      contactPayload: { phone: '+79990000600' },
      occurredAt,
    });
    await ensureLocalPilotCompetition(database, {
      competitionId: competition,
      communityId: community,
      centralActorId: central,
      occurredAt,
      memberships: [
        { membershipId: testId(16009), userId: athlete },
        { membershipId: testId(16011), userId: secondAthlete },
      ],
    });
    const challenge = testId(16036);
    await sql`
      insert into social.chats (chat_id, scope, state, version, created_at, updated_at)
      values
        (${testId(16037)}::uuid, 'PERSONAL_MATCH', 'OPEN', 1, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz),
        (${testId(16038)}::uuid, 'CHALLENGE_SERVICE', 'OPEN', 1, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz)
    `.execute(database);
    await sql`
      insert into competition.ruleset_snapshots (
        ruleset_snapshot_id, competition_id, community_configuration_id,
        ruleset_ref, ruleset_ack_mode, policy_version, created_at
      ) values (
        ${testId(16039)}::uuid, ${competition}::uuid, ${testId(16008)}::uuid,
        'MOLOKH_RECOMMENDED_V1', 'IMPLICIT_ON_ACCEPT', 'challenge-mvp-v1',
        ${occurredAt}::timestamptz
      )
    `.execute(database);
    await sql`
      insert into competition.challenges (
        challenge_id, competition_id, source_chat_id, service_chat_id,
        initiator_user_id, recipient_user_id, pair_low_id, pair_high_id,
        response_policy, stake, state, ruleset_snapshot_id, response_deadline_at,
        version, created_at, updated_at
      ) values (
        ${challenge}::uuid, ${competition}::uuid, ${testId(16037)}::uuid,
        ${testId(16038)}::uuid, ${athlete}::uuid, ${secondAthlete}::uuid,
        ${athlete}::uuid, ${secondAthlete}::uuid, 'OPTIONAL', 'NONE',
        'AWAITING_RESPONSE', ${testId(16039)}::uuid,
        '2026-09-30T12:00:00.000Z'::timestamptz, 1,
        ${occurredAt}::timestamptz, ${occurredAt}::timestamptz
      )
    `.execute(database);
    const match = testId(16041);
    const slot = testId(16042);
    const booking = testId(16043);
    const session = testId(16044);
    await sql`
      insert into social.matches (
        match_id, pair_low_id, pair_high_id, state, chat_id,
        last_activity_at, version, created_at, updated_at
      ) values (
        ${match}::uuid, ${athlete}::uuid, ${secondAthlete}::uuid, 'ACTIVE',
        ${testId(16037)}::uuid, ${occurredAt}::timestamptz, 1,
        ${occurredAt}::timestamptz, ${occurredAt}::timestamptz
      )
    `.execute(database);
    await sql`
      insert into scheduling.slots (
        slot_id, venue_id, coach_user_id, start_at, end_at, slot_type, state,
        price_text, cancellation_terms_text, commercial_version,
        published_by, version, created_at, updated_at
      ) values (
        ${slot}::uuid, ${venue}::uuid, ${coach}::uuid,
        '2026-10-02T10:00:00.000Z'::timestamptz,
        '2026-10-02T11:00:00.000Z'::timestamptz,
        'PERSONAL', 'PUBLISHED', 'Тест', 'Без штрафа', 1,
        ${central}::uuid, 1, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz
      )
    `.execute(database);
    await sql`
      insert into scheduling.bookings (
        booking_id, chat_id, match_id, slot_id, pair_low_id, pair_high_id,
        purpose, state, initiated_by, selected_by_low_at, selected_by_high_at,
        selection_expires_at, host_confirmation_deadline_at,
        commercial_terms_snapshot, host_confirmed_by, host_confirmed_at,
        version, created_at, updated_at
      ) values (
        ${booking}::uuid, ${testId(16037)}::uuid, ${match}::uuid, ${slot}::uuid,
        ${athlete}::uuid, ${secondAthlete}::uuid, 'TRAINING', 'CONFIRMED_PAIR',
        ${athlete}::uuid, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz,
        '2026-09-29T10:00:00.000Z'::timestamptz,
        '2026-10-02T02:00:00.000Z'::timestamptz,
        '{"priceText":"Тест"}'::jsonb, ${coach}::uuid, ${occurredAt}::timestamptz,
        3, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz
      )
    `.execute(database);
    await sql`
      update scheduling.slots set state = 'BOOKED', booking_id = ${booking}::uuid
      where slot_id = ${slot}::uuid
    `.execute(database);
    await sql`
      insert into scheduling.sessions (
        session_id, booking_id, venue_id, coach_user_id, pair_low_id, pair_high_id,
        purpose, state, scheduled_start_at, scheduled_end_at,
        commercial_terms_snapshot, version, created_at, updated_at
      ) values (
        ${session}::uuid, ${booking}::uuid, ${venue}::uuid, ${coach}::uuid,
        ${athlete}::uuid, ${secondAthlete}::uuid, 'TRAINING', 'SCHEDULED',
        '2026-10-02T10:00:00.000Z'::timestamptz,
        '2026-10-02T11:00:00.000Z'::timestamptz,
        '{"priceText":"Тест"}'::jsonb, 1,
        ${occurredAt}::timestamptz, ${occurredAt}::timestamptz
      )
    `.execute(database);
    await sql`
      insert into competition.pair_cooldowns (
        cooldown_id, competition_id, pair_low_id, pair_high_id,
        source_result_id, started_at, ends_at
      ) values (
        ${testId(16012)}::uuid, ${competition}::uuid,
        ${athlete}::uuid, ${secondAthlete}::uuid, null,
        '2026-09-25T10:00:00.000Z'::timestamptz,
        '2026-10-10T10:00:00.000Z'::timestamptz
      )
    `.execute(database);

    const pauseCommand = {
      commandId: testId(16013),
      commandType: 'PAUSE_COMMUNITY',
      idempotencyKey: `pause-community-${community}`,
      actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'Community', aggregateId: community, expectedVersion: 1,
      correlationId: testId(16014), causationId: null, requestId: testId(16015),
      source: 'api', payloadVersion: 1,
      payload: { communityId: community, reason: 'Плановые работы' },
    } satisfies CommandEnvelope<PauseCommunityPayload>;
    const pauseIds = {
      eventId: testId(16016), auditId: testId(16017), outboxMessageId: testId(16018),
      pauseId: testId(16019), competitionEventIds: [testId(16020)],
    };

    await expect(pauseCommunity(
      database,
      {
        ...pauseCommand,
        commandId: testId(16021),
        idempotencyKey: `pause-community-denied-${community}`,
        actor: { type: 'USER', id: athlete, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
        correlationId: testId(16022), requestId: testId(16023),
      },
      {
        ...pauseIds,
        eventId: testId(16024), auditId: testId(16025),
        outboxMessageId: testId(16026), pauseId: testId(16027),
        competitionEventIds: [testId(16028)],
      },
      () => new Date('2026-09-28T11:00:00.000Z'),
    )).rejects.toMatchObject({ code: 'COMMUNITY_LIFECYCLE_CENTRAL_REQUIRED' });

    const paused = await pauseCommunity(
      database,
      pauseCommand,
      pauseIds,
      () => new Date('2026-09-28T12:00:00.000Z'),
    );
    expect(paused.response).toMatchObject({
      communityId: community,
      state: 'PAUSED',
      pauseStartedAt: '2026-09-28T12:00:00.000Z',
      version: 2,
      competitions: [{ competitionId: competition, availability: 'PAUSED', version: 2 }],
    });
    const pausedAccess = await readCommunityContext(database, athlete, community);
    expect(pausedAccess?.access.capabilities).not.toContain('CREATE_OFFICIAL_CHALLENGE');
    expect(pausedAccess?.access.denials).toContainEqual(expect.objectContaining({
      capability: 'CREATE_OFFICIAL_CHALLENGE', code: 'COMMUNITY_NOT_ACTIVE',
    }));
    const heldTimer = await readChallengeTimerSnapshot(database, challenge);
    expect(heldTimer).toMatchObject({ state: 'AWAITING_RESPONSE', version: 1 });
    expect(Date.parse(heldTimer.deadlineAt ?? '')).toBeGreaterThan(Date.now());

    const reactivated = await reactivateCommunity(
      database,
      {
        commandId: testId(16029), commandType: 'REACTIVATE_COMMUNITY',
        idempotencyKey: `reactivate-community-${community}`,
        actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
        aggregateType: 'Community', aggregateId: community, expectedVersion: 2,
        correlationId: testId(16030), causationId: testId(16016), requestId: testId(16031),
        source: 'api', payloadVersion: 1,
        payload: { communityId: community, reason: 'Работы завершены' },
      } satisfies CommandEnvelope<ReactivateCommunityPayload>,
      {
        eventId: testId(16032), auditId: testId(16033), outboxMessageId: testId(16034),
        pauseId: testId(16019), competitionEventIds: [testId(16035)],
      },
      () => new Date('2026-09-28T22:00:00.000Z'),
    );
    expect(reactivated.response).toMatchObject({
      state: 'ACTIVE', pauseStartedAt: null, latestPauseDurationSeconds: 36_000,
      version: 3,
      competitions: [{ competitionId: competition, availability: 'ACTIVE', version: 3 }],
    });
    expect(await readCommunityLifecycle(database, community)).toEqual(reactivated.response);
    expect(await readChallengeTimerSnapshot(database, challenge)).toEqual({
      state: 'AWAITING_RESPONSE',
      version: 1,
      deadlineAt: '2026-09-30T22:00:00.000Z',
    });

    const evidence = await sql<{
      readonly duration_seconds: string;
      readonly cooldown_ends_at: Date;
      readonly response_deadline_at: Date;
      readonly session_state: string;
      readonly session_start_at: Date;
      readonly session_version: string;
      readonly community_versions: number[];
      readonly competition_versions: number[];
    }>`
      select
        (select duration_seconds::text from community.community_pause_intervals
          where community_id = ${community}::uuid) as duration_seconds,
        (select ends_at from competition.pair_cooldowns
          where cooldown_id = ${testId(16012)}::uuid) as cooldown_ends_at,
        (select response_deadline_at from competition.challenges
          where challenge_id = ${challenge}::uuid) as response_deadline_at,
        (select state from scheduling.sessions
          where session_id = ${session}::uuid) as session_state,
        (select scheduled_start_at from scheduling.sessions
          where session_id = ${session}::uuid) as session_start_at,
        (select version::text from scheduling.sessions
          where session_id = ${session}::uuid) as session_version,
        array(select aggregate_version::integer from platform.domain_events
          where aggregate_type = 'Community' and aggregate_id = ${community}::uuid
          order by aggregate_version) as community_versions,
        array(select aggregate_version::integer from platform.domain_events
          where aggregate_type = 'Competition' and aggregate_id = ${competition}::uuid
          order by aggregate_version) as competition_versions
    `.execute(database);
    expect(evidence.rows[0]).toMatchObject({
      duration_seconds: '36000',
      session_state: 'SCHEDULED',
      session_version: '1',
      community_versions: [1, 2, 3],
      competition_versions: [1, 2, 3],
    });
    expect(evidence.rows[0]?.cooldown_ends_at.toISOString()).toBe('2026-10-10T10:00:00.000Z');
    expect(evidence.rows[0]?.response_deadline_at.toISOString()).toBe('2026-09-30T22:00:00.000Z');
    expect(evidence.rows[0]?.session_start_at.toISOString()).toBe('2026-10-02T10:00:00.000Z');

    const pendingAthlete = testId(16100);
    const pendingChallenge = testId(16103);
    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values (
        ${pendingAthlete}::uuid, '+79991600100', ${occurredAt}::timestamptz,
        '1993-01-01', 'ADULT', 'Closure Pending Athlete', 'ACTIVE', 'ru-RU', 1,
        ${occurredAt}::timestamptz
      )
    `.execute(database);
    await sql`
      insert into social.chats (chat_id, scope, state, version, created_at, updated_at)
      values
        (${testId(16101)}::uuid, 'PERSONAL_MATCH', 'OPEN', 1,
          ${occurredAt}::timestamptz, ${occurredAt}::timestamptz),
        (${testId(16102)}::uuid, 'CHALLENGE_SERVICE', 'OPEN', 1,
          ${occurredAt}::timestamptz, ${occurredAt}::timestamptz)
    `.execute(database);
    await sql`
      insert into competition.challenges (
        challenge_id, competition_id, source_chat_id, service_chat_id,
        initiator_user_id, recipient_user_id, pair_low_id, pair_high_id,
        response_policy, stake, state, ruleset_snapshot_id, response_deadline_at,
        version, created_at, updated_at
      ) values (
        ${pendingChallenge}::uuid, ${competition}::uuid, ${testId(16101)}::uuid,
        ${testId(16102)}::uuid, ${athlete}::uuid, ${pendingAthlete}::uuid,
        ${athlete}::uuid, ${pendingAthlete}::uuid, 'OPTIONAL', 'NONE',
        'AWAITING_RESPONSE', ${testId(16039)}::uuid,
        '2026-10-05T10:00:00.000Z'::timestamptz, 1,
        ${occurredAt}::timestamptz, ${occurredAt}::timestamptz
      )
    `.execute(database);
    await sql`
      update competition.challenges
      set state = 'BOOKED', accepted_at = '2026-09-29T08:00:00.000Z'::timestamptz,
        scheduling_deadline_at = '2026-10-20T08:00:00.000Z'::timestamptz,
        version = 2, updated_at = '2026-09-29T08:00:00.000Z'::timestamptz
      where challenge_id = ${challenge}::uuid
    `.execute(database);
    await sql`
      update scheduling.bookings
      set purpose = 'OFFICIAL_CHALLENGE', challenge_id = ${challenge}::uuid
      where booking_id = ${booking}::uuid
    `.execute(database);
    await sql`
      update scheduling.sessions
      set purpose = 'OFFICIAL_CHALLENGE', challenge_id = ${challenge}::uuid
      where session_id = ${session}::uuid
    `.execute(database);
    await sql`
      insert into scheduling.session_competitive_snapshots (
        snapshot_id, session_id, challenge_id, competition_id, ruleset_snapshot_id,
        community_configuration_id, planned_stake, effective_stake,
        champion_user_id, contender_user_id, competition_status_version,
        venue_id, coach_user_id, pair_low_id, pair_high_id,
        scheduled_start_at, scheduled_end_at, created_at
      ) values (
        ${testId(16104)}::uuid, ${session}::uuid, ${challenge}::uuid,
        ${competition}::uuid, ${testId(16039)}::uuid, ${testId(16008)}::uuid,
        'NONE', 'NONE', ${athlete}::uuid, null, 1,
        ${venue}::uuid, ${coach}::uuid, ${athlete}::uuid, ${secondAthlete}::uuid,
        '2026-10-02T10:00:00.000Z'::timestamptz,
        '2026-10-02T11:00:00.000Z'::timestamptz,
        '2026-09-29T08:00:00.000Z'::timestamptz
      )
    `.execute(database);
    await sql`
      update competition.competitions
      set phase = 'RUNNING', champion_user_id = ${athlete}::uuid,
        status_version = 1
      where competition_id = ${competition}::uuid
    `.execute(database);

    const closurePlan = testId(16105);
    const scheduled = await scheduleCommunityClosure(
      database,
      {
        commandId: testId(16106), commandType: 'SCHEDULE_COMMUNITY_CLOSURE',
        idempotencyKey: `schedule-community-closure-${community}`,
        actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
        aggregateType: 'Community', aggregateId: community, expectedVersion: 3,
        correlationId: testId(16107), causationId: testId(16032), requestId: testId(16108),
        source: 'admin', payloadVersion: 1,
        payload: {
          communityId: community, category: 'VENUE_EXIT',
          reason: 'Пилотный зал прекращает работу', emergency: false,
          effectiveAt: '2026-10-03T10:00:00.000Z',
          sessionDispositions: [{ sessionId: session, disposition: 'RETAIN_TO_COMPLETION' }],
        },
      } satisfies CommandEnvelope<ScheduleCommunityClosurePayload>,
      {
        planId: closurePlan, eventId: testId(16109), auditId: testId(16110),
        outboxMessageId: testId(16111), notificationOutboxMessageId: testId(16112),
        notificationIds: [testId(16113), testId(16114)],
        competitionEventIds: [testId(16115)], challengeEventIds: [testId(16116)],
        sessionEventIds: [],
      },
      () => new Date('2026-10-01T10:00:00.000Z'),
    );
    expect(scheduled.response).toMatchObject({
      planId: closurePlan, communityState: 'CLOSING', planState: 'SCHEDULED',
      retainedSessionCount: 1, cancelledSessionCount: 0, communityVersion: 4,
    });
    expect(await readCommunityClosure(database, community)).toEqual(scheduled.response);
    const scheduledEvidence = await sql<{
      readonly retained_session_state: string;
      readonly retained_challenge_state: string;
      readonly pending_challenge_state: string;
      readonly competition_availability: string;
    }>`
      select
        (select state from scheduling.sessions where session_id = ${session}::uuid)
          as retained_session_state,
        (select state from competition.challenges where challenge_id = ${challenge}::uuid)
          as retained_challenge_state,
        (select state from competition.challenges where challenge_id = ${pendingChallenge}::uuid)
          as pending_challenge_state,
        (select availability from competition.competitions
          where competition_id = ${competition}::uuid) as competition_availability
    `.execute(database);
    expect(scheduledEvidence.rows[0]).toEqual({
      retained_session_state: 'SCHEDULED', retained_challenge_state: 'BOOKED',
      pending_challenge_state: 'CANCELLED_NO_FAULT', competition_availability: 'CLOSED',
    });

    const finalizePayload = {
      communityId: community, planId: closurePlan, reason: 'Closure Plan completed',
    } satisfies FinalizeCommunityClosurePayload;
    await expect(finalizeCommunityClosure(
      database,
      {
        commandId: testId(16117), commandType: 'FINALIZE_COMMUNITY_CLOSURE',
        idempotencyKey: `finalize-community-closure-blocked-${community}`,
        actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
        aggregateType: 'Community', aggregateId: community, expectedVersion: 4,
        correlationId: testId(16118), causationId: testId(16109), requestId: testId(16119),
        source: 'admin', payloadVersion: 1, payload: finalizePayload,
      },
      {
        eventId: testId(16120), auditId: testId(16121), outboxMessageId: testId(16122),
        competitionEventIds: [testId(16123)], membershipEventIds: [testId(16124), testId(16125)],
        statusDispositionIds: [testId(16126)], statusEventIds: [testId(16127)],
        challengeEventIds: [],
      },
      () => new Date('2026-10-03T11:00:00.000Z'),
    )).rejects.toMatchObject({ code: 'COMMUNITY_CLOSURE_RETAINED_SESSION_UNRESOLVED' });

    await sql`
      update scheduling.sessions
      set state = 'CANCELLED', cancelled_at = '2026-10-03T11:30:00.000Z'::timestamptz,
        cancelled_by = ${central}::uuid, cancellation_reason_code = 'EXTERNAL_VENUE_CLOSURE',
        version = version + 1, updated_at = '2026-10-03T11:30:00.000Z'::timestamptz
      where session_id = ${session}::uuid
    `.execute(database);
    await sql`
      update scheduling.bookings
      set state = 'CANCELLED', cancelled_at = '2026-10-03T11:30:00.000Z'::timestamptz,
        cancel_actor = ${central}::uuid, cancel_reason = 'EXTERNAL_VENUE_CLOSURE',
        version = version + 1, updated_at = '2026-10-03T11:30:00.000Z'::timestamptz
      where booking_id = ${booking}::uuid
    `.execute(database);
    await sql`
      update scheduling.slots
      set state = 'CANCELLED', version = version + 1,
        updated_at = '2026-10-03T11:30:00.000Z'::timestamptz
      where slot_id = ${slot}::uuid
    `.execute(database);

    const finalized = await finalizeCommunityClosure(
      database,
      {
        commandId: testId(16128), commandType: 'FINALIZE_COMMUNITY_CLOSURE',
        idempotencyKey: `finalize-community-closure-${community}`,
        actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
        aggregateType: 'Community', aggregateId: community, expectedVersion: 4,
        correlationId: testId(16129), causationId: testId(16109), requestId: testId(16130),
        source: 'admin', payloadVersion: 1, payload: finalizePayload,
      },
      {
        eventId: testId(16131), auditId: testId(16132), outboxMessageId: testId(16133),
        competitionEventIds: [testId(16134)], membershipEventIds: [testId(16135), testId(16136)],
        statusDispositionIds: [testId(16137)], statusEventIds: [testId(16138)],
        challengeEventIds: [testId(16139)],
      },
      () => new Date('2026-10-03T12:00:00.000Z'),
    );
    expect(finalized.response).toMatchObject({
      planState: 'FINALIZED', communityState: 'CLOSED', communityVersion: 5,
    });
    const finalEvidence = await sql<{
      readonly community_state: string;
      readonly competition_phase: string;
      readonly champion_user_id: string | null;
      readonly retained_challenge_state: string;
      readonly archived_memberships: string;
      readonly closure_reason: string;
      readonly status_migration_events: string;
    }>`
      select
        (select state from community.communities where community_id = ${community}::uuid)
          as community_state,
        (select phase from competition.competitions where competition_id = ${competition}::uuid)
          as competition_phase,
        (select champion_user_id::text from competition.competitions
          where competition_id = ${competition}::uuid) as champion_user_id,
        (select state from competition.challenges where challenge_id = ${challenge}::uuid)
          as retained_challenge_state,
        (select count(*)::text from community.community_memberships
          where community_id = ${community}::uuid and state = 'ARCHIVED') as archived_memberships,
        (select closure_reason from community.community_closure_status_dispositions
          where plan_id = ${closurePlan}::uuid) as closure_reason,
        (select count(*)::text from platform.domain_events
          where aggregate_type = 'StatusTenure' and payload ->> 'successorUserId' is not null)
          as status_migration_events
    `.execute(database);
    expect(finalEvidence.rows[0]).toEqual({
      community_state: 'CLOSED', competition_phase: 'CLOSED', champion_user_id: null,
      retained_challenge_state: 'CANCELLED_NO_FAULT', archived_memberships: '2',
      closure_reason: 'COMMUNITY_CLOSED', status_migration_events: '0',
    });
  });

  it('[AC-106][AC-108][AC-109] confirms no-obligation Membership exit without loss', async () => {
    const ordinary = testId(17000);
    const champion = testId(17001);
    const contender = testId(17002);
    const central = testId(17003);
    const venue = testId(17004);
    const community = testId(17005);
    const competition = testId(17006);
    const ordinaryMembership = testId(17007);
    const contenderMembership = testId(17008);
    const occurredAt = '2026-10-01T08:00:00.000Z';

    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values
        (${ordinary}::uuid, '+79991700000', ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'Ordinary Exit', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${champion}::uuid, '+79991700001', ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'Champion Exit', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${contender}::uuid, '+79991700002', ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'Contender Exit', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${central}::uuid, '+79991700003', ${occurredAt}::timestamptz, '1985-01-01', 'ADULT', 'Central Exit', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz)
    `.execute(database);
    await ensureLocalPilotCommunity(database, {
      venueId: venue, venueConfigurationId: testId(17009), communityId: community,
      communityConfigurationId: testId(17010), membershipId: ordinaryMembership,
      centralGrantId: testId(17011), athleteUserId: ordinary, centralActorId: central,
      legalName: 'Membership Exit Pilot LLC', venueDisplayName: 'Membership Exit Pilot',
      communityName: 'Membership Exit Community', address: 'Москва', cityCode: 'MOSCOW',
      timezone: 'Europe/Moscow', contactPayload: { phone: '+79990000700' }, occurredAt,
    });
    await ensureLocalPilotCompetition(database, {
      competitionId: competition, communityId: community, centralActorId: central, occurredAt,
      memberships: [
        { membershipId: ordinaryMembership, userId: ordinary },
        { membershipId: testId(17012), userId: champion },
        { membershipId: contenderMembership, userId: contender },
      ],
    });
    await sql`
      update competition.competitions
      set phase = 'RUNNING', champion_user_id = ${champion}::uuid,
        contender_user_id = ${contender}::uuid, status_version = 7, version = 8
      where competition_id = ${competition}::uuid
    `.execute(database);
    await sql`
      insert into social.chats (chat_id, scope, state, version, created_at, updated_at)
      values
        (${testId(17013)}::uuid, 'PERSONAL_MATCH', 'OPEN', 1, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz),
        (${testId(17014)}::uuid, 'CHALLENGE_SERVICE', 'OPEN', 1, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz)
    `.execute(database);
    await sql`
      insert into competition.ruleset_snapshots (
        ruleset_snapshot_id, competition_id, community_configuration_id,
        ruleset_ref, ruleset_ack_mode, policy_version, created_at
      ) values (
        ${testId(17015)}::uuid, ${competition}::uuid, ${testId(17010)}::uuid,
        'pilot-rules-v1', 'IMPLICIT_ON_ACCEPT', 'membership-exit-mvp-v1',
        ${occurredAt}::timestamptz
      )
    `.execute(database);
    await sql`
      insert into competition.challenges (
        challenge_id, competition_id, source_chat_id, service_chat_id,
        initiator_user_id, recipient_user_id, pair_low_id, pair_high_id,
        response_policy, stake, state, ruleset_snapshot_id, response_deadline_at,
        version, created_at, updated_at
      ) values (
        ${testId(17016)}::uuid, ${competition}::uuid, ${testId(17013)}::uuid,
        ${testId(17014)}::uuid, ${ordinary}::uuid, ${champion}::uuid,
        ${ordinary}::uuid, ${champion}::uuid, 'OPTIONAL', 'NONE',
        'AWAITING_RESPONSE', ${testId(17015)}::uuid,
        '2026-10-03T08:00:00.000Z'::timestamptz, 1,
        ${occurredAt}::timestamptz, ${occurredAt}::timestamptz
      )
    `.execute(database);

    const ordinaryExit = testId(17020);
    const ordinaryToken = testId(17021);
    const ordinaryPreview = await previewMembershipExit(
      database,
      {
        commandId: testId(17022), commandType: 'PREVIEW_MEMBERSHIP_EXIT',
        idempotencyKey: `preview-membership-exit-${ordinaryExit}`,
        actor: { type: 'USER', id: ordinary, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'VoluntaryMembershipExit', aggregateId: ordinaryExit,
        expectedVersion: 0, correlationId: testId(17023), causationId: null,
        requestId: testId(17024), source: 'api', payloadVersion: 1,
        payload: { membershipId: ordinaryMembership },
      } satisfies CommandEnvelope<PreviewMembershipExitPayload>,
      {
        eventId: testId(17025), membershipEventId: testId(17026),
        competitionEventId: testId(17027), auditId: testId(17028),
        outboxMessageId: testId(17029), notificationOutboxMessageId: testId(17030),
        notificationIds: [testId(17031), testId(17032)],
      },
      ordinaryToken,
      () => new Date('2026-10-01T09:00:00.000Z'),
    );
    expect(ordinaryPreview.response).toMatchObject({
      departingStatus: 'ORDINARY', consequence: 'ORDINARY_EXIT', state: 'PREVIEWED',
      confirmationToken: ordinaryToken, createsForfeit: false, createsLoss: false,
    });
    const ordinaryConfirmed = await confirmMembershipExit(
      database,
      {
        commandId: testId(17033), commandType: 'CONFIRM_MEMBERSHIP_EXIT',
        idempotencyKey: `confirm-membership-exit-${ordinaryExit}`,
        actor: { type: 'USER', id: ordinary, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'VoluntaryMembershipExit', aggregateId: ordinaryExit,
        expectedVersion: 1, correlationId: testId(17034), causationId: testId(17025),
        requestId: testId(17035), source: 'api', payloadVersion: 1,
        payload: { exitId: ordinaryExit, confirmationToken: ordinaryToken },
      } satisfies CommandEnvelope<ConfirmMembershipExitPayload>,
      {
        eventId: testId(17036), membershipEventId: testId(17037),
        competitionEventId: testId(17038), auditId: testId(17039),
        outboxMessageId: testId(17040), notificationOutboxMessageId: testId(17041),
        notificationIds: [testId(17042), testId(17043)],
      },
      () => new Date('2026-10-01T09:05:00.000Z'),
    );
    expect(ordinaryConfirmed.response).toMatchObject({
      state: 'CONFIRMED', afterMembershipVersion: 2,
      closedChallengeCount: 1, createsForfeit: false, appealWaived: false,
    });

    const contenderExit = testId(17050);
    const contenderToken = testId(17051);
    await previewMembershipExit(
      database,
      {
        commandId: testId(17052), commandType: 'PREVIEW_MEMBERSHIP_EXIT',
        idempotencyKey: `preview-membership-exit-${contenderExit}`,
        actor: { type: 'USER', id: contender, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'VoluntaryMembershipExit', aggregateId: contenderExit,
        expectedVersion: 0, correlationId: testId(17053), causationId: null,
        requestId: testId(17054), source: 'api', payloadVersion: 1,
        payload: { membershipId: contenderMembership },
      } satisfies CommandEnvelope<PreviewMembershipExitPayload>,
      {
        eventId: testId(17055), membershipEventId: testId(17056),
        competitionEventId: testId(17057), auditId: testId(17058),
        outboxMessageId: testId(17059), notificationOutboxMessageId: testId(17060),
        notificationIds: [testId(17061), testId(17062)],
      },
      contenderToken,
      () => new Date('2026-10-01T09:10:00.000Z'),
    );
    const contenderConfirmed = await confirmMembershipExit(
      database,
      {
        commandId: testId(17063), commandType: 'CONFIRM_MEMBERSHIP_EXIT',
        idempotencyKey: `confirm-membership-exit-${contenderExit}`,
        actor: { type: 'USER', id: contender, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'VoluntaryMembershipExit', aggregateId: contenderExit,
        expectedVersion: 1, correlationId: testId(17064), causationId: testId(17055),
        requestId: testId(17065), source: 'api', payloadVersion: 1,
        payload: { exitId: contenderExit, confirmationToken: contenderToken },
      } satisfies CommandEnvelope<ConfirmMembershipExitPayload>,
      {
        eventId: testId(17066), membershipEventId: testId(17067),
        competitionEventId: testId(17068), auditId: testId(17069),
        outboxMessageId: testId(17070), notificationOutboxMessageId: testId(17071),
        notificationIds: [testId(17072), testId(17073)],
      },
      () => new Date('2026-10-01T09:15:00.000Z'),
    );
    expect(contenderConfirmed.response).toMatchObject({
      departingStatus: 'CONTENDER', consequence: 'CONTENDER_VACANCY',
      state: 'CONFIRMED', afterStatusVersion: 8,
    });
    const evidence = await sql<{
      readonly ordinary_membership_state: string;
      readonly contender_membership_state: string;
      readonly challenge_state: string;
      readonly champion_user_id: string;
      readonly contender_user_id: string | null;
      readonly competition_phase: string;
      readonly result_count: string;
      readonly cooldown_count: string;
    }>`
      select
        (select state from community.community_memberships where membership_id = ${ordinaryMembership}::uuid) as ordinary_membership_state,
        (select state from community.community_memberships where membership_id = ${contenderMembership}::uuid) as contender_membership_state,
        (select state from competition.challenges where challenge_id = ${testId(17016)}::uuid) as challenge_state,
        (select champion_user_id::text from competition.competitions where competition_id = ${competition}::uuid) as champion_user_id,
        (select contender_user_id::text from competition.competitions where competition_id = ${competition}::uuid) as contender_user_id,
        (select phase from competition.competitions where competition_id = ${competition}::uuid) as competition_phase,
        (select count(*)::text from competition.results where challenge_id = ${testId(17016)}::uuid) as result_count,
        (select count(*)::text from competition.pair_cooldowns where competition_id = ${competition}::uuid) as cooldown_count
    `.execute(database);
    expect(evidence.rows[0]).toEqual({
      ordinary_membership_state: 'LEFT', contender_membership_state: 'LEFT',
      challenge_state: 'CANCELLED_NO_FAULT', champion_user_id: champion,
      contender_user_id: null, competition_phase: 'CONTENDER_VACANT_OPEN',
      result_count: '0', cooldown_count: '0',
    });
  });

  it('[AC-107][AC-110] finalizes a waived Forfeit before leaving an accepted Challenge', async () => {
    const champion = testId(17100);
    const challenger = testId(17101);
    const central = testId(17102);
    const coach = testId(17160);
    const venue = testId(17103);
    const community = testId(17104);
    const competition = testId(17105);
    const championMembership = testId(17106);
    const occurredAt = '2026-10-01T08:00:00.000Z';

    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values
        (${champion}::uuid, '+79991710000', ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'Leaving Champion', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${challenger}::uuid, '+79991710001', ${occurredAt}::timestamptz, '1995-01-01', 'ADULT', 'Winning Challenger', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${central}::uuid, '+79991710002', ${occurredAt}::timestamptz, '1985-01-01', 'ADULT', 'Central Forfeit', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz),
        (${coach}::uuid, '+79991710003', ${occurredAt}::timestamptz, '1985-01-01', 'ADULT', 'Forfeit Coach', 'ACTIVE', 'ru-RU', 1, ${occurredAt}::timestamptz)
    `.execute(database);
    await ensureLocalPilotCommunity(database, {
      venueId: venue, venueConfigurationId: testId(17107), communityId: community,
      communityConfigurationId: testId(17108), membershipId: championMembership,
      centralGrantId: testId(17109), athleteUserId: champion, centralActorId: central,
      legalName: 'Accepted Exit Pilot LLC', venueDisplayName: 'Accepted Exit Pilot',
      communityName: 'Accepted Exit Community', address: 'Москва', cityCode: 'MOSCOW',
      timezone: 'Europe/Moscow', contactPayload: { phone: '+79990000710' }, occurredAt,
    });
    await ensureLocalPilotCompetition(database, {
      competitionId: competition, communityId: community, centralActorId: central, occurredAt,
      memberships: [
        { membershipId: championMembership, userId: champion },
        { membershipId: testId(17110), userId: challenger },
      ],
    });
    await sql`
      update competition.competitions
      set phase = 'RUNNING', champion_user_id = ${champion}::uuid,
        contender_user_id = ${challenger}::uuid, status_version = 7, version = 8
      where competition_id = ${competition}::uuid
    `.execute(database);
    await sql`
      insert into social.chats (chat_id, scope, state, version, created_at, updated_at)
      values
        (${testId(17111)}::uuid, 'PERSONAL_MATCH', 'OPEN', 1, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz),
        (${testId(17112)}::uuid, 'CHALLENGE_SERVICE', 'OPEN', 1, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz)
    `.execute(database);
    await sql`
      insert into competition.ruleset_snapshots (
        ruleset_snapshot_id, competition_id, community_configuration_id,
        ruleset_ref, ruleset_ack_mode, policy_version, created_at
      ) values (
        ${testId(17113)}::uuid, ${competition}::uuid, ${testId(17108)}::uuid,
        'pilot-rules-v1', 'IMPLICIT_ON_ACCEPT', 'membership-exit-mvp-v2',
        ${occurredAt}::timestamptz
      )
    `.execute(database);
    const challenge = testId(17114);
    await sql`
      insert into competition.challenges (
        challenge_id, competition_id, source_chat_id, service_chat_id,
        initiator_user_id, recipient_user_id, pair_low_id, pair_high_id,
        response_policy, stake, state, ruleset_snapshot_id, response_deadline_at,
        accepted_at, scheduling_deadline_at, version, created_at, updated_at
      ) values (
        ${challenge}::uuid, ${competition}::uuid, ${testId(17111)}::uuid,
        ${testId(17112)}::uuid, ${challenger}::uuid, ${champion}::uuid,
        ${champion}::uuid, ${challenger}::uuid, 'MANDATORY', 'TITLE',
        'BOOKED', ${testId(17113)}::uuid,
        '2026-10-03T08:00:00.000Z'::timestamptz,
        '2026-10-01T08:10:00.000Z'::timestamptz,
        '2026-10-16T08:10:00.000Z'::timestamptz, 4,
        ${occurredAt}::timestamptz, '2026-10-01T08:10:00.000Z'::timestamptz
      )
    `.execute(database);
    await sql`
      insert into competition.challenge_participant_obligations (
        obligation_id, challenge_id, user_id, accepted_at
      ) values
        (${testId(17115)}::uuid, ${challenge}::uuid, ${champion}::uuid, '2026-10-01T08:10:00.000Z'::timestamptz),
        (${testId(17116)}::uuid, ${challenge}::uuid, ${challenger}::uuid, '2026-10-01T08:10:00.000Z'::timestamptz)
    `.execute(database);
    const match = testId(17161);
    const slot = testId(17162);
    const booking = testId(17163);
    const session = testId(17164);
    await database.transaction().execute(async (transaction) => {
      await sql`set constraints all deferred`.execute(transaction);
      await sql`
        insert into social.matches (
          match_id, pair_low_id, pair_high_id, state, chat_id,
          last_activity_at, version, created_at, updated_at
        ) values (
          ${match}::uuid, ${champion}::uuid, ${challenger}::uuid, 'ACTIVE',
          ${testId(17111)}::uuid, ${occurredAt}::timestamptz, 1,
          ${occurredAt}::timestamptz, ${occurredAt}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into scheduling.slots (
          slot_id, venue_id, coach_user_id, start_at, end_at, slot_type,
          state, price_text, cancellation_terms_text, commercial_version,
          booking_id, published_by, version, created_at, updated_at
        ) values (
          ${slot}::uuid, ${venue}::uuid, ${coach}::uuid,
          '2026-10-05T16:00:00.000Z'::timestamptz,
          '2026-10-05T17:00:00.000Z'::timestamptz, 'PERSONAL', 'BOOKED',
          'Тест', 'Без штрафа', 1, ${booking}::uuid, ${central}::uuid, 2,
          ${occurredAt}::timestamptz, ${occurredAt}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into scheduling.bookings (
          booking_id, chat_id, match_id, slot_id, pair_low_id, pair_high_id,
          purpose, state, initiated_by, selected_by_low_at, selected_by_high_at,
          selection_expires_at, host_confirmation_deadline_at,
          commercial_terms_snapshot, host_confirmed_by, host_confirmed_at,
          version, created_at, updated_at, challenge_id
        ) values (
          ${booking}::uuid, ${testId(17111)}::uuid, ${match}::uuid, ${slot}::uuid,
          ${champion}::uuid, ${challenger}::uuid, 'OFFICIAL_CHALLENGE',
          'CONFIRMED_PAIR', ${challenger}::uuid, ${occurredAt}::timestamptz,
          ${occurredAt}::timestamptz, '2026-10-02T10:00:00.000Z'::timestamptz,
          '2026-10-03T10:00:00.000Z'::timestamptz, '{"priceText":"Тест"}'::jsonb,
          ${coach}::uuid, ${occurredAt}::timestamptz, 3,
          ${occurredAt}::timestamptz, ${occurredAt}::timestamptz, ${challenge}::uuid
        )
      `.execute(transaction);
      await sql`
        insert into scheduling.sessions (
          session_id, booking_id, venue_id, coach_user_id, pair_low_id, pair_high_id,
          purpose, state, scheduled_start_at, scheduled_end_at,
          commercial_terms_snapshot, version, created_at, updated_at, challenge_id
        ) values (
          ${session}::uuid, ${booking}::uuid, ${venue}::uuid, ${coach}::uuid,
          ${champion}::uuid, ${challenger}::uuid, 'OFFICIAL_CHALLENGE', 'SCHEDULED',
          '2026-10-05T16:00:00.000Z'::timestamptz,
          '2026-10-05T17:00:00.000Z'::timestamptz, '{"priceText":"Тест"}'::jsonb,
          1, ${occurredAt}::timestamptz, ${occurredAt}::timestamptz, ${challenge}::uuid
        )
      `.execute(transaction);
    });

    const exitId = testId(17120);
    const confirmationToken = testId(17121);
    const commonIds = {
      membershipEventId: testId(17130), competitionEventId: testId(17131),
      notificationOutboxMessageId: testId(17132),
      notificationIds: [testId(17133), testId(17134)] as const,
      resultId: testId(17135), resultEventId: testId(17136),
      resultFinalEventId: testId(17137), waiverId: testId(17138),
      waiverEventId: testId(17139), cooldownId: testId(17140),
      cooldownEventId: testId(17141), challengeEventId: testId(17142),
      statusTransitionId: testId(17143), statusEventId: testId(17144),
      statusFinalizationId: testId(17145), statusFinalEventId: testId(17146),
      postResultStatusEventId: testId(17147), statusOutboxMessageId: testId(17148),
    };
    const previewed = await previewMembershipExit(
      database,
      {
        commandId: testId(17122), commandType: 'PREVIEW_MEMBERSHIP_EXIT',
        idempotencyKey: `preview-accepted-membership-exit-${exitId}`,
        actor: { type: 'USER', id: champion, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'VoluntaryMembershipExit', aggregateId: exitId,
        expectedVersion: 0, correlationId: testId(17123), causationId: null,
        requestId: testId(17124), source: 'api', payloadVersion: 1,
        payload: { membershipId: championMembership },
      } satisfies CommandEnvelope<PreviewMembershipExitPayload>,
      {
        ...commonIds, eventId: testId(17125), auditId: testId(17126),
        outboxMessageId: testId(17127),
      },
      confirmationToken,
      () => new Date('2026-10-01T09:00:00.000Z'),
    );
    expect(previewed.response).toMatchObject({
      consequence: 'ACCEPTED_CHALLENGE_FORFEIT', departingStatus: 'CHAMPION',
      challengeId: challenge, opponentUserId: challenger,
      opponentDisplayName: 'Winning Challenger', createsForfeit: true,
      createsLoss: true, createsCooldown: true, appealWaived: true,
      afterStatusVersion: 10,
    });

    const confirmed = await confirmMembershipExit(
      database,
      {
        commandId: testId(17150), commandType: 'CONFIRM_MEMBERSHIP_EXIT',
        idempotencyKey: `confirm-accepted-membership-exit-${exitId}`,
        actor: { type: 'USER', id: champion, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'VoluntaryMembershipExit', aggregateId: exitId,
        expectedVersion: 1, correlationId: testId(17151), causationId: testId(17125),
        requestId: testId(17152), source: 'api', payloadVersion: 1,
        payload: { exitId, confirmationToken },
      } satisfies CommandEnvelope<ConfirmMembershipExitPayload>,
      {
        ...commonIds, eventId: testId(17153), auditId: testId(17154),
        outboxMessageId: testId(17155),
      },
      () => new Date('2026-10-01T09:05:00.000Z'),
    );
    expect(confirmed.response).toMatchObject({
      state: 'CONFIRMED', resultId: commonIds.resultId,
      createsForfeit: true, createsLoss: true, createsCooldown: true, appealWaived: true,
      afterMembershipVersion: 2, afterStatusVersion: 10,
    });
    const evidence = await sql<{
      readonly membership_state: string;
      readonly challenge_state: string;
      readonly challenge_version: string;
      readonly result_state: string;
      readonly result_version: string;
      readonly winner_user_id: string;
      readonly loser_user_id: string;
      readonly waiver_context: string;
      readonly cooldown_count: string;
      readonly open_obligations: string;
      readonly champion_user_id: string;
      readonly contender_user_id: string | null;
      readonly status_version: string;
      readonly competition_phase: string;
      readonly booking_state: string;
      readonly session_state: string;
      readonly slot_state: string;
    }>`
      select
        (select state from community.community_memberships where membership_id = ${championMembership}::uuid) as membership_state,
        (select state from competition.challenges where challenge_id = ${challenge}::uuid) as challenge_state,
        (select version::text from competition.challenges where challenge_id = ${challenge}::uuid) as challenge_version,
        (select state from competition.results where result_id = ${commonIds.resultId}::uuid) as result_state,
        (select version::text from competition.results where result_id = ${commonIds.resultId}::uuid) as result_version,
        (select winner_user_id::text from competition.results where result_id = ${commonIds.resultId}::uuid) as winner_user_id,
        (select loser_user_id::text from competition.results where result_id = ${commonIds.resultId}::uuid) as loser_user_id,
        (select reason_context from competition.appeal_waivers where waiver_id = ${commonIds.waiverId}::uuid) as waiver_context,
        (select count(*)::text from competition.pair_cooldowns where source_result_id = ${commonIds.resultId}::uuid) as cooldown_count,
        (select count(*)::text from competition.challenge_participant_obligations where challenge_id = ${challenge}::uuid and released_at is null) as open_obligations,
        (select champion_user_id::text from competition.competitions where competition_id = ${competition}::uuid) as champion_user_id,
        (select contender_user_id::text from competition.competitions where competition_id = ${competition}::uuid) as contender_user_id,
        (select status_version::text from competition.competitions where competition_id = ${competition}::uuid) as status_version,
        (select phase from competition.competitions where competition_id = ${competition}::uuid) as competition_phase,
        (select state from scheduling.bookings where booking_id = ${booking}::uuid) as booking_state,
        (select state from scheduling.sessions where session_id = ${session}::uuid) as session_state,
        (select state from scheduling.slots where slot_id = ${slot}::uuid) as slot_state
    `.execute(database);
    expect(evidence.rows[0]).toEqual({
      membership_state: 'LEFT', challenge_state: 'COMPLETED', challenge_version: '6',
      result_state: 'FINAL', result_version: '2', winner_user_id: challenger,
      loser_user_id: champion, waiver_context: 'VOLUNTARY_RESIGNATION',
      cooldown_count: '1', open_obligations: '0', champion_user_id: challenger,
      contender_user_id: null, status_version: '10',
      competition_phase: 'CONTENDER_VACANT_OPEN', booking_state: 'CANCELLED',
      session_state: 'CANCELLED', slot_state: 'CANCELLED',
    });
  });

  it('AC-022 AC-131 AC-132 AC-133 AC-134 governs Membership removal end to end', async () => {
    const occurredAt = new Date('2026-10-02T09:00:00.000Z');
    const central = testId(18000);
    const admin = testId(18001);
    const ordinary = testId(18002);
    const champion = testId(18003);
    const contender = testId(18004);
    const venue = testId(18010);
    const community = testId(18011);
    const competition = testId(18012);
    const ordinaryMembership = testId(18013);
    const championMembership = testId(18014);
    const contenderMembership = testId(18015);

    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values
        (${central}::uuid, '+79991800000', ${occurredAt.toISOString()}::timestamptz, '1985-01-01', 'ADULT', 'Removal Central', 'ACTIVE', 'ru-RU', 1, ${occurredAt.toISOString()}::timestamptz),
        (${admin}::uuid, '+79991800001', ${occurredAt.toISOString()}::timestamptz, '1985-01-01', 'ADULT', 'Removal Admin', 'ACTIVE', 'ru-RU', 1, ${occurredAt.toISOString()}::timestamptz),
        (${ordinary}::uuid, '+79991800002', ${occurredAt.toISOString()}::timestamptz, '1995-01-01', 'ADULT', 'Ordinary Athlete', 'ACTIVE', 'ru-RU', 1, ${occurredAt.toISOString()}::timestamptz),
        (${champion}::uuid, '+79991800003', ${occurredAt.toISOString()}::timestamptz, '1995-01-01', 'ADULT', 'Champion Athlete', 'ACTIVE', 'ru-RU', 1, ${occurredAt.toISOString()}::timestamptz),
        (${contender}::uuid, '+79991800004', ${occurredAt.toISOString()}::timestamptz, '1995-01-01', 'ADULT', 'Contender Athlete', 'ACTIVE', 'ru-RU', 1, ${occurredAt.toISOString()}::timestamptz)
    `.execute(database);
    await ensureLocalPilotCommunity(database, {
      venueId: venue, venueConfigurationId: testId(18016), communityId: community,
      communityConfigurationId: testId(18017), membershipId: ordinaryMembership,
      centralGrantId: testId(18018), athleteUserId: ordinary,
      centralActorId: central, legalName: 'Removal Pilot Gym LLC',
      venueDisplayName: 'Removal Pilot Gym', communityName: 'Removal Community',
      address: 'Moscow', cityCode: 'MOSCOW', timezone: 'Europe/Moscow',
      contactPayload: { phone: '+79991809999' }, occurredAt: occurredAt.toISOString(),
    });
    await ensureLocalPilotCompetition(database, {
      competitionId: competition, communityId: community, centralActorId: central,
      occurredAt: occurredAt.toISOString(),
      memberships: [
        { membershipId: championMembership, userId: champion },
        { membershipId: contenderMembership, userId: contender },
      ],
    });
    await sql`
      update competition.competitions
      set phase = 'RUNNING', champion_user_id = ${champion}::uuid,
        contender_user_id = ${contender}::uuid, status_version = 1, version = 2
      where competition_id = ${competition}::uuid
    `.execute(database);
    await sql`
      insert into community.role_grants (
        grant_id, user_id, role, scope_type, scope_id, state,
        authorized_by, authorized_at, version
      ) values (
        ${testId(18019)}::uuid, ${admin}::uuid, 'GYM_ADMIN', 'VENUE', ${venue}::uuid,
        'ACTIVE', ${central}::uuid, ${occurredAt.toISOString()}::timestamptz, 1
      )
    `.execute(database);

    const idsFor = (base: number, caseId: string) => ({
      caseId, holdId: testId(base + 1), replacementMembershipId: testId(base + 2),
      eventId: testId(base + 3), membershipEventId: testId(base + 4),
      statusEventId: testId(base + 5), auditId: testId(base + 6),
      outboxMessageId: testId(base + 7), notificationOutboxMessageId: testId(base + 8),
    });
    const ordinaryCase = testId(18020);
    const ordinaryRequested = await requestMembershipRemoval(
      database,
      {
        commandId: testId(18030), commandType: 'REQUEST_MEMBERSHIP_REMOVAL',
        idempotencyKey: 'remove-ordinary-18020',
        actor: { type: 'USER', id: admin, roles: ['GYM_ADMIN'], scopeIds: [venue] },
        aggregateType: 'MembershipRemovalCase', aggregateId: ordinaryCase,
        expectedVersion: 0, correlationId: testId(18031), causationId: null,
        requestId: testId(18032), source: 'admin', payloadVersion: 1,
        payload: {
          membershipId: ordinaryMembership,
          reason: 'Repeated violation of the published Community conduct rules.',
        },
      } satisfies CommandEnvelope<RequestMembershipRemovalPayload>,
      idsFor(18020, ordinaryCase),
      () => occurredAt,
    );
    expect(ordinaryRequested.response).toMatchObject({
      subjectStatus: 'ORDINARY', state: 'REMOVED_APPEALABLE', version: 1,
      appealDeadlineAt: '2026-10-04T09:00:00.000Z',
    });
    expect(await listVenueMembersForAdmin(database, admin, venue)).toHaveLength(2);

    const appealed = await appealMembershipRemoval(
      database,
      {
        commandId: testId(18040), commandType: 'APPEAL_MEMBERSHIP_REMOVAL',
        idempotencyKey: 'appeal-removal-18020',
        actor: { type: 'USER', id: ordinary, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'MembershipRemovalCase', aggregateId: ordinaryCase,
        expectedVersion: 1, correlationId: testId(18041), causationId: testId(18023),
        requestId: testId(18042), source: 'api', payloadVersion: 1,
        payload: {
          caseId: ordinaryCase,
          reason: 'The decision refers to another participant with a similar display name.',
        },
      } satisfies CommandEnvelope<AppealMembershipRemovalPayload>,
      idsFor(18040, ordinaryCase),
      () => new Date('2026-10-02T10:00:00.000Z'),
    );
    expect(appealed.response).toMatchObject({ state: 'APPEALED', version: 2 });
    expect(await listMembershipRemovalsForCentral(database, central)).toHaveLength(1);

    const replacementMembership = testId(18042);
    const overturned = await decideMembershipRemoval(
      database,
      {
        commandId: testId(18050), commandType: 'DECIDE_MEMBERSHIP_REMOVAL',
        idempotencyKey: 'overturn-removal-18020',
        actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
        aggregateType: 'MembershipRemovalCase', aggregateId: ordinaryCase,
        expectedVersion: 2, correlationId: testId(18051), causationId: testId(18043),
        requestId: testId(18052), source: 'admin', payloadVersion: 1,
        payload: {
          caseId: ordinaryCase, decision: 'REJECT_REMOVAL',
          reason: 'The evidence confirms that the wrong participant was selected.',
          cancelConfirmedSessions: true,
        },
      } satisfies CommandEnvelope<DecideMembershipRemovalPayload>,
      { ...idsFor(18050, ordinaryCase), replacementMembershipId: replacementMembership },
      () => new Date('2026-10-02T11:00:00.000Z'),
    );
    expect(overturned.response).toMatchObject({
      state: 'OVERTURNED', replacementMembershipId: replacementMembership,
    });

    const removalSourceChat = testId(18100);
    const removalServiceChat = testId(18101);
    const removalRuleset = testId(18102);
    const pendingStatusChallenge = testId(18103);
    await sql`
      insert into social.chats (chat_id, scope, state, version, created_at, updated_at)
      values
        (${removalSourceChat}::uuid, 'PERSONAL_MATCH', 'OPEN', 1,
          '2026-10-01T23:00:00.000Z'::timestamptz, '2026-10-01T23:00:00.000Z'::timestamptz),
        (${removalServiceChat}::uuid, 'CHALLENGE_SERVICE', 'OPEN', 1,
          '2026-10-01T23:00:00.000Z'::timestamptz, '2026-10-01T23:00:00.000Z'::timestamptz)
    `.execute(database);
    await sql`
      insert into competition.ruleset_snapshots (
        ruleset_snapshot_id, competition_id, community_configuration_id,
        ruleset_ref, ruleset_ack_mode, policy_version, created_at
      ) values (
        ${removalRuleset}::uuid, ${competition}::uuid, ${testId(18017)}::uuid,
        'pilot-rules-v1', 'IMPLICIT_ON_ACCEPT', 'membership-removal-mvp-v1',
        '2026-10-01T23:00:00.000Z'::timestamptz
      )
    `.execute(database);
    await sql`
      insert into competition.challenges (
        challenge_id, competition_id, source_chat_id, service_chat_id,
        initiator_user_id, recipient_user_id, pair_low_id, pair_high_id,
        response_policy, stake, state, ruleset_snapshot_id, response_deadline_at,
        version, created_at, updated_at
      ) values (
        ${pendingStatusChallenge}::uuid, ${competition}::uuid,
        ${removalSourceChat}::uuid, ${removalServiceChat}::uuid,
        ${champion}::uuid, ${contender}::uuid, ${champion}::uuid, ${contender}::uuid,
        'MANDATORY', 'TITLE', 'AWAITING_RESPONSE', ${removalRuleset}::uuid,
        '2026-10-02T00:01:00.000Z'::timestamptz, 1,
        '2026-10-01T23:00:00.000Z'::timestamptz,
        '2026-10-01T23:00:00.000Z'::timestamptz
      )
    `.execute(database);

    const championCase = testId(18060);
    const championRequested = await requestMembershipRemoval(
      database,
      {
        commandId: testId(18070), commandType: 'REQUEST_MEMBERSHIP_REMOVAL',
        idempotencyKey: 'review-champion-18060',
        actor: { type: 'USER', id: admin, roles: ['GYM_ADMIN'], scopeIds: [venue] },
        aggregateType: 'MembershipRemovalCase', aggregateId: championCase,
        expectedVersion: 0, correlationId: testId(18071), causationId: null,
        requestId: testId(18072), source: 'admin', payloadVersion: 1,
        payload: {
          membershipId: championMembership,
          reason: 'A governed Central review is required for repeated rule violations.',
        },
      } satisfies CommandEnvelope<RequestMembershipRemovalPayload>,
      idsFor(18060, championCase),
      () => new Date('2026-10-02T12:00:00.000Z'),
    );
    expect(championRequested.response).toMatchObject({
      subjectStatus: 'CHAMPION', state: 'UNDER_REVIEW', version: 1,
    });
    const hold = await sql<{ readonly state: string }>`
      select state from competition.process_holds where source_case_id = ${championCase}::uuid
    `.execute(database);
    expect(hold.rows[0]?.state).toBe('ACTIVE');
    const heldTimer = await readChallengeTimerSnapshot(database, pendingStatusChallenge);
    expect(heldTimer.state).toBe('AWAITING_RESPONSE');
    expect(new Date(heldTimer.deadlineAt!).getTime()).toBeGreaterThan(Date.now());

    const confirmed = await decideMembershipRemoval(
      database,
      {
        commandId: testId(18080), commandType: 'DECIDE_MEMBERSHIP_REMOVAL',
        idempotencyKey: 'confirm-champion-18060',
        actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
        aggregateType: 'MembershipRemovalCase', aggregateId: championCase,
        expectedVersion: 1, correlationId: testId(18081), causationId: testId(18063),
        requestId: testId(18082), source: 'admin', payloadVersion: 1,
        payload: {
          caseId: championCase, decision: 'CONFIRM_REMOVAL',
          reason: 'Independent review confirms removal without a sporting loss.',
          cancelConfirmedSessions: true,
        },
      } satisfies CommandEnvelope<DecideMembershipRemovalPayload>,
      idsFor(18080, championCase),
      () => new Date('2026-10-02T13:00:00.000Z'),
    );
    expect(confirmed.response).toMatchObject({
      state: 'CONFIRMED', cancelledChallengeCount: 1,
    });
    const final = await sql<{
      readonly membership_state: string;
      readonly champion_user_id: string;
      readonly contender_user_id: string | null;
      readonly status_version: string;
      readonly hold_state: string;
      readonly challenge_state: string;
    }>`
      select
        (select state from community.community_memberships where membership_id = ${championMembership}::uuid) as membership_state,
        (select champion_user_id::text from competition.competitions where competition_id = ${competition}::uuid) as champion_user_id,
        (select contender_user_id::text from competition.competitions where competition_id = ${competition}::uuid) as contender_user_id,
        (select status_version::text from competition.competitions where competition_id = ${competition}::uuid) as status_version,
        (select state from competition.process_holds where source_case_id = ${championCase}::uuid) as hold_state,
        (select state from competition.challenges where challenge_id = ${pendingStatusChallenge}::uuid) as challenge_state
    `.execute(database);
    expect(final.rows[0]).toEqual({
      membership_state: 'REMOVED', champion_user_id: contender,
      contender_user_id: null, status_version: '2', hold_state: 'RELEASED',
      challenge_state: 'CANCELLED_NO_FAULT',
    });
  });

  it('AC-055 AC-149 AC-169 AC-170 retains a booked Youth challenge only as consensual Training', async () => {
    const athleteA = testId(19000);
    const athleteB = testId(19001);
    const venue = testId(19002);
    const venueConfiguration = testId(19003);
    const community = testId(19004);
    const communityConfiguration = testId(19005);
    const competition = testId(19006);
    const sourceChat = testId(19007);
    const serviceChat = testId(19008);
    const ruleset = testId(19009);
    const challenge = testId(19010);
    const consentA = testId(19011);
    const consentB = testId(19012);
    const coach = testId(19013);
    const match = testId(19014);
    const slot = testId(19015);
    const booking = testId(19016);
    const session = testId(19017);
    const now = new Date('2026-10-02T10:00:00.000Z');

    await database.transaction().execute(async (transaction) => {
      await sql`set constraints all deferred`.execute(transaction);
      await sql`
        insert into identity.users (
          user_id, phone_e164, phone_verified_at, birth_date, age_division,
          display_name, account_state, locale, version, activated_at
        ) values
          (${athleteA}::uuid, '+79991900000', ${now.toISOString()}::timestamptz,
            '2010-01-10'::date, 'YOUTH', 'Youth A', 'ACTIVE', 'ru-RU', 1,
            ${now.toISOString()}::timestamptz),
          (${athleteB}::uuid, '+79991900001', ${now.toISOString()}::timestamptz,
            '2010-02-10'::date, 'YOUTH', 'Youth B', 'ACTIVE', 'ru-RU', 1,
            ${now.toISOString()}::timestamptz),
          (${coach}::uuid, '+79991900002', ${now.toISOString()}::timestamptz,
            '1990-02-10'::date, 'ADULT', 'Youth Coach', 'ACTIVE', 'ru-RU', 1,
            ${now.toISOString()}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into community.venues (
          venue_id, legal_name, display_name, address, city_code, timezone, state,
          minimum_booking_notice_hours, slot_publish_horizon_days,
          configuration_version_id, version
        ) values (
          ${venue}::uuid, 'Youth Pilot LLC', 'Youth Pilot', 'Pilot street 1',
          'MOW', 'Europe/Moscow', 'ACTIVE', 8, 15, ${venueConfiguration}::uuid, 1
        )
      `.execute(transaction);
      await sql`
        insert into community.venue_configuration_versions (
          configuration_id, venue_id, configuration_version,
          minimum_booking_notice_hours, slot_publish_horizon_days,
          contact_payload, created_by, effective_at
        ) values (
          ${venueConfiguration}::uuid, ${venue}::uuid, 1, 8, 15,
          '{}'::jsonb, ${athleteA}::uuid, ${now.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into community.communities (
          community_id, venue_id, name, state, configuration_id,
          created_by_central_id, version
        ) values (
          ${community}::uuid, ${venue}::uuid, 'Youth Community', 'ACTIVE',
          ${communityConfiguration}::uuid, ${athleteA}::uuid, 1
        )
      `.execute(transaction);
      await sql`
        insert into community.community_configuration_versions (
          configuration_id, community_id, configuration_version,
          pair_cooldown_days, no_show_grace_minutes, ruleset_ref,
          ruleset_ack_mode, created_by, effective_at
        ) values (
          ${communityConfiguration}::uuid, ${community}::uuid, 1,
          15, 15, 'youth-pilot-rules-v1', 'IMPLICIT_ON_ACCEPT',
          ${athleteA}::uuid, ${now.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into competition.competitions (
          competition_id, community_id, age_division, phase, availability, version
        ) values (${competition}::uuid, ${community}::uuid, 'YOUTH', 'FOUNDING_OPEN', 'ACTIVE', 1)
      `.execute(transaction);
      await sql`
        insert into social.chats (chat_id, scope, state, version, created_at, updated_at)
        values
          (${sourceChat}::uuid, 'PERSONAL_MATCH', 'OPEN', 1,
            ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz),
          (${serviceChat}::uuid, 'CHALLENGE_SERVICE', 'OPEN', 1,
            ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz)
      `.execute(transaction);
      await sql`
        insert into competition.ruleset_snapshots (
          ruleset_snapshot_id, competition_id, community_configuration_id,
          ruleset_ref, ruleset_ack_mode, policy_version, created_at
        ) values (
          ${ruleset}::uuid, ${competition}::uuid, ${communityConfiguration}::uuid,
          'youth-pilot-rules-v1', 'IMPLICIT_ON_ACCEPT', 'challenge-mvp-v1',
          ${now.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into competition.challenges (
          challenge_id, competition_id, source_chat_id, service_chat_id,
          initiator_user_id, recipient_user_id, pair_low_id, pair_high_id,
          response_policy, stake, state, ruleset_snapshot_id, response_deadline_at,
          version, created_at, updated_at
        ) values (
          ${challenge}::uuid, ${competition}::uuid, ${sourceChat}::uuid, ${serviceChat}::uuid,
          ${athleteA}::uuid, ${athleteB}::uuid, ${athleteA}::uuid, ${athleteB}::uuid,
          'OPTIONAL', 'NONE', 'AWAITING_RESPONSE', ${ruleset}::uuid,
          '2026-10-04T10:00:00.000Z'::timestamptz, 1,
          ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        update platform.feature_flags
        set enabled = true, reason = 'Enabled by Youth consent integration test',
          version = version + 1, updated_at = ${now.toISOString()}::timestamptz
        where feature_key = 'YOUTH_OFFICIAL'
      `.execute(transaction);
    });

    const consentIds = (base: number): YouthConsentEffectIds => ({
      eventId: testId(base),
      auditId: testId(base + 1),
      outboxMessageId: testId(base + 2),
      notificationOutboxMessageId: testId(base + 3),
      notificationId: testId(base + 4),
      challengeEventId: testId(base + 5),
      challengeOutboxMessageId: testId(base + 6),
      trainingRetentionId: testId(base + 7),
      trainingRetentionEventId: testId(base + 8),
      trainingRetentionBookingEventId: testId(base + 9),
      trainingRetentionOutboxMessageId: testId(base + 10),
      trainingRetentionTimerOutboxMessageId: testId(base + 11),
      trainingRetentionNotificationOutboxMessageId: testId(base + 12),
      trainingRetentionNotificationIds: [
        testId(base + 13), testId(base + 14), testId(base + 15),
      ],
    });
    const requestCommand = (
      actorId: string,
      consentId: string,
      base: number,
      guardianContact: string,
    ): CommandEnvelope<RequestYouthConsentPayload> => ({
      commandId: testId(base),
      commandType: 'REQUEST_YOUTH_CHALLENGE_CONSENT',
      idempotencyKey: `youth-consent-request-${base}`,
      actor: { type: 'USER', id: actorId, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'YouthChallengeConsent',
      aggregateId: consentId,
      expectedVersion: 0,
      correlationId: testId(base + 1),
      causationId: null,
      requestId: testId(base + 2),
      source: 'api',
      payloadVersion: 1,
      payload: { challengeId: challenge, channel: 'EMAIL', guardianContact },
    });
    const tokenA = 'a'.repeat(43);
    const tokenB = 'b'.repeat(43);
    await requestYouthConsent(
      database,
      requestCommand(athleteA, consentA, 19100, 'parent-a@example.com'),
      consentIds(19110),
      tokenA,
      () => now,
    );
    await requestYouthConsent(
      database,
      requestCommand(athleteB, consentB, 19200, 'parent-b@example.com'),
      consentIds(19210),
      tokenB,
      () => now,
    );

    await expect(decideYouthConsent(
      database,
      {
        commandId: testId(19250), commandType: 'GRANT_YOUTH_CHALLENGE_CONSENT',
        idempotencyKey: 'invalid-external-youth-consent-scope',
        actor: {
          type: 'EXTERNAL', id: consentA, roles: ['ATHLETE'],
          scopeIds: [challenge, athleteA],
        },
        aggregateType: 'YouthChallengeConsent', aggregateId: consentA,
        expectedVersion: 1, correlationId: testId(19251), causationId: null,
        requestId: testId(19252), source: 'api', payloadVersion: 1,
        payload: {
          consentId: consentA,
          tokenHash: youthConsentTokenHash(tokenA),
          decision: 'GRANT', guardianDisplayName: 'Test Guardian',
          relationship: 'parent', consentTextAccepted: true,
        },
      } satisfies CommandEnvelope<DecideYouthConsentPayload>,
      consentIds(19260),
      () => new Date('2026-10-02T10:05:00.000Z'),
    )).rejects.toBeInstanceOf(InvalidCommandEnvelopeError);

    const grant = async (input: {
      readonly athleteId: string;
      readonly consentId: string;
      readonly token: string;
      readonly base: number;
    }) => decideYouthConsent(
      database,
      {
        commandId: testId(input.base),
        commandType: 'GRANT_YOUTH_CHALLENGE_CONSENT',
        idempotencyKey: `youth-consent-grant-${input.base}`,
        actor: {
          type: 'EXTERNAL', id: input.consentId, roles: ['GUARDIAN_CONSENT'],
          scopeIds: [challenge, input.athleteId],
        },
        aggregateType: 'YouthChallengeConsent', aggregateId: input.consentId,
        expectedVersion: 1, correlationId: testId(input.base + 1), causationId: null,
        requestId: testId(input.base + 2), source: 'api', payloadVersion: 1,
        payload: {
          consentId: input.consentId,
          tokenHash: youthConsentTokenHash(input.token),
          decision: 'GRANT', guardianDisplayName: 'Test Guardian',
          relationship: 'parent', consentTextAccepted: true,
        },
      } satisfies CommandEnvelope<DecideYouthConsentPayload>,
      consentIds(input.base + 10),
      () => new Date('2026-10-02T10:10:00.000Z'),
    );

    await grant({ athleteId: athleteA, consentId: consentA, token: tokenA, base: 19300 });
    await expect(assertYouthChallengeConsentReady(
      database,
      challenge,
      [athleteA, athleteB],
      new Date('2026-10-02T10:11:00.000Z'),
    )).rejects.toMatchObject<Partial<YouthConsentConflictError>>({
      code: 'YOUTH_CONSENT_REQUIRED',
    });

    await grant({ athleteId: athleteB, consentId: consentB, token: tokenB, base: 19400 });
    await expect(assertYouthChallengeConsentReady(
      database,
      challenge,
      [athleteA, athleteB],
      new Date('2026-10-02T10:11:00.000Z'),
    )).resolves.toBeUndefined();
    const summary = await readYouthConsentSummary(database, challenge, athleteA, now);
    expect(summary).toMatchObject({
      featureEnabled: true, viewerAgeDivision: 'YOUTH',
      requiredCount: 2, grantedCount: 2, ready: true,
    });
    expect(summary.consents).toHaveLength(2);
    expect(summary.consents.find((item) => item.athleteUserId === athleteB)?.maskedContact).toBeNull();
    const identities = await sql<{ readonly count: string }>`
      select count(*)::text as count from identity.users
    `.execute(database);
    expect(identities.rows[0]?.count).toBe('3');

    await sql`
      update competition.challenges
      set state = 'BOOKED', accepted_at = '2026-10-02T10:12:00.000Z',
        scheduling_deadline_at = '2026-10-16T10:12:00.000Z', version = 2,
        updated_at = '2026-10-02T10:12:00.000Z'
      where challenge_id = ${challenge}::uuid
    `.execute(database);
    await sql`
      insert into social.matches (
        match_id, pair_low_id, pair_high_id, state, chat_id,
        last_activity_at, version, created_at, updated_at
      ) values (
        ${match}::uuid, ${athleteA}::uuid, ${athleteB}::uuid, 'ACTIVE', ${sourceChat}::uuid,
        ${now.toISOString()}::timestamptz, 1,
        ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz
      )
    `.execute(database);
    await sql`
      insert into scheduling.slots (
        slot_id, venue_id, coach_user_id, start_at, end_at, slot_type, state,
        price_text, cancellation_terms_text, commercial_version,
        published_by, version, created_at, updated_at
      ) values (
        ${slot}::uuid, ${venue}::uuid, ${coach}::uuid,
        '2026-10-02T12:00:00.000Z'::timestamptz,
        '2026-10-02T13:00:00.000Z'::timestamptz,
        'PERSONAL', 'BOOKED', 'Test', 'No penalty', 1,
        ${coach}::uuid, 2, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz
      )
    `.execute(database);
    await sql`
      insert into scheduling.bookings (
        booking_id, chat_id, match_id, slot_id, pair_low_id, pair_high_id,
        purpose, state, initiated_by, selected_by_low_at, selected_by_high_at,
        selection_expires_at, host_confirmation_deadline_at,
        commercial_terms_snapshot, host_confirmed_by, host_confirmed_at,
        version, created_at, updated_at, challenge_id
      ) values (
        ${booking}::uuid, ${sourceChat}::uuid, ${match}::uuid, ${slot}::uuid,
        ${athleteA}::uuid, ${athleteB}::uuid, 'OFFICIAL_CHALLENGE', 'CONFIRMED_PAIR',
        ${athleteA}::uuid, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz,
        '2026-10-02T11:00:00.000Z'::timestamptz,
        '2026-10-02T11:30:00.000Z'::timestamptz,
        '{"priceText":"Test"}'::jsonb, ${coach}::uuid, ${now.toISOString()}::timestamptz,
        3, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz,
        ${challenge}::uuid
      )
    `.execute(database);
    await sql`
      update scheduling.slots set booking_id = ${booking}::uuid where slot_id = ${slot}::uuid
    `.execute(database);
    await sql`
      insert into scheduling.sessions (
        session_id, booking_id, venue_id, coach_user_id, pair_low_id, pair_high_id,
        purpose, state, scheduled_start_at, scheduled_end_at,
        commercial_terms_snapshot, version, created_at, updated_at, challenge_id
      ) values (
        ${session}::uuid, ${booking}::uuid, ${venue}::uuid, ${coach}::uuid,
        ${athleteA}::uuid, ${athleteB}::uuid, 'OFFICIAL_CHALLENGE', 'SCHEDULED',
        '2026-10-02T12:00:00.000Z'::timestamptz,
        '2026-10-02T13:00:00.000Z'::timestamptz,
        '{"priceText":"Test"}'::jsonb, 1,
        ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz,
        ${challenge}::uuid
      )
    `.execute(database);
    await sql`
      insert into competition.challenge_participant_obligations (
        obligation_id, challenge_id, user_id, accepted_at
      ) values
        (${testId(19550)}::uuid, ${challenge}::uuid, ${athleteA}::uuid,
          '2026-10-02T10:12:00.000Z'),
        (${testId(19551)}::uuid, ${challenge}::uuid, ${athleteB}::uuid,
          '2026-10-02T10:12:00.000Z')
    `.execute(database);
    const revoked = await decideYouthConsent(
      database,
      {
        commandId: testId(19500), commandType: 'REVOKE_YOUTH_CHALLENGE_CONSENT',
        idempotencyKey: 'youth-consent-revoke-19500',
        actor: {
          type: 'EXTERNAL', id: consentB, roles: ['GUARDIAN_CONSENT'],
          scopeIds: [challenge, athleteB],
        },
        aggregateType: 'YouthChallengeConsent', aggregateId: consentB,
        expectedVersion: 2, correlationId: testId(19501), causationId: null,
        requestId: testId(19502), source: 'api', payloadVersion: 1,
        payload: {
          consentId: consentB,
          tokenHash: youthConsentTokenHash(tokenB),
          decision: 'REVOKE',
        },
      } satisfies CommandEnvelope<DecideYouthConsentPayload>,
      consentIds(19510),
      () => new Date('2026-10-02T10:15:00.000Z'),
    );
    expect(revoked.response).toMatchObject({
      state: 'REVOKED', challengeState: 'CANCELLED_NO_FAULT', canRevoke: false,
    });
    const closure = await sql<{
      readonly state: string;
      readonly active_obligations: string;
      readonly challenge_events: string;
    }>`
      select challenge.state,
        (select count(*)::text from competition.challenge_participant_obligations
          where challenge_id = challenge.challenge_id and released_at is null) as active_obligations,
        (select count(*)::text from platform.domain_events
          where aggregate_type = 'Challenge' and aggregate_id = challenge.challenge_id
            and event_name = 'ChallengeCancelledNoFault') as challenge_events
      from competition.challenges as challenge
      where challenge.challenge_id = ${challenge}::uuid
    `.execute(database);
    expect(closure.rows[0]).toEqual({
      state: 'CANCELLED_NO_FAULT', active_obligations: '0', challenge_events: '1',
    });
    const retentionId = testId(19517);
    expect(await readBookingTrainingRetentionForSession(database, session, athleteA)).toMatchObject({
      retentionId,
      bookingId: booking,
      sessionId: session,
      challengeId: challenge,
      cause: 'YOUTH_CONSENT_REVOKED',
      state: 'PENDING',
      deadlineAt: '2026-10-02T11:15:00.000Z',
      confirmations: [],
      viewerRequiredRole: 'ATHLETE_LOW',
      viewerCanConfirm: true,
      version: 1,
    });
    const pendingResources = await sql<{
      readonly booking_state: string;
      readonly booking_purpose: string;
      readonly session_state: string;
      readonly session_purpose: string;
      readonly slot_state: string;
    }>`
      select booking.state as booking_state, booking.purpose as booking_purpose,
        session.state as session_state, session.purpose as session_purpose,
        slot.state as slot_state
      from scheduling.bookings booking
      join scheduling.sessions session on session.booking_id = booking.booking_id
      join scheduling.slots slot on slot.slot_id = booking.slot_id
      where booking.booking_id = ${booking}::uuid
    `.execute(database);
    expect(pendingResources.rows[0]).toEqual({
      booking_state: 'OFFICIAL_RELEASE_PENDING', booking_purpose: 'OFFICIAL_CHALLENGE',
      session_state: 'SCHEDULED', session_purpose: 'OFFICIAL_CHALLENGE', slot_state: 'BOOKED',
    });

    const decideRetention = async (input: {
      readonly actorId: string;
      readonly expectedVersion: number;
      readonly base: number;
    }) => decideBookingTrainingRetention(
      database,
      {
        commandId: testId(input.base),
        commandType: 'DECIDE_BOOKING_TRAINING_RETENTION',
        idempotencyKey: `training-retention-${input.base}`,
        actor: { type: 'USER', id: input.actorId, roles: [], scopeIds: [] },
        aggregateType: 'BookingTrainingRetention', aggregateId: retentionId,
        expectedVersion: input.expectedVersion,
        correlationId: testId(input.base + 1), causationId: testId(19518),
        requestId: testId(input.base + 2), source: 'api', payloadVersion: 1,
        payload: { retentionId, decision: 'ACCEPT' },
      } satisfies CommandEnvelope<DecideBookingTrainingRetentionPayload>,
      {
        eventId: testId(input.base + 3), auditId: testId(input.base + 4),
        outboxMessageId: testId(input.base + 5), confirmationId: testId(input.base + 6),
        bookingEventId: testId(input.base + 7), sessionEventId: testId(input.base + 8),
        slotEventId: testId(input.base + 9), notificationOutboxMessageId: testId(input.base + 10),
        notificationIds: [testId(input.base + 11), testId(input.base + 12), testId(input.base + 13)],
        sessionTimerOutboxMessageId: testId(input.base + 14),
      },
      () => new Date(`2026-10-02T10:${20 + (input.expectedVersion * 5)}:00.000Z`),
    );

    expect((await decideRetention({ actorId: athleteA, expectedVersion: 1, base: 19600 })).response)
      .toMatchObject({ state: 'PENDING', version: 2, viewerHasDecided: true });
    expect((await decideRetention({ actorId: athleteB, expectedVersion: 2, base: 19620 })).response)
      .toMatchObject({ state: 'PENDING', version: 3, viewerHasDecided: true });
    const retained = await decideRetention({ actorId: coach, expectedVersion: 3, base: 19640 });
    expect(retained.response).toMatchObject({
      state: 'CONFIRMED', version: 4, viewerRequiredRole: 'COACH_OR_HOST',
    });
    const retainedResources = await sql<{
      readonly booking_state: string;
      readonly booking_purpose: string;
      readonly booking_challenge_id: string | null;
      readonly session_state: string;
      readonly session_purpose: string;
      readonly session_challenge_id: string | null;
      readonly slot_state: string;
      readonly competition_effects: string;
    }>`
      select booking.state as booking_state, booking.purpose as booking_purpose,
        booking.challenge_id::text as booking_challenge_id,
        session.state as session_state, session.purpose as session_purpose,
        session.challenge_id::text as session_challenge_id, slot.state as slot_state,
        (select count(*)::text from platform.domain_events
          where aggregate_type in ('Competition', 'CompetitionStatus', 'Result')
            and occurred_at >= '2026-10-02T10:15:00.000Z'::timestamptz) as competition_effects
      from scheduling.bookings booking
      join scheduling.sessions session on session.booking_id = booking.booking_id
      join scheduling.slots slot on slot.slot_id = booking.slot_id
      where booking.booking_id = ${booking}::uuid
    `.execute(database);
    expect(retainedResources.rows[0]).toEqual({
      booking_state: 'CONFIRMED_PAIR', booking_purpose: 'TRAINING',
      booking_challenge_id: null, session_state: 'SCHEDULED', session_purpose: 'TRAINING',
      session_challenge_id: null, slot_state: 'BOOKED', competition_effects: '0',
    });
    const retainedWindowTimer = await sql<{ readonly payload: {
      readonly sessionId: string;
      readonly timer: { readonly expectedVersion: number; readonly idempotencyKey: string };
    } }>`
      select payload from platform.outbox_messages
      where message_id = ${testId(19654)}::uuid
    `.execute(database);
    expect(retainedWindowTimer.rows[0]?.payload).toEqual(expect.objectContaining({
      sessionId: session,
      timer: expect.objectContaining({
        expectedVersion: 2,
        idempotencyKey: `session:${session}:open-session-window:v2`,
      }),
    }));
  });

  it('[AC-002] schedules one Youth birthday timer and transitions exactly once at its boundary', async () => {
    const userId = testId(20500);
    const boundary = '2026-10-02T00:00:00.000Z';
    const activation = await activateUser(
      database,
      {
        commandId: testId(20501), commandType: 'ACTIVATE_ACCOUNT',
        idempotencyKey: 'activate-youth-age-transition-20501',
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'User', aggregateId: userId, expectedVersion: 0,
        correlationId: testId(20502), causationId: null, requestId: testId(20503),
        source: 'scheduler', payloadVersion: 1,
        payload: {
          userId, phoneE164: '+79990020500',
          phoneVerifiedAt: '2026-09-27T09:00:00.000Z',
          birthDate: '2008-10-02', displayName: 'Youth Boundary Athlete',
          locale: 'ru-RU', primarySport: 'BOXING', secondarySport: null,
          discoveryRadiusKm: 15,
        },
      } satisfies CommandEnvelope<ActivateIdentityInput>,
      {
        eventId: testId(20504), auditId: testId(20505),
        outboxMessageId: testId(20506), ageTransitionTimerOutboxMessageId: testId(20507),
      },
      () => new Date('2026-09-27T10:00:00.000Z'),
    );
    expect(activation.response.ageDivision).toBe('YOUTH');
    const timerMessage = await sql<{ readonly payload: {
      readonly timer: { readonly deadlineAt: string; readonly expectedVersion: number };
    } }>`
      select payload from platform.outbox_messages
      where message_id = ${testId(20507)}::uuid
        and topic = 'identity.age-division-timer.v1'
    `.execute(database);
    expect(timerMessage.rows[0]?.payload.timer).toMatchObject({
      deadlineAt: boundary, expectedVersion: 0,
    });

    const effects = ageTransitionEffects(20600);
    const transitioned = await transitionYouthToAdult(
      database,
      {
        commandId: testId(20520), commandType: 'TRANSITION_TO_ADULT',
        idempotencyKey: `age-division:${userId}:adult:v1`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'AgeDivisionTransition', aggregateId: userId,
        expectedVersion: 0, correlationId: testId(20521), causationId: testId(20504),
        requestId: testId(20522), source: 'scheduler', payloadVersion: 1,
        payload: { userId },
      } satisfies CommandEnvelope<TransitionToAdultPayload>,
      effects,
      () => new Date(boundary),
    );
    expect(transitioned.response).toMatchObject({
      userId, fromAgeDivision: 'YOUTH', toAgeDivision: 'ADULT',
      affectedMembershipCount: 0, closedChallengeIds: [], retentionIds: [],
      invalidatedQueueEntryIds: [], expiredConsentIds: [], statusChanges: [],
    });
    await expect(readAgeDivisionTransitionTimerSnapshot(database, userId)).resolves.toEqual({
      state: 'ADULT', version: 1, deadlineAt: boundary,
    });
  });

  it('[AC-184] transitions Youth to Adult once and retains a booked Session for B-26 decisions', async () => {
    const fixture = await seedYouthOfficialAtAgeBoundary(21000, false);
    await expect(
      readAgeDivisionTransitionTimerSnapshot(database, fixture.athleteA),
    ).resolves.toEqual({
      state: 'YOUTH', version: 0, deadlineAt: fixture.boundary,
    });
    const effects = ageTransitionEffects(21300);
    const command: CommandEnvelope<TransitionToAdultPayload> = {
      commandId: testId(21280), commandType: 'TRANSITION_TO_ADULT',
      idempotencyKey: `age-division:${fixture.athleteA}:adult:v1`,
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'AgeDivisionTransition', aggregateId: fixture.athleteA,
      expectedVersion: 0, correlationId: testId(21281), causationId: null,
      requestId: testId(21282), source: 'scheduler', payloadVersion: 1,
      payload: { userId: fixture.athleteA },
    };

    const transitioned = await transitionYouthToAdult(
      database, command, effects, () => new Date(fixture.boundary),
    );
    const replay = await transitionYouthToAdult(
      database, command, effects, () => new Date(fixture.boundary),
    );
    expect(transitioned).toMatchObject({
      replayed: false,
      response: {
        userId: fixture.athleteA,
        fromAgeDivision: 'YOUTH', toAgeDivision: 'ADULT',
        identityVersion: 2, affectedMembershipCount: 1,
        closedChallengeIds: [fixture.challenge],
        retentionIds: [effects.retentionIds[0]],
        invalidatedQueueEntryIds: [fixture.queueEntry],
        expiredConsentIds: [fixture.consent],
        statusChanges: [{
          competitionId: fixture.competition, releasedStatus: 'CONTENDER',
          beforeChampionUserId: fixture.athleteB,
          beforeContenderUserId: fixture.athleteA,
          afterChampionUserId: fixture.athleteB,
          afterContenderUserId: null,
          afterPhase: 'CONTENDER_VACANT_OPEN', statusVersion: 3,
        }],
      },
    });
    expect(replay.replayed).toBe(true);
    expect(replay.eventId).toBe(transitioned.eventId);

    const state = await sql<{
      readonly age_division: string;
      readonly membership_age_division: string;
      readonly challenge_state: string;
      readonly active_obligations: string;
      readonly booking_state: string;
      readonly booking_purpose: string;
      readonly session_state: string;
      readonly session_purpose: string;
      readonly retention_state: string;
      readonly retention_cause: string;
      readonly consent_state: string;
      readonly queue_state: string;
      readonly champion_user_id: string | null;
      readonly contender_user_id: string | null;
      readonly phase: string;
      readonly adult_status_count: string;
      readonly age_events: string;
      readonly transition_rows: string;
    }>`
      select athlete.age_division,
        membership.age_division as membership_age_division,
        challenge.state as challenge_state,
        (select count(*)::text from competition.challenge_participant_obligations
          where challenge_id = challenge.challenge_id and released_at is null) as active_obligations,
        booking.state as booking_state, booking.purpose as booking_purpose,
        session.state as session_state, session.purpose as session_purpose,
        retention.state as retention_state, retention.cause as retention_cause,
        consent.state as consent_state, queue.state as queue_state,
        youth_competition.champion_user_id, youth_competition.contender_user_id,
        youth_competition.phase,
        (select count(*)::text from competition.competitions
          where competition_id = ${fixture.adultCompetition}::uuid
            and ${fixture.athleteA}::uuid in (champion_user_id, contender_user_id)) as adult_status_count,
        (select count(*)::text from platform.domain_events
          where aggregate_type = 'AgeDivisionTransition'
            and aggregate_id = ${fixture.athleteA}::uuid
            and event_name = 'AgeDivisionChanged') as age_events,
        (select count(*)::text from identity.age_division_transitions
          where user_id = ${fixture.athleteA}::uuid) as transition_rows
      from identity.users as athlete
      join community.community_memberships as membership
        on membership.membership_id = ${fixture.athleteAMembership}::uuid
      join competition.challenges as challenge
        on challenge.challenge_id = ${fixture.challenge}::uuid
      join scheduling.bookings as booking on booking.booking_id = ${fixture.booking}::uuid
      join scheduling.sessions as session on session.session_id = ${fixture.session}::uuid
      join scheduling.booking_training_retentions as retention
        on retention.booking_id = booking.booking_id
      join governance.youth_challenge_consents as consent
        on consent.consent_id = ${fixture.consent}::uuid
      join competition.challenge_queue_entries as queue
        on queue.queue_entry_id = ${fixture.queueEntry}::uuid
      join competition.competitions as youth_competition
        on youth_competition.competition_id = ${fixture.competition}::uuid
      where athlete.user_id = ${fixture.athleteA}::uuid
    `.execute(database);
    expect(state.rows[0]).toEqual({
      age_division: 'ADULT', membership_age_division: 'ADULT',
      challenge_state: 'CANCELLED_NO_FAULT', active_obligations: '0',
      booking_state: 'OFFICIAL_RELEASE_PENDING', booking_purpose: 'OFFICIAL_CHALLENGE',
      session_state: 'SCHEDULED', session_purpose: 'OFFICIAL_CHALLENGE',
      retention_state: 'PENDING', retention_cause: 'AGE_TRANSITION',
      consent_state: 'EXPIRED', queue_state: 'INVALIDATED',
      champion_user_id: fixture.athleteB, contender_user_id: null,
      phase: 'CONTENDER_VACANT_OPEN', adult_status_count: '0',
      age_events: '1', transition_rows: '1',
    });
    await expect(
      readAgeDivisionTransitionTimerSnapshot(database, fixture.athleteA),
    ).resolves.toEqual({
      state: 'ADULT', version: 1, deadlineAt: fixture.boundary,
    });
  });

  it('[AC-185] preserves an already-started Youth Session and its frozen competitive snapshot', async () => {
    const fixture = await seedYouthOfficialAtAgeBoundary(22000, true);
    const before = await sql<{
      readonly session_state: string;
      readonly challenge_state: string;
      readonly actual_start_at: Date;
      readonly snapshot: unknown;
    }>`
      select session.state as session_state, challenge.state as challenge_state,
        session.actual_start_at,
        to_jsonb(snapshot) as snapshot
      from scheduling.sessions as session
      join competition.challenges as challenge on challenge.challenge_id = session.challenge_id
      join scheduling.session_competitive_snapshots as snapshot
        on snapshot.session_id = session.session_id
      where session.session_id = ${fixture.session}::uuid
    `.execute(database);
    const effects = ageTransitionEffects(22300);
    const transitioned = await transitionYouthToAdult(
      database,
      {
        commandId: testId(22280), commandType: 'TRANSITION_TO_ADULT',
        idempotencyKey: `age-division:${fixture.athleteA}:adult:v1`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'AgeDivisionTransition', aggregateId: fixture.athleteA,
        expectedVersion: 0, correlationId: testId(22281), causationId: null,
        requestId: testId(22282), source: 'scheduler', payloadVersion: 1,
        payload: { userId: fixture.athleteA },
      } satisfies CommandEnvelope<TransitionToAdultPayload>,
      effects,
      () => new Date(fixture.boundary),
    );
    expect(transitioned.response).toMatchObject({
      userId: fixture.athleteA,
      closedChallengeIds: [], retentionIds: [],
      statusChanges: [], expiredConsentIds: [fixture.consent],
    });

    const after = await sql<{
      readonly session_state: string;
      readonly challenge_state: string;
      readonly actual_start_at: Date;
      readonly snapshot: unknown;
      readonly athlete_age_division: string;
      readonly membership_age_division: string;
      readonly consent_state: string;
      readonly active_obligations: string;
    }>`
      select session.state as session_state, challenge.state as challenge_state,
        session.actual_start_at, to_jsonb(snapshot) as snapshot,
        athlete.age_division as athlete_age_division,
        membership.age_division as membership_age_division,
        consent.state as consent_state,
        (select count(*)::text from competition.challenge_participant_obligations
          where challenge_id = challenge.challenge_id and released_at is null) as active_obligations
      from scheduling.sessions as session
      join competition.challenges as challenge on challenge.challenge_id = session.challenge_id
      join scheduling.session_competitive_snapshots as snapshot
        on snapshot.session_id = session.session_id
      join identity.users as athlete on athlete.user_id = ${fixture.athleteA}::uuid
      join community.community_memberships as membership
        on membership.membership_id = ${fixture.athleteAMembership}::uuid
      join governance.youth_challenge_consents as consent
        on consent.consent_id = ${fixture.consent}::uuid
      where session.session_id = ${fixture.session}::uuid
    `.execute(database);
    expect(after.rows[0]).toMatchObject({
      session_state: 'IN_PROGRESS', challenge_state: 'IN_SESSION',
      actual_start_at: new Date('2026-10-01T23:50:00.000Z'),
      athlete_age_division: 'ADULT', membership_age_division: 'ADULT',
      consent_state: 'EXPIRED', active_obligations: '2',
    });
    expect(after.rows[0]?.snapshot).toEqual(before.rows[0]?.snapshot);
    expect(after.rows[0]?.session_state).toBe(before.rows[0]?.session_state);
    expect(after.rows[0]?.challenge_state).toBe(before.rows[0]?.challenge_state);
    expect(after.rows[0]?.actual_start_at).toEqual(before.rows[0]?.actual_start_at);
  });

  it('[AC-202] keeps LATE as attendance metadata and lets the assigned Coach record a normal Result', async () => {
    const fixture = await seedYouthOfficialAtAgeBoundary(121000, true);
    const snapshotBefore = await sql<{ readonly snapshot: unknown }>`
      select to_jsonb(snapshot) as snapshot
      from scheduling.session_competitive_snapshots as snapshot
      where session_id = ${fixture.session}::uuid
    `.execute(database);

    const attendanceCommand = (
      athleteUserId: string,
      status: 'PRESENT' | 'LATE',
      expectedVersion: number,
      base: number,
    ): CommandEnvelope<RecordAttendancePayload> => ({
      commandId: testId(base), commandType: 'RECORD_ATTENDANCE',
      idempotencyKey: `ac-202-attendance:${athleteUserId}`,
      actor: {
        type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community],
      },
      aggregateType: 'Session', aggregateId: fixture.session, expectedVersion,
      correlationId: testId(base + 1), causationId: null, requestId: testId(base + 2),
      source: 'api', payloadVersion: 1,
      payload: { sessionId: fixture.session, athleteUserId, status, comment: null },
    });
    const attendanceEffects = (base: number) => ({
      eventId: testId(base + 3), auditId: testId(base + 4), outboxMessageId: testId(base + 5),
      attendanceId: testId(base + 6), attendanceEventId: testId(base + 7),
    });

    await recordSessionAttendance(
      database,
      attendanceCommand(fixture.athleteA, 'LATE', 1, 121100),
      attendanceEffects(121100),
      () => new Date('2026-10-01T23:51:00.000Z'),
    );
    await recordSessionAttendance(
      database,
      attendanceCommand(fixture.athleteB, 'PRESENT', 2, 121120),
      attendanceEffects(121120),
      () => new Date('2026-10-01T23:52:00.000Z'),
    );

    const beforeResult = await sql<{
      readonly athlete_user_id: string;
      readonly status: string;
      readonly arrival_at: Date | null;
      readonly reason_code: string | null;
      readonly result_count: string;
      readonly cooldown_count: string;
    }>`
      select attendance.athlete_user_id, attendance.status, attendance.arrival_at,
        attendance.reason_code,
        (select count(*)::text from competition.results
          where challenge_id = ${fixture.challenge}::uuid) as result_count,
        (select count(*)::text from competition.pair_cooldowns
          where competition_id = ${fixture.competition}::uuid) as cooldown_count
      from scheduling.attendance as attendance
      where attendance.session_id = ${fixture.session}::uuid
      order by attendance.athlete_user_id
    `.execute(database);
    expect(beforeResult.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        athlete_user_id: fixture.athleteA, status: 'LATE',
        arrival_at: new Date('2026-10-01T23:51:00.000Z'), reason_code: null,
        result_count: '0', cooldown_count: '0',
      }),
      expect.objectContaining({
        athlete_user_id: fixture.athleteB, status: 'PRESENT',
        arrival_at: new Date('2026-10-01T23:52:00.000Z'), reason_code: null,
        result_count: '0', cooldown_count: '0',
      }),
    ]));

    const ended = await endSession(
      database,
      {
        commandId: testId(121140), commandType: 'END_SESSION',
        idempotencyKey: `ac-202-end:${fixture.session}`,
        actor: {
          type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community],
        },
        aggregateType: 'Session', aggregateId: fixture.session, expectedVersion: 3,
        correlationId: testId(121141), causationId: testId(121123), requestId: testId(121142),
        source: 'api', payloadVersion: 1, payload: { sessionId: fixture.session },
      } satisfies CommandEnvelope<EndSessionPayload>,
      {
        eventId: testId(121143), auditId: testId(121144), outboxMessageId: testId(121145),
        bookingEventId: testId(121146), slotEventId: testId(121147),
        challengeEventId: testId(121148), challengeOutboxMessageId: testId(121149),
      },
      () => new Date('2026-10-01T23:58:00.000Z'),
    );
    expect(ended.response).toMatchObject({ state: 'ENDED', version: 4 });

    const resultId = testId(121160);
    const resultCommand = {
      commandId: testId(121161), commandType: 'RECORD_SESSION_RESULT',
      idempotencyKey: `ac-202-result:${fixture.challenge}`,
      actor: {
        type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community],
      },
      aggregateType: 'Challenge', aggregateId: fixture.challenge, expectedVersion: 5,
      correlationId: testId(121162), causationId: testId(121143), requestId: testId(121163),
      source: 'api', payloadVersion: 1,
      payload: {
        challengeId: fixture.challenge, sessionId: fixture.session,
        outcomeCode: 'WIN_B', winnerUserId: null, reasonCode: null, comment: null,
        methodCode: null, methodText: null, scorePayload: null, methodPayload: null,
      },
    } satisfies CommandEnvelope<RecordSessionResultPayload>;
    const resultEffects = {
      eventId: testId(121164), auditId: testId(121165), outboxMessageId: testId(121166),
      resultId, resultEventId: testId(121167),
      cooldownId: testId(121168), cooldownEventId: testId(121169),
      timerOutboxMessageId: testId(121170), notificationOutboxMessageId: testId(121171),
      notificationIds: [testId(121172), testId(121173)] as const,
    };
    const recorded = await recordSessionResult(
      database, resultCommand, resultEffects,
      () => new Date('2026-10-01T23:59:00.000Z'),
    );
    const replay = await recordSessionResult(
      database, resultCommand, resultEffects,
      () => new Date('2026-10-02T00:00:00.000Z'),
    );
    expect(recorded).toMatchObject({
      replayed: false,
      response: {
        resultId, state: 'RECORDED', outcomeCode: 'WIN_B',
        winnerUserId: fixture.athleteB, loserUserId: fixture.athleteA,
        reasonCode: null, statusTransitionType: 'NONE', provisional: true, version: 1,
      },
    });
    expect(replay).toMatchObject({ replayed: true, eventId: recorded.eventId, response: recorded.response });

    const persisted = await sql<{
      readonly origin: string;
      readonly outcome_code: string;
      readonly coach_user_id: string;
      readonly reason_code: string | null;
      readonly cooldown_source_result_id: string;
      readonly snapshot: unknown;
    }>`
      select result.origin, result.recorded_outcome_code as outcome_code,
        result.coach_user_id, result.reason_code,
        cooldown.source_result_id as cooldown_source_result_id,
        to_jsonb(snapshot) as snapshot
      from competition.results as result
      join competition.pair_cooldowns as cooldown on cooldown.source_result_id = result.result_id
      join scheduling.session_competitive_snapshots as snapshot
        on snapshot.snapshot_id = result.competitive_snapshot_id
      where result.result_id = ${resultId}::uuid
    `.execute(database);
    expect(persisted.rows[0]).toMatchObject({
      origin: 'SESSION', outcome_code: 'WIN_B', coach_user_id: fixture.coach,
      reason_code: null, cooldown_source_result_id: resultId,
    });
    expect(persisted.rows[0]?.snapshot).toEqual(snapshotBefore.rows[0]?.snapshot);
  });

  it('[AC-209] records a post-start Athlete stoppage as a decisive Result without medical evidence', async () => {
    const fixture = await seedYouthOfficialAtAgeBoundary(124000, true);
    const snapshotBefore = await sql<{ readonly snapshot: unknown }>`
      select to_jsonb(snapshot) as snapshot
      from scheduling.session_competitive_snapshots as snapshot
      where session_id = ${fixture.session}::uuid
    `.execute(database);
    const attendanceCommand = (
      athleteUserId: string,
      expectedVersion: number,
      base: number,
    ): CommandEnvelope<RecordAttendancePayload> => ({
      commandId: testId(base), commandType: 'RECORD_ATTENDANCE',
      idempotencyKey: `ac-209-attendance:${athleteUserId}`,
      actor: {
        type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community],
      },
      aggregateType: 'Session', aggregateId: fixture.session, expectedVersion,
      correlationId: testId(base + 1), causationId: null, requestId: testId(base + 2),
      source: 'api', payloadVersion: 1,
      payload: { sessionId: fixture.session, athleteUserId, status: 'PRESENT', comment: null },
    });
    const attendanceEffects = (base: number) => ({
      eventId: testId(base + 3), auditId: testId(base + 4), outboxMessageId: testId(base + 5),
      attendanceId: testId(base + 6), attendanceEventId: testId(base + 7),
    });
    await recordSessionAttendance(
      database, attendanceCommand(fixture.athleteA, 1, 124100), attendanceEffects(124100),
      () => new Date('2026-10-01T23:51:00.000Z'),
    );
    await recordSessionAttendance(
      database, attendanceCommand(fixture.athleteB, 2, 124120), attendanceEffects(124120),
      () => new Date('2026-10-01T23:52:00.000Z'),
    );
    await endSession(
      database,
      {
        commandId: testId(124140), commandType: 'END_SESSION',
        idempotencyKey: `ac-209-end:${fixture.session}`,
        actor: {
          type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community],
        },
        aggregateType: 'Session', aggregateId: fixture.session, expectedVersion: 3,
        correlationId: testId(124141), causationId: testId(124123), requestId: testId(124142),
        source: 'api', payloadVersion: 1, payload: { sessionId: fixture.session },
      } satisfies CommandEnvelope<EndSessionPayload>,
      {
        eventId: testId(124143), auditId: testId(124144), outboxMessageId: testId(124145),
        bookingEventId: testId(124146), slotEventId: testId(124147),
        challengeEventId: testId(124148), challengeOutboxMessageId: testId(124149),
      },
      () => new Date('2026-10-01T23:58:00.000Z'),
    );

    const invalidCommand = {
      commandId: testId(124150), commandType: 'RECORD_SESSION_RESULT',
      idempotencyKey: `ac-209-invalid-no-contest:${fixture.challenge}`,
      actor: {
        type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community],
      },
      aggregateType: 'Challenge', aggregateId: fixture.challenge, expectedVersion: 5,
      correlationId: testId(124151), causationId: testId(124143), requestId: testId(124152),
      source: 'api', payloadVersion: 1,
      payload: {
        challengeId: fixture.challenge, sessionId: fixture.session,
        outcomeCode: 'NO_CONTEST', winnerUserId: null,
        reasonCode: 'ATHLETE_STOPPED', comment: 'Athlete requested a voluntary stop.',
        methodCode: 'VOLUNTARY_WITHDRAWAL', methodText: null,
        scorePayload: null, methodPayload: null,
      },
    } satisfies CommandEnvelope<RecordSessionResultPayload>;
    await expect(recordSessionResult(database, invalidCommand, {
      eventId: testId(124153), auditId: testId(124154), outboxMessageId: testId(124155),
      resultId: testId(124156), resultEventId: testId(124157),
      timerOutboxMessageId: testId(124158), notificationOutboxMessageId: testId(124159),
      notificationIds: [testId(124160), testId(124161)],
    }, () => new Date('2026-10-01T23:59:00.000Z')))
      .rejects.toEqual(new ResultValidationError('outcomeCode'));

    const resultId = testId(124170);
    const resultCommand = {
      ...invalidCommand,
      commandId: testId(124171), idempotencyKey: `ac-209-result:${fixture.challenge}`,
      correlationId: testId(124172), requestId: testId(124173),
      payload: {
        challengeId: fixture.challenge, sessionId: fixture.session,
        outcomeCode: 'WIN_B', winnerUserId: null, reasonCode: null,
        comment: 'private-stoppage-note', methodCode: 'INJURY_STOPPAGE', methodText: null,
        scorePayload: null, methodPayload: null,
      },
    } satisfies CommandEnvelope<RecordSessionResultPayload>;
    const resultEffects = {
      eventId: testId(124174), auditId: testId(124175), outboxMessageId: testId(124176),
      resultId, resultEventId: testId(124177),
      cooldownId: testId(124178), cooldownEventId: testId(124179),
      timerOutboxMessageId: testId(124180), notificationOutboxMessageId: testId(124181),
      notificationIds: [testId(124182), testId(124183)] as const,
    };
    const recorded = await recordSessionResult(
      database, resultCommand, resultEffects,
      () => new Date('2026-10-01T23:59:00.000Z'),
    );
    await expect(recordSessionResult(database, resultCommand, resultEffects))
      .resolves.toMatchObject({ replayed: true, response: recorded.response });
    expect(recorded.response).toMatchObject({
      resultId, state: 'RECORDED', outcomeCode: 'WIN_B',
      winnerUserId: fixture.athleteB, loserUserId: fixture.athleteA,
      methodCode: 'INJURY_STOPPAGE', appealDeadlineAt: '2026-10-03T23:59:00.000Z',
      statusTransitionType: 'NONE', provisional: true,
    });

    const persisted = await sql<{
      readonly actual_start_at: Date;
      readonly method_code: string;
      readonly comment: string;
      readonly cooldown_source_result_id: string;
      readonly snapshot: unknown;
    }>`
      select session.actual_start_at, result.method_code, result.comment,
        cooldown.source_result_id as cooldown_source_result_id,
        to_jsonb(snapshot) as snapshot
      from competition.results as result
      join scheduling.sessions as session on session.session_id = result.session_id
      join competition.pair_cooldowns as cooldown on cooldown.source_result_id = result.result_id
      join scheduling.session_competitive_snapshots as snapshot
        on snapshot.snapshot_id = result.competitive_snapshot_id
      where result.result_id = ${resultId}::uuid
    `.execute(database);
    expect(persisted.rows[0]).toMatchObject({
      actual_start_at: new Date('2026-10-01T23:50:00.000Z'),
      method_code: 'INJURY_STOPPAGE', comment: 'private-stoppage-note',
      cooldown_source_result_id: resultId,
    });
    expect(persisted.rows[0]?.snapshot).toEqual(snapshotBefore.rows[0]?.snapshot);

    const publicDocuments = await sql<{ readonly document: unknown }>`
      select payload as document from platform.domain_events
      where event_id in (${resultEffects.eventId}::uuid, ${resultEffects.resultEventId}::uuid,
        ${resultEffects.cooldownEventId}::uuid)
      union all
      select payload as document from platform.outbox_messages
      where message_id in (${resultEffects.outboxMessageId}::uuid,
        ${resultEffects.notificationOutboxMessageId}::uuid)
    `.execute(database);
    expect(JSON.stringify(publicDocuments.rows)).not.toContain('private-stoppage-note');
    expect(JSON.stringify(publicDocuments.rows)).not.toMatch(/diagnosis|medicalDocument|evidence/i);
  });

  it('[AC-073] keeps Champion status outside a matched OPEN Result through the frozen NONE stake', async () => {
    const fixture = await seedConfirmedTrainingForConversion(123000);
    await sql`
      update competition.competitions
      set phase = 'RUNNING', champion_user_id = ${fixture.athleteA}::uuid,
        contender_user_id = null, status_version = 1, version = version + 1,
        updated_at = '2026-09-27T10:01:00.000Z'
      where competition_id = ${fixture.competition}::uuid
    `.execute(database);

    await expect(readChatChallenge(database, fixture.chat, fixture.athleteB)).resolves.toMatchObject({
      challenge: null, canCreate: false, createDenialCode: 'PAIR_MATRIX_DENIED',
    });
    await expect(readChatChallenge(database, fixture.chat, fixture.athleteA)).resolves.toMatchObject({
      challenge: null, canCreate: true, createDenialCode: null,
    });

    const challengeId = testId(123100);
    const created = await createDirectOpenChallenge(
      database,
      {
        commandId: testId(123101), commandType: 'CREATE_DIRECT_OPEN_CHALLENGE',
        idempotencyKey: 'ac-073-create-open',
        actor: { type: 'USER', id: fixture.athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Challenge', aggregateId: challengeId, expectedVersion: 0,
        correlationId: testId(123102), causationId: null, requestId: testId(123103),
        source: 'api', payloadVersion: 1, payload: { sourceChatId: fixture.chat },
      },
      {
        eventId: testId(123104), auditId: testId(123105), outboxMessageId: testId(123106),
        notificationId: testId(123107), notificationOutboxMessageId: testId(123108),
        serviceChatId: testId(123109), serviceChatEventId: testId(123110),
        rulesetSnapshotId: testId(123111), acknowledgmentId: testId(123112),
        reminderTimerOutboxMessageIds: [testId(123113), testId(123114)],
      },
      () => new Date('2026-09-27T10:05:00.000Z'),
    );
    expect(created.response).toMatchObject({
      initiatorUserId: fixture.athleteA, recipientUserId: fixture.athleteB,
      responsePolicy: 'OPTIONAL', stake: 'NONE', state: 'AWAITING_RESPONSE', version: 1,
    });

    const accepted = await acceptOptionalChallenge(
      database,
      {
        commandId: testId(123120), commandType: 'ACCEPT_OPTIONAL_CHALLENGE',
        idempotencyKey: 'ac-073-accept-open',
        actor: { type: 'USER', id: fixture.athleteB, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Challenge', aggregateId: challengeId, expectedVersion: 1,
        correlationId: testId(123121), causationId: testId(123104), requestId: testId(123122),
        source: 'api', payloadVersion: 1,
        payload: { challengeId, explicitRulesetAcknowledged: true },
      },
      {
        eventId: testId(123123), auditId: testId(123124), outboxMessageId: testId(123125),
        notificationId: testId(123126), notificationOutboxMessageId: testId(123127),
        acknowledgmentId: testId(123128),
        obligationIds: [testId(123129), testId(123130)],
      },
      () => new Date('2026-09-27T10:10:00.000Z'),
    );
    expect(accepted.response).toMatchObject({
      state: 'ACCEPTED_UNSCHEDULED', stake: 'NONE', version: 2,
    });

    await database.transaction().execute(async (transaction) => {
      await sql`
        update scheduling.bookings
        set purpose = 'OFFICIAL_CHALLENGE', challenge_id = ${challengeId}::uuid
        where booking_id = ${fixture.booking}::uuid
      `.execute(transaction);
      await sql`
        update scheduling.sessions
        set purpose = 'OFFICIAL_CHALLENGE', challenge_id = ${challengeId}::uuid
        where session_id = ${fixture.session}::uuid
      `.execute(transaction);
      await sql`
        update competition.challenges set state = 'BOOKED'
        where challenge_id = ${challengeId}::uuid and state = 'ACCEPTED_UNSCHEDULED'
      `.execute(transaction);
    });

    const opened = await openSessionWindow(
      database,
      {
        commandId: testId(123140), commandType: 'OPEN_SESSION_WINDOW',
        idempotencyKey: `session:${fixture.session}:open-session-window:v1`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'Session', aggregateId: fixture.session, expectedVersion: 1,
        correlationId: testId(123141), causationId: testId(123123), requestId: testId(123142),
        source: 'scheduler', payloadVersion: 1, payload: { sessionId: fixture.session },
      } satisfies CommandEnvelope<OpenSessionWindowPayload>,
      {
        eventId: testId(123143), auditId: testId(123144), outboxMessageId: testId(123145),
        competitiveSnapshotId: testId(123146),
      },
      () => new Date(fixture.scheduledStartAt),
    );
    expect(opened.response).toMatchObject({ state: 'READY_FOR_COACH', version: 2 });

    const frozenBefore = await sql<{
      readonly planned_stake: string;
      readonly effective_stake: string;
      readonly champion_user_id: string;
      readonly contender_user_id: string | null;
      readonly competition_status_version: string;
    }>`
      select planned_stake, effective_stake, champion_user_id, contender_user_id,
        competition_status_version::text
      from scheduling.session_competitive_snapshots
      where session_id = ${fixture.session}::uuid
    `.execute(database);
    expect(frozenBefore.rows[0]).toEqual({
      planned_stake: 'NONE', effective_stake: 'NONE',
      champion_user_id: fixture.athleteA, contender_user_id: null,
      competition_status_version: '1',
    });
    const frozenBeforeJson = await sql<{ readonly value: unknown }>`
      select to_jsonb(snapshot) as value
      from scheduling.session_competitive_snapshots snapshot
      where session_id = ${fixture.session}::uuid
    `.execute(database);

    await sql`
      update competition.competitions
      set contender_user_id = ${fixture.athleteB}::uuid, status_version = 2,
        version = version + 1, updated_at = '2026-10-01T10:00:30.000Z'
      where competition_id = ${fixture.competition}::uuid
    `.execute(database);

    const recordAttendance = (
      athleteUserId: string,
      expectedVersion: number,
      base: number,
      occurredAt: string,
    ) => recordSessionAttendance(
      database,
      {
        commandId: testId(base), commandType: 'RECORD_ATTENDANCE',
        idempotencyKey: `ac-073-attendance:${athleteUserId}`,
        actor: { type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community] },
        aggregateType: 'Session', aggregateId: fixture.session, expectedVersion,
        correlationId: testId(base + 1), causationId: testId(123143), requestId: testId(base + 2),
        source: 'api', payloadVersion: 1,
        payload: { sessionId: fixture.session, athleteUserId, status: 'PRESENT', comment: null },
      } satisfies CommandEnvelope<RecordAttendancePayload>,
      {
        eventId: testId(base + 3), auditId: testId(base + 4), outboxMessageId: testId(base + 5),
        attendanceId: testId(base + 6), attendanceEventId: testId(base + 7),
        challengeEventId: testId(base + 8), challengeOutboxMessageId: testId(base + 9),
      },
      () => new Date(occurredAt),
    );
    await recordAttendance(fixture.athleteA, 2, 123150, '2026-10-01T10:01:00.000Z');
    await recordAttendance(fixture.athleteB, 3, 123170, '2026-10-01T10:02:00.000Z');

    await endSession(
      database,
      {
        commandId: testId(123190), commandType: 'END_SESSION',
        idempotencyKey: `ac-073-end:${fixture.session}`,
        actor: { type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community] },
        aggregateType: 'Session', aggregateId: fixture.session, expectedVersion: 4,
        correlationId: testId(123191), causationId: testId(123153), requestId: testId(123192),
        source: 'api', payloadVersion: 1, payload: { sessionId: fixture.session },
      } satisfies CommandEnvelope<EndSessionPayload>,
      {
        eventId: testId(123193), auditId: testId(123194), outboxMessageId: testId(123195),
        bookingEventId: testId(123196), slotEventId: testId(123197),
        challengeEventId: testId(123198), challengeOutboxMessageId: testId(123199),
      },
      () => new Date('2026-10-01T10:55:00.000Z'),
    );

    const resultId = testId(123210);
    const resultCommand = {
      commandId: testId(123211), commandType: 'RECORD_SESSION_RESULT',
      idempotencyKey: `ac-073-result:${challengeId}`,
      actor: { type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community] },
      aggregateType: 'Challenge', aggregateId: challengeId, expectedVersion: 4,
      correlationId: testId(123212), causationId: testId(123193), requestId: testId(123213),
      source: 'api', payloadVersion: 1,
      payload: {
        challengeId, sessionId: fixture.session, outcomeCode: 'WIN_B', winnerUserId: null,
        reasonCode: null, comment: null, methodCode: null, methodText: null,
        scorePayload: null, methodPayload: null,
      },
    } satisfies CommandEnvelope<RecordSessionResultPayload>;
    const resultEffects = {
      eventId: testId(123214), auditId: testId(123215), outboxMessageId: testId(123216),
      resultId, resultEventId: testId(123217),
      cooldownId: testId(123218), cooldownEventId: testId(123219),
      timerOutboxMessageId: testId(123220), notificationOutboxMessageId: testId(123221),
      notificationIds: [testId(123222), testId(123223)] as const,
    };
    const recorded = await recordSessionResult(
      database, resultCommand, resultEffects,
      () => new Date('2026-10-01T10:56:00.000Z'),
    );
    const replay = await recordSessionResult(
      database, resultCommand, resultEffects,
      () => new Date('2026-10-01T10:57:00.000Z'),
    );
    expect(recorded).toMatchObject({
      replayed: false,
      response: {
        resultId, state: 'RECORDED', outcomeCode: 'WIN_B',
        winnerUserId: fixture.athleteB, loserUserId: fixture.athleteA,
        statusTransitionType: 'NONE', provisional: true,
        appealDeadlineAt: '2026-10-03T10:56:00.000Z', version: 1,
      },
    });
    expect(replay).toMatchObject({
      replayed: true, eventId: recorded.eventId, response: recorded.response,
    });

    const persisted = await sql<{
      readonly champion_user_id: string;
      readonly contender_user_id: string;
      readonly status_version: string;
      readonly status_lock_result_id: string | null;
      readonly effective_stake: string;
      readonly snapshot_champion_user_id: string;
      readonly snapshot_contender_user_id: string | null;
      readonly snapshot_status_version: string;
      readonly outcome_code: string;
      readonly winner_user_id: string;
      readonly loser_user_id: string;
      readonly appeal_deadline_at: Date;
      readonly status_transitions: string;
      readonly cooldowns: string;
    }>`
      select competition.champion_user_id, competition.contender_user_id,
        competition.status_version::text, competition.status_lock_result_id,
        snapshot.effective_stake, snapshot.champion_user_id as snapshot_champion_user_id,
        snapshot.contender_user_id as snapshot_contender_user_id,
        snapshot.competition_status_version::text as snapshot_status_version,
        result.recorded_outcome_code as outcome_code, result.winner_user_id,
        result.loser_user_id, result.appeal_deadline_at,
        (select count(*)::text from competition.status_transitions transition
          where transition.source_result_id = result.result_id) as status_transitions,
        (select count(*)::text from competition.pair_cooldowns cooldown
          where cooldown.source_result_id = result.result_id) as cooldowns
      from competition.results result
      join scheduling.session_competitive_snapshots snapshot
        on snapshot.snapshot_id = result.competitive_snapshot_id
      join competition.competitions competition
        on competition.competition_id = snapshot.competition_id
      where result.result_id = ${resultId}::uuid
    `.execute(database);
    expect(persisted.rows[0]).toEqual({
      champion_user_id: fixture.athleteA, contender_user_id: fixture.athleteB,
      status_version: '2', status_lock_result_id: null,
      effective_stake: 'NONE', snapshot_champion_user_id: fixture.athleteA,
      snapshot_contender_user_id: null, snapshot_status_version: '1',
      outcome_code: 'WIN_B', winner_user_id: fixture.athleteB,
      loser_user_id: fixture.athleteA,
      appeal_deadline_at: new Date('2026-10-03T10:56:00.000Z'),
      status_transitions: '0', cooldowns: '1',
    });
    const frozenAfter = await sql<{ readonly value: unknown }>`
      select to_jsonb(snapshot) as value
      from scheduling.session_competitive_snapshots snapshot
      where session_id = ${fixture.session}::uuid
    `.execute(database);
    expect(frozenAfter.rows[0]?.value).toEqual(frozenBeforeJson.rows[0]?.value);
    await expect(readResult(
      database, resultId, fixture.athleteA, new Date('2026-10-01T10:57:00.000Z'),
    )).resolves.toMatchObject({
      outcomeCode: 'WIN_B', winnerUserId: fixture.athleteB,
      loserUserId: fixture.athleteA, viewerCanAppeal: true,
      appealDeadlineAt: '2026-10-03T10:56:00.000Z',
    });
  });

  it('[AC-203] records one NO_SHOW with Appeal and normalizes two absences to NO_CONTEST', async () => {
    type Fixture = Awaited<ReturnType<typeof seedYouthOfficialAtAgeBoundary>>;
    const snapshotFor = async (fixture: Fixture) => {
      const snapshot = await sql<{ readonly value: unknown }>`
        select to_jsonb(snapshot) as value
        from scheduling.session_competitive_snapshots as snapshot
        where session_id = ${fixture.session}::uuid
      `.execute(database);
      return snapshot.rows[0]?.value;
    };
    const attendanceCommand = (
      fixture: Fixture,
      athleteUserId: string,
      status: 'PRESENT' | 'NO_SHOW',
      expectedVersion: number,
      base: number,
    ): CommandEnvelope<RecordAttendancePayload> => ({
      commandId: testId(base), commandType: 'RECORD_ATTENDANCE',
      idempotencyKey: `ac-203-attendance:${fixture.session}:${athleteUserId}:${base}`,
      actor: {
        type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community],
      },
      aggregateType: 'Session', aggregateId: fixture.session, expectedVersion,
      correlationId: testId(base + 1), causationId: null, requestId: testId(base + 2),
      source: 'api', payloadVersion: 1,
      payload: { sessionId: fixture.session, athleteUserId, status, comment: null },
    });
    const attendanceEffects = (base: number) => ({
      eventId: testId(base + 3), auditId: testId(base + 4), outboxMessageId: testId(base + 5),
      attendanceId: testId(base + 6), attendanceEventId: testId(base + 7),
    });
    const recordAttendance = (
      fixture: Fixture,
      athleteUserId: string,
      status: 'PRESENT' | 'NO_SHOW',
      expectedVersion: number,
      base: number,
      occurredAt: string,
    ) => recordSessionAttendance(
      database,
      attendanceCommand(fixture, athleteUserId, status, expectedVersion, base),
      attendanceEffects(base),
      () => new Date(occurredAt),
    );
    const endOfficial = (
      fixture: Fixture,
      base: number,
      occurredAt: string,
    ) => endSession(
      database,
      {
        commandId: testId(base), commandType: 'END_SESSION',
        idempotencyKey: `ac-203-end:${fixture.session}`,
        actor: {
          type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community],
        },
        aggregateType: 'Session', aggregateId: fixture.session, expectedVersion: 3,
        correlationId: testId(base + 1), causationId: null, requestId: testId(base + 2),
        source: 'api', payloadVersion: 1, payload: { sessionId: fixture.session },
      } satisfies CommandEnvelope<EndSessionPayload>,
      {
        eventId: testId(base + 3), auditId: testId(base + 4), outboxMessageId: testId(base + 5),
        bookingEventId: testId(base + 6), slotEventId: testId(base + 7),
        challengeEventId: testId(base + 8), challengeOutboxMessageId: testId(base + 9),
      },
      () => new Date(occurredAt),
    );
    const resultArtifacts = (base: number) => ({
      eventId: testId(base + 3), auditId: testId(base + 4), outboxMessageId: testId(base + 5),
      resultId: testId(base + 6), resultEventId: testId(base + 7),
      cooldownId: testId(base + 8), cooldownEventId: testId(base + 9),
      timerOutboxMessageId: testId(base + 10),
      notificationOutboxMessageId: testId(base + 11),
      notificationIds: [testId(base + 12), testId(base + 13)] as const,
    });
    const resultCommand = (
      fixture: Fixture,
      outcomeCode: 'NO_SHOW' | 'NO_CONTEST',
      winnerUserId: string | null,
      base: number,
    ): CommandEnvelope<RecordSessionResultPayload> => ({
      commandId: testId(base), commandType: 'RECORD_SESSION_RESULT',
      idempotencyKey: `ac-203-result:${fixture.challenge}:${outcomeCode}`,
      actor: {
        type: 'USER', id: fixture.coach, roles: ['COACH'], scopeIds: [fixture.community],
      },
      aggregateType: 'Challenge', aggregateId: fixture.challenge, expectedVersion: 5,
      correlationId: testId(base + 1), causationId: null, requestId: testId(base + 2),
      source: 'api', payloadVersion: 1,
      payload: {
        challengeId: fixture.challenge, sessionId: fixture.session,
        outcomeCode, winnerUserId,
        reasonCode: outcomeCode === 'NO_SHOW' ? 'ATTENDANCE_NO_SHOW' : 'DOUBLE_NO_SHOW',
        comment: outcomeCode === 'NO_SHOW'
          ? 'Неявка после grace period подтверждена назначенным Coach.'
          : 'Оба Athlete отсутствовали после grace period.',
        methodCode: null, methodText: null, scorePayload: null, methodPayload: null,
      },
    });

    const single = await seedYouthOfficialAtAgeBoundary(122000, true);
    await sql`
      update scheduling.sessions set actual_start_at = scheduled_start_at
      where session_id = ${single.session}::uuid
    `.execute(database);
    const singleSnapshot = await snapshotFor(single);
    await recordAttendance(
      single, single.athleteA, 'PRESENT', 1, 122100, '2026-10-01T23:31:00.000Z',
    );
    await expect(recordAttendance(
      single, single.athleteB, 'NO_SHOW', 2, 122120, '2026-10-01T23:44:59.999Z',
    )).rejects.toMatchObject<Partial<SchedulingConflictError>>({ reason: 'NO_SHOW_TOO_EARLY' });
    await recordAttendance(
      single, single.athleteB, 'NO_SHOW', 2, 122140, '2026-10-01T23:45:00.000Z',
    );
    const beforeSingleResult = await sql<{
      readonly result_count: string;
      readonly cooldown_count: string;
    }>`
      select
        (select count(*)::text from competition.results
          where challenge_id = ${single.challenge}::uuid) as result_count,
        (select count(*)::text from competition.pair_cooldowns
          where competition_id = ${single.competition}::uuid) as cooldown_count
    `.execute(database);
    expect(beforeSingleResult.rows[0]).toEqual({ result_count: '0', cooldown_count: '0' });
    await endOfficial(single, 122160, '2026-10-01T23:50:00.000Z');

    const singleCommand = resultCommand(single, 'NO_SHOW', single.athleteA, 122180);
    const singleArtifacts = resultArtifacts(122180);
    const singleResult = await recordSessionResult(
      database, singleCommand, singleArtifacts,
      () => new Date('2026-10-01T23:51:00.000Z'),
    );
    expect(singleResult.response).toMatchObject({
      outcomeCode: 'NO_SHOW', winnerUserId: single.athleteA,
      loserUserId: single.athleteB, reasonCode: 'ATTENDANCE_NO_SHOW',
      appealDeadlineAt: '2026-10-03T23:51:00.000Z', provisional: true,
      statusTransitionType: 'NONE', version: 1,
    });
    await expect(
      readResult(database, singleArtifacts.resultId, single.athleteB, new Date('2026-10-01T23:51:00.000Z')),
    ).resolves.toMatchObject({ viewerCanAppeal: true, viewerCanWaiveAppeal: true });
    const singlePersisted = await sql<{
      readonly cooldown_source_result_id: string;
      readonly snapshot: unknown;
    }>`
      select cooldown.source_result_id as cooldown_source_result_id,
        to_jsonb(snapshot) as snapshot
      from competition.results as result
      join competition.pair_cooldowns as cooldown on cooldown.source_result_id = result.result_id
      join scheduling.session_competitive_snapshots as snapshot
        on snapshot.snapshot_id = result.competitive_snapshot_id
      where result.result_id = ${singleArtifacts.resultId}::uuid
    `.execute(database);
    expect(singlePersisted.rows[0]?.cooldown_source_result_id).toBe(singleArtifacts.resultId);
    expect(singlePersisted.rows[0]?.snapshot).toEqual(singleSnapshot);

    const double = await seedYouthOfficialAtAgeBoundary(123000, true);
    const doubleSnapshot = await snapshotFor(double);
    await recordAttendance(
      double, double.athleteA, 'NO_SHOW', 1, 123100, '2026-10-01T23:51:00.000Z',
    );
    await recordAttendance(
      double, double.athleteB, 'NO_SHOW', 2, 123120, '2026-10-01T23:52:00.000Z',
    );
    const beforeDoubleResult = await sql<{
      readonly result_count: string;
      readonly cooldown_count: string;
    }>`
      select
        (select count(*)::text from competition.results
          where challenge_id = ${double.challenge}::uuid) as result_count,
        (select count(*)::text from competition.pair_cooldowns
          where competition_id = ${double.competition}::uuid) as cooldown_count
    `.execute(database);
    expect(beforeDoubleResult.rows[0]).toEqual({ result_count: '0', cooldown_count: '0' });
    await endOfficial(double, 123140, '2026-10-01T23:54:00.000Z');

    const doubleCommand = resultCommand(double, 'NO_CONTEST', null, 123160);
    const doubleArtifacts = resultArtifacts(123160);
    const doubleResult = await recordSessionResult(
      database, doubleCommand, doubleArtifacts,
      () => new Date('2026-10-01T23:55:00.000Z'),
    );
    const doubleReplay = await recordSessionResult(
      database, doubleCommand, doubleArtifacts,
      () => new Date('2026-10-01T23:56:00.000Z'),
    );
    expect(doubleResult.response).toMatchObject({
      outcomeCode: 'NO_CONTEST', winnerUserId: null, loserUserId: null,
      reasonCode: 'DOUBLE_NO_SHOW', statusTransitionType: 'NONE', version: 1,
    });
    expect(doubleReplay).toMatchObject({
      replayed: true, eventId: doubleResult.eventId, response: doubleResult.response,
    });
    const doublePersisted = await sql<{
      readonly winner_user_id: string | null;
      readonly loser_user_id: string | null;
      readonly cooldown_count: string;
      readonly transition_count: string;
      readonly snapshot: unknown;
    }>`
      select result.winner_user_id, result.loser_user_id,
        (select count(*)::text from competition.pair_cooldowns
          where source_result_id = result.result_id) as cooldown_count,
        (select count(*)::text from competition.status_transitions
          where source_result_id = result.result_id) as transition_count,
        to_jsonb(snapshot) as snapshot
      from competition.results as result
      join scheduling.session_competitive_snapshots as snapshot
        on snapshot.snapshot_id = result.competitive_snapshot_id
      where result.result_id = ${doubleArtifacts.resultId}::uuid
    `.execute(database);
    expect(doublePersisted.rows[0]).toMatchObject({
      winner_user_id: null, loser_user_id: null,
      cooldown_count: '0', transition_count: '0',
    });
    expect(doublePersisted.rows[0]?.snapshot).toEqual(doubleSnapshot);
  });

  it('persists PI-01 through PI-05 with Central authorization and idempotent completion', async () => {
    const central = testId(23000);
    const grant = testId(23001);
    const incident = testId(23002);
    await sql`insert into identity.users (
      user_id, phone_e164, phone_verified_at, birth_date, age_division,
      display_name, account_state, locale, version, activated_at
    ) values (
      ${central}::uuid, '+79990023000', '2026-10-02T08:00:00.000Z', '1990-01-01',
      'ADULT', 'Incident Central', 'ACTIVE', 'ru-RU', 1, '2026-10-02T08:00:00.000Z'
    )`.execute(database);
    await sql`insert into community.role_grants (
      grant_id, user_id, role, scope_type, scope_id, state,
      authorized_by, authorized_at, version
    ) values (
      ${grant}::uuid, ${central}::uuid, 'CENTRAL_ADMIN', 'GLOBAL', null,
      'ACTIVE', ${central}::uuid, '2026-10-02T08:00:00.000Z', 1
    )`.execute(database);

    const detected = await detectPlatformIncident(database, {
      commandId: testId(23003), commandType: 'DETECT_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-detect-23002',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: incident, expectedVersion: 0,
      correlationId: testId(23004), causationId: null, requestId: testId(23005),
      source: 'scheduler', payloadVersion: 1,
      payload: { startedAt: '2026-10-02T10:00:00.000Z',
        affectedServices: ['CHALLENGE'], affectedSurfaces: ['api'], severity: 'MAJOR',
        monitoringEvidenceReference: 'monitor:api:error-rate:23002' },
    } satisfies CommandEnvelope<DetectPlatformIncidentPayload>, {
      eventId: testId(23006), auditId: testId(23007), outboxMessageId: testId(23008),
    }, () => new Date('2026-10-02T10:01:00.000Z'));
    expect(detected.response).toMatchObject({ state: 'DETECTED', version: 1,
      affectedServices: ['CHALLENGE'], affectedSurfaces: ['api'] });

    const confirmed = await confirmPlatformIncident(database, {
      commandId: testId(23009), commandType: 'CONFIRM_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-confirm-23002',
      actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: incident, expectedVersion: 1,
      correlationId: testId(23004), causationId: testId(23006), requestId: testId(23010),
      source: 'admin', payloadVersion: 1,
      payload: { incidentId: incident, reason: 'Objective API failure confirmed.' },
    } satisfies CommandEnvelope<ConfirmPlatformIncidentPayload>, {
      eventId: testId(23011), auditId: testId(23012), outboxMessageId: testId(23013),
    }, () => new Date('2026-10-02T10:02:00.000Z'));
    expect(confirmed.response).toMatchObject({ state: 'CONFIRMED_ACTIVE', version: 2,
      confirmedBy: central });

    const resolved = await resolvePlatformIncident(database, {
      commandId: testId(23014), commandType: 'RESOLVE_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-resolve-23002',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: incident, expectedVersion: 2,
      correlationId: testId(23004), causationId: testId(23011), requestId: testId(23015),
      source: 'scheduler', payloadVersion: 1,
      payload: { incidentId: incident, endedAt: '2026-10-02T10:37:00.000Z',
        reason: 'Recovery probe remained healthy.' },
    } satisfies CommandEnvelope<ResolvePlatformIncidentPayload>, {
      eventId: testId(23016), auditId: testId(23017), outboxMessageId: testId(23018),
    }, () => new Date('2026-10-02T10:38:00.000Z'));
    expect(resolved.response).toMatchObject({ state: 'RESOLVED', version: 3,
      endedAt: '2026-10-02T10:37:00.000Z' });

    const compensationCommand = {
      commandId: testId(23019), commandType: 'COMPENSATE_INCIDENT_IMPACTS',
      idempotencyKey: 'incident-compensate-23002',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: incident, expectedVersion: 3,
      correlationId: testId(23004), causationId: testId(23016), requestId: testId(23020),
      source: 'scheduler', payloadVersion: 1, payload: { incidentId: incident },
    } satisfies CommandEnvelope<CompensatePlatformIncidentPayload>;
    const compensationIds = {
      eventId: testId(23021), auditId: testId(23022), outboxMessageId: testId(23023),
    };
    const compensated = await compensatePlatformIncidentImpacts(
      database, compensationCommand, compensationIds,
      () => new Date('2026-10-02T10:39:00.000Z'),
    );
    const replay = await compensatePlatformIncidentImpacts(
      database, compensationCommand, compensationIds,
      () => new Date('2026-10-02T10:40:00.000Z'),
    );
    expect(compensated.response).toMatchObject({ state: 'COMPENSATED', version: 4,
      impactCount: 0 });
    expect(replay).toMatchObject({ replayed: true, eventId: testId(23021) });
    expect(await listPlatformIncidents(database, central)).toHaveLength(1);

    const rejectedIncident = testId(23030);
    await detectPlatformIncident(database, {
      commandId: testId(23031), commandType: 'DETECT_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-detect-23030',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: rejectedIncident, expectedVersion: 0,
      correlationId: testId(23032), causationId: null, requestId: testId(23033),
      source: 'scheduler', payloadVersion: 1,
      payload: { startedAt: '2026-10-03T10:00:00.000Z',
        affectedServices: ['BOOKING'], affectedSurfaces: ['web'], severity: 'INFO',
        monitoringEvidenceReference: 'monitor:false-positive:23030' },
    } satisfies CommandEnvelope<DetectPlatformIncidentPayload>, {
      eventId: testId(23034), auditId: testId(23035), outboxMessageId: testId(23036),
    }, () => new Date('2026-10-03T10:01:00.000Z'));
    const rejected = await rejectPlatformIncident(database, {
      commandId: testId(23037), commandType: 'REJECT_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-reject-23030',
      actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: rejectedIncident, expectedVersion: 1,
      correlationId: testId(23032), causationId: testId(23034), requestId: testId(23038),
      source: 'admin', payloadVersion: 1,
      payload: { incidentId: rejectedIncident, reason: 'Not platform-wide.' },
    } satisfies CommandEnvelope<RejectPlatformIncidentPayload>, {
      eventId: testId(23039), auditId: testId(23040), outboxMessageId: testId(23041),
    }, () => new Date('2026-10-03T10:02:00.000Z'));
    expect(rejected.response).toMatchObject({ state: 'REJECTED', version: 2 });
  });

  it('[AC-059][AC-060][AC-195] extends pausable deadlines once and expires scheduling without fault after capacity extension', async () => {
    const athleteA = testId(24000);
    const athleteB = testId(24001);
    const central = testId(24002);
    const venue = testId(24003);
    const venueConfig = testId(24004);
    const community = testId(24005);
    const communityConfig = testId(24006);
    const competition = testId(24007);
    const sourceChat = testId(24008);
    const match = testId(24009);
    const challenge = testId(24010);
    await database.transaction().execute(async (transaction) => {
      await sql`set constraints all deferred`.execute(transaction);
      await sql`insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values
        (${athleteA}::uuid, '+79990024000', '2026-09-01T09:00:00Z', '1995-01-01',
          'ADULT', 'Incident Athlete A', 'ACTIVE', 'ru-RU', 1, '2026-09-01T09:00:00Z'),
        (${athleteB}::uuid, '+79990024001', '2026-09-01T09:00:00Z', '1995-01-01',
          'ADULT', 'Incident Athlete B', 'ACTIVE', 'ru-RU', 1, '2026-09-01T09:00:00Z'),
        (${central}::uuid, '+79990024002', '2026-09-01T09:00:00Z', '1985-01-01',
          'ADULT', 'Incident Central', 'ACTIVE', 'ru-RU', 1, '2026-09-01T09:00:00Z')`
        .execute(transaction);
      await sql`insert into identity.athlete_profiles (
        user_id, primary_sport, discovery_radius_km
      ) values (${athleteA}::uuid, 'BOXING', 15), (${athleteB}::uuid, 'BOXING', 15)`
        .execute(transaction);
      await sql`insert into identity.account_verifications (
        verification_id, user_id, state, method, moderation_checklist_version,
        is_current, verified_at, decided_by, decision_reason, version
      ) values
        (${testId(24011)}::uuid, ${athleteA}::uuid, 'VERIFIED', 'CENTRAL_MODERATION',
          'identity-mvp-v1', true, '2026-09-01T09:00:00Z', ${central}::uuid, 'TEST_APPROVED', 1),
        (${testId(24012)}::uuid, ${athleteB}::uuid, 'VERIFIED', 'CENTRAL_MODERATION',
          'identity-mvp-v1', true, '2026-09-01T09:00:00Z', ${central}::uuid, 'TEST_APPROVED', 1)`
        .execute(transaction);
      await sql`insert into community.venues (
        venue_id, legal_name, display_name, address, city_code, timezone, state,
        minimum_booking_notice_hours, slot_publish_horizon_days,
        configuration_version_id, version
      ) values (${venue}::uuid, 'Incident Gym LLC', 'Incident Gym', 'Москва', 'MOSCOW',
        'Europe/Moscow', 'ACTIVE', 8, 30, ${venueConfig}::uuid, 1)`.execute(transaction);
      await sql`insert into community.venue_configuration_versions (
        configuration_id, venue_id, configuration_version, minimum_booking_notice_hours,
        slot_publish_horizon_days, contact_payload, created_by, effective_at
      ) values (${venueConfig}::uuid, ${venue}::uuid, 1, 8, 30, '{}'::jsonb,
        ${central}::uuid, '2026-09-01T09:00:00Z')`.execute(transaction);
      await sql`insert into community.communities (
        community_id, venue_id, name, state, configuration_id, created_by_central_id, version
      ) values (${community}::uuid, ${venue}::uuid, 'Incident Community', 'ACTIVE',
        ${communityConfig}::uuid, ${central}::uuid, 1)`.execute(transaction);
      await sql`insert into community.community_configuration_versions (
        configuration_id, community_id, configuration_version, pair_cooldown_days,
        no_show_grace_minutes, ruleset_ref, ruleset_ack_mode, created_by, effective_at
      ) values (${communityConfig}::uuid, ${community}::uuid, 1, 15, 15,
        'MOLOKH_RECOMMENDED_V1', 'IMPLICIT_ON_ACCEPT', ${central}::uuid,
        '2026-09-01T09:00:00Z')`.execute(transaction);
      await sql`insert into community.community_memberships (
        membership_id, community_id, user_id, age_division, state, competition_enabled,
        join_path, decided_at, decided_by, version
      ) values
        (${testId(24013)}::uuid, ${community}::uuid, ${athleteA}::uuid, 'ADULT', 'ACTIVE',
          true, 'INVITE', '2026-09-01T09:00:00Z', ${central}::uuid, 1),
        (${testId(24014)}::uuid, ${community}::uuid, ${athleteB}::uuid, 'ADULT', 'ACTIVE',
          true, 'INVITE', '2026-09-01T09:00:00Z', ${central}::uuid, 1)`
        .execute(transaction);
      await sql`insert into community.role_grants (
        grant_id, user_id, role, scope_type, scope_id, state,
        authorized_by, authorized_at, version
      ) values (${testId(24015)}::uuid, ${central}::uuid, 'CENTRAL_ADMIN', 'GLOBAL', null,
        'ACTIVE', ${central}::uuid, '2026-09-01T09:00:00Z', 1)`.execute(transaction);
      await sql`insert into competition.competitions (
        competition_id, community_id, age_division, phase, availability, version,
        created_at, updated_at
      ) values (${competition}::uuid, ${community}::uuid, 'ADULT', 'FOUNDING_OPEN',
        'ACTIVE', 1, '2026-09-01T09:00:00Z', '2026-09-01T09:00:00Z')`
        .execute(transaction);
      await sql`insert into social.chats (
        chat_id, scope, state, version, created_at, updated_at
      ) values (${sourceChat}::uuid, 'PERSONAL_MATCH', 'OPEN', 1,
        '2026-09-01T09:00:00Z', '2026-09-01T09:00:00Z')`.execute(transaction);
      await sql`insert into social.chat_participants (chat_id, user_id) values
        (${sourceChat}::uuid, ${athleteA}::uuid), (${sourceChat}::uuid, ${athleteB}::uuid)`
        .execute(transaction);
      await sql`insert into social.matches (
        match_id, pair_low_id, pair_high_id, state, chat_id, last_activity_at, version
      ) values (${match}::uuid, ${athleteA}::uuid, ${athleteB}::uuid, 'ACTIVE',
        ${sourceChat}::uuid, '2026-09-08T09:00:00Z', 1)`.execute(transaction);
    });

    const created = await createDirectOpenChallenge(database, {
      commandId: testId(24016), commandType: 'CREATE_DIRECT_OPEN_CHALLENGE',
      idempotencyKey: 'incident-ac195-create-challenge',
      actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: challenge, expectedVersion: 0,
      correlationId: testId(24017), causationId: null, requestId: testId(24018),
      source: 'api', payloadVersion: 1, payload: { sourceChatId: sourceChat },
    }, {
      eventId: testId(24019), auditId: testId(24020), outboxMessageId: testId(24021),
      notificationId: testId(24022), notificationOutboxMessageId: testId(24023),
      serviceChatId: testId(24024), serviceChatEventId: testId(24025),
      rulesetSnapshotId: testId(24026), acknowledgmentId: testId(24027),
      reminderTimerOutboxMessageIds: [testId(32007), testId(32008)],
    }, () => new Date('2026-09-08T10:00:00.000Z'));
    expect(created.response.responseDeadlineAt).toBe('2026-09-10T10:00:00.000Z');

    const incident = testId(24030);
    await detectPlatformIncident(database, {
      commandId: testId(24031), commandType: 'DETECT_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-ac195-detect',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: incident, expectedVersion: 0,
      correlationId: testId(24032), causationId: null, requestId: testId(24033),
      source: 'scheduler', payloadVersion: 1,
      payload: { startedAt: '2026-09-10T09:40:00.000Z',
        affectedServices: ['CHALLENGE'], affectedSurfaces: ['CHALLENGE_RESPONSE'],
        severity: 'MAJOR', monitoringEvidenceReference: 'monitor:ac195' },
    }, { eventId: testId(24034), auditId: testId(24035), outboxMessageId: testId(24036) },
    () => new Date('2026-09-10T09:41:00.000Z'));
    await confirmPlatformIncident(database, {
      commandId: testId(24037), commandType: 'CONFIRM_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-ac195-confirm',
      actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: incident, expectedVersion: 1,
      correlationId: testId(24032), causationId: testId(24034), requestId: testId(24038),
      source: 'admin', payloadVersion: 1,
      payload: { incidentId: incident, reason: '37-minute objective outage.' },
    }, { eventId: testId(24039), auditId: testId(24040), outboxMessageId: testId(24041) },
    () => new Date('2026-09-10T09:42:00.000Z'));

    const timer = {
      commandType: 'EXPIRE_OPTIONAL_CHALLENGE', aggregateType: 'Challenge',
      aggregateId: challenge, expectedState: 'AWAITING_RESPONSE', expectedVersion: 1,
      deadlineAt: '2026-09-10T10:00:00.000Z', policyVersion: 'challenge-mvp-v1',
      idempotencyKey: 'incident-ac195-expire',
    } as const;
    await expect(readPlatformIncidentTimerSuppression(
      database, timer, new Date('2026-09-10T10:00:00.000Z'),
    )).resolves.toMatchObject({ incidentId: incident });
    await expect(readPlatformIncidentTimerSuppression(
      database, timer, new Date('2026-09-10T10:00:00.000Z'), 'DISCOVERY',
    )).resolves.toBeNull();
    await expect(expireOptionalChallenge(database, {
      commandId: testId(24042), commandType: 'EXPIRE_OPTIONAL_CHALLENGE',
      idempotencyKey: 'incident-ac195-expire-race',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: challenge, expectedVersion: 1,
      correlationId: testId(24017), causationId: testId(24019), requestId: testId(24043),
      source: 'scheduler', payloadVersion: 1, payload: { challengeId: challenge },
    }, {
      eventId: testId(24044), auditId: testId(24045), outboxMessageId: testId(24046),
      notificationId: testId(24047), notificationOutboxMessageId: testId(24048),
    }, () => new Date('2026-09-10T10:00:00.000Z'))).rejects.toEqual(
      expect.objectContaining<Partial<PlatformIncidentConflictError>>({
        code: 'PLATFORM_INCIDENT_TIMEOUT_SUPPRESSED',
      }),
    );

    await resolvePlatformIncident(database, {
      commandId: testId(24050), commandType: 'RESOLVE_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-ac195-resolve',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: incident, expectedVersion: 2,
      correlationId: testId(24032), causationId: testId(24039), requestId: testId(24051),
      source: 'scheduler', payloadVersion: 1,
      payload: { incidentId: incident, endedAt: '2026-09-10T10:17:00.000Z',
        reason: 'Recovery confirmed.' },
    }, { eventId: testId(24052), auditId: testId(24053), outboxMessageId: testId(24054) },
    () => new Date('2026-09-10T10:18:00.000Z'));
    await expect(readPlatformIncidentTimerSuppression(
      database, timer, new Date('2026-09-10T10:18:00.000Z'),
    )).resolves.toMatchObject({ incidentId: incident });
    await expect(listChallengeResponseIncidentImpactCandidates(database, incident))
      .resolves.toEqual([{ challengeId: challenge, version: 1, surface: 'CHALLENGE_RESPONSE' }]);

    const impactCommand = {
      commandId: testId(24055), commandType: 'APPLY_PLATFORM_INCIDENT_DEADLINE_IMPACT',
      idempotencyKey: `incident:${incident}:challenge:${challenge}:response`,
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: challenge, expectedVersion: 1,
      correlationId: testId(24032), causationId: testId(24052), requestId: testId(24056),
      source: 'scheduler', payloadVersion: 1,
      payload: { incidentId: incident, challengeId: challenge,
        deadlineKind: 'CHALLENGE_RESPONSE', surface: 'CHALLENGE_RESPONSE' },
    } satisfies CommandEnvelope<ApplyIncidentDeadlineImpactPayload>;
    const impactIds = { impactId: testId(24057), eventId: testId(24058),
      auditId: testId(24059), outboxMessageId: testId(24060) };
    const impacted = await applyChallengeResponseIncidentImpact(
      database, impactCommand, impactIds, () => new Date('2026-09-10T10:18:30.000Z'),
    );
    const replay = await applyChallengeResponseIncidentImpact(
      database, impactCommand, impactIds, () => new Date('2026-09-10T10:19:00.000Z'),
    );
    expect(impacted.response).toMatchObject({
      oldDeadlineAt: '2026-09-10T10:00:00.000Z',
      newDeadlineAt: '2026-09-10T10:20:00.000Z',
      overlapMilliseconds: 20 * 60 * 1_000, version: 2,
    });
    expect(replay).toMatchObject({ replayed: true, eventId: testId(24058) });
    await expect(readChallengeTimerSnapshot(database, challenge)).resolves.toEqual({
      state: 'AWAITING_RESPONSE', version: 2, deadlineAt: '2026-09-10T10:20:00.000Z',
    });
    await expect(readPlatformIncidentTimerSuppression(
      database, { ...timer, expectedVersion: 2, deadlineAt: '2026-09-10T10:20:00.000Z' },
      new Date('2026-09-10T10:19:00.000Z'),
    )).resolves.toBeNull();

    const facts = await sql<{
      readonly impacts: string;
      readonly extension_events: string;
      readonly extension_audits: string;
      readonly extension_outbox: string;
      readonly sessions: string;
      readonly cooldowns: string;
      readonly retentions: string;
      readonly timer_command: string;
    }>`select
      (select count(*)::text from platform.incident_impacts
        where incident_id = ${incident}::uuid and aggregate_id = ${challenge}::uuid) as impacts,
      (select count(*)::text from platform.domain_events
        where event_id = ${testId(24058)}::uuid) as extension_events,
      (select count(*)::text from platform.audit_events
        where audit_id = ${testId(24059)}::uuid) as extension_audits,
      (select count(*)::text from platform.outbox_messages
        where message_id = ${testId(24060)}::uuid) as extension_outbox,
      (select count(*)::text from scheduling.sessions) as sessions,
      (select count(*)::text from competition.pair_cooldowns) as cooldowns,
      (select count(*)::text from scheduling.booking_training_retentions) as retentions,
      (select payload->'timer'->>'commandType' from platform.outbox_messages
        where message_id = ${testId(24060)}::uuid) as timer_command`
      .execute(database);
    expect(facts.rows[0]).toEqual({ impacts: '1', extension_events: '1',
      extension_audits: '1', extension_outbox: '1', sessions: '0', cooldowns: '0',
      retentions: '0', timer_command: 'EXPIRE_OPTIONAL_CHALLENGE' });

    const accepted = await acceptOptionalChallenge(database, {
      commandId: testId(24080), commandType: 'ACCEPT_OPTIONAL_CHALLENGE',
      idempotencyKey: 'incident-ac195-accept-for-scheduling',
      actor: { type: 'USER', id: athleteB, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: challenge, expectedVersion: 2,
      correlationId: testId(24017), causationId: testId(24058), requestId: testId(24081),
      source: 'api', payloadVersion: 1, payload: { challengeId: challenge },
    }, {
      eventId: testId(24082), auditId: testId(24083), outboxMessageId: testId(24084),
      notificationId: testId(24085), notificationOutboxMessageId: testId(24086),
      acknowledgmentId: testId(24087),
      obligationIds: [testId(24088), testId(24089)],
    }, () => new Date('2026-09-10T10:19:00.000Z'));
    expect(accepted.response).toMatchObject({
      state: 'ACCEPTED_UNSCHEDULED', version: 3,
      schedulingDeadlineAt: '2026-09-24T10:19:00.000Z',
    });

    const schedulingIncident = testId(24100);
    await detectPlatformIncident(database, {
      commandId: testId(24101), commandType: 'DETECT_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-ac195-scheduling-detect',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: schedulingIncident, expectedVersion: 0,
      correlationId: testId(24102), causationId: null, requestId: testId(24103),
      source: 'scheduler', payloadVersion: 1,
      payload: { startedAt: '2026-09-24T09:59:00.000Z',
        affectedServices: ['CHALLENGE'], affectedSurfaces: ['CHALLENGE_SCHEDULING'],
        severity: 'MAJOR', monitoringEvidenceReference: 'monitor:ac195:scheduling' },
    }, { eventId: testId(24104), auditId: testId(24105), outboxMessageId: testId(24106) },
    () => new Date('2026-09-24T10:00:00.000Z'));
    await confirmPlatformIncident(database, {
      commandId: testId(24107), commandType: 'CONFIRM_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-ac195-scheduling-confirm',
      actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: schedulingIncident, expectedVersion: 1,
      correlationId: testId(24102), causationId: testId(24104), requestId: testId(24108),
      source: 'admin', payloadVersion: 1,
      payload: { incidentId: schedulingIncident, reason: 'Scheduling surface unavailable.' },
    }, { eventId: testId(24109), auditId: testId(24110), outboxMessageId: testId(24111) },
    () => new Date('2026-09-24T10:01:00.000Z'));
    const schedulingTimer = {
      commandType: 'EXPIRE_CHALLENGE_SCHEDULING', aggregateType: 'Challenge',
      aggregateId: challenge, expectedState: 'ACCEPTED_UNSCHEDULED', expectedVersion: 3,
      deadlineAt: '2026-09-24T10:19:00.000Z', policyVersion: 'challenge-mvp-v1',
      idempotencyKey: 'incident-ac195-expire-scheduling:v3',
    } as const;
    await expect(readPlatformIncidentTimerSuppression(
      database, schedulingTimer, new Date(schedulingTimer.deadlineAt),
    )).resolves.toMatchObject({ incidentId: schedulingIncident });
    await resolvePlatformIncident(database, {
      commandId: testId(24112), commandType: 'RESOLVE_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-ac195-scheduling-resolve',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: schedulingIncident, expectedVersion: 2,
      correlationId: testId(24102), causationId: testId(24109), requestId: testId(24113),
      source: 'scheduler', payloadVersion: 1,
      payload: { incidentId: schedulingIncident, endedAt: '2026-09-24T10:29:00.000Z',
        reason: 'Scheduling recovery confirmed.' },
    }, { eventId: testId(24114), auditId: testId(24115), outboxMessageId: testId(24116) },
    () => new Date('2026-09-24T10:30:00.000Z'));
    await expect(listPausableDeadlineImpactCandidates(database, schedulingIncident))
      .resolves.toEqual([{
        aggregateType: 'Challenge', aggregateId: challenge,
        commandType: 'EXPIRE_CHALLENGE_SCHEDULING',
        deadlineKind: 'CHALLENGE_SCHEDULING', surface: 'CHALLENGE_SCHEDULING', version: 3,
      }]);
    const schedulingImpact = await applyPausableDeadlineIncidentImpact(database, {
      commandId: testId(24117), commandType: 'APPLY_PLATFORM_INCIDENT_DEADLINE_IMPACT',
      idempotencyKey: `incident:${schedulingIncident}:CHALLENGE_SCHEDULING:${challenge}`,
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: challenge, expectedVersion: 3,
      correlationId: testId(24102), causationId: testId(24114), requestId: testId(24118),
      source: 'scheduler', payloadVersion: 1,
      payload: { incidentId: schedulingIncident,
        deadlineKind: 'CHALLENGE_SCHEDULING', surface: 'CHALLENGE_SCHEDULING' },
    } satisfies CommandEnvelope<ApplyPausableDeadlineImpactPayload>, {
      impactId: testId(24119), eventId: testId(24120), auditId: testId(24121),
      outboxMessageId: testId(24122),
    }, () => new Date('2026-09-24T10:30:30.000Z'));
    expect(schedulingImpact.response).toMatchObject({
      oldDeadlineAt: '2026-09-24T10:19:00.000Z',
      newDeadlineAt: '2026-09-24T10:39:00.000Z',
      overlapMilliseconds: 20 * 60 * 1_000, version: 4,
    });
    await expect(expireChallengeScheduling(database, {
      commandId: testId(24123), commandType: 'EXPIRE_CHALLENGE_SCHEDULING',
      idempotencyKey: 'incident-ac195-scheduling-too-early',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: challenge, expectedVersion: 4,
      correlationId: testId(24102), causationId: testId(24120), requestId: testId(24124),
      source: 'scheduler', payloadVersion: 1, payload: { challengeId: challenge },
    } satisfies CommandEnvelope<ExpireChallengeSchedulingPayload>, {
      eventId: testId(24125), auditId: testId(24126), outboxMessageId: testId(24127),
      notificationId: testId(24128), notificationOutboxMessageId: testId(24129),
      notificationIds: [testId(24130), testId(24131)], bookingEventId: testId(24132),
      bookingOutboxMessageId: testId(24133),
    }, () => new Date('2026-09-24T10:38:59.999Z')))
      .rejects.toMatchObject({ code: 'CHALLENGE_SCHEDULING_NOT_DUE' });
    const extendedScheduling = await expireChallengeScheduling(database, {
      commandId: testId(24134), commandType: 'EXPIRE_CHALLENGE_SCHEDULING',
      idempotencyKey: 'incident-ac195-scheduling-expire-final',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: challenge, expectedVersion: 4,
      correlationId: testId(24102), causationId: testId(24120), requestId: testId(24135),
      source: 'scheduler', payloadVersion: 1, payload: { challengeId: challenge },
    } satisfies CommandEnvelope<ExpireChallengeSchedulingPayload>, {
      eventId: testId(24136), auditId: testId(24137), outboxMessageId: testId(24138),
      notificationId: testId(24139), notificationOutboxMessageId: testId(24140),
      notificationIds: [testId(24141), testId(24142)], bookingEventId: testId(24143),
      bookingOutboxMessageId: testId(24144),
    }, () => new Date('2026-09-24T10:39:00.000Z'));
    expect(extendedScheduling.response).toMatchObject({
      state: 'ACCEPTED_UNSCHEDULED', version: 5,
      schedulingDeadlineAt: '2026-10-01T10:39:00.000Z',
    });
    const activeObligationsAfterExtension = await sql<{ readonly active: string }>`
      select count(*)::text as active
      from competition.challenge_participant_obligations
      where challenge_id = ${challenge}::uuid and released_at is null
    `.execute(database);
    expect(activeObligationsAfterExtension.rows[0]?.active).toBe('2');
    const expiredScheduling = await expireChallengeScheduling(database, {
      commandId: testId(24145), commandType: 'EXPIRE_CHALLENGE_SCHEDULING',
      idempotencyKey: 'incident-ac195-scheduling-expire-after-extension',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: challenge, expectedVersion: 5,
      correlationId: testId(24102), causationId: testId(24136), requestId: testId(24146),
      source: 'scheduler', payloadVersion: 1, payload: { challengeId: challenge },
    } satisfies CommandEnvelope<ExpireChallengeSchedulingPayload>, {
      eventId: testId(24147), auditId: testId(24148), outboxMessageId: testId(24149),
      notificationId: testId(24150), notificationOutboxMessageId: testId(24151),
      notificationIds: [testId(24152), testId(24153)], bookingEventId: testId(24154),
      bookingOutboxMessageId: testId(24155),
    }, () => new Date('2026-10-01T10:39:00.000Z'));
    expect(expiredScheduling.response).toMatchObject({ state: 'CANCELLED_NO_FAULT', version: 6 });
    const schedulingEvents = await sql<{
      readonly event_name: string;
      readonly transition_id: string | null;
    }>`
      select event_name, transition_id
      from platform.domain_events
      where event_id in (${testId(24136)}::uuid, ${testId(24147)}::uuid)
      order by aggregate_version
    `.execute(database);
    expect(schedulingEvents.rows).toEqual([
      { event_name: 'ChallengeSchedulingExtended', transition_id: 'CH-24' },
      { event_name: 'ChallengeCancelledNoCapacity', transition_id: 'CH-25' },
    ]);
    const obligationFacts = await sql<{ readonly active: string }>`
      select count(*)::text as active
      from competition.challenge_participant_obligations
      where challenge_id = ${challenge}::uuid and released_at is null
    `.execute(database);
    expect(obligationFacts.rows[0]?.active).toBe('0');

    const selectionSlot = testId(24200);
    const selectionBooking = testId(24201);
    const conversionSlot = testId(24202);
    const conversionBooking = testId(24203);
    const conversionSession = testId(24204);
    const conversion = testId(24205);
    const reconfirmationEntry = testId(24206);
    const genesisEntry = testId(24207);
    await database.transaction().execute(async (transaction) => {
      await sql`set constraints all deferred`.execute(transaction);
      await sql`insert into scheduling.slots (
        slot_id, venue_id, coach_user_id, start_at, end_at, slot_type, state,
        commercial_version, booking_id, published_by, version, created_at, updated_at
      ) values
        (${selectionSlot}::uuid, ${venue}::uuid, ${central}::uuid,
          '2026-09-28T10:00:00Z', '2026-09-28T11:00:00Z', 'PERSONAL', 'PUBLISHED',
          1, null, ${central}::uuid, 1, '2026-09-26T10:00:00Z', '2026-09-26T10:00:00Z'),
        (${conversionSlot}::uuid, ${venue}::uuid, ${central}::uuid,
          '2026-09-28T12:00:00Z', '2026-09-28T13:00:00Z', 'PERSONAL', 'BOOKED',
          1, ${conversionBooking}::uuid, ${central}::uuid, 1,
          '2026-09-26T10:00:00Z', '2026-09-26T10:00:00Z')`.execute(transaction);
      await sql`insert into scheduling.bookings (
        booking_id, chat_id, match_id, slot_id, pair_low_id, pair_high_id,
        purpose, state, initiated_by, selected_by_low_at, selected_by_high_at,
        selection_expires_at, host_confirmation_deadline_at, commercial_terms_snapshot,
        version, created_at, updated_at
      ) values
        (${selectionBooking}::uuid, ${sourceChat}::uuid, ${match}::uuid,
          ${selectionSlot}::uuid, ${athleteA}::uuid, ${athleteB}::uuid, 'TRAINING',
          'SELECTING', ${athleteA}::uuid, '2026-09-26T10:00:00Z', null,
          '2026-09-26T11:00:00Z', '2026-09-26T12:00:00Z', null,
          1, '2026-09-26T10:00:00Z', '2026-09-26T10:00:00Z'),
        (${conversionBooking}::uuid, ${sourceChat}::uuid, ${match}::uuid,
          ${conversionSlot}::uuid, ${athleteA}::uuid, ${athleteB}::uuid, 'TRAINING',
          'OFFICIAL_CONVERSION_PENDING', ${athleteA}::uuid,
          '2026-09-26T10:00:00Z', '2026-09-26T10:00:00Z',
          '2026-09-26T11:00:00Z', '2026-09-26T12:00:00Z', '{}'::jsonb,
          1, '2026-09-26T10:00:00Z', '2026-09-26T10:00:00Z')`.execute(transaction);
      await sql`insert into scheduling.sessions (
        session_id, booking_id, venue_id, coach_user_id, pair_low_id, pair_high_id,
        purpose, state, scheduled_start_at, scheduled_end_at, commercial_terms_snapshot,
        version, created_at, updated_at
      ) values (${conversionSession}::uuid, ${conversionBooking}::uuid, ${venue}::uuid,
        ${central}::uuid, ${athleteA}::uuid, ${athleteB}::uuid, 'TRAINING', 'SCHEDULED',
        '2026-09-28T12:00:00Z', '2026-09-28T13:00:00Z', '{}'::jsonb,
        1, '2026-09-26T10:00:00Z', '2026-09-26T10:00:00Z')`.execute(transaction);
      await sql`insert into scheduling.booking_official_conversions (
        conversion_id, booking_id, session_id, competition_id, requested_by_user_id,
        stake, state, confirmation_deadline_at, version, created_at, updated_at
      ) values (${conversion}::uuid, ${conversionBooking}::uuid, ${conversionSession}::uuid,
        ${competition}::uuid, ${athleteA}::uuid, 'NONE', 'PENDING_CONFIRMATION',
        '2026-09-26T11:00:00Z', 1, '2026-09-26T10:00:00Z', '2026-09-26T10:00:00Z')`
        .execute(transaction);
      await sql`insert into competition.challenge_queue_entries (
        queue_entry_id, competition_id, initiator_user_id, target_status, kind, state,
        bound_holder_user_id, source_type, submitted_at, reconfirmation_deadline_at,
        single_candidate_since_at, single_candidate_deadline_at,
        version, created_at, updated_at
      ) values
        (${reconfirmationEntry}::uuid, ${competition}::uuid, ${athleteA}::uuid,
          'CONTENDER', 'DIRECT_STATUS', 'RECONFIRMATION_REQUIRED', ${athleteB}::uuid,
          'DIRECT', '2026-09-26T10:00:00Z', '2026-09-26T11:00:00Z', null, null,
          1, '2026-09-26T10:00:00Z', '2026-09-26T10:00:00Z'),
        (${genesisEntry}::uuid, ${competition}::uuid, ${athleteB}::uuid,
          'CHAMPION', 'GENESIS_CANDIDATE', 'WAITING', null, 'DIRECT',
          '2026-09-26T10:00:00Z', null, '2026-09-26T10:00:00Z',
          '2026-09-26T11:00:00Z', 1, '2026-09-26T10:00:00Z', '2026-09-26T10:00:00Z')`
        .execute(transaction);
      await sql`insert into platform.domain_events (
        event_id, event_name, event_version, aggregate_type, aggregate_id,
        aggregate_version, correlation_id, occurred_at, payload, idempotency_key_hash
      ) values
        (${testId(24210)}::uuid, 'FixtureSeeded', 1, 'Booking',
          ${selectionBooking}::uuid, 1, ${testId(24214)}::uuid,
          '2026-09-26T10:00:00Z', '{}'::jsonb, 'fixture:adapter:booking'),
        (${testId(24211)}::uuid, 'FixtureSeeded', 1, 'BookingOfficialConversion',
          ${conversion}::uuid, 1, ${testId(24214)}::uuid,
          '2026-09-26T10:00:00Z', '{}'::jsonb, 'fixture:adapter:conversion'),
        (${testId(24212)}::uuid, 'FixtureSeeded', 1, 'ChallengeQueueEntry',
          ${reconfirmationEntry}::uuid, 1, ${testId(24214)}::uuid,
          '2026-09-26T10:00:00Z', '{}'::jsonb, 'fixture:adapter:reconfirmation'),
        (${testId(24213)}::uuid, 'FixtureSeeded', 1, 'ChallengeQueueEntry',
          ${genesisEntry}::uuid, 1, ${testId(24214)}::uuid,
          '2026-09-26T10:00:00Z', '{}'::jsonb, 'fixture:adapter:genesis')`.execute(transaction);
    });
    const adapterIncident = testId(24220);
    await detectPlatformIncident(database, {
      commandId: testId(24221), commandType: 'DETECT_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-pausable-adapter-matrix-detect',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: adapterIncident, expectedVersion: 0,
      correlationId: testId(24222), causationId: null, requestId: testId(24223),
      source: 'scheduler', payloadVersion: 1,
      payload: { startedAt: '2026-09-26T10:20:00.000Z',
        affectedServices: ['BOOKING', 'STATUS_QUEUE', 'COMPETITION'],
        affectedSurfaces: ['BOOKING_SELECTION', 'STATUS_QUEUE_RECONFIRMATION',
          'BOOKING_CONVERSION_CONFIRMATION', 'GENESIS_PUBLIC_WINDOW'],
        severity: 'MAJOR', monitoringEvidenceReference: 'monitor:adapter-matrix' },
    }, { eventId: testId(24224), auditId: testId(24225), outboxMessageId: testId(24226) },
    () => new Date('2026-09-26T10:21:00.000Z'));
    await confirmPlatformIncident(database, {
      commandId: testId(24227), commandType: 'CONFIRM_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-pausable-adapter-matrix-confirm',
      actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: adapterIncident, expectedVersion: 1,
      correlationId: testId(24222), causationId: testId(24224), requestId: testId(24228),
      source: 'admin', payloadVersion: 1,
      payload: { incidentId: adapterIncident, reason: 'All pausable surfaces unavailable.' },
    }, { eventId: testId(24229), auditId: testId(24230), outboxMessageId: testId(24231) },
    () => new Date('2026-09-26T10:22:00.000Z'));
    await resolvePlatformIncident(database, {
      commandId: testId(24232), commandType: 'RESOLVE_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-pausable-adapter-matrix-resolve',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: adapterIncident, expectedVersion: 2,
      correlationId: testId(24222), causationId: testId(24229), requestId: testId(24233),
      source: 'scheduler', payloadVersion: 1,
      payload: { incidentId: adapterIncident, endedAt: '2026-09-26T10:50:00.000Z',
        reason: 'All surfaces recovered.' },
    }, { eventId: testId(24234), auditId: testId(24235), outboxMessageId: testId(24236) },
    () => new Date('2026-09-26T10:51:00.000Z'));
    const adapterCandidates = await listPausableDeadlineImpactCandidates(database, adapterIncident);
    expect(adapterCandidates.map((candidate) => candidate.deadlineKind)).toEqual([
      'BOOKING_CONVERSION_CONFIRMATION', 'BOOKING_SELECTION',
      'GENESIS_PUBLIC_WINDOW', 'STATUS_QUEUE_RECONFIRMATION',
    ]);
    for (const [index, candidate] of adapterCandidates.entries()) {
      const effectBase = 24250 + index * 10;
      const result = await applyPausableDeadlineIncidentImpact(database, {
        commandId: testId(effectBase),
        commandType: 'APPLY_PLATFORM_INCIDENT_DEADLINE_IMPACT',
        idempotencyKey: `incident:${adapterIncident}:${candidate.deadlineKind}:${candidate.aggregateId}`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: candidate.aggregateType, aggregateId: candidate.aggregateId,
        expectedVersion: candidate.version, correlationId: testId(24222),
        causationId: testId(24234), requestId: testId(effectBase + 1),
        source: 'scheduler', payloadVersion: 1,
        payload: { incidentId: adapterIncident, deadlineKind: candidate.deadlineKind,
          surface: candidate.surface },
      } satisfies CommandEnvelope<ApplyPausableDeadlineImpactPayload>, {
        impactId: testId(effectBase + 2), eventId: testId(effectBase + 3),
        auditId: testId(effectBase + 4), outboxMessageId: testId(effectBase + 5),
      }, () => new Date('2026-09-26T10:52:00.000Z'));
      expect(result.response).toMatchObject({
        oldDeadlineAt: '2026-09-26T11:00:00.000Z',
        newDeadlineAt: '2026-09-26T11:30:00.000Z',
        overlapMilliseconds: 30 * 60 * 1_000,
        version: 2,
      });
    }
    const adapterDeadlines = await sql<{
      readonly selection_deadline: Date;
      readonly conversion_deadline: Date;
      readonly reconfirmation_deadline: Date;
      readonly genesis_deadline: Date;
    }>`select
      (select selection_expires_at from scheduling.bookings
        where booking_id = ${selectionBooking}::uuid) as selection_deadline,
      (select confirmation_deadline_at from scheduling.booking_official_conversions
        where conversion_id = ${conversion}::uuid) as conversion_deadline,
      (select reconfirmation_deadline_at from competition.challenge_queue_entries
        where queue_entry_id = ${reconfirmationEntry}::uuid) as reconfirmation_deadline,
      (select single_candidate_deadline_at from competition.challenge_queue_entries
        where queue_entry_id = ${genesisEntry}::uuid) as genesis_deadline`
      .execute(database);
    expect(Object.values(adapterDeadlines.rows[0]!).map((value) => value.toISOString()))
      .toEqual(Array(4).fill('2026-09-26T11:30:00.000Z'));

    await expect(detectPlatformIncident(database, {
      commandId: testId(24070), commandType: 'DETECT_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-user-complaint-is-not-detection',
      actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: testId(24071), expectedVersion: 0,
      correlationId: testId(24072), causationId: null, requestId: testId(24073),
      source: 'api', payloadVersion: 1,
      payload: { startedAt: '2026-09-10T09:40:00.000Z',
        affectedServices: ['CHALLENGE'], affectedSurfaces: ['CHALLENGE_RESPONSE'],
        severity: 'INFO', monitoringEvidenceReference: 'user:complaint' },
    }, { eventId: testId(24074), auditId: testId(24075), outboxMessageId: testId(24076) }))
      .rejects.toEqual(expect.objectContaining<Partial<PlatformIncidentConflictError>>({
        code: 'PLATFORM_INCIDENT_SYSTEM_REQUIRED',
      }));
  });

  it('[AC-172] reminds only the recipient and expires an unanswered optional Challenge without fault', async () => {
    const base = 32500;
    const athleteA = testId(base);
    const athleteB = testId(base + 1);
    const central = testId(base + 2);
    const venue = testId(base + 3);
    const community = testId(base + 4);
    const competition = testId(base + 5);
    const sourceChat = testId(base + 6);
    const match = testId(base + 7);
    const challenge = testId(base + 8);
    const createdAt = '2026-10-01T10:00:00.000Z';

    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values
        (${athleteA}::uuid, '+79993250000', ${createdAt}::timestamptz, '1995-01-01',
          'ADULT', 'Reminder Athlete A', 'ACTIVE', 'ru-RU', 1, ${createdAt}::timestamptz),
        (${athleteB}::uuid, '+79993250001', ${createdAt}::timestamptz, '1995-01-01',
          'ADULT', 'Reminder Athlete B', 'ACTIVE', 'ru-RU', 1, ${createdAt}::timestamptz),
        (${central}::uuid, '+79993250002', ${createdAt}::timestamptz, '1985-01-01',
          'ADULT', 'Reminder Central', 'ACTIVE', 'ru-RU', 1, ${createdAt}::timestamptz)
    `.execute(database);
    await sql`
      insert into identity.account_verifications (
        verification_id, user_id, state, method, moderation_checklist_version,
        is_current, verified_at, decided_by, decision_reason, version
      ) values
        (${testId(base + 9)}::uuid, ${athleteA}::uuid, 'VERIFIED', 'CENTRAL_MODERATION',
          'identity-mvp-v1', true, ${createdAt}::timestamptz, ${central}::uuid, 'TEST_APPROVED', 1),
        (${testId(base + 10)}::uuid, ${athleteB}::uuid, 'VERIFIED', 'CENTRAL_MODERATION',
          'identity-mvp-v1', true, ${createdAt}::timestamptz, ${central}::uuid, 'TEST_APPROVED', 1)
    `.execute(database);
    await ensureLocalPilotCommunity(database, {
      venueId: venue, venueConfigurationId: testId(base + 11), communityId: community,
      communityConfigurationId: testId(base + 12), membershipId: testId(base + 13),
      centralGrantId: testId(base + 14), athleteUserId: athleteA,
      centralActorId: central, legalName: 'Reminder Pilot Gym LLC',
      venueDisplayName: 'Reminder Pilot Gym', communityName: 'Reminder Community',
      address: 'Москва', cityCode: 'MOSCOW', timezone: 'Europe/Moscow',
      contactPayload: {}, occurredAt: createdAt,
    });
    await ensureLocalPilotCompetition(database, {
      competitionId: competition, communityId: community, centralActorId: central,
      occurredAt: createdAt, memberships: [
        { membershipId: testId(base + 13), userId: athleteA },
        { membershipId: testId(base + 15), userId: athleteB },
      ],
    });
    await database.transaction().execute(async (transaction) => {
      await sql`insert into social.chats (
        chat_id, scope, state, version, created_at, updated_at
      ) values (${sourceChat}::uuid, 'PERSONAL_MATCH', 'OPEN', 1,
        ${createdAt}::timestamptz, ${createdAt}::timestamptz)`.execute(transaction);
      await sql`insert into social.chat_participants (chat_id, user_id, joined_at) values
        (${sourceChat}::uuid, ${athleteA}::uuid, ${createdAt}::timestamptz),
        (${sourceChat}::uuid, ${athleteB}::uuid, ${createdAt}::timestamptz)`
        .execute(transaction);
      await sql`insert into social.matches (
        match_id, pair_low_id, pair_high_id, state, chat_id, last_activity_at,
        version, created_at, updated_at
      ) values (${match}::uuid, least(${athleteA}::uuid, ${athleteB}::uuid),
        greatest(${athleteA}::uuid, ${athleteB}::uuid), 'ACTIVE', ${sourceChat}::uuid,
        ${createdAt}::timestamptz, 1, ${createdAt}::timestamptz, ${createdAt}::timestamptz)`
        .execute(transaction);
    });

    const createIds = {
      eventId: testId(base + 16), auditId: testId(base + 17),
      outboxMessageId: testId(base + 18), notificationId: testId(base + 19),
      notificationOutboxMessageId: testId(base + 20), serviceChatId: testId(base + 21),
      serviceChatEventId: testId(base + 22), rulesetSnapshotId: testId(base + 23),
      acknowledgmentId: testId(base + 24),
      reminderTimerOutboxMessageIds: [testId(base + 25), testId(base + 26)] as const,
    };
    const created = await createDirectOpenChallenge(database, {
      commandId: testId(base + 27), commandType: 'CREATE_DIRECT_OPEN_CHALLENGE',
      idempotencyKey: 'ac172-create',
      actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: challenge, expectedVersion: 0,
      correlationId: testId(base + 28), causationId: null, requestId: testId(base + 29),
      source: 'api', payloadVersion: 1, payload: { sourceChatId: sourceChat },
    }, createIds, () => new Date(createdAt));
    expect(created.response).toMatchObject({ state: 'AWAITING_RESPONSE', version: 1,
      responseDeadlineAt: '2026-10-03T10:00:00.000Z' });

    const timerRows = await sql<{ readonly topic: string; readonly payload: {
      readonly timer: { readonly commandType: string; readonly deadlineAt: string;
        readonly expectedState: string; readonly expectedVersion: number } } }>`
      select topic, payload from platform.outbox_messages
      where message_id in (${createIds.outboxMessageId}::uuid,
        ${createIds.reminderTimerOutboxMessageIds[0]}::uuid,
        ${createIds.reminderTimerOutboxMessageIds[1]}::uuid)
      order by payload->'timer'->>'deadlineAt'
    `.execute(database);
    expect(timerRows.rows.map((row) => ({
      topic: row.topic,
      commandType: row.payload.timer.commandType,
      deadlineAt: row.payload.timer.deadlineAt,
      expectedState: row.payload.timer.expectedState,
      expectedVersion: row.payload.timer.expectedVersion,
    })))
      .toEqual([
        { topic: 'competition.challenge.optional-response-reminder-12h-timer.v1',
          commandType: 'REMIND_OPTIONAL_CHALLENGE_RESPONSE_12H',
          deadlineAt: '2026-10-01T22:00:00.000Z', expectedState: 'AWAITING_RESPONSE',
          expectedVersion: 1 },
        { topic: 'competition.challenge.optional-response-reminder-24h-timer.v1',
          commandType: 'REMIND_OPTIONAL_CHALLENGE_RESPONSE_24H',
          deadlineAt: '2026-10-02T10:00:00.000Z', expectedState: 'AWAITING_RESPONSE',
          expectedVersion: 1 },
        { topic: 'competition.challenge.created.v1',
          commandType: 'EXPIRE_OPTIONAL_CHALLENGE',
          deadlineAt: '2026-10-03T10:00:00.000Z', expectedState: 'AWAITING_RESPONSE',
          expectedVersion: 1 },
      ]);
    await expect(readOptionalChallengeReminderTimerSnapshot(database, challenge))
      .resolves.toEqual({ state: 'AWAITING_RESPONSE', version: 1 });
    await expect(projectPendingOptionalChallengeReminder(
      database, challenge, 1, '12H', testId(base + 30),
    )).resolves.toBe(1);
    await expect(projectPendingOptionalChallengeReminder(
      database, challenge, 1, '12H', testId(base + 31),
    )).resolves.toBe(0);
    await expect(projectPendingOptionalChallengeReminder(
      database, challenge, 1, '24H', testId(base + 32),
    )).resolves.toBe(1);
    const reminderNotifications = await sql<{
      readonly recipient_user_id: string; readonly category: string;
      readonly render_key: string; readonly deadline_at: Date;
    }>`select recipient_user_id, category, render_key, deadline_at
      from platform.notifications
      where source_event_id = ${createIds.eventId}::uuid
      order by render_key`.execute(database);
    expect(reminderNotifications.rows.map((row) => ({ ...row,
      deadline_at: row.deadline_at.toISOString() }))).toEqual([
      { recipient_user_id: athleteB, category: 'MANDATORY',
        render_key: 'challenge.optional-response-reminder-12h',
        deadline_at: '2026-10-03T10:00:00.000Z' },
      { recipient_user_id: athleteB, category: 'MANDATORY',
        render_key: 'challenge.optional-response-reminder-24h',
        deadline_at: '2026-10-03T10:00:00.000Z' },
    ]);

    const expireCommand = {
      commandId: testId(base + 33), commandType: 'EXPIRE_OPTIONAL_CHALLENGE',
      idempotencyKey: 'ac172-expire',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: challenge, expectedVersion: 1,
      correlationId: testId(base + 28), causationId: createIds.eventId,
      requestId: testId(base + 34), source: 'scheduler', payloadVersion: 1,
      payload: { challengeId: challenge },
    } satisfies CommandEnvelope<{ readonly challengeId: string }>;
    const expireIds = {
      eventId: testId(base + 35), auditId: testId(base + 36),
      outboxMessageId: testId(base + 37), notificationId: testId(base + 38),
      notificationOutboxMessageId: testId(base + 39),
    };
    await expect(expireOptionalChallenge(
      database, expireCommand, expireIds, () => new Date('2026-10-03T09:59:59.999Z'),
    )).rejects.toMatchObject({ code: 'CHALLENGE_RESPONSE_NOT_DUE' });
    const expired = await expireOptionalChallenge(
      database, expireCommand, expireIds, () => new Date('2026-10-03T10:00:00.000Z'),
    );
    const replay = await expireOptionalChallenge(
      database, expireCommand, expireIds, () => new Date('2026-10-03T10:01:00.000Z'),
    );
    expect(expired.response).toMatchObject({ state: 'EXPIRED_NO_FAULT', version: 2 });
    expect(replay).toMatchObject({ replayed: true, eventId: expireIds.eventId });
    await expect(projectPendingOptionalChallengeReminder(
      database, challenge, 1, '24H', testId(base + 40),
    )).resolves.toBe(0);

    const noFaultFacts = await sql<{
      readonly results: string; readonly cooldowns: string; readonly obligations: string;
      readonly quiet_periods: string; readonly expiry_events: string;
      readonly expiry_audits: string; readonly expiry_outbox: string;
    }>`select
      (select count(*)::text from competition.results) as results,
      (select count(*)::text from competition.pair_cooldowns) as cooldowns,
      (select count(*)::text from competition.challenge_participant_obligations) as obligations,
      (select count(*)::text from competition.optional_pair_quiet_periods) as quiet_periods,
      (select count(*)::text from platform.domain_events
        where event_id = ${expireIds.eventId}::uuid) as expiry_events,
      (select count(*)::text from platform.audit_events
        where audit_id = ${expireIds.auditId}::uuid) as expiry_audits,
      (select count(*)::text from platform.outbox_messages
        where message_id = ${expireIds.outboxMessageId}::uuid) as expiry_outbox`
      .execute(database);
    expect(noFaultFacts.rows[0]).toEqual({ results: '0', cooldowns: '0',
      obligations: '0', quiet_periods: '0', expiry_events: '1', expiry_audits: '1',
      expiry_outbox: '1' });
    await expect(readChatChallenge(database, sourceChat, athleteA)).resolves.toMatchObject({
      canCreate: true, createDenialCode: null,
      challenge: { challengeId: challenge, state: 'EXPIRED_NO_FAULT' },
    });

    const nextChallenge = testId(base + 41);
    const next = await createDirectOpenChallenge(database, {
      commandId: testId(base + 42), commandType: 'CREATE_DIRECT_OPEN_CHALLENGE',
      idempotencyKey: 'ac172-create-again',
      actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: nextChallenge, expectedVersion: 0,
      correlationId: testId(base + 43), causationId: expireIds.eventId,
      requestId: testId(base + 44), source: 'api', payloadVersion: 1,
      payload: { sourceChatId: sourceChat },
    }, {
      eventId: testId(base + 45), auditId: testId(base + 46),
      outboxMessageId: testId(base + 47), notificationId: testId(base + 48),
      notificationOutboxMessageId: testId(base + 49), serviceChatId: testId(base + 50),
      serviceChatEventId: testId(base + 51), rulesetSnapshotId: testId(base + 52),
      acknowledgmentId: testId(base + 53),
      reminderTimerOutboxMessageIds: [testId(base + 54), testId(base + 55)],
    }, () => new Date('2026-10-03T10:02:00.000Z'));
    expect(next.response).toMatchObject({ challengeId: nextChallenge,
      state: 'AWAITING_RESPONSE', version: 1 });
  });

  it('[AC-196] compensates one already-final mandatory timeout append-only with deterministic replay', async () => {
    const challenger = testId(25000);
    const contender = testId(25001);
    const champion = testId(25002);
    const central = testId(25003);
    const venue = testId(25004);
    const venueConfig = testId(25005);
    const community = testId(25006);
    const communityConfig = testId(25007);
    const competition = testId(25008);
    const sourceChat = testId(25009);
    const serviceChat = testId(25010);
    const ruleset = testId(25011);
    const challenge = testId(25012);
    const challengeCreatedEvent = testId(25013);
    const resultId = testId(25020);
    const timeoutEventId = testId(25021);
    const resultEventId = testId(25022);
    const statusTransitionId = testId(25023);
    const statusEventId = testId(25024);
    const cooldownId = testId(25025);
    await sql`insert into identity.users (
      user_id, phone_e164, phone_verified_at, birth_date, age_division,
      display_name, account_state, locale, version, activated_at
    ) values
      (${challenger}::uuid, '+79990025000', '2026-09-01T09:00:00Z', '1995-01-01',
        'ADULT', 'Timeout Challenger', 'ACTIVE', 'ru-RU', 1, '2026-09-01T09:00:00Z'),
      (${contender}::uuid, '+79990025001', '2026-09-01T09:00:00Z', '1994-01-01',
        'ADULT', 'Timeout Contender', 'ACTIVE', 'ru-RU', 1, '2026-09-01T09:00:00Z'),
      (${champion}::uuid, '+79990025002', '2026-09-01T09:00:00Z', '1993-01-01',
        'ADULT', 'Timeout Champion', 'ACTIVE', 'ru-RU', 1, '2026-09-01T09:00:00Z'),
      (${central}::uuid, '+79990025003', '2026-09-01T09:00:00Z', '1985-01-01',
        'ADULT', 'Timeout Central', 'ACTIVE', 'ru-RU', 1, '2026-09-01T09:00:00Z')`
      .execute(database);
    await ensureLocalPilotCommunity(database, {
      venueId: venue, venueConfigurationId: venueConfig,
      communityId: community, communityConfigurationId: communityConfig,
      membershipId: testId(25014), centralGrantId: testId(25015),
      athleteUserId: challenger, centralActorId: central,
      legalName: 'Timeout Gym LLC', venueDisplayName: 'Timeout Gym',
      communityName: 'Timeout Community', address: 'Москва', cityCode: 'MOSCOW',
      timezone: 'Europe/Moscow', contactPayload: {}, occurredAt: '2026-09-01T09:00:00Z',
    });
    await ensureLocalPilotCompetition(database, {
      competitionId: competition, communityId: community, centralActorId: central,
      occurredAt: '2026-09-01T09:00:00Z', memberships: [
        { membershipId: testId(25014), userId: challenger },
        { membershipId: testId(25016), userId: contender },
        { membershipId: testId(25017), userId: champion },
      ],
    });
    await database.transaction().execute(async (transaction) => {
      await sql`update competition.competitions set phase = 'RUNNING',
        champion_user_id = ${champion}::uuid, contender_user_id = ${contender}::uuid,
        status_version = 2, version = 2,
        updated_at = '2026-09-28T10:00:00Z'
        where competition_id = ${competition}::uuid`.execute(transaction);
      await sql`insert into social.chats (
        chat_id, scope, state, version, created_at, updated_at
      ) values
        (${sourceChat}::uuid, 'CHALLENGE_SERVICE', 'OPEN', 1,
          '2026-09-28T10:00:00Z', '2026-09-28T10:00:00Z'),
        (${serviceChat}::uuid, 'CHALLENGE_SERVICE', 'OPEN', 1,
          '2026-09-28T10:00:00Z', '2026-09-28T10:00:00Z')`.execute(transaction);
      await sql`insert into social.chat_participants (chat_id, user_id) values
        (${sourceChat}::uuid, ${challenger}::uuid), (${sourceChat}::uuid, ${contender}::uuid),
        (${serviceChat}::uuid, ${challenger}::uuid), (${serviceChat}::uuid, ${contender}::uuid)`
        .execute(transaction);
      await sql`insert into competition.ruleset_snapshots (
        ruleset_snapshot_id, competition_id, community_configuration_id,
        ruleset_ref, ruleset_ack_mode, policy_version, created_at
      ) values (${ruleset}::uuid, ${competition}::uuid, ${communityConfig}::uuid,
        'MOLOKH_RECOMMENDED_V1', 'IMPLICIT_ON_ACCEPT', 'challenge-mvp-v1',
        '2026-09-28T10:00:00Z')`.execute(transaction);
      await sql`insert into competition.challenges (
        challenge_id, competition_id, source_chat_id, service_chat_id,
        initiator_user_id, recipient_user_id, pair_low_id, pair_high_id,
        response_policy, stake, state, ruleset_snapshot_id, response_deadline_at,
        version, created_at, updated_at
      ) values (${challenge}::uuid, ${competition}::uuid, ${sourceChat}::uuid,
        ${serviceChat}::uuid, ${challenger}::uuid, ${contender}::uuid,
        ${challenger}::uuid, ${contender}::uuid, 'MANDATORY', 'CONTENDER',
        'AWAITING_RESPONSE', ${ruleset}::uuid, '2026-10-01T10:00:00Z', 1,
        '2026-09-28T10:00:00Z', '2026-09-28T10:00:00Z')`.execute(transaction);
      await sql`insert into platform.domain_events (
        event_id, event_name, event_version, aggregate_type, aggregate_id,
        aggregate_version, transition_id, correlation_id, causation_id, actor_id,
        actor_type, actor_roles, actor_scope_ids, occurred_at, idempotency_key_hash,
        payload, metadata
      ) values (${challengeCreatedEvent}::uuid, 'ChallengeCreated', 1, 'Challenge',
        ${challenge}::uuid, 1, 'CH-01', ${testId(25018)}::uuid, null, null,
        'SYSTEM', '[]'::jsonb, '{}'::uuid[], '2026-09-28T10:00:00Z',
        'seed-ac196-challenge', ${JSON.stringify({ challengeId: challenge })}::jsonb,
        '{}'::jsonb)`.execute(transaction);
    });

    const expired = await expireOptionalChallenge(database, {
      commandId: testId(25026), commandType: 'EXPIRE_MANDATORY_CHALLENGE',
      idempotencyKey: `challenge:${challenge}:expire-mandatory:v1`,
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: challenge, expectedVersion: 1,
      correlationId: testId(25018), causationId: challengeCreatedEvent,
      requestId: testId(25027), source: 'scheduler', payloadVersion: 1,
      payload: { challengeId: challenge },
    }, {
      eventId: timeoutEventId, auditId: testId(25028), outboxMessageId: testId(25029),
      notificationId: testId(25030), notificationOutboxMessageId: testId(25031),
      resultId, resultEventId, statusTransitionId, statusEventId, cooldownId,
      cooldownEventId: testId(25032), timerOutboxMessageId: testId(25033),
      notificationIds: [testId(25034), testId(25035)],
    }, () => new Date('2026-10-01T10:05:00.000Z'));
    expect(expired.response).toMatchObject({ state: 'RESULT_RECORDED', version: 2 });

    await finalizeResult(database, {
      commandId: testId(25040), commandType: 'FINALIZE_RESULT',
      idempotencyKey: `result:${resultId}:finalize:v1`,
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'Result', aggregateId: resultId, expectedVersion: 1,
      correlationId: testId(25018), causationId: resultEventId, requestId: testId(25041),
      source: 'scheduler', payloadVersion: 1, payload: { resultId },
    }, {
      eventId: testId(25042), auditId: testId(25043), outboxMessageId: testId(25044),
      challengeEventId: testId(25045), statusFinalizationId: testId(25046),
      statusEventId: testId(25047), notificationOutboxMessageId: testId(25048),
      notificationIds: [testId(25049), testId(25050)],
    }, () => new Date('2026-10-03T10:05:00.000Z'));

    const incident = testId(25060);
    await detectPlatformIncident(database, {
      commandId: testId(25061), commandType: 'DETECT_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-ac196-detect',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: incident, expectedVersion: 0,
      correlationId: testId(25062), causationId: null, requestId: testId(25063),
      source: 'scheduler', payloadVersion: 1,
      payload: { startedAt: '2026-10-01T09:40:00.000Z',
        affectedServices: ['CHALLENGE'], affectedSurfaces: ['CHALLENGE_RESPONSE'],
        severity: 'MAJOR', monitoringEvidenceReference: 'monitor:historical-ac196' },
    }, { eventId: testId(25064), auditId: testId(25065), outboxMessageId: testId(25066) },
    () => new Date('2026-10-03T11:00:00.000Z'));
    await confirmPlatformIncident(database, {
      commandId: testId(25067), commandType: 'CONFIRM_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-ac196-confirm',
      actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: incident, expectedVersion: 1,
      correlationId: testId(25062), causationId: testId(25064), requestId: testId(25068),
      source: 'admin', payloadVersion: 1,
      payload: { incidentId: incident, reason: 'Historical outage confirmed.' },
    }, { eventId: testId(25069), auditId: testId(25070), outboxMessageId: testId(25071) },
    () => new Date('2026-10-03T11:01:00.000Z'));
    await resolvePlatformIncident(database, {
      commandId: testId(25072), commandType: 'RESOLVE_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-ac196-resolve',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: incident, expectedVersion: 2,
      correlationId: testId(25062), causationId: testId(25069), requestId: testId(25073),
      source: 'scheduler', payloadVersion: 1,
      payload: { incidentId: incident, endedAt: '2026-10-01T10:17:00.000Z',
        reason: 'Historical recovery boundary confirmed.' },
    }, { eventId: testId(25074), auditId: testId(25075), outboxMessageId: testId(25076) },
    () => new Date('2026-10-03T11:02:00.000Z'));
    await expect(listMandatoryTimeoutCompensationCandidates(database, incident)).resolves.toEqual([{
      challengeId: challenge, resultId, version: 3,
    }]);

    const replayBefore = await database.transaction().execute((transaction) =>
      replayCompetitionStatusExcludingResults({ transaction,
        sourceTransitionId: statusTransitionId, excludedResultIds: [resultId] }));
    const compensationPayload = { incidentId: incident, challengeId: challenge, resultId };
    const command = (commandId: string, requestId: string) => ({
      commandId, commandType: 'COMPENSATE_MANDATORY_CHALLENGE_TIMEOUT',
      idempotencyKey: `incident:${incident}:challenge:${challenge}:timeout-compensation`,
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'Challenge', aggregateId: challenge, expectedVersion: 3,
      correlationId: testId(25062), causationId: testId(25074), requestId,
      source: 'scheduler', payloadVersion: 1, payload: compensationPayload,
    }) satisfies CommandEnvelope<CompensateMandatoryTimeoutPayload>;
    const firstIds = { impactId: testId(25080), compensationId: testId(25081),
      eventId: testId(25082), auditId: testId(25083), outboxMessageId: testId(25084),
      resultEventId: testId(25085), competitionEventId: testId(25086),
      cooldownEventId: testId(25087) };
    const secondIds = { impactId: testId(25090), compensationId: testId(25091),
      eventId: testId(25092), auditId: testId(25093), outboxMessageId: testId(25094),
      resultEventId: testId(25095), competitionEventId: testId(25096),
      cooldownEventId: testId(25097) };
    const results = await Promise.all([
      compensateMandatoryChallengeTimeout(database,
        command(testId(25078), testId(25079)), firstIds,
        () => new Date('2026-10-03T11:03:00.000Z')),
      compensateMandatoryChallengeTimeout(database,
        command(testId(25088), testId(25089)), secondIds,
        () => new Date('2026-10-03T11:03:00.000Z')),
    ]);
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(results.filter((result) => result.replayed)).toHaveLength(1);
    const committed = results.find((result) => !result.replayed)!;
    expect(new Set(results.map((result) => result.eventId))).toEqual(
      new Set([committed.eventId]),
    );
    expect([testId(25082), testId(25092)]).toContain(committed.eventId);
    expect(results[0]?.response).toMatchObject({
      challengeState: 'CANCELLED_NO_FAULT', resultState: 'ANNULLED',
      championUserId: champion, contenderUserId: contender,
      replayHash: replayBefore.replayHash, overlapMilliseconds: 20 * 60 * 1_000,
    });

    const replayAfter = await database.transaction().execute((transaction) =>
      replayCompetitionStatusExcludingResults({ transaction,
        sourceTransitionId: statusTransitionId, excludedResultIds: [resultId] }));
    expect(replayAfter).toEqual(replayBefore);
    const facts = await sql<{
      readonly challenge_state: string;
      readonly result_state: string;
      readonly recorded_outcome_code: string;
      readonly champion_user_id: string;
      readonly contender_user_id: string;
      readonly status_lock_result_id: string | null;
      readonly transition_count: string;
      readonly timeout_event_count: string;
      readonly result_event_count: string;
      readonly impact_count: string;
      readonly compensation_count: string;
      readonly cooldown_count: string;
      readonly cooldown_effective: boolean;
      readonly active_obligations: string;
      readonly compensation_event_count: string;
    }>`select challenge.state as challenge_state, result.state as result_state,
      result.recorded_outcome_code, competition.champion_user_id,
      competition.contender_user_id, competition.status_lock_result_id,
      (select count(*)::text from competition.status_transitions
        where source_result_id = result.result_id) as transition_count,
      (select count(*)::text from platform.domain_events
        where event_id = ${timeoutEventId}::uuid and event_name = 'MandatoryChallengeExpired')
        as timeout_event_count,
      (select count(*)::text from platform.domain_events
        where event_id = ${resultEventId}::uuid and event_name = 'ResultRecorded')
        as result_event_count,
      (select count(*)::text from platform.incident_impacts
        where incident_id = ${incident}::uuid and aggregate_id = challenge.challenge_id)
        as impact_count,
      (select count(*)::text from platform.incident_timeout_compensations
        where incident_id = ${incident}::uuid and challenge_id = challenge.challenge_id)
        as compensation_count,
      (select count(*)::text from competition.pair_cooldowns
        where source_result_id = result.result_id) as cooldown_count,
      exists (select 1 from competition.pair_cooldowns
        where source_result_id = result.result_id and invalidated_at is null) as cooldown_effective,
      (select count(*)::text from competition.challenge_participant_obligations
        where challenge_id = challenge.challenge_id and released_at is null) as active_obligations,
      (select count(*)::text from platform.domain_events
        where aggregate_type = 'Challenge' and aggregate_id = challenge.challenge_id
          and event_name = 'IncidentTimeoutCompensatedNoFault') as compensation_event_count
    from competition.challenges as challenge
    join competition.results as result on result.challenge_id = challenge.challenge_id
    join competition.competitions as competition
      on competition.competition_id = challenge.competition_id
    where challenge.challenge_id = ${challenge}::uuid`.execute(database);
    expect(facts.rows[0]).toEqual({
      challenge_state: 'CANCELLED_NO_FAULT', result_state: 'ANNULLED',
      recorded_outcome_code: 'FORFEIT', champion_user_id: champion,
      contender_user_id: contender, status_lock_result_id: null,
      transition_count: '1', timeout_event_count: '1', result_event_count: '1',
      impact_count: '1', compensation_count: '1', cooldown_count: '1',
      cooldown_effective: false, active_obligations: '0', compensation_event_count: '1',
    });

    const outsideIncident = testId(25100);
    await detectPlatformIncident(database, {
      commandId: testId(25101), commandType: 'DETECT_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-ac196-outside-detect',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: outsideIncident, expectedVersion: 0,
      correlationId: testId(25102), causationId: null, requestId: testId(25103),
      source: 'scheduler', payloadVersion: 1,
      payload: { startedAt: '2026-10-02T09:40:00.000Z',
        affectedServices: ['CHALLENGE'], affectedSurfaces: ['CHALLENGE_RESPONSE'],
        severity: 'MINOR', monitoringEvidenceReference: 'monitor:outside-window' },
    }, { eventId: testId(25104), auditId: testId(25105), outboxMessageId: testId(25106) },
    () => new Date('2026-10-03T12:00:00.000Z'));
    await confirmPlatformIncident(database, {
      commandId: testId(25107), commandType: 'CONFIRM_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-ac196-outside-confirm',
      actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: outsideIncident, expectedVersion: 1,
      correlationId: testId(25102), causationId: testId(25104), requestId: testId(25108),
      source: 'admin', payloadVersion: 1,
      payload: { incidentId: outsideIncident, reason: 'Separate later outage.' },
    }, { eventId: testId(25109), auditId: testId(25110), outboxMessageId: testId(25111) },
    () => new Date('2026-10-03T12:01:00.000Z'));
    await resolvePlatformIncident(database, {
      commandId: testId(25112), commandType: 'RESOLVE_PLATFORM_INCIDENT',
      idempotencyKey: 'incident-ac196-outside-resolve',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: outsideIncident, expectedVersion: 2,
      correlationId: testId(25102), causationId: testId(25109), requestId: testId(25113),
      source: 'scheduler', payloadVersion: 1,
      payload: { incidentId: outsideIncident, endedAt: '2026-10-02T10:17:00.000Z',
        reason: 'Later outage recovered.' },
    }, { eventId: testId(25114), auditId: testId(25115), outboxMessageId: testId(25116) },
    () => new Date('2026-10-03T12:02:00.000Z'));
    await expect(listMandatoryTimeoutCompensationCandidates(database, outsideIncident))
      .resolves.toEqual([]);
  });

  it('runs recoverable account closure, self-export and payload retention end to end', async () => {
    const athlete = testId(26000);
    const central = testId(26001);
    const closure = testId(26020);
    const exportId = testId(26021);
    const finalClosure = testId(26050);
    const activate = async (userId: string, base: number, phone: string, name: string) =>
      activateUser(database, {
        commandId: testId(base), commandType: 'ACTIVATE_ACCOUNT',
        idempotencyKey: `account-lifecycle-activate-${base}`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'User', aggregateId: userId, expectedVersion: 0,
        correlationId: testId(base + 1), causationId: null, requestId: testId(base + 2),
        source: 'scheduler', payloadVersion: 1,
        payload: { userId, phoneE164: phone,
          phoneVerifiedAt: '2026-10-03T08:00:00.000Z', birthDate: '1990-01-01',
          displayName: name, locale: 'ru-RU', primarySport: 'BOXING',
          secondarySport: null, discoveryRadiusKm: 15 },
      }, { eventId: testId(base + 3), auditId: testId(base + 4),
        outboxMessageId: testId(base + 5) }, () => new Date('2026-10-03T09:00:00.000Z'));
    await activate(athlete, 26002, '+79990260000', 'Закрывающий аккаунт');
    await activate(central, 26008, '+79990260001', 'Central Closure');
    await sql`insert into community.role_grants (
      grant_id, user_id, role, scope_type, scope_id, state,
      authorized_by, authorized_at, version
    ) values (${testId(26014)}::uuid, ${central}::uuid, 'CENTRAL_ADMIN', 'GLOBAL', null,
      'ACTIVE', ${central}::uuid, '2026-10-03T09:00:00Z', 1)`.execute(database);

    const standaloneExport = await requestAccountExport(database, {
      commandId: testId(26069), commandType: 'REQUEST_ACCOUNT_EXPORT',
      idempotencyKey: 'account-export-standalone',
      actor: { type: 'USER', id: athlete, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'AccountDataExport', aggregateId: exportId, expectedVersion: 0,
      correlationId: testId(26023), causationId: null, requestId: testId(26070),
      source: 'api', payloadVersion: 1,
      payload: { userId: athlete, closureId: null },
    }, { eventId: testId(26071), auditId: testId(26072), outboxMessageId: testId(26073) },
    () => new Date('2026-10-03T09:59:00.000Z'));
    expect(standaloneExport.response).toMatchObject({ exportId, state: 'REQUESTED', version: 1 });

    const requested = await requestAccountClosure(database, {
      commandId: testId(26022), commandType: 'REQUEST_ACCOUNT_CLOSURE',
      idempotencyKey: 'account-closure-with-export',
      actor: { type: 'USER', id: athlete, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'AccountClosureRequest', aggregateId: closure, expectedVersion: 0,
      correlationId: testId(26023), causationId: null, requestId: testId(26024),
      source: 'api', payloadVersion: 1,
      payload: { userId: athlete, exportRequested: true },
    }, { eventId: testId(26025), auditId: testId(26026), outboxMessageId: testId(26027),
      exportId, exportEventId: testId(26028), exportOutboxMessageId: testId(26029) },
    () => new Date('2026-10-03T10:00:00.000Z'));
    expect(requested.response).toMatchObject({
      closure: { closureId: closure, state: 'REQUESTED',
        recoveryUntil: '2026-11-02T10:00:00.000Z', version: 1 },
      dataExport: { exportId, state: 'REQUESTED', version: 1 },
    });
    await expect(requestAccountExport(database, {
      commandId: testId(26074), commandType: 'REQUEST_ACCOUNT_EXPORT',
      idempotencyKey: 'account-export-duplicate-live',
      actor: { type: 'USER', id: athlete, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'AccountDataExport', aggregateId: testId(26075), expectedVersion: 0,
      correlationId: testId(26023), causationId: testId(26025), requestId: testId(26076),
      source: 'api', payloadVersion: 1,
      payload: { userId: athlete, closureId: closure },
    }, { eventId: testId(26077), auditId: testId(26078), outboxMessageId: testId(26079) },
    () => new Date('2026-10-03T10:00:30.000Z')))
      .rejects.toMatchObject({ code: 'ACCOUNT_EXPORT_INVALID_STATE' });

    const prepared = await prepareAccountExport(database, {
      commandId: testId(26030), commandType: 'PREPARE_ACCOUNT_EXPORT',
      idempotencyKey: 'account-export-prepare',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'AccountDataExport', aggregateId: exportId, expectedVersion: 1,
      correlationId: testId(26023), causationId: testId(26028), requestId: testId(26031),
      source: 'scheduler', payloadVersion: 1, payload: { exportId },
    }, { eventId: testId(26032), auditId: testId(26033), outboxMessageId: testId(26034) },
    () => new Date('2026-10-03T10:01:00.000Z'));
    expect(prepared.response).toMatchObject({ state: 'READY', version: 2,
      expiresAt: '2026-10-05T10:01:00.000Z' });
    expect(prepared.response.payloadSha256).toMatch(/^[0-9a-f]{64}$/);
    await expect(readAccountExportPayload(database, athlete, exportId,
      new Date('2026-10-04T10:00:00.000Z'))).resolves.toMatchObject({
      schemaVersion: 1, userId: athlete,
      profile: { display_name: 'Закрывающий аккаунт' },
    });
    await expect(expireAccountExport(database, {
      commandId: testId(26035), commandType: 'EXPIRE_ACCOUNT_EXPORT',
      idempotencyKey: 'account-export-expire-too-early',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'AccountDataExport', aggregateId: exportId, expectedVersion: 2,
      correlationId: testId(26023), causationId: testId(26032), requestId: testId(26036),
      source: 'scheduler', payloadVersion: 1, payload: { exportId },
    }, { eventId: testId(26037), auditId: testId(26038), outboxMessageId: testId(26039) },
    () => new Date('2026-10-05T10:00:59.999Z')))
      .rejects.toMatchObject({ code: 'ACCOUNT_EXPORT_NOT_DUE' });
    const expired = await expireAccountExport(database, {
      commandId: testId(26040), commandType: 'EXPIRE_ACCOUNT_EXPORT',
      idempotencyKey: 'account-export-expire',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'AccountDataExport', aggregateId: exportId, expectedVersion: 2,
      correlationId: testId(26023), causationId: testId(26032), requestId: testId(26041),
      source: 'scheduler', payloadVersion: 1, payload: { exportId },
    }, { eventId: testId(26042), auditId: testId(26043), outboxMessageId: testId(26044) },
    () => new Date('2026-10-05T10:01:00.000Z'));
    expect(expired.response).toMatchObject({ state: 'EXPIRED', version: 3 });
    await expect(readAccountExportPayload(database, athlete, exportId))
      .rejects.toBeInstanceOf(AccountLifecycleConflictError);

    const cancelled = await cancelAccountClosure(database, {
      commandId: testId(26045), commandType: 'CANCEL_ACCOUNT_CLOSURE',
      idempotencyKey: 'account-closure-cancel',
      actor: { type: 'USER', id: athlete, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'AccountClosureRequest', aggregateId: closure, expectedVersion: 1,
      correlationId: testId(26023), causationId: testId(26025), requestId: testId(26046),
      source: 'api', payloadVersion: 1, payload: { closureId: closure },
    }, { eventId: testId(26047), auditId: testId(26048), outboxMessageId: testId(26049) },
    () => new Date('2026-10-06T10:00:00.000Z'));
    expect(cancelled.response.closure).toMatchObject({ state: 'CANCELLED', version: 2 });

    await requestAccountClosure(database, {
      commandId: testId(26051), commandType: 'REQUEST_ACCOUNT_CLOSURE',
      idempotencyKey: 'account-closure-final-request',
      actor: { type: 'USER', id: athlete, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'AccountClosureRequest', aggregateId: finalClosure, expectedVersion: 0,
      correlationId: testId(26052), causationId: testId(26047), requestId: testId(26053),
      source: 'api', payloadVersion: 1,
      payload: { userId: athlete, exportRequested: false },
    }, { eventId: testId(26054), auditId: testId(26055), outboxMessageId: testId(26056) },
    () => new Date('2026-10-06T10:00:00.000Z'));
    await expect(listAccountClosuresForCentral(database, central,
      new Date('2026-11-05T09:59:59.999Z'))).resolves.toEqual([
      expect.objectContaining({ closureId: finalClosure, executable: false }),
    ]);
    await expect(executeAccountClosure(database, {
      commandId: testId(26057), commandType: 'CLOSE_ACCOUNT',
      idempotencyKey: 'account-closure-final-too-early',
      actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'User', aggregateId: athlete, expectedVersion: 1,
      correlationId: testId(26052), causationId: testId(26054), requestId: testId(26058),
      source: 'admin', payloadVersion: 1,
      payload: { closureId: finalClosure, userId: athlete, reason: 'User request approved.' },
    }, { eventId: testId(26059), closureEventId: testId(26060),
      auditId: testId(26061), outboxMessageId: testId(26062) },
    () => new Date('2026-11-05T09:59:59.999Z')))
      .rejects.toMatchObject({ code: 'ACCOUNT_CLOSURE_RECOVERY_ACTIVE' });
    await expect(listAccountClosuresForCentral(database, central,
      new Date('2026-11-05T10:00:00.000Z'))).resolves.toEqual([
      expect.objectContaining({ closureId: finalClosure, executable: true,
        blockers: { activeObligationCount: 0, heldStatusCount: 0,
          activeSessionCount: 0, activeMembershipCount: 0, activeRoleCount: 0,
          activeQueueEntryCount: 0 } }),
    ]);
    const closed = await executeAccountClosure(database, {
      commandId: testId(26063), commandType: 'CLOSE_ACCOUNT',
      idempotencyKey: 'account-closure-final-execute',
      actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'User', aggregateId: athlete, expectedVersion: 1,
      correlationId: testId(26052), causationId: testId(26054), requestId: testId(26064),
      source: 'admin', payloadVersion: 1,
      payload: { closureId: finalClosure, userId: athlete, reason: 'User request approved.' },
    }, { eventId: testId(26065), closureEventId: testId(26066),
      auditId: testId(26067), outboxMessageId: testId(26068) },
    () => new Date('2026-11-05T10:00:00.000Z'));
    expect(closed.response).toMatchObject({ accountState: 'CLOSED',
      displayName: 'Удалённый участник', phoneVerified: false, version: 2, capabilities: [] });
    await expect(readIdentityProjection(database, athlete)).resolves.toEqual(closed.response);
    await expect(readMyAccountLifecycle(database, athlete)).resolves.toMatchObject({
      closure: { closureId: finalClosure, state: 'EXECUTED', version: 2 },
      dataExport: { exportId, state: 'EXPIRED', version: 3 },
    });
    const privateFacts = await sql<{ readonly phone_e164: string;
      readonly event_count: string; readonly payload_is_null: boolean }>`
      select users.phone_e164,
        (select count(*)::text from platform.domain_events where aggregate_type = 'User'
          and aggregate_id = users.user_id and event_name = 'UserAccountClosed') as event_count,
        (select export_payload is null from identity.account_data_exports
          where export_id = ${exportId}::uuid) as payload_is_null
      from identity.users as users where users.user_id = ${athlete}::uuid
    `.execute(database);
    expect(privateFacts.rows[0]).toEqual({ phone_e164: `closed:${athlete}`,
      event_count: '1', payload_is_null: true });
  });

  it('[AC-197][AC-198][AC-199] governs recovery, phone hold and duplicates without merging history', async () => {
    const athleteA = testId(27000);
    const athleteB = testId(27001);
    const central = testId(27002);
    const phoneCase = testId(27020);
    const verifiedCase = testId(27040);
    const duplicateCase = testId(27060);
    const venue = testId(27003);
    const community = testId(27004);
    const competition = testId(27005);
    const activate = async (userId: string, base: number, phone: string, name: string) =>
      activateUser(database, {
        commandId: testId(base), commandType: 'ACTIVATE_ACCOUNT',
        idempotencyKey: `account-access-activate-${base}`,
        actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
        aggregateType: 'User', aggregateId: userId, expectedVersion: 0,
        correlationId: testId(base + 1), causationId: null, requestId: testId(base + 2),
        source: 'scheduler', payloadVersion: 1,
        payload: { userId, phoneE164: phone,
          phoneVerifiedAt: '2026-10-03T08:00:00.000Z', birthDate: '1990-01-01',
          displayName: name, locale: 'ru-RU', primarySport: 'BOXING',
          secondarySport: null, discoveryRadiusKm: 15 },
      }, { eventId: testId(base + 3), auditId: testId(base + 4),
        outboxMessageId: testId(base + 5) }, () => new Date('2026-10-03T09:00:00.000Z'));
    await activate(athleteA, 27100, '+79990270000', 'Recovery Athlete');
    await activate(athleteB, 27110, '+79990270001', 'Duplicate Athlete');
    await activate(central, 27120, '+79990270002', 'Central Access');
    await ensureLocalPilotCommunity(database, {
      venueId: venue, venueConfigurationId: testId(27006), communityId: community,
      communityConfigurationId: testId(27007), membershipId: testId(27008),
      centralGrantId: testId(27009), athleteUserId: athleteA, centralActorId: central,
      legalName: 'Access Pilot Gym LLC', venueDisplayName: 'Access Pilot Gym',
      communityName: 'Access Community', address: 'Москва', cityCode: 'MOSCOW',
      timezone: 'Europe/Moscow', contactPayload: { phone: '+79990270999' },
      occurredAt: '2026-10-03T09:00:00.000Z',
    });
    await ensureLocalPilotCompetition(database, {
      competitionId: competition, communityId: community, centralActorId: central,
      occurredAt: '2026-10-03T09:00:00.000Z', memberships: [
        { membershipId: testId(27008), userId: athleteA },
        { membershipId: testId(27010), userId: athleteB },
      ],
    });
    await sql`update competition.competitions set phase = 'RUNNING',
      champion_user_id = ${athleteA}::uuid, contender_user_id = ${athleteB}::uuid,
      status_version = 2 where competition_id = ${competition}::uuid`.execute(database);
    await sql`insert into identity.trusted_sessions (
        trusted_session_id, user_id, session_reference_hash, state, trusted_at, last_seen_at
      ) values (${testId(27011)}::uuid, ${athleteA}::uuid, ${'a'.repeat(64)}, 'TRUSTED',
        '2026-10-03T09:00:00Z', '2026-10-03T09:30:00Z')`.execute(database);

    const requestedPhone = await requestAccountRecovery(database, {
      commandId: testId(27021), commandType: 'REQUEST_ACCOUNT_RECOVERY',
      idempotencyKey: 'recovery-phone-request',
      actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'AccountAccessCase', aggregateId: phoneCase, expectedVersion: 0,
      correlationId: testId(27022), causationId: null, requestId: testId(27023),
      source: 'api', payloadVersion: 1, payload: { userId: athleteA,
        route: 'PHONE_CHANGE', signals: ['TRUSTED_SESSION'],
        requestedPhoneE164: '+79990270009',
        reason: 'Previous SIM is unavailable and trusted session is active' },
    }, { eventId: testId(27024), auditId: testId(27025),
      outboxMessageId: testId(27026) }, () => new Date('2026-10-03T10:00:00.000Z'));
    expect(requestedPhone.response).toMatchObject({ state: 'PENDING',
      route: 'PHONE_CHANGE', requestedPhoneE164: '+79990270009', version: 1 });

    const approved = await approvePhoneChange(database, {
      commandId: testId(27027), commandType: 'APPROVE_PHONE_CHANGE',
      idempotencyKey: 'recovery-phone-approve',
      actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'AccountAccessCase', aggregateId: phoneCase, expectedVersion: 1,
      correlationId: testId(27022), causationId: testId(27024), requestId: testId(27028),
      source: 'admin', payloadVersion: 1,
      payload: { caseId: phoneCase, reason: 'Trusted session and Central signals agree' },
    }, { eventId: testId(27029), auditId: testId(27030),
      outboxMessageId: testId(27031), sensitiveHoldId: testId(27032),
      userEventId: testId(27033) }, () => new Date('2026-10-03T10:05:00.000Z'));
    expect(approved.response).toMatchObject({ state: 'SECURITY_HOLD',
      securityHoldUntil: '2026-10-04T10:05:00.000Z', version: 2 });
    await expect(requestAccountClosure(database, {
      commandId: testId(27034), commandType: 'REQUEST_ACCOUNT_CLOSURE',
      idempotencyKey: 'closure-during-phone-hold',
      actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'AccountClosureRequest', aggregateId: testId(27035), expectedVersion: 0,
      correlationId: testId(27022), causationId: testId(27029), requestId: testId(27036),
      source: 'api', payloadVersion: 1,
      payload: { userId: athleteA, exportRequested: false },
    }, { eventId: testId(27037), auditId: testId(27038),
      outboxMessageId: testId(27039) }))
      .rejects.toMatchObject({ code: 'ACCOUNT_CLOSURE_SECURITY_HOLD' });
    await expect(expirePhoneChangeSecurityHold(database, {
      commandId: testId(27041), commandType: 'EXPIRE_SECURITY_HOLD',
      idempotencyKey: 'recovery-phone-expire-early',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'AccountAccessCase', aggregateId: phoneCase, expectedVersion: 2,
      correlationId: testId(27022), causationId: testId(27029), requestId: testId(27042),
      source: 'scheduler', payloadVersion: 1, payload: { caseId: phoneCase },
    }, { eventId: testId(27043), auditId: testId(27044),
      outboxMessageId: testId(27045) }, () => new Date('2026-10-04T10:04:59.999Z')))
      .rejects.toMatchObject({ code: 'ACCOUNT_ACCESS_HOLD_NOT_DUE' });
    const expired = await expirePhoneChangeSecurityHold(database, {
      commandId: testId(27046), commandType: 'EXPIRE_SECURITY_HOLD',
      idempotencyKey: 'recovery-phone-expire',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'AccountAccessCase', aggregateId: phoneCase, expectedVersion: 2,
      correlationId: testId(27022), causationId: testId(27029), requestId: testId(27047),
      source: 'scheduler', payloadVersion: 1, payload: { caseId: phoneCase },
    }, { eventId: testId(27048), auditId: testId(27049),
      outboxMessageId: testId(27050) }, () => new Date('2026-10-04T10:05:00.000Z'));
    expect(expired.response).toMatchObject({ state: 'COMPLETED', version: 3 });
    await expect(readMyAccountAccess(database, athleteA)).resolves.toEqual(expired.response);

    await requestAccountRecovery(database, {
      commandId: testId(27051), commandType: 'REQUEST_ACCOUNT_RECOVERY',
      idempotencyKey: 'verified-route-request',
      actor: { type: 'USER', id: athleteB, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'AccountAccessCase', aggregateId: verifiedCase, expectedVersion: 0,
      correlationId: testId(27052), causationId: null, requestId: testId(27053),
      source: 'api', payloadVersion: 1, payload: { userId: athleteB,
        route: 'VERIFIED_ROUTE', signals: ['VERIFIED_PHONE'], requestedPhoneE164: null,
        reason: 'Verified phone route is available for recovery' },
    }, { eventId: testId(27054), auditId: testId(27055),
      outboxMessageId: testId(27056) }, () => new Date('2026-10-04T11:00:00.000Z'));
    const verified = await completeVerifiedRecovery(database, {
      commandId: testId(27057), commandType: 'COMPLETE_VERIFIED_RECOVERY',
      idempotencyKey: 'verified-route-complete',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'AccountAccessCase', aggregateId: verifiedCase, expectedVersion: 1,
      correlationId: testId(27052), causationId: testId(27054), requestId: testId(27058),
      source: 'scheduler', payloadVersion: 1,
      payload: { caseId: verifiedCase, verifiedRouteSucceeded: true },
    }, { eventId: testId(27059), auditId: testId(27061),
      outboxMessageId: testId(27062) }, () => new Date('2026-10-04T11:01:00.000Z'));
    expect(verified.response).toMatchObject({ state: 'COMPLETED', route: 'VERIFIED_ROUTE' });

    const opened = await openDuplicateAccountReview(database, {
      commandId: testId(27063), commandType: 'OPEN_DUPLICATE_REVIEW',
      idempotencyKey: 'duplicate-open',
      actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'DuplicateAccountCase', aggregateId: duplicateCase, expectedVersion: 0,
      correlationId: testId(27064), causationId: null, requestId: testId(27065),
      source: 'admin', payloadVersion: 1, payload: { userIds: [athleteB, athleteA],
        signalReferences: ['central:manual-review-27060'],
        reason: 'Central confirmed material duplicate-account signals' },
    }, { eventId: testId(27066), auditId: testId(27067),
      outboxMessageId: testId(27068), processHoldIds: [testId(27069)] },
    () => new Date('2026-10-04T12:00:00.000Z'));
    expect(opened.response).toMatchObject({ state: 'UNDER_REVIEW',
      userIds: [athleteA, athleteB], canonicalUserId: null, version: 1 });
    expect(opened.response.processes).toHaveLength(2);

    const dispositions = opened.response.processes.map((process) => ({
      kind: process.kind, aggregateId: process.aggregateId,
      currentOwnerUserId: process.currentOwnerUserId,
      decision: 'SEPARATE_GOVERNED_REVIEW' as const,
    }));
    const resolved = await resolveDuplicateAccountReview(database, {
      commandId: testId(27070), commandType: 'RESOLVE_DUPLICATE',
      idempotencyKey: 'duplicate-resolve',
      actor: { type: 'USER', id: central, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'DuplicateAccountCase', aggregateId: duplicateCase, expectedVersion: 1,
      correlationId: testId(27064), causationId: testId(27066), requestId: testId(27071),
      source: 'admin', payloadVersion: 1, payload: { caseId: duplicateCase,
        canonicalUserId: athleteA, dispositions,
        reason: 'Central selected one canonical User and explicit process reviews' },
    }, { eventId: testId(27072), auditId: testId(27073),
      outboxMessageId: testId(27074), aliasIds: [testId(27075)],
      userEventIds: [testId(27076)] }, () => new Date('2026-10-04T12:05:00.000Z'));
    expect(resolved.response).toMatchObject({ state: 'RESOLVED',
      canonicalUserId: athleteA, version: 2 });
    const facts = await sql<{ readonly champion_user_id: string;
      readonly contender_user_id: string; readonly duplicate_state: string;
      readonly alias_count: string; readonly active_hold_count: string;
      readonly trusted_session_state: string }>`select competition.champion_user_id,
        competition.contender_user_id,
        (select account_state from identity.users where user_id = ${athleteB}::uuid)
          as duplicate_state,
        (select count(*)::text from identity.duplicate_account_aliases
          where case_id = ${duplicateCase}::uuid) as alias_count,
        (select count(*)::text from competition.process_holds
          where duplicate_account_case_id = ${duplicateCase}::uuid and state = 'ACTIVE')
          as active_hold_count,
        (select state from identity.trusted_sessions where user_id = ${athleteA}::uuid)
          as trusted_session_state
      from competition.competitions as competition
      where competition.competition_id = ${competition}::uuid`.execute(database);
    expect(facts.rows[0]).toEqual({ champion_user_id: athleteA,
      contender_user_id: athleteB, duplicate_state: 'RESTRICTED', alias_count: '1',
      active_hold_count: '1', trusted_session_state: 'REVOKED' });
    await expect(requestAccountRecovery(database, {
      commandId: testId(27077), commandType: 'REQUEST_ACCOUNT_RECOVERY',
      idempotencyKey: 'recovery-after-duplicate',
      actor: { type: 'USER', id: athleteB, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'AccountAccessCase', aggregateId: testId(27078), expectedVersion: 0,
      correlationId: testId(27079), causationId: testId(27072), requestId: testId(27080),
      source: 'api', payloadVersion: 1, payload: { userId: athleteB,
        route: 'VERIFIED_ROUTE', signals: [], requestedPhoneE164: null,
        reason: 'Missing recovery signal must be rejected' },
    }, { eventId: testId(27081), auditId: testId(27082),
      outboxMessageId: testId(27083) }))
      .rejects.toBeInstanceOf(AccountAccessConflictError);
  });

  it('stores only auth verifiers, rotates refresh tokens and revokes the session family', async () => {
    const userId = testId(28001);
    const challengeId = testId(28002);
    const familyId = testId(28003);
    const firstAccessTokenId = testId(28004);
    const firstRefreshTokenId = testId(28005);
    const trustedSessionId = testId(28006);
    const issuedAt = new Date('2026-10-04T10:00:00.000Z');
    const otpVerifierHash = 'a'.repeat(64);
    const firstAccessHash = 'b'.repeat(64);
    const firstRefreshHash = 'c'.repeat(64);

    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values (
        ${userId}::uuid, '+79992800001', '2026-10-01T10:00:00.000Z'::timestamptz,
        '1995-01-01', 'ADULT', 'Auth Athlete', 'ACTIVE', 'ru-RU', 1,
        '2026-10-01T10:00:00.000Z'::timestamptz
      )
    `.execute(database);

    const requested = await requestAuthOtp(database, {
      commandId: testId(28007), commandType: 'REQUEST_AUTH_OTP',
      idempotencyKey: 'auth-otp-request-28001',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'AuthOtpChallenge', aggregateId: challengeId, expectedVersion: 0,
      correlationId: testId(28008), causationId: null, requestId: testId(28009),
      source: 'api', payloadVersion: 1,
      payload: { phoneE164: '+79992800001', transport: 'LOCAL_DEVELOPMENT',
        localDevelopmentTransportEnabled: true, smsTransportAvailable: false,
        smsOptedIn: false },
    }, { eventId: testId(28010), auditId: testId(28011),
      outboxMessageId: testId(28012), expiredChallengeEventId: testId(28043) },
    otpVerifierHash, () => issuedAt);
    expect(requested.response).toMatchObject({ challengeId, state: 'PENDING', version: 1 });

    const rejected = await verifyAuthOtp(database, {
      commandId: testId(28013), commandType: 'VERIFY_AUTH_OTP',
      idempotencyKey: 'auth-otp-wrong-28001',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'AuthOtpChallenge', aggregateId: challengeId, expectedVersion: 1,
      correlationId: testId(28008), causationId: testId(28010), requestId: testId(28014),
      source: 'api', payloadVersion: 1,
      payload: { challengeId, deviceLabel: 'Pilot browser' },
    }, { eventId: testId(28015), auditId: testId(28016), outboxMessageId: testId(28017),
      trustedSessionId: testId(28018), familyId: testId(28019),
      refreshTokenId: testId(28020), accessTokenId: testId(28021),
      sessionEventId: testId(28022) }, {
      suppliedCodeVerifierHash: 'd'.repeat(64), sessionReferenceHash: 'e'.repeat(64),
      accessTokenHash: firstAccessHash, refreshTokenHash: firstRefreshHash,
    }, () => new Date('2026-10-04T10:01:00.000Z'));
    expect(rejected.response).toMatchObject({ outcome: 'INVALID_CODE',
      challenge: { attempts: 1, version: 2 }, session: null });

    const verified = await verifyAuthOtp(database, {
      commandId: testId(28023), commandType: 'VERIFY_AUTH_OTP',
      idempotencyKey: 'auth-otp-correct-28001',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'AuthOtpChallenge', aggregateId: challengeId, expectedVersion: 2,
      correlationId: testId(28008), causationId: testId(28015), requestId: testId(28024),
      source: 'api', payloadVersion: 1,
      payload: { challengeId, deviceLabel: 'Pilot browser' },
    }, { eventId: testId(28025), auditId: testId(28026), outboxMessageId: testId(28027),
      trustedSessionId, familyId, refreshTokenId: firstRefreshTokenId,
      accessTokenId: firstAccessTokenId, sessionEventId: testId(28028) }, {
      suppliedCodeVerifierHash: otpVerifierHash, sessionReferenceHash: 'e'.repeat(64),
      accessTokenHash: firstAccessHash, refreshTokenHash: firstRefreshHash,
    }, () => new Date('2026-10-04T10:02:00.000Z'));
    expect(verified.response).toMatchObject({ outcome: 'VERIFIED',
      session: { familyId, generation: 1 } });
    await expect(authenticateAccessToken(database, firstAccessHash,
      new Date('2026-10-04T10:03:00.000Z'))).resolves.toMatchObject({
      userId, familyId, accessMode: 'FULL',
    });

    const refreshContext = await readRefreshTokenContext(database, firstRefreshHash);
    expect(refreshContext).toMatchObject({ familyId, generation: 1,
      refreshTokenState: 'ACTIVE', familyVersion: 1 });
    const secondAccessHash = 'f'.repeat(64);
    const secondRefreshHash = '1'.repeat(64);
    const rotated = await rotateAuthSession(database, {
      commandId: testId(28029), commandType: 'ROTATE_AUTH_SESSION',
      idempotencyKey: 'auth-refresh-28001',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'AuthSessionFamily', aggregateId: familyId, expectedVersion: 1,
      correlationId: testId(28008), causationId: testId(28028), requestId: testId(28030),
      source: 'api', payloadVersion: 1,
      payload: { familyId, refreshTokenId: firstRefreshTokenId, generation: 1 },
    }, { eventId: testId(28031), auditId: testId(28032), outboxMessageId: testId(28033),
      refreshTokenId: testId(28034), accessTokenId: testId(28035) }, {
      currentRefreshTokenHash: firstRefreshHash, nextRefreshTokenHash: secondRefreshHash,
      nextAccessTokenHash: secondAccessHash,
    }, () => new Date('2026-10-04T10:04:00.000Z'));
    expect(rotated.response).toMatchObject({ familyId, generation: 2 });
    await expect(authenticateAccessToken(database, firstAccessHash,
      new Date('2026-10-04T10:05:00.000Z'))).resolves.toBeNull();
    await expect(authenticateAccessToken(database, secondAccessHash,
      new Date('2026-10-04T10:05:00.000Z'))).resolves.toMatchObject({ userId, familyId });

    const accessCaseId = testId(28041);
    await sql`
      insert into identity.account_access_cases (
        case_id, user_id, state, recovery_route, recovery_signals,
        requested_phone_e164, request_reason, requested_by, requested_at,
        reviewed_by, decision_reason, decision_at, security_hold_until,
        completed_at, policy_version, version
      ) values (
        ${accessCaseId}::uuid, ${userId}::uuid, 'SECURITY_HOLD', 'PHONE_CHANGE',
        array['TRUSTED_SESSION']::text[], '+79992800999',
        'Trusted session confirms the requested phone change', ${userId}::uuid,
        '2026-10-04T09:55:00.000Z'::timestamptz, ${userId}::uuid,
        'Central approved the verified recovery signals',
        '2026-10-04T10:05:00.000Z'::timestamptz,
        '2026-10-05T10:05:00.000Z'::timestamptz, null,
        'account-access-mvp-v1', 2
      )
    `.execute(database);
    await sql`
      insert into identity.user_sensitive_action_holds (
        hold_id, user_id, source_case_id, state, starts_at, ends_at, version
      ) values (
        ${testId(28042)}::uuid, ${userId}::uuid, ${accessCaseId}::uuid, 'ACTIVE',
        '2026-10-04T10:05:00.000Z'::timestamptz,
        '2026-10-05T10:05:00.000Z'::timestamptz, 1
      )
    `.execute(database);
    await expect(authenticateAccessToken(database, secondAccessHash,
      new Date('2026-10-04T10:06:00.000Z'))).resolves.toMatchObject({
      userId, familyId, accessMode: 'SERVICE_RESPONSE_ONLY',
    });

    const revoked = await revokeAuthSession(database, {
      commandId: testId(28036), commandType: 'REVOKE_AUTH_SESSION',
      idempotencyKey: 'auth-logout-28001',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'AuthSessionFamily', aggregateId: familyId, expectedVersion: 2,
      correlationId: testId(28008), causationId: testId(28031), requestId: testId(28037),
      source: 'api', payloadVersion: 1,
      payload: { familyId, reason: 'LOGOUT' },
    }, { eventId: testId(28038), auditId: testId(28039),
      outboxMessageId: testId(28040) }, () => new Date('2026-10-04T10:07:00.000Z'));
    expect(revoked.response).toEqual({ familyId, state: 'REVOKED' });
    await expect(authenticateAccessToken(database, secondAccessHash,
      new Date('2026-10-04T10:08:00.000Z'))).resolves.toBeNull();

    const stored = await sql<{ readonly code_hash: string; readonly access_hash: string;
      readonly refresh_hash: string; readonly family_state: string;
      readonly trusted_state: string }>`
      select challenge.code_verifier_hash as code_hash,
        access_token.token_hash as access_hash,
        refresh_token.token_hash as refresh_hash,
        family.state as family_state, trusted.state as trusted_state
      from identity.auth_otp_challenges challenge
      join identity.auth_session_families family on family.user_id = challenge.user_id
      join identity.trusted_sessions trusted
        on trusted.trusted_session_id = family.trusted_session_id
      join identity.auth_access_tokens access_token
        on access_token.family_id = family.family_id and access_token.generation = 2
      join identity.auth_refresh_tokens refresh_token
        on refresh_token.family_id = family.family_id and refresh_token.generation = 2
      where challenge.challenge_id = ${challengeId}::uuid
    `.execute(database);
    expect(stored.rows[0]).toEqual({ code_hash: otpVerifierHash,
      access_hash: secondAccessHash, refresh_hash: secondRefreshHash,
      family_state: 'REVOKED', trusted_state: 'REVOKED' });
  });

  it('[AC-013][AC-014][AC-015][M-04][M-05] governs Membership entry and request decisions', async () => {
    const base = 29000;
    const seedUser = testId(base + 1);
    const applicant = testId(base + 2);
    const qrApplicant = testId(base + 3);
    const lifecycleApplicant = testId(base + 50);
    const admin = testId(base + 4);
    const central = testId(base + 5);
    const venue = testId(base + 6);
    const community = testId(base + 7);
    await sql`
      insert into identity.users (
        user_id, phone_e164, phone_verified_at, birth_date, age_division,
        display_name, account_state, locale, version, activated_at
      ) values
        (${seedUser}::uuid, '+79992900001', now(), '1990-01-01', 'ADULT',
          'Seed Athlete', 'ACTIVE', 'ru-RU', 1, now()),
        (${applicant}::uuid, '+79992900002', now(), '1991-01-01', 'ADULT',
          'Applicant', 'ACTIVE', 'ru-RU', 1, now()),
        (${qrApplicant}::uuid, '+79992900003', now(), '1992-01-01', 'ADULT',
          'QR Applicant', 'ACTIVE', 'ru-RU', 1, now()),
        (${admin}::uuid, '+79992900004', now(), '1989-01-01', 'ADULT',
          'Gym Admin', 'ACTIVE', 'ru-RU', 1, now()),
        (${central}::uuid, '+79992900005', now(), '1988-01-01', 'ADULT',
          'Central', 'ACTIVE', 'ru-RU', 1, now()),
        (${lifecycleApplicant}::uuid, '+79992900050', now(), '1993-01-01', 'ADULT',
          'Lifecycle Applicant', 'ACTIVE', 'ru-RU', 1, now())
    `.execute(database);
    await ensureLocalPilotCommunity(database, {
      venueId: venue, venueConfigurationId: testId(base + 8), communityId: community,
      communityConfigurationId: testId(base + 9), membershipId: testId(base + 10),
      centralGrantId: testId(base + 11), athleteUserId: seedUser, centralActorId: central,
      legalName: 'Membership Pilot LLC', venueDisplayName: 'Membership Pilot',
      communityName: 'Membership Community', address: 'Москва', cityCode: 'MOSCOW',
      timezone: 'Europe/Moscow', contactPayload: { phone: '+79992900000' },
      occurredAt: '2026-10-04T09:00:00.000Z',
    });
    await sql`
      insert into community.role_grants (
        grant_id, user_id, role, scope_type, scope_id, state,
        authorized_by, authorized_at, version
      ) values (
        ${testId(base + 12)}::uuid, ${admin}::uuid, 'GYM_ADMIN', 'VENUE',
        ${venue}::uuid, 'ACTIVE', ${central}::uuid, now(), 1
      )
    `.execute(database);

    const requestedMembership = testId(base + 13);
    const requestCommand: CommandEnvelope<{ readonly communityId: string }> = {
      commandId: testId(base + 14), commandType: 'REQUEST_MEMBERSHIP',
      idempotencyKey: 'membership-request-29000',
      actor: { type: 'USER', id: applicant, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'CommunityMembership', aggregateId: requestedMembership,
      expectedVersion: 0, correlationId: testId(base + 15), causationId: null,
      requestId: testId(base + 16), source: 'api', payloadVersion: 1,
      payload: { communityId: community },
    };
    const requestIds = {
      eventId: testId(base + 17), auditId: testId(base + 18),
      outboxMessageId: testId(base + 19), notificationIds: [testId(base + 20)],
      reminderTimerOutboxMessageId: testId(base + 21),
      escalationTimerOutboxMessageId: testId(base + 22),
    };
    const requested = await requestMembership(database, requestCommand, requestIds);
    const replay = await requestMembership(database, requestCommand, requestIds);
    expect(requested).toMatchObject({ replayed: false, responseStatus: 201,
      response: { membershipId: requestedMembership, state: 'PENDING',
        competitionEnabled: false, joinPath: 'SELF_REQUEST', version: 1 } });
    expect(replay.replayed).toBe(true);
    expect(await listPendingMemberships(database, admin, community)).toMatchObject([
      { membershipId: requestedMembership, displayName: 'Applicant', state: 'PENDING' },
    ]);
    await expect(listPendingMemberships(database, applicant, community))
      .rejects.toEqual(expect.objectContaining({ code: 'MEMBERSHIP_ADMIN_REQUIRED' }));

    const timerOutbox = await sql<{ readonly topic: string; readonly payload: {
      readonly timer: { readonly deadlineAt: string; readonly commandType: string } } }>`
      select topic, payload from platform.outbox_messages
      where message_id in (
        ${requestIds.reminderTimerOutboxMessageId}::uuid,
        ${requestIds.escalationTimerOutboxMessageId}::uuid
      ) order by topic
    `.execute(database);
    expect(timerOutbox.rows.map((row) => row.payload.timer.commandType).sort()).toEqual([
      'ESCALATE_MEMBERSHIP_REQUEST', 'REMIND_MEMBERSHIP_REQUEST',
    ]);
    const deadlines = timerOutbox.rows.map((row) => Date.parse(row.payload.timer.deadlineAt)).sort();
    expect(deadlines[1]! - deadlines[0]!).toBe(12 * 60 * 60 * 1_000);
    expect(await readMembershipTimerSnapshot(database, requestedMembership)).toEqual({
      state: 'PENDING', version: 1,
    });
    await expect(projectPendingMembershipNotification(
      database, requestedMembership, 'REMINDER', [testId(base + 23)],
    )).resolves.toBe(1);
    await expect(projectPendingMembershipNotification(
      database, requestedMembership, 'ESCALATION', [testId(base + 24)],
    )).resolves.toBe(1);
    await expect(projectPendingMembershipNotification(
      database, requestedMembership, 'REMINDER', [testId(base + 25)],
    )).resolves.toBe(0);

    const approved = await approveMembership(database, {
      commandId: testId(base + 26), commandType: 'APPROVE_MEMBERSHIP',
      idempotencyKey: 'membership-approve-29000',
      actor: { type: 'USER', id: admin, roles: ['GYM_ADMIN'], scopeIds: [venue] },
      aggregateType: 'CommunityMembership', aggregateId: requestedMembership,
      expectedVersion: 1, correlationId: testId(base + 15),
      causationId: requestIds.eventId, requestId: testId(base + 27),
      source: 'admin', payloadVersion: 1, payload: { membershipId: requestedMembership },
    }, { eventId: testId(base + 28), auditId: testId(base + 29),
      outboxMessageId: testId(base + 30), notificationIds: [testId(base + 31)] });
    expect(approved.response).toMatchObject({ state: 'ACTIVE', competitionEnabled: true,
      version: 2, decidedBy: admin });
    expect(await readMembershipTimerSnapshot(database, requestedMembership)).toEqual({
      state: 'ACTIVE', version: 2,
    });
    expect(await listPendingMemberships(database, admin, community)).toEqual([]);
    await expect(projectPendingMembershipNotification(
      database, requestedMembership, 'ESCALATION', [testId(base + 32)],
    )).resolves.toBe(0);

    const rejectedMembership = testId(base + 51);
    const rejectedRequestIds = {
      eventId: testId(base + 52), auditId: testId(base + 53),
      outboxMessageId: testId(base + 54), notificationIds: [testId(base + 55)],
      reminderTimerOutboxMessageId: testId(base + 56),
      escalationTimerOutboxMessageId: testId(base + 57),
    };
    await requestMembership(database, {
      commandId: testId(base + 58), commandType: 'REQUEST_MEMBERSHIP',
      idempotencyKey: 'membership-request-reject-29000',
      actor: { type: 'USER', id: lifecycleApplicant, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'CommunityMembership', aggregateId: rejectedMembership,
      expectedVersion: 0, correlationId: testId(base + 59), causationId: null,
      requestId: testId(base + 60), source: 'api', payloadVersion: 1,
      payload: { communityId: community },
    }, rejectedRequestIds);
    const rejected = await rejectMembership(database, {
      commandId: testId(base + 61), commandType: 'REJECT_MEMBERSHIP',
      idempotencyKey: 'membership-reject-29000',
      actor: { type: 'USER', id: admin, roles: ['GYM_ADMIN'], scopeIds: [venue] },
      aggregateType: 'CommunityMembership', aggregateId: rejectedMembership,
      expectedVersion: 1, correlationId: testId(base + 59),
      causationId: rejectedRequestIds.eventId, requestId: testId(base + 62),
      source: 'admin', payloadVersion: 1, payload: {
        membershipId: rejectedMembership,
        publicRejectionReasonCode: 'CAPACITY_UNAVAILABLE',
        internalRejectionReasonCode: 'CAPACITY_LIMIT',
      },
    }, { eventId: testId(base + 63), auditId: testId(base + 64),
      outboxMessageId: testId(base + 65), notificationIds: [testId(base + 66)] });
    expect(rejected.response).toMatchObject({
      state: 'REJECTED', publicRejectionReasonCode: 'CAPACITY_UNAVAILABLE', version: 2,
    });
    expect(Date.parse(rejected.response.reapplyNotBeforeAt!)).toBeGreaterThan(Date.now());
    const rejectedContext = await readCommunityContext(database, lifecycleApplicant, community);
    expect(rejectedContext).toMatchObject({ membership: null,
      membershipReapplyNotBeforeAt: rejected.response.reapplyNotBeforeAt,
      membershipLatestRejectionReasonCode: 'CAPACITY_UNAVAILABLE',
      access: { denials: expect.arrayContaining([expect.objectContaining({
        capability: 'REQUEST_MEMBERSHIP', code: 'MEMBERSHIP_REAPPLY_NOT_DUE',
      })]) } });
    const rejectionPrivacy = await sql<{
      readonly reason_code: string; readonly audit_reason_code: string;
      readonly public_code: string;
      readonly event_payload: Record<string, unknown>;
      readonly audit_metadata: Record<string, unknown>;
      readonly outbox_payload: Record<string, unknown>;
    }>`
      select membership.reason_code,
        membership.public_rejection_reason_code as public_code,
        event.payload as event_payload, audit.reason_code as audit_reason_code,
        audit.metadata as audit_metadata,
        outbox.payload as outbox_payload
      from community.community_memberships membership
      join platform.domain_events event on event.event_id = ${testId(base + 63)}::uuid
      join platform.audit_events audit on audit.audit_id = ${testId(base + 64)}::uuid
      join platform.outbox_messages outbox
        on outbox.message_id = ${testId(base + 65)}::uuid
      where membership.membership_id = ${rejectedMembership}::uuid
    `.execute(database);
    expect(rejectionPrivacy.rows[0]).toMatchObject({
      reason_code: 'CAPACITY_LIMIT', audit_reason_code: 'CAPACITY_LIMIT',
      public_code: 'CAPACITY_UNAVAILABLE',
      event_payload: { publicRejectionReasonCode: 'CAPACITY_UNAVAILABLE' },
      audit_metadata: { publicRejectionReasonCode: 'CAPACITY_UNAVAILABLE' },
      outbox_payload: { notifications: [expect.objectContaining({ payload: expect.objectContaining({
        publicRejectionReasonCode: 'CAPACITY_UNAVAILABLE',
      }) })] },
    });
    expect(JSON.stringify(rejectionPrivacy.rows[0]?.event_payload)).not.toContain('CAPACITY_LIMIT');
    expect(JSON.stringify(rejectionPrivacy.rows[0]?.outbox_payload)).not.toContain('CAPACITY_LIMIT');

    const replacementMembership = testId(base + 67);
    const replacementRequest = {
      commandId: testId(base + 68), commandType: 'REQUEST_MEMBERSHIP',
      idempotencyKey: 'membership-request-replacement-29000',
      actor: { type: 'USER' as const, id: lifecycleApplicant,
        roles: ['ATHLETE'] as const, scopeIds: [] as const },
      aggregateType: 'CommunityMembership', aggregateId: replacementMembership,
      expectedVersion: 0, correlationId: testId(base + 69), causationId: null,
      requestId: testId(base + 70), source: 'api' as const, payloadVersion: 1,
      payload: { communityId: community },
    } satisfies CommandEnvelope<{ readonly communityId: string }>;
    const replacementIds = {
      eventId: testId(base + 71), auditId: testId(base + 72),
      outboxMessageId: testId(base + 73), notificationIds: [testId(base + 74)],
      reminderTimerOutboxMessageId: testId(base + 75),
      escalationTimerOutboxMessageId: testId(base + 76),
    };
    await expect(requestMembership(database, replacementRequest, replacementIds))
      .rejects.toEqual(expect.objectContaining({ code: 'MEMBERSHIP_REAPPLY_NOT_DUE' }));
    await sql`
      update community.community_memberships set reapply_not_before_at = now() - interval '1 minute'
      where membership_id = ${rejectedMembership}::uuid
    `.execute(database);
    const replacement = await requestMembership(database, replacementRequest, replacementIds);
    expect(replacement.response.state).toBe('PENDING');
    await expect(withdrawMembershipRequest(database, {
      commandId: testId(base + 77), commandType: 'WITHDRAW_MEMBERSHIP_REQUEST',
      idempotencyKey: 'membership-withdraw-wrong-user-29000',
      actor: { type: 'USER', id: applicant, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'CommunityMembership', aggregateId: replacementMembership,
      expectedVersion: 1, correlationId: testId(base + 69),
      causationId: replacementIds.eventId, requestId: testId(base + 78),
      source: 'api', payloadVersion: 1, payload: { membershipId: replacementMembership },
    }, { eventId: testId(base + 79), auditId: testId(base + 80),
      outboxMessageId: testId(base + 81), notificationIds: [testId(base + 82)] }))
      .rejects.toEqual(expect.objectContaining({ code: 'MEMBERSHIP_REQUESTER_REQUIRED' }));
    const withdrawn = await withdrawMembershipRequest(database, {
      commandId: testId(base + 83), commandType: 'WITHDRAW_MEMBERSHIP_REQUEST',
      idempotencyKey: 'membership-withdraw-29000',
      actor: { type: 'USER', id: lifecycleApplicant, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'CommunityMembership', aggregateId: replacementMembership,
      expectedVersion: 1, correlationId: testId(base + 69),
      causationId: replacementIds.eventId, requestId: testId(base + 84),
      source: 'api', payloadVersion: 1, payload: { membershipId: replacementMembership },
    }, { eventId: testId(base + 85), auditId: testId(base + 86),
      outboxMessageId: testId(base + 87), notificationIds: [testId(base + 88)] });
    expect(withdrawn.response).toMatchObject({ state: 'LEFT', competitionEnabled: false,
      version: 2 });
    expect(await readMembershipTimerSnapshot(database, replacementMembership)).toEqual({
      state: 'LEFT', version: 2,
    });

    const inviteToken = 'membership-pilot-qr-token-29000';
    const tokenHash = createHash('sha256').update(inviteToken, 'utf8').digest('hex');
    await sql`
      insert into community.membership_invites (
        invite_id, community_id, join_path, token_sha256, age_division, state,
        expires_at, max_uses, created_by, version
      ) values (
        ${testId(base + 33)}::uuid, ${community}::uuid, 'QR', ${tokenHash}, 'ADULT',
        'ACTIVE', '2099-01-01T00:00:00.000Z', 1, ${admin}::uuid, 1
      )
    `.execute(database);
    const qrMembership = testId(base + 34);
    const activated = await activateMembershipByInvite(database, {
      commandId: testId(base + 35), commandType: 'JOIN_BY_QR_OR_INVITE',
      idempotencyKey: 'membership-qr-29000',
      actor: { type: 'USER', id: qrApplicant, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'CommunityMembership', aggregateId: qrMembership,
      expectedVersion: 0, correlationId: testId(base + 36), causationId: null,
      requestId: testId(base + 37), source: 'api', payloadVersion: 1,
      payload: { token: inviteToken },
    }, { eventId: testId(base + 38), auditId: testId(base + 39),
      outboxMessageId: testId(base + 40), notificationIds: [testId(base + 41)] });
    expect(activated.response).toMatchObject({ membershipId: qrMembership, state: 'ACTIVE',
      competitionEnabled: true, joinPath: 'QR', userId: qrApplicant });
    const invite = await sql<{ readonly state: string; readonly used_count: number }>`
      select state, used_count from community.membership_invites
      where token_sha256 = ${tokenHash}
    `.execute(database);
    expect(invite.rows[0]).toEqual({ state: 'EXPIRED', used_count: 1 });
    await expect(activateMembershipByInvite(database, {
      commandId: testId(base + 42), commandType: 'JOIN_BY_QR_OR_INVITE',
      idempotencyKey: 'membership-qr-expired-29000',
      actor: { type: 'USER', id: seedUser, roles: ['ATHLETE'], scopeIds: [] },
      aggregateType: 'CommunityMembership', aggregateId: testId(base + 43),
      expectedVersion: 0, correlationId: testId(base + 44), causationId: null,
      requestId: testId(base + 45), source: 'api', payloadVersion: 1,
      payload: { token: inviteToken },
    }, { eventId: testId(base + 46), auditId: testId(base + 47),
      outboxMessageId: testId(base + 48), notificationIds: [testId(base + 49)] }))
      .rejects.toEqual(expect.objectContaining({ code: 'MEMBERSHIP_INVITE_INVALID' }));
  });
});
