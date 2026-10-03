import {
  AccountExportDownloadResponseSchema,
  AccountExportResponseSchema,
  AccountLifecycleResponseSchema,
  ApiErrorSchema,
  CentralAccountClosuresResponseSchema,
  ExecuteAccountClosureBodySchema,
  IdentityCommandResponseSchema,
  RequestAccountClosureBodySchema,
  type AccountExportDownloadResponse,
  type AccountExportResponse,
  type AccountLifecycleResponse,
  type CentralAccountClosuresResponse,
  type ExecuteAccountClosureBody,
  type IdentityCommandResponse,
  type RequestAccountClosureBody,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope,
  type IdentityProjection } from '@molokh/core';
import type {
  AccountClosureEffectIds,
  AccountExportEffectIds,
  AccountExportProjection,
  AccountLifecycleProjection,
  CancelAccountClosurePayload,
  CentralAccountClosureProjection,
  ExecuteAccountClosureEffectIds,
  ExecuteAccountClosurePayload,
  ExecutedCommand,
  RequestAccountClosurePayload,
  RequestAccountExportPayload,
} from '@molokh/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { contractIdentity } from './identity-routes.js';
import { requestContext } from './request-context.js';
import { newUuidV7 } from './uuid-v7.js';

interface Headers {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}

export interface AccountLifecycleRouteDependencies {
  readonly auth: AuthAdapter;
  readonly centralAuth: AuthAdapter;
  readonly read: (userId: string) => Promise<AccountLifecycleProjection>;
  readonly requestClosure: (command: CommandEnvelope<RequestAccountClosurePayload>,
    ids: AccountClosureEffectIds) => Promise<ExecutedCommand<AccountLifecycleProjection>>;
  readonly cancelClosure: (command: CommandEnvelope<CancelAccountClosurePayload>,
    ids: AccountClosureEffectIds) => Promise<ExecutedCommand<AccountLifecycleProjection>>;
  readonly requestExport: (command: CommandEnvelope<RequestAccountExportPayload>,
    ids: AccountExportEffectIds) => Promise<ExecutedCommand<AccountExportProjection>>;
  readonly downloadExport: (userId: string, exportId: string) => Promise<{
    readonly payload: unknown; readonly payloadSha256: string;
  }>;
  readonly listCentral: (centralUserId: string) => Promise<readonly CentralAccountClosureProjection[]>;
  readonly executeClosure: (command: CommandEnvelope<ExecuteAccountClosurePayload>,
    ids: ExecuteAccountClosureEffectIds) => Promise<ExecutedCommand<IdentityProjection>>;
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
function userActor(userId: string) {
  return { type: 'USER' as const, id: userId, roles: ['ATHLETE'], scopeIds: [] };
}
function lifecycleResponse(executed: ExecutedCommand<AccountLifecycleProjection>,
  requestId: string): AccountLifecycleResponse {
  return { data: executed.response as AccountLifecycleResponse['data'],
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed } };
}

