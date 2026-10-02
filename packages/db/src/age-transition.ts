import {
  InvalidIdentityTransitionError,
  assertAgeDivisionCanTransition,
  deriveStatusReleasePlan,
  adultTransitionAt,
  type CommandEnvelope,
  type TimerAggregateSnapshot,
} from '@molokh/core';
import { type Kysely, type Transaction, sql } from 'kysely';

import type { Database } from './index.js';
import {
  executeCriticalCommand,
  type ExecutedCommand,
  type RelatedDomainEventDraft,
} from './platform-command.js';
import { openBookedOfficialTrainingRetention } from './training-retention.js';

export const AGE_DIVISION_POLICY_VERSION = 'identity-v1' as const;

export interface TransitionToAdultPayload {
  readonly userId: string;
}

export interface AgeDivisionStatusChange {
  readonly competitionId: string;
  readonly releasedStatus: 'CHAMPION' | 'CONTENDER';
  readonly beforeChampionUserId: string | null;
  readonly beforeContenderUserId: string | null;
  readonly afterChampionUserId: string | null;
  readonly afterContenderUserId: null;
  readonly afterPhase: 'CONTENDER_VACANT_OPEN' | 'FOUNDING_OPEN';
  readonly statusVersion: number;
}

export interface AgeDivisionTransitionProjection {
  readonly transitionId: string;
  readonly userId: string;
  readonly fromAgeDivision: 'YOUTH';
  readonly toAgeDivision: 'ADULT';
  readonly transitionedAt: string;
  readonly identityVersion: number;
  readonly affectedMembershipCount: number;
  readonly closedChallengeIds: readonly string[];
  readonly retentionIds: readonly string[];
  readonly invalidatedQueueEntryIds: readonly string[];
  readonly expiredConsentIds: readonly string[];
  readonly statusChanges: readonly AgeDivisionStatusChange[];
}

export interface AgeDivisionTransitionEffectIds {
  readonly transitionId: string;
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationId: string;
  readonly relatedEventIds: readonly string[];
  readonly retentionIds: readonly string[];
  readonly retentionTimerOutboxMessageIds: readonly string[];
  readonly statusOutboxMessageIds: readonly string[];
}

interface IdentityTransitionRow {
  readonly user_id: string;
  readonly birth_date: string;
  readonly age_division: 'YOUTH' | 'ADULT';
  readonly version: string;
}

interface MembershipRow {
  readonly membership_id: string;
  readonly community_id: string;
  readonly version: string;
}

interface CompetitionRow {
  readonly competition_id: string;
  readonly champion_user_id: string | null;
  readonly contender_user_id: string | null;
  readonly status_version: string;
  readonly version: string;
}

interface ChallengeRow {
  readonly challenge_id: string;
  readonly state: string;
  readonly version: string;
  readonly booking_id: string | null;
  readonly booking_state: string | null;
  readonly booking_version: string | null;
  readonly session_id: string | null;
  readonly session_state: string | null;
  readonly session_version: string | null;
  readonly actual_start_at: Date | null;
  readonly scheduled_start_at: Date | null;
  readonly slot_id: string | null;
  readonly slot_state: string | null;
  readonly slot_version: string | null;
}

function requiredId(ids: readonly string[], index: number, label: string): string {
  const value = ids[index];
  if (!value) throw new TypeError(`${label} effect ID ${index} is required`);
  return value;
}

async function lockIdentity(
  transaction: Transaction<Database>,
  userId: string,
): Promise<IdentityTransitionRow> {
  const result = await sql<IdentityTransitionRow>`
    select user_id, birth_date::text, age_division, version::text
    from identity.users
    where user_id = ${userId}::uuid
    for update
  `.execute(transaction);
  const row = result.rows[0];
  if (!row) throw new InvalidIdentityTransitionError('AD-01');
  return row;
}

async function youthMemberships(
  transaction: Transaction<Database>,
  userId: string,
): Promise<readonly MembershipRow[]> {
  const result = await sql<MembershipRow>`
    select membership_id, community_id, version::text
    from community.community_memberships
    where user_id = ${userId}::uuid
      and age_division = 'YOUTH'
      and state in ('PENDING', 'ACTIVE', 'UNDER_REVIEW')
    order by membership_id
    for update
  `.execute(transaction);
  return result.rows;
}

async function heldYouthCompetitions(
  transaction: Transaction<Database>,
  userId: string,
): Promise<readonly CompetitionRow[]> {
  const result = await sql<CompetitionRow>`
    select competition_id, champion_user_id, contender_user_id,
      status_version::text, version::text
    from competition.competitions
    where age_division = 'YOUTH'
      and availability in ('ACTIVE', 'PAUSED')
      and ${userId}::uuid in (champion_user_id, contender_user_id)
    order by competition_id
    for update
  `.execute(transaction);
  return result.rows;
}

