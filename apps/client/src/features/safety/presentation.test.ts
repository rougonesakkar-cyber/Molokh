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
    expect(decision.explanation).toContain('тот же Challenge');
  });

  it('[AC-127] exposes enforcement only as an independent causal decision with Appeal', () => {
    const decision = safetyCaseResolutionPresentation({
      state: 'UNDER_REVIEW', viewerCanStartReview: false, viewerCanResolve: true,
    });
    expect(decision.explanation).toContain('прямой причинной связи');
    expect(decision.explanation).toContain('Forfeit');
    expect(decision.explanation).toContain('Appeal');
  });

  it('[AC-128] explains immediate restriction without automatic status transfer', () => {
    const decision = safetyCaseResolutionPresentation({
      state: 'UNDER_REVIEW', viewerCanStartReview: false, viewerCanResolve: true,
    });
    expect(decision.explanation).toContain('подтверждённой серьёзной категории');
    expect(decision.explanation).toContain('блокирует новые действия сразу');
    expect(decision.explanation).toContain('не передаёт статус автоматически');
    expect(decision.explanation).toContain('Appeal 7 дней');
  });

  it('[AC-130] hides review and decision actions from a conflicted Case subject', () => {
    const presentation = safetyCaseResolutionPresentation({
      state: 'SUBMITTED', viewerCanStartReview: false, viewerCanResolve: false,
      viewerHasReviewerConflict: true,
    });
    expect(presentation).toMatchObject({ action: 'READ_ONLY', title: 'Конфликт интересов' });
    expect(presentation.explanation).toContain('не можете брать его в review или принимать решение');
    expect(presentation.explanation).toContain('другой независимый Central reviewer');
  });
});
