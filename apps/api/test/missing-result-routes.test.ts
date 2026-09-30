import type { MissingResultReviewProjection } from '@molokh/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { StaticBearerAuthAdapter } from '../src/auth.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const token = 'missing-result-route-token';
const actorUserId = '0199a1b2-1234-7000-8000-000000003001';
const reviewId = '0199a1b2-1234-7000-8000-000000003002';
const challengeId = '0199a1b2-1234-7000-8000-000000003003';
const sessionId = '0199a1b2-1234-7000-8000-000000003004';
const venueId = '0199a1b2-1234-7000-8000-000000003005';
const coachId = '0199a1b2-1234-7000-8000-000000003006';
const reviewerCoachId = '0199a1b2-1234-7000-8000-000000003007';
const athleteA = '0199a1b2-1234-7000-8000-000000003008';
const athleteB = '0199a1b2-1234-7000-8000-000000003009';

const openReview: MissingResultReviewProjection = {
  reviewId, challengeId, sessionId, state: 'OPEN', venueId,
  venueDisplayName: 'Pilot Gym', originalCoachUserId: coachId,
  originalCoachDisplayName: 'Исходный Coach', participantUserIds: [athleteA, athleteB],
  participantDisplayNames: ['Атлет А', 'Атлет Б'], openedAt: '2026-09-13T10:00:00.000Z',
  assignedCentralUserId: null, reviewStartedAt: null,
  assignedReviewerCoachUserId: null, assignedReviewerCoachDisplayName: null,
  allowedOutcomeCode: null, allowedWinnerUserId: null, assignmentReason: null,
  statements: [], venueConfirmation: null, resolution: null, resolutionReason: null,
  resolvedAt: null, challengeState: 'RESULT_PENDING', challengeVersion: 11,
  reviewerCoachOptions: [{ userId: reviewerCoachId, displayName: 'Независимый Coach' }],
  viewerCanSubmitStatement: true, viewerCanConfirmVenue: false,
  viewerCanStartReview: true, viewerCanAssignCoach: false, viewerCanOrderRepeat: false,
  viewerCanRecordConstrainedResult: false, version: 1,
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('Missing Result Review routes', () => {
  it('[AC-179][AC-180] exposes role-safe evidence, assignment and repeat commands', async () => {
    const executed = (response: MissingResultReviewProjection) => ({
      responseStatus: 200, response,
      eventId: '0199a1b2-1234-7000-8000-000000003010', aggregateVersion: response.version,
      replayed: false,
    });
    const submitStatement = vi.fn().mockResolvedValue(executed({ ...openReview, version: 2 }));
    const confirmVenue = vi.fn().mockResolvedValue(executed({ ...openReview, version: 2 }));
    const startReview = vi.fn().mockResolvedValue(executed({
      ...openReview, state: 'UNDER_REVIEW', assignedCentralUserId: actorUserId,
      reviewStartedAt: '2026-09-13T10:05:00.000Z', version: 2,
    }));
    const assignCoach = vi.fn().mockResolvedValue(executed({
      ...openReview, state: 'REVIEWER_ASSIGNED', assignedCentralUserId: actorUserId,
      reviewStartedAt: '2026-09-13T10:05:00.000Z',
      assignedReviewerCoachUserId: reviewerCoachId,
      assignedReviewerCoachDisplayName: 'Независимый Coach', allowedOutcomeCode: 'WIN_B',
      allowedWinnerUserId: athleteB, assignmentReason: 'Факты совпадают.', version: 3,
    }));
    const orderRepeat = vi.fn().mockResolvedValue(executed({
      ...openReview, state: 'REPEAT_ORDERED', assignedCentralUserId: actorUserId,
      reviewStartedAt: '2026-09-13T10:05:00.000Z', resolution: 'REPEAT_ORDERED',
      resolutionReason: 'Факты противоречат друг другу.', resolvedAt: '2026-09-13T10:10:00.000Z',
      challengeState: 'ACCEPTED_UNSCHEDULED', challengeVersion: 12, version: 3,
    }));
    const app = await buildApp({
      missingResult: {
        auth: new StaticBearerAuthAdapter(token, actorUserId),
        centralAuth: new StaticBearerAuthAdapter(token, actorUserId),
        listForViewer: vi.fn().mockResolvedValue([openReview]),
        listForCentral: vi.fn().mockResolvedValue([openReview]),
        read: vi.fn().mockResolvedValue(openReview),
        submitStatement, confirmVenue, startReview, assignCoach, orderRepeat,
      },
    });
    apps.push(app);

    for (const url of [
      '/api/v1/me/missing-result-reviews',
      '/api/v1/central/missing-result-reviews',
      `/api/v1/missing-result-reviews/${reviewId}`,
    ]) {
      const response = await app.inject({
        method: 'GET', url, headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject(
        url.endsWith(reviewId) ? { data: { reviewId } } : { data: [{ reviewId }] },
      );
    }

    const statement = await app.inject({
      method: 'POST', url: `/api/v1/missing-result-reviews/${reviewId}/statements`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'statement-1', 'if-match': '1' },
      payload: { outcomeCode: 'WIN_B', statement: 'Победил второй участник.' },
    });
    expect(statement.statusCode).toBe(200);
    expect(submitStatement.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'SUBMIT_MISSING_RESULT_STATEMENT', aggregateId: reviewId,
      expectedVersion: 1, actor: { id: actorUserId },
      payload: { reviewId, outcomeCode: 'WIN_B', statement: 'Победил второй участник.' },
    });

    const venue = await app.inject({
      method: 'POST', url: `/api/v1/missing-result-reviews/${reviewId}/venue-confirmation`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'venue-1', 'if-match': '1' },
      payload: { attendanceConfirmed: true, note: 'Оба были в зале.' },
    });
    expect(venue.statusCode).toBe(200);
    expect(confirmVenue.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'CONFIRM_MISSING_RESULT_VENUE',
      payload: { reviewId, attendanceConfirmed: true, note: 'Оба были в зале.' },
    });

    const centralActions = [
      { suffix: 'start-review', key: 'start-1', payload: {}, mock: startReview,
        commandType: 'START_MISSING_RESULT_REVIEW' },
      { suffix: 'assign-coach', key: 'assign-1', payload: {
        reviewerCoachUserId: reviewerCoachId, repeatObjectivelyImpossible: false,
        reason: 'Факты совпадают.',
      }, mock: assignCoach, commandType: 'ASSIGN_RESULT_REVIEWER_COACH' },
      { suffix: 'order-repeat', key: 'repeat-1', payload: {
        reason: 'Факты противоречат друг другу.',
      }, mock: orderRepeat, commandType: 'ORDER_MISSING_RESULT_REPEAT' },
    ] as const;
    for (const action of centralActions) {
      const response = await app.inject({
        method: 'POST', url: `/api/v1/central/missing-result-reviews/${reviewId}/${action.suffix}`,
        headers: {
          authorization: `Bearer ${token}`, 'idempotency-key': action.key, 'if-match': '1',
        },
        payload: action.payload,
      });
      expect(response.statusCode).toBe(200);
      expect(action.mock.mock.calls[0]?.[0]).toMatchObject({
        commandType: action.commandType, aggregateId: reviewId, expectedVersion: 1,
        actor: { id: actorUserId, roles: ['CENTRAL_ADMIN'] },
      });
    }

    await app.ready();
    expect(app.swagger().paths).toHaveProperty('/api/v1/me/missing-result-reviews');
    expect(app.swagger().paths).toHaveProperty('/api/v1/central/missing-result-reviews');
    expect(app.swagger().paths).toHaveProperty('/api/v1/central/missing-result-reviews/{reviewId}/assign-coach');
  });

  it('requires auth, idempotency and optimistic concurrency', async () => {
    const app = await buildApp({
      missingResult: {
        auth: new StaticBearerAuthAdapter(token, actorUserId),
        centralAuth: new StaticBearerAuthAdapter(token, actorUserId),
        listForViewer: vi.fn(), listForCentral: vi.fn(), read: vi.fn(),
        submitStatement: vi.fn(), confirmVenue: vi.fn(), startReview: vi.fn(),
        assignCoach: vi.fn(), orderRepeat: vi.fn(),
      },
    });
    apps.push(app);
    const unauthenticated = await app.inject({
      method: 'POST', url: `/api/v1/missing-result-reviews/${reviewId}/statements`,
      payload: { outcomeCode: 'DRAW', statement: 'Ничья.' },
    });
    expect(unauthenticated.statusCode).toBe(401);
    const missingVersion = await app.inject({
      method: 'POST', url: `/api/v1/missing-result-reviews/${reviewId}/statements`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'statement-2' },
      payload: { outcomeCode: 'DRAW', statement: 'Ничья.' },
    });
    expect(missingVersion.statusCode).toBe(400);
  });
});
