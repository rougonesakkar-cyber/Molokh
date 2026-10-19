import {
  ApiErrorSchema,
  ChatMessageActionResponseSchema,
  ChatMessageCommandResponseSchema,
  ChatMessagesResponseSchema,
  CentralModerationCaseListResponseSchema,
  EditChatMessageBodySchema,
  ReportChatMessageBodySchema,
  ResolveSafetyCaseBodySchema,
  SafetyCaseReviewCommandResponseSchema,
  StartSafetyCaseReviewBodySchema,
  SendChatMessageBodySchema,
  type ChatMessageActionResponse,
  type ChatMessageCommandResponse,
  type ChatMessagesResponse,
  type CentralModerationCaseListResponse,
  type EditChatMessageBody,
  type ReportChatMessageBody,
  type ResolveSafetyCaseBody,
  type SafetyCaseReviewCommandResponse,
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
  ResolveSafetyCasePayload,
  SafetyCaseResolutionEffectIds,
  SafetyCaseReviewEffectIds,
  SafetyCaseReviewProjection,
  SendChatMessageEffectIds,
  SendChatMessagePayload,
  StartSafetyCaseReviewPayload,
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

interface ModerationCaseParams {
  readonly caseId: string;
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
  readonly startSafetyCaseReview: (
    command: CommandEnvelope<StartSafetyCaseReviewPayload>,
    ids: SafetyCaseReviewEffectIds,
  ) => Promise<ExecutedCommand<SafetyCaseReviewProjection>>;
  readonly resolveSafetyCase: (
    command: CommandEnvelope<ResolveSafetyCasePayload>,
    ids: SafetyCaseResolutionEffectIds,
  ) => Promise<ExecutedCommand<SafetyCaseReviewProjection>>;
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

function safetyResolutionEffectIds(): SafetyCaseResolutionEffectIds {
  return {
    eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7(),
    decisionId: newUuidV7(), decisionEventId: newUuidV7(),
    challengeEventId: newUuidV7(), challengeOutboxMessageId: newUuidV7(),
    holdEventId: newUuidV7(), holdOutboxMessageId: newUuidV7(),
    notificationOutboxMessageId: newUuidV7(),
    notificationIds: [newUuidV7(), newUuidV7(), newUuidV7()],
    resultId: newUuidV7(), resultEventId: newUuidV7(),
    statusTransitionId: newUuidV7(), statusEventId: newUuidV7(),
    cooldownId: newUuidV7(), cooldownEventId: newUuidV7(),
    resultOutboxMessageId: newUuidV7(),
    resultNotificationOutboxMessageId: newUuidV7(),
    resultNotificationIds: [newUuidV7(), newUuidV7()],
    enforcementId: newUuidV7(), restrictionEventId: newUuidV7(),
    restrictionOutboxMessageId: newUuidV7(),
    restrictionNotificationOutboxMessageId: newUuidV7(),
    restrictionNotificationId: newUuidV7(),
    statusReviewHoldId: newUuidV7(), statusReviewHoldEventId: newUuidV7(),
    statusReviewHoldOutboxMessageId: newUuidV7(),
  };
}

function safetyReviewResponse(
  executed: ExecutedCommand<SafetyCaseReviewProjection>, requestId: string,
): SafetyCaseReviewCommandResponse {
  return {
    data: executed.response,
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  } as SafetyCaseReviewCommandResponse;
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

  app.post<{
    Headers: ChatHeaders;
    Params: ModerationCaseParams;
    Body: Record<string, never>;
  }>(
    '/api/v1/central/moderation-cases/:caseId/review',
    {
      schema: {
        operationId: 'startSafetyCaseReview',
        params: Type.Object({ caseId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: StartSafetyCaseReviewBodySchema,
        response: {
          200: SafetyCaseReviewCommandResponseSchema,
          400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<SafetyCaseReviewCommandResponse | undefined> => {
      const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const executed = await dependencies.startSafetyCaseReview({
        commandId: newUuidV7(), commandType: 'START_SAFETY_CASE_REVIEW',
        idempotencyKey: requiredIdempotencyKey(request.headers['idempotency-key']),
        actor: { type: 'USER', id: authenticated.userId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
        aggregateType: 'ModerationCase', aggregateId: request.params.caseId,
        expectedVersion: expectedVersion(request.headers['if-match'], 1),
        correlationId: context.correlationId, causationId: context.causationId,
        requestId: context.requestId, source: 'api', payloadVersion: 1,
        payload: { caseId: request.params.caseId },
      }, basicEffectIds());
      return safetyReviewResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: ChatHeaders;
    Params: ModerationCaseParams;
    Body: ResolveSafetyCaseBody;
  }>(
    '/api/v1/central/moderation-cases/:caseId/resolve',
    {
      schema: {
        operationId: 'resolveSafetyCase',
        params: Type.Object({ caseId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: ResolveSafetyCaseBodySchema,
        response: {
          200: SafetyCaseReviewCommandResponseSchema,
          400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<SafetyCaseReviewCommandResponse | undefined> => {
      const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const executed = await dependencies.resolveSafetyCase({
        commandId: newUuidV7(), commandType: 'RESOLVE_SAFETY_CASE',
        idempotencyKey: requiredIdempotencyKey(request.headers['idempotency-key']),
        actor: { type: 'USER', id: authenticated.userId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
        aggregateType: 'ModerationCase', aggregateId: request.params.caseId,
        expectedVersion: expectedVersion(request.headers['if-match'], 2),
        correlationId: context.correlationId, causationId: context.causationId,
        requestId: context.requestId, source: 'api', payloadVersion: 1,
        payload: { caseId: request.params.caseId, ...request.body },
      }, safetyResolutionEffectIds());
      return safetyReviewResponse(executed, context.requestId);
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
