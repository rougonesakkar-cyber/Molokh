export const CHAT_POLICY_VERSION = 'chat-mvp-v1' as const;
export const PERSONAL_MESSAGE_EDIT_MINUTES = 15;
export const PERSONAL_MESSAGE_MAX_LENGTH = 2_000;

export type ChatScope = 'PERSONAL_MATCH' | 'CHALLENGE_SERVICE';
export type ChatState = 'OPEN' | 'ARCHIVED' | 'READ_ONLY' | 'CLOSED';
export type ChatMessagePayloadType = 'PERSONAL_TEXT' | 'SERVICE' | 'ACTION';
export type ChatMessageState = 'ACTIVE' | 'HIDDEN_BY_MODERATION';

export type ChatActionDenialCode =
  | 'CHAT_NOT_FOUND'
  | 'CHAT_PARTICIPANT_REQUIRED'
  | 'CHAT_CLOSED'
  | 'CHAT_READ_ONLY'
  | 'PAIR_BLOCKED'
  | 'MESSAGE_NOT_FOUND'
  | 'MESSAGE_SENDER_REQUIRED'
  | 'MESSAGE_EDIT_WINDOW_CLOSED'
  | 'SERVICE_MESSAGE_IMMUTABLE'
  | 'MESSAGE_REPORTED'
  | 'REPORT_SELF_NOT_ALLOWED'
  | 'MESSAGE_ALREADY_REPORTED'
  | 'MESSAGE_ALREADY_HIDDEN'
  | 'MESSAGE_CONTENT_INVALID'
  | 'REPORT_REASON_INVALID'
  | 'REPORT_SUBJECT_REQUIRED'
  | 'MODERATION_CENTRAL_REQUIRED'
  | 'MODERATION_CENTRAL_UNAVAILABLE';

export class ChatActionDeniedError extends Error {
  readonly code: ChatActionDenialCode;

  constructor(readonly reason: ChatActionDenialCode) {
    super(`Chat action is not allowed: ${reason}`);
    this.name = 'ChatActionDeniedError';
    this.code = reason;
  }
}

function assertValidDate(value: Date, field: string): void {
  if (!Number.isFinite(value.getTime())) throw new RangeError(`${field} must be a valid date`);
}

export function normalizePersonalMessageText(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > PERSONAL_MESSAGE_MAX_LENGTH) {
    throw new ChatActionDeniedError('MESSAGE_CONTENT_INVALID');
  }
  return normalized;
}

export function personalMessageEditDeadline(createdAt: Date): Date {
  assertValidDate(createdAt, 'createdAt');
  return new Date(createdAt.getTime() + PERSONAL_MESSAGE_EDIT_MINUTES * 60 * 1_000);
}

export function assertChatAcceptsPayload(
  scope: ChatScope,
  state: ChatState,
  payloadType: ChatMessagePayloadType,
  actorType: 'USER' | 'SYSTEM' | 'PROVIDER',
): void {
  if (state === 'CLOSED') throw new ChatActionDeniedError('CHAT_CLOSED');
  if (payloadType === 'PERSONAL_TEXT') {
    if (actorType !== 'USER' || state === 'READ_ONLY') {
      throw new ChatActionDeniedError('CHAT_READ_ONLY');
    }
    return;
  }
  if (actorType !== 'SYSTEM') throw new ChatActionDeniedError('CHAT_READ_ONLY');
  if (state === 'READ_ONLY' && (scope !== 'CHALLENGE_SERVICE' || payloadType !== 'ACTION')) {
    throw new ChatActionDeniedError('CHAT_READ_ONLY');
  }
}

export function assertCanEditMessage(input: {
  readonly actorUserId: string;
  readonly senderUserId: string | null;
  readonly payloadType: ChatMessagePayloadType;
  readonly createdAt: Date;
  readonly reportedAt: Date | null;
  readonly occurredAt: Date;
}): void {
  if (input.payloadType !== 'PERSONAL_TEXT') {
    throw new ChatActionDeniedError('SERVICE_MESSAGE_IMMUTABLE');
  }
  if (input.actorUserId.trim().toLowerCase() !== input.senderUserId?.trim().toLowerCase()) {
    throw new ChatActionDeniedError('MESSAGE_SENDER_REQUIRED');
  }
  if (input.reportedAt) throw new ChatActionDeniedError('MESSAGE_REPORTED');
  assertValidDate(input.occurredAt, 'occurredAt');
  if (input.occurredAt >= personalMessageEditDeadline(input.createdAt)) {
    throw new ChatActionDeniedError('MESSAGE_EDIT_WINDOW_CLOSED');
  }
}

export function assertCanReportMessage(
  reporterUserId: string,
  senderUserId: string | null,
  reportedAt: Date | null,
): void {
  if (senderUserId === null) throw new ChatActionDeniedError('REPORT_SUBJECT_REQUIRED');
  if (reporterUserId.trim().toLowerCase() === senderUserId?.trim().toLowerCase()) {
    throw new ChatActionDeniedError('REPORT_SELF_NOT_ALLOWED');
  }
  if (reportedAt) throw new ChatActionDeniedError('MESSAGE_ALREADY_REPORTED');
}

export function normalizeChatReportReasonCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9_]{1,80}$/.test(normalized)) {
    throw new ChatActionDeniedError('REPORT_REASON_INVALID');
  }
  return normalized;
}
