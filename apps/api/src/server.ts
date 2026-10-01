import type { CommandEnvelope } from '@molokh/core';
import {
  activateUser,
  addAppealResponse,
  acceptCoachInvite,
  decideAppeal,
  appointGymAdmin,
  approveAccountVerification,
  changeDisplayName,
  changeSports,
  confirmMissingResultVenue,
  changePrimaryAdmin,
  confirmBookingHost,
  decideBookingOfficialConversion,
  decideBookingSoloContinuation,
  rejectBookingHost,
  cancelSessionAfterCoachReplacement,
  endSession,
  failSessionExternal,
  blockUser,
  createDiscoveryLike,
  createDirectOpenChallenge,
  createDatabase,
  editChatMessage,
  ensureLocalPilotCommunity,
  ensureLocalPilotCompetition,
  ensureLocalDiscoveryProfiles,
  assignMissingResultReviewerCoach,
  inviteCoach,
  hideChatMessageForUser,
  listPendingCoachInvites,
  listMissingResultReviewsForCentral,
  listMissingResultReviewsForViewer,
  listIntegrityCasesForCentral,
  listIntegrityCasesForViewer,
  listAppealsForCentral,
  listPendingVerifications,
  probeDatabase,
  publishGroupOffering,
  publishSlot,
  orderMissingResultRepeat,
  readAppealForViewer,
  readMissingResultReview,
  readIntegrityCase,
  updateGroupOffering,
  updateSlot,
  withdrawGroupOffering,
  withdrawSlot,
  proposeGroupPlan,
  readCommunityContext,
  readCommunityLifecycle,
  readChatChallenge,
  readChatMessages,
  readActiveBlocks,
  readDiscoveryCards,
  readIdentityProjection,
  readHostConfirmationQueue,
  readMySessions,
  requestBookingOfficialConversion,
  requestTrainingParticipantCancellation,
  readMatches,
  readResult,
  readSession,
  readRoleGrant,
  readLatestDirectedBlock,
  readVenueRoleSummary,
  readTrainingOptions,
  readCompetitionStatus,
  reconfirmStatusQueueEntry,
  previewStatusRelease,
  confirmStatusRelease,
  respondToGenesisChallenge,
  readVenueAdminDashboard,
  reportChatMessage,
  recordSessionAttendance,
  recordSessionResult,
  replaceSessionCoach,
  selectSameSlot,
  selectSlot,
  runMigrations,
  sendChatMessage,
  startAccountVerification,
  startAppealReview,
  startMissingResultReview,
  extendAppealSla,
  startSession,
  skipDiscoveryCandidate,
  confirmGroupPlan,
  unblockUser,
  unmatchPair,
  acceptOptionalChallenge,
  declineOptionalChallenge,
  withdrawOptionalChallenge,
  submitResultAppeal,
  submitMissingResultStatement,
  submitStatusQueueEntry,
  waiveResultAppeal,
  withdrawAppeal,
  withdrawStatusQueueEntry,
  openIntegrityCase,
  pauseCommunity,
  reactivateCommunity,
  startIntegrityReview,
  decideIntegrityCase,
} from '@molokh/db';

import { buildApp } from './app.js';
import {
  StaticBearerAuthAdapter,
  StaticBearerAuthRegistryAdapter,
} from './auth.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const production = process.env.NODE_ENV === 'production';
const connectionString =
  process.env.DATABASE_URL ??
  (production
    ? undefined
    : 'postgres://molokh:local-only-password@localhost:5432/molokh');

if (!connectionString) throw new Error('DATABASE_URL is required');
if (production) {
  throw new Error('A production AuthAdapter must be configured before production startup');
}

const localUserId = '0199a1b2-1234-7000-8000-000000000101';
const localVenueId = '0199a1b2-1234-7000-8000-000000000501';
const localCommunityId = '0199a1b2-1234-7000-8000-000000000502';
const localCompetitionId = '0199a1b2-1234-7000-8000-000000000901';
const localCentralUserId = '0199a1b2-1234-7000-8000-000000000506';
const localCoachUserId = '0199a1b2-1234-7000-8000-000000000508';
const localReplacementCoachUserId = '0199a1b2-1234-7000-8000-000000000801';
const localAdminUserId = '0199a1b2-1234-7000-8000-000000000509';
const localDiscoveryUserId = '0199a1b2-1234-7000-8000-000000000554';
const localDiscoveryUserTwoId = '0199a1b2-1234-7000-8000-000000000561';
const localToken = process.env.LOCAL_AUTH_TOKEN ?? 'molokh-local-athlete-token';
const localCentralToken =
  process.env.LOCAL_CENTRAL_AUTH_TOKEN ?? 'molokh-local-central-token';
const localCoachToken =
  process.env.LOCAL_COACH_AUTH_TOKEN ?? 'molokh-local-coach-token';
const localReplacementCoachToken =
  process.env.LOCAL_REPLACEMENT_COACH_AUTH_TOKEN ?? 'molokh-local-replacement-coach-token';
const localAdminToken =
  process.env.LOCAL_ADMIN_AUTH_TOKEN ?? 'molokh-local-admin-token';
const localDiscoveryToken =
  process.env.LOCAL_DISCOVERY_AUTH_TOKEN ?? 'molokh-local-discovery-token';
const localDiscoveryTwoToken =
  process.env.LOCAL_DISCOVERY_TWO_AUTH_TOKEN ?? 'molokh-local-discovery-two-token';
const localActivation: CommandEnvelope<{
  readonly userId: string;
  readonly phoneE164: string;
  readonly phoneVerifiedAt: string;
  readonly birthDate: string;
  readonly displayName: string;
  readonly locale: string;
  readonly primarySport: string;
  readonly secondarySport: string | null;
  readonly discoveryRadiusKm: number;
}> = {
  commandId: '0199a1b2-1234-7000-8000-000000000102',
  commandType: 'ACTIVATE_ACCOUNT',
  idempotencyKey: 'local-development-athlete-v2',
  actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
  aggregateType: 'User',
  aggregateId: localUserId,
  expectedVersion: 0,
  correlationId: '0199a1b2-1234-7000-8000-000000000103',
  causationId: null,
  requestId: '0199a1b2-1234-7000-8000-000000000104',
  source: 'scheduler',
  payloadVersion: 1,
  payload: {
    userId: localUserId,
    phoneE164: '+79990000001',
    phoneVerifiedAt: '2026-09-05T09:00:00.000Z',
    birthDate: '1995-04-12',
    displayName: 'Локальный атлет',
    locale: 'ru-RU',
    primarySport: 'BOXING',
    secondarySport: null,
    discoveryRadiusKm: 15,
  },
};

