import { describe, expect, it } from 'vitest';

import {
  CHAT_REPORT_CONFIRMATION_COPY,
  CHAT_REPORT_SUBMITTED_LABEL,
} from './chat-report-presentation';

describe('Chat report presentation', () => {
  it('[AC-123] describes review without promising enforcement or safety cancellation', () => {
    expect(CHAT_REPORT_SUBMITTED_LABEL).toBe('Жалоба отправлена на рассмотрение');
    expect(CHAT_REPORT_CONFIRMATION_COPY).toContain('не блокирует пользователя');
    expect(CHAT_REPORT_CONFIRMATION_COPY).toContain('не отменяет Challenge');
  });
});
