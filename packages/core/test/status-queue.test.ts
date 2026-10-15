import { describe, expect, it } from 'vitest';

import {
  StatusQueueConflictError,
  assertDirectStatusQueueHeadCanBeActivated,
  assertStatusQueueEntryCanBeReconfirmed,
  assertStatusQueueEntryCanBeSubmitted,
  assertStatusQueueEntryCanBeWithdrawn,
  assertStatusQueueReconfirmationCanBeRequested,
  assertStatusQueueReconfirmationCanExpire,
  assertGenesisResponseCanBeRecorded,
  assertGenesisChallengeCanExpire,
  assertSingleGenesisCandidateCanBePromoted,
  compareStatusQueueOrder,
  genesisResponseDeadline,
  genesisSingleCandidateDeadline,
  statusQueueReconfirmationDeadline,
} from '../src/status-queue.js';

const eligible = {
  accountActive: true,
  accountVerified: true,
  communityActive: true,
  membershipActive: true,
  sameAgeContour: true,
  competitionAvailability: 'ACTIVE',
  integrityHoldActive: false,
  competitionPhase: 'FOUNDING_OPEN',
  actorStatus: 'ORDINARY',
  contenderUserId: null,
  hasLiveEntry: false,
  pairCooldownActive: false,
  pairChallengeExists: false,
} as const;

