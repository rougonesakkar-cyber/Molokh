import { createHash, randomBytes } from 'node:crypto';

export interface UuidV7Options {
  readonly timestamp?: number;
  readonly random?: Uint8Array;
}

function hex(value: number): string {
  return value.toString(16).padStart(2, '0');
}

export function newUuidV7(options: UuidV7Options = {}): string {
  const timestamp = options.timestamp ?? Date.now();
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 0xffffffffffff) {
    throw new RangeError('UUIDv7 timestamp must fit in 48 bits');
  }
  const random = options.random ?? randomBytes(10);
  if (random.length !== 10) throw new RangeError('UUIDv7 requires exactly 10 random bytes');

  const bytes = new Uint8Array(16);
  let milliseconds = BigInt(timestamp);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(milliseconds & 0xffn);
    milliseconds >>= 8n;
  }
  bytes.set(random, 6);
  bytes[6] = 0x70 | (bytes[6]! & 0x0f);
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);

  const encoded = [...bytes].map(hex).join('');
  return `${encoded.slice(0, 8)}-${encoded.slice(8, 12)}-${encoded.slice(12, 16)}-${encoded.slice(16, 20)}-${encoded.slice(20)}`;
}

const resourceNamespace = '0199a1b2-1234-5000-8000-000000000001';

function uuidBytes(value: string): Buffer {
  const compact = value.replaceAll('-', '');
  if (!/^[0-9a-f]{32}$/i.test(compact)) throw new TypeError('UUID namespace is invalid');
  return Buffer.from(compact, 'hex');
}

function encodeUuid(bytes: Uint8Array): string {
  const encoded = [...bytes].map(hex).join('');
  return `${encoded.slice(0, 8)}-${encoded.slice(8, 12)}-${encoded.slice(12, 16)}-${encoded.slice(16, 20)}-${encoded.slice(20)}`;
}

export function idempotentResourceId(
  resourceType: string,
  actorId: string,
  idempotencyKey: string,
): string {
  const type = resourceType.trim();
  const actor = actorId.trim().toLowerCase();
  const key = idempotencyKey.trim();
  if (!type || !actor || !key) throw new TypeError('Idempotent resource identity is incomplete');

  const digest = createHash('sha1')
    .update(uuidBytes(resourceNamespace))
    .update(`${type}:${actor}:${key}`, 'utf8')
    .digest();
  const bytes = Uint8Array.from(digest.subarray(0, 16));
  bytes[6] = 0x50 | (bytes[6]! & 0x0f);
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  return encodeUuid(bytes);
}
