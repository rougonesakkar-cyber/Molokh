import type { EvidenceAttachmentProjection } from '@molokh/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import { StaticBearerAuthAdapter } from '../src/auth.js';
import type { EvidenceMediaPort } from '../src/evidence-media.js';

const userId = '0199a1b2-1234-7000-8000-000000008101';
const scopeId = '0199a1b2-1234-7000-8000-000000008102';
const attachmentId = '0199a1b2-1234-7000-8000-000000008103';

function projection(): EvidenceAttachmentProjection {
  return { attachmentId, scopeType: 'RESULT_APPEAL', scopeId,
    submitterUserId: userId, state: 'PENDING_SCAN', fileName: 'round.mp4',
    mediaKind: 'VIDEO', mimeType: 'video/mp4', sizeBytes: 1024,
    durationSeconds: 12, submittedAt: '2026-10-21T10:00:00.000Z', scannedAt: null,
    canAccessOriginal: false, version: 1 };
}

describe('Evidence routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('[AC-181][AC-182] creates a provider-independent upload intent and canonical PENDING_SCAN attachment', async () => {
    const media: EvidenceMediaPort = {
      beginUpload: vi.fn(async (request) => ({ uploadReceiptId: `receipt:${request.attachmentId}`,
        uploadUrl: 'https://disabled.example.test/private-upload',
        expiresAt: '2026-10-21T10:15:00.000Z', requiredHeaders: { 'x-private': '1' } })),
      completeUpload: vi.fn(async (request) => ({ storageReceiptId: request.uploadReceiptId,
        originalFileName: 'round.mp4', declaredMimeType: 'video/mp4',
        detectedMimeType: 'video/mp4', sizeBytes: 1024, durationSeconds: 12,
        objectReference: 'private/object/1', checksumSha256: 'a'.repeat(64),
        encryptionKeyReference: 'private/key/1' })),
      createOriginalAccess: vi.fn(async () => ({ downloadUrl: 'https://disabled.example.test/private-download',
        expiresAt: '2026-10-21T10:05:00.000Z' })),
    };
    const submit = vi.fn().mockResolvedValue({ responseStatus: 201, response: projection(),
      eventId: '0199a1b2-1234-7000-8000-000000008104', aggregateVersion: 1, replayed: false });
    const app = await buildApp({ evidence: { auth: new StaticBearerAuthAdapter('evidence-media-token', userId),
      media, prepare: vi.fn().mockResolvedValue({ scopeType: 'RESULT_APPEAL', scopeId,
        scopeVersion: 2, attachmentCount: 0, aggregateSizeBytes: 0,
        maximumAttachments: 5, maximumAggregateBytes: 100 * 1024 * 1024 }),
      submit, list: vi.fn().mockResolvedValue([projection()]),
      readOriginalAccess: vi.fn().mockResolvedValue({ attachmentId,
        scopeType: 'RESULT_APPEAL', scopeId,
        objectReference: 'private/object/1', encryptionKeyReference: 'private/key/1',
        fileName: 'round.mp4', mimeType: 'video/mp4' }) } });
    apps.push(app);

    const intent = await app.inject({ method: 'POST',
      url: `/api/v1/evidence/RESULT_APPEAL/${scopeId}/upload-intents`,
      headers: { authorization: 'Bearer evidence-media-token', 'idempotency-key': 'evidence-1' },
      payload: { fileName: 'round.mp4', declaredMimeType: 'video/mp4', sizeBytes: 1024,
        durationSeconds: 12, sha256: 'a'.repeat(64) } });
    expect(intent.statusCode).toBe(201);
    const generatedAttachmentId = intent.json().data.attachmentId as string;
    expect(intent.json()).toMatchObject({ data: { scanPolicyVersion: 'evidence-scan-v1',
      scopeVersion: 2 } });

    const completed = await app.inject({ method: 'POST',
      url: `/api/v1/evidence/RESULT_APPEAL/${scopeId}/attachments/${generatedAttachmentId}/complete`,
      headers: { authorization: 'Bearer evidence-media-token', 'idempotency-key': 'evidence-1',
        'if-match': '2' }, payload: { uploadReceiptId: `receipt:${generatedAttachmentId}` } });
    expect(completed.statusCode).toBe(201);
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 0,
      payload: expect.objectContaining({ scopeType: 'RESULT_APPEAL', scopeId,
        expectedScopeVersion: 2, object: expect.objectContaining({
          objectReference: 'private/object/1', detectedMimeType: 'video/mp4' }) }) }),
    expect.any(Object));
    expect(JSON.stringify(completed.json())).not.toContain('private/object');

    const listed = await app.inject({ method: 'GET',
      url: `/api/v1/evidence/RESULT_APPEAL/${scopeId}/attachments`,
      headers: { authorization: 'Bearer evidence-media-token' } });
    expect(listed.json()).toMatchObject({ data: [{ state: 'PENDING_SCAN',
      canAccessOriginal: false }] });
  });
});
