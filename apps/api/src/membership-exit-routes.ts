import {
  ApiErrorSchema,
  ConfirmMembershipExitBodySchema,
  MembershipExitCommandResponseSchema,
  PreviewMembershipExitBodySchema,
  type ConfirmMembershipExitBody,
  type MembershipExitCommandResponse,
  type PreviewMembershipExitBody,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope } from '@molokh/core';
import type {
  ConfirmMembershipExitPayload,
  ExecutedCommand,
  MembershipExitEffectIds,
  MembershipExitProjection,
  PreviewMembershipExitPayload,
} from '@molokh/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { idempotentUuidV7, newUuidV7 } from './uuid-v7.js';

interface MembershipExitHeaders {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}

interface MembershipExitParams { readonly exitId: string }

export interface MembershipExitRouteDependencies {
  readonly auth: AuthAdapter;
  readonly preview: (
    command: CommandEnvelope<PreviewMembershipExitPayload>,
    ids: MembershipExitEffectIds,
    confirmationToken: string,
  ) => Promise<ExecutedCommand<MembershipExitProjection>>;
  readonly confirm: (
    command: CommandEnvelope<ConfirmMembershipExitPayload>,
    ids: MembershipExitEffectIds,
  ) => Promise<ExecutedCommand<MembershipExitProjection>>;
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
    code: 'UNAUTHENTICATED', message: 'Authentication is required',
    requestId: requestContext(request).requestId,
  };
}

function envelope<T>(input: {
  readonly actorUserId: string;
  readonly exitId: string;
  readonly commandType: 'PREVIEW_MEMBERSHIP_EXIT' | 'CONFIRM_MEMBERSHIP_EXIT';
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly payload: T;
  readonly request: FastifyRequest;
}): CommandEnvelope<T> {
  const context = requestContext(input.request);
  return {
    commandId: newUuidV7(), commandType: input.commandType,
    idempotencyKey: input.idempotencyKey,
    actor: { type: 'USER', id: input.actorUserId, roles: ['ATHLETE'], scopeIds: [] },
    aggregateType: 'VoluntaryMembershipExit', aggregateId: input.exitId,
    expectedVersion: input.expectedVersion, correlationId: context.correlationId,
    causationId: context.causationId, requestId: context.requestId,
    source: 'api', payloadVersion: 1, payload: input.payload,
  };
}

function effectIds(): MembershipExitEffectIds {
  return {
    eventId: newUuidV7(), membershipEventId: newUuidV7(),
    competitionEventId: newUuidV7(), auditId: newUuidV7(),
    outboxMessageId: newUuidV7(), notificationOutboxMessageId: newUuidV7(),
    notificationIds: [newUuidV7(), newUuidV7()],
    resultId: newUuidV7(), resultEventId: newUuidV7(), resultFinalEventId: newUuidV7(),
    waiverId: newUuidV7(), waiverEventId: newUuidV7(),
    cooldownId: newUuidV7(), cooldownEventId: newUuidV7(),
    challengeEventId: newUuidV7(), statusTransitionId: newUuidV7(),
    statusEventId: newUuidV7(), statusFinalizationId: newUuidV7(),
    statusFinalEventId: newUuidV7(), postResultStatusEventId: newUuidV7(),
    statusOutboxMessageId: newUuidV7(),
  };
}

function response(
  executed: ExecutedCommand<MembershipExitProjection>,
  requestId: string,
): MembershipExitCommandResponse {
  return {
    data: executed.response,
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

export async function registerMembershipExitRoutes(
  app: FastifyInstance,
  dependencies: MembershipExitRouteDependencies,
): Promise<void> {
  app.post<{ Body: PreviewMembershipExitBody; Headers: MembershipExitHeaders }>(
    '/api/v1/membership-exits/preview',
    {
      schema: {
        operationId: 'previewVoluntaryMembershipExit',
        body: PreviewMembershipExitBodySchema,
        response: {
          201: MembershipExitCommandResponseSchema,
          400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
          404: ApiErrorSchema, 409: ApiErrorSchema,
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
      const exitId = idempotentUuidV7('VoluntaryMembershipExit', authenticated.userId, key);
      const executed = await dependencies.preview(
        envelope({
          actorUserId: authenticated.userId, exitId,
          commandType: 'PREVIEW_MEMBERSHIP_EXIT', idempotencyKey: key,
          expectedVersion: 0, payload: { membershipId: request.body.membershipId }, request,
        }),
        effectIds(), newUuidV7(),
      );
      await reply.status(executed.responseStatus).send(
        response(executed, requestContext(request).requestId),
      );
    },
  );

  app.post<{
    Body: ConfirmMembershipExitBody;
    Headers: MembershipExitHeaders;
    Params: MembershipExitParams;
  }>(
    '/api/v1/membership-exits/:exitId/confirm',
    {
      schema: {
        operationId: 'confirmVoluntaryMembershipExit',
        params: Type.Object(
          { exitId: Type.String({ format: 'uuid' }) }, { additionalProperties: false },
        ),
        body: ConfirmMembershipExitBodySchema,
        response: {
          200: MembershipExitCommandResponseSchema,
          400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
          404: ApiErrorSchema, 409: ApiErrorSchema,
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
          actorUserId: authenticated.userId, exitId: request.params.exitId,
          commandType: 'CONFIRM_MEMBERSHIP_EXIT', idempotencyKey: key,
          expectedVersion: expectedVersion(request.headers['if-match'], 1),
          payload: {
            exitId: request.params.exitId,
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
