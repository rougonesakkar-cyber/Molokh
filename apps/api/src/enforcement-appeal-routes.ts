import {
  ApiErrorSchema,
  EnforcementAppealCommandResponseSchema,
  EnforcementAppealListResponseSchema,
  MyEnforcementAppealResponseSchema,
  StartEnforcementAppealReviewBodySchema,
  SubmitEnforcementAppealBodySchema,
  type EnforcementAppealCommandResponse,
  type EnforcementAppealListResponse,
  type MyEnforcementAppealResponse,
  type SubmitEnforcementAppealBody,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope } from '@molokh/core';
import type {
  ActiveEnforcementAppealContext,
  EnforcementAppealEffectIds,
  EnforcementAppealProjection,
  EnforcementAppealReviewEffectIds,
  ExecutedCommand,
  StartEnforcementAppealReviewPayload,
  SubmitEnforcementAppealPayload,
} from '@molokh/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { idempotentResourceId, newUuidV7 } from './uuid-v7.js';

interface Headers {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}
interface EnforcementParams { readonly enforcementId: string }
interface AppealParams { readonly appealId: string }

export interface EnforcementAppealRouteDependencies {
  readonly auth: AuthAdapter;
  readonly centralAuth: AuthAdapter;
  readonly readForSubject: (subjectUserId: string) => Promise<ActiveEnforcementAppealContext | null>;
  readonly listForCentral: (centralUserId: string) => Promise<readonly EnforcementAppealProjection[]>;
  readonly submit: (
    command: CommandEnvelope<SubmitEnforcementAppealPayload>, ids: EnforcementAppealEffectIds,
  ) => Promise<ExecutedCommand<EnforcementAppealProjection>>;
  readonly startReview: (
    command: CommandEnvelope<StartEnforcementAppealReviewPayload>,
    ids: EnforcementAppealReviewEffectIds,
  ) => Promise<ExecutedCommand<EnforcementAppealProjection>>;
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

function version(value: string | undefined, minimum: number): number {
  const parsed = Number(value?.trim().match(/^"?(\d+)"?$/)?.[1]);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new InvalidCommandEnvelopeError('If-Match');
  }
  return parsed;
}

function response(
  executed: ExecutedCommand<EnforcementAppealProjection>, requestId: string,
): EnforcementAppealCommandResponse {
  return { data: executed.response as EnforcementAppealCommandResponse['data'],
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed } };
}

function submitIds(appealId: string): EnforcementAppealEffectIds {
  return { appealId, eventId: newUuidV7(), auditId: newUuidV7(),
    outboxMessageId: newUuidV7(), notificationOutboxMessageId: newUuidV7(),
    notificationId: newUuidV7() };
}

function reviewIds(): EnforcementAppealReviewEffectIds {
  return { eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7(),
    notificationOutboxMessageId: newUuidV7(), notificationId: newUuidV7() };
}

export async function registerEnforcementAppealRoutes(
  app: FastifyInstance, dependencies: EnforcementAppealRouteDependencies,
): Promise<void> {
  app.get<{ Headers: Headers }>('/api/v1/me/enforcement-appeal', {
    schema: { operationId: 'readMyEnforcementAppeal', response: {
      200: MyEnforcementAppealResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
    } },
  }, async (request, reply): Promise<MyEnforcementAppealResponse | undefined> => {
    const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
    if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
    return { data: await dependencies.readForSubject(authenticated.userId) as MyEnforcementAppealResponse['data'],
      meta: { requestId: requestContext(request).requestId } };
  });

  app.get<{ Headers: Headers }>('/api/v1/central/enforcement-appeals', {
    schema: { operationId: 'listCentralEnforcementAppeals', response: {
      200: EnforcementAppealListResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
    } },
  }, async (request, reply): Promise<EnforcementAppealListResponse | undefined> => {
    const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
    if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
    return { data: [...await dependencies.listForCentral(authenticated.userId)] as EnforcementAppealListResponse['data'],
      meta: { requestId: requestContext(request).requestId } };
  });

  app.post<{ Headers: Headers; Params: EnforcementParams; Body: SubmitEnforcementAppealBody }>(
    '/api/v1/enforcements/:enforcementId/appeals', {
      schema: { operationId: 'submitEnforcementAppeal',
        params: Type.Object({ enforcementId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: SubmitEnforcementAppealBodySchema,
        response: { 201: EnforcementAppealCommandResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema } },
    }, async (request, reply) => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
      const context = requestContext(request);
      const key = operationKey(request.headers['idempotency-key']);
      const appealId = idempotentResourceId('EnforcementAppeal', request.params.enforcementId, key);
      const executed = await dependencies.submit({
        commandId: newUuidV7(), commandType: 'APPEAL_ENFORCEMENT', idempotencyKey: key,
        actor: { type: 'USER', id: authenticated.userId, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'EnforcementAppeal', aggregateId: appealId, expectedVersion: 0,
        correlationId: context.correlationId, causationId: context.causationId,
        requestId: context.requestId, source: 'api', payloadVersion: 1,
        payload: { enforcementId: request.params.enforcementId,
          expectedEnforcementVersion: version(request.headers['if-match'], 1),
          statement: request.body.statement },
      }, submitIds(appealId));
      await reply.status(executed.responseStatus).send(response(executed, context.requestId));
    });

  app.post<{ Headers: Headers; Params: AppealParams; Body: Record<string, never> }>(
    '/api/v1/central/enforcement-appeals/:appealId/start-review', {
      schema: { operationId: 'startEnforcementAppealReview',
        params: Type.Object({ appealId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: StartEnforcementAppealReviewBodySchema,
        response: { 200: EnforcementAppealCommandResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema } },
    }, async (request, reply) => {
      const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
      if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
      const context = requestContext(request);
      const executed = await dependencies.startReview({
        commandId: newUuidV7(), commandType: 'START_ENFORCEMENT_APPEAL_REVIEW',
        idempotencyKey: operationKey(request.headers['idempotency-key']),
        actor: { type: 'USER', id: authenticated.userId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
        aggregateType: 'EnforcementAppeal', aggregateId: request.params.appealId,
        expectedVersion: version(request.headers['if-match'], 1),
        correlationId: context.correlationId, causationId: context.causationId,
        requestId: context.requestId, source: 'admin', payloadVersion: 1,
        payload: { appealId: request.params.appealId },
      }, reviewIds());
      await reply.status(executed.responseStatus).send(response(executed, context.requestId));
    });
}
