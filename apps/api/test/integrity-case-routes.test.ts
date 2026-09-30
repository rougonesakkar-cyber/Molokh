import type { IntegrityCaseProjection } from '@molokh/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { StaticBearerAuthAdapter } from '../src/auth.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const token = 'integrity-route-token';
const centralUserId = '0199a1b2-1234-7000-8000-000000004001';
const caseId = '0199a1b2-1234-7000-8000-000000004002';
const resultId = '0199a1b2-1234-7000-8000-000000004003';
const challengeId = '0199a1b2-1234-7000-8000-000000004004';
const competitionId = '0199a1b2-1234-7000-8000-000000004005';
const athleteA = '0199a1b2-1234-7000-8000-000000004006';
const athleteB = '0199a1b2-1234-7000-8000-000000004007';
const coachId = '0199a1b2-1234-7000-8000-000000004008';

const openCase: IntegrityCaseProjection = {
  caseId,
  resultId,
  challengeId,
  competitionId,
  category: 'SYSTEM_ERROR',
  publicReasonCategory: 'SYSTEM_ERROR',
  evidenceReference: 'audit://result/004003',
  internalReason: 'Обнаружено несоответствие системного журнала.',
  state: 'OPEN',
  openedBy: centralUserId,
  openedAt: '2026-09-23T10:00:00.000Z',
  slaDueAt: '2026-09-26T10:00:00.000Z',
  assignedReviewerUserId: null,
  reviewStartedAt: null,
  requestedDisposition: null,
  effectiveDisposition: null,
  decisionReason: null,
  effectiveOutcomeCode: null,
  effectiveWinnerUserId: null,
  replayHash: null,
  decidedAt: null,
  participantUserIds: [athleteA, athleteB],
  participantDisplayNames: ['Атлет А', 'Атлет Б'],
  originalCoachUserId: coachId,
  viewerCanStartReview: true,
  viewerCanDecide: false,
  version: 1,
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('Final Result IntegrityCase routes', () => {
  it('[AC-211][AC-212] exposes role-safe review commands with source concurrency', async () => {
    const executed = (projection: IntegrityCaseProjection, responseStatus = 200) => ({
      responseStatus,
      response: projection,
      eventId: '0199a1b2-1234-7000-8000-000000004009',
      aggregateVersion: projection.version,
      replayed: false,
    });
    const open = vi.fn().mockResolvedValue(executed(openCase, 201));
    const underReview = {
      ...openCase,
      state: 'UNDER_REVIEW' as const,
      assignedReviewerUserId: centralUserId,
      reviewStartedAt: '2026-09-23T10:05:00.000Z',
      viewerCanStartReview: false,
      viewerCanDecide: true,
      version: 2,
    };
    const startReview = vi.fn().mockResolvedValue(executed(underReview));
    const decide = vi.fn().mockResolvedValue(executed({
      ...underReview,
      state: 'DECIDED_CORRECTED',
      requestedDisposition: 'CORRECT',
      effectiveDisposition: 'CORRECT',
      decisionReason: 'Журнал подтверждает обратный исход.',
      effectiveOutcomeCode: 'WIN_B',
      effectiveWinnerUserId: athleteB,
      replayHash: 'a'.repeat(64),
      decidedAt: '2026-09-23T10:10:00.000Z',
      viewerCanDecide: false,
      version: 3,
    }));
    const app = await buildApp({
      integrityCase: {
        auth: new StaticBearerAuthAdapter(token, centralUserId),
        centralAuth: new StaticBearerAuthAdapter(token, centralUserId),
        listForViewer: vi.fn().mockResolvedValue([openCase]),
        listForCentral: vi.fn().mockResolvedValue([openCase]),
        read: vi.fn().mockResolvedValue(openCase),
        open,
        startReview,
        decide,
      },
    });
    apps.push(app);

    for (const url of [
      '/api/v1/me/integrity-cases',
      '/api/v1/central/integrity-cases',
      `/api/v1/integrity-cases/${caseId}`,
    ]) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject(
        url.endsWith(caseId) ? { data: { caseId } } : { data: [{ caseId }] },
      );
    }

    const opened = await app.inject({
      method: 'POST',
      url: '/api/v1/central/integrity-cases',
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'open-integrity-1',
        'if-match': '7',
      },
      payload: {
        resultId,
        category: 'SYSTEM_ERROR',
        evidenceReference: 'audit://result/004003',
        internalReason: 'Обнаружено несоответствие системного журнала.',
      },
    });
    expect(opened.statusCode).toBe(201);
    expect(open.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'OPEN_INTEGRITY_CASE',
      expectedVersion: 0,
      actor: { id: centralUserId, roles: ['CENTRAL_ADMIN'] },
      payload: { resultId, expectedResultVersion: 7, category: 'SYSTEM_ERROR' },
    });

    const started = await app.inject({
      method: 'POST',
      url: `/api/v1/central/integrity-cases/${caseId}/start-review`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'start-integrity-1',
        'if-match': '1',
      },
      payload: {},
    });
    expect(started.statusCode).toBe(200);
    expect(startReview.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'START_INTEGRITY_REVIEW', aggregateId: caseId,
      expectedVersion: 1, payload: { caseId },
    });

    const decided = await app.inject({
      method: 'POST',
      url: `/api/v1/central/integrity-cases/${caseId}/decision`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'decide-integrity-1',
        'if-match': '2',
      },
      payload: {
        disposition: 'CORRECT', correctedOutcomeCode: 'WIN_B',
        reason: 'Журнал подтверждает обратный исход.',
      },
    });
    expect(decided.statusCode).toBe(200);
    expect(decide.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'DECIDE_INTEGRITY_CASE', aggregateId: caseId,
      expectedVersion: 2,
      payload: { caseId, disposition: 'CORRECT', correctedOutcomeCode: 'WIN_B' },
    });

    await app.ready();
    expect(app.swagger().paths).toHaveProperty('/api/v1/central/integrity-cases');
    expect(app.swagger().paths).toHaveProperty(
      '/api/v1/central/integrity-cases/{caseId}/decision',
    );
  });

  it('requires Central auth, idempotency and optimistic concurrency', async () => {
    const app = await buildApp({
      integrityCase: {
        auth: new StaticBearerAuthAdapter(token, centralUserId),
        centralAuth: new StaticBearerAuthAdapter(token, centralUserId),
        listForViewer: vi.fn(), listForCentral: vi.fn(), read: vi.fn(),
        open: vi.fn(), startReview: vi.fn(), decide: vi.fn(),
      },
    });
    apps.push(app);
    const unauthenticated = await app.inject({
      method: 'POST', url: '/api/v1/central/integrity-cases',
      payload: {
        resultId, category: 'FRAUD', evidenceReference: 'case://1', internalReason: 'Факты.',
      },
    });
    expect(unauthenticated.statusCode).toBe(401);
    const missingVersion = await app.inject({
      method: 'POST', url: `/api/v1/central/integrity-cases/${caseId}/start-review`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'start-integrity-2' },
      payload: {},
    });
    expect(missingVersion.statusCode).toBe(400);
  });
});
