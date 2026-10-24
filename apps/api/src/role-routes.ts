import {
  InvalidCommandEnvelopeError,
  type CommandEnvelope,
  type RoleGrantProjection,
} from '@molokh/core';
import {
  ApiErrorSchema,
  AppointGymAdminBodySchema,
  AuthorizeGuestCoachBodySchema,
  ChangePrimaryAdminBodySchema,
  CoachInviteBodySchema,
  PendingCoachInviteListResponseSchema,
  RoleGrantCommandResponseSchema,
  PrimaryAdminCommandResponseSchema,
  VenueRoleSummaryResponseSchema,
  VerifyVenueBodySchema,
  VenueVerificationCommandResponseSchema,
  type AppointGymAdminBody,
  type AuthorizeGuestCoachBody,
  type ChangePrimaryAdminBody,
  type CoachInviteBody,
  type PendingCoachInviteListResponse,
  type RoleGrantCommandResponse,
  type PrimaryAdminCommandResponse,
  type VenueRoleSummaryResponse,
  type VerifyVenueBody,
  type VenueVerificationCommandResponse,
} from '@molokh/contracts';
import type {
  AcceptCoachInvitePayload,
  AppointGymAdminPayload,
  AuthorizeGuestCoachPayload,
  ChangePrimaryAdminPayload,
  ExecutedCommand,
  InviteCoachPayload,
  RoleGrantEffectIds,
  PrimaryAdminEffectIds,
  PrimaryAdminProjection,
  VenueRoleSummaryProjection,
  VerifyVenuePayload,
  VenueVerificationEffectIds,
  VenueVerificationProjection,
} from '@molokh/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { idempotentResourceId, newUuidV7 } from './uuid-v7.js';

const coachInvitationTtlHours = 72;

interface RoleHeaders {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}

interface CommunityParams {
  readonly communityId: string;
}

interface GrantParams {
  readonly grantId: string;
}

interface SessionParams {
  readonly sessionId: string;
}

export interface RoleRouteDependencies {
  readonly operatorAuth: AuthAdapter;
  readonly userAuth: AuthAdapter;
  readonly inviteCoach: (
    command: CommandEnvelope<InviteCoachPayload>,
    ids: RoleGrantEffectIds,
  ) => Promise<ExecutedCommand<RoleGrantProjection>>;
  readonly acceptCoachInvite: (
    command: CommandEnvelope<AcceptCoachInvitePayload>,
    ids: RoleGrantEffectIds,
  ) => Promise<ExecutedCommand<RoleGrantProjection>>;
  readonly authorizeGuestCoach: (
    command: CommandEnvelope<AuthorizeGuestCoachPayload>,
    ids: RoleGrantEffectIds,
  ) => Promise<ExecutedCommand<RoleGrantProjection>>;
  readonly listPendingCoachInvites: (
    userId: string,
  ) => Promise<readonly RoleGrantProjection[]>;
  readonly appointGymAdmin: (
    command: CommandEnvelope<AppointGymAdminPayload>,
    ids: RoleGrantEffectIds,
  ) => Promise<ExecutedCommand<RoleGrantProjection>>;
  readonly changePrimaryAdmin: (
    command: CommandEnvelope<ChangePrimaryAdminPayload>,
    ids: PrimaryAdminEffectIds,
  ) => Promise<ExecutedCommand<PrimaryAdminProjection>>;
  readonly readVenueRoleSummary: (
    centralUserId: string,
    venueId: string,
  ) => Promise<VenueRoleSummaryProjection | null>;
  readonly verifyVenue: (
    command: CommandEnvelope<VerifyVenuePayload>,
    ids: VenueVerificationEffectIds,
  ) => Promise<ExecutedCommand<VenueVerificationProjection>>;
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

function expectedVersion(value: string | undefined, minimum = 1): number {
  const match = value?.trim().match(/^"?(\d+)"?$/);
  const version = match?.[1] ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(version) || version < minimum) {
    throw new InvalidCommandEnvelopeError('If-Match');
  }
  return version;
}

