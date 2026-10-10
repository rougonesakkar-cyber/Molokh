export interface ResultMetadataRevisionPresentation {
  readonly actionLabel: string;
  readonly explanation: string;
}

export function resultMetadataRevisionPresentation(input: {
  readonly currentRole: string;
  readonly viewerCanReviseMetadata: boolean;
}): ResultMetadataRevisionPresentation | null {
  if (input.currentRole !== 'Coach' || !input.viewerCanReviseMetadata) return null;
  return {
    actionLabel: 'Исправить описание счёта',
    explanation: 'Изменятся только счёт и описание метода. Победитель, исход и статус не изменятся.',
  };
}
