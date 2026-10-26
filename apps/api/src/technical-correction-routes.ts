import {
  ApiErrorSchema,
  ApproveTechnicalCorrectionBodySchema,
  RejectTechnicalCorrectionBodySchema,
  RequestTechnicalCorrectionBodySchema,
  StartTechnicalCorrectionReviewBodySchema,
  TechnicalCorrectionCommandResponseSchema,
  TechnicalCorrectionListResponseSchema,
  type RejectTechnicalCorrectionBody,
  type ApproveTechnicalCorrectionBody,
  type RequestTechnicalCorrectionBody,
  type StartTechnicalCorrectionReviewBody,
  type TechnicalCorrectionCommandResponse,
  type TechnicalCorrectionListResponse,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope } from '@molokh/core';
import type {
  ExecutedCommand,
  ApproveTechnicalCorrectionPayload,
  RejectTechnicalCorrectionPayload,
  RequestTechnicalCorrectionPayload,
  StartTechnicalCorrectionReviewPayload,
  TechnicalCorrectionEffectIds,
  TechnicalCorrectionApprovalEffectIds,
  TechnicalCorrectionProjection,
  TechnicalCorrectionRejectionEffectIds,
  TechnicalCorrectionReviewEffectIds,
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
interface Params { readonly resultId: string }
interface CorrectionParams { readonly correctionId: string }

export interface TechnicalCorrectionRouteDependencies {
  readonly auth: AuthAdapter;
  readonly centralAuth: AuthAdapter;
  readonly listForViewer: (viewerUserId: string) => Promise<TechnicalCorrectionProjection[]>;
  readonly listForCentral: (centralUserId: string) => Promise<TechnicalCorrectionProjection[]>;
  readonly request: (
    command: CommandEnvelope<RequestTechnicalCorrectionPayload>,
    ids: TechnicalCorrectionEffectIds,
  ) => Promise<ExecutedCommand<TechnicalCorrectionProjection>>;
  readonly startReview: (
    command: CommandEnvelope<StartTechnicalCorrectionReviewPayload>,
    ids: TechnicalCorrectionReviewEffectIds,
  ) => Promise<ExecutedCommand<TechnicalCorrectionProjection>>;
  readonly reject: (
    command: CommandEnvelope<RejectTechnicalCorrectionPayload>,
    ids: TechnicalCorrectionRejectionEffectIds,
  ) => Promise<ExecutedCommand<TechnicalCorrectionProjection>>;
  readonly approve: (
    command: CommandEnvelope<ApproveTechnicalCorrectionPayload>,
    ids: TechnicalCorrectionApprovalEffectIds,
  ) => Promise<ExecutedCommand<TechnicalCorrectionProjection>>;
}

function unauthorized(request: FastifyRequest) {
  return { code: 'UNAUTHENTICATED', message: 'Authentication is required',
    requestId: requestContext(request).requestId };
}

function operationKey(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new InvalidCommandEnvelopeError('Idempotency-Key');
  return normalized;
}

function sourceVersion(value: string | undefined): number {
  const parsed = Number(value?.trim().match(/^"?(\d+)"?$/)?.[1]);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new InvalidCommandEnvelopeError('If-Match');
  return parsed;
}

function envelope(input: {
  readonly actorUserId: string;
  readonly actorRole: 'COACH' | 'CENTRAL_ADMIN';
  readonly correctionId: string;
  readonly idempotencyKey: string;
  readonly payload: RequestTechnicalCorrectionPayload;
  readonly request: FastifyRequest;
}): CommandEnvelope<RequestTechnicalCorrectionPayload> {
  const context = requestContext(input.request);
  return {
    commandId: newUuidV7(),
    commandType: 'REQUEST_TECHNICAL_CORRECTION',
    idempotencyKey: input.idempotencyKey,
    actor: { type: 'USER', id: input.actorUserId, roles: [input.actorRole], scopeIds: [] },
    aggregateType: 'TechnicalCorrection',
    aggregateId: input.correctionId,
    expectedVersion: 0,
    correlationId: context.correlationId,
    causationId: context.causationId,
    requestId: context.requestId,
    source: 'api',
    payloadVersion: 1,
    payload: input.payload,
  };
}

function effectIds(correctionId: string): TechnicalCorrectionEffectIds {
  return {
    correctionId,
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    notificationOutboxMessageId: newUuidV7(),
    notificationId: newUuidV7(),
  };
}

function transitionEnvelope<TPayload extends { readonly correctionId: string }>(input: {
  readonly actorUserId: string;
  readonly correctionId: string;
  readonly commandType: string;
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly payload: TPayload;
  readonly request: FastifyRequest;
}): CommandEnvelope<TPayload> {
  const context = requestContext(input.request);
  return {
    commandId: newUuidV7(), commandType: input.commandType,
    idempotencyKey: input.idempotencyKey,
    actor: { type: 'USER', id: input.actorUserId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
    aggregateType: 'TechnicalCorrection', aggregateId: input.correctionId,
    expectedVersion: input.expectedVersion, correlationId: context.correlationId,
    causationId: context.causationId, requestId: context.requestId,
    source: 'admin', payloadVersion: 1, payload: input.payload,
  };
}

function transitionIds(): TechnicalCorrectionReviewEffectIds {
  return { eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7() };
}

function rejectionIds(): TechnicalCorrectionRejectionEffectIds {
  return { ...transitionIds(), notificationOutboxMessageId: newUuidV7(),
    notificationId: newUuidV7() };
}

function approvalIds(): TechnicalCorrectionApprovalEffectIds {
  return {
    ...transitionIds(),
    decisionId: newUuidV7(),
    statusCompensationId: newUuidV7(),
    statusTransitionId: newUuidV7(),
    statusEventId: newUuidV7(),
    cooldownId: newUuidV7(),
    cooldownEventId: newUuidV7(),
    notificationOutboxMessageId: newUuidV7(),
    notificationIds: [newUuidV7(), newUuidV7(), newUuidV7()],
  };
}

export async function registerTechnicalCorrectionRoutes(
  app: FastifyInstance, dependencies: TechnicalCorrectionRouteDependencies,
): Promise<void> {
  app.get<{ Headers: Headers }>('/api/v1/me/technical-corrections', {
    schema: { operationId: 'listMyTechnicalCorrections', response: {
      200: TechnicalCorrectionListResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
    } },
  }, async (request, reply): Promise<TechnicalCorrectionListResponse | undefined> => {
    const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
    if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
    return {
      data: (await dependencies.listForViewer(authenticated.userId)) as TechnicalCorrectionListResponse['data'],
      meta: { requestId: requestContext(request).requestId },
    };
  });

  app.get<{ Headers: Headers }>('/api/v1/central/technical-corrections', {
    schema: { operationId: 'listCentralTechnicalCorrections', response: {
      200: TechnicalCorrectionListResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
    } },
  }, async (request, reply): Promise<TechnicalCorrectionListResponse | undefined> => {
    const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
    if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
    return {
      data: (await dependencies.listForCentral(authenticated.userId)) as TechnicalCorrectionListResponse['data'],
      meta: { requestId: requestContext(request).requestId },
    };
  });

  const run = async (input: {
    readonly request: FastifyRequest;
    readonly reply: FastifyReply;
    readonly auth: AuthAdapter;
    readonly actorRole: 'COACH' | 'CENTRAL_ADMIN';
    readonly authorization: string | undefined;
    readonly keyHeader: string | undefined;
    readonly ifMatch: string | undefined;
    readonly resultId: string;
    readonly body: RequestTechnicalCorrectionBody;
  }): Promise<void> => {
    const authenticated = await input.auth.authenticate(input.authorization);
    if (!authenticated) { await input.reply.status(401).send(unauthorized(input.request)); return; }
    const key = operationKey(input.keyHeader);
    const correctionId = idempotentResourceId('TechnicalCorrection', input.resultId, key);
    const executed = await dependencies.request(envelope({
      actorUserId: authenticated.userId,
      actorRole: input.actorRole,
      correctionId,
      idempotencyKey: key,
      payload: {
        resultId: input.resultId,
        expectedResultVersion: sourceVersion(input.ifMatch),
        category: input.body.category,
        proposedOutcomeCode: input.body.proposedOutcomeCode,
        proposedWinnerUserId: input.body.proposedWinnerUserId ?? null,
        internalReason: input.body.internalReason,
        evidenceReference: input.body.evidenceReference,
      },
      request: input.request,
    }), effectIds(correctionId));
    const response: TechnicalCorrectionCommandResponse = {
      data: executed.response as TechnicalCorrectionCommandResponse['data'],
      meta: {
        requestId: requestContext(input.request).requestId,
        eventId: executed.eventId,
        replayed: executed.replayed,
      },
    };
    await input.reply.status(executed.responseStatus).send(response);
  };

  const routeSchema = {
    params: Type.Object({ resultId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
    body: RequestTechnicalCorrectionBodySchema,
    response: { 201: TechnicalCorrectionCommandResponseSchema, 400: ApiErrorSchema,
      401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema },
  };

  app.post<{ Body: RequestTechnicalCorrectionBody; Headers: Headers; Params: Params }>(
    '/api/v1/results/:resultId/technical-corrections', {
      schema: { operationId: 'requestTechnicalCorrection', ...routeSchema },
    }, async (request, reply) => run({
      request: request as FastifyRequest, reply, auth: dependencies.auth, actorRole: 'COACH',
      authorization: request.headers.authorization,
      keyHeader: request.headers['idempotency-key'], ifMatch: request.headers['if-match'],
      resultId: request.params.resultId, body: request.body,
    }),
  );

  app.post<{ Body: RequestTechnicalCorrectionBody; Headers: Headers; Params: Params }>(
    '/api/v1/central/results/:resultId/technical-corrections', {
      schema: { operationId: 'requestCentralTechnicalCorrection', ...routeSchema },
    }, async (request, reply) => run({
      request: request as FastifyRequest, reply, auth: dependencies.centralAuth,
      actorRole: 'CENTRAL_ADMIN', authorization: request.headers.authorization,
      keyHeader: request.headers['idempotency-key'], ifMatch: request.headers['if-match'],
      resultId: request.params.resultId, body: request.body,
    }),
  );

  const correctionParams = Type.Object({ correctionId: Type.String({ format: 'uuid' }) },
    { additionalProperties: false });
  const transitionResponses = { 200: TechnicalCorrectionCommandResponseSchema,
    400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema };
  const runTransition = async <TPayload extends { readonly correctionId: string },
    TIds extends TechnicalCorrectionReviewEffectIds>(input: {
    readonly request: FastifyRequest;
    readonly reply: FastifyReply;
    readonly authorization: string | undefined;
    readonly keyHeader: string | undefined;
    readonly ifMatch: string | undefined;
    readonly correctionId: string;
    readonly commandType: string;
    readonly payload: TPayload;
    readonly run: (command: CommandEnvelope<TPayload>, ids: TIds) =>
      Promise<ExecutedCommand<TechnicalCorrectionProjection>>;
    readonly ids: TIds;
  }): Promise<void> => {
    const authenticated = await dependencies.centralAuth.authenticate(input.authorization);
    if (!authenticated) { await input.reply.status(401).send(unauthorized(input.request)); return; }
    const executed = await input.run(transitionEnvelope({
      actorUserId: authenticated.userId, correctionId: input.correctionId,
      commandType: input.commandType, idempotencyKey: operationKey(input.keyHeader),
      expectedVersion: sourceVersion(input.ifMatch), payload: input.payload,
      request: input.request,
    }), input.ids);
    const response: TechnicalCorrectionCommandResponse = {
      data: executed.response as TechnicalCorrectionCommandResponse['data'],
      meta: { requestId: requestContext(input.request).requestId,
        eventId: executed.eventId, replayed: executed.replayed },
    };
    await input.reply.status(executed.responseStatus).send(response);
  };

  app.post<{ Body: StartTechnicalCorrectionReviewBody; Headers: Headers;
    Params: CorrectionParams }>('/api/v1/central/technical-corrections/:correctionId/start-review', {
      schema: { operationId: 'startTechnicalCorrectionReview', params: correctionParams,
        body: StartTechnicalCorrectionReviewBodySchema, response: transitionResponses },
    }, async (request, reply) => runTransition({ request: request as FastifyRequest, reply,
      authorization: request.headers.authorization, keyHeader: request.headers['idempotency-key'],
      ifMatch: request.headers['if-match'], correctionId: request.params.correctionId,
      commandType: 'START_TECHNICAL_CORRECTION_REVIEW',
      payload: { correctionId: request.params.correctionId }, run: dependencies.startReview,
      ids: transitionIds() }));

  app.post<{ Body: RejectTechnicalCorrectionBody; Headers: Headers;
    Params: CorrectionParams }>('/api/v1/central/technical-corrections/:correctionId/reject', {
      schema: { operationId: 'rejectTechnicalCorrection', params: correctionParams,
        body: RejectTechnicalCorrectionBodySchema, response: transitionResponses },
    }, async (request, reply) => runTransition({ request: request as FastifyRequest, reply,
      authorization: request.headers.authorization, keyHeader: request.headers['idempotency-key'],
      ifMatch: request.headers['if-match'], correctionId: request.params.correctionId,
      commandType: 'REJECT_TECHNICAL_CORRECTION',
      payload: { correctionId: request.params.correctionId, reason: request.body.reason },
      run: dependencies.reject, ids: rejectionIds() }));

  app.post<{ Body: ApproveTechnicalCorrectionBody; Headers: Headers;
    Params: CorrectionParams }>('/api/v1/central/technical-corrections/:correctionId/approve', {
      schema: { operationId: 'approveTechnicalCorrection', params: correctionParams,
        body: ApproveTechnicalCorrectionBodySchema, response: transitionResponses },
    }, async (request, reply) => runTransition({ request: request as FastifyRequest, reply,
      authorization: request.headers.authorization, keyHeader: request.headers['idempotency-key'],
      ifMatch: request.headers['if-match'], correctionId: request.params.correctionId,
      commandType: 'APPROVE_TECHNICAL_CORRECTION',
      payload: { correctionId: request.params.correctionId, reason: request.body.reason },
      run: dependencies.approve, ids: approvalIds() }));
}
