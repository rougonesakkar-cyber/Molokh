import {
  ApiErrorSchema,
  BlockedUsersResponseSchema,
  DiscoveryActionResponseSchema,
  DiscoveryCardsResponseSchema,
  MatchesResponseSchema,
  SocialRelationshipCommandResponseSchema,
  type BlockedUsersResponse,
  type DiscoveryActionResponse,
  type DiscoveryCard,
  type DiscoveryCardsResponse,
  type MatchesResponse,
  type SocialRelationshipCommandResponse,
} from '@molokh/contracts';
import {
  DISCOVERY_RANKING_CONFIG_VERSION,
  InvalidCommandEnvelopeError,
  SocialActionDeniedError,
  type CommandEnvelope,
} from '@molokh/core';
import type {
  CreateLikePayload,
  BlockActionProjection,
  BlockEffectIds,
  BlockProjection,
  BlockUserPayload,
  DiscoveryActionProjection,
  DiscoveryCardProjection,
  ExecutedCommand,
  LikeEffectIds,
  MatchProjection,
  UnblockActionProjection,
  UnblockEffectIds,
  UnblockUserPayload,
  UnmatchEffectIds,
  UnmatchPayload,
  UnmatchProjection,
  SkipDiscoveryPayload,
  SkipEffectIds,
} from '@molokh/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { idempotentResourceId, newUuidV7 } from './uuid-v7.js';

interface DiscoveryHeaders {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}

interface DiscoveryTargetParams {
  readonly userId: string;
}

interface MatchParams {
  readonly matchId: string;
}

export interface DiscoveryRouteDependencies {
  readonly auth: AuthAdapter;
  readonly readCards: (
    viewerUserId: string,
    limit: number,
  ) => Promise<readonly DiscoveryCardProjection[]>;
  readonly createLike: (
    command: CommandEnvelope<CreateLikePayload>,
    ids: LikeEffectIds,
  ) => Promise<ExecutedCommand<DiscoveryActionProjection>>;
  readonly skip: (
    command: CommandEnvelope<SkipDiscoveryPayload>,
    ids: SkipEffectIds,
  ) => Promise<ExecutedCommand<DiscoveryActionProjection>>;
  readonly readMatches: (userId: string) => Promise<readonly MatchProjection[]>;
  readonly unmatch: (
    command: CommandEnvelope<UnmatchPayload>,
    ids: UnmatchEffectIds,
  ) => Promise<ExecutedCommand<UnmatchProjection>>;
  readonly block: (
    command: CommandEnvelope<BlockUserPayload>,
    ids: BlockEffectIds,
  ) => Promise<ExecutedCommand<BlockActionProjection>>;
  readonly readBlocks: (userId: string) => Promise<readonly BlockProjection[]>;
  readonly readLatestBlock: (
    blockerUserId: string,
    blockedUserId: string,
  ) => Promise<BlockProjection | null>;
  readonly unblock: (
    command: CommandEnvelope<UnblockUserPayload>,
    ids: UnblockEffectIds,
  ) => Promise<ExecutedCommand<UnblockActionProjection>>;
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
  if (!Number.isSafeInteger(version) || version !== 0) {
    throw new InvalidCommandEnvelopeError('If-Match');
  }
  return version;
}

function currentVersion(value: string | undefined): number {
  const match = value?.trim().match(/^"?(\d+)"?$/);
  const version = match?.[1] ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new InvalidCommandEnvelopeError('If-Match');
  }
  return version;
}

function likeEffectIds(): LikeEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    matchId: newUuidV7(),
    chatId: newUuidV7(),
    mutualEventId: newUuidV7(),
    matchEventId: newUuidV7(),
    chatEventId: newUuidV7(),
    matchOutboxMessageId: newUuidV7(),
  };
}

function skipEffectIds(suppressionId: string): SkipEffectIds {
  return {
    suppressionId,
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    removedLikeEventId: newUuidV7(),
  };
}

function unmatchEffectIds(suppressionId: string): UnmatchEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    suppressionId,
    suppressionEventId: newUuidV7(),
    suppressionOutboxMessageId: newUuidV7(),
    chatEventId: newUuidV7(),
  };
}

function blockEffectIds(): BlockEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    matchEventId: newUuidV7(),
    chatEventId: newUuidV7(),
    withdrawnLikeEventId: newUuidV7(),
  };
}

function unblockEffectIds(): UnblockEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
  };
}

