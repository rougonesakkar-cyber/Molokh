import { createHmac } from 'node:crypto';

import {
  ApiErrorSchema,
  DecideYouthConsentBodySchema,
  PublicYouthConsentResponseSchema,
  RequestYouthConsentBodySchema,
  YouthConsentCommandResponseSchema,
  YouthConsentSummaryResponseSchema,
  type DecideYouthConsentBody,
  type PublicYouthConsentResponse,
  type RequestYouthConsentBody,
  type YouthConsentCommandResponse,
  type YouthConsentSummaryResponse,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope, type YouthConsentDecision } from '@molokh/core';
import {
  youthConsentTokenHash,
  type DecideYouthConsentPayload,
  type ExecutedCommand,
  type PublicYouthConsentProjection,
  type RequestYouthConsentPayload,
  type YouthConsentEffectIds,
  type YouthConsentProjection,
  type YouthConsentSummaryProjection,
} from '@molokh/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { idempotentResourceId, newUuidV7 } from './uuid-v7.js';

interface YouthConsentHeaders {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}

interface ChallengeParams { readonly challengeId: string }
interface TokenParams { readonly token: string }

export interface YouthConsentRouteDependencies {
  readonly auth: AuthAdapter;
  readonly tokenSecret: string;
  readonly publicBaseUrl?: string;
  readonly exposeDevelopmentActionUrl?: boolean;
  readonly readSummary: (
    challengeId: string,
    viewerUserId: string,
  ) => Promise<YouthConsentSummaryProjection>;
  readonly request: (
    command: CommandEnvelope<RequestYouthConsentPayload>,
    ids: YouthConsentEffectIds,
    deliveryToken: string,
  ) => Promise<ExecutedCommand<YouthConsentProjection>>;
  readonly readPublic: (token: string) => Promise<PublicYouthConsentProjection>;
  readonly decide: (
    command: CommandEnvelope<DecideYouthConsentPayload>,
    ids: YouthConsentEffectIds,
  ) => Promise<ExecutedCommand<PublicYouthConsentProjection>>;
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

function expectedVersion(value: string | undefined, minimum: number): number {
  const match = value?.trim().match(/^"?(\d+)"?$/);
  const version = Number(match?.[1]);
  if (!Number.isSafeInteger(version) || version < minimum) {
    throw new InvalidCommandEnvelopeError('If-Match');
  }
  return version;
}

function effectIds(): YouthConsentEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    notificationOutboxMessageId: newUuidV7(),
    notificationId: newUuidV7(),
    challengeEventId: newUuidV7(),
    challengeOutboxMessageId: newUuidV7(),
  };
}

export function issueYouthConsentToken(secret: string, consentId: string): string {
  if (secret.length < 32) throw new Error('YOUTH_CONSENT_TOKEN_SECRET must contain at least 32 characters');
  return createHmac('sha256', secret)
    .update(`youth-consent:${consentId}`, 'utf8')
    .digest('base64url');
}

function authenticatedCommand(
  actorUserId: string,
  consentId: string,
  idempotencyKey: string,
  payload: RequestYouthConsentPayload,
  request: FastifyRequest,
): CommandEnvelope<RequestYouthConsentPayload> {
  const context = requestContext(request);
  return {
    commandId: newUuidV7(),
    commandType: 'REQUEST_YOUTH_CHALLENGE_CONSENT',
    idempotencyKey,
    actor: { type: 'USER', id: actorUserId, roles: ['ATHLETE'], scopeIds: [] },
    aggregateType: 'YouthChallengeConsent',
    aggregateId: consentId,
    expectedVersion: 0,
    correlationId: context.correlationId,
    causationId: context.causationId,
    requestId: context.requestId,
    source: 'api',
    payloadVersion: 1,
    payload,
  };
}

function externalCommand(
  projection: PublicYouthConsentProjection,
  token: string,
  decision: YouthConsentDecision,
  body: DecideYouthConsentBody,
  idempotencyKey: string,
  version: number,
  request: FastifyRequest,
): CommandEnvelope<DecideYouthConsentPayload> {
  const context = requestContext(request);
  return {
    commandId: newUuidV7(),
    commandType: `${decision}_YOUTH_CHALLENGE_CONSENT`,
    idempotencyKey,
    actor: {
      type: 'EXTERNAL',
      id: projection.consentId,
      roles: ['GUARDIAN_CONSENT'],
      scopeIds: [projection.challengeId, projection.athleteUserId],
    },
    aggregateType: 'YouthChallengeConsent',
    aggregateId: projection.consentId,
    expectedVersion: version,
    correlationId: context.correlationId,
    causationId: context.causationId,
    requestId: context.requestId,
    source: 'api',
    payloadVersion: 1,
    payload: {
      consentId: projection.consentId,
      tokenHash: youthConsentTokenHash(token),
      decision,
      ...(body.guardianDisplayName === undefined ? {} : { guardianDisplayName: body.guardianDisplayName }),
      ...(body.relationship === undefined ? {} : { relationship: body.relationship }),
      ...(body.consentTextAccepted === undefined ? {} : { consentTextAccepted: body.consentTextAccepted }),
    },
  };
}

