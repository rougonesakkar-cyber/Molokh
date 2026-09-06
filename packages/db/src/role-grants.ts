import {
  InvalidRoleGrantTransitionError,
  RoleGrantPermissionDeniedError,
  RoleGrantValidationError,
  acceptCoachInviteState,
  inviteCoachState,
  normalizeRoleReasonCode,
  type CommandEnvelope,
  type RoleGrantProjection,
  type RoleGrantState,
} from '@molokh/core';
import { type Kysely, type Transaction, sql } from 'kysely';

import type { Database } from './index.js';
import {
  executeCriticalCommand,
  type ExecutedCommand,
} from './platform-command.js';

export interface RoleGrantEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly notificationId: string;
}

export interface InviteCoachPayload {
  readonly userId: string;
  readonly communityId: string;
  readonly reasonCode: string;
  readonly invitationTtlHours: number;
}

export interface AcceptCoachInvitePayload {
  readonly userId: string;
}

export class RoleGrantNotFoundError extends Error {
  readonly code = 'ROLE_GRANT_NOT_FOUND';

  constructor() {
    super('Role grant was not found');
    this.name = 'RoleGrantNotFoundError';
  }
}

interface RoleGrantRow {
  readonly grant_id: string;
  readonly user_id: string;
  readonly role: RoleGrantProjection['role'];
  readonly scope_type: RoleGrantProjection['scopeType'];
  readonly scope_id: string | null;
  readonly state: RoleGrantState;
  readonly authorized_by: string | null;
  readonly authorized_at: Date | null;
  readonly expires_at: Date | null;
  readonly version: string;
}

interface CoachInviteContextRow {
  readonly community_state: 'ACTIVE' | 'PAUSED' | 'CLOSING' | 'CLOSED';
  readonly venue_id: string;
  readonly target_account_state: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
  readonly target_verification_state:
    | 'NOT_STARTED'
    | 'PENDING'
    | 'VERIFIED'
    | 'REJECTED'
    | 'EXPIRED'
    | 'REVOKED';
}

function projectRoleGrant(row: RoleGrantRow): RoleGrantProjection {
  return {
    grantId: row.grant_id,
    userId: row.user_id,
    role: row.role,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    state: row.state,
    authorizedBy: row.authorized_by,
    authorizedAt: row.authorized_at?.toISOString() ?? null,
    expiresAt: row.expires_at?.toISOString() ?? null,
    version: Number(row.version),
  };
}