const localCentralActivation: typeof localActivation = {
  commandId: '0199a1b2-1234-7000-8000-000000000510',
  commandType: 'ACTIVATE_ACCOUNT',
  idempotencyKey: 'local-development-central-v1',
  actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
  aggregateType: 'User',
  aggregateId: localCentralUserId,
  expectedVersion: 0,
  correlationId: '0199a1b2-1234-7000-8000-000000000511',
  causationId: null,
  requestId: '0199a1b2-1234-7000-8000-000000000512',
  source: 'scheduler',
  payloadVersion: 1,
  payload: {
    userId: localCentralUserId,
    phoneE164: '+79990000506',
    phoneVerifiedAt: '2026-09-05T09:00:00.000Z',
    birthDate: '1990-01-01',
    displayName: 'Central Operator',
    locale: 'ru-RU',
    primarySport: 'BOXING',
    secondarySport: null,
    discoveryRadiusKm: 15,
  },
};

const localCoachActivation: typeof localActivation = {
  commandId: '0199a1b2-1234-7000-8000-000000000516',
  commandType: 'ACTIVATE_ACCOUNT',
  idempotencyKey: 'local-development-coach-v1',
  actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
  aggregateType: 'User',
  aggregateId: localCoachUserId,
  expectedVersion: 0,
  correlationId: '0199a1b2-1234-7000-8000-000000000517',
  causationId: null,
  requestId: '0199a1b2-1234-7000-8000-000000000518',
  source: 'scheduler',
  payloadVersion: 1,
  payload: {
    userId: localCoachUserId,
    phoneE164: '+79990000508',
    phoneVerifiedAt: '2026-09-05T09:00:00.000Z',
    birthDate: '1988-06-15',
    displayName: 'Пилотный тренер',
    locale: 'ru-RU',
    primarySport: 'BOXING',
    secondarySport: null,
    discoveryRadiusKm: 15,
  },
};

const localReplacementCoachActivation: typeof localActivation = {
  commandId: '0199a1b2-1234-7000-8000-000000000802',
  commandType: 'ACTIVATE_ACCOUNT',
  idempotencyKey: 'local-development-replacement-coach-v1',
  actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
  aggregateType: 'User',
  aggregateId: localReplacementCoachUserId,
  expectedVersion: 0,
  correlationId: '0199a1b2-1234-7000-8000-000000000803',
  causationId: null,
  requestId: '0199a1b2-1234-7000-8000-000000000804',
  source: 'scheduler',
  payloadVersion: 1,
  payload: {
    userId: localReplacementCoachUserId,
    phoneE164: '+79990000801',
    phoneVerifiedAt: '2026-09-05T09:00:00.000Z',
    birthDate: '1986-03-10',
    displayName: 'Резервный тренер',
    locale: 'ru-RU',
    primarySport: 'BOXING',
    secondarySport: null,
    discoveryRadiusKm: 15,
  },
};

const localAdminActivation: typeof localActivation = {
  commandId: '0199a1b2-1234-7000-8000-000000000535',
  commandType: 'ACTIVATE_ACCOUNT',
  idempotencyKey: 'local-development-admin-v1',
  actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
  aggregateType: 'User',
  aggregateId: localAdminUserId,
  expectedVersion: 0,
  correlationId: '0199a1b2-1234-7000-8000-000000000536',
  causationId: null,
  requestId: '0199a1b2-1234-7000-8000-000000000537',
  source: 'scheduler',
  payloadVersion: 1,
  payload: {
    userId: localAdminUserId,
    phoneE164: '+79990000509',
    phoneVerifiedAt: '2026-09-05T09:00:00.000Z',
    birthDate: '1989-08-20',
    displayName: 'Пилотный администратор',
    locale: 'ru-RU',
    primarySport: 'BOXING',
    secondarySport: null,
    discoveryRadiusKm: 15,
  },
};

const localDiscoveryActivation: typeof localActivation = {
  commandId: '0199a1b2-1234-7000-8000-000000000555',
  commandType: 'ACTIVATE_ACCOUNT',
  idempotencyKey: 'local-development-discovery-athlete-v1',
  actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
  aggregateType: 'User',
  aggregateId: localDiscoveryUserId,
  expectedVersion: 0,
  correlationId: '0199a1b2-1234-7000-8000-000000000556',
  causationId: null,
  requestId: '0199a1b2-1234-7000-8000-000000000557',
  source: 'scheduler',
  payloadVersion: 1,
  payload: {
    userId: localDiscoveryUserId,
    phoneE164: '+79990000554',
    phoneVerifiedAt: '2026-09-05T09:00:00.000Z',
    birthDate: '1997-11-08',
    displayName: 'Марина Ринг',
    locale: 'ru-RU',
    primarySport: 'BOXING',
    secondarySport: 'FUNCTIONAL_TRAINING',
    discoveryRadiusKm: 15,
  },
};

const localDiscoveryTwoActivation: typeof localActivation = {
  commandId: '0199a1b2-1234-7000-8000-000000000562',
  commandType: 'ACTIVATE_ACCOUNT',
  idempotencyKey: 'local-development-discovery-athlete-two-v1',
  actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
  aggregateType: 'User',
  aggregateId: localDiscoveryUserTwoId,
  expectedVersion: 0,
  correlationId: '0199a1b2-1234-7000-8000-000000000563',
  causationId: null,
  requestId: '0199a1b2-1234-7000-8000-000000000564',
  source: 'scheduler',
  payloadVersion: 1,
  payload: {
    userId: localDiscoveryUserTwoId,
    phoneE164: '+79990000561',
    phoneVerifiedAt: '2026-09-05T09:00:00.000Z',
    birthDate: '1994-03-21',
    displayName: 'Алексей Темп',
    locale: 'ru-RU',
    primarySport: 'BOXING',
    secondarySport: 'RUNNING',
    discoveryRadiusKm: 15,
  },
};

