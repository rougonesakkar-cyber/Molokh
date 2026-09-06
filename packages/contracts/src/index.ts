import { Type, type Static } from 'typebox';

export const HealthResponseSchema = Type.Object(
  {
    status: Type.Literal('ok'),
    service: Type.Literal('molokh-api'),
    contractVersion: Type.Literal(1),
  },
  { $id: 'HealthResponse' },
);

export type HealthResponse = Static<typeof HealthResponseSchema>;

export const ApiErrorSchema = Type.Object(
  {
    code: Type.String(),
    message: Type.String(),
    requestId: Type.Optional(Type.String()),
  },
  { $id: 'ApiError' },
);

export type ApiError = Static<typeof ApiErrorSchema>;

export const RuntimeProjectionSchema = Type.Object(
  {
    architecture: Type.Literal('modular-monolith'),
    apiTransport: Type.Literal('https+sse'),
    clients: Type.Tuple([
      Type.Literal('web'),
      Type.Literal('ios'),
      Type.Literal('android'),
    ]),
    database: Type.Literal('postgresql-18'),
  },
  { $id: 'RuntimeProjection' },
);

export type RuntimeProjection = Static<typeof RuntimeProjectionSchema>;

const IdentityCapabilitySchema = Type.Union([
  Type.Literal('USE_DISCOVERY'),
  Type.Literal('EDIT_PROFILE'),
  Type.Literal('BOOK_ORDINARY_TRAINING'),
  Type.Literal('ACCOUNT_VERIFIED'),
]);

const IdentityDenialCodeSchema = Type.Union([
  Type.Literal('ACCOUNT_RESTRICTED'),
  Type.Literal('ACCOUNT_CLOSED'),
  Type.Literal('PHONE_NOT_VERIFIED'),
  Type.Literal('ACCOUNT_NOT_VERIFIED'),
]);

export const IdentityProjectionSchema = Type.Object(
  {
    userId: Type.String({ format: 'uuid' }),
    displayName: Type.String({ minLength: 1, maxLength: 80 }),
    ageDivision: Type.Union([Type.Literal('YOUTH'), Type.Literal('ADULT')]),
    accountState: Type.Union([
      Type.Literal('ACTIVE'),
      Type.Literal('RESTRICTED'),
      Type.Literal('CLOSED'),
    ]),
    phoneVerified: Type.Boolean(),
    accountVerificationState: Type.Union([
      Type.Literal('NOT_STARTED'),
      Type.Literal('PENDING'),
      Type.Literal('VERIFIED'),
      Type.Literal('REJECTED'),
      Type.Literal('EXPIRED'),
      Type.Literal('REVOKED'),
    ]),
    primarySport: Type.String(),
    secondarySport: Type.Union([Type.String(), Type.Null()]),
    discoveryRadiusKm: Type.Integer({ minimum: 1 }),
    version: Type.Integer({ minimum: 1 }),
    capabilities: Type.Array(IdentityCapabilitySchema),
    capabilityDenials: Type.Array(
      Type.Object({
        capability: IdentityCapabilitySchema,
        code: IdentityDenialCodeSchema,
        messageKey: Type.String(),
        retryable: Type.Boolean(),
      }),
    ),
  },
  { $id: 'IdentityProjection', additionalProperties: false },
);

export type IdentityProjectionContract = Static<typeof IdentityProjectionSchema>;

export const MeResponseSchema = Type.Object(
  {
    data: IdentityProjectionSchema,
    meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }),
  },
  { $id: 'MeResponse', additionalProperties: false },
);

export type MeResponse = Static<typeof MeResponseSchema>;

export const ChangeDisplayNameBodySchema = Type.Object(
  {
    displayName: Type.String({ minLength: 1, maxLength: 80 }),
  },
  { $id: 'ChangeDisplayNameBody', additionalProperties: false },
);

export type ChangeDisplayNameBody = Static<typeof ChangeDisplayNameBodySchema>;

export const IdentityCommandResponseSchema = Type.Object(
  {
    data: IdentityProjectionSchema,
    meta: Type.Object({
      requestId: Type.String({ format: 'uuid' }),
      eventId: Type.String({ format: 'uuid' }),
      replayed: Type.Boolean(),
    }),
  },
  { $id: 'IdentityCommandResponse', additionalProperties: false },
);

