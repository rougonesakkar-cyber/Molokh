import {
  ApiErrorSchema,
  CompetitionStatusResponseSchema,
  GenesisResponseBodySchema,
  GenesisResponseCommandResponseSchema,
  StatusQueueEntryCommandResponseSchema,
  type CompetitionStatusResponse,
  type GenesisResponseBody,
  type GenesisResponseCommandResponse,
  type StatusQueueEntryCommandResponse,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope } from '@molokh/core';
import type {
  CompetitionStatusProjection,
  ExecutedCommand,
  GenesisResponseEffectIds,
  GenesisResponsePayload,
  GenesisResponseProjection,
  StatusQueueEffectIds,
  StatusQueueReconfirmationEffectIds,
  StatusQueueEntryProjection,
  SubmitStatusQueueEntryPayload,
  ReconfirmStatusQueueEntryPayload,
  WithdrawStatusQueueEntryPayload,
} from '@molokh/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { idempotentUuidV7, newUuidV7 } from './uuid-v7.js';

interface StatusQueueHeaders {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}

interface CompetitionParams { readonly competitionId: string }
interface QueueEntryParams { readonly queueEntryId: string }
interface GenesisChallengeParams { readonly challengeId: string }

export interface StatusQueueRouteDependencies {
  readonly auth: AuthAdapter;
  readonly competitionId: string;
  readonly readCompetitionStatus: (
    competitionId: string,
    viewerUserId: string,
  ) => Promise<CompetitionStatusProjection | null>;
  readonly submitEntry: (
    command: CommandEnvelope<SubmitStatusQueueEntryPayload>,
    ids: StatusQueueEffectIds,
  ) => Promise<ExecutedCommand<StatusQueueEntryProjection>>;
  readonly withdrawEntry: (
    command: CommandEnvelope<WithdrawStatusQueueEntryPayload>,
    ids: StatusQueueEffectIds,
  ) => Promise<ExecutedCommand<StatusQueueEntryProjection>>;
  readonly reconfirmEntry: (
    command: CommandEnvelope<ReconfirmStatusQueueEntryPayload>,
    ids: StatusQueueReconfirmationEffectIds,
  ) => Promise<ExecutedCommand<StatusQueueEntryProjection>>;
  readonly respondToGenesis: (
    command: CommandEnvelope<GenesisResponsePayload>,
    decision: 'ACCEPT' | 'DECLINE',
    ids: GenesisResponseEffectIds,
  ) => Promise<ExecutedCommand<GenesisResponseProjection>>;
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

function unauthorized(request: FastifyRequest) {
  return {
    code: 'UNAUTHENTICATED',
    message: 'Authentication is required',
    requestId: requestContext(request).requestId,
  };
}

function commandEnvelope<TPayload>(input: {
  readonly actorUserId: string;
  readonly aggregateId: string;
  readonly commandType: string;
  readonly idempotencyKey: string;
  readonly expectedVersion: number;
  readonly payload: TPayload;
  readonly aggregateType?: 'ChallengeQueueEntry' | 'Challenge';
  readonly request: FastifyRequest;
}): CommandEnvelope<TPayload> {
  const context = requestContext(input.request);
  return {
    commandId: newUuidV7(),
    commandType: input.commandType,
    idempotencyKey: input.idempotencyKey,
    actor: { type: 'USER', id: input.actorUserId, roles: ['ATHLETE'], scopeIds: [] },
    aggregateType: input.aggregateType ?? 'ChallengeQueueEntry',
    aggregateId: input.aggregateId,
    expectedVersion: input.expectedVersion,
    correlationId: context.correlationId,
    causationId: context.causationId,
    requestId: context.requestId,
    source: 'api',
    payloadVersion: 1,
    payload: input.payload,
  };
}

function effectIds(): StatusQueueEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    challengeId: newUuidV7(),
    challengeEventId: newUuidV7(),
    serviceChatId: newUuidV7(),
    serviceChatEventId: newUuidV7(),
    rulesetSnapshotId: newUuidV7(),
    acknowledgmentId: newUuidV7(),
    pairedQueueEventId: newUuidV7(),
    timerOutboxMessageId: newUuidV7(),
    staleQueueEventId: newUuidV7(),
    staleQueueOutboxMessageId: newUuidV7(),
    notificationOutboxMessageId: newUuidV7(),
    notificationIds: [newUuidV7(), newUuidV7()],
  };
}

function genesisEffectIds(): GenesisResponseEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    responseId: newUuidV7(),
    acknowledgmentId: newUuidV7(),
    obligationIds: [newUuidV7(), newUuidV7()],
    queueEventIds: [newUuidV7(), newUuidV7()],
    notificationOutboxMessageId: newUuidV7(),
    notificationIds: [newUuidV7(), newUuidV7()],
  };
}

function reconfirmationEffectIds(): StatusQueueReconfirmationEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    timerOutboxMessageId: newUuidV7(),
    notificationOutboxMessageId: newUuidV7(),
    notificationId: newUuidV7(),
  };
}