// Temporary local Discovery fixtures for UI testing. Keep this block isolated so
// the five profiles can be removed together after the pilot walkthroughs.
const localTemporaryDiscoveryFixtures: ReadonlyArray<{
  readonly activation: typeof localActivation;
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly experienceText: string;
  readonly token: string;
}> = [
  {
    activation: {
      commandId: '0199a1b2-1234-7000-8000-000000000569',
      commandType: 'ACTIVATE_ACCOUNT',
      idempotencyKey: 'local-temporary-discovery-irina-v1',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'User',
      aggregateId: '0199a1b2-1234-7000-8000-000000000568',
      expectedVersion: 0,
      correlationId: '0199a1b2-1234-7000-8000-000000000570',
      causationId: null,
      requestId: '0199a1b2-1234-7000-8000-000000000571',
      source: 'scheduler',
      payloadVersion: 1,
      payload: {
        userId: '0199a1b2-1234-7000-8000-000000000568',
        phoneE164: '+79990000568',
        phoneVerifiedAt: '2026-09-05T09:00:00.000Z',
        birthDate: '1996-02-14',
        displayName: 'Ирина Сокол',
        locale: 'ru-RU',
        primarySport: 'BOXING',
        secondarySport: 'YOGA',
        discoveryRadiusKm: 15,
      },
    },
    eventId: '0199a1b2-1234-7000-8000-000000000572',
    auditId: '0199a1b2-1234-7000-8000-000000000573',
    outboxMessageId: '0199a1b2-1234-7000-8000-000000000574',
    experienceText: 'Возвращаюсь к боксу и ищу партнёра для техники без жёстких спаррингов.',
    token: 'molokh-local-irina-token',
  },
  {
    activation: {
      commandId: '0199a1b2-1234-7000-8000-000000000576',
      commandType: 'ACTIVATE_ACCOUNT',
      idempotencyKey: 'local-temporary-discovery-dmitry-v1',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'User',
      aggregateId: '0199a1b2-1234-7000-8000-000000000575',
      expectedVersion: 0,
      correlationId: '0199a1b2-1234-7000-8000-000000000577',
      causationId: null,
      requestId: '0199a1b2-1234-7000-8000-000000000578',
      source: 'scheduler',
      payloadVersion: 1,
      payload: {
        userId: '0199a1b2-1234-7000-8000-000000000575',
        phoneE164: '+79990000575',
        phoneVerifiedAt: '2026-09-05T09:00:00.000Z',
        birthDate: '1992-07-09',
        displayName: 'Дмитрий Раунд',
        locale: 'ru-RU',
        primarySport: 'BOXING',
        secondarySport: 'RUNNING',
        discoveryRadiusKm: 15,
      },
    },
    eventId: '0199a1b2-1234-7000-8000-000000000579',
    auditId: '0199a1b2-1234-7000-8000-000000000580',
    outboxMessageId: '0199a1b2-1234-7000-8000-000000000581',
    experienceText: 'Тренируюсь по вечерам, хочу регулярно работать на лапах и над выносливостью.',
    token: 'molokh-local-dmitry-token',
  },
  {
    activation: {
      commandId: '0199a1b2-1234-7000-8000-000000000583',
      commandType: 'ACTIVATE_ACCOUNT',
      idempotencyKey: 'local-temporary-discovery-olga-v1',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'User',
      aggregateId: '0199a1b2-1234-7000-8000-000000000582',
      expectedVersion: 0,
      correlationId: '0199a1b2-1234-7000-8000-000000000584',
      causationId: null,
      requestId: '0199a1b2-1234-7000-8000-000000000585',
      source: 'scheduler',
      payloadVersion: 1,
      payload: {
        userId: '0199a1b2-1234-7000-8000-000000000582',
        phoneE164: '+79990000582',
        phoneVerifiedAt: '2026-09-05T09:00:00.000Z',
        birthDate: '1998-10-03',
        displayName: 'Ольга Вектор',
        locale: 'ru-RU',
        primarySport: 'BOXING',
        secondarySport: 'FUNCTIONAL_TRAINING',
        discoveryRadiusKm: 15,
      },
    },
    eventId: '0199a1b2-1234-7000-8000-000000000586',
    auditId: '0199a1b2-1234-7000-8000-000000000587',
    outboxMessageId: '0199a1b2-1234-7000-8000-000000000588',
    experienceText: 'Люблю функциональные тренировки и хочу улучшить защиту и движение в боксе.',
    token: 'molokh-local-olga-token',
  },
  {
    activation: {
      commandId: '0199a1b2-1234-7000-8000-000000000590',
      commandType: 'ACTIVATE_ACCOUNT',
      idempotencyKey: 'local-temporary-discovery-timur-v1',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'User',
      aggregateId: '0199a1b2-1234-7000-8000-000000000589',
      expectedVersion: 0,
      correlationId: '0199a1b2-1234-7000-8000-000000000591',
      causationId: null,
      requestId: '0199a1b2-1234-7000-8000-000000000592',
      source: 'scheduler',
      payloadVersion: 1,
      payload: {
        userId: '0199a1b2-1234-7000-8000-000000000589',
        phoneE164: '+79990000589',
        phoneVerifiedAt: '2026-09-05T09:00:00.000Z',
        birthDate: '1990-05-27',
        displayName: 'Тимур Стойка',
        locale: 'ru-RU',
        primarySport: 'BOXING',
        secondarySport: null,
        discoveryRadiusKm: 15,
      },
    },
    eventId: '0199a1b2-1234-7000-8000-000000000593',
    auditId: '0199a1b2-1234-7000-8000-000000000594',
    outboxMessageId: '0199a1b2-1234-7000-8000-000000000595',
    experienceText: 'Средний уровень, ищу спокойную совместную тренировку по выходным.',
    token: 'molokh-local-timur-token',
  },
  {
    activation: {
      commandId: '0199a1b2-1234-7000-8000-000000000597',
      commandType: 'ACTIVATE_ACCOUNT',
      idempotencyKey: 'local-temporary-discovery-anna-v1',
      actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
      aggregateType: 'User',
      aggregateId: '0199a1b2-1234-7000-8000-000000000596',
      expectedVersion: 0,
      correlationId: '0199a1b2-1234-7000-8000-000000000598',
      causationId: null,
      requestId: '0199a1b2-1234-7000-8000-000000000599',
      source: 'scheduler',
      payloadVersion: 1,
      payload: {
        userId: '0199a1b2-1234-7000-8000-000000000596',
        phoneE164: '+79990000596',
        phoneVerifiedAt: '2026-09-05T09:00:00.000Z',
        birthDate: '1995-12-18',
        displayName: 'Анна Пульс',
        locale: 'ru-RU',
        primarySport: 'BOXING',
        secondarySport: 'SWIMMING',
        discoveryRadiusKm: 15,
      },
    },
    eventId: '0199a1b2-1234-7000-8000-000000000600',
    auditId: '0199a1b2-1234-7000-8000-000000000601',
    outboxMessageId: '0199a1b2-1234-7000-8000-000000000602',
    experienceText: 'Начальный уровень, ищу партнёра для регулярных тренировок утром.',
    token: 'molokh-local-anna-token',
  },
];

