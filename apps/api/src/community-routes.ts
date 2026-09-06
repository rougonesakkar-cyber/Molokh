import {
  ApiErrorSchema,
  CommunityContextResponseSchema,
  type CommunityContextContract,
  type CommunityContextResponse,
} from '@molokh/contracts';
import type { CommunityContextProjection } from '@molokh/db';
import type { FastifyInstance } from 'fastify';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';

export interface CommunityRouteDependencies {
  readonly auth: AuthAdapter;
  readonly readContext: (userId: string) => Promise<CommunityContextProjection | null>;
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
}
