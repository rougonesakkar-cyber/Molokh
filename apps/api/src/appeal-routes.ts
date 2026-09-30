import {
  ApiErrorSchema,
  AddAppealResponseBodySchema,
  AppealCommandResponseSchema,
  AppealDetailResponseSchema,
  AppealQueueResponseSchema,
  DecideAppealBodySchema,
  ExtendAppealSlaBodySchema,
  StartAppealReviewBodySchema,
  WithdrawAppealBodySchema,
  type AddAppealResponseBody,
  type AppealCommandResponse,
  type AppealDetailResponse,
  type AppealQueueResponse,
  type DecideAppealBody,
  type ExtendAppealSlaBody,
  type StartAppealReviewBody,
  type WithdrawAppealBody,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope } from '@molokh/core';
import type {
  AppealEffectIds,
  AppealProjection,
  AddAppealResponsePayload,
  DecideAppealPayload,
  ExecutedCommand,
  ExtendAppealSlaPayload,
  StartAppealReviewPayload,
  WithdrawAppealPayload,
} from '@molokh/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { idempotentResourceId, newUuidV7 } from './uuid-v7.js';

interface AppealHeaders {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}

interface AppealParams { readonly appealId: string }
interface ResultParams { readonly resultId: string }

export interface AppealRouteDependencies {
  readonly auth: AuthAdapter;
  readonly centralAuth: AuthAdapter;
  readonly readAppeal: (resultId: string, viewerUserId: string) => Promise<AppealProjection | null>;
  readonly listAppeals: (centralUserId: string) => Promise<readonly AppealProjection[]>;
  readonly startReview: (
    command: CommandEnvelope<StartAppealReviewPayload>,
    ids: AppealEffectIds,
  ) => Promise<ExecutedCommand<AppealProjection>>;
  readonly decide: (
    command: CommandEnvelope<DecideAppealPayload>,
    ids: AppealEffectIds,
  ) => Promise<ExecutedCommand<AppealProjection>>;
  readonly addResponse: (
    command: CommandEnvelope<AddAppealResponsePayload>, ids: AppealEffectIds,
  ) => Promise<ExecutedCommand<AppealProjection>>;
  readonly withdraw: (
    command: CommandEnvelope<WithdrawAppealPayload>, ids: AppealEffectIds,
  ) => Promise<ExecutedCommand<AppealProjection>>;
  readonly extendSla: (
    command: CommandEnvelope<ExtendAppealSlaPayload>, ids: AppealEffectIds,
  ) => Promise<ExecutedCommand<AppealProjection>>;
}

function unauthorized(request: FastifyRequest) {
  return {
    code: 'UNAUTHENTICATED', message: 'Authentication is required',
    requestId: requestContext(request).requestId,
  };
}

function requiredIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key) throw new InvalidCommandEnvelopeError('Idempotency-Key');
  return key;
}

function expectedVersion(value: string | undefined): number {
  const match = value?.trim().match(/^"?(\d+)"?$/);
  const version = Number(match?.[1]);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new InvalidCommandEnvelopeError('If-Match');
  }
  return version;
}

function envelope<T>(input: {
  readonly actorUserId: string;
  readonly roles?: readonly string[];
  readonly appealId: string;
  readonly commandType: string;
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly payload: T;
  readonly request: FastifyRequest;
}): CommandEnvelope<T> {
  const context = requestContext(input.request);
  return {
    commandId: newUuidV7(), commandType: input.commandType,
    idempotencyKey: input.idempotencyKey,
    actor: { type: 'USER', id: input.actorUserId, roles: input.roles ?? [], scopeIds: [] },
    aggregateType: 'Appeal', aggregateId: input.appealId,
    expectedVersion: input.expectedVersion, correlationId: context.correlationId,
    causationId: context.causationId, requestId: context.requestId,
    source: 'api', payloadVersion: 1, payload: input.payload,
  };
}

