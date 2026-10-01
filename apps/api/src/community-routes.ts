import {
  ApiErrorSchema,
  CommunityContextResponseSchema,
  CommunityClosureCandidatesResponseSchema,
  CommunityClosureCommandResponseSchema,
  CommunityClosurePlanResponseSchema,
  CommunityLifecycleCommandResponseSchema,
  CommunityLifecycleReasonBodySchema,
  CommunityLifecycleResponseSchema,
  FinalizeCommunityClosureBodySchema,
  ScheduleCommunityClosureBodySchema,
  type CommunityContextContract,
  type CommunityContextResponse,
  type CommunityClosureCandidatesResponse,
  type CommunityClosureCommandResponse,
  type CommunityClosurePlanResponse,
  type CommunityLifecycleCommandResponse,
  type CommunityLifecycleContract,
  type CommunityLifecycleReasonBody,
  type CommunityLifecycleResponse,
  type FinalizeCommunityClosureBody,
  type ScheduleCommunityClosureBody,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope } from '@molokh/core';
import type {
  CommunityContextProjection,
  CommunityClosureCommandPreparation,
  CommunityClosureProjection,
  FinalizeCommunityClosureEffectIds,
  FinalizeCommunityClosurePayload,
  ScheduleCommunityClosureEffectIds,
  ScheduleCommunityClosurePayload,
  CommunityLifecycleEffectIds,
  CommunityLifecycleProjection,
  ExecutedCommand,
  PauseCommunityPayload,
  ReactivateCommunityPayload,
} from '@molokh/db';
import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { idempotentResourceId, newUuidV7 } from './uuid-v7.js';

interface LifecycleHeaders {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}

interface CommunityParams { readonly communityId: string }

export interface CommunityLifecycleRouteDependencies {
  readonly auth: AuthAdapter;
  readonly read: (communityId: string) => Promise<CommunityLifecycleProjection | null>;
  readonly pause: (
    command: CommandEnvelope<PauseCommunityPayload>,
    ids: CommunityLifecycleEffectIds,
  ) => Promise<ExecutedCommand<CommunityLifecycleProjection>>;
  readonly reactivate: (
    command: CommandEnvelope<ReactivateCommunityPayload>,
    ids: CommunityLifecycleEffectIds,
  ) => Promise<ExecutedCommand<CommunityLifecycleProjection>>;
  readonly closure?: {
    readonly read: (communityId: string) => Promise<CommunityClosureProjection | null>;
    readonly prepare: (communityId: string) => Promise<CommunityClosureCommandPreparation>;
    readonly schedule: (
      command: CommandEnvelope<ScheduleCommunityClosurePayload>,
      ids: ScheduleCommunityClosureEffectIds,
    ) => Promise<ExecutedCommand<CommunityClosureProjection>>;
    readonly finalize: (
      command: CommandEnvelope<FinalizeCommunityClosurePayload>,
      ids: FinalizeCommunityClosureEffectIds,
    ) => Promise<ExecutedCommand<CommunityClosureProjection>>;
  };
}

export interface CommunityRouteDependencies {
  readonly auth: AuthAdapter;
  readonly readContext: (userId: string) => Promise<CommunityContextProjection | null>;
  readonly lifecycle?: CommunityLifecycleRouteDependencies;
}

function contractContext(context: CommunityContextProjection): CommunityContextContract {
  return {
    ...context,
    venue: { ...context.venue, contactPayload: { ...context.venue.contactPayload } },
    community: { ...context.community },
    membership: context.membership ? { ...context.membership } : null,
    activeRoleGrants: context.activeRoleGrants.map((grant) => ({ ...grant })),
    access: {
      capabilities: [...context.access.capabilities],
      denials: context.access.denials.map((denial) => ({ ...denial })),
    },
  };
}

function contractLifecycle(projection: CommunityLifecycleProjection): CommunityLifecycleContract {
  return {
    ...projection,
    competitions: projection.competitions.map((competition) => ({ ...competition })),
  };
}

