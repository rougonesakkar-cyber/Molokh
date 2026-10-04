import {
  SCHEDULING_POLICY_VERSION,
  SchedulingConflictError,
  SchedulingPermissionDeniedError,
  assertSoloContinuationCanExpire,
  assertSoloContinuationDecisionCanBeRecorded,
  assertTrainingParticipantCanCancel,
  type CommandEnvelope,
  type SoloContinuationRequiredRole,
  type SoloContinuationState,
  type TimerAggregateSnapshot,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand } from './platform-command.js';

export interface RequestTrainingParticipantCancellationPayload {
  readonly sessionId: string;
}

export interface DecideBookingSoloContinuationPayload {
  readonly continuationId: string;
  readonly decision: 'ACCEPT' | 'DECLINE';
}

export interface ExpireBookingSoloContinuationPayload {
  readonly continuationId: string;
}

export interface BookingSoloContinuationEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly continuationId?: string;
  readonly confirmationId?: string;
  readonly bookingEventId?: string;
  readonly sessionEventId?: string;
  readonly sessionTimerOutboxMessageId?: string;
  readonly slotEventId?: string;
  readonly conversionEventId?: string;
  readonly conversionQueueEventId?: string;
  readonly conversionOutboxMessageId?: string;
  readonly timerOutboxMessageId?: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationIds: readonly [string, string];
}

export interface BookingSoloConfirmationProjection {
  readonly actorUserId: string;
  readonly requiredRole: SoloContinuationRequiredRole;
  readonly decision: 'ACCEPT' | 'DECLINE';
  readonly decidedAt: string;
}

export interface BookingSoloContinuationProjection {
  readonly continuationId: string;
  readonly bookingId: string;
  readonly sessionId: string;
  readonly cancelledAthleteUserId: string;
  readonly remainingAthleteUserId: string;
  readonly state: SoloContinuationState;
  readonly deadlineAt: string;
  readonly confirmations: readonly BookingSoloConfirmationProjection[];
  readonly viewerRequiredRole: SoloContinuationRequiredRole | null;
  readonly viewerHasDecided: boolean;
  readonly viewerCanConfirm: boolean;
  readonly viewerCanDecline: boolean;
  readonly version: number;
}

interface TrainingContextRow {
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
  readonly slot_id: string;
  readonly slot_state: string;
  readonly slot_version: string;
  readonly has_live_solo_continuation: boolean;
}

interface SoloRow {
  readonly continuation_id: string;
  readonly booking_id: string;
  readonly session_id: string;
  readonly cancelled_athlete_user_id: string;
  readonly remaining_athlete_user_id: string;
  readonly state: SoloContinuationState;
  readonly deadline_at: Date;
  readonly version: string;
}

interface SoloConfirmationRow {
  readonly actor_user_id: string;
  readonly required_role: SoloContinuationRequiredRole;
  readonly decision: 'ACCEPT' | 'DECLINE';
  readonly decided_at: Date;
}

interface LiveConversionRow {
  readonly conversion_id: string;
  readonly competition_id: string;
  readonly state: 'WAITING_FIFO' | 'PENDING_CONFIRMATION';
  readonly version: string;
  readonly queue_entry_id: string | null;
  readonly queue_version: string | null;
}

function requiredId(
  ids: BookingSoloContinuationEffectIds,
  key: keyof BookingSoloContinuationEffectIds,
): string {
  const value = ids[key];
  if (typeof value !== 'string') throw new TypeError(`Solo continuation effect ID ${key} is required`);
  return value;
}

