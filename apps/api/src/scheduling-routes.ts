import {
  ApiErrorSchema,
  BookingOfficialConversionCommandResponseSchema,
  BookingSoloContinuationCommandResponseSchema,
  BookingTrainingRetentionCommandResponseSchema,
  DecideBookingTrainingRetentionBodySchema,
  DecideBookingSoloContinuationBodySchema,
  DecideBookingOfficialConversionBodySchema,
  BookingIntentCommandResponseSchema,
  ConfirmBookingHostBodySchema,
  ConfirmGroupPlanBodySchema,
  GroupOfferingCommandResponseSchema,
  GroupPlanCommandResponseSchema,
  HostConfirmationCommandResponseSchema,
  HostRejectionCommandResponseSchema,
  HostConfirmationQueueResponseSchema,
  MySessionsResponseSchema,
  ProposeGroupPlanBodySchema,
  PublishGroupOfferingBodySchema,
  PublishSlotBodySchema,
  RejectBookingHostBodySchema,
  ScheduleMutationReasonBodySchema,
  RecordAttendanceBodySchema,
  RequestBookingOfficialConversionBodySchema,
  RequestTrainingParticipantCancellationBodySchema,
  ReplaceSessionCoachBodySchema,
  FailSessionExternalBodySchema,
  SelectSameSlotBodySchema,
  SelectSlotBodySchema,
  SlotCommandResponseSchema,
  UpdateGroupOfferingBodySchema,
  UpdateSlotBodySchema,
  SessionActionBodySchema,
  SessionCommandResponseSchema,
  SessionResponseSchema,
  TrainingOptionsResponseSchema,
  VenueAdminDashboardResponseSchema,
  type BookingIntentCommandResponse,
  type BookingOfficialConversionCommandResponse,
  type BookingSoloContinuationCommandResponse,
  type BookingTrainingRetentionCommandResponse,
  type DecideBookingTrainingRetentionBody,
  type DecideBookingSoloContinuationBody,
  type DecideBookingOfficialConversionBody,
  type BookingIntentContract,
  type ConfirmBookingHostBody,
  type ConfirmGroupPlanBody,
  type GroupOfferingCommandResponse,
  type GroupOfferingContract,
  type GroupPlanCommandResponse,
  type GroupPlanContract,
  type HostConfirmationCommandResponse,
  type HostConfirmationContract,
  type HostRejectionCommandResponse,
  type HostConfirmationQueueResponse,
  type MySessionsResponse,
  type ProposeGroupPlanBody,
  type PublishGroupOfferingBody,
  type PublishSlotBody,
  type RejectBookingHostBody,
  type ScheduleMutationReasonBody,
  type RecordAttendanceBody,
  type RequestBookingOfficialConversionBody,
  type RequestTrainingParticipantCancellationBody,
  type ReplaceSessionCoachBody,
  type FailSessionExternalBody,
  type SelectSameSlotBody,
  type SelectSlotBody,
  type SlotCommandResponse,
  type SlotContract,
  type UpdateGroupOfferingBody,
  type UpdateSlotBody,
  type SessionActionBody,
  type SessionCommandResponse,
  type SessionLifecycleContract,
  type SessionResponse,
  type TrainingOptionsResponse,
  type VenueAdminDashboardResponse,
} from '@molokh/contracts';
import { InvalidCommandEnvelopeError, type CommandEnvelope } from '@molokh/core';
import type {
  ExecutedCommand,
  BookingOfficialConversionEffectIds,
  BookingOfficialConversionProjection,
  BookingSoloContinuationEffectIds,
  BookingSoloContinuationProjection,
  BookingTrainingRetentionEffectIds,
  BookingTrainingRetentionProjection,
  BookingIntentProjection,
  BookingWithdrawalEffectIds,
  DecideBookingOfficialConversionPayload,
  DecideBookingSoloContinuationPayload,
  DecideBookingTrainingRetentionPayload,
  ConfirmBookingHostPayload,
  ConfirmGroupPlanPayload,
  GroupOfferingProjection,
  GroupPlanProjection,
  HostConfirmationEffectIds,
  HostConfirmationProjection,
  HostConfirmationQueueItem,
  HostRejectionEffectIds,
  HostRejectionProjection,
  MySessionsProjection,
  PublishGroupOfferingPayload,
  RequestBookingOfficialConversionPayload,
  RequestTrainingParticipantCancellationPayload,
  PublishSlotPayload,
  RejectBookingHostPayload,
  ProposeGroupPlanPayload,
  PairIntentNotificationEffectIds,
  SchedulingEffectIds,
  SelectSameSlotPayload,
  SelectSlotPayload,
  SlotProjection,
  EndSessionPayload,
  CancelAfterCoachReplacementPayload,
  CancelOfficialSessionByAthletePayload,
  FailSessionExternalPayload,
  RecordAttendancePayload,
  ReplaceSessionCoachPayload,
  SessionEffectIds,
  SessionLifecycleProjection,
  StartSessionPayload,
  TrainingOptionsProjection,
  UpdateGroupOfferingPayload,
  UpdateSlotPayload,
  VenueAdminDashboardProjection,
  WithdrawGroupOfferingPayload,
  WithdrawBookingRequestPayload,
  WithdrawSlotPayload,
} from '@molokh/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from 'typebox';

import type { AuthAdapter } from './auth.js';
import { requestContext } from './request-context.js';
import { idempotentResourceId, newUuidV7 } from './uuid-v7.js';

interface SchedulingHeaders {
  readonly authorization?: string;
  readonly 'idempotency-key'?: string;
  readonly 'if-match'?: string;
}

interface VenueParams {
  readonly venueId: string;
}

interface ChatParams {
  readonly chatId: string;
}

interface BookingParams {
  readonly bookingId: string;
}

interface SlotParams {
  readonly slotId: string;
}

interface GroupOfferingParams {
  readonly groupOfferingId: string;
}

interface GroupPlanParams {
  readonly groupPlanId: string;
}

interface SessionParams {
  readonly sessionId: string;
}

interface ConversionParams {
  readonly conversionId: string;
}

interface SoloContinuationParams {
  readonly continuationId: string;
}

interface TrainingRetentionParams {
  readonly retentionId: string;
}

