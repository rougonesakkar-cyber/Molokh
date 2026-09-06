import {
  IdempotencyKeyReusedError,
  VersionConflictError,
  type CommandEnvelope,
  type IdentityProjection,
  type RoleGrantProjection,
} from '@molokh/core';
import type {
  ChangeDisplayNamePayload,
  CommunityContextProjection,
  IdentityEffectIds,
  ApproveVerificationPayload,
  AcceptCoachInvitePayload,
  StartVerificationPayload,
  InviteCoachPayload,
  RoleGrantEffectIds,
} from '@molokh/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { StaticBearerAuthAdapter } from '../src/auth.js';
import { mapApiError } from '../src/request-context.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const userId = '0199a1b2-1234-7000-8000-000000000301';
const token = 'molokh-api-test-token';

const identity: IdentityProjection = {
  userId,
  displayName: 'Свободный атлет',
  ageDivision: 'ADULT',
  accountState: 'ACTIVE',
  phoneVerified: true,
  accountVerificationState: 'NOT_STARTED',
  primarySport: 'BOXING',
  secondarySport: null,
  discoveryRadiusKm: 15,
  version: 1,
  capabilities: ['USE_DISCOVERY', 'EDIT_PROFILE', 'BOOK_ORDINARY_TRAINING'],
  capabilityDenials: [
    {
      capability: 'ACCOUNT_VERIFIED',
      code: 'ACCOUNT_NOT_VERIFIED',
      messageKey: 'identity.account_not_verified',
      retryable: true,
    },
  ],
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('runtime contract', () => {
  it('returns the typed readiness projection', async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'molokh-api',
      contractVersion: 1,
    });
  });

  it('publishes an OpenAPI 3.1 document', async () => {
    const app = await buildApp();
    apps.push(app);
    await app.ready();

    const document = app.swagger();

    expect('openapi' in document ? document.openapi : undefined).toBe('3.1.0');
    expect(document.paths).toHaveProperty('/health/ready');
    expect(document.paths).toHaveProperty('/v1/meta/runtime');
  });

  it('propagates valid transport context and replaces invalid identifiers', async () => {
    const app = await buildApp();
    apps.push(app);
    const requestId = '0199a1b2-1234-7000-8000-000000000021';
    const correlationId = '0199a1b2-1234-7000-8000-000000000022';

    const supplied = await app.inject({
      method: 'GET',
      url: '/health/ready',
      headers: {
        'x-request-id': requestId,
        'x-correlation-id': correlationId,
      },
    });
    expect(supplied.headers['x-request-id']).toBe(requestId);
    expect(supplied.headers['x-correlation-id']).toBe(correlationId);

    const replaced = await app.inject({
      method: 'GET',
      url: '/health/ready',
      headers: { 'x-request-id': 'not-a-uuid' },
    });
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(replaced.headers['x-request-id']).not.toBe('not-a-uuid');
    expect(replaced.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('maps command conflicts to stable public errors', () => {
    const requestId = '0199a1b2-1234-7000-8000-000000000021';
    expect(mapApiError(new VersionConflictError(1, 2), requestId)).toEqual({
      statusCode: 409,
      body: {
        code: 'VERSION_CONFLICT',
        message: 'Resource changed; refresh and try again',
        requestId,
      },
    });
    expect(mapApiError(new IdempotencyKeyReusedError('scope'), requestId)).toMatchObject({
      statusCode: 409,
      body: { code: 'IDEMPOTENCY_KEY_REUSED', requestId },
    });
  });

  it('protects and returns the public identity projection', async () => {
    const app = await buildApp({
      identity: {
        auth: new StaticBearerAuthAdapter(token, userId),
        readMe: async () => identity,
        changeDisplayName: vi.fn(),
      },
    });
    apps.push(app);

    const unauthorized = await app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json()).toMatchObject({ code: 'UNAUTHENTICATED' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: identity });
    expect(response.json().data).not.toHaveProperty('phoneE164');
    expect(response.json().data).not.toHaveProperty('birthDate');
  });

  it('passes an idempotent, versioned display-name command to the identity module', async () => {
    const changed: IdentityProjection = {
      ...identity,
      displayName: 'Номер Один',
      version: 2,
    };
    const changeDisplayName = vi.fn(async (
      _command: CommandEnvelope<ChangeDisplayNamePayload>,
      _ids: IdentityEffectIds,
    ) => ({
      responseStatus: 200,
      response: changed,
      eventId: '0199a1b2-1234-7000-8000-000000000302',
      aggregateVersion: 2,
      replayed: false,
    }));
    const app = await buildApp({
      allowedOrigins: ['http://localhost:8081'],
      identity: {
        auth: new StaticBearerAuthAdapter(token, userId),
        readMe: async () => identity,
        changeDisplayName,
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me/profile',
      headers: {
        authorization: `Bearer ${token}`,
        origin: 'http://localhost:8081',
        'idempotency-key': 'display-name-test-1',
        'if-match': '1',
        'x-correlation-id': '0199a1b2-1234-7000-8000-000000000303',
      },
      payload: { displayName: 'Номер Один' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8081');
    expect(response.json()).toMatchObject({
      data: { displayName: 'Номер Один', version: 2 },
      meta: {
        eventId: '0199a1b2-1234-7000-8000-000000000302',
        replayed: false,
      },
    });
    expect(changeDisplayName).toHaveBeenCalledOnce();
    expect(changeDisplayName.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'CHANGE_DISPLAY_NAME',
      idempotencyKey: 'display-name-test-1',
      aggregateId: userId,
      expectedVersion: 1,
      correlationId: '0199a1b2-1234-7000-8000-000000000303',
      payload: { displayName: 'Номер Один' },
    });
  });

  it('answers allowed browser preflight requests without reaching a route', async () => {
    const app = await buildApp({ allowedOrigins: ['http://localhost:8081'] });
    apps.push(app);

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/me',
      headers: { origin: 'http://localhost:8081' },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8081');
  });

  it('returns the authenticated pilot Community with action-level denials', async () => {
    const context: CommunityContextProjection = {
      venue: {
        venueId: '0199a1b2-1234-7000-8000-000000000401',
        displayName: 'Pilot Gym',
        address: 'Pilot address',
        cityCode: 'MOSCOW',
        timezone: 'Europe/Moscow',
        minimumBookingNoticeHours: 8,
        slotPublishHorizonDays: 30,
        contactPayload: { phone: '+79990000401' },
      },
      community: {
        communityId: '0199a1b2-1234-7000-8000-000000000402',
        name: 'Pilot Community',
        state: 'ACTIVE',
        pairCooldownDays: 15,
        noShowGraceMinutes: 15,
        rulesetRef: 'MOLOKH_RECOMMENDED_V1',
        rulesetAckMode: 'IMPLICIT_ON_ACCEPT',
        version: 1,
      },
      membership: {
        membershipId: '0199a1b2-1234-7000-8000-000000000403',
        state: 'ACTIVE',
        ageDivision: 'ADULT',
        competitionEnabled: true,
        joinPath: 'QR',
      },
      activeRoleGrants: [],
      access: {
        capabilities: ['VIEW_COMMUNITY'],
        denials: [
          {
            capability: 'CREATE_OFFICIAL_CHALLENGE',
            code: 'ACCOUNT_NOT_VERIFIED',
            messageKey: 'community.account_not_verified',
            retryable: true,
          },
        ],
      },
    };
    const app = await buildApp({
      community: {
        auth: new StaticBearerAuthAdapter(token, userId),
        readContext: async () => context,
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me/community',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        community: { name: 'Pilot Community' },
        membership: { state: 'ACTIVE' },
        access: {
          denials: [
            {
              capability: 'CREATE_OFFICIAL_CHALLENGE',
              code: 'ACCOUNT_NOT_VERIFIED',
            },
          ],
        },
      },
    });
    await app.ready();
    expect(app.swagger().paths).toHaveProperty('/api/v1/me/community');
  });

  it('runs the no-document Athlete-to-Central verification workflow', async () => {
    const centralUserId = '0199a1b2-1234-7000-8000-000000000601';
    const centralToken = 'molokh-central-test-token';
    const pendingIdentity: IdentityProjection = {
      ...identity,
      accountVerificationState: 'PENDING',
    };
    const verifiedIdentity: IdentityProjection = {
      ...identity,
      accountVerificationState: 'VERIFIED',
      capabilities: [...identity.capabilities, 'ACCOUNT_VERIFIED'],
      capabilityDenials: [],
    };
    const start = vi.fn(async (
      _command: CommandEnvelope<StartVerificationPayload>,
      _ids: IdentityEffectIds,
    ) => ({
      responseStatus: 201,
      response: pendingIdentity,
      eventId: '0199a1b2-1234-7000-8000-000000000602',
      aggregateVersion: 1,
      replayed: false,
    }));
    const approve = vi.fn(async (
      _command: CommandEnvelope<ApproveVerificationPayload>,
      _ids: IdentityEffectIds,
    ) => ({
      responseStatus: 200,
      response: verifiedIdentity,
      eventId: '0199a1b2-1234-7000-8000-000000000603',
      aggregateVersion: 2,
      replayed: false,
    }));
    const listPending = vi.fn(async () => [
      {
        verificationId: '0199a1b2-1234-7000-8000-000000000604',
        userId,
        displayName: identity.displayName,
        ageDivision: identity.ageDivision,
        moderationChecklistVersion: 'identity-mvp-v1',
        createdAt: '2026-09-06T09:00:00.000Z',
        version: 1,
      },
    ] as const);
    const app = await buildApp({
      verification: {
        athleteAuth: new StaticBearerAuthAdapter(token, userId),
        centralAuth: new StaticBearerAuthAdapter(centralToken, centralUserId),
        start,
        approve,
        listPending,
      },
    });
    apps.push(app);

    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/me/verification',
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'start-verification-test-1',
      },
    });
    expect(started.statusCode).toBe(201);
    expect(started.json()).toMatchObject({
      data: { accountVerificationState: 'PENDING' },
      meta: { replayed: false },
    });
    expect(start.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'START_VERIFICATION',
      aggregateType: 'AccountVerification',
      expectedVersion: 0,
      payload: {
        userId,
        moderationChecklistVersion: 'identity-mvp-v1',
      },
    });
    const startedReplay = await app.inject({
      method: 'POST',
      url: '/api/v1/me/verification',
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'start-verification-test-1',
      },
    });
    expect(startedReplay.statusCode).toBe(201);
    expect(start.mock.calls[1]?.[0].aggregateId).toBe(
      start.mock.calls[0]?.[0].aggregateId,
    );

    const deniedQueue = await app.inject({
      method: 'GET',
      url: '/api/v1/central/verifications',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deniedQueue.statusCode).toBe(401);
    const queue = await app.inject({
      method: 'GET',
      url: '/api/v1/central/verifications',
      headers: { authorization: `Bearer ${centralToken}` },
    });
    expect(queue.statusCode).toBe(200);
    expect(queue.json().data).toHaveLength(1);

    const approved = await app.inject({
      method: 'POST',
      url: '/api/v1/central/verifications/0199a1b2-1234-7000-8000-000000000604/approve',
      headers: {
        authorization: `Bearer ${centralToken}`,
        'idempotency-key': 'approve-verification-test-1',
        'if-match': '1',
      },
      payload: {
        userId,
        moderationChecklistVersion: 'identity-mvp-v1',
      },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      data: { accountVerificationState: 'VERIFIED' },
    });
    expect(approve.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'APPROVE_VERIFICATION',
      aggregateId: '0199a1b2-1234-7000-8000-000000000604',
      expectedVersion: 1,
      source: 'admin',
      actor: { id: centralUserId, roles: ['CENTRAL_ADMIN'] },
    });
  });

  it('invites a verified Coach and lets only that account accept', async () => {
    const centralUserId = '0199a1b2-1234-7000-8000-000000000701';
    const coachUserId = '0199a1b2-1234-7000-8000-000000000702';
    const communityId = '0199a1b2-1234-7000-8000-000000000703';
    const grantId = '0199a1b2-1234-7000-8000-000000000704';
    const centralToken = 'molokh-role-central-test-token';
    const coachToken = 'molokh-role-coach-test-token';
    const pending: RoleGrantProjection = {
      grantId,
      userId: coachUserId,
      role: 'COACH',
      scopeType: 'COMMUNITY',
      scopeId: communityId,
      state: 'PENDING',
      authorizedBy: centralUserId,
      authorizedAt: null,
      expiresAt: '2026-09-09T12:00:00.000Z',
      version: 1,
    };
    const active: RoleGrantProjection = {
      ...pending,
      state: 'ACTIVE',
      authorizedAt: '2026-09-06T12:05:00.000Z',
      expiresAt: null,
      version: 2,
    };
    const inviteCoach = vi.fn(async (
      _command: CommandEnvelope<InviteCoachPayload>,
      _ids: RoleGrantEffectIds,
    ) => ({
      responseStatus: 201,
      response: pending,
      eventId: '0199a1b2-1234-7000-8000-000000000705',
      aggregateVersion: 1,
      replayed: false,
    }));
    const acceptCoachInvite = vi.fn(async (
      _command: CommandEnvelope<AcceptCoachInvitePayload>,
      _ids: RoleGrantEffectIds,
    ) => ({
      responseStatus: 200,
      response: active,
      eventId: '0199a1b2-1234-7000-8000-000000000706',
      aggregateVersion: 2,
      replayed: false,
    }));
    const app = await buildApp({
      roles: {
        operatorAuth: new StaticBearerAuthAdapter(centralToken, centralUserId),
        userAuth: new StaticBearerAuthAdapter(coachToken, coachUserId),
        inviteCoach,
        acceptCoachInvite,
        listPendingCoachInvites: async () => [pending],
      },
    });
    apps.push(app);

    const denied = await app.inject({
      method: 'POST',
      url: `/api/v1/communities/${communityId}/coach-invites`,
      payload: { userId: coachUserId, reasonCode: 'PILOT_COACH' },
    });
    expect(denied.statusCode).toBe(401);

    const inviteRequest = {
      method: 'POST' as const,
      url: `/api/v1/communities/${communityId}/coach-invites`,
      headers: {
        authorization: `Bearer ${centralToken}`,
        'idempotency-key': 'coach-invite-test-1',
      },
      payload: { userId: coachUserId, reasonCode: 'PILOT_COACH' },
    };
    const invited = await app.inject(inviteRequest);
    const invitedReplay = await app.inject(inviteRequest);
    expect(invited.statusCode).toBe(201);
    expect(invited.json()).toMatchObject({ data: { state: 'PENDING', role: 'COACH' } });
    expect(invitedReplay.statusCode).toBe(201);
    expect(inviteCoach.mock.calls[1]?.[0].aggregateId).toBe(
      inviteCoach.mock.calls[0]?.[0].aggregateId,
    );
    expect(inviteCoach.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'INVITE_COACH',
      expectedVersion: 0,
      payload: {
        userId: coachUserId,
        communityId,
        reasonCode: 'PILOT_COACH',
        invitationTtlHours: 72,
      },
    });

    const queue = await app.inject({
      method: 'GET',
      url: '/api/v1/me/coach-invites',
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(queue.statusCode).toBe(200);
    expect(queue.json().data).toEqual([pending]);

    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/me/coach-invites/${grantId}/accept`,
      headers: {
        authorization: `Bearer ${coachToken}`,
        'idempotency-key': 'coach-accept-test-1',
        'if-match': '1',
      },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ data: { state: 'ACTIVE', version: 2 } });
    expect(acceptCoachInvite.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'ACCEPT_COACH_ROLE',
      aggregateId: grantId,
      expectedVersion: 1,
      actor: { id: coachUserId },
      payload: { userId: coachUserId },
    });

    const unsupported = await app.inject({
      method: 'POST',
      url: `/api/v1/me/coach-invites/${grantId}/accept`,
      headers: {
        authorization: `Bearer ${coachToken}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: 'unused=true',
    });
    expect(unsupported.statusCode).toBe(415);
    expect(unsupported.json()).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
  });
});