async function trainingContext(
  database: Kysely<Database> | Transaction<Database>,
  sessionId: string,
  lock = false,
): Promise<TrainingContextRow | null> {
  const result = await sql<TrainingContextRow>`
    select booking.booking_id, booking.state as booking_state,
      booking.purpose as booking_purpose, booking.version::text as booking_version,
      session.session_id, session.state as session_state,
      session.version::text as session_version, session.actual_start_at,
      session.scheduled_start_at, session.coach_user_id,
      session.pair_low_id, session.pair_high_id,
      slot.slot_id, slot.state as slot_state, slot.version::text as slot_version,
      exists (
        select 1 from scheduling.booking_solo_continuations continuation
        where continuation.booking_id = booking.booking_id and continuation.state = 'PENDING'
      ) as has_live_solo_continuation
    from scheduling.sessions session
    join scheduling.bookings booking on booking.booking_id = session.booking_id
    join scheduling.slots slot on slot.slot_id = booking.slot_id
    where session.session_id = ${sessionId}::uuid
    ${lock ? sql`for update of session, booking, slot` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function soloRow(
  database: Kysely<Database> | Transaction<Database>,
  continuationId: string,
  lock = false,
): Promise<SoloRow | null> {
  const result = await sql<SoloRow>`
    select continuation_id, booking_id, session_id, cancelled_athlete_user_id,
      remaining_athlete_user_id, state, deadline_at, version::text as version
    from scheduling.booking_solo_continuations
    where continuation_id = ${continuationId}::uuid
    ${lock ? sql`for update` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function soloConfirmations(
  database: Kysely<Database> | Transaction<Database>,
  continuationId: string,
): Promise<readonly SoloConfirmationRow[]> {
  const result = await sql<SoloConfirmationRow>`
    select actor_user_id, required_role, decision, decided_at
    from scheduling.booking_solo_confirmations
    where continuation_id = ${continuationId}::uuid
    order by decided_at, required_role
  `.execute(database);
  return result.rows;
}

function viewerRole(
  row: SoloRow,
  context: TrainingContextRow,
  viewerUserId: string,
): SoloContinuationRequiredRole | null {
  if (viewerUserId === row.remaining_athlete_user_id) return 'REMAINING_ATHLETE';
  if (viewerUserId === context.coach_user_id) return 'COACH';
  return null;
}

async function projection(
  database: Kysely<Database> | Transaction<Database>,
  row: SoloRow,
  viewerUserId: string,
): Promise<BookingSoloContinuationProjection> {
  const context = await trainingContext(database, row.session_id);
  if (!context) throw new SchedulingConflictError('SOLO_CONTINUATION_NOT_ALLOWED');
  const confirmations = await soloConfirmations(database, row.continuation_id);
  const requiredRole = viewerRole(row, context, viewerUserId);
  const viewerHasDecided = confirmations.some((item) => item.actor_user_id === viewerUserId);
  const pending = row.state === 'PENDING';
  return {
    continuationId: row.continuation_id,
    bookingId: row.booking_id,
    sessionId: row.session_id,
    cancelledAthleteUserId: row.cancelled_athlete_user_id,
    remainingAthleteUserId: row.remaining_athlete_user_id,
    state: row.state,
    deadlineAt: row.deadline_at.toISOString(),
    confirmations: confirmations.map((item) => ({
      actorUserId: item.actor_user_id,
      requiredRole: item.required_role,
      decision: item.decision,
      decidedAt: item.decided_at.toISOString(),
    })),
    viewerRequiredRole: requiredRole,
    viewerHasDecided,
    viewerCanConfirm: pending && requiredRole !== null && !viewerHasDecided,
    viewerCanDecline: pending && requiredRole !== null && !viewerHasDecided,
    version: Number(row.version),
  };
}

export async function readBookingSoloContinuationForSession(
  database: Kysely<Database> | Transaction<Database>,
  sessionId: string,
  viewerUserId: string,
): Promise<BookingSoloContinuationProjection | null> {
  const result = await sql<{ readonly continuation_id: string }>`
    select continuation_id from scheduling.booking_solo_continuations
    where session_id = ${sessionId}::uuid
    order by created_at desc, continuation_id desc
    limit 1
  `.execute(database);
  const id = result.rows[0]?.continuation_id;
  if (!id) return null;
  const row = await soloRow(database, id);
  return row ? projection(database, row, viewerUserId) : null;
}

async function liveConversion(
  transaction: Transaction<Database>,
  bookingId: string,
): Promise<LiveConversionRow | null> {
  const result = await sql<LiveConversionRow>`
    select conversion.conversion_id, conversion.competition_id, conversion.state,
      conversion.version::text as version, conversion.queue_entry_id,
      entry.version::text as queue_version
    from scheduling.booking_official_conversions conversion
    left join competition.challenge_queue_entries entry
      on entry.queue_entry_id = conversion.queue_entry_id
    where conversion.booking_id = ${bookingId}::uuid
      and conversion.state in ('WAITING_FIFO', 'PENDING_CONFIRMATION')
    order by conversion.created_at desc
    limit 1
    for update of conversion
  `.execute(transaction);
  return result.rows[0] ?? null;
}

export async function requestTrainingParticipantCancellation(
  database: Kysely<Database>,
  command: CommandEnvelope<RequestTrainingParticipantCancellationPayload>,
  ids: BookingSoloContinuationEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<BookingSoloContinuationProjection>> {
  if (!command.actor.id || command.aggregateType !== 'BookingSoloContinuation') {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, eventContext) => {
      const context = await trainingContext(transaction, command.payload.sessionId, true);
      if (!context) throw new SchedulingConflictError('SOLO_CONTINUATION_NOT_ALLOWED');
      const actorIsAthlete = [context.pair_low_id, context.pair_high_id].includes(command.actor.id!);
      const deadline = assertTrainingParticipantCanCancel({
        bookingState: context.booking_state,
        bookingPurpose: context.booking_purpose,
        sessionState: context.session_state,
        actualStartAt: context.actual_start_at?.toISOString() ?? null,
        actorIsAthlete,
        hasLiveSoloContinuation: context.has_live_solo_continuation,
        scheduledStartAt: context.scheduled_start_at.toISOString(),
        occurredAt: eventContext.occurredAt,
      });
      if (context.slot_state !== 'BOOKED') {
        throw new SchedulingConflictError('SOLO_CONTINUATION_NOT_ALLOWED');
      }
      const continuationId = requiredId(ids, 'continuationId');
      const remainingAthleteUserId = command.actor.id === context.pair_low_id
        ? context.pair_high_id
        : context.pair_low_id;
      const conversion = await liveConversion(transaction, context.booking_id);
      await sql`
        insert into scheduling.booking_solo_continuations (
          continuation_id, booking_id, session_id, cancelled_athlete_user_id,
          remaining_athlete_user_id, state, deadline_at, version, created_at, updated_at
        ) values (
          ${continuationId}::uuid, ${context.booking_id}::uuid, ${context.session_id}::uuid,
          ${command.actor.id}::uuid, ${remainingAthleteUserId}::uuid, 'PENDING',
          ${deadline.toISOString()}::timestamptz, 1,
          ${eventContext.occurredAt.toISOString()}::timestamptz,
          ${eventContext.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      if (conversion) {
        await sql`
          update scheduling.booking_official_conversions
          set state = 'INVALIDATED', terminal_reason = 'TRAINING_PARTICIPANT_CANCELLED',
            decided_at = ${eventContext.occurredAt.toISOString()}::timestamptz,
            version = version + 1, updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
          where conversion_id = ${conversion.conversion_id}::uuid
            and state in ('WAITING_FIFO', 'PENDING_CONFIRMATION')
        `.execute(transaction);
        if (conversion.state === 'WAITING_FIFO' && conversion.queue_entry_id) {
          await sql`
            update competition.challenge_queue_entries
            set state = 'INVALIDATED', terminal_reason = 'TRAINING_PARTICIPANT_CANCELLED',
              decided_at = ${eventContext.occurredAt.toISOString()}::timestamptz,
              version = version + 1, updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
            where queue_entry_id = ${conversion.queue_entry_id}::uuid and state = 'WAITING'
          `.execute(transaction);
        }
      }
      await sql`
        update scheduling.bookings
        set state = 'SOLO_DECISION_PENDING', version = version + 1,
          updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where booking_id = ${context.booking_id}::uuid
          and state in ('CONFIRMED_PAIR', 'OFFICIAL_CONVERSION_PENDING')
      `.execute(transaction);
      const row = await soloRow(transaction, continuationId);
      if (!row) throw new SchedulingConflictError('SOLO_CONTINUATION_NOT_ALLOWED');
      const response = await projection(transaction, row, command.actor.id!);
      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId, eventName: 'TrainingParticipantCancelled',
          schemaVersion: 1, transitionId: conversion ? 'B-24' : 'B-10',
          payload: { continuationId, bookingId: context.booking_id,
            sessionId: context.session_id, cancelledAthleteUserId: command.actor.id,
            remainingAthleteUserId, deadlineAt: deadline.toISOString(), noForfeit: true },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        relatedEvents: [
          { eventId: requiredId(ids, 'bookingEventId'), eventName: 'TrainingParticipantCancelled',
            schemaVersion: 1, aggregateType: 'Booking', aggregateId: context.booking_id,
            aggregateVersion: Number(context.booking_version) + 1,
            transitionId: conversion ? 'B-24' : 'B-10', payload: {
              bookingId: context.booking_id, continuationId,
              cancelledAthleteUserId: command.actor.id, noForfeit: true,
            }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
          ...(conversion ? [{
            eventId: requiredId(ids, 'conversionEventId'),
            eventName: 'TrainingOfficialConversionClosed', schemaVersion: 1,
            aggregateType: 'BookingOfficialConversion', aggregateId: conversion.conversion_id,
            aggregateVersion: Number(conversion.version) + 1, transitionId: 'B-24',
            payload: { conversionId: conversion.conversion_id, bookingId: context.booking_id,
              reason: 'TRAINING_PARTICIPANT_CANCELLED', sourcePreservedAsTraining: true },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          }] : []),
          ...(conversion?.state === 'WAITING_FIFO' && conversion.queue_entry_id ? [{
            eventId: requiredId(ids, 'conversionQueueEventId'), eventName: 'QueueEntryInvalidated',
            schemaVersion: 1, aggregateType: 'ChallengeQueueEntry',
            aggregateId: conversion.queue_entry_id,
            aggregateVersion: Number(conversion.queue_version) + 1, transitionId: 'Q-08',
            payload: { queueEntryId: conversion.queue_entry_id,
              competitionId: conversion.competition_id,
              reasonCode: 'TRAINING_PARTICIPANT_CANCELLED', noLoss: true },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          }] : []),
        ],
        audit: {
          auditId: ids.auditId, action: 'CANCEL_TRAINING_PARTICIPATION',
          transitionId: conversion ? 'B-24' : 'B-10', reasonCode: 'ATHLETE_CANCELLED',
          beforeState: context.booking_state, afterState: 'SOLO_DECISION_PENDING',
          metadata: { sessionId: context.session_id, conversionClosed: conversion !== null,
            noForfeit: true },
        },
        outbox: [
          { messageId: ids.outboxMessageId, topic: 'scheduling.booking.solo-continuation-requested.v1',
            payload: { continuationId, bookingId: context.booking_id,
              sessionId: context.session_id, deadlineAt: deadline.toISOString(),
              remainingAthleteUserId } },
          { messageId: requiredId(ids, 'timerOutboxMessageId'),
            topic: 'scheduling.booking.solo-continuation-timer.v1', payload: {
              continuationId,
              timer: { commandType: 'EXPIRE_BOOKING_SOLO_CONTINUATION',
                aggregateType: 'BookingSoloContinuation', aggregateId: continuationId,
                expectedState: 'PENDING', expectedVersion: 1,
                deadlineAt: deadline.toISOString(), policyVersion: SCHEDULING_POLICY_VERSION,
                idempotencyKey: `booking-solo:${continuationId}:expire:v1` },
            } },
          ...(conversion ? [{ messageId: requiredId(ids, 'conversionOutboxMessageId'),
            topic: 'scheduling.booking.official-conversion-closed.v1',
            sourceEventId: requiredId(ids, 'conversionEventId'), payload: {
              conversionId: conversion.conversion_id, bookingId: context.booking_id,
              competitionId: conversion.competition_id,
              reason: 'TRAINING_PARTICIPANT_CANCELLED', sourcePreservedAsTraining: true,
            } }] : []),
          { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1',
            payload: { notifications: [remainingAthleteUserId, context.coach_user_id]
              .map((recipientUserId, index) => ({ notificationId: ids.notificationIds[index]!,
                recipientUserId, category: 'MANDATORY',
                renderKey: 'booking.solo-continuation-required',
                actionTarget: { type: 'SESSION', sessionId: context.session_id },
                payload: { continuationId, bookingId: context.booking_id },
                deadlineAt: deadline.toISOString() })) } },
        ],
      };
    },
  });
}

async function cancellationContext(
  transaction: Transaction<Database>,
  row: SoloRow,
): Promise<TrainingContextRow> {
  const context = await trainingContext(transaction, row.session_id, true);
  if (!context || context.booking_state !== 'SOLO_DECISION_PENDING'
    || context.booking_purpose !== 'TRAINING' || context.session_state !== 'SCHEDULED'
    || context.actual_start_at !== null || context.slot_state !== 'BOOKED') {
    throw new SchedulingConflictError('SOLO_CONTINUATION_NOT_PENDING');
  }
  return context;
}

async function closeSoloResources(
  transaction: Transaction<Database>,
  row: SoloRow,
  context: TrainingContextRow,
  occurredAt: Date,
  actorUserId: string | null,
  terminalState: 'DECLINED' | 'EXPIRED',
): Promise<void> {
  const reason = terminalState === 'DECLINED' ? 'SOLO_CONTINUATION_DECLINED' : 'SOLO_CONTINUATION_EXPIRED';
  await sql`
    update scheduling.booking_solo_continuations
    set state = ${terminalState}, terminal_reason = ${reason},
      decided_at = ${occurredAt.toISOString()}::timestamptz,
      version = version + 1, updated_at = ${occurredAt.toISOString()}::timestamptz
    where continuation_id = ${row.continuation_id}::uuid and state = 'PENDING'
  `.execute(transaction);
  await sql`
    update scheduling.bookings
    set state = 'CANCELLED', cancelled_at = ${occurredAt.toISOString()}::timestamptz,
      cancel_actor = ${actorUserId}::uuid, cancel_reason = ${reason}, version = version + 1,
      updated_at = ${occurredAt.toISOString()}::timestamptz
    where booking_id = ${row.booking_id}::uuid and state = 'SOLO_DECISION_PENDING'
  `.execute(transaction);
  await sql`
    update scheduling.sessions
    set state = 'CANCELLED', cancelled_at = ${occurredAt.toISOString()}::timestamptz,
      cancelled_by = ${actorUserId}::uuid, cancellation_reason_code = ${reason},
      version = version + 1, updated_at = ${occurredAt.toISOString()}::timestamptz
    where session_id = ${row.session_id}::uuid and state = 'SCHEDULED'
  `.execute(transaction);
  await sql`
    update scheduling.slots
    set state = 'CANCELLED', version = version + 1,
      updated_at = ${occurredAt.toISOString()}::timestamptz
    where slot_id = ${context.slot_id}::uuid and state = 'BOOKED'
  `.execute(transaction);
}

export async function decideBookingSoloContinuation(
  database: Kysely<Database>,
  command: CommandEnvelope<DecideBookingSoloContinuationPayload>,
  ids: BookingSoloContinuationEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<BookingSoloContinuationProjection>> {
  if (!command.actor.id || command.aggregateType !== 'BookingSoloContinuation'
    || command.aggregateId !== command.payload.continuationId) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, eventContext) => {
      const row = await soloRow(transaction, command.aggregateId, true);
      if (!row) throw new SchedulingConflictError('SOLO_CONTINUATION_NOT_PENDING');
      const context = await cancellationContext(transaction, row);
      const role = viewerRole(row, context, command.actor.id!);
      const prior = await soloConfirmations(transaction, row.continuation_id);
      assertSoloContinuationDecisionCanBeRecorded({
        state: row.state, actorRequired: role !== null,
        actorAlreadyDecided: prior.some((item) => item.actor_user_id === command.actor.id),
        deadlineAt: row.deadline_at.toISOString(), occurredAt: eventContext.occurredAt,
      });
      await sql`
        insert into scheduling.booking_solo_confirmations (
          confirmation_id, continuation_id, actor_user_id, required_role,
          decision, decided_at, policy_version
        ) values (
          ${requiredId(ids, 'confirmationId')}::uuid, ${row.continuation_id}::uuid,
          ${command.actor.id}::uuid, ${role}, ${command.payload.decision},
          ${eventContext.occurredAt.toISOString()}::timestamptz, ${SCHEDULING_POLICY_VERSION}
        )
      `.execute(transaction);
      if (command.payload.decision === 'DECLINE') {
        await closeSoloResources(
          transaction, row, context, eventContext.occurredAt, command.actor.id!, 'DECLINED',
        );
        const closed = await soloRow(transaction, row.continuation_id);
        if (!closed) throw new SchedulingConflictError('SOLO_CONTINUATION_NOT_PENDING');
        const response = await projection(transaction, closed, command.actor.id!);
        return soloClosedEffect(row, context, response, ids, eventContext.occurredAt, 'DECLINED');
      }
      const acceptedCount = prior.filter((item) => item.decision === 'ACCEPT').length + 1;
      if (acceptedCount < 2) {
        await sql`
          update scheduling.booking_solo_continuations
          set version = version + 1, updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
          where continuation_id = ${row.continuation_id}::uuid and state = 'PENDING'
        `.execute(transaction);
        const pending = await soloRow(transaction, row.continuation_id);
        if (!pending) throw new SchedulingConflictError('SOLO_CONTINUATION_NOT_PENDING');
        const response = await projection(transaction, pending, command.actor.id!);
        return {
          responseStatus: 200, response,
          event: { eventId: ids.eventId, eventName: 'SoloContinuationConfirmed',
            schemaVersion: 1, transitionId: 'B-11', payload: {
              continuationId: row.continuation_id, actorUserId: command.actor.id,
              requiredRole: role, acceptedCount,
            }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
          audit: { auditId: ids.auditId, action: 'CONFIRM_SOLO_CONTINUATION_PARTY',
            transitionId: 'B-11', reasonCode: null, beforeState: 'PENDING',
            afterState: 'PENDING', metadata: { acceptedCount } },
          outbox: [
            { messageId: ids.outboxMessageId,
              topic: 'scheduling.booking.solo-continuation-party-confirmed.v1', payload: {
                continuationId: row.continuation_id, bookingId: row.booking_id,
                actorUserId: command.actor.id, acceptedCount,
              } },
            { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1',
              payload: { notifications: [row.remaining_athlete_user_id, context.coach_user_id]
                .filter((userId) => userId !== command.actor.id)
                .map((recipientUserId, index) => ({ notificationId: ids.notificationIds[index]!,
                  recipientUserId, category: 'SERVICE',
                  renderKey: 'booking.solo-continuation-party-confirmed',
                  actionTarget: { type: 'SESSION', sessionId: row.session_id },
                  payload: { continuationId: row.continuation_id, acceptedCount },
                  deadlineAt: row.deadline_at.toISOString() })) } },
          ],
        };
      }
      await sql`
        update scheduling.booking_solo_continuations
        set state = 'CONFIRMED', decided_at = ${eventContext.occurredAt.toISOString()}::timestamptz,
          terminal_reason = 'BOTH_REQUIRED_PARTIES_ACCEPTED', version = version + 1,
          updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where continuation_id = ${row.continuation_id}::uuid and state = 'PENDING'
      `.execute(transaction);
      await sql`
        update scheduling.bookings set state = 'CONFIRMED_SOLO', version = version + 1,
          updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where booking_id = ${row.booking_id}::uuid and state = 'SOLO_DECISION_PENDING'
      `.execute(transaction);
      await sql`
        update scheduling.sessions
        set solo_athlete_user_id = ${row.remaining_athlete_user_id}::uuid,
          version = version + 1, updated_at = ${eventContext.occurredAt.toISOString()}::timestamptz
        where session_id = ${row.session_id}::uuid and state = 'SCHEDULED'
      `.execute(transaction);
      const confirmed = await soloRow(transaction, row.continuation_id);
      if (!confirmed) throw new SchedulingConflictError('SOLO_CONTINUATION_NOT_PENDING');
      const response = await projection(transaction, confirmed, command.actor.id!);
      return {
        responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'BookingConvertedToSolo',
          schemaVersion: 1, transitionId: 'B-12', payload: {
            continuationId: row.continuation_id, bookingId: row.booking_id,
            sessionId: row.session_id, athleteUserId: row.remaining_athlete_user_id,
          }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
        relatedEvents: [
          { eventId: requiredId(ids, 'bookingEventId'), eventName: 'BookingConvertedToSolo',
            schemaVersion: 1, aggregateType: 'Booking', aggregateId: row.booking_id,
            aggregateVersion: Number(context.booking_version) + 1, transitionId: 'B-12',
            payload: { bookingId: row.booking_id, continuationId: row.continuation_id,
              athleteUserId: row.remaining_athlete_user_id },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
          { eventId: requiredId(ids, 'sessionEventId'), eventName: 'SessionConvertedToSolo',
            schemaVersion: 1, aggregateType: 'Session', aggregateId: row.session_id,
            aggregateVersion: Number(context.session_version) + 1, transitionId: 'S-12',
            payload: { sessionId: row.session_id, bookingId: row.booking_id,
              athleteUserId: row.remaining_athlete_user_id },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
        ],
        audit: { auditId: ids.auditId, action: 'CONVERT_BOOKING_TO_SOLO',
          transitionId: 'B-12', reasonCode: null, beforeState: 'SOLO_DECISION_PENDING',
          afterState: 'CONFIRMED_SOLO', metadata: {
            sessionId: row.session_id, athleteUserId: row.remaining_athlete_user_id,
          } },
        outbox: [
          { messageId: ids.outboxMessageId, topic: 'scheduling.booking.converted-to-solo.v1',
            payload: { continuationId: row.continuation_id, bookingId: row.booking_id,
              sessionId: row.session_id, athleteUserId: row.remaining_athlete_user_id } },
          { messageId: requiredId(ids, 'sessionTimerOutboxMessageId'),
            topic: 'scheduling.session.scheduled.v1',
            sourceEventId: requiredId(ids, 'sessionEventId'),
            payload: { sessionId: row.session_id, timer: {
              commandType: 'OPEN_SESSION_WINDOW', aggregateType: 'Session',
              aggregateId: row.session_id, expectedState: 'SCHEDULED',
              expectedVersion: Number(context.session_version) + 1,
              deadlineAt: context.scheduled_start_at.toISOString(),
              policyVersion: SCHEDULING_POLICY_VERSION,
              idempotencyKey: `session:${row.session_id}:open-session-window:v${Number(context.session_version) + 1}`,
            } } },
          { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1',
            payload: { notifications: [row.remaining_athlete_user_id, context.coach_user_id]
              .map((recipientUserId, index) => ({ notificationId: ids.notificationIds[index]!,
                recipientUserId, category: 'MANDATORY', renderKey: 'booking.solo-confirmed',
                actionTarget: { type: 'SESSION', sessionId: row.session_id },
                payload: { continuationId: row.continuation_id,
                  athleteUserId: row.remaining_athlete_user_id },
                deadlineAt: context.scheduled_start_at.toISOString() })) } },
        ],
      };
    },
  });
}

function soloClosedEffect(
  row: SoloRow,
  context: TrainingContextRow,
  response: BookingSoloContinuationProjection,
  ids: BookingSoloContinuationEffectIds,
  occurredAt: Date,
  terminalState: 'DECLINED' | 'EXPIRED',
) {
  const reason = terminalState === 'DECLINED' ? 'SOLO_CONTINUATION_DECLINED' : 'SOLO_CONTINUATION_EXPIRED';
  return {
    responseStatus: 200,
    response,
    event: { eventId: ids.eventId, eventName: 'SoloContinuationClosed',
      schemaVersion: 1, transitionId: 'B-13', payload: {
        continuationId: row.continuation_id, bookingId: row.booking_id,
        reason, sourceCancelledNoFault: true,
      }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
    relatedEvents: [
      { eventId: requiredId(ids, 'bookingEventId'), eventName: 'BookingCancelledNoFault',
        schemaVersion: 1, aggregateType: 'Booking', aggregateId: row.booking_id,
        aggregateVersion: Number(context.booking_version) + 1, transitionId: 'B-13',
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
    audit: { auditId: ids.auditId, action: 'CLOSE_SOLO_CONTINUATION',
      transitionId: 'B-13', reasonCode: reason, beforeState: 'PENDING',
      afterState: terminalState, metadata: { bookingId: row.booking_id,
        sessionId: row.session_id, noForfeit: true } },
    outbox: [
      { messageId: ids.outboxMessageId, topic: 'scheduling.booking.solo-continuation-closed.v1',
        payload: { continuationId: row.continuation_id, bookingId: row.booking_id,
          sessionId: row.session_id, reason, noForfeit: true } },
      { messageId: ids.notificationOutboxMessageId, topic: 'notification.in_app.v1',
        payload: { notifications: [row.cancelled_athlete_user_id,
          row.remaining_athlete_user_id].map((recipientUserId, index) => ({
            notificationId: ids.notificationIds[index]!, recipientUserId,
            category: 'SERVICE', renderKey: 'booking.solo-continuation-closed',
            actionTarget: { type: 'SESSION', sessionId: row.session_id },
            payload: { continuationId: row.continuation_id, reason }, deadlineAt: null,
          })) } },
    ],
  } as const;
}

export async function expireBookingSoloContinuation(
  database: Kysely<Database>,
  command: CommandEnvelope<ExpireBookingSoloContinuationPayload>,
  ids: BookingSoloContinuationEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<BookingSoloContinuationProjection>> {
  if (command.actor.type !== 'SYSTEM' || command.aggregateType !== 'BookingSoloContinuation'
    || command.aggregateId !== command.payload.continuationId) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, eventContext) => {
      const row = await soloRow(transaction, command.aggregateId, true);
      if (!row) throw new SchedulingConflictError('SOLO_CONTINUATION_NOT_PENDING');
      assertSoloContinuationCanExpire({ state: row.state,
        deadlineAt: row.deadline_at.toISOString(), occurredAt: eventContext.occurredAt });
      const context = await cancellationContext(transaction, row);
      await closeSoloResources(transaction, row, context, eventContext.occurredAt, null, 'EXPIRED');
      const expired = await soloRow(transaction, row.continuation_id);
      if (!expired) throw new SchedulingConflictError('SOLO_CONTINUATION_NOT_PENDING');
      const response = await projection(transaction, expired, row.remaining_athlete_user_id);
      return soloClosedEffect(row, context, response, ids, eventContext.occurredAt, 'EXPIRED');
    },
  });
}

export async function readBookingSoloContinuationTimerSnapshot(
  database: Kysely<Database>,
  continuationId: string,
): Promise<TimerAggregateSnapshot> {
  const row = await soloRow(database, continuationId);
  return row
    ? { state: row.state, version: Number(row.version) }
    : { state: 'MISSING', version: 0 };
}
