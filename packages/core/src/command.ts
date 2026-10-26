export type ActorType = 'USER' | 'SYSTEM' | 'PROVIDER' | 'EXTERNAL';
export type CommandSource = 'api' | 'scheduler' | 'admin';

export interface ActorSnapshot {
  readonly type: ActorType;
  readonly id: string | null;
  readonly roles: readonly string[];
  readonly scopeIds: readonly string[];
}

export interface CommandEnvelope<TPayload> {
  readonly commandId: string;
  readonly commandType: string;
  readonly idempotencyKey: string;
  readonly actor: ActorSnapshot;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly expectedVersion: number;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly requestId: string;
  readonly source: CommandSource;
  readonly payloadVersion: number;
  readonly payload: TPayload;
}

export class InvalidCommandEnvelopeError extends Error {
  readonly code = 'INVALID_COMMAND_ENVELOPE';

  constructor(readonly field: string) {
    super(`Command envelope field ${field} is invalid`);
    this.name = 'InvalidCommandEnvelopeError';
  }
}

export class IdempotencyKeyReusedError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSED';

  constructor(readonly scope: string) {
    super(`Idempotency key was reused with a different request in scope ${scope}`);
    this.name = 'IdempotencyKeyReusedError';
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new InvalidCommandEnvelopeError(field);
  }
}

export function assertCommandEnvelope<TPayload>(
  command: CommandEnvelope<TPayload>,
): void {
  assertNonEmpty(command.commandId, 'commandId');
  assertNonEmpty(command.commandType, 'commandType');
  assertNonEmpty(command.idempotencyKey, 'idempotencyKey');
  assertNonEmpty(command.aggregateType, 'aggregateType');
  assertNonEmpty(command.aggregateId, 'aggregateId');
  assertNonEmpty(command.correlationId, 'correlationId');
  assertNonEmpty(command.requestId, 'requestId');

  if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0) {
    throw new InvalidCommandEnvelopeError('expectedVersion');
  }

  if (!Number.isSafeInteger(command.payloadVersion) || command.payloadVersion < 1) {
    throw new InvalidCommandEnvelopeError('payloadVersion');
  }

  if (command.actor.type === 'SYSTEM' && command.actor.id !== null) {
    throw new InvalidCommandEnvelopeError('actor.id');
  }

  if (command.actor.type !== 'SYSTEM') {
    if (command.actor.id === null) {
      throw new InvalidCommandEnvelopeError('actor.id');
    }
    assertNonEmpty(command.actor.id, 'actor.id');
  }
}

export function commandIdempotencyScope<TPayload>(
  command: CommandEnvelope<TPayload>,
): string {
  const actorIdentity = command.actor.id ?? 'SYSTEM';
  return `${command.actor.type}:${actorIdentity}:${command.commandType}`;
}
