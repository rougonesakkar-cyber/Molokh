import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

import { apiErrorMessage } from './api';

describe('API error presentation', () => {
  it('[AC-176] shows the neutral server reapply time without a private rejection reason', async () => {
    const retryAt = '2026-10-11T10:00:00.000Z';
    const response = {
      status: 409,
      json: async () => ({ code: 'MEMBERSHIP_REAPPLY_WAIT', message: 'conflict', retryAt }),
    } as Response;

    const message = await apiErrorMessage(response);

    expect(message).toContain('Повторную заявку');
    expect(message).toContain('2026');
    expect(message).not.toContain('conflict');
  });

  it('[AC-040] explains that an expired host window did not reserve the Slot', async () => {
    const response = {
      status: 409,
      json: async () => ({ code: 'HOST_CONFIRMATION_EXPIRED', message: 'conflict' }),
    } as Response;

    const message = await apiErrorMessage(response);

    expect(message).toContain('Срок подтверждения истёк');
    expect(message).toContain('не был забронирован');
    expect(message).not.toContain('conflict');
  });
});
