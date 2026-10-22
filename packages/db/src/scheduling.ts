import {
  SCHEDULING_POLICY_VERSION,
  SchedulingConflictError,
  SchedulingPermissionDeniedError,
  SchedulingValidationError,
  assertFutureScheduleCanBeMutated,
  assertPublicationWindow,
  normalizeCommercialPrice,
  normalizeOptionalScheduleText,
  normalizeScheduleLabel,
  normalizeScheduleMutationReason,
  type CommandEnvelope,
  type ScheduleMutationReasonCode,
  type TimerAggregateSnapshot,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import {
  readActivePairIntents,
  type ActivePairIntentProjection,
  readHostConfirmationQueue,
  type HostConfirmationQueueItem,
} from './pair-intent.js';
import { executeCriticalCommand, type ExecutedCommand } from './platform-command.js';

export interface PublishSlotPayload {
  readonly venueId: string;
  readonly coachUserId: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly priceAmount: string | null;
  readonly priceCurrency: string | null;
  readonly priceText: string | null;
  readonly cancellationTermsText: string | null;
}

export interface PublishGroupOfferingPayload {
  readonly venueId: string;
  readonly sportCode: string;
  readonly classLabel: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly coachUserId?: string | null;
  readonly coachDisplayName: string | null;
  readonly priceText: string | null;
  readonly externalInfoUrl: string | null;
}

export interface UpdateSlotPayload {
  readonly slotId: string;
  readonly coachUserId: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly priceAmount: string | null;
  readonly priceCurrency: string | null;
  readonly priceText: string | null;
  readonly cancellationTermsText: string | null;
}

export interface UpdateGroupOfferingPayload {
  readonly groupOfferingId: string;
  readonly sportCode: string;
  readonly classLabel: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly coachUserId?: string | null;
  readonly coachDisplayName: string | null;
  readonly priceText: string | null;
  readonly externalInfoUrl: string | null;
}

export interface WithdrawSlotPayload {
  readonly slotId: string;
  readonly reasonCode: ScheduleMutationReasonCode;
  readonly reasonNote: string | null;
}

export interface WithdrawGroupOfferingPayload {
  readonly groupOfferingId: string;
  readonly reasonCode: ScheduleMutationReasonCode;
  readonly reasonNote: string | null;
}

export interface ExpireSlotPayload {
  readonly slotId: string;
}

export interface ExpireGroupOfferingPayload {
  readonly groupOfferingId: string;
}

export interface SchedulingEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
}

export interface SlotProjection {
  readonly slotId: string;
  readonly venueId: string;
  readonly venueDisplayName: string;
  readonly coachUserId: string;
  readonly coachDisplayName: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly state: 'PUBLISHED' | 'WITHDRAWN' | 'EXPIRED';
  readonly priceAmount: string | null;
  readonly priceCurrency: string | null;
  readonly priceText: string | null;
  readonly cancellationTermsText: string | null;
  readonly commercialVersion: number;
  readonly version: number;
}

export interface GroupOfferingProjection {
  readonly groupOfferingId: string;
  readonly venueId: string;
  readonly venueDisplayName: string;
  readonly sportCode: string;
  readonly classLabel: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly coachUserId: string | null;
  readonly coachDisplayName: string | null;
  readonly priceText: string | null;
  readonly externalInfoUrl: string | null;
  readonly contact: unknown;
  readonly capacityDisclaimerKey: 'group.capacity.confirm-with-venue';
  readonly lastUpdatedAt: string;
  readonly state: 'PUBLISHED' | 'WITHDRAWN' | 'EXPIRED';
  readonly version: number;
}

export interface TrainingOptionsProjection {
  readonly slots: readonly SlotProjection[];
  readonly groupOfferings: readonly GroupOfferingProjection[];
  readonly activeIntent: ActivePairIntentProjection;
  readonly reservationPolicy: 'NO_RESERVATION_BEFORE_HOST_CONFIRMATION';
}

export interface VenueAdminCoachProjection {
  readonly userId: string;
  readonly displayName: string;
}

export interface VenueGroupInterestProjection {
  readonly groupPlanId: string;
  readonly groupOfferingId: string;
  readonly athleteDisplayNames: readonly [string, string];
  readonly classLabel: string;
  readonly startAt: string;
  readonly notifiedAt: string;
  readonly state: 'NOTIFIED';
  readonly version: number;
}

export interface VenueAdminDashboardProjection {
  readonly venue: {
    readonly venueId: string;
    readonly displayName: string;
    readonly timezone: string;
    readonly slotPublishHorizonDays: number;
  };
  readonly coaches: readonly VenueAdminCoachProjection[];
  readonly slots: readonly SlotProjection[];
  readonly groupOfferings: readonly GroupOfferingProjection[];
  readonly hostConfirmations: readonly HostConfirmationQueueItem[];
  readonly groupInterests: readonly VenueGroupInterestProjection[];
}

interface VenuePublicationRow {
  readonly venue_id: string;
  readonly display_name: string;
  readonly state: string;
  readonly slot_publish_horizon_days: number;
  readonly contact_payload: unknown;
}

interface SlotRow {
  readonly slot_id: string;
  readonly venue_id: string;
  readonly venue_display_name: string;
  readonly coach_user_id: string;
  readonly coach_display_name: string;
  readonly start_at: Date;
  readonly end_at: Date;
  readonly state: SlotProjection['state'];
  readonly price_amount: string | null;
  readonly price_currency: string | null;
  readonly price_text: string | null;
  readonly cancellation_terms_text: string | null;
  readonly commercial_version: number;
  readonly version: string;
}

interface GroupOfferingRow {
  readonly group_offering_id: string;
  readonly venue_id: string;
  readonly venue_display_name: string;
  readonly sport_code: string;
  readonly class_label: string;
  readonly start_at: Date;
  readonly end_at: Date;
  readonly coach_user_id: string | null;
  readonly coach_display_name: string | null;
  readonly price_text: string | null;
  readonly external_info_url: string | null;
  readonly contact_snapshot: unknown;
  readonly updated_at: Date;
  readonly state: GroupOfferingProjection['state'];
  readonly version: string;
}

interface VenueAdminRow {
  readonly venue_id: string;
  readonly display_name: string;
  readonly timezone: string;
  readonly slot_publish_horizon_days: number;
}

interface VenueAdminCoachRow {
  readonly user_id: string;
  readonly display_name: string;
}

interface SlotMutationRow extends SlotRow {
  readonly slot_publish_horizon_days: number;
  readonly active_intent_count: string;
}

interface GroupOfferingMutationRow extends GroupOfferingRow {
  readonly slot_publish_horizon_days: number;
  readonly active_intent_count: string;
}

