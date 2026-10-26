export interface TechnicalCorrectionRequestPresentationInput {
  readonly currentRole: string;
  readonly currentUserId: string | null;
  readonly assignedCoachUserId: string | null;
  readonly resultState: 'RECORDED' | 'UNDER_APPEAL' | 'FINAL' | 'REVERSED' | 'ANNULLED' | 'REPEAT_ORDERED';
}

export interface TechnicalCorrectionRequestPresentation {
  readonly actionLabel: string;
  readonly explanation: string;
}

export function technicalCorrectionRequestPresentation(
  input: TechnicalCorrectionRequestPresentationInput,
): TechnicalCorrectionRequestPresentation | null {
  const allowed = input.currentRole === 'Coach'
    && input.currentUserId !== null
    && input.currentUserId === input.assignedCoachUserId
    && (input.resultState === 'RECORDED' || input.resultState === 'UNDER_APPEAL');
  if (!allowed) return null;
  return {
    actionLabel: 'Сообщить об ошибке Result',
    explanation: 'Это не немедленное изменение. Central отдельно проверит запрос.',
  };
}
