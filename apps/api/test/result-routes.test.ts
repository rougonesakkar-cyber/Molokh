import type { ResultProjection } from '@molokh/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { StaticBearerAuthAdapter } from '../src/auth.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const token = 'result-route-test-token';
const actorUserId = '0199a1b2-1234-7000-8000-000000001501';
const resultId = '0199a1b2-1234-7000-8000-000000001502';
const challengeId = '0199a1b2-1234-7000-8000-000000001503';
const sessionId = '0199a1b2-1234-7000-8000-000000001504';
const winnerUserId = '0199a1b2-1234-7000-8000-000000001505';
const loserUserId = '0199a1b2-1234-7000-8000-000000001506';

const recorded: ResultProjection = {
  resultId,
  challengeId,
  sessionId,
  state: 'RECORDED',
  outcomeCode: 'WIN_A',
  recordedOutcomeCode: 'WIN_A',
  winnerUserId,
  winnerDisplayName: 'Атлет А',
  loserUserId,
  loserDisplayName: 'Атлет Б',
  recordedWinnerUserId: winnerUserId,
  recordedLoserUserId: loserUserId,
  technicalCorrectionDecisionId: null,
  reasonCode: null,
  comment: null,
  methodCode: null,
  methodText: null,
  scorePayload: null,
  recordedAt: '2026-09-09T10:00:00.000Z',
  appealDeadlineAt: '2026-09-11T10:00:00.000Z',
  finalizedAt: null,
  decision: null,
  decisionReason: null,
  statusTransitionType: 'CONTENDER_TRANSFERRED',
  statusBefore: { championUserId: null, contenderUserId: loserUserId, statusVersion: 3 },
  statusAfter: { championUserId: null, contenderUserId: winnerUserId, statusVersion: 4 },
  provisional: true,
  integrityReviewState: null,
  integrityReviewCategory: null,
  viewerCanAppeal: true,
  viewerCanWaiveAppeal: true,
  version: 1,
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('Result and Appeal routes', () => {
  it('[AC-076][AC-088][AC-089][AC-167][AC-202][AC-203] exposes media-free Coach Result facts', async () => {
    const readResult = vi.fn().mockResolvedValue(recorded);
    const recordSessionResult = vi.fn().mockResolvedValue({
      responseStatus: 201, response: recorded,
      eventId: '0199a1b2-1234-7000-8000-000000001507', aggregateVersion: 8,
      replayed: false,
    });
    const submitResultAppeal = vi.fn().mockResolvedValue({
      responseStatus: 201, response: { ...recorded, state: 'UNDER_APPEAL', version: 2 },
      eventId: '0199a1b2-1234-7000-8000-000000001508', aggregateVersion: 2,
      replayed: false,
    });
    const waiveResultAppeal = vi.fn().mockResolvedValue({
      responseStatus: 200,
      response: {
        ...recorded, state: 'FINAL', provisional: false,
        finalizedAt: '2026-09-09T11:00:00.000Z',
        viewerCanAppeal: false, viewerCanWaiveAppeal: false, version: 2,
      },
      eventId: '0199a1b2-1234-7000-8000-000000001509', aggregateVersion: 2,
      replayed: false,
    });
    const app = await buildApp({
      result: {
        auth: new StaticBearerAuthAdapter(token, actorUserId),
        readResult,
        recordSessionResult,
        submitResultAppeal,
        waiveResultAppeal,
      },
    });
    apps.push(app);

    const read = await app.inject({
      method: 'GET', url: `/api/v1/results/${resultId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({ data: { resultId, state: 'RECORDED' } });

    const created = await app.inject({
      method: 'POST', url: `/api/v1/challenges/${challengeId}/result`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'record-result-route-1',
        'if-match': '7',
      },
      payload: { sessionId, outcomeCode: 'WIN_A' },
    });
    expect(created.statusCode).toBe(201);
    expect(recordSessionResult.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'RECORD_SESSION_RESULT', aggregateType: 'Challenge',
      aggregateId: challengeId, expectedVersion: 7,
      actor: { id: actorUserId, roles: ['COACH'] },
      payload: {
        challengeId, sessionId, outcomeCode: 'WIN_A', winnerUserId: null,
        reasonCode: null, comment: null, methodCode: null, methodText: null,
        scorePayload: null, methodPayload: null,
      },
    });
    expect(recordSessionResult.mock.calls[0]?.[1]).toMatchObject({
      notificationIds: expect.arrayContaining([expect.any(String), expect.any(String)]),
    });
    expect(JSON.stringify(created.json())).not.toMatch(/media|photo|video|upload|objectKey/i);

    const unavailableMediaUpload = await app.inject({
      method: 'POST',
      url: `/api/v1/results/${resultId}/media`,
      headers: { authorization: `Bearer ${token}` },
      payload: { fileName: 'result.mp4', mimeType: 'video/mp4', sizeBytes: 1024 },
    });
    expect(unavailableMediaUpload.statusCode).toBe(404);
    expect(recordSessionResult).toHaveBeenCalledTimes(1);

    const noShow = await app.inject({
      method: 'POST', url: `/api/v1/challenges/${challengeId}/result`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'record-no-show-route-1',
        'if-match': '7',
      },
      payload: {
        sessionId, outcomeCode: 'NO_SHOW', winnerUserId,
        reasonCode: 'ATTENDANCE_NO_SHOW', comment: 'Неявка подтверждена Coach.',
      },
    });
    expect(noShow.statusCode).toBe(201);
    expect(recordSessionResult.mock.calls[1]?.[0]).toMatchObject({
      actor: { id: actorUserId, roles: ['COACH'] },
      payload: {
        challengeId, sessionId, outcomeCode: 'NO_SHOW', winnerUserId,
        reasonCode: 'ATTENDANCE_NO_SHOW', comment: 'Неявка подтверждена Coach.',
      },
    });

    const appealed = await app.inject({
      method: 'POST', url: `/api/v1/results/${resultId}/appeal`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'appeal-result-route-1',
        'if-match': '1',
      },
      payload: { reasonCode: 'SCORE_DISPUTED', statement: 'Прошу проверить счёт.' },
    });
    expect(appealed.statusCode).toBe(201);
    expect(submitResultAppeal.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'SUBMIT_RESULT_APPEAL', aggregateId: resultId, expectedVersion: 1,
      actor: { id: actorUserId, roles: ['ATHLETE'] },
    });

    const waived = await app.inject({
      method: 'POST', url: `/api/v1/results/${resultId}/waive-appeal`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'waive-result-route-1',
        'if-match': '1',
      },
      payload: {},
    });
    expect(waived.statusCode).toBe(200);
    expect(waiveResultAppeal.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'WAIVE_RESULT_APPEAL', aggregateId: resultId, expectedVersion: 1,
    });

    await app.ready();
    const openApi = app.swagger() as {
      readonly paths: Record<string, { readonly post?: { readonly requestBody?: unknown } }>;
    };
    expect(openApi.paths).toHaveProperty('/api/v1/results/{resultId}');
    expect(openApi.paths).toHaveProperty('/api/v1/challenges/{challengeId}/result');
    expect(openApi.paths).toHaveProperty('/api/v1/results/{resultId}/appeal');
    expect(openApi.paths).toHaveProperty('/api/v1/results/{resultId}/waive-appeal');
    expect(Object.keys(openApi.paths).filter((path) =>
      path.includes('/results/') && /media|photo|video|upload/i.test(path),
    )).toEqual([]);
    const recordBodySchema = openApi.paths['/api/v1/challenges/{challengeId}/result']
      ?.post?.requestBody;
    expect(JSON.stringify(recordBodySchema)).toContain('"additionalProperties":false');
    expect(JSON.stringify(recordBodySchema)).not.toMatch(/media|photo|video|upload|objectKey/i);
  });

  it('requires optimistic concurrency and authentication for Result writes', async () => {
    const app = await buildApp({
      result: {
        auth: new StaticBearerAuthAdapter(token, actorUserId),
        readResult: vi.fn(), recordSessionResult: vi.fn(),
        submitResultAppeal: vi.fn(), waiveResultAppeal: vi.fn(),
      },
    });
    apps.push(app);
    const unauthenticated = await app.inject({
      method: 'POST', url: `/api/v1/challenges/${challengeId}/result`,
      payload: { sessionId, outcomeCode: 'WIN_A' },
    });
    expect(unauthenticated.statusCode).toBe(401);
    const missingVersion = await app.inject({
      method: 'POST', url: `/api/v1/challenges/${challengeId}/result`,
      headers: {
        authorization: `Bearer ${token}`,
        'idempotency-key': 'record-result-route-2',
      },
      payload: { sessionId, outcomeCode: 'WIN_A' },
    });
    expect(missingVersion.statusCode).toBe(400);
  });
});