async function selectRoleGrant(
  database: Kysely<Database> | Transaction<Database>,
  grantId: string,
  forUpdate = false,
): Promise<RoleGrantRow | null> {
  const lock = forUpdate ? sql`for update` : sql``;
  const result = await sql<RoleGrantRow>`
    select
      grant_id, user_id, role, scope_type, scope_id, state,
      authorized_by, authorized_at, expires_at, version::text as version
    from community.role_grants
    where grant_id = ${grantId}::uuid
    ${lock}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function coachInviteContext(
  transaction: Transaction<Database>,
  communityId: string,
  targetUserId: string,
): Promise<CoachInviteContextRow | null> {
  const resourceResult = await sql<{
    readonly community_state: CoachInviteContextRow['community_state'];
    readonly venue_id: string;
    readonly target_account_state: CoachInviteContextRow['target_account_state'];
  }>`
    select
      community.state as community_state,
      community.venue_id,
      target.account_state as target_account_state
    from community.communities as community
    cross join identity.users as target
    where community.community_id = ${communityId}::uuid
      and target.user_id = ${targetUserId}::uuid
    for update of community, target
  `.execute(transaction);
  const resource = resourceResult.rows[0];
  if (!resource) return null;
  const verificationResult = await sql<{
    readonly state: CoachInviteContextRow['target_verification_state'];
  }>`
    select state
    from identity.account_verifications
    where user_id = ${targetUserId}::uuid and is_current
    for share
  `.execute(transaction);
  return {
    ...resource,
    target_verification_state: verificationResult.rows[0]?.state ?? 'NOT_STARTED',
  };
}

async function actorControlsVenue(
  transaction: Transaction<Database>,
  actorId: string,
  venueId: string,
): Promise<boolean> {
  const result = await sql<{ readonly grant_id: string }>`
    select grant_id
    from community.role_grants
    where user_id = ${actorId}::uuid
      and state = 'ACTIVE'
      and (
        (role = 'CENTRAL_ADMIN' and scope_type = 'GLOBAL' and scope_id is null)
        or (
          role in ('PRIMARY_ADMIN', 'GYM_ADMIN')
          and scope_type = 'VENUE'
          and scope_id = ${venueId}::uuid
        )
      )
    limit 1
    for share
  `.execute(transaction);
  return result.rows.length === 1;
}

export async function readRoleGrant(
  database: Kysely<Database>,
  grantId: string,
): Promise<RoleGrantProjection | null> {
  const row = await selectRoleGrant(database, grantId);
  return row ? projectRoleGrant(row) : null;
}

export async function inviteCoach(
  database: Kysely<Database>,
  command: CommandEnvelope<InviteCoachPayload>,
  ids: RoleGrantEffectIds,
): Promise<ExecutedCommand<RoleGrantProjection>> {
  if (!command.actor.id) throw new RoleGrantPermissionDeniedError();
  const reasonCode = normalizeRoleReasonCode(command.payload.reasonCode);

  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const inviteContext = await coachInviteContext(
        transaction,
        command.payload.communityId,
        command.payload.userId,
      );
      if (!inviteContext) throw new RoleGrantNotFoundError();
      const actorId = command.actor.id;
      if (!actorId) throw new RoleGrantPermissionDeniedError();
      const controlsScope = await actorControlsVenue(
        transaction,
        actorId,
        inviteContext.venue_id,
      );
      const next = inviteCoachState({
        actorControlsScope: controlsScope,
        communityState: inviteContext.community_state,
        targetAccountState: inviteContext.target_account_state,
        targetVerificationState: inviteContext.target_verification_state,
        invitationTtlHours: command.payload.invitationTtlHours,
        occurredAt: context.occurredAt,
      });

      const relationshipLock = `coach-invite:${command.payload.communityId}:${command.payload.userId}`;
      await sql`select pg_advisory_xact_lock(hashtextextended(${relationshipLock}, 0))`.execute(
        transaction,
      );
      const existing = await sql<{ readonly state: RoleGrantState }>`
        select state
        from community.role_grants
        where user_id = ${command.payload.userId}::uuid
          and role = 'COACH'
          and scope_type = 'COMMUNITY'
          and scope_id = ${command.payload.communityId}::uuid
          and state in ('PENDING', 'ACTIVE')
        limit 1
      `.execute(transaction);
      if (existing.rows[0]) {
        throw new InvalidRoleGrantTransitionError(existing.rows[0].state);
      }

      await sql`
        insert into community.role_grants (
          grant_id, user_id, role, scope_type, scope_id, state,
          authorized_by, authorized_at, expires_at, version
        ) values (
          ${command.aggregateId}::uuid, ${command.payload.userId}::uuid,
          'COACH', 'COMMUNITY', ${command.payload.communityId}::uuid, ${next.state},
          ${actorId}::uuid, null, ${next.expiresAt}::timestamptz, ${context.nextVersion}
        )
      `.execute(transaction);
      const response: RoleGrantProjection = {
        grantId: command.aggregateId,
        userId: command.payload.userId,
        role: 'COACH',
        scopeType: 'COMMUNITY',
        scopeId: command.payload.communityId,
        state: next.state,
        authorizedBy: actorId,
        authorizedAt: null,
        expiresAt: next.expiresAt,
        version: context.nextVersion,
      };
      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'CoachInvited',
          schemaVersion: 1,
          transitionId: 'RG-01',
          payload: {
            grantId: command.aggregateId,
            userId: command.payload.userId,
            communityId: command.payload.communityId,
            expiresAt: next.expiresAt,
          },
          metadata: { policyVersion: 'roles-mvp-v1' },
        },
        audit: {
          auditId: ids.auditId,
          action: 'INVITE_COACH',
          transitionId: 'RG-01',
          reasonCode,
          beforeState: null,
          afterState: next.state,
          metadata: {
            targetUserId: command.payload.userId,
            communityId: command.payload.communityId,
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: [
                {
                  notificationId: ids.notificationId,
                  recipientUserId: command.payload.userId,
                  category: 'SERVICE',
                  renderKey: 'community.coach_invited',
                  actionTarget: { type: 'ROLE_GRANT', id: command.aggregateId },
                  payload: { communityId: command.payload.communityId },
                  deadlineAt: next.expiresAt,
                },
              ],
            },
          },
        ],
      };
    },
  });
}

export async function acceptCoachInvite(
  database: Kysely<Database>,
  command: CommandEnvelope<AcceptCoachInvitePayload>,
  ids: RoleGrantEffectIds,
): Promise<ExecutedCommand<RoleGrantProjection>> {
  if (command.actor.id !== command.payload.userId) {
    throw new RoleGrantPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const current = await selectRoleGrant(transaction, command.aggregateId, true);
      if (
        !current ||
        current.role !== 'COACH' ||
        current.scope_type !== 'COMMUNITY' ||
        !current.scope_id
      ) {
        throw new RoleGrantNotFoundError();
      }
      const inviteContext = await coachInviteContext(
        transaction,
        current.scope_id,
        current.user_id,
      );
      if (!inviteContext) throw new RoleGrantNotFoundError();
      const nextState = acceptCoachInviteState({
        actorIsInvitee: current.user_id === command.actor.id,
        currentState: current.state,
        communityState: inviteContext.community_state,
        targetAccountState: inviteContext.target_account_state,
        targetVerificationState: inviteContext.target_verification_state,
        expiresAt: current.expires_at?.toISOString() ?? null,
        occurredAt: context.occurredAt,
      });
      if (!current.authorized_by) throw new RoleGrantValidationError('authorizedBy');

      await sql`
        update community.role_grants
        set state = ${nextState},
            authorized_at = ${context.occurredAt.toISOString()}::timestamptz,
            expires_at = null,
            version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where grant_id = ${command.aggregateId}::uuid
      `.execute(transaction);
      const response: RoleGrantProjection = {
        ...projectRoleGrant(current),
        state: nextState,
        authorizedAt: context.occurredAt.toISOString(),
        expiresAt: null,
        version: context.nextVersion,
      };
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'CoachAuthorized',
          schemaVersion: 1,
          transitionId: 'RG-02',
          payload: {
            grantId: command.aggregateId,
            userId: current.user_id,
            communityId: current.scope_id,
          },
          metadata: { policyVersion: 'roles-mvp-v1' },
        },
        audit: {
          auditId: ids.auditId,
          action: 'ACCEPT_COACH_ROLE',
          transitionId: 'RG-02',
          reasonCode: 'INVITEE_ACCEPTED',
          beforeState: current.state,
          afterState: nextState,
          metadata: { communityId: current.scope_id },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'notification.in_app.v1',
            payload: {
              notifications: [
                {
                  notificationId: ids.notificationId,
                  recipientUserId: current.authorized_by,
                  category: 'SERVICE',
                  renderKey: 'community.coach_authorized',
                  actionTarget: { type: 'ROLE_GRANT', id: command.aggregateId },
                  payload: {
                    communityId: current.scope_id,
                    coachUserId: current.user_id,
                  },
                  deadlineAt: null,
                },
              ],
            },
          },
        ],
      };
    },
  });
}

export async function listPendingCoachInvites(
  database: Kysely<Database>,
  userId: string,
): Promise<readonly RoleGrantProjection[]> {
  const result = await sql<RoleGrantRow>`
    select
      grant_id, user_id, role, scope_type, scope_id, state,
      authorized_by, authorized_at, expires_at, version::text as version
    from community.role_grants
    where user_id = ${userId}::uuid
      and role = 'COACH'
      and scope_type = 'COMMUNITY'
      and state = 'PENDING'
    order by created_at, grant_id
  `.execute(database);
  return result.rows.map(projectRoleGrant);
}
