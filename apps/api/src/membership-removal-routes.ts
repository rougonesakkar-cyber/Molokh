import {
  ApiErrorSchema,
  AppealMembershipRemovalBodySchema,
  DecideMembershipRemovalBodySchema,
  MembershipRemovalCommandResponseSchema,
  MembershipRemovalListResponseSchema,
  RequestMembershipRemovalBodySchema,
  VenueMemberListResponseSchema,
  type AppealMembershipRemovalBody,
  type DecideMembershipRemovalBody,
  type MembershipRemovalCommandResponse,
  type MembershipRemovalListResponse,
  type RequestMembershipRemovalBody,
  type VenueMemberListResponse,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope } from '@molokh/core';
import type {
  AppealMembershipRemovalPayload,
  DecideMembershipRemovalPayload,
  ExecutedCommand,
  MembershipRemovalEffectIds,
  MembershipRemovalProjection,
  RequestMembershipRemovalPayload,
  VenueMemberProjection,
} from '@molokh/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { idempotentResourceId, newUuidV7 } from './uuid-v7.js';

interface RemovalHeaders {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}

interface MembershipParams { readonly membershipId: string }
interface CaseParams { readonly caseId: string }
interface VenueParams { readonly venueId: string }

export interface MembershipRemovalRouteDependencies {
  readonly auth: AuthAdapter;
  readonly listVenueMembers: (
    actorUserId: string,
    venueId: string,
  ) => Promise<readonly VenueMemberProjection[]>;
  readonly listForSubject: (
    subjectUserId: string,
  ) => Promise<readonly MembershipRemovalProjection[]>;
  readonly listForCentral: (
    centralUserId: string,
  ) => Promise<readonly MembershipRemovalProjection[]>;
  readonly request: (
    command: CommandEnvelope<RequestMembershipRemovalPayload>,
    ids: MembershipRemovalEffectIds,
  ) => Promise<ExecutedCommand<MembershipRemovalProjection>>;
  readonly appeal: (
    command: CommandEnvelope<AppealMembershipRemovalPayload>,
    ids: MembershipRemovalEffectIds,
  ) => Promise<ExecutedCommand<MembershipRemovalProjection>>;
  readonly decide: (
    command: CommandEnvelope<DecideMembershipRemovalPayload>,
    ids: MembershipRemovalEffectIds,
  ) => Promise<ExecutedCommand<MembershipRemovalProjection>>;
}

function unauthorized(request: FastifyRequest) {
  return {
    code: 'UNAUTHENTICATED', message: 'Authentication is required',
    requestId: requestContext(request).requestId,
  };
}

