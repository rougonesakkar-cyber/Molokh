export interface CoachSafetyRefusalPresentationInput {
  readonly athleteDisplayName: string;
  readonly purpose: 'TRAINING' | 'OFFICIAL_CHALLENGE';
  readonly sessionState: 'SCHEDULED' | 'READY_FOR_COACH' | 'IN_PROGRESS' | 'ENDED' | 'CANCELLED';
  readonly viewerCanReportCoachSafetyRefusal: boolean;
}

export function coachSafetyRefusalPresentation(
  input: CoachSafetyRefusalPresentationInput,
): { readonly actionLabel: string; readonly confirmation: string } | null {
  if (
    !input.viewerCanReportCoachSafetyRefusal
    || input.purpose !== 'OFFICIAL_CHALLENGE'
    || !['SCHEDULED', 'READY_FOR_COACH'].includes(input.sessionState)
  ) {
    return null;
  }
  return {
    actionLabel: `Отказаться из-за угрозы: ${input.athleteDisplayName}`,
    confirmation:
      `Central независимо проверит сообщение о ${input.athleteDisplayName}. `
      + 'Session и слот закроются без виновного, Challenge будет приостановлен. '
      + 'До решения не будет поражения, Forfeit, Cooldown, Block или ограничения аккаунта.',
  };
}

export function safetyCaseResolutionPresentation(input: {
  readonly state: 'SUBMITTED' | 'TRIAGED' | 'UNDER_REVIEW' | 'DECIDED' | 'CLOSED';
  readonly viewerCanStartReview: boolean;
  readonly viewerCanResolve: boolean;
}): {
  readonly title: string;
  readonly explanation: string;
  readonly action: 'START_REVIEW' | 'RESOLVE' | 'READ_ONLY';
} {
  if (input.state === 'SUBMITTED' && input.viewerCanStartReview) return {
    title: 'Проверка безопасности ожидает reviewer',
    explanation: 'Central проверит независимость до назначения. Спортивных санкций пока нет.',
    action: 'START_REVIEW',
  };
  if (input.state === 'UNDER_REVIEW' && input.viewerCanResolve) return {
    title: 'Выберите безопасную замену',
    explanation: 'Решение освободит hold и вернёт тот же Challenge к выбору слота. Новая Session автоматически не создаётся.',
    action: 'RESOLVE',
  };
  return {
    title: 'SafetyCase доступен только для чтения',
    explanation: 'Назначенный независимый reviewer завершит решение. Спортивных санкций пока нет.',
    action: 'READ_ONLY',
  };
}
