import {
  InvalidRoleGrantTransitionError,
  RoleGrantPermissionDeniedError,
  RoleGrantValidationError,
  acceptCoachInviteState,
  approvePrimaryAdminSuccessorState,
  assertExpectedVersion,
  authorizeGuestCoachState,
  appointGymAdminState,
  changePrimaryAdminState,
  expireGuestCoachState,
  inviteCoachState,
  normalizeRoleReasonCode,
  proposePrimaryAdminSuccessorState,
  rejectVenueState,
  verifyVenueState,
  type CommandEnvelope,
  type RoleGrantProjection,
  type RoleGrantState,
  type GuestCoachExpirationReason,
  type ResultState,
  type SessionState,
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

export interface AuthorizeGuestCoachPayload {
  readonly userId: string;
  readonly sessionId: string;
  readonly reasonCode: string;
}

export interface ExpireGuestCoachPayload {
  readonly grantId: string;
  readonly sessionId: string;
  readonly reason: GuestCoachExpirationReason;
}

export interface ExpirableGuestCoachGrant {
  readonly grantId: string;
  readonly sessionId: string;
  readonly version: number;
  readonly reason: GuestCoachExpirationReason;
}

export interface AppointGymAdminPayload {
  readonly userId: string;
  readonly venueId: string;
  readonly reasonCode: string;
}

export interface ChangePrimaryAdminPayload extends AppointGymAdminPayload {}

export interface PrimaryAdminEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly primaryGrantId: string;
  readonly targetNotificationId: string;
  readonly previousNotificationId: string;
}

export interface PrimaryAdminProjection {
  readonly venueId: string;
  readonly primaryGrantId: string;
  readonly primaryAdminUserId: string;
  readonly previousPrimaryAdminUserId: string | null;
  readonly change: 'APPOINTED' | 'TRANSFERRED';
  readonly version: number;
}

export interface ProposePrimaryAdminSuccessorPayload extends AppointGymAdminPayload {}

export interface ApprovePrimaryAdminSuccessorPayload {
  readonly proposalId: string;
  readonly reasonCode: string;
}

export interface PrimaryAdminSuccessorEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
}

export interface PrimaryAdminSuccessorApprovalEffectIds
  extends PrimaryAdminSuccessorEffectIds {
  readonly primaryEventId: string;
  readonly primaryGrantId: string;
  readonly targetNotificationId: string;
  readonly previousNotificationId: string;
}

export interface PrimaryAdminSuccessorProjection {
  readonly proposalId: string;
  readonly venueId: string;
  readonly proposedByUserId: string;
  readonly targetUserId: string;
  readonly state: 'PENDING' | 'APPROVED';
  readonly proposedAt: string;
  readonly approvedAt: string | null;
  readonly approvedByUserId: string | null;
  readonly primaryGrantId: string | null;
  readonly primaryAdminVersion: number | null;
  readonly version: number;
}

export interface VenueRoleSummaryProjection {
  readonly venueId: string;
  readonly primaryAdminVersion: number;
  readonly activeGrants: readonly RoleGrantProjection[];
}

export interface VerifyVenuePayload {
  readonly venueId: string;
  readonly checklistVersion: string;
  readonly evidenceReference: string;
  readonly reasonCode: string;
}

export interface VenueVerificationEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
}

export interface VenueVerificationProjection {
  readonly venueId: string;
  readonly displayName: string;
  readonly state: 'ACTIVE';
  readonly version: number;
  readonly communityCreationAllowed: true;
  readonly slotPublicationAllowed: true;
}

