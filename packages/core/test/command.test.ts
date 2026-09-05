import { describe, expect, it } from 'vitest';

import {
  InvalidCommandEnvelopeError,
  assertCommandEnvelope,
  commandIdempotencyScope,
  type CommandEnvelope,
} from '../src/index.js';

const command: CommandEnvelope<{ readonly value: number }> = {
  commandId: '0199-7000-command',
  commandType: 'INCREMENT_PROBE',
  idempotencyKey: 'probe-1',
  actor: {
    type: 'USER',
    id: '0199-7000-actor',
    roles: ['ATHLETE'],
    scopeIds: ['0199-7000-community'],
  },
  aggregateType: 'PlatformProbe',
  aggregateId: '0199-7000-aggregate',
  expectedVersion: 0,
  correlationId: '0199-7000-correlation',
  causationId: null,
  requestId: 'request-1',
  source: 'api',
  payloadVersion: 1,
  payload: { value: 1 },
};

describe('command envelope', () => {
  it('accepts a complete critical command and derives actor-command scope', () => {
    expect(() => assertCommandEnvelope(command)).not.toThrow();
    expect(commandIdempotencyScope(command)).toBe(
      'USER:0199-7000-actor:INCREMENT_PROBE',
    );
  });

  it('rejects invalid versions before a transaction starts', () => {
    expect(() =>
      assertCommandEnvelope({ ...command, expectedVersion: -1 }),
    ).toThrowError(InvalidCommandEnvelopeError);
    expect(() =>
      assertCommandEnvelope({ ...command, payloadVersion: 0 }),
    ).toThrowError(InvalidCommandEnvelopeError);
  });

  it('requires a concrete actor for non-system commands', () => {
    expect(() =>
      assertCommandEnvelope({
        ...command,
        actor: { ...command.actor, id: null },
      }),
    ).toThrowError(InvalidCommandEnvelopeError);
  });
});
