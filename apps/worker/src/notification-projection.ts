import {
  NOTIFICATION_OUTBOX_TOPIC,
  type NotificationCategory,
  type NotificationDraft,
} from '@molokh/db';

import type { OutboxJobPayload } from './tasks.js';

const categories = new Set<NotificationCategory>([
  'MANDATORY',
  'SERVICE',
  'SOCIAL',
  'PROMOTIONAL',
]);

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Notification payload field ${field} is required`);
  }
  return value;
}

function record(value: unknown, field: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Notification payload field ${field} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

export function parseNotificationProjection(
  message: OutboxJobPayload,
): readonly NotificationDraft[] | null {
  if (message.topic !== NOTIFICATION_OUTBOX_TOPIC) return null;
  const envelope = record(message.payload, 'payload');
  if (!Array.isArray(envelope.notifications) || envelope.notifications.length === 0) {
    throw new TypeError('Notification payload must contain at least one notification');
  }

  return envelope.notifications.map((candidate, index) => {
    const value = record(candidate, `notifications[${index}]`);
    const category = requiredString(value.category, `notifications[${index}].category`);
    if (!categories.has(category as NotificationCategory)) {
      throw new TypeError(`Unsupported notification category ${category}`);
    }
    if (value.deadlineAt !== null && typeof value.deadlineAt !== 'string') {
      throw new TypeError(`Notification payload field notifications[${index}].deadlineAt is invalid`);
    }
    return {
      notificationId: requiredString(
        value.notificationId,
        `notifications[${index}].notificationId`,
      ),
      recipientUserId: requiredString(
        value.recipientUserId,
        `notifications[${index}].recipientUserId`,
      ),
      category: category as NotificationCategory,
      renderKey: requiredString(value.renderKey, `notifications[${index}].renderKey`),
      actionTarget: record(value.actionTarget, `notifications[${index}].actionTarget`),
      payload: record(value.payload, `notifications[${index}].payload`),
      deadlineAt: value.deadlineAt as string | null,
    } satisfies NotificationDraft;
  });
}
