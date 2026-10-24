export type VenueVerificationViewerRole = 'Central' | 'Gym Admin' | 'Athlete' | 'Coach';
export type VenueVerificationState = 'PENDING_VERIFICATION' | 'ACTIVE' | 'PAUSED' | 'CLOSED';

export interface VenueVerificationPresentation {
  readonly stateLabel: string;
  readonly explanation: string;
  readonly canVerify: boolean;
}

export function venueVerificationPresentation(input: {
  readonly viewerRole: VenueVerificationViewerRole;
  readonly state: VenueVerificationState;
}): VenueVerificationPresentation {
  const canVerify = input.viewerRole === 'Central' && input.state === 'PENDING_VERIFICATION';
  if (input.state === 'PENDING_VERIFICATION') {
    return {
      stateLabel: 'Ожидает проверки Central',
      explanation: canVerify
        ? 'Проверьте обязательный checklist и защищённую ссылку на подтверждение. Community и публикация Slot станут доступны только после подтверждения.'
        : 'Venue ещё не активен. Проверку выполняет только Central.',
      canVerify,
    };
  }
  if (input.state === 'ACTIVE') {
    return {
      stateLabel: 'Venue активен',
      explanation: 'Можно создавать Community и публиковать Slot через обычные проверки доступа.',
      canVerify: false,
    };
  }
  return {
    stateLabel: input.state === 'PAUSED' ? 'Venue приостановлен' : 'Venue закрыт',
    explanation: 'Проверка Venue сейчас недоступна.',
    canVerify: false,
  };
}
