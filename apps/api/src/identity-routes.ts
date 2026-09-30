import {
  InvalidCommandEnvelopeError,
  type CommandEnvelope,
  type IdentityProjection,
} from '@molokh/core';
import {
  ApiErrorSchema,
  ChangeDisplayNameBodySchema,
  ChangeSportsBodySchema,
  IdentityCommandResponseSchema,
  MeResponseSchema,
  type ChangeDisplayNameBody,
  type ChangeSportsBody,
  type IdentityCommandResponse,
  type IdentityProjectionContract,
  type MeResponse,
} from '@molokh/contracts';
import type {
  ChangeDisplayNamePayload,
  ChangeSportsPayload,
  ExecutedCommand,
  IdentityEffectIds,
} from '@molokh/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { AuthAdapter, AuthenticatedUser } from './auth.js';
import { requestContext } from './request-context.js';
import { newUuidV7 } from './uuid-v7.js';

export interface IdentityRouteDependencies {
  readonly auth: AuthAdapter;
  readonly readMe: (userId: string) => Promise<IdentityProjection | null>;
  readonly changeDisplayName: (
    command: CommandEnvelope<ChangeDisplayNamePayload>,
    ids: IdentityEffectIds,
  ) => Promise<ExecutedCommand<IdentityProjection>>;
  readonly changeSports: (
    command: CommandEnvelope<ChangeSportsPayload>,
    ids: IdentityEffectIds,
  ) => Promise<ExecutedCommand<IdentityProjection>>;
}

interface IdentityHeaders {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}

async function actor(
  request: FastifyRequest<{ Headers: IdentityHeaders }>,
  dependencies: IdentityRouteDependencies,
): Promise<AuthenticatedUser | null> {
  return dependencies.auth.authenticate(request.headers.authorization);
}

function expectedVersion(value: string | undefined): number {
  const match = value?.trim().match(/^"?(\d+)"?$/);
  const version = match?.[1] ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(version) || version < 1) {
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

export function contractIdentity(identity: IdentityProjection): IdentityProjectionContract {
  return {
    ...identity,
    capabilities: [...identity.capabilities],
    capabilityDenials: identity.capabilityDenials.map((denial) => ({ ...denial })),
  };
}

export async function registerIdentityRoutes(
  app: FastifyInstance,
  dependencies: IdentityRouteDependencies,
): Promise<void> {
  app.get<{ Headers: IdentityHeaders }>(
    '/api/v1/me',
    {
      schema: {
        operationId: 'readMe',
        response: { 200: MeResponseSchema, 401: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<MeResponse | undefined> => {
      const authenticated = await actor(request, dependencies);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const identity = await dependencies.readMe(authenticated.userId);
      if (!identity) {
        await reply.status(404).send({
          code: 'IDENTITY_NOT_FOUND',
          message: 'Identity was not found',
          requestId: requestContext(request).requestId,
        });
        return;
      }
      return {
        data: contractIdentity(identity),
        meta: { requestId: requestContext(request).requestId },
      };
    },
  );

  app.patch<{
    Body: ChangeDisplayNameBody;
    Headers: IdentityHeaders;
  }>(
    '/api/v1/me/profile',
    {
      schema: {
        operationId: 'changeMyDisplayName',
        body: ChangeDisplayNameBodySchema,
        response: {
          200: IdentityCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<IdentityCommandResponse | undefined> => {
      const authenticated = await actor(request, dependencies);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const idempotencyKey = request.headers['idempotency-key']?.trim();
      if (!idempotencyKey) throw new InvalidCommandEnvelopeError('Idempotency-Key');
      const context = requestContext(request);
      const command: CommandEnvelope<ChangeDisplayNamePayload> = {
        commandId: newUuidV7(),
        commandType: 'CHANGE_DISPLAY_NAME',
        idempotencyKey,
        actor: {
          type: 'USER',
          id: authenticated.userId,
          roles: ['ATHLETE'],
          scopeIds: [],
        },
        aggregateType: 'User',
        aggregateId: authenticated.userId,
        expectedVersion: expectedVersion(request.headers['if-match']),
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'api',
        payloadVersion: 1,
        payload: { displayName: request.body.displayName },
      };
      const executed = await dependencies.changeDisplayName(command, {
        eventId: newUuidV7(),
        auditId: newUuidV7(),
        outboxMessageId: newUuidV7(),
      });
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

  app.patch<{
    Body: ChangeSportsBody;
    Headers: IdentityHeaders;
  }>(
    '/api/v1/me/sports',
    {
      schema: {
        operationId: 'changeMySports',
        body: ChangeSportsBodySchema,
        response: {
          200: IdentityCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<IdentityCommandResponse | undefined> => {
      const authenticated = await actor(request, dependencies);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const idempotencyKey = request.headers['idempotency-key']?.trim();
      if (!idempotencyKey) throw new InvalidCommandEnvelopeError('Idempotency-Key');
      const context = requestContext(request);
      const command: CommandEnvelope<ChangeSportsPayload> = {
        commandId: newUuidV7(),
        commandType: 'CHANGE_SPORTS',
        idempotencyKey,
        actor: {
          type: 'USER',
          id: authenticated.userId,
          roles: ['ATHLETE'],
          scopeIds: [],
        },
        aggregateType: 'User',
        aggregateId: authenticated.userId,
        expectedVersion: expectedVersion(request.headers['if-match']),
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'api',
        payloadVersion: 1,
        payload: request.body,
      };
      const executed = await dependencies.changeSports(command, {
        eventId: newUuidV7(),
        auditId: newUuidV7(),
        outboxMessageId: newUuidV7(),
      });
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
