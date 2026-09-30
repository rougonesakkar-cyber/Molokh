import {
  ApiErrorSchema,
  AssignMissingResultCoachBodySchema,
  ConfirmMissingResultVenueBodySchema,
  MissingResultReviewCommandResponseSchema,
  MissingResultReviewListResponseSchema,
  MissingResultReviewResponseSchema,
  OrderMissingResultRepeatBodySchema,
  StartMissingResultReviewBodySchema,
  SubmitMissingResultStatementBodySchema,
  type AssignMissingResultCoachBody,
  type ConfirmMissingResultVenueBody,
  type MissingResultReviewCommandResponse,
  type MissingResultReviewListResponse,
  type MissingResultReviewResponse,
  type OrderMissingResultRepeatBody,
  type StartMissingResultReviewBody,
  type SubmitMissingResultStatementBody,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope } from '@molokh/core';
import type {
  AssignMissingResultCoachPayload,
  ConfirmMissingResultVenuePayload,
  ExecutedCommand,
  MissingResultEffectIds,
  MissingResultReviewProjection,
  OrderMissingResultRepeatPayload,
  StartMissingResultReviewPayload,
  SubmitMissingResultStatementPayload,
} from '@molokh/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { idempotentResourceId, newUuidV7 } from './uuid-v7.js';

interface Headers {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}
interface Params { readonly reviewId: string }

export interface MissingResultRouteDependencies {
  readonly auth: AuthAdapter;
  readonly centralAuth: AuthAdapter;
  readonly listForViewer: (viewerUserId: string) => Promise<MissingResultReviewProjection[]>;
  readonly listForCentral: (centralUserId: string) => Promise<MissingResultReviewProjection[]>;
  readonly read: (reviewId: string, viewerUserId: string) => Promise<MissingResultReviewProjection>;
  readonly submitStatement: (
    command: CommandEnvelope<SubmitMissingResultStatementPayload>, ids: MissingResultEffectIds,
  ) => Promise<ExecutedCommand<MissingResultReviewProjection>>;
  readonly confirmVenue: (
    command: CommandEnvelope<ConfirmMissingResultVenuePayload>, ids: MissingResultEffectIds,
  ) => Promise<ExecutedCommand<MissingResultReviewProjection>>;
  readonly startReview: (
    command: CommandEnvelope<StartMissingResultReviewPayload>, ids: MissingResultEffectIds,
  ) => Promise<ExecutedCommand<MissingResultReviewProjection>>;
  readonly assignCoach: (
    command: CommandEnvelope<AssignMissingResultCoachPayload>, ids: MissingResultEffectIds,
  ) => Promise<ExecutedCommand<MissingResultReviewProjection>>;
  readonly orderRepeat: (
    command: CommandEnvelope<OrderMissingResultRepeatPayload>, ids: MissingResultEffectIds,
  ) => Promise<ExecutedCommand<MissingResultReviewProjection>>;
}

function unauthorized(request: FastifyRequest) {
  return { code: 'UNAUTHENTICATED', message: 'Authentication is required', requestId: requestContext(request).requestId };
}

function idempotencyKey(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new InvalidCommandEnvelopeError('Idempotency-Key');
  return normalized;
}

function expectedVersion(value: string | undefined): number {
  const match = value?.trim().match(/^"?(\d+)"?$/);
  const version = Number(match?.[1]);
  if (!Number.isSafeInteger(version) || version < 1) throw new InvalidCommandEnvelopeError('If-Match');
  return version;
}

function envelope<T>(input: {
  readonly actorUserId: string;
  readonly roles: readonly string[];
  readonly reviewId: string;
  readonly commandType: string;
  readonly key: string;
  readonly version: number;
  readonly payload: T;
  readonly request: FastifyRequest;
}): CommandEnvelope<T> {
  const context = requestContext(input.request);
  return {
    commandId: newUuidV7(), commandType: input.commandType, idempotencyKey: input.key,
    actor: { type: 'USER', id: input.actorUserId, roles: input.roles, scopeIds: [] },
    aggregateType: 'MissingResultReview', aggregateId: input.reviewId,
    expectedVersion: input.version, correlationId: context.correlationId,
    causationId: context.causationId, requestId: context.requestId,
    source: 'api', payloadVersion: 1, payload: input.payload,
  };
}

