import { describe, expect, it } from 'vitest';

import {
  athleteStoppageResult,
  canRecordOfficialResult,
  externalNoContestResult,
  resultCardPresentation,
  resultActionNotice,
  sessionResultNotice,
} from './result-presentation';

describe('Result card presentation', () => {
  const endedSession = {
    state: 'ENDED', purpose: 'OFFICIAL_CHALLENGE', resultId: 'recorded-result',
    challengeState: 'RESULT_RECORDED',
  } as const;

  it('only asks Coach to record a genuinely missing Result', () => {
    expect(sessionResultNotice({ ...endedSession, resultId: null, challengeState: 'RESULT_PENDING' }, null, false))
      .toEqual({ message: 'Session завершена. Теперь Coach должен подтвердить официальный результат.', retry: false });
    expect(sessionResultNotice(endedSession, { state: 'RECORDED' }, false))
      .toEqual({ message: 'Результат записан и остаётся предварительным до завершения окна Appeal.', retry: false });
    expect(sessionResultNotice(endedSession, { state: 'UNDER_APPEAL' }, false))
      .toEqual({ message: 'Результат находится на рассмотрении Appeal. Решение появится в карточке.', retry: false });
    expect(sessionResultNotice(endedSession, { state: 'FINAL' }, false))
      .toEqual({ message: 'Официальный результат окончательный.', retry: false });
  });

  it('separates a loading Result from a failed read without suggesting a new record', () => {
    expect(sessionResultNotice(endedSession, null, true))
      .toEqual({ message: 'Загружаем официальный Result…', retry: false });
    expect(sessionResultNotice(endedSession, null, false))
      .toEqual({ message: 'Не удалось загрузить официальный Result. Повторите загрузку.', retry: true });
    expect(sessionResultNotice({ ...endedSession, state: 'IN_PROGRESS' }, null, false)).toBeNull();
    expect(sessionResultNotice({ ...endedSession, purpose: 'TRAINING' }, null, false)).toBeNull();
  });

  it('does not infer a current Competition lock or other restrictions from an Appeal or waiver', () => {
    expect(resultActionNotice('appeal', 'UNDER_APPEAL'))
      .toBe('Appeal отправлен Central. Результат находится на рассмотрении.');
    expect(resultActionNotice('waive-appeal', 'FINAL')).toBe('Результат финализирован досрочно.');
  });

  it('opens Result entry immediately from the ended command projection', () => {
    const session = {
      state: 'IN_PROGRESS', purpose: 'OFFICIAL_CHALLENGE',
      viewerCanRecordResult: true, challengeState: 'IN_SESSION',
    } as const;
    expect(canRecordOfficialResult(session, false)).toBe(false);
    const ended = { ...session, state: 'ENDED', challengeState: 'RESULT_PENDING' } as const;
    expect(canRecordOfficialResult(ended, false)).toBe(true);
    expect(canRecordOfficialResult({ ...ended, viewerCanRecordResult: false }, false)).toBe(false);
    expect(canRecordOfficialResult({ ...ended, challengeState: 'IN_SESSION' }, false)).toBe(false);
    expect(canRecordOfficialResult(ended, true)).toBe(false);
  });

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

  it('[AC-100] shows a decisive provisional Result with its server Appeal actions', () => {
    expect(resultCardPresentation({
      outcomeCode: 'WIN_B', winnerDisplayName: 'Марина Ринг',
      viewerCanAppeal: true, viewerCanWaiveAppeal: true,
    })).toEqual({
      summary: 'Победитель: Марина Ринг',
      showAppealAction: true,
      showWaiverAction: true,
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
