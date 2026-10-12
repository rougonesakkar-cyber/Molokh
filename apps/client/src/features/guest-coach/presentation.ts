export interface GuestCoachPresentation {
  readonly title: string;
  readonly explanation: string;
  readonly canAuthorize: boolean;
}

export function guestCoachPresentation(input: {
  readonly currentRole: string;
  readonly viewerCanAuthorizeGuestCoach: boolean;
  readonly guestCoachGrantState: 'ACTIVE' | 'EXPIRED' | null;
}): GuestCoachPresentation | null {
  const operator = input.currentRole === 'Gym Admin' || input.currentRole === 'Central';
  if (!operator && input.guestCoachGrantState === null) return null;
  return {
    title: input.guestCoachGrantState === 'ACTIVE'
      ? 'Guest Coach авторизован'
      : input.guestCoachGrantState === 'EXPIRED'
        ? 'Доступ Guest Coach завершён'
        : 'Авторизовать Guest Coach',
    explanation: input.guestCoachGrantState === 'ACTIVE'
      ? 'Доступ действует только для этой Session и завершится после её отмены или финального Result.'
      : input.guestCoachGrantState === 'EXPIRED'
        ? 'История назначения сохранена. Этот grant больше не даёт Coach-полномочий.'
        : 'Назначенный Coach получит полномочия только для этой Session, без доступа ко всему Community.',
    canAuthorize: operator && input.viewerCanAuthorizeGuestCoach,
  };
}