export interface RejectVenuePayload {
  readonly venueId: string;
  readonly reason: string;
  readonly reasonCode: string;
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

interface VenueTargetContextRow {
  readonly venue_state: 'PENDING_VERIFICATION' | 'ACTIVE' | 'PAUSED' | 'CLOSED';
  readonly target_account_state: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
  readonly target_verification_state:
    | 'NOT_STARTED'
    | 'PENDING'
    | 'VERIFIED'
    | 'REJECTED'
    | 'EXPIRED'
    | 'REVOKED';
}

interface PrimaryAdminSuccessorRow {
  readonly proposal_id: string;
  readonly venue_id: string;
  readonly proposed_by_user_id: string;
  readonly target_user_id: string;
  readonly state: 'PENDING' | 'APPROVED';
  readonly proposed_at: Date;
  readonly approved_at: Date | null;
  readonly approved_by_user_id: string | null;
  readonly primary_grant_id: string | null;
  readonly version: string;
}

interface PrimaryAdminChangeContext {
  readonly target: VenueTargetContextRow;
  readonly targetAdmin: RoleGrantRow | null;
  readonly currentPrimary: RoleGrantRow | null;
  readonly nextVersion: number;
}

interface GuestCoachContextRow {
  readonly session_id: string;
  readonly session_state: SessionState;
  readonly scheduled_end_at: Date;
  readonly venue_id: string;
  readonly coach_user_id: string;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly target_account_state: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
  readonly target_verification_state:
    | 'NOT_STARTED'
    | 'PENDING'
    | 'VERIFIED'
    | 'REJECTED'
    | 'EXPIRED'
    | 'REVOKED';
  readonly result_state: ResultState | null;
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
): Promise<{ readonly role: 'CENTRAL_ADMIN' | 'PRIMARY_ADMIN' | 'GYM_ADMIN'; readonly scopeIds: readonly string[] } | null> {
  const result = await sql<{
    readonly role: 'CENTRAL_ADMIN' | 'PRIMARY_ADMIN' | 'GYM_ADMIN';
    readonly scope_id: string | null;
  }>`
    select role, scope_id
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
    order by case role when 'CENTRAL_ADMIN' then 0 when 'PRIMARY_ADMIN' then 1 else 2 end
    limit 1
    for share
  `.execute(transaction);
  const grant = result.rows[0];
  return grant
    ? { role: grant.role, scopeIds: grant.scope_id ? [grant.scope_id] : [] }
    : null;
}

async function actorIsCentral(
  transaction: Transaction<Database>,
  actorId: string,
): Promise<boolean> {
  const result = await sql<{ readonly grant_id: string }>`
    select grant_id
    from community.role_grants
    where user_id = ${actorId}::uuid
      and role = 'CENTRAL_ADMIN'
      and scope_type = 'GLOBAL'
      and scope_id is null
      and state = 'ACTIVE'
      and (expires_at is null or expires_at > clock_timestamp())
    limit 1
    for share
  `.execute(transaction);
  return result.rows.length === 1;
}

export async function hasActiveCentralRole(
  database: Kysely<Database>,
  userId: string,
): Promise<boolean> {
  const result = await sql<{ readonly grant_id: string }>`
    select grant_id
    from community.role_grants
    where user_id = ${userId}::uuid
      and role = 'CENTRAL_ADMIN'
      and scope_type = 'GLOBAL'
      and scope_id is null
      and state = 'ACTIVE'
      and (expires_at is null or expires_at > clock_timestamp())
    limit 1
  `.execute(database);
  return result.rows.length === 1;
}

export async function verifyVenue(
  database: Kysely<Database>,
  command: CommandEnvelope<VerifyVenuePayload>,
  ids: VenueVerificationEffectIds,
): Promise<ExecutedCommand<VenueVerificationProjection>> {
  if (
    command.actor.type !== 'USER'
    || !command.actor.id
    || command.commandType !== 'VERIFY_VENUE'
    || command.aggregateType !== 'Venue'
    || command.aggregateId !== command.payload.venueId
  ) {
    throw new RoleGrantPermissionDeniedError();
  }
  const reasonCode = normalizeRoleReasonCode(command.payload.reasonCode);

  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const venueResult = await sql<{
        readonly venue_id: string;
        readonly display_name: string;
        readonly state: 'PENDING_VERIFICATION' | 'ACTIVE' | 'PAUSED' | 'CLOSED';
        readonly version: string;
      }>`
        select venue_id, display_name, state, version::text
        from community.venues
        where venue_id = ${command.payload.venueId}::uuid
        for update
      `.execute(transaction);
      const venue = venueResult.rows[0];
      if (!venue) throw new RoleGrantNotFoundError();
      assertExpectedVersion(Number(venue.version), command.expectedVersion);
      const decision = verifyVenueState({
        actorIsCentral: await actorIsCentral(transaction, command.actor.id!),
        currentState: venue.state,
        checklistVersion: command.payload.checklistVersion,
        evidenceReference: command.payload.evidenceReference,
      });
      await sql`
        update community.venues
        set state = ${decision.state}, version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where venue_id = ${venue.venue_id}::uuid
          and state = 'PENDING_VERIFICATION'
          and version = ${command.expectedVersion}
      `.execute(transaction);
      const response: VenueVerificationProjection = {
        venueId: venue.venue_id,
        displayName: venue.display_name,
        state: 'ACTIVE',
        version: context.nextVersion,
        communityCreationAllowed: true,
        slotPublicationAllowed: true,
      };
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'VenueVerified',
          schemaVersion: 1,
          transitionId: 'VE-02',
          payload: {
            venueId: venue.venue_id,
            state: 'ACTIVE',
            version: context.nextVersion,
          },
          metadata: { policyVersion: 'venue-verification-mvp-v1' },
        },
        audit: {
          auditId: ids.auditId,
          action: 'VERIFY_VENUE',
          transitionId: 'VE-02',
          reasonCode,
          beforeState: venue.state,
          afterState: 'ACTIVE',
          metadata: {
            venueId: venue.venue_id,
            checklistVersion: decision.checklistVersion,
            evidenceReference: decision.evidenceReference,
          },
        },
        outbox: [{
          messageId: ids.outboxMessageId,
          topic: 'community.venue.verified.v1',
          payload: { venueId: venue.venue_id, state: 'ACTIVE', version: context.nextVersion },
        }],
      };
    },
  });
}

export async function rejectVenue(
  database: Kysely<Database>,
  command: CommandEnvelope<RejectVenuePayload>,
  ids: VenueVerificationEffectIds,
): Promise<ExecutedCommand<{ readonly venueId: string; readonly state: 'CLOSED'; readonly version: number }>> {
  if (
    command.actor.type !== 'USER'
    || !command.actor.id
    || command.commandType !== 'REJECT_VENUE'
    || command.aggregateType !== 'Venue'
    || command.aggregateId !== command.payload.venueId
  ) {
    throw new RoleGrantPermissionDeniedError();
  }
  const reasonCode = normalizeRoleReasonCode(command.payload.reasonCode);
  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const venueResult = await sql<{
        readonly venue_id: string;
        readonly state: 'PENDING_VERIFICATION' | 'ACTIVE' | 'PAUSED' | 'CLOSED';
        readonly version: string;
      }>`
        select venue_id, state, version::text from community.venues
        where venue_id = ${command.payload.venueId}::uuid for update
      `.execute(transaction);
      const venue = venueResult.rows[0];
      if (!venue) throw new RoleGrantNotFoundError();
      assertExpectedVersion(Number(venue.version), command.expectedVersion);
      const decision = rejectVenueState({
        actorIsCentral: await actorIsCentral(transaction, command.actor.id!),
        currentState: venue.state,
        reason: command.payload.reason,
      });
      await sql`
        update community.venues
        set state = 'CLOSED', version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where venue_id = ${venue.venue_id}::uuid and state = 'PENDING_VERIFICATION'
          and version = ${command.expectedVersion}
      `.execute(transaction);
      return {
        responseStatus: 200,
        response: { venueId: venue.venue_id, state: 'CLOSED', version: context.nextVersion },
        event: {
          eventId: ids.eventId, eventName: 'VenueVerificationRejected', schemaVersion: 1,
          transitionId: 'VE-03', payload: {
            venueId: venue.venue_id, state: 'CLOSED', version: context.nextVersion,
          }, metadata: { policyVersion: 'venue-verification-mvp-v1' },
        },
        audit: {
          auditId: ids.auditId, action: 'REJECT_VENUE', transitionId: 'VE-03',
          reasonCode, beforeState: venue.state, afterState: 'CLOSED',
          metadata: { venueId: venue.venue_id, reason: decision.reason },
        },
        outbox: [{
          messageId: ids.outboxMessageId, topic: 'community.venue.verification-rejected.v1',
          payload: { venueId: venue.venue_id, state: 'CLOSED', version: context.nextVersion },
        }],
      };
    },
  });
}

