import { describe, expect, it } from 'vitest';

import { enforcementAppealPresentation } from './presentation';

describe('Enforcement Appeal presentation', () => {
  it('[AC-129] explains that submit and review do not suspend the restriction', () => {
    const submit = enforcementAppealPresentation({
      state: 'NOT_SUBMITTED', restrictionRemainsActive: true, viewerCanStartReview: false,
      viewerCanDecide: false,
    });
    expect(submit.action).toBe('SUBMIT');
    expect(submit.explanation).toContain('продолжат действовать');
    const review = enforcementAppealPresentation({
      state: 'SUBMITTED', restrictionRemainsActive: true, viewerCanStartReview: true,
      viewerCanDecide: false,
    });
    expect(review.action).toBe('START_REVIEW');
    expect(review.explanation).toContain('другой Central');
  });

  it('[AC-152] explains revocation without promising restoration of old processes', () => {
    const reviewer = enforcementAppealPresentation({
      state: 'UNDER_REVIEW', restrictionRemainsActive: true,
      viewerCanStartReview: false, viewerCanDecide: true,
    });
    expect(reviewer.action).toBe('REVOKE');
    expect(reviewer.explanation).toContain('не восстановит');
    const subject = enforcementAppealPresentation({
      state: 'DECIDED_REVOKED', restrictionRemainsActive: false,
      viewerCanStartReview: false, viewerCanDecide: false,
    });
    expect(subject.action).toBe('READ_ONLY');
    expect(subject.explanation).toContain('не восстановлены');
  });
});
