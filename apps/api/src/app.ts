import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
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
import {
  registerChallengeRoutes,
  type ChallengeRouteDependencies,
} from './challenge-routes.js';
import { registerChatRoutes, type ChatRouteDependencies } from './chat-routes.js';
import {
  registerDiscoveryRoutes,
  type DiscoveryRouteDependencies,
} from './discovery-routes.js';
import { registerRequestContext, requestContext } from './request-context.js';
import {
  registerIdentityRoutes,
  type IdentityRouteDependencies,
} from './identity-routes.js';
import {
  registerVerificationRoutes,
  type VerificationRouteDependencies,
} from './verification-routes.js';
import { registerRoleRoutes, type RoleRouteDependencies } from './role-routes.js';
import {
  registerSchedulingRoutes,
  type SchedulingRouteDependencies,
} from './scheduling-routes.js';
import { registerResultRoutes, type ResultRouteDependencies } from './result-routes.js';
import { registerAppealRoutes, type AppealRouteDependencies } from './appeal-routes.js';
import { registerMissingResultRoutes, type MissingResultRouteDependencies } from './missing-result-routes.js';
import { registerIntegrityCaseRoutes, type IntegrityCaseRouteDependencies } from './integrity-case-routes.js';
import { registerStatusQueueRoutes, type StatusQueueRouteDependencies } from './status-queue-routes.js';
import { registerStatusReleaseRoutes, type StatusReleaseRouteDependencies } from './status-release-routes.js';
import { registerMembershipExitRoutes, type MembershipExitRouteDependencies } from './membership-exit-routes.js';
import { registerMembershipRemovalRoutes, type MembershipRemovalRouteDependencies } from './membership-removal-routes.js';
import { registerYouthConsentRoutes, type YouthConsentRouteDependencies } from './youth-consent-routes.js';
import {
  registerPlatformIncidentRoutes,
  type PlatformIncidentRouteDependencies,
} from './platform-incident-routes.js';

export interface BuildAppOptions extends FastifyServerOptions {
  readonly allowedOrigins?: readonly string[];
  readonly appeal?: AppealRouteDependencies;
  readonly community?: CommunityRouteDependencies;
  readonly chat?: ChatRouteDependencies;
  readonly challenge?: ChallengeRouteDependencies;
  readonly discovery?: DiscoveryRouteDependencies;
  readonly identity?: IdentityRouteDependencies;
  readonly integrityCase?: IntegrityCaseRouteDependencies;
  readonly statusQueue?: StatusQueueRouteDependencies;
  readonly statusRelease?: StatusReleaseRouteDependencies;
  readonly membershipExit?: MembershipExitRouteDependencies;
  readonly membershipRemoval?: MembershipRemovalRouteDependencies;
  readonly youthConsent?: YouthConsentRouteDependencies;
  readonly missingResult?: MissingResultRouteDependencies;
  readonly platformIncident?: PlatformIncidentRouteDependencies;
  readonly roles?: RoleRouteDependencies;
  readonly result?: ResultRouteDependencies;
  readonly scheduling?: SchedulingRouteDependencies;
  readonly readiness?: () => Promise<boolean>;
  readonly verification?: VerificationRouteDependencies;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const {
    allowedOrigins = [],
    appeal,
    chat,
    challenge,
    community,
    discovery,
    identity,
    integrityCase,
    statusQueue,
    statusRelease,
    membershipExit,
    membershipRemoval,
    youthConsent,
    missingResult,
    platformIncident,
    roles,
    result,
    scheduling,
    readiness = async () => true,
    verification,
    ...serverOptions
  } = options;
  const app = Fastify({
    logger: serverOptions.logger ?? false,
    ...serverOptions,
  }).withTypeProvider<TypeBoxTypeProvider>();

  registerRequestContext(app);

  await app.register(helmet, { global: true });
  await app.register(cors, {
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'If-Match',
      'X-Request-Id',
      'X-Correlation-Id',
      'X-Causation-Id',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin: allowedOrigins.length > 0 ? [...allowedOrigins] : false,
    strictPreflight: true,
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: 60_000,
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
  if (integrityCase) await registerIntegrityCaseRoutes(app, integrityCase);
  if (statusQueue) await registerStatusQueueRoutes(app, statusQueue);
  if (statusRelease) await registerStatusReleaseRoutes(app, statusRelease);
  if (membershipExit) await registerMembershipExitRoutes(app, membershipExit);
  if (membershipRemoval) await registerMembershipRemovalRoutes(app, membershipRemoval);
  if (youthConsent) await registerYouthConsentRoutes(app, youthConsent);
  if (appeal) await registerAppealRoutes(app, appeal);
  if (missingResult) await registerMissingResultRoutes(app, missingResult);
  if (platformIncident) await registerPlatformIncidentRoutes(app, platformIncident);
  if (chat) await registerChatRoutes(app, chat);
  if (challenge) await registerChallengeRoutes(app, challenge);
  if (community) await registerCommunityRoutes(app, community);
  if (discovery) await registerDiscoveryRoutes(app, discovery);
  if (roles) await registerRoleRoutes(app, roles);
  if (result) await registerResultRoutes(app, result);
  if (scheduling) await registerSchedulingRoutes(app, scheduling);
  if (verification) await registerVerificationRoutes(app, verification);

  const healthy = (): HealthResponse => ({
    status: 'ok',
    service: 'molokh-api',
    contractVersion: 1,
  });

  app.get(
    '/health/live',
    {
      schema: {
        operationId: 'liveness',
        response: { 200: HealthResponseSchema },
      },
      config: { rateLimit: false },
    },
    async (): Promise<HealthResponse> => healthy(),
  );

  app.get(
    '/health/ready',
    {
      schema: {
        operationId: 'readiness',
        response: {
          200: HealthResponseSchema,
          503: ApiErrorSchema,
        },
      },
      config: { rateLimit: false },
    },
    async (request, reply): Promise<HealthResponse | undefined> => {
      if (await readiness()) return healthy();
      await reply.status(503).send({
        code: 'SERVICE_NOT_READY',
        message: 'A required dependency is unavailable',
        requestId: requestContext(request).requestId,
      });
    },
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