await runMigrations(connectionString);
const database = createDatabase(connectionString);
const existingLocalIdentity = await readIdentityProjection(database, localUserId);
if (!existingLocalIdentity) {
  await activateUser(database, localActivation, {
    eventId: '0199a1b2-1234-7000-8000-000000000105',
    auditId: '0199a1b2-1234-7000-8000-000000000106',
    outboxMessageId: '0199a1b2-1234-7000-8000-000000000107',
  });
}
const existingCentralIdentity = await readIdentityProjection(database, localCentralUserId);
if (!existingCentralIdentity) {
  await activateUser(database, localCentralActivation, {
    eventId: '0199a1b2-1234-7000-8000-000000000513',
    auditId: '0199a1b2-1234-7000-8000-000000000514',
    outboxMessageId: '0199a1b2-1234-7000-8000-000000000515',
  });
}
const existingCoachIdentity = await readIdentityProjection(database, localCoachUserId);
if (!existingCoachIdentity) {
  await activateUser(database, localCoachActivation, {
    eventId: '0199a1b2-1234-7000-8000-000000000519',
    auditId: '0199a1b2-1234-7000-8000-000000000520',
    outboxMessageId: '0199a1b2-1234-7000-8000-000000000521',
  });
}
const existingReplacementCoachIdentity = await readIdentityProjection(
  database,
  localReplacementCoachUserId,
);
if (!existingReplacementCoachIdentity) {
  await activateUser(database, localReplacementCoachActivation, {
    eventId: '0199a1b2-1234-7000-8000-000000000805',
    auditId: '0199a1b2-1234-7000-8000-000000000806',
    outboxMessageId: '0199a1b2-1234-7000-8000-000000000807',
  });
}
const existingAdminIdentity = await readIdentityProjection(database, localAdminUserId);
if (!existingAdminIdentity) {
  await activateUser(database, localAdminActivation, {
    eventId: '0199a1b2-1234-7000-8000-000000000538',
    auditId: '0199a1b2-1234-7000-8000-000000000539',
    outboxMessageId: '0199a1b2-1234-7000-8000-000000000540',
  });
}
const existingDiscoveryIdentity = await readIdentityProjection(
  database,
  localDiscoveryUserId,
);
if (!existingDiscoveryIdentity) {
  await activateUser(database, localDiscoveryActivation, {
    eventId: '0199a1b2-1234-7000-8000-000000000558',
    auditId: '0199a1b2-1234-7000-8000-000000000559',
    outboxMessageId: '0199a1b2-1234-7000-8000-000000000560',
  });
}
const existingDiscoveryTwoIdentity = await readIdentityProjection(
  database,
  localDiscoveryUserTwoId,
);
if (!existingDiscoveryTwoIdentity) {
  await activateUser(database, localDiscoveryTwoActivation, {
    eventId: '0199a1b2-1234-7000-8000-000000000565',
    auditId: '0199a1b2-1234-7000-8000-000000000566',
    outboxMessageId: '0199a1b2-1234-7000-8000-000000000567',
  });
}
for (const fixture of localTemporaryDiscoveryFixtures) {
  const existingIdentity = await readIdentityProjection(
    database,
    fixture.activation.payload.userId,
  );
  if (!existingIdentity) {
    await activateUser(database, fixture.activation, {
      eventId: fixture.eventId,
      auditId: fixture.auditId,
      outboxMessageId: fixture.outboxMessageId,
    });
  }
}
await ensureLocalPilotCommunity(database, {
  venueId: localVenueId,
  venueConfigurationId: '0199a1b2-1234-7000-8000-000000000503',
  communityId: localCommunityId,
  communityConfigurationId: '0199a1b2-1234-7000-8000-000000000504',
  membershipId: '0199a1b2-1234-7000-8000-000000000505',
  centralGrantId: '0199a1b2-1234-7000-8000-000000000507',
  athleteUserId: localUserId,
  centralActorId: '0199a1b2-1234-7000-8000-000000000506',
  legalName: 'ООО Пилотный спортивный зал',
  venueDisplayName: 'Molokh Pilot Gym',
  communityName: 'Molokh Pilot Community',
  address: 'Москва · пилотный адрес',
  cityCode: 'MOSCOW',
  timezone: 'Europe/Moscow',
  contactPayload: { phone: '+79990000501', note: 'Уточните детали у зала' },
  occurredAt: '2026-09-05T09:00:00.000Z',
});
await ensureLocalDiscoveryProfiles(database, localVenueId, [
  {
    userId: localUserId,
    experienceText: 'Ищу партнёра для регулярных тренировок по боксу.',
  },
  {
    userId: localDiscoveryUserId,
    experienceText: 'Бокс и функциональные тренировки в спокойном темпе.',
  },
  {
    userId: localDiscoveryUserTwoId,
    experienceText: 'Ищу партнёра для техники и лёгких спаррингов два раза в неделю.',
  },
  ...localTemporaryDiscoveryFixtures.map((fixture) => ({
    userId: fixture.activation.payload.userId,
    experienceText: fixture.experienceText,
  })),
]);

interface LocalVerificationFixture {
  readonly userId: string;
  readonly verificationId: string;
  readonly idempotencyPrefix: string;
  readonly start: {
    readonly commandId: string;
    readonly correlationId: string;
    readonly requestId: string;
    readonly eventId: string;
    readonly auditId: string;
    readonly outboxMessageId: string;
  };
  readonly approval: {
    readonly commandId: string;
    readonly correlationId: string;
    readonly requestId: string;
    readonly eventId: string;
    readonly auditId: string;
    readonly outboxMessageId: string;
  };
}

