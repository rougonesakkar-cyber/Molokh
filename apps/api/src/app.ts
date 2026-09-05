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

export async function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? false,
    ...options,
  }).withTypeProvider<TypeBoxTypeProvider>();

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Molokh API',
        version: '0.0.0',
      },
    },
  });

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

