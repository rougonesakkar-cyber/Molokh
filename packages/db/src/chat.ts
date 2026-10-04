import {
  CHAT_POLICY_VERSION,
  ChatActionDeniedError,
  assertCanEditMessage,
  assertCanReportMessage,
  assertChatAcceptsPayload,
  normalizePersonalMessageText,
  normalizeSocialPair,
  type ChatMessagePayloadType,
  type ChatMessageState,
  type ChatScope,
  type ChatState,
  type CommandEnvelope,
} from '@molokh/core';
import { type Kysely, type Transaction, sql } from 'kysely';

import type { Database } from './index.js';
import {
  executeCriticalCommand,
  type ExecutedCommand,
  type RelatedDomainEventDraft,
} from './platform-command.js';
import { matchTimerPayload } from './social.js';

export interface PersonalTextContent {
  readonly kind: 'PERSONAL_TEXT';
  readonly text: string;
}

export interface ServiceMessageContent {
  readonly kind: 'SERVICE';
  readonly renderKey: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface ActionCardContent {
  readonly kind: 'ACTION';
  readonly actionType: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly stateVersion: number;
  readonly renderKey: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export type ChatMessageContent =
  | PersonalTextContent
  | ServiceMessageContent
  | ActionCardContent;

export interface SendChatMessagePayload {
  readonly chatId: string;
  readonly content: ChatMessageContent;
}

export interface EditChatMessagePayload {
  readonly messageId: string;
  readonly text: string;
}

export interface HideChatMessagePayload {
  readonly messageId: string;
}

export interface ReportChatMessagePayload {
  readonly messageId: string;
  readonly reasonCode: string;
}

export interface ChatMessageProjection {
  readonly messageId: string;
  readonly chatId: string;
  readonly senderUserId: string | null;
  readonly senderDisplayName: string | null;
  readonly payloadType: ChatMessagePayloadType;
  readonly content: ChatMessageContent;
  readonly state: ChatMessageState;
  readonly revisionNo: number;
  readonly edited: boolean;
  readonly reported: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface ChatMessagePage {
  readonly messages: readonly ChatMessageProjection[];
  readonly chatState: ChatState;
  readonly nextCursor: string | null;
}

export interface HiddenMessageProjection {
  readonly action: 'HIDDEN_FOR_USER';
  readonly messageId: string;
  readonly hiddenAt: string;
}

export interface ReportedMessageProjection {
  readonly action: 'REPORTED';
  readonly messageId: string;
  readonly reportId: string;
  readonly state: 'PENDING_CENTRAL';
  readonly reportedAt: string;
  readonly version: number;
}

export interface SendChatMessageEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly revisionId: string;
  readonly matchEventId: string;
  readonly chatEventId: string;
}

export interface EditChatMessageEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly revisionId: string;
}

export interface HideChatMessageEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
}

export interface ReportChatMessageEffectIds extends HideChatMessageEffectIds {
  readonly reportId: string;
}

interface ChatRow {
  readonly chat_id: string;
  readonly scope: ChatScope;
  readonly state: ChatState;
  readonly version: string;
  readonly match_id: string | null;
  readonly match_state: 'ACTIVE' | 'ARCHIVED' | 'UNMATCHED' | 'BLOCKED' | null;
  readonly match_version: string | null;
  readonly match_last_activity_at: Date | null;
}

interface MessageRow {
  readonly message_id: string;
  readonly chat_id: string;
  readonly sender_user_id: string | null;
  readonly sender_display_name: string | null;
  readonly payload_type: ChatMessagePayloadType;
  readonly payload: ChatMessageContent;
  readonly state: ChatMessageState;
  readonly revision_no: number;
  readonly reported_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly version: string;
}

function payloadType(content: ChatMessageContent): ChatMessagePayloadType {
  return content.kind;
}

function normalizedContent(content: ChatMessageContent): ChatMessageContent {
  if (content.kind === 'PERSONAL_TEXT') {
    return { kind: 'PERSONAL_TEXT', text: normalizePersonalMessageText(content.text) };
  }
  if (!content.renderKey.trim()) throw new RangeError('renderKey is required');
  if (content.kind === 'SERVICE') {
    return { ...content, renderKey: content.renderKey.trim() };
  }
  if (
    !content.actionType.trim() ||
    !content.resourceType.trim() ||
    !content.resourceId.trim() ||
    !Number.isSafeInteger(content.stateVersion) ||
    content.stateVersion < 1
  ) {
    throw new RangeError('Action card identity is invalid');
  }
  return {
    ...content,
    actionType: content.actionType.trim(),
    resourceType: content.resourceType.trim(),
    renderKey: content.renderKey.trim(),
  };
}

