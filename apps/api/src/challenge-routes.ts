import {
  ApiErrorSchema,
  ChallengeCommandResponseSchema,
  ChatChallengeResponseSchema,
  CreateDirectChallengeBodySchema,
  RespondToChallengeBodySchema,
  type ChallengeCommandResponse,
  type ChatChallengeResponse,
  type CreateDirectChallengeBody,
  type RespondToChallengeBody,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope } from '@molokh/core';
import type {
  AcceptChallengeEffectIds,
  ChallengeEffectIds,
  ChallengeProjection,
  ChatChallengeProjection,
  CreateChallengeEffectIds,
  CreateDirectChallengePayload,
  DeclineChallengeEffectIds,
  ExecutedCommand,
  RespondToChallengePayload,
} from '@molokh/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { idempotentResourceId, newUuidV7 } from './uuid-v7.js';

interface ChallengeHeaders {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}

interface ChatParams { readonly chatId: string }
interface ChallengeParams { readonly challengeId: string }

export interface ChallengeRouteDependencies {
  readonly auth: AuthAdapter;
  readonly readChatChallenge: (
    sourceChatId: string,
    viewerUserId: string,
  ) => Promise<ChatChallengeProjection>;
  readonly createDirectOpenChallenge: (
    command: CommandEnvelope<CreateDirectChallengePayload>,
    ids: CreateChallengeEffectIds,
  ) => Promise<ExecutedCommand<ChallengeProjection>>;
  readonly acceptOptionalChallenge: (
    command: CommandEnvelope<RespondToChallengePayload>,
    ids: AcceptChallengeEffectIds,
  ) => Promise<ExecutedCommand<ChallengeProjection>>;
  readonly declineOptionalChallenge: (
    command: CommandEnvelope<RespondToChallengePayload>,
    ids: DeclineChallengeEffectIds,
  ) => Promise<ExecutedCommand<ChallengeProjection>>;
  readonly withdrawOptionalChallenge: (
    command: CommandEnvelope<RespondToChallengePayload>,
    ids: ChallengeEffectIds,
  ) => Promise<ExecutedCommand<ChallengeProjection>>;
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
  const version = Number(match?.[1]);
  if (!Number.isSafeInteger(version) || version < minimum) {
    throw new InvalidCommandEnvelopeError('If-Match');
  }
  return version;
}

function basicIds(): ChallengeEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    notificationId: newUuidV7(),
    notificationOutboxMessageId: newUuidV7(),
    resultId: newUuidV7(),
    resultEventId: newUuidV7(),
    statusTransitionId: newUuidV7(),
    statusEventId: newUuidV7(),
    cooldownId: newUuidV7(),
    cooldownEventId: newUuidV7(),
    timerOutboxMessageId: newUuidV7(),
    notificationIds: [newUuidV7(), newUuidV7()],
  };
}

