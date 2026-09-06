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
  Type.Literal('CREATE_OFFICIAL_CHALLENGE'),
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
