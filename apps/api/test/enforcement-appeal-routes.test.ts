import type { EnforcementAppealProjection } from '@molokh/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { StaticBearerAuthAdapter } from '../src/auth.js';

const subjectId = '0199a1b2-1234-7000-8000-000000009001';
const centralId = '0199a1b2-1234-7000-8000-000000009002';
const enforcementId = '0199a1b2-1234-7000-8000-000000009003';
const appealId = '0199a1b2-1234-7000-8000-000000009004';

function projection(overrides: Partial<EnforcementAppealProjection> = {}): EnforcementAppealProjection {
  return {
    appealId, enforcementId, subjectUserId: subjectId, state: 'SUBMITTED',
    statement: 'Прошу независимо пересмотреть ограничение аккаунта.',
    submittedAt: '2026-10-01T10:00:00.000Z', appealDeadlineAt: '2026-10-08T10:00:00.000Z',
    assignedReviewerUserId: null, reviewStartedAt: null, restrictionRemainsActive: true,
    viewerCanStartReview: true, version: 1, ...overrides,
  };
}

describe('Enforcement Appeal routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('[AC-129] submits a versioned Appeal and assigns an independent Central reviewer', async () => {
    const submit = vi.fn().mockResolvedValue({ responseStatus: 201, response: projection(),
      eventId: '0199a1b2-1234-7000-8000-000000009005', aggregateVersion: 1, replayed: false });
    const startReview = vi.fn().mockResolvedValue({ responseStatus: 200,
      response: projection({ state: 'UNDER_REVIEW', assignedReviewerUserId: centralId,
        reviewStartedAt: '2026-10-01T11:00:00.000Z', viewerCanStartReview: false, version: 2 }),
      eventId: '0199a1b2-1234-7000-8000-000000009006', aggregateVersion: 2, replayed: false });
    const app = await buildApp({ enforcementAppeal: {
      auth: new StaticBearerAuthAdapter('subject-appeal-token', subjectId),
      centralAuth: new StaticBearerAuthAdapter('central-appeal-token', centralId),
      readForSubject: vi.fn().mockResolvedValue({ enforcementId, enforcementState: 'ACTIVE',
        appealDeadlineAt: '2026-10-08T10:00:00.000Z', enforcementVersion: 1,
        restrictionRemainsActive: true, appeal: null }),
      listForCentral: vi.fn().mockResolvedValue([projection()]), submit, startReview,
    } });
    apps.push(app);

    const submitted = await app.inject({ method: 'POST',
      url: `/api/v1/enforcements/${enforcementId}/appeals`, headers: {
        authorization: 'Bearer subject-appeal-token', 'content-type': 'application/json',
        'idempotency-key': 'appeal-enforcement-1', 'if-match': '1',
      }, payload: { statement: 'Прошу независимо пересмотреть ограничение аккаунта.' } });
    expect(submitted.statusCode).toBe(201);
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      commandType: 'APPEAL_ENFORCEMENT', expectedVersion: 0,
      payload: expect.objectContaining({ enforcementId, expectedEnforcementVersion: 1 }),
    }), expect.objectContaining({ appealId: expect.stringMatching(/^[0-9a-f-]{36}$/) }));
    expect(submitted.json()).toMatchObject({ data: { state: 'SUBMITTED', restrictionRemainsActive: true } });

    const reviewed = await app.inject({ method: 'POST',
      url: `/api/v1/central/enforcement-appeals/${appealId}/start-review`, headers: {
        authorization: 'Bearer central-appeal-token', 'content-type': 'application/json',
        'idempotency-key': 'review-enforcement-appeal-1', 'if-match': '1',
      }, payload: {} });
    expect(reviewed.statusCode).toBe(200);
    expect(startReview).toHaveBeenCalledWith(expect.objectContaining({
      commandType: 'START_ENFORCEMENT_APPEAL_REVIEW', expectedVersion: 1,
      payload: { appealId },
    }), expect.any(Object));
    expect(reviewed.json()).toMatchObject({ data: { state: 'UNDER_REVIEW', restrictionRemainsActive: true } });
  });
});
