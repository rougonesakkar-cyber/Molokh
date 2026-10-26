import { createHash, timingSafeEqual } from 'node:crypto';

import {
  STATUS_RELEASE_POLICY_VERSION,
  StatusReleaseConflictError,
  assertStatusReleaseCanBeConfirmed,
  assertStatusReleaseEligibility,
  deriveStatusReleasePlan,
  statusReleasePreviewExpiresAt,
  type CommandEnvelope,
  type ReleasableCompetitionStatus,
  type StatusReleaseConsequence,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand } from './platform-command.js';

export interface PreviewStatusReleasePayload {
  readonly competitionId: string;
}

export interface ConfirmStatusReleasePayload {
  readonly releaseId: string;
  readonly confirmationToken: string;
}

export interface StatusReleaseEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly competitionEventId: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationIds: readonly [string, string];
}

export interface StatusReleaseProjection {
  readonly releaseId: string;
  readonly competitionId: string;
  readonly releasedStatus: ReleasableCompetitionStatus;
  readonly consequence: StatusReleaseConsequence;
  readonly state: 'PREVIEWED' | 'CONFIRMED';
  readonly successorUserId: string | null;
  readonly successorDisplayName: string | null;
  readonly beforeStatusVersion: number;
  readonly afterStatusVersion: number | null;
  readonly previewExpiresAt: string;
  readonly confirmationToken: string | null;
  readonly membershipRemainsActive: true;
  readonly createsResult: false;
  readonly createsLoss: false;
  readonly createsCooldown: false;
  readonly version: number;
}

interface StatusReleaseContextRow {
  readonly competition_id: string;
  readonly competition_version: string;
  readonly status_version: string;
  readonly phase: string;
  readonly availability: string;
  readonly integrity_hold_active: boolean;
  readonly champion_user_id: string | null;
  readonly contender_user_id: string | null;
  readonly account_active: boolean;
  readonly sensitive_action_held: boolean;
  readonly membership_active: boolean;
  readonly has_active_obligation: boolean;
  readonly has_blocking_live_challenge: boolean;
}

