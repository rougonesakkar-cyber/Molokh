import {
  IdentityPermissionDeniedError,
  IdentityValidationError,
  adultTransitionAt,
  approveVerificationState,
  activateIdentity,
  normalizeChecklistVersion,
  normalizeDisplayName,
  normalizeSportPreferences,
  projectIdentityCapabilities,
  startVerificationState,
  type ActivateIdentityInput,
  type IdentityProjection,
  type CommandEnvelope,
} from '@molokh/core';
import { type Kysely, type Transaction, sql } from 'kysely';

import type { Database } from './index.js';
import {
  executeCriticalCommand,
  type ExecutedCommand,
} from './platform-command.js';

export interface IdentityEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly ageTransitionTimerOutboxMessageId?: string;
}

interface IdentityRow {
  readonly user_id: string;
  readonly display_name: string;
  readonly age_division: 'YOUTH' | 'ADULT';
  readonly account_state: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
  readonly phone_verified: boolean;
  readonly verification_state:
    | 'NOT_STARTED'
    | 'PENDING'
    | 'VERIFIED'
    | 'REJECTED'
    | 'EXPIRED'
    | 'REVOKED';
  readonly primary_sport: string;
  readonly secondary_sport: string | null;
  readonly discovery_radius_km: number;
  readonly version: string;
}

export interface ChangeDisplayNamePayload {
  readonly displayName: string;
}

export interface ChangeSportsPayload {
  readonly primarySport: string;
  readonly secondarySport: string | null;
}

export interface StartVerificationPayload {
  readonly userId: string;
  readonly moderationChecklistVersion: string;
}

export interface ApproveVerificationPayload {
  readonly userId: string;
  readonly moderationChecklistVersion: string;
}

export class IdentityNotFoundError extends Error {
  readonly code = 'IDENTITY_NOT_FOUND';

  constructor() {
    super('Identity was not found');
    this.name = 'IdentityNotFoundError';
  }
}

function projectRow(row: IdentityRow): IdentityProjection {
  return projectIdentityCapabilities({
    userId: row.user_id,
    displayName: row.display_name,
    ageDivision: row.age_division,
    accountState: row.account_state,
    phoneVerified: row.phone_verified,
    accountVerificationState: row.verification_state,
    primarySport: row.primary_sport,
    secondarySport: row.secondary_sport,
    discoveryRadiusKm: row.discovery_radius_km,
    version: Number(row.version),
  });
}

async function selectIdentity(
  database: Kysely<Database> | Transaction<Database>,
  userId: string,
): Promise<IdentityRow | null> {
  const result = await sql<IdentityRow>`
    select
      users.user_id,
      users.display_name,
      users.age_division,
      users.account_state,
      (users.phone_verified_at is not null) as phone_verified,
      coalesce(verification.state, 'NOT_STARTED') as verification_state,
      profile.primary_sport,
      profile.secondary_sport,
      profile.discovery_radius_km,
      users.version::text as version
    from identity.users as users
    join identity.athlete_profiles as profile on profile.user_id = users.user_id
    left join identity.account_verifications as verification
      on verification.user_id = users.user_id and verification.is_current
    where users.user_id = ${userId}::uuid
  `.execute(database);
  return result.rows[0] ?? null;
}

function withVerificationState(
  identity: IdentityProjection,
  accountVerificationState: IdentityProjection['accountVerificationState'],
): IdentityProjection {
  return projectIdentityCapabilities({
    userId: identity.userId,
    displayName: identity.displayName,
    ageDivision: identity.ageDivision,
    accountState: identity.accountState,
    phoneVerified: identity.phoneVerified,
    accountVerificationState,
    primarySport: identity.primarySport,
    secondarySport: identity.secondarySport,
    discoveryRadiusKm: identity.discoveryRadiusKm,
    version: identity.version,
  });
}

export async function readIdentityProjection(
  database: Kysely<Database>,
  userId: string,
): Promise<IdentityProjection | null> {
  const row = await selectIdentity(database, userId);
  return row ? projectRow(row) : null;
}