function projection(row: MessageRow): ChatMessageProjection {
  return {
    messageId: row.message_id,
    chatId: row.chat_id,
    senderUserId: row.sender_user_id,
    senderDisplayName: row.sender_display_name,
    payloadType: row.payload_type,
    content: row.payload,
    state: row.state,
    revisionNo: row.revision_no,
    edited: row.revision_no > 1,
    reported: row.reported_at !== null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    version: Number(row.version),
  };
}

async function chatParticipants(
  transaction: Transaction<Database>,
  chatId: string,
): Promise<readonly string[]> {
  const result = await sql<{ readonly user_id: string }>`
    select user_id
    from social.chat_participants
    where chat_id = ${chatId}::uuid
    order by user_id
  `.execute(transaction);
  return result.rows.map((row) => row.user_id);
}

async function lockParticipantPair(
  transaction: Transaction<Database>,
  participants: readonly string[],
): Promise<void> {
  if (participants.length !== 2) return;
  const pair = normalizeSocialPair(participants[0]!, participants[1]!);
  await sql`
    select pg_advisory_xact_lock(hashtextextended(${'SocialPair:' + pair.key}, 0))
  `.execute(transaction);
}

function assertParticipant(participants: readonly string[], userId: string): void {
  if (!participants.includes(userId)) {
    throw new ChatActionDeniedError('CHAT_PARTICIPANT_REQUIRED');
  }
}

async function assertPairNotBlocked(
  transaction: Transaction<Database>,
  participants: readonly string[],
): Promise<void> {
  if (participants.length !== 2) return;
  const result = await sql<{ readonly blocked: boolean }>`
    select exists (
      select 1
      from social.blocks
      where state = 'ACTIVE'
        and blocker_user_id in (${participants[0]}::uuid, ${participants[1]}::uuid)
        and blocked_user_id in (${participants[0]}::uuid, ${participants[1]}::uuid)
    ) as blocked
  `.execute(transaction);
  if (result.rows[0]?.blocked) throw new ChatActionDeniedError('PAIR_BLOCKED');
}

async function lockedChat(
  transaction: Transaction<Database>,
  chatId: string,
): Promise<ChatRow> {
  const result = await sql<ChatRow>`
    select
      chat.chat_id, chat.scope, chat.state, chat.version::text as version,
      matched.match_id, matched.state as match_state,
      matched.version::text as match_version,
      matched.last_activity_at as match_last_activity_at
    from social.chats as chat
    left join social.matches as matched on matched.chat_id = chat.chat_id
    where chat.chat_id = ${chatId}::uuid
    for update of chat
  `.execute(transaction);
  const row = result.rows[0];
  if (!row) throw new ChatActionDeniedError('CHAT_NOT_FOUND');
  return row;
}