interface StatusReleaseRow {
  readonly release_id: string;
  readonly competition_id: string;
  readonly user_id: string;
  readonly released_status: ReleasableCompetitionStatus;
  readonly consequence: StatusReleaseConsequence;
  readonly state: 'PREVIEWED' | 'CONFIRMED';
  readonly before_champion_user_id: string | null;
  readonly before_contender_user_id: string | null;
  readonly before_status_version: string;
  readonly after_champion_user_id: string | null;
  readonly after_contender_user_id: string | null;
  readonly after_status_version: string | null;
  readonly after_phase: 'FOUNDING_OPEN' | 'CONTENDER_VACANT_OPEN';
  readonly confirmation_token_hash: string;
  readonly preview_expires_at: Date;
  readonly version: string;
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function tokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(tokenHash(token), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function releaseContext(
  database: Kysely<Database> | Transaction<Database>,
  competitionId: string,
  userId: string,
  lock: boolean,
): Promise<StatusReleaseContextRow | null> {
  const result = await sql<StatusReleaseContextRow>`
    select competitive.competition_id, competitive.version::text as competition_version,
      competitive.status_version::text as status_version, competitive.phase,
      competitive.availability,
      (competitive.integrity_hold_case_id is not null or exists (
        select 1 from competition.process_holds as process_hold
        where process_hold.aggregate_type = 'COMPETITION'
          and process_hold.aggregate_id = competitive.competition_id
          and process_hold.reason = 'STATUS_REVIEW' and process_hold.state = 'ACTIVE'
      )) as integrity_hold_active,
      competitive.champion_user_id, competitive.contender_user_id,
      athlete.account_state = 'ACTIVE' as account_active,
      exists (select 1 from identity.user_sensitive_action_holds as sensitive_hold
        where sensitive_hold.user_id = athlete.user_id and sensitive_hold.state = 'ACTIVE')
        as sensitive_action_held,
      exists (
        select 1 from community.community_memberships as membership
        where membership.community_id = competitive.community_id
          and membership.user_id = athlete.user_id
          and membership.state = 'ACTIVE' and membership.competition_enabled
          and membership.age_division = athlete.age_division
          and membership.age_division = competitive.age_division
      ) as membership_active,
      exists (
        select 1 from competition.challenge_participant_obligations as obligation
        where obligation.user_id = athlete.user_id and obligation.released_at is null
      ) as has_active_obligation,
      exists (
        select 1 from competition.challenges as challenge
        where challenge.competition_id = competitive.competition_id
          and challenge.stake <> 'NONE'
          and challenge.state = 'AWAITING_RESPONSE'
          and (
            athlete.user_id in (challenge.initiator_user_id, challenge.recipient_user_id)
            or athlete.user_id = competitive.champion_user_id
          )
      ) as has_blocking_live_challenge
    from competition.competitions as competitive
    cross join identity.users as athlete
    where competitive.competition_id = ${competitionId}::uuid
      and athlete.user_id = ${userId}::uuid
    ${lock ? sql`for update of competitive` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function releaseRow(
  database: Kysely<Database> | Transaction<Database>,
  releaseId: string,
  lock: boolean,
): Promise<StatusReleaseRow | null> {
  const result = await sql<StatusReleaseRow>`
    select release_id, competition_id, user_id, released_status, consequence, state,
      before_champion_user_id, before_contender_user_id, before_status_version::text,
      after_champion_user_id, after_contender_user_id, after_status_version::text,
      after_phase, confirmation_token_hash, preview_expires_at, version::text
    from competition.voluntary_status_releases
    where release_id = ${releaseId}::uuid
    ${lock ? sql`for update` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function displayName(
  database: Kysely<Database> | Transaction<Database>,
  userId: string | null,
): Promise<string | null> {
  if (!userId) return null;
  const result = await sql<{ readonly display_name: string }>`
    select display_name from identity.users where user_id = ${userId}::uuid
  `.execute(database);
  return result.rows[0]?.display_name ?? null;
}

async function projection(
  database: Kysely<Database> | Transaction<Database>,
  row: StatusReleaseRow,
  confirmationToken: string | null,
): Promise<StatusReleaseProjection> {
  const successorUserId = row.consequence === 'CHAMPION_SUCCESSION'
    ? row.after_champion_user_id
    : null;
  return {
    releaseId: row.release_id,
    competitionId: row.competition_id,
    releasedStatus: row.released_status,
    consequence: row.consequence,
    state: row.state,
    successorUserId,
    successorDisplayName: await displayName(database, successorUserId),
    beforeStatusVersion: Number(row.before_status_version),
    afterStatusVersion: row.after_status_version === null ? null : Number(row.after_status_version),
    previewExpiresAt: row.preview_expires_at.toISOString(),
    confirmationToken,
    membershipRemainsActive: true,
    createsResult: false,
    createsLoss: false,
    createsCooldown: false,
    version: Number(row.version),
  };
}

function assertContextEligible(row: StatusReleaseContextRow | null): asserts row is StatusReleaseContextRow {
  if (!row) throw new StatusReleaseConflictError('STATUS_RELEASE_NOT_STATUS_HOLDER');
  assertStatusReleaseEligibility({
    accountActive: row.account_active,
    membershipActive: row.membership_active,
    competitionActive: row.availability === 'ACTIVE' && row.phase !== 'CLOSED',
    integrityHoldActive: row.integrity_hold_active,
    hasActiveObligation: row.has_active_obligation,
    hasBlockingLiveChallenge: row.has_blocking_live_challenge,
    sensitiveActionHeld: row.sensitive_action_held,
  });
}

export async function previewStatusRelease(
  database: Kysely<Database>,
  command: CommandEnvelope<PreviewStatusReleasePayload>,
  ids: StatusReleaseEffectIds,
  confirmationToken: string,
  now?: () => Date,
): Promise<ExecutedCommand<StatusReleaseProjection>> {
  if (
    !command.actor.id || command.actor.type !== 'USER'
    || command.aggregateType !== 'VoluntaryStatusRelease'
    || command.commandType !== 'PREVIEW_STATUS_RELEASE'
  ) {
    throw new StatusReleaseConflictError('STATUS_RELEASE_OWNER_REQUIRED');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const competitive = await releaseContext(
        transaction,
        command.payload.competitionId,
        command.actor.id!,
        true,
      );
      assertContextEligible(competitive);
      const plan = deriveStatusReleasePlan({
        actorUserId: command.actor.id!,
        championUserId: competitive.champion_user_id,
        contenderUserId: competitive.contender_user_id,
      });
      const expiresAt = statusReleasePreviewExpiresAt(context.occurredAt);
      await sql`
        insert into competition.voluntary_status_releases (
          release_id, competition_id, user_id, released_status, consequence, state,
          before_champion_user_id, before_contender_user_id, before_status_version,
          after_champion_user_id, after_contender_user_id, after_phase,
          confirmation_token_hash, preview_event_id, previewed_at, preview_expires_at,
          version, created_at, updated_at
        ) values (
          ${command.aggregateId}::uuid, ${competitive.competition_id}::uuid,
          ${command.actor.id}::uuid, ${plan.releasedStatus}, ${plan.consequence}, 'PREVIEWED',
          ${competitive.champion_user_id}::uuid, ${competitive.contender_user_id}::uuid,
          ${Number(competitive.status_version)}, ${plan.afterChampionUserId}::uuid,
          ${plan.afterContenderUserId}::uuid, ${plan.afterPhase},
          ${tokenHash(confirmationToken)}, ${ids.eventId}::uuid,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${expiresAt.toISOString()}::timestamptz, ${context.nextVersion},
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      const inserted = await releaseRow(transaction, command.aggregateId, false);
      if (!inserted) throw new StatusReleaseConflictError('STATUS_RELEASE_NOT_FOUND');
      return {
        responseStatus: 201,
        response: await projection(transaction, inserted, confirmationToken),
        event: {
          eventId: ids.eventId,
          eventName: 'StatusReleasePreviewed',
          schemaVersion: 1,
          transitionId: null,
          payload: {
            releaseId: command.aggregateId,
            competitionId: competitive.competition_id,
            releasedStatus: plan.releasedStatus,
            consequence: plan.consequence,
            beforeStatusVersion: Number(competitive.status_version),
            expiresAt: expiresAt.toISOString(),
          },
          metadata: { policyVersion: STATUS_RELEASE_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'PREVIEW_STATUS_RELEASE',
          transitionId: null,
          reasonCode: null,
          beforeState: null,
          afterState: 'PREVIEWED',
          metadata: { competitionId: competitive.competition_id, consequence: plan.consequence },
        },
        outbox: [{
          messageId: ids.outboxMessageId,
          topic: 'competition.status-release.previewed.v1',
          payload: {
            releaseId: command.aggregateId,
            competitionId: competitive.competition_id,
            userId: command.actor.id,
            expiresAt: expiresAt.toISOString(),
          },
        }],
      };
    },
  });
}

export async function confirmStatusRelease(
  database: Kysely<Database>,
  command: CommandEnvelope<ConfirmStatusReleasePayload>,
  ids: StatusReleaseEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<StatusReleaseProjection>> {
  if (
    !command.actor.id || command.actor.type !== 'USER'
    || command.aggregateType !== 'VoluntaryStatusRelease'
    || command.aggregateId !== command.payload.releaseId
    || command.commandType !== 'CONFIRM_STATUS_RELEASE'
  ) {
    throw new StatusReleaseConflictError('STATUS_RELEASE_OWNER_REQUIRED');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const release = await releaseRow(transaction, command.aggregateId, true);
      if (!release) throw new StatusReleaseConflictError('STATUS_RELEASE_NOT_FOUND');
      const competitive = await releaseContext(
        transaction,
        release.competition_id,
        command.actor.id!,
        true,
      );
      assertContextEligible(competitive);
      assertStatusReleaseCanBeConfirmed({
        state: release.state,
        actorUserId: command.actor.id!,
        ownerUserId: release.user_id,
        previewExpiresAt: release.preview_expires_at,
        occurredAt: context.occurredAt,
        tokenMatches: tokenMatches(command.payload.confirmationToken, release.confirmation_token_hash),
        previewStatusVersion: Number(release.before_status_version),
        currentStatusVersion: Number(competitive.status_version),
        previewChampionUserId: release.before_champion_user_id,
        currentChampionUserId: competitive.champion_user_id,
        previewContenderUserId: release.before_contender_user_id,
        currentContenderUserId: competitive.contender_user_id,
      });
      const plan = deriveStatusReleasePlan({
        actorUserId: command.actor.id!,
        championUserId: competitive.champion_user_id,
        contenderUserId: competitive.contender_user_id,
      });
      if (plan.consequence !== release.consequence) {
        throw new StatusReleaseConflictError('STATUS_RELEASE_STATUS_CHANGED');
      }
      const nextStatusVersion = Number(competitive.status_version) + 1;
      const nextCompetitionVersion = Number(competitive.competition_version) + 1;
      await sql`
        update competition.competitions
        set champion_user_id = ${plan.afterChampionUserId}::uuid,
          contender_user_id = null, phase = ${plan.afterPhase},
          status_version = ${nextStatusVersion}, version = ${nextCompetitionVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where competition_id = ${competitive.competition_id}::uuid
      `.execute(transaction);

      const targetStatus = plan.afterPhase === 'FOUNDING_OPEN' ? 'CHAMPION' : 'CONTENDER';
      const migratedResult = await sql<{ readonly queue_entry_id: string }>`
        update competition.challenge_queue_entries
        set target_status = ${targetStatus}, kind = 'GENESIS_CANDIDATE', state = 'WAITING',
          bound_holder_user_id = null, direct_challenge_mode = null,
          reconfirmation_deadline_at = null,
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where competition_id = ${competitive.competition_id}::uuid
          and kind = 'DIRECT_STATUS'
          and state in ('WAITING', 'RECONFIRMATION_REQUIRED')
        returning queue_entry_id
      `.execute(transaction);
      const candidateResult = await sql<{
        readonly queue_entry_id: string;
        readonly version: string;
      }>`
        select queue_entry_id, version::text
        from competition.challenge_queue_entries
        where competition_id = ${competitive.competition_id}::uuid
          and target_status = ${targetStatus}
          and kind = 'GENESIS_CANDIDATE' and state = 'WAITING'
        order by submitted_at, queue_entry_id
      `.execute(transaction);

      await sql`
        update competition.voluntary_status_releases
        set state = 'CONFIRMED', after_status_version = ${nextStatusVersion},
          confirm_event_id = ${ids.eventId}::uuid,
          confirmed_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where release_id = ${release.release_id}::uuid and state = 'PREVIEWED'
      `.execute(transaction);
      const confirmed = await releaseRow(transaction, release.release_id, false);
      if (!confirmed) throw new StatusReleaseConflictError('STATUS_RELEASE_NOT_FOUND');
      const response = await projection(transaction, confirmed, null);
      const notifications = [
        {
          notificationId: ids.notificationIds[0],
          recipientUserId: release.user_id,
          category: 'MANDATORY',
          renderKey: 'status.release-confirmed',
          actionTarget: { type: 'COMMUNITY', competitionId: release.competition_id },
          payload: { releaseId: release.release_id, releasedStatus: release.released_status },
          deadlineAt: null,
        },
        ...(plan.afterChampionUserId && plan.afterChampionUserId !== release.user_id
          ? [{
              notificationId: ids.notificationIds[1],
              recipientUserId: plan.afterChampionUserId,
              category: 'MANDATORY',
              renderKey: 'status.champion-succession',
              actionTarget: { type: 'COMMUNITY', competitionId: release.competition_id },
              payload: { releaseId: release.release_id, previousChampionUserId: release.user_id },
              deadlineAt: null,
            }]
          : []),
      ];
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'VoluntaryStatusReleased',
          schemaVersion: 1,
          transitionId: plan.transitionId,
          payload: {
            releaseId: release.release_id,
            competitionId: release.competition_id,
            userId: release.user_id,
            releasedStatus: release.released_status,
            consequence: release.consequence,
            beforeStatusVersion: Number(release.before_status_version),
            afterStatusVersion: nextStatusVersion,
            migratedQueueEntryIds: migratedResult.rows.map((row) => row.queue_entry_id),
            candidateCount: candidateResult.rows.length,
            membershipRemainsActive: true,
            createsResult: false,
            createsLoss: false,
            createsCooldown: false,
          },
          metadata: { policyVersion: STATUS_RELEASE_POLICY_VERSION },
        },
        relatedEvents: [{
          eventId: ids.competitionEventId,
          eventName: plan.eventName,
          schemaVersion: 1,
          transitionId: plan.transitionId,
          aggregateType: 'Competition',
          aggregateId: release.competition_id,
          aggregateVersion: nextCompetitionVersion,
          payload: {
            releaseId: release.release_id,
            beforeChampionUserId: release.before_champion_user_id,
            beforeContenderUserId: release.before_contender_user_id,
            afterChampionUserId: plan.afterChampionUserId,
            afterContenderUserId: null,
            statusVersion: nextStatusVersion,
            phase: plan.afterPhase,
          },
          metadata: { policyVersion: STATUS_RELEASE_POLICY_VERSION },
        }],
        audit: {
          auditId: ids.auditId,
          action: 'CONFIRM_STATUS_RELEASE',
          transitionId: plan.transitionId,
          reasonCode: 'VOLUNTARY_STATUS_ONLY',
          beforeState: 'PREVIEWED',
          afterState: 'CONFIRMED',
          metadata: {
            competitionId: release.competition_id,
            releasedStatus: release.released_status,
            consequence: release.consequence,
            migratedQueueEntryIds: migratedResult.rows.map((row) => row.queue_entry_id),
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'competition.status-released.v1',
            payload: {
              releaseId: release.release_id,
              competitionId: release.competition_id,
              consequence: release.consequence,
              phase: plan.afterPhase,
              candidateCount: candidateResult.rows.length,
              firstCandidate: candidateResult.rows[0] ?? null,
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: { notifications },
          },
        ],
      };
    },
  });
}
