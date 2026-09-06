import swagger from '@fastify/swagger';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  ApiErrorSchema,
  HealthResponseSchema,
  RuntimeProjectionSchema,
  type HealthResponse,
  type RuntimeProjection,
} from '@molokh/contracts';
import Fastify, { type FastifyServerOptions } from 'fastify';

import {
  registerCommunityRoutes,
  type CommunityRouteDependencies,
} from './community-routes.js';
import { registerRequestContext } from './request-context.js';
import {
  registerIdentityRoutes,
  type IdentityRouteDependencies,
} from './identity-routes.js';

export interface BuildAppOptions extends FastifyServerOptions {
  readonly allowedOrigins?: readonly string[];
  readonly community?: CommunityRouteDependencies;
  readonly identity?: IdentityRouteDependencies;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const { allowedOrigins = [], community, identity, ...serverOptions } = options;
  const app = Fastify({
    logger: serverOptions.logger ?? false,
    ...serverOptions,
  }).withTypeProvider<TypeBoxTypeProvider>();

  registerRequestContext(app);

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      void reply.header('access-control-allow-origin', origin);
      void reply.header('vary', 'Origin');
      void reply.header(
        'access-control-allow-headers',
        'Authorization, Content-Type, Idempotency-Key, If-Match, X-Request-Id, X-Correlation-Id',
      );
      void reply.header('access-control-allow-methods', 'GET, PATCH, OPTIONS');
      if (request.method === 'OPTIONS') await reply.status(204).send();
    }
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Molokh API',
        version: '0.0.0',
      },
    },
  });

  if (identity) await registerIdentityRoutes(app, identity);
  if (community) await registerCommunityRoutes(app, community);

  app.get(
    '/health/ready',
    {
      schema: {
        operationId: 'readiness',
        response: {
          200: HealthResponseSchema,
          500: ApiErrorSchema,
        },
      },
    },
    async (): Promise<HealthResponse> => ({
      status: 'ok',
      service: 'molokh-api',
      contractVersion: 1,
    }),
  );

  app.get(
    '/v1/meta/runtime',
    {
      schema: {
        operationId: 'runtimeProjection',
        response: { 200: RuntimeProjectionSchema },
      },
    },
    async (): Promise<RuntimeProjection> => ({
      architecture: 'modular-monolith',
      apiTransport: 'https+sse',
      clients: ['web', 'ios', 'android'],
      database: 'postgresql-18',
    }),
  );

  return app;
}
