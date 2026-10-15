import { describe, expect, it } from 'vitest';

import { competitionIdFromCompetitiveSessionEvent } from '../src/competitive-context-reconciliation.js';

describe('competitive Session reconciliation', () => {
  it('[AC-072] routes only holder-changing Competition events with an explicit scope', () => {
    const competitionId = '0199a1b2-1234-7000-8000-000000000072';
    expect(competitionIdFromCompetitiveSessionEvent(
      'competition.result.recorded.v1',
      { competitionId },
    )).toBe(competitionId);
    expect(competitionIdFromCompetitiveSessionEvent(
      'competition.status-released.v1',
      { competitionId },
    )).toBe(competitionId);
    expect(competitionIdFromCompetitiveSessionEvent(
      'competition.result.recorded.v1',
      { resultId: 'missing-scope' },
    )).toBeNull();
    expect(competitionIdFromCompetitiveSessionEvent(
      'competition.challenge.accepted.v1',
      { competitionId },
    )).toBeNull();
  });
});