async function venueTargetContext(
  transaction: Transaction<Database>,
  venueId: string,
  targetUserId: string,
): Promise<VenueTargetContextRow | null> {
  const resourceResult = await sql<{
    readonly venue_state: VenueTargetContextRow['venue_state'];
    readonly target_account_state: VenueTargetContextRow['target_account_state'];
  }>`
    select
      venue.state as venue_state,
      target.account_state as target_account_state
    from community.venues as venue
    cross join identity.users as target
    where venue.venue_id = ${venueId}::uuid
      and target.user_id = ${targetUserId}::uuid
    for update of venue, target
  `.execute(transaction);
  const resource = resourceResult.rows[0];
  if (!resource) return null;
  const verificationResult = await sql<{
    readonly state: VenueTargetContextRow['target_verification_state'];
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

async function lockPrimaryAdminChangeContext(
  transaction: Transaction<Database>,
  venueId: string,
  targetUserId: string,
): Promise<PrimaryAdminChangeContext> {
  const target = await venueTargetContext(transaction, venueId, targetUserId);
  if (!target) throw new RoleGrantNotFoundError();
  const targetAdminResult = await sql<RoleGrantRow>`
    select grant_id, user_id, role, scope_type, scope_id, state,
      authorized_by, authorized_at, expires_at, version::text as version
    from community.role_grants
    where user_id = ${targetUserId}::uuid
      and role = 'GYM_ADMIN' and scope_type = 'VENUE'
      and scope_id = ${venueId}::uuid and state = 'ACTIVE'
      and (expires_at is null or expires_at > clock_timestamp())
    order by authorized_at, grant_id
    limit 1
    for share
  `.execute(transaction);
  const currentPrimaryResult = await sql<RoleGrantRow>`
    select grant_id, user_id, role, scope_type, scope_id, state,
      authorized_by, authorized_at, expires_at, version::text as version
    from community.role_grants
    where role = 'PRIMARY_ADMIN' and scope_type = 'VENUE'
      and scope_id = ${venueId}::uuid and state = 'ACTIVE'
      and (expires_at is null or expires_at > clock_timestamp())
    order by authorized_at, grant_id
    limit 1
    for update
  `.execute(transaction);
  const versionResult = await sql<{ readonly version: string }>`
    select (coalesce(max(aggregate_version), 0) + 1)::text as version
    from platform.domain_events
    where aggregate_type = 'VenuePrimaryAdmin'
      and aggregate_id = ${venueId}::uuid
  `.execute(transaction);
  return {
    target,
    targetAdmin: targetAdminResult.rows[0] ?? null,
    currentPrimary: currentPrimaryResult.rows[0] ?? null,
    nextVersion: Number(versionResult.rows[0]?.version ?? '1'),
  };
}

async function persistPrimaryAdminChange(
  transaction: Transaction<Database>,
  input: {
    readonly context: PrimaryAdminChangeContext;
    readonly venueId: string;
    readonly targetUserId: string;
    readonly actorId: string;
    readonly primaryGrantId: string;
    readonly occurredAt: Date;
  },
): Promise<void> {
  if (input.context.currentPrimary) {
    await sql`
      update community.role_grants
      set state = 'REVOKED', version = version + 1,
        updated_at = ${input.occurredAt.toISOString()}::timestamptz
      where grant_id = ${input.context.currentPrimary.grant_id}::uuid
        and state = 'ACTIVE'
    `.execute(transaction);
  }
  await sql`
    insert into community.role_grants (
      grant_id, user_id, role, scope_type, scope_id, state,
      authorized_by, authorized_at, expires_at, version
    ) values (
      ${input.primaryGrantId}::uuid, ${input.targetUserId}::uuid,
      'PRIMARY_ADMIN', 'VENUE', ${input.venueId}::uuid, 'ACTIVE',
      ${input.actorId}::uuid, ${input.occurredAt.toISOString()}::timestamptz,
      null, 1
    )
  `.execute(transaction);
}

function projectPrimaryAdminSuccessor(
  row: PrimaryAdminSuccessorRow,
  primaryAdminVersion: number | null = null,
): PrimaryAdminSuccessorProjection {
  return {
    proposalId: row.proposal_id,
    venueId: row.venue_id,
    proposedByUserId: row.proposed_by_user_id,
    targetUserId: row.target_user_id,
    state: row.state,
    proposedAt: row.proposed_at.toISOString(),
    approvedAt: row.approved_at?.toISOString() ?? null,
    approvedByUserId: row.approved_by_user_id,
    primaryGrantId: row.primary_grant_id,
    primaryAdminVersion,
    version: Number(row.version),
  };
}

async function guestCoachContext(
  transaction: Transaction<Database>,
  sessionId: string,
  targetUserId: string,
): Promise<GuestCoachContextRow | null> {
  const resource = await sql<Omit<GuestCoachContextRow, 'target_verification_state'>>`
    select session.session_id, session.state as session_state,
      session.scheduled_end_at, session.venue_id, session.coach_user_id,
      session.pair_low_id, session.pair_high_id,
      target.account_state as target_account_state,
      result.state as result_state
    from scheduling.sessions as session
    cross join identity.users as target
    left join competition.results as result on result.session_id = session.session_id
    where session.session_id = ${sessionId}::uuid
      and target.user_id = ${targetUserId}::uuid
    for update of session, target
  `.execute(transaction);
  const row = resource.rows[0];
  if (!row) return null;
  const verification = await sql<{
    readonly state: GuestCoachContextRow['target_verification_state'];
  }>`
    select state from identity.account_verifications
    where user_id = ${targetUserId}::uuid and is_current
    for share
  `.execute(transaction);
  return {
    ...row,
    target_verification_state: verification.rows[0]?.state ?? 'NOT_STARTED',
  };
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
        actorControlsScope: controlsScope !== null,
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

export async function authorizeGuestCoach(
  database: Kysely<Database>,
  command: CommandEnvelope<AuthorizeGuestCoachPayload>,
  ids: RoleGrantEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<RoleGrantProjection>> {
  if (
    !command.actor.id || command.actor.type !== 'USER'
    || command.aggregateType !== 'RoleGrant'
    || command.commandType !== 'AUTHORIZE_GUEST_COACH'
    || command.payload.sessionId.length === 0
  ) throw new RoleGrantPermissionDeniedError();
  const reasonCode = normalizeRoleReasonCode(command.payload.reasonCode);
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      assertExpectedVersion(0, command.expectedVersion);
      const target = await guestCoachContext(
        transaction, command.payload.sessionId, command.payload.userId,
      );
      if (!target) throw new RoleGrantValidationError('sessionId');
      const controlsScope = await actorControlsVenue(
        transaction, command.actor.id!, target.venue_id,
      );
      const next = authorizeGuestCoachState({
        actorControlsScope: controlsScope !== null,
        sessionState: target.session_state,
        targetAccountState: target.target_account_state,
        targetVerificationState: target.target_verification_state,
        targetIsAssignedCoach: target.coach_user_id === command.payload.userId,
        targetIsAthlete: [target.pair_low_id, target.pair_high_id]
          .includes(command.payload.userId),
        scheduledEndAt: target.scheduled_end_at,
      });
      const relationshipLock = `guest-coach:${command.payload.sessionId}:${command.payload.userId}`;
      await sql`select pg_advisory_xact_lock(hashtextextended(${relationshipLock}, 0))`
        .execute(transaction);
      const existing = await sql<{ readonly state: RoleGrantState }>`
        select state from community.role_grants
        where user_id = ${command.payload.userId}::uuid
          and role = 'COACH' and scope_type = 'SESSION'
          and scope_id = ${command.payload.sessionId}::uuid
          and state in ('PENDING', 'ACTIVE')
        limit 1
      `.execute(transaction);
      if (existing.rows[0]) throw new InvalidRoleGrantTransitionError(existing.rows[0].state);
      await sql`
        insert into community.role_grants (
          grant_id, user_id, role, scope_type, scope_id, state,
          authorized_by, authorized_at, expires_at, version
        ) values (
          ${command.aggregateId}::uuid, ${command.payload.userId}::uuid,
          'COACH', 'SESSION', ${command.payload.sessionId}::uuid, ${next.state},
          ${command.actor.id}::uuid, ${context.occurredAt.toISOString()}::timestamptz,
          ${next.expiresAt}::timestamptz, ${context.nextVersion}
        )
      `.execute(transaction);
      const response: RoleGrantProjection = {
        grantId: command.aggregateId,
        userId: command.payload.userId,
        role: 'COACH',
        scopeType: 'SESSION',
        scopeId: command.payload.sessionId,
        state: next.state,
        authorizedBy: command.actor.id,
        authorizedAt: context.occurredAt.toISOString(),
        expiresAt: next.expiresAt,
        version: context.nextVersion,
      };
      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId, eventName: 'GuestCoachAuthorized', schemaVersion: 1,
          transitionId: 'RG-06',
          payload: {
            grantId: command.aggregateId,
            sessionId: command.payload.sessionId,
            coachUserId: command.payload.userId,
            expiresAt: next.expiresAt,
          },
          metadata: { policyVersion: 'roles-mvp-v1' },
        },
        audit: {
          auditId: ids.auditId, action: 'AUTHORIZE_GUEST_COACH', transitionId: 'RG-06',
          reasonCode, beforeState: null, afterState: next.state,
          metadata: {
            sessionId: command.payload.sessionId,
            venueId: target.venue_id,
            targetUserId: command.payload.userId,
            authorizedActorRole: controlsScope!.role,
            authorizedScopeIds: controlsScope!.scopeIds,
          },
        },
        outbox: [{
          messageId: ids.outboxMessageId,
          topic: 'notification.in_app.v1',
          payload: { notifications: [{
            notificationId: ids.notificationId,
            recipientUserId: command.payload.userId,
            category: 'SERVICE',
            renderKey: 'session.guest-coach-authorized',
            actionTarget: { type: 'SESSION', sessionId: command.payload.sessionId },
            payload: { grantId: command.aggregateId, sessionId: command.payload.sessionId },
            deadlineAt: next.expiresAt,
          }] },
        }],
      };
    },
  });
}

