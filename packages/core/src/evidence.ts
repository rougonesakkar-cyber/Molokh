export const evidenceMaximumAttachments = 5;
export const evidenceMaximumAggregateBytes = 100 * 1024 * 1024;
export const evidenceMaximumDurationSeconds = 60;

export const evidenceAllowedMimeTypes = [
  'image/jpeg', 'image/png', 'image/webp',
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm',
  'video/mp4', 'video/webm', 'video/quicktime',
] as const;

export type EvidenceAllowedMimeType = typeof evidenceAllowedMimeTypes[number];
export type EvidenceScopeType = 'RESULT_APPEAL' | 'SAFETY_CASE';
export type EvidenceAttachmentState = 'PENDING_SCAN' | 'AVAILABLE' | 'QUARANTINED';
export type EvidenceScanOutcome = 'CLEAN' | 'MALWARE' | 'CONTENT_REJECTED' | 'TYPE_REJECTED' | 'UNCERTAIN';

export class EvidenceValidationError extends Error {
  readonly code: 'EVIDENCE_TYPE_NOT_ALLOWED' | 'EVIDENCE_DURATION_EXCEEDED' | 'EVIDENCE_INPUT_INVALID';
  constructor(code: EvidenceValidationError['code']) {
    super(code);
    this.name = 'EvidenceValidationError';
    this.code = code;
  }
}

export class EvidencePermissionDeniedError extends Error {
  readonly code = 'EVIDENCE_PERMISSION_DENIED' as const;
  constructor() { super('Evidence action is outside the actor scope'); this.name = 'EvidencePermissionDeniedError'; }
}

export class EvidenceConflictError extends Error {
  constructor(readonly code:
    | 'EVIDENCE_LIMIT_EXCEEDED'
    | 'EVIDENCE_SCOPE_CLOSED'
    | 'EVIDENCE_NOT_FOUND'
    | 'EVIDENCE_SCAN_STATE_INVALID') {
    super(code);
    this.name = 'EvidenceConflictError';
  }
}

export interface EvidenceSubmissionInput {
  readonly declaredMimeType: string;
  readonly detectedMimeType: string;
  readonly sizeBytes: number;
  readonly durationSeconds: number | null;
  readonly existingCount: number;
  readonly existingAggregateBytes: number;
}

export interface NormalizedEvidenceSubmission {
  readonly declaredMimeType: EvidenceAllowedMimeType;
  readonly detectedMimeType: EvidenceAllowedMimeType;
  readonly mediaKind: 'IMAGE' | 'AUDIO' | 'VIDEO';
  readonly sizeBytes: number;
  readonly durationSeconds: number | null;
}

function allowedMime(value: string): value is EvidenceAllowedMimeType {
  return (evidenceAllowedMimeTypes as readonly string[]).includes(value);
}

export function normalizeEvidenceSubmission(
  input: EvidenceSubmissionInput,
): NormalizedEvidenceSubmission {
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0
    || !Number.isSafeInteger(input.existingCount) || input.existingCount < 0
    || !Number.isSafeInteger(input.existingAggregateBytes) || input.existingAggregateBytes < 0) {
    throw new EvidenceValidationError('EVIDENCE_INPUT_INVALID');
  }
  if (input.existingCount >= evidenceMaximumAttachments
    || input.existingAggregateBytes + input.sizeBytes > evidenceMaximumAggregateBytes) {
    throw new EvidenceConflictError('EVIDENCE_LIMIT_EXCEEDED');
  }
  const declared = input.declaredMimeType.trim().toLowerCase();
  const detected = input.detectedMimeType.trim().toLowerCase();
  if (!allowedMime(declared) || !allowedMime(detected) || declared !== detected) {
    throw new EvidenceValidationError('EVIDENCE_TYPE_NOT_ALLOWED');
  }
  const mediaKind = detected.startsWith('image/') ? 'IMAGE'
    : detected.startsWith('audio/') ? 'AUDIO' : 'VIDEO';
  if (mediaKind === 'IMAGE') {
    if (input.durationSeconds !== null) throw new EvidenceValidationError('EVIDENCE_INPUT_INVALID');
  } else if (input.durationSeconds === null || !Number.isFinite(input.durationSeconds)
    || input.durationSeconds <= 0 || input.durationSeconds > evidenceMaximumDurationSeconds) {
    throw new EvidenceValidationError('EVIDENCE_DURATION_EXCEEDED');
  }
  return { declaredMimeType: declared, detectedMimeType: detected, mediaKind,
    sizeBytes: input.sizeBytes, durationSeconds: input.durationSeconds };
}

export function evidenceStateForScan(outcome: EvidenceScanOutcome): Exclude<EvidenceAttachmentState, 'PENDING_SCAN'> {
  return outcome === 'CLEAN' ? 'AVAILABLE' : 'QUARANTINED';
}

export function canAccessEvidenceOriginal(input: {
  readonly state: EvidenceAttachmentState;
  readonly viewerUserId: string;
  readonly submitterUserId: string;
  readonly viewerIsCentral: boolean;
}): boolean {
  if (input.viewerIsCentral) return true;
  return input.state === 'AVAILABLE' && input.viewerUserId === input.submitterUserId;
}
