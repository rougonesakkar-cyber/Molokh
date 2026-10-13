export interface ResultCardPresentationInput {
  readonly outcomeCode: string;
  readonly winnerDisplayName: string | null;
  readonly viewerCanAppeal: boolean;
  readonly viewerCanWaiveAppeal: boolean;
}

export type AthleteStoppageCause = 'INJURY' | 'VOLUNTARY_WITHDRAWAL';

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