export interface SchedulingRouteDependencies {
  readonly auth: AuthAdapter;
  readonly readTrainingOptions: (
    chatId: string,
    viewerUserId: string,
  ) => Promise<TrainingOptionsProjection>;
  readonly publishSlot: (
    command: CommandEnvelope<PublishSlotPayload>,
    ids: SchedulingEffectIds,
  ) => Promise<ExecutedCommand<SlotProjection>>;
  readonly updateSlot: (
    command: CommandEnvelope<UpdateSlotPayload>,
    ids: SchedulingEffectIds,
  ) => Promise<ExecutedCommand<SlotProjection>>;
  readonly withdrawSlot: (
    command: CommandEnvelope<WithdrawSlotPayload>,
    ids: SchedulingEffectIds,
  ) => Promise<ExecutedCommand<SlotProjection>>;
  readonly publishGroupOffering: (
    command: CommandEnvelope<PublishGroupOfferingPayload>,
    ids: SchedulingEffectIds,
  ) => Promise<ExecutedCommand<GroupOfferingProjection>>;
  readonly updateGroupOffering: (
    command: CommandEnvelope<UpdateGroupOfferingPayload>,
    ids: SchedulingEffectIds,
  ) => Promise<ExecutedCommand<GroupOfferingProjection>>;
  readonly withdrawGroupOffering: (
    command: CommandEnvelope<WithdrawGroupOfferingPayload>,
    ids: SchedulingEffectIds,
  ) => Promise<ExecutedCommand<GroupOfferingProjection>>;
  readonly selectSlot: (
    command: CommandEnvelope<SelectSlotPayload>,
    ids: PairIntentNotificationEffectIds,
  ) => Promise<ExecutedCommand<BookingIntentProjection>>;
  readonly selectSameSlot: (
    command: CommandEnvelope<SelectSameSlotPayload>,
    ids: PairIntentNotificationEffectIds,
  ) => Promise<ExecutedCommand<BookingIntentProjection>>;
  readonly withdrawBookingRequest: (
    command: CommandEnvelope<WithdrawBookingRequestPayload>,
    ids: BookingWithdrawalEffectIds,
  ) => Promise<ExecutedCommand<BookingIntentProjection>>;
  readonly readHostConfirmationQueue: (
    actorUserId: string,
  ) => Promise<readonly HostConfirmationQueueItem[]>;
  readonly readVenueAdminDashboard: (
    actorUserId: string,
    venueId: string,
  ) => Promise<VenueAdminDashboardProjection>;
  readonly confirmBookingHost: (
    command: CommandEnvelope<ConfirmBookingHostPayload>,
    ids: HostConfirmationEffectIds,
  ) => Promise<ExecutedCommand<HostConfirmationProjection>>;
  readonly rejectBookingHost: (
    command: CommandEnvelope<RejectBookingHostPayload>,
    ids: HostRejectionEffectIds,
  ) => Promise<ExecutedCommand<HostRejectionProjection>>;
  readonly readMySessions: (actorUserId: string) => Promise<MySessionsProjection>;
  readonly readSession: (
    sessionId: string,
    actorUserId: string,
  ) => Promise<SessionLifecycleProjection>;
  readonly startSession: (
    command: CommandEnvelope<StartSessionPayload>,
    ids: SessionEffectIds,
  ) => Promise<ExecutedCommand<SessionLifecycleProjection>>;
  readonly recordSessionAttendance: (
    command: CommandEnvelope<RecordAttendancePayload>,
    ids: SessionEffectIds,
  ) => Promise<ExecutedCommand<SessionLifecycleProjection>>;
  readonly endSession: (
    command: CommandEnvelope<EndSessionPayload>,
    ids: SessionEffectIds,
  ) => Promise<ExecutedCommand<SessionLifecycleProjection>>;
  readonly replaceSessionCoach: (
    command: CommandEnvelope<ReplaceSessionCoachPayload>,
    ids: SessionEffectIds,
  ) => Promise<ExecutedCommand<SessionLifecycleProjection>>;
  readonly cancelSessionAfterCoachReplacement: (
    command: CommandEnvelope<CancelAfterCoachReplacementPayload>,
    ids: SessionEffectIds,
  ) => Promise<ExecutedCommand<SessionLifecycleProjection>>;
  readonly cancelOfficialSessionByAthlete: (
    command: CommandEnvelope<CancelOfficialSessionByAthletePayload>,
    ids: SessionEffectIds,
  ) => Promise<ExecutedCommand<SessionLifecycleProjection>>;
  readonly failSessionExternal: (
    command: CommandEnvelope<FailSessionExternalPayload>,
    ids: SessionEffectIds,
  ) => Promise<ExecutedCommand<SessionLifecycleProjection>>;
  readonly requestBookingOfficialConversion: (
    command: CommandEnvelope<RequestBookingOfficialConversionPayload>,
    ids: BookingOfficialConversionEffectIds,
  ) => Promise<ExecutedCommand<BookingOfficialConversionProjection>>;
  readonly decideBookingOfficialConversion: (
    command: CommandEnvelope<DecideBookingOfficialConversionPayload>,
    ids: BookingOfficialConversionEffectIds,
  ) => Promise<ExecutedCommand<BookingOfficialConversionProjection>>;
  readonly requestTrainingParticipantCancellation: (
    command: CommandEnvelope<RequestTrainingParticipantCancellationPayload>,
    ids: BookingSoloContinuationEffectIds,
  ) => Promise<ExecutedCommand<BookingSoloContinuationProjection>>;
  readonly decideBookingSoloContinuation: (
    command: CommandEnvelope<DecideBookingSoloContinuationPayload>,
    ids: BookingSoloContinuationEffectIds,
  ) => Promise<ExecutedCommand<BookingSoloContinuationProjection>>;
  readonly decideBookingTrainingRetention: (
    command: CommandEnvelope<DecideBookingTrainingRetentionPayload>,
    ids: BookingTrainingRetentionEffectIds,
  ) => Promise<ExecutedCommand<BookingTrainingRetentionProjection>>;
  readonly proposeGroupPlan: (
    command: CommandEnvelope<ProposeGroupPlanPayload>,
    ids: PairIntentNotificationEffectIds,
  ) => Promise<ExecutedCommand<GroupPlanProjection>>;
  readonly confirmGroupPlan: (
    command: CommandEnvelope<ConfirmGroupPlanPayload>,
    ids: PairIntentNotificationEffectIds,
  ) => Promise<ExecutedCommand<GroupPlanProjection>>;
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

function requireCreateVersion(value: string | undefined): number {
  const match = value?.trim().match(/^"?(\d+)"?$/);
  if (!match?.[1] || Number(match[1]) !== 0) {
    throw new InvalidCommandEnvelopeError('If-Match');
  }
  return 0;
}

function requireExistingVersion(value: string | undefined): number {
  const match = value?.trim().match(/^"?(\d+)"?$/);
  const version = Number(match?.[1]);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new InvalidCommandEnvelopeError('If-Match');
  }
  return version;
}

function effectIds(): SchedulingEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
  };
}

function pairIntentEffectIds(): PairIntentNotificationEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    notificationId: newUuidV7(),
    notificationOutboxMessageId: newUuidV7(),
    challengeEventId: newUuidV7(),
    challengeOutboxMessageId: newUuidV7(),
  };
}

function hostConfirmationEffectIds(
  bookingId: string,
  actorId: string,
  idempotencyKey: string,
): HostConfirmationEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    slotEventId: newUuidV7(),
    sessionEventId: newUuidV7(),
    sessionId: idempotentResourceId(
      'session',
      bookingId,
      `${actorId}:${idempotencyKey}`,
    ),
    sessionTimerOutboxMessageId: newUuidV7(),
    notificationIds: [newUuidV7(), newUuidV7()],
    notificationOutboxMessageId: newUuidV7(),
    challengeEventId: newUuidV7(),
    challengeOutboxMessageId: newUuidV7(),
  };
}

function bookingWithdrawalEffectIds(): BookingWithdrawalEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    notificationIds: [newUuidV7(), newUuidV7()],
    notificationOutboxMessageId: newUuidV7(),
    challengeEventId: newUuidV7(),
    challengeOutboxMessageId: newUuidV7(),
  };
}