export async function listExpirableGuestCoachGrants(
  database: Kysely<Database>,
  limit = 100,
  occurredAt = new Date(),
): Promise<readonly ExpirableGuestCoachGrant[]> {
  const result = await sql<{
    readonly grant_id: string;
    readonly session_id: string;
    readonly version: string;
    readonly reason: GuestCoachExpirationReason;
  }>`
    select role_grant.grant_id, session.session_id, role_grant.version::text as version,
      case
        when session.state = 'CANCELLED' then 'SESSION_CANCELLED'
        when result.state in ('FINAL', 'REVERSED', 'ANNULLED', 'REPEAT_ORDERED')
          then 'RESULT_FINAL'
        else 'HARD_EXPIRY'
      end as reason
    from community.role_grants as role_grant
    join scheduling.sessions as session on session.session_id = role_grant.scope_id
    left join competition.results as result on result.session_id = session.session_id
    where role_grant.role = 'COACH' and role_grant.scope_type = 'SESSION'
      and role_grant.state = 'ACTIVE'
      and (
        session.state = 'CANCELLED'
        or result.state in ('FINAL', 'REVERSED', 'ANNULLED', 'REPEAT_ORDERED')
        or role_grant.expires_at <= ${occurredAt.toISOString()}::timestamptz
      )
    order by role_grant.authorized_at, role_grant.grant_id
    limit ${limit}
  `.execute(database);
  return result.rows.map((row) => ({
    grantId: row.grant_id,
    sessionId: row.session_id,
    version: Number(row.version),
    reason: row.reason,
  }));
}

