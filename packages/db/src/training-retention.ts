import {
  SCHEDULING_POLICY_VERSION,
  SchedulingConflictError,
  SchedulingPermissionDeniedError,
  assertOfficialTrainingRetentionCanBeOffered,
  assertTrainingRetentionCanExpire,
  assertTrainingRetentionDecisionCanBeRecorded,
  type CommandEnvelope,
  type TimerAggregateSnapshot,
  type TrainingRetentionRequiredRole,
  type TrainingRetentionState,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand } from './platform-command.js';

export interface DecideBookingTrainingRetentionPayload {
  readonly retentionId: string;
  readonly decision: 'ACCEPT' | 'DECLINE';
}

export interface ExpireBookingTrainingRetentionPayload {
  readonly retentionId: string;
}

export interface BookingTrainingRetentionEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly confirmationId?: string;
  readonly bookingEventId?: string;
  readonly sessionEventId?: string;
  readonly slotEventId?: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationIds: readonly [string, string, string];
}

export interface OpenBookingTrainingRetentionIds {
  readonly retentionId: string;
}

export interface BookingTrainingRetentionConfirmationProjection {
  readonly actorUserId: string;
  readonly requiredRole: TrainingRetentionRequiredRole;
  readonly decision: 'ACCEPT' | 'DECLINE';
  readonly decidedAt: string;
}

export interface BookingTrainingRetentionProjection {
  readonly retentionId: string;
  readonly bookingId: string;
  readonly sessionId: string;
  readonly challengeId: string;
  readonly cause: 'YOUTH_CONSENT_REVOKED' | 'AGE_TRANSITION';
  readonly state: TrainingRetentionState;
  readonly deadlineAt: string;
  readonly confirmations: readonly BookingTrainingRetentionConfirmationProjection[];
  readonly viewerRequiredRole: TrainingRetentionRequiredRole | null;
  readonly viewerHasDecided: boolean;
  readonly viewerCanConfirm: boolean;
  readonly viewerCanDecline: boolean;
  readonly version: number;
}

interface RetentionRow {
  readonly retention_id: string;
  readonly booking_id: string;
  readonly session_id: string;
  readonly challenge_id: string;
  readonly cause: BookingTrainingRetentionProjection['cause'];
  readonly state: TrainingRetentionState;
  readonly deadline_at: Date;
  readonly version: string;
}

interface RetentionContextRow {
  readonly booking_id: string;
  readonly booking_state: string;
  readonly booking_purpose: string;
  readonly booking_version: string;
  readonly session_id: string;
  readonly session_state: 'SCHEDULED' | 'READY_FOR_COACH' | 'IN_PROGRESS' | 'ENDED' | 'CANCELLED';
  readonly session_version: string;
  readonly actual_start_at: Date | null;
  readonly scheduled_start_at: Date;
  readonly coach_user_id: string;
  readonly pair_low_id: string;
  readonly pair_high_id: string;
  readonly venue_id: string;
  readonly slot_id: string;
  readonly slot_state: string;
  readonly slot_version: string;
}

interface ConfirmationRow {
  readonly actor_user_id: string;
  readonly required_role: TrainingRetentionRequiredRole;
  readonly decision: 'ACCEPT' | 'DECLINE';
  readonly decided_at: Date;
}

export interface OpenedBookingTrainingRetention {
  readonly retentionId: string;
  readonly bookingId: string;
  readonly sessionId: string;
  readonly challengeId: string;
  readonly deadlineAt: string;
  readonly athleteUserIds: readonly [string, string];
  readonly coachUserId: string;
  readonly bookingVersion: number;
}

function requiredId(
  ids: BookingTrainingRetentionEffectIds,
  key: keyof BookingTrainingRetentionEffectIds,
): string {
  const value = ids[key];
  if (typeof value !== 'string') throw new TypeError(`Training retention effect ID ${key} is required`);
  return value;
}

