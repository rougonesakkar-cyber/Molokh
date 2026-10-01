import { createHash, timingSafeEqual } from 'node:crypto';

import {
  MEMBERSHIP_EXIT_POLICY_VERSION,
  MembershipExitConflictError,
  assertMembershipExitCanBeConfirmed,
  assertMembershipExitEligibility,
  deriveMembershipExitPlan,
  membershipExitPreviewExpiresAt,
  type CommandEnvelope,
  type MembershipExitConsequence,
  type MembershipExitStatus,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import {
  executeCriticalCommand,
  type ExecutedCommand,
  type RelatedDomainEventDraft,
} from './platform-command.js';

export interface PreviewMembershipExitPayload {
  readonly membershipId: string;
}

export interface ConfirmMembershipExitPayload {
  readonly exitId: string;
  readonly confirmationToken: string;
}

export interface MembershipExitEffectIds {
  readonly eventId: string;
  readonly membershipEventId: string;
  readonly competitionEventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationIds: readonly [string, string];
}

export interface MembershipExitProjection {
  readonly exitId: string;
  readonly membershipId: string;
  readonly competitionId: string;
  readonly departingStatus: MembershipExitStatus;
  readonly consequence: MembershipExitConsequence;
  readonly state: 'PREVIEWED' | 'CONFIRMED';
  readonly successorUserId: string | null;
  readonly successorDisplayName: string | null;
  readonly beforeMembershipVersion: number;
  readonly afterMembershipVersion: number | null;
  readonly beforeStatusVersion: number;
  readonly afterStatusVersion: number | null;
  readonly previewExpiresAt: string;
  readonly confirmationToken: string | null;
  readonly closedChallengeCount: number;
  readonly invalidatedQueueEntryCount: number;
  readonly createsForfeit: false;
  readonly createsLoss: false;
  readonly createsCooldown: false;
  readonly appealWaived: false;
  readonly version: number;
}

interface MembershipExitContextRow {
  readonly membership_id: string;
  readonly membership_version: string;
  readonly membership_state: string;
  readonly membership_user_id: string;
  readonly competition_id: string;
  readonly competition_version: string;
  readonly status_version: string;
  readonly phase: string;
  readonly availability: string;
  readonly integrity_hold_active: boolean;
  readonly champion_user_id: string | null;
  readonly contender_user_id: string | null;
  readonly account_active: boolean;
  readonly community_active: boolean;
  readonly has_active_obligation: boolean;
  readonly has_live_status_process: boolean;
}

interface MembershipExitRow {
  readonly exit_id: string;
  readonly membership_id: string;
  readonly competition_id: string;
  readonly user_id: string;
  readonly departing_status: MembershipExitStatus;
  readonly consequence: MembershipExitConsequence;
  readonly state: 'PREVIEWED' | 'CONFIRMED';
  readonly before_membership_version: string;
  readonly after_membership_version: string | null;
  readonly before_champion_user_id: string | null;
  readonly before_contender_user_id: string | null;
  readonly before_status_version: string;
  readonly after_champion_user_id: string | null;
  readonly after_contender_user_id: string | null;
  readonly after_status_version: string | null;
  readonly after_phase: 'FOUNDING_OPEN' | 'CONTENDER_VACANT_OPEN' | null;
  readonly confirmation_token_hash: string;
  readonly preview_expires_at: Date;
  readonly closed_challenge_count: number;
  readonly invalidated_queue_entry_count: number;
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

async function exitContext(
  database: Kysely<Database> | Transaction<Database>,
  membershipId: string,
  userId: string,
  lock: boolean,
): Promise<MembershipExitContextRow | null> {
  const result = await sql<MembershipExitContextRow>`
    select membership.membership_id, membership.version::text as membership_version,
      membership.state as membership_state, membership.user_id as membership_user_id,
      competitive.competition_id, competitive.version::text as competition_version,
      competitive.status_version::text as status_version, competitive.phase,
      competitive.availability,
      competitive.integrity_hold_case_id is not null as integrity_hold_active,
      competitive.champion_user_id, competitive.contender_user_id,
      athlete.account_state = 'ACTIVE' as account_active,
      community.state in ('ACTIVE', 'PAUSED') as community_active,
      exists (
        select 1 from competition.challenge_participant_obligations as obligation
        where obligation.user_id = membership.user_id and obligation.released_at is null
      ) as has_active_obligation,
      exists (
        select 1 from competition.challenges as challenge
        where challenge.competition_id = competitive.competition_id
          and challenge.state = 'AWAITING_RESPONSE'
          and challenge.response_policy in ('MANDATORY', 'MUTUAL_GENESIS')
          and membership.user_id in (challenge.initiator_user_id, challenge.recipient_user_id)
      ) as has_live_status_process
    from community.community_memberships as membership
    join identity.users as athlete on athlete.user_id = membership.user_id
    join community.communities as community on community.community_id = membership.community_id
    join competition.competitions as competitive
      on competitive.community_id = membership.community_id
      and competitive.age_division = membership.age_division
      and competitive.discipline_key is null
    where membership.membership_id = ${membershipId}::uuid
      and membership.user_id = ${userId}::uuid
    ${lock ? sql`for update of membership, competitive` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function exitRow(
  database: Kysely<Database> | Transaction<Database>,
  exitId: string,
  lock: boolean,
): Promise<MembershipExitRow | null> {
  const result = await sql<MembershipExitRow>`
    select exit_id, membership_id, competition_id, user_id, departing_status,
      consequence, state, before_membership_version::text,
      after_membership_version::text, before_champion_user_id,
      before_contender_user_id, before_status_version::text,
      after_champion_user_id, after_contender_user_id,
      after_status_version::text, after_phase, confirmation_token_hash,
      preview_expires_at, closed_challenge_count,
      invalidated_queue_entry_count, version::text
    from community.voluntary_membership_exits
    where exit_id = ${exitId}::uuid
    ${lock ? sql`for update` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

function assertContextEligible(
  row: MembershipExitContextRow | null,
): asserts row is MembershipExitContextRow {
  if (!row) throw new MembershipExitConflictError('MEMBERSHIP_EXIT_MEMBERSHIP_NOT_ACTIVE');
  assertMembershipExitEligibility({
    accountActive: row.account_active,
    membershipActive: row.membership_state === 'ACTIVE',
    communityActive: row.community_active,
    competitionActive: row.availability === 'ACTIVE' && row.phase !== 'CLOSED',
    integrityHoldActive: row.integrity_hold_active,
    hasActiveObligation: row.has_active_obligation,
    hasLiveStatusProcess: row.has_live_status_process,
  });
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
  row: MembershipExitRow,
  confirmationToken: string | null,
): Promise<MembershipExitProjection> {
  const successorUserId = row.consequence === 'CHAMPION_SUCCESSION'
    ? row.after_champion_user_id
    : null;
  return {
    exitId: row.exit_id,
    membershipId: row.membership_id,
    competitionId: row.competition_id,
    departingStatus: row.departing_status,
    consequence: row.consequence,
    state: row.state,
    successorUserId,
    successorDisplayName: await displayName(database, successorUserId),
    beforeMembershipVersion: Number(row.before_membership_version),
    afterMembershipVersion: row.after_membership_version === null
      ? null : Number(row.after_membership_version),
    beforeStatusVersion: Number(row.before_status_version),
    afterStatusVersion: row.after_status_version === null ? null : Number(row.after_status_version),
    previewExpiresAt: row.preview_expires_at.toISOString(),
    confirmationToken,
    closedChallengeCount: row.closed_challenge_count,
    invalidatedQueueEntryCount: row.invalidated_queue_entry_count,
    createsForfeit: false,
    createsLoss: false,
    createsCooldown: false,
    appealWaived: false,
    version: Number(row.version),
  };
}

export async function previewMembershipExit(
  database: Kysely<Database>,
  command: CommandEnvelope<PreviewMembershipExitPayload>,
  ids: MembershipExitEffectIds,
  confirmationToken: string,
  now?: () => Date,
): Promise<ExecutedCommand<MembershipExitProjection>> {
  if (
    !command.actor.id || command.actor.type !== 'USER'
    || command.aggregateType !== 'VoluntaryMembershipExit'
    || command.commandType !== 'PREVIEW_MEMBERSHIP_EXIT'
  ) throw new MembershipExitConflictError('MEMBERSHIP_EXIT_OWNER_REQUIRED');

  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const current = await exitContext(
        transaction, command.payload.membershipId, command.actor.id!, true,
      );
      assertContextEligible(current);
      const plan = deriveMembershipExitPlan({
        actorUserId: command.actor.id!,
        championUserId: current.champion_user_id,
        contenderUserId: current.contender_user_id,
      });
      const expiresAt = membershipExitPreviewExpiresAt(context.occurredAt);
      const plannedStatusVersion = plan.statusRelease
        ? Number(current.status_version) + 1
        : null;
      await sql`
        insert into community.voluntary_membership_exits (
          exit_id, membership_id, competition_id, user_id,
          departing_status, consequence, state, before_membership_version,
          before_champion_user_id, before_contender_user_id, before_status_version,
          after_champion_user_id, after_contender_user_id, after_status_version,
          after_phase, confirmation_token_hash, preview_event_id,
          previewed_at, preview_expires_at, version, created_at, updated_at
        ) values (
          ${command.aggregateId}::uuid, ${current.membership_id}::uuid,
          ${current.competition_id}::uuid, ${command.actor.id}::uuid,
          ${plan.departingStatus}, ${plan.consequence}, 'PREVIEWED',
          ${Number(current.membership_version)}, ${current.champion_user_id}::uuid,
          ${current.contender_user_id}::uuid, ${Number(current.status_version)},
          ${plan.statusRelease?.afterChampionUserId ?? null}::uuid,
          ${plan.statusRelease?.afterContenderUserId ?? null}::uuid,
          ${plannedStatusVersion}, ${plan.statusRelease?.afterPhase ?? null},
          ${tokenHash(confirmationToken)}, ${ids.eventId}::uuid,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${expiresAt.toISOString()}::timestamptz, ${context.nextVersion},
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      const inserted = await exitRow(transaction, command.aggregateId, false);
      if (!inserted) throw new MembershipExitConflictError('MEMBERSHIP_EXIT_NOT_FOUND');
      return {
        responseStatus: 201,
        response: await projection(transaction, inserted, confirmationToken),
        event: {
          eventId: ids.eventId, eventName: 'ResignationPreviewed', schemaVersion: 1,
          transitionId: null,
          payload: {
            exitId: command.aggregateId, membershipId: current.membership_id,
            competitionId: current.competition_id, departingStatus: plan.departingStatus,
            consequence: plan.consequence, previewExpiresAt: expiresAt.toISOString(),
            createsForfeit: false, appealWaived: false,
          },
          metadata: { policyVersion: MEMBERSHIP_EXIT_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId, action: 'PREVIEW_MEMBERSHIP_EXIT', transitionId: null,
          reasonCode: 'VOLUNTARY_NO_OBLIGATION', beforeState: 'ACTIVE',
          afterState: 'PREVIEWED', metadata: { consequence: plan.consequence },
        },
        outbox: [{
          messageId: ids.outboxMessageId,
          topic: 'community.membership-exit.previewed.v1',
          payload: {
            exitId: command.aggregateId, membershipId: current.membership_id,
            userId: command.actor.id, previewExpiresAt: expiresAt.toISOString(),
          },
        }],
      };
    },
  });
}

export async function confirmMembershipExit(
  database: Kysely<Database>,
  command: CommandEnvelope<ConfirmMembershipExitPayload>,
  ids: MembershipExitEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<MembershipExitProjection>> {
  if (
    !command.actor.id || command.actor.type !== 'USER'
    || command.aggregateType !== 'VoluntaryMembershipExit'
    || command.aggregateId !== command.payload.exitId
    || command.commandType !== 'CONFIRM_MEMBERSHIP_EXIT'
  ) throw new MembershipExitConflictError('MEMBERSHIP_EXIT_OWNER_REQUIRED');

  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const exit = await exitRow(transaction, command.aggregateId, true);
      if (!exit) throw new MembershipExitConflictError('MEMBERSHIP_EXIT_NOT_FOUND');
      const current = await exitContext(
        transaction, exit.membership_id, command.actor.id!, true,
      );
      assertContextEligible(current);
      assertMembershipExitCanBeConfirmed({
        state: exit.state, actorUserId: command.actor.id!, ownerUserId: exit.user_id,
        previewExpiresAt: exit.preview_expires_at, occurredAt: context.occurredAt,
        tokenMatches: tokenMatches(
          command.payload.confirmationToken, exit.confirmation_token_hash,
        ),
        previewMembershipVersion: Number(exit.before_membership_version),
        currentMembershipVersion: Number(current.membership_version),
        previewStatusVersion: Number(exit.before_status_version),
        currentStatusVersion: Number(current.status_version),
        previewChampionUserId: exit.before_champion_user_id,
        currentChampionUserId: current.champion_user_id,
        previewContenderUserId: exit.before_contender_user_id,
        currentContenderUserId: current.contender_user_id,
      });
      const plan = deriveMembershipExitPlan({
        actorUserId: command.actor.id!, championUserId: current.champion_user_id,
        contenderUserId: current.contender_user_id,
      });
      if (plan.departingStatus !== exit.departing_status || plan.consequence !== exit.consequence) {
        throw new MembershipExitConflictError('MEMBERSHIP_EXIT_CONTEXT_CHANGED');
      }

      const closedChallenges = await sql<{
        readonly challenge_id: string;
        readonly version: string;
      }>`
        update competition.challenges
        set state = 'CANCELLED_NO_FAULT', decided_at = ${context.occurredAt.toISOString()}::timestamptz,
          version = version + 1, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where competition_id = ${current.competition_id}::uuid
          and state = 'AWAITING_RESPONSE' and response_policy = 'OPTIONAL'
          and ${command.actor.id}::uuid in (initiator_user_id, recipient_user_id)
        returning challenge_id, version::text
      `.execute(transaction);
      const invalidatedEntries = await sql<{ readonly queue_entry_id: string }>`
        update competition.challenge_queue_entries
        set state = 'INVALIDATED', terminal_reason = 'MEMBERSHIP_LEFT',
          decided_at = ${context.occurredAt.toISOString()}::timestamptz,
          reconfirmation_deadline_at = null, version = version + 1,
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where competition_id = ${current.competition_id}::uuid
          and initiator_user_id = ${command.actor.id}::uuid
          and state in ('WAITING', 'PAIRED_PENDING_ACCEPTANCE', 'RECONFIRMATION_REQUIRED', 'ACTIVATED')
        returning queue_entry_id
      `.execute(transaction);

      let nextCompetitionVersion: number | null = null;
      let migratedQueueEntryIds: readonly string[] = [];
      if (plan.statusRelease) {
        nextCompetitionVersion = Number(current.competition_version) + 1;
        await sql`
          update competition.competitions
          set champion_user_id = ${plan.statusRelease.afterChampionUserId}::uuid,
            contender_user_id = null, phase = ${plan.statusRelease.afterPhase},
            status_version = ${Number(current.status_version) + 1},
            version = ${nextCompetitionVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where competition_id = ${current.competition_id}::uuid
        `.execute(transaction);
        const targetStatus = plan.statusRelease.afterPhase === 'FOUNDING_OPEN'
          ? 'CHAMPION' : 'CONTENDER';
        const migrated = await sql<{ readonly queue_entry_id: string }>`
          update competition.challenge_queue_entries
          set target_status = ${targetStatus}, kind = 'GENESIS_CANDIDATE', state = 'WAITING',
            bound_holder_user_id = null, reconfirmation_deadline_at = null,
            version = version + 1, updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where competition_id = ${current.competition_id}::uuid
            and kind = 'DIRECT_STATUS'
            and state in ('WAITING', 'RECONFIRMATION_REQUIRED')
          returning queue_entry_id
        `.execute(transaction);
        migratedQueueEntryIds = migrated.rows.map((row) => row.queue_entry_id);
      }

      const nextMembershipVersion = Number(current.membership_version) + 1;
      await sql`
        update community.community_memberships
        set state = 'LEFT', competition_enabled = false,
          left_at = ${context.occurredAt.toISOString()}::timestamptz,
          reason_code = 'VOLUNTARY_EXIT', version = ${nextMembershipVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where membership_id = ${current.membership_id}::uuid and state = 'ACTIVE'
      `.execute(transaction);
      await sql`
        update community.voluntary_membership_exits
        set state = 'CONFIRMED', after_membership_version = ${nextMembershipVersion},
          confirm_event_id = ${ids.eventId}::uuid,
          confirmed_at = ${context.occurredAt.toISOString()}::timestamptz,
          closed_challenge_count = ${closedChallenges.rows.length},
          invalidated_queue_entry_count = ${invalidatedEntries.rows.length},
          version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where exit_id = ${exit.exit_id}::uuid and state = 'PREVIEWED'
      `.execute(transaction);
      const confirmed = await exitRow(transaction, exit.exit_id, false);
      if (!confirmed) throw new MembershipExitConflictError('MEMBERSHIP_EXIT_NOT_FOUND');

      const relatedEvents: RelatedDomainEventDraft[] = [{
        eventId: ids.membershipEventId, eventName: 'MembershipLeft', schemaVersion: 1,
        aggregateType: 'Membership', aggregateId: exit.membership_id,
        aggregateVersion: nextMembershipVersion, transitionId: 'M-06',
        payload: {
          exitId: exit.exit_id, membershipId: exit.membership_id,
          userId: exit.user_id,
          closedChallengeIds: closedChallenges.rows.map((row) => row.challenge_id),
          invalidatedQueueEntryIds: invalidatedEntries.rows.map((row) => row.queue_entry_id),
          createsForfeit: false,
        },
        metadata: { policyVersion: MEMBERSHIP_EXIT_POLICY_VERSION },
      }];
      if (plan.statusRelease && nextCompetitionVersion !== null) {
        relatedEvents.push({
          eventId: ids.competitionEventId,
          eventName: plan.statusRelease.eventName,
          schemaVersion: 1, aggregateType: 'Competition',
          aggregateId: current.competition_id,
          aggregateVersion: nextCompetitionVersion,
          transitionId: plan.statusRelease.transitionId,
          payload: {
            exitId: exit.exit_id,
            beforeChampionUserId: current.champion_user_id,
            beforeContenderUserId: current.contender_user_id,
            afterChampionUserId: plan.statusRelease.afterChampionUserId,
            afterContenderUserId: null,
            statusVersion: Number(current.status_version) + 1,
            phase: plan.statusRelease.afterPhase,
            reason: 'VOLUNTARY_MEMBERSHIP_EXIT',
          },
          metadata: { policyVersion: MEMBERSHIP_EXIT_POLICY_VERSION },
        });
      }
      const notifications: {
        notificationId: string;
        recipientUserId: string;
        category: 'MANDATORY';
        renderKey: string;
        actionTarget: { type: 'COMMUNITY'; competitionId: string };
        payload: Readonly<Record<string, unknown>>;
        deadlineAt: null;
      }[] = [{
        notificationId: ids.notificationIds[0], recipientUserId: exit.user_id,
        category: 'MANDATORY', renderKey: 'membership.exit-confirmed',
        actionTarget: { type: 'COMMUNITY', competitionId: exit.competition_id },
        payload: { exitId: exit.exit_id, consequence: exit.consequence }, deadlineAt: null,
      }];
      if (plan.statusRelease?.afterChampionUserId) {
        notifications.push({
          notificationId: ids.notificationIds[1],
          recipientUserId: plan.statusRelease.afterChampionUserId,
          category: 'MANDATORY', renderKey: 'status.champion-succession',
          actionTarget: { type: 'COMMUNITY', competitionId: exit.competition_id },
          payload: { exitId: exit.exit_id, previousChampionUserId: exit.user_id },
          deadlineAt: null,
        });
      }
      return {
        responseStatus: 200,
        response: await projection(transaction, confirmed, null),
        event: {
          eventId: ids.eventId, eventName: 'VoluntaryResignationConfirmed',
          schemaVersion: 1, transitionId: 'M-06',
          payload: {
            exitId: exit.exit_id, membershipId: exit.membership_id,
            competitionId: exit.competition_id, userId: exit.user_id,
            departingStatus: exit.departing_status, consequence: exit.consequence,
            closedChallengeIds: closedChallenges.rows.map((row) => row.challenge_id),
            invalidatedQueueEntryIds: invalidatedEntries.rows.map((row) => row.queue_entry_id),
            migratedQueueEntryIds, createsForfeit: false,
            createsLoss: false, createsCooldown: false, appealWaived: false,
          },
          metadata: { policyVersion: MEMBERSHIP_EXIT_POLICY_VERSION },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId, action: 'CONFIRM_MEMBERSHIP_EXIT',
          transitionId: 'M-06', reasonCode: 'VOLUNTARY_NO_OBLIGATION',
          beforeState: 'ACTIVE', afterState: 'LEFT',
          metadata: {
            consequence: exit.consequence,
            closedChallengeCount: closedChallenges.rows.length,
            invalidatedQueueEntryCount: invalidatedEntries.rows.length,
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: plan.statusRelease
              ? 'competition.status-released.v1'
              : 'community.membership-left.v1',
            payload: {
              exitId: exit.exit_id, membershipId: exit.membership_id,
              competitionId: exit.competition_id, userId: exit.user_id,
              consequence: exit.consequence, migratedQueueEntryIds,
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1', payload: { notifications },
          },
        ],
      };
    },
  });
}
