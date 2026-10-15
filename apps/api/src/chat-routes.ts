import {
  ApiErrorSchema,
  ChatMessageActionResponseSchema,
  ChatMessageCommandResponseSchema,
  ChatMessagesResponseSchema,
  CentralModerationCaseListResponseSchema,
  EditChatMessageBodySchema,
  ReportChatMessageBodySchema,
  SendChatMessageBodySchema,
  type ChatMessageActionResponse,
  type ChatMessageCommandResponse,
  type ChatMessagesResponse,
  type CentralModerationCaseListResponse,
  type EditChatMessageBody,
  type ReportChatMessageBody,
  type SendChatMessageBody,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope } from '@molokh/core';
import type {
  ChatMessagePage,
  ChatMessageProjection,
  CentralModerationCaseProjection,
  EditChatMessageEffectIds,
  EditChatMessagePayload,
  ExecutedCommand,
  HiddenMessageProjection,
  HideChatMessageEffectIds,
  HideChatMessagePayload,
  ReportChatMessageEffectIds,
  ReportChatMessagePayload,
  ReportedMessageProjection,
  SendChatMessageEffectIds,
  SendChatMessagePayload,
} from '@molokh/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { idempotentResourceId, newUuidV7 } from './uuid-v7.js';

interface ChatHeaders {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}

interface ChatParams {
  readonly chatId: string;
}

interface MessageParams {
  readonly messageId: string;
}

export interface ChatRouteDependencies {
  readonly auth: AuthAdapter;
  readonly centralAuth: AuthAdapter;
  readonly readMessages: (
    chatId: string,
    viewerUserId: string,
    limit: number,
    cursor: string | null,
  ) => Promise<ChatMessagePage>;
  readonly sendMessage: (
    command: CommandEnvelope<SendChatMessagePayload>,
    ids: SendChatMessageEffectIds,
  ) => Promise<ExecutedCommand<ChatMessageProjection>>;
  readonly editMessage: (
    command: CommandEnvelope<EditChatMessagePayload>,
    ids: EditChatMessageEffectIds,
  ) => Promise<ExecutedCommand<ChatMessageProjection>>;
  readonly hideMessage: (
    command: CommandEnvelope<HideChatMessagePayload>,
    ids: HideChatMessageEffectIds,
  ) => Promise<ExecutedCommand<HiddenMessageProjection>>;
  readonly reportMessage: (
    command: CommandEnvelope<ReportChatMessagePayload>,
    ids: ReportChatMessageEffectIds,
  ) => Promise<ExecutedCommand<ReportedMessageProjection>>;
  readonly readModerationCases: (
    centralUserId: string,
  ) => Promise<readonly CentralModerationCaseProjection[]>;
}

function unauthorized(request: FastifyRequest) {
  return {
    code: 'UNAUTHENTICATED',
    message: 'Authentication is required',
    requestId: requestContext(request).requestId,
  };
}

function requiredIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key) throw new InvalidCommandEnvelopeError('Idempotency-Key');
  return key;
}

function expectedVersion(value: string | undefined, minimum: number): number {
  const match = value?.trim().match(/^"?(\d+)"?$/);
  const version = match?.[1] ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(version) || version < minimum) {
    throw new InvalidCommandEnvelopeError('If-Match');
  }
  return version;
}

function sendEffectIds(): SendChatMessageEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    revisionId: newUuidV7(),
    matchEventId: newUuidV7(),
    chatEventId: newUuidV7(),
  };
}

function editEffectIds(): EditChatMessageEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    revisionId: newUuidV7(),
  };
}

function basicEffectIds(): HideChatMessageEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
  };
}