function commandResponse(
  executed: ExecutedCommand<StatusQueueEntryProjection>,
  requestId: string,
): StatusQueueEntryCommandResponse {
  return {
    data: executed.response,
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

export async function registerStatusQueueRoutes(
  app: FastifyInstance,
  dependencies: StatusQueueRouteDependencies,
): Promise<void> {
  app.get<{ Headers: StatusQueueHeaders }>(
    '/api/v1/me/competition',
    {
      schema: {
        operationId: 'readMyCompetitionStatus',
        response: {
          200: CompetitionStatusResponseSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<CompetitionStatusResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const competition = await dependencies.readCompetitionStatus(
        dependencies.competitionId,
        authenticated.userId,
      );
      if (!competition) {
        await reply.status(404).send({
          code: 'COMPETITION_NOT_FOUND',
          message: 'Competition was not found',
          requestId: requestContext(request).requestId,
        });
        return;
      }
      return {
        data: {
          ...competition,
          champion: competition.champion ? { ...competition.champion } : null,
          contender: competition.contender ? { ...competition.contender } : null,
          queue: competition.queue.map((entry) => ({ ...entry })),
          activeChallenge: competition.activeChallenge
            ? { ...competition.activeChallenge }
            : null,
          viewerGenesisAction: competition.viewerGenesisAction
            ? { ...competition.viewerGenesisAction }
            : null,
        },
        meta: { requestId: requestContext(request).requestId },
      };
    },
  );

  app.post<{ Headers: StatusQueueHeaders; Params: CompetitionParams }>(
    '/api/v1/competitions/:competitionId/queue-entries',
    {
      schema: {
        operationId: 'submitStatusQueueEntry',
        params: Type.Object(
          { competitionId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        response: {
          201: StatusQueueEntryCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredIdempotencyKey(request.headers['idempotency-key']);
      const version = expectedVersion(request.headers['if-match'], 0);
      if (version !== 0) throw new InvalidCommandEnvelopeError('If-Match');
      const queueEntryId = idempotentUuidV7('ChallengeQueueEntry', authenticated.userId, key);
      const executed = await dependencies.submitEntry(
        commandEnvelope({
          actorUserId: authenticated.userId,
          aggregateId: queueEntryId,
          commandType: 'SUBMIT_STATUS_QUEUE_ENTRY',
          idempotencyKey: key,
          expectedVersion: 0,
          payload: { competitionId: request.params.competitionId },
          request,
        }),
        effectIds(),
      );
      await reply.status(executed.responseStatus).send(
        commandResponse(executed, requestContext(request).requestId),
      );
    },
  );

  app.post<{ Headers: StatusQueueHeaders; Params: QueueEntryParams }>(
    '/api/v1/queue-entries/:queueEntryId/withdraw',
    {
      schema: {
        operationId: 'withdrawStatusQueueEntry',
        params: Type.Object(
          { queueEntryId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        response: {
          200: StatusQueueEntryCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredIdempotencyKey(request.headers['idempotency-key']);
      const executed = await dependencies.withdrawEntry(
        commandEnvelope({
          actorUserId: authenticated.userId,
          aggregateId: request.params.queueEntryId,
          commandType: 'WITHDRAW_STATUS_QUEUE_ENTRY',
          idempotencyKey: key,
          expectedVersion: expectedVersion(request.headers['if-match'], 1),
          payload: { queueEntryId: request.params.queueEntryId },
          request,
        }),
        effectIds(),
      );
      await reply.status(executed.responseStatus).send(
        commandResponse(executed, requestContext(request).requestId),
      );
    },
  );

  app.post<{ Headers: StatusQueueHeaders; Params: QueueEntryParams }>(
    '/api/v1/queue-entries/:queueEntryId/reconfirm',
    {
      schema: {
        operationId: 'reconfirmStatusQueueEntry',
        params: Type.Object(
          { queueEntryId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        response: {
          200: StatusQueueEntryCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredIdempotencyKey(request.headers['idempotency-key']);
      const executed = await dependencies.reconfirmEntry(
        commandEnvelope({
          actorUserId: authenticated.userId,
          aggregateId: request.params.queueEntryId,
          commandType: 'RECONFIRM_STATUS_QUEUE_ENTRY',
          idempotencyKey: key,
          expectedVersion: expectedVersion(request.headers['if-match'], 1),
          payload: { queueEntryId: request.params.queueEntryId },
          request,
        }),
        reconfirmationEffectIds(),
      );
      await reply.status(executed.responseStatus).send(
        commandResponse(executed, requestContext(request).requestId),
      );
    },
  );

  const registerGenesisResponse = (
    action: 'accept' | 'decline',
    decision: 'ACCEPT' | 'DECLINE',
  ) => app.post<{
    Headers: StatusQueueHeaders;
    Params: GenesisChallengeParams;
    Body: GenesisResponseBody;
  }>(
    `/api/v1/genesis-challenges/:challengeId/${action}`,
    {
      schema: {
        operationId: `${action}GenesisChallenge`,
        params: Type.Object(
          { challengeId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: GenesisResponseBodySchema,
        response: {
          200: GenesisResponseCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const key = requiredIdempotencyKey(request.headers['idempotency-key']);
      const executed = await dependencies.respondToGenesis(
        commandEnvelope({
          actorUserId: authenticated.userId,
          aggregateId: request.params.challengeId,
          aggregateType: 'Challenge',
          commandType: `${decision}_GENESIS_CHALLENGE`,
          idempotencyKey: key,
          expectedVersion: expectedVersion(request.headers['if-match'], 1),
          payload: {
            challengeId: request.params.challengeId,
            ...(request.body.explicitRulesetAcknowledged === undefined
              ? {}
              : { explicitRulesetAcknowledged: request.body.explicitRulesetAcknowledged }),
          },
          request,
        }),
        decision,
        genesisEffectIds(),
      );
      const response: GenesisResponseCommandResponse = {
        data: executed.response,
        meta: {
          requestId: requestContext(request).requestId,
          eventId: executed.eventId,
          replayed: executed.replayed,
        },
      };
      await reply.status(executed.responseStatus).send(response);
    },
  );

  registerGenesisResponse('accept', 'ACCEPT');
  registerGenesisResponse('decline', 'DECLINE');
}
