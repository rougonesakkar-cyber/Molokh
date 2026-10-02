import type { PlatformIncidentProjection } from '@molokh/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { StaticBearerAuthAdapter } from '../src/auth.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const token = 'platform-incident-route-token';
const centralUserId = '0199a1b2-1234-7000-8000-000000006001';
const incidentId = '0199a1b2-1234-7000-8000-000000006002';

const detected: PlatformIncidentProjection = {
  incidentId,
  state: 'DETECTED',
  affectedServices: ['CHALLENGE'],
  affectedSurfaces: ['CHALLENGE_RESPONSE'],
  severity: 'MAJOR',
  startedAt: '2026-10-02T10:00:00.000Z',
  endedAt: null,
  monitoringEvidenceReference: 'monitor:api:latency',
  detectedAt: '2026-10-02T10:01:00.000Z',
  confirmedBy: null,
  confirmedAt: null,
  confirmationReason: null,
  rejectedBy: null,
  rejectedAt: null,
  rejectionReason: null,
  resolvedBy: null,
  resolvedByActorType: null,
  resolvedAt: null,
  resolutionReason: null,
  compensatedAt: null,
  impactCount: 0,
  version: 1,
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('PlatformIncident Central routes', () => {
  it('lists incidents and exposes confirm, reject and resolve commands with concurrency', async () => {
    const executed = (projection: PlatformIncidentProjection) => ({
      responseStatus: 200,
      response: projection,
      eventId: '0199a1b2-1234-7000-8000-000000006003',
      aggregateVersion: projection.version,
      replayed: false,
    });
    const confirm = vi.fn().mockResolvedValue(executed({
      ...detected, state: 'CONFIRMED_ACTIVE', confirmedBy: centralUserId,
      confirmedAt: '2026-10-02T10:02:00.000Z', confirmationReason: 'Metrics confirmed.',
      version: 2,
    }));
    const reject = vi.fn().mockResolvedValue(executed({
      ...detected, state: 'REJECTED', rejectedBy: centralUserId,
      rejectedAt: '2026-10-02T10:02:00.000Z', rejectionReason: 'False positive.', version: 2,
    }));
    const resolve = vi.fn().mockResolvedValue(executed({
      ...detected, state: 'RESOLVED', confirmedBy: centralUserId,
      confirmedAt: '2026-10-02T10:02:00.000Z', confirmationReason: 'Metrics confirmed.',
      endedAt: '2026-10-02T10:37:00.000Z', resolvedBy: centralUserId,
      resolvedByActorType: 'USER', resolvedAt: '2026-10-02T10:38:00.000Z',
      resolutionReason: 'Recovery confirmed.', version: 3,
    }));
    const app = await buildApp({
      platformIncident: {
        centralAuth: new StaticBearerAuthAdapter(token, centralUserId),
        list: vi.fn().mockResolvedValue([detected]), confirm, reject, resolve,
      },
    });
    apps.push(app);

    const listed = await app.inject({ method: 'GET',
      url: '/api/v1/central/platform-incidents',
      headers: { authorization: `Bearer ${token}` } });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({ data: [{ incidentId, state: 'DETECTED' }] });

    const confirmed = await app.inject({ method: 'POST',
      url: `/api/v1/central/platform-incidents/${incidentId}/confirm`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'confirm-incident-1',
        'if-match': '1' }, payload: { reason: 'Metrics confirmed.' } });
    expect(confirmed.statusCode).toBe(200);
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'CONFIRM_PLATFORM_INCIDENT', expectedVersion: 1,
      actor: { id: centralUserId, roles: ['CENTRAL_ADMIN'] },
      payload: { incidentId, reason: 'Metrics confirmed.' },
    });

    const rejected = await app.inject({ method: 'POST',
      url: `/api/v1/central/platform-incidents/${incidentId}/reject`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'reject-incident-1',
        'if-match': '1' }, payload: { reason: 'False positive.' } });
    expect(rejected.statusCode).toBe(200);
    expect(reject.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'REJECT_PLATFORM_INCIDENT', expectedVersion: 1,
    });

    const resolved = await app.inject({ method: 'POST',
      url: `/api/v1/central/platform-incidents/${incidentId}/resolve`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'resolve-incident-1',
        'if-match': '2' }, payload: { endedAt: '2026-10-02T10:37:00.000Z',
        reason: 'Recovery confirmed.' } });
    expect(resolved.statusCode).toBe(200);
    expect(resolve.mock.calls[0]?.[0]).toMatchObject({
      commandType: 'RESOLVE_PLATFORM_INCIDENT', expectedVersion: 2,
      payload: { incidentId, endedAt: '2026-10-02T10:37:00.000Z' },
    });

    await app.ready();
    expect(app.swagger().paths).toHaveProperty('/api/v1/central/platform-incidents');
    expect(app.swagger().paths).toHaveProperty(
      '/api/v1/central/platform-incidents/{incidentId}/resolve',
    );
  });

  it('requires Central auth, Idempotency-Key and If-Match', async () => {
    const app = await buildApp({ platformIncident: {
      centralAuth: new StaticBearerAuthAdapter(token, centralUserId),
      list: vi.fn(), confirm: vi.fn(), reject: vi.fn(), resolve: vi.fn(),
    } });
    apps.push(app);
    const unauthenticated = await app.inject({ method: 'GET',
      url: '/api/v1/central/platform-incidents' });
    expect(unauthenticated.statusCode).toBe(401);
    const missingConcurrency = await app.inject({ method: 'POST',
      url: `/api/v1/central/platform-incidents/${incidentId}/confirm`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'confirm-no-version' },
      payload: { reason: 'Metrics confirmed.' } });
    expect(missingConcurrency.statusCode).toBe(400);
  });
});
