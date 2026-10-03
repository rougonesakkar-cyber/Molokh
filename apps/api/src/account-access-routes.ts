import {
  AccountAccessListResponseSchema,
  AccountAccessReasonBodySchema,
  AccountAccessResponseSchema,
  ApiErrorSchema,
  CompleteVerifiedRecoveryBodySchema,
  ConfirmAccessIncidentBodySchema,
  DuplicateAccountListResponseSchema,
  DuplicateAccountResponseSchema,
  OpenDuplicateReviewBodySchema,
  RequestAccountRecoveryBodySchema,
  ResolveDuplicateReviewBodySchema,
  type AccountAccessListResponse,
  type AccountAccessReasonBody,
  type AccountAccessResponse,
  type CompleteVerifiedRecoveryBody,
  type ConfirmAccessIncidentBody,
  type DuplicateAccountListResponse,
  type DuplicateAccountResponse,
  type OpenDuplicateReviewBody,
  type RequestAccountRecoveryBody,
  type ResolveDuplicateReviewBody,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope } from '@molokh/core';
import type {
  AccountAccessCaseProjection,
  AccountAccessEffectIds,
  ApprovePhoneChangePayload,
  ClearDuplicateAccountReviewPayload,
  CompleteVerifiedRecoveryPayload,
  ConfirmAccessIncidentPayload,
  DuplicateAccountCaseProjection,
  DuplicateAccountEffectIds,
  ExecutedCommand,
  OpenDuplicateAccountReviewPayload,
  RejectAccountRecoveryPayload,
  RequestAccountRecoveryPayload,
  ResolveDuplicateAccountReviewPayload,
} from '@molokh/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { newUuidV7 } from './uuid-v7.js';

interface Headers {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}

export interface AccountAccessRouteDependencies {
  readonly auth: AuthAdapter;
  readonly centralAuth: AuthAdapter;
  readonly readMine: (userId: string) => Promise<AccountAccessCaseProjection | null>;
  readonly requestRecovery: (command: CommandEnvelope<RequestAccountRecoveryPayload>,
    ids: AccountAccessEffectIds) => Promise<ExecutedCommand<AccountAccessCaseProjection>>;
  readonly listRecovery: (centralUserId: string) =>
    Promise<readonly AccountAccessCaseProjection[]>;
  readonly approvePhone: (command: CommandEnvelope<ApprovePhoneChangePayload>,
    ids: AccountAccessEffectIds) => Promise<ExecutedCommand<AccountAccessCaseProjection>>;
  readonly completeVerified: (command: CommandEnvelope<CompleteVerifiedRecoveryPayload>,
    ids: AccountAccessEffectIds) => Promise<ExecutedCommand<AccountAccessCaseProjection>>;
  readonly rejectRecovery: (command: CommandEnvelope<RejectAccountRecoveryPayload>,
    ids: AccountAccessEffectIds) => Promise<ExecutedCommand<AccountAccessCaseProjection>>;
  readonly confirmIncident: (command: CommandEnvelope<ConfirmAccessIncidentPayload>,
    ids: AccountAccessEffectIds) => Promise<ExecutedCommand<AccountAccessCaseProjection>>;
  readonly listDuplicates: (centralUserId: string) =>
    Promise<readonly DuplicateAccountCaseProjection[]>;
  readonly openDuplicate: (command: CommandEnvelope<OpenDuplicateAccountReviewPayload>,
    ids: DuplicateAccountEffectIds) => Promise<ExecutedCommand<DuplicateAccountCaseProjection>>;
  readonly clearDuplicate: (command: CommandEnvelope<ClearDuplicateAccountReviewPayload>,
    ids: DuplicateAccountEffectIds) => Promise<ExecutedCommand<DuplicateAccountCaseProjection>>;
  readonly resolveDuplicate: (command: CommandEnvelope<ResolveDuplicateAccountReviewPayload>,
    ids: DuplicateAccountEffectIds) => Promise<ExecutedCommand<DuplicateAccountCaseProjection>>;
}

