import {
  ApiErrorSchema,
  AuthSessionResponseSchema,
  LogoutAuthSessionResponseSchema,
  RefreshAuthSessionBodySchema,
  RequestAuthOtpBodySchema,
  RequestAuthOtpResponseSchema,
  VerifyAuthOtpBodySchema,
  VerifyAuthOtpResponseSchema,
  type AuthSessionResponse,
  type AuthSessionTokens,
  type LogoutAuthSessionResponse,
  type RefreshAuthSessionBody,
  type RequestAuthOtpBody,
  type RequestAuthOtpResponse,
  type VerifyAuthOtpBody,
  type VerifyAuthOtpResponse,
} from '@molokh/contracts';
import {
  AuthSessionConflictError,
  InvalidCommandEnvelopeError,
  VersionConflictError,
  type CommandEnvelope,
} from '@molokh/core';
import type {
  AuthCommandEffectIds,
  AuthOtpChallengeProjection,
  AuthOtpRequestEffectIds,
  AuthOtpVerificationProjection,
  AuthSessionIssueIds,
  AuthSessionProjection,
  AuthSessionRotationIds,
  ExecutedCommand,
  RefreshTokenContext,
  RequestAuthOtpPayload,
  RevokeAuthSessionPayload,
  RotateAuthSessionPayload,
  VerifyAuthOtpPayload,
} from '@molokh/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { deriveOpaqueToken, deriveOtpCode, deriveUuid, otpVerifierHash } from './auth-crypto.js';
import { hashBearerToken, type AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { newUuidV7 } from './uuid-v7.js';

interface IdempotentHeaders {
  readonly authorization?: string;
  readonly cookie?: string;
  readonly 'idempotency-key'?: string;
}

export interface AuthRouteDependencies {
  readonly auth: AuthAdapter;
  readonly secret: string;
  readonly localDevelopmentTransportEnabled: boolean;
  readonly smsTransportAvailable: boolean;
  readonly secureCookies: boolean;
  readonly requestOtp: (command: CommandEnvelope<RequestAuthOtpPayload>,
    ids: AuthOtpRequestEffectIds, codeVerifierHash: string) =>
    Promise<ExecutedCommand<AuthOtpChallengeProjection>>;
  readonly verifyOtp: (command: CommandEnvelope<VerifyAuthOtpPayload>,
    ids: AuthSessionIssueIds, secrets: {
      readonly suppliedCodeVerifierHash: string;
      readonly sessionReferenceHash: string;
      readonly accessTokenHash: string;
      readonly refreshTokenHash: string;
    }) => Promise<ExecutedCommand<AuthOtpVerificationProjection>>;
  readonly readRefreshContext: (tokenHash: string) => Promise<RefreshTokenContext | null>;
  readonly rotateSession: (command: CommandEnvelope<RotateAuthSessionPayload>,
    ids: AuthSessionRotationIds, hashes: {
      readonly currentRefreshTokenHash: string;
      readonly nextRefreshTokenHash: string;
      readonly nextAccessTokenHash: string;
    }) => Promise<ExecutedCommand<AuthSessionProjection>>;
  readonly revokeSession: (command: CommandEnvelope<RevokeAuthSessionPayload>,
    ids: AuthCommandEffectIds) =>
    Promise<ExecutedCommand<{ readonly familyId: string; readonly state: 'REVOKED' }>>;
}

function idempotencyKey(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new InvalidCommandEnvelopeError('Idempotency-Key');
  return normalized;
}

function systemCommand<TPayload>(input: {
  readonly commandType: string;
  readonly idempotencyKey: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly expectedVersion: number;
  readonly payload: TPayload;
  readonly request: FastifyRequest;
}): CommandEnvelope<TPayload> {
  const context = requestContext(input.request);
  return {
    commandId: newUuidV7(), commandType: input.commandType,
    idempotencyKey: input.idempotencyKey,
    actor: { type: 'SYSTEM', id: null, roles: [], scopeIds: [] },
    aggregateType: input.aggregateType, aggregateId: input.aggregateId,
    expectedVersion: input.expectedVersion, correlationId: context.correlationId,
    causationId: context.causationId, requestId: context.requestId,
    source: 'api', payloadVersion: 1, payload: input.payload,
  };
}

function challengeData(challenge: AuthOtpChallengeProjection) {
  return { challengeId: challenge.challengeId, transport: challenge.transport,
    state: challenge.state, attempts: challenge.attempts, maxAttempts: 5 as const,
    expiresAt: challenge.expiresAt, version: challenge.version };
}

function tokens(
  projection: AuthSessionProjection,
  accessToken: string,
  refreshToken: string | null,
): AuthSessionTokens {
  return { userId: projection.userId, familyId: projection.familyId,
    generation: projection.generation, tokenType: 'Bearer', accessToken, refreshToken,
    accessExpiresAt: projection.accessExpiresAt,
    refreshExpiresAt: projection.refreshExpiresAt, accessMode: 'FULL' };
}

const refreshCookieName = 'molokh_refresh';
const refreshCookieMaxAgeSeconds = 30 * 24 * 60 * 60;

function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() === name) {
      const value = pair.slice(separator + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

function setRefreshCookie(
  reply: FastifyReply,
  token: string,
  secure: boolean,
): void {
  const attributes = [
    `${refreshCookieName}=${token}`,
    'Path=/api/v1/auth',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${refreshCookieMaxAgeSeconds}`,
    ...(secure ? ['Secure'] : []),
  ];
  void reply.header('set-cookie', attributes.join('; '));
}

function clearRefreshCookie(reply: FastifyReply, secure: boolean): void {
  const attributes = [
    `${refreshCookieName}=`,
    'Path=/api/v1/auth',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    ...(secure ? ['Secure'] : []),
  ];
  void reply.header('set-cookie', attributes.join('; '));
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  dependencies: AuthRouteDependencies,
): Promise<void> {
  app.post<{ Headers: IdempotentHeaders; Body: RequestAuthOtpBody }>(
    '/api/v1/auth/otp/request', {
      schema: { operationId: 'requestAuthOtp', body: RequestAuthOtpBodySchema,
        response: { 202: RequestAuthOtpResponseSchema, 400: ApiErrorSchema,
          409: ApiErrorSchema, 429: ApiErrorSchema } },
      config: { rateLimit: { max: 10, timeWindow: 60_000 } },
    }, async (request, reply): Promise<RequestAuthOtpResponse | undefined> => {
      const key = idempotencyKey(request.headers['idempotency-key']);
      const challengeId = deriveUuid(dependencies.secret, 'otp-challenge-v1',
        [request.body.phoneE164, key]);
      const code = deriveOtpCode(dependencies.secret, request.body.phoneE164, key);
      const executed = await dependencies.requestOtp(systemCommand({
        commandType: 'REQUEST_AUTH_OTP', idempotencyKey: key,
        aggregateType: 'AuthOtpChallenge', aggregateId: challengeId, expectedVersion: 0,
        request, payload: { phoneE164: request.body.phoneE164,
          transport: request.body.transport,
          localDevelopmentTransportEnabled: dependencies.localDevelopmentTransportEnabled,
          smsTransportAvailable: dependencies.smsTransportAvailable,
          smsOptedIn: request.body.smsOptIn },
      }), { eventId: newUuidV7(), auditId: newUuidV7(),
        outboxMessageId: newUuidV7(), expiredChallengeEventId: newUuidV7() },
      otpVerifierHash(dependencies.secret, challengeId, code));
      const context = requestContext(request);
      const response: RequestAuthOtpResponse = { data: {
        ...challengeData(executed.response),
        ...(dependencies.localDevelopmentTransportEnabled
          && request.body.transport === 'LOCAL_DEVELOPMENT' ? { developmentCode: code } : {}),
      }, meta: { requestId: context.requestId, eventId: executed.eventId,
        replayed: executed.replayed } };
      await reply.status(202).send(response);
      return;
    });

  app.post<{ Headers: IdempotentHeaders; Body: VerifyAuthOtpBody }>(
    '/api/v1/auth/otp/verify', {
      schema: { operationId: 'verifyAuthOtp', body: VerifyAuthOtpBodySchema,
        response: { 200: VerifyAuthOtpResponseSchema, 400: ApiErrorSchema,
          409: ApiErrorSchema, 429: ApiErrorSchema } },
      config: { rateLimit: { max: 20, timeWindow: 60_000 } },
    }, async (request, reply): Promise<VerifyAuthOtpResponse> => {
      const key = idempotencyKey(request.headers['idempotency-key']);
      const accessToken = deriveOpaqueToken(dependencies.secret, 'access-token-v1',
        [request.body.challengeId, key]);
      const refreshToken = deriveOpaqueToken(dependencies.secret, 'refresh-token-v1',
        [request.body.challengeId, key]);
      const sessionReference = deriveOpaqueToken(dependencies.secret, 'session-reference-v1',
        [request.body.challengeId, key]);
      const executed = await dependencies.verifyOtp(systemCommand({
        commandType: 'VERIFY_AUTH_OTP', idempotencyKey: key,
        aggregateType: 'AuthOtpChallenge', aggregateId: request.body.challengeId,
        expectedVersion: request.body.challengeVersion, request,
        payload: { challengeId: request.body.challengeId,
          deviceLabel: request.body.deviceLabel?.trim() ?? null },
      }), { eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7(),
        trustedSessionId: newUuidV7(), familyId: newUuidV7(),
        refreshTokenId: newUuidV7(), accessTokenId: newUuidV7(),
        sessionEventId: newUuidV7() }, {
        suppliedCodeVerifierHash: otpVerifierHash(dependencies.secret,
          request.body.challengeId, request.body.code),
        sessionReferenceHash: hashBearerToken(sessionReference),
        accessTokenHash: hashBearerToken(accessToken),
        refreshTokenHash: hashBearerToken(refreshToken),
      });
      if (executed.response.session && request.body.clientKind === 'WEB') {
        setRefreshCookie(reply, refreshToken, dependencies.secureCookies);
      }
      return { data: { outcome: executed.response.outcome,
        challenge: challengeData(executed.response.challenge),
        session: executed.response.session
          ? tokens(executed.response.session, accessToken,
            request.body.clientKind === 'NATIVE' ? refreshToken : null) : null },
      meta: { requestId: requestContext(request).requestId, eventId: executed.eventId,
        replayed: executed.replayed } };
    });

  app.post<{ Headers: IdempotentHeaders; Body: RefreshAuthSessionBody }>(
    '/api/v1/auth/refresh', {
      schema: { operationId: 'refreshAuthSession', body: RefreshAuthSessionBodySchema,
        response: { 200: AuthSessionResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 409: ApiErrorSchema, 429: ApiErrorSchema } },
      config: { rateLimit: { max: 30, timeWindow: 60_000 } },
    }, async (request, reply): Promise<AuthSessionResponse | undefined> => {
      const key = idempotencyKey(request.headers['idempotency-key']);
      const suppliedRefreshToken = request.body.clientKind === 'WEB'
        ? cookieValue(request.headers.cookie, refreshCookieName)
        : request.body.refreshToken ?? null;
      if (!suppliedRefreshToken) {
        await reply.status(401).send({ code: 'AUTH_REFRESH_INVALID',
          message: 'Refresh token is invalid or expired',
          requestId: requestContext(request).requestId });
        return;
      }
      const currentHash = hashBearerToken(suppliedRefreshToken);
      const refresh = await dependencies.readRefreshContext(currentHash);
      if (!refresh || refresh.familyState !== 'ACTIVE'
        || refresh.refreshTokenState === 'REVOKED'
        || refresh.refreshTokenState === 'EXPIRED') {
        await reply.status(401).send({ code: 'AUTH_REFRESH_INVALID',
          message: 'Refresh token is invalid or expired',
          requestId: requestContext(request).requestId });
        return;
      }
      const nextGeneration = refresh.generation + 1;
      const nextAccessToken = deriveOpaqueToken(dependencies.secret, 'access-token-v1',
        [refresh.familyId, String(nextGeneration), key]);
      const nextRefreshToken = deriveOpaqueToken(dependencies.secret, 'refresh-token-v1',
        [refresh.familyId, String(nextGeneration), key]);
      let executed: ExecutedCommand<AuthSessionProjection>;
      try {
        executed = await dependencies.rotateSession(systemCommand({
          commandType: 'ROTATE_AUTH_SESSION', idempotencyKey: key,
          aggregateType: 'AuthSessionFamily', aggregateId: refresh.familyId,
          expectedVersion: refresh.generation, request,
          payload: { familyId: refresh.familyId, refreshTokenId: refresh.refreshTokenId,
            generation: refresh.generation },
        }), { eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7(),
          refreshTokenId: newUuidV7(), accessTokenId: newUuidV7() }, {
          currentRefreshTokenHash: currentHash,
          nextRefreshTokenHash: hashBearerToken(nextRefreshToken),
          nextAccessTokenHash: hashBearerToken(nextAccessToken),
        });
      } catch (error) {
        if (!(error instanceof VersionConflictError)
          || refresh.refreshTokenState !== 'ROTATED') throw error;
        await dependencies.revokeSession(systemCommand({
          commandType: 'REVOKE_REUSED_AUTH_SESSION',
          idempotencyKey: `refresh-reuse:${key}`,
          aggregateType: 'AuthSessionFamily', aggregateId: refresh.familyId,
          expectedVersion: refresh.familyVersion, request,
          payload: { familyId: refresh.familyId, reason: 'REFRESH_REUSE' },
        }), { eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7() });
        throw new AuthSessionConflictError('AUTH_REFRESH_REUSE_DETECTED');
      }
      if (request.body.clientKind === 'WEB') {
        setRefreshCookie(reply, nextRefreshToken, dependencies.secureCookies);
      }
      return { data: tokens(executed.response, nextAccessToken,
        request.body.clientKind === 'NATIVE' ? nextRefreshToken : null),
        meta: { requestId: requestContext(request).requestId, eventId: executed.eventId,
          replayed: executed.replayed } };
    });

  app.post<{ Headers: IdempotentHeaders }>('/api/v1/auth/logout', {
    schema: { operationId: 'logoutAuthSession', response: {
      200: LogoutAuthSessionResponseSchema, 400: ApiErrorSchema,
      401: ApiErrorSchema, 409: ApiErrorSchema,
    } },
  }, async (request, reply): Promise<LogoutAuthSessionResponse | undefined> => {
    const authenticated = await dependencies.auth.authenticate(
      request.headers.authorization, 'SERVICE_RESPONSE');
    if (!authenticated?.familyId || authenticated.familyVersion === undefined) {
      await reply.status(401).send({ code: 'AUTH_SESSION_NOT_MANAGED',
        message: 'A managed authentication session is required',
        requestId: requestContext(request).requestId });
      return;
    }
    const key = idempotencyKey(request.headers['idempotency-key']);
    const executed = await dependencies.revokeSession(systemCommand({
      commandType: 'REVOKE_AUTH_SESSION', idempotencyKey: key,
      aggregateType: 'AuthSessionFamily', aggregateId: authenticated.familyId,
      expectedVersion: authenticated.familyVersion, request,
      payload: { familyId: authenticated.familyId, reason: 'LOGOUT' },
    }), { eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7() });
    clearRefreshCookie(reply, dependencies.secureCookies);
    return { data: executed.response, meta: { requestId: requestContext(request).requestId,
      eventId: executed.eventId, replayed: executed.replayed } };
  });
}