function hostRejectionEffectIds(): HostRejectionEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    notificationIds: [newUuidV7(), newUuidV7()],
    notificationOutboxMessageId: newUuidV7(),
    challengeEventId: newUuidV7(),
    challengeOutboxMessageId: newUuidV7(),
  };
}

function sessionEffectIds(input?: {
  readonly sessionId: string;
  readonly athleteUserId?: string;
}): SessionEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    ...(input?.athleteUserId
      ? {
          attendanceId: idempotentResourceId(
            'attendance',
            input.sessionId,
            input.athleteUserId,
          ),
          attendanceEventId: newUuidV7(),
        }
      : {}),
    bookingEventId: newUuidV7(),
    slotEventId: newUuidV7(),
    replacementId: newUuidV7(),
    assignmentRevisionId: newUuidV7(),
    notificationOutboxMessageId: newUuidV7(),
    notificationIds: [newUuidV7(), newUuidV7()],
    competitiveSnapshotId: newUuidV7(),
    challengeEventId: newUuidV7(),
    challengeOutboxMessageId: newUuidV7(),
    rescheduleId: newUuidV7(),
  };
}

function officialCancellationEffectIds(): SessionEffectIds {
  return {
    ...sessionEffectIds(),
    resultId: newUuidV7(),
    resultEventId: newUuidV7(),
    statusTransitionId: newUuidV7(),
    statusEventId: newUuidV7(),
    cooldownId: newUuidV7(),
    cooldownEventId: newUuidV7(),
    resultOutboxMessageId: newUuidV7(),
    resultNotificationOutboxMessageId: newUuidV7(),
    resultNotificationIds: [newUuidV7(), newUuidV7(), newUuidV7()],
  };
}

function bookingOfficialConversionEffectIds(input: {
  readonly aggregateId: string;
  readonly actorId: string;
  readonly idempotencyKey: string;
}): BookingOfficialConversionEffectIds {
  const seed = `${input.actorId}:${input.idempotencyKey}`;
  return {
    eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7(),
    conversionId: input.aggregateId,
    queueEntryId: idempotentResourceId('conversion-queue-entry', input.aggregateId, seed),
    queueEventId: newUuidV7(), queueConsumedEventId: newUuidV7(),
    timerOutboxMessageId: newUuidV7(),
    confirmationId: idempotentResourceId('conversion-confirmation', input.aggregateId, input.actorId),
    challengeId: idempotentResourceId('conversion-challenge', input.aggregateId, seed),
    challengeEventId: newUuidV7(),
    serviceChatId: idempotentResourceId('conversion-service-chat', input.aggregateId, seed),
    serviceChatEventId: newUuidV7(),
    rulesetSnapshotId: idempotentResourceId('conversion-ruleset', input.aggregateId, seed),
    acknowledgmentIds: [
      idempotentResourceId('conversion-ack-low', input.aggregateId, seed),
      idempotentResourceId('conversion-ack-high', input.aggregateId, seed),
    ],
    obligationIds: [
      idempotentResourceId('conversion-obligation-low', input.aggregateId, seed),
      idempotentResourceId('conversion-obligation-high', input.aggregateId, seed),
    ],
    bookingEventId: newUuidV7(), sessionEventId: newUuidV7(),
    sessionTimerOutboxMessageId: newUuidV7(),
    notificationOutboxMessageId: newUuidV7(),
    notificationIds: [newUuidV7(), newUuidV7(), newUuidV7()],
  };
}

function bookingSoloContinuationEffectIds(input: {
  readonly aggregateId: string;
  readonly actorId: string;
}): BookingSoloContinuationEffectIds {
  return {
    eventId: newUuidV7(),
    auditId: newUuidV7(),
    outboxMessageId: newUuidV7(),
    continuationId: input.aggregateId,
    confirmationId: idempotentResourceId(
      'solo-continuation-confirmation',
      input.aggregateId,
      input.actorId,
    ),
    bookingEventId: newUuidV7(),
    sessionEventId: newUuidV7(),
    sessionTimerOutboxMessageId: newUuidV7(),
    slotEventId: newUuidV7(),
    conversionEventId: newUuidV7(),
    conversionQueueEventId: newUuidV7(),
    conversionOutboxMessageId: newUuidV7(),
    timerOutboxMessageId: newUuidV7(),
    notificationOutboxMessageId: newUuidV7(),
    notificationIds: [newUuidV7(), newUuidV7()],
  };
}

function bookingTrainingRetentionEffectIds(input: {
  readonly aggregateId: string;
  readonly actorId: string;
}): BookingTrainingRetentionEffectIds {
  return {
    eventId: newUuidV7(), auditId: newUuidV7(), outboxMessageId: newUuidV7(),
    confirmationId: idempotentResourceId(
      'training-retention-confirmation', input.aggregateId, input.actorId,
    ),
    bookingEventId: newUuidV7(), sessionEventId: newUuidV7(),
    sessionTimerOutboxMessageId: newUuidV7(), slotEventId: newUuidV7(),
    notificationOutboxMessageId: newUuidV7(),
    notificationIds: [newUuidV7(), newUuidV7(), newUuidV7()],
  };
}

function slotContract(slot: SlotProjection): SlotContract {
  return { ...slot };
}