interface VenueGroupInterestRow {
  readonly group_plan_id: string;
  readonly group_offering_id: string;
  readonly athlete_low_name: string;
  readonly athlete_high_name: string;
  readonly class_label: string;
  readonly start_at: Date;
  readonly notified_at: Date;
  readonly state: 'NOTIFIED';
  readonly version: string;
}

function slotProjection(row: SlotRow): SlotProjection {
  return {
    slotId: row.slot_id,
    venueId: row.venue_id,
    venueDisplayName: row.venue_display_name,
    coachUserId: row.coach_user_id,
    coachDisplayName: row.coach_display_name,
    startAt: row.start_at.toISOString(),
    endAt: row.end_at.toISOString(),
    state: row.state,
    priceAmount: row.price_amount,
    priceCurrency: row.price_currency,
    priceText: row.price_text,
    cancellationTermsText: row.cancellation_terms_text,
    commercialVersion: row.commercial_version,
    version: Number(row.version),
  };
}

function groupOfferingProjection(row: GroupOfferingRow): GroupOfferingProjection {
  return {
    groupOfferingId: row.group_offering_id,
    venueId: row.venue_id,
    venueDisplayName: row.venue_display_name,
    sportCode: row.sport_code,
    classLabel: row.class_label,
    startAt: row.start_at.toISOString(),
    endAt: row.end_at.toISOString(),
    coachUserId: row.coach_user_id,
    coachDisplayName: row.coach_display_name,
    priceText: row.price_text,
    externalInfoUrl: row.external_info_url,
    contact: row.contact_snapshot,
    capacityDisclaimerKey: 'group.capacity.confirm-with-venue',
    lastUpdatedAt: row.updated_at.toISOString(),
    state: row.state,
    version: Number(row.version),
  };
}

async function venueForPublication(
  transaction: Transaction<Database>,
  venueId: string,
): Promise<VenuePublicationRow> {
  const result = await sql<VenuePublicationRow>`
    select venue_id, display_name, state, slot_publish_horizon_days, contact_payload
    from community.venues as venue
    where venue.venue_id = ${venueId}::uuid
    for share
  `.execute(transaction);
  const venue = result.rows[0];
  if (!venue || venue.state !== 'ACTIVE') {
    throw new SchedulingValidationError('venueId');
  }
  const communities = await sql<{ readonly state: string }>`
    select state
    from community.communities
    where venue_id = ${venueId}::uuid
    for share
  `.execute(transaction);
  if (communities.rows.length > 0 && !communities.rows.some((row) => row.state === 'ACTIVE')) {
    throw new SchedulingValidationError('venueId');
  }
  return venue;
}

async function activeCoach(
  transaction: Transaction<Database>,
  coachUserId: string,
): Promise<boolean> {
  const result = await sql<{ readonly allowed: boolean }>`
    select true as allowed
    from community.role_grants
    where user_id = ${coachUserId}::uuid
      and role = 'COACH'
      and scope_type = 'COMMUNITY'
      and state = 'ACTIVE'
      and (expires_at is null or expires_at > clock_timestamp())
    limit 1
    for share
  `.execute(transaction);
  return result.rows[0]?.allowed === true;
}

async function activeVenueAdmin(
  transaction: Transaction<Database>,
  actorId: string,
  venueId: string,
): Promise<boolean> {
  const result = await sql<{ readonly allowed: boolean }>`
    select true as allowed
    from community.role_grants
    where user_id = ${actorId}::uuid
      and role in ('PRIMARY_ADMIN', 'GYM_ADMIN')
      and scope_type = 'VENUE'
      and scope_id = ${venueId}::uuid
      and state = 'ACTIVE'
      and (expires_at is null or expires_at > clock_timestamp())
    limit 1
    for share
  `.execute(transaction);
  return result.rows[0]?.allowed === true;
}

async function assertSlotPublisher(
  transaction: Transaction<Database>,
  actorId: string,
  venueId: string,
  coachUserId: string,
): Promise<void> {
  if (!(await activeCoach(transaction, coachUserId))) {
    throw new SchedulingPermissionDeniedError();
  }
  if (actorId === coachUserId) return;
  if (!(await activeVenueAdmin(transaction, actorId, venueId))) {
    throw new SchedulingPermissionDeniedError();
  }
}

function schedulingTimer(input: {
  readonly commandType: 'EXPIRE_SLOT' | 'EXPIRE_GROUP_OFFERING';
  readonly aggregateType: 'Slot' | 'GroupOffering';
  readonly aggregateId: string;
  readonly deadlineAt: string;
  readonly expectedVersion: number;
}) {
  return {
    commandType: input.commandType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    expectedState: 'PUBLISHED',
    expectedVersion: input.expectedVersion,
    deadlineAt: input.deadlineAt,
    policyVersion: SCHEDULING_POLICY_VERSION,
    idempotencyKey: `${input.aggregateType.toLowerCase()}:${input.aggregateId}:expire:v1`,
  } as const;
}

function isExclusionViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === '23P01'
  );
}

