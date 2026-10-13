import type { ChallengeContract } from '@molokh/contracts';

export function challengeStakeLabel(stake: ChallengeContract['stake']): string {
  return stake === 'NONE'
    ? 'Открытый поединок · титул не разыгрывается'
    : 'Статусный поединок';
}
