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
  version: 1,
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

  it('requires authentication, an idempotency key and a source Result version', async () => {
    const app = await buildApp({
      technicalCorrection: {
        auth: new StaticBearerAuthAdapter(coachToken, coachId),
        centralAuth: new StaticBearerAuthAdapter(centralToken, centralId),
        listForViewer: vi.fn(), listForCentral: vi.fn(), request: vi.fn(),
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
