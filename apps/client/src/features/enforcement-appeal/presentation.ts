export function enforcementAppealPresentation(input: {
  readonly state: 'NOT_SUBMITTED' | 'SUBMITTED' | 'UNDER_REVIEW';
  readonly restrictionRemainsActive: boolean;
  readonly viewerCanStartReview: boolean;
}): { readonly title: string; readonly explanation: string; readonly action: 'SUBMIT' | 'START_REVIEW' | 'READ_ONLY' } {
  if (input.state === 'NOT_SUBMITTED') return {
    title: 'Обжаловать ограничение аккаунта',
    explanation: 'Заявление примет независимый Central. Ограничение и STATUS_REVIEW hold продолжат действовать до отдельного решения.',
    action: 'SUBMIT',
  };
  if (input.state === 'SUBMITTED' && input.viewerCanStartReview) return {
    title: 'Enforcement Appeal ожидает независимого reviewer',
    explanation: 'Взять Appeal может только другой Central, который не принимал исходное решение и не участвовал в SafetyCase.',
    action: 'START_REVIEW',
  };
  return {
    title: input.state === 'UNDER_REVIEW' ? 'Appeal находится на рассмотрении' : 'Appeal принят',
    explanation: input.restrictionRemainsActive
      ? 'Ограничение аккаунта и STATUS_REVIEW hold продолжают действовать до отдельного решения.'
      : 'Состояние ограничения изменилось.',
    action: 'READ_ONLY',
  };
}
