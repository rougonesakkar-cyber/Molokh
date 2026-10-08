import {
  ApiErrorSchema,
  RequestTechnicalCorrectionBodySchema,
  TechnicalCorrectionCommandResponseSchema,
  TechnicalCorrectionListResponseSchema,
  type RequestTechnicalCorrectionBody,
  type TechnicalCorrectionCommandResponse,
  type TechnicalCorrectionListResponse,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope } from '@molokh/core';
import type {
  ExecutedCommand,
  RequestTechnicalCorrectionPayload,
  TechnicalCorrectionEffectIds,
  TechnicalCorrectionProjection,
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

export interface TechnicalCorrectionRouteDependencies {
  readonly auth: AuthAdapter;
  readonly centralAuth: AuthAdapter;
  readonly listForViewer: (viewerUserId: string) => Promise<TechnicalCorrectionProjection[]>;
  readonly listForCentral: (centralUserId: string) => Promise<TechnicalCorrectionProjection[]>;
  readonly request: (
    command: CommandEnvelope<RequestTechnicalCorrectionPayload>,
    ids: TechnicalCorrectionEffectIds,
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
}
