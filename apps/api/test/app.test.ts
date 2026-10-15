import {
  CommunityConfigurationConflictError,
  IdempotencyKeyReusedError,
  SchedulingConflictError,
  VersionConflictError,
  type CommandEnvelope,
  type IdentityProjection,
  type RoleGrantProjection,
} from '@molokh/core';
import type {
  ChangeDisplayNamePayload,
  ChangeHomeVenuePayload,
  ChangeSportsPayload,
  CommunityContextProjection,
  CommunityConfigurationEffectIds,
  CommunityConfigurationProjection,
  CommunityLifecycleEffectIds,
  CommunityLifecycleProjection,
  DiscoveryCardProjection,
  IdentityEffectIds,
  HomeVenueSelectionProjection,
  ApproveVerificationPayload,
  AcceptCoachInvitePayload,
  AppointGymAdminPayload,
  AuthorizeGuestCoachPayload,
  BlockActionProjection,
  BlockEffectIds,
  BlockProjection,
  BlockUserPayload,
  ChangePrimaryAdminPayload,
  ChatMessagePage,
  ChatMessageProjection,
  CentralModerationCaseProjection,
  DiscoveryActionProjection,
  CreateLikePayload,
  StartVerificationPayload,
  InviteCoachPayload,
  RoleGrantEffectIds,
  PrimaryAdminEffectIds,
  PrimaryAdminProjection,
  MatchProjection,
  LikeEffectIds,
  SkipDiscoveryPayload,
  SkipEffectIds,
  UnblockActionProjection,
  UnblockEffectIds,
  UnblockUserPayload,
  UnmatchEffectIds,
  UnmatchPayload,
  UnmatchProjection,
  ExecutedCommand,
  EditChatMessageEffectIds,
  EditChatMessagePayload,
  HiddenMessageProjection,
  HideChatMessageEffectIds,
  HideChatMessagePayload,
  ReportChatMessageEffectIds,
  ReportChatMessagePayload,
  ReportedMessageProjection,
  SendChatMessageEffectIds,
  SendChatMessagePayload,
  BookingIntentProjection,
  BookingWithdrawalEffectIds,
  BookingOfficialConversionEffectIds,
  BookingOfficialConversionProjection,
  BookingSoloContinuationEffectIds,
  BookingSoloContinuationProjection,
  BookingTrainingRetentionEffectIds,
  BookingTrainingRetentionProjection,
  DecideBookingOfficialConversionPayload,
  DecideBookingSoloContinuationPayload,
  DecideBookingTrainingRetentionPayload,
  ConfirmBookingHostPayload,
  ConfirmGroupPlanPayload,
  GroupOfferingProjection,
  GroupPlanProjection,
  GroupPlanOfficialConversionEffectIds,
  GroupPlanOfficialConversionProjection,
  RequestGroupPlanOfficialConversionPayload,
  DecideGroupPlanOfficialConversionPayload,
  HostConfirmationEffectIds,
  HostConfirmationProjection,
  HostRejectionEffectIds,
  HostRejectionProjection,
  PairIntentNotificationEffectIds,
  ProposeGroupPlanPayload,
  PublishGroupOfferingPayload,
  PublishSlotPayload,
  RejectBookingHostPayload,
  SchedulingEffectIds,
  SelectSameSlotPayload,
  SelectSlotPayload,
  SessionLifecycleProjection,
  SessionEffectIds,
  StartSessionPayload,
  RecordAttendancePayload,
  RequestBookingOfficialConversionPayload,
  RequestTrainingParticipantCancellationPayload,
  EndSessionPayload,
  ReplaceSessionCoachPayload,
  CancelAfterCoachReplacementPayload,
  CancelOfficialSessionByAthletePayload,
  FailSessionExternalPayload,
  SlotProjection,
  TrainingOptionsProjection,
  UpdateGroupOfferingPayload,
  UpdateSlotPayload,
  VenueAdminDashboardProjection,
  WithdrawGroupOfferingPayload,
  WithdrawBookingRequestPayload,
  WithdrawSlotPayload,
  ChallengeProjection,
  ChatChallengeProjection,
  AthleteChallengeRescheduleEffectIds,
  ConfirmMutualChallengeRescheduleEffectIds,
  ConfirmMutualChallengeReschedulePayload,
  MutualChallengeRescheduleRequestProjection,
  ProposeMutualChallengeRescheduleEffectIds,
  ProposeMutualChallengeReschedulePayload,
  RescheduleChallengeByAthletePayload,
  PauseCommunityPayload,
  ReactivateCommunityPayload,
  CommunityClosureCommandPreparation,
  CommunityClosureProjection,
  FinalizeCommunityClosureEffectIds,
  FinalizeCommunityClosurePayload,
  ScheduleCommunityClosureEffectIds,
  ScheduleCommunityClosurePayload,
  ChangeCommunityPairCooldownPayload,
} from '@molokh/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { StaticBearerAuthAdapter } from '../src/auth.js';
import type { AvatarMediaPort } from '../src/avatar-media.js';
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
  it('separates process liveness from dependency readiness', async () => {
    const readiness = vi.fn().mockResolvedValue(true);
    const app = await buildApp({ readiness });
    apps.push(app);

    const live = await app.inject({ method: 'GET', url: '/health/live' });
    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(live.statusCode).toBe(200);
    expect(response.statusCode).toBe(200);
    expect(readiness).toHaveBeenCalledOnce();
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'molokh-api',
      contractVersion: 1,
    });

    const unavailableApp = await buildApp({
      readiness: vi.fn().mockResolvedValue(false),
    });
    apps.push(unavailableApp);
    const unavailable = await unavailableApp.inject({
      method: 'GET',
      url: '/health/ready',
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toMatchObject({ code: 'SERVICE_NOT_READY' });
  });

  it('publishes the immutable release identity used by canary verification', async () => {
    const releaseSha = 'a'.repeat(40);
    const app = await buildApp({ releaseSha });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/v1/meta/runtime' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      architecture: 'modular-monolith',
      apiTransport: 'https+sse',
      clients: ['web', 'ios', 'android'],
      database: 'postgresql-18',
      releaseSha,
    });
  });

  it('publishes an OpenAPI 3.1 document', async () => {
    const app = await buildApp();
    apps.push(app);
    await app.ready();

    const document = app.swagger();

    expect('openapi' in document ? document.openapi : undefined).toBe('3.1.0');
    expect(document.paths).toHaveProperty('/health/live');
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
    expect(mapApiError(
      new CommunityConfigurationConflictError('COMMUNITY_CONFIGURATION_ADMIN_REQUIRED'),
      requestId,
    )).toMatchObject({
      statusCode: 403,
      body: { code: 'COMMUNITY_CONFIGURATION_ADMIN_REQUIRED', requestId },
    });
    expect(mapApiError(
      new CommunityConfigurationConflictError('PAIR_COOLDOWN_OUT_OF_RANGE'),
      requestId,
    )).toMatchObject({
      statusCode: 422,
      body: { code: 'PAIR_COOLDOWN_OUT_OF_RANGE', requestId },
    });
  });

  it('protects and returns the public identity projection', async () => {
    const app = await buildApp({
      identity: {
        auth: new StaticBearerAuthAdapter(token, userId),
        readMe: async () => identity,
        changeDisplayName: vi.fn(),
        changeSports: vi.fn(),
        readHomeVenueSettings: vi.fn(),
        changeHomeVenue: vi.fn(),
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
        changeSports: vi.fn(),
        readHomeVenueSettings: vi.fn(),
        changeHomeVenue: vi.fn(),
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

  it('passes an idempotent, versioned sports command to the identity module', async () => {
    const changed: IdentityProjection = {
      ...identity,
      primarySport: 'RUNNING',
      secondarySport: 'BOXING',
      version: 2,
    };
    const changeSports = vi.fn(async (
      _command: CommandEnvelope<ChangeSportsPayload>,
      _ids: IdentityEffectIds,
    ) => ({
      responseStatus: 200,
      response: changed,
      eventId: '0199a1b2-1234-7000-8000-000000000312',
      aggregateVersion: 2,
      replayed: false,
    }));
    const app = await buildApp({
      identity: {
        auth: new StaticBearerAuthAdapter(token, userId),
        readMe: async () => identity,
        changeDisplayName: vi.fn(),
        changeSports,
        readHomeVenueSettings: vi.fn(),
        changeHomeVenue: vi.fn(),
      },
    });
    apps.push(app);

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me/sports',
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'sports-test-1',
        'if-match': '1',
      },
      payload: { primarySport: 'RUNNING', secondarySport: 'BOXING' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: { primarySport: 'RUNNING', secondarySport: 'BOXING', version: 2 },
      meta: { eventId: '0199a1b2-1234-7000-8000-000000000312' },
    });
    expect(changeSports.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'CHANGE_SPORTS',
      idempotencyKey: 'sports-test-1',
      aggregateId: userId,
      expectedVersion: 1,
      payload: { primarySport: 'RUNNING', secondarySport: 'BOXING' },
    });
  });

  it('[AC-017] reads and changes Home Venue through a versioned command', async () => {
    const venueId = '0199a1b2-1234-7000-8000-000000000320';
    const readHomeVenueSettings = vi.fn(async () => ({
      homeVenueId: null, userVersion: 1, options: [{ venueId,
        displayName: 'Новый зал', address: 'Москва, улица 1', cityCode: 'MOSCOW' }],
    }));
    const changeHomeVenue = vi.fn(async (
      _command: CommandEnvelope<ChangeHomeVenuePayload>, _ids: IdentityEffectIds,
    ): Promise<ExecutedCommand<HomeVenueSelectionProjection>> => ({
      responseStatus: 200,
      response: { homeVenueId: venueId, venueDisplayName: 'Новый зал', version: 2 },
      eventId: '0199a1b2-1234-7000-8000-000000000321',
      aggregateVersion: 2, replayed: false,
    }));
    const app = await buildApp({ identity: {
      auth: new StaticBearerAuthAdapter(token, userId), readMe: async () => identity,
      changeDisplayName: vi.fn(), changeSports: vi.fn(), readHomeVenueSettings,
      changeHomeVenue,
    } });
    apps.push(app);
    const settings = await app.inject({ method: 'GET', url: '/api/v1/me/home-venue',
      headers: { authorization: `Bearer ${token}` } });
    expect(settings.statusCode).toBe(200);
    expect(settings.json()).toMatchObject({ data: { homeVenueId: null, userVersion: 1,
      options: [{ venueId, displayName: 'Новый зал' }] } });

    const changed = await app.inject({ method: 'PATCH', url: '/api/v1/me/home-venue',
      headers: { authorization: `Bearer ${token}`,
        'idempotency-key': 'home-venue-test-1', 'if-match': '1' },
      payload: { venueId } });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({ data: { homeVenueId: venueId,
      venueDisplayName: 'Новый зал', version: 2 } });
    expect(changeHomeVenue.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'CHANGE_HOME_VENUE', aggregateId: userId, expectedVersion: 1,
      payload: { venueId },
    });
  });

  it('keeps avatar upload disabled unless a private scan adapter is configured', async () => {
    const baseIdentity = {
      auth: new StaticBearerAuthAdapter(token, userId), readMe: async () => identity,
      changeDisplayName: vi.fn(), changeSports: vi.fn(),
      readHomeVenueSettings: vi.fn(), changeHomeVenue: vi.fn(),
    };
    const disabledApp = await buildApp({ identity: baseIdentity });
    apps.push(disabledApp);
    const payload = { mimeType: 'image/jpeg', sizeBytes: 1024, sha256: 'a'.repeat(64) };
    const disabled = await disabledApp.inject({ method: 'POST',
      url: '/api/v1/me/avatar-uploads', headers: { authorization: `Bearer ${token}`,
        'idempotency-key': 'avatar-upload-disabled-1' }, payload });
    expect(disabled.statusCode).toBe(503);
    expect(disabled.json()).toMatchObject({ code: 'FEATURE_NOT_AVAILABLE' });

    const beginUpload = vi.fn<AvatarMediaPort['beginUpload']>(async () => ({
      assetId: '0199a1b2-1234-7000-8000-000000000399', state: 'PENDING_UPLOAD',
      uploadUrl: 'https://private-objects.example/upload/opaque',
      expiresAt: '2026-10-04T11:00:00.000Z',
      requiredHeaders: { 'content-type': 'image/jpeg' },
      scanPolicyVersion: 'avatar-scan-v1',
    }));
    const enabledApp = await buildApp({ identity: { ...baseIdentity,
      avatarMedia: { beginUpload } } });
    apps.push(enabledApp);
    const enabled = await enabledApp.inject({ method: 'POST',
      url: '/api/v1/me/avatar-uploads', headers: { authorization: `Bearer ${token}`,
        'idempotency-key': 'avatar-upload-enabled-1' }, payload });
    expect(enabled.statusCode).toBe(201);
    expect(enabled.json()).toMatchObject({ data: { state: 'PENDING_UPLOAD',
      scanPolicyVersion: 'avatar-scan-v1' } });
    expect(beginUpload).toHaveBeenCalledWith({ userId,
      idempotencyKey: 'avatar-upload-enabled-1', ...payload });
    const invalid = await enabledApp.inject({ method: 'POST',
      url: '/api/v1/me/avatar-uploads', headers: { authorization: `Bearer ${token}`,
        'idempotency-key': 'avatar-upload-invalid-1' },
      payload: { ...payload, mimeType: 'image/gif' } });
    expect(invalid.statusCode).toBe(400);
    expect(beginUpload).toHaveBeenCalledOnce();
  });

  it('answers allowed browser preflight requests without reaching a route', async () => {
    const app = await buildApp({ allowedOrigins: ['http://localhost:8081'] });
    apps.push(app);

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/me',
      headers: {
        origin: 'http://localhost:8081',
        'access-control-request-method': 'PATCH',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8081');
    expect(response.headers['access-control-allow-headers']).toContain('X-Causation-Id');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('[AC-166] returns public config and exposes a versioned scoped Pair Cooldown command', async () => {
    const communityId = '0199a1b2-1234-7000-8000-000000000402';
    const venueId = '0199a1b2-1234-7000-8000-000000000401';
    const context: CommunityContextProjection = {
      venue: {
        venueId,
        displayName: 'Pilot Gym',
        address: 'Pilot address',
        cityCode: 'MOSCOW',
        timezone: 'Europe/Moscow',
        minimumBookingNoticeHours: 8,
        slotPublishHorizonDays: 30,
        contactPayload: { phone: '+79990000401' },
      },
      community: {
        communityId,
        name: 'Pilot Community',
        state: 'ACTIVE',
        configurationId: '0199a1b2-1234-7000-8000-000000000404',
        configurationVersion: 1,
        configurationEffectiveAt: '2026-10-01T09:00:00.000Z',
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
        version: 1,
      },
      membershipReapplyNotBeforeAt: null,
      membershipLatestRejectionReasonCode: null,
      activeRoleGrants: [{ role: 'GYM_ADMIN', scopeType: 'VENUE', scopeId: venueId }],
      access: {
        capabilities: ['VIEW_COMMUNITY', 'MANAGE_VENUE_OPERATIONS'],
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
    const changedConfiguration: CommunityConfigurationProjection = {
      communityId,
      configurationId: '0199a1b2-1234-7000-8000-000000000405',
      configurationVersion: 2,
      pairCooldownDays: 20,
      noShowGraceMinutes: 15,
      rulesetRef: 'MOLOKH_RECOMMENDED_V1',
      rulesetAckMode: 'IMPLICIT_ON_ACCEPT',
      effectiveAt: '2026-10-02T09:00:00.000Z',
      version: 2,
    };
    const updatePairCooldown = vi.fn(async (
      _command: CommandEnvelope<ChangeCommunityPairCooldownPayload>,
      _ids: CommunityConfigurationEffectIds,
    ) => ({
      responseStatus: 200, response: changedConfiguration,
      eventId: '0199a1b2-1234-7000-8000-000000000406',
      aggregateVersion: 2, replayed: false,
    }));
    const app = await buildApp({
      community: {
        auth: new StaticBearerAuthAdapter(token, userId),
        readContext: async () => context,
        configuration: { updatePairCooldown },
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
        community: {
          name: 'Pilot Community', configurationVersion: 1, pairCooldownDays: 15,
        },
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
    const changed = await app.inject({
      method: 'POST',
      url: `/api/v1/communities/${communityId}/configuration/pair-cooldown`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'community-cooldown-20',
        'if-match': '1',
      },
      payload: { pairCooldownDays: 20 },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({
      data: { configurationVersion: 2, pairCooldownDays: 20, version: 2 },
      meta: { replayed: false },
    });
    expect(updatePairCooldown.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'CHANGE_COMMUNITY_PAIR_COOLDOWN',
      aggregateType: 'Community', aggregateId: communityId, expectedVersion: 1,
      actor: { id: userId, roles: ['GYM_ADMIN'], scopeIds: [venueId] },
      payload: { communityId, pairCooldownDays: 20 },
    });
    expect(updatePairCooldown.mock.calls[0]?.[1]).toMatchObject({
      configurationId: expect.any(String), eventId: expect.any(String),
      auditId: expect.any(String), outboxMessageId: expect.any(String),
    });
    const outOfRange = await app.inject({
      method: 'POST',
      url: `/api/v1/communities/${communityId}/configuration/pair-cooldown`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'community-cooldown-invalid',
        'if-match': '2',
      },
      payload: { pairCooldownDays: 31 },
    });
    expect(outOfRange.statusCode).toBe(400);
    expect(updatePairCooldown).toHaveBeenCalledTimes(1);
    await app.ready();
    expect(app.swagger().paths).toHaveProperty('/api/v1/me/community');
    expect(app.swagger().paths).toHaveProperty(
      '/api/v1/communities/{communityId}/configuration/pair-cooldown',
    );
  });

  it('[CO-02][CO-03] exposes versioned Central Community lifecycle commands', async () => {
    const communityId = '0199a1b2-1234-7000-8000-000000000402';
    const active: CommunityLifecycleProjection = {
      communityId,
      state: 'ACTIVE',
      pauseStartedAt: null,
      latestPauseDurationSeconds: null,
      version: 7,
      competitions: [{
        competitionId: '0199a1b2-1234-7000-8000-000000000404',
        availability: 'ACTIVE',
        version: 3,
      }],
    };
    const paused: CommunityLifecycleProjection = {
      ...active,
      state: 'PAUSED',
      pauseStartedAt: '2026-10-01T10:00:00.000Z',
      version: 8,
      competitions: active.competitions.map((competition) => ({
        ...competition, availability: 'PAUSED', version: 4,
      })),
    };
    const pause = vi.fn(async (
      _command: CommandEnvelope<PauseCommunityPayload>,
      _ids: CommunityLifecycleEffectIds,
    ) => ({
      responseStatus: 200, response: paused,
      eventId: '0199a1b2-1234-7000-8000-000000000405',
      aggregateVersion: 8, replayed: false,
    }));
    const reactivate = vi.fn(async (
      _command: CommandEnvelope<ReactivateCommunityPayload>,
      _ids: CommunityLifecycleEffectIds,
    ) => ({
      responseStatus: 200, response: active,
      eventId: '0199a1b2-1234-7000-8000-000000000406',
      aggregateVersion: 9, replayed: false,
    }));
    const preparation: CommunityClosureCommandPreparation = {
      sessions: [{
        sessionId: '0199a1b2-1234-7000-8000-000000000407',
        state: 'SCHEDULED', scheduledStartAt: '2026-10-05T10:00:00.000Z',
        scheduledEndAt: '2026-10-05T11:00:00.000Z',
        athleteDisplayNames: ['Анна', 'Марина'],
        recommendedDisposition: 'RETAIN_TO_COMPLETION', cancellationAllowed: true,
      }],
      competitionCount: 1, liveChallengeCount: 2, memberCount: 2, statusHolderCount: 1,
    };
    const closurePlan: CommunityClosureProjection = {
      planId: '0199a1b2-1234-7000-8000-000000000408', communityId,
      planVersion: 1, planState: 'SCHEDULED', communityState: 'CLOSING',
      category: 'VENUE_EXIT', reason: 'Зал прекращает работу', emergency: false,
      effectiveAt: '2026-10-10T10:00:00.000Z', scheduledAt: '2026-10-01T10:00:00.000Z',
      finalizedAt: null, retainedSessionCount: 1, cancelledSessionCount: 0,
      communityVersion: 8,
    };
    const schedule = vi.fn(async (
      _command: CommandEnvelope<ScheduleCommunityClosurePayload>,
      _ids: ScheduleCommunityClosureEffectIds,
    ) => ({
      responseStatus: 200, response: closurePlan,
      eventId: '0199a1b2-1234-7000-8000-000000000409',
      aggregateVersion: 8, replayed: false,
    }));
    const finalize = vi.fn(async (
      _command: CommandEnvelope<FinalizeCommunityClosurePayload>,
      _ids: FinalizeCommunityClosureEffectIds,
    ) => ({
      responseStatus: 200,
      response: { ...closurePlan, planState: 'FINALIZED' as const,
        communityState: 'CLOSED' as const, finalizedAt: '2026-10-10T10:01:00.000Z',
        communityVersion: 9 },
      eventId: '0199a1b2-1234-7000-8000-000000000410',
      aggregateVersion: 9, replayed: false,
    }));
    const app = await buildApp({
      community: {
        auth: new StaticBearerAuthAdapter(token, userId),
        readContext: async () => null,
        lifecycle: {
          auth: new StaticBearerAuthAdapter(token, userId),
          read: async () => active,
          pause,
          reactivate,
          closure: {
            read: async () => closurePlan,
            prepare: async () => preparation,
            schedule,
            finalize,
          },
        },
      },
    });
    apps.push(app);

    const read = await app.inject({
      method: 'GET',
      url: `/api/v1/central/communities/${communityId}/lifecycle`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({ data: active });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/central/communities/${communityId}/pause`,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': 'pause-community-test',
        'if-match': '7',
      },
      payload: { reason: 'Плановые работы' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: paused, meta: { replayed: false } });
    expect(pause).toHaveBeenCalledOnce();
    expect(pause.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'PAUSE_COMMUNITY', expectedVersion: 7,
      actor: { id: userId, roles: ['CENTRAL_ADMIN'] },
      payload: { communityId, reason: 'Плановые работы' },
    });
    expect(pause.mock.calls[0]?.[1].competitionEventIds).toHaveLength(1);

    const candidates = await app.inject({
      method: 'GET',
      url: `/api/v1/central/communities/${communityId}/closure/candidates`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(candidates.statusCode).toBe(200);
    expect(candidates.json()).toMatchObject({ data: preparation.sessions });

    const scheduleResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/central/communities/${communityId}/closure/schedule`,
      headers: {
        authorization: `Bearer ${token}`, 'content-type': 'application/json',
        'idempotency-key': 'schedule-community-closure-test', 'if-match': '7',
      },
      payload: {
        category: 'VENUE_EXIT', reason: 'Зал прекращает работу', emergency: false,
        effectiveAt: '2026-10-10T10:00:00.000Z',
        sessionDispositions: [{
          sessionId: preparation.sessions[0]!.sessionId,
          disposition: 'RETAIN_TO_COMPLETION',
        }],
      },
    });
    expect(scheduleResponse.statusCode).toBe(200);
    expect(scheduleResponse.json()).toMatchObject({ data: closurePlan });
    expect(schedule).toHaveBeenCalledOnce();
    expect(schedule.mock.calls[0]?.[1]).toMatchObject({
      notificationIds: expect.arrayContaining([expect.any(String), expect.any(String)]),
      competitionEventIds: [expect.any(String)],
      challengeEventIds: expect.arrayContaining([expect.any(String), expect.any(String)]),
      sessionEventIds: [expect.any(String)],
    });

    const finalizeResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/central/communities/${communityId}/closure/finalize`,
      headers: {
        authorization: `Bearer ${token}`, 'content-type': 'application/json',
        'idempotency-key': 'finalize-community-closure-test', 'if-match': '8',
      },
      payload: { planId: closurePlan.planId, reason: 'Closure Plan completed' },
    });
    expect(finalizeResponse.statusCode).toBe(200);
    expect(finalize).toHaveBeenCalledOnce();
    expect(finalize.mock.calls[0]?.[1].statusDispositionIds).toHaveLength(1);
    await app.ready();
    expect(app.swagger().paths).toHaveProperty('/api/v1/central/communities/{communityId}/pause');
    expect(app.swagger().paths).toHaveProperty('/api/v1/central/communities/{communityId}/reactivate');
    expect(app.swagger().paths).toHaveProperty(
      '/api/v1/central/communities/{communityId}/closure/schedule',
    );
    expect(app.swagger().paths).toHaveProperty(
      '/api/v1/central/communities/{communityId}/closure/finalize',
    );
  });

  it('returns transparent Discovery cards without exposing private rank buckets', async () => {
    const cards: DiscoveryCardProjection[] = [
      {
        candidateUserId: '0199a1b2-1234-7000-8000-000000000404',
        displayName: 'Марина Ринг',
        avatarAssetId: null,
        ageDivision: 'ADULT',
        primarySport: 'BOXING',
        secondarySport: 'FUNCTIONAL_TRAINING',
        experienceText: 'Бокс и функциональные тренировки.',
        homeVenue: {
          venueId: '0199a1b2-1234-7000-8000-000000000401',
          displayName: 'Pilot Gym',
        },
        geographyTier: 'WITHIN_RADIUS',
        inboundLike: true,
        sportOverlap: 'PRIMARY',
        distanceKm: 0,
        recentActivityBucket: 0,
        responseSpeedBucket: 0,
        rankingConfigVersion: 'discovery-mvp-v1',
        rankingReasons: [
          'WITHIN_RADIUS',
          'INBOUND_INTEREST',
          'PRIMARY_SPORT_OVERLAP',
        ],
      },
    ];
    const readCards = vi.fn(async () => cards);
    const matchedAt = '2026-09-06T12:00:00.000Z';
    const match: MatchProjection = {
      matchId: '0199a1b2-1234-7000-8000-000000000405',
      chatId: '0199a1b2-1234-7000-8000-000000000406',
      state: 'ACTIVE',
      counterpartUserId: cards[0]!.candidateUserId,
      counterpartDisplayName: cards[0]!.displayName,
      lastActivityAt: matchedAt,
      version: 1,
    };
    const createLike = vi.fn(async (
      _command: CommandEnvelope<CreateLikePayload>,
      _ids: LikeEffectIds,
    ): Promise<ExecutedCommand<DiscoveryActionProjection>> => ({
      responseStatus: 201,
      response: {
        action: 'MATCHED',
        like: {
          likeId: '0199a1b2-1234-7000-8000-000000000407',
          fromUserId: userId,
          toUserId: cards[0]!.candidateUserId,
          state: 'MATCHED',
          expiresAt: '2026-10-06T12:00:00.000Z',
          version: 1,
        },
        match,
        suppressionUntil: null,
      } satisfies DiscoveryActionProjection,
      eventId: '0199a1b2-1234-7000-8000-000000000408',
      aggregateVersion: 1,
      replayed: false,
    }));
    const skip = vi.fn(async (
      _command: CommandEnvelope<SkipDiscoveryPayload>,
      _ids: SkipEffectIds,
    ): Promise<ExecutedCommand<DiscoveryActionProjection>> => ({
      responseStatus: 201,
      response: {
        action: 'SKIPPED',
        like: null,
        match: null,
        suppressionUntil: '2026-09-21T12:00:00.000Z',
      } satisfies DiscoveryActionProjection,
      eventId: '0199a1b2-1234-7000-8000-000000000409',
      aggregateVersion: 1,
      replayed: false,
    }));
    const readMatches = vi.fn(async () => [match]);
    const preservation = {
      acceptedObligationsPreserved: true,
      statusPathsPreserved: true,
      optionalPreAcceptanceIntentsClosed: true,
    } as const;
    const unmatch = vi.fn(async (
      _command: CommandEnvelope<UnmatchPayload>,
      _ids: UnmatchEffectIds,
    ): Promise<ExecutedCommand<UnmatchProjection>> => ({
      responseStatus: 200,
      response: {
        action: 'UNMATCHED',
        matchId: match.matchId,
        matchState: 'UNMATCHED',
        chatId: match.chatId,
        chatState: 'CLOSED',
        suppressionUntil: '2026-09-21T12:00:00.000Z',
        version: 2,
        preservation,
      },
      eventId: '0199a1b2-1234-7000-8000-000000000410',
      aggregateVersion: 2,
      replayed: false,
    }));
    const blockProjection: BlockProjection = {
      blockId: '0199a1b2-1234-7000-8000-000000000411',
      blockedUserId: cards[0]!.candidateUserId,
      blockedDisplayName: cards[0]!.displayName,
      state: 'ACTIVE',
      reasonCode: null,
      createdAt: matchedAt,
      revokedAt: null,
      version: 1,
    };
    const block = vi.fn(async (
      _command: CommandEnvelope<BlockUserPayload>,
      _ids: BlockEffectIds,
    ): Promise<ExecutedCommand<BlockActionProjection>> => ({
      responseStatus: 201,
      response: {
        action: 'BLOCKED',
        block: blockProjection,
        affectedMatch: { matchId: match.matchId, state: 'BLOCKED', version: 2 },
        personalChatClosed: true,
        preservation,
      },
      eventId: '0199a1b2-1234-7000-8000-000000000412',
      aggregateVersion: 1,
      replayed: false,
    }));
    const readBlocks = vi.fn(async () => [blockProjection]);
    const readLatestBlock = vi.fn(async () => blockProjection);
    const unblock = vi.fn(async (
      _command: CommandEnvelope<UnblockUserPayload>,
      _ids: UnblockEffectIds,
    ): Promise<ExecutedCommand<UnblockActionProjection>> => ({
      responseStatus: 200,
      response: {
        action: 'UNBLOCKED',
        block: {
          ...blockProjection,
          state: 'REVOKED',
          revokedAt: '2026-09-07T12:00:00.000Z',
          version: 2,
        },
        oldMatchRestored: false,
      },
      eventId: '0199a1b2-1234-7000-8000-000000000413',
      aggregateVersion: 2,
      replayed: false,
    }));
    const app = await buildApp({
      discovery: {
        auth: new StaticBearerAuthAdapter(token, userId),
        readCards,
        createLike,
        skip,
        readMatches,
        unmatch,
        block,
        readBlocks,
        readLatestBlock,
        unblock,
      },
    });
    apps.push(app);

    const unauthorized = await app.inject({
      method: 'GET',
      url: '/api/v1/discovery/cards',
    });
    expect(unauthorized.statusCode).toBe(401);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/discovery/cards?limit=12',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(readCards).toHaveBeenCalledWith(userId, 12);
    expect(response.json()).toMatchObject({
      data: [
        {
          displayName: 'Марина Ринг',
          geographyTier: 'WITHIN_RADIUS',
          inboundLike: true,
          rankingReasons: [
            'WITHIN_RADIUS',
            'INBOUND_INTEREST',
            'PRIMARY_SPORT_OVERLAP',
          ],
        },
      ],
      meta: { rankingConfigVersion: 'discovery-mvp-v1' },
    });
    expect(response.json().data[0]).not.toHaveProperty('recentActivityBucket');
    expect(response.json().data[0]).not.toHaveProperty('responseSpeedBucket');

    const invalidLike = await app.inject({
      method: 'POST',
      url: `/api/v1/discovery/${cards[0]!.candidateUserId}/like`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'discovery-like-test-1',
      },
    });
    expect(invalidLike.statusCode).toBe(400);

    const liked = await app.inject({
      method: 'POST',
      url: `/api/v1/discovery/${cards[0]!.candidateUserId}/like`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'discovery-like-test-1',
        'if-match': '0',
      },
    });
    expect(liked.statusCode).toBe(201);
    expect(liked.json()).toMatchObject({
      data: { action: 'MATCHED', match: { chatId: match.chatId } },
      meta: { replayed: false },
    });
    expect(createLike.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'LIKE',
      aggregateType: 'Like',
      expectedVersion: 0,
      payload: { targetUserId: cards[0]!.candidateUserId, source: 'DISCOVERY' },
    });

    const skipped = await app.inject({
      method: 'POST',
      url: `/api/v1/discovery/${cards[0]!.candidateUserId}/skip`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'discovery-skip-test-1',
        'if-match': '0',
      },
    });
    expect(skipped.statusCode).toBe(201);
    expect(skipped.json()).toMatchObject({ data: { action: 'SKIPPED' } });

    const matches = await app.inject({
      method: 'GET',
      url: '/api/v1/matches',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(matches.statusCode).toBe(200);
    expect(matches.json()).toMatchObject({ data: [{ matchId: match.matchId }] });

    const unmatched = await app.inject({
      method: 'DELETE',
      url: `/api/v1/matches/${match.matchId}`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'match-unmatch-test-1',
        'if-match': '1',
      },
    });
    expect(unmatched.statusCode).toBe(200);
    expect(unmatched.json()).toMatchObject({
      data: {
        action: 'UNMATCHED',
        preservation: { acceptedObligationsPreserved: true, statusPathsPreserved: true },
      },
    });
    expect(unmatch.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'UNMATCH',
      aggregateType: 'Match',
      aggregateId: match.matchId,
      expectedVersion: 1,
    });

    const blocked = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${cards[0]!.candidateUserId}/block`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'user-block-test-1',
        'if-match': '0',
      },
    });
    expect(blocked.statusCode).toBe(201);
    expect(blocked.json()).toMatchObject({ data: { action: 'BLOCKED' } });

    const blocks = await app.inject({
      method: 'GET',
      url: '/api/v1/me/blocks',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(blocks.statusCode).toBe(200);
    expect(blocks.json()).toMatchObject({ data: [{ blockId: blockProjection.blockId }] });

    const unblocked = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${cards[0]!.candidateUserId}/block`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'user-unblock-test-1',
        'if-match': '1',
      },
    });
    expect(unblocked.statusCode).toBe(200);
    expect(unblocked.json()).toMatchObject({
      data: { action: 'UNBLOCKED', oldMatchRestored: false },
    });
    await app.ready();
    expect(app.swagger().paths).toHaveProperty('/api/v1/discovery/cards');
    expect(app.swagger().paths).toHaveProperty('/api/v1/discovery/{userId}/like');
    expect(app.swagger().paths).toHaveProperty('/api/v1/discovery/{userId}/skip');
    expect(app.swagger().paths).toHaveProperty('/api/v1/matches');
    expect(app.swagger().paths).toHaveProperty('/api/v1/matches/{matchId}');
    expect(app.swagger().paths).toHaveProperty('/api/v1/users/{userId}/block');
    expect(app.swagger().paths).toHaveProperty('/api/v1/me/blocks');
  });

  it('[AC-123][AC-193][AC-194] exposes neutral Chat reporting and a protected Central queue', async () => {
    const chatId = '0199a1b2-1234-7000-8000-000000000501';
    const messageId = '0199a1b2-1234-7000-8000-000000000502';
    const reportId = '0199a1b2-1234-7000-8000-000000000506';
    const caseId = '0199a1b2-1234-7000-8000-000000000508';
    const centralUserId = '0199a1b2-1234-7000-8000-000000000509';
    const centralToken = 'molokh-central-api-test-token';
    const message: ChatMessageProjection = {
      messageId,
      chatId,
      senderUserId: userId,
      senderDisplayName: 'Свободный атлет',
      payloadType: 'PERSONAL_TEXT',
      content: { kind: 'PERSONAL_TEXT', text: 'Пойдём тренироваться?' },
      state: 'ACTIVE',
      revisionNo: 1,
      edited: false,
      reported: false,
      createdAt: '2026-09-07T10:00:00.000Z',
      updatedAt: '2026-09-07T10:00:00.000Z',
      version: 1,
    };
    const readMessages = vi.fn(async (): Promise<ChatMessagePage> => ({
      messages: [message],
      chatState: 'OPEN',
      nextCursor: null,
    }));
    const sendMessage = vi.fn(async (
      _command: CommandEnvelope<SendChatMessagePayload>,
      _ids: SendChatMessageEffectIds,
    ): Promise<ExecutedCommand<ChatMessageProjection>> => ({
      responseStatus: 201,
      response: message,
      eventId: '0199a1b2-1234-7000-8000-000000000503',
      aggregateVersion: 1,
      replayed: false,
    }));
    const editMessage = vi.fn(async (
      _command: CommandEnvelope<EditChatMessagePayload>,
      _ids: EditChatMessageEffectIds,
    ): Promise<ExecutedCommand<ChatMessageProjection>> => ({
      responseStatus: 200,
      response: {
        ...message,
        content: { kind: 'PERSONAL_TEXT', text: 'Пойдём на групповую?' },
        revisionNo: 2,
        edited: true,
        version: 2,
      },
      eventId: '0199a1b2-1234-7000-8000-000000000504',
      aggregateVersion: 2,
      replayed: false,
    }));
    const hideMessage = vi.fn(async (
      _command: CommandEnvelope<HideChatMessagePayload>,
      _ids: HideChatMessageEffectIds,
    ): Promise<ExecutedCommand<HiddenMessageProjection>> => ({
      responseStatus: 200,
      response: {
        action: 'HIDDEN_FOR_USER',
        messageId,
        hiddenAt: '2026-09-07T10:05:00.000Z',
      },
      eventId: '0199a1b2-1234-7000-8000-000000000505',
      aggregateVersion: 1,
      replayed: false,
    }));
    const reportMessage = vi.fn(async (
      _command: CommandEnvelope<ReportChatMessagePayload>,
      _ids: ReportChatMessageEffectIds,
    ): Promise<ExecutedCommand<ReportedMessageProjection>> => ({
      responseStatus: 201,
      response: {
        action: 'REPORTED',
        messageId,
        reportId,
        state: 'PENDING_CENTRAL',
        caseId,
        caseState: 'SUBMITTED',
        reportedAt: '2026-09-07T10:06:00.000Z',
        version: 2,
      },
      eventId: '0199a1b2-1234-7000-8000-000000000507',
      aggregateVersion: 2,
      replayed: false,
    }));
    const moderationCase: CentralModerationCaseProjection = {
      caseId,
      caseType: 'REPORT',
      state: 'SUBMITTED',
      reportId,
      chatId,
      messageId,
      reporterUserId: userId,
      subjectUserId: '0199a1b2-1234-7000-8000-000000000510',
      reasonCode: 'ABUSE',
      evidenceSnapshot: { revisions: [{ revisionNo: 1 }] },
      submittedAt: '2026-09-07T10:06:00.000Z',
      version: 1,
    };
    const readModerationCases = vi.fn(async () => [moderationCase]);
    const app = await buildApp({
      chat: {
        auth: new StaticBearerAuthAdapter(token, userId),
        centralAuth: new StaticBearerAuthAdapter(centralToken, centralUserId),
        readMessages,
        sendMessage,
        editMessage,
        hideMessage,
        reportMessage,
        readModerationCases,
      },
    });
    apps.push(app);

    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/messages?limit=25`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toMatchObject({
      data: [{ messageId, content: { kind: 'PERSONAL_TEXT' } }],
      meta: { chatState: 'OPEN', nextCursor: null, viewerUserId: userId },
    });
    expect(readMessages).toHaveBeenCalledWith(chatId, userId, 25, null);

    const sent = await app.inject({
      method: 'POST',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'chat-send-api-1',
        'if-match': '0',
      },
      payload: { text: 'Пойдём тренироваться?' },
    });
    expect(sent.statusCode).toBe(201);
    expect(sendMessage.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'SEND_MESSAGE',
      expectedVersion: 0,
      payload: { chatId, content: { kind: 'PERSONAL_TEXT' } },
    });

    const edited = await app.inject({
      method: 'PATCH',
      url: `/api/v1/messages/${messageId}`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'chat-edit-api-1',
        'if-match': '1',
      },
      payload: { text: 'Пойдём на групповую?' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ data: { revisionNo: 2, edited: true } });

    const hidden = await app.inject({
      method: 'DELETE',
      url: `/api/v1/messages/${messageId}/visibility`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'chat-hide-api-1',
        'if-match': '0',
      },
    });
    expect(hidden.statusCode).toBe(200);
    expect(hidden.json()).toMatchObject({ data: { action: 'HIDDEN_FOR_USER' } });

    const reported = await app.inject({
      method: 'POST',
      url: `/api/v1/messages/${messageId}/reports`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'chat-report-api-1',
        'if-match': '1',
      },
      payload: { reasonCode: 'ABUSE' },
    });
    expect(reported.statusCode).toBe(201);
    expect(reported.json()).toMatchObject({
      data: { action: 'REPORTED', state: 'PENDING_CENTRAL', caseId, caseState: 'SUBMITTED' },
    });

    const protectedQueue = await app.inject({
      method: 'GET',
      url: '/api/v1/central/moderation-cases',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(protectedQueue.statusCode).toBe(401);
    const centralQueue = await app.inject({
      method: 'GET',
      url: '/api/v1/central/moderation-cases',
      headers: { authorization: `Bearer ${centralToken}` },
    });
    expect(centralQueue.statusCode).toBe(200);
    expect(centralQueue.json()).toMatchObject({
      data: [{ caseId, reporterUserId: userId, evidenceSnapshot: moderationCase.evidenceSnapshot }],
    });
    expect(readModerationCases).toHaveBeenCalledWith(centralUserId);

    await app.ready();
    expect(app.swagger().paths).toHaveProperty('/api/v1/chats/{chatId}/messages');
    expect(app.swagger().paths).toHaveProperty('/api/v1/messages/{messageId}');
    expect(app.swagger().paths).toHaveProperty('/api/v1/messages/{messageId}/visibility');
    expect(app.swagger().paths).toHaveProperty('/api/v1/messages/{messageId}/reports');
    expect(app.swagger().paths).toHaveProperty('/api/v1/central/moderation-cases');
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

  it('executes scoped Coach and Central Venue role commands', async () => {
    const centralUserId = '0199a1b2-1234-7000-8000-000000000701';
    const coachUserId = '0199a1b2-1234-7000-8000-000000000702';
    const communityId = '0199a1b2-1234-7000-8000-000000000703';
    const grantId = '0199a1b2-1234-7000-8000-000000000704';
    const venueId = '0199a1b2-1234-7000-8000-000000000707';
    const sessionId = '0199a1b2-1234-7000-8000-000000000712';
    const adminGrantId = '0199a1b2-1234-7000-8000-000000000708';
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
    const guest: RoleGrantProjection = {
      grantId: '0199a1b2-1234-7000-8000-000000000713',
      userId: coachUserId,
      role: 'COACH',
      scopeType: 'SESSION',
      scopeId: sessionId,
      state: 'ACTIVE',
      authorizedBy: centralUserId,
      authorizedAt: '2026-09-06T12:01:00.000Z',
      expiresAt: '2026-10-06T13:00:00.000Z',
      version: 1,
    };
    const admin: RoleGrantProjection = {
      grantId: adminGrantId,
      userId: coachUserId,
      role: 'GYM_ADMIN',
      scopeType: 'VENUE',
      scopeId: venueId,
      state: 'ACTIVE',
      authorizedBy: centralUserId,
      authorizedAt: '2026-09-06T12:10:00.000Z',
      expiresAt: null,
      version: 1,
    };
    const primary: PrimaryAdminProjection = {
      venueId,
      primaryGrantId: '0199a1b2-1234-7000-8000-000000000709',
      primaryAdminUserId: coachUserId,
      previousPrimaryAdminUserId: null,
      change: 'APPOINTED',
      version: 1,
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
    const authorizeGuestCoach = vi.fn(async (
      _command: CommandEnvelope<AuthorizeGuestCoachPayload>,
      _ids: RoleGrantEffectIds,
    ) => ({
      responseStatus: 201,
      response: guest,
      eventId: '0199a1b2-1234-7000-8000-000000000714',
      aggregateVersion: 1,
      replayed: false,
    }));
    const appointGymAdmin = vi.fn(async (
      _command: CommandEnvelope<AppointGymAdminPayload>,
      _ids: RoleGrantEffectIds,
    ) => ({
      responseStatus: 201,
      response: admin,
      eventId: '0199a1b2-1234-7000-8000-000000000710',
      aggregateVersion: 1,
      replayed: false,
    }));
    const changePrimaryAdmin = vi.fn(async (
      _command: CommandEnvelope<ChangePrimaryAdminPayload>,
      _ids: PrimaryAdminEffectIds,
    ) => ({
      responseStatus: 200,
      response: primary,
      eventId: '0199a1b2-1234-7000-8000-000000000711',
      aggregateVersion: 1,
      replayed: false,
    }));
    const app = await buildApp({
      roles: {
        operatorAuth: new StaticBearerAuthAdapter(centralToken, centralUserId),
        userAuth: new StaticBearerAuthAdapter(coachToken, coachUserId),
        inviteCoach,
        acceptCoachInvite,
        authorizeGuestCoach,
        listPendingCoachInvites: async () => [pending],
        appointGymAdmin,
        changePrimaryAdmin,
        readVenueRoleSummary: async () => ({
          venueId,
          primaryAdminVersion: 0,
          activeGrants: [admin],
        }),
      },
    });
    apps.push(app);

    const guestAuthorized = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/guest-coach`,
      headers: {
        authorization: `Bearer ${centralToken}`,
        'idempotency-key': 'guest-coach-test-1',
        'if-match': '0',
      },
      payload: { coachUserId, reasonCode: 'SESSION_COVERAGE' },
    });
    expect(guestAuthorized.statusCode).toBe(201);
    expect(guestAuthorized.json()).toMatchObject({
      data: { scopeType: 'SESSION', scopeId: sessionId, state: 'ACTIVE' },
    });
    expect(authorizeGuestCoach.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'AUTHORIZE_GUEST_COACH', aggregateType: 'RoleGrant',
      expectedVersion: 0,
      payload: { userId: coachUserId, sessionId, reasonCode: 'SESSION_COVERAGE' },
    });
    expect(authorizeGuestCoach.mock.calls[0]?.[1]).toMatchObject({
      eventId: expect.any(String), auditId: expect.any(String),
      outboxMessageId: expect.any(String), notificationId: expect.any(String),
    });

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

    const appointed = await app.inject({
      method: 'POST',
      url: `/api/v1/central/venues/${venueId}/admins`,
      headers: {
        authorization: `Bearer ${centralToken}`,
        'idempotency-key': 'admin-appoint-test-1',
      },
      payload: { userId: coachUserId, reasonCode: 'PILOT_ADMIN' },
    });
    expect(appointed.statusCode).toBe(201);
    expect(appointed.json()).toMatchObject({ data: { role: 'GYM_ADMIN' } });
    expect(appointGymAdmin.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'APPOINT_ADMIN',
      aggregateType: 'RoleGrant',
      expectedVersion: 0,
      payload: { userId: coachUserId, venueId, reasonCode: 'PILOT_ADMIN' },
    });

    const summary = await app.inject({
      method: 'GET',
      url: `/api/v1/central/venues/${venueId}/roles`,
      headers: { authorization: `Bearer ${centralToken}` },
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({
      data: { venueId, primaryAdminVersion: 0, activeGrants: [{ role: 'GYM_ADMIN' }] },
    });

    const primaryChanged = await app.inject({
      method: 'PUT',
      url: `/api/v1/central/venues/${venueId}/primary-admin`,
      headers: {
        authorization: `Bearer ${centralToken}`,
        'idempotency-key': 'primary-appoint-test-1',
        'if-match': '0',
      },
      payload: { userId: coachUserId, reasonCode: 'PILOT_PRIMARY' },
    });
    expect(primaryChanged.statusCode).toBe(200);
    expect(primaryChanged.json()).toMatchObject({
      data: { change: 'APPOINTED', primaryAdminUserId: coachUserId, version: 1 },
    });
    expect(changePrimaryAdmin.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'SET_PRIMARY_ADMIN',
      aggregateType: 'VenuePrimaryAdmin',
      aggregateId: venueId,
      expectedVersion: 0,
      payload: { userId: coachUserId, venueId, reasonCode: 'PILOT_PRIMARY' },
    });
  });

  it('[AC-063][AC-065][AC-066][AC-153][AC-173][AC-203] exposes role-owned scheduling and NO_SHOW Attendance commands', async () => {
    const venueId = '0199a1b2-1234-7000-8000-000000000701';
    const coachUserId = '0199a1b2-1234-7000-8000-000000000702';
    const chatId = '0199a1b2-1234-7000-8000-000000000703';
    const slot: SlotProjection = {
      slotId: '0199a1b2-1234-7000-8000-000000000704',
      venueId,
      venueDisplayName: 'Molokh Pilot Gym',
      coachUserId,
      coachDisplayName: 'Пилотный тренер',
      startAt: '2026-09-10T14:00:00.000Z',
      endAt: '2026-09-10T15:00:00.000Z',
      state: 'PUBLISHED',
      priceAmount: '1500.00',
      priceCurrency: 'RUB',
      priceText: 'Оплата напрямую залу',
      cancellationTermsText: 'Уточните условия у зала',
      commercialVersion: 1,
      version: 1,
    };
    const offering: GroupOfferingProjection = {
      groupOfferingId: '0199a1b2-1234-7000-8000-000000000705',
      venueId,
      venueDisplayName: 'Molokh Pilot Gym',
      sportCode: 'BOXING',
      classLabel: 'Открытая группа по боксу',
      startAt: '2026-09-11T16:00:00.000Z',
      endAt: '2026-09-11T17:00:00.000Z',
      coachUserId: '0199a1b2-1234-7000-8000-000000000710',
      coachDisplayName: 'Пилотный тренер',
      priceText: 'Уточните стоимость у зала',
      externalInfoUrl: null,
      contact: { phone: '+79990000501' },
      capacityDisclaimerKey: 'group.capacity.confirm-with-venue',
      lastUpdatedAt: '2026-09-07T10:00:00.000Z',
      state: 'PUBLISHED',
      version: 1,
    };
    const options: TrainingOptionsProjection = {
      slots: [slot],
      groupOfferings: [offering],
      activeIntent: { booking: null, groupPlan: null },
      reservationPolicy: 'NO_RESERVATION_BEFORE_HOST_CONFIRMATION',
    };
    const readTrainingOptions = vi.fn(async () => options);
    const publishSlot = vi.fn(
      async (
        _command: CommandEnvelope<PublishSlotPayload>,
        _ids: SchedulingEffectIds,
      ): Promise<ExecutedCommand<SlotProjection>> => {
        return {
          responseStatus: 201,
          response: slot,
          eventId: '0199a1b2-1234-7000-8000-000000000706',
          aggregateVersion: 1,
          replayed: false,
        };
      },
    );
    const publishGroupOffering = vi.fn(
      async (
        _command: CommandEnvelope<PublishGroupOfferingPayload>,
        _ids: SchedulingEffectIds,
      ): Promise<ExecutedCommand<GroupOfferingProjection>> => ({
        responseStatus: 201,
        response: offering,
        eventId: '0199a1b2-1234-7000-8000-000000000707',
        aggregateVersion: 1,
        replayed: false,
      }),
    );
    const updateSlot = vi.fn(
      async (
        _command: CommandEnvelope<UpdateSlotPayload>,
        _ids: SchedulingEffectIds,
      ): Promise<ExecutedCommand<SlotProjection>> => ({
        responseStatus: 200,
        response: { ...slot, commercialVersion: 2, version: 2 },
        eventId: '0199a1b2-1234-7000-8000-000000000726',
        aggregateVersion: 2,
        replayed: false,
      }),
    );
    const withdrawSlot = vi.fn(
      async (
        _command: CommandEnvelope<WithdrawSlotPayload>,
        _ids: SchedulingEffectIds,
      ): Promise<ExecutedCommand<SlotProjection>> => ({
        responseStatus: 200,
        response: { ...slot, state: 'WITHDRAWN', version: 2 },
        eventId: '0199a1b2-1234-7000-8000-000000000727',
        aggregateVersion: 2,
        replayed: false,
      }),
    );
    const updateGroupOffering = vi.fn(
      async (
        _command: CommandEnvelope<UpdateGroupOfferingPayload>,
        _ids: SchedulingEffectIds,
      ): Promise<ExecutedCommand<GroupOfferingProjection>> => ({
        responseStatus: 200,
        response: { ...offering, classLabel: 'Обновлённая группа', version: 2 },
        eventId: '0199a1b2-1234-7000-8000-000000000728',
        aggregateVersion: 2,
        replayed: false,
      }),
    );
    const withdrawGroupOffering = vi.fn(
      async (
        _command: CommandEnvelope<WithdrawGroupOfferingPayload>,
        _ids: SchedulingEffectIds,
      ): Promise<ExecutedCommand<GroupOfferingProjection>> => ({
        responseStatus: 200,
        response: { ...offering, state: 'WITHDRAWN', version: 2 },
        eventId: '0199a1b2-1234-7000-8000-000000000729',
        aggregateVersion: 2,
        replayed: false,
      }),
    );
    const booking: BookingIntentProjection = {
      bookingId: '0199a1b2-1234-7000-8000-000000000708',
      chatId,
      slotId: slot.slotId,
      purpose: 'TRAINING',
      challengeId: null,
      state: 'SELECTING',
      selectedByUserIds: [userId],
      selectionExpiresAt: '2026-09-07T11:00:00.000Z',
      hostConfirmationDeadlineAt: '2026-09-10T06:00:00.000Z',
      commercialTermsSnapshot: null,
      hostConfirmedAt: null,
      sessionId: null,
      version: 1,
    };
    const groupPlan: GroupPlanProjection = {
      groupPlanId: '0199a1b2-1234-7000-8000-000000000709',
      chatId,
      groupOfferingId: offering.groupOfferingId,
      proposedByUserId: userId,
      confirmedByPeer: false,
      state: 'PROPOSED',
      offeringSnapshot: {
        groupOfferingId: offering.groupOfferingId,
        venueId,
        venueDisplayName: offering.venueDisplayName,
        sportCode: offering.sportCode,
        classLabel: offering.classLabel,
        startAt: offering.startAt,
        endAt: offering.endAt,
        coachUserId: offering.coachUserId,
        coachDisplayName: offering.coachDisplayName,
        priceText: offering.priceText,
        externalInfoUrl: offering.externalInfoUrl,
        contact: offering.contact as Record<string, unknown>,
        offeringVersion: offering.version,
      },
      version: 1,
    };
    const groupPlanConversionId = '0199a1b2-1234-7000-8000-000000000714';
    const groupPlanConversion: GroupPlanOfficialConversionProjection = {
      conversionId: groupPlanConversionId,
      groupPlanId: groupPlan.groupPlanId,
      chatId,
      requestedByUserId: userId,
      coachUserId: '0199a1b2-1234-7000-8000-000000000710',
      coachDisplayName: 'Пилотный тренер',
      state: 'PENDING_CONFIRMATION',
      confirmationDeadlineAt: '2026-09-10T10:00:00.000Z',
      challengeId: null,
      bookingId: null,
      sessionId: null,
      confirmations: [{ actorUserId: userId, requiredRole: 'ATHLETE_LOW',
        decision: 'ACCEPT', decidedAt: '2026-09-07T10:00:00.000Z' }],
      viewerRequiredRole: 'ATHLETE_LOW',
      viewerHasDecided: true,
      viewerCanConfirm: false,
      viewerCanDecline: false,
      version: 1,
    };
    const selectedSlot = vi.fn(
      async (_command: CommandEnvelope<SelectSlotPayload>, _ids: PairIntentNotificationEffectIds): Promise<ExecutedCommand<BookingIntentProjection>> => ({
        responseStatus: 201,
        response: booking,
        eventId: '0199a1b2-1234-7000-8000-000000000710',
        aggregateVersion: 1,
        replayed: false,
      }),
    );
    const selectedSameSlot = vi.fn(
      async (_command: CommandEnvelope<SelectSameSlotPayload>, _ids: PairIntentNotificationEffectIds): Promise<ExecutedCommand<BookingIntentProjection>> => ({
        responseStatus: 200,
        response: { ...booking, state: 'HOST_CONFIRMATION_PENDING', selectedByUserIds: [userId, coachUserId], commercialTermsSnapshot: {
          slotId: slot.slotId, venueId, venueDisplayName: slot.venueDisplayName,
          coachUserId, coachDisplayName: slot.coachDisplayName, startAt: slot.startAt,
          endAt: slot.endAt, priceAmount: slot.priceAmount, priceCurrency: slot.priceCurrency,
          priceText: slot.priceText, cancellationTermsText: slot.cancellationTermsText,
          commercialVersion: slot.commercialVersion,
        }, version: 2 },
        eventId: '0199a1b2-1234-7000-8000-000000000711', aggregateVersion: 2, replayed: false,
      }),
    );
    const pendingBooking: BookingIntentProjection = {
      ...booking,
      state: 'HOST_CONFIRMATION_PENDING',
      selectedByUserIds: [userId, coachUserId],
      commercialTermsSnapshot: {
        slotId: slot.slotId,
        venueId,
        venueDisplayName: slot.venueDisplayName,
        coachUserId,
        coachDisplayName: slot.coachDisplayName,
        startAt: slot.startAt,
        endAt: slot.endAt,
        priceAmount: slot.priceAmount,
        priceCurrency: slot.priceCurrency,
        priceText: slot.priceText,
        cancellationTermsText: slot.cancellationTermsText,
        commercialVersion: slot.commercialVersion,
      },
      version: 2,
    };
    const withdrawBookingRequest = vi.fn(
      async (
        _command: CommandEnvelope<WithdrawBookingRequestPayload>,
        _ids: BookingWithdrawalEffectIds,
      ): Promise<ExecutedCommand<BookingIntentProjection>> => ({
        responseStatus: 200,
        response: { ...pendingBooking, state: 'CANCELLED', version: 3 },
        eventId: '0199a1b2-1234-7000-8000-000000000737',
        aggregateVersion: 3,
        replayed: false,
      }),
    );
    const hostConfirmationItems = [
      {
        booking: pendingBooking,
        athleteDisplayNames: ['Первый спортсмен', 'Второй спортсмен'] as const,
      },
    ] as const;
    const readHostConfirmationQueue = vi.fn(async () => hostConfirmationItems);
    const adminDashboard: VenueAdminDashboardProjection = {
      venue: {
        venueId,
        displayName: 'Molokh Pilot Gym',
        timezone: 'Europe/Moscow',
        slotPublishHorizonDays: 30,
      },
      coaches: [{ userId: coachUserId, displayName: 'Пилотный тренер' }],
      slots: [slot],
      groupOfferings: [offering],
      hostConfirmations: hostConfirmationItems,
      groupInterests: [{
        groupPlanId: groupPlan.groupPlanId,
        groupOfferingId: offering.groupOfferingId,
        athleteDisplayNames: ['Первый спортсмен', 'Второй спортсмен'],
        classLabel: offering.classLabel,
        startAt: offering.startAt,
        notifiedAt: '2026-09-07T10:30:00.000Z',
        state: 'NOTIFIED',
        version: 2,
      }],
    };
    const readVenueAdminDashboard = vi.fn(async () => adminDashboard);
    const sessionId = '0199a1b2-1234-7000-8000-000000000714';
    const confirmedByHost = vi.fn(
      async (
        _command: CommandEnvelope<ConfirmBookingHostPayload>,
        _ids: HostConfirmationEffectIds,
      ): Promise<ExecutedCommand<HostConfirmationProjection>> => ({
        responseStatus: 200,
        response: {
          outcome: 'CONFIRMED',
          booking: {
            ...pendingBooking,
            state: 'CONFIRMED_PAIR',
            hostConfirmedAt: '2026-09-07T10:10:00.000Z',
            sessionId,
            version: 3,
          },
          session: {
            sessionId,
            bookingId: booking.bookingId,
            challengeId: null,
            venueId,
            coachUserId,
            athleteUserIds: [userId, coachUserId],
            purpose: 'TRAINING',
            state: 'SCHEDULED',
            scheduledStartAt: slot.startAt,
            scheduledEndAt: slot.endAt,
            version: 1,
          },
        },
        eventId: '0199a1b2-1234-7000-8000-000000000715',
        aggregateVersion: 3,
        replayed: false,
      }),
    );
    const rejectedByHost = vi.fn(
      async (
        _command: CommandEnvelope<RejectBookingHostPayload>,
        _ids: HostRejectionEffectIds,
      ): Promise<ExecutedCommand<HostRejectionProjection>> => ({
        responseStatus: 200,
        response: {
          booking: { ...pendingBooking, state: 'REJECTED', version: 3 },
          rejectedAt: '2026-09-07T10:12:00.000Z',
          reasonCode: 'COACH_UNAVAILABLE',
          reasonNote: 'Тренер заболел',
        },
        eventId: '0199a1b2-1234-7000-8000-000000000730',
        aggregateVersion: 3,
        replayed: false,
      }),
    );
    const proposedGroupPlan = vi.fn(
      async (_command: CommandEnvelope<ProposeGroupPlanPayload>, _ids: PairIntentNotificationEffectIds): Promise<ExecutedCommand<GroupPlanProjection>> => ({
        responseStatus: 201, response: groupPlan,
        eventId: '0199a1b2-1234-7000-8000-000000000712', aggregateVersion: 1, replayed: false,
      }),
    );
    const confirmedGroupPlan = vi.fn(
      async (_command: CommandEnvelope<ConfirmGroupPlanPayload>, _ids: PairIntentNotificationEffectIds): Promise<ExecutedCommand<GroupPlanProjection>> => ({
        responseStatus: 200, response: { ...groupPlan, confirmedByPeer: true, state: 'NOTIFIED', version: 2 },
        eventId: '0199a1b2-1234-7000-8000-000000000713', aggregateVersion: 2, replayed: false,
      }),
    );
    const listGroupPlanOfficialConversionsForViewer = vi.fn(
      async (): Promise<readonly GroupPlanOfficialConversionProjection[]> => [groupPlanConversion],
    );
    const requestGroupPlanOfficialConversion = vi.fn(
      async (
        _command: CommandEnvelope<RequestGroupPlanOfficialConversionPayload>,
        _ids: GroupPlanOfficialConversionEffectIds,
      ): Promise<ExecutedCommand<GroupPlanOfficialConversionProjection>> => ({
        responseStatus: 201, response: groupPlanConversion,
        eventId: '0199a1b2-1234-7000-8000-000000000715', aggregateVersion: 1, replayed: false,
      }),
    );
    const decideGroupPlanOfficialConversion = vi.fn(
      async (
        _command: CommandEnvelope<DecideGroupPlanOfficialConversionPayload>,
        _ids: GroupPlanOfficialConversionEffectIds,
      ): Promise<ExecutedCommand<GroupPlanOfficialConversionProjection>> => ({
        responseStatus: 200,
        response: {
          ...groupPlanConversion,
          confirmations: [...groupPlanConversion.confirmations, {
            actorUserId: '0199a1b2-1234-7000-8000-000000000711',
            requiredRole: 'ATHLETE_HIGH', decision: 'ACCEPT',
            decidedAt: '2026-09-07T10:01:00.000Z',
          }],
          version: 2,
        },
        eventId: '0199a1b2-1234-7000-8000-000000000716', aggregateVersion: 2, replayed: false,
      }),
    );
    const lifecycleSession: SessionLifecycleProjection = {
      sessionId,
      bookingId: booking.bookingId,
      challengeId: null,
      challengeState: null,
      challengeVersion: null,
      resultId: null,
      venueId,
      venueDisplayName: slot.venueDisplayName,
      coachUserId,
      coachDisplayName: slot.coachDisplayName,
      guestCoachGrantId: null,
      guestCoachGrantState: null,
      guestCoachGrantExpiresAt: null,
      athleteUserIds: [userId, '0199a1b2-1234-7000-8000-000000000716'],
      athleteDisplayNames: ['Первый спортсмен', 'Второй спортсмен'],
      activeAthleteUserIds: [userId, '0199a1b2-1234-7000-8000-000000000716'],
      activeAthleteDisplayNames: ['Первый спортсмен', 'Второй спортсмен'],
      purpose: 'TRAINING',
      state: 'READY_FOR_COACH',
      scheduledStartAt: slot.startAt,
      scheduledEndAt: slot.endAt,
      windowOpenedAt: slot.startAt,
      actualStartAt: null,
      actualEndAt: null,
      latestCoachReplacementAt: null,
      cancellationReasonCode: null,
      noShowGraceMinutes: 15,
      attendance: [],
      viewerCanManage: true,
      viewerCanRecordResult: true,
      viewerCanAdminister: false,
      viewerCanAuthorizeGuestCoach: false,
      viewerCanRequestNoFaultReschedule: false,
      viewerCanRequestOfficialConversion: false,
      viewerCanCancelTraining: false,
      viewerCanCancelOfficial: false,
      officialConversion: null,
      soloContinuation: null,
      trainingRetention: null,
      replacementCoachOptions: [],
      version: 2,
    };
    const readMySessions = vi.fn(async () => ({
      sessions: [lifecycleSession],
      completedTrainingCount: 0,
    }));
    const readSession = vi.fn(async () => lifecycleSession);
    const startSession = vi.fn(async (
      _command: CommandEnvelope<StartSessionPayload>,
      _ids: SessionEffectIds,
    ) => ({
      responseStatus: 200,
      response: {
        ...lifecycleSession,
        state: 'IN_PROGRESS' as const,
        actualStartAt: slot.startAt,
        version: 3,
      },
      eventId: '0199a1b2-1234-7000-8000-000000000717',
      aggregateVersion: 3,
      replayed: false,
    }));
    const recordSessionAttendance = vi.fn(async (
      _command: CommandEnvelope<RecordAttendancePayload>,
      _ids: SessionEffectIds,
    ) => ({
      responseStatus: 200,
      response: {
        ...lifecycleSession,
        state: 'IN_PROGRESS' as const,
        actualStartAt: slot.startAt,
        attendance: [{
          attendanceId: '0199a1b2-1234-7000-8000-000000000718',
          athleteUserId: userId,
          athleteDisplayName: 'Первый спортсмен',
          status: 'PRESENT' as const,
          arrivalAt: slot.startAt,
          recordedByUserId: coachUserId,
          recordedAt: slot.startAt,
          reasonCode: null,
          comment: null,
        }],
        version: 3,
      },
      eventId: '0199a1b2-1234-7000-8000-000000000719',
      aggregateVersion: 3,
      replayed: false,
    }));
    const endSession = vi.fn(async (
      _command: CommandEnvelope<EndSessionPayload>,
      _ids: SessionEffectIds,
    ) => ({
      responseStatus: 200,
      response: {
        ...lifecycleSession,
        state: 'ENDED' as const,
        actualStartAt: slot.startAt,
        actualEndAt: slot.endAt,
        version: 5,
      },
      eventId: '0199a1b2-1234-7000-8000-000000000720',
      aggregateVersion: 5,
      replayed: false,
    }));
    const replacementCoachUserId = '0199a1b2-1234-7000-8000-000000000721';
    const replaceSessionCoach = vi.fn(async (
      _command: CommandEnvelope<ReplaceSessionCoachPayload>,
      _ids: SessionEffectIds,
    ) => ({
      responseStatus: 200,
      response: {
        ...lifecycleSession,
        coachUserId: replacementCoachUserId,
        coachDisplayName: 'Резервный тренер',
        latestCoachReplacementAt: '2026-09-07T10:20:00.000Z',
        viewerCanRequestNoFaultReschedule: true,
        version: 3,
      },
      eventId: '0199a1b2-1234-7000-8000-000000000722',
      aggregateVersion: 3,
      replayed: false,
    }));
    const cancelledAfterReplacement = vi.fn(async (
      _command: CommandEnvelope<CancelAfterCoachReplacementPayload>,
      _ids: SessionEffectIds,
    ) => ({
      responseStatus: 200,
      response: {
        ...lifecycleSession,
        state: 'CANCELLED' as const,
        cancellationReasonCode: 'COACH_REPLACEMENT_REJECTED',
        version: 4,
      },
      eventId: '0199a1b2-1234-7000-8000-000000000723',
      aggregateVersion: 4,
      replayed: false,
    }));
    const failSessionExternal = vi.fn(async (
      _command: CommandEnvelope<FailSessionExternalPayload>,
      _ids: SessionEffectIds,
    ) => ({
      responseStatus: 200,
      response: {
        ...lifecycleSession,
        state: 'CANCELLED' as const,
        cancellationReasonCode: 'VENUE_UNAVAILABLE',
        version: 3,
      },
      eventId: '0199a1b2-1234-7000-8000-000000000724',
      aggregateVersion: 3,
      replayed: false,
    }));
    const cancelOfficialSessionByAthlete = vi.fn(async (
      _command: CommandEnvelope<CancelOfficialSessionByAthletePayload>,
      _ids: SessionEffectIds,
    ) => ({
      responseStatus: 200,
      response: {
        ...lifecycleSession,
        purpose: 'OFFICIAL_CHALLENGE' as const,
        state: 'CANCELLED' as const,
        challengeId: '0199a1b2-1234-7000-8000-000000000725',
        challengeState: 'RESULT_RECORDED' as const,
        challengeVersion: 6,
        resultId: '0199a1b2-1234-7000-8000-000000000726',
        cancellationReasonCode: 'ATHLETE_CANCELLED_OFFICIAL',
        version: 3,
      },
      eventId: '0199a1b2-1234-7000-8000-000000000727',
      aggregateVersion: 3,
      replayed: false,
    }));
    const conversionId = '0199a1b2-1234-7000-8000-000000000726';
    const conversion: BookingOfficialConversionProjection = {
      conversionId,
      bookingId: booking.bookingId,
      sessionId,
      competitionId: '0199a1b2-1234-7000-8000-000000000727',
      requestedByUserId: userId,
      stake: 'NONE',
      state: 'PENDING_CONFIRMATION',
      boundHolderUserId: null,
      queueEntryId: null,
      queuePosition: null,
      challengeId: null,
      confirmationDeadlineAt: '2026-09-10T10:00:00.000Z',
      confirmations: [{
        actorUserId: userId,
        requiredRole: 'ATHLETE_LOW',
        decision: 'ACCEPT',
        decidedAt: '2026-09-07T10:00:00.000Z',
      }],
      viewerRequiredRole: 'ATHLETE_LOW',
      viewerHasDecided: true,
      viewerCanRequest: false,
      viewerCanConfirm: false,
      viewerCanDecline: false,
      version: 1,
    };
    const requestBookingOfficialConversion = vi.fn(async (
      _command: CommandEnvelope<RequestBookingOfficialConversionPayload>,
      _ids: BookingOfficialConversionEffectIds,
    ): Promise<ExecutedCommand<BookingOfficialConversionProjection>> => ({
      responseStatus: 201, response: conversion,
      eventId: '0199a1b2-1234-7000-8000-000000000728',
      aggregateVersion: 1, replayed: false,
    }));
    const decideBookingOfficialConversion = vi.fn(async (
      _command: CommandEnvelope<DecideBookingOfficialConversionPayload>,
      _ids: BookingOfficialConversionEffectIds,
    ): Promise<ExecutedCommand<BookingOfficialConversionProjection>> => ({
      responseStatus: 200,
      response: {
        ...conversion,
        confirmations: [...conversion.confirmations, {
          actorUserId: coachUserId,
          requiredRole: 'COACH' as const,
          decision: 'ACCEPT' as const,
          decidedAt: '2026-09-07T10:05:00.000Z',
        }],
        version: 2,
      },
      eventId: '0199a1b2-1234-7000-8000-000000000729',
      aggregateVersion: 2, replayed: false,
    }));
    const soloContinuationId = '0199a1b2-1234-7000-8000-000000000731';
    const soloContinuation: BookingSoloContinuationProjection = {
      continuationId: soloContinuationId,
      bookingId: booking.bookingId,
      sessionId,
      cancelledAthleteUserId: userId,
      remainingAthleteUserId: '0199a1b2-1234-7000-8000-000000000716',
      state: 'PENDING',
      deadlineAt: '2026-09-07T11:00:00.000Z',
      confirmations: [],
      viewerRequiredRole: null,
      viewerHasDecided: false,
      viewerCanConfirm: false,
      viewerCanDecline: false,
      version: 1,
    };
    const requestTrainingParticipantCancellation = vi.fn(async (
      _command: CommandEnvelope<RequestTrainingParticipantCancellationPayload>,
      _ids: BookingSoloContinuationEffectIds,
    ): Promise<ExecutedCommand<BookingSoloContinuationProjection>> => ({
      responseStatus: 201,
      response: soloContinuation,
      eventId: '0199a1b2-1234-7000-8000-000000000732',
      aggregateVersion: 1,
      replayed: false,
    }));
    const decideBookingSoloContinuation = vi.fn(async (
      _command: CommandEnvelope<DecideBookingSoloContinuationPayload>,
      _ids: BookingSoloContinuationEffectIds,
    ): Promise<ExecutedCommand<BookingSoloContinuationProjection>> => ({
      responseStatus: 200,
      response: {
        ...soloContinuation,
        confirmations: [{
          actorUserId: coachUserId,
          requiredRole: 'COACH',
          decision: 'ACCEPT',
          decidedAt: '2026-09-07T10:05:00.000Z',
        }],
        version: 2,
      },
      eventId: '0199a1b2-1234-7000-8000-000000000733',
      aggregateVersion: 2,
      replayed: false,
    }));
    const trainingRetentionId = '0199a1b2-1234-7000-8000-000000000734';
    const trainingRetention: BookingTrainingRetentionProjection = {
      retentionId: trainingRetentionId,
      bookingId: booking.bookingId,
      sessionId,
      challengeId: '0199a1b2-1234-7000-8000-000000000735',
      cause: 'COMPETITIVE_CONTEXT_INVALIDATED',
      state: 'PENDING',
      deadlineAt: '2026-09-07T11:00:00.000Z',
      confirmations: [],
      viewerRequiredRole: 'ATHLETE_LOW',
      viewerHasDecided: false,
      viewerCanConfirm: true,
      viewerCanDecline: true,
      version: 1,
    };
    const decideBookingTrainingRetention = vi.fn(async (
      _command: CommandEnvelope<DecideBookingTrainingRetentionPayload>,
      _ids: BookingTrainingRetentionEffectIds,
    ): Promise<ExecutedCommand<BookingTrainingRetentionProjection>> => ({
      responseStatus: 200,
      response: {
        ...trainingRetention,
        confirmations: [{ actorUserId: userId, requiredRole: 'ATHLETE_LOW',
          decision: 'ACCEPT', decidedAt: '2026-09-07T10:05:00.000Z' }],
        viewerHasDecided: true, viewerCanConfirm: false, viewerCanDecline: false, version: 2,
      },
      eventId: '0199a1b2-1234-7000-8000-000000000736',
      aggregateVersion: 2,
      replayed: false,
    }));
    const app = await buildApp({
      scheduling: {
        auth: new StaticBearerAuthAdapter(token, userId),
        readTrainingOptions,
        publishSlot,
        updateSlot,
        withdrawSlot,
        publishGroupOffering,
        updateGroupOffering,
        withdrawGroupOffering,
        selectSlot: selectedSlot,
        selectSameSlot: selectedSameSlot,
        withdrawBookingRequest,
        readHostConfirmationQueue,
        readVenueAdminDashboard,
        confirmBookingHost: confirmedByHost,
        rejectBookingHost: rejectedByHost,
        readMySessions,
        readSession,
        startSession,
        recordSessionAttendance,
        endSession,
        replaceSessionCoach,
        cancelSessionAfterCoachReplacement: cancelledAfterReplacement,
        cancelOfficialSessionByAthlete,
        failSessionExternal,
        requestBookingOfficialConversion,
        decideBookingOfficialConversion,
        requestTrainingParticipantCancellation,
        decideBookingSoloContinuation,
        decideBookingTrainingRetention,
        proposeGroupPlan: proposedGroupPlan,
        confirmGroupPlan: confirmedGroupPlan,
        listGroupPlanOfficialConversionsForViewer,
        requestGroupPlanOfficialConversion,
        decideGroupPlanOfficialConversion,
      },
    });
    apps.push(app);

    const listed = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/training-options`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      data: {
        slots: [{ slotId: slot.slotId }],
        groupOfferings: [
          {
            groupOfferingId: offering.groupOfferingId,
            capacityDisclaimerKey: 'group.capacity.confirm-with-venue',
          },
        ],
        reservationPolicy: 'NO_RESERVATION_BEFORE_HOST_CONFIRMATION',
      },
      meta: { viewerUserId: userId },
    });
    expect(readTrainingOptions).toHaveBeenCalledWith(chatId, userId);

    const dashboard = await app.inject({
      method: 'GET',
      url: `/api/v1/venues/${venueId}/admin-dashboard`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json()).toMatchObject({
      data: {
        venue: { venueId, timezone: 'Europe/Moscow' },
        coaches: [{ userId: coachUserId }],
        slots: [{ slotId: slot.slotId }],
        groupOfferings: [{ groupOfferingId: offering.groupOfferingId }],
        hostConfirmations: [{ booking: { bookingId: pendingBooking.bookingId } }],
        groupInterests: [{
          groupPlanId: groupPlan.groupPlanId,
          state: 'NOTIFIED',
        }],
      },
    });
    expect(readVenueAdminDashboard).toHaveBeenCalledWith(userId, venueId);

    const publishedSlot = await app.inject({
      method: 'POST',
      url: `/api/v1/venues/${venueId}/slots`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'publish-slot-api-1',
        'if-match': '0',
      },
      payload: {
        coachUserId,
        startAt: slot.startAt,
        endAt: slot.endAt,
        priceAmount: slot.priceAmount,
        priceCurrency: slot.priceCurrency,
      },
    });
    expect(publishedSlot.statusCode).toBe(201);
    expect(publishSlot.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'PUBLISH_SLOT',
      aggregateType: 'Slot',
      expectedVersion: 0,
      payload: { venueId, coachUserId },
    });

    const publishedOffering = await app.inject({
      method: 'POST',
      url: `/api/v1/venues/${venueId}/group-offerings`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'publish-group-api-1',
        'if-match': '0',
      },
      payload: {
        sportCode: offering.sportCode,
        classLabel: offering.classLabel,
        startAt: offering.startAt,
        endAt: offering.endAt,
      },
    });
    expect(publishedOffering.statusCode).toBe(201);
    expect(publishGroupOffering.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'PUBLISH_GROUP_OFFERING',
      aggregateType: 'GroupOffering',
      expectedVersion: 0,
      payload: { venueId, sportCode: 'BOXING' },
    });

    const updatedSlot = await app.inject({
      method: 'PATCH',
      url: `/api/v1/slots/${slot.slotId}`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'update-slot-api-1',
        'if-match': '1',
      },
      payload: {
        coachUserId,
        startAt: slot.startAt,
        endAt: slot.endAt,
        priceAmount: slot.priceAmount,
        priceCurrency: slot.priceCurrency,
      },
    });
    expect(updatedSlot.statusCode).toBe(200);
    expect(updatedSlot.json()).toMatchObject({ data: { version: 2, commercialVersion: 2 } });
    expect(updateSlot.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'UPDATE_SLOT',
      aggregateId: slot.slotId,
      expectedVersion: 1,
      payload: { slotId: slot.slotId, coachUserId },
    });

    const withdrawnSlot = await app.inject({
      method: 'POST',
      url: `/api/v1/slots/${slot.slotId}/withdraw`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'withdraw-slot-api-1',
        'if-match': '1',
      },
      payload: { reasonCode: 'SCHEDULE_CHANGED', reasonNote: 'Зал закрыт' },
    });
    expect(withdrawnSlot.statusCode).toBe(200);
    expect(withdrawnSlot.json()).toMatchObject({ data: { state: 'WITHDRAWN' } });
    expect(withdrawSlot.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'WITHDRAW_SLOT',
      expectedVersion: 1,
      payload: {
        slotId: slot.slotId,
        reasonCode: 'SCHEDULE_CHANGED',
        reasonNote: 'Зал закрыт',
      },
    });

    const updatedOffering = await app.inject({
      method: 'PATCH',
      url: `/api/v1/group-offerings/${offering.groupOfferingId}`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'update-offering-api-1',
        'if-match': '1',
      },
      payload: {
        sportCode: offering.sportCode,
        classLabel: 'Обновлённая группа',
        startAt: offering.startAt,
        endAt: offering.endAt,
      },
    });
    expect(updatedOffering.statusCode).toBe(200);
    expect(updatedOffering.json()).toMatchObject({
      data: { classLabel: 'Обновлённая группа', version: 2 },
    });
    expect(updateGroupOffering.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'UPDATE_GROUP_OFFERING',
      expectedVersion: 1,
      payload: { groupOfferingId: offering.groupOfferingId },
    });

    const withdrawnOffering = await app.inject({
      method: 'POST',
      url: `/api/v1/group-offerings/${offering.groupOfferingId}/withdraw`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'withdraw-offering-api-1',
        'if-match': '1',
      },
      payload: { reasonCode: 'VENUE_UNAVAILABLE' },
    });
    expect(withdrawnOffering.statusCode).toBe(200);
    expect(withdrawnOffering.json()).toMatchObject({ data: { state: 'WITHDRAWN' } });
    expect(withdrawGroupOffering.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'WITHDRAW_GROUP_OFFERING',
      expectedVersion: 1,
      payload: {
        groupOfferingId: offering.groupOfferingId,
        reasonCode: 'VENUE_UNAVAILABLE',
        reasonNote: null,
      },
    });

    const selected = await app.inject({
      method: 'POST',
      url: '/api/v1/bookings',
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'select-slot-api-1',
        'if-match': '0',
      },
      payload: {
        chatId,
        slotId: slot.slotId,
        commercialVersion: 1,
        challengeId: '0199a1b2-1234-7000-8000-000000000725',
      },
    });
    expect(selected.statusCode).toBe(201);
    expect(selected.json()).toMatchObject({ data: { state: 'SELECTING', slotId: slot.slotId } });
    expect(selectedSlot.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'SELECT_SLOT',
      aggregateType: 'Booking',
      payload: {
        chatId,
        slotId: slot.slotId,
        commercialVersion: 1,
        challengeId: '0199a1b2-1234-7000-8000-000000000725',
      },
    });

    const selectedSame = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${booking.bookingId}/select-same`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'select-same-slot-api-1',
        'if-match': '1',
      },
      payload: { commercialVersion: 1 },
    });
    expect(selectedSame.statusCode).toBe(200);
    expect(selectedSame.json()).toMatchObject({
      data: { state: 'HOST_CONFIRMATION_PENDING', commercialTermsSnapshot: { slotId: slot.slotId } },
    });
    expect(selectedSameSlot.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'SELECT_SAME_SLOT',
      expectedVersion: 1,
      payload: { bookingId: booking.bookingId, commercialVersion: 1 },
    });

    const bookingWithdrawn = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${booking.bookingId}/withdraw`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'withdraw-booking-api-1',
        'if-match': '2',
      },
      payload: {},
    });
    expect(bookingWithdrawn.statusCode).toBe(200);
    expect(bookingWithdrawn.json()).toMatchObject({ data: { state: 'CANCELLED', version: 3 } });
    expect(withdrawBookingRequest.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'WITHDRAW_SLOT_REQUEST',
      aggregateType: 'Booking',
      aggregateId: booking.bookingId,
      expectedVersion: 2,
      payload: { bookingId: booking.bookingId },
    });

    const hostQueue = await app.inject({
      method: 'GET',
      url: '/api/v1/me/host-confirmations',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(hostQueue.statusCode).toBe(200);
    expect(hostQueue.json()).toMatchObject({
      data: [
        {
          booking: { bookingId: booking.bookingId, state: 'HOST_CONFIRMATION_PENDING' },
          athleteDisplayNames: ['Первый спортсмен', 'Второй спортсмен'],
        },
      ],
    });
    expect(readHostConfirmationQueue).toHaveBeenCalledWith(userId);

    const hostConfirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${booking.bookingId}/host-confirm`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'host-confirm-api-1',
        'if-match': '2',
      },
      payload: {},
    });
    expect(hostConfirmed.statusCode).toBe(200);
    expect(hostConfirmed.json()).toMatchObject({
      data: {
        outcome: 'CONFIRMED',
        booking: { state: 'CONFIRMED_PAIR', sessionId },
        session: { sessionId, state: 'SCHEDULED' },
      },
    });
    expect(confirmedByHost.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'CONFIRM_BOOKING_HOST',
      expectedVersion: 2,
      payload: { bookingId: booking.bookingId },
    });

    confirmedByHost.mockRejectedValueOnce(
      new SchedulingConflictError('ATHLETE_SCHEDULE_CONFLICT'),
    );
    const athleteConflict = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${booking.bookingId}/host-confirm`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'host-confirm-api-athlete-conflict',
        'if-match': '2',
      },
      payload: {},
    });
    expect(athleteConflict.statusCode).toBe(409);
    expect(athleteConflict.json()).toMatchObject({ code: 'ATHLETE_SCHEDULE_CONFLICT' });

    const hostRejected = await app.inject({
      method: 'POST',
      url: `/api/v1/bookings/${booking.bookingId}/host-reject`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'host-reject-api-1',
        'if-match': '2',
      },
      payload: { reasonCode: 'COACH_UNAVAILABLE', reasonNote: 'Тренер заболел' },
    });
    expect(hostRejected.statusCode).toBe(200);
    expect(hostRejected.json()).toMatchObject({
      data: {
        booking: { state: 'REJECTED' },
        reasonCode: 'COACH_UNAVAILABLE',
        reasonNote: 'Тренер заболел',
      },
    });
    expect(rejectedByHost.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'REJECT_BOOKING_HOST',
      expectedVersion: 2,
      payload: {
        bookingId: booking.bookingId,
        reasonCode: 'COACH_UNAVAILABLE',
        reasonNote: 'Тренер заболел',
      },
    });

    const sessionList = await app.inject({
      method: 'GET',
      url: '/api/v1/me/sessions',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(sessionList.statusCode).toBe(200);
    expect(sessionList.json()).toMatchObject({
      data: {
        sessions: [{ sessionId, state: 'READY_FOR_COACH', viewerCanManage: true }],
        completedTrainingCount: 0,
      },
    });

    const sessionDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/sessions/${sessionId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(sessionDetail.statusCode).toBe(200);
    expect(readSession).toHaveBeenCalledWith(sessionId, userId);

    const conversionRequested = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/official-conversion`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'request-official-conversion-api-1',
        'if-match': '0',
      },
      payload: {},
    });
    expect(conversionRequested.statusCode).toBe(201);
    expect(conversionRequested.json()).toMatchObject({
      data: { conversionId, state: 'PENDING_CONFIRMATION', confirmations: [{ actorUserId: userId }] },
    });
    expect(requestBookingOfficialConversion.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'REQUEST_BOOKING_OFFICIAL_CONVERSION',
      aggregateType: 'BookingOfficialConversion',
      expectedVersion: 0,
      payload: { sessionId },
    });

    const conversionConfirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/booking-official-conversions/${conversionId}/decision`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'confirm-official-conversion-api-1',
        'if-match': '1',
      },
      payload: { decision: 'ACCEPT' },
    });
    expect(conversionConfirmed.statusCode).toBe(200);
    expect(conversionConfirmed.json()).toMatchObject({ data: { version: 2 } });
    expect(decideBookingOfficialConversion.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'DECIDE_BOOKING_OFFICIAL_CONVERSION',
      aggregateId: conversionId,
      expectedVersion: 1,
      payload: { conversionId, decision: 'ACCEPT' },
    });

    const cancellationRequested = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/cancel-training-participation`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'cancel-training-participation-api-1',
        'if-match': '0',
      },
      payload: {},
    });
    expect(cancellationRequested.statusCode).toBe(201);
    expect(cancellationRequested.json()).toMatchObject({
      data: { continuationId: soloContinuationId, state: 'PENDING', version: 1 },
    });
    expect(requestTrainingParticipantCancellation.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'CANCEL_TRAINING_PARTICIPATION',
      aggregateType: 'BookingSoloContinuation',
      expectedVersion: 0,
      payload: { sessionId },
    });

    const soloDecisionRecorded = await app.inject({
      method: 'POST',
      url: `/api/v1/booking-solo-continuations/${soloContinuationId}/decision`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'confirm-solo-continuation-api-1',
        'if-match': '1',
      },
      payload: { decision: 'ACCEPT' },
    });
    expect(soloDecisionRecorded.statusCode).toBe(200);
    expect(soloDecisionRecorded.json()).toMatchObject({ data: { version: 2 } });
    expect(decideBookingSoloContinuation.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'DECIDE_BOOKING_SOLO_CONTINUATION',
      aggregateType: 'BookingSoloContinuation',
      aggregateId: soloContinuationId,
      expectedVersion: 1,
      payload: { continuationId: soloContinuationId, decision: 'ACCEPT' },
    });

    const retentionDecisionRecorded = await app.inject({
      method: 'POST',
      url: `/api/v1/booking-training-retentions/${trainingRetentionId}/decision`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'confirm-training-retention-api-1',
        'if-match': '1',
      },
      payload: { decision: 'ACCEPT' },
    });
    expect(retentionDecisionRecorded.statusCode).toBe(200);
    expect(retentionDecisionRecorded.json()).toMatchObject({
      data: { cause: 'COMPETITIVE_CONTEXT_INVALIDATED', version: 2 },
    });
    expect(decideBookingTrainingRetention.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'DECIDE_BOOKING_TRAINING_RETENTION',
      aggregateType: 'BookingTrainingRetention',
      aggregateId: trainingRetentionId,
      expectedVersion: 1,
      payload: { retentionId: trainingRetentionId, decision: 'ACCEPT' },
    });

    const sessionStarted = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/start`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'session-start-api-1',
        'if-match': '2',
      },
      payload: {},
    });
    expect(sessionStarted.statusCode).toBe(200);
    expect(sessionStarted.json()).toMatchObject({ data: { state: 'IN_PROGRESS' } });
    expect(startSession.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'START_SESSION',
      aggregateType: 'Session',
      aggregateId: sessionId,
      expectedVersion: 2,
    });

    const attendanceRecorded = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/attendance`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'session-attendance-api-1',
        'if-match': '2',
      },
      payload: { athleteUserId: userId, status: 'NO_SHOW' },
    });
    expect(attendanceRecorded.statusCode).toBe(200);
    expect(recordSessionAttendance.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'RECORD_ATTENDANCE',
      expectedVersion: 2,
      payload: { sessionId, athleteUserId: userId, status: 'NO_SHOW', comment: null },
    });

    const sessionEnded = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'session-end-api-1',
        'if-match': '4',
      },
      payload: {},
    });
    expect(sessionEnded.statusCode).toBe(200);
    expect(sessionEnded.json()).toMatchObject({ data: { state: 'ENDED' } });
    expect(endSession.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'END_SESSION',
      expectedVersion: 4,
    });

    const coachReplaced = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/replace-coach`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'session-replace-coach-api-1',
        'if-match': '2',
      },
      payload: { replacementCoachUserId },
    });
    expect(coachReplaced.statusCode).toBe(200);
    expect(replaceSessionCoach.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'REPLACE_SESSION_COACH',
      expectedVersion: 2,
      payload: { sessionId, replacementCoachUserId },
    });

    const replacementRejected = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/cancel-after-coach-replacement`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'session-reject-replacement-api-1',
        'if-match': '3',
      },
      payload: {},
    });
    expect(replacementRejected.statusCode).toBe(200);
    expect(cancelledAfterReplacement.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'REQUEST_RESCHEDULE_AFTER_COACH_REPLACEMENT',
      payload: { sessionId },
    });

    const externalFailure = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/fail-external`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'session-fail-external-api-1',
        'if-match': '2',
      },
      payload: { reasonCode: 'VENUE_UNAVAILABLE' },
    });
    expect(externalFailure.statusCode).toBe(200);
    expect(failSessionExternal.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'FAIL_SESSION_EXTERNAL',
      actor: { id: userId, roles: [] },
      payload: { sessionId, reasonCode: 'VENUE_UNAVAILABLE' },
    });
    expect(failSessionExternal.mock.calls[0]?.[1]).toMatchObject({
      rescheduleId: expect.any(String),
      challengeEventId: expect.any(String),
      challengeOutboxMessageId: expect.any(String),
    });

    const officialCancelled = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/cancel-official`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'session-cancel-official-api-1',
        'if-match': '2',
      },
      payload: {},
    });
    expect(officialCancelled.statusCode).toBe(200);
    expect(officialCancelled.json()).toMatchObject({
      data: { state: 'CANCELLED', challengeState: 'RESULT_RECORDED' },
    });
    expect(cancelOfficialSessionByAthlete.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'CANCEL_OFFICIAL_BY_ATHLETE',
      actor: { id: userId, roles: [] },
      aggregateType: 'Session', aggregateId: sessionId, expectedVersion: 2,
      payload: { sessionId },
    });
    expect(cancelOfficialSessionByAthlete.mock.calls[0]?.[1]).toMatchObject({
      resultId: expect.any(String), resultEventId: expect.any(String),
      cooldownId: expect.any(String), resultNotificationIds: expect.arrayContaining([
        expect.any(String), expect.any(String), expect.any(String),
      ]),
    });

    const planProposed = await app.inject({
      method: 'POST',
      url: '/api/v1/group-plans',
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'propose-group-plan-api-1',
        'if-match': '0',
      },
      payload: { chatId, groupOfferingId: offering.groupOfferingId, offeringVersion: 1 },
    });
    expect(planProposed.statusCode).toBe(201);
    expect(planProposed.json()).toMatchObject({ data: { state: 'PROPOSED' } });
    expect(proposedGroupPlan.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'PROPOSE_GROUP_PLAN',
      payload: { chatId, groupOfferingId: offering.groupOfferingId, offeringVersion: 1 },
    });

    const planConfirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/group-plans/${groupPlan.groupPlanId}/confirm`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'confirm-group-plan-api-1',
        'if-match': '1',
      },
      payload: {},
    });
    expect(planConfirmed.statusCode).toBe(200);
    expect(planConfirmed.json()).toMatchObject({
      data: { state: 'NOTIFIED', confirmedByPeer: true },
    });
    expect(confirmedGroupPlan.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'CONFIRM_GROUP_PLAN',
      expectedVersion: 1,
      payload: { groupPlanId: groupPlan.groupPlanId },
    });

    const groupConversions = await app.inject({
      method: 'GET', url: '/api/v1/me/group-plan-official-conversions',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(groupConversions.statusCode).toBe(200);
    expect(groupConversions.json()).toMatchObject({
      data: [{ conversionId: groupPlanConversionId, state: 'PENDING_CONFIRMATION' }],
    });
    expect(listGroupPlanOfficialConversionsForViewer).toHaveBeenCalledWith(userId);

    const groupConversionRequested = await app.inject({
      method: 'POST',
      url: `/api/v1/group-plans/${groupPlan.groupPlanId}/request-official-conversion`,
      headers: { authorization: `Bearer ${token}`,
        'idempotency-key': 'request-group-official-api-1', 'if-match': '2' },
      payload: { explicitRulesetAcknowledged: true },
    });
    expect(groupConversionRequested.statusCode).toBe(201);
    expect(requestGroupPlanOfficialConversion.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'REQUEST_GROUP_PLAN_OFFICIAL_CONVERSION',
      aggregateType: 'GroupPlan', aggregateId: groupPlan.groupPlanId, expectedVersion: 2,
      payload: { groupPlanId: groupPlan.groupPlanId, explicitRulesetAcknowledged: true },
    });

    const groupConversionConfirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/group-plan-official-conversions/${groupPlanConversionId}/decision`,
      headers: { authorization: `Bearer ${token}`,
        'idempotency-key': 'confirm-group-official-api-1', 'if-match': '1' },
      payload: { decision: 'ACCEPT', explicitRulesetAcknowledged: true },
    });
    expect(groupConversionConfirmed.statusCode).toBe(200);
    expect(groupConversionConfirmed.json()).toMatchObject({ data: { version: 2 } });
    expect(decideGroupPlanOfficialConversion.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'DECIDE_GROUP_PLAN_OFFICIAL_CONVERSION',
      aggregateType: 'GroupPlanOfficialConversion', aggregateId: groupPlanConversionId,
      expectedVersion: 1,
      payload: { conversionId: groupPlanConversionId, decision: 'ACCEPT' },
    });

    await app.ready();
    expect(app.swagger().paths).toHaveProperty('/api/v1/chats/{chatId}/training-options');
    expect(app.swagger().paths).toHaveProperty(
      '/api/v1/venues/{venueId}/admin-dashboard',
    );
    expect(app.swagger().paths).toHaveProperty('/api/v1/venues/{venueId}/slots');
    expect(app.swagger().paths).toHaveProperty('/api/v1/slots/{slotId}');
    expect(app.swagger().paths).toHaveProperty('/api/v1/slots/{slotId}/withdraw');
    expect(app.swagger().paths).toHaveProperty(
      '/api/v1/venues/{venueId}/group-offerings',
    );
    expect(app.swagger().paths).toHaveProperty(
      '/api/v1/group-offerings/{groupOfferingId}',
    );
    expect(app.swagger().paths).toHaveProperty(
      '/api/v1/group-offerings/{groupOfferingId}/withdraw',
    );
    expect(app.swagger().paths).toHaveProperty('/api/v1/bookings');
    expect(app.swagger().paths).toHaveProperty('/api/v1/bookings/{bookingId}/select-same');
    expect(app.swagger().paths).toHaveProperty('/api/v1/bookings/{bookingId}/withdraw');
    expect(app.swagger().paths).toHaveProperty('/api/v1/me/host-confirmations');
    expect(app.swagger().paths).toHaveProperty('/api/v1/bookings/{bookingId}/host-confirm');
    expect(app.swagger().paths).toHaveProperty('/api/v1/bookings/{bookingId}/host-reject');
    expect(app.swagger().paths).toHaveProperty('/api/v1/me/sessions');
    expect(app.swagger().paths).toHaveProperty('/api/v1/sessions/{sessionId}');
    expect(app.swagger().paths).toHaveProperty(
      '/api/v1/sessions/{sessionId}/official-conversion',
    );
    expect(app.swagger().paths).toHaveProperty(
      '/api/v1/booking-official-conversions/{conversionId}/decision',
    );
    expect(app.swagger().paths).toHaveProperty(
      '/api/v1/sessions/{sessionId}/cancel-training-participation',
    );
    expect(app.swagger().paths).toHaveProperty(
      '/api/v1/booking-solo-continuations/{continuationId}/decision',
    );
    expect(app.swagger().paths).toHaveProperty('/api/v1/sessions/{sessionId}/start');
    expect(app.swagger().paths).toHaveProperty('/api/v1/sessions/{sessionId}/attendance');
    expect(app.swagger().paths).toHaveProperty('/api/v1/sessions/{sessionId}/end');
    expect(app.swagger().paths).toHaveProperty('/api/v1/sessions/{sessionId}/replace-coach');
    expect(app.swagger().paths).toHaveProperty('/api/v1/sessions/{sessionId}/cancel-after-coach-replacement');
    expect(app.swagger().paths).toHaveProperty('/api/v1/sessions/{sessionId}/cancel-official');
    expect(app.swagger().paths).toHaveProperty('/api/v1/sessions/{sessionId}/fail-external');
    expect(app.swagger().paths).toHaveProperty('/api/v1/group-plans');
    expect(app.swagger().paths).toHaveProperty('/api/v1/group-plans/{groupPlanId}/confirm');
    expect(app.swagger().paths).toHaveProperty(
      '/api/v1/group-plans/{groupPlanId}/request-official-conversion',
    );
    expect(app.swagger().paths).toHaveProperty(
      '/api/v1/group-plan-official-conversions/{conversionId}/decision',
    );
  });

  it('[AC-061][AC-062][AC-064][AC-073][AC-172] exposes Challenge creation timers and reschedule flows', async () => {
    const chatId = '0199a1b2-1234-7000-8000-000000001101';
    const challengeId = '0199a1b2-1234-7000-8000-000000001102';
    const challenge: ChallengeProjection = {
      challengeId,
      competitionId: '0199a1b2-1234-7000-8000-000000001103',
      sourceChatId: chatId,
      serviceChatId: '0199a1b2-1234-7000-8000-000000001104',
      initiatorUserId: userId,
      initiatorDisplayName: 'Свободный атлет',
      recipientUserId: '0199a1b2-1234-7000-8000-000000001105',
      recipientDisplayName: 'Партнёр',
      responsePolicy: 'OPTIONAL',
      stake: 'NONE',
      state: 'AWAITING_RESPONSE',
      rulesetRef: 'MOLOKH_RECOMMENDED_V1',
      rulesetAckMode: 'IMPLICIT_ON_ACCEPT',
      responseDeadlineAt: '2026-09-10T10:00:00.000Z',
      acceptedAt: null,
      schedulingDeadlineAt: null,
      userRescheduleCount: 0,
      pairQuietUntil: null,
      viewerRole: 'INITIATOR',
      version: 1,
    };
    const chatProjection: ChatChallengeProjection = {
      challenge: null,
      mutualRescheduleRequest: null,
      canCreate: true,
      createDenialCode: null,
      policyVersion: 'challenge-mvp-v1',
    };
    const created = vi.fn().mockResolvedValue({
      responseStatus: 201,
      response: challenge,
      eventId: '0199a1b2-1234-7000-8000-000000001106',
      aggregateVersion: 1,
      replayed: false,
    });
    const acceptedProjection: ChallengeProjection = {
      ...challenge,
      state: 'ACCEPTED_UNSCHEDULED',
      acceptedAt: '2026-09-08T11:00:00.000Z',
      schedulingDeadlineAt: '2026-09-22T11:00:00.000Z',
      viewerRole: 'RECIPIENT',
      version: 2,
    };
    const accepted = vi.fn().mockResolvedValue({
      responseStatus: 200,
      response: acceptedProjection,
      eventId: '0199a1b2-1234-7000-8000-000000001107',
      aggregateVersion: 2,
      replayed: false,
    });
    const rescheduled = vi.fn(async (
      _command: CommandEnvelope<RescheduleChallengeByAthletePayload>,
      _ids: AthleteChallengeRescheduleEffectIds,
    ): Promise<ExecutedCommand<ChallengeProjection>> => ({
      responseStatus: 200,
      response: _command.payload.confirmForfeit
        ? {
            ...acceptedProjection,
            state: 'RESULT_RECORDED',
            userRescheduleCount: 2,
            version: _command.expectedVersion + 1,
          }
        : { ...acceptedProjection, userRescheduleCount: 1, version: 3 },
      eventId: '0199a1b2-1234-7000-8000-000000001108',
      aggregateVersion: 3,
      replayed: false,
    }));
    const mutualRequestId = '0199a1b2-1234-7000-8000-000000001109';
    const mutualRequest: MutualChallengeRescheduleRequestProjection = {
      requestId: mutualRequestId,
      challengeId,
      bookingId: null,
      sessionId: null,
      proposedByUserId: userId,
      confirmedByUserId: null,
      reasonCode: 'SCHEDULE_CHANGED',
      state: 'PROPOSED',
      proposedAt: '2026-09-08T12:00:00.000Z',
      confirmedAt: null,
      version: 1,
    };
    const mutualProposed = vi.fn(async (
      _command: CommandEnvelope<ProposeMutualChallengeReschedulePayload>,
      _ids: ProposeMutualChallengeRescheduleEffectIds,
    ): Promise<ExecutedCommand<MutualChallengeRescheduleRequestProjection>> => ({
      responseStatus: 201,
      response: mutualRequest,
      eventId: '0199a1b2-1234-7000-8000-000000001110',
      aggregateVersion: 1,
      replayed: false,
    }));
    const mutualConfirmed = vi.fn(async (
      _command: CommandEnvelope<ConfirmMutualChallengeReschedulePayload>,
      _ids: ConfirmMutualChallengeRescheduleEffectIds,
    ): Promise<ExecutedCommand<ChallengeProjection>> => ({
      responseStatus: 200,
      response: { ...acceptedProjection, userRescheduleCount: 1, version: 3 },
      eventId: '0199a1b2-1234-7000-8000-000000001111',
      aggregateVersion: 3,
      replayed: false,
    }));
    const app = await buildApp({
      challenge: {
        auth: new StaticBearerAuthAdapter(token, userId),
        readChatChallenge: vi.fn().mockResolvedValue(chatProjection),
        createDirectOpenChallenge: created,
        acceptOptionalChallenge: accepted,
        declineOptionalChallenge: vi.fn(),
        withdrawOptionalChallenge: vi.fn(),
        rescheduleChallengeByAthlete: rescheduled,
        proposeMutualChallengeReschedule: mutualProposed,
        confirmMutualChallengeReschedule: mutualConfirmed,
      },
    });
    apps.push(app);

    const read = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/challenge`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({ data: { challenge: null, canCreate: true } });

    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/challenges',
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'challenge-create-api-1',
        'if-match': '0',
      },
      payload: { sourceChatId: chatId },
    });
    expect(create.statusCode).toBe(201);
    expect(created.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'CREATE_DIRECT_OPEN_CHALLENGE',
      aggregateType: 'Challenge',
      expectedVersion: 0,
      payload: { sourceChatId: chatId },
    });
    expect(created.mock.calls[0]?.[1].reminderTimerOutboxMessageIds).toHaveLength(2);
    expect(new Set(created.mock.calls[0]?.[1].reminderTimerOutboxMessageIds).size).toBe(2);

    const accept = await app.inject({
      method: 'POST',
      url: `/api/v1/challenges/${challengeId}/accept`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'challenge-accept-api-1',
        'if-match': '1',
      },
      payload: {},
    });
    expect(accept.statusCode).toBe(200);
    expect(accepted.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'ACCEPT_OPTIONAL_CHALLENGE',
      aggregateId: challengeId,
      expectedVersion: 1,
      payload: { challengeId },
    });

    const reschedule = await app.inject({
      method: 'POST',
      url: `/api/v1/challenges/${challengeId}/reschedule`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'challenge-reschedule-api-1',
        'if-match': '2',
      },
      payload: { reasonCode: 'SCHEDULE_CHANGED' },
    });
    expect(reschedule.statusCode).toBe(200);
    expect(reschedule.json()).toMatchObject({
      data: { state: 'ACCEPTED_UNSCHEDULED', userRescheduleCount: 1, version: 3 },
    });
    expect(rescheduled.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'RESCHEDULE_CHALLENGE_BY_ATHLETE',
      aggregateType: 'Challenge',
      aggregateId: challengeId,
      expectedVersion: 2,
      payload: {
        challengeId,
        reasonCode: 'SCHEDULE_CHANGED',
        reasonNote: null,
        confirmForfeit: false,
      },
    });

    const limitForfeit = await app.inject({
      method: 'POST',
      url: `/api/v1/challenges/${challengeId}/reschedule`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'challenge-reschedule-limit-forfeit-api-1',
        'if-match': '4',
      },
      payload: { reasonCode: 'OTHER', confirmForfeit: true },
    });
    expect(limitForfeit.statusCode).toBe(200);
    expect(limitForfeit.json()).toMatchObject({
      data: { state: 'RESULT_RECORDED', userRescheduleCount: 2, version: 5 },
    });
    expect(rescheduled.mock.calls[1]?.[0]).toMatchObject({
      commandType: 'RESCHEDULE_CHALLENGE_BY_ATHLETE',
      aggregateId: challengeId,
      expectedVersion: 4,
      payload: {
        challengeId,
        reasonCode: 'OTHER',
        reasonNote: null,
        confirmForfeit: true,
      },
    });
    expect(rescheduled.mock.calls[1]?.[1]).toMatchObject({
      hostNotificationOutboxMessageId: expect.any(String),
      resultId: expect.any(String),
      resultEventId: expect.any(String),
      cooldownId: expect.any(String),
      timerOutboxMessageId: expect.any(String),
    });

    const proposeMutual = await app.inject({
      method: 'POST',
      url: `/api/v1/challenges/${challengeId}/mutual-reschedules`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'challenge-mutual-reschedule-propose-api-1',
        'if-match': '2',
      },
      payload: { reasonCode: 'SCHEDULE_CHANGED' },
    });
    expect(proposeMutual.statusCode).toBe(201);
    expect(proposeMutual.json()).toMatchObject({
      data: { requestId: mutualRequestId, state: 'PROPOSED', version: 1 },
    });
    expect(mutualProposed.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'PROPOSE_MUTUAL_CHALLENGE_RESCHEDULE',
      aggregateType: 'ChallengeMutualReschedule',
      expectedVersion: 0,
      payload: {
        challengeId,
        challengeVersion: 2,
        reasonCode: 'SCHEDULE_CHANGED',
        reasonNote: null,
      },
    });

    const confirmMutual = await app.inject({
      method: 'POST',
      url: `/api/v1/challenges/${challengeId}/mutual-reschedules/${mutualRequestId}/confirm`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'challenge-mutual-reschedule-confirm-api-1',
        'if-match': '2',
      },
      payload: { requestVersion: 1 },
    });
    expect(confirmMutual.statusCode).toBe(200);
    expect(confirmMutual.json()).toMatchObject({
      data: { state: 'ACCEPTED_UNSCHEDULED', userRescheduleCount: 1, version: 3 },
    });
    expect(mutualConfirmed.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'CONFIRM_MUTUAL_CHALLENGE_RESCHEDULE',
      aggregateType: 'Challenge',
      aggregateId: challengeId,
      expectedVersion: 2,
      payload: { challengeId, requestId: mutualRequestId, requestVersion: 1 },
    });

    await app.ready();
    expect(app.swagger().paths).toHaveProperty('/api/v1/chats/{chatId}/challenge');
    expect(app.swagger().paths).toHaveProperty('/api/v1/challenges');
    expect(app.swagger().paths).toHaveProperty('/api/v1/challenges/{challengeId}/accept');
    expect(app.swagger().paths).toHaveProperty('/api/v1/challenges/{challengeId}/decline');
    expect(app.swagger().paths).toHaveProperty('/api/v1/challenges/{challengeId}/withdraw');
    expect(app.swagger().paths).toHaveProperty('/api/v1/challenges/{challengeId}/reschedule');
    expect(app.swagger().paths).toHaveProperty('/api/v1/challenges/{challengeId}/mutual-reschedules');
    expect(app.swagger().paths).toHaveProperty('/api/v1/challenges/{challengeId}/mutual-reschedules/{requestId}/confirm');
  });
});
