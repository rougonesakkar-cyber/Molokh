import { describe, expect, it } from 'vitest';

import { resultMetadataRevisionPresentation } from './presentation';

describe('Result metadata revision presentation', () => {
  it('[AC-078] separates a time-limited Coach metadata revision from outcome correction', () => {
    expect(resultMetadataRevisionPresentation({
      currentRole: 'Coach', viewerCanReviseMetadata: true,
    })).toEqual({
      actionLabel: 'Исправить описание счёта',
      explanation: 'Изменятся только счёт и описание метода. Победитель, исход и статус не изменятся.',
    });
    expect(resultMetadataRevisionPresentation({
      currentRole: 'Athlete', viewerCanReviseMetadata: true,
    })).toBeNull();
    expect(resultMetadataRevisionPresentation({
      currentRole: 'Coach', viewerCanReviseMetadata: false,
    })).toBeNull();
  });
});
