import {
  ApiErrorSchema,
  CompleteEvidenceUploadBodySchema,
  EvidenceAttachmentCommandResponseSchema,
  EvidenceAttachmentListResponseSchema,
  EvidenceOriginalAccessResponseSchema,
  EvidenceUploadIntentBodySchema,
  EvidenceUploadTicketResponseSchema,
  type CompleteEvidenceUploadBody,
  type EvidenceAttachmentCommandResponse,
  type EvidenceAttachmentListResponse,
  type EvidenceOriginalAccessResponse,
  type EvidenceUploadIntentBody,
  type EvidenceUploadTicketResponse,
} from '@molokh/contracts';
import {
  InvalidCommandEnvelopeError,
  normalizeEvidenceSubmission,
  type CommandEnvelope,
  type EvidenceScopeType,
} from '@molokh/core';
import type {
  EvidenceAttachmentProjection,
  EvidenceEffectIds,
  EvidenceOriginalAccess,
  EvidenceUploadPreparation,
  ExecutedCommand,
  SubmitEvidenceAttachmentPayload,
} from '@molokh/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import {
  EvidenceMediaUnavailableError,
  type EvidenceMediaPort,
  type EvidenceUploadIntentRequest,
} from './evidence-media.js';
import { requestContext } from './request-context.js';
import { idempotentResourceId, newUuidV7 } from './uuid-v7.js';

interface Headers { readonly authorization?: string; readonly 'idempotency-key'?: string; readonly 'if-match'?: string }
interface ScopeParams { readonly scopeType: EvidenceScopeType; readonly scopeId: string }
interface AttachmentParams extends ScopeParams { readonly attachmentId: string }

export interface EvidenceRouteDependencies {
  readonly auth: AuthAdapter;
  readonly media: EvidenceMediaPort;
  readonly prepare: (scopeType: EvidenceScopeType, scopeId: string,
    actorUserId: string) => Promise<EvidenceUploadPreparation>;
  readonly submit: (command: CommandEnvelope<SubmitEvidenceAttachmentPayload>,
    ids: EvidenceEffectIds) => Promise<ExecutedCommand<EvidenceAttachmentProjection>>;
  readonly list: (scopeType: EvidenceScopeType, scopeId: string,
    viewerUserId: string) => Promise<readonly EvidenceAttachmentProjection[]>;
  readonly readOriginalAccess: (scopeType: EvidenceScopeType, scopeId: string,
    attachmentId: string, viewerUserId: string) => Promise<EvidenceOriginalAccess>;
}

const scopeParamsSchema = Type.Object({
  scopeType: Type.Union([Type.Literal('RESULT_APPEAL'), Type.Literal('SAFETY_CASE')]),
  scopeId: Type.String({ format: 'uuid' }),
}, { additionalProperties: false });
const attachmentParamsSchema = Type.Object({
  scopeType: Type.Union([Type.Literal('RESULT_APPEAL'), Type.Literal('SAFETY_CASE')]),
  scopeId: Type.String({ format: 'uuid' }), attachmentId: Type.String({ format: 'uuid' }),
}, { additionalProperties: false });

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
function ids(): EvidenceEffectIds {
  return { eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7() };
}
async function unavailable(reply: FastifyReply,
  request: FastifyRequest, error: EvidenceMediaUnavailableError): Promise<void> {
  await reply.status(503).send({ code: error.code, message: error.message,
    requestId: requestContext(request).requestId });
}

