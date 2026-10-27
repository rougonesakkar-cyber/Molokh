const exactMessageLabels: Readonly<Record<string, string>> = {
  'booking.confirmed': 'Тренировка подтверждена залом',
  'booking.host-confirmation-required': 'Зал должен подтвердить выбранный слот',
  'booking.host-rejected': 'Зал предложил выбрать другое время',
  'booking.slot-selected-by-partner': 'Партнёр выбрал слот',
  'booking.slot-unavailable': 'Выбранный слот больше недоступен',
  'challenge.created': 'Официальный вызов отправлен',
  'challenge.response_required': 'Нужно ответить на официальный вызов',
  'group-plan.proposed-by-partner': 'Партнёр предложил групповую тренировку',
  'moderation.report-submitted': 'Жалоба отправлена команде Molokh',
  'result.final': 'Официальный результат вступил в силу',
  'result.recorded-provisional': 'Coach подтвердил предварительный результат',
  'youth-consent.requested': 'Запрошено согласие представителя',
};

const prefixLabels: ReadonlyArray<readonly [string, string]> = [
  ['booking.', 'Обновление тренировки'],
  ['challenge.', 'Обновление Official Challenge'],
  ['group-plan.', 'Обновление групповой тренировки'],
  ['result.', 'Обновление официального результата'],
  ['appeal.', 'Обновление Appeal'],
  ['status.', 'Обновление статуса Community'],
  ['community.', 'Обновление Community'],
  ['membership.', 'Обновление Membership'],
  ['session.', 'Обновление Session'],
  ['safety.', 'Обновление безопасности'],
  ['youth-consent.', 'Обновление согласия представителя'],
];

export function chatMessageLabel(renderKey: string): string {
  const exact = exactMessageLabels[renderKey];
  if (exact) return exact;
  return prefixLabels.find(([prefix]) => renderKey.startsWith(prefix))?.[1]
    ?? 'Событие обновлено';
}

const challengeStateLabels: Readonly<Record<string, string>> = {
  COMPLETED: 'Challenge завершён',
  DECLINED: 'Вызов отклонён без поражения',
  WITHDRAWN: 'Вызов отозван',
  CANCELLED_NO_FAULT: 'Challenge отменён без поражения',
  EXPIRED_NO_FAULT: 'Срок ответа завершился без поражения',
  RESULT_RECORDED: 'Результат подтверждён Coach',
};

export function challengeStateLabel(state: string): string {
  return challengeStateLabels[state] ?? 'Состояние Challenge обновилось';
}

const guardianConsentStateLabels: Readonly<Record<string, string>> = {
  NOT_REQUESTED: 'Ещё не запрошено',
  REQUESTED: 'Ожидает решения представителя',
  GRANTED: 'Согласие получено',
  REVOKED: 'Согласие отозвано',
  EXPIRED: 'Срок ссылки истёк',
};

export function guardianConsentStateLabel(state: string): string {
  return guardianConsentStateLabels[state] ?? 'Состояние согласия обновилось';
}