export async function expireGuestCoachGrant(
  database: Kysely<Database>,
  command: CommandEnvelope<ExpireGuestCoachPayload>,
  ids: RoleGrantEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<RoleGrantProjection>> {
  if (
    command.actor.type !== 'SYSTEM' || command.actor.id !== null
    || command.aggregateType !== 'RoleGrant'
    || command.commandType !== 'EXPIRE_GUEST_COACH'
    || command.payload.grantId !== command.aggregateId
  ) throw new RoleGrantPermissionDeniedError();
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const current = await selectRoleGrant(transaction, command.aggregateId, true);
      if (
        !current || current.role !== 'COACH' || current.scope_type !== 'SESSION'
        || current.scope_id !== command.payload.sessionId
      ) throw new RoleGrantNotFoundError();
      assertExpectedVersion(Number(current.version), command.expectedVersion);
      const target = await guestCoachContext(
        transaction, command.payload.sessionId, current.user_id,
      );
      if (!target) throw new RoleGrantNotFoundError();
      const nextState = expireGuestCoachState({
        currentState: current.state,
        sessionState: target.session_state,
        resultState: target.result_state,
        expiresAt: current.expires_at?.toISOString() ?? null,
        occurredAt: context.occurredAt,
        reason: command.payload.reason,
      });
      await sql`
        update community.role_grants
        set state = ${nextState}, expires_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where grant_id = ${current.grant_id}::uuid and state = 'ACTIVE'
      `.execute(transaction);
      const response: RoleGrantProjection = {
        ...projectRoleGrant(current),
        state: nextState,
        expiresAt: context.occurredAt.toISOString(),
        version: context.nextVersion,
      };
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId, eventName: 'GuestCoachAuthorizationExpired',
          schemaVersion: 1, transitionId: 'RG-07',
          payload: {
            grantId: current.grant_id,
            sessionId: command.payload.sessionId,
            reason: command.payload.reason,
            expiredAt: context.occurredAt.toISOString(),
          },
          metadata: { policyVersion: 'roles-mvp-v1' },
        },
        audit: {
          auditId: ids.auditId, action: 'EXPIRE_GUEST_COACH', transitionId: 'RG-07',
          reasonCode: command.payload.reason, beforeState: current.state, afterState: nextState,
          metadata: { sessionId: command.payload.sessionId, coachUserId: current.user_id },
        },
        outbox: [{
          messageId: ids.outboxMessageId,
          topic: 'notification.in_app.v1',
          payload: { notifications: [{
            notificationId: ids.notificationId,
            recipientUserId: current.user_id,
            category: 'SERVICE',
            renderKey: 'session.guest-coach-expired',
            actionTarget: { type: 'SESSION', sessionId: command.payload.sessionId },
            payload: { grantId: current.grant_id, sessionId: command.payload.sessionId,
              reason: command.payload.reason },
            deadlineAt: null,
          }] },
        }],
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

export async function appointGymAdmin(
  database: Kysely<Database>,
  command: CommandEnvelope<AppointGymAdminPayload>,
  ids: RoleGrantEffectIds,
): Promise<ExecutedCommand<RoleGrantProjection>> {
  if (!command.actor.id) throw new RoleGrantPermissionDeniedError();
  const reasonCode = normalizeRoleReasonCode(command.payload.reasonCode);

  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const actorId = command.actor.id;
      if (!actorId) throw new RoleGrantPermissionDeniedError();
      const target = await venueTargetContext(
        transaction,
        command.payload.venueId,
        command.payload.userId,
      );
      if (!target) throw new RoleGrantNotFoundError();
      const central = await actorIsCentral(transaction, actorId);
      const nextState = appointGymAdminState({
        actorIsCentral: central,
        venueState: target.venue_state,
        targetAccountState: target.target_account_state,
        targetVerificationState: target.target_verification_state,
      });

      const relationshipLock = `gym-admin:${command.payload.venueId}:${command.payload.userId}`;
      await sql`select pg_advisory_xact_lock(hashtextextended(${relationshipLock}, 0))`.execute(
        transaction,
      );
      const existing = await sql<{ readonly state: RoleGrantState }>`
        select state
        from community.role_grants
        where user_id = ${command.payload.userId}::uuid
          and role = 'GYM_ADMIN'
          and scope_type = 'VENUE'
          and scope_id = ${command.payload.venueId}::uuid
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
          'GYM_ADMIN', 'VENUE', ${command.payload.venueId}::uuid, ${nextState},
          ${actorId}::uuid, ${context.occurredAt.toISOString()}::timestamptz,
          null, ${context.nextVersion}
        )
      `.execute(transaction);
      const response: RoleGrantProjection = {
        grantId: command.aggregateId,
        userId: command.payload.userId,
        role: 'GYM_ADMIN',
        scopeType: 'VENUE',
        scopeId: command.payload.venueId,
        state: nextState,
        authorizedBy: actorId,
        authorizedAt: context.occurredAt.toISOString(),
        expiresAt: null,
        version: context.nextVersion,
      };
      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'GymAdminAppointed',
          schemaVersion: 1,
          transitionId: 'RG-08',
          payload: {
            grantId: command.aggregateId,
            userId: command.payload.userId,
            venueId: command.payload.venueId,
          },
          metadata: { policyVersion: 'roles-mvp-v1' },
        },
        audit: {
          auditId: ids.auditId,
          action: 'APPOINT_ADMIN',
          transitionId: 'RG-08',
          reasonCode,
          beforeState: null,
          afterState: nextState,
          metadata: {
            targetUserId: command.payload.userId,
            venueId: command.payload.venueId,
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
                  renderKey: 'community.gym_admin_appointed',
                  actionTarget: { type: 'VENUE', id: command.payload.venueId },
                  payload: { grantId: command.aggregateId },
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

export async function proposePrimaryAdminSuccessor(
  database: Kysely<Database>,
  command: CommandEnvelope<ProposePrimaryAdminSuccessorPayload>,
  ids: PrimaryAdminSuccessorEffectIds,
): Promise<ExecutedCommand<PrimaryAdminSuccessorProjection>> {
  if (
    !command.actor.id
    || command.commandType !== 'PROPOSE_PRIMARY_ADMIN_SUCCESSOR'
    || command.aggregateType !== 'PrimaryAdminSuccessorProposal'
  ) throw new RoleGrantPermissionDeniedError();
  const reasonCode = normalizeRoleReasonCode(command.payload.reasonCode);
  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const actorId = command.actor.id!;
      const primaryContext = await lockPrimaryAdminChangeContext(
        transaction, command.payload.venueId, command.payload.userId,
      );
      proposePrimaryAdminSuccessorState({
        actorIsCurrentPrimary: primaryContext.currentPrimary?.user_id === actorId,
        venueState: primaryContext.target.venue_state,
        targetAccountState: primaryContext.target.target_account_state,
        targetVerificationState: primaryContext.target.target_verification_state,
        targetHasActiveGymAdmin: primaryContext.targetAdmin !== null,
        proposerUserId: actorId,
        targetUserId: command.payload.userId,
      });
      const pending = await sql<{ readonly proposal_id: string }>`
        select proposal_id from community.primary_admin_successor_proposals
        where venue_id = ${command.payload.venueId}::uuid and state = 'PENDING'
        for update
      `.execute(transaction);
      if (pending.rows.length > 0) {
        throw new InvalidRoleGrantTransitionError('PENDING');
      }
      await sql`
        insert into community.primary_admin_successor_proposals (
          proposal_id, venue_id, proposed_by_user_id, target_user_id, state,
          proposal_reason_code, proposed_at, version, created_at, updated_at
        ) values (
          ${command.aggregateId}::uuid, ${command.payload.venueId}::uuid,
          ${actorId}::uuid, ${command.payload.userId}::uuid, 'PENDING',
          ${reasonCode}, ${context.occurredAt.toISOString()}::timestamptz, 1,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      const response: PrimaryAdminSuccessorProjection = {
        proposalId: command.aggregateId,
        venueId: command.payload.venueId,
        proposedByUserId: actorId,
        targetUserId: command.payload.userId,
        state: 'PENDING',
        proposedAt: context.occurredAt.toISOString(),
        approvedAt: null,
        approvedByUserId: null,
        primaryGrantId: null,
        primaryAdminVersion: null,
        version: 1,
      };
      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'PrimaryAdminSuccessorProposed',
          schemaVersion: 1,
          transitionId: 'RG-10',
          payload: {
            proposalId: command.aggregateId,
            venueId: command.payload.venueId,
            targetUserId: command.payload.userId,
            state: 'PENDING',
          },
          metadata: { policyVersion: 'roles-mvp-v1' },
        },
        audit: {
          auditId: ids.auditId,
          action: 'PROPOSE_PRIMARY_ADMIN_SUCCESSOR',
          transitionId: 'RG-10',
          reasonCode,
          beforeState: null,
          afterState: 'PENDING',
          metadata: {
            proposalId: command.aggregateId,
            venueId: command.payload.venueId,
            targetUserId: command.payload.userId,
          },
        },
        outbox: [{
          messageId: ids.outboxMessageId,
          topic: 'community.primary-admin-successor.proposed.v1',
          payload: {
            proposalId: command.aggregateId,
            venueId: command.payload.venueId,
            targetUserId: command.payload.userId,
            state: 'PENDING',
          },
        }],
      };
    },
  });
}

export async function approvePrimaryAdminSuccessor(
  database: Kysely<Database>,
  command: CommandEnvelope<ApprovePrimaryAdminSuccessorPayload>,
  ids: PrimaryAdminSuccessorApprovalEffectIds,
): Promise<ExecutedCommand<PrimaryAdminSuccessorProjection>> {
  if (
    !command.actor.id
    || command.commandType !== 'APPROVE_PRIMARY_ADMIN_SUCCESSOR'
    || command.aggregateType !== 'PrimaryAdminSuccessorProposal'
    || command.aggregateId !== command.payload.proposalId
  ) throw new RoleGrantPermissionDeniedError();
  const reasonCode = normalizeRoleReasonCode(command.payload.reasonCode);
  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const sourceResult = await sql<PrimaryAdminSuccessorRow>`
        select proposal_id, venue_id, proposed_by_user_id, target_user_id, state,
          proposed_at, approved_at, approved_by_user_id, primary_grant_id,
          version::text as version
        from community.primary_admin_successor_proposals
        where proposal_id = ${command.aggregateId}::uuid
      `.execute(transaction);
      const source = sourceResult.rows[0];
      if (!source) throw new RoleGrantNotFoundError();
      const primaryContext = await lockPrimaryAdminChangeContext(
        transaction, source.venue_id, source.target_user_id,
      );
      const proposalResult = await sql<PrimaryAdminSuccessorRow>`
        select proposal_id, venue_id, proposed_by_user_id, target_user_id, state,
          proposed_at, approved_at, approved_by_user_id, primary_grant_id,
          version::text as version
        from community.primary_admin_successor_proposals
        where proposal_id = ${command.aggregateId}::uuid
        for update
      `.execute(transaction);
      const proposal = proposalResult.rows[0];
      if (!proposal) throw new RoleGrantNotFoundError();
      const actorId = command.actor.id!;
      approvePrimaryAdminSuccessorState({
        actorIsCentral: await actorIsCentral(transaction, actorId),
        proposalState: proposal.state,
        venueState: primaryContext.target.venue_state,
        targetAccountState: primaryContext.target.target_account_state,
        targetVerificationState: primaryContext.target.target_verification_state,
        targetHasActiveGymAdmin: primaryContext.targetAdmin !== null,
        currentPrimaryAdminUserId: primaryContext.currentPrimary?.user_id ?? null,
        proposedByUserId: proposal.proposed_by_user_id,
        targetUserId: proposal.target_user_id,
      });
      await persistPrimaryAdminChange(transaction, {
        context: primaryContext,
        venueId: proposal.venue_id,
        targetUserId: proposal.target_user_id,
        actorId,
        primaryGrantId: ids.primaryGrantId,
        occurredAt: context.occurredAt,
      });
      await sql`
        update community.primary_admin_successor_proposals
        set state = 'APPROVED', approved_by_user_id = ${actorId}::uuid,
          approval_reason_code = ${reasonCode},
          approved_at = ${context.occurredAt.toISOString()}::timestamptz,
          primary_grant_id = ${ids.primaryGrantId}::uuid,
          version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where proposal_id = ${proposal.proposal_id}::uuid and state = 'PENDING'
      `.execute(transaction);
      const response = projectPrimaryAdminSuccessor({
        ...proposal,
        state: 'APPROVED',
        approved_by_user_id: actorId,
        approved_at: context.occurredAt,
        primary_grant_id: ids.primaryGrantId,
        version: String(context.nextVersion),
      }, primaryContext.nextVersion);
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'PrimaryAdminSuccessorApproved',
          schemaVersion: 1,
          transitionId: 'RG-10',
          payload: {
            proposalId: proposal.proposal_id,
            venueId: proposal.venue_id,
            state: 'APPROVED',
            primaryAdminVersion: primaryContext.nextVersion,
          },
          metadata: { policyVersion: 'roles-mvp-v1' },
        },
        relatedEvents: [{
          eventId: ids.primaryEventId,
          eventName: 'PrimaryAdminTransferred',
          schemaVersion: 1,
          aggregateType: 'VenuePrimaryAdmin',
          aggregateId: proposal.venue_id,
          aggregateVersion: primaryContext.nextVersion,
          transitionId: 'RG-10',
          payload: {
            venueId: proposal.venue_id,
            primaryGrantId: ids.primaryGrantId,
            primaryAdminUserId: proposal.target_user_id,
            previousPrimaryAdminUserId: primaryContext.currentPrimary?.user_id ?? null,
            proposalId: proposal.proposal_id,
          },
          metadata: { policyVersion: 'roles-mvp-v1' },
        }],
        audit: {
          auditId: ids.auditId,
          action: 'APPROVE_PRIMARY_ADMIN_SUCCESSOR',
          transitionId: 'RG-10',
          reasonCode,
          beforeState: 'PENDING',
          afterState: 'APPROVED',
          metadata: {
            proposalId: proposal.proposal_id,
            venueId: proposal.venue_id,
            previousPrimaryGrantId: primaryContext.currentPrimary?.grant_id ?? null,
            primaryGrantId: ids.primaryGrantId,
          },
        },
        outbox: [{
          messageId: ids.outboxMessageId,
          topic: 'notification.in_app.v1',
          payload: {
            notifications: [
              {
                notificationId: ids.targetNotificationId,
                recipientUserId: proposal.target_user_id,
                category: 'SERVICE',
                renderKey: 'community.primary_admin_transferred_to_you',
                actionTarget: { type: 'VENUE', id: proposal.venue_id },
                payload: { proposalId: proposal.proposal_id },
                deadlineAt: null,
              },
              {
                notificationId: ids.previousNotificationId,
                recipientUserId: proposal.proposed_by_user_id,
                category: 'SERVICE',
                renderKey: 'community.primary_admin_transferred_from_you',
                actionTarget: { type: 'VENUE', id: proposal.venue_id },
                payload: { proposalId: proposal.proposal_id },
                deadlineAt: null,
              },
            ],
          },
        }],
      };
    },
  });
}

export async function listPrimaryAdminSuccessorProposals(
  database: Kysely<Database>,
  centralUserId: string,
): Promise<readonly PrimaryAdminSuccessorProjection[]> {
  if (!(await hasActiveCentralRole(database, centralUserId))) {
    throw new RoleGrantPermissionDeniedError();
  }
  const result = await sql<PrimaryAdminSuccessorRow>`
    select proposal_id, venue_id, proposed_by_user_id, target_user_id, state,
      proposed_at, approved_at, approved_by_user_id, primary_grant_id,
      version::text as version
    from community.primary_admin_successor_proposals
    where state = 'PENDING'
    order by proposed_at, proposal_id
  `.execute(database);
  return result.rows.map((row) => projectPrimaryAdminSuccessor(row));
}

export async function changePrimaryAdmin(
  database: Kysely<Database>,
  command: CommandEnvelope<ChangePrimaryAdminPayload>,
  ids: PrimaryAdminEffectIds,
): Promise<ExecutedCommand<PrimaryAdminProjection>> {
  if (!command.actor.id) throw new RoleGrantPermissionDeniedError();
  if (command.aggregateId !== command.payload.venueId) {
    throw new RoleGrantValidationError('venueId');
  }
  const reasonCode = normalizeRoleReasonCode(command.payload.reasonCode);

  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const actorId = command.actor.id;
      if (!actorId) throw new RoleGrantPermissionDeniedError();
      const primaryContext = await lockPrimaryAdminChangeContext(
        transaction, command.payload.venueId, command.payload.userId,
      );
      const central = await actorIsCentral(transaction, actorId);
      const currentPrimary = primaryContext.currentPrimary;
      const change = changePrimaryAdminState({
        actorIsCentral: central,
        venueState: primaryContext.target.venue_state,
        targetAccountState: primaryContext.target.target_account_state,
        targetVerificationState: primaryContext.target.target_verification_state,
        targetHasActiveGymAdmin: primaryContext.targetAdmin !== null,
        currentPrimaryAdminUserId: currentPrimary?.user_id ?? null,
        targetUserId: command.payload.userId,
      });
      if (primaryContext.nextVersion !== context.nextVersion) {
        throw new RoleGrantValidationError('primaryAdminVersion');
      }
      await persistPrimaryAdminChange(transaction, {
        context: primaryContext,
        venueId: command.payload.venueId,
        targetUserId: command.payload.userId,
        actorId,
        primaryGrantId: ids.primaryGrantId,
        occurredAt: context.occurredAt,
      });
      const response: PrimaryAdminProjection = {
        venueId: command.payload.venueId,
        primaryGrantId: ids.primaryGrantId,
        primaryAdminUserId: command.payload.userId,
        previousPrimaryAdminUserId: currentPrimary?.user_id ?? null,
        change,
        version: context.nextVersion,
      };
      const notifications: Array<{
        notificationId: string;
        recipientUserId: string;
        category: 'SERVICE';
        renderKey: string;
        actionTarget: { type: 'VENUE'; id: string };
        payload: Readonly<Record<string, unknown>>;
        deadlineAt: null;
      }> = [
        {
          notificationId: ids.targetNotificationId,
          recipientUserId: command.payload.userId,
          category: 'SERVICE',
          renderKey:
            change === 'APPOINTED'
              ? 'community.primary_admin_appointed'
              : 'community.primary_admin_transferred_to_you',
          actionTarget: { type: 'VENUE', id: command.payload.venueId },
          payload: { previousPrimaryAdminUserId: currentPrimary?.user_id ?? null },
          deadlineAt: null,
        },
      ];
      if (currentPrimary) {
        notifications.push({
          notificationId: ids.previousNotificationId,
          recipientUserId: currentPrimary.user_id,
          category: 'SERVICE',
          renderKey: 'community.primary_admin_transferred_from_you',
          actionTarget: { type: 'VENUE', id: command.payload.venueId },
          payload: { primaryAdminUserId: command.payload.userId },
          deadlineAt: null,
        });
      }
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName:
            change === 'APPOINTED' ? 'PrimaryAdminAppointed' : 'PrimaryAdminTransferred',
          schemaVersion: 1,
          transitionId: change === 'APPOINTED' ? 'RG-09' : 'RG-10',
          payload: {
            venueId: command.payload.venueId,
            primaryGrantId: ids.primaryGrantId,
            primaryAdminUserId: command.payload.userId,
            previousPrimaryAdminUserId: currentPrimary?.user_id ?? null,
          },
          metadata: { policyVersion: 'roles-mvp-v1' },
        },
        audit: {
          auditId: ids.auditId,
          action: change === 'APPOINTED' ? 'APPOINT_PRIMARY_ADMIN' : 'TRANSFER_PRIMARY_ADMIN',
          transitionId: change === 'APPOINTED' ? 'RG-09' : 'RG-10',
          reasonCode,
          beforeState: currentPrimary?.user_id ?? null,
          afterState: command.payload.userId,
          metadata: {
            venueId: command.payload.venueId,
            previousPrimaryGrantId: currentPrimary?.grant_id ?? null,
            primaryGrantId: ids.primaryGrantId,
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'notification.in_app.v1',
            payload: { notifications },
          },
        ],
      };
    },
  });
}

export async function readVenueRoleSummary(
  database: Kysely<Database>,
  centralUserId: string,
  venueId: string,
): Promise<VenueRoleSummaryProjection | null> {
  return database.transaction().execute(async (transaction) => {
    if (!(await actorIsCentral(transaction, centralUserId))) {
      throw new RoleGrantPermissionDeniedError();
    }
    const venueResult = await sql<{ readonly venue_id: string }>`
      select venue_id from community.venues where venue_id = ${venueId}::uuid
    `.execute(transaction);
    if (!venueResult.rows[0]) return null;
    const grants = await sql<RoleGrantRow>`
      select
        grant_id, user_id, role, scope_type, scope_id, state,
        authorized_by, authorized_at, expires_at, version::text as version
      from community.role_grants
      where scope_type = 'VENUE'
        and scope_id = ${venueId}::uuid
        and role in ('GYM_ADMIN', 'PRIMARY_ADMIN')
        and state = 'ACTIVE'
      order by role, authorized_at, grant_id
    `.execute(transaction);
    const versionResult = await sql<{ readonly version: string }>`
      select coalesce(max(aggregate_version), 0)::text as version
      from platform.domain_events
      where aggregate_type = 'VenuePrimaryAdmin'
        and aggregate_id = ${venueId}::uuid
    `.execute(transaction);
    return {
      venueId,
      primaryAdminVersion: Number(versionResult.rows[0]?.version ?? '0'),
      activeGrants: grants.rows.map(projectRoleGrant),
    };
  });
}
