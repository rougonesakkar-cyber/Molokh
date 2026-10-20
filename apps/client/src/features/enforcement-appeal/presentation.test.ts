import { describe, expect, it } from 'vitest';

import { enforcementAppealPresentation } from './presentation';

describe('Enforcement Appeal presentation', () => {
  it('[AC-129] explains that submit and review do not suspend the restriction', () => {
    const submit = enforcementAppealPresentation({
      state: 'NOT_SUBMITTED', restrictionRemainsActive: true, viewerCanStartReview: false,
    });
    expect(submit.action).toBe('SUBMIT');
    expect(submit.explanation).toContain('продолжат действовать');
    const review = enforcementAppealPresentation({
      state: 'SUBMITTED', restrictionRemainsActive: true, viewerCanStartReview: true,
    });
    expect(review.action).toBe('START_REVIEW');
    expect(review.explanation).toContain('другой Central');
  });
});
