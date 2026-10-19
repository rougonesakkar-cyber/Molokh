import { describe, expect, it } from 'vitest';

import { coachSafetyRefusalPresentation, safetyCaseResolutionPresentation } from './presentation';

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

  it('[AC-126] separates review from release and does not promise automatic booking', () => {
    expect(safetyCaseResolutionPresentation({
      state: 'SUBMITTED', viewerCanStartReview: true, viewerCanResolve: false,
    })).toMatchObject({ action: 'START_REVIEW' });
    const decision = safetyCaseResolutionPresentation({
      state: 'UNDER_REVIEW', viewerCanStartReview: false, viewerCanResolve: true,
    });
    expect(decision.action).toBe('RESOLVE');
    expect(decision.explanation).toContain('Новая Session автоматически не создаётся');
    expect(decision.explanation).toContain('тот же Challenge');
  });
});
