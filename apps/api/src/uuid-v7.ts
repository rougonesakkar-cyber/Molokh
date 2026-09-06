import { randomBytes } from 'node:crypto';

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
