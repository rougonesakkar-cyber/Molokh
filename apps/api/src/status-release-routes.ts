import {
  ApiErrorSchema,
  ConfirmStatusReleaseBodySchema,
  PreviewStatusReleaseBodySchema,
  StatusReleaseCommandResponseSchema,
  type ConfirmStatusReleaseBody,
  type PreviewStatusReleaseBody,
  type StatusReleaseCommandResponse,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope } from '@molokh/core';
import type {
  ConfirmStatusReleasePayload,
  ExecutedCommand,
  PreviewStatusReleasePayload,
  StatusReleaseEffectIds,
  StatusReleaseProjection,
} from '@molokh/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { idempotentUuidV7, newUuidV7 } from './uuid-v7.js';

interface StatusReleaseHeaders {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}

interface StatusReleaseParams { readonly releaseId: string }

export interface StatusReleaseRouteDependencies {
  readonly auth: AuthAdapter;
  readonly preview: (
    command: CommandEnvelope<PreviewStatusReleasePayload>,
    ids: StatusReleaseEffectIds,
    confirmationToken: string,
  ) => Promise<ExecutedCommand<StatusReleaseProjection>>;
  readonly confirm: (
    command: CommandEnvelope<ConfirmStatusReleasePayload>,
    ids: StatusReleaseEffectIds,
  ) => Promise<ExecutedCommand<StatusReleaseProjection>>;
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

function unauthorized(request: FastifyRequest) {
  return {
    code: 'UNAUTHENTICATED',
    message: 'Authentication is required',
    requestId: requestContext(request).requestId,
  };
}

function envelope<T>(input: {
  readonly actorUserId: string;
  readonly releaseId: string;
  readonly commandType: 'PREVIEW_STATUS_RELEASE' | 'CONFIRM_STATUS_RELEASE';
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly payload: T;
  readonly request: FastifyRequest;
}): CommandEnvelope<T> {
  const context = requestContext(input.request);
  return {
    commandId: newUuidV7(),
    commandType: input.commandType,
    idempotencyKey: input.idempotencyKey,
    actor: { type: 'USER', id: input.actorUserId, roles: ['ATHLETE'], scopeIds: [] },
    aggregateType: 'VoluntaryStatusRelease',
    aggregateId: input.releaseId,
    expectedVersion: input.expectedVersion,
    correlationId: context.correlationId,
    causationId: context.causationId,
    requestId: context.requestId,
    source: 'api',
    payloadVersion: 1,
    payload: input.payload,
  };
}

function effectIds(): StatusReleaseEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    competitionEventId: newUuidV7(),
    notificationOutboxMessageId: newUuidV7(),
    notificationIds: [newUuidV7(), newUuidV7()],
  };
}

function response(
  executed: ExecutedCommand<StatusReleaseProjection>,
  requestId: string,
): StatusReleaseCommandResponse {
  return {
    data: executed.response,
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

export async function registerStatusReleaseRoutes(
  app: FastifyInstance,
  dependencies: StatusReleaseRouteDependencies,
): Promise<void> {
  app.post<{ Body: PreviewStatusReleaseBody; Headers: StatusReleaseHeaders }>(
    '/api/v1/status-releases/preview',
    {
      schema: {
        operationId: 'previewVoluntaryStatusRelease',
        body: PreviewStatusReleaseBodySchema,
        response: {
          201: StatusReleaseCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
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
      const version = expectedVersion(request.headers['if-match'], 0);
      if (version !== 0) throw new InvalidCommandEnvelopeError('If-Match');
      const releaseId = idempotentUuidV7('VoluntaryStatusRelease', authenticated.userId, key);
      const executed = await dependencies.preview(
        envelope({
          actorUserId: authenticated.userId,
          releaseId,
          commandType: 'PREVIEW_STATUS_RELEASE',
          idempotencyKey: key,
          expectedVersion: 0,
          payload: { competitionId: request.body.competitionId },
          request,
        }),
        effectIds(),
        newUuidV7(),
      );
      await reply.status(executed.responseStatus).send(
        response(executed, requestContext(request).requestId),
      );
    },
  );

  app.post<{
    Body: ConfirmStatusReleaseBody;
    Headers: StatusReleaseHeaders;
    Params: StatusReleaseParams;
  }>(
    '/api/v1/status-releases/:releaseId/confirm',
    {
      schema: {
        operationId: 'confirmVoluntaryStatusRelease',
        params: Type.Object(
          { releaseId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: ConfirmStatusReleaseBodySchema,
        response: {
          200: StatusReleaseCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
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
      const executed = await dependencies.confirm(
        envelope({
          actorUserId: authenticated.userId,
          releaseId: request.params.releaseId,
          commandType: 'CONFIRM_STATUS_RELEASE',
          idempotencyKey: key,
          expectedVersion: expectedVersion(request.headers['if-match'], 1),
          payload: {
            releaseId: request.params.releaseId,
            confirmationToken: request.body.confirmationToken,
          },
          request,
        }),
        effectIds(),
      );
      await reply.status(executed.responseStatus).send(
        response(executed, requestContext(request).requestId),
      );
    },
  );
}
