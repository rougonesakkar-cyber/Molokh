import type { CommandEnvelope } from '@molokh/core';
import {
  activateUser,
  acceptCoachInvite,
  approveAccountVerification,
  changeDisplayName,
  createDatabase,
  ensureLocalPilotCommunity,
  inviteCoach,
  listPendingCoachInvites,
  listPendingVerifications,
  readCommunityContext,
  readIdentityProjection,
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
const localToken = process.env.LOCAL_AUTH_TOKEN ?? 'molokh-local-athlete-token';
const localCentralToken =
  process.env.LOCAL_CENTRAL_AUTH_TOKEN ?? 'molokh-local-central-token';
const localCoachToken =
  process.env.LOCAL_COACH_AUTH_TOKEN ?? 'molokh-local-coach-token';
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

const coachVerificationId = '0199a1b2-1234-7000-8000-000000000522';
const coachIdentity = await readIdentityProjection(database, localCoachUserId);
if (coachIdentity?.accountVerificationState === 'NOT_STARTED') {
  await startAccountVerification(
    database,
    {
      commandId: '0199a1b2-1234-7000-8000-000000000523',
      commandType: 'START_VERIFICATION',
      idempotencyKey: 'local-development-coach-verification-start-v1',
      actor: {
        type: 'USER',
        id: localCoachUserId,
        roles: ['ATHLETE'],
        scopeIds: [],
      },
      aggregateType: 'AccountVerification',
      aggregateId: coachVerificationId,
      expectedVersion: 0,
      correlationId: '0199a1b2-1234-7000-8000-000000000524',
      causationId: null,
      requestId: '0199a1b2-1234-7000-8000-000000000525',
      source: 'api',
      payloadVersion: 1,
      payload: {
        userId: localCoachUserId,
        moderationChecklistVersion: 'identity-mvp-v1',
      },
    },
    {
      eventId: '0199a1b2-1234-7000-8000-000000000526',
      auditId: '0199a1b2-1234-7000-8000-000000000527',
      outboxMessageId: '0199a1b2-1234-7000-8000-000000000528',
    },
  );
}
const pendingCoachIdentity = await readIdentityProjection(database, localCoachUserId);
if (pendingCoachIdentity?.accountVerificationState === 'PENDING') {
  await approveAccountVerification(
    database,
    {
      commandId: '0199a1b2-1234-7000-8000-000000000529',
      commandType: 'APPROVE_VERIFICATION',
      idempotencyKey: 'local-development-coach-verification-approve-v1',
      actor: {
        type: 'USER',
        id: localCentralUserId,
        roles: ['CENTRAL_ADMIN'],
        scopeIds: [],
      },
      aggregateType: 'AccountVerification',
      aggregateId: coachVerificationId,
      expectedVersion: 1,
      correlationId: '0199a1b2-1234-7000-8000-000000000530',
      causationId: '0199a1b2-1234-7000-8000-000000000526',
      requestId: '0199a1b2-1234-7000-8000-000000000531',
      source: 'admin',
      payloadVersion: 1,
      payload: {
        userId: localCoachUserId,
        moderationChecklistVersion: 'identity-mvp-v1',
      },
    },
    {
      eventId: '0199a1b2-1234-7000-8000-000000000532',
      auditId: '0199a1b2-1234-7000-8000-000000000533',
      outboxMessageId: '0199a1b2-1234-7000-8000-000000000534',
    },
  );
}

const localAuth = new StaticBearerAuthRegistryAdapter([
  { token: localToken, userId: localUserId },
  { token: localCoachToken, userId: localCoachUserId },
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