const ensureLocalVerifiedUser = async (fixture: LocalVerificationFixture) => {
  let identity = await readIdentityProjection(database, fixture.userId);
  if (identity?.accountVerificationState === 'NOT_STARTED') {
    await startAccountVerification(
      database,
      {
        commandId: fixture.start.commandId,
        commandType: 'START_VERIFICATION',
        idempotencyKey: `${fixture.idempotencyPrefix}-start-v1`,
        actor: {
          type: 'USER',
          id: fixture.userId,
          roles: ['ATHLETE'],
          scopeIds: [],
        },
        aggregateType: 'AccountVerification',
        aggregateId: fixture.verificationId,
        expectedVersion: 0,
        correlationId: fixture.start.correlationId,
        causationId: null,
        requestId: fixture.start.requestId,
        source: 'api',
        payloadVersion: 1,
        payload: {
          userId: fixture.userId,
          moderationChecklistVersion: 'identity-mvp-v1',
        },
      },
      {
        eventId: fixture.start.eventId,
        auditId: fixture.start.auditId,
        outboxMessageId: fixture.start.outboxMessageId,
      },
    );
    identity = await readIdentityProjection(database, fixture.userId);
  }
  if (identity?.accountVerificationState === 'PENDING') {
    await approveAccountVerification(
      database,
      {
        commandId: fixture.approval.commandId,
        commandType: 'APPROVE_VERIFICATION',
        idempotencyKey: `${fixture.idempotencyPrefix}-approve-v1`,
        actor: {
          type: 'USER',
          id: localCentralUserId,
          roles: ['CENTRAL_ADMIN'],
          scopeIds: [],
        },
        aggregateType: 'AccountVerification',
        aggregateId: fixture.verificationId,
        expectedVersion: 1,
        correlationId: fixture.approval.correlationId,
        causationId: fixture.start.eventId,
        requestId: fixture.approval.requestId,
        source: 'admin',
        payloadVersion: 1,
        payload: {
          userId: fixture.userId,
          moderationChecklistVersion: 'identity-mvp-v1',
        },
      },
      {
        eventId: fixture.approval.eventId,
        auditId: fixture.approval.auditId,
        outboxMessageId: fixture.approval.outboxMessageId,
      },
    );
    identity = await readIdentityProjection(database, fixture.userId);
  }
  if (identity?.accountVerificationState !== 'VERIFIED') {
    throw new Error(`Local user ${fixture.userId} must be VERIFIED`);
  }
};

const athleteVerificationUserIds = [
  localUserId,
  localDiscoveryUserId,
  localDiscoveryUserTwoId,
  ...localTemporaryDiscoveryFixtures.map((fixture) => fixture.activation.payload.userId),
] as const;

const localAthleteVerificationFixture = (
  userId: string,
  index: number,
): LocalVerificationFixture => {
  const group = `9${index.toString().padStart(3, '0')}`;
  const id = (value: number) =>
    `0199a1b2-1234-7000-${group}-${value.toString().padStart(12, '0')}`;
  return {
    userId,
    verificationId: id(1),
    idempotencyPrefix: `local-development-athlete-${index}-verification`,
    start: {
      commandId: id(2),
      correlationId: id(3),
      requestId: id(4),
      eventId: id(5),
      auditId: id(6),
      outboxMessageId: id(7),
    },
    approval: {
      commandId: id(8),
      correlationId: id(9),
      requestId: id(10),
      eventId: id(11),
      auditId: id(12),
      outboxMessageId: id(13),
    },
  };
};

for (const [index, userId] of athleteVerificationUserIds.entries()) {
  await ensureLocalVerifiedUser(localAthleteVerificationFixture(userId, index + 1));
}

await ensureLocalPilotCompetition(database, {
  competitionId: localCompetitionId,
  communityId: localCommunityId,
  centralActorId: localCentralUserId,
  occurredAt: '2026-09-05T09:00:00.000Z',
  memberships: athleteVerificationUserIds.map((userId, index) => ({
    userId,
    membershipId: `0199a1b2-1234-7000-a${index.toString().padStart(3, '0')}-000000000001`,
  })),
});

await ensureLocalVerifiedUser({
  userId: localCoachUserId,
  verificationId: '0199a1b2-1234-7000-8000-000000000522',
  idempotencyPrefix: 'local-development-coach-verification',
  start: {
    commandId: '0199a1b2-1234-7000-8000-000000000523',
    correlationId: '0199a1b2-1234-7000-8000-000000000524',
    requestId: '0199a1b2-1234-7000-8000-000000000525',
    eventId: '0199a1b2-1234-7000-8000-000000000526',
    auditId: '0199a1b2-1234-7000-8000-000000000527',
    outboxMessageId: '0199a1b2-1234-7000-8000-000000000528',
  },
  approval: {
    commandId: '0199a1b2-1234-7000-8000-000000000529',
    correlationId: '0199a1b2-1234-7000-8000-000000000530',
    requestId: '0199a1b2-1234-7000-8000-000000000531',
    eventId: '0199a1b2-1234-7000-8000-000000000532',
    auditId: '0199a1b2-1234-7000-8000-000000000533',
    outboxMessageId: '0199a1b2-1234-7000-8000-000000000534',
  },
});

await ensureLocalVerifiedUser({
  userId: localReplacementCoachUserId,
  verificationId: '0199a1b2-1234-7000-8000-000000000808',
  idempotencyPrefix: 'local-development-replacement-coach-verification',
  start: {
    commandId: '0199a1b2-1234-7000-8000-000000000809',
    correlationId: '0199a1b2-1234-7000-8000-000000000810',
    requestId: '0199a1b2-1234-7000-8000-000000000811',
    eventId: '0199a1b2-1234-7000-8000-000000000812',
    auditId: '0199a1b2-1234-7000-8000-000000000813',
    outboxMessageId: '0199a1b2-1234-7000-8000-000000000814',
  },
  approval: {
    commandId: '0199a1b2-1234-7000-8000-000000000815',
    correlationId: '0199a1b2-1234-7000-8000-000000000816',
    requestId: '0199a1b2-1234-7000-8000-000000000817',
    eventId: '0199a1b2-1234-7000-8000-000000000818',
    auditId: '0199a1b2-1234-7000-8000-000000000819',
    outboxMessageId: '0199a1b2-1234-7000-8000-000000000820',
  },
});