export type IdentityCommandResponse = Static<typeof IdentityCommandResponseSchema>;

export const ApproveVerificationBodySchema = Type.Object(
  {
    userId: Type.String({ format: 'uuid' }),
    moderationChecklistVersion: Type.String({ minLength: 1, maxLength: 80 }),
  },
  { $id: 'ApproveVerificationBody', additionalProperties: false },
);

export type ApproveVerificationBody = Static<typeof ApproveVerificationBodySchema>;

export const PendingVerificationSchema = Type.Object(
  {
    verificationId: Type.String({ format: 'uuid' }),
    userId: Type.String({ format: 'uuid' }),
    displayName: Type.String(),
    ageDivision: Type.Union([Type.Literal('YOUTH'), Type.Literal('ADULT')]),
    moderationChecklistVersion: Type.String(),
    createdAt: Type.String({ format: 'date-time' }),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'PendingVerification', additionalProperties: false },
);

export type PendingVerification = Static<typeof PendingVerificationSchema>;

export const PendingVerificationListResponseSchema = Type.Object(
  {
    data: Type.Array(PendingVerificationSchema),
    meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }),
  },
  { $id: 'PendingVerificationListResponse', additionalProperties: false },
);

export type PendingVerificationListResponse = Static<
  typeof PendingVerificationListResponseSchema
>;

const CommunityCapabilitySchema = Type.Union([
  Type.Literal('VIEW_COMMUNITY'),
  Type.Literal('REQUEST_MEMBERSHIP'),
  Type.Literal('CREATE_OFFICIAL_CHALLENGE'),
  Type.Literal('MANAGE_MEMBERSHIPS'),
  Type.Literal('MANAGE_VENUE_OPERATIONS'),
  Type.Literal('RECORD_COMMUNITY_RESULT'),
  Type.Literal('TRANSFER_PRIMARY_ADMIN'),
]);

const CommunityDenialCodeSchema = Type.Union([
  Type.Literal('ACCOUNT_NOT_ACTIVE'),
  Type.Literal('ACCOUNT_NOT_VERIFIED'),
  Type.Literal('COMMUNITY_NOT_ACTIVE'),
  Type.Literal('MEMBERSHIP_ALREADY_EXISTS'),
  Type.Literal('MEMBERSHIP_NOT_ACTIVE'),
  Type.Literal('AGE_CONTOUR_MISMATCH'),
  Type.Literal('MVP_ACTIVE_COMMUNITY_LIMIT'),
  Type.Literal('ROLE_SCOPE_MISMATCH'),
  Type.Literal('CENTRAL_ONLY'),
]);

const ActiveRoleGrantSchema = Type.Object(
  {
    role: Type.Union([
      Type.Literal('PRIMARY_ADMIN'),
      Type.Literal('GYM_ADMIN'),
      Type.Literal('COACH'),
      Type.Literal('CENTRAL_ADMIN'),
    ]),
    scopeType: Type.Union([
      Type.Literal('VENUE'),
      Type.Literal('COMMUNITY'),
      Type.Literal('SESSION'),
      Type.Literal('GLOBAL'),
    ]),
    scopeId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  },
  { additionalProperties: false },
);

