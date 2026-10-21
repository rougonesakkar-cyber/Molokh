import { describe, expect, it } from 'vitest';

import {
  EvidenceConflictError,
  EvidenceValidationError,
  canAccessEvidenceOriginal,
  evidenceMaximumAggregateBytes,
  evidenceStateForScan,
  normalizeEvidenceSubmission,
} from '../src/evidence.js';

describe('Evidence policy', () => {
  it('[AC-181][INV-OPS-10][INV-OPS-11] accepts allowlisted media within frozen limits', () => {
    expect(normalizeEvidenceSubmission({ declaredMimeType: 'video/mp4', detectedMimeType: 'video/mp4',
      sizeBytes: 20 * 1024 * 1024, durationSeconds: 59, existingCount: 4,
      existingAggregateBytes: 79 * 1024 * 1024 })).toMatchObject({ mediaKind: 'VIDEO' });
    expect(evidenceStateForScan('CLEAN')).toBe('AVAILABLE');
    expect(canAccessEvidenceOriginal({ state: 'AVAILABLE', viewerUserId: 'submitter',
      submitterUserId: 'submitter', viewerIsCentral: false })).toBe(true);
    expect(canAccessEvidenceOriginal({ state: 'AVAILABLE', viewerUserId: 'opponent',
      submitterUserId: 'submitter', viewerIsCentral: false })).toBe(false);
  });

  it('[AC-182] rejects unsafe inputs and quarantines every non-clean scan', () => {
    expect(() => normalizeEvidenceSubmission({ declaredMimeType: 'application/pdf',
      detectedMimeType: 'application/pdf', sizeBytes: 100, durationSeconds: null,
      existingCount: 0, existingAggregateBytes: 0 })).toThrow(EvidenceValidationError);
    expect(() => normalizeEvidenceSubmission({ declaredMimeType: 'image/jpeg',
      detectedMimeType: 'image/jpeg', sizeBytes: 1, durationSeconds: null,
      existingCount: 5, existingAggregateBytes: 5 })).toThrow(EvidenceConflictError);
    expect(() => normalizeEvidenceSubmission({ declaredMimeType: 'image/jpeg',
      detectedMimeType: 'image/jpeg', sizeBytes: 2, durationSeconds: null,
      existingCount: 1, existingAggregateBytes: evidenceMaximumAggregateBytes - 1 }))
      .toThrow(EvidenceConflictError);
    expect(evidenceStateForScan('UNCERTAIN')).toBe('QUARANTINED');
    expect(canAccessEvidenceOriginal({ state: 'QUARANTINED', viewerUserId: 'submitter',
      submitterUserId: 'submitter', viewerIsCentral: false })).toBe(false);
  });
});
