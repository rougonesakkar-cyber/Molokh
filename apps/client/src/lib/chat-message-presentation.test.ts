import { describe, expect, it } from 'vitest';

import {
  challengeStateLabel,
  chatMessageLabel,
  guardianConsentStateLabel,
  mergeOlderChatMessages,
} from './chat-message-presentation';

describe('human-readable engine projections', () => {
  it('presents known service events without internal keys', () => {
    expect(chatMessageLabel('booking.confirmed')).toBe('Тренировка подтверждена залом');
    expect(chatMessageLabel('result.final')).not.toContain('result.final');
  });

  it('uses a neutral fallback without leaking an unknown key', () => {
    const internal = 'internal.unreleased-state-v7';
    expect(chatMessageLabel(internal)).toBe('Событие обновлено');
    expect(chatMessageLabel(internal)).not.toContain(internal);
    expect(challengeStateLabel(internal)).not.toContain(internal);
    expect(guardianConsentStateLabel(internal)).not.toContain(internal);
  });

  it('prepends a cursor page without duplicating the boundary message', () => {
    const merged = mergeOlderChatMessages(
      [{ messageId: '1' }, { messageId: '2' }],
      [{ messageId: '2' }, { messageId: '3' }],
    );
    expect(merged.map((message) => message.messageId)).toEqual(['1', '2', '3']);
  });
});