export async function sendChatMessage(
  database: Kysely<Database>,
  command: CommandEnvelope<SendChatMessagePayload>,
  ids: SendChatMessageEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<ChatMessageProjection>> {
  if (command.aggregateType !== 'ChatMessage') {
    throw new ChatActionDeniedError('CHAT_NOT_FOUND');
  }
  const content = normalizedContent(command.payload.content);
  return executeCriticalCommand<SendChatMessagePayload, ChatMessageProjection>(database, {
    command: { ...command, payload: { ...command.payload, content } },
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const participants = await chatParticipants(transaction, command.payload.chatId);
      await lockParticipantPair(transaction, participants);
      const chat = await lockedChat(transaction, command.payload.chatId);
      const type = payloadType(content);
      if (command.actor.type === 'EXTERNAL') {
        throw new ChatActionDeniedError('CHAT_PARTICIPANT_REQUIRED');
      }
      assertChatAcceptsPayload(chat.scope, chat.state, type, command.actor.type);
      if (command.actor.type === 'USER') {
        if (!command.actor.id) throw new ChatActionDeniedError('CHAT_PARTICIPANT_REQUIRED');
        assertParticipant(participants, command.actor.id);
        await assertPairNotBlocked(transaction, participants);
      }

      const senderResult = command.actor.id
        ? await sql<{ readonly display_name: string }>`
            select display_name from identity.users where user_id = ${command.actor.id}::uuid
          `.execute(transaction)
        : null;
      const senderDisplayName = senderResult?.rows[0]?.display_name ?? null;
      await sql`
        insert into social.chat_messages (
          message_id, chat_id, sender_user_id, payload_type, current_revision_id,
          state, reported_at, version, created_at, updated_at
        ) values (
          ${command.aggregateId}::uuid, ${chat.chat_id}::uuid,
          ${command.actor.id}::uuid, ${type}, ${ids.revisionId}::uuid,
          'ACTIVE', null, ${context.nextVersion},
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into social.chat_message_revisions (
          revision_id, message_id, revision_no, payload, created_by, created_at
        ) values (
          ${ids.revisionId}::uuid, ${command.aggregateId}::uuid, 1,
          ${JSON.stringify(content)}::jsonb, ${command.actor.id}::uuid,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);

      const relatedEvents: RelatedDomainEventDraft[] = [];
      let inactivityTimer: ReturnType<typeof matchTimerPayload> | null = null;
      if (chat.match_id) {
        if (chat.match_state === 'ARCHIVED') {
          const matchVersion = Number(chat.match_version) + 1;
          const chatVersion = Number(chat.version) + 1;
          await sql`
            update social.matches
            set state = 'ACTIVE', last_activity_at = ${context.occurredAt.toISOString()}::timestamptz,
                version = ${matchVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
            where match_id = ${chat.match_id}::uuid and state = 'ARCHIVED'
          `.execute(transaction);
          await sql`
            update social.chats
            set state = 'OPEN', version = ${chatVersion},
                updated_at = ${context.occurredAt.toISOString()}::timestamptz
            where chat_id = ${chat.chat_id}::uuid
          `.execute(transaction);
          relatedEvents.push(
            {
              eventId: ids.matchEventId,
              eventName: 'MatchReactivated',
              schemaVersion: 1,
              transitionId: 'MT-03',
              aggregateType: 'Match',
              aggregateId: chat.match_id,
              aggregateVersion: matchVersion,
              payload: { matchId: chat.match_id, messageId: command.aggregateId },
              metadata: { policyVersion: CHAT_POLICY_VERSION },
            },
            {
              eventId: ids.chatEventId,
              eventName: 'ChatReopened',
              schemaVersion: 1,
              transitionId: 'CT-03',
              aggregateType: 'Chat',
              aggregateId: chat.chat_id,
              aggregateVersion: chatVersion,
              payload: { chatId: chat.chat_id, messageId: command.aggregateId },
              metadata: { policyVersion: CHAT_POLICY_VERSION },
            },
          );
          inactivityTimer = matchTimerPayload(
            chat.match_id,
            matchVersion,
            context.occurredAt,
          );
        } else {
          await sql`
            update social.matches
            set last_activity_at = ${context.occurredAt.toISOString()}::timestamptz,
                updated_at = ${context.occurredAt.toISOString()}::timestamptz
            where match_id = ${chat.match_id}::uuid and state = 'ACTIVE'
          `.execute(transaction);
          if (chat.match_state === 'ACTIVE' && chat.match_version !== null) {
            inactivityTimer = matchTimerPayload(
              chat.match_id,
              Number(chat.match_version),
              context.occurredAt,
            );
          }
        }
      }

      const response: ChatMessageProjection = {
        messageId: command.aggregateId,
        chatId: chat.chat_id,
        senderUserId: command.actor.id,
        senderDisplayName,
        payloadType: type,
        content,
        state: 'ACTIVE',
        revisionNo: 1,
        edited: false,
        reported: false,
        createdAt: context.occurredAt.toISOString(),
        updatedAt: context.occurredAt.toISOString(),
        version: context.nextVersion,
      };
      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'ChatMessageSent',
          schemaVersion: 1,
          transitionId: 'MSG-01',
          payload: { messageId: command.aggregateId, chatId: chat.chat_id, payloadType: type },
          metadata: { policyVersion: CHAT_POLICY_VERSION },
        },
        relatedEvents,
        audit: {
          auditId: ids.auditId,
          action: 'SEND_CHAT_MESSAGE',
          transitionId: 'MSG-01',
          reasonCode: null,
          beforeState: null,
          afterState: 'ACTIVE',
          metadata: { chatId: chat.chat_id, payloadType: type },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'chat.message.sent.v1',
            payload: {
              messageId: command.aggregateId,
              chatId: chat.chat_id,
              senderUserId: command.actor.id,
              payloadType: type,
              ...(inactivityTimer ? { timer: inactivityTimer } : {}),
            },
          },
        ],
      };
    },
  });
}

export async function readChatMessages(
  database: Kysely<Database>,
  chatId: string,
  viewerUserId: string,
  limit: number,
  cursor: string | null,
): Promise<ChatMessagePage> {
  const participant = await sql<{ readonly chat_state: ChatState }>`
    select chat.state as chat_state
    from social.chats as chat
    join social.chat_participants as participant
      on participant.chat_id = chat.chat_id
    where chat.chat_id = ${chatId}::uuid
      and participant.user_id = ${viewerUserId}::uuid
    limit 1
  `.execute(database);
  const chatState = participant.rows[0]?.chat_state;
  if (!chatState) throw new ChatActionDeniedError('CHAT_PARTICIPANT_REQUIRED');

  const pageSize = Math.max(1, Math.min(100, Math.trunc(limit)));
  const result = cursor
    ? await sql<MessageRow>`
        select
          message.message_id, message.chat_id, message.sender_user_id,
          sender.display_name as sender_display_name, message.payload_type,
          revision.payload, message.state, revision.revision_no,
          message.reported_at, message.created_at, message.updated_at,
          message.version::text as version
        from social.chat_messages as message
        join social.chat_message_revisions as revision
          on revision.revision_id = message.current_revision_id
        left join identity.users as sender on sender.user_id = message.sender_user_id
        left join social.chat_message_user_visibility as visibility
          on visibility.message_id = message.message_id
         and visibility.user_id = ${viewerUserId}::uuid
        where message.chat_id = ${chatId}::uuid
          and message.state = 'ACTIVE'
          and revision.payload is not null
          and visibility.message_id is null
          and (message.created_at, message.message_id) < (
            select created_at, message_id from social.chat_messages where message_id = ${cursor}::uuid
          )
        order by message.created_at desc, message.message_id desc
        limit ${pageSize + 1}
      `.execute(database)
    : await sql<MessageRow>`
        select
          message.message_id, message.chat_id, message.sender_user_id,
          sender.display_name as sender_display_name, message.payload_type,
          revision.payload, message.state, revision.revision_no,
          message.reported_at, message.created_at, message.updated_at,
          message.version::text as version
        from social.chat_messages as message
        join social.chat_message_revisions as revision
          on revision.revision_id = message.current_revision_id
        left join identity.users as sender on sender.user_id = message.sender_user_id
        left join social.chat_message_user_visibility as visibility
          on visibility.message_id = message.message_id
         and visibility.user_id = ${viewerUserId}::uuid
        where message.chat_id = ${chatId}::uuid
          and message.state = 'ACTIVE'
          and revision.payload is not null
          and visibility.message_id is null
        order by message.created_at desc, message.message_id desc
        limit ${pageSize + 1}
      `.execute(database);
  const hasMore = result.rows.length > pageSize;
  const selected = result.rows.slice(0, pageSize);
  const nextCursor = hasMore ? selected.at(-1)?.message_id ?? null : null;
  return { messages: selected.reverse().map(projection), chatState, nextCursor };
}

async function lockedMessage(
  transaction: Transaction<Database>,
  messageId: string,
): Promise<MessageRow & { readonly chat_state: ChatState; readonly chat_scope: ChatScope }> {
  const result = await sql<MessageRow & { readonly chat_state: ChatState; readonly chat_scope: ChatScope }>`
    select
      message.message_id, message.chat_id, message.sender_user_id,
      sender.display_name as sender_display_name, message.payload_type,
      revision.payload, message.state, revision.revision_no,
      message.reported_at, message.created_at, message.updated_at,
      message.version::text as version, chat.state as chat_state, chat.scope as chat_scope
    from social.chat_messages as message
    join social.chat_message_revisions as revision
      on revision.revision_id = message.current_revision_id
    join social.chats as chat on chat.chat_id = message.chat_id
    left join identity.users as sender on sender.user_id = message.sender_user_id
    where message.message_id = ${messageId}::uuid
    for update of message
  `.execute(transaction);
  const row = result.rows[0];
  if (!row) throw new ChatActionDeniedError('MESSAGE_NOT_FOUND');
  return row;
}

export async function editChatMessage(
  database: Kysely<Database>,
  command: CommandEnvelope<EditChatMessagePayload>,
  ids: EditChatMessageEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<ChatMessageProjection>> {
  if (
    command.actor.id === null ||
    command.aggregateType !== 'ChatMessage' ||
    command.aggregateId !== command.payload.messageId
  ) {
    throw new ChatActionDeniedError('MESSAGE_SENDER_REQUIRED');
  }
  const text = normalizePersonalMessageText(command.payload.text);
  return executeCriticalCommand<EditChatMessagePayload, ChatMessageProjection>(database, {
    command: { ...command, payload: { ...command.payload, text } },
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const messageLookup = await sql<{ readonly chat_id: string }>`
        select chat_id from social.chat_messages where message_id = ${command.aggregateId}::uuid
      `.execute(transaction);
      const chatId = messageLookup.rows[0]?.chat_id;
      if (!chatId) throw new ChatActionDeniedError('MESSAGE_NOT_FOUND');
      const participants = await chatParticipants(transaction, chatId);
      await lockParticipantPair(transaction, participants);
      assertParticipant(participants, command.actor.id!);
      await assertPairNotBlocked(transaction, participants);
      const row = await lockedMessage(transaction, command.aggregateId);
      assertCanEditMessage({
        actorUserId: command.actor.id!,
        senderUserId: row.sender_user_id,
        payloadType: row.payload_type,
        createdAt: row.created_at,
        reportedAt: row.reported_at,
        occurredAt: context.occurredAt,
      });
      assertChatAcceptsPayload(row.chat_scope, row.chat_state, row.payload_type, 'USER');
      const revisionNo = row.revision_no + 1;
      const content: PersonalTextContent = { kind: 'PERSONAL_TEXT', text };
      await sql`
        insert into social.chat_message_revisions (
          revision_id, message_id, revision_no, payload, created_by, created_at
        ) values (
          ${ids.revisionId}::uuid, ${row.message_id}::uuid, ${revisionNo},
          ${JSON.stringify(content)}::jsonb, ${command.actor.id}::uuid,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        update social.chat_messages
        set current_revision_id = ${ids.revisionId}::uuid,
            version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where message_id = ${row.message_id}::uuid
      `.execute(transaction);
      const response: ChatMessageProjection = {
        ...projection(row),
        content,
        revisionNo,
        edited: true,
        updatedAt: context.occurredAt.toISOString(),
        version: context.nextVersion,
      };
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'ChatMessageEdited',
          schemaVersion: 1,
          transitionId: 'MSG-02',
          payload: { messageId: row.message_id, chatId: row.chat_id, revisionNo },
          metadata: { policyVersion: CHAT_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'EDIT_CHAT_MESSAGE',
          transitionId: 'MSG-02',
          reasonCode: null,
          beforeState: 'ACTIVE',
          afterState: 'ACTIVE',
          metadata: { chatId: row.chat_id, revisionNo },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'chat.message.edited.v1',
            payload: { messageId: row.message_id, chatId: row.chat_id, revisionNo },
          },
        ],
      };
    },
  });
}

export async function hideChatMessageForUser(
  database: Kysely<Database>,
  command: CommandEnvelope<HideChatMessagePayload>,
  ids: HideChatMessageEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<HiddenMessageProjection>> {
  if (command.actor.id === null || command.aggregateType !== 'ChatMessageVisibility') {
    throw new ChatActionDeniedError('CHAT_PARTICIPANT_REQUIRED');
  }
  return executeCriticalCommand<HideChatMessagePayload, HiddenMessageProjection>(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const messageResult = await sql<{ readonly chat_id: string }>`
        select chat_id from social.chat_messages where message_id = ${command.payload.messageId}::uuid
      `.execute(transaction);
      const chatId = messageResult.rows[0]?.chat_id;
      if (!chatId) throw new ChatActionDeniedError('MESSAGE_NOT_FOUND');
      const participants = await chatParticipants(transaction, chatId);
      assertParticipant(participants, command.actor.id!);
      const existing = await sql<{ readonly hidden_at: Date }>`
        select hidden_at
        from social.chat_message_user_visibility
        where message_id = ${command.payload.messageId}::uuid
          and user_id = ${command.actor.id}::uuid
      `.execute(transaction);
      if (existing.rows[0]) throw new ChatActionDeniedError('MESSAGE_ALREADY_HIDDEN');
      await sql`
        insert into social.chat_message_user_visibility (message_id, user_id, hidden_at)
        values (
          ${command.payload.messageId}::uuid, ${command.actor.id}::uuid,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      return {
        responseStatus: 200,
        response: {
          action: 'HIDDEN_FOR_USER',
          messageId: command.payload.messageId,
          hiddenAt: context.occurredAt.toISOString(),
        },
        event: {
          eventId: ids.eventId,
          eventName: 'ChatMessageHiddenForUser',
          schemaVersion: 1,
          transitionId: 'MSG-03',
          payload: { messageId: command.payload.messageId, chatId },
          metadata: { policyVersion: CHAT_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'HIDE_CHAT_MESSAGE_FOR_USER',
          transitionId: 'MSG-03',
          reasonCode: null,
          beforeState: 'VISIBLE',
          afterState: 'HIDDEN_FOR_USER',
          metadata: { messageId: command.payload.messageId, chatId },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'chat.message.hidden-for-user.v1',
            payload: { messageId: command.payload.messageId, chatId, userId: command.actor.id },
          },
        ],
      };
    },
  });
}

export async function reportChatMessage(
  database: Kysely<Database>,
  command: CommandEnvelope<ReportChatMessagePayload>,
  ids: ReportChatMessageEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<ReportedMessageProjection>> {
  if (
    command.actor.id === null ||
    command.aggregateType !== 'ChatMessage' ||
    command.aggregateId !== command.payload.messageId
  ) {
    throw new ChatActionDeniedError('CHAT_PARTICIPANT_REQUIRED');
  }
  const reasonCode = command.payload.reasonCode.trim();
  if (!reasonCode || reasonCode.length > 80) {
    throw new ChatActionDeniedError('REPORT_REASON_INVALID');
  }
  return executeCriticalCommand<ReportChatMessagePayload, ReportedMessageProjection>(database, {
    command: { ...command, payload: { ...command.payload, reasonCode } },
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const messageLookup = await sql<{ readonly chat_id: string }>`
        select chat_id from social.chat_messages where message_id = ${command.aggregateId}::uuid
      `.execute(transaction);
      const chatId = messageLookup.rows[0]?.chat_id;
      if (!chatId) throw new ChatActionDeniedError('MESSAGE_NOT_FOUND');
      const participants = await chatParticipants(transaction, chatId);
      await lockParticipantPair(transaction, participants);
      assertParticipant(participants, command.actor.id!);
      const row = await lockedMessage(transaction, command.aggregateId);
      assertCanReportMessage(command.actor.id!, row.sender_user_id, row.reported_at);
      const revisionsResult = await sql<{
        readonly revision_id: string;
        readonly revision_no: number;
        readonly payload: ChatMessageContent;
        readonly created_at: Date;
      }>`
        select revision_id, revision_no, payload, created_at
        from social.chat_message_revisions
        where message_id = ${row.message_id}::uuid
        order by revision_no
      `.execute(transaction);
      const evidenceSnapshot = {
        messageId: row.message_id,
        chatId: row.chat_id,
        senderUserId: row.sender_user_id,
        payloadType: row.payload_type,
        createdAt: row.created_at.toISOString(),
        revisions: revisionsResult.rows.map((revision) => ({
          revisionId: revision.revision_id,
          revisionNo: revision.revision_no,
          payload: revision.payload,
          createdAt: revision.created_at.toISOString(),
        })),
      };
      await sql`
        insert into social.chat_message_reports (
          report_id, message_id, reporter_user_id, reason_code,
          state, evidence_snapshot, created_at
        ) values (
          ${ids.reportId}::uuid, ${row.message_id}::uuid, ${command.actor.id}::uuid,
          ${reasonCode}, 'PENDING_CENTRAL', ${JSON.stringify(evidenceSnapshot)}::jsonb,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        update social.chat_messages
        set reported_at = ${context.occurredAt.toISOString()}::timestamptz,
            version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where message_id = ${row.message_id}::uuid
      `.execute(transaction);
      return {
        responseStatus: 201,
        response: {
          action: 'REPORTED',
          messageId: row.message_id,
          reportId: ids.reportId,
          state: 'PENDING_CENTRAL',
          reportedAt: context.occurredAt.toISOString(),
          version: context.nextVersion,
        },
        event: {
          eventId: ids.eventId,
          eventName: 'ChatMessageReported',
          schemaVersion: 1,
          transitionId: 'MSG-04',
          payload: { messageId: row.message_id, chatId: row.chat_id, reportId: ids.reportId },
          metadata: { policyVersion: CHAT_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'REPORT_CHAT_MESSAGE',
          transitionId: 'MSG-04',
          reasonCode,
          beforeState: 'ACTIVE',
          afterState: 'ACTIVE_REPORTED',
          metadata: { messageId: row.message_id, chatId: row.chat_id, reportId: ids.reportId },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'moderation.chat-message.reported.v1',
            payload: { messageId: row.message_id, chatId: row.chat_id, reportId: ids.reportId },
          },
        ],
      };
    },
  });
}