function primaryEffectIds(
  actorId: string,
  idempotencyKey: string,
): PrimaryAdminEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    primaryGrantId: idempotentResourceId(
      'PrimaryAdminRoleGrant',
      actorId,
      idempotencyKey,
    ),
    targetNotificationId: newUuidV7(),
    previousNotificationId: newUuidV7(),
  };
}

function effectIds(): RoleGrantEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    notificationId: newUuidV7(),
  };
}

function venueVerificationEffectIds(): VenueVerificationEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
  };
}

function commandResponse(
  executed: ExecutedCommand<RoleGrantProjection>,
  requestId: string,
): RoleGrantCommandResponse {
  return {
    data: { ...executed.response },
    meta: {
      requestId,
      eventId: executed.eventId,
      replayed: executed.replayed,
    },
  };
}

export async function registerRoleRoutes(
  app: FastifyInstance,
  dependencies: RoleRouteDependencies,
): Promise<void> {
  app.post<{
    Body: VerifyVenueBody;
    Headers: RoleHeaders;
    Params: { readonly venueId: string };
  }>(
    '/api/v1/central/venues/:venueId/verify',
    {
      schema: {
        operationId: 'verifyVenue',
        params: Type.Object({ venueId: Type.String({ format: 'uuid' }) }),
        body: VerifyVenueBodySchema,
        response: {
          200: VenueVerificationCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<VenueVerificationCommandResponse | undefined> => {
      const authenticated = await dependencies.operatorAuth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const command: CommandEnvelope<VerifyVenuePayload> = {
        commandId: newUuidV7(),
        commandType: 'VERIFY_VENUE',
        idempotencyKey: requiredIdempotencyKey(request.headers['idempotency-key']),
        actor: {
          type: 'USER',
          id: authenticated.userId,
          roles: ['CENTRAL_ADMIN'],
          scopeIds: [],
        },
        aggregateType: 'Venue',
        aggregateId: request.params.venueId,
        expectedVersion: expectedVersion(request.headers['if-match']),
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'admin',
        payloadVersion: 1,
        payload: {
          venueId: request.params.venueId,
          checklistVersion: request.body.checklistVersion,
          evidenceReference: request.body.evidenceReference,
          reasonCode: request.body.reasonCode,
        },
      };
      const executed = await dependencies.verifyVenue(
        command,
        venueVerificationEffectIds(),
      );
      return {
        data: { ...executed.response },
        meta: {
          requestId: context.requestId,
          eventId: executed.eventId,
          replayed: executed.replayed,
        },
      };
    },
  );

  app.post<{
    Body: AuthorizeGuestCoachBody;
    Headers: RoleHeaders;
    Params: SessionParams;
  }>(
    '/api/v1/sessions/:sessionId/guest-coach',
    {
      schema: {
        operationId: 'authorizeSessionGuestCoach',
        params: Type.Object({ sessionId: Type.String({ format: 'uuid' }) }),
        body: AuthorizeGuestCoachBodySchema,
        response: {
          201: RoleGrantCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.operatorAuth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const idempotencyKey = requiredIdempotencyKey(
        request.headers['idempotency-key'],
      );
      const grantId = idempotentResourceId(
        'GuestCoachRoleGrant', request.params.sessionId,
        `${authenticated.userId}:${idempotencyKey}`,
      );
      const command: CommandEnvelope<AuthorizeGuestCoachPayload> = {
        commandId: newUuidV7(),
        commandType: 'AUTHORIZE_GUEST_COACH',
        idempotencyKey,
        actor: { type: 'USER', id: authenticated.userId, roles: [], scopeIds: [] },
        aggregateType: 'RoleGrant', aggregateId: grantId,
        expectedVersion: expectedVersion(request.headers['if-match'], 0),
        correlationId: context.correlationId, causationId: context.causationId,
        requestId: context.requestId, source: 'admin', payloadVersion: 1,
        payload: {
          userId: request.body.coachUserId,
          sessionId: request.params.sessionId,
          reasonCode: request.body.reasonCode,
        },
      };
      const executed = await dependencies.authorizeGuestCoach(command, effectIds());
      await reply.status(201).send(commandResponse(executed, context.requestId));
    },
  );

  app.post<{
    Body: CoachInviteBody;
    Headers: RoleHeaders;
    Params: CommunityParams;
  }>(
    '/api/v1/communities/:communityId/coach-invites',
    {
      schema: {
        operationId: 'inviteCommunityCoach',
        params: Type.Object({ communityId: Type.String({ format: 'uuid' }) }),
        body: CoachInviteBodySchema,
        response: {
          201: RoleGrantCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.operatorAuth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const idempotencyKey = requiredIdempotencyKey(
        request.headers['idempotency-key'],
      );
      const grantId = idempotentResourceId(
        'CoachRoleGrant',
        authenticated.userId,
        idempotencyKey,
      );
      const command: CommandEnvelope<InviteCoachPayload> = {
        commandId: newUuidV7(),
        commandType: 'INVITE_COACH',
        idempotencyKey,
        actor: {
          type: 'USER',
          id: authenticated.userId,
          roles: [],
          scopeIds: [],
        },
        aggregateType: 'RoleGrant',
        aggregateId: grantId,
        expectedVersion: 0,
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'admin',
        payloadVersion: 1,
        payload: {
          userId: request.body.userId,
          communityId: request.params.communityId,
          reasonCode: request.body.reasonCode,
          invitationTtlHours: coachInvitationTtlHours,
        },
      };
      const executed = await dependencies.inviteCoach(command, effectIds());
      await reply.status(201).send(commandResponse(executed, context.requestId));
    },
  );

  app.get<{ Headers: RoleHeaders }>(
    '/api/v1/me/coach-invites',
    {
      schema: {
        operationId: 'listMyPendingCoachInvites',
        response: {
          200: PendingCoachInviteListResponseSchema,
          401: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<PendingCoachInviteListResponse | undefined> => {
      const authenticated = await dependencies.userAuth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const pending = await dependencies.listPendingCoachInvites(authenticated.userId);
      return {
        data: pending.map((grant) => ({ ...grant })),
        meta: { requestId: context.requestId },
      };
    },
  );

  app.post<{ Headers: RoleHeaders; Params: GrantParams }>(
    '/api/v1/me/coach-invites/:grantId/accept',
    {
      schema: {
        operationId: 'acceptMyCoachInvite',
        params: Type.Object({ grantId: Type.String({ format: 'uuid' }) }),
        response: {
          200: RoleGrantCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<RoleGrantCommandResponse | undefined> => {
      const authenticated = await dependencies.userAuth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const command: CommandEnvelope<AcceptCoachInvitePayload> = {
        commandId: newUuidV7(),
        commandType: 'ACCEPT_COACH_ROLE',
        idempotencyKey: requiredIdempotencyKey(request.headers['idempotency-key']),
        actor: {
          type: 'USER',
          id: authenticated.userId,
          roles: ['ATHLETE'],
          scopeIds: [],
        },
        aggregateType: 'RoleGrant',
        aggregateId: request.params.grantId,
        expectedVersion: expectedVersion(request.headers['if-match']),
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'api',
        payloadVersion: 1,
        payload: { userId: authenticated.userId },
      };
      const executed = await dependencies.acceptCoachInvite(command, effectIds());
      return commandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Body: AppointGymAdminBody;
    Headers: RoleHeaders;
    Params: { readonly venueId: string };
  }>(
    '/api/v1/central/venues/:venueId/admins',
    {
      schema: {
        operationId: 'appointVenueGymAdmin',
        params: Type.Object({ venueId: Type.String({ format: 'uuid' }) }),
        body: AppointGymAdminBodySchema,
        response: {
          201: RoleGrantCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<undefined> => {
      const authenticated = await dependencies.operatorAuth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const idempotencyKey = requiredIdempotencyKey(
        request.headers['idempotency-key'],
      );
      const grantId = idempotentResourceId(
        'GymAdminRoleGrant',
        authenticated.userId,
        idempotencyKey,
      );
      const command: CommandEnvelope<AppointGymAdminPayload> = {
        commandId: newUuidV7(),
        commandType: 'APPOINT_ADMIN',
        idempotencyKey,
        actor: { type: 'USER', id: authenticated.userId, roles: [], scopeIds: [] },
        aggregateType: 'RoleGrant',
        aggregateId: grantId,
        expectedVersion: 0,
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'admin',
        payloadVersion: 1,
        payload: {
          userId: request.body.userId,
          venueId: request.params.venueId,
          reasonCode: request.body.reasonCode,
        },
      };
      const executed = await dependencies.appointGymAdmin(command, effectIds());
      await reply.status(201).send(commandResponse(executed, context.requestId));
    },
  );

  app.get<{ Headers: RoleHeaders; Params: { readonly venueId: string } }>(
    '/api/v1/central/venues/:venueId/roles',
    {
      schema: {
        operationId: 'readVenueRoleSummary',
        params: Type.Object({ venueId: Type.String({ format: 'uuid' }) }),
        response: {
          200: VenueRoleSummaryResponseSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<VenueRoleSummaryResponse | undefined> => {
      const authenticated = await dependencies.operatorAuth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const summary = await dependencies.readVenueRoleSummary(
        authenticated.userId,
        request.params.venueId,
      );
      if (!summary) {
        await reply.status(404).send({
          code: 'VENUE_NOT_FOUND',
          message: 'Venue was not found',
          requestId: context.requestId,
        });
        return;
      }
      return {
        data: {
          ...summary,
          activeGrants: summary.activeGrants.map((grant) => ({ ...grant })),
        },
        meta: { requestId: context.requestId },
      };
    },
  );

  app.put<{
    Body: ChangePrimaryAdminBody;
    Headers: RoleHeaders;
    Params: { readonly venueId: string };
  }>(
    '/api/v1/central/venues/:venueId/primary-admin',
    {
      schema: {
        operationId: 'changeVenuePrimaryAdmin',
        params: Type.Object({ venueId: Type.String({ format: 'uuid' }) }),
        body: ChangePrimaryAdminBodySchema,
        response: {
          200: PrimaryAdminCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<PrimaryAdminCommandResponse | undefined> => {
      const authenticated = await dependencies.operatorAuth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return;
      }
      const context = requestContext(request);
      const idempotencyKey = requiredIdempotencyKey(
        request.headers['idempotency-key'],
      );
      const command: CommandEnvelope<ChangePrimaryAdminPayload> = {
        commandId: newUuidV7(),
        commandType: 'SET_PRIMARY_ADMIN',
        idempotencyKey,
        actor: { type: 'USER', id: authenticated.userId, roles: [], scopeIds: [] },
        aggregateType: 'VenuePrimaryAdmin',
        aggregateId: request.params.venueId,
        expectedVersion: expectedVersion(request.headers['if-match'], 0),
        correlationId: context.correlationId,
        causationId: context.causationId,
        requestId: context.requestId,
        source: 'admin',
        payloadVersion: 1,
        payload: {
          userId: request.body.userId,
          venueId: request.params.venueId,
          reasonCode: request.body.reasonCode,
        },
      };
      const executed = await dependencies.changePrimaryAdmin(
        command,
        primaryEffectIds(authenticated.userId, idempotencyKey),
      );
      return {
        data: { ...executed.response },
        meta: {
          requestId: context.requestId,
          eventId: executed.eventId,
          replayed: executed.replayed,
        },
      };
    },
  );
}
