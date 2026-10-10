export interface ResultCardPresentationInput {
  readonly outcomeCode: string;
  readonly winnerDisplayName: string | null;
  readonly viewerCanAppeal: boolean;
  readonly viewerCanWaiveAppeal: boolean;
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
