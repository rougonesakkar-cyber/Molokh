import { type Kysely, sql } from 'kysely';

import type { Database } from './index.js';

export const NOTIFICATION_OUTBOX_TOPIC = 'notification.in_app.v1';
export const NOTIFICATION_PROJECTION_CONSUMER = 'notification-inbox-v1';

export type NotificationCategory =
  | 'MANDATORY'
  | 'SERVICE'
  | 'SOCIAL'
  | 'PROMOTIONAL';

export interface NotificationDraft {
  readonly notificationId: string;
  readonly recipientUserId: string;
  readonly category: NotificationCategory;
  readonly renderKey: string;
  readonly actionTarget: Readonly<Record<string, unknown>>;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly deadlineAt: string | null;
}

export interface NotificationProjectionResult {
  readonly replayed: boolean;
  readonly createdCount: number;
  readonly createdPushIntentCount: number;
  readonly createdSmsIntentCount: number;
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) throw new TypeError(`${field} is required`);
}

function assertDraft(draft: NotificationDraft): void {
  assertNonEmpty(draft.notificationId, 'notificationId');
  assertNonEmpty(draft.recipientUserId, 'recipientUserId');
  assertNonEmpty(draft.renderKey, 'renderKey');
  if (
    !['MANDATORY', 'SERVICE', 'SOCIAL', 'PROMOTIONAL'].includes(draft.category)
  ) {
    throw new TypeError(`Unsupported notification category ${draft.category}`);
  }
  if (draft.deadlineAt !== null && Number.isNaN(Date.parse(draft.deadlineAt))) {
    throw new TypeError('deadlineAt must be an ISO date-time or null');
  }
}

export async function projectNotificationBatch(
  database: Kysely<Database>,
  sourceEventId: string,
  drafts: readonly NotificationDraft[],
): Promise<NotificationProjectionResult> {
  assertNonEmpty(sourceEventId, 'sourceEventId');
  if (drafts.length === 0) throw new TypeError('At least one notification is required');
  drafts.forEach(assertDraft);

  return database.transaction().execute(async (transaction) => {
    const receipt = await sql<{ readonly event_id: string }>`
      insert into platform.inbox_receipts (consumer_name, event_id)
      values (${NOTIFICATION_PROJECTION_CONSUMER}, ${sourceEventId}::uuid)
      on conflict do nothing
      returning event_id
    `.execute(transaction);

    if (receipt.rows.length === 0) {
      return {
        replayed: true,
        createdCount: 0,
        createdPushIntentCount: 0,
        createdSmsIntentCount: 0,
      };
    }

    let createdPushIntentCount = 0;
    let createdSmsIntentCount = 0;
    for (const draft of drafts) {
      await sql`
        insert into platform.notifications (
          notification_id,
          recipient_user_id,
          source_event_id,
          category,
          render_key,
          action_target,
          payload,
          deadline_at
        ) values (
          ${draft.notificationId}::uuid,
          ${draft.recipientUserId}::uuid,
          ${sourceEventId}::uuid,
          ${draft.category},
          ${draft.renderKey},
          ${JSON.stringify(draft.actionTarget)}::jsonb,
          ${JSON.stringify(draft.payload)}::jsonb,
          ${draft.deadlineAt}::timestamptz
        )
      `.execute(transaction);

      if (draft.category !== 'MANDATORY') continue;

      const pushIntent = await sql<{ readonly delivery_intent_id: string }>`
        insert into platform.notification_delivery_intents (
          delivery_intent_id,
          notification_id,
          source_event_id,
          recipient_user_id,
          channel,
          delivery_class
        ) values (
          md5(${draft.notificationId} || ':PUSH')::uuid,
          ${draft.notificationId}::uuid,
          ${sourceEventId}::uuid,
          ${draft.recipientUserId}::uuid,
          'PUSH',
          'CRITICAL'
        )
        on conflict (notification_id, channel) do nothing
        returning delivery_intent_id
      `.execute(transaction);
      createdPushIntentCount += pushIntent.rows.length;

      const smsIntent = await sql<{ readonly delivery_intent_id: string }>`
        insert into platform.notification_delivery_intents (
          delivery_intent_id,
          notification_id,
          source_event_id,
          recipient_user_id,
          channel,
          delivery_class
        )
        select
          md5(${draft.notificationId} || ':SMS')::uuid,
          ${draft.notificationId}::uuid,
          ${sourceEventId}::uuid,
          ${draft.recipientUserId}::uuid,
          'SMS',
          'CRITICAL'
        from platform.notification_preferences
        where user_id = ${draft.recipientUserId}::uuid
          and event_sms_opt_in = true
        on conflict (notification_id, channel) do nothing
        returning delivery_intent_id
      `.execute(transaction);
      createdSmsIntentCount += smsIntent.rows.length;
    }

    return {
      replayed: false,
      createdCount: drafts.length,
      createdPushIntentCount,
      createdSmsIntentCount,
    };
  });
}

export async function markNotificationRead(
  database: Kysely<Database>,
  notificationId: string,
  recipientUserId: string,
): Promise<boolean> {
  assertNonEmpty(notificationId, 'notificationId');
  assertNonEmpty(recipientUserId, 'recipientUserId');
  const result = await sql<{ readonly notification_id: string }>`
    update platform.notifications
    set read_at = coalesce(read_at, clock_timestamp())
    where notification_id = ${notificationId}::uuid
      and recipient_user_id = ${recipientUserId}::uuid
    returning notification_id
  `.execute(database);
  return result.rows.length === 1;
}