function requiredKey(value: string | undefined): string {
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

function command<T>(input: {
  readonly actorUserId: string;
  readonly caseId: string;
  readonly commandType:
    | 'REQUEST_MEMBERSHIP_REMOVAL'
    | 'APPEAL_MEMBERSHIP_REMOVAL'
    | 'DECIDE_MEMBERSHIP_REMOVAL';
  readonly key: string;
  readonly version: number;
  readonly payload: T;
  readonly request: FastifyRequest;
}): CommandEnvelope<T> {
  const context = requestContext(input.request);
  return {
    commandId: newUuidV7(), commandType: input.commandType,
    idempotencyKey: input.key,
    actor: { type: 'USER', id: input.actorUserId, roles: [], scopeIds: [] },
    aggregateType: 'MembershipRemovalCase', aggregateId: input.caseId,
    expectedVersion: input.version, correlationId: context.correlationId,
    causationId: context.causationId, requestId: context.requestId,
    source: 'admin', payloadVersion: 1, payload: input.payload,
  };
}

function effectIds(input: {
  readonly actorUserId: string;
  readonly caseId: string;
  readonly key: string;
}): MembershipRemovalEffectIds {
  return {
    caseId: input.caseId,
    holdId: idempotentResourceId('MembershipRemovalHold', input.actorUserId, input.key),
    replacementMembershipId: idempotentResourceId(
      'RestoredCommunityMembership', input.actorUserId, input.key,
    ),
    eventId: newUuidV7(), membershipEventId: newUuidV7(), statusEventId: newUuidV7(),
    auditId: newUuidV7(), outboxMessageId: newUuidV7(),
    notificationOutboxMessageId: newUuidV7(),
  };
}

function response(
  executed: ExecutedCommand<MembershipRemovalProjection>,
  requestId: string,
): MembershipRemovalCommandResponse {
  return {
    data: { ...executed.response },
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

export async function registerMembershipRemovalRoutes(
  app: FastifyInstance,
  dependencies: MembershipRemovalRouteDependencies,
): Promise<void> {
  app.get<{ Headers: RemovalHeaders; Params: VenueParams }>(
    '/api/v1/venues/:venueId/members',
    {
      schema: {
        operationId: 'listVenueMembersForAdmin',
        params: Type.Object({ venueId: Type.String({ format: 'uuid' }) }),
        response: {
          200: VenueMemberListResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<VenueMemberListResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      return {
        data: (await dependencies.listVenueMembers(
          authenticated.userId, request.params.venueId,
        )).map((item) => ({
          ...item,
          latestRemovalCase: item.latestRemovalCase ? { ...item.latestRemovalCase } : null,
        })),
        meta: { requestId: requestContext(request).requestId },
      };
    },
  );

  app.get<{ Headers: RemovalHeaders }>(
    '/api/v1/me/membership-removals',
    {
      schema: {
        operationId: 'listMyMembershipRemovals',
        response: { 200: MembershipRemovalListResponseSchema, 401: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<MembershipRemovalListResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      return {
        data: (await dependencies.listForSubject(authenticated.userId)).map((item) => ({ ...item })),
        meta: { requestId: requestContext(request).requestId },
      };
    },
  );

  app.get<{ Headers: RemovalHeaders }>(
    '/api/v1/central/membership-removals',
    {
      schema: {
        operationId: 'listMembershipRemovalReviewQueue',
        response: {
          200: MembershipRemovalListResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<MembershipRemovalListResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      return {
        data: (await dependencies.listForCentral(authenticated.userId)).map((item) => ({ ...item })),
        meta: { requestId: requestContext(request).requestId },
      };
    },
  );

  app.post<{
    Body: RequestMembershipRemovalBody;
    Headers: RemovalHeaders;
    Params: MembershipParams;
  }>(
    '/api/v1/memberships/:membershipId/removal',
    {
      schema: {
        operationId: 'requestMembershipRemoval',
        params: Type.Object({ membershipId: Type.String({ format: 'uuid' }) }),
        body: RequestMembershipRemovalBodySchema,
        response: {
          201: MembershipRemovalCommandResponseSchema,
          400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
          404: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredKey(request.headers['idempotency-key']);
      const version = expectedVersion(request.headers['if-match'], 0);
      if (version !== 0) throw new InvalidCommandEnvelopeError('If-Match');
      const caseId = idempotentResourceId('MembershipRemovalCase', authenticated.userId, key);
      const executed = await dependencies.request(
        command({
          actorUserId: authenticated.userId, caseId,
          commandType: 'REQUEST_MEMBERSHIP_REMOVAL', key, version: 0,
          payload: { membershipId: request.params.membershipId, reason: request.body.reason },
          request,
        }),
        effectIds({ actorUserId: authenticated.userId, caseId, key }),
      );
      await reply.status(executed.responseStatus).send(
        response(executed, requestContext(request).requestId),
      );
    },
  );

  app.post<{
    Body: AppealMembershipRemovalBody;
    Headers: RemovalHeaders;
    Params: CaseParams;
  }>(
    '/api/v1/membership-removals/:caseId/appeal',
    {
      schema: {
        operationId: 'appealMembershipRemoval',
        params: Type.Object({ caseId: Type.String({ format: 'uuid' }) }),
        body: AppealMembershipRemovalBodySchema,
        response: {
          200: MembershipRemovalCommandResponseSchema,
          400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
          404: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredKey(request.headers['idempotency-key']);
      const version = expectedVersion(request.headers['if-match'], 1);
      const executed = await dependencies.appeal(
        command({
          actorUserId: authenticated.userId, caseId: request.params.caseId,
          commandType: 'APPEAL_MEMBERSHIP_REMOVAL', key, version,
          payload: { caseId: request.params.caseId, reason: request.body.reason }, request,
        }),
        effectIds({ actorUserId: authenticated.userId, caseId: request.params.caseId, key }),
      );
      await reply.status(executed.responseStatus).send(
        response(executed, requestContext(request).requestId),
      );
    },
  );

  app.post<{
    Body: DecideMembershipRemovalBody;
    Headers: RemovalHeaders;
    Params: CaseParams;
  }>(
    '/api/v1/central/membership-removals/:caseId/decision',
    {
      schema: {
        operationId: 'decideMembershipRemoval',
        params: Type.Object({ caseId: Type.String({ format: 'uuid' }) }),
        body: DecideMembershipRemovalBodySchema,
        response: {
          200: MembershipRemovalCommandResponseSchema,
          400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
          404: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredKey(request.headers['idempotency-key']);
      const version = expectedVersion(request.headers['if-match'], 1);
      const executed = await dependencies.decide(
        command({
          actorUserId: authenticated.userId, caseId: request.params.caseId,
          commandType: 'DECIDE_MEMBERSHIP_REMOVAL', key, version,
          payload: {
            caseId: request.params.caseId, decision: request.body.decision,
            reason: request.body.reason,
            cancelConfirmedSessions: request.body.cancelConfirmedSessions,
          },
          request,
        }),
        effectIds({ actorUserId: authenticated.userId, caseId: request.params.caseId, key }),
      );
      await reply.status(executed.responseStatus).send(
        response(executed, requestContext(request).requestId),
      );
    },
  );
}
