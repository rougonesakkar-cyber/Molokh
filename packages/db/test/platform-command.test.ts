import {
  IdempotencyKeyReusedError,
  IdentityPermissionDeniedError,
  IdentityValidationError,
  InvalidRoleGrantTransitionError,
  RoleGrantPermissionDeniedError,
  RoleGrantValidationError,
  VersionConflictError,
  type ActivateIdentityInput,
  type CommandEnvelope,
} from '@molokh/core';
import { sql, type Transaction } from 'kysely';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  activateUser,
  acceptCoachInvite,
  appointGymAdmin,
  approveAccountVerification,
  changeDisplayName,
  changePrimaryAdmin,
  claimOutboxBatch,
  claimInboxEvent,
  createDatabase,
  executeCriticalCommand,
  ensureLocalPilotCommunity,
  hashCommandRequest,
  markOutboxPublished,
  markNotificationRead,
  listPendingVerifications,
  listPendingCoachInvites,
  projectNotificationBatch,
  readCommunityContext,
  readDiscoveryCards,
  readIdentityProjection,
  readVenueRoleSummary,
  inviteCoach,
  releaseOutboxFailure,
  runMigrations,
  startAccountVerification,
  type CriticalCommandEffect,
  type Database,
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
        social.discovery_pair_suppressions,
        social.blocks,
        social.matches,
        social.likes,
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
          expectedVersion: 2,
          payload: { displayName: 'Скрытая смена' },
        },
        renameIds,
      ),
    ).rejects.toBeInstanceOf(IdentityValidationError);
  });

  it('invites and authorizes a verified Community Coach with database-backed scope checks', async () => {
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

  it('projects only eligible Discovery cards with visible deterministic rank reasons', async () => {
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
});
