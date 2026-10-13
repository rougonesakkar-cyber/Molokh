import { describe, expect, it } from 'vitest';

import {
  athleteStoppageResult,
  externalNoContestResult,
  resultCardPresentation,
} from './result-presentation';

describe('Result card presentation', () => {
  it('[AC-112] presents DRAW neutrally and follows the server Appeal capability', () => {
    expect(resultCardPresentation({
      outcomeCode: 'DRAW', winnerDisplayName: null,
      viewerCanAppeal: true, viewerCanWaiveAppeal: true,
    })).toEqual({ summary: 'Ничья', showAppealAction: true, showWaiverAction: true });
    expect(resultCardPresentation({
      outcomeCode: 'DRAW', winnerDisplayName: null,
      viewerCanAppeal: false, viewerCanWaiveAppeal: false,
    })).toEqual({ summary: 'Ничья', showAppealAction: false, showWaiverAction: false });
  });

  it('[AC-122] hides both Appeal actions after an irreversible waiver', () => {
    expect(resultCardPresentation({
      outcomeCode: 'WIN_A', winnerDisplayName: 'Марина Ринг',
      viewerCanAppeal: false, viewerCanWaiveAppeal: false,
    })).toEqual({
      summary: 'Победитель: Марина Ринг',
      showAppealAction: false,
      showWaiverAction: false,
    });
  });

  it('[AC-209] maps the stopped Athlete to the peer winner and a normalized method', () => {
    expect(athleteStoppageResult(0, 'INJURY')).toEqual({
      outcomeCode: 'WIN_B', methodCode: 'INJURY_STOPPAGE',
    });
    expect(athleteStoppageResult(1, 'VOLUNTARY_WITHDRAWAL')).toEqual({
      outcomeCode: 'WIN_A', methodCode: 'VOLUNTARY_WITHDRAWAL',
    });
  });

  it('[AC-210] maps external causes to explicit no-fault reason codes', () => {
    expect(externalNoContestResult('EQUIPMENT')).toMatchObject({
      reasonCode: 'EXTERNAL_EQUIPMENT_FAILURE', label: 'Проблема оборудования',
    });
    expect(externalNoContestResult('SAFETY')).toMatchObject({
      reasonCode: 'EXTERNAL_SAFETY_FAILURE', label: 'Угроза безопасности',
    });
    expect(externalNoContestResult('VENUE')).toMatchObject({
      reasonCode: 'EXTERNAL_VENUE_FAILURE', label: 'Проблема площадки',
    });
  });
});
