import {
  ApiErrorSchema,
  PlatformIncidentCommandResponseSchema,
  PlatformIncidentListResponseSchema,
  PlatformIncidentReasonBodySchema,
  ResolvePlatformIncidentBodySchema,
  type PlatformIncidentCommandResponse,
  type PlatformIncidentListResponse,
  type PlatformIncidentReasonBody,
  type ResolvePlatformIncidentBody,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope } from '@molokh/core';
import type {
  ConfirmPlatformIncidentPayload,
  ExecutedCommand,
  PlatformIncidentEffectIds,
  PlatformIncidentProjection,
  RejectPlatformIncidentPayload,
  ResolvePlatformIncidentPayload,
} from '@molokh/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { newUuidV7 } from './uuid-v7.js';

interface Headers {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}
interface Params { readonly incidentId: string }

export interface PlatformIncidentRouteDependencies {
  readonly centralAuth: AuthAdapter;
  readonly list: (centralUserId: string) => Promise<PlatformIncidentProjection[]>;
  readonly confirm: (
    command: CommandEnvelope<ConfirmPlatformIncidentPayload>, ids: PlatformIncidentEffectIds,
  ) => Promise<ExecutedCommand<PlatformIncidentProjection>>;
  readonly reject: (
    command: CommandEnvelope<RejectPlatformIncidentPayload>, ids: PlatformIncidentEffectIds,
  ) => Promise<ExecutedCommand<PlatformIncidentProjection>>;
  readonly resolve: (
    command: CommandEnvelope<ResolvePlatformIncidentPayload>, ids: PlatformIncidentEffectIds,
  ) => Promise<ExecutedCommand<PlatformIncidentProjection>>;
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
function expectedVersion(value: string | undefined): number {
  const parsed = Number(value?.trim().match(/^"?(\d+)"?$/)?.[1]);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new InvalidCommandEnvelopeError('If-Match');
  }
  return parsed;
}
function effectIds(): PlatformIncidentEffectIds {
  return { eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7() };
}
function response(
  executed: ExecutedCommand<PlatformIncidentProjection>, requestId: string,
): PlatformIncidentCommandResponse {
  return { data: executed.response as PlatformIncidentCommandResponse['data'],
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed } };
}

export async function registerPlatformIncidentRoutes(
  app: FastifyInstance,
  dependencies: PlatformIncidentRouteDependencies,
): Promise<void> {
  app.get<{ Headers: Headers }>('/api/v1/central/platform-incidents', {
    schema: { operationId: 'listPlatformIncidents', response: {
      200: PlatformIncidentListResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
    } },
  }, async (request, reply): Promise<PlatformIncidentListResponse | undefined> => {
    const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
    if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
    return { data: await dependencies.list(authenticated.userId) as PlatformIncidentListResponse['data'],
      meta: { requestId: requestContext(request).requestId } };
  });

  const execute = async <TPayload>(input: {
    readonly request: FastifyRequest;
    readonly reply: FastifyReply;
    readonly authorization: string | undefined;
    readonly keyHeader: string | undefined;
    readonly ifMatch: string | undefined;
    readonly incidentId: string;
    readonly commandType: string;
    readonly payload: TPayload;
    readonly run: (
      command: CommandEnvelope<TPayload>, ids: PlatformIncidentEffectIds,
    ) => Promise<ExecutedCommand<PlatformIncidentProjection>>;
  }): Promise<void> => {
    const authenticated = await dependencies.centralAuth.authenticate(input.authorization);
    if (!authenticated) { await input.reply.status(401).send(unauthorized(input.request)); return; }
    const context = requestContext(input.request);
    const command: CommandEnvelope<TPayload> = {
      commandId: newUuidV7(), commandType: input.commandType,
      idempotencyKey: operationKey(input.keyHeader),
      actor: { type: 'USER', id: authenticated.userId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
      aggregateType: 'PlatformIncident', aggregateId: input.incidentId,
      expectedVersion: expectedVersion(input.ifMatch), correlationId: context.correlationId,
      causationId: context.causationId, requestId: context.requestId,
      source: 'admin', payloadVersion: 1, payload: input.payload,
    };
    const executed = await input.run(command, effectIds());
    await input.reply.status(executed.responseStatus).send(response(executed, context.requestId));
  };

  const params = Type.Object({ incidentId: Type.String({ format: 'uuid' }) },
    { additionalProperties: false });
  const commandResponses = { 200: PlatformIncidentCommandResponseSchema,
    400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema };

  app.post<{ Body: PlatformIncidentReasonBody; Headers: Headers; Params: Params }>(
    '/api/v1/central/platform-incidents/:incidentId/confirm', {
      schema: { operationId: 'confirmPlatformIncident', params,
        body: PlatformIncidentReasonBodySchema, response: commandResponses },
    }, async (request, reply) => execute({ request: request as FastifyRequest, reply,
      authorization: request.headers.authorization, keyHeader: request.headers['idempotency-key'],
      ifMatch: request.headers['if-match'], incidentId: request.params.incidentId,
      commandType: 'CONFIRM_PLATFORM_INCIDENT',
      payload: { incidentId: request.params.incidentId, reason: request.body.reason },
      run: dependencies.confirm }));

  app.post<{ Body: PlatformIncidentReasonBody; Headers: Headers; Params: Params }>(
    '/api/v1/central/platform-incidents/:incidentId/reject', {
      schema: { operationId: 'rejectPlatformIncident', params,
        body: PlatformIncidentReasonBodySchema, response: commandResponses },
    }, async (request, reply) => execute({ request: request as FastifyRequest, reply,
      authorization: request.headers.authorization, keyHeader: request.headers['idempotency-key'],
      ifMatch: request.headers['if-match'], incidentId: request.params.incidentId,
      commandType: 'REJECT_PLATFORM_INCIDENT',
      payload: { incidentId: request.params.incidentId, reason: request.body.reason },
      run: dependencies.reject }));

  app.post<{ Body: ResolvePlatformIncidentBody; Headers: Headers; Params: Params }>(
    '/api/v1/central/platform-incidents/:incidentId/resolve', {
      schema: { operationId: 'resolvePlatformIncident', params,
        body: ResolvePlatformIncidentBodySchema, response: commandResponses },
    }, async (request, reply) => execute({ request: request as FastifyRequest, reply,
      authorization: request.headers.authorization, keyHeader: request.headers['idempotency-key'],
      ifMatch: request.headers['if-match'], incidentId: request.params.incidentId,
      commandType: 'RESOLVE_PLATFORM_INCIDENT',
      payload: { incidentId: request.params.incidentId, endedAt: request.body.endedAt,
        reason: request.body.reason }, run: dependencies.resolve }));
}