export const CommunityContextSchema = Type.Object(
  {
    venue: Type.Object(
      {
        venueId: Type.String({ format: 'uuid' }),
        displayName: Type.String(),
        address: Type.String(),
        cityCode: Type.String(),
        timezone: Type.String(),
        minimumBookingNoticeHours: Type.Integer({ minimum: 8, maximum: 48 }),
        slotPublishHorizonDays: Type.Integer({ minimum: 1, maximum: 30 }),
        contactPayload: Type.Record(Type.String(), Type.Unknown()),
      },
      { additionalProperties: false },
    ),
    community: Type.Object(
      {
        communityId: Type.String({ format: 'uuid' }),
        name: Type.String(),
        state: Type.Union([
          Type.Literal('ACTIVE'),
          Type.Literal('PAUSED'),
          Type.Literal('CLOSING'),
          Type.Literal('CLOSED'),
        ]),
        pairCooldownDays: Type.Integer({ minimum: 7, maximum: 30 }),
        noShowGraceMinutes: Type.Integer({ minimum: 5, maximum: 30 }),
        rulesetRef: Type.String(),
        rulesetAckMode: Type.Union([
          Type.Literal('IMPLICIT_ON_ACCEPT'),
          Type.Literal('EXPLICIT_ACK_REQUIRED'),
        ]),
        version: Type.Integer({ minimum: 1 }),
      },
      { additionalProperties: false },
    ),
    membership: Type.Union([
      Type.Object(
        {
          membershipId: Type.String({ format: 'uuid' }),
          state: Type.Union([
            Type.Literal('PENDING'),
            Type.Literal('ACTIVE'),
            Type.Literal('UNDER_REVIEW'),
            Type.Literal('REJECTED'),
            Type.Literal('LEFT'),
            Type.Literal('REMOVED'),
            Type.Literal('ARCHIVED'),
          ]),
          ageDivision: Type.Union([Type.Literal('YOUTH'), Type.Literal('ADULT')]),
          competitionEnabled: Type.Boolean(),
          joinPath: Type.Union([
            Type.Literal('QR'),
            Type.Literal('INVITE'),
            Type.Literal('SELF_REQUEST'),
          ]),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    activeRoleGrants: Type.Array(ActiveRoleGrantSchema),
    access: Type.Object(
      {
        capabilities: Type.Array(CommunityCapabilitySchema),
        denials: Type.Array(
          Type.Object(
            {
              capability: CommunityCapabilitySchema,
              code: CommunityDenialCodeSchema,
              messageKey: Type.String(),
              retryable: Type.Boolean(),
            },
            { additionalProperties: false },
          ),
        ),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'CommunityContext', additionalProperties: false },
);

export type CommunityContextContract = Static<typeof CommunityContextSchema>;

export const CommunityContextResponseSchema = Type.Object(
  {
    data: CommunityContextSchema,
    meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }),
  },
  { $id: 'CommunityContextResponse', additionalProperties: false },
);

export type CommunityContextResponse = Static<typeof CommunityContextResponseSchema>;

export const CoachInviteBodySchema = Type.Object(
  {
    userId: Type.String({ format: 'uuid' }),
    reasonCode: Type.String({ minLength: 3, maxLength: 80 }),
  },
  { $id: 'CoachInviteBody', additionalProperties: false },
);

export type CoachInviteBody = Static<typeof CoachInviteBodySchema>;

export const RoleGrantProjectionSchema = Type.Object(
  {
    grantId: Type.String({ format: 'uuid' }),
    userId: Type.String({ format: 'uuid' }),
    role: Type.Union([
      Type.Literal('PRIMARY_ADMIN'),
      Type.Literal('GYM_ADMIN'),
      Type.Literal('COACH'),
      Type.Literal('CENTRAL_ADMIN'),
    ]),
    scopeType: Type.Union([
      Type.Literal('VENUE'),
      Type.Literal('COMMUNITY'),
      Type.Literal('SESSION'),
      Type.Literal('GLOBAL'),
    ]),
    scopeId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    state: Type.Union([
      Type.Literal('PENDING'),
      Type.Literal('ACTIVE'),
      Type.Literal('DECLINED'),
      Type.Literal('REVOKED'),
      Type.Literal('EXPIRED'),
    ]),
    authorizedBy: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    authorizedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    expiresAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'RoleGrantProjection', additionalProperties: false },
);

export const RoleGrantCommandResponseSchema = Type.Object(
  {
    data: RoleGrantProjectionSchema,
    meta: Type.Object({
      requestId: Type.String({ format: 'uuid' }),
      eventId: Type.String({ format: 'uuid' }),
      replayed: Type.Boolean(),
    }),
  },
  { $id: 'RoleGrantCommandResponse', additionalProperties: false },
);

export type RoleGrantCommandResponse = Static<typeof RoleGrantCommandResponseSchema>;

export const PendingCoachInviteListResponseSchema = Type.Object(
  {
    data: Type.Array(RoleGrantProjectionSchema),
    meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }),
  },
  { $id: 'PendingCoachInviteListResponse', additionalProperties: false },
);

export type PendingCoachInviteListResponse = Static<
  typeof PendingCoachInviteListResponseSchema
>;
