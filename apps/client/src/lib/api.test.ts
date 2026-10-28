import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

import { apiErrorMessage, resolveApiConfiguration, retryableIdempotencyKey } from './api';

describe('API error presentation', () => {
  it('validates an explicit API origin and explains invalid configuration', () => {
    expect(resolveApiConfiguration('https://pilot.molokh.example/', 'web')).toEqual({
      apiUrl: 'https://pilot.molokh.example',
      error: null,
    });
    expect(resolveApiConfiguration('not-a-url', 'web')).toEqual({
      apiUrl: 'http://localhost:3000',
      error: expect.stringContaining('EXPO_PUBLIC_API_URL'),
    });
    expect(resolveApiConfiguration('https://secret@example.com', 'web').error).not.toBeNull();
  });

  it('keeps one idempotency key across an explicit status-command retry', () => {
    const keys = new Map<string, string>();
    const create = vi.fn(() => 'status-command-key');

    expect(retryableIdempotencyKey(keys, 'queue:join', create)).toBe('status-command-key');
    expect(retryableIdempotencyKey(keys, 'queue:join', create)).toBe('status-command-key');
    expect(create).toHaveBeenCalledTimes(1);
  });

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