async function contextByChallenge(
  transaction: Transaction<Database>,
  challengeId: string,
): Promise<RetentionContextRow | null> {
  const result = await sql<RetentionContextRow>`
    select booking.booking_id, booking.state as booking_state,
      booking.purpose as booking_purpose, booking.version::text as booking_version,
      session.session_id, session.state as session_state,
      session.version::text as session_version, session.actual_start_at,
      session.scheduled_start_at, session.coach_user_id,
      session.pair_low_id, session.pair_high_id, session.venue_id,
      slot.slot_id, slot.state as slot_state, slot.version::text as slot_version
    from scheduling.bookings booking
    join scheduling.sessions session on session.booking_id = booking.booking_id
    join scheduling.slots slot on slot.slot_id = booking.slot_id
    where booking.challenge_id = ${challengeId}::uuid
      and booking.state = 'CONFIRMED_PAIR'
    order by booking.created_at desc
    limit 1
    for update of booking, session, slot
  `.execute(transaction);
  return result.rows[0] ?? null;
}

async function contextBySession(
  database: Kysely<Database> | Transaction<Database>,
  sessionId: string,
  lock = false,
): Promise<RetentionContextRow | null> {
  const result = await sql<RetentionContextRow>`
    select booking.booking_id, booking.state as booking_state,
      booking.purpose as booking_purpose, booking.version::text as booking_version,
      session.session_id, session.state as session_state,
      session.version::text as session_version, session.actual_start_at,
      session.scheduled_start_at, session.coach_user_id,
      session.pair_low_id, session.pair_high_id, session.venue_id,
      slot.slot_id, slot.state as slot_state, slot.version::text as slot_version
    from scheduling.sessions session
    join scheduling.bookings booking on booking.booking_id = session.booking_id
    join scheduling.slots slot on slot.slot_id = booking.slot_id
    where session.session_id = ${sessionId}::uuid
    ${lock ? sql`for update of booking, session, slot` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function retentionRow(
  database: Kysely<Database> | Transaction<Database>,
  retentionId: string,
  lock = false,
): Promise<RetentionRow | null> {
  const result = await sql<RetentionRow>`
    select retention_id, booking_id, session_id, challenge_id, cause, state,
      deadline_at, version::text as version
    from scheduling.booking_training_retentions
    where retention_id = ${retentionId}::uuid
    ${lock ? sql`for update` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function confirmations(
  database: Kysely<Database> | Transaction<Database>,
  retentionId: string,
): Promise<readonly ConfirmationRow[]> {
  const result = await sql<ConfirmationRow>`
    select actor_user_id, required_role, decision, decided_at
    from scheduling.booking_training_retention_confirmations
    where retention_id = ${retentionId}::uuid
    order by decided_at, required_role
  `.execute(database);
  return result.rows;
}

async function viewerRole(
  database: Kysely<Database> | Transaction<Database>,
  context: RetentionContextRow,
  viewerUserId: string,
): Promise<TrainingRetentionRequiredRole | null> {
  if (viewerUserId === context.pair_low_id) return 'ATHLETE_LOW';
  if (viewerUserId === context.pair_high_id) return 'ATHLETE_HIGH';
  if (viewerUserId === context.coach_user_id) return 'COACH_OR_HOST';
  const result = await sql<{ readonly allowed: boolean }>`
    select exists (
      select 1 from community.role_grants
      where user_id = ${viewerUserId}::uuid
        and role in ('PRIMARY_ADMIN', 'GYM_ADMIN')
        and scope_type = 'VENUE' and scope_id = ${context.venue_id}::uuid
        and state = 'ACTIVE' and (expires_at is null or expires_at > clock_timestamp())
    ) as allowed
  `.execute(database);
  return result.rows[0]?.allowed ? 'COACH_OR_HOST' : null;
}

async function projection(
  database: Kysely<Database> | Transaction<Database>,
  row: RetentionRow,
  viewerUserId: string,
): Promise<BookingTrainingRetentionProjection> {
  const context = await contextBySession(database, row.session_id);
  if (!context) throw new SchedulingConflictError('TRAINING_RETENTION_NOT_ALLOWED');
  const prior = await confirmations(database, row.retention_id);
  const role = await viewerRole(database, context, viewerUserId);
  const viewerHasDecided = prior.some((item) => item.required_role === role);
  const pending = row.state === 'PENDING';
  return {
    retentionId: row.retention_id,
    bookingId: row.booking_id,
    sessionId: row.session_id,
    challengeId: row.challenge_id,
    cause: row.cause,
    state: row.state,
    deadlineAt: row.deadline_at.toISOString(),
    confirmations: prior.map((item) => ({
      actorUserId: item.actor_user_id,
      requiredRole: item.required_role,
      decision: item.decision,
      decidedAt: item.decided_at.toISOString(),
    })),
    viewerRequiredRole: role,
    viewerHasDecided,
    viewerCanConfirm: pending && role !== null && !viewerHasDecided,
    viewerCanDecline: pending && role !== null && !viewerHasDecided,
    version: Number(row.version),
  };
}

export async function readBookingTrainingRetentionForSession(
  database: Kysely<Database> | Transaction<Database>,
  sessionId: string,
  viewerUserId: string,
): Promise<BookingTrainingRetentionProjection | null> {
  const result = await sql<{ readonly retention_id: string }>`
    select retention_id from scheduling.booking_training_retentions
    where session_id = ${sessionId}::uuid
  `.execute(database);
  const retentionId = result.rows[0]?.retention_id;
  if (!retentionId) return null;
  const row = await retentionRow(database, retentionId);
  return row ? projection(database, row, viewerUserId) : null;
}

export async function openBookedOfficialTrainingRetention(
  transaction: Transaction<Database>,
  input: {
    readonly challengeId: string;
    readonly cause: BookingTrainingRetentionProjection['cause'];
    readonly occurredAt: Date;
    readonly ids: OpenBookingTrainingRetentionIds;
  },
): Promise<OpenedBookingTrainingRetention> {
  const context = await contextByChallenge(transaction, input.challengeId);
  if (!context) throw new SchedulingConflictError('TRAINING_RETENTION_NOT_ALLOWED');
  const deadline = assertOfficialTrainingRetentionCanBeOffered({
    bookingState: context.booking_state,
    bookingPurpose: context.booking_purpose,
    sessionState: context.session_state,
    actualStartAt: context.actual_start_at?.toISOString() ?? null,
    slotState: context.slot_state,
    scheduledStartAt: context.scheduled_start_at.toISOString(),
    occurredAt: input.occurredAt,
  });
  await sql`
    insert into scheduling.booking_training_retentions (
      retention_id, booking_id, session_id, challenge_id, cause, state,
      deadline_at, version, created_at, updated_at
    ) values (
      ${input.ids.retentionId}::uuid, ${context.booking_id}::uuid,
      ${context.session_id}::uuid, ${input.challengeId}::uuid, ${input.cause}, 'PENDING',
      ${deadline.toISOString()}::timestamptz, 1,
      ${input.occurredAt.toISOString()}::timestamptz,
      ${input.occurredAt.toISOString()}::timestamptz
    )
  `.execute(transaction);
  await sql`
    update scheduling.bookings
    set state = 'OFFICIAL_RELEASE_PENDING', version = version + 1,
      updated_at = ${input.occurredAt.toISOString()}::timestamptz
    where booking_id = ${context.booking_id}::uuid and state = 'CONFIRMED_PAIR'
  `.execute(transaction);
  return {
    retentionId: input.ids.retentionId,
    bookingId: context.booking_id,
    sessionId: context.session_id,
    challengeId: input.challengeId,
    deadlineAt: deadline.toISOString(),
    athleteUserIds: [context.pair_low_id, context.pair_high_id],
    coachUserId: context.coach_user_id,
    bookingVersion: Number(context.booking_version) + 1,
  };
}

async function pendingContext(
  transaction: Transaction<Database>,
  row: RetentionRow,
): Promise<RetentionContextRow> {
  const context = await contextBySession(transaction, row.session_id, true);
  if (!context || context.booking_state !== 'OFFICIAL_RELEASE_PENDING'
    || context.booking_purpose !== 'OFFICIAL_CHALLENGE'
    || context.session_state !== 'SCHEDULED' || context.actual_start_at !== null
    || context.slot_state !== 'BOOKED') {
    throw new SchedulingConflictError('TRAINING_RETENTION_NOT_PENDING');
  }
  return context;
}

async function closeResources(
  transaction: Transaction<Database>,
  row: RetentionRow,
  context: RetentionContextRow,
  occurredAt: Date,
  actorUserId: string | null,
  terminalState: 'DECLINED' | 'EXPIRED',
): Promise<void> {
  const reason = terminalState === 'DECLINED'
    ? 'TRAINING_RETENTION_DECLINED'
    : 'TRAINING_RETENTION_EXPIRED';
  await sql`
    update scheduling.booking_training_retentions
    set state = ${terminalState}, terminal_reason = ${reason},
      decided_at = ${occurredAt.toISOString()}::timestamptz,
      version = version + 1, updated_at = ${occurredAt.toISOString()}::timestamptz
    where retention_id = ${row.retention_id}::uuid and state = 'PENDING'
  `.execute(transaction);
  await sql`
    update scheduling.bookings
    set state = 'CANCELLED', cancelled_at = ${occurredAt.toISOString()}::timestamptz,
      cancel_actor = ${actorUserId}::uuid, cancel_reason = ${reason}, version = version + 1,
      updated_at = ${occurredAt.toISOString()}::timestamptz
    where booking_id = ${row.booking_id}::uuid and state = 'OFFICIAL_RELEASE_PENDING'
  `.execute(transaction);
  await sql`
    update scheduling.sessions
    set state = 'CANCELLED', cancelled_at = ${occurredAt.toISOString()}::timestamptz,
      cancelled_by = ${actorUserId}::uuid, cancellation_reason_code = ${reason},
      version = version + 1, updated_at = ${occurredAt.toISOString()}::timestamptz
    where session_id = ${row.session_id}::uuid and state = 'SCHEDULED'
  `.execute(transaction);
  await sql`
    update scheduling.slots set state = 'CANCELLED', version = version + 1,
      updated_at = ${occurredAt.toISOString()}::timestamptz
    where slot_id = ${context.slot_id}::uuid and state = 'BOOKED'
  `.execute(transaction);
}

function closedEffect(
  row: RetentionRow,
  context: RetentionContextRow,
  response: BookingTrainingRetentionProjection,
  ids: BookingTrainingRetentionEffectIds,
  terminalState: 'DECLINED' | 'EXPIRED',
) {
  const reason = terminalState === 'DECLINED'
    ? 'TRAINING_RETENTION_DECLINED'
    : 'TRAINING_RETENTION_EXPIRED';
  return {
    responseStatus: 200,
    response,
    event: { eventId: ids.eventId, eventName: 'BookingTrainingRetentionClosed',
      schemaVersion: 1, transitionId: 'B-29', payload: {
        retentionId: row.retention_id, bookingId: row.booking_id, reason, noForfeit: true,
      }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
    relatedEvents: [
      { eventId: requiredId(ids, 'bookingEventId'), eventName: 'BookingCancelledNoFault',
        schemaVersion: 1, aggregateType: 'Booking', aggregateId: row.booking_id,
        aggregateVersion: Number(context.booking_version) + 1, transitionId: 'B-29',
        payload: { bookingId: row.booking_id, reason, noForfeit: true },
        metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
      { eventId: requiredId(ids, 'sessionEventId'), eventName: 'SessionCancelled',
        schemaVersion: 1, aggregateType: 'Session', aggregateId: row.session_id,
        aggregateVersion: Number(context.session_version) + 1, transitionId: 'S-04',
        payload: { sessionId: row.session_id, reasonCode: reason },
        metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
      { eventId: requiredId(ids, 'slotEventId'), eventName: 'SlotBookingCancelled',
        schemaVersion: 1, aggregateType: 'Slot', aggregateId: context.slot_id,
        aggregateVersion: Number(context.slot_version) + 1, transitionId: 'SL-06',
        payload: { slotId: context.slot_id, reasonCode: reason },
        metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
    ],
    audit: { auditId: ids.auditId, action: 'CLOSE_BOOKING_TRAINING_RETENTION',
      transitionId: 'B-29', reasonCode: reason, beforeState: 'PENDING',
      afterState: terminalState, metadata: { bookingId: row.booking_id,
        sessionId: row.session_id, challengeId: row.challenge_id, noForfeit: true } },
    outbox: [
      { messageId: ids.outboxMessageId,
        topic: 'scheduling.booking.training-retention-closed.v1',
        payload: { retentionId: row.retention_id, bookingId: row.booking_id,
          sessionId: row.session_id, reason, noForfeit: true } },
      { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1',
        payload: { notifications: [context.pair_low_id, context.pair_high_id, context.coach_user_id]
          .map((recipientUserId, index) => ({ notificationId: ids.notificationIds[index]!,
            recipientUserId, category: 'SERVICE', renderKey: 'booking.training-retention-closed',
            actionTarget: { type: 'SESSION', sessionId: row.session_id },
            payload: { retentionId: row.retention_id, reason }, deadlineAt: null })) } },
    ],
  } as const;
}

export async function decideBookingTrainingRetention(
  database: Kysely<Database>,
  command: CommandEnvelope<DecideBookingTrainingRetentionPayload>,
  ids: BookingTrainingRetentionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<BookingTrainingRetentionProjection>> {
  if (!command.actor.id || command.aggregateType !== 'BookingTrainingRetention'
    || command.aggregateId !== command.payload.retentionId) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, eventContext) => {
      const row = await retentionRow(transaction, command.aggregateId, true);
      if (!row) throw new SchedulingConflictError('TRAINING_RETENTION_NOT_PENDING');
      const context = await pendingContext(transaction, row);
      const role = await viewerRole(transaction, context, command.actor.id!);
      const prior = await confirmations(transaction, row.retention_id);
      assertTrainingRetentionDecisionCanBeRecorded({
        state: row.state, actorRequired: role !== null,
        actorAlreadyDecided: prior.some((item) => item.required_role === role),
        deadlineAt: row.deadline_at.toISOString(), occurredAt: eventContext.occurredAt,
      });
      await sql`
        insert into scheduling.booking_training_retention_confirmations (
          confirmation_id, retention_id, actor_user_id, required_role,
          decision, decided_at, policy_version
        ) values (
          ${requiredId(ids, 'confirmationId')}::uuid, ${row.retention_id}::uuid,
          ${command.actor.id}::uuid, ${role}, ${command.payload.decision},
          ${eventContext.occurredAt.toISOString()}::timestamptz, ${SCHEDULING_POLICY_VERSION}
        )
      `.execute(transaction);
      if (command.payload.decision === 'DECLINE') {
        await closeResources(transaction, row, context, eventContext.occurredAt, command.actor.id!, 'DECLINED');
        const closed = await retentionRow(transaction, row.retention_id);
        if (!closed) throw new SchedulingConflictError('TRAINING_RETENTION_NOT_PENDING');
        return closedEffect(row, context, await projection(transaction, closed, command.actor.id!), ids, 'DECLINED');
      }
      const acceptedCount = prior.filter((item) => item.decision === 'ACCEPT').length + 1;
      if (acceptedCount < 3) {
        await sql`
          update scheduling.booking_training_retentions
          set version = version + 1, updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
          where retention_id = ${row.retention_id}::uuid and state = 'PENDING'
        `.execute(transaction);
        const pending = await retentionRow(transaction, row.retention_id);
        if (!pending) throw new SchedulingConflictError('TRAINING_RETENTION_NOT_PENDING');
        const response = await projection(transaction, pending, command.actor.id!);
        return {
          responseStatus: 200, response,
          event: { eventId: ids.eventId, eventName: 'BookingTrainingRetentionConfirmed',
            schemaVersion: 1, transitionId: 'B-27', payload: {
              retentionId: row.retention_id, actorUserId: command.actor.id,
              requiredRole: role, acceptedCount,
            }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
          audit: { auditId: ids.auditId, action: 'CONFIRM_BOOKING_TRAINING_RETENTION_PARTY',
            transitionId: 'B-27', reasonCode: null, beforeState: 'PENDING',
            afterState: 'PENDING', metadata: { acceptedCount } },
          outbox: [
            { messageId: ids.outboxMessageId,
              topic: 'scheduling.booking.training-retention-party-confirmed.v1',
              payload: { retentionId: row.retention_id, bookingId: row.booking_id,
                actorUserId: command.actor.id, acceptedCount } },
            { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1',
              payload: { notifications: [context.pair_low_id, context.pair_high_id,
                context.coach_user_id].filter((id) => id !== command.actor.id)
                .map((recipientUserId, index) => ({ notificationId: ids.notificationIds[index]!,
                  recipientUserId, category: 'SERVICE',
                  renderKey: 'booking.training-retention-party-confirmed',
                  actionTarget: { type: 'SESSION', sessionId: row.session_id },
                  payload: { retentionId: row.retention_id, acceptedCount },
                  deadlineAt: row.deadline_at.toISOString() })) } },
          ],
        };
      }
      await sql`
        update scheduling.booking_training_retentions
        set state = 'CONFIRMED', terminal_reason = 'ALL_REQUIRED_PARTIES_ACCEPTED',
          decided_at = ${eventContext.occurredAt.toISOString()}::timestamptz,
          version = version + 1, updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where retention_id = ${row.retention_id}::uuid and state = 'PENDING'
      `.execute(transaction);
      await sql`
        update scheduling.bookings
        set state = 'CONFIRMED_PAIR', purpose = 'TRAINING', challenge_id = null,
          version = version + 1, updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where booking_id = ${row.booking_id}::uuid and state = 'OFFICIAL_RELEASE_PENDING'
      `.execute(transaction);
      await sql`
        update scheduling.sessions
        set purpose = 'TRAINING', challenge_id = null, version = version + 1,
          updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where session_id = ${row.session_id}::uuid and state = 'SCHEDULED'
      `.execute(transaction);
      const confirmed = await retentionRow(transaction, row.retention_id);
      if (!confirmed) throw new SchedulingConflictError('TRAINING_RETENTION_NOT_PENDING');
      const response = await projection(transaction, confirmed, command.actor.id!);
      return {
        responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'BookingTrainingRetentionConfirmed',
          schemaVersion: 1, transitionId: 'B-28', payload: {
            retentionId: row.retention_id, bookingId: row.booking_id,
            sessionId: row.session_id, sourceChallengeId: row.challenge_id,
          }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
        relatedEvents: [
          { eventId: requiredId(ids, 'bookingEventId'), eventName: 'BookingConvertedToTraining',
            schemaVersion: 1, aggregateType: 'Booking', aggregateId: row.booking_id,
            aggregateVersion: Number(context.booking_version) + 1, transitionId: 'B-28',
            payload: { bookingId: row.booking_id, sourceChallengeId: row.challenge_id },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
          { eventId: requiredId(ids, 'sessionEventId'), eventName: 'SessionConvertedToTraining',
            schemaVersion: 1, aggregateType: 'Session', aggregateId: row.session_id,
            aggregateVersion: Number(context.session_version) + 1, transitionId: 'S-13',
            payload: { sessionId: row.session_id, sourceChallengeId: row.challenge_id },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
        ],
        audit: { auditId: ids.auditId, action: 'RETAIN_OFFICIAL_BOOKING_AS_TRAINING',
          transitionId: 'B-28', reasonCode: row.cause, beforeState: 'PENDING',
          afterState: 'CONFIRMED', metadata: { bookingId: row.booking_id,
            sessionId: row.session_id, sourceChallengeId: row.challenge_id } },
        outbox: [
          { messageId: ids.outboxMessageId, topic: 'scheduling.booking.retained-as-training.v1',
            payload: { retentionId: row.retention_id, bookingId: row.booking_id,
              sessionId: row.session_id, sourceChallengeId: row.challenge_id } },
          { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1',
            payload: { notifications: [context.pair_low_id, context.pair_high_id,
              context.coach_user_id].map((recipientUserId, index) => ({
                notificationId: ids.notificationIds[index]!, recipientUserId,
                category: 'MANDATORY', renderKey: 'booking.retained-as-training',
                actionTarget: { type: 'SESSION', sessionId: row.session_id },
                payload: { retentionId: row.retention_id,
                  sourceChallengeId: row.challenge_id }, deadlineAt: null,
              })) } },
        ],
      };
    },
  });
}

export async function expireBookingTrainingRetention(
  database: Kysely<Database>,
  command: CommandEnvelope<ExpireBookingTrainingRetentionPayload>,
  ids: BookingTrainingRetentionEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<BookingTrainingRetentionProjection>> {
  if (command.actor.type !== 'SYSTEM' || command.aggregateType !== 'BookingTrainingRetention'
    || command.aggregateId !== command.payload.retentionId) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, eventContext) => {
      const row = await retentionRow(transaction, command.aggregateId, true);
      if (!row) throw new SchedulingConflictError('TRAINING_RETENTION_NOT_PENDING');
      assertTrainingRetentionCanExpire({ state: row.state,
        deadlineAt: row.deadline_at.toISOString(), occurredAt: eventContext.occurredAt });
      const context = await pendingContext(transaction, row);
      await closeResources(transaction, row, context, eventContext.occurredAt, null, 'EXPIRED');
      const expired = await retentionRow(transaction, row.retention_id);
      if (!expired) throw new SchedulingConflictError('TRAINING_RETENTION_NOT_PENDING');
      return closedEffect(row, context,
        await projection(transaction, expired, context.pair_low_id), ids, 'EXPIRED');
    },
  });
}

export async function readBookingTrainingRetentionTimerSnapshot(
  database: Kysely<Database>,
  retentionId: string,
): Promise<TimerAggregateSnapshot> {
  const row = await retentionRow(database, retentionId);
  return row ? { state: row.state, version: Number(row.version) } : { state: 'MISSING', version: 0 };
}