export async function registerEvidenceRoutes(
  app: FastifyInstance, dependencies: EvidenceRouteDependencies,
): Promise<void> {
  app.post<{ Headers: Headers; Params: ScopeParams; Body: EvidenceUploadIntentBody }>(
    '/api/v1/evidence/:scopeType/:scopeId/upload-intents', {
      schema: { operationId: 'requestEvidenceUpload', params: scopeParamsSchema,
        body: EvidenceUploadIntentBodySchema,
        response: { 201: EvidenceUploadTicketResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema,
          422: ApiErrorSchema, 503: ApiErrorSchema } },
      config: { rateLimit: { max: 10, timeWindow: 60_000 } },
    }, async (request, reply): Promise<EvidenceUploadTicketResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
      const operationKey = key(request.headers['idempotency-key']);
      const preparation = await dependencies.prepare(request.params.scopeType,
        request.params.scopeId, authenticated.userId);
      normalizeEvidenceSubmission({ declaredMimeType: request.body.declaredMimeType,
        detectedMimeType: request.body.declaredMimeType, sizeBytes: request.body.sizeBytes,
        durationSeconds: request.body.durationSeconds, existingCount: preparation.attachmentCount,
        existingAggregateBytes: preparation.aggregateSizeBytes });
      const attachmentId = idempotentResourceId('EvidenceAttachment',
        request.params.scopeId, `${authenticated.userId}:${operationKey}`);
      const intent: EvidenceUploadIntentRequest = { attachmentId,
        scopeType: request.params.scopeType, scopeId: request.params.scopeId,
        submitterUserId: authenticated.userId, idempotencyKey: operationKey,
        fileName: request.body.fileName, declaredMimeType: request.body.declaredMimeType,
        sizeBytes: request.body.sizeBytes, durationSeconds: request.body.durationSeconds,
        sha256: request.body.sha256 };
      try {
        const ticket = await dependencies.media.beginUpload(intent);
        void reply.status(201);
        return { data: { attachmentId, ...ticket, scanPolicyVersion: 'evidence-scan-v1',
          scopeVersion: preparation.scopeVersion },
          meta: { requestId: requestContext(request).requestId } };
      } catch (error) {
        if (!(error instanceof EvidenceMediaUnavailableError)) throw error;
        await unavailable(reply, request, error); return;
      }
    });

  app.post<{ Headers: Headers; Params: AttachmentParams; Body: CompleteEvidenceUploadBody }>(
    '/api/v1/evidence/:scopeType/:scopeId/attachments/:attachmentId/complete', {
      schema: { operationId: 'completeEvidenceUpload',
        params: attachmentParamsSchema, body: CompleteEvidenceUploadBodySchema,
        response: { 201: EvidenceAttachmentCommandResponseSchema, 400: ApiErrorSchema,
          401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema,
          422: ApiErrorSchema, 503: ApiErrorSchema } },
    }, async (request, reply): Promise<EvidenceAttachmentCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
      let object;
      try {
        object = await dependencies.media.completeUpload({ attachmentId: request.params.attachmentId,
          scopeType: request.params.scopeType, scopeId: request.params.scopeId,
          submitterUserId: authenticated.userId, uploadReceiptId: request.body.uploadReceiptId });
      } catch (error) {
        if (!(error instanceof EvidenceMediaUnavailableError)) throw error;
        await unavailable(reply, request, error); return;
      }
      const context = requestContext(request);
      const executed = await dependencies.submit({ commandId: newUuidV7(),
        commandType: 'SUBMIT_EVIDENCE_ATTACHMENT', idempotencyKey: key(request.headers['idempotency-key']),
        actor: { type: 'USER', id: authenticated.userId, roles: [], scopeIds: [] },
        aggregateType: 'EvidenceAttachment', aggregateId: request.params.attachmentId,
        expectedVersion: 0, correlationId: context.correlationId,
        causationId: context.causationId, requestId: context.requestId,
        source: 'api', payloadVersion: 1,
        payload: { scopeType: request.params.scopeType, scopeId: request.params.scopeId,
          expectedScopeVersion: version(request.headers['if-match']), object },
      }, ids());
      void reply.status(executed.responseStatus);
      return { data: executed.response, meta: { requestId: context.requestId,
        eventId: executed.eventId, replayed: executed.replayed } };
    });

  app.get<{ Headers: Headers; Params: ScopeParams }>(
    '/api/v1/evidence/:scopeType/:scopeId/attachments', {
      schema: { operationId: 'listEvidenceAttachments', params: scopeParamsSchema,
        response: { 200: EvidenceAttachmentListResponseSchema, 401: ApiErrorSchema,
          403: ApiErrorSchema } },
    }, async (request, reply): Promise<EvidenceAttachmentListResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
      return { data: [...await dependencies.list(request.params.scopeType,
        request.params.scopeId, authenticated.userId)],
        meta: { requestId: requestContext(request).requestId } };
    });

  app.get<{ Headers: Headers; Params: AttachmentParams }>(
    '/api/v1/evidence/:scopeType/:scopeId/attachments/:attachmentId/original', {
      schema: { operationId: 'accessEvidenceOriginal',
        params: attachmentParamsSchema,
        response: { 200: EvidenceOriginalAccessResponseSchema, 401: ApiErrorSchema,
          403: ApiErrorSchema, 404: ApiErrorSchema, 503: ApiErrorSchema } },
    }, async (request, reply): Promise<EvidenceOriginalAccessResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) { await reply.status(401).send(unauthorized(request)); return; }
      const access = await dependencies.readOriginalAccess(request.params.scopeType,
        request.params.scopeId, request.params.attachmentId, authenticated.userId);
      try {
        const ticket = await dependencies.media.createOriginalAccess({
          attachmentId: access.attachmentId, objectReference: access.objectReference,
          encryptionKeyReference: access.encryptionKeyReference,
          viewerUserId: authenticated.userId });
        return { data: { ...ticket, fileName: access.fileName, mimeType: access.mimeType },
          meta: { requestId: requestContext(request).requestId } };
      } catch (error) {
        if (!(error instanceof EvidenceMediaUnavailableError)) throw error;
        await unavailable(reply, request, error); return;
      }
    });
}
