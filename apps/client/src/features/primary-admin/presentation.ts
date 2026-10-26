export type PrimaryAdminViewerRole = 'Primary Admin' | 'Gym Admin' | 'Central';
export type PrimaryAdminSuccessorState = 'NONE' | 'PENDING' | 'APPROVED';

export function primaryAdminSuccessorPresentation(input: {
  readonly viewerRole: PrimaryAdminViewerRole;
  readonly state: PrimaryAdminSuccessorState;
}) {
  const pending = input.state === 'PENDING';
  return {
    canPropose: input.viewerRole === 'Primary Admin' && input.state === 'NONE',
    canApprove: input.viewerRole === 'Central' && pending,
    stateLabel: input.state === 'NONE'
      ? 'Преемник не предложен'
      : input.state === 'PENDING'
        ? 'Ожидает одобрения Central'
        : 'Передача подтверждена',
    explanation: pending
      ? 'До одобрения Central роли и возможности администраторов не меняются.'
      : input.state === 'APPROVED'
        ? 'Central подтвердил передачу роли Primary Admin.'
        : 'Текущий Primary Admin может предложить активного администратора этого Venue.',
  };
}
