import {
  ApiErrorSchema,
  RecordSessionResultBodySchema,
  ReviseResultMetadataBodySchema,
  ResultCommandResponseSchema,
  ResultResponseSchema,
  SubmitResultAppealBodySchema,
  WaiveResultAppealBodySchema,
  type RecordSessionResultBody,
  type ReviseResultMetadataBody,
  type ResultCommandResponse,
  type ResultResponse,
  type SubmitResultAppealBody,
  type WaiveResultAppealBody,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope } from '@molokh/core';
import type {
  ExecutedCommand,
  RecordSessionResultPayload,
  ResultMetadataRevisionEffectIds,
  ReviseResultMetadataPayload,
  ResultEffectIds,
  ResultProjection,
  SubmitResultAppealPayload,
  WaiveResultAppealPayload,
} from '@molokh/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { idempotentResourceId, newUuidV7 } from './uuid-v7.js';

interface ResultHeaders {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}

interface ChallengeParams { readonly challengeId: string }
interface ResultParams { readonly resultId: string }

export interface ResultRouteDependencies {
  readonly auth: AuthAdapter;
  readonly readResult: (resultId: string, viewerUserId: string) => Promise<ResultProjection>;
  readonly recordSessionResult: (
    command: CommandEnvelope<RecordSessionResultPayload>,
    ids: ResultEffectIds,
  ) => Promise<ExecutedCommand<ResultProjection>>;
  readonly reviseResultMetadata: (
    command: CommandEnvelope<ReviseResultMetadataPayload>,
    ids: ResultMetadataRevisionEffectIds,
  ) => Promise<ExecutedCommand<ResultProjection>>;
  readonly submitResultAppeal: (
    command: CommandEnvelope<SubmitResultAppealPayload>,
    ids: ResultEffectIds,
  ) => Promise<ExecutedCommand<ResultProjection>>;
  readonly waiveResultAppeal: (
    command: CommandEnvelope<WaiveResultAppealPayload>,
    ids: ResultEffectIds,
  ) => Promise<ExecutedCommand<ResultProjection>>;
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

function commandResponse(
  executed: ExecutedCommand<ResultProjection>,
  requestId: string,
): ResultCommandResponse {
  return {
    data: executed.response,
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

function envelope<T>(input: {
  readonly actorUserId: string;
  readonly actorRole: 'ATHLETE' | 'COACH';
  readonly aggregateType: 'Challenge' | 'Result';
  readonly aggregateId: string;
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
    actor: { type: 'USER', id: input.actorUserId, roles: [input.actorRole], scopeIds: [] },
    aggregateType: input.aggregateType, aggregateId: input.aggregateId,
    expectedVersion: input.expectedVersion, correlationId: context.correlationId,
    causationId: context.causationId, requestId: context.requestId,
    source: 'api', payloadVersion: 1, payload: input.payload,
  };
}

function finalizationIds(): Pick<
  ResultEffectIds,
  'challengeEventId' | 'statusFinalizationId' | 'statusEventId'
  | 'notificationOutboxMessageId' | 'notificationIds'
> {
  return {
    challengeEventId: newUuidV7(), statusFinalizationId: newUuidV7(),
    statusEventId: newUuidV7(), notificationOutboxMessageId: newUuidV7(),
    notificationIds: [newUuidV7(), newUuidV7()],
  };
}

export async function registerResultRoutes(
  app: FastifyInstance,
  dependencies: ResultRouteDependencies,
): Promise<void> {
  app.get<{ Headers: ResultHeaders; Params: ResultParams }>(
    '/api/v1/results/:resultId',
    {
      schema: {
        operationId: 'readResult',
        params: Type.Object({ resultId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        response: { 200: ResultResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<ResultResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      return {
        data: await dependencies.readResult(request.params.resultId, authenticated.userId),
        meta: { requestId: requestContext(request).requestId },
      };
    },
  );

  app.post<{
    Body: RecordSessionResultBody; Headers: ResultHeaders; Params: ChallengeParams;
  }>(
    '/api/v1/challenges/:challengeId/result',
    {
      schema: {
        operationId: 'recordSessionResult',
        params: Type.Object({ challengeId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: RecordSessionResultBodySchema,
        response: { 201: ResultCommandResponseSchema, 400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredIdempotencyKey(request.headers['idempotency-key']);
      const resultId = idempotentResourceId('Result', request.params.challengeId, key);
      const payload: RecordSessionResultPayload = {
        challengeId: request.params.challengeId, sessionId: request.body.sessionId,
        outcomeCode: request.body.outcomeCode, winnerUserId: request.body.winnerUserId ?? null,
        reasonCode: request.body.reasonCode ?? null, comment: request.body.comment ?? null,
        methodCode: request.body.methodCode ?? null, methodText: request.body.methodText ?? null,
        scorePayload: request.body.scorePayload ?? null,
        methodPayload: request.body.methodPayload ?? null,
      };
      const command = envelope({
        actorUserId: authenticated.userId, actorRole: 'COACH', aggregateType: 'Challenge',
        aggregateId: request.params.challengeId, commandType: 'RECORD_SESSION_RESULT',
        idempotencyKey: key, expectedVersion: expectedVersion(request.headers['if-match']),
        payload, request,
      });
      const executed = await dependencies.recordSessionResult(command, {
        eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7(),
        resultId, resultEventId: newUuidV7(), statusTransitionId: newUuidV7(),
        statusEventId: newUuidV7(), cooldownId: newUuidV7(), cooldownEventId: newUuidV7(),
        timerOutboxMessageId: newUuidV7(), notificationOutboxMessageId: newUuidV7(),
        missingResultReviewEventId: newUuidV7(),
        notificationIds: [newUuidV7(), newUuidV7()],
      });
      await reply.status(executed.responseStatus).send(
        commandResponse(executed, requestContext(request).requestId),
      );
    },
  );

  app.post<{
    Body: ReviseResultMetadataBody; Headers: ResultHeaders; Params: ResultParams;
  }>(
    '/api/v1/results/:resultId/metadata-revisions',
    {
      schema: {
        operationId: 'reviseResultMetadata',
        params: Type.Object({ resultId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: ReviseResultMetadataBodySchema,
        response: { 201: ResultCommandResponseSchema, 400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredIdempotencyKey(request.headers['idempotency-key']);
      const revisionId = idempotentResourceId(
        'ResultMetadataRevision', request.params.resultId, `${authenticated.userId}:${key}`,
      );
      const payload: ReviseResultMetadataPayload = {
        resultId: request.params.resultId,
        ...(request.body.methodCode !== undefined ? { methodCode: request.body.methodCode } : {}),
        ...(request.body.methodText !== undefined ? { methodText: request.body.methodText } : {}),
        ...(request.body.scorePayload !== undefined ? { scorePayload: request.body.scorePayload } : {}),
        ...(request.body.methodPayload !== undefined ? { methodPayload: request.body.methodPayload } : {}),
      };
      const executed = await dependencies.reviseResultMetadata(envelope({
        actorUserId: authenticated.userId, actorRole: 'COACH', aggregateType: 'Result',
        aggregateId: request.params.resultId, commandType: 'REVISE_RESULT_METADATA',
        idempotencyKey: key, expectedVersion: expectedVersion(request.headers['if-match']),
        payload, request,
      }), {
        revisionId, eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7(),
      });
      await reply.status(executed.responseStatus).send(
        commandResponse(executed, requestContext(request).requestId),
      );
    },
  );

  app.post<{
    Body: SubmitResultAppealBody; Headers: ResultHeaders; Params: ResultParams;
  }>(
    '/api/v1/results/:resultId/appeal',
    {
      schema: {
        operationId: 'submitResultAppeal',
        params: Type.Object({ resultId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: SubmitResultAppealBodySchema,
        response: { 201: ResultCommandResponseSchema, 400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredIdempotencyKey(request.headers['idempotency-key']);
      const appealId = idempotentResourceId('Appeal', request.params.resultId, `${authenticated.userId}:${key}`);
      const command = envelope({
        actorUserId: authenticated.userId, actorRole: 'ATHLETE', aggregateType: 'Result',
        aggregateId: request.params.resultId, commandType: 'SUBMIT_RESULT_APPEAL',
        idempotencyKey: key, expectedVersion: expectedVersion(request.headers['if-match']),
        payload: {
          resultId: request.params.resultId,
          reasonCode: request.body.reasonCode,
          statement: request.body.statement,
        },
        request,
      });
      const executed = await dependencies.submitResultAppeal(command, {
        eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7(),
        appealId, appealEventId: newUuidV7(), challengeEventId: newUuidV7(),
        notificationOutboxMessageId: newUuidV7(),
        notificationIds: [newUuidV7(), newUuidV7()],
      });
      await reply.status(executed.responseStatus).send(
        commandResponse(executed, requestContext(request).requestId),
      );
    },
  );

  app.post<{
    Body: WaiveResultAppealBody; Headers: ResultHeaders; Params: ResultParams;
  }>(
    '/api/v1/results/:resultId/waive-appeal',
    {
      schema: {
        operationId: 'waiveResultAppeal',
        params: Type.Object({ resultId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: WaiveResultAppealBodySchema,
        response: { 200: ResultCommandResponseSchema, 400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema },
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
        actorUserId: authenticated.userId, actorRole: 'ATHLETE', aggregateType: 'Result',
        aggregateId: request.params.resultId, commandType: 'WAIVE_RESULT_APPEAL',
        idempotencyKey: key, expectedVersion: expectedVersion(request.headers['if-match']),
        payload: { resultId: request.params.resultId }, request,
      });
      const executed = await dependencies.waiveResultAppeal(command, {
        eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7(),
        waiverId: idempotentResourceId('AppealWaiver', request.params.resultId, authenticated.userId),
        waiverEventId: newUuidV7(),
        ...finalizationIds(),
      });
      await reply.status(executed.responseStatus).send(
        commandResponse(executed, requestContext(request).requestId),
      );
    },
  );
}
