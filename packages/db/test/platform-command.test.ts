import {
  IdempotencyKeyReusedError,
  IdentityPermissionDeniedError,
  IdentityValidationError,
  InvalidRoleGrantTransitionError,
  RoleGrantPermissionDeniedError,
  RoleGrantValidationError,
  ResultConflictError,
  SchedulingConflictError,
  SchedulingPermissionDeniedError,
  VersionConflictError,
  ChatActionDeniedError,
  type ActivateIdentityInput,
  type CommandEnvelope,
} from '@molokh/core';
import { sql, type Transaction } from 'kysely';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  activateUser,
  activateBookingOfficialConversionFromQueue,
  addAppealResponse,
  acceptCoachInvite,
  appointGymAdmin,
  approveAccountVerification,
  decideBookingOfficialConversion,
  decideBookingSoloContinuation,
  invalidateActiveBookingOfficialConversion,
  changeDisplayName,
  changeSports,
  changePrimaryAdmin,
  decideAppeal,
  blockUser,
  createDiscoveryLike,
  editChatMessage,
  expireDiscoverySuppression,
  expireBookingOfficialConversion,
  expireBookingSoloContinuation,
  expireStatusQueueReconfirmation,
  extendAppealSla,
  claimOutboxBatch,
  claimInboxEvent,
  createDatabase,
  executeCriticalCommand,
  ensureLocalPilotCommunity,
  ensureLocalPilotCompetition,
  hashCommandRequest,
  hideChatMessageForUser,
  markOutboxPublished,
  markNotificationRead,
  listPendingVerifications,
  listPendingCoachInvites,
  listAppealsForCentral,
  projectNotificationBatch,
  readCommunityContext,
  readBookingOfficialConversionForSession,
  readBookingSoloContinuationForSession,
  readBookingOfficialConversionActivationCandidate,
  readInvalidActiveBookingOfficialConversionCandidate,
  readCompetitionStatus,
  readStatusQueueActivationCandidate,
  readStatusQueueReconciliationCandidates,
  previewStatusRelease,
  confirmStatusRelease,
  previewMembershipExit,
  confirmMembershipExit,
  readVacancyQueueReconciliationCandidate,
  reconcileVacancyQueue,
  promoteSingleGenesisCandidate,
  readActiveBlocks,
  readDiscoveryCards,
  readIdentityProjection,
  readDiscoverySuppressionTimerSnapshot,
  readLikeTimerSnapshot,
  readMatches,
  readResult,
  readResultTimerSnapshot,
  readChatMessages,
  readVenueRoleSummary,
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
  proposeGroupPlan,
  confirmGroupPlan,
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
  startSession,
  recordSessionAttendance,
  recordSessionResult,
  endSession,
  replaceSessionCoach,
  cancelSessionAfterCoachReplacement,
  failSessionExternal,
  createDirectOpenChallenge,
  acceptOptionalChallenge,
  activateStatusQueueHead,
  declineOptionalChallenge,
  finalizeResult,
  readChatChallenge,
  readChallengeTimerSnapshot,
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
  readIntegrityCase,
  submitResultAppeal,
  withdrawAppeal,
  type CreateLikePayload,
  type BlockEffectIds,
  type BlockUserPayload,
  type CriticalCommandEffect,
  type Database,
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
  type ExpireStatusQueueReconfirmationPayload,
  type PublishGroupOfferingPayload,
  type PublishSlotPayload,
  type RejectBookingHostPayload,
  type UpdateGroupOfferingPayload,
  type UpdateSlotPayload,
  type WithdrawGroupOfferingPayload,
  type WithdrawSlotPayload,
  type ConfirmGroupPlanPayload,
  type ConfirmBookingHostPayload,
  type DecideBookingOfficialConversionPayload,
  type DecideBookingSoloContinuationPayload,
  type ExpireBookingOfficialConversionPayload,
  type ExpireBookingSoloContinuationPayload,
  type InvalidateActiveBookingOfficialConversionPayload,
  type ExpireGroupPlanPayload,
  type ExpireBookingIntentPayload,
  type ProposeGroupPlanPayload,
  type SelectSameSlotPayload,
  type SelectSlotPayload,
  type OpenSessionWindowPayload,
  type StartSessionPayload,
  type RecordAttendancePayload,
  type EndSessionPayload,
  type ReplaceSessionCoachPayload,
  type CancelAfterCoachReplacementPayload,
  type FailSessionExternalPayload,
  type RecordSessionResultPayload,
  type SubmitResultAppealPayload,
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
  type ReconcileVacancyQueuePayload,
  type PromoteSingleGenesisCandidatePayload,
  type RequestBookingOfficialConversionPayload,
  type RequestTrainingParticipantCancellationPayload,
  type PauseCommunityPayload,
  type ReactivateCommunityPayload,
  type ScheduleCommunityClosurePayload,
  type FinalizeCommunityClosurePayload,
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
        community.community_closure_status_dispositions,
        community.community_closure_session_dispositions,
        community.community_closure_plans,
        community.voluntary_membership_exits,
        scheduling.booking_solo_confirmations,
        scheduling.booking_solo_continuations,
        scheduling.booking_conversion_confirmations,
        scheduling.booking_official_conversions,
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
        competition.status_transition_finalizations,
        competition.status_transitions,
        competition.pair_cooldowns,
        competition.results,
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
        community.community_memberships,
        community.community_configuration_versions,
        community.communities,
        community.venue_configuration_versions,
        community.venues,
        identity.display_name_audit,
        identity.account_verifications,
        identity.athlete_profiles,
        identity.users,
        platform.notifications,
        platform.notification_preferences,
        platform.outbox_messages,
        platform.idempotency_records,
        platform.inbox_receipts,
        platform.audit_events,
        platform.domain_events
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
      athleteA, athleteB, booking, coach, community, competition, session, slot,
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

  it('commits once, replays the response and rejects changed payload or stale version', async () => {
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

  it('leases outbox work once and makes failed delivery retryable', async () => {
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

  it('projects an event into recipient notifications once and marks reads idempotently', async () => {
    await executeCriticalCommand(database, {
      command: command(),
      mutate: (transaction, context) => mutate(transaction, context.nextVersion),
    });

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
        category: 'SERVICE' as const,
        renderKey: 'challenge.created',
        actionTarget: { type: 'CHALLENGE', id: ids.aggregate },
        payload: {},
        deadlineAt: null,
      },
    ];

    await expect(projectNotificationBatch(database, ids.event, drafts)).resolves.toEqual({
      replayed: false,
      createdCount: 2,
    });
    await expect(projectNotificationBatch(database, ids.event, drafts)).resolves.toEqual({
      replayed: true,
      createdCount: 0,
    });

    const count = await sql<{ readonly notifications: string }>`
      select count(*)::text as notifications from platform.notifications
    `.execute(database);
    expect(count.rows[0]?.notifications).toBe('2');
    await expect(
      markNotificationRead(database, ids.notificationOne, ids.recipientOne),
    ).resolves.toBe(true);
    await expect(
      markNotificationRead(database, ids.notificationOne, ids.recipientOne),
    ).resolves.toBe(true);
    await expect(
      markNotificationRead(database, ids.notificationOne, ids.recipientTwo),
    ).resolves.toBe(false);
  });

  it('activates an athlete and changes an arbitrary display name exactly once', async () => {
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
          expectedVersion: 3,
          payload: { displayName: 'Скрытая смена' },
        },
        renameIds,
      ),
    ).rejects.toBeInstanceOf(IdentityValidationError);
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

  it('[AC-005][AC-006][AC-007][AC-008] keeps Like, mutual Match, Skip and expiry atomic and traceable', async () => {
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
  });

  it('[AC-173][AC-201][AC-207][AC-208] completes ordinary scheduling, Coach replacement and external no-fault cancellation', async () => {
    await verifySchedulingPublication(database);
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

  it('[AC-029][AC-030][AC-031][AC-032][AC-041][AC-050][AC-051][AC-054][AC-058][AC-070][AC-076][AC-077][AC-080][AC-111][AC-117][AC-118][AC-171][AC-175][AC-179][AC-205] runs a direct optional Official Challenge through Missing Result Review and Central Appeal atomically', async () => {
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

    const startedOfficial = await startSession(
      database,
      {
        commandId: testId(1897), commandType: 'START_SESSION',
        idempotencyKey: `start-official-session-${sessionId}`,
        actor: { type: 'USER', id: coachId, roles: ['COACH'], scopeIds: [communityId] },
        aggregateType: 'Session', aggregateId: sessionId, expectedVersion: 2,
        correlationId: testId(1898), causationId: testId(1893), requestId: testId(1899),
        source: 'api', payloadVersion: 1, payload: { sessionId },
      } satisfies CommandEnvelope<StartSessionPayload>,
      {
        eventId: testId(1900), auditId: testId(1901), outboxMessageId: testId(1902),
        challengeEventId: testId(1903), challengeOutboxMessageId: testId(1904),
      },
      () => new Date('2026-09-12T14:01:00.000Z'),
    );
    expect(startedOfficial.response).toMatchObject({ state: 'IN_PROGRESS', version: 3 });
    await expect(readChatChallenge(database, sourceChatId, athleteA)).resolves.toMatchObject({
      challenge: { challengeId, state: 'IN_SESSION', version: 7 },
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
        correlationId: testId(base + 1), causationId: testId(1900), requestId: testId(base + 2),
        source: 'api', payloadVersion: 1,
        payload: { sessionId, athleteUserId, status: 'PRESENT', comment: null },
      } satisfies CommandEnvelope<RecordAttendancePayload>,
      {
        eventId: testId(base + 3), auditId: testId(base + 4), outboxMessageId: testId(base + 5),
        attendanceId: testId(base + 6), attendanceEventId: testId(base + 7),
      },
      () => new Date(`2026-09-12T14:0${expectedVersion}:00.000Z`),
    );
    await recordOfficialAttendance(athleteA, 3, 1910);
    await recordOfficialAttendance(athleteB, 4, 1920);

    const endedOfficial = await endSession(
      database,
      {
        commandId: testId(1930), commandType: 'END_SESSION',
        idempotencyKey: `end-official-session-${sessionId}`,
        actor: { type: 'USER', id: coachId, roles: ['COACH'], scopeIds: [communityId] },
        aggregateType: 'Session', aggregateId: sessionId, expectedVersion: 5,
        correlationId: testId(1931), causationId: testId(1900), requestId: testId(1932),
        source: 'api', payloadVersion: 1, payload: { sessionId },
      } satisfies CommandEnvelope<EndSessionPayload>,
      {
        eventId: testId(1933), auditId: testId(1934), outboxMessageId: testId(1935),
        bookingEventId: testId(1936), slotEventId: testId(1937),
        challengeEventId: testId(1938), challengeOutboxMessageId: testId(1939),
      },
      () => new Date('2026-09-12T14:55:00.000Z'),
    );
    expect(endedOfficial.response).toMatchObject({ state: 'ENDED', version: 6 });
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
    const recordedResult = await recordSessionResult(
      database,
      {
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
      } satisfies CommandEnvelope<RecordSessionResultPayload>,
      {
        eventId: testId(1944), auditId: testId(1945), outboxMessageId: testId(1946),
        resultId, resultEventId: testId(1947), statusTransitionId: testId(1948),
        statusEventId: testId(1949), cooldownId: testId(1950), cooldownEventId: testId(1951),
        timerOutboxMessageId: testId(1952), notificationOutboxMessageId: testId(1953),
        notificationIds: [testId(1954), testId(1955)],
        missingResultReviewEventId: testId(1956),
      },
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
    await expect(
      readResult(database, resultId, athleteA, new Date('2026-09-13T15:01:00.000Z')),
    ).resolves.toMatchObject({
      viewerCanAppeal: true, viewerCanWaiveAppeal: true,
    });
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

    await expect(recordSessionResult(
      database,
      {
        commandId: testId(1960), commandType: 'RECORD_SESSION_RESULT',
        idempotencyKey: `record-result-duplicate-${challengeId}`,
        actor: { type: 'USER', id: coachId, roles: ['COACH'], scopeIds: [communityId] },
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

    const appealId = testId(2000);
    const appealed = await submitResultAppeal(
      database,
      {
        commandId: testId(2001), commandType: 'SUBMIT_RESULT_APPEAL',
        idempotencyKey: `appeal-result-${resultId}`,
        actor: { type: 'USER', id: athleteA, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Result', aggregateId: resultId, expectedVersion: 1,
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
      resultId, state: 'UNDER_APPEAL', provisional: true, version: 2,
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

    const decided = await decideAppeal(
      database,
      {
        commandId: testId(2022), commandType: 'DECIDE_APPEAL',
        idempotencyKey: `reverse-appeal-${appealId}`,
        actor: { type: 'USER', id: centralId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
        aggregateType: 'Appeal', aggregateId: appealId, expectedVersion: 5,
        correlationId: testId(2023), causationId: testId(2015), requestId: testId(2024),
        source: 'api', payloadVersion: 1,
        payload: { appealId, decision: 'REVERSE', reason: 'Coach подтвердил ошибку победителя.' },
      } satisfies CommandEnvelope<DecideAppealPayload>,
      {
        eventId: testId(2025), auditId: testId(2026), outboxMessageId: testId(2027),
        decisionId: testId(2028), resultEventId: testId(2029), challengeEventId: testId(2030),
        statusCompensationId: testId(2031), statusEventId: testId(2032),
        cooldownEventId: testId(2033), notificationOutboxMessageId: testId(2034),
        notificationIds: [testId(2035), testId(2036), testId(2037)],
      },
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
      state: 'REVERSED', version: 3,
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

  it('[AC-044][AC-052][AC-095][AC-096][AC-097] runs direct FIFO, mandatory Forfeit and holder reconfirmation', async () => {
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
      return { challenger, contender, champion, follower, competition, challengeId, serviceChatId };
    };

    const acceptedFixture = await setup(15000, '+7999150000');
    const accepted = await acceptOptionalChallenge(
      database,
      {
        commandId: testId(15100), commandType: 'ACCEPT_MANDATORY_CHALLENGE',
        idempotencyKey: `mandatory-accept-${acceptedFixture.challengeId}`,
        actor: { type: 'USER', id: acceptedFixture.contender, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'Challenge', aggregateId: acceptedFixture.challengeId,
        expectedVersion: 1, correlationId: testId(15101), causationId: null,
        requestId: testId(15102), source: 'api', payloadVersion: 1,
        payload: { challengeId: acceptedFixture.challengeId },
      } satisfies CommandEnvelope<RespondToChallengePayload>,
      {
        eventId: testId(15103), auditId: testId(15104), outboxMessageId: testId(15105),
        notificationId: testId(15106), notificationOutboxMessageId: testId(15107),
        acknowledgmentId: testId(15108), obligationIds: [testId(15109), testId(15110)],
      },
      () => new Date('2026-09-28T11:00:00.000Z'),
    );
    expect(accepted.response).toMatchObject({
      state: 'ACCEPTED_UNSCHEDULED',
      schedulingDeadlineAt: '2026-10-12T11:00:00.000Z',
    });
    const acceptedObligations = await sql<{ readonly count: string }>`
      select count(*)::text as count from competition.challenge_participant_obligations
      where challenge_id = ${acceptedFixture.challengeId}::uuid and released_at is null
    `.execute(database);
    expect(acceptedObligations.rows[0]?.count).toBe('2');

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
});