export async function activateUser(
  database: Kysely<Database>,
  command: CommandEnvelope<ActivateIdentityInput>,
  ids: IdentityEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<IdentityProjection>> {
  if (command.payload.userId !== command.aggregateId) {
    throw new IdentityValidationError('userId');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const identity = activateIdentity(command.payload, context.occurredAt);
      if (identity.ageDivision === 'YOUTH' && !ids.ageTransitionTimerOutboxMessageId) {
        throw new TypeError('Youth activation age-transition timer effect ID is required');
      }
      await sql`
        insert into identity.users (
          user_id, phone_e164, phone_verified_at, birth_date, age_division,
          display_name, account_state, locale, version, activated_at
        ) values (
          ${command.payload.userId}::uuid,
          ${identity.phoneE164},
          ${identity.phoneVerifiedAt}::timestamptz,
          ${identity.birthDate}::date,
          ${identity.ageDivision},
          ${identity.displayName},
          'ACTIVE',
          ${identity.locale},
          ${context.nextVersion},
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into identity.athlete_profiles (
          user_id, primary_sport, secondary_sport, discovery_radius_km
        ) values (
          ${command.payload.userId}::uuid,
          ${identity.primarySport},
          ${identity.secondarySport},
          ${identity.discoveryRadiusKm}
        )
      `.execute(transaction);

      const response = projectIdentityCapabilities({
        userId: command.payload.userId,
        displayName: identity.displayName,
        ageDivision: identity.ageDivision,
        accountState: 'ACTIVE',
        phoneVerified: true,
        accountVerificationState: 'NOT_STARTED',
        primarySport: identity.primarySport,
        secondarySport: identity.secondarySport,
        discoveryRadiusKm: identity.discoveryRadiusKm,
        version: context.nextVersion,
      });

      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'UserAccountActivated',
          schemaVersion: 1,
          transitionId: 'U-01',
          payload: {
            userId: command.payload.userId,
            ageDivision: identity.ageDivision,
          },
          metadata: { policyVersion: 'identity-v1' },
        },
        audit: {
          auditId: ids.auditId,
          action: 'ACTIVATE_ACCOUNT',
          transitionId: 'U-01',
          reasonCode: null,
          beforeState: null,
          afterState: 'ACTIVE',
          metadata: { ageDivision: identity.ageDivision },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'identity.user.activated.v1',
            payload: {
              userId: command.payload.userId,
              version: context.nextVersion,
            },
          },
          ...(identity.ageDivision === 'YOUTH'
            ? [{
                messageId: ids.ageTransitionTimerOutboxMessageId!,
                topic: 'identity.age-division-timer.v1',
                payload: {
                  userId: command.payload.userId,
                  timer: {
                    commandType: 'TRANSITION_TO_ADULT',
                    aggregateType: 'AgeDivisionTransition',
                    aggregateId: command.payload.userId,
                    expectedState: 'YOUTH',
                    expectedVersion: 0,
                    deadlineAt: adultTransitionAt(identity.birthDate).toISOString(),
                    policyVersion: 'identity-v1',
                    idempotencyKey: `age-division:${command.payload.userId}:adult:v1`,
                  },
                },
              }]
            : []),
        ],
      };
    },
  });
}