function effectIds(reviewId: string, key: string): MissingResultEffectIds {
  return {
    eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7(),
    statementId: idempotentResourceId('MissingResultStatement', reviewId, key),
    confirmationId: idempotentResourceId('MissingResultVenueConfirmation', reviewId, key),
    challengeEventId: newUuidV7(),
  };
}

function commandResponse(
  executed: ExecutedCommand<MissingResultReviewProjection>, requestId: string,
): MissingResultReviewCommandResponse {
  return { data: executed.response as MissingResultReviewCommandResponse['data'],
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed } };
}

export async function registerMissingResultRoutes(
  app: FastifyInstance, dependencies: MissingResultRouteDependencies,
): Promise<void> {
  app.get<{ Headers: Headers }>('/api/v1/me/missing-result-reviews', {
    schema: { operationId: 'listMyMissingResultReviews', response: {
      200: MissingResultReviewListResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
    } },
  }, async (request, reply): Promise<MissingResultReviewListResponse | undefined> => {
    const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
    if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
    const data = await dependencies.listForViewer(authenticated.userId);
    return { data: data as MissingResultReviewListResponse['data'], meta: { requestId: requestContext(request).requestId } };
  });

  app.get<{ Headers: Headers; Params: Params }>('/api/v1/missing-result-reviews/:reviewId', {
    schema: {
      operationId: 'getMissingResultReview',
      params: Type.Object({ reviewId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
      response: { 200: MissingResultReviewResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema },
    },
  }, async (request, reply): Promise<MissingResultReviewResponse | undefined> => {
    const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
    if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
    const data = await dependencies.read(request.params.reviewId, authenticated.userId);
    return { data: data as MissingResultReviewResponse['data'], meta: { requestId: requestContext(request).requestId } };
  });

  app.get<{ Headers: Headers }>('/api/v1/central/missing-result-reviews', {
    schema: { operationId: 'listCentralMissingResultReviews', response: {
      200: MissingResultReviewListResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
    } },
  }, async (request, reply): Promise<MissingResultReviewListResponse | undefined> => {
    const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
    if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
    const data = await dependencies.listForCentral(authenticated.userId);
    return { data: data as MissingResultReviewListResponse['data'], meta: { requestId: requestContext(request).requestId } };
  });

  const execute = async <T>(input: {
    readonly request: FastifyRequest;
    readonly reply: FastifyReply;
    readonly authorization: string | undefined;
    readonly keyHeader: string | undefined;
    readonly ifMatch: string | undefined;
    readonly reviewId: string;
    readonly central: boolean;
    readonly commandType: string;
    readonly payload: T;
    readonly run: (command: CommandEnvelope<T>, ids: MissingResultEffectIds) => Promise<ExecutedCommand<MissingResultReviewProjection>>;
  }) => {
    const adapter = input.central ? dependencies.centralAuth : dependencies.auth;
    const authenticated = await adapter.authenticate(input.authorization);
    if (!authenticated) { await input.reply.status(401).send(unauthorized(input.request)); return; }
    const key = idempotencyKey(input.keyHeader);
    const command = envelope({
      actorUserId: authenticated.userId, roles: input.central ? ['CENTRAL_ADMIN'] : [],
      reviewId: input.reviewId, commandType: input.commandType, key,
      version: expectedVersion(input.ifMatch), payload: input.payload,
      request: input.request,
    });
    const executed = await input.run(command, effectIds(input.reviewId, key));
    await input.reply.status(executed.responseStatus)
      .send(commandResponse(executed, requestContext(input.request).requestId));
  };

  app.post<{ Body: SubmitMissingResultStatementBody; Headers: Headers; Params: Params }>(
    '/api/v1/missing-result-reviews/:reviewId/statements', {
      schema: {
        operationId: 'submitMissingResultStatement',
        params: Type.Object({ reviewId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: SubmitMissingResultStatementBodySchema,
        response: { 200: MissingResultReviewCommandResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema },
      },
    }, async (request, reply) => execute({
      request: request as FastifyRequest, reply, authorization: request.headers.authorization,
      keyHeader: request.headers['idempotency-key'], ifMatch: request.headers['if-match'],
      reviewId: request.params.reviewId, central: false, commandType: 'SUBMIT_MISSING_RESULT_STATEMENT',
      payload: { reviewId: request.params.reviewId, outcomeCode: request.body.outcomeCode,
        statement: request.body.statement },
      run: dependencies.submitStatement,
    }),
  );

  app.post<{ Body: ConfirmMissingResultVenueBody; Headers: Headers; Params: Params }>(
    '/api/v1/missing-result-reviews/:reviewId/venue-confirmation', {
      schema: {
        operationId: 'confirmMissingResultVenue',
        params: Type.Object({ reviewId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: ConfirmMissingResultVenueBodySchema,
        response: { 200: MissingResultReviewCommandResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema },
      },
    }, async (request, reply) => execute({
      request: request as FastifyRequest, reply, authorization: request.headers.authorization,
      keyHeader: request.headers['idempotency-key'], ifMatch: request.headers['if-match'],
      reviewId: request.params.reviewId, central: false, commandType: 'CONFIRM_MISSING_RESULT_VENUE',
      payload: { reviewId: request.params.reviewId,
        attendanceConfirmed: request.body.attendanceConfirmed, note: request.body.note },
      run: dependencies.confirmVenue,
    }),
  );

  app.post<{ Body: StartMissingResultReviewBody; Headers: Headers; Params: Params }>(
    '/api/v1/central/missing-result-reviews/:reviewId/start-review', {
      schema: {
        operationId: 'startMissingResultReview',
        params: Type.Object({ reviewId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: StartMissingResultReviewBodySchema,
        response: { 200: MissingResultReviewCommandResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema },
      },
    }, async (request, reply) => execute({
      request: request as FastifyRequest, reply, authorization: request.headers.authorization,
      keyHeader: request.headers['idempotency-key'], ifMatch: request.headers['if-match'],
      reviewId: request.params.reviewId, central: true, commandType: 'START_MISSING_RESULT_REVIEW',
      payload: { reviewId: request.params.reviewId }, run: dependencies.startReview,
    }),
  );

  app.post<{ Body: AssignMissingResultCoachBody; Headers: Headers; Params: Params }>(
    '/api/v1/central/missing-result-reviews/:reviewId/assign-coach', {
      schema: {
        operationId: 'assignMissingResultReviewerCoach',
        params: Type.Object({ reviewId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: AssignMissingResultCoachBodySchema,
        response: { 200: MissingResultReviewCommandResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema },
      },
    }, async (request, reply) => execute({
      request: request as FastifyRequest, reply, authorization: request.headers.authorization,
      keyHeader: request.headers['idempotency-key'], ifMatch: request.headers['if-match'],
      reviewId: request.params.reviewId, central: true, commandType: 'ASSIGN_RESULT_REVIEWER_COACH',
      payload: { reviewId: request.params.reviewId,
        reviewerCoachUserId: request.body.reviewerCoachUserId,
        repeatObjectivelyImpossible: request.body.repeatObjectivelyImpossible,
        reason: request.body.reason },
      run: dependencies.assignCoach,
    }),
  );

  app.post<{ Body: OrderMissingResultRepeatBody; Headers: Headers; Params: Params }>(
    '/api/v1/central/missing-result-reviews/:reviewId/order-repeat', {
      schema: {
        operationId: 'orderMissingResultRepeat',
        params: Type.Object({ reviewId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: OrderMissingResultRepeatBodySchema,
        response: { 200: MissingResultReviewCommandResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema },
      },
    }, async (request, reply) => execute({
      request: request as FastifyRequest, reply, authorization: request.headers.authorization,
      keyHeader: request.headers['idempotency-key'], ifMatch: request.headers['if-match'],
      reviewId: request.params.reviewId, central: true, commandType: 'ORDER_MISSING_RESULT_REPEAT',
      payload: { reviewId: request.params.reviewId, reason: request.body.reason },
      run: dependencies.orderRepeat,
    }),
  );
}
