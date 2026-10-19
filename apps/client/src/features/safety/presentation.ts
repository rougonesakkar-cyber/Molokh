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
