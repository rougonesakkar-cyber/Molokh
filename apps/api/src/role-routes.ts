import {
  InvalidCommandEnvelopeError,
  type CommandEnvelope,
  type RoleGrantProjection,
} from '@molokh/core';
import {
  ApiErrorSchema,
  CoachInviteBodySchema,
  PendingCoachInviteListResponseSchema,
  RoleGrantCommandResponseSchema,
  type CoachInviteBody,
  type PendingCoachInviteListResponse,
  type RoleGrantCommandResponse,
} from '@molokh/contracts';
import type {
  AcceptCoachInvitePayload,
  ExecutedCommand,
  InviteCoachPayload,
  RoleGrantEffectIds,
} from '@molokh/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { idempotentResourceId, newUuidV7 } from './uuid-v7.js';

const coachInvitationTtlHours = 72;

interface RoleHeaders {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}

interface CommunityParams {
  readonly communityId: string;
}

interface GrantParams {
  readonly grantId: string;
}

export interface RoleRouteDependencies {
  readonly operatorAuth: AuthAdapter;
  readonly userAuth: AuthAdapter;
  readonly inviteCoach: (
    command: CommandEnvelope<InviteCoachPayload>,
    ids: RoleGrantEffectIds,
  ) => Promise<ExecutedCommand<RoleGrantProjection>>;
  readonly acceptCoachInvite: (
    command: CommandEnvelope<AcceptCoachInvitePayload>,
    ids: RoleGrantEffectIds,
  ) => Promise<ExecutedCommand<RoleGrantProjection>>;
  readonly listPendingCoachInvites: (
    userId: string,
  ) => Promise<readonly RoleGrantProjection[]>;
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

function effectIds(): RoleGrantEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    notificationId: newUuidV7(),
  };
}

function commandResponse(
  executed: ExecutedCommand<RoleGrantProjection>,
  requestId: string,
): RoleGrantCommandResponse {
  return {
    data: { ...executed.response },
    meta: {
      requestId,
      eventId: executed.eventId,
      replayed: executed.replayed,
    },
  };
}

export async function registerRoleRoutes(
  app: FastifyInstance,
  dependencies: RoleRouteDependencies,
): Promise<void> {
  app.post<{
    Body: CoachInviteBody;
    Headers: RoleHeaders;
    Params: CommunityParams;
  }>(
    '/api/v1/communities/:communityId/coach-invites',
    {
      schema: {
        operationId: 'inviteCommunityCoach',
        params: Type.Object({ communityId: Type.String({ format: 'uuid' }) }),
        body: CoachInviteBodySchema,
        response: {
          201: RoleGrantCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.operatorAuth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const idempotencyKey = requiredIdempotencyKey(
        request.headers['idempotency-key'],
      );
      const grantId = idempotentResourceId(
        'CoachRoleGrant',
        authenticated.userId,
        idempotencyKey,
      );
      const command: CommandEnvelope<InviteCoachPayload> = {
        commandId: newUuidV7(),
        commandType: 'INVITE_COACH',
        idempotencyKey,
        actor: {
          type: 'USER',
          id: authenticated.userId,
          roles: [],
          scopeIds: [],
        },
        aggregateType: 'RoleGrant',
        aggregateId: grantId,
        expectedVersion: 0,
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'admin',
        payloadVersion: 1,
        payload: {
          userId: request.body.userId,
          communityId: request.params.communityId,
          reasonCode: request.body.reasonCode,
          invitationTtlHours: coachInvitationTtlHours,
        },
      };
      const executed = await dependencies.inviteCoach(command, effectIds());
      await reply.status(201).send(commandResponse(executed, context.requestId));
    },
  );

  app.get<{ Headers: RoleHeaders }>(
    '/api/v1/me/coach-invites',
    {
      schema: {
        operationId: 'listMyPendingCoachInvites',
        response: {
          200: PendingCoachInviteListResponseSchema,
          401: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<PendingCoachInviteListResponse | undefined> => {
      const authenticated = await dependencies.userAuth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const pending = await dependencies.listPendingCoachInvites(authenticated.userId);
      return {
        data: pending.map((grant) => ({ ...grant })),
        meta: { requestId: context.requestId },
      };
    },
  );

  app.post<{ Headers: RoleHeaders; Params: GrantParams }>(
    '/api/v1/me/coach-invites/:grantId/accept',
    {
      schema: {
        operationId: 'acceptMyCoachInvite',
        params: Type.Object({ grantId: Type.String({ format: 'uuid' }) }),
        response: {
          200: RoleGrantCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<RoleGrantCommandResponse | undefined> => {
      const authenticated = await dependencies.userAuth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const command: CommandEnvelope<AcceptCoachInvitePayload> = {
        commandId: newUuidV7(),
        commandType: 'ACCEPT_COACH_ROLE',
        idempotencyKey: requiredIdempotencyKey(request.headers['idempotency-key']),
        actor: {
          type: 'USER',
          id: authenticated.userId,
          roles: ['ATHLETE'],
          scopeIds: [],
        },
        aggregateType: 'RoleGrant',
        aggregateId: request.params.grantId,
        expectedVersion: expectedVersion(request.headers['if-match']),
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'api',
        payloadVersion: 1,
        payload: { userId: authenticated.userId },
      };
      const executed = await dependencies.acceptCoachInvite(command, effectIds());
      return commandResponse(executed, context.requestId);
    },
  );
}
