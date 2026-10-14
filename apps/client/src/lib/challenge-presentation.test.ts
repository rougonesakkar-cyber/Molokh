import { describe, expect, it } from 'vitest';

import { challengeStakeLabel } from './challenge-presentation';

describe('Challenge presentation', () => {
  it('[AC-073] clearly distinguishes a non-title OPEN Challenge', () => {
    expect(challengeStakeLabel('NONE')).toBe(
      'Открытый поединок · титул не разыгрывается',
    );
    expect(challengeStakeLabel('TITLE')).toBe('Статусный поединок');
  });

  it('[AC-103] explains that contender GENESIS does not put the Champion at stake', () => {
    expect(challengeStakeLabel('GENESIS_CONTENDER')).toBe(
      'Поединок за статус Претендента · Чемпион не меняется',
    );
  });
});
