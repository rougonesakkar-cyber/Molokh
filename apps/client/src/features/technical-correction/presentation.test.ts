import { describe, expect, it } from 'vitest';

import { technicalCorrectionRequestPresentation } from './presentation';

describe('Technical Correction presentation', () => {
  it('[AC-079] offers the assigned Coach a request, never a direct Result edit', () => {
    expect(technicalCorrectionRequestPresentation({
      currentRole: 'Coach', currentUserId: 'coach', assignedCoachUserId: 'coach',
      resultState: 'RECORDED',
    })).toEqual({
      actionLabel: 'Сообщить об ошибке Result',
      explanation: 'Это не немедленное изменение. Central отдельно проверит запрос.',
    });
    expect(technicalCorrectionRequestPresentation({
      currentRole: 'Athlete', currentUserId: 'athlete', assignedCoachUserId: 'coach',
      resultState: 'RECORDED',
    })).toBeNull();
    expect(technicalCorrectionRequestPresentation({
      currentRole: 'Coach', currentUserId: 'coach', assignedCoachUserId: 'coach',
      resultState: 'FINAL',
    })).toBeNull();
  });
});