await ensureLocalVerifiedUser({
  userId: localAdminUserId,
  verificationId: '0199a1b2-1234-7000-8000-000000000541',
  idempotencyPrefix: 'local-development-admin-verification',
  start: {
    commandId: '0199a1b2-1234-7000-8000-000000000542',
    correlationId: '0199a1b2-1234-7000-8000-000000000543',
    requestId: '0199a1b2-1234-7000-8000-000000000544',
    eventId: '0199a1b2-1234-7000-8000-000000000545',
    auditId: '0199a1b2-1234-7000-8000-000000000546',
    outboxMessageId: '0199a1b2-1234-7000-8000-000000000547',
  },
  approval: {
    commandId: '0199a1b2-1234-7000-8000-000000000548',
    correlationId: '0199a1b2-1234-7000-8000-000000000549',
    requestId: '0199a1b2-1234-7000-8000-000000000550',
    eventId: '0199a1b2-1234-7000-8000-000000000551',
    auditId: '0199a1b2-1234-7000-8000-000000000552',
    outboxMessageId: '0199a1b2-1234-7000-8000-000000000553',
  },
});

const localCoachGrantId = '0199a1b2-1234-7000-8000-000000000603';
const localCoachContext = await readCommunityContext(
  database,
  localCoachUserId,
  localCommunityId,
);
const localCoachAlreadyActive = localCoachContext?.activeRoleGrants.some(
  (grant) =>
    grant.role === 'COACH' &&
    grant.scopeType === 'COMMUNITY' &&
    grant.scopeId === localCommunityId,
);
const localCoachPendingInvites = await listPendingCoachInvites(
  database,
  localCoachUserId,
);
if (
  !localCoachAlreadyActive &&
  localCoachPendingInvites.length === 0 &&
  !(await readRoleGrant(database, localCoachGrantId))
) {
  await inviteCoach(
    database,
    {
      commandId: '0199a1b2-1234-7000-8000-000000000604',
      commandType: 'INVITE_COACH',
      idempotencyKey: 'local-development-coach-invite-v1',
      actor: {
        type: 'USER',
        id: localCentralUserId,
        roles: ['CENTRAL_ADMIN'],
        scopeIds: [],
      },
      aggregateType: 'RoleGrant',
      aggregateId: localCoachGrantId,
      expectedVersion: 0,
      correlationId: '0199a1b2-1234-7000-8000-000000000605',
      causationId: null,
      requestId: '0199a1b2-1234-7000-8000-000000000606',
      source: 'admin',
      payloadVersion: 1,
      payload: {
        userId: localCoachUserId,
        communityId: localCommunityId,
        reasonCode: 'LOCAL_PILOT_COACH',
        invitationTtlHours: 168,
      },
    },
    {
      eventId: '0199a1b2-1234-7000-8000-000000000607',
      auditId: '0199a1b2-1234-7000-8000-000000000608',
      outboxMessageId: '0199a1b2-1234-7000-8000-000000000609',
      notificationId: '0199a1b2-1234-7000-8000-000000000610',
    },
  );
}

const localReplacementCoachGrantId = '0199a1b2-1234-7000-8000-000000000821';
const localReplacementCoachContext = await readCommunityContext(
  database,
  localReplacementCoachUserId,
  localCommunityId,
);
const localReplacementCoachAlreadyActive = localReplacementCoachContext?.activeRoleGrants.some(
  (grant) =>
    grant.role === 'COACH'
    && grant.scopeType === 'COMMUNITY'
    && grant.scopeId === localCommunityId,
);
if (!localReplacementCoachAlreadyActive) {
  let replacementGrant = await readRoleGrant(database, localReplacementCoachGrantId);
  if (!replacementGrant) {
    await inviteCoach(
      database,
      {
        commandId: '0199a1b2-1234-7000-8000-000000000822',
        commandType: 'INVITE_COACH',
        idempotencyKey: 'local-development-replacement-coach-invite-v1',
        actor: {
          type: 'USER', id: localCentralUserId,
          roles: ['CENTRAL_ADMIN'], scopeIds: [],
        },
        aggregateType: 'RoleGrant', aggregateId: localReplacementCoachGrantId,
        expectedVersion: 0,
        correlationId: '0199a1b2-1234-7000-8000-000000000823',
        causationId: null,
        requestId: '0199a1b2-1234-7000-8000-000000000824',
        source: 'admin', payloadVersion: 1,
        payload: {
          userId: localReplacementCoachUserId,
          communityId: localCommunityId,
          reasonCode: 'LOCAL_PILOT_REPLACEMENT_COACH',
          invitationTtlHours: 168,
        },
      },
      {
        eventId: '0199a1b2-1234-7000-8000-000000000825',
        auditId: '0199a1b2-1234-7000-8000-000000000826',
        outboxMessageId: '0199a1b2-1234-7000-8000-000000000827',
        notificationId: '0199a1b2-1234-7000-8000-000000000828',
      },
    );
    replacementGrant = await readRoleGrant(database, localReplacementCoachGrantId);
  }
  if (replacementGrant?.state === 'PENDING') {
    await acceptCoachInvite(
      database,
      {
        commandId: '0199a1b2-1234-7000-8000-000000000829',
        commandType: 'ACCEPT_COACH_ROLE',
        idempotencyKey: 'local-development-replacement-coach-accept-v1',
        actor: {
          type: 'USER', id: localReplacementCoachUserId,
          roles: ['ATHLETE'], scopeIds: [],
        },
        aggregateType: 'RoleGrant', aggregateId: localReplacementCoachGrantId,
        expectedVersion: 1,
        correlationId: '0199a1b2-1234-7000-8000-000000000830',
        causationId: '0199a1b2-1234-7000-8000-000000000825',
        requestId: '0199a1b2-1234-7000-8000-000000000831',
        source: 'api', payloadVersion: 1,
        payload: { userId: localReplacementCoachUserId },
      },
      {
        eventId: '0199a1b2-1234-7000-8000-000000000832',
        auditId: '0199a1b2-1234-7000-8000-000000000833',
        outboxMessageId: '0199a1b2-1234-7000-8000-000000000834',
        notificationId: '0199a1b2-1234-7000-8000-000000000835',
      },
    );
  }
}

