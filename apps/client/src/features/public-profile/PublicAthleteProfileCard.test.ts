import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  StyleSheet: { create: <T>(styles: T): T => styles },
  Text: () => null,
  View: () => null,
}));

import { PUBLIC_PROFILE_COPY, publicResultLabel } from './PublicAthleteProfileCard';

describe('public Athlete profile presentation', () => {
  it('[AC-165] presents neutral public statistics without a win rate or partner identity', () => {
    expect(publicResultLabel({
      resultId: '0199a1b2-1234-7000-8000-000000000001',
      competitionId: '0199a1b2-1234-7000-8000-000000000002',
      outcome: 'LOSS', publicMethod: 'FORFEIT',
      occurredAt: '2026-10-01T10:00:00.000Z',
    })).toBe('Поражение · административное завершение');
    expect(PUBLIC_PROFILE_COPY.privacy).toContain('партнёры');
    expect(JSON.stringify(PUBLIC_PROFILE_COPY)).not.toMatch(/win rate|процент побед/i);
    expect(JSON.stringify(PUBLIC_PROFILE_COPY)).not.toMatch(/safety|модерац/i);
  });
});
