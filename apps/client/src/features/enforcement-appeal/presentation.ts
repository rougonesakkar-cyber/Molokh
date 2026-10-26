export function enforcementAppealPresentation(input: {
  readonly state: 'NOT_SUBMITTED' | 'SUBMITTED' | 'UNDER_REVIEW' | 'DECIDED_REVOKED';
  readonly restrictionRemainsActive: boolean;
  readonly viewerCanStartReview: boolean;
  readonly viewerCanDecide: boolean;
}): { readonly title: string; readonly explanation: string; readonly action: 'SUBMIT' | 'START_REVIEW' | 'REVOKE' | 'READ_ONLY' } {
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
  if (input.state === 'UNDER_REVIEW' && input.viewerCanDecide) return {
    title: 'Enforcement Appeal находится на рассмотрении',
    explanation: 'Вы назначены независимым reviewer. Отзыв снимет это ограничение и связанный STATUS_REVIEW hold, но не восстановит старые процессы.',
    action: 'REVOKE',
  };
  if (input.state === 'DECIDED_REVOKED') return {
    title: 'Ограничение аккаунта отозвано',
    explanation: 'Аккаунт снова активен, если нет другого ограничения. Ранее отменённые Challenge, Booking и Session не восстановлены.',
    action: 'READ_ONLY',
  };
  return {
    title: input.state === 'UNDER_REVIEW' ? 'Appeal находится на рассмотрении' : 'Appeal принят',
    explanation: input.restrictionRemainsActive
      ? 'Ограничение аккаунта и STATUS_REVIEW hold продолжают действовать до отдельного решения.'
      : 'Состояние ограничения изменилось.',
    action: 'READ_ONLY',
  };
}