async function unstartedYouthChallenges(
  transaction: Transaction<Database>,
  userId: string,
): Promise<readonly ChallengeRow[]> {
  const result = await sql<ChallengeRow>`
    select challenge.challenge_id, challenge.state, challenge.version::text,
      booking.booking_id, booking.state as booking_state,
      booking.version::text as booking_version,
      session.session_id, session.state as session_state,
      session.version::text as session_version,
      session.actual_start_at, session.scheduled_start_at,
      slot.slot_id, slot.state as slot_state, slot.version::text as slot_version
    from competition.challenges as challenge
    join competition.competitions as competitive
      on competitive.competition_id = challenge.competition_id
    left join lateral (
      select candidate.* from scheduling.bookings as candidate
      where candidate.challenge_id = challenge.challenge_id
        and candidate.state not in ('EXPIRED', 'REJECTED', 'CANCELLED', 'COMPLETED')
      order by candidate.created_at desc, candidate.booking_id desc
      limit 1
    ) as booking on true
    left join scheduling.sessions as session on session.booking_id = booking.booking_id
    left join scheduling.slots as slot on slot.slot_id = booking.slot_id
    where competitive.age_division = 'YOUTH'
      and ${userId}::uuid in (challenge.pair_low_id, challenge.pair_high_id)
      and challenge.state in (
        'AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED'
      )
      and session.actual_start_at is null
    order by challenge.challenge_id
    for update of challenge
  `.execute(transaction);
  return result.rows;
}

async function cancelUnretainedScheduling(
  transaction: Transaction<Database>,
  challenge: ChallengeRow,
  occurredAt: Date,
): Promise<void> {
  const timestamp = occurredAt.toISOString();
  if (challenge.session_id) {
    await sql`
      update scheduling.sessions
      set state = 'CANCELLED', cancelled_at = ${timestamp}::timestamptz,
        cancelled_by = null, cancellation_reason_code = 'AGE_TRANSITION',
        version = version + 1, updated_at = ${timestamp}::timestamptz
      where session_id = ${challenge.session_id}::uuid
        and state in ('SCHEDULED', 'READY_FOR_COACH') and actual_start_at is null
    `.execute(transaction);
  }
  if (challenge.booking_id) {
    await sql`
      update scheduling.bookings
      set state = 'CANCELLED', cancelled_at = ${timestamp}::timestamptz,
        cancel_actor = null, cancel_reason = 'AGE_TRANSITION',
        version = version + 1, updated_at = ${timestamp}::timestamptz
      where booking_id = ${challenge.booking_id}::uuid
        and state not in ('EXPIRED', 'REJECTED', 'CANCELLED', 'COMPLETED')
    `.execute(transaction);
  }
  if (challenge.slot_id && challenge.slot_state === 'BOOKED') {
    await sql`
      update scheduling.slots
      set state = 'CANCELLED', version = version + 1,
        updated_at = ${timestamp}::timestamptz
      where slot_id = ${challenge.slot_id}::uuid and state = 'BOOKED'
    `.execute(transaction);
  }
}

function canOfferRetention(challenge: ChallengeRow, occurredAt: Date): boolean {
  return challenge.state === 'BOOKED'
    && challenge.booking_state === 'CONFIRMED_PAIR'
    && challenge.session_state === 'SCHEDULED'
    && challenge.actual_start_at === null
    && challenge.slot_state === 'BOOKED'
    && challenge.scheduled_start_at !== null
    && challenge.scheduled_start_at > occurredAt;
}

