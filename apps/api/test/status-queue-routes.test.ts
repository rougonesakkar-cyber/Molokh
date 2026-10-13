import type {
  CompetitionStatusProjection,
  GenesisResponseProjection,
  StatusQueueEntryProjection,
} from '@molokh/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { StaticBearerAuthAdapter } from '../src/auth.js';

const token = 'status-queue-token';
const userId = '0199a1b2-1234-7000-8000-000000000101';
const competitionId = '0199a1b2-1234-7000-8000-000000000901';
const queueEntryId = '0199a1b2-1234-7000-8000-000000000902';

const entry: StatusQueueEntryProjection = {
  queueEntryId,
  competitionId,
  initiatorUserId: userId,
  initiatorDisplayName: 'Локальный атлет',
  targetStatus: 'CHAMPION',
  kind: 'GENESIS_CANDIDATE',
  state: 'WAITING',
  boundHolderUserId: null,
  submittedAt: '2026-09-26T12:00:00.000Z',
  reconfirmationDeadlineAt: null,
  singleCandidateDeadlineAt: null,
  position: 1,
  isViewerEntry: true,
  version: 1,
};

const competition: CompetitionStatusProjection = {
  competitionId,
  phase: 'FOUNDING_OPEN',
  availability: 'ACTIVE',
  champion: null,
  contender: null,
  statusVersion: 0,
  viewerStatus: 'ORDINARY',
  visibility: 'FULL',
  queueSize: 1,
  queue: [entry],
  activeChallenge: null,
  viewerGenesisAction: null,
  viewerQueueEntryId: queueEntryId,
  canJoinQueue: false,
  joinDenialCode: 'LIVE_QUEUE_ENTRY_EXISTS',
  policyVersion: 'status-queue-mvp-v1',
};

describe('status queue routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('[AC-092][AC-178] exposes the ordered member projection and idempotent queue commands', async () => {
    const readCompetitionStatus = vi.fn().mockResolvedValue(competition);
    const submitEntry = vi.fn().mockResolvedValue({
      responseStatus: 201,
      response: entry,
      eventId: '0199a1b2-1234-7000-8000-000000000903',
      aggregateVersion: 1,
      replayed: false,
    });
    const withdrawEntry = vi.fn().mockResolvedValue({
      responseStatus: 200,
      response: { ...entry, state: 'WITHDRAWN', position: null, version: 2 },
      eventId: '0199a1b2-1234-7000-8000-000000000904',
      aggregateVersion: 2,
      replayed: false,
    });
    const reconfirmEntry = vi.fn().mockResolvedValue({
      responseStatus: 200,
      response: {
        ...entry,
        targetStatus: 'CONTENDER',
        kind: 'DIRECT_STATUS',
        boundHolderUserId: '0199a1b2-1234-7000-8000-000000000908',
        version: 3,
      },
      eventId: '0199a1b2-1234-7000-8000-000000000909',
      aggregateVersion: 3,
      replayed: false,
    });
    const respondToGenesis = vi.fn();
    const genesisResponse: GenesisResponseProjection = {
      challengeId: '0199a1b2-1234-7000-8000-000000000905',
      competitionId,
      serviceChatId: '0199a1b2-1234-7000-8000-000000000906',
      state: 'AWAITING_RESPONSE',
      opponentDisplayName: 'Атлет Б',
      responseDeadlineAt: '2026-09-28T12:00:00.000Z',
      rulesetRef: 'pilot-rules-v1',
      rulesetAckMode: 'EXPLICIT_ACK_REQUIRED',
      viewerDecision: 'ACCEPT',
      acceptedCount: 1,
      canAccept: false,
      canDecline: false,
      version: 2,
    };
    respondToGenesis.mockResolvedValue({
      responseStatus: 200,
      response: genesisResponse,
      eventId: '0199a1b2-1234-7000-8000-000000000907',
      aggregateVersion: 2,
      replayed: false,
    });
    const app = await buildApp({
      statusQueue: {
        auth: new StaticBearerAuthAdapter(token, userId),
        competitionId,
        readCompetitionStatus,
        submitEntry,
        withdrawEntry,
        reconfirmEntry,
        respondToGenesis,
      },
    });
    apps.push(app);

    const read = await app.inject({
      method: 'GET',
      url: '/api/v1/me/competition',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({
      data: {
        phase: 'FOUNDING_OPEN',
        visibility: 'FULL',
        queue: [{ position: 1, initiatorDisplayName: 'Локальный атлет' }],
      },
    });

    const submit = await app.inject({
      method: 'POST',
      url: `/api/v1/competitions/${competitionId}/queue-entries`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'status-queue-submit-1',
        'if-match': '0',
      },
    });
    expect(submit.statusCode).toBe(201);
    expect(submitEntry).toHaveBeenCalledOnce();
    expect(submit.json()).toMatchObject({ data: { state: 'WAITING', position: 1 } });
    expect(submit.json().data).not.toHaveProperty('responseDeadlineAt');

    const withdraw = await app.inject({
      method: 'POST',
      url: `/api/v1/queue-entries/${queueEntryId}/withdraw`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'status-queue-withdraw-1',
        'if-match': '1',
      },
    });
    expect(withdraw.statusCode).toBe(200);
    expect(withdrawEntry).toHaveBeenCalledOnce();
    expect(withdraw.json()).toMatchObject({ data: { state: 'WITHDRAWN', position: null } });

    const reconfirm = await app.inject({
      method: 'POST',
      url: `/api/v1/queue-entries/${queueEntryId}/reconfirm`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'status-queue-reconfirm-1',
        'if-match': '2',
      },
    });
    expect(reconfirm.statusCode).toBe(200);
    expect(reconfirmEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        commandType: 'RECONFIRM_STATUS_QUEUE_ENTRY',
        aggregateId: queueEntryId,
        expectedVersion: 2,
      }),
      expect.any(Object),
    );

    const acceptGenesis = await app.inject({
      method: 'POST',
      url: `/api/v1/genesis-challenges/${genesisResponse.challengeId}/accept`,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': 'genesis-accept-1',
        'if-match': '1',
      },
      payload: { explicitRulesetAcknowledged: true },
    });
    expect(acceptGenesis.statusCode).toBe(200);
    expect(respondToGenesis).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateType: 'Challenge',
        aggregateId: genesisResponse.challengeId,
        expectedVersion: 1,
      }),
      'ACCEPT',
      expect.any(Object),
    );
    expect(acceptGenesis.json()).toMatchObject({
      data: { viewerDecision: 'ACCEPT', acceptedCount: 1, version: 2 },
    });
  });

  it('requires authentication before exposing the Competition', async () => {
    const app = await buildApp({
      statusQueue: {
        auth: new StaticBearerAuthAdapter(token, userId),
        competitionId,
        readCompetitionStatus: vi.fn(),
        submitEntry: vi.fn(),
        withdrawEntry: vi.fn(),
        reconfirmEntry: vi.fn(),
        respondToGenesis: vi.fn(),
      },
    });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/v1/me/competition' });
    expect(response.statusCode).toBe(401);
  });
});
