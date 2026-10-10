import { describe, expect, it } from 'vitest';

import { resultCardPresentation } from './result-presentation';

describe('Result card presentation', () => {
  it('[AC-112] presents DRAW neutrally and follows the server Appeal capability', () => {
    expect(resultCardPresentation({
      outcomeCode: 'DRAW', winnerDisplayName: null, viewerCanAppeal: true,
    })).toEqual({ summary: 'Ничья', showAppealAction: true });
    expect(resultCardPresentation({
      outcomeCode: 'DRAW', winnerDisplayName: null, viewerCanAppeal: false,
    })).toEqual({ summary: 'Ничья', showAppealAction: false });
  });
});
