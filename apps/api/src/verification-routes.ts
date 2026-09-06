import {
  InvalidCommandEnvelopeError,
  type CommandEnvelope,
  type IdentityProjection,
} from '@molokh/core';
import {
  ApiErrorSchema,
  ApproveVerificationBodySchema,
  IdentityCommandResponseSchema,
  PendingVerificationListResponseSchema,
  type ApproveVerificationBody,
  type IdentityCommandResponse,
  type PendingVerificationListResponse,
} from '@molokh/contracts';
import type {
  ApproveVerificationPayload,
  ExecutedCommand,
  IdentityEffectIds,
  PendingVerificationProjection,
  StartVerificationPayload,
} from '@molokh/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { contractIdentity } from './identity-routes.js';
import { requestContext } from './request-context.js';
import { newUuidV7 } from './uuid-v7.js';

const checklistVersion = 'identity-mvp-v1';

interface VerificationHeaders {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}

interface VerificationParams {
  readonly verificationId: string;
}

export interface VerificationRouteDependencies {
  readonly athleteAuth: AuthAdapter;
  readonly centralAuth: AuthAdapter;
  readonly start: (
    command: CommandEnvelope<StartVerificationPayload>,
    ids: IdentityEffectIds,
  ) => Promise<ExecutedCommand<IdentityProjection>>;
  readonly approve: (
    command: CommandEnvelope<ApproveVerificationPayload>,
    ids: IdentityEffectIds,
  ) => Promise<ExecutedCommand<IdentityProjection>>;
  readonly listPending: (
    centralUserId: string,
  ) => Promise<readonly PendingVerificationProjection[]>;
}

function unauthorized(request: FastifyRequest) {
  return {
    code: 'UNAUTHENTICATED',
    message: 'Authentication is required',
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
  const version = match?.[1] ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new InvalidCommandEnvelopeError('If-Match');
  }
  return version;
}

function effectIds(): IdentityEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
  };
}

export async function registerVerificationRoutes(
  app: FastifyInstance,
  dependencies: VerificationRouteDependencies,
): Promise<void> {
  app.post<{ Headers: VerificationHeaders }>(
    '/api/v1/me/verification',
    {
      schema: {
        operationId: 'startMyVerification',
        response: {
          201: IdentityCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.athleteAuth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const verificationId = newUuidV7();
      const command: CommandEnvelope<StartVerificationPayload> = {
        commandId: newUuidV7(),
        commandType: 'START_VERIFICATION',
        idempotencyKey: requiredIdempotencyKey(request.headers['idempotency-key']),
        actor: {
          type: 'USER',
          id: authenticated.userId,
          roles: ['ATHLETE'],
          scopeIds: [],
        },
        aggregateType: 'AccountVerification',
        aggregateId: verificationId,
        expectedVersion: 0,
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'api',
        payloadVersion: 1,
        payload: {
          userId: authenticated.userId,
          moderationChecklistVersion: checklistVersion,
        },
      };
      const executed = await dependencies.start(command, effectIds());
      await reply.status(201).send({
        data: contractIdentity(executed.response),
        meta: {
          requestId: context.requestId,
          eventId: executed.eventId,
          replayed: executed.replayed,
        },
      } satisfies IdentityCommandResponse);
    },
  );

  app.get<{ Headers: VerificationHeaders }>(
    '/api/v1/central/verifications',
    {
      schema: {
        operationId: 'listPendingVerifications',
        response: {
          200: PendingVerificationListResponseSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<PendingVerificationListResponse | undefined> => {
      const authenticated = await dependencies.centralAuth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const pending = await dependencies.listPending(authenticated.userId);
      return {
        data: pending.map((item) => ({ ...item })),
        meta: { requestId: context.requestId },
      };
    },
  );

  app.post<{
    Body: ApproveVerificationBody;
    Headers: VerificationHeaders;
    Params: VerificationParams;
  }>(
    '/api/v1/central/verifications/:verificationId/approve',
    {
      schema: {
        operationId: 'approveVerification',
        params: Type.Object({ verificationId: Type.String({ format: 'uuid' }) }),
        body: ApproveVerificationBodySchema,
        response: {
          200: IdentityCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<IdentityCommandResponse | undefined> => {
      const authenticated = await dependencies.centralAuth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const command: CommandEnvelope<ApproveVerificationPayload> = {
        commandId: newUuidV7(),
        commandType: 'APPROVE_VERIFICATION',
        idempotencyKey: requiredIdempotencyKey(request.headers['idempotency-key']),
        actor: {
          type: 'USER',
          id: authenticated.userId,
          roles: ['CENTRAL_ADMIN'],
          scopeIds: [],
        },
        aggregateType: 'AccountVerification',
        aggregateId: request.params.verificationId,
        expectedVersion: expectedVersion(request.headers['if-match']),
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'admin',
        payloadVersion: 1,
        payload: request.body,
      };
      const executed = await dependencies.approve(command, effectIds());
      return {
        data: contractIdentity(executed.response),
        meta: {
          requestId: context.requestId,
          eventId: executed.eventId,
          replayed: executed.replayed,
        },
      };
    },
  );
}