export async function publishSlot(
  database: Kysely<Database>,
  command: CommandEnvelope<PublishSlotPayload>,
  ids: SchedulingEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<SlotProjection>> {
  if (!command.actor.id || command.aggregateType !== 'Slot') {
    throw new SchedulingPermissionDeniedError();
  }
  const price = normalizeCommercialPrice({
    amount: command.payload.priceAmount,
    currency: command.payload.priceCurrency,
  });
  const payload: PublishSlotPayload = {
    ...command.payload,
    priceAmount: price.amount,
    priceCurrency: price.currency,
    priceText: normalizeOptionalScheduleText(command.payload.priceText, 'priceText', 240),
    cancellationTermsText: normalizeOptionalScheduleText(
      command.payload.cancellationTermsText,
      'cancellationTermsText',
      500,
    ),
  };
  try {
    return await executeCriticalCommand(database, {
      command: { ...command, payload },
      ...(now ? { now } : {}),
      mutate: async (transaction, context) => {
        const venue = await venueForPublication(transaction, payload.venueId);
        await assertSlotPublisher(
          transaction,
          command.actor.id!,
          payload.venueId,
          payload.coachUserId,
        );
        assertPublicationWindow({
          startAt: payload.startAt,
          endAt: payload.endAt,
          occurredAt: context.occurredAt,
          horizonDays: venue.slot_publish_horizon_days,
        });
        const coachResult = await sql<{ readonly display_name: string }>`
          select display_name from identity.users where user_id = ${payload.coachUserId}::uuid
        `.execute(transaction);
        const coachDisplayName = coachResult.rows[0]?.display_name;
        if (!coachDisplayName) throw new SchedulingValidationError('coachUserId');
        await sql`
          insert into scheduling.slots (
            slot_id, venue_id, coach_user_id, start_at, end_at, slot_type, state,
            price_amount, price_currency, price_text, cancellation_terms_text,
            commercial_version, published_by, version, created_at, updated_at
          ) values (
            ${command.aggregateId}::uuid, ${payload.venueId}::uuid,
            ${payload.coachUserId}::uuid, ${payload.startAt}::timestamptz,
            ${payload.endAt}::timestamptz, 'PERSONAL', 'PUBLISHED',
            ${payload.priceAmount}::numeric, ${payload.priceCurrency}, ${payload.priceText},
            ${payload.cancellationTermsText}, 1, ${command.actor.id}::uuid, 1,
            ${context.occurredAt.toISOString()}::timestamptz,
            ${context.occurredAt.toISOString()}::timestamptz
          )
        `.execute(transaction);
        const response: SlotProjection = {
          slotId: command.aggregateId,
          venueId: payload.venueId,
          venueDisplayName: venue.display_name,
          coachUserId: payload.coachUserId,
          coachDisplayName,
          startAt: new Date(payload.startAt).toISOString(),
          endAt: new Date(payload.endAt).toISOString(),
          state: 'PUBLISHED',
          priceAmount: payload.priceAmount,
          priceCurrency: payload.priceCurrency,
          priceText: payload.priceText,
          cancellationTermsText: payload.cancellationTermsText,
          commercialVersion: 1,
          version: 1,
        };
        return {
          responseStatus: 201,
          response,
          event: {
            eventId: ids.eventId,
            eventName: 'SlotPublished',
            schemaVersion: 1,
            transitionId: 'SL-01',
            payload: { slotId: response.slotId, venueId: response.venueId, coachUserId: response.coachUserId, startAt: response.startAt, endAt: response.endAt, commercialVersion: 1 },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          },
          audit: {
            auditId: ids.auditId,
            action: 'PUBLISH_SLOT',
            transitionId: 'SL-01',
            reasonCode: null,
            beforeState: null,
            afterState: 'PUBLISHED',
            metadata: { venueId: response.venueId, coachUserId: response.coachUserId },
          },
          outbox: [
            {
              messageId: ids.outboxMessageId,
              topic: 'scheduling.slot.published.v1',
              payload: {
                slotId: response.slotId,
                timer: schedulingTimer({ commandType: 'EXPIRE_SLOT', aggregateType: 'Slot', aggregateId: response.slotId, deadlineAt: response.startAt, expectedVersion: 1 }),
              },
            },
          ],
        };
      },
    });
  } catch (error) {
    if (isExclusionViolation(error)) throw new SchedulingConflictError('COACH_CONFLICT');
    throw error;
  }
}

export async function publishGroupOffering(
  database: Kysely<Database>,
  command: CommandEnvelope<PublishGroupOfferingPayload>,
  ids: SchedulingEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<GroupOfferingProjection>> {
  if (!command.actor.id || command.aggregateType !== 'GroupOffering') {
    throw new SchedulingPermissionDeniedError();
  }
  const payload: PublishGroupOfferingPayload = {
    ...command.payload,
    coachUserId: command.payload.coachUserId ?? null,
    sportCode: normalizeScheduleLabel(command.payload.sportCode.toUpperCase(), 'sportCode', 40),
    classLabel: normalizeScheduleLabel(command.payload.classLabel, 'classLabel'),
    coachDisplayName: normalizeOptionalScheduleText(command.payload.coachDisplayName, 'coachDisplayName', 120),
    priceText: normalizeOptionalScheduleText(command.payload.priceText, 'priceText', 240),
    externalInfoUrl: normalizeOptionalScheduleText(command.payload.externalInfoUrl, 'externalInfoUrl', 500),
  };
  if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(payload.sportCode)) {
    throw new SchedulingValidationError('sportCode');
  }
  return executeCriticalCommand(database, {
    command: { ...command, payload },
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const venue = await venueForPublication(transaction, payload.venueId);
      if (!(await activeVenueAdmin(transaction, command.actor.id!, payload.venueId))) {
        throw new SchedulingPermissionDeniedError();
      }
      assertPublicationWindow({
        startAt: payload.startAt,
        endAt: payload.endAt,
        occurredAt: context.occurredAt,
        horizonDays: venue.slot_publish_horizon_days,
      });
      if (
        typeof venue.contact_payload !== 'object' ||
        venue.contact_payload === null ||
        Object.keys(venue.contact_payload).length === 0
      ) {
        throw new SchedulingValidationError('venueContact');
      }
      let coachDisplayName = payload.coachDisplayName;
      if (payload.coachUserId) {
        const coachResult = await sql<{ readonly display_name: string }>`
          select coach.display_name
          from identity.users as coach
          join community.role_grants as role_grant
            on role_grant.user_id = coach.user_id
            and role_grant.role = 'COACH'
            and role_grant.scope_type = 'COMMUNITY'
            and role_grant.state = 'ACTIVE'
            and (role_grant.expires_at is null or role_grant.expires_at > clock_timestamp())
          join community.communities as community
            on community.community_id = role_grant.scope_id
            and community.venue_id = ${payload.venueId}::uuid
            and community.state = 'ACTIVE'
          where coach.user_id = ${payload.coachUserId}::uuid
            and coach.account_state = 'ACTIVE'
          limit 1
          for share of coach, role_grant, community
        `.execute(transaction);
        coachDisplayName = coachResult.rows[0]?.display_name ?? null;
        if (!coachDisplayName) throw new SchedulingPermissionDeniedError();
      }
      await sql`
        insert into scheduling.group_offerings (
          group_offering_id, venue_id, sport_code, class_label, start_at, end_at,
          coach_user_id, coach_display_name, price_text, external_info_url, contact_snapshot,
          state, published_by, version, created_at, updated_at
        ) values (
          ${command.aggregateId}::uuid, ${payload.venueId}::uuid, ${payload.sportCode},
          ${payload.classLabel}, ${payload.startAt}::timestamptz,
          ${payload.endAt}::timestamptz, ${payload.coachUserId}::uuid,
          ${coachDisplayName}, ${payload.priceText},
          ${payload.externalInfoUrl}, ${JSON.stringify(venue.contact_payload)}::jsonb,
          'PUBLISHED', ${command.actor.id}::uuid, 1,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      const response: GroupOfferingProjection = {
        groupOfferingId: command.aggregateId,
        venueId: payload.venueId,
        venueDisplayName: venue.display_name,
        sportCode: payload.sportCode,
        classLabel: payload.classLabel,
        startAt: new Date(payload.startAt).toISOString(),
        endAt: new Date(payload.endAt).toISOString(),
        coachUserId: payload.coachUserId ?? null,
        coachDisplayName,
        priceText: payload.priceText,
        externalInfoUrl: payload.externalInfoUrl,
        contact: venue.contact_payload,
        capacityDisclaimerKey: 'group.capacity.confirm-with-venue',
        lastUpdatedAt: context.occurredAt.toISOString(),
        state: 'PUBLISHED',
        version: 1,
      };
      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'GroupOfferingPublished',
          schemaVersion: 1,
          transitionId: 'GO-01',
          payload: { groupOfferingId: response.groupOfferingId, venueId: response.venueId, sportCode: response.sportCode, startAt: response.startAt, endAt: response.endAt },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'PUBLISH_GROUP_OFFERING',
          transitionId: 'GO-01',
          reasonCode: null,
          beforeState: null,
          afterState: 'PUBLISHED',
          metadata: { venueId: response.venueId },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'scheduling.group-offering.published.v1',
            payload: {
              groupOfferingId: response.groupOfferingId,
              timer: schedulingTimer({ commandType: 'EXPIRE_GROUP_OFFERING', aggregateType: 'GroupOffering', aggregateId: response.groupOfferingId, deadlineAt: response.startAt, expectedVersion: 1 }),
            },
          },
        ],
      };
    },
  });
}

export async function updateSlot(
  database: Kysely<Database>,
  command: CommandEnvelope<UpdateSlotPayload>,
  ids: SchedulingEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<SlotProjection>> {
  if (
    !command.actor.id
    || command.aggregateType !== 'Slot'
    || command.payload.slotId !== command.aggregateId
  ) {
    throw new SchedulingPermissionDeniedError();
  }
  const price = normalizeCommercialPrice({
    amount: command.payload.priceAmount,
    currency: command.payload.priceCurrency,
  });
  const payload: UpdateSlotPayload = {
    ...command.payload,
    priceAmount: price.amount,
    priceCurrency: price.currency,
    priceText: normalizeOptionalScheduleText(command.payload.priceText, 'priceText', 240),
    cancellationTermsText: normalizeOptionalScheduleText(
      command.payload.cancellationTermsText,
      'cancellationTermsText',
      500,
    ),
  };
  try {
    return await executeCriticalCommand(database, {
      command: { ...command, payload },
      ...(now ? { now } : {}),
      mutate: async (transaction, context) => {
        const result = await sql<SlotMutationRow>`
          select slot.slot_id, slot.venue_id, venue.display_name as venue_display_name,
            slot.coach_user_id, coach.display_name as coach_display_name,
            slot.start_at, slot.end_at, slot.state,
            slot.price_amount::text as price_amount, slot.price_currency,
            slot.price_text, slot.cancellation_terms_text,
            slot.commercial_version, slot.version::text as version,
            venue.slot_publish_horizon_days,
            (
              select count(*)::text from scheduling.bookings as booking
              where booking.slot_id = slot.slot_id
                and booking.state in ('SELECTING', 'HOST_CONFIRMATION_PENDING')
            ) as active_intent_count
          from scheduling.slots as slot
          join community.venues as venue on venue.venue_id = slot.venue_id
          join identity.users as coach on coach.user_id = slot.coach_user_id
          where slot.slot_id = ${command.aggregateId}::uuid
          for update of slot
        `.execute(transaction);
        const slot = result.rows[0];
        if (!slot) throw new SchedulingConflictError('SCHEDULE_MUTATION_NOT_ALLOWED');
        if (!(await activeVenueAdmin(transaction, command.actor.id!, slot.venue_id))) {
          throw new SchedulingPermissionDeniedError();
        }
        assertFutureScheduleCanBeMutated({
          state: slot.state,
          startAt: slot.start_at.toISOString(),
          activeIntentCount: Number(slot.active_intent_count),
          occurredAt: context.occurredAt,
        });
        assertPublicationWindow({
          startAt: payload.startAt,
          endAt: payload.endAt,
          occurredAt: context.occurredAt,
          horizonDays: slot.slot_publish_horizon_days,
        });
        if (!(await activeCoach(transaction, payload.coachUserId))) {
          throw new SchedulingPermissionDeniedError();
        }
        const coachResult = await sql<{ readonly display_name: string }>`
          select display_name from identity.users
          where user_id = ${payload.coachUserId}::uuid and account_state = 'ACTIVE'
        `.execute(transaction);
        const coachDisplayName = coachResult.rows[0]?.display_name;
        if (!coachDisplayName) throw new SchedulingValidationError('coachUserId');
        const nextCommercialVersion = slot.commercial_version + 1;
        await sql`
          update scheduling.slots
          set coach_user_id = ${payload.coachUserId}::uuid,
            start_at = ${payload.startAt}::timestamptz,
            end_at = ${payload.endAt}::timestamptz,
            price_amount = ${payload.priceAmount}::numeric,
            price_currency = ${payload.priceCurrency}, price_text = ${payload.priceText},
            cancellation_terms_text = ${payload.cancellationTermsText},
            commercial_version = ${nextCommercialVersion},
            version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where slot_id = ${command.aggregateId}::uuid and state = 'PUBLISHED'
        `.execute(transaction);
        const response: SlotProjection = {
          slotId: slot.slot_id,
          venueId: slot.venue_id,
          venueDisplayName: slot.venue_display_name,
          coachUserId: payload.coachUserId,
          coachDisplayName,
          startAt: new Date(payload.startAt).toISOString(),
          endAt: new Date(payload.endAt).toISOString(),
          state: 'PUBLISHED',
          priceAmount: payload.priceAmount,
          priceCurrency: payload.priceCurrency,
          priceText: payload.priceText,
          cancellationTermsText: payload.cancellationTermsText,
          commercialVersion: nextCommercialVersion,
          version: context.nextVersion,
        };
        return {
          responseStatus: 200,
          response,
          event: {
            eventId: ids.eventId,
            eventName: 'SlotUpdated',
            schemaVersion: 1,
            transitionId: 'SL-03',
            payload: {
              slotId: response.slotId,
              coachUserId: response.coachUserId,
              startAt: response.startAt,
              endAt: response.endAt,
              commercialVersion: response.commercialVersion,
            },
            metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
          },
          audit: {
            auditId: ids.auditId,
            action: 'UPDATE_SLOT',
            transitionId: 'SL-03',
            reasonCode: null,
            beforeState: 'PUBLISHED',
            afterState: 'PUBLISHED',
            metadata: { previousCoachUserId: slot.coach_user_id },
          },
          outbox: [{
            messageId: ids.outboxMessageId,
            topic: 'scheduling.slot.updated.v1',
            payload: {
              slotId: response.slotId,
              timer: schedulingTimer({
                commandType: 'EXPIRE_SLOT', aggregateType: 'Slot',
                aggregateId: response.slotId, deadlineAt: response.startAt,
                expectedVersion: context.nextVersion,
              }),
            },
          }],
        };
      },
    });
  } catch (error) {
    if (isExclusionViolation(error)) throw new SchedulingConflictError('COACH_CONFLICT');
    throw error;
  }
}

export async function updateGroupOffering(
  database: Kysely<Database>,
  command: CommandEnvelope<UpdateGroupOfferingPayload>,
  ids: SchedulingEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<GroupOfferingProjection>> {
  if (
    !command.actor.id
    || command.aggregateType !== 'GroupOffering'
    || command.payload.groupOfferingId !== command.aggregateId
  ) {
    throw new SchedulingPermissionDeniedError();
  }
  const payload: UpdateGroupOfferingPayload = {
    ...command.payload,
    coachUserId: command.payload.coachUserId ?? null,
    sportCode: normalizeScheduleLabel(command.payload.sportCode.toUpperCase(), 'sportCode', 40),
    classLabel: normalizeScheduleLabel(command.payload.classLabel, 'classLabel'),
    coachDisplayName: normalizeOptionalScheduleText(
      command.payload.coachDisplayName,
      'coachDisplayName',
      120,
    ),
    priceText: normalizeOptionalScheduleText(command.payload.priceText, 'priceText', 240),
    externalInfoUrl: normalizeOptionalScheduleText(
      command.payload.externalInfoUrl,
      'externalInfoUrl',
      500,
    ),
  };
  if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(payload.sportCode)) {
    throw new SchedulingValidationError('sportCode');
  }
  return executeCriticalCommand(database, {
    command: { ...command, payload },
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const result = await sql<GroupOfferingMutationRow>`
        select offering.group_offering_id, offering.venue_id,
          venue.display_name as venue_display_name, offering.sport_code,
          offering.class_label, offering.start_at, offering.end_at,
          offering.coach_user_id, offering.coach_display_name,
          offering.price_text, offering.external_info_url,
          offering.contact_snapshot, offering.updated_at, offering.state,
          offering.version::text as version, venue.slot_publish_horizon_days,
          (
            select count(*)::text from scheduling.group_plans as plan
            where plan.group_offering_id = offering.group_offering_id
              and plan.state in ('PROPOSED', 'NOTIFIED', 'CONVERSION_PENDING')
          ) as active_intent_count
        from scheduling.group_offerings as offering
        join community.venues as venue on venue.venue_id = offering.venue_id
        where offering.group_offering_id = ${command.aggregateId}::uuid
        for update of offering
      `.execute(transaction);
      const offering = result.rows[0];
      if (!offering) throw new SchedulingConflictError('SCHEDULE_MUTATION_NOT_ALLOWED');
      if (!(await activeVenueAdmin(transaction, command.actor.id!, offering.venue_id))) {
        throw new SchedulingPermissionDeniedError();
      }
      assertFutureScheduleCanBeMutated({
        state: offering.state,
        startAt: offering.start_at.toISOString(),
        activeIntentCount: Number(offering.active_intent_count),
        occurredAt: context.occurredAt,
      });
      assertPublicationWindow({
        startAt: payload.startAt,
        endAt: payload.endAt,
        occurredAt: context.occurredAt,
        horizonDays: offering.slot_publish_horizon_days,
      });
      let coachDisplayName = payload.coachDisplayName;
      if (payload.coachUserId) {
        const coachResult = await sql<{ readonly display_name: string }>`
          select coach.display_name
          from identity.users as coach
          join community.role_grants as role_grant
            on role_grant.user_id = coach.user_id
            and role_grant.role = 'COACH'
            and role_grant.scope_type = 'COMMUNITY'
            and role_grant.state = 'ACTIVE'
            and (role_grant.expires_at is null or role_grant.expires_at > clock_timestamp())
          join community.communities as community
            on community.community_id = role_grant.scope_id
            and community.venue_id = ${offering.venue_id}::uuid
            and community.state = 'ACTIVE'
          where coach.user_id = ${payload.coachUserId}::uuid
            and coach.account_state = 'ACTIVE'
          limit 1
          for share of coach, role_grant, community
        `.execute(transaction);
        coachDisplayName = coachResult.rows[0]?.display_name ?? null;
        if (!coachDisplayName) throw new SchedulingPermissionDeniedError();
      }
      await sql`
        update scheduling.group_offerings
        set sport_code = ${payload.sportCode}, class_label = ${payload.classLabel},
          start_at = ${payload.startAt}::timestamptz,
          end_at = ${payload.endAt}::timestamptz,
          coach_user_id = ${payload.coachUserId}::uuid,
          coach_display_name = ${coachDisplayName},
          price_text = ${payload.priceText}, external_info_url = ${payload.externalInfoUrl},
          version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where group_offering_id = ${command.aggregateId}::uuid and state = 'PUBLISHED'
      `.execute(transaction);
      const response: GroupOfferingProjection = {
        groupOfferingId: offering.group_offering_id,
        venueId: offering.venue_id,
        venueDisplayName: offering.venue_display_name,
        sportCode: payload.sportCode,
        classLabel: payload.classLabel,
        startAt: new Date(payload.startAt).toISOString(),
        endAt: new Date(payload.endAt).toISOString(),
        coachUserId: payload.coachUserId ?? null,
        coachDisplayName,
        priceText: payload.priceText,
        externalInfoUrl: payload.externalInfoUrl,
        contact: offering.contact_snapshot,
        capacityDisclaimerKey: 'group.capacity.confirm-with-venue',
        lastUpdatedAt: context.occurredAt.toISOString(),
        state: 'PUBLISHED',
        version: context.nextVersion,
      };
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'GroupOfferingUpdated',
          schemaVersion: 1,
          transitionId: 'GO-02',
          payload: {
            groupOfferingId: response.groupOfferingId,
            sportCode: response.sportCode,
            startAt: response.startAt,
            endAt: response.endAt,
          },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'UPDATE_GROUP_OFFERING',
          transitionId: 'GO-02',
          reasonCode: null,
          beforeState: 'PUBLISHED',
          afterState: 'PUBLISHED',
          metadata: {},
        },
        outbox: [{
          messageId: ids.outboxMessageId,
          topic: 'scheduling.group-offering.updated.v1',
          payload: {
            groupOfferingId: response.groupOfferingId,
            timer: schedulingTimer({
              commandType: 'EXPIRE_GROUP_OFFERING', aggregateType: 'GroupOffering',
              aggregateId: response.groupOfferingId, deadlineAt: response.startAt,
              expectedVersion: context.nextVersion,
            }),
          },
        }],
      };
    },
  });
}

export async function withdrawSlot(
  database: Kysely<Database>,
  command: CommandEnvelope<WithdrawSlotPayload>,
  ids: SchedulingEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<SlotProjection>> {
  if (
    !command.actor.id
    || command.aggregateType !== 'Slot'
    || command.payload.slotId !== command.aggregateId
  ) {
    throw new SchedulingPermissionDeniedError();
  }
  const reason = normalizeScheduleMutationReason(command.payload);
  return executeCriticalCommand(database, {
    command: { ...command, payload: { ...command.payload, ...reason } },
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const result = await sql<SlotMutationRow>`
        select slot.slot_id, slot.venue_id, venue.display_name as venue_display_name,
          slot.coach_user_id, coach.display_name as coach_display_name,
          slot.start_at, slot.end_at, slot.state,
          slot.price_amount::text as price_amount, slot.price_currency,
          slot.price_text, slot.cancellation_terms_text,
          slot.commercial_version, slot.version::text as version,
          venue.slot_publish_horizon_days,
          (
            select count(*)::text from scheduling.bookings as booking
            where booking.slot_id = slot.slot_id
              and booking.state in ('SELECTING', 'HOST_CONFIRMATION_PENDING')
          ) as active_intent_count
        from scheduling.slots as slot
        join community.venues as venue on venue.venue_id = slot.venue_id
        join identity.users as coach on coach.user_id = slot.coach_user_id
        where slot.slot_id = ${command.aggregateId}::uuid
        for update of slot
      `.execute(transaction);
      const slot = result.rows[0];
      if (!slot) throw new SchedulingConflictError('SCHEDULE_MUTATION_NOT_ALLOWED');
      if (!(await activeVenueAdmin(transaction, command.actor.id!, slot.venue_id))) {
        throw new SchedulingPermissionDeniedError();
      }
      assertFutureScheduleCanBeMutated({
        state: slot.state,
        startAt: slot.start_at.toISOString(),
        activeIntentCount: Number(slot.active_intent_count),
        occurredAt: context.occurredAt,
      });
      await sql`
        update scheduling.slots
        set state = 'WITHDRAWN', version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where slot_id = ${command.aggregateId}::uuid and state = 'PUBLISHED'
      `.execute(transaction);
      const response = slotProjection({
        ...slot, state: 'WITHDRAWN', version: String(context.nextVersion),
      });
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId, eventName: 'SlotWithdrawn', schemaVersion: 1,
          transitionId: 'SL-04',
          payload: { slotId: response.slotId, reasonCode: reason.reasonCode },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId, action: 'WITHDRAW_SLOT', transitionId: 'SL-04',
          reasonCode: reason.reasonCode, beforeState: 'PUBLISHED', afterState: 'WITHDRAWN',
          metadata: { reasonNote: reason.reasonNote },
        },
        outbox: [{
          messageId: ids.outboxMessageId, topic: 'scheduling.slot.withdrawn.v1',
          payload: { slotId: response.slotId, reasonCode: reason.reasonCode },
        }],
      };
    },
  });
}

export async function withdrawGroupOffering(
  database: Kysely<Database>,
  command: CommandEnvelope<WithdrawGroupOfferingPayload>,
  ids: SchedulingEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<GroupOfferingProjection>> {
  if (
    !command.actor.id
    || command.aggregateType !== 'GroupOffering'
    || command.payload.groupOfferingId !== command.aggregateId
  ) {
    throw new SchedulingPermissionDeniedError();
  }
  const reason = normalizeScheduleMutationReason(command.payload);
  return executeCriticalCommand(database, {
    command: { ...command, payload: { ...command.payload, ...reason } },
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const result = await sql<GroupOfferingMutationRow>`
        select offering.group_offering_id, offering.venue_id,
          venue.display_name as venue_display_name, offering.sport_code,
          offering.class_label, offering.start_at, offering.end_at,
          offering.coach_user_id, offering.coach_display_name,
          offering.price_text, offering.external_info_url,
          offering.contact_snapshot, offering.updated_at, offering.state,
          offering.version::text as version, venue.slot_publish_horizon_days,
          (
            select count(*)::text from scheduling.group_plans as plan
            where plan.group_offering_id = offering.group_offering_id
              and plan.state in ('PROPOSED', 'NOTIFIED', 'CONVERSION_PENDING')
          ) as active_intent_count
        from scheduling.group_offerings as offering
        join community.venues as venue on venue.venue_id = offering.venue_id
        where offering.group_offering_id = ${command.aggregateId}::uuid
        for update of offering
      `.execute(transaction);
      const offering = result.rows[0];
      if (!offering) throw new SchedulingConflictError('SCHEDULE_MUTATION_NOT_ALLOWED');
      if (!(await activeVenueAdmin(transaction, command.actor.id!, offering.venue_id))) {
        throw new SchedulingPermissionDeniedError();
      }
      assertFutureScheduleCanBeMutated({
        state: offering.state,
        startAt: offering.start_at.toISOString(),
        activeIntentCount: Number(offering.active_intent_count),
        occurredAt: context.occurredAt,
      });
      await sql`
        update scheduling.group_offerings
        set state = 'WITHDRAWN', version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where group_offering_id = ${command.aggregateId}::uuid and state = 'PUBLISHED'
      `.execute(transaction);
      const response = groupOfferingProjection({
        ...offering, state: 'WITHDRAWN', version: String(context.nextVersion),
        updated_at: context.occurredAt,
      });
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId, eventName: 'GroupOfferingWithdrawn', schemaVersion: 1,
          transitionId: 'GO-03',
          payload: {
            groupOfferingId: response.groupOfferingId, reasonCode: reason.reasonCode,
          },
          metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId, action: 'WITHDRAW_GROUP_OFFERING',
          transitionId: 'GO-03', reasonCode: reason.reasonCode,
          beforeState: 'PUBLISHED', afterState: 'WITHDRAWN',
          metadata: { reasonNote: reason.reasonNote },
        },
        outbox: [{
          messageId: ids.outboxMessageId,
          topic: 'scheduling.group-offering.withdrawn.v1',
          payload: {
            groupOfferingId: response.groupOfferingId, reasonCode: reason.reasonCode,
          },
        }],
      };
    },
  });
}

export async function readTrainingOptions(
  database: Kysely<Database>,
  chatId: string,
  viewerUserId: string,
  now: Date = new Date(),
): Promise<TrainingOptionsProjection> {
  if (!Number.isFinite(now.getTime())) throw new SchedulingValidationError('now');
  const allowed = await sql<{ readonly allowed: boolean }>`
    select true as allowed
    from social.chats as chat
    join social.chat_participants as participant on participant.chat_id = chat.chat_id
    left join social.matches as matched on matched.chat_id = chat.chat_id
    where chat.chat_id = ${chatId}::uuid
      and participant.user_id = ${viewerUserId}::uuid
      and chat.state = 'OPEN'
      and (
        (chat.scope = 'PERSONAL_MATCH' and matched.state = 'ACTIVE')
        or exists (
          select 1 from competition.challenges as challenge
          where challenge.service_chat_id = chat.chat_id
            and challenge.response_policy = 'MUTUAL_GENESIS'
            and challenge.state in ('ACCEPTED_UNSCHEDULED', 'BOOKING_PENDING', 'BOOKED')
            and ${viewerUserId}::uuid in (challenge.initiator_user_id, challenge.recipient_user_id)
        )
      )
    limit 1
  `.execute(database);
  if (!allowed.rows[0]?.allowed) throw new SchedulingPermissionDeniedError();

  const [slots, groupOfferings, activeIntent] = await Promise.all([
    sql<SlotRow>`
      select
        slot.slot_id, slot.venue_id, venue.display_name as venue_display_name,
        slot.coach_user_id, coach.display_name as coach_display_name,
        slot.start_at, slot.end_at, slot.state, slot.price_amount::text as price_amount,
        slot.price_currency, slot.price_text, slot.cancellation_terms_text,
        slot.commercial_version, slot.version::text as version
      from scheduling.slots as slot
      join community.venues as venue on venue.venue_id = slot.venue_id
      join identity.users as coach on coach.user_id = slot.coach_user_id
      where slot.state = 'PUBLISHED'
        and venue.state = 'ACTIVE'
        and slot.start_at >= ${now.toISOString()}::timestamptz
          + (venue.minimum_booking_notice_hours * interval '1 hour')
      order by slot.start_at, slot.slot_id
      limit 100
    `.execute(database),
    sql<GroupOfferingRow>`
      select
        offering.group_offering_id, offering.venue_id,
        venue.display_name as venue_display_name, offering.sport_code,
        offering.class_label, offering.start_at, offering.end_at,
        offering.coach_user_id, offering.coach_display_name,
        offering.price_text, offering.external_info_url,
        offering.contact_snapshot, offering.updated_at, offering.state,
        offering.version::text as version
      from scheduling.group_offerings as offering
      join community.venues as venue on venue.venue_id = offering.venue_id
      where offering.state = 'PUBLISHED'
        and venue.state = 'ACTIVE'
        and offering.start_at > ${now.toISOString()}::timestamptz
      order by offering.start_at, offering.group_offering_id
      limit 100
    `.execute(database),
    readActivePairIntents(database, chatId, viewerUserId),
  ]);
  return {
    slots: slots.rows.map(slotProjection),
    groupOfferings: groupOfferings.rows.map(groupOfferingProjection),
    activeIntent,
    reservationPolicy: 'NO_RESERVATION_BEFORE_HOST_CONFIRMATION',
  };
}

export async function readVenueAdminDashboard(
  database: Kysely<Database>,
  actorId: string,
  venueId: string,
  now: Date = new Date(),
): Promise<VenueAdminDashboardProjection> {
  if (!Number.isFinite(now.getTime())) throw new SchedulingValidationError('now');
  const venueResult = await sql<VenueAdminRow>`
    select venue.venue_id, venue.display_name, venue.timezone,
      venue.slot_publish_horizon_days
    from community.venues as venue
    where venue.venue_id = ${venueId}::uuid
      and venue.state = 'ACTIVE'
      and exists (
        select 1
        from community.role_grants as role_grant
        where role_grant.user_id = ${actorId}::uuid
          and role_grant.role in ('PRIMARY_ADMIN', 'GYM_ADMIN')
          and role_grant.scope_type = 'VENUE'
          and role_grant.scope_id = venue.venue_id
          and role_grant.state = 'ACTIVE'
          and (
            role_grant.expires_at is null
            or role_grant.expires_at > ${now.toISOString()}::timestamptz
          )
      )
    limit 1
  `.execute(database);
  const venue = venueResult.rows[0];
  if (!venue) throw new SchedulingPermissionDeniedError();

  const [coaches, slots, groupOfferings, hostConfirmations, groupInterests] =
    await Promise.all([
      sql<VenueAdminCoachRow>`
        select distinct coach.user_id, coach.display_name
        from community.communities as community
        join community.role_grants as role_grant
          on role_grant.role = 'COACH'
          and role_grant.scope_type = 'COMMUNITY'
          and role_grant.scope_id = community.community_id
          and role_grant.state = 'ACTIVE'
          and (
            role_grant.expires_at is null
            or role_grant.expires_at > ${now.toISOString()}::timestamptz
          )
        join identity.users as coach on coach.user_id = role_grant.user_id
        where community.venue_id = ${venueId}::uuid
          and community.state = 'ACTIVE'
          and coach.account_state = 'ACTIVE'
        order by coach.display_name, coach.user_id
      `.execute(database),
      sql<SlotRow>`
        select
          slot.slot_id, slot.venue_id, venue.display_name as venue_display_name,
          slot.coach_user_id, coach.display_name as coach_display_name,
          slot.start_at, slot.end_at, slot.state, slot.price_amount::text as price_amount,
          slot.price_currency, slot.price_text, slot.cancellation_terms_text,
          slot.commercial_version, slot.version::text as version
        from scheduling.slots as slot
        join community.venues as venue on venue.venue_id = slot.venue_id
        join identity.users as coach on coach.user_id = slot.coach_user_id
        where slot.venue_id = ${venueId}::uuid
          and slot.state = 'PUBLISHED'
          and slot.start_at > ${now.toISOString()}::timestamptz
        order by slot.start_at, slot.slot_id
        limit 200
      `.execute(database),
      sql<GroupOfferingRow>`
        select
          offering.group_offering_id, offering.venue_id,
          venue.display_name as venue_display_name, offering.sport_code,
          offering.class_label, offering.start_at, offering.end_at,
          offering.coach_user_id, offering.coach_display_name,
          offering.price_text, offering.external_info_url,
          offering.contact_snapshot, offering.updated_at, offering.state,
          offering.version::text as version
        from scheduling.group_offerings as offering
        join community.venues as venue on venue.venue_id = offering.venue_id
        where offering.venue_id = ${venueId}::uuid
          and offering.state = 'PUBLISHED'
          and offering.start_at > ${now.toISOString()}::timestamptz
        order by offering.start_at, offering.group_offering_id
        limit 200
      `.execute(database),
      readHostConfirmationQueue(database, actorId, now),
      sql<VenueGroupInterestRow>`
        select plan.group_plan_id, plan.group_offering_id,
          athlete_low.display_name as athlete_low_name,
          athlete_high.display_name as athlete_high_name,
          plan.offering_snapshot ->> 'classLabel' as class_label,
          (plan.offering_snapshot ->> 'startAt')::timestamptz as start_at,
          plan.updated_at as notified_at, plan.state,
          plan.version::text as version
        from scheduling.group_plans as plan
        join scheduling.group_offerings as offering
          on offering.group_offering_id = plan.group_offering_id
        join identity.users as athlete_low on athlete_low.user_id = plan.pair_low_id
        join identity.users as athlete_high on athlete_high.user_id = plan.pair_high_id
        where offering.venue_id = ${venueId}::uuid
          and plan.state = 'NOTIFIED'
          and plan.start_at > ${now.toISOString()}::timestamptz
        order by plan.updated_at, plan.group_plan_id
        limit 100
      `.execute(database),
    ]);

  return {
    venue: {
      venueId: venue.venue_id,
      displayName: venue.display_name,
      timezone: venue.timezone,
      slotPublishHorizonDays: venue.slot_publish_horizon_days,
    },
    coaches: coaches.rows.map((coach) => ({
      userId: coach.user_id,
      displayName: coach.display_name,
    })),
    slots: slots.rows.map(slotProjection),
    groupOfferings: groupOfferings.rows.map(groupOfferingProjection),
    hostConfirmations: hostConfirmations.filter(
      (item) => item.booking.commercialTermsSnapshot?.venueId === venueId,
    ),
    groupInterests: groupInterests.rows.map((interest) => ({
      groupPlanId: interest.group_plan_id,
      groupOfferingId: interest.group_offering_id,
      athleteDisplayNames: [interest.athlete_low_name, interest.athlete_high_name],
      classLabel: interest.class_label,
      startAt: interest.start_at.toISOString(),
      notifiedAt: interest.notified_at.toISOString(),
      state: interest.state,
      version: Number(interest.version),
    })),
  };
}

export async function readSlotTimerSnapshot(
  database: Kysely<Database>,
  slotId: string,
): Promise<TimerAggregateSnapshot> {
  const result = await sql<{ readonly state: string; readonly version: string }>`
    select state, version::text as version from scheduling.slots where slot_id = ${slotId}::uuid
  `.execute(database);
  const row = result.rows[0];
  return row ? { state: row.state, version: Number(row.version) } : { state: 'MISSING', version: 0 };
}

export async function readGroupOfferingTimerSnapshot(
  database: Kysely<Database>,
  groupOfferingId: string,
): Promise<TimerAggregateSnapshot> {
  const result = await sql<{ readonly state: string; readonly version: string }>`
    select state, version::text as version
    from scheduling.group_offerings
    where group_offering_id = ${groupOfferingId}::uuid
  `.execute(database);
  const row = result.rows[0];
  return row ? { state: row.state, version: Number(row.version) } : { state: 'MISSING', version: 0 };
}

export async function expireSlot(
  database: Kysely<Database>,
  command: CommandEnvelope<ExpireSlotPayload>,
  ids: SchedulingEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<SlotProjection>> {
  if (command.actor.type !== 'SYSTEM' || command.payload.slotId !== command.aggregateId) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const result = await sql<SlotRow>`
        select slot.slot_id, slot.venue_id, venue.display_name as venue_display_name,
          slot.coach_user_id, coach.display_name as coach_display_name,
          slot.start_at, slot.end_at, slot.state, slot.price_amount::text as price_amount,
          slot.price_currency, slot.price_text, slot.cancellation_terms_text,
          slot.commercial_version, slot.version::text as version
        from scheduling.slots as slot
        join community.venues as venue on venue.venue_id = slot.venue_id
        join identity.users as coach on coach.user_id = slot.coach_user_id
        where slot.slot_id = ${command.aggregateId}::uuid
        for update of slot
      `.execute(transaction);
      const row = result.rows[0];
      if (!row || row.state !== 'PUBLISHED' || row.start_at > context.occurredAt) {
        throw new SchedulingConflictError('SLOT_UNAVAILABLE');
      }
      await sql`
        update scheduling.slots set state = 'EXPIRED', version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where slot_id = ${command.aggregateId}::uuid and state = 'PUBLISHED'
      `.execute(transaction);
      const response = slotProjection({ ...row, state: 'EXPIRED', version: String(context.nextVersion) });
      return {
        responseStatus: 200,
        response,
        event: { eventId: ids.eventId, eventName: 'SlotExpired', schemaVersion: 1, transitionId: 'SL-05', payload: { slotId: response.slotId }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'EXPIRE_SLOT', transitionId: 'SL-05', reasonCode: 'START_REACHED', beforeState: 'PUBLISHED', afterState: 'EXPIRED', metadata: {} },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'scheduling.slot.expired.v1', payload: { slotId: response.slotId } }],
      };
    },
  });
}

export async function expireGroupOffering(
  database: Kysely<Database>,
  command: CommandEnvelope<ExpireGroupOfferingPayload>,
  ids: SchedulingEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<GroupOfferingProjection>> {
  if (
    command.actor.type !== 'SYSTEM' ||
    command.payload.groupOfferingId !== command.aggregateId
  ) {
    throw new SchedulingPermissionDeniedError();
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const result = await sql<GroupOfferingRow>`
        select offering.group_offering_id, offering.venue_id,
          venue.display_name as venue_display_name, offering.sport_code,
          offering.class_label, offering.start_at, offering.end_at,
          offering.coach_user_id, offering.coach_display_name,
          offering.price_text, offering.external_info_url,
          offering.contact_snapshot, offering.updated_at, offering.state,
          offering.version::text as version
        from scheduling.group_offerings as offering
        join community.venues as venue on venue.venue_id = offering.venue_id
        where offering.group_offering_id = ${command.aggregateId}::uuid
        for update of offering
      `.execute(transaction);
      const row = result.rows[0];
      if (!row || row.state !== 'PUBLISHED' || row.start_at > context.occurredAt) {
        throw new SchedulingValidationError('groupOfferingState');
      }
      await sql`
        update scheduling.group_offerings
        set state = 'EXPIRED', version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where group_offering_id = ${command.aggregateId}::uuid and state = 'PUBLISHED'
      `.execute(transaction);
      const response = groupOfferingProjection({
        ...row,
        state: 'EXPIRED',
        version: String(context.nextVersion),
        updated_at: context.occurredAt,
      });
      return {
        responseStatus: 200,
        response,
        event: { eventId: ids.eventId, eventName: 'GroupOfferingExpired', schemaVersion: 1, transitionId: 'GO-04', payload: { groupOfferingId: response.groupOfferingId }, metadata: { policyVersion: SCHEDULING_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'EXPIRE_GROUP_OFFERING', transitionId: 'GO-04', reasonCode: 'START_REACHED', beforeState: 'PUBLISHED', afterState: 'EXPIRED', metadata: {} },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'scheduling.group-offering.expired.v1', payload: { groupOfferingId: response.groupOfferingId } }],
      };
    },
  });
}