function commandResponse(
  executed: ExecutedCommand<ChatMessageProjection>,
  requestId: string,
): ChatMessageCommandResponse {
  return {
    data: executed.response,
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

function actionResponse(
  executed: ExecutedCommand<HiddenMessageProjection | ReportedMessageProjection>,
  requestId: string,
): ChatMessageActionResponse {
  return {
    data: executed.response,
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

export async function registerChatRoutes(
  app: FastifyInstance,
  dependencies: ChatRouteDependencies,
): Promise<void> {
  app.get<{ Headers: ChatHeaders }>(
    '/api/v1/central/moderation-cases',
    {
      schema: {
        operationId: 'listCentralModerationCases',
        response: {
          200: CentralModerationCaseListResponseSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<CentralModerationCaseListResponse | undefined> => {
      const authenticated = await dependencies.centralAuth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      return {
        data: [...await dependencies.readModerationCases(authenticated.userId)],
        meta: { requestId: requestContext(request).requestId },
      } as CentralModerationCaseListResponse;
    },
  );

  app.get<{
    Headers: ChatHeaders;
    Params: ChatParams;
    Querystring: { readonly limit?: number; readonly cursor?: string };
  }>(
    '/api/v1/chats/:chatId/messages',
    {
      schema: {
        operationId: 'readChatMessages',
        params: Type.Object(
          { chatId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        querystring: Type.Object(
          {
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
            cursor: Type.Optional(Type.String({ format: 'uuid' })),
          },
          { additionalProperties: false },
        ),
        response: {
          200: ChatMessagesResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<ChatMessagesResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const page = await dependencies.readMessages(
        request.params.chatId,
        authenticated.userId,
        request.query.limit ?? 50,
        request.query.cursor ?? null,
      );
      return {
        data: page.messages.map((message) => ({ ...message })),
        meta: {
          requestId: context.requestId,
          viewerUserId: authenticated.userId,
          chatState: page.chatState,
          nextCursor: page.nextCursor,
        },
      };
    },
  );

  app.post<{
    Body: SendChatMessageBody;
    Headers: ChatHeaders;
    Params: ChatParams;
  }>(
    '/api/v1/chats/:chatId/messages',
    {
      schema: {
        operationId: 'sendChatMessage',
        params: Type.Object(
          { chatId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: SendChatMessageBodySchema,
        response: {
          201: ChatMessageCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const messageId = idempotentResourceId('ChatMessage', authenticated.userId, idempotencyKey);
      const command: CommandEnvelope<SendChatMessagePayload> = {
        commandId: newUuidV7(),
        commandType: 'SEND_MESSAGE',
        idempotencyKey,
        actor: { type: 'USER', id: authenticated.userId, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'ChatMessage',
        aggregateId: messageId,
        expectedVersion: expectedVersion(request.headers['if-match'], 0),
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'api',
        payloadVersion: 1,
        payload: {
          chatId: request.params.chatId,
          content: { kind: 'PERSONAL_TEXT', text: request.body.text },
        },
      };
      if (command.expectedVersion !== 0) throw new InvalidCommandEnvelopeError('If-Match');
      const executed = await dependencies.sendMessage(command, sendEffectIds());
      await reply.status(201).send(commandResponse(executed, context.requestId));
    },
  );

  app.patch<{
    Body: EditChatMessageBody;
    Headers: ChatHeaders;
    Params: MessageParams;
  }>(
    '/api/v1/messages/:messageId',
    {
      schema: {
        operationId: 'editChatMessage',
        params: Type.Object(
          { messageId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: EditChatMessageBodySchema,
        response: {
          200: ChatMessageCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const command: CommandEnvelope<EditChatMessagePayload> = {
        commandId: newUuidV7(),
        commandType: 'EDIT_MESSAGE',
        idempotencyKey,
        actor: { type: 'USER', id: authenticated.userId, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'ChatMessage',
        aggregateId: request.params.messageId,
        expectedVersion: expectedVersion(request.headers['if-match'], 1),
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'api',
        payloadVersion: 1,
        payload: { messageId: request.params.messageId, text: request.body.text },
      };
      const executed = await dependencies.editMessage(command, editEffectIds());
      await reply.status(200).send(commandResponse(executed, context.requestId));
    },
  );

  app.delete<{
    Headers: ChatHeaders;
    Params: MessageParams;
  }>(
    '/api/v1/messages/:messageId/visibility',
    {
      schema: {
        operationId: 'hideChatMessageForSelf',
        params: Type.Object(
          { messageId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        response: {
          200: ChatMessageActionResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const visibilityId = idempotentResourceId(
        'ChatMessageVisibility',
        authenticated.userId,
        idempotencyKey,
      );
      const command: CommandEnvelope<HideChatMessagePayload> = {
        commandId: newUuidV7(),
        commandType: 'DELETE_MESSAGE_FOR_SELF',
        idempotencyKey,
        actor: { type: 'USER', id: authenticated.userId, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'ChatMessageVisibility',
        aggregateId: visibilityId,
        expectedVersion: expectedVersion(request.headers['if-match'], 0),
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'api',
        payloadVersion: 1,
        payload: { messageId: request.params.messageId },
      };
      if (command.expectedVersion !== 0) throw new InvalidCommandEnvelopeError('If-Match');
      const executed = await dependencies.hideMessage(command, basicEffectIds());
      await reply.status(200).send(actionResponse(executed, context.requestId));
    },
  );

  app.post<{
    Body: ReportChatMessageBody;
    Headers: ChatHeaders;
    Params: MessageParams;
  }>(
    '/api/v1/messages/:messageId/reports',
    {
      schema: {
        operationId: 'reportChatMessage',
        params: Type.Object(
          { messageId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: ReportChatMessageBodySchema,
        response: {
          201: ChatMessageActionResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const reportId = idempotentResourceId('ChatMessageReport', authenticated.userId, idempotencyKey);
      const caseId = idempotentResourceId('ModerationCase', authenticated.userId, idempotencyKey);
      const command: CommandEnvelope<ReportChatMessagePayload> = {
        commandId: newUuidV7(),
        commandType: 'REPORT_MESSAGE',
        idempotencyKey,
        actor: { type: 'USER', id: authenticated.userId, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'ChatMessage',
        aggregateId: request.params.messageId,
        expectedVersion: expectedVersion(request.headers['if-match'], 1),
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'api',
        payloadVersion: 1,
        payload: { messageId: request.params.messageId, reasonCode: request.body.reasonCode },
      };
      const executed = await dependencies.reportMessage(command, {
        ...basicEffectIds(),
        reportId,
        caseId,
        caseEventId: newUuidV7(),
        caseOutboxMessageId: newUuidV7(),
        notificationId: newUuidV7(),
        notificationOutboxMessageId: newUuidV7(),
      });
      await reply.status(201).send(actionResponse(executed, context.requestId));
    },
  );
}