function unauthorized(request: FastifyRequest) {
  return { code: 'UNAUTHENTICATED', message: 'Authentication is required',
    requestId: requestContext(request).requestId };
}
function key(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new InvalidCommandEnvelopeError('Idempotency-Key');
  return normalized;
}
function version(value: string | undefined): number {
  const parsed = Number(value?.trim().match(/^"?(\d+)"?$/)?.[1]);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new InvalidCommandEnvelopeError('If-Match');
  return parsed;
}
function centralActor(userId: string) {
  return { type: 'USER' as const, id: userId, roles: ['CENTRAL_ADMIN'], scopeIds: [] };
}
function accessResponse(executed: ExecutedCommand<AccountAccessCaseProjection>, requestId: string):
AccountAccessResponse {
  return { data: executed.response as AccountAccessResponse['data'],
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed } };
}
function duplicateResponse(executed: ExecutedCommand<DuplicateAccountCaseProjection>,
  requestId: string): DuplicateAccountResponse {
  return { data: executed.response as DuplicateAccountResponse['data'],
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed } };
}

export async function registerAccountAccessRoutes(app: FastifyInstance,
  dependencies: AccountAccessRouteDependencies): Promise<void> {
  app.get<{ Headers: Headers }>('/api/v1/me/account-access', {
    schema: { operationId: 'readMyAccountAccess', response: {
      200: AccountAccessResponseSchema, 401: ApiErrorSchema,
    } },
  }, async (request, reply): Promise<AccountAccessResponse | undefined> => {
    const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
    if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
    return { data: await dependencies.readMine(authenticated.userId) as AccountAccessResponse['data'],
      meta: { requestId: requestContext(request).requestId } };
  });

  app.post<{ Headers: Headers; Body: RequestAccountRecoveryBody }>(
    '/api/v1/me/recovery-cases', {
      schema: { operationId: 'requestAccountRecovery', body: RequestAccountRecoveryBodySchema,
        response: { 202: AccountAccessResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 409: ApiErrorSchema } },
    }, async (request, reply): Promise<AccountAccessResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
      const context = requestContext(request);
      const caseId = newUuidV7();
      const executed = await dependencies.requestRecovery({
        commandId: newUuidV7(), commandType: 'REQUEST_ACCOUNT_RECOVERY',
        idempotencyKey: key(request.headers['idempotency-key']),
        actor: { type: 'USER', id: authenticated.userId, roles: ['ATHLETE'], scopeIds: [] },
        aggregateType: 'AccountAccessCase', aggregateId: caseId, expectedVersion: 0,
        correlationId: context.correlationId, causationId: context.causationId,
        requestId: context.requestId, source: 'api', payloadVersion: 1,
        payload: { userId: authenticated.userId, ...request.body },
      }, { eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7() });
      await reply.status(executed.responseStatus).send(accessResponse(executed, context.requestId));
    });

  app.get<{ Headers: Headers }>('/api/v1/central/account-recovery-cases', {
    schema: { operationId: 'listAccountRecoveryCases', response: {
      200: AccountAccessListResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
    } },
  }, async (request, reply): Promise<AccountAccessListResponse | undefined> => {
    const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
    if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
    const data = await dependencies.listRecovery(authenticated.userId);
    return { data: data as AccountAccessListResponse['data'],
      meta: { requestId: requestContext(request).requestId } };
  });

  const caseParams = Type.Object({ caseId: Type.String({ format: 'uuid' }) },
    { additionalProperties: false });
  const centralAccessCommand = async <TPayload, TBody>(request: FastifyRequest<{
    Headers: Headers; Params: { caseId: string }; Body: TBody }>,
  dependency: (command: CommandEnvelope<TPayload>, ids: AccountAccessEffectIds) =>
    Promise<ExecutedCommand<AccountAccessCaseProjection>>,
  commandType: string, payload: TPayload, extraIds: Partial<AccountAccessEffectIds> = {}) => {
    const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
    if (!authenticated) return null;
    const context = requestContext(request);
    const executed = await dependency({ commandId: newUuidV7(), commandType,
      idempotencyKey: key(request.headers['idempotency-key']), actor: centralActor(authenticated.userId),
      aggregateType: 'AccountAccessCase', aggregateId: request.params.caseId,
      expectedVersion: version(request.headers['if-match']), correlationId: context.correlationId,
      causationId: context.causationId, requestId: context.requestId, source: 'admin',
      payloadVersion: 1, payload }, { eventId: newUuidV7(), auditId: newUuidV7(),
      outboxMessageId: newUuidV7(), ...extraIds });
    return accessResponse(executed, context.requestId);
  };

  app.post<{ Headers: Headers; Params: { caseId: string }; Body: AccountAccessReasonBody }>(
    '/api/v1/central/account-recovery-cases/:caseId/approve-phone', {
      schema: { operationId: 'approveRecoveryPhoneChange', params: caseParams,
        body: AccountAccessReasonBodySchema, response: { 200: AccountAccessResponseSchema,
          400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema } },
    }, async (request, reply) => {
      const response = await centralAccessCommand(request, dependencies.approvePhone,
        'APPROVE_PHONE_CHANGE', { caseId: request.params.caseId, reason: request.body.reason },
        { sensitiveHoldId: newUuidV7(), userEventId: newUuidV7() });
      if (!response) { await reply.status(401).send(unauthorized(request)); return; }
      return response;
    });

  app.post<{ Headers: Headers; Params: { caseId: string };
    Body: CompleteVerifiedRecoveryBody }>(
    '/api/v1/central/account-recovery-cases/:caseId/complete-verified', {
      schema: { operationId: 'completeVerifiedRecovery', params: caseParams,
        body: CompleteVerifiedRecoveryBodySchema, response: { 200: AccountAccessResponseSchema,
          400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema } },
    }, async (request, reply) => {
      const response = await centralAccessCommand(request, dependencies.completeVerified,
        'COMPLETE_VERIFIED_RECOVERY', { caseId: request.params.caseId,
          verifiedRouteSucceeded: request.body.verifiedRouteSucceeded });
      if (!response) { await reply.status(401).send(unauthorized(request)); return; }
      return response;
    });

  app.post<{ Headers: Headers; Params: { caseId: string }; Body: AccountAccessReasonBody }>(
    '/api/v1/central/account-recovery-cases/:caseId/reject', {
      schema: { operationId: 'rejectAccountRecovery', params: caseParams,
        body: AccountAccessReasonBodySchema, response: { 200: AccountAccessResponseSchema,
          400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema } },
    }, async (request, reply) => {
      const response = await centralAccessCommand(request, dependencies.rejectRecovery,
        'REJECT_RECOVERY', { caseId: request.params.caseId, reason: request.body.reason });
      if (!response) { await reply.status(401).send(unauthorized(request)); return; }
      return response;
    });

  app.post<{ Headers: Headers; Params: { caseId: string }; Body: ConfirmAccessIncidentBody }>(
    '/api/v1/central/account-recovery-cases/:caseId/confirm-incident', {
      schema: { operationId: 'confirmAccountAccessIncident', params: caseParams,
        body: ConfirmAccessIncidentBodySchema, response: { 200: AccountAccessResponseSchema,
          400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema } },
    }, async (request, reply) => {
      const response = await centralAccessCommand(request, dependencies.confirmIncident,
        'CONFIRM_ACCESS_INCIDENT', { caseId: request.params.caseId, ...request.body });
      if (!response) { await reply.status(401).send(unauthorized(request)); return; }
      return response;
    });

  app.get<{ Headers: Headers }>('/api/v1/central/duplicate-account-cases', {
    schema: { operationId: 'listDuplicateAccountCases', response: {
      200: DuplicateAccountListResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema,
    } },
  }, async (request, reply): Promise<DuplicateAccountListResponse | undefined> => {
    const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
    if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
    const data = await dependencies.listDuplicates(authenticated.userId);
    return { data: data as DuplicateAccountListResponse['data'],
      meta: { requestId: requestContext(request).requestId } };
  });

  app.post<{ Headers: Headers; Body: OpenDuplicateReviewBody }>(
    '/api/v1/central/duplicate-account-cases', {
      schema: { operationId: 'openDuplicateAccountReview', body: OpenDuplicateReviewBodySchema,
        response: { 201: DuplicateAccountResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema } },
    }, async (request, reply): Promise<DuplicateAccountResponse | undefined> => {
      const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
      if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
      const context = requestContext(request);
      const caseId = newUuidV7();
      const executed = await dependencies.openDuplicate({ commandId: newUuidV7(),
        commandType: 'OPEN_DUPLICATE_REVIEW', idempotencyKey: key(request.headers['idempotency-key']),
        actor: centralActor(authenticated.userId), aggregateType: 'DuplicateAccountCase',
        aggregateId: caseId, expectedVersion: 0, correlationId: context.correlationId,
        causationId: context.causationId, requestId: context.requestId, source: 'admin',
        payloadVersion: 1, payload: request.body }, { eventId: newUuidV7(), auditId: newUuidV7(),
        outboxMessageId: newUuidV7(), newProcessHoldId: newUuidV7 });
      await reply.status(executed.responseStatus).send(duplicateResponse(executed, context.requestId));
    });

  app.post<{ Headers: Headers; Params: { caseId: string }; Body: AccountAccessReasonBody }>(
    '/api/v1/central/duplicate-account-cases/:caseId/clear', {
      schema: { operationId: 'clearDuplicateAccountReview', params: caseParams,
        body: AccountAccessReasonBodySchema, response: { 200: DuplicateAccountResponseSchema,
          400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema } },
    }, async (request, reply): Promise<DuplicateAccountResponse | undefined> => {
      const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
      if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
      const context = requestContext(request);
      const executed = await dependencies.clearDuplicate({ commandId: newUuidV7(),
        commandType: 'CLEAR_DUPLICATE_SIGNAL', idempotencyKey: key(request.headers['idempotency-key']),
        actor: centralActor(authenticated.userId), aggregateType: 'DuplicateAccountCase',
        aggregateId: request.params.caseId, expectedVersion: version(request.headers['if-match']),
        correlationId: context.correlationId, causationId: context.causationId,
        requestId: context.requestId, source: 'admin', payloadVersion: 1,
        payload: { caseId: request.params.caseId, reason: request.body.reason } },
      { eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7() });
      return duplicateResponse(executed, context.requestId);
    });

  app.post<{ Headers: Headers; Params: { caseId: string }; Body: ResolveDuplicateReviewBody }>(
    '/api/v1/central/duplicate-account-cases/:caseId/resolve', {
      schema: { operationId: 'resolveDuplicateAccountReview', params: caseParams,
        body: ResolveDuplicateReviewBodySchema, response: { 200: DuplicateAccountResponseSchema,
          400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema } },
    }, async (request, reply): Promise<DuplicateAccountResponse | undefined> => {
      const authenticated = await dependencies.centralAuth.authenticate(request.headers.authorization);
      if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
      const context = requestContext(request);
      const executed = await dependencies.resolveDuplicate({ commandId: newUuidV7(),
        commandType: 'RESOLVE_DUPLICATE', idempotencyKey: key(request.headers['idempotency-key']),
        actor: centralActor(authenticated.userId), aggregateType: 'DuplicateAccountCase',
        aggregateId: request.params.caseId, expectedVersion: version(request.headers['if-match']),
        correlationId: context.correlationId, causationId: context.causationId,
        requestId: context.requestId, source: 'admin', payloadVersion: 1,
        payload: { caseId: request.params.caseId, ...request.body } },
      { eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7(),
        newAliasId: newUuidV7, newUserEventId: newUuidV7 });
      return duplicateResponse(executed, context.requestId);
    });
}
