import type { ResultContract, SessionLifecycleContract } from '@molokh/contracts';

export function canRecordOfficialResult(
  session: Pick<SessionLifecycleContract,
    'state' | 'purpose' | 'viewerCanRecordResult' | 'challengeState'>,
  hasResult: boolean,
): boolean {
  return session.state === 'ENDED'
    && session.purpose === 'OFFICIAL_CHALLENGE'
    && session.viewerCanRecordResult
    && session.challengeState === 'RESULT_PENDING'
    && !hasResult;
}

export function sessionResultNotice(
  session: Pick<SessionLifecycleContract, 'state' | 'purpose' | 'resultId' | 'challengeState'>,
  result: Pick<ResultContract, 'state'> | null,
  loading: boolean,
): { readonly message: string; readonly retry: boolean } | null {
  if (session.state !== 'ENDED' || session.purpose !== 'OFFICIAL_CHALLENGE') return null;
  if (result) {
    const messages: Record<ResultContract['state'], string> = {
      RECORDED: 'Результат записан и остаётся предварительным до завершения окна Appeal.',
      UNDER_APPEAL: 'Результат находится на рассмотрении Appeal. Решение появится в карточке.',
      FINAL: 'Официальный результат окончательный.',
      REVERSED: 'Результат пересмотрен. Показан эффективный исход; исходная запись сохранена.',
      ANNULLED: 'Результат аннулирован. Исходная запись сохранена.',
      REPEAT_ORDERED: 'Назначена повторная Session. Исходная запись сохранена.',
    };
    return { message: messages[result.state], retry: false };
  }
  if (session.resultId) {
    return loading
      ? { message: 'Загружаем официальный Result…', retry: false }
      : { message: 'Не удалось загрузить официальный Result. Повторите загрузку.', retry: true };
  }
  return session.challengeState === 'RESULT_PENDING'
    ? {
        message: 'Session завершена. Теперь Coach должен подтвердить официальный результат.',
        retry: false,
      }
    : null;
}

export function resultActionNotice(
  action: 'appeal' | 'waive-appeal',
  state: ResultContract['state'],
): string {
  return action === 'appeal'
    ? 'Appeal отправлен Central. Результат находится на рассмотрении.'
    : state === 'FINAL'
      ? 'Результат финализирован досрочно.'
      : 'Отказ от Appeal сохранён. Финализация произойдёт после решения второго участника или окончания окна.';
}

export interface ResultCardPresentationInput {
  readonly outcomeCode: string;
  readonly winnerDisplayName: string | null;
  readonly viewerCanAppeal: boolean;
  readonly viewerCanWaiveAppeal: boolean;
}

export type AthleteStoppageCause = 'INJURY' | 'VOLUNTARY_WITHDRAWAL';

export type ExternalNoContestCause = 'EQUIPMENT' | 'SAFETY' | 'VENUE';

export function athleteStoppageResult(
  stoppedAthleteIndex: 0 | 1,
  cause: AthleteStoppageCause,
): {
  readonly outcomeCode: 'WIN_A' | 'WIN_B';
  readonly methodCode: 'INJURY_STOPPAGE' | 'VOLUNTARY_WITHDRAWAL';
} {
  return {
    outcomeCode: stoppedAthleteIndex === 0 ? 'WIN_B' : 'WIN_A',
    methodCode: cause === 'INJURY' ? 'INJURY_STOPPAGE' : 'VOLUNTARY_WITHDRAWAL',
  };
}

export function externalNoContestResult(cause: ExternalNoContestCause): {
  readonly reasonCode:
    | 'EXTERNAL_EQUIPMENT_FAILURE'
    | 'EXTERNAL_SAFETY_FAILURE'
    | 'EXTERNAL_VENUE_FAILURE';
  readonly label: string;
  readonly comment: string;
} {
  if (cause === 'EQUIPMENT') return {
    reasonCode: 'EXTERNAL_EQUIPMENT_FAILURE',
    label: 'Проблема оборудования',
    comment: 'Внешняя проблема оборудования не позволила завершить Session.',
  };
  if (cause === 'SAFETY') return {
    reasonCode: 'EXTERNAL_SAFETY_FAILURE',
    label: 'Угроза безопасности',
    comment: 'Внешняя причина безопасности не позволила завершить Session.',
  };
  return {
    reasonCode: 'EXTERNAL_VENUE_FAILURE',
    label: 'Проблема площадки',
    comment: 'Внешняя проблема Venue не позволила завершить Session.',
  };
}

export function resultCardPresentation(input: ResultCardPresentationInput): {
  readonly summary: string;
  readonly showAppealAction: boolean;
  readonly showWaiverAction: boolean;
} {
  return {
    summary: input.winnerDisplayName
      ? `Победитель: ${input.winnerDisplayName}`
      : input.outcomeCode === 'DRAW'
        ? 'Ничья'
        : 'Без засчитываемого результата',
    showAppealAction: input.viewerCanAppeal,
    showWaiverAction: input.viewerCanWaiveAppeal,
  };
}