function commandResponse(
  executed: ExecutedCommand<ChallengeProjection>,
  requestId: string,
): ChallengeCommandResponse {
  return {
    data: executed.response,
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

function commandEnvelope(
  actorUserId: string,
  aggregateId: string,
  commandType: string,
  idempotencyKey: string,
  version: number,
  payload: RespondToChallengePayload | CreateDirectChallengePayload,
  request: FastifyRequest,
): CommandEnvelope<RespondToChallengePayload | CreateDirectChallengePayload> {
  const context = requestContext(request);
  return {
    commandId: newUuidV7(),
    commandType,
    idempotencyKey,
    actor: { type: 'USER', id: actorUserId, roles: ['ATHLETE'], scopeIds: [] },
    aggregateType: 'Challenge',
    aggregateId,
    expectedVersion: version,
    correlationId: context.correlationId,
    causationId: context.causationId,
    requestId: context.requestId,
    source: 'api',
    payloadVersion: 1,
    payload,
  };
}

export async function registerChallengeRoutes(
  app: FastifyInstance,
  dependencies: ChallengeRouteDependencies,
): Promise<void> {
  app.get<{ Headers: ChallengeHeaders; Params: ChatParams }>(
    '/api/v1/chats/:chatId/challenge',
    {
      schema: {
        operationId: 'readChatChallenge',
        params: Type.Object({ chatId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        response: { 200: ChatChallengeResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<ChatChallengeResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization, 'SERVICE_RESPONSE');
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      return {
        data: await dependencies.readChatChallenge(request.params.chatId, authenticated.userId),
        meta: { requestId: requestContext(request).requestId },
      };
    },
  );

  app.post<{ Body: CreateDirectChallengeBody; Headers: ChallengeHeaders }>(
    '/api/v1/challenges',
    {
      schema: {
        operationId: 'createDirectOpenChallenge',
        body: CreateDirectChallengeBodySchema,
        response: { 201: ChallengeCommandResponseSchema, 400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredIdempotencyKey(request.headers['idempotency-key']);
      const challengeId = idempotentResourceId('Challenge', authenticated.userId, key);
      const command = commandEnvelope(
        authenticated.userId,
        challengeId,
        'CREATE_DIRECT_OPEN_CHALLENGE',
        key,
        expectedVersion(request.headers['if-match'], 0),
        { sourceChatId: request.body.sourceChatId },
        request,
      ) as CommandEnvelope<CreateDirectChallengePayload>;
      if (command.expectedVersion !== 0) throw new InvalidCommandEnvelopeError('If-Match');
      const ids: CreateChallengeEffectIds = {
        ...basicIds(),
        serviceChatId: newUuidV7(),
        serviceChatEventId: newUuidV7(),
        rulesetSnapshotId: newUuidV7(),
        acknowledgmentId: newUuidV7(),
      };
      const executed = await dependencies.createDirectOpenChallenge(command, ids);
      await reply.status(executed.responseStatus).send(commandResponse(executed, requestContext(request).requestId));
    },
  );

  const registerResponse = (
    suffix: 'accept' | 'decline' | 'withdraw',
    operationId: string,
    commandType: string,
    execute: (
      command: CommandEnvelope<RespondToChallengePayload>,
      ids: AcceptChallengeEffectIds | DeclineChallengeEffectIds | ChallengeEffectIds,
    ) => Promise<ExecutedCommand<ChallengeProjection>>,
  ) => {
    app.post<{ Body: RespondToChallengeBody; Headers: ChallengeHeaders; Params: ChallengeParams }>(
      `/api/v1/challenges/:challengeId/${suffix}`,
      {
        schema: {
          operationId,
          params: Type.Object({ challengeId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
          body: RespondToChallengeBodySchema,
          response: { 200: ChallengeCommandResponseSchema, 400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 404: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema },
        },
      },
      async (request, reply): Promise<undefined> => {
        const authenticated = await dependencies.auth.authenticate(
          request.headers.authorization,
          suffix === 'accept' || suffix === 'decline' ? 'SERVICE_RESPONSE' : 'FULL',
        );
        if (!authenticated) {
          await reply.status(401).send(unauthorized(request));
          return;
        }
        const key = requiredIdempotencyKey(request.headers['idempotency-key']);
        const command = commandEnvelope(
          authenticated.userId,
          request.params.challengeId,
          commandType,
          key,
          expectedVersion(request.headers['if-match'], 1),
          { challengeId: request.params.challengeId, ...(request.body.explicitRulesetAcknowledged === undefined ? {} : { explicitRulesetAcknowledged: request.body.explicitRulesetAcknowledged }) },
          request,
        ) as CommandEnvelope<RespondToChallengePayload>;
        const shared = basicIds();
        const ids = suffix === 'accept'
          ? { ...shared, acknowledgmentId: newUuidV7(), obligationIds: [newUuidV7(), newUuidV7()] as const }
          : suffix === 'decline'
            ? { ...shared, quietPeriodId: newUuidV7() }
            : shared;
        const executed = await execute(command, ids);
        await reply.status(executed.responseStatus).send(commandResponse(executed, requestContext(request).requestId));
      },
    );
  };

  registerResponse('accept', 'acceptOptionalChallenge', 'ACCEPT_OPTIONAL_CHALLENGE', (command, ids) =>
    dependencies.acceptOptionalChallenge(command, ids as AcceptChallengeEffectIds));
  registerResponse('decline', 'declineOptionalChallenge', 'DECLINE_OPTIONAL_CHALLENGE', (command, ids) =>
    dependencies.declineOptionalChallenge(command, ids as DeclineChallengeEffectIds));
  registerResponse('withdraw', 'withdrawOptionalChallenge', 'WITHDRAW_OPTIONAL_CHALLENGE', (command, ids) =>
    dependencies.withdrawOptionalChallenge(command, ids as ChallengeEffectIds));
}
