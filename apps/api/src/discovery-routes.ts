import {
  ApiErrorSchema,
  DiscoveryCardsResponseSchema,
  type DiscoveryCard,
  type DiscoveryCardsResponse,
} from '@molokh/contracts';
import { DISCOVERY_RANKING_CONFIG_VERSION } from '@molokh/core';
import type { DiscoveryCardProjection } from '@molokh/db';
import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';

export interface DiscoveryRouteDependencies {
  readonly auth: AuthAdapter;
  readonly readCards: (
    viewerUserId: string,
    limit: number,
  ) => Promise<readonly DiscoveryCardProjection[]>;
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
  app.get<{ Querystring: { readonly limit?: number } }>(
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
}
