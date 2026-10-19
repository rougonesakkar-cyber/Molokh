import { describe, expect, it } from 'vitest';

import { coachSafetyRefusalPresentation } from './presentation';

describe('Coach safety refusal presentation', () => {
  it('[AC-125] explains independent review and absence of automatic Athlete fault', () => {
    const presentation = coachSafetyRefusalPresentation({
      athleteDisplayName: 'Спортсмен А',
      purpose: 'OFFICIAL_CHALLENGE',
      sessionState: 'READY_FOR_COACH',
      viewerCanReportCoachSafetyRefusal: true,
    });
    expect(presentation).toMatchObject({
      actionLabel: 'Отказаться из-за угрозы: Спортсмен А',
    });
    expect(presentation?.confirmation).toContain('Central независимо проверит');
    expect(presentation?.confirmation).toContain('не будет поражения, Forfeit, Cooldown, Block');
    expect(coachSafetyRefusalPresentation({
      athleteDisplayName: 'Спортсмен А', purpose: 'OFFICIAL_CHALLENGE',
      sessionState: 'IN_PROGRESS', viewerCanReportCoachSafetyRefusal: true,
    })).toBeNull();
  });
});