function contactContract(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function groupOfferingContract(offering: GroupOfferingProjection): GroupOfferingContract {
  return { ...offering, contact: contactContract(offering.contact) };
}

function slotCommandResponse(
  executed: ExecutedCommand<SlotProjection>,
  requestId: string,
): SlotCommandResponse {
  return {
    data: slotContract(executed.response),
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

function groupOfferingCommandResponse(
  executed: ExecutedCommand<GroupOfferingProjection>,
  requestId: string,
): GroupOfferingCommandResponse {
  return {
    data: groupOfferingContract(executed.response),
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

function bookingIntentContract(intent: BookingIntentProjection): BookingIntentContract {
  return { ...intent, selectedByUserIds: [...intent.selectedByUserIds] };
}

function groupPlanContract(plan: GroupPlanProjection): GroupPlanContract {
  return {
    ...plan,
    offeringSnapshot: {
      ...plan.offeringSnapshot,
      contact: contactContract(plan.offeringSnapshot.contact),
    },
  };
}

function bookingIntentCommandResponse(
  executed: ExecutedCommand<BookingIntentProjection>,
  requestId: string,
): BookingIntentCommandResponse {
  return {
    data: bookingIntentContract(executed.response),
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

function hostConfirmationContract(
  projection: HostConfirmationProjection,
): HostConfirmationContract {
  return {
    outcome: projection.outcome,
    booking: bookingIntentContract(projection.booking),
    session: projection.session
      ? {
          ...projection.session,
          athleteUserIds: [...projection.session.athleteUserIds] as [string, string],
        }
      : null,
  };
}

function hostConfirmationCommandResponse(
  executed: ExecutedCommand<HostConfirmationProjection>,
  requestId: string,
): HostConfirmationCommandResponse {
  return {
    data: hostConfirmationContract(executed.response),
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

function hostRejectionCommandResponse(
  executed: ExecutedCommand<HostRejectionProjection>,
  requestId: string,
): HostRejectionCommandResponse {
  return {
    data: {
      ...executed.response,
      booking: bookingIntentContract(executed.response.booking),
    },
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

function sessionContract(session: SessionLifecycleProjection): SessionLifecycleContract {
  return {
    ...session,
    officialConversion: session.officialConversion
      ? {
          ...session.officialConversion,
          confirmations: session.officialConversion.confirmations.map((item) => ({ ...item })),
        }
      : null,
    soloContinuation: session.soloContinuation
      ? {
          ...session.soloContinuation,
          confirmations: session.soloContinuation.confirmations.map((item) => ({ ...item })),
        }
      : null,
    trainingRetention: session.trainingRetention
      ? {
          ...session.trainingRetention,
          confirmations: session.trainingRetention.confirmations.map((item) => ({ ...item })),
        }
      : null,
    athleteUserIds: [...session.athleteUserIds] as [string, string],
    athleteDisplayNames: [...session.athleteDisplayNames] as [string, string],
    activeAthleteUserIds: [...session.activeAthleteUserIds],
    activeAthleteDisplayNames: [...session.activeAthleteDisplayNames],
    attendance: session.attendance.map((item) => ({ ...item })),
    replacementCoachOptions: session.replacementCoachOptions.map((item) => ({ ...item })),
  };
}

function sessionCommandResponse(
  executed: ExecutedCommand<SessionLifecycleProjection>,
  requestId: string,
): SessionCommandResponse {
  return {
    data: sessionContract(executed.response),
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

function bookingOfficialConversionCommandResponse(
  executed: ExecutedCommand<BookingOfficialConversionProjection>,
  requestId: string,
): BookingOfficialConversionCommandResponse {
  return {
    data: {
      ...executed.response,
      confirmations: executed.response.confirmations.map((item) => ({ ...item })),
    },
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

function bookingSoloContinuationCommandResponse(
  executed: ExecutedCommand<BookingSoloContinuationProjection>,
  requestId: string,
): BookingSoloContinuationCommandResponse {
  return {
    data: {
      ...executed.response,
      confirmations: executed.response.confirmations.map((item) => ({ ...item })),
    },
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

function bookingTrainingRetentionCommandResponse(
  executed: ExecutedCommand<BookingTrainingRetentionProjection>,
  requestId: string,
): BookingTrainingRetentionCommandResponse {
  return {
    data: {
      ...executed.response,
      confirmations: executed.response.confirmations.map((item) => ({ ...item })),
    },
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

function groupPlanCommandResponse(
  executed: ExecutedCommand<GroupPlanProjection>,
  requestId: string,
): GroupPlanCommandResponse {
  return {
    data: groupPlanContract(executed.response),
    meta: { requestId, eventId: executed.eventId, replayed: executed.replayed },
  };
}

export async function registerSchedulingRoutes(
  app: FastifyInstance,
  dependencies: SchedulingRouteDependencies,
): Promise<void> {
  app.get<{ Headers: SchedulingHeaders }>(
    '/api/v1/me/sessions',
    {
      schema: {
        operationId: 'readMySessions',
        response: {
          200: MySessionsResponseSchema,
          401: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<MySessionsResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const projection = await dependencies.readMySessions(authenticated.userId);
      return {
        data: {
          sessions: projection.sessions.map(sessionContract),
          completedTrainingCount: projection.completedTrainingCount,
        },
        meta: { requestId: requestContext(request).requestId },
      };
    },
  );

  app.get<{ Headers: SchedulingHeaders; Params: SessionParams }>(
    '/api/v1/sessions/:sessionId',
    {
      schema: {
        operationId: 'readSession',
        params: Type.Object(
          { sessionId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        response: {
          200: SessionResponseSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<SessionResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const session = await dependencies.readSession(
        request.params.sessionId,
        authenticated.userId,
      );
      return {
        data: sessionContract(session),
        meta: { requestId: requestContext(request).requestId },
      };
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: TrainingRetentionParams;
    Body: DecideBookingTrainingRetentionBody;
  }>(
    '/api/v1/booking-training-retentions/:retentionId/decision',
    {
      schema: {
        operationId: 'decideBookingTrainingRetention',
        params: Type.Object(
          { retentionId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: DecideBookingTrainingRetentionBodySchema,
        response: {
          200: BookingTrainingRetentionCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<BookingTrainingRetentionCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const executed = await dependencies.decideBookingTrainingRetention(
        {
          commandId: newUuidV7(),
          commandType: 'DECIDE_BOOKING_TRAINING_RETENTION',
          idempotencyKey,
          actor: { type: 'USER', id: authenticated.userId, roles: [], scopeIds: [] },
          aggregateType: 'BookingTrainingRetention',
          aggregateId: request.params.retentionId,
          expectedVersion: requireExistingVersion(request.headers['if-match']),
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: {
            retentionId: request.params.retentionId,
            decision: request.body.decision,
          },
        },
        bookingTrainingRetentionEffectIds({
          aggregateId: request.params.retentionId,
          actorId: authenticated.userId,
        }),
      );
      reply.status(executed.responseStatus);
      return bookingTrainingRetentionCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: SessionParams;
    Body: RequestBookingOfficialConversionBody;
  }>(
    '/api/v1/sessions/:sessionId/official-conversion',
    {
      schema: {
        operationId: 'requestBookingOfficialConversion',
        params: Type.Object(
          { sessionId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: RequestBookingOfficialConversionBodySchema,
        response: {
          201: BookingOfficialConversionCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<BookingOfficialConversionCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      requireCreateVersion(request.headers['if-match']);
      const context = requestContext(request);
      const conversionId = idempotentResourceId(
        'booking-official-conversion', request.params.sessionId,
        `${authenticated.userId}:${idempotencyKey}`,
      );
      const executed = await dependencies.requestBookingOfficialConversion(
        {
          commandId: newUuidV7(), commandType: 'REQUEST_BOOKING_OFFICIAL_CONVERSION',
          idempotencyKey,
          actor: { type: 'USER', id: authenticated.userId, roles: ['ATHLETE'], scopeIds: [] },
          aggregateType: 'BookingOfficialConversion', aggregateId: conversionId,
          expectedVersion: 0, correlationId: context.correlationId,
          causationId: context.causationId, requestId: context.requestId,
          source: 'api', payloadVersion: 1,
          payload: {
            sessionId: request.params.sessionId,
            ...(request.body.explicitRulesetAcknowledged === undefined
              ? {}
              : { explicitRulesetAcknowledged: request.body.explicitRulesetAcknowledged }),
          },
        },
        bookingOfficialConversionEffectIds({
          aggregateId: conversionId, actorId: authenticated.userId, idempotencyKey,
        }),
      );
      reply.status(executed.responseStatus);
      return bookingOfficialConversionCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: ConversionParams;
    Body: DecideBookingOfficialConversionBody;
  }>(
    '/api/v1/booking-official-conversions/:conversionId/decision',
    {
      schema: {
        operationId: 'decideBookingOfficialConversion',
        params: Type.Object(
          { conversionId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: DecideBookingOfficialConversionBodySchema,
        response: {
          200: BookingOfficialConversionCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<BookingOfficialConversionCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const executed = await dependencies.decideBookingOfficialConversion(
        {
          commandId: newUuidV7(), commandType: 'DECIDE_BOOKING_OFFICIAL_CONVERSION',
          idempotencyKey,
          actor: { type: 'USER', id: authenticated.userId, roles: [], scopeIds: [] },
          aggregateType: 'BookingOfficialConversion', aggregateId: request.params.conversionId,
          expectedVersion: requireExistingVersion(request.headers['if-match']),
          correlationId: context.correlationId, causationId: context.causationId,
          requestId: context.requestId, source: 'api', payloadVersion: 1,
          payload: {
            conversionId: request.params.conversionId,
            decision: request.body.decision,
            ...(request.body.explicitRulesetAcknowledged === undefined
              ? {}
              : { explicitRulesetAcknowledged: request.body.explicitRulesetAcknowledged }),
          },
        },
        bookingOfficialConversionEffectIds({
          aggregateId: request.params.conversionId,
          actorId: authenticated.userId,
          idempotencyKey,
        }),
      );
      reply.status(executed.responseStatus);
      return bookingOfficialConversionCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: SessionParams;
    Body: RequestTrainingParticipantCancellationBody;
  }>(
    '/api/v1/sessions/:sessionId/cancel-training-participation',
    {
      schema: {
        operationId: 'requestTrainingParticipantCancellation',
        params: Type.Object(
          { sessionId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: RequestTrainingParticipantCancellationBodySchema,
        response: {
          201: BookingSoloContinuationCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<BookingSoloContinuationCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      requireCreateVersion(request.headers['if-match']);
      const context = requestContext(request);
      const continuationId = idempotentResourceId(
        'booking-solo-continuation',
        request.params.sessionId,
        `${authenticated.userId}:${idempotencyKey}`,
      );
      const executed = await dependencies.requestTrainingParticipantCancellation(
        {
          commandId: newUuidV7(),
          commandType: 'CANCEL_TRAINING_PARTICIPATION',
          idempotencyKey,
          actor: { type: 'USER', id: authenticated.userId, roles: ['ATHLETE'], scopeIds: [] },
          aggregateType: 'BookingSoloContinuation',
          aggregateId: continuationId,
          expectedVersion: 0,
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: { sessionId: request.params.sessionId },
        },
        bookingSoloContinuationEffectIds({
          aggregateId: continuationId,
          actorId: authenticated.userId,
        }),
      );
      reply.status(executed.responseStatus);
      return bookingSoloContinuationCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: SoloContinuationParams;
    Body: DecideBookingSoloContinuationBody;
  }>(
    '/api/v1/booking-solo-continuations/:continuationId/decision',
    {
      schema: {
        operationId: 'decideBookingSoloContinuation',
        params: Type.Object(
          { continuationId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: DecideBookingSoloContinuationBodySchema,
        response: {
          200: BookingSoloContinuationCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<BookingSoloContinuationCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const executed = await dependencies.decideBookingSoloContinuation(
        {
          commandId: newUuidV7(),
          commandType: 'DECIDE_BOOKING_SOLO_CONTINUATION',
          idempotencyKey,
          actor: { type: 'USER', id: authenticated.userId, roles: [], scopeIds: [] },
          aggregateType: 'BookingSoloContinuation',
          aggregateId: request.params.continuationId,
          expectedVersion: requireExistingVersion(request.headers['if-match']),
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: {
            continuationId: request.params.continuationId,
            decision: request.body.decision,
          },
        },
        bookingSoloContinuationEffectIds({
          aggregateId: request.params.continuationId,
          actorId: authenticated.userId,
        }),
      );
      reply.status(executed.responseStatus);
      return bookingSoloContinuationCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: SessionParams;
    Body: SessionActionBody;
  }>(
    '/api/v1/sessions/:sessionId/start',
    {
      schema: {
        operationId: 'startSession',
        params: Type.Object(
          { sessionId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: SessionActionBodySchema,
        response: {
          200: SessionCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<SessionCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const executed = await dependencies.startSession(
        {
          commandId: newUuidV7(),
          commandType: 'START_SESSION',
          idempotencyKey,
          actor: {
            type: 'USER',
            id: authenticated.userId,
            roles: ['COACH'],
            scopeIds: [request.params.sessionId],
          },
          aggregateType: 'Session',
          aggregateId: request.params.sessionId,
          expectedVersion: requireExistingVersion(request.headers['if-match']),
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: { sessionId: request.params.sessionId },
        },
        sessionEffectIds(),
      );
      reply.status(executed.responseStatus);
      return sessionCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: SessionParams;
    Body: RecordAttendanceBody;
  }>(
    '/api/v1/sessions/:sessionId/attendance',
    {
      schema: {
        operationId: 'recordSessionAttendance',
        params: Type.Object(
          { sessionId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: RecordAttendanceBodySchema,
        response: {
          200: SessionCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<SessionCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const executed = await dependencies.recordSessionAttendance(
        {
          commandId: newUuidV7(),
          commandType: 'RECORD_ATTENDANCE',
          idempotencyKey,
          actor: {
            type: 'USER',
            id: authenticated.userId,
            roles: ['COACH'],
            scopeIds: [request.params.sessionId],
          },
          aggregateType: 'Session',
          aggregateId: request.params.sessionId,
          expectedVersion: requireExistingVersion(request.headers['if-match']),
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: {
            sessionId: request.params.sessionId,
            athleteUserId: request.body.athleteUserId,
            status: request.body.status,
            comment: request.body.comment ?? null,
          },
        },
        sessionEffectIds({
          sessionId: request.params.sessionId,
          athleteUserId: request.body.athleteUserId,
        }),
      );
      reply.status(executed.responseStatus);
      return sessionCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: SessionParams;
    Body: SessionActionBody;
  }>(
    '/api/v1/sessions/:sessionId/end',
    {
      schema: {
        operationId: 'endSession',
        params: Type.Object(
          { sessionId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: SessionActionBodySchema,
        response: {
          200: SessionCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<SessionCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const executed = await dependencies.endSession(
        {
          commandId: newUuidV7(),
          commandType: 'END_SESSION',
          idempotencyKey,
          actor: {
            type: 'USER',
            id: authenticated.userId,
            roles: ['COACH'],
            scopeIds: [request.params.sessionId],
          },
          aggregateType: 'Session',
          aggregateId: request.params.sessionId,
          expectedVersion: requireExistingVersion(request.headers['if-match']),
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: { sessionId: request.params.sessionId },
        },
        sessionEffectIds(),
      );
      reply.status(executed.responseStatus);
      return sessionCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: SessionParams;
    Body: ReplaceSessionCoachBody;
  }>(
    '/api/v1/sessions/:sessionId/replace-coach',
    {
      schema: {
        operationId: 'replaceSessionCoach',
        params: Type.Object(
          { sessionId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: ReplaceSessionCoachBodySchema,
        response: {
          200: SessionCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<SessionCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const executed = await dependencies.replaceSessionCoach(
        {
          commandId: newUuidV7(),
          commandType: 'REPLACE_SESSION_COACH',
          idempotencyKey,
          actor: {
            type: 'USER', id: authenticated.userId,
            roles: ['GYM_ADMIN'], scopeIds: [],
          },
          aggregateType: 'Session',
          aggregateId: request.params.sessionId,
          expectedVersion: requireExistingVersion(request.headers['if-match']),
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: {
            sessionId: request.params.sessionId,
            replacementCoachUserId: request.body.replacementCoachUserId,
          },
        },
        sessionEffectIds(),
      );
      reply.status(executed.responseStatus);
      return sessionCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: SessionParams;
    Body: SessionActionBody;
  }>(
    '/api/v1/sessions/:sessionId/cancel-after-coach-replacement',
    {
      schema: {
        operationId: 'cancelSessionAfterCoachReplacement',
        params: Type.Object(
          { sessionId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: SessionActionBodySchema,
        response: {
          200: SessionCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<SessionCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const executed = await dependencies.cancelSessionAfterCoachReplacement(
        {
          commandId: newUuidV7(), commandType: 'REQUEST_RESCHEDULE_AFTER_COACH_REPLACEMENT',
          idempotencyKey,
          actor: { type: 'USER', id: authenticated.userId, roles: ['ATHLETE'], scopeIds: [] },
          aggregateType: 'Session', aggregateId: request.params.sessionId,
          expectedVersion: requireExistingVersion(request.headers['if-match']),
          correlationId: context.correlationId, causationId: context.causationId,
          requestId: context.requestId, source: 'api', payloadVersion: 1,
          payload: { sessionId: request.params.sessionId },
        },
        sessionEffectIds(),
      );
      reply.status(executed.responseStatus);
      return sessionCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: SessionParams;
    Body: SessionActionBody;
  }>(
    '/api/v1/sessions/:sessionId/cancel-official',
    {
      schema: {
        operationId: 'cancelOfficialSessionByAthlete',
        params: Type.Object(
          { sessionId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: SessionActionBodySchema,
        response: {
          200: SessionCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<SessionCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const executed = await dependencies.cancelOfficialSessionByAthlete(
        {
          commandId: newUuidV7(), commandType: 'CANCEL_OFFICIAL_BY_ATHLETE',
          idempotencyKey,
          actor: { type: 'USER', id: authenticated.userId, roles: [], scopeIds: [] },
          aggregateType: 'Session', aggregateId: request.params.sessionId,
          expectedVersion: requireExistingVersion(request.headers['if-match']),
          correlationId: context.correlationId, causationId: context.causationId,
          requestId: context.requestId, source: 'api', payloadVersion: 1,
          payload: { sessionId: request.params.sessionId },
        },
        officialCancellationEffectIds(),
      );
      reply.status(executed.responseStatus);
      return sessionCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: SessionParams;
    Body: FailSessionExternalBody;
  }>(
    '/api/v1/sessions/:sessionId/fail-external',
    {
      schema: {
        operationId: 'failSessionExternal',
        params: Type.Object(
          { sessionId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: FailSessionExternalBodySchema,
        response: {
          200: SessionCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<SessionCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const executed = await dependencies.failSessionExternal(
        {
          commandId: newUuidV7(), commandType: 'FAIL_SESSION_EXTERNAL', idempotencyKey,
          actor: { type: 'USER', id: authenticated.userId, roles: [], scopeIds: [] },
          aggregateType: 'Session', aggregateId: request.params.sessionId,
          expectedVersion: requireExistingVersion(request.headers['if-match']),
          correlationId: context.correlationId, causationId: context.causationId,
          requestId: context.requestId, source: 'api', payloadVersion: 1,
          payload: {
            sessionId: request.params.sessionId,
            reasonCode: request.body.reasonCode,
          },
        },
        sessionEffectIds(),
      );
      reply.status(executed.responseStatus);
      return sessionCommandResponse(executed, context.requestId);
    },
  );

  app.get<{ Headers: SchedulingHeaders }>(
    '/api/v1/me/host-confirmations',
    {
      schema: {
        operationId: 'readHostConfirmationQueue',
        response: {
          200: HostConfirmationQueueResponseSchema,
          401: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<HostConfirmationQueueResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const items = await dependencies.readHostConfirmationQueue(authenticated.userId);
      return {
        data: items.map((item) => ({
          booking: bookingIntentContract(item.booking),
          athleteDisplayNames: [...item.athleteDisplayNames] as [string, string],
        })),
        meta: { requestId: requestContext(request).requestId },
      };
    },
  );

  app.get<{ Headers: SchedulingHeaders; Params: VenueParams }>(
    '/api/v1/venues/:venueId/admin-dashboard',
    {
      schema: {
        operationId: 'readVenueAdminDashboard',
        params: Type.Object(
          { venueId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        response: {
          200: VenueAdminDashboardResponseSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<VenueAdminDashboardResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const projection = await dependencies.readVenueAdminDashboard(
        authenticated.userId,
        request.params.venueId,
      );
      return {
        data: {
          venue: { ...projection.venue },
          coaches: projection.coaches.map((coach) => ({ ...coach })),
          slots: projection.slots.map(slotContract),
          groupOfferings: projection.groupOfferings.map(groupOfferingContract),
          hostConfirmations: projection.hostConfirmations.map((item) => ({
            booking: bookingIntentContract(item.booking),
            athleteDisplayNames: [...item.athleteDisplayNames] as [string, string],
          })),
          groupInterests: projection.groupInterests.map((interest) => ({
            ...interest,
            athleteDisplayNames: [...interest.athleteDisplayNames] as [string, string],
          })),
        },
        meta: { requestId: requestContext(request).requestId },
      };
    },
  );

  app.get<{ Headers: SchedulingHeaders; Params: ChatParams }>(
    '/api/v1/chats/:chatId/training-options',
    {
      schema: {
        operationId: 'readChatTrainingOptions',
        params: Type.Object(
          { chatId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        response: {
          200: TrainingOptionsResponseSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<TrainingOptionsResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const projection = await dependencies.readTrainingOptions(
        request.params.chatId,
        authenticated.userId,
      );
      return {
        data: {
          slots: projection.slots.map(slotContract),
          groupOfferings: projection.groupOfferings.map(groupOfferingContract),
          activeIntent: {
            booking: projection.activeIntent.booking
              ? bookingIntentContract(projection.activeIntent.booking)
              : null,
            groupPlan: projection.activeIntent.groupPlan
              ? groupPlanContract(projection.activeIntent.groupPlan)
              : null,
          },
          reservationPolicy: projection.reservationPolicy,
        },
        meta: {
          requestId: requestContext(request).requestId,
          viewerUserId: authenticated.userId,
        },
      };
    },
  );

  app.post<{ Headers: SchedulingHeaders; Body: SelectSlotBody }>(
    '/api/v1/bookings',
    {
      schema: {
        operationId: 'selectTrainingSlot',
        body: SelectSlotBodySchema,
        response: {
          201: BookingIntentCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<BookingIntentCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const bookingId = idempotentResourceId('booking', authenticated.userId, idempotencyKey);
      const executed = await dependencies.selectSlot(
        {
          commandId: newUuidV7(),
          commandType: 'SELECT_SLOT',
          idempotencyKey,
          actor: { type: 'USER', id: authenticated.userId, roles: ['ATHLETE'], scopeIds: [] },
          aggregateType: 'Booking',
          aggregateId: bookingId,
          expectedVersion: requireCreateVersion(request.headers['if-match']),
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: request.body,
        },
        pairIntentEffectIds(),
      );
      reply.status(executed.responseStatus);
      return bookingIntentCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: BookingParams;
    Body: SelectSameSlotBody;
  }>(
    '/api/v1/bookings/:bookingId/select-same',
    {
      schema: {
        operationId: 'selectSameTrainingSlot',
        params: Type.Object({ bookingId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: SelectSameSlotBodySchema,
        response: {
          200: BookingIntentCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<BookingIntentCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const executed = await dependencies.selectSameSlot(
        {
          commandId: newUuidV7(),
          commandType: 'SELECT_SAME_SLOT',
          idempotencyKey,
          actor: { type: 'USER', id: authenticated.userId, roles: ['ATHLETE'], scopeIds: [] },
          aggregateType: 'Booking',
          aggregateId: request.params.bookingId,
          expectedVersion: requireExistingVersion(request.headers['if-match']),
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: { bookingId: request.params.bookingId, commercialVersion: request.body.commercialVersion },
        },
        pairIntentEffectIds(),
      );
      reply.status(executed.responseStatus);
      return bookingIntentCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: BookingParams;
    Body: SessionActionBody;
  }>(
    '/api/v1/bookings/:bookingId/withdraw',
    {
      schema: {
        operationId: 'withdrawBookingSlotRequest',
        params: Type.Object(
          { bookingId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: SessionActionBodySchema,
        response: {
          200: BookingIntentCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<BookingIntentCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const executed = await dependencies.withdrawBookingRequest(
        {
          commandId: newUuidV7(),
          commandType: 'WITHDRAW_SLOT_REQUEST',
          idempotencyKey,
          actor: {
            type: 'USER',
            id: authenticated.userId,
            roles: ['ATHLETE'],
            scopeIds: [],
          },
          aggregateType: 'Booking',
          aggregateId: request.params.bookingId,
          expectedVersion: requireExistingVersion(request.headers['if-match']),
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: { bookingId: request.params.bookingId },
        },
        bookingWithdrawalEffectIds(),
      );
      reply.status(executed.responseStatus);
      return bookingIntentCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: BookingParams;
    Body: ConfirmBookingHostBody;
  }>(
    '/api/v1/bookings/:bookingId/host-confirm',
    {
      schema: {
        operationId: 'confirmBookingHost',
        params: Type.Object(
          { bookingId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: ConfirmBookingHostBodySchema,
        response: {
          200: HostConfirmationCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<HostConfirmationCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const executed = await dependencies.confirmBookingHost(
        {
          commandId: newUuidV7(),
          commandType: 'CONFIRM_BOOKING_HOST',
          idempotencyKey,
          actor: {
            type: 'USER',
            id: authenticated.userId,
            roles: [],
            scopeIds: [],
          },
          aggregateType: 'Booking',
          aggregateId: request.params.bookingId,
          expectedVersion: requireExistingVersion(request.headers['if-match']),
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: { bookingId: request.params.bookingId },
        },
        hostConfirmationEffectIds(
          request.params.bookingId,
          authenticated.userId,
          idempotencyKey,
        ),
      );
      reply.status(executed.responseStatus);
      return hostConfirmationCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: BookingParams;
    Body: RejectBookingHostBody;
  }>(
    '/api/v1/bookings/:bookingId/host-reject',
    {
      schema: {
        operationId: 'rejectBookingHost',
        params: Type.Object(
          { bookingId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: RejectBookingHostBodySchema,
        response: {
          200: HostRejectionCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<HostRejectionCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const executed = await dependencies.rejectBookingHost(
        {
          commandId: newUuidV7(),
          commandType: 'REJECT_BOOKING_HOST',
          idempotencyKey,
          actor: {
            type: 'USER',
            id: authenticated.userId,
            roles: [],
            scopeIds: [],
          },
          aggregateType: 'Booking',
          aggregateId: request.params.bookingId,
          expectedVersion: requireExistingVersion(request.headers['if-match']),
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: {
            bookingId: request.params.bookingId,
            reasonCode: request.body.reasonCode,
            reasonNote: request.body.reasonNote ?? null,
          },
        },
        hostRejectionEffectIds(),
      );
      reply.status(executed.responseStatus);
      return hostRejectionCommandResponse(executed, context.requestId);
    },
  );

  app.post<{ Headers: SchedulingHeaders; Body: ProposeGroupPlanBody }>(
    '/api/v1/group-plans',
    {
      schema: {
        operationId: 'proposeGroupPlan',
        body: ProposeGroupPlanBodySchema,
        response: {
          201: GroupPlanCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<GroupPlanCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const groupPlanId = idempotentResourceId('group-plan', authenticated.userId, idempotencyKey);
      const executed = await dependencies.proposeGroupPlan(
        {
          commandId: newUuidV7(),
          commandType: 'PROPOSE_GROUP_PLAN',
          idempotencyKey,
          actor: { type: 'USER', id: authenticated.userId, roles: ['ATHLETE'], scopeIds: [] },
          aggregateType: 'GroupPlan',
          aggregateId: groupPlanId,
          expectedVersion: requireCreateVersion(request.headers['if-match']),
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: request.body,
        },
        pairIntentEffectIds(),
      );
      reply.status(executed.responseStatus);
      return groupPlanCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: GroupPlanParams;
    Body: ConfirmGroupPlanBody;
  }>(
    '/api/v1/group-plans/:groupPlanId/confirm',
    {
      schema: {
        operationId: 'confirmGroupPlan',
        params: Type.Object({ groupPlanId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
        body: ConfirmGroupPlanBodySchema,
        response: {
          200: GroupPlanCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<GroupPlanCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(request.headers.authorization);
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const executed = await dependencies.confirmGroupPlan(
        {
          commandId: newUuidV7(),
          commandType: 'CONFIRM_GROUP_PLAN',
          idempotencyKey,
          actor: { type: 'USER', id: authenticated.userId, roles: ['ATHLETE'], scopeIds: [] },
          aggregateType: 'GroupPlan',
          aggregateId: request.params.groupPlanId,
          expectedVersion: requireExistingVersion(request.headers['if-match']),
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: { groupPlanId: request.params.groupPlanId },
        },
        pairIntentEffectIds(),
      );
      reply.status(executed.responseStatus);
      return groupPlanCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: VenueParams;
    Body: PublishSlotBody;
  }>(
    '/api/v1/venues/:venueId/slots',
    {
      schema: {
        operationId: 'publishVenueSlot',
        params: Type.Object(
          { venueId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: PublishSlotBodySchema,
        response: {
          201: SlotCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<SlotCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const slotId = idempotentResourceId('slot', authenticated.userId, idempotencyKey);
      const executed = await dependencies.publishSlot(
        {
          commandId: newUuidV7(),
          commandType: 'PUBLISH_SLOT',
          idempotencyKey,
          actor: { type: 'USER', id: authenticated.userId, roles: [], scopeIds: [] },
          aggregateType: 'Slot',
          aggregateId: slotId,
          expectedVersion: requireCreateVersion(request.headers['if-match']),
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: {
            venueId: request.params.venueId,
            coachUserId: request.body.coachUserId,
            startAt: request.body.startAt,
            endAt: request.body.endAt,
            priceAmount: request.body.priceAmount ?? null,
            priceCurrency: request.body.priceCurrency ?? null,
            priceText: request.body.priceText ?? null,
            cancellationTermsText: request.body.cancellationTermsText ?? null,
          },
        },
        effectIds(),
      );
      reply.status(executed.responseStatus);
      return slotCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: VenueParams;
    Body: PublishGroupOfferingBody;
  }>(
    '/api/v1/venues/:venueId/group-offerings',
    {
      schema: {
        operationId: 'publishVenueGroupOffering',
        params: Type.Object(
          { venueId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: PublishGroupOfferingBodySchema,
        response: {
          201: GroupOfferingCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<GroupOfferingCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const groupOfferingId = idempotentResourceId(
        'group-offering',
        authenticated.userId,
        idempotencyKey,
      );
      const executed = await dependencies.publishGroupOffering(
        {
          commandId: newUuidV7(),
          commandType: 'PUBLISH_GROUP_OFFERING',
          idempotencyKey,
          actor: { type: 'USER', id: authenticated.userId, roles: [], scopeIds: [] },
          aggregateType: 'GroupOffering',
          aggregateId: groupOfferingId,
          expectedVersion: requireCreateVersion(request.headers['if-match']),
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: {
            venueId: request.params.venueId,
            sportCode: request.body.sportCode,
            classLabel: request.body.classLabel,
            startAt: request.body.startAt,
            endAt: request.body.endAt,
            coachDisplayName: request.body.coachDisplayName ?? null,
            priceText: request.body.priceText ?? null,
            externalInfoUrl: request.body.externalInfoUrl ?? null,
          },
        },
        effectIds(),
      );
      reply.status(executed.responseStatus);
      return groupOfferingCommandResponse(executed, context.requestId);
    },
  );

  app.patch<{
    Headers: SchedulingHeaders;
    Params: SlotParams;
    Body: UpdateSlotBody;
  }>(
    '/api/v1/slots/:slotId',
    {
      schema: {
        operationId: 'updateVenueSlot',
        params: Type.Object(
          { slotId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: UpdateSlotBodySchema,
        response: {
          200: SlotCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<SlotCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const executed = await dependencies.updateSlot(
        {
          commandId: newUuidV7(),
          commandType: 'UPDATE_SLOT',
          idempotencyKey,
          actor: { type: 'USER', id: authenticated.userId, roles: [], scopeIds: [] },
          aggregateType: 'Slot',
          aggregateId: request.params.slotId,
          expectedVersion: requireExistingVersion(request.headers['if-match']),
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: {
            slotId: request.params.slotId,
            coachUserId: request.body.coachUserId,
            startAt: request.body.startAt,
            endAt: request.body.endAt,
            priceAmount: request.body.priceAmount ?? null,
            priceCurrency: request.body.priceCurrency ?? null,
            priceText: request.body.priceText ?? null,
            cancellationTermsText: request.body.cancellationTermsText ?? null,
          },
        },
        effectIds(),
      );
      reply.status(executed.responseStatus);
      return slotCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: SlotParams;
    Body: ScheduleMutationReasonBody;
  }>(
    '/api/v1/slots/:slotId/withdraw',
    {
      schema: {
        operationId: 'withdrawVenueSlot',
        params: Type.Object(
          { slotId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: ScheduleMutationReasonBodySchema,
        response: {
          200: SlotCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<SlotCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const executed = await dependencies.withdrawSlot(
        {
          commandId: newUuidV7(),
          commandType: 'WITHDRAW_SLOT',
          idempotencyKey,
          actor: { type: 'USER', id: authenticated.userId, roles: [], scopeIds: [] },
          aggregateType: 'Slot',
          aggregateId: request.params.slotId,
          expectedVersion: requireExistingVersion(request.headers['if-match']),
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: {
            slotId: request.params.slotId,
            reasonCode: request.body.reasonCode,
            reasonNote: request.body.reasonNote ?? null,
          },
        },
        effectIds(),
      );
      reply.status(executed.responseStatus);
      return slotCommandResponse(executed, context.requestId);
    },
  );

  app.patch<{
    Headers: SchedulingHeaders;
    Params: GroupOfferingParams;
    Body: UpdateGroupOfferingBody;
  }>(
    '/api/v1/group-offerings/:groupOfferingId',
    {
      schema: {
        operationId: 'updateVenueGroupOffering',
        params: Type.Object(
          { groupOfferingId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: UpdateGroupOfferingBodySchema,
        response: {
          200: GroupOfferingCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<GroupOfferingCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const executed = await dependencies.updateGroupOffering(
        {
          commandId: newUuidV7(),
          commandType: 'UPDATE_GROUP_OFFERING',
          idempotencyKey,
          actor: { type: 'USER', id: authenticated.userId, roles: [], scopeIds: [] },
          aggregateType: 'GroupOffering',
          aggregateId: request.params.groupOfferingId,
          expectedVersion: requireExistingVersion(request.headers['if-match']),
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: {
            groupOfferingId: request.params.groupOfferingId,
            sportCode: request.body.sportCode,
            classLabel: request.body.classLabel,
            startAt: request.body.startAt,
            endAt: request.body.endAt,
            coachDisplayName: request.body.coachDisplayName ?? null,
            priceText: request.body.priceText ?? null,
            externalInfoUrl: request.body.externalInfoUrl ?? null,
          },
        },
        effectIds(),
      );
      reply.status(executed.responseStatus);
      return groupOfferingCommandResponse(executed, context.requestId);
    },
  );

  app.post<{
    Headers: SchedulingHeaders;
    Params: GroupOfferingParams;
    Body: ScheduleMutationReasonBody;
  }>(
    '/api/v1/group-offerings/:groupOfferingId/withdraw',
    {
      schema: {
        operationId: 'withdrawVenueGroupOffering',
        params: Type.Object(
          { groupOfferingId: Type.String({ format: 'uuid' }) },
          { additionalProperties: false },
        ),
        body: ScheduleMutationReasonBodySchema,
        response: {
          200: GroupOfferingCommandResponseSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (request, reply): Promise<GroupOfferingCommandResponse | undefined> => {
      const authenticated = await dependencies.auth.authenticate(
        request.headers.authorization,
      );
      if (!authenticated) {
        await reply.status(401).send(unauthorized(request));
        return undefined;
      }
      const idempotencyKey = requiredIdempotencyKey(request.headers['idempotency-key']);
      const context = requestContext(request);
      const executed = await dependencies.withdrawGroupOffering(
        {
          commandId: newUuidV7(),
          commandType: 'WITHDRAW_GROUP_OFFERING',
          idempotencyKey,
          actor: { type: 'USER', id: authenticated.userId, roles: [], scopeIds: [] },
          aggregateType: 'GroupOffering',
          aggregateId: request.params.groupOfferingId,
          expectedVersion: requireExistingVersion(request.headers['if-match']),
          correlationId: context.correlationId,
          causationId: context.causationId,
          requestId: context.requestId,
          source: 'api',
          payloadVersion: 1,
          payload: {
            groupOfferingId: request.params.groupOfferingId,
            reasonCode: request.body.reasonCode,
            reasonNote: request.body.reasonNote ?? null,
          },
        },
        effectIds(),
      );
      reply.status(executed.responseStatus);
      return groupOfferingCommandResponse(executed, context.requestId);
    },
  );
}
