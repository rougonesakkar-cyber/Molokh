import {
  IdentityValidationError,
  activateIdentity,
  normalizeDisplayName,
  projectIdentityCapabilities,
  type ActivateIdentityInput,
  type IdentityProjection,
  type CommandEnvelope,
} from '@molokh/core';
import { type Kysely, sql } from 'kysely';

import type { Database } from './index.js';
import {
  executeCriticalCommand,
  type ExecutedCommand,
} from './platform-command.js';

export interface IdentityEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
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
  database: Kysely<Database>,
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
): Promise<ExecutedCommand<IdentityProjection>> {
  if (command.payload.userId !== command.aggregateId) {
    throw new IdentityValidationError('userId');
  }
  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const identity = activateIdentity(command.payload, context.occurredAt);
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
