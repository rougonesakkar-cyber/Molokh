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
