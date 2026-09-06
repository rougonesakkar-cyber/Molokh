import type { CommandEnvelope } from '@molokh/core';
import {
  activateUser,
  changeDisplayName,
  createDatabase,
  readIdentityProjection,
  runMigrations,
} from '@molokh/db';

import { buildApp } from './app.js';
import { StaticBearerAuthAdapter } from './auth.js';

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
const localToken = process.env.LOCAL_AUTH_TOKEN ?? 'molokh-local-athlete-token';
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

const app = await buildApp({
  logger: true,
  allowedOrigins: ['http://localhost:8081', 'http://127.0.0.1:8081'],
  identity: {
    auth: new StaticBearerAuthAdapter(localToken, localUserId),
    readMe: (userId) => readIdentityProjection(database, userId),
    changeDisplayName: (command, ids) => changeDisplayName(database, command, ids),
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