function response(
  executed: ExecutedCommand<AppealProjection>,
  requestId: string,
): AppealCommandResponse {
  return {
    data: executed.response,
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

function effectIds(appealId: string, key: string): AppealEffectIds {
  return {
    eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7(),
    decisionId: idempotentResourceId('AppealDecision', appealId, key),
    responseId: idempotentResourceId('AppealResponse', appealId, key),
    withdrawalId: idempotentResourceId('AppealWithdrawal', appealId, key),
    extensionId: idempotentResourceId('AppealSlaExtension', appealId, key),
    resultEventId: newUuidV7(), challengeEventId: newUuidV7(),
    statusFinalizationId: newUuidV7(), statusCompensationId: newUuidV7(),
    statusEventId: newUuidV7(), cooldownEventId: newUuidV7(),
    notificationOutboxMessageId: newUuidV7(),
    notificationIds: [newUuidV7(), newUuidV7(), newUuidV7()],
  };
}

export async function registerAppealRoutes(
  app: FastifyInstance,
  dependencies: AppealRouteDependencies,
): Promise<void> {
  app.get<{ Headers: AppealHeaders; Params: ResultParams }>(
    '/api/v1/results/:resultId/appeal',
    {
      schema: {
        operationId: 'getResultAppeal',
        params: Type.Object({ resultId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        response: {
          200: AppealDetailResponseSchema, 401: ApiErrorSchema,
          403: ApiErrorSchema, 404: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<AppealDetailResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const appeal = await dependencies.readAppeal(request.params.resultId, authenticated.userId);
      if (!appeal) {
        await reply.status(404).send({
          code: 'APPEAL_NOT_FOUND', message: 'Appeal was not found',
          requestId: requestContext(request).requestId,
        });
        return;
      }
      return { data: appeal, meta: { requestId: requestContext(request).requestId } };
    },
  );

  app.post<{ Body: AddAppealResponseBody; Headers: AppealHeaders; Params: AppealParams }>(
    '/api/v1/appeals/:appealId/responses',
    {
      schema: {
        operationId: 'addAppealResponse',
        params: Type.Object({ appealId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: AddAppealResponseBodySchema,
        response: {
          200: AppealCommandResponseSchema, 400: ApiErrorSchema, 401: ApiErrorSchema,
          403: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredIdempotencyKey(request.headers['idempotency-key']);
      const command = envelope({
        actorUserId: authenticated.userId, appealId: request.params.appealId,
        commandType: 'ADD_APPEAL_RESPONSE', idempotencyKey: key,
        expectedVersion: expectedVersion(request.headers['if-match']),
        payload: { appealId: request.params.appealId, statement: request.body.statement }, request,
      });
      const executed = await dependencies.addResponse(command, effectIds(request.params.appealId, key));
      await reply.status(executed.responseStatus).send(response(executed, requestContext(request).requestId));
    },
  );

  app.post<{ Body: WithdrawAppealBody; Headers: AppealHeaders; Params: AppealParams }>(
    '/api/v1/appeals/:appealId/withdraw',
    {
      schema: {
        operationId: 'withdrawAppeal',
        params: Type.Object({ appealId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: WithdrawAppealBodySchema,
        response: {
          200: AppealCommandResponseSchema, 400: ApiErrorSchema, 401: ApiErrorSchema,
          403: ApiErrorSchema, 409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredIdempotencyKey(request.headers['idempotency-key']);
      const command = envelope({
        actorUserId: authenticated.userId, appealId: request.params.appealId,
        commandType: 'WITHDRAW_APPEAL', idempotencyKey: key,
        expectedVersion: expectedVersion(request.headers['if-match']),
        payload: { appealId: request.params.appealId }, request,
      });
      const executed = await dependencies.withdraw(command, effectIds(request.params.appealId, key));
      await reply.status(executed.responseStatus).send(response(executed, requestContext(request).requestId));
    },
  );

  app.get<{ Headers: AppealHeaders }>(
    '/api/v1/central/appeals',
    {
      schema: {
        operationId: 'listCentralAppeals',
        response: { 200: AppealQueueResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<AppealQueueResponse | undefined> => {
      const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      return {
        data: [...await dependencies.listAppeals(authenticated.userId)],
        meta: { requestId: requestContext(request).requestId },
      };
    },
  );

  app.post<{
    Body: StartAppealReviewBody; Headers: AppealHeaders; Params: AppealParams;
  }>(
    '/api/v1/central/appeals/:appealId/start-review',
    {
      schema: {
        operationId: 'startAppealReview',
        params: Type.Object({ appealId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: StartAppealReviewBodySchema,
        response: { 200: AppealCommandResponseSchema, 400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredIdempotencyKey(request.headers['idempotency-key']);
      const command = envelope({
        actorUserId: authenticated.userId, appealId: request.params.appealId,
        roles: ['CENTRAL_ADMIN'],
        commandType: 'START_APPEAL_REVIEW', idempotencyKey: key,
        expectedVersion: expectedVersion(request.headers['if-match']),
        payload: { appealId: request.params.appealId }, request,
      });
      const executed = await dependencies.startReview(command, effectIds(request.params.appealId, key));
      await reply.status(executed.responseStatus).send(response(executed, requestContext(request).requestId));
    },
  );

  app.post<{
    Body: DecideAppealBody; Headers: AppealHeaders; Params: AppealParams;
  }>(
    '/api/v1/central/appeals/:appealId/decision',
    {
      schema: {
        operationId: 'decideAppeal',
        params: Type.Object({ appealId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: DecideAppealBodySchema,
        response: { 200: AppealCommandResponseSchema, 400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredIdempotencyKey(request.headers['idempotency-key']);
      const command = envelope({
        actorUserId: authenticated.userId, appealId: request.params.appealId,
        roles: ['CENTRAL_ADMIN'],
        commandType: 'DECIDE_APPEAL', idempotencyKey: key,
        expectedVersion: expectedVersion(request.headers['if-match']),
        payload: {
          appealId: request.params.appealId,
          decision: request.body.decision,
          reason: request.body.reason,
        },
        request,
      });
      const executed = await dependencies.decide(command, effectIds(request.params.appealId, key));
      await reply.status(executed.responseStatus).send(response(executed, requestContext(request).requestId));
    },
  );

  app.post<{
    Body: ExtendAppealSlaBody; Headers: AppealHeaders; Params: AppealParams;
  }>(
    '/api/v1/central/appeals/:appealId/extend-sla',
    {
      schema: {
        operationId: 'extendAppealSla',
        params: Type.Object({ appealId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: ExtendAppealSlaBodySchema,
        response: {
          200: AppealCommandResponseSchema, 400: ApiErrorSchema, 401: ApiErrorSchema,
          403: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredIdempotencyKey(request.headers['idempotency-key']);
      const command = envelope({
        actorUserId: authenticated.userId, appealId: request.params.appealId,
        roles: ['CENTRAL_ADMIN'],
        commandType: 'EXTEND_APPEAL_SLA', idempotencyKey: key,
        expectedVersion: expectedVersion(request.headers['if-match']),
        payload: {
          appealId: request.params.appealId,
          durationHours: request.body.durationHours,
          reason: request.body.reason,
        },
        request,
      });
      const executed = await dependencies.extendSla(command, effectIds(request.params.appealId, key));
      await reply.status(executed.responseStatus).send(response(executed, requestContext(request).requestId));
    },
  );
}
