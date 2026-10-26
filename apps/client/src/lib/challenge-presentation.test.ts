import { describe, expect, it } from 'vitest';

import {
  challengeStakeLabel,
  challengeCreateDenialCopy,
  genesisSchedulingExplanation,
  statusQueueActionCopy,
  trainingRetentionActionCopy,
} from './challenge-presentation';

describe('Challenge presentation', () => {
  it('[AC-073] clearly distinguishes a non-title OPEN Challenge', () => {
    expect(challengeStakeLabel('NONE')).toBe(
      'Открытый поединок · титул не разыгрывается',
    );
    expect(challengeStakeLabel('TITLE')).toBe('Статусный поединок');
  });

  it('[AC-103] explains that contender GENESIS does not put the Champion at stake', () => {
    expect(challengeStakeLabel('GENESIS_CONTENDER')).toBe(
      'Поединок за статус Претендента · Чемпион не меняется',
    );
  });

  it('[AC-105] explains that a GENESIS repeat keeps the same pair and skips FIFO', () => {
    expect(genesisSchedulingExplanation('MUTUAL_GENESIS')).toContain(
      'повторной Session',
    );
    expect(genesisSchedulingExplanation('OPTIONAL')).toBeNull();
  });

  it('[AC-047] explains Champion FIFO order and no-fault optional response', () => {
    const copy = statusQueueActionCopy({ phase: 'RUNNING', viewerStatus: 'CHAMPION' });
    expect(copy.title).toBe('Предложить титульный бой');
    expect(copy.detail).toContain('FIFO-очередь без привилегии');
    expect(copy.detail).toContain('без поражения и Forfeit');
  });

  it('[AC-187] explains the neutral optional throttle and pair retry time', () => {
    expect(challengeCreateDenialCopy('OPTIONAL_INVITE_LIMIT', null)).toContain(
      'три optional-приглашения без ответа',
    );
    expect(challengeCreateDenialCopy(
      'OPTIONAL_PAIR_QUIET',
      '2026-10-24T10:00:00.000Z',
    )).toContain('Новый вызов доступен после');
  });

  it('[AC-072] explains the explicit no-fault Booking choice after TITLE invalidation', () => {
    const copy = trainingRetentionActionCopy('COMPETITIVE_CONTEXT_INVALIDATED');
    expect(copy.title).toContain('Титульный контекст');
    expect(copy.detail).toContain('только после согласия');
    expect(copy.confirmLabel).toBe('Сохранить как тренировку');
    expect(copy.declineLabel).toBe('Отменить без санкций');
  });
});
