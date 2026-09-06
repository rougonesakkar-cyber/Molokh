import type { CommandEnvelope } from '@molokh/core';
import {
  activateUser,
  acceptCoachInvite,
  appointGymAdmin,
  approveAccountVerification,
  changeDisplayName,
  changePrimaryAdmin,
  createDatabase,
  ensureLocalPilotCommunity,
  ensureLocalDiscoveryProfiles,
  inviteCoach,
  listPendingCoachInvites,
  listPendingVerifications,
  readCommunityContext,
  readDiscoveryCards,
  readIdentityProjection,
  readVenueRoleSummary,
  runMigrations,
  startAccountVerification,
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
const localCentralUserId = '0199a1b2-1234-7000-8000-000000000506';
const localCoachUserId = '0199a1b2-1234-7000-8000-000000000508';
const localAdminUserId = '0199a1b2-1234-7000-8000-000000000509';
const localDiscoveryUserId = '0199a1b2-1234-7000-8000-000000000554';
const localToken = process.env.LOCAL_AUTH_TOKEN ?? 'molokh-local-athlete-token';
const localCentralToken =
  process.env.LOCAL_CENTRAL_AUTH_TOKEN ?? 'molokh-local-central-token';
const localCoachToken =
  process.env.LOCAL_COACH_AUTH_TOKEN ?? 'molokh-local-coach-token';
const localAdminToken =
  process.env.LOCAL_ADMIN_AUTH_TOKEN ?? 'molokh-local-admin-token';
const localDiscoveryToken =
  process.env.LOCAL_DISCOVERY_AUTH_TOKEN ?? 'molokh-local-discovery-token';
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

const localAuth = new StaticBearerAuthRegistryAdapter([
  { token: localToken, userId: localUserId },
  { token: localCoachToken, userId: localCoachUserId },
  { token: localAdminToken, userId: localAdminUserId },
  { token: localDiscoveryToken, userId: localDiscoveryUserId },
]);
const localCentralAuth = new StaticBearerAuthAdapter(
  localCentralToken,
  localCentralUserId,
);

const app = await buildApp({
  logger: true,
  allowedOrigins: ['http://localhost:8081', 'http://127.0.0.1:8081'],
  community: {
    auth: localAuth,
    readContext: (userId) => readCommunityContext(database, userId, localCommunityId),
  },
  discovery: {
    auth: localAuth,
    readCards: (userId, limit) => readDiscoveryCards(database, userId, limit),
  },
  identity: {
    auth: localAuth,
    readMe: (userId) => readIdentityProjection(database, userId),
    changeDisplayName: (command, ids) => changeDisplayName(database, command, ids),
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
