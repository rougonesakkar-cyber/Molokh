import { describe, expect, it } from 'vitest';

import { parseNotificationProjection } from '../src/notification-projection.js';

describe('notification projection payload', () => {
  it('parses the stable in-app notification envelope', () => {
    expect(
      parseNotificationProjection({
        messageId: 'message-1',
        eventId: 'event-1',
        topic: 'notification.in_app.v1',
        payload: {
          notifications: [
            {
              notificationId: 'notification-1',
              recipientUserId: 'user-1',
              category: 'MANDATORY',
              renderKey: 'challenge.response_required',
              actionTarget: { type: 'CHALLENGE', id: 'challenge-1' },
              payload: { opponentName: 'Athlete' },
              deadlineAt: '2026-09-07T12:00:00.000Z',
            },
          ],
        },
      }),
    ).toEqual([
      {
        notificationId: 'notification-1',
        recipientUserId: 'user-1',
        category: 'MANDATORY',
        renderKey: 'challenge.response_required',
        actionTarget: { type: 'CHALLENGE', id: 'challenge-1' },
        payload: { opponentName: 'Athlete' },
        deadlineAt: '2026-09-07T12:00:00.000Z',
      },
    ]);
  });

  it('ignores unrelated topics and rejects unknown notification categories', () => {
    expect(
      parseNotificationProjection({
        messageId: 'message-1',
        eventId: 'event-1',
        topic: 'challenge.created.v1',
        payload: {},
      }),
    ).toBeNull();

    expect(() =>
      parseNotificationProjection({
        messageId: 'message-1',
        eventId: 'event-1',
        topic: 'notification.in_app.v1',
        payload: {
          notifications: [
            {
              notificationId: 'notification-1',
              recipientUserId: 'user-1',
              category: 'SECRET_PRIORITY',
              renderKey: 'invalid',
              actionTarget: {},
              payload: {},
              deadlineAt: null,
            },
          ],
        },
      }),
    ).toThrow('Unsupported notification category');
  });
});
