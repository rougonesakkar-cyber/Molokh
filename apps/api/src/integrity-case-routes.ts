import {
  ApiErrorSchema,
  DecideIntegrityCaseBodySchema,
  IntegrityCaseCommandResponseSchema,
  IntegrityCaseListResponseSchema,
  IntegrityCaseResponseSchema,
  OpenIntegrityCaseBodySchema,
  StartIntegrityReviewBodySchema,
  type DecideIntegrityCaseBody,
  type IntegrityCaseCommandResponse,
  type IntegrityCaseListResponse,
  type IntegrityCaseResponse,
  type OpenIntegrityCaseBody,
  type StartIntegrityReviewBody,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope } from '@molokh/core';
import type {
  DecideIntegrityCasePayload,
  ExecutedCommand,
  IntegrityCaseEffectIds,
  IntegrityCaseProjection,
  OpenIntegrityCasePayload,
  StartIntegrityReviewPayload,
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
interface Params { readonly caseId: string }

export interface IntegrityCaseRouteDependencies {
  readonly auth: AuthAdapter;
  readonly centralAuth: AuthAdapter;
  readonly listForViewer: (viewerUserId: string) => Promise<IntegrityCaseProjection[]>;
  readonly listForCentral: (centralUserId: string) => Promise<IntegrityCaseProjection[]>;
  readonly read: (caseId: string, viewerUserId: string) => Promise<IntegrityCaseProjection>;
  readonly open: (
    command: CommandEnvelope<OpenIntegrityCasePayload>, ids: IntegrityCaseEffectIds,
  ) => Promise<ExecutedCommand<IntegrityCaseProjection>>;
  readonly startReview: (
    command: CommandEnvelope<StartIntegrityReviewPayload>, ids: IntegrityCaseEffectIds,
  ) => Promise<ExecutedCommand<IntegrityCaseProjection>>;
  readonly decide: (
    command: CommandEnvelope<DecideIntegrityCasePayload>, ids: IntegrityCaseEffectIds,
  ) => Promise<ExecutedCommand<IntegrityCaseProjection>>;
}

function unauthorized(request: FastifyRequest) {
  return { code: 'UNAUTHENTICATED', message: 'Authentication is required',
    requestId: requestContext(request).requestId };
}
function key(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new InvalidCommandEnvelopeError('Idempotency-Key');
  return normalized;
}
function version(value: string | undefined): number {
  const parsed = Number(value?.trim().match(/^"?(\d+)"?$/)?.[1]);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new InvalidCommandEnvelopeError('If-Match');
  return parsed;
}
function envelope<T>(input: {
  readonly actorUserId: string;
  readonly caseId: string;
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
    actor: { type: 'USER', id: input.actorUserId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
    aggregateType: 'IntegrityCase', aggregateId: input.caseId,
    expectedVersion: input.expectedVersion, correlationId: context.correlationId,
    causationId: context.causationId, requestId: context.requestId,
    source: 'api', payloadVersion: 1, payload: input.payload,
  };
}
function effectIds(caseId: string, operationKey: string): IntegrityCaseEffectIds {
  return {
    eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7(), caseId,
    decisionId: idempotentResourceId('IntegrityDecision', caseId, operationKey),
    resultEventId: newUuidV7(), challengeEventId: newUuidV7(), competitionEventId: newUuidV7(),
    compensationId: idempotentResourceId('IntegrityCompensation', caseId, operationKey),
    cooldownEventId: newUuidV7(), obligationIds: [newUuidV7(), newUuidV7()],
    notificationOutboxMessageId: newUuidV7(),
    notificationIds: [newUuidV7(), newUuidV7(), newUuidV7()],
  };
}
function response(
  executed: ExecutedCommand<IntegrityCaseProjection>, requestId: string,
): IntegrityCaseCommandResponse {
  return { data: executed.response as IntegrityCaseCommandResponse['data'],
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed } };
}

export async function registerIntegrityCaseRoutes(
  app: FastifyInstance, dependencies: IntegrityCaseRouteDependencies,
): Promise<void> {
  app.get<{ Headers: Headers }>('/api/v1/me/integrity-cases', {
    schema: { operationId: 'listMyIntegrityCases', response: {
      200: IntegrityCaseListResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
    } },
  }, async (request, reply): Promise<IntegrityCaseListResponse | undefined> => {
    const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
    if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
    return { data: await dependencies.listForViewer(authenticated.userId) as IntegrityCaseListResponse['data'],
      meta: { requestId: requestContext(request).requestId } };
  });

  app.get<{ Headers: Headers }>('/api/v1/central/integrity-cases', {
    schema: { operationId: 'listCentralIntegrityCases', response: {
      200: IntegrityCaseListResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
    } },
  }, async (request, reply): Promise<IntegrityCaseListResponse | undefined> => {
    const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
    if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
    return { data: await dependencies.listForCentral(authenticated.userId) as IntegrityCaseListResponse['data'],
      meta: { requestId: requestContext(request).requestId } };
  });

  app.get<{ Headers: Headers; Params: Params }>('/api/v1/integrity-cases/:caseId', {
    schema: { operationId: 'readIntegrityCase',
      params: Type.Object({ caseId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
      response: { 200: IntegrityCaseResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema } },
  }, async (request, reply): Promise<IntegrityCaseResponse | undefined> => {
    const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
    if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
    return {
      data: (await dependencies.read(
        request.params.caseId,
        authenticated.userId,
      )) as IntegrityCaseResponse['data'],
      meta: { requestId: requestContext(request).requestId },
    };
  });

  app.post<{ Body: OpenIntegrityCaseBody; Headers: Headers }>('/api/v1/central/integrity-cases', {
    schema: { operationId: 'openIntegrityCase', body: OpenIntegrityCaseBodySchema,
      response: { 201: IntegrityCaseCommandResponseSchema, 400: ApiErrorSchema,
        401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema } },
  }, async (request, reply): Promise<undefined> => {
    const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
    if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
    const operationKey = key(request.headers['idempotency-key']);
    const sourceVersion = version(request.headers['if-match']);
    const caseId = idempotentResourceId('IntegrityCase', request.body.resultId, operationKey);
    const executed = await dependencies.open(envelope({
      actorUserId: authenticated.userId, caseId, commandType: 'OPEN_INTEGRITY_CASE',
      idempotencyKey: operationKey, expectedVersion: 0,
      payload: { ...request.body, expectedResultVersion: sourceVersion }, request,
    }), effectIds(caseId, operationKey));
    await reply.status(executed.responseStatus).send(response(executed, requestContext(request).requestId));
  });

  const execute = async <T>(input: {
    readonly request: FastifyRequest; readonly reply: FastifyReply;
    readonly authorization: string | undefined; readonly keyHeader: string | undefined;
    readonly ifMatch: string | undefined; readonly caseId: string; readonly commandType: string;
    readonly payload: T;
    readonly run: (command: CommandEnvelope<T>, ids: IntegrityCaseEffectIds) => Promise<ExecutedCommand<IntegrityCaseProjection>>;
  }) => {
    const authenticated = await dependencies.centralAuth.authenticate(input.authorization);
    if (!authenticated) { await input.reply.status(401).send(unauthorized(input.request)); return; }
    const operationKey = key(input.keyHeader);
    const executed = await input.run(envelope({
      actorUserId: authenticated.userId, caseId: input.caseId, commandType: input.commandType,
      idempotencyKey: operationKey, expectedVersion: version(input.ifMatch),
      payload: input.payload, request: input.request,
    }), effectIds(input.caseId, operationKey));
    await input.reply.status(executed.responseStatus)
      .send(response(executed, requestContext(input.request).requestId));
  };

  app.post<{ Body: StartIntegrityReviewBody; Headers: Headers; Params: Params }>(
    '/api/v1/central/integrity-cases/:caseId/start-review', {
      schema: { operationId: 'startIntegrityReview',
        params: Type.Object({ caseId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: StartIntegrityReviewBodySchema,
        response: { 200: IntegrityCaseCommandResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema } },
    }, async (request, reply) => execute({ request: request as FastifyRequest, reply,
      authorization: request.headers.authorization, keyHeader: request.headers['idempotency-key'],
      ifMatch: request.headers['if-match'], caseId: request.params.caseId,
      commandType: 'START_INTEGRITY_REVIEW', payload: { caseId: request.params.caseId },
      run: dependencies.startReview }),
  );

  app.post<{ Body: DecideIntegrityCaseBody; Headers: Headers; Params: Params }>(
    '/api/v1/central/integrity-cases/:caseId/decision', {
      schema: { operationId: 'decideIntegrityCase',
        params: Type.Object({ caseId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: DecideIntegrityCaseBodySchema,
        response: { 200: IntegrityCaseCommandResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema } },
    }, async (request, reply) => execute({ request: request as FastifyRequest, reply,
      authorization: request.headers.authorization, keyHeader: request.headers['idempotency-key'],
      ifMatch: request.headers['if-match'], caseId: request.params.caseId,
      commandType: 'DECIDE_INTEGRITY_CASE', payload: { caseId: request.params.caseId,
        disposition: request.body.disposition,
        correctedOutcomeCode: request.body.correctedOutcomeCode ?? null,
        reason: request.body.reason }, run: dependencies.decide }),
  );
}