describe('status queue policy', () => {
  it('AC-190 makes founding candidacy an explicit, durable GENESIS intent', () => {
    expect(assertStatusQueueEntryCanBeSubmitted(eligible)).toEqual({
      kind: 'GENESIS_CANDIDATE',
      targetStatus: 'CHAMPION',
      boundHolderUserId: null,
      directChallengeMode: null,
    });
  });

  it('[AC-045][AC-057] routes only an eligible Ordinary member toward the current Contender', () => {
    expect(assertStatusQueueEntryCanBeSubmitted({
      ...eligible,
      competitionPhase: 'RUNNING',
      contenderUserId: '0199a1b2-1234-7000-8000-000000000002',
    })).toEqual({
      kind: 'DIRECT_STATUS',
      targetStatus: 'CONTENDER',
      boundHolderUserId: '0199a1b2-1234-7000-8000-000000000002',
      directChallengeMode: 'MANDATORY_CONTENDER',
    });
    expect(() => assertStatusQueueEntryCanBeSubmitted({
      ...eligible,
      competitionPhase: 'RUNNING',
      contenderUserId: '0199a1b2-1234-7000-8000-000000000002',
      membershipActive: false,
    })).toThrowError('MEMBERSHIP_NOT_ACTIVE');
    expect(() => assertStatusQueueEntryCanBeSubmitted({
      ...eligible,
      competitionPhase: 'RUNNING',
      contenderUserId: '0199a1b2-1234-7000-8000-000000000002',
      pairCooldownActive: true,
    })).toThrowError('PAIR_COOLDOWN_ACTIVE');
  });

  it('AC-090 breaks an identical server-time tie deterministically by entry id', () => {
    const entries = [
      { submittedAt: '2026-09-26T12:00:00.000Z', queueEntryId: '0199a1b2-1234-7000-8000-000000000020' },
      { submittedAt: '2026-09-26T12:00:00.000Z', queueEntryId: '0199a1b2-1234-7000-8000-000000000010' },
    ];
    expect([...entries].sort(compareStatusQueueOrder).map((entry) => entry.queueEntryId)).toEqual([
      '0199a1b2-1234-7000-8000-000000000010',
      '0199a1b2-1234-7000-8000-000000000020',
    ]);
  });

  it('AC-091 permits only the owner to withdraw a WAITING entry', () => {
    expect(() => assertStatusQueueEntryCanBeWithdrawn({
      actorUserId: 'athlete-a',
      initiatorUserId: 'athlete-a',
      state: 'WAITING',
    })).not.toThrow();
    expect(() => assertStatusQueueEntryCanBeWithdrawn({
      actorUserId: 'athlete-b',
      initiatorUserId: 'athlete-a',
      state: 'WAITING',
    })).toThrowError(StatusQueueConflictError);
  });

  it('[AC-047] lets Champion offer an optional TITLE only through the ordinary FIFO', () => {
    expect(assertStatusQueueEntryCanBeSubmitted({
      ...eligible,
      competitionPhase: 'RUNNING',
      contenderUserId: '0199a1b2-1234-7000-8000-000000000002',
      actorStatus: 'CHAMPION',
    })).toEqual({
      kind: 'DIRECT_STATUS',
      targetStatus: 'CONTENDER',
      boundHolderUserId: '0199a1b2-1234-7000-8000-000000000002',
      directChallengeMode: 'OPTIONAL_TITLE',
    });
    expect(() => assertStatusQueueEntryCanBeSubmitted({
      ...eligible,
      competitionPhase: 'RUNNING',
      contenderUserId: '0199a1b2-1234-7000-8000-000000000002',
      actorStatus: 'CONTENDER',
    })).toThrowError('ALREADY_STATUS_HOLDER');
    expect(() => assertStatusQueueEntryCanBeSubmitted({
      ...eligible,
      hasLiveEntry: true,
    })).toThrowError('LIVE_QUEUE_ENTRY_EXISTS');
    expect(() => assertStatusQueueEntryCanBeSubmitted({
      ...eligible,
      competitionPhase: 'RUNNING',
      contenderUserId: '0199a1b2-1234-7000-8000-000000000002',
      actorStatus: 'CHAMPION',
      pairChallengeExists: true,
    })).toThrowError('PAIR_CHALLENGE_EXISTS');
  });

  it('[AC-048][AC-092] activates only the strict FIFO head against the still-current Contender', () => {
    const activation = {
      state: 'WAITING' as const,
      kind: 'DIRECT_STATUS' as const,
      strictHead: true,
      competitionPhase: 'RUNNING' as const,
      statusSlotFree: true,
      boundHolderUserId: 'contender-a',
      currentContenderUserId: 'contender-a',
    };
    expect(() => assertDirectStatusQueueHeadCanBeActivated(activation)).not.toThrow();
    expect(() => assertDirectStatusQueueHeadCanBeActivated({
      ...activation,
      strictHead: false,
    })).toThrowError('QUEUE_ENTRY_NOT_HEAD');
    expect(() => assertDirectStatusQueueHeadCanBeActivated({
      ...activation,
      statusSlotFree: false,
    })).toThrowError('STATUS_SLOT_OCCUPIED');
    expect(() => assertDirectStatusQueueHeadCanBeActivated({
      ...activation,
      currentContenderUserId: 'contender-b',
    })).toThrowError('BOUND_HOLDER_CHANGED');
  });

  it('[AC-095][AC-096][AC-097][AC-098] preserves FIFO and invalidates a former Contender TITLE intent', () => {
    const requestedAt = new Date('2026-09-28T12:00:00.000Z');
    const deadline = statusQueueReconfirmationDeadline(requestedAt);
    expect(deadline.toISOString()).toBe('2026-09-29T12:00:00.000Z');
    expect(assertStatusQueueReconfirmationCanBeRequested({
      state: 'WAITING',
      kind: 'DIRECT_STATUS',
      targetStatus: 'CONTENDER',
      initiatorUserId: 'challenger',
      boundHolderUserId: 'contender-a',
      currentContenderUserId: 'contender-b',
    })).toBe('REQUEST_RECONFIRMATION');
    expect(assertStatusQueueReconfirmationCanBeRequested({
      state: 'WAITING',
      kind: 'DIRECT_STATUS',
      targetStatus: 'CHAMPION',
      initiatorUserId: 'contender-a',
      boundHolderUserId: 'champion',
      currentContenderUserId: 'contender-b',
    })).toBe('INVALIDATE_FORMER_CONTENDER_TITLE_INTENT');
    expect(() => assertStatusQueueReconfirmationCanBeRequested({
      state: 'WAITING',
      kind: 'DIRECT_STATUS',
      targetStatus: 'CHAMPION',
      initiatorUserId: 'contender-b',
      boundHolderUserId: 'champion',
      currentContenderUserId: 'contender-b',
    })).toThrowError('QUEUE_RECONFIRMATION_NOT_REQUIRED');
    const reconfirmation = {
      state: 'RECONFIRMATION_REQUIRED' as const,
      actorUserId: 'challenger',
      initiatorUserId: 'challenger',
      boundHolderUserId: 'contender-b',
      currentContenderUserId: 'contender-b',
      reconfirmationDeadlineAt: deadline,
      occurredAt: new Date('2026-09-29T11:59:59.999Z'),
    };
    expect(() => assertStatusQueueEntryCanBeReconfirmed(reconfirmation)).not.toThrow();
    expect(() => assertStatusQueueEntryCanBeReconfirmed({
      ...reconfirmation,
      occurredAt: deadline,
    })).toThrowError('QUEUE_RECONFIRMATION_EXPIRED');
    expect(() => assertStatusQueueReconfirmationCanExpire({
      state: 'RECONFIRMATION_REQUIRED',
      reconfirmationDeadlineAt: deadline,
      occurredAt: deadline,
    })).not.toThrow();
    expect(() => assertStatusQueueEntryCanBeWithdrawn({
      actorUserId: 'challenger',
      initiatorUserId: 'challenger',
      state: 'RECONFIRMATION_REQUIRED',
    })).not.toThrow();
  });

  it('AC-099 gives a GENESIS pair exactly 48 hours for mutual consent', () => {
    expect(genesisResponseDeadline(new Date('2026-09-26T12:00:00.000Z')).toISOString())
      .toBe('2026-09-28T12:00:00.000Z');
    expect(() => assertGenesisResponseCanBeRecorded({
      state: 'AWAITING_RESPONSE',
      actorIsParticipant: true,
      responseDeadlineAt: new Date('2026-09-28T12:00:00.000Z'),
      occurredAt: new Date('2026-09-28T11:59:59.999Z'),
      existingDecision: null,
    })).not.toThrow();
  });

  it('AC-191 rejects duplicate and late GENESIS responses', () => {
    expect(() => assertGenesisResponseCanBeRecorded({
      state: 'AWAITING_RESPONSE',
      actorIsParticipant: true,
      responseDeadlineAt: new Date('2026-09-28T12:00:00.000Z'),
      occurredAt: new Date('2026-09-27T12:00:00.000Z'),
      existingDecision: 'ACCEPT',
    })).toThrowError('GENESIS_RESPONSE_ALREADY_RECORDED');
    expect(() => assertGenesisResponseCanBeRecorded({
      state: 'AWAITING_RESPONSE',
      actorIsParticipant: true,
      responseDeadlineAt: new Date('2026-09-28T12:00:00.000Z'),
      occurredAt: new Date('2026-09-28T12:00:00.000Z'),
      existingDecision: null,
    })).toThrowError('GENESIS_RESPONSE_EXPIRED');
  });

  it('expires GENESIS only when its 48-hour response window is due', () => {
    expect(() => assertGenesisChallengeCanExpire({
      state: 'AWAITING_RESPONSE',
      responseDeadlineAt: new Date('2026-09-28T12:00:00.000Z'),
      occurredAt: new Date('2026-09-28T11:59:59.999Z'),
    })).toThrowError('GENESIS_RESPONSE_NOT_DUE');
    expect(() => assertGenesisChallengeCanExpire({
      state: 'AWAITING_RESPONSE',
      responseDeadlineAt: new Date('2026-09-28T12:00:00.000Z'),
      occurredAt: new Date('2026-09-28T12:00:00.000Z'),
    })).not.toThrow();
  });

  it('[AC-093][AC-094][AC-102][AC-104] promotes one unchanged GENESIS candidate only after three days', () => {
    const singleSinceAt = new Date('2026-09-28T12:00:00.000Z');
    const deadline = genesisSingleCandidateDeadline(singleSinceAt);
    expect(deadline.toISOString()).toBe('2026-10-01T12:00:00.000Z');
    const candidate = {
      state: 'WAITING' as const,
      kind: 'GENESIS_CANDIDATE' as const,
      isOnlyCandidate: true,
      singleCandidateSinceAt: singleSinceAt,
      occurredAt: new Date('2026-10-01T11:59:59.999Z'),
    };
    expect(() => assertSingleGenesisCandidateCanBePromoted(candidate))
      .toThrowError('GENESIS_SINGLE_PROMOTION_NOT_DUE');
    expect(() => assertSingleGenesisCandidateCanBePromoted({
      ...candidate,
      occurredAt: deadline,
    })).not.toThrow();
    expect(() => assertSingleGenesisCandidateCanBePromoted({
      ...candidate,
      isOnlyCandidate: false,
      occurredAt: deadline,
    })).toThrowError('GENESIS_SINGLE_CANDIDATE_CHANGED');
  });
});