function actionResponse(
  executed: ExecutedCommand<DiscoveryActionProjection>,
  requestId: string,
): DiscoveryActionResponse {
  return {
    data: executed.response,
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

function relationshipResponse(
  executed: ExecutedCommand<
    UnmatchProjection | BlockActionProjection | UnblockActionProjection
  >,
  requestId: string,
): SocialRelationshipCommandResponse {
  return {
    data: executed.response,
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

function contractCard(card: DiscoveryCardProjection): DiscoveryCard {
  return {
    candidateUserId: card.candidateUserId,
    displayName: card.displayName,
    avatarAssetId: card.avatarAssetId,
    ageDivision: card.ageDivision,
    primarySport: card.primarySport,
    secondarySport: card.secondarySport,
    experienceText: card.experienceText,
    homeVenue: { ...card.homeVenue },
    geographyTier: card.geographyTier,
    inboundLike: card.inboundLike,
    sportOverlap: card.sportOverlap,
    distanceKm: card.distanceKm,
    rankingConfigVersion: card.rankingConfigVersion,
    rankingReasons: [...card.rankingReasons],
  };
}

export async function registerDiscoveryRoutes(
  app: FastifyInstance,
  dependencies: DiscoveryRouteDependencies,
): Promise<void> {
  app.get<{
    Headers: DiscoveryHeaders;
    Querystring: { readonly limit?: number };
  }>(
    '/api/v1/discovery/cards',
    {
      schema: {
        operationId: 'readDiscoveryCards',
        querystring: Type.Object(
          { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })) },
          { additionalProperties: false },
        ),
        response: {
          200: DiscoveryCardsResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<DiscoveryCardsResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      const context = requestContext(request);
      if (!authenticated) {
        await reply.status(401).send({
          code: 'UNAUTHENTICATED',
          message: 'Authentication is required',
          requestId: context.requestId,
        });
        return;
      }
      const cards = await dependencies.readCards(
        authenticated.userId,
        request.query.limit ?? 20,
      );
      return {
        data: cards.map(contractCard),
        meta: {
          requestId: context.requestId,
          rankingConfigVersion: DISCOVERY_RANKING_CONFIG_VERSION,
        },
      };
    },
  );

  app.post<{
    Headers: DiscoveryHeaders;
    Params: DiscoveryTargetParams;
  }>(
    '/api/v1/discovery/:userId/like',
    {
      schema: {
        operationId: 'likeDiscoveryCandidate',
        params: Type.Object(
          { userId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        response: {
          201: DiscoveryActionResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(
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
      const likeId = idempotentResourceId('Like', authenticated.userId, idempotencyKey);
      const command: CommandEnvelope<CreateLikePayload> = {
        commandId: newUuidV7(),
        commandType: 'LIKE',
        idempotencyKey,
        actor: {
          type: 'USER',
          id: authenticated.userId,
          roles: ['ATHLETE'],
          scopeIds: [],
        },
        aggregateType: 'Like',
        aggregateId: likeId,
        expectedVersion: expectedVersion(request.headers['if-match']),
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'api',
        payloadVersion: 1,
        payload: { targetUserId: request.params.userId, source: 'DISCOVERY' },
      };
      const executed = await dependencies.createLike(command, likeEffectIds());
      await reply.status(201).send(actionResponse(executed, context.requestId));
    },
  );

  app.post<{
    Headers: DiscoveryHeaders;
    Params: DiscoveryTargetParams;
  }>(
    '/api/v1/discovery/:userId/skip',
    {
      schema: {
        operationId: 'skipDiscoveryCandidate',
        params: Type.Object(
          { userId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        response: {
          201: DiscoveryActionResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(
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
      const suppressionId = idempotentResourceId(
        'DiscoveryPairSuppression',
        authenticated.userId,
        idempotencyKey,
      );
      const command: CommandEnvelope<SkipDiscoveryPayload> = {
        commandId: newUuidV7(),
        commandType: 'SKIP',
        idempotencyKey,
        actor: {
          type: 'USER',
          id: authenticated.userId,
          roles: ['ATHLETE'],
          scopeIds: [],
        },
        aggregateType: 'DiscoveryPairSuppression',
        aggregateId: suppressionId,
        expectedVersion: expectedVersion(request.headers['if-match']),
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'api',
        payloadVersion: 1,
        payload: { targetUserId: request.params.userId },
      };
      const executed = await dependencies.skip(command, skipEffectIds(suppressionId));
      await reply.status(201).send(actionResponse(executed, context.requestId));
    },
  );

  app.get<{ Headers: DiscoveryHeaders }>(
    '/api/v1/matches',
    {
      schema: {
        operationId: 'readMatches',
        response: {
          200: MatchesResponseSchema,
          401: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<MatchesResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const matches = await dependencies.readMatches(authenticated.userId);
      return { data: matches.map((match) => ({ ...match })), meta: { requestId: context.requestId } };
    },
  );

  app.delete<{
    Headers: DiscoveryHeaders;
    Params: MatchParams;
  }>(
    '/api/v1/matches/:matchId',
    {
      schema: {
        operationId: 'unmatch',
        params: Type.Object(
          { matchId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        response: {
          200: SocialRelationshipCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(
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
      const suppressionId = idempotentResourceId(
        'DiscoveryPairSuppression',
        authenticated.userId,
        idempotencyKey,
      );
      const command: CommandEnvelope<UnmatchPayload> = {
        commandId: newUuidV7(),
        commandType: 'UNMATCH',
        idempotencyKey,
        actor: {
          type: 'USER',
          id: authenticated.userId,
          roles: ['ATHLETE'],
          scopeIds: [],
        },
        aggregateType: 'Match',
        aggregateId: request.params.matchId,
        expectedVersion: currentVersion(request.headers['if-match']),
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'api',
        payloadVersion: 1,
        payload: { matchId: request.params.matchId },
      };
      const executed = await dependencies.unmatch(
        command,
        unmatchEffectIds(suppressionId),
      );
      await reply.status(200).send(relationshipResponse(executed, context.requestId));
    },
  );

  app.post<{
    Headers: DiscoveryHeaders;
    Params: DiscoveryTargetParams;
  }>(
    '/api/v1/users/:userId/block',
    {
      schema: {
        operationId: 'blockUser',
        params: Type.Object(
          { userId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        response: {
          201: SocialRelationshipCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(
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
      const blockId = idempotentResourceId('Block', authenticated.userId, idempotencyKey);
      const command: CommandEnvelope<BlockUserPayload> = {
        commandId: newUuidV7(),
        commandType: 'BLOCK_USER',
        idempotencyKey,
        actor: {
          type: 'USER',
          id: authenticated.userId,
          roles: ['ATHLETE'],
          scopeIds: [],
        },
        aggregateType: 'Block',
        aggregateId: blockId,
        expectedVersion: expectedVersion(request.headers['if-match']),
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'api',
        payloadVersion: 1,
        payload: { targetUserId: request.params.userId, reasonCode: null },
      };
      const executed = await dependencies.block(command, blockEffectIds());
      await reply.status(201).send(relationshipResponse(executed, context.requestId));
    },
  );

  app.get<{ Headers: DiscoveryHeaders }>(
    '/api/v1/me/blocks',
    {
      schema: {
        operationId: 'readBlockedUsers',
        response: { 200: BlockedUsersResponseSchema, 401: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<BlockedUsersResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const blocks = await dependencies.readBlocks(authenticated.userId);
      return { data: blocks.map((block) => ({ ...block })), meta: { requestId: context.requestId } };
    },
  );

  app.delete<{
    Headers: DiscoveryHeaders;
    Params: DiscoveryTargetParams;
  }>(
    '/api/v1/users/:userId/block',
    {
      schema: {
        operationId: 'unblockUser',
        params: Type.Object(
          { userId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        response: {
          200: SocialRelationshipCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(
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
      const expected = currentVersion(request.headers['if-match']);
      const block = await dependencies.readLatestBlock(
        authenticated.userId,
        request.params.userId,
      );
      if (!block) throw new SocialActionDeniedError('BLOCK_NOT_ACTIVE');
      const command: CommandEnvelope<UnblockUserPayload> = {
        commandId: newUuidV7(),
        commandType: 'UNBLOCK_USER',
        idempotencyKey,
        actor: {
          type: 'USER',
          id: authenticated.userId,
          roles: ['ATHLETE'],
          scopeIds: [],
        },
        aggregateType: 'Block',
        aggregateId: block.blockId,
        expectedVersion: expected,
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'api',
        payloadVersion: 1,
        payload: { targetUserId: request.params.userId },
      };
      const executed = await dependencies.unblock(command, unblockEffectIds());
      await reply.status(200).send(relationshipResponse(executed, context.requestId));
    },
  );
}
