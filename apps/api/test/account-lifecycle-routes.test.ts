import type { CommandEnvelope, IdentityProjection } from '@molokh/core';
import type {
  AccountClosureProjection,
  AccountExportProjection,
  AccountLifecycleProjection,
  CentralAccountClosureProjection,
  ExecutedCommand,
} from '@molokh/db';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { StaticBearerAuthAdapter } from '../src/auth.js';

const userId = '0199a1b2-1234-7000-8000-000000000101';
const centralId = '0199a1b2-1234-7000-8000-000000000506';
const closureId = '0199a1b2-1234-7000-8000-000000005320';
const exportId = '0199a1b2-1234-7000-8000-000000005321';
const eventId = '0199a1b2-1234-7000-8000-000000005322';
const athleteToken = 'account-athlete-token';
const centralToken = 'account-central-token';
const closure: AccountClosureProjection = {
  closureId, userId, state: 'REQUESTED', exportRequested: true,
  requestedAt: '2026-10-03T10:00:00.000Z', recoveryUntil: '2026-11-02T10:00:00.000Z',
  cancelledAt: null, executedAt: null, version: 1,
};
const dataExport: AccountExportProjection = {
  exportId, userId, closureId, state: 'READY', requestedAt: '2026-10-03T10:00:00.000Z',
  readyAt: '2026-10-03T10:01:00.000Z', expiresAt: '2026-10-05T10:01:00.000Z',
  payloadSha256: 'a'.repeat(64), version: 2,
};
const lifecycle: AccountLifecycleProjection = { closure, dataExport };
const centralClosure: CentralAccountClosureProjection = {
  ...closure, displayName: 'Athlete', accountState: 'ACTIVE', userVersion: 4,
  blockers: { activeObligationCount: 0, heldStatusCount: 0, activeSessionCount: 0,
    activeMembershipCount: 0, activeRoleCount: 0, activeQueueEntryCount: 0 },
  executable: true,
};
const closedIdentity: IdentityProjection = {
  userId, displayName: 'Удалённый участник', ageDivision: 'ADULT', accountState: 'CLOSED',
  phoneVerified: false, accountVerificationState: 'VERIFIED', primarySport: 'BOXING',
  secondarySport: null, discoveryRadiusKm: 15, version: 5, capabilities: [],
  capabilityDenials: [
    'USE_DISCOVERY', 'EDIT_PROFILE', 'BOOK_ORDINARY_TRAINING', 'ACCOUNT_VERIFIED',
  ].map((capability) => ({ capability: capability as IdentityProjection['capabilities'][number],
    code: 'ACCOUNT_CLOSED' as const, messageKey: 'identity.account_closed', retryable: false })),
};

function executed<T>(response: T, status = 200): ExecutedCommand<T> {
  return { responseStatus: status, response, eventId, aggregateVersion: 2, replayed: false };
}

describe('account lifecycle routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('exposes owner recovery/export actions and a versioned Central execution queue', async () => {
    const commands: CommandEnvelope<unknown>[] = [];
    const app = await buildApp({ accountLifecycle: {
      auth: new StaticBearerAuthAdapter(athleteToken, userId),
      centralAuth: new StaticBearerAuthAdapter(centralToken, centralId),
      read: async () => lifecycle,
      requestClosure: async (command) => { commands.push(command); return executed(lifecycle, 201); },
      cancelClosure: async (command) => { commands.push(command); return executed({ ...lifecycle,
        closure: { ...closure, state: 'CANCELLED', cancelledAt: '2026-10-04T10:00:00.000Z',
          version: 2 } }); },
      requestExport: async (command) => { commands.push(command); return executed(dataExport, 202); },
      downloadExport: async () => ({ payload: { schemaVersion: 1, userId },
        payloadSha256: 'a'.repeat(64) }),
      listCentral: async () => [centralClosure],
      executeClosure: async (command) => { commands.push(command); return executed(closedIdentity); },
    } });
    apps.push(app);

    expect((await app.inject({ method: 'GET', url: '/api/v1/me/account-lifecycle' })).statusCode)
      .toBe(401);
    const read = await app.inject({ method: 'GET', url: '/api/v1/me/account-lifecycle',
      headers: { authorization: `Bearer ${athleteToken}` } });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({ data: { closure: { closureId },
      dataExport: { exportId, state: 'READY' } } });

    const requested = await app.inject({ method: 'POST', url: '/api/v1/me/account-closure',
      headers: { authorization: `Bearer ${athleteToken}`, 'idempotency-key': 'closure-request-1' },
      payload: { exportRequested: true } });
    expect(requested.statusCode).toBe(201);
    expect(commands.at(-1)).toMatchObject({ commandType: 'REQUEST_ACCOUNT_CLOSURE',
      actor: { id: userId }, expectedVersion: 0,
      payload: { userId, exportRequested: true } });

    const cancelled = await app.inject({ method: 'POST',
      url: `/api/v1/me/account-closures/${closureId}/cancel`,
      headers: { authorization: `Bearer ${athleteToken}`, 'idempotency-key': 'closure-cancel-1',
        'if-match': '1' } });
    expect(cancelled.statusCode).toBe(200);
    expect(commands.at(-1)).toMatchObject({ commandType: 'CANCEL_ACCOUNT_CLOSURE',
      aggregateId: closureId, expectedVersion: 1 });

    const exportRequested = await app.inject({ method: 'POST', url: '/api/v1/me/account-exports',
      headers: { authorization: `Bearer ${athleteToken}`, 'idempotency-key': 'export-request-1' } });
    expect(exportRequested.statusCode).toBe(202);
    expect(commands.at(-1)).toMatchObject({ commandType: 'REQUEST_ACCOUNT_EXPORT',
      actor: { id: userId }, expectedVersion: 0 });
    const downloaded = await app.inject({ method: 'GET',
      url: `/api/v1/me/account-exports/${exportId}/download`,
      headers: { authorization: `Bearer ${athleteToken}` } });
    expect(downloaded.statusCode).toBe(200);
    expect(downloaded.json()).toMatchObject({ data: { userId },
      meta: { payloadSha256: 'a'.repeat(64) } });

    const queue = await app.inject({ method: 'GET', url: '/api/v1/central/account-closures',
      headers: { authorization: `Bearer ${centralToken}` } });
    expect(queue.statusCode).toBe(200);
    expect(queue.json()).toMatchObject({ data: [{ closureId, userVersion: 4,
      executable: true }] });
    const closed = await app.inject({ method: 'POST',
      url: `/api/v1/central/account-closures/${closureId}/execute`,
      headers: { authorization: `Bearer ${centralToken}`, 'idempotency-key': 'closure-execute-1',
        'if-match': '4' }, payload: { reason: 'Recovery window elapsed.' } });
    expect(closed.statusCode).toBe(200);
    expect(commands.at(-1)).toMatchObject({ commandType: 'CLOSE_ACCOUNT',
      aggregateType: 'User', aggregateId: userId, expectedVersion: 4,
      actor: { id: centralId, roles: ['CENTRAL_ADMIN'] },
      payload: { closureId, userId, reason: 'Recovery window elapsed.' } });

    const paths = app.swagger().paths;
    expect(paths).toHaveProperty('/api/v1/me/account-lifecycle');
    expect(paths).toHaveProperty('/api/v1/me/account-closure');
    expect(paths).toHaveProperty('/api/v1/me/account-exports/{exportId}/download');
    expect(paths).toHaveProperty('/api/v1/central/account-closures/{closureId}/execute');
  });
});
