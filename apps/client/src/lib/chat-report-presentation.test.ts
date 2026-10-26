import { describe, expect, it } from 'vitest';

import {
  CHAT_REPORT_CONFIRMATION_COPY,
  CHAT_REPORT_SUBMITTED_LABEL,
  SAFETY_CANCEL_ACTION_LABEL,
  SAFETY_CANCEL_CONFIRMATION_COPY,
} from './chat-report-presentation';

describe('Chat report presentation', () => {
  it('[AC-123] describes review without promising enforcement or safety cancellation', () => {
    expect(CHAT_REPORT_SUBMITTED_LABEL).toBe('Жалоба отправлена на рассмотрение');
    expect(CHAT_REPORT_CONFIRMATION_COPY).toContain('не блокирует пользователя');
    expect(CHAT_REPORT_CONFIRMATION_COPY).toContain('не отменяет Challenge');
  });

  it('[AC-124] separates safety cancellation from an ordinary message report', () => {
    expect(SAFETY_CANCEL_ACTION_LABEL).toContain('отменить встречу');
    expect(SAFETY_CANCEL_CONFIRMATION_COPY).toContain('без поражения');
    expect(SAFETY_CANCEL_CONFIRMATION_COPY).toContain('до решения Central');
    expect(SAFETY_CANCEL_CONFIRMATION_COPY).not.toContain('автоматическую блокировку');
  });
});