const localAdminGrantId = '0199a1b2-1234-7000-8000-000000000611';
const localAdminContext = await readCommunityContext(
  database,
  localAdminUserId,
  localCommunityId,
);
const localAdminAlreadyActive = localAdminContext?.activeRoleGrants.some(
  (grant) =>
    grant.role === 'GYM_ADMIN' &&
    grant.scopeType === 'VENUE' &&
    grant.scopeId === localVenueId,
);
if (!localAdminAlreadyActive && !(await readRoleGrant(database, localAdminGrantId))) {
  await appointGymAdmin(
    database,
    {
      commandId: '0199a1b2-1234-7000-8000-000000000612',
      commandType: 'APPOINT_GYM_ADMIN',
      idempotencyKey: 'local-development-gym-admin-v1',
      actor: {
        type: 'USER',
        id: localCentralUserId,
        roles: ['CENTRAL_ADMIN'],
        scopeIds: [],
      },
      aggregateType: 'RoleGrant',
      aggregateId: localAdminGrantId,
      expectedVersion: 0,
      correlationId: '0199a1b2-1234-7000-8000-000000000613',
      causationId: null,
      requestId: '0199a1b2-1234-7000-8000-000000000614',
      source: 'admin',
      payloadVersion: 1,
      payload: {
        userId: localAdminUserId,
        venueId: localVenueId,
        reasonCode: 'LOCAL_PILOT_ADMIN',
      },
    },
    {
      eventId: '0199a1b2-1234-7000-8000-000000000615',
      auditId: '0199a1b2-1234-7000-8000-000000000616',
      outboxMessageId: '0199a1b2-1234-7000-8000-000000000617',
      notificationId: '0199a1b2-1234-7000-8000-000000000618',
    },
  );
}

const localAuth = new StaticBearerAuthRegistryAdapter([
  { token: localToken, userId: localUserId },
  { token: localCentralToken, userId: localCentralUserId },
  { token: localCoachToken, userId: localCoachUserId },
  { token: localReplacementCoachToken, userId: localReplacementCoachUserId },
  { token: localAdminToken, userId: localAdminUserId },
  { token: localDiscoveryToken, userId: localDiscoveryUserId },
  { token: localDiscoveryTwoToken, userId: localDiscoveryUserTwoId },
  ...localTemporaryDiscoveryFixtures.map((fixture) => ({
    token: fixture.token,
    userId: fixture.activation.payload.userId,
  })),
]);
const localCentralAuth = new StaticBearerAuthAdapter(
  localCentralToken,
  localCentralUserId,
);