export async function registerAccountLifecycleRoutes(app: FastifyInstance,
  dependencies: AccountLifecycleRouteDependencies): Promise<void> {
  app.get<{ Headers: Headers }>('/api/v1/me/account-lifecycle', {
    schema: { operationId: 'readMyAccountLifecycle', response: {
      200: AccountLifecycleResponseSchema, 401: ApiErrorSchema,
    } },
  }, async (request, reply): Promise<AccountLifecycleResponse | undefined> => {
    const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
    if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
    const context = requestContext(request);
    return { data: await dependencies.read(authenticated.userId) as AccountLifecycleResponse['data'],
      meta: { requestId: context.requestId } };
  });

  app.post<{ Headers: Headers; Body: RequestAccountClosureBody }>(
    '/api/v1/me/account-closure', {
      schema: { operationId: 'requestMyAccountClosure', body: RequestAccountClosureBodySchema,
        response: { 201: AccountLifecycleResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 409: ApiErrorSchema } },
    }, async (request, reply): Promise<AccountLifecycleResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
      const context = requestContext(request);
      const closureId = newUuidV7();
      const command: CommandEnvelope<RequestAccountClosurePayload> = {
        commandId: newUuidV7(), commandType: 'REQUEST_ACCOUNT_CLOSURE',
        idempotencyKey: key(request.headers['idempotency-key']), actor: userActor(authenticated.userId),
        aggregateType: 'AccountClosureRequest', aggregateId: closureId, expectedVersion: 0,
        correlationId: context.correlationId, causationId: context.causationId,
        requestId: context.requestId, source: 'api', payloadVersion: 1,
        payload: { userId: authenticated.userId, exportRequested: request.body.exportRequested },
      };
      const executed = await dependencies.requestClosure(command, {
        eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7(),
        ...(request.body.exportRequested ? { exportId: newUuidV7(), exportEventId: newUuidV7(),
          exportOutboxMessageId: newUuidV7() } : {}),
      });
      await reply.status(executed.responseStatus).send(lifecycleResponse(executed, context.requestId));
    });

  const closureParams = Type.Object({ closureId: Type.String({ format: 'uuid' }) },
    { additionalProperties: false });
  app.post<{ Headers: Headers; Params: { closureId: string } }>(
    '/api/v1/me/account-closures/:closureId/cancel', {
      schema: { operationId: 'cancelMyAccountClosure', params: closureParams,
        response: { 200: AccountLifecycleResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 409: ApiErrorSchema } },
    }, async (request, reply): Promise<AccountLifecycleResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
      const context = requestContext(request);
      const executed = await dependencies.cancelClosure({
        commandId: newUuidV7(), commandType: 'CANCEL_ACCOUNT_CLOSURE',
        idempotencyKey: key(request.headers['idempotency-key']), actor: userActor(authenticated.userId),
        aggregateType: 'AccountClosureRequest', aggregateId: request.params.closureId,
        expectedVersion: version(request.headers['if-match']), correlationId: context.correlationId,
        causationId: context.causationId, requestId: context.requestId, source: 'api',
        payloadVersion: 1, payload: { closureId: request.params.closureId },
      }, { eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7() });
      return lifecycleResponse(executed, context.requestId);
    });

  app.post<{ Headers: Headers }>('/api/v1/me/account-exports', {
    schema: { operationId: 'requestMyAccountExport', response: {
      202: AccountExportResponseSchema, 400: ApiErrorSchema, 401: ApiErrorSchema,
      409: ApiErrorSchema,
    } },
  }, async (request, reply): Promise<AccountExportResponse | undefined> => {
    const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
    if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
    const context = requestContext(request);
    const exportId = newUuidV7();
    const executed = await dependencies.requestExport({
      commandId: newUuidV7(), commandType: 'REQUEST_ACCOUNT_EXPORT',
      idempotencyKey: key(request.headers['idempotency-key']), actor: userActor(authenticated.userId),
      aggregateType: 'AccountDataExport', aggregateId: exportId, expectedVersion: 0,
      correlationId: context.correlationId, causationId: context.causationId,
      requestId: context.requestId, source: 'api', payloadVersion: 1,
      payload: { userId: authenticated.userId, closureId: null },
    }, { eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7() });
    await reply.status(executed.responseStatus).send({ data: executed.response,
      meta: { requestId: context.requestId, eventId: executed.eventId,
        replayed: executed.replayed } });
  });

  const exportParams = Type.Object({ exportId: Type.String({ format: 'uuid' }) },
    { additionalProperties: false });
  app.get<{ Headers: Headers; Params: { exportId: string } }>(
    '/api/v1/me/account-exports/:exportId/download', {
      schema: { operationId: 'downloadMyAccountExport', params: exportParams,
        response: { 200: AccountExportDownloadResponseSchema, 401: ApiErrorSchema,
          409: ApiErrorSchema } },
    }, async (request, reply): Promise<AccountExportDownloadResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
      const result = await dependencies.downloadExport(authenticated.userId, request.params.exportId);
      return { data: result.payload,
        meta: { requestId: requestContext(request).requestId, payloadSha256: result.payloadSha256 } };
    });

  app.get<{ Headers: Headers }>('/api/v1/central/account-closures', {
    schema: { operationId: 'listCentralAccountClosures', response: {
      200: CentralAccountClosuresResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
    } },
  }, async (request, reply): Promise<CentralAccountClosuresResponse | undefined> => {
    const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
    if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
    return { data: await dependencies.listCentral(authenticated.userId) as CentralAccountClosuresResponse['data'],
      meta: { requestId: requestContext(request).requestId } };
  });

  app.post<{ Headers: Headers; Params: { closureId: string }; Body: ExecuteAccountClosureBody }>(
    '/api/v1/central/account-closures/:closureId/execute', {
      schema: { operationId: 'executeAccountClosure', params: closureParams,
        body: ExecuteAccountClosureBodySchema, response: { 200: IdentityCommandResponseSchema,
          400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema } },
    }, async (request, reply): Promise<IdentityCommandResponse | undefined> => {
      const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
      if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
      const queue = await dependencies.listCentral(authenticated.userId);
      const item = queue.find((candidate) => candidate.closureId === request.params.closureId);
      if (!item) {
        await reply.status(409).send({ code: 'ACCOUNT_CLOSURE_INVALID_STATE',
          message: 'Account closure is not actionable',
          requestId: requestContext(request).requestId });
        return;
      }
      const context = requestContext(request);
      const executed = await dependencies.executeClosure({
        commandId: newUuidV7(), commandType: 'CLOSE_ACCOUNT',
        idempotencyKey: key(request.headers['idempotency-key']),
        actor: { type: 'USER', id: authenticated.userId,
          roles: ['CENTRAL_ADMIN'], scopeIds: [] },
        aggregateType: 'User', aggregateId: item.userId,
        expectedVersion: version(request.headers['if-match']),
        correlationId: context.correlationId, causationId: context.causationId,
        requestId: context.requestId, source: 'admin', payloadVersion: 1,
        payload: { closureId: item.closureId, userId: item.userId, reason: request.body.reason },
      }, { eventId: newUuidV7(), closureEventId: newUuidV7(), auditId: newUuidV7(),
        outboxMessageId: newUuidV7() });
      return { data: contractIdentity(executed.response), meta: { requestId: context.requestId,
        eventId: executed.eventId, replayed: executed.replayed } };
    });
}
