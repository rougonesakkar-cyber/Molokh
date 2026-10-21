import type { EvidenceScopeType } from '@molokh/core';
import type { TrustedEvidenceObject } from '@molokh/db';

export interface EvidenceUploadIntentRequest {
  readonly attachmentId: string;
  readonly scopeType: EvidenceScopeType;
  readonly scopeId: string;
  readonly submitterUserId: string;
  readonly idempotencyKey: string;
  readonly fileName: string;
  readonly declaredMimeType: string;
  readonly sizeBytes: number;
  readonly durationSeconds: number | null;
  readonly sha256: string;
}

export interface EvidenceUploadTicket {
  readonly uploadReceiptId: string;
  readonly uploadUrl: string;
  readonly expiresAt: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
}

export interface EvidenceOriginalTicket {
  readonly downloadUrl: string;
  readonly expiresAt: string;
}

export interface EvidenceMediaPort {
  beginUpload(request: EvidenceUploadIntentRequest): Promise<EvidenceUploadTicket>;
  completeUpload(request: {
    readonly attachmentId: string;
    readonly scopeType: EvidenceScopeType;
    readonly scopeId: string;
    readonly submitterUserId: string;
    readonly uploadReceiptId: string;
  }): Promise<TrustedEvidenceObject>;
  createOriginalAccess(request: {
    readonly attachmentId: string;
    readonly objectReference: string;
    readonly encryptionKeyReference: string;
    readonly viewerUserId: string;
  }): Promise<EvidenceOriginalTicket>;
}

export class EvidenceMediaUnavailableError extends Error {
  readonly code = 'FEATURE_NOT_AVAILABLE' as const;
  constructor() { super('Evidence media provider is not enabled'); this.name = 'EvidenceMediaUnavailableError'; }
}

export class DisabledEvidenceMediaAdapter implements EvidenceMediaPort {
  async beginUpload(_request: EvidenceUploadIntentRequest): Promise<EvidenceUploadTicket> {
    throw new EvidenceMediaUnavailableError();
  }
  async completeUpload(_request: { readonly attachmentId: string; readonly scopeType: EvidenceScopeType;
    readonly scopeId: string; readonly submitterUserId: string; readonly uploadReceiptId: string }): Promise<TrustedEvidenceObject> {
    throw new EvidenceMediaUnavailableError();
  }
  async createOriginalAccess(_request: {
    readonly attachmentId: string; readonly objectReference: string;
    readonly encryptionKeyReference: string; readonly viewerUserId: string;
  }): Promise<EvidenceOriginalTicket> { throw new EvidenceMediaUnavailableError(); }
}
