import { createHmac } from 'node:crypto';

function assertSecret(secret: string): void {
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new RangeError('Authentication secret must contain at least 32 bytes');
  }
}

function input(purpose: string, parts: readonly string[]): string {
  return [purpose, ...parts.map((part) => `${Buffer.byteLength(part, 'utf8')}:${part}`)].join('|');
}

function hmac(secret: string, purpose: string, parts: readonly string[]): Buffer {
  assertSecret(secret);
  return createHmac('sha256', secret).update(input(purpose, parts), 'utf8').digest();
}

export function deriveOtpCode(
  secret: string,
  phoneE164: string,
  idempotencyKey: string,
): string {
  const digest = hmac(secret, 'otp-code-v1', [phoneE164, idempotencyKey]);
  return (digest.readUInt32BE(0) % 1_000_000).toString().padStart(6, '0');
}

export function otpVerifierHash(secret: string, challengeId: string, code: string): string {
  return hmac(secret, 'otp-verifier-v1', [challengeId, code]).toString('hex');
}

export function deriveOpaqueToken(
  secret: string,
  purpose: 'access-token-v1' | 'refresh-token-v1' | 'session-reference-v1',
  parts: readonly string[],
): string {
  return hmac(secret, purpose, parts).toString('base64url');
}

export function deriveUuid(secret: string, purpose: string, parts: readonly string[]): string {
  const bytes = hmac(secret, `uuid:${purpose}`, parts).subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