function requiredHeader(value: string | undefined, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new InvalidCommandEnvelopeError(field);
  return normalized;
}

function expectedVersion(value: string | undefined): number {
  const match = value?.trim().match(/^"?(\d+)"?$/);
  const parsed = Number(match?.[1]);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new InvalidCommandEnvelopeError('If-Match');
  }
  return parsed;
}

function lifecycleCommand(
  actorUserId: string,
  communityId: string,
  commandType: 'PAUSE_COMMUNITY' | 'REACTIVATE_COMMUNITY',
  idempotencyKey: string,
  version: number,
  reason: string,
  request: Parameters<typeof requestContext>[0],
): CommandEnvelope<PauseCommunityPayload | ReactivateCommunityPayload> {
  const context = requestContext(request);
  return {
    commandId: newUuidV7(), commandType, idempotencyKey,
    actor: { type: 'USER', id: actorUserId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
    aggregateType: 'Community', aggregateId: communityId, expectedVersion: version,
    correlationId: context.correlationId, causationId: context.causationId,
    requestId: context.requestId, source: 'admin', payloadVersion: 1,
    payload: { communityId, reason },
  };
}

function lifecycleIds(
  actorUserId: string,
  communityId: string,
  idempotencyKey: string,
  competitionCount: number,
): CommunityLifecycleEffectIds {
  return {
    eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7(),
    pauseId: idempotentResourceId('CommunityPause', communityId, idempotencyKey),
    competitionEventIds: Array.from({ length: competitionCount }, (_, index) =>
      idempotentResourceId(`CommunityCompetitionLifecycle:${index}`, actorUserId, idempotencyKey)),
  };
}

function scheduleClosureCommand(
  actorUserId: string,
  communityId: string,
  idempotencyKey: string,
  version: number,
  body: ScheduleCommunityClosureBody,
  request: Parameters<typeof requestContext>[0],
): CommandEnvelope<ScheduleCommunityClosurePayload> {
  const context = requestContext(request);
  return {
    commandId: newUuidV7(), commandType: 'SCHEDULE_COMMUNITY_CLOSURE', idempotencyKey,
    actor: { type: 'USER', id: actorUserId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
    aggregateType: 'Community', aggregateId: communityId, expectedVersion: version,
    correlationId: context.correlationId, causationId: context.causationId,
    requestId: context.requestId, source: 'admin', payloadVersion: 1,
    payload: {
      communityId, category: body.category, reason: body.reason,
      emergency: body.emergency, effectiveAt: body.effectiveAt,
      sessionDispositions: body.sessionDispositions.map((item) => ({ ...item })),
    },
  };
}

function finalizeClosureCommand(
  actorUserId: string,
  communityId: string,
  idempotencyKey: string,
  version: number,
  body: FinalizeCommunityClosureBody,
  request: Parameters<typeof requestContext>[0],
): CommandEnvelope<FinalizeCommunityClosurePayload> {
  const context = requestContext(request);
  return {
    commandId: newUuidV7(), commandType: 'FINALIZE_COMMUNITY_CLOSURE', idempotencyKey,
    actor: { type: 'USER', id: actorUserId, roles: ['CENTRAL_ADMIN'], scopeIds: [] },
    aggregateType: 'Community', aggregateId: communityId, expectedVersion: version,
    correlationId: context.correlationId, causationId: context.causationId,
    requestId: context.requestId, source: 'admin', payloadVersion: 1,
    payload: { communityId, planId: body.planId, reason: body.reason },
  };
}

function scheduleClosureIds(
  actorUserId: string,
  communityId: string,
  idempotencyKey: string,
  preparation: CommunityClosureCommandPreparation,
): ScheduleCommunityClosureEffectIds {
  const id = (kind: string, index?: number) => idempotentResourceId(
    index === undefined ? kind : `${kind}:${index}`,
    `${actorUserId}:${communityId}`,
    idempotencyKey,
  );
  return {
    planId: id('CommunityClosurePlan'), eventId: newUuidV7(), auditId: newUuidV7(),
    outboxMessageId: newUuidV7(), notificationOutboxMessageId: newUuidV7(),
    notificationIds: Array.from({ length: preparation.memberCount }, (_, index) =>
      id('CommunityClosureNotification', index)),
    competitionEventIds: Array.from({ length: preparation.competitionCount }, (_, index) =>
      id('CommunityClosureCompetitionEvent', index)),
    challengeEventIds: Array.from({ length: preparation.liveChallengeCount }, (_, index) =>
      id('CommunityClosureChallengeEvent', index)),
    sessionEventIds: Array.from({ length: preparation.sessions.length }, (_, index) =>
      id('CommunityClosureSessionEvent', index)),
  };
}

function finalizeClosureIds(
  actorUserId: string,
  communityId: string,
  idempotencyKey: string,
  preparation: CommunityClosureCommandPreparation,
): FinalizeCommunityClosureEffectIds {
  const id = (kind: string, index?: number) => idempotentResourceId(
    index === undefined ? kind : `${kind}:${index}`,
    `${actorUserId}:${communityId}`,
    idempotencyKey,
  );
  return {
    eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7(),
    competitionEventIds: Array.from({ length: preparation.competitionCount }, (_, index) =>
      id('CommunityClosedCompetitionEvent', index)),
    membershipEventIds: Array.from({ length: preparation.memberCount }, (_, index) =>
      id('CommunityClosedMembershipEvent', index)),
    statusDispositionIds: Array.from({ length: preparation.statusHolderCount }, (_, index) =>
      id('CommunityClosedStatusDisposition', index)),
    statusEventIds: Array.from({ length: preparation.statusHolderCount }, (_, index) =>
      id('CommunityClosedStatusEvent', index)),
    challengeEventIds: Array.from({ length: preparation.liveChallengeCount }, (_, index) =>
      id('CommunityClosedChallengeEvent', index)),
  };
}

export async function registerCommunityRoutes(
  app: FastifyInstance,
  dependencies: CommunityRouteDependencies,
): Promise<void> {
  app.get(
    '/api/v1/me/community',
    {
      schema: {
        operationId: 'readMyCommunityContext',
        response: {
          200: CommunityContextResponseSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<CommunityContextResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      const context = requestContext(request);
      if (!authenticated) {
        await reply.status(401).send({
          code: 'UNAUTHENTICATED',
          message: 'Authentication is required',
          requestId: context.requestId,
        });
        return;
      }
      const community = await dependencies.readContext(authenticated.userId);
      if (!community) {
        await reply.status(404).send({
          code: 'COMMUNITY_CONTEXT_NOT_FOUND',
          message: 'Community context was not found',
          requestId: context.requestId,
        });
        return;
      }
      return {
        data: contractContext(community),
        meta: { requestId: context.requestId },
      };
    },
  );

  const lifecycle = dependencies.lifecycle;
  if (!lifecycle) return;

  app.get<{ Headers: LifecycleHeaders; Params: CommunityParams }>(
    '/api/v1/central/communities/:communityId/lifecycle',
    {
      schema: {
        operationId: 'readCommunityLifecycle',
        params: Type.Object({ communityId: Type.String({ format: 'uuid' }) }),
        response: { 200: CommunityLifecycleResponseSchema, 401: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<CommunityLifecycleResponse | undefined> => {
      const authenticated = await lifecycle.auth.authenticate(request.headers.authorization);
      const context = requestContext(request);
      if (!authenticated) {
        await reply.status(401).send({
          code: 'UNAUTHENTICATED', message: 'Authentication is required', requestId: context.requestId,
        });
        return;
      }
      const projection = await lifecycle.read(request.params.communityId);
      if (!projection) {
        await reply.status(404).send({
          code: 'COMMUNITY_CONTEXT_NOT_FOUND', message: 'Community was not found', requestId: context.requestId,
        });
        return;
      }
      return { data: contractLifecycle(projection), meta: { requestId: context.requestId } };
    },
  );

  const registerCommand = (
    action: 'pause' | 'reactivate',
    commandType: 'PAUSE_COMMUNITY' | 'REACTIVATE_COMMUNITY',
  ) => {
    app.post<{
      Body: CommunityLifecycleReasonBody;
      Headers: LifecycleHeaders;
      Params: CommunityParams;
    }>(
      `/api/v1/central/communities/:communityId/${action}`,
      {
        schema: {
          operationId: action === 'pause' ? 'pauseCommunity' : 'reactivateCommunity',
          params: Type.Object({ communityId: Type.String({ format: 'uuid' }) }),
          body: CommunityLifecycleReasonBodySchema,
          response: {
            200: CommunityLifecycleCommandResponseSchema,
            400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
            404: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema,
          },
        },
      },
      async (request, reply): Promise<CommunityLifecycleCommandResponse | undefined> => {
        const authenticated = await lifecycle.auth.authenticate(request.headers.authorization);
        const context = requestContext(request);
        if (!authenticated) {
          await reply.status(401).send({
            code: 'UNAUTHENTICATED', message: 'Authentication is required', requestId: context.requestId,
          });
          return;
        }
        const current = await lifecycle.read(request.params.communityId);
        if (!current) {
          await reply.status(404).send({
            code: 'COMMUNITY_CONTEXT_NOT_FOUND', message: 'Community was not found', requestId: context.requestId,
          });
          return;
        }
        const key = requiredHeader(request.headers['idempotency-key'], 'Idempotency-Key');
        const command = lifecycleCommand(
          authenticated.userId, request.params.communityId, commandType, key,
          expectedVersion(request.headers['if-match']), request.body.reason, request,
        );
        const ids = lifecycleIds(
          authenticated.userId, request.params.communityId, key, current.competitions.length,
        );
        const executed = commandType === 'PAUSE_COMMUNITY'
          ? await lifecycle.pause(command as CommandEnvelope<PauseCommunityPayload>, ids)
          : await lifecycle.reactivate(command as CommandEnvelope<ReactivateCommunityPayload>, ids);
        return {
          data: contractLifecycle(executed.response),
          meta: { requestId: context.requestId, eventId: executed.eventId, replayed: executed.replayed },
        };
      },
    );
  };

  registerCommand('pause', 'PAUSE_COMMUNITY');
  registerCommand('reactivate', 'REACTIVATE_COMMUNITY');

  const closure = lifecycle.closure;
  if (!closure) return;

  app.get<{ Headers: LifecycleHeaders; Params: CommunityParams }>(
    '/api/v1/central/communities/:communityId/closure/candidates',
    {
      schema: {
        operationId: 'readCommunityClosureCandidates',
        params: Type.Object({ communityId: Type.String({ format: 'uuid' }) }),
        response: { 200: CommunityClosureCandidatesResponseSchema, 401: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<CommunityClosureCandidatesResponse | undefined> => {
      const authenticated = await lifecycle.auth.authenticate(request.headers.authorization);
      const context = requestContext(request);
      if (!authenticated) {
        await reply.status(401).send({
          code: 'UNAUTHENTICATED', message: 'Authentication is required', requestId: context.requestId,
        });
        return;
      }
      const preparation = await closure.prepare(request.params.communityId);
      return { data: preparation.sessions.map((session) => ({ ...session,
        athleteDisplayNames: [...session.athleteDisplayNames] as [string, string] })),
      meta: { requestId: context.requestId } };
    },
  );

  app.get<{ Headers: LifecycleHeaders; Params: CommunityParams }>(
    '/api/v1/central/communities/:communityId/closure',
    {
      schema: {
        operationId: 'readCommunityClosurePlan',
        params: Type.Object({ communityId: Type.String({ format: 'uuid' }) }),
        response: { 200: CommunityClosurePlanResponseSchema, 401: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<CommunityClosurePlanResponse | undefined> => {
      const authenticated = await lifecycle.auth.authenticate(request.headers.authorization);
      const context = requestContext(request);
      if (!authenticated) {
        await reply.status(401).send({
          code: 'UNAUTHENTICATED', message: 'Authentication is required', requestId: context.requestId,
        });
        return;
      }
      const plan = await closure.read(request.params.communityId);
      if (!plan) {
        await reply.status(404).send({
          code: 'COMMUNITY_CLOSURE_NOT_FOUND', message: 'Community Closure Plan was not found',
          requestId: context.requestId,
        });
        return;
      }
      return { data: { ...plan }, meta: { requestId: context.requestId } };
    },
  );

  app.post<{
    Body: ScheduleCommunityClosureBody;
    Headers: LifecycleHeaders;
    Params: CommunityParams;
  }>(
    '/api/v1/central/communities/:communityId/closure/schedule',
    {
      schema: {
        operationId: 'scheduleCommunityClosure',
        params: Type.Object({ communityId: Type.String({ format: 'uuid' }) }),
        body: ScheduleCommunityClosureBodySchema,
        response: {
          200: CommunityClosureCommandResponseSchema,
          400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
          404: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<CommunityClosureCommandResponse | undefined> => {
      const authenticated = await lifecycle.auth.authenticate(request.headers.authorization);
      const context = requestContext(request);
      if (!authenticated) {
        await reply.status(401).send({
          code: 'UNAUTHENTICATED', message: 'Authentication is required', requestId: context.requestId,
        });
        return;
      }
      const current = await lifecycle.read(request.params.communityId);
      if (!current) {
        await reply.status(404).send({
          code: 'COMMUNITY_CONTEXT_NOT_FOUND', message: 'Community was not found', requestId: context.requestId,
        });
        return;
      }
      const key = requiredHeader(request.headers['idempotency-key'], 'Idempotency-Key');
      const preparation = await closure.prepare(request.params.communityId);
      const command = scheduleClosureCommand(
        authenticated.userId, request.params.communityId, key,
        expectedVersion(request.headers['if-match']), request.body, request,
      );
      const executed = await closure.schedule(command, scheduleClosureIds(
        authenticated.userId, request.params.communityId, key, preparation,
      ));
      return { data: { ...executed.response }, meta: {
        requestId: context.requestId, eventId: executed.eventId, replayed: executed.replayed,
      } };
    },
  );

  app.post<{
    Body: FinalizeCommunityClosureBody;
    Headers: LifecycleHeaders;
    Params: CommunityParams;
  }>(
    '/api/v1/central/communities/:communityId/closure/finalize',
    {
      schema: {
        operationId: 'finalizeCommunityClosure',
        params: Type.Object({ communityId: Type.String({ format: 'uuid' }) }),
        body: FinalizeCommunityClosureBodySchema,
        response: {
          200: CommunityClosureCommandResponseSchema,
          400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
          404: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<CommunityClosureCommandResponse | undefined> => {
      const authenticated = await lifecycle.auth.authenticate(request.headers.authorization);
      const context = requestContext(request);
      if (!authenticated) {
        await reply.status(401).send({
          code: 'UNAUTHENTICATED', message: 'Authentication is required', requestId: context.requestId,
        });
        return;
      }
      const current = await lifecycle.read(request.params.communityId);
      if (!current) {
        await reply.status(404).send({
          code: 'COMMUNITY_CONTEXT_NOT_FOUND', message: 'Community was not found', requestId: context.requestId,
        });
        return;
      }
      const key = requiredHeader(request.headers['idempotency-key'], 'Idempotency-Key');
      const preparation = await closure.prepare(request.params.communityId);
      const command = finalizeClosureCommand(
        authenticated.userId, request.params.communityId, key,
        expectedVersion(request.headers['if-match']), request.body, request,
      );
      const executed = await closure.finalize(command, finalizeClosureIds(
        authenticated.userId, request.params.communityId, key, preparation,
      ));
      return { data: { ...executed.response }, meta: {
        requestId: context.requestId, eventId: executed.eventId, replayed: executed.replayed,
      } };
    },
  );
}