export async function registerYouthConsentRoutes(
  app: FastifyInstance,
  dependencies: YouthConsentRouteDependencies,
): Promise<void> {
  app.get<{ Headers: YouthConsentHeaders; Params: ChallengeParams }>(
    '/api/v1/challenges/:challengeId/youth-consents',
    {
      schema: {
        operationId: 'readYouthConsentSummary',
        params: Type.Object({ challengeId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        response: { 200: YouthConsentSummaryResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    async (request, reply): Promise<YouthConsentSummaryResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const summary = await dependencies.readSummary(request.params.challengeId, authenticated.userId);
      return {
        data: { ...summary, consents: [...summary.consents] },
        meta: { requestId: requestContext(request).requestId },
      };
    },
  );

  app.post<{
    Body: RequestYouthConsentBody;
    Headers: YouthConsentHeaders;
    Params: ChallengeParams;
  }>(
    '/api/v1/challenges/:challengeId/youth-consents',
    {
      schema: {
        operationId: 'requestYouthConsent',
        params: Type.Object({ challengeId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: RequestYouthConsentBodySchema,
        response: {
          201: YouthConsentCommandResponseSchema,
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
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      if (expectedVersion(request.headers['if-match'], 0) !== 0) {
        throw new InvalidCommandEnvelopeError('If-Match');
      }
      const consentId = idempotentResourceId(
        'YouthChallengeConsent',
        request.params.challengeId,
        authenticated.userId,
      );
      const deliveryToken = issueYouthConsentToken(dependencies.tokenSecret, consentId);
      const command = authenticatedCommand(
        authenticated.userId,
        consentId,
        idempotencyKey,
        {
          challengeId: request.params.challengeId,
          channel: request.body.channel,
          guardianContact: request.body.guardianContact,
          ...(request.body.smsOptIn === undefined ? {} : { smsOptIn: request.body.smsOptIn }),
        },
        request,
      );
      const executed = await dependencies.request(command, effectIds(), deliveryToken);
      const baseUrl = (dependencies.publicBaseUrl ?? '').replace(/\/$/, '');
      const response: YouthConsentCommandResponse = {
        data: executed.response,
        meta: {
          requestId: requestContext(request).requestId,
          eventId: executed.eventId,
          replayed: executed.replayed,
          ...(dependencies.exposeDevelopmentActionUrl
            ? { developmentActionUrl: `${baseUrl}/guardian-consent?token=${deliveryToken}` }
            : {}),
        },
      };
      await reply.status(executed.responseStatus).send(response);
    },
  );

  app.get<{ Params: TokenParams }>(
    '/api/v1/youth-consents/by-token/:token',
    {
      config: { rateLimit: { max: 30, timeWindow: 60_000 } },
      schema: {
        operationId: 'readPublicYouthConsent',
        params: Type.Object({ token: Type.String({ minLength: 32, maxLength: 256 }) }, { additionalProperties: false }),
        response: { 200: PublicYouthConsentResponseSchema, 404: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (request): Promise<PublicYouthConsentResponse> => ({
      data: await dependencies.readPublic(request.params.token),
      meta: { requestId: requestContext(request).requestId },
    }),
  );

  const registerDecision = (suffix: 'grant' | 'decline' | 'revoke', decision: YouthConsentDecision) => {
    app.post<{ Body: DecideYouthConsentBody; Headers: YouthConsentHeaders; Params: TokenParams }>(
      `/api/v1/youth-consents/by-token/:token/${suffix}`,
      {
        config: { rateLimit: { max: 15, timeWindow: 60_000 } },
        schema: {
          operationId: `${suffix}YouthConsent`,
          params: Type.Object({ token: Type.String({ minLength: 32, maxLength: 256 }) }, { additionalProperties: false }),
          body: DecideYouthConsentBodySchema,
          response: {
            200: PublicYouthConsentResponseSchema,
            400: ApiErrorSchema, 404: ApiErrorSchema, 409: ApiErrorSchema, 422: ApiErrorSchema,
          },
        },
      },
      async (request, reply): Promise<undefined> => {
        const current = await dependencies.readPublic(request.params.token);
        const command = externalCommand(
          current,
          request.params.token,
          decision,
          request.body,
          requiredIdempotencyKey(request.headers['idempotency-key']),
          expectedVersion(request.headers['if-match'], 1),
          request,
        );
        const executed = await dependencies.decide(command, effectIds());
        await reply.status(executed.responseStatus).send({
          data: executed.response,
          meta: {
            requestId: requestContext(request).requestId,
            eventId: executed.eventId,
            replayed: executed.replayed,
          },
        });
      },
    );
  };

  registerDecision('grant', 'GRANT');
  registerDecision('decline', 'DECLINE');
  registerDecision('revoke', 'REVOKE');
}