export async function transitionYouthToAdult(
  database: Kysely<Database>,
  command: CommandEnvelope<TransitionToAdultPayload>,
  ids: AgeDivisionTransitionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<AgeDivisionTransitionProjection>> {
  if (
    command.actor.type !== 'SYSTEM'
    || command.aggregateType !== 'AgeDivisionTransition'
    || command.aggregateId !== command.payload.userId
  ) {
    throw new InvalidIdentityTransitionError('AD-01');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const identity = await lockIdentity(transaction, command.payload.userId);
      assertAgeDivisionCanTransition({
        currentAgeDivision: identity.age_division,
        birthDate: identity.birth_date,
        occurredAt: context.occurredAt,
      });
      const memberships = await youthMemberships(transaction, identity.user_id);
      const competitions = await heldYouthCompetitions(transaction, identity.user_id);
      const challenges = await unstartedYouthChallenges(transaction, identity.user_id);
      const relatedEvents: RelatedDomainEventDraft[] = [];
      let relatedIndex = 0;
      let retentionIndex = 0;
      const retentionIds: string[] = [];
      const statusChanges: AgeDivisionStatusChange[] = [];
      const timestamp = context.occurredAt.toISOString();

      for (const challenge of challenges) {
        await sql`
          update competition.challenges
          set state = 'CANCELLED_NO_FAULT', decided_at = ${timestamp}::timestamptz,
            version = version + 1, updated_at = ${timestamp}::timestamptz
          where challenge_id = ${challenge.challenge_id}::uuid
            and version = ${Number(challenge.version)}
        `.execute(transaction);
        await sql`
          update competition.challenge_participant_obligations
          set released_at = ${timestamp}::timestamptz, release_reason = 'AGE_TRANSITION'
          where challenge_id = ${challenge.challenge_id}::uuid and released_at is null
        `.execute(transaction);
        relatedEvents.push({
          eventId: requiredId(ids.relatedEventIds, relatedIndex++, 'related'),
          eventName: 'ChallengeCancelledNoFault', schemaVersion: 1,
          aggregateType: 'Challenge', aggregateId: challenge.challenge_id,
          aggregateVersion: Number(challenge.version) + 1, transitionId: 'CH-26',
          payload: { challengeId: challenge.challenge_id, reason: 'AGE_TRANSITION', noForfeit: true },
          metadata: { policyVersion: AGE_DIVISION_POLICY_VERSION },
        });

        if (canOfferRetention(challenge, context.occurredAt)) {
          const retentionId = requiredId(ids.retentionIds, retentionIndex, 'retention');
          const retention = await openBookedOfficialTrainingRetention(transaction, {
            challengeId: challenge.challenge_id,
            cause: 'AGE_TRANSITION', occurredAt: context.occurredAt,
            ids: { retentionId },
          });
          retentionIds.push(retentionId);
          relatedEvents.push({
            eventId: requiredId(ids.relatedEventIds, relatedIndex++, 'related'),
            eventName: 'BookingTrainingRetentionRequested', schemaVersion: 1,
            aggregateType: 'BookingTrainingRetention', aggregateId: retentionId,
            aggregateVersion: 1, transitionId: 'B-26',
            payload: {
              retentionId, bookingId: retention.bookingId, sessionId: retention.sessionId,
              sourceChallengeId: challenge.challenge_id, cause: 'AGE_TRANSITION',
              deadlineAt: retention.deadlineAt,
            },
            metadata: { policyVersion: 'scheduling-mvp-v1' },
          }, {
            eventId: requiredId(ids.relatedEventIds, relatedIndex++, 'related'),
            eventName: 'BookingOfficialReleasePending', schemaVersion: 1,
            aggregateType: 'Booking', aggregateId: retention.bookingId,
            aggregateVersion: retention.bookingVersion, transitionId: 'B-26',
            payload: { bookingId: retention.bookingId, retentionId,
              sourceChallengeId: challenge.challenge_id },
            metadata: { policyVersion: 'scheduling-mvp-v1' },
          });
          retentionIndex += 1;
        } else {
          await cancelUnretainedScheduling(transaction, challenge, context.occurredAt);
        }
      }

      const expiredConsents = await sql<{ readonly consent_id: string }>`
        update governance.youth_challenge_consents
        set state = 'EXPIRED', version = version + 1,
          updated_at = ${timestamp}::timestamptz
        where athlete_user_id = ${identity.user_id}::uuid
          and state in ('PENDING', 'GRANTED')
        returning consent_id
      `.execute(transaction);

      const closedChallengeIds = challenges.map((challenge) => challenge.challenge_id);
      const invalidatedQueue = await sql<{ readonly queue_entry_id: string }>`
        update competition.challenge_queue_entries as entry
        set state = 'INVALIDATED', terminal_reason = 'AGE_TRANSITION',
          decided_at = ${timestamp}::timestamptz, reconfirmation_deadline_at = null,
          version = entry.version + 1, updated_at = ${timestamp}::timestamptz
        from competition.competitions as competitive
        where competitive.competition_id = entry.competition_id
          and competitive.age_division = 'YOUTH'
          and entry.state in (
            'WAITING', 'PAIRED_PENDING_ACCEPTANCE', 'RECONFIRMATION_REQUIRED', 'ACTIVATED'
          )
          and (
            entry.initiator_user_id = ${identity.user_id}::uuid
            or entry.bound_holder_user_id = ${identity.user_id}::uuid
            or entry.linked_challenge_id = any(${closedChallengeIds}::uuid[])
          )
        returning entry.queue_entry_id
      `.execute(transaction);

      for (const competition of competitions) {
        const plan = deriveStatusReleasePlan({
          actorUserId: identity.user_id,
          championUserId: competition.champion_user_id,
          contenderUserId: competition.contender_user_id,
        });
        const statusVersion = Number(competition.status_version) + 1;
        const competitionVersion = Number(competition.version) + 1;
        await sql`
          update competition.competitions
          set champion_user_id = ${plan.afterChampionUserId}::uuid,
            contender_user_id = null, phase = ${plan.afterPhase},
            status_version = ${statusVersion}, version = ${competitionVersion},
            updated_at = ${timestamp}::timestamptz
          where competition_id = ${competition.competition_id}::uuid
        `.execute(transaction);
        const targetStatus = plan.afterPhase === 'FOUNDING_OPEN' ? 'CHAMPION' : 'CONTENDER';
        await sql`
          update competition.challenge_queue_entries
          set target_status = ${targetStatus}, kind = 'GENESIS_CANDIDATE', state = 'WAITING',
            bound_holder_user_id = null, reconfirmation_deadline_at = null,
            version = version + 1, updated_at = ${timestamp}::timestamptz
          where competition_id = ${competition.competition_id}::uuid
            and kind = 'DIRECT_STATUS'
            and state in ('WAITING', 'RECONFIRMATION_REQUIRED')
        `.execute(transaction);
        const change: AgeDivisionStatusChange = {
          competitionId: competition.competition_id,
          releasedStatus: plan.releasedStatus,
          beforeChampionUserId: competition.champion_user_id,
          beforeContenderUserId: competition.contender_user_id,
          afterChampionUserId: plan.afterChampionUserId,
          afterContenderUserId: null,
          afterPhase: plan.afterPhase,
          statusVersion,
        };
        statusChanges.push(change);
        relatedEvents.push({
          eventId: requiredId(ids.relatedEventIds, relatedIndex++, 'related'),
          eventName: plan.eventName, schemaVersion: 1,
          aggregateType: 'Competition', aggregateId: competition.competition_id,
          aggregateVersion: competitionVersion, transitionId: plan.transitionId,
          payload: { ...change, reason: 'AGE_TRANSITION', createsLoss: false,
            createsCooldown: false },
          metadata: { policyVersion: AGE_DIVISION_POLICY_VERSION },
        });
      }

      for (const membership of memberships) {
        await sql`
          update community.community_memberships
          set age_division = 'ADULT', version = version + 1,
            updated_at = ${timestamp}::timestamptz
          where membership_id = ${membership.membership_id}::uuid
            and age_division = 'YOUTH'
        `.execute(transaction);
        relatedEvents.push({
          eventId: requiredId(ids.relatedEventIds, relatedIndex++, 'related'),
          eventName: 'MembershipAgeDivisionChanged', schemaVersion: 1,
          aggregateType: 'Membership', aggregateId: membership.membership_id,
          aggregateVersion: Number(membership.version) + 1, transitionId: 'AD-01',
          payload: { membershipId: membership.membership_id,
            communityId: membership.community_id, fromAgeDivision: 'YOUTH',
            toAgeDivision: 'ADULT', competitionStatus: 'ORDINARY' },
          metadata: { policyVersion: AGE_DIVISION_POLICY_VERSION },
        });
      }

      const nextIdentityVersion = Number(identity.version) + 1;
      await sql`
        update identity.users
        set age_division = 'ADULT', version = ${nextIdentityVersion},
          updated_at = ${timestamp}::timestamptz
        where user_id = ${identity.user_id}::uuid and age_division = 'YOUTH'
      `.execute(transaction);
      relatedEvents.push({
        eventId: requiredId(ids.relatedEventIds, relatedIndex++, 'related'),
        eventName: 'UserAgeDivisionChanged', schemaVersion: 1,
        aggregateType: 'User', aggregateId: identity.user_id,
        aggregateVersion: nextIdentityVersion, transitionId: 'AD-01',
        payload: { userId: identity.user_id, fromAgeDivision: 'YOUTH',
          toAgeDivision: 'ADULT' },
        metadata: { policyVersion: AGE_DIVISION_POLICY_VERSION },
      });

      const projection: AgeDivisionTransitionProjection = {
        transitionId: ids.transitionId,
        userId: identity.user_id,
        fromAgeDivision: 'YOUTH', toAgeDivision: 'ADULT', transitionedAt: timestamp,
        identityVersion: nextIdentityVersion,
        affectedMembershipCount: memberships.length,
        closedChallengeIds,
        retentionIds,
        invalidatedQueueEntryIds: invalidatedQueue.rows.map((row) => row.queue_entry_id),
        expiredConsentIds: expiredConsents.rows.map((row) => row.consent_id),
        statusChanges,
      };
      await sql`
        insert into identity.age_division_transitions (
          transition_id, user_id, from_age_division, to_age_division,
          identity_version_before, identity_version_after, affected_membership_count,
          closed_challenge_ids, retention_ids, invalidated_queue_entry_ids,
          expired_consent_ids, status_changes, source_event_id, policy_version, transitioned_at
        ) values (
          ${ids.transitionId}::uuid, ${identity.user_id}::uuid, 'YOUTH', 'ADULT',
          ${Number(identity.version)}, ${nextIdentityVersion}, ${memberships.length},
          ${closedChallengeIds}::uuid[], ${retentionIds}::uuid[],
          ${projection.invalidatedQueueEntryIds}::uuid[], ${projection.expiredConsentIds}::uuid[],
          ${JSON.stringify(statusChanges)}::jsonb, ${ids.eventId}::uuid,
          ${AGE_DIVISION_POLICY_VERSION}, ${timestamp}::timestamptz
        )
      `.execute(transaction);

      return {
        responseStatus: 200,
        response: projection,
        event: {
          eventId: ids.eventId, eventName: 'AgeDivisionChanged', schemaVersion: 1,
          transitionId: 'AD-01', payload: projection,
          metadata: { policyVersion: AGE_DIVISION_POLICY_VERSION },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId, action: 'TRANSITION_TO_ADULT', transitionId: 'AD-01',
          reasonCode: 'AGE_BOUNDARY_REACHED', beforeState: 'YOUTH', afterState: 'ADULT',
          metadata: { closedChallengeCount: closedChallengeIds.length,
            retentionCount: retentionIds.length, statusChangeCount: statusChanges.length },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId, topic: 'identity.age-division.changed.v1',
            payload: projection,
          },
          ...retentionIds.map((retentionId, index) => {
            const challenge = challenges.filter((item) => canOfferRetention(item, context.occurredAt))[index]!;
            const deadline = new Date(Math.min(
              challenge.scheduled_start_at!.getTime(),
              context.occurredAt.getTime() + 60 * 60 * 1_000,
            ));
            return {
              messageId: requiredId(ids.retentionTimerOutboxMessageIds, index, 'retention timer outbox'),
              topic: 'scheduling.booking.training-retention-timer.v1',
              payload: { retentionId, timer: {
                commandType: 'EXPIRE_BOOKING_TRAINING_RETENTION',
                aggregateType: 'BookingTrainingRetention', aggregateId: retentionId,
                expectedState: 'PENDING', expectedVersion: 1,
                deadlineAt: deadline.toISOString(), policyVersion: 'scheduling-mvp-v1',
                idempotencyKey: `booking-training-retention:${retentionId}:expire:v1`,
              } },
            };
          }),
          ...statusChanges.map((change, index) => ({
            messageId: requiredId(ids.statusOutboxMessageIds, index, 'status outbox'),
            topic: 'competition.status-released.v1',
            payload: { competitionId: change.competitionId, reason: 'AGE_TRANSITION',
              phase: change.afterPhase },
          })),
          {
            messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1',
            payload: { notifications: [{
              notificationId: ids.notificationId, recipientUserId: identity.user_id,
              category: 'MANDATORY', renderKey: 'identity.age-division-changed',
              actionTarget: { type: 'PROFILE', userId: identity.user_id },
              payload: { fromAgeDivision: 'YOUTH', toAgeDivision: 'ADULT',
                closedChallengeCount: closedChallengeIds.length,
                retentionCount: retentionIds.length }, deadlineAt: null,
            }] },
          },
        ],
      };
    },
  });
}

export async function readAgeDivisionTransitionTimerSnapshot(
  database: Kysely<Database>,
  userId: string,
): Promise<TimerAggregateSnapshot> {
  const result = await sql<{
    readonly birth_date: string;
    readonly age_division: 'YOUTH' | 'ADULT';
    readonly transitioned: boolean;
  }>`
    select users.birth_date::text, users.age_division,
      (transition.transition_id is not null) as transitioned
    from identity.users as users
    left join identity.age_division_transitions as transition
      on transition.user_id = users.user_id
    where users.user_id = ${userId}::uuid
  `.execute(database);
  const row = result.rows[0];
  if (!row) return { state: 'MISSING', version: 0 };
  return {
    state: row.age_division,
    version: row.transitioned ? 1 : 0,
    deadlineAt: adultTransitionAt(row.birth_date).toISOString(),
  };
}
