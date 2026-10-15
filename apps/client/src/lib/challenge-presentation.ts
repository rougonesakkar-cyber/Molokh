import type {
  BookingTrainingRetentionContract,
  ChallengeContract,
} from '@molokh/contracts';

export function challengeStakeLabel(stake: ChallengeContract['stake']): string {
  if (stake === 'NONE') return 'Открытый поединок · титул не разыгрывается';
  if (stake === 'GENESIS_CONTENDER') {
    return 'Поединок за статус Претендента · Чемпион не меняется';
  }
  return 'Статусный поединок';
}

export function genesisSchedulingExplanation(
  responsePolicy: ChallengeContract['responsePolicy'],
): string | null {
  return responsePolicy === 'MUTUAL_GENESIS'
    ? 'GENESIS-пара закреплена. Для первой или повторной Session выберите слот здесь — новая заявка в FIFO не нужна.'
    : null;
}

export function statusQueueActionCopy(input: {
  readonly phase: 'FOUNDING_OPEN' | 'FOUNDING_CHALLENGE' | 'RUNNING'
    | 'CONTENDER_VACANT_OPEN' | 'CONTENDER_GENESIS' | 'CLOSED';
  readonly viewerStatus: 'ORDINARY' | 'CHAMPION' | 'CONTENDER';
}): { readonly title: string; readonly detail: string } {
  if (input.phase === 'FOUNDING_OPEN') {
    return {
      title: 'Бороться за статус',
      detail: 'Вы явно вступите в GENESIS. Ожидание не имеет скрытого срока и не считается обязательством.',
    };
  }
  if (input.phase === 'CONTENDER_VACANT_OPEN') {
    return {
      title: 'Бороться за статус',
      detail: 'Вы встанете в прозрачную очередь кандидатов на статус Претендента.',
    };
  }
  if (input.phase === 'RUNNING' && input.viewerStatus === 'CHAMPION') {
    return {
      title: 'Предложить титульный бой',
      detail: 'Предложение встанет в общую FIFO-очередь без привилегии №1. После активации Претендент сможет отказаться без поражения и Forfeit.',
    };
  }
  return {
    title: 'Встать в очередь',
    detail: 'Вызов текущему Претенденту активируется строго по FIFO, когда статусный слот освободится.',
  };
}

export function trainingRetentionActionCopy(
  cause: BookingTrainingRetentionContract['cause'],
): {
  readonly title: string;
  readonly detail: string;
  readonly confirmLabel: string;
  readonly declineLabel: string;
} {
  return {
    title: cause === 'COMPETITIVE_CONTEXT_INVALIDATED'
      ? 'Титульный контекст изменился'
      : 'Сохранить время как обычную тренировку?',
    detail: cause === 'COMPETITIVE_CONTEXT_INVALIDATED'
      ? 'Official Challenge закрыт без поражения: участники больше не являются текущими Champion и Contender. Слот станет Training только после согласия обоих спортсменов и Coach/зала.'
      : 'Official Challenge закрыт без поражения. Слот станет Training только после согласия обоих спортсменов и Coach/зала.',
    confirmLabel: 'Сохранить как тренировку',
    declineLabel: 'Отменить без санкций',
  };
}