const app = await buildApp({
  appeal: {
    auth: localAuth,
    centralAuth: localCentralAuth,
    readAppeal: (resultId, viewerUserId) => readAppealForViewer(database, resultId, viewerUserId),
    listAppeals: (centralUserId) => listAppealsForCentral(database, centralUserId),
    startReview: (command, ids) => startAppealReview(database, command, ids),
    decide: (command, ids) => decideAppeal(database, command, ids),
    addResponse: (command, ids) => addAppealResponse(database, command, ids),
    withdraw: (command, ids) => withdrawAppeal(database, command, ids),
    extendSla: (command, ids) => extendAppealSla(database, command, ids),
  },
  missingResult: {
    auth: localAuth,
    centralAuth: localCentralAuth,
    listForViewer: (viewerUserId) => listMissingResultReviewsForViewer(database, viewerUserId),
    listForCentral: (centralUserId) => listMissingResultReviewsForCentral(database, centralUserId),
    read: (reviewId, viewerUserId) => readMissingResultReview(database, reviewId, viewerUserId),
    submitStatement: (command, ids) => submitMissingResultStatement(database, command, ids),
    confirmVenue: (command, ids) => confirmMissingResultVenue(database, command, ids),
    startReview: (command, ids) => startMissingResultReview(database, command, ids),
    assignCoach: (command, ids) => assignMissingResultReviewerCoach(database, command, ids),
    orderRepeat: (command, ids) => orderMissingResultRepeat(database, command, ids),
  },
  integrityCase: {
    auth: localAuth,
    centralAuth: localCentralAuth,
    listForViewer: (viewerUserId) =>
      listIntegrityCasesForViewer(database, viewerUserId),
    listForCentral: (centralUserId) =>
      listIntegrityCasesForCentral(database, centralUserId),
    read: (caseId, viewerUserId) =>
      readIntegrityCase(database, caseId, viewerUserId),
    open: (command, ids) => openIntegrityCase(database, command, ids),
    startReview: (command, ids) => startIntegrityReview(database, command, ids),
    decide: (command, ids) => decideIntegrityCase(database, command, ids),
  },
  statusQueue: {
    auth: localAuth,
    competitionId: localCompetitionId,
    readCompetitionStatus: (competitionId, viewerUserId) =>
      readCompetitionStatus(database, competitionId, viewerUserId),
    submitEntry: (command, ids) => submitStatusQueueEntry(database, command, ids),
    withdrawEntry: (command, ids) => withdrawStatusQueueEntry(database, command, ids),
    reconfirmEntry: (command, ids) => reconfirmStatusQueueEntry(database, command, ids),
    respondToGenesis: (command, decision, ids) =>
      respondToGenesisChallenge(database, command, decision, ids),
  },
  statusRelease: {
    auth: localAuth,
    preview: (command, ids, confirmationToken) =>
      previewStatusRelease(database, command, ids, confirmationToken),
    confirm: (command, ids) => confirmStatusRelease(database, command, ids),
  },
  logger: {
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'authorization',
        'cookie',
        'accessToken',
        'refreshToken',
      ],
      remove: true,
    },
  },
  allowedOrigins: ['http://localhost:8081', 'http://127.0.0.1:8081'],
  readiness: () => probeDatabase(database),
  chat: {
    auth: localAuth,
    readMessages: (chatId, userId, limit, cursor) =>
      readChatMessages(database, chatId, userId, limit, cursor),
    sendMessage: (command, ids) => sendChatMessage(database, command, ids),
    editMessage: (command, ids) => editChatMessage(database, command, ids),
    hideMessage: (command, ids) => hideChatMessageForUser(database, command, ids),
    reportMessage: (command, ids) => reportChatMessage(database, command, ids),
  },
  challenge: {
    auth: localAuth,
    readChatChallenge: (chatId, userId) =>
      readChatChallenge(database, chatId, userId),
    createDirectOpenChallenge: (command, ids) =>
      createDirectOpenChallenge(database, command, ids),
    acceptOptionalChallenge: (command, ids) =>
      acceptOptionalChallenge(database, command, ids),
    declineOptionalChallenge: (command, ids) =>
      declineOptionalChallenge(database, command, ids),
    withdrawOptionalChallenge: (command, ids) =>
      withdrawOptionalChallenge(database, command, ids),
  },
  community: {
    auth: localAuth,
    readContext: (userId) => readCommunityContext(database, userId, localCommunityId),
    lifecycle: {
      auth: localCentralAuth,
      read: (communityId) => readCommunityLifecycle(database, communityId),
      pause: (command, ids) => pauseCommunity(database, command, ids),
      reactivate: (command, ids) => reactivateCommunity(database, command, ids),
    },
  },
  discovery: {
    auth: localAuth,
    readCards: (userId, limit) => readDiscoveryCards(database, userId, limit),
    createLike: (command, ids) => createDiscoveryLike(database, command, ids),
    skip: (command, ids) => skipDiscoveryCandidate(database, command, ids),
    readMatches: (userId) => readMatches(database, userId),
    unmatch: (command, ids) => unmatchPair(database, command, ids),
    block: (command, ids) => blockUser(database, command, ids),
    readBlocks: (userId) => readActiveBlocks(database, userId),
    readLatestBlock: (blockerUserId, blockedUserId) =>
      readLatestDirectedBlock(database, blockerUserId, blockedUserId),
    unblock: (command, ids) => unblockUser(database, command, ids),
  },
  identity: {
    auth: localAuth,
    readMe: (userId) => readIdentityProjection(database, userId),
    changeDisplayName: (command, ids) => changeDisplayName(database, command, ids),
    changeSports: (command, ids) => changeSports(database, command, ids),
  },
  roles: {
    operatorAuth: localCentralAuth,
    userAuth: localAuth,
    inviteCoach: (command, ids) => inviteCoach(database, command, ids),
    acceptCoachInvite: (command, ids) =>
      acceptCoachInvite(database, command, ids),
    listPendingCoachInvites: (userId) =>
      listPendingCoachInvites(database, userId),
    appointGymAdmin: (command, ids) => appointGymAdmin(database, command, ids),
    changePrimaryAdmin: (command, ids) =>
      changePrimaryAdmin(database, command, ids),
    readVenueRoleSummary: (centralUserId, venueId) =>
      readVenueRoleSummary(database, centralUserId, venueId),
  },
  result: {
    auth: localAuth,
    readResult: (resultId, viewerUserId) => readResult(database, resultId, viewerUserId),
    recordSessionResult: (command, ids) => recordSessionResult(database, command, ids),
    submitResultAppeal: (command, ids) => submitResultAppeal(database, command, ids),
    waiveResultAppeal: (command, ids) => waiveResultAppeal(database, command, ids),
  },
  scheduling: {
    auth: localAuth,
    readTrainingOptions: (chatId, viewerUserId) =>
      readTrainingOptions(database, chatId, viewerUserId),
    publishSlot: (command, ids) => publishSlot(database, command, ids),
    updateSlot: (command, ids) => updateSlot(database, command, ids),
    withdrawSlot: (command, ids) => withdrawSlot(database, command, ids),
    publishGroupOffering: (command, ids) =>
      publishGroupOffering(database, command, ids),
    updateGroupOffering: (command, ids) =>
      updateGroupOffering(database, command, ids),
    withdrawGroupOffering: (command, ids) =>
      withdrawGroupOffering(database, command, ids),
    selectSlot: (command, ids) => selectSlot(database, command, ids),
    selectSameSlot: (command, ids) => selectSameSlot(database, command, ids),
    readHostConfirmationQueue: (actorUserId) =>
      readHostConfirmationQueue(database, actorUserId),
    readVenueAdminDashboard: (actorUserId, venueId) =>
      readVenueAdminDashboard(database, actorUserId, venueId),
    confirmBookingHost: (command, ids) =>
      confirmBookingHost(database, command, ids),
    rejectBookingHost: (command, ids) =>
      rejectBookingHost(database, command, ids),
    readMySessions: (actorUserId) => readMySessions(database, actorUserId),
    readSession: (sessionId, actorUserId) =>
      readSession(database, sessionId, actorUserId),
    startSession: (command, ids) => startSession(database, command, ids),
    recordSessionAttendance: (command, ids) =>
      recordSessionAttendance(database, command, ids),
    endSession: (command, ids) => endSession(database, command, ids),
    replaceSessionCoach: (command, ids) =>
      replaceSessionCoach(database, command, ids),
    cancelSessionAfterCoachReplacement: (command, ids) =>
      cancelSessionAfterCoachReplacement(database, command, ids),
    failSessionExternal: (command, ids) =>
      failSessionExternal(database, command, ids),
    requestBookingOfficialConversion: (command, ids) =>
      requestBookingOfficialConversion(database, command, ids),
    decideBookingOfficialConversion: (command, ids) =>
      decideBookingOfficialConversion(database, command, ids),
    requestTrainingParticipantCancellation: (command, ids) =>
      requestTrainingParticipantCancellation(database, command, ids),
    decideBookingSoloContinuation: (command, ids) =>
      decideBookingSoloContinuation(database, command, ids),
    proposeGroupPlan: (command, ids) => proposeGroupPlan(database, command, ids),
    confirmGroupPlan: (command, ids) => confirmGroupPlan(database, command, ids),
  },
  verification: {
    athleteAuth: localAuth,
    centralAuth: localCentralAuth,
    start: (command, ids) => startAccountVerification(database, command, ids),
    approve: (command, ids) => approveAccountVerification(database, command, ids),
    listPending: (centralUserId) =>
      listPendingVerifications(database, centralUserId),
  },
});

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  await database.destroy();
  process.exitCode = 1;
}

const shutdown = async () => {
  await app.close();
  await database.destroy();
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