export async function changeDisplayName(
  database: Kysely<Database>,
  command: CommandEnvelope<ChangeDisplayNamePayload>,
  ids: IdentityEffectIds,
): Promise<ExecutedCommand<IdentityProjection>> {
  if (command.actor.id !== command.aggregateId) {
    throw new IdentityNotFoundError();
  }
  const displayName = normalizeDisplayName(command.payload.displayName);

  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const currentResult = await sql<IdentityRow>`
        select
          users.user_id,
          users.display_name,
          users.age_division,
          users.account_state,
          (users.phone_verified_at is not null) as phone_verified,
          coalesce(verification.state, 'NOT_STARTED') as verification_state,
          profile.primary_sport,
          profile.secondary_sport,
          profile.discovery_radius_km,
          users.version::text as version
        from identity.users as users
        join identity.athlete_profiles as profile on profile.user_id = users.user_id
        left join identity.account_verifications as verification
          on verification.user_id = users.user_id and verification.is_current
        where users.user_id = ${command.aggregateId}::uuid
        for update of users
      `.execute(transaction);
      const current = currentResult.rows[0];
      if (!current) throw new IdentityNotFoundError();
      if (current.account_state !== 'ACTIVE') {
        throw new IdentityValidationError('accountState');
      }
      if (current.display_name === displayName) {
        throw new IdentityValidationError('displayName');
      }

      await sql`
        update identity.users
        set display_name = ${displayName},
            version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where user_id = ${command.aggregateId}::uuid
      `.execute(transaction);
      await sql`
        insert into identity.display_name_audit (
          audit_id, user_id, changed_by, previous_display_name,
          new_display_name, request_id, occurred_at
        ) values (
          ${ids.auditId}::uuid,
          ${command.aggregateId}::uuid,
          ${command.actor.id}::uuid,
          ${current.display_name},
          ${displayName},
          ${command.requestId}::uuid,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);

      const response = projectIdentityCapabilities({
        userId: current.user_id,
        displayName,
        ageDivision: current.age_division,
        accountState: current.account_state,
        phoneVerified: current.phone_verified,
        accountVerificationState: current.verification_state,
        primarySport: current.primary_sport,
        secondarySport: current.secondary_sport,
        discoveryRadiusKm: current.discovery_radius_km,
        version: context.nextVersion,
      });

      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'DisplayNameChanged',
          schemaVersion: 1,
          transitionId: null,
          payload: { userId: current.user_id, displayName },
          metadata: { policyVersion: 'identity-v1' },
        },
        audit: {
          auditId: ids.auditId,
          action: 'CHANGE_DISPLAY_NAME',
          transitionId: null,
          reasonCode: null,
          beforeState: current.account_state,
          afterState: current.account_state,
          metadata: { displayNameChanged: true },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'identity.display_name.changed.v1',
            payload: { userId: current.user_id, version: context.nextVersion },
          },
        ],
      };
    },
  });
}

export async function changeSports(
  database: Kysely<Database>,
  command: CommandEnvelope<ChangeSportsPayload>,
  ids: IdentityEffectIds,
): Promise<ExecutedCommand<IdentityProjection>> {
  if (command.actor.id !== command.aggregateId) {
    throw new IdentityNotFoundError();
  }
  const sports = normalizeSportPreferences(command.payload);

  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const currentResult = await sql<IdentityRow>`
        select
          users.user_id,
          users.display_name,
          users.age_division,
          users.account_state,
          (users.phone_verified_at is not null) as phone_verified,
          coalesce(verification.state, 'NOT_STARTED') as verification_state,
          profile.primary_sport,
          profile.secondary_sport,
          profile.discovery_radius_km,
          users.version::text as version
        from identity.users as users
        join identity.athlete_profiles as profile on profile.user_id = users.user_id
        left join identity.account_verifications as verification
          on verification.user_id = users.user_id and verification.is_current
        where users.user_id = ${command.aggregateId}::uuid
        for update of users, profile
      `.execute(transaction);
      const current = currentResult.rows[0];
      if (!current) throw new IdentityNotFoundError();
      if (current.account_state !== 'ACTIVE') {
        throw new IdentityValidationError('accountState');
      }
      if (
        current.primary_sport === sports.primarySport &&
        current.secondary_sport === sports.secondarySport
      ) {
        throw new IdentityValidationError('sports');
      }

      await sql`
        update identity.athlete_profiles
        set primary_sport = ${sports.primarySport},
            secondary_sport = ${sports.secondarySport},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where user_id = ${command.aggregateId}::uuid
      `.execute(transaction);
      await sql`
        update identity.users
        set version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where user_id = ${command.aggregateId}::uuid
      `.execute(transaction);

      const response = projectIdentityCapabilities({
        userId: current.user_id,
        displayName: current.display_name,
        ageDivision: current.age_division,
        accountState: current.account_state,
        phoneVerified: current.phone_verified,
        accountVerificationState: current.verification_state,
        primarySport: sports.primarySport,
        secondarySport: sports.secondarySport,
        discoveryRadiusKm: current.discovery_radius_km,
        version: context.nextVersion,
      });

      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'SportPreferencesChanged',
          schemaVersion: 1,
          transitionId: null,
          payload: { userId: current.user_id, ...sports },
          metadata: { policyVersion: 'identity-v1' },
        },
        audit: {
          auditId: ids.auditId,
          action: 'CHANGE_SPORTS',
          transitionId: null,
          reasonCode: null,
          beforeState: current.account_state,
          afterState: current.account_state,
          metadata: {
            previousPrimarySport: current.primary_sport,
            previousSecondarySport: current.secondary_sport,
            ...sports,
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'identity.sports.changed.v1',
            payload: { userId: current.user_id, version: context.nextVersion, ...sports },
          },
        ],
      };
    },
  });
}

export async function startAccountVerification(
  database: Kysely<Database>,
  command: CommandEnvelope<StartVerificationPayload>,
  ids: IdentityEffectIds,
): Promise<ExecutedCommand<IdentityProjection>> {
  if (command.actor.id !== command.payload.userId) throw new IdentityNotFoundError();
  const checklistVersion = normalizeChecklistVersion(
    command.payload.moderationChecklistVersion,
  );

  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      await sql`
        select user_id
        from identity.users
        where user_id = ${command.payload.userId}::uuid
        for update
      `.execute(transaction);
      const identityRow = await selectIdentity(transaction, command.payload.userId);
      if (!identityRow) throw new IdentityNotFoundError();
      const identity = projectRow(identityRow);
      const currentResult = await sql<{ readonly state: IdentityProjection['accountVerificationState'] }>`
        select state
        from identity.account_verifications
        where user_id = ${command.payload.userId}::uuid and is_current
        for update
      `.execute(transaction);
      const currentState = currentResult.rows[0]?.state ?? 'NOT_STARTED';
      const nextState = startVerificationState({
        currentState,
        accountState: identity.accountState,
        phoneVerified: identity.phoneVerified,
      });

      await sql`
        insert into identity.account_verifications (
          verification_id, user_id, state, method,
          moderation_checklist_version, is_current, expires_at, version
        ) values (
          ${command.aggregateId}::uuid, ${command.payload.userId}::uuid,
          ${nextState}, 'CENTRAL_MODERATION', ${checklistVersion}, true, null,
          ${context.nextVersion}
        )
      `.execute(transaction);
      const response = withVerificationState(identity, nextState);

      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'VerificationStarted',
          schemaVersion: 1,
          transitionId: 'V-01',
          payload: {
            verificationId: command.aggregateId,
            userId: command.payload.userId,
            method: 'CENTRAL_MODERATION',
            moderationChecklistVersion: checklistVersion,
          },
          metadata: { policyVersion: 'identity-v1' },
        },
        audit: {
          auditId: ids.auditId,
          action: 'START_VERIFICATION',
          transitionId: 'V-01',
          reasonCode: null,
          beforeState: 'NOT_STARTED',
          afterState: nextState,
          metadata: { moderationChecklistVersion: checklistVersion },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'identity.verification.started.v1',
            payload: {
              verificationId: command.aggregateId,
              userId: command.payload.userId,
              version: context.nextVersion,
            },
          },
        ],
      };
    },
  });
}

export async function approveAccountVerification(
  database: Kysely<Database>,
  command: CommandEnvelope<ApproveVerificationPayload>,
  ids: IdentityEffectIds,
): Promise<ExecutedCommand<IdentityProjection>> {
  if (!command.actor.id) throw new IdentityPermissionDeniedError();
  const checklistVersion = normalizeChecklistVersion(
    command.payload.moderationChecklistVersion,
  );

  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const centralGrant = await sql<{ readonly allowed: boolean }>`
        select true as allowed
        from community.role_grants
        where user_id = ${command.actor.id}::uuid
          and role = 'CENTRAL_ADMIN'
          and scope_type = 'GLOBAL'
          and scope_id is null
          and state = 'ACTIVE'
        limit 1
      `.execute(transaction);
      if (!centralGrant.rows[0]?.allowed) throw new IdentityPermissionDeniedError();

      const verificationResult = await sql<{
        readonly user_id: string;
        readonly state: IdentityProjection['accountVerificationState'];
        readonly moderation_checklist_version: string;
      }>`
        select user_id, state, moderation_checklist_version
        from identity.account_verifications
        where verification_id = ${command.aggregateId}::uuid and is_current
        for update
      `.execute(transaction);
      const verification = verificationResult.rows[0];
      if (!verification || verification.user_id !== command.payload.userId) {
        throw new IdentityNotFoundError();
      }
      if (verification.moderation_checklist_version !== checklistVersion) {
        throw new IdentityValidationError('moderationChecklistVersion');
      }
      const identityRow = await selectIdentity(transaction, command.payload.userId);
      if (!identityRow) throw new IdentityNotFoundError();
      const identity = projectRow(identityRow);
      const nextState = approveVerificationState({
        currentState: verification.state,
        accountState: identity.accountState,
        phoneVerified: identity.phoneVerified,
        moderationChecksPassed: true,
      });
      await sql`
        update identity.account_verifications
        set state = ${nextState},
            verified_at = ${context.occurredAt.toISOString()}::timestamptz,
            decided_by = ${command.actor.id}::uuid,
            decision_reason = 'PROFILE_PHONE_DUPLICATE_CHECKS_PASSED',
            version = ${context.nextVersion}
        where verification_id = ${command.aggregateId}::uuid
      `.execute(transaction);
      return {
        responseStatus: 200,
        response: withVerificationState(identity, nextState),
        event: {
          eventId: ids.eventId,
          eventName: 'AccountVerified',
          schemaVersion: 1,
          transitionId: 'V-02',
          payload: {
            verificationId: command.aggregateId,
            userId: command.payload.userId,
            method: 'CENTRAL_MODERATION',
            moderationChecklistVersion: checklistVersion,
          },
          metadata: { policyVersion: 'identity-v1' },
        },
        audit: {
          auditId: ids.auditId,
          action: 'APPROVE_VERIFICATION',
          transitionId: 'V-02',
          reasonCode: 'PROFILE_PHONE_DUPLICATE_CHECKS_PASSED',
          beforeState: verification.state,
          afterState: nextState,
          metadata: { moderationChecklistVersion: checklistVersion },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'identity.account.verified.v1',
            payload: {
              verificationId: command.aggregateId,
              userId: command.payload.userId,
              version: context.nextVersion,
            },
          },
        ],
      };
    },
  });
}

export interface PendingVerificationProjection {
  readonly verificationId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly ageDivision: IdentityProjection['ageDivision'];
  readonly moderationChecklistVersion: string;
  readonly createdAt: string;
  readonly version: number;
}

export async function listPendingVerifications(
  database: Kysely<Database>,
  centralUserId: string,
): Promise<readonly PendingVerificationProjection[]> {
  const centralGrant = await sql<{ readonly allowed: boolean }>`
    select true as allowed
    from community.role_grants
    where user_id = ${centralUserId}::uuid
      and role = 'CENTRAL_ADMIN'
      and scope_type = 'GLOBAL'
      and scope_id is null
      and state = 'ACTIVE'
    limit 1
  `.execute(database);
  if (!centralGrant.rows[0]?.allowed) throw new IdentityPermissionDeniedError();

  const result = await sql<{
    readonly verification_id: string;
    readonly user_id: string;
    readonly display_name: string;
    readonly age_division: IdentityProjection['ageDivision'];
    readonly moderation_checklist_version: string;
    readonly created_at: Date;
    readonly version: string;
  }>`
    select
      verification.verification_id,
      verification.user_id,
      users.display_name,
      users.age_division,
      verification.moderation_checklist_version,
      verification.created_at,
      verification.version::text as version
    from identity.account_verifications as verification
    join identity.users as users on users.user_id = verification.user_id
    where verification.state = 'PENDING' and verification.is_current
    order by verification.created_at, verification.verification_id
  `.execute(database);
  return result.rows.map((row) => ({
    verificationId: row.verification_id,
    userId: row.user_id,
    displayName: row.display_name,
    ageDivision: row.age_division,
    moderationChecklistVersion: row.moderation_checklist_version,
    createdAt: row.created_at.toISOString(),
    version: Number(row.version),
  }));
}
