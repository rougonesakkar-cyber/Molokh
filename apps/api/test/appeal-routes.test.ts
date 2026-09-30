import type { AppealProjection } from '@molokh/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { StaticBearerAuthAdapter } from '../src/auth.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const token = 'central-appeal-route-token';
const centralUserId = '0199a1b2-1234-7000-8000-000000002001';
const appealId = '0199a1b2-1234-7000-8000-000000002002';
const resultId = '0199a1b2-1234-7000-8000-000000002003';
const challengeId = '0199a1b2-1234-7000-8000-000000002004';
const athleteA = '0199a1b2-1234-7000-8000-000000002005';
const athleteB = '0199a1b2-1234-7000-8000-000000002006';

const submitted: AppealProjection = {
  appealId, resultId, challengeId, state: 'SUBMITTED',
  appellantUserId: athleteB, appellantDisplayName: 'Атлет Б',
  reasonCode: 'WRONG_WINNER', statement: 'Победитель указан неверно.',
  submittedAt: '2026-09-09T11:00:00.000Z',
  responseDeadlineAt: '2026-09-10T11:00:00.000Z',
  responses: [],
  originalSlaDueAt: '2026-09-12T11:00:00.000Z',
  slaDueAt: '2026-09-12T11:00:00.000Z',
  slaExtension: null, withdrawnAt: null,
  assignedReviewerUserId: null, reviewStartedAt: null,
  decision: null, decisionReason: null, decidedAt: null,
  resultState: 'UNDER_APPEAL', recordedOutcomeCode: 'WIN_A',
  effectiveOutcomeCode: 'WIN_A', recordedWinnerUserId: athleteA,
  effectiveWinnerUserId: athleteA, participantUserIds: [athleteA, athleteB],
  coachUserId: '0199a1b2-1234-7000-8000-000000002007',
  viewerCanStartReview: true, viewerCanDecide: false,
  viewerCanRespond: false, viewerCanWithdraw: false, viewerCanExtendSla: false,
  version: 1,
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('Central Appeal routes', () => {
  it('[AC-117][AC-118][AC-119][AC-120] exposes a small versioned Central decision surface', async () => {
    const listAppeals = vi.fn().mockResolvedValue([submitted]);
    const startReview = vi.fn().mockResolvedValue({
      responseStatus: 200,
      response: {
        ...submitted, state: 'UNDER_REVIEW', assignedReviewerUserId: centralUserId,
        reviewStartedAt: '2026-09-09T11:05:00.000Z',
        viewerCanStartReview: false, viewerCanDecide: true, version: 2,
      },
      eventId: '0199a1b2-1234-7000-8000-000000002010', aggregateVersion: 2,
      replayed: false,
    });
    const decide = vi.fn().mockResolvedValue({
      responseStatus: 200,
      response: {
        ...submitted, state: 'DECIDED_REVERSED', assignedReviewerUserId: centralUserId,
        reviewStartedAt: '2026-09-09T11:05:00.000Z', decision: 'REVERSE',
        decisionReason: 'Подтверждена ошибка.', decidedAt: '2026-09-09T11:10:00.000Z',
        resultState: 'REVERSED', effectiveOutcomeCode: 'WIN_B',
        effectiveWinnerUserId: athleteB, viewerCanStartReview: false,
        viewerCanDecide: false, version: 3,
      },
      eventId: '0199a1b2-1234-7000-8000-000000002011', aggregateVersion: 3,
      replayed: false,
    });
    const addResponse = vi.fn().mockResolvedValue({
      responseStatus: 200,
      response: { ...submitted, version: 2 },
      eventId: '0199a1b2-1234-7000-8000-000000002012', aggregateVersion: 2,
      replayed: false,
    });
    const extendSla = vi.fn().mockResolvedValue({
      responseStatus: 200,
      response: {
        ...submitted, state: 'UNDER_REVIEW', assignedReviewerUserId: centralUserId,
        reviewStartedAt: '2026-09-09T11:05:00.000Z', version: 3,
        originalSlaDueAt: submitted.slaDueAt, slaDueAt: '2026-09-13T11:00:00.000Z',
        slaExtension: {
          durationHours: 24, reason: 'Дополнительная проверка.', extendedBy: centralUserId,
          extendedAt: '2026-09-09T11:06:00.000Z', previousDueAt: submitted.slaDueAt,
          extendedDueAt: '2026-09-13T11:00:00.000Z',
        },
      },
      eventId: '0199a1b2-1234-7000-8000-000000002013', aggregateVersion: 3,
      replayed: false,
    });
    const withdraw = vi.fn().mockResolvedValue({
      responseStatus: 200,
      response: {
        ...submitted, state: 'WITHDRAWN', resultState: 'FINAL', withdrawnAt: '2026-09-09T11:07:00.000Z',
        viewerCanStartReview: false, viewerCanWithdraw: false, version: 2,
      },
      eventId: '0199a1b2-1234-7000-8000-000000002014', aggregateVersion: 2,
      replayed: false,
    });
    const app = await buildApp({
      appeal: {
        auth: new StaticBearerAuthAdapter(token, centralUserId),
        centralAuth: new StaticBearerAuthAdapter(token, centralUserId),
        readAppeal: vi.fn().mockResolvedValue(submitted), listAppeals, startReview, decide,
        addResponse, withdraw, extendSla,
      },
    });
    apps.push(app);

    const queue = await app.inject({
      method: 'GET', url: '/api/v1/central/appeals',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(queue.statusCode).toBe(200);
    expect(queue.json()).toMatchObject({ data: [{ appealId, state: 'SUBMITTED' }] });

    const started = await app.inject({
      method: 'POST', url: `/api/v1/central/appeals/${appealId}/start-review`,
      headers: {
        authorization: `Bearer ${token}`, 'idempotency-key': 'start-review-1', 'if-match': '1',
      },
      payload: {},
    });
    expect(started.statusCode).toBe(200);
    expect(startReview.mock.calls[0]?.[0]).toMatchObject({
      aggregateType: 'Appeal', aggregateId: appealId, expectedVersion: 1,
      actor: { id: centralUserId, roles: ['CENTRAL_ADMIN'] },
    });

    const decision = await app.inject({
      method: 'POST', url: `/api/v1/central/appeals/${appealId}/decision`,
      headers: {
        authorization: `Bearer ${token}`, 'idempotency-key': 'decide-review-1', 'if-match': '2',
      },
      payload: { decision: 'REVERSE', reason: 'Подтверждена ошибка.' },
    });
    expect(decision.statusCode).toBe(200);
    expect(decide.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'DECIDE_APPEAL', expectedVersion: 2,
      payload: { appealId, decision: 'REVERSE', reason: 'Подтверждена ошибка.' },
    });

    const detail = await app.inject({
      method: 'GET', url: `/api/v1/results/${resultId}/appeal`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);

    const participantResponse = await app.inject({
      method: 'POST', url: `/api/v1/appeals/${appealId}/responses`,
      headers: {
        authorization: `Bearer ${token}`, 'idempotency-key': 'appeal-response-1', 'if-match': '1',
      },
      payload: { statement: 'Дополнительные факты.' },
    });
    expect(participantResponse.statusCode).toBe(200);
    expect(addResponse.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'ADD_APPEAL_RESPONSE', expectedVersion: 1,
      payload: { appealId, statement: 'Дополнительные факты.' },
    });

    const withdrawal = await app.inject({
      method: 'POST', url: `/api/v1/appeals/${appealId}/withdraw`,
      headers: {
        authorization: `Bearer ${token}`, 'idempotency-key': 'withdraw-appeal-1', 'if-match': '1',
      },
      payload: {},
    });
    expect(withdrawal.statusCode).toBe(200);
    expect(withdraw.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'WITHDRAW_APPEAL', expectedVersion: 1, payload: { appealId },
    });

    const extension = await app.inject({
      method: 'POST', url: `/api/v1/central/appeals/${appealId}/extend-sla`,
      headers: {
        authorization: `Bearer ${token}`, 'idempotency-key': 'extend-sla-1', 'if-match': '2',
      },
      payload: { durationHours: 24, reason: 'Дополнительная проверка.' },
    });
    expect(extension.statusCode).toBe(200);
    expect(extendSla.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'EXTEND_APPEAL_SLA', expectedVersion: 2,
      payload: { appealId, durationHours: 24, reason: 'Дополнительная проверка.' },
    });

    await app.ready();
    expect(app.swagger().paths).toHaveProperty('/api/v1/central/appeals');
    expect(app.swagger().paths).toHaveProperty('/api/v1/central/appeals/{appealId}/start-review');
    expect(app.swagger().paths).toHaveProperty('/api/v1/central/appeals/{appealId}/decision');
    expect(app.swagger().paths).toHaveProperty('/api/v1/results/{resultId}/appeal');
    expect(app.swagger().paths).toHaveProperty('/api/v1/appeals/{appealId}/responses');
    expect(app.swagger().paths).toHaveProperty('/api/v1/appeals/{appealId}/withdraw');
    expect(app.swagger().paths).toHaveProperty('/api/v1/central/appeals/{appealId}/extend-sla');
  });

  it('requires Central authentication and optimistic concurrency', async () => {
    const app = await buildApp({
      appeal: {
        auth: new StaticBearerAuthAdapter(token, centralUserId),
        centralAuth: new StaticBearerAuthAdapter(token, centralUserId),
        readAppeal: vi.fn(), listAppeals: vi.fn(), startReview: vi.fn(), decide: vi.fn(),
        addResponse: vi.fn(), withdraw: vi.fn(), extendSla: vi.fn(),
      },
    });
    apps.push(app);
    const unauthenticated = await app.inject({ method: 'GET', url: '/api/v1/central/appeals' });
    expect(unauthenticated.statusCode).toBe(401);
    const missingVersion = await app.inject({
      method: 'POST', url: `/api/v1/central/appeals/${appealId}/start-review`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'start-review-2' },
      payload: {},
    });
    expect(missingVersion.statusCode).toBe(400);
  });
});
