import type { ChallengeContract } from '@molokh/contracts';

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
