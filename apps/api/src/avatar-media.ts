export const avatarUploadMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AvatarUploadMimeType = typeof avatarUploadMimeTypes[number];
export const avatarUploadMaxBytes = 10 * 1024 * 1024;

export interface AvatarUploadRequest {
  readonly userId: string;
  readonly idempotencyKey: string;
  readonly mimeType: AvatarUploadMimeType;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface AvatarUploadTicket {
  readonly assetId: string;
  readonly state: 'PENDING_UPLOAD';
  readonly uploadUrl: string;
  readonly expiresAt: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
  readonly scanPolicyVersion: 'avatar-scan-v1';
}

/**
 * Provider boundary only. Implementations must keep objects private, verify the uploaded checksum
 * and arrange malware, detected-type and content scanning. A ticket never publishes or attaches
 * an avatar; that requires a separate future handler accepting only a verified AVAILABLE result.
 */
export interface AvatarMediaPort {
  beginUpload(request: AvatarUploadRequest): Promise<AvatarUploadTicket>;
}

export class AvatarMediaUnavailableError extends Error {
  readonly code = 'FEATURE_NOT_AVAILABLE';

  constructor() {
    super('Avatar upload is not enabled');
    this.name = 'AvatarMediaUnavailableError';
  }
}

export class DisabledAvatarMediaAdapter implements AvatarMediaPort {
  async beginUpload(_request: AvatarUploadRequest): Promise<AvatarUploadTicket> {
    throw new AvatarMediaUnavailableError();
  }
}
