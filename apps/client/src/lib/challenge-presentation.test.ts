import { describe, expect, it } from 'vitest';

import { challengeStakeLabel } from './challenge-presentation';

describe('Challenge presentation', () => {
  it('[AC-073] clearly distinguishes a non-title OPEN Challenge', () => {
    expect(challengeStakeLabel('NONE')).toBe(
      'Открытый поединок · титул не разыгрывается',
    );
    expect(challengeStakeLabel('TITLE')).toBe('Статусный поединок');
  });
});
