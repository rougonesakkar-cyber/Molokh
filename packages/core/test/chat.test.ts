import { describe, expect, it } from 'vitest';

import {
  ChatActionDeniedError,
  assertCanEditMessage,
  assertCanReportMessage,
  assertChatAcceptsPayload,
  normalizePersonalMessageText,
  personalMessageEditDeadline,
} from '../src/index.js';

describe('chat policy', () => {
  it('keeps personal text user-owned and structured actions system-owned', () => {
    expect(() => assertChatAcceptsPayload('PERSONAL_MATCH', 'OPEN', 'PERSONAL_TEXT', 'USER')).not.toThrow();
    expect(() => assertChatAcceptsPayload('PERSONAL_MATCH', 'OPEN', 'ACTION', 'USER')).toThrow(
      ChatActionDeniedError,
    );
    expect(() => assertChatAcceptsPayload('CHALLENGE_SERVICE', 'READ_ONLY', 'ACTION', 'SYSTEM')).not.toThrow();
    expect(() => assertChatAcceptsPayload('CHALLENGE_SERVICE', 'READ_ONLY', 'SERVICE', 'SYSTEM')).toThrowError(
      expect.objectContaining({ code: 'CHAT_READ_ONLY' }),
    );
  });

  it('[AC-193] allows only sender PERSONAL_TEXT edits before the exact 15-minute boundary', () => {
    const createdAt = new Date('2026-09-07T10:00:00.000Z');
    expect(personalMessageEditDeadline(createdAt).toISOString()).toBe('2026-09-07T10:15:00.000Z');
    expect(() => assertCanEditMessage({
      actorUserId: 'a',
      senderUserId: 'a',
      payloadType: 'PERSONAL_TEXT',
      createdAt,
      reportedAt: null,
      occurredAt: new Date('2026-09-07T10:14:59.999Z'),
    })).not.toThrow();
    expect(() => assertCanEditMessage({
      actorUserId: 'a',
      senderUserId: 'a',
      payloadType: 'PERSONAL_TEXT',
      createdAt,
      reportedAt: null,
      occurredAt: new Date('2026-09-07T10:15:00.000Z'),
    })).toThrowError(expect.objectContaining({ code: 'MESSAGE_EDIT_WINDOW_CLOSED' }));
    expect(() => assertCanEditMessage({
      actorUserId: 'a',
      senderUserId: null,
      payloadType: 'ACTION',
      createdAt,
      reportedAt: null,
      occurredAt: createdAt,
    })).toThrowError(expect.objectContaining({ code: 'SERVICE_MESSAGE_IMMUTABLE' }));
  });

  it('[AC-194] freezes reported content and keeps reporting separate from self-delete', () => {
    expect(() => assertCanReportMessage('b', 'a', null)).not.toThrow();
    expect(() => assertCanReportMessage('a', 'a', null)).toThrowError(
      expect.objectContaining({ code: 'REPORT_SELF_NOT_ALLOWED' }),
    );
    expect(() => assertCanEditMessage({
      actorUserId: 'a',
      senderUserId: 'a',
      payloadType: 'PERSONAL_TEXT',
      createdAt: new Date('2026-09-07T10:00:00.000Z'),
      reportedAt: new Date('2026-09-07T10:05:00.000Z'),
      occurredAt: new Date('2026-09-07T10:06:00.000Z'),
    })).toThrowError(expect.objectContaining({ code: 'MESSAGE_REPORTED' }));
    expect(normalizePersonalMessageText('  Пойдём на тренировку?  ')).toBe('Пойдём на тренировку?');
  });
});
