import type { TechnicalCorrectionProjection } from '@molokh/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { StaticBearerAuthAdapter } from '../src/auth.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const coachToken = 'technical-correction-coach-token';
const centralToken = 'technical-correction-central-token';
const coachId = '0199a1b2-1234-7000-8000-000000005001';
const centralId = '0199a1b2-1234-7000-8000-000000005002';
const correctionId = '0199a1b2-1234-7000-8000-000000005003';
const resultId = '0199a1b2-1234-7000-8000-000000005004';
const challengeId = '0199a1b2-1234-7000-8000-000000005005';
const competitionId = '0199a1b2-1234-7000-8000-000000005006';
const athleteA = '0199a1b2-1234-7000-8000-000000005007';
const athleteB = '0199a1b2-1234-7000-8000-000000005008';

const submitted: TechnicalCorrectionProjection = {
  correctionId,
  resultId,
  challengeId,
  competitionId,
  requesterUserId: coachId,
  requesterDisplayName: 'Пилотный тренер',
  category: 'OUTCOME_OR_WINNER_ERROR',
  state: 'SUBMITTED',
  originalOutcomeCode: 'WIN_A',
  originalWinnerUserId: athleteA,
  proposedOutcomeCode: 'WIN_B',
  proposedWinnerUserId: athleteB,
  internalReason: 'Перепутан угол победителя.',
  evidenceReference: 'session-log:42',
  submittedAt: '2026-10-08T10:00:00.000Z',
  assignedReviewerUserId: null,
  reviewStartedAt: null,
  decisionReason: null,
  decidedAt: null,
  version: 1,
};

const underReview: TechnicalCorrectionProjection = {
  ...submitted, state: 'UNDER_REVIEW', assignedReviewerUserId: centralId,
  reviewStartedAt: '2026-10-08T11:00:00.000Z', version: 2,
};

const rejected: TechnicalCorrectionProjection = {
  ...underReview, state: 'REJECTED',
  decisionReason: 'Evidence does not support changing the Result.',
  decidedAt: '2026-10-08T12:00:00.000Z', version: 3,
};

