import type { CommandEnvelope } from '@molokh/core';
import type {
  AccountAccessCaseProjection,
  DuplicateAccountCaseProjection,
  ExecutedCommand,
} from '@molokh/db';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { StaticBearerAuthAdapter } from '../src/auth.js';

const userId = '0199a1b2-1234-7000-8000-000000000101';
const otherUserId = '0199a1b2-1234-7000-8000-000000000102';
const centralId = '0199a1b2-1234-7000-8000-000000000506';
const caseId = '0199a1b2-1234-7000-8000-000000005401';
const duplicateCaseId = '0199a1b2-1234-7000-8000-000000005402';
const eventId = '0199a1b2-1234-7000-8000-000000005403';
const athleteToken = 'access-athlete-token';
const centralToken = 'access-central-token';

const recovery: AccountAccessCaseProjection = {
  caseId, userId, state: 'PENDING', route: 'PHONE_CHANGE',
  signals: ['TRUSTED_SESSION'], requestedPhoneE164: '+79990000999',
  requestedAt: '2026-10-03T10:00:00.000Z', securityHoldUntil: null,
  incidentStartedAt: null, incidentEndedAt: null, affectedProcessIds: [],
  completedAt: null, version: 1,
};
const duplicate: DuplicateAccountCaseProjection = {
  caseId: duplicateCaseId, state: 'UNDER_REVIEW', userIds: [userId, otherUserId],
  signalReferences: ['central:test'], canonicalUserId: null,
  processes: [{ kind: 'STATUS', aggregateId: '0199a1b2-1234-7000-8000-000000000901',
    currentOwnerUserId: userId, decision: null }],
  requestedAt: '2026-10-03T11:00:00.000Z', decidedAt: null, version: 1,
};
function executed<T>(response: T, status = 200): ExecutedCommand<T> {
  return { responseStatus: status, response, eventId, aggregateVersion: 1, replayed: false };
}

describe('account access routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('exposes owner recovery plus versioned Central recovery and duplicate queues', async () => {
    const commands: CommandEnvelope<unknown>[] = [];
    const app = await buildApp({ accountAccess: {
      auth: new StaticBearerAuthAdapter(athleteToken, userId),
      centralAuth: new StaticBearerAuthAdapter(centralToken, centralId),
      readMine: async () => recovery,
      requestRecovery: async (command) => { commands.push(command); return executed(recovery, 202); },
      listRecovery: async () => [recovery],
      approvePhone: async (command) => { commands.push(command); return executed({ ...recovery,
        state: 'SECURITY_HOLD', securityHoldUntil: '2026-10-04T10:00:00.000Z', version: 2 }); },
      completeVerified: async (command) => { commands.push(command); return executed({ ...recovery,
        route: 'VERIFIED_ROUTE', requestedPhoneE164: null, state: 'COMPLETED',
        completedAt: '2026-10-03T10:01:00.000Z', version: 2 }); },
      rejectRecovery: async (command) => { commands.push(command); return executed({ ...recovery,
        state: 'REJECTED', version: 2 }); },
      confirmIncident: async (command) => { commands.push(command); return executed(recovery); },
      listDuplicates: async () => [duplicate],
      openDuplicate: async (command) => { commands.push(command); return executed(duplicate, 201); },
      clearDuplicate: async (command) => { commands.push(command); return executed({ ...duplicate,
        state: 'CLEARED', decidedAt: '2026-10-03T12:00:00.000Z', version: 2 }); },
      resolveDuplicate: async (command) => { commands.push(command); return executed({ ...duplicate,
        state: 'RESOLVED', canonicalUserId: userId,
        processes: duplicate.processes.map((item) => ({ ...item,
          decision: 'SEPARATE_GOVERNED_REVIEW' })),
        decidedAt: '2026-10-03T12:00:00.000Z', version: 2 }); },
    } });
    apps.push(app);

    const requested = await app.inject({ method: 'POST', url: '/api/v1/me/recovery-cases',
      headers: { authorization: `Bearer ${athleteToken}`, 'idempotency-key': 'recovery-1' },
      payload: { route: 'PHONE_CHANGE', signals: ['TRUSTED_SESSION'],
        requestedPhoneE164: '+79990000999', reason: 'Previous SIM is unavailable now' } });
    expect(requested.statusCode).toBe(202);
    expect(commands.at(-1)).toMatchObject({ commandType: 'REQUEST_ACCOUNT_RECOVERY',
      actor: { id: userId }, expectedVersion: 0,
      payload: { userId, route: 'PHONE_CHANGE' } });

    const approved = await app.inject({ method: 'POST',
      url: `/api/v1/central/account-recovery-cases/${caseId}/approve-phone`,
      headers: { authorization: `Bearer ${centralToken}`, 'idempotency-key': 'approve-1',
        'if-match': '1' }, payload: { reason: 'Trusted recovery signals are sufficient' } });
    expect(approved.statusCode).toBe(200);
    expect(commands.at(-1)).toMatchObject({ commandType: 'APPROVE_PHONE_CHANGE',
      aggregateId: caseId, expectedVersion: 1,
      actor: { id: centralId, roles: ['CENTRAL_ADMIN'] } });

    const opened = await app.inject({ method: 'POST',
      url: '/api/v1/central/duplicate-account-cases',
      headers: { authorization: `Bearer ${centralToken}`, 'idempotency-key': 'duplicate-1' },
      payload: { userIds: [userId, otherUserId], signalReferences: ['central:test'],
        reason: 'Material signals require a duplicate review' } });
    expect(opened.statusCode).toBe(201);
    expect(commands.at(-1)).toMatchObject({ commandType: 'OPEN_DUPLICATE_REVIEW',
      expectedVersion: 0 });

    const resolved = await app.inject({ method: 'POST',
      url: `/api/v1/central/duplicate-account-cases/${duplicateCaseId}/resolve`,
      headers: { authorization: `Bearer ${centralToken}`, 'idempotency-key': 'resolve-1',
        'if-match': '1' }, payload: { canonicalUserId: userId,
        dispositions: [{ kind: 'STATUS', aggregateId: duplicate.processes[0]!.aggregateId,
          currentOwnerUserId: userId, decision: 'SEPARATE_GOVERNED_REVIEW' }],
        reason: 'Canonical User and explicit dispositions are confirmed' } });
    expect(resolved.statusCode).toBe(200);
    expect(commands.at(-1)).toMatchObject({ commandType: 'RESOLVE_DUPLICATE',
      aggregateId: duplicateCaseId, expectedVersion: 1 });

    const paths = app.swagger().paths;
    expect(paths).toHaveProperty('/api/v1/me/recovery-cases');
    expect(paths).toHaveProperty('/api/v1/central/account-recovery-cases/{caseId}/approve-phone');
    expect(paths).toHaveProperty('/api/v1/central/duplicate-account-cases/{caseId}/resolve');
  });
});
