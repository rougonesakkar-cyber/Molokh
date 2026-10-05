import {
  ApiErrorSchema,
  MembershipCommandResponseSchema,
  PendingMembershipListResponseSchema,
  RejectMembershipBodySchema,
  type RejectMembershipBody,
  type MembershipCommandResponse,
  type PendingMembershipListResponse,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope } from '@molokh/core';
import type {
  ActivateMembershipPayload,
  ApproveMembershipPayload,
  ExecutedCommand,
  MembershipEffectIds,
  MembershipProjection,
  PendingMembershipProjection,
  RejectMembershipPayload,
  RequestMembershipPayload,
  WithdrawMembershipRequestPayload,
} from '@molokh/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { idempotentResourceId, newUuidV7 } from './uuid-v7.js';

interface MembershipHeaders {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}

export interface MembershipRouteDependencies {
  readonly auth: AuthAdapter;
  readonly requestMembership: (
    command: CommandEnvelope<RequestMembershipPayload>,
    ids: MembershipEffectIds,
  ) => Promise<ExecutedCommand<MembershipProjection>>;
  readonly activateMembershipByInvite: (
    command: CommandEnvelope<ActivateMembershipPayload>,
    ids: MembershipEffectIds,
  ) => Promise<ExecutedCommand<MembershipProjection>>;
  readonly approveMembership: (
    command: CommandEnvelope<ApproveMembershipPayload>,
    ids: MembershipEffectIds,
  ) => Promise<ExecutedCommand<MembershipProjection>>;
  readonly rejectMembership: (
    command: CommandEnvelope<RejectMembershipPayload>,
    ids: MembershipEffectIds,
  ) => Promise<ExecutedCommand<MembershipProjection>>;
  readonly withdrawMembershipRequest: (
    command: CommandEnvelope<WithdrawMembershipRequestPayload>,
    ids: MembershipEffectIds,
  ) => Promise<ExecutedCommand<MembershipProjection>>;
  readonly listPendingMemberships: (
    actorId: string,
    communityId: string,
  ) => Promise<readonly PendingMembershipProjection[]>;
}

function requiredIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key) throw new InvalidCommandEnvelopeError('Idempotency-Key');
  return key;
}

function expectedVersion(value: string | undefined): number {
  const match = value?.trim().match(/^"?(\d+)"?$/);
  const parsed = Number(match?.[1]);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new InvalidCommandEnvelopeError('If-Match');
  }
  return parsed;
}

function unauthorized(request: FastifyRequest) {
  return { code: 'UNAUTHENTICATED', message: 'Authentication is required',
    requestId: requestContext(request).requestId };
}

function effectIds(includeTimers = false): MembershipEffectIds {
  return {
    eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7(),
    notificationIds: Array.from({ length: 20 }, () => newUuidV7()),
    ...(includeTimers ? {
      reminderTimerOutboxMessageId: newUuidV7(),
      escalationTimerOutboxMessageId: newUuidV7(),
    } : {}),
  };
}

function response(
  executed: ExecutedCommand<MembershipProjection>,
  requestId: string,
): MembershipCommandResponse {
  return { data: { ...executed.response }, meta: { requestId,
    eventId: executed.eventId, replayed: executed.replayed } };
}

function command<T>(input: {
  readonly actorId: string;
  readonly aggregateId: string;
  readonly commandType: string;
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly payload: T;
  readonly request: FastifyRequest;
  readonly source?: 'api' | 'admin';
}): CommandEnvelope<T> {
  const context = requestContext(input.request);
  return {
    commandId: newUuidV7(), commandType: input.commandType,
    idempotencyKey: input.idempotencyKey,
    actor: {
      type: 'USER', id: input.actorId,
      roles: input.source === 'admin' ? [] : ['ATHLETE'], scopeIds: [],
    },
    aggregateType: 'CommunityMembership', aggregateId: input.aggregateId,
    expectedVersion: input.expectedVersion, correlationId: context.correlationId,
    causationId: context.causationId, requestId: context.requestId,
    source: input.source ?? 'api', payloadVersion: 1, payload: input.payload,
  };
}