const approved: TechnicalCorrectionProjection = {
  ...underReview, state: 'APPROVED',
  decisionReason: 'Session journal confirms the opposite winner.',
  decidedAt: '2026-10-08T12:00:00.000Z', version: 3,
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('Technical Correction routes', () => {
  it('[AC-113] exposes a Coach request and the neutral Central queue', async () => {
    const requestCorrection = vi.fn().mockResolvedValue({
      responseStatus: 201,
      response: submitted,
      eventId: '0199a1b2-1234-7000-8000-000000005009',
      aggregateVersion: 1,
      replayed: false,
    });
    const app = await buildApp({
      technicalCorrection: {
        auth: new StaticBearerAuthAdapter(coachToken, coachId),
        centralAuth: new StaticBearerAuthAdapter(centralToken, centralId),
        listForViewer: vi.fn().mockResolvedValue([submitted]),
        listForCentral: vi.fn().mockResolvedValue([submitted]),
        request: requestCorrection,
        startReview: vi.fn(), reject: vi.fn(), approve: vi.fn(),
      },
    });
    apps.push(app);

    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/results/${resultId}/technical-corrections`,
      headers: {
        authorization: `Bearer ${coachToken}`,
        'idempotency-key': 'technical-correction-1',
        'if-match': '3',
      },
      payload: {
        category: 'OUTCOME_OR_WINNER_ERROR',
        proposedOutcomeCode: 'WIN_B',
        proposedWinnerUserId: athleteB,
        internalReason: 'Перепутан угол победителя.',
        evidenceReference: 'session-log:42',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ data: { state: 'SUBMITTED', resultId } });
    expect(requestCorrection.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'REQUEST_TECHNICAL_CORRECTION',
      aggregateType: 'TechnicalCorrection',
      expectedVersion: 0,
      actor: { id: coachId, roles: ['COACH'] },
      payload: { resultId, expectedResultVersion: 3, proposedOutcomeCode: 'WIN_B' },
    });

    const coachList = await app.inject({
      method: 'GET', url: '/api/v1/me/technical-corrections',
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(coachList.statusCode).toBe(200);
    expect(coachList.json()).toMatchObject({ data: [{ correctionId, state: 'SUBMITTED' }] });
    const centralList = await app.inject({
      method: 'GET', url: '/api/v1/central/technical-corrections',
      headers: { authorization: `Bearer ${centralToken}` },
    });
    expect(centralList.statusCode).toBe(200);

    await app.ready();
    expect(app.swagger().paths).toHaveProperty(
      '/api/v1/results/{resultId}/technical-corrections',
    );
    expect(app.swagger().paths).toHaveProperty('/api/v1/central/technical-corrections');
  });

  it('[AC-148] starts independent review and rejects without exposing a decision mutation', async () => {
    const startReview = vi.fn().mockResolvedValue({ responseStatus: 200,
      response: underReview, eventId: '0199a1b2-1234-7000-8000-000000005010',
      aggregateVersion: 2, replayed: false });
    const reject = vi.fn().mockResolvedValue({ responseStatus: 200,
      response: rejected, eventId: '0199a1b2-1234-7000-8000-000000005011',
      aggregateVersion: 3, replayed: false });
    const app = await buildApp({ technicalCorrection: {
      auth: new StaticBearerAuthAdapter(coachToken, coachId),
      centralAuth: new StaticBearerAuthAdapter(centralToken, centralId),
      listForViewer: vi.fn(), listForCentral: vi.fn(), request: vi.fn(),
      startReview, reject, approve: vi.fn(),
    } });
    apps.push(app);
    const started = await app.inject({ method: 'POST',
      url: `/api/v1/central/technical-corrections/${correctionId}/start-review`,
      headers: { authorization: `Bearer ${centralToken}`, 'idempotency-key': 'start-1',
        'if-match': '1' }, payload: {} });
    expect(started.statusCode).toBe(200);
    expect(started.json()).toMatchObject({ data: { state: 'UNDER_REVIEW', version: 2 } });
    expect(startReview.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'START_TECHNICAL_CORRECTION_REVIEW', expectedVersion: 1,
      aggregateId: correctionId, actor: { id: centralId, roles: ['CENTRAL_ADMIN'] },
    });
    const decided = await app.inject({ method: 'POST',
      url: `/api/v1/central/technical-corrections/${correctionId}/reject`,
      headers: { authorization: `Bearer ${centralToken}`, 'idempotency-key': 'reject-1',
        'if-match': '2' }, payload: { reason: 'Evidence does not support changing the Result.' } });
    expect(decided.statusCode).toBe(200);
    expect(decided.json()).toMatchObject({ data: { state: 'REJECTED', version: 3 } });
    expect(reject.mock.calls[0]?.[0]).toMatchObject({ commandType: 'REJECT_TECHNICAL_CORRECTION',
      expectedVersion: 2, payload: { correctionId,
        reason: 'Evidence does not support changing the Result.' } });
    await app.ready();
    expect(app.swagger().paths).toHaveProperty(
      '/api/v1/central/technical-corrections/{correctionId}/start-review');
    expect(app.swagger().paths).toHaveProperty(
      '/api/v1/central/technical-corrections/{correctionId}/reject');
  });

  it('[AC-147] approves a reviewed correction with an explicit protected reason', async () => {
    const approve = vi.fn().mockResolvedValue({ responseStatus: 200,
      response: approved, eventId: '0199a1b2-1234-7000-8000-000000005012',
      aggregateVersion: 3, replayed: false });
    const app = await buildApp({ technicalCorrection: {
      auth: new StaticBearerAuthAdapter(coachToken, coachId),
      centralAuth: new StaticBearerAuthAdapter(centralToken, centralId),
      listForViewer: vi.fn(), listForCentral: vi.fn(), request: vi.fn(),
      startReview: vi.fn(), reject: vi.fn(), approve,
    } });
    apps.push(app);
    const decided = await app.inject({ method: 'POST',
      url: `/api/v1/central/technical-corrections/${correctionId}/approve`,
      headers: { authorization: `Bearer ${centralToken}`, 'idempotency-key': 'approve-1',
        'if-match': '2' },
      payload: { reason: 'Session journal confirms the opposite winner.' } });
    expect(decided.statusCode).toBe(200);
    expect(decided.json()).toMatchObject({ data: { state: 'APPROVED', version: 3 } });
    expect(approve.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'APPROVE_TECHNICAL_CORRECTION', expectedVersion: 2,
      payload: { correctionId, reason: 'Session journal confirms the opposite winner.' },
    });
    await app.ready();
    expect(app.swagger().paths).toHaveProperty(
      '/api/v1/central/technical-corrections/{correctionId}/approve');
  });

  it('requires authentication, an idempotency key and a source Result version', async () => {
    const app = await buildApp({
      technicalCorrection: {
        auth: new StaticBearerAuthAdapter(coachToken, coachId),
        centralAuth: new StaticBearerAuthAdapter(centralToken, centralId),
        listForViewer: vi.fn(), listForCentral: vi.fn(), request: vi.fn(),
        startReview: vi.fn(), reject: vi.fn(), approve: vi.fn(),
      },
    });
    apps.push(app);
    const unauthenticated = await app.inject({
      method: 'POST', url: `/api/v1/results/${resultId}/technical-corrections`,
      payload: {
        category: 'OUTCOME_OR_WINNER_ERROR', proposedOutcomeCode: 'WIN_B',
        internalReason: 'Причина.', evidenceReference: 'session-log:42',
      },
    });
    expect(unauthenticated.statusCode).toBe(401);
    const missingVersion = await app.inject({
      method: 'POST', url: `/api/v1/results/${resultId}/technical-corrections`,
      headers: { authorization: `Bearer ${coachToken}`, 'idempotency-key': 'missing-version' },
      payload: {
        category: 'OUTCOME_OR_WINNER_ERROR', proposedOutcomeCode: 'WIN_B',
        internalReason: 'Причина.', evidenceReference: 'session-log:42',
      },
    });
    expect(missingVersion.statusCode).toBe(400);
  });
});