export async function registerMembershipRoutes(
  app: FastifyInstance,
  dependencies: MembershipRouteDependencies,
): Promise<void> {
  app.post<{
    Headers: MembershipHeaders;
    Params: { readonly communityId: string };
  }>(
    '/api/v1/communities/:communityId/memberships',
    {
      schema: {
        operationId: 'requestCommunityMembership',
        params: Type.Object({ communityId: Type.String({ format: 'uuid' }) }),
        response: { 201: MembershipCommandResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 404: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredIdempotencyKey(request.headers['idempotency-key']);
      const membershipId = idempotentResourceId(
        'CommunityMembership', authenticated.userId, key,
      );
      const executed = await dependencies.requestMembership(command({
        actorId: authenticated.userId, aggregateId: membershipId,
        commandType: 'REQUEST_MEMBERSHIP', idempotencyKey: key, expectedVersion: 0,
        payload: { communityId: request.params.communityId }, request,
      }), effectIds(true));
      await reply.status(201).send(response(executed, requestContext(request).requestId));
    },
  );

  app.post<{
    Headers: MembershipHeaders;
    Body: { readonly token: string };
  }>(
    '/api/v1/community-invites/accept',
    {
      schema: {
        operationId: 'activateCommunityMembershipByInvite',
        body: Type.Object(
          { token: Type.String({ minLength: 16, maxLength: 256 }) },
          { additionalProperties: false },
        ),
        response: { 201: MembershipCommandResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 404: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredIdempotencyKey(request.headers['idempotency-key']);
      const membershipId = idempotentResourceId(
        'CommunityMembership', authenticated.userId, key,
      );
      const executed = await dependencies.activateMembershipByInvite(command({
        actorId: authenticated.userId, aggregateId: membershipId,
        commandType: 'JOIN_BY_QR_OR_INVITE', idempotencyKey: key, expectedVersion: 0,
        payload: { token: request.body.token }, request,
      }), effectIds());
      await reply.status(201).send(response(executed, requestContext(request).requestId));
    },
  );

  app.get<{
    Headers: MembershipHeaders;
    Params: { readonly communityId: string };
  }>(
    '/api/v1/communities/:communityId/memberships/pending',
    {
      schema: {
        operationId: 'listPendingCommunityMemberships',
        params: Type.Object({ communityId: Type.String({ format: 'uuid' }) }),
        response: { 200: PendingMembershipListResponseSchema, 401: ApiErrorSchema,
          403: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<PendingMembershipListResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const pending = await dependencies.listPendingMemberships(
        authenticated.userId, request.params.communityId,
      );
      return { data: pending.map((item) => ({ ...item })),
        meta: { requestId: requestContext(request).requestId } };
    },
  );

  app.post<{
    Headers: MembershipHeaders;
    Params: { readonly membershipId: string };
  }>(
    '/api/v1/memberships/:membershipId/approve',
    {
      schema: {
        operationId: 'approveCommunityMembership',
        params: Type.Object({ membershipId: Type.String({ format: 'uuid' }) }),
        response: { 200: MembershipCommandResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 403: ApiErrorSchema, 404: ApiErrorSchema,
          409: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<MembershipCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredIdempotencyKey(request.headers['idempotency-key']);
      const executed = await dependencies.approveMembership(command({
        actorId: authenticated.userId, aggregateId: request.params.membershipId,
        commandType: 'APPROVE_MEMBERSHIP', idempotencyKey: key,
        expectedVersion: expectedVersion(request.headers['if-match']),
        payload: { membershipId: request.params.membershipId }, request, source: 'admin',
      }), effectIds());
      return response(executed, requestContext(request).requestId);
    },
  );

  app.post<{
    Headers: MembershipHeaders;
    Params: { readonly membershipId: string };
    Body: RejectMembershipBody;
  }>(
    '/api/v1/memberships/:membershipId/reject',
    {
      schema: {
        operationId: 'rejectCommunityMembership',
        params: Type.Object({ membershipId: Type.String({ format: 'uuid' }) }),
        body: RejectMembershipBodySchema,
        response: { 200: MembershipCommandResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 403: ApiErrorSchema, 404: ApiErrorSchema,
          409: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<MembershipCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredIdempotencyKey(request.headers['idempotency-key']);
      const executed = await dependencies.rejectMembership(command({
        actorId: authenticated.userId, aggregateId: request.params.membershipId,
        commandType: 'REJECT_MEMBERSHIP', idempotencyKey: key,
        expectedVersion: expectedVersion(request.headers['if-match']),
        payload: { membershipId: request.params.membershipId, ...request.body },
        request, source: 'admin',
      }), effectIds());
      return response(executed, requestContext(request).requestId);
    },
  );

  app.post<{
    Headers: MembershipHeaders;
    Params: { readonly membershipId: string };
  }>(
    '/api/v1/memberships/:membershipId/withdraw',
    {
      schema: {
        operationId: 'withdrawCommunityMembershipRequest',
        params: Type.Object({ membershipId: Type.String({ format: 'uuid' }) }),
        response: { 200: MembershipCommandResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 403: ApiErrorSchema, 404: ApiErrorSchema,
          409: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<MembershipCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredIdempotencyKey(request.headers['idempotency-key']);
      const executed = await dependencies.withdrawMembershipRequest(command({
        actorId: authenticated.userId, aggregateId: request.params.membershipId,
        commandType: 'WITHDRAW_MEMBERSHIP_REQUEST', idempotencyKey: key,
        expectedVersion: expectedVersion(request.headers['if-match']),
        payload: { membershipId: request.params.membershipId }, request,
      }), effectIds());
      return response(executed, requestContext(request).requestId);
    },
  );
}
