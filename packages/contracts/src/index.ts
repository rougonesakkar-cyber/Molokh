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
    retryAt: Type.Optional(Type.String({ format: 'date-time' })),
  },
  { $id: 'ApiError' },
);

export type ApiError = Static<typeof ApiErrorSchema>;

const AuthOtpTransportSchema = Type.Union([
  Type.Literal('LOCAL_DEVELOPMENT'),
  Type.Literal('SMS_OPT_IN'),
]);
const AuthClientKindSchema = Type.Union([
  Type.Literal('WEB'),
  Type.Literal('NATIVE'),
]);

export const RequestAuthOtpBodySchema = Type.Object({
  phoneE164: Type.String({ pattern: '^\\+[1-9][0-9]{7,14}$' }),
  transport: AuthOtpTransportSchema,
  smsOptIn: Type.Boolean({ default: false }),
}, { $id: 'RequestAuthOtpBody', additionalProperties: false });
export type RequestAuthOtpBody = Static<typeof RequestAuthOtpBodySchema>;

export const AuthOtpChallengeSchema = Type.Object({
  challengeId: Type.String({ format: 'uuid' }),
  transport: AuthOtpTransportSchema,
  state: Type.Union([
    Type.Literal('PENDING'), Type.Literal('VERIFIED'),
    Type.Literal('EXPIRED'), Type.Literal('LOCKED'),
  ]),
  attempts: Type.Integer({ minimum: 0, maximum: 5 }),
  maxAttempts: Type.Literal(5),
  expiresAt: Type.String({ format: 'date-time' }),
  version: Type.Integer({ minimum: 1 }),
}, { $id: 'AuthOtpChallenge', additionalProperties: false });

export const RequestAuthOtpResponseSchema = Type.Object({
  data: Type.Intersect([
    AuthOtpChallengeSchema,
    Type.Object({ developmentCode: Type.Optional(Type.String({ pattern: '^[0-9]{6}$' })) }),
  ]),
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }),
    eventId: Type.String({ format: 'uuid' }), replayed: Type.Boolean() },
  { additionalProperties: false }),
}, { $id: 'RequestAuthOtpResponse', additionalProperties: false });
export type RequestAuthOtpResponse = Static<typeof RequestAuthOtpResponseSchema>;

export const VerifyAuthOtpBodySchema = Type.Object({
  challengeId: Type.String({ format: 'uuid' }),
  challengeVersion: Type.Integer({ minimum: 1 }),
  code: Type.String({ pattern: '^[0-9]{6}$' }),
  clientKind: AuthClientKindSchema,
  deviceLabel: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
}, { $id: 'VerifyAuthOtpBody', additionalProperties: false });
export type VerifyAuthOtpBody = Static<typeof VerifyAuthOtpBodySchema>;

export const AuthSessionTokensSchema = Type.Object({
  userId: Type.String({ format: 'uuid' }),
  familyId: Type.String({ format: 'uuid' }),
  generation: Type.Integer({ minimum: 1 }),
  tokenType: Type.Literal('Bearer'),
  accessToken: Type.String({ minLength: 32 }),
  refreshToken: Type.Union([Type.String({ minLength: 32 }), Type.Null()]),
  accessExpiresAt: Type.String({ format: 'date-time' }),
  refreshExpiresAt: Type.String({ format: 'date-time' }),
  accessMode: Type.Literal('FULL'),
}, { $id: 'AuthSessionTokens', additionalProperties: false });
export type AuthSessionTokens = Static<typeof AuthSessionTokensSchema>;

export const VerifyAuthOtpResponseSchema = Type.Object({
  data: Type.Object({
    outcome: Type.Union([
      Type.Literal('VERIFIED'), Type.Literal('INVALID_CODE'),
      Type.Literal('LOCKED'), Type.Literal('EXPIRED'),
    ]),
    challenge: AuthOtpChallengeSchema,
    session: Type.Union([AuthSessionTokensSchema, Type.Null()]),
  }, { additionalProperties: false }),
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }),
    eventId: Type.String({ format: 'uuid' }), replayed: Type.Boolean() },
  { additionalProperties: false }),
}, { $id: 'VerifyAuthOtpResponse', additionalProperties: false });
export type VerifyAuthOtpResponse = Static<typeof VerifyAuthOtpResponseSchema>;

export const RefreshAuthSessionBodySchema = Type.Object({
  clientKind: AuthClientKindSchema,
  refreshToken: Type.Optional(Type.String({ minLength: 32 })),
}, { $id: 'RefreshAuthSessionBody', additionalProperties: false });
export type RefreshAuthSessionBody = Static<typeof RefreshAuthSessionBodySchema>;

export const AuthSessionResponseSchema = Type.Object({
  data: AuthSessionTokensSchema,
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }),
    eventId: Type.String({ format: 'uuid' }), replayed: Type.Boolean() },
  { additionalProperties: false }),
}, { $id: 'AuthSessionResponse', additionalProperties: false });
export type AuthSessionResponse = Static<typeof AuthSessionResponseSchema>;

export const LogoutAuthSessionResponseSchema = Type.Object({
  data: Type.Object({ familyId: Type.String({ format: 'uuid' }),
    state: Type.Literal('REVOKED') }, { additionalProperties: false }),
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }),
    eventId: Type.String({ format: 'uuid' }), replayed: Type.Boolean() },
  { additionalProperties: false }),
}, { $id: 'LogoutAuthSessionResponse', additionalProperties: false });
export type LogoutAuthSessionResponse = Static<typeof LogoutAuthSessionResponseSchema>;

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
    releaseSha: Type.String({ pattern: '^(development|[0-9a-f]{40})$' }),
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

const PublicProfileStatusSchema = Type.Union([
  Type.Literal('CHAMPION'), Type.Literal('CONTENDER'),
]);

const PublicProfileReviewStateSchema = Type.Union([
  Type.Literal('PENDING'), Type.Literal('REVIEWED'), Type.Null(),
]);

const PublicProfileCurrentStatusSchema = Type.Object({
  competitionId: Type.String({ format: 'uuid' }),
  communityId: Type.String({ format: 'uuid' }),
  status: PublicProfileStatusSchema,
  provisional: Type.Boolean(),
  reviewState: PublicProfileReviewStateSchema,
}, { additionalProperties: false });

const PublicProfileStatusHistorySchema = Type.Object({
  tenureId: Type.String({ format: 'uuid' }),
  competitionId: Type.String({ format: 'uuid' }),
  communityId: Type.String({ format: 'uuid' }),
  status: PublicProfileStatusSchema,
  startedAt: Type.String({ format: 'date-time' }),
  endedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  provisional: Type.Boolean(),
  reviewState: PublicProfileReviewStateSchema,
}, { additionalProperties: false });

const PublicProfileResultSchema = Type.Object({
  resultId: Type.String({ format: 'uuid' }),
  competitionId: Type.String({ format: 'uuid' }),
  outcome: Type.Union([
    Type.Literal('WIN'), Type.Literal('LOSS'), Type.Literal('DRAW'),
    Type.Literal('NO_CONTEST'),
  ]),
  publicMethod: Type.Union([
    Type.Literal('FORFEIT'), Type.Literal('NO_SHOW'), Type.Null(),
  ]),
  reviewState: PublicProfileReviewStateSchema,
  occurredAt: Type.String({ format: 'date-time' }),
}, { additionalProperties: false });

export const PublicAthleteProfileSchema = Type.Object({
  userId: Type.String({ format: 'uuid' }),
  displayName: Type.String({ minLength: 1, maxLength: 80 }),
  ageDivision: Type.Union([Type.Literal('YOUTH'), Type.Literal('ADULT')]),
  primarySport: Type.String(),
  secondarySport: Type.Union([Type.String(), Type.Null()]),
  currentStatuses: Type.Array(PublicProfileCurrentStatusSchema),
  statusHistory: Type.Array(PublicProfileStatusHistorySchema),
  officialRecord: Type.Object({
    wins: Type.Integer({ minimum: 0 }),
    losses: Type.Integer({ minimum: 0 }),
    draws: Type.Integer({ minimum: 0 }),
  }, { additionalProperties: false }),
  recentOfficialResults: Type.Array(PublicProfileResultSchema, { maxItems: 5 }),
  completedTrainingCount: Type.Integer({ minimum: 0 }),
}, { $id: 'PublicAthleteProfile', additionalProperties: false });

export type PublicAthleteProfile = Static<typeof PublicAthleteProfileSchema>;

export const PublicAthleteProfileResponseSchema = Type.Object({
  data: PublicAthleteProfileSchema,
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) },
    { additionalProperties: false }),
}, { $id: 'PublicAthleteProfileResponse', additionalProperties: false });

export type PublicAthleteProfileResponse = Static<
  typeof PublicAthleteProfileResponseSchema
>;

export const AccountClosureProjectionSchema = Type.Object({
  closureId: Type.String({ format: 'uuid' }),
  userId: Type.String({ format: 'uuid' }),
  state: Type.Union([
    Type.Literal('REQUESTED'), Type.Literal('CANCELLED'), Type.Literal('EXECUTED'),
  ]),
  exportRequested: Type.Boolean(),
  requestedAt: Type.String({ format: 'date-time' }),
  recoveryUntil: Type.String({ format: 'date-time' }),
  cancelledAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  executedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  version: Type.Integer({ minimum: 1 }),
}, { $id: 'AccountClosureProjection', additionalProperties: false });
export type AccountClosureContract = Static<typeof AccountClosureProjectionSchema>;

export const AccountExportProjectionSchema = Type.Object({
  exportId: Type.String({ format: 'uuid' }),
  userId: Type.String({ format: 'uuid' }),
  closureId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  state: Type.Union([Type.Literal('REQUESTED'), Type.Literal('READY'), Type.Literal('EXPIRED')]),
  requestedAt: Type.String({ format: 'date-time' }),
  readyAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  expiresAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  payloadSha256: Type.Union([Type.String({ pattern: '^[0-9a-f]{64}$' }), Type.Null()]),
  version: Type.Integer({ minimum: 1 }),
}, { $id: 'AccountExportProjection', additionalProperties: false });
export type AccountExportContract = Static<typeof AccountExportProjectionSchema>;

export const AccountLifecycleProjectionSchema = Type.Object({
  closure: Type.Union([AccountClosureProjectionSchema, Type.Null()]),
  dataExport: Type.Union([AccountExportProjectionSchema, Type.Null()]),
}, { $id: 'AccountLifecycleProjection', additionalProperties: false });
export type AccountLifecycleContract = Static<typeof AccountLifecycleProjectionSchema>;

export const AccountLifecycleResponseSchema = Type.Object({
  data: AccountLifecycleProjectionSchema,
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }),
    eventId: Type.Optional(Type.String({ format: 'uuid' })),
    replayed: Type.Optional(Type.Boolean()) },
    { additionalProperties: false }),
}, { $id: 'AccountLifecycleResponse', additionalProperties: false });
export type AccountLifecycleResponse = Static<typeof AccountLifecycleResponseSchema>;

export const RequestAccountClosureBodySchema = Type.Object({
  exportRequested: Type.Boolean({ default: true }),
}, { $id: 'RequestAccountClosureBody', additionalProperties: false });
export type RequestAccountClosureBody = Static<typeof RequestAccountClosureBodySchema>;

export const AccountExportResponseSchema = Type.Object({
  data: AccountExportProjectionSchema,
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }),
    eventId: Type.String({ format: 'uuid' }), replayed: Type.Boolean() },
  { additionalProperties: false }),
}, { $id: 'AccountExportResponse', additionalProperties: false });
export type AccountExportResponse = Static<typeof AccountExportResponseSchema>;

export const AccountExportDownloadResponseSchema = Type.Object({
  data: Type.Unknown(),
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }),
    payloadSha256: Type.String({ pattern: '^[0-9a-f]{64}$' }) },
  { additionalProperties: false }),
}, { $id: 'AccountExportDownloadResponse', additionalProperties: false });
export type AccountExportDownloadResponse = Static<typeof AccountExportDownloadResponseSchema>;

export const AccountClosureBlockersSchema = Type.Object({
  activeObligationCount: Type.Integer({ minimum: 0 }),
  heldStatusCount: Type.Integer({ minimum: 0 }),
  activeSessionCount: Type.Integer({ minimum: 0 }),
  activeMembershipCount: Type.Integer({ minimum: 0 }),
  activeRoleCount: Type.Integer({ minimum: 0 }),
  activeQueueEntryCount: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });

export const CentralAccountClosureProjectionSchema = Type.Intersect([
  AccountClosureProjectionSchema,
  Type.Object({ displayName: Type.String(),
    accountState: Type.Union([Type.Literal('ACTIVE'), Type.Literal('RESTRICTED'),
      Type.Literal('CLOSED')]), userVersion: Type.Integer({ minimum: 1 }),
    blockers: AccountClosureBlockersSchema, executable: Type.Boolean() },
  { additionalProperties: false }),
], { $id: 'CentralAccountClosureProjection' });
export type CentralAccountClosureContract = Static<typeof CentralAccountClosureProjectionSchema>;

export const CentralAccountClosuresResponseSchema = Type.Object({
  data: Type.Array(CentralAccountClosureProjectionSchema),
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) },
    { additionalProperties: false }),
}, { $id: 'CentralAccountClosuresResponse', additionalProperties: false });
export type CentralAccountClosuresResponse = Static<typeof CentralAccountClosuresResponseSchema>;

export const ExecuteAccountClosureBodySchema = Type.Object({
  reason: Type.String({ minLength: 3, maxLength: 500 }),
}, { $id: 'ExecuteAccountClosureBody', additionalProperties: false });
export type ExecuteAccountClosureBody = Static<typeof ExecuteAccountClosureBodySchema>;

export const AccountRecoverySignalSchema = Type.Union([
  Type.Literal('VERIFIED_PHONE'), Type.Literal('TRUSTED_SESSION'),
  Type.Literal('CENTRAL_SUPPORT'),
]);
export const AccountAccessCaseSchema = Type.Object({
  caseId: Type.String({ format: 'uuid' }),
  userId: Type.String({ format: 'uuid' }),
  state: Type.Union([Type.Literal('PENDING'), Type.Literal('SECURITY_HOLD'),
    Type.Literal('COMPLETED'), Type.Literal('REJECTED')]),
  route: Type.Union([Type.Literal('VERIFIED_ROUTE'), Type.Literal('PHONE_CHANGE')]),
  signals: Type.Array(AccountRecoverySignalSchema, { minItems: 1, uniqueItems: true }),
  requestedPhoneE164: Type.Union([Type.String({ minLength: 8, maxLength: 20 }), Type.Null()]),
  requestedAt: Type.String({ format: 'date-time' }),
  securityHoldUntil: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  incidentStartedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  incidentEndedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  affectedProcessIds: Type.Array(Type.String({ format: 'uuid' }), { uniqueItems: true }),
  completedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  version: Type.Integer({ minimum: 1 }),
}, { $id: 'AccountAccessCase', additionalProperties: false });
export type AccountAccessCaseContract = Static<typeof AccountAccessCaseSchema>;

export const AccountAccessResponseSchema = Type.Object({
  data: Type.Union([AccountAccessCaseSchema, Type.Null()]),
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }),
    eventId: Type.Optional(Type.String({ format: 'uuid' })),
    replayed: Type.Optional(Type.Boolean()) }, { additionalProperties: false }),
}, { $id: 'AccountAccessResponse', additionalProperties: false });
export type AccountAccessResponse = Static<typeof AccountAccessResponseSchema>;

export const RequestAccountRecoveryBodySchema = Type.Object({
  route: Type.Union([Type.Literal('VERIFIED_ROUTE'), Type.Literal('PHONE_CHANGE')]),
  signals: Type.Array(AccountRecoverySignalSchema, { minItems: 1, uniqueItems: true }),
  requestedPhoneE164: Type.Union([Type.String({ minLength: 8, maxLength: 20 }), Type.Null()]),
  reason: Type.String({ minLength: 10, maxLength: 1000 }),
}, { $id: 'RequestAccountRecoveryBody', additionalProperties: false });
export type RequestAccountRecoveryBody = Static<typeof RequestAccountRecoveryBodySchema>;

export const AccountAccessListResponseSchema = Type.Object({
  data: Type.Array(AccountAccessCaseSchema),
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) },
    { additionalProperties: false }),
}, { $id: 'AccountAccessListResponse', additionalProperties: false });
export type AccountAccessListResponse = Static<typeof AccountAccessListResponseSchema>;

export const AccountAccessReasonBodySchema = Type.Object({
  reason: Type.String({ minLength: 10, maxLength: 1000 }),
}, { $id: 'AccountAccessReasonBody', additionalProperties: false });
export type AccountAccessReasonBody = Static<typeof AccountAccessReasonBodySchema>;

export const CompleteVerifiedRecoveryBodySchema = Type.Object({
  verifiedRouteSucceeded: Type.Literal(true),
}, { $id: 'CompleteVerifiedRecoveryBody', additionalProperties: false });
export type CompleteVerifiedRecoveryBody = Static<typeof CompleteVerifiedRecoveryBodySchema>;

export const ConfirmAccessIncidentBodySchema = Type.Object({
  incidentStartedAt: Type.String({ format: 'date-time' }),
  incidentEndedAt: Type.String({ format: 'date-time' }),
  affectedProcessIds: Type.Array(Type.String({ format: 'uuid' }),
    { minItems: 1, uniqueItems: true }),
  reason: Type.String({ minLength: 10, maxLength: 1000 }),
}, { $id: 'ConfirmAccessIncidentBody', additionalProperties: false });
export type ConfirmAccessIncidentBody = Static<typeof ConfirmAccessIncidentBodySchema>;

export const DuplicateProcessSchema = Type.Object({
  kind: Type.Union([Type.Literal('STATUS'), Type.Literal('OBLIGATION')]),
  aggregateId: Type.String({ format: 'uuid' }),
  currentOwnerUserId: Type.String({ format: 'uuid' }),
  decision: Type.Union([Type.Literal('RETAIN_CURRENT_OWNER'),
    Type.Literal('CLOSE_NO_FAULT'), Type.Literal('SEPARATE_GOVERNED_REVIEW'), Type.Null()]),
}, { additionalProperties: false });
export const DuplicateAccountCaseSchema = Type.Object({
  caseId: Type.String({ format: 'uuid' }),
  state: Type.Union([Type.Literal('UNDER_REVIEW'), Type.Literal('CLEARED'),
    Type.Literal('RESOLVED')]),
  userIds: Type.Array(Type.String({ format: 'uuid' }), { minItems: 2, uniqueItems: true }),
  signalReferences: Type.Array(Type.String({ minLength: 1 }), { minItems: 1, uniqueItems: true }),
  canonicalUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  processes: Type.Array(DuplicateProcessSchema),
  requestedAt: Type.String({ format: 'date-time' }),
  decidedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  version: Type.Integer({ minimum: 1 }),
}, { $id: 'DuplicateAccountCase', additionalProperties: false });
export type DuplicateAccountCaseContract = Static<typeof DuplicateAccountCaseSchema>;
export const DuplicateAccountResponseSchema = Type.Object({
  data: DuplicateAccountCaseSchema,
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }),
    eventId: Type.String({ format: 'uuid' }), replayed: Type.Boolean() },
  { additionalProperties: false }),
}, { $id: 'DuplicateAccountResponse', additionalProperties: false });
export type DuplicateAccountResponse = Static<typeof DuplicateAccountResponseSchema>;
export const DuplicateAccountListResponseSchema = Type.Object({
  data: Type.Array(DuplicateAccountCaseSchema),
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) },
    { additionalProperties: false }),
}, { $id: 'DuplicateAccountListResponse', additionalProperties: false });
export type DuplicateAccountListResponse = Static<typeof DuplicateAccountListResponseSchema>;
export const OpenDuplicateReviewBodySchema = Type.Object({
  userIds: Type.Array(Type.String({ format: 'uuid' }), { minItems: 2, uniqueItems: true }),
  signalReferences: Type.Array(Type.String({ minLength: 1, maxLength: 500 }),
    { minItems: 1, uniqueItems: true }),
  reason: Type.String({ minLength: 10, maxLength: 1000 }),
}, { $id: 'OpenDuplicateReviewBody', additionalProperties: false });
export type OpenDuplicateReviewBody = Static<typeof OpenDuplicateReviewBodySchema>;
export const ResolveDuplicateReviewBodySchema = Type.Object({
  canonicalUserId: Type.String({ format: 'uuid' }),
  dispositions: Type.Array(Type.Object({
    kind: Type.Union([Type.Literal('STATUS'), Type.Literal('OBLIGATION')]),
    aggregateId: Type.String({ format: 'uuid' }),
    currentOwnerUserId: Type.String({ format: 'uuid' }),
    decision: Type.Union([Type.Literal('RETAIN_CURRENT_OWNER'),
      Type.Literal('CLOSE_NO_FAULT'), Type.Literal('SEPARATE_GOVERNED_REVIEW')]),
  }, { additionalProperties: false })),
  reason: Type.String({ minLength: 10, maxLength: 1000 }),
}, { $id: 'ResolveDuplicateReviewBody', additionalProperties: false });
export type ResolveDuplicateReviewBody = Static<typeof ResolveDuplicateReviewBodySchema>;

const DiscoveryRankingReasonSchema = Type.Union([
  Type.Literal('WITHIN_RADIUS'),
  Type.Literal('CITY_EXPANSION'),
  Type.Literal('INBOUND_INTEREST'),
  Type.Literal('PRIMARY_SPORT_OVERLAP'),
  Type.Literal('SECONDARY_SPORT_OVERLAP'),
]);

export const DiscoveryCardSchema = Type.Object(
  {
    candidateUserId: Type.String({ format: 'uuid' }),
    displayName: Type.String({ minLength: 1, maxLength: 80 }),
    avatarAssetId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    ageDivision: Type.Union([Type.Literal('YOUTH'), Type.Literal('ADULT')]),
    primarySport: Type.String(),
    secondarySport: Type.Union([Type.String(), Type.Null()]),
    experienceText: Type.Union([Type.String(), Type.Null()]),
    homeVenue: Type.Object(
      {
        venueId: Type.String({ format: 'uuid' }),
        displayName: Type.String(),
      },
      { additionalProperties: false },
    ),
    geographyTier: Type.Union([
      Type.Literal('WITHIN_RADIUS'),
      Type.Literal('CITY_EXPANSION'),
    ]),
    inboundLike: Type.Boolean(),
    sportOverlap: Type.Union([
      Type.Literal('PRIMARY'),
      Type.Literal('SECONDARY'),
      Type.Literal('NONE'),
    ]),
    distanceKm: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
    rankingConfigVersion: Type.Literal('discovery-mvp-v1'),
    rankingReasons: Type.Array(DiscoveryRankingReasonSchema),
  },
  { $id: 'DiscoveryCard', additionalProperties: false },
);

export type DiscoveryCard = Static<typeof DiscoveryCardSchema>;

export const DiscoveryCardsResponseSchema = Type.Object(
  {
    data: Type.Array(DiscoveryCardSchema),
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        rankingConfigVersion: Type.Literal('discovery-mvp-v1'),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'DiscoveryCardsResponse', additionalProperties: false },
);

export type DiscoveryCardsResponse = Static<typeof DiscoveryCardsResponseSchema>;

export const LikeProjectionSchema = Type.Object(
  {
    likeId: Type.String({ format: 'uuid' }),
    fromUserId: Type.String({ format: 'uuid' }),
    toUserId: Type.String({ format: 'uuid' }),
    state: Type.Union([
      Type.Literal('ACTIVE'),
      Type.Literal('MATCHED'),
      Type.Literal('EXPIRED'),
      Type.Literal('WITHDRAWN'),
      Type.Literal('REMOVED_BY_SKIP'),
    ]),
    expiresAt: Type.String({ format: 'date-time' }),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export const MatchProjectionSchema = Type.Object(
  {
    matchId: Type.String({ format: 'uuid' }),
    chatId: Type.String({ format: 'uuid' }),
    state: Type.Union([Type.Literal('ACTIVE'), Type.Literal('ARCHIVED')]),
    counterpartUserId: Type.String({ format: 'uuid' }),
    counterpartDisplayName: Type.String({ minLength: 1, maxLength: 80 }),
    lastActivityAt: Type.String({ format: 'date-time' }),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

const DiscoveryLikedActionSchema = Type.Object(
  {
    action: Type.Literal('LIKED'),
    like: LikeProjectionSchema,
    match: Type.Null(),
    suppressionUntil: Type.Null(),
  },
  { additionalProperties: false },
);

const DiscoveryMatchedActionSchema = Type.Object(
  {
    action: Type.Literal('MATCHED'),
    like: LikeProjectionSchema,
    match: MatchProjectionSchema,
    suppressionUntil: Type.Null(),
  },
  { additionalProperties: false },
);

const DiscoverySkippedActionSchema = Type.Object(
  {
    action: Type.Literal('SKIPPED'),
    like: Type.Null(),
    match: Type.Null(),
    suppressionUntil: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);

export const DiscoveryActionResponseSchema = Type.Object(
  {
    data: Type.Union([
      DiscoveryLikedActionSchema,
      DiscoveryMatchedActionSchema,
      DiscoverySkippedActionSchema,
    ]),
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.String({ format: 'uuid' }),
        replayed: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'DiscoveryActionResponse', additionalProperties: false },
);

export type DiscoveryActionResponse = Static<typeof DiscoveryActionResponseSchema>;

export const MatchesResponseSchema = Type.Object(
  {
    data: Type.Array(MatchProjectionSchema),
    meta: Type.Object(
      { requestId: Type.String({ format: 'uuid' }) },
      { additionalProperties: false },
    ),
  },
  { $id: 'MatchesResponse', additionalProperties: false },
);

export type MatchesResponse = Static<typeof MatchesResponseSchema>;

const PreservedSocialObligationsSchema = Type.Object(
  {
    acceptedObligationsPreserved: Type.Literal(true),
    statusPathsPreserved: Type.Literal(true),
    optionalPreAcceptanceIntentsClosed: Type.Literal(true),
  },
  { additionalProperties: false },
);

export const BlockProjectionSchema = Type.Object(
  {
    blockId: Type.String({ format: 'uuid' }),
    blockedUserId: Type.String({ format: 'uuid' }),
    blockedDisplayName: Type.String({ minLength: 1, maxLength: 80 }),
    state: Type.Union([Type.Literal('ACTIVE'), Type.Literal('REVOKED')]),
    reasonCode: Type.Union([Type.String({ minLength: 1, maxLength: 80 }), Type.Null()]),
    createdAt: Type.String({ format: 'date-time' }),
    revokedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    version: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

const UnmatchProjectionSchema = Type.Object(
  {
    action: Type.Literal('UNMATCHED'),
    matchId: Type.String({ format: 'uuid' }),
    matchState: Type.Literal('UNMATCHED'),
    chatId: Type.String({ format: 'uuid' }),
    chatState: Type.Literal('CLOSED'),
    suppressionUntil: Type.String({ format: 'date-time' }),
    version: Type.Integer({ minimum: 2 }),
    preservation: PreservedSocialObligationsSchema,
  },
  { additionalProperties: false },
);

const BlockActionProjectionSchema = Type.Object(
  {
    action: Type.Literal('BLOCKED'),
    block: BlockProjectionSchema,
    affectedMatch: Type.Union([
      Type.Object(
        {
          matchId: Type.String({ format: 'uuid' }),
          state: Type.Literal('BLOCKED'),
          version: Type.Integer({ minimum: 2 }),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    personalChatClosed: Type.Boolean(),
    preservation: PreservedSocialObligationsSchema,
  },
  { additionalProperties: false },
);

const UnblockActionProjectionSchema = Type.Object(
  {
    action: Type.Literal('UNBLOCKED'),
    block: BlockProjectionSchema,
    oldMatchRestored: Type.Literal(false),
  },
  { additionalProperties: false },
);

export const SocialRelationshipCommandResponseSchema = Type.Object(
  {
    data: Type.Union([
      UnmatchProjectionSchema,
      BlockActionProjectionSchema,
      UnblockActionProjectionSchema,
    ]),
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.String({ format: 'uuid' }),
        replayed: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'SocialRelationshipCommandResponse', additionalProperties: false },
);

export type SocialRelationshipCommandResponse = Static<
  typeof SocialRelationshipCommandResponseSchema
>;

export const BlockedUsersResponseSchema = Type.Object(
  {
    data: Type.Array(BlockProjectionSchema),
    meta: Type.Object(
      { requestId: Type.String({ format: 'uuid' }) },
      { additionalProperties: false },
    ),
  },
  { $id: 'BlockedUsersResponse', additionalProperties: false },
);

export type BlockedUsersResponse = Static<typeof BlockedUsersResponseSchema>;

const PersonalTextContentSchema = Type.Object(
  {
    kind: Type.Literal('PERSONAL_TEXT'),
    text: Type.String({ minLength: 1, maxLength: 2_000 }),
  },
  { additionalProperties: false },
);

const ServiceMessageContentSchema = Type.Object(
  {
    kind: Type.Literal('SERVICE'),
    renderKey: Type.String({ minLength: 1, maxLength: 120 }),
    data: Type.Record(Type.String(), Type.Unknown()),
  },
  { additionalProperties: false },
);

const ActionCardContentSchema = Type.Object(
  {
    kind: Type.Literal('ACTION'),
    actionType: Type.String({ minLength: 1, maxLength: 80 }),
    resourceType: Type.String({ minLength: 1, maxLength: 80 }),
    resourceId: Type.String({ format: 'uuid' }),
    stateVersion: Type.Integer({ minimum: 1 }),
    renderKey: Type.String({ minLength: 1, maxLength: 120 }),
    data: Type.Record(Type.String(), Type.Unknown()),
  },
  { additionalProperties: false },
);

const ChatMessageContentSchema = Type.Union([
  PersonalTextContentSchema,
  ServiceMessageContentSchema,
  ActionCardContentSchema,
]);

export const ChatMessageProjectionSchema = Type.Object(
  {
    messageId: Type.String({ format: 'uuid' }),
    chatId: Type.String({ format: 'uuid' }),
    senderUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    senderDisplayName: Type.Union([
      Type.String({ minLength: 1, maxLength: 80 }),
      Type.Null(),
    ]),
    payloadType: Type.Union([
      Type.Literal('PERSONAL_TEXT'),
      Type.Literal('SERVICE'),
      Type.Literal('ACTION'),
    ]),
    content: ChatMessageContentSchema,
    state: Type.Union([Type.Literal('ACTIVE'), Type.Literal('HIDDEN_BY_MODERATION')]),
    revisionNo: Type.Integer({ minimum: 1 }),
    edited: Type.Boolean(),
    reported: Type.Boolean(),
    createdAt: Type.String({ format: 'date-time' }),
    updatedAt: Type.String({ format: 'date-time' }),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'ChatMessageProjection', additionalProperties: false },
);

export type ChatMessageContract = Static<typeof ChatMessageProjectionSchema>;

export const ChatMessagesResponseSchema = Type.Object(
  {
    data: Type.Array(ChatMessageProjectionSchema),
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        viewerUserId: Type.String({ format: 'uuid' }),
        chatState: Type.Union([
          Type.Literal('OPEN'),
          Type.Literal('ARCHIVED'),
          Type.Literal('READ_ONLY'),
          Type.Literal('CLOSED'),
        ]),
        nextCursor: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'ChatMessagesResponse', additionalProperties: false },
);

export type ChatMessagesResponse = Static<typeof ChatMessagesResponseSchema>;

export const SendChatMessageBodySchema = Type.Object(
  { text: Type.String({ minLength: 1, maxLength: 2_000 }) },
  { $id: 'SendChatMessageBody', additionalProperties: false },
);

export type SendChatMessageBody = Static<typeof SendChatMessageBodySchema>;

export const EditChatMessageBodySchema = Type.Object(
  { text: Type.String({ minLength: 1, maxLength: 2_000 }) },
  { $id: 'EditChatMessageBody', additionalProperties: false },
);

export type EditChatMessageBody = Static<typeof EditChatMessageBodySchema>;

export const ReportChatMessageBodySchema = Type.Object(
  { reasonCode: Type.String({ minLength: 1, maxLength: 80 }) },
  { $id: 'ReportChatMessageBody', additionalProperties: false },
);

export type ReportChatMessageBody = Static<typeof ReportChatMessageBodySchema>;

export const ChatMessageCommandResponseSchema = Type.Object(
  {
    data: ChatMessageProjectionSchema,
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.String({ format: 'uuid' }),
        replayed: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'ChatMessageCommandResponse', additionalProperties: false },
);

export type ChatMessageCommandResponse = Static<typeof ChatMessageCommandResponseSchema>;

const HiddenMessageProjectionSchema = Type.Object(
  {
    action: Type.Literal('HIDDEN_FOR_USER'),
    messageId: Type.String({ format: 'uuid' }),
    hiddenAt: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);

const ReportedMessageProjectionSchema = Type.Object(
  {
    action: Type.Literal('REPORTED'),
    messageId: Type.String({ format: 'uuid' }),
    reportId: Type.String({ format: 'uuid' }),
    state: Type.Literal('PENDING_CENTRAL'),
    caseId: Type.String({ format: 'uuid' }),
    caseState: Type.Literal('SUBMITTED'),
    reportedAt: Type.String({ format: 'date-time' }),
    version: Type.Integer({ minimum: 2 }),
  },
  { additionalProperties: false },
);

export const ChatMessageActionResponseSchema = Type.Object(
  {
    data: Type.Union([HiddenMessageProjectionSchema, ReportedMessageProjectionSchema]),
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.String({ format: 'uuid' }),
        replayed: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'ChatMessageActionResponse', additionalProperties: false },
);

export const CentralModerationCaseProjectionSchema = Type.Object(
  {
    caseId: Type.String({ format: 'uuid' }),
    caseType: Type.Union([Type.Literal('REPORT'), Type.Literal('SAFETY')]),
    state: Type.Union([
      Type.Literal('SUBMITTED'),
      Type.Literal('TRIAGED'),
      Type.Literal('UNDER_REVIEW'),
      Type.Literal('DECIDED'),
      Type.Literal('CLOSED'),
    ]),
    reportId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    chatId: Type.String({ format: 'uuid' }),
    messageId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    reporterUserId: Type.String({ format: 'uuid' }),
    subjectUserId: Type.String({ format: 'uuid' }),
    reasonCode: Type.String({ minLength: 1, maxLength: 80 }),
    evidenceSnapshot: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
    challengeId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    bookingId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    sessionId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    initialDueAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    finalDueAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    assignedReviewerUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    reviewStartedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    challengeVersion: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    schedulingDeadlineAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    holdId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    holdState: Type.Union([
      Type.Literal('ACTIVE'), Type.Literal('RELEASED'), Type.Null(),
    ]),
    holdStartedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    holdVersion: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    originalCoachUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    originalVenueId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    viewerCanStartReview: Type.Boolean(),
    viewerCanResolve: Type.Boolean(),
    viewerHasReviewerConflict: Type.Boolean(),
    replacementCoachOptions: Type.Array(Type.Object({
      userId: Type.String({ format: 'uuid' }),
      displayName: Type.String({ minLength: 1 }),
      venueId: Type.String({ format: 'uuid' }),
    }, { additionalProperties: false })),
    replacementVenueOptions: Type.Array(Type.Object({
      venueId: Type.String({ format: 'uuid' }),
      displayName: Type.String({ minLength: 1 }),
    }, { additionalProperties: false })),
    submittedAt: Type.String({ format: 'date-time' }),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'CentralModerationCaseProjection', additionalProperties: false },
);

export type CentralModerationCaseContract = Static<typeof CentralModerationCaseProjectionSchema>;

export const CentralModerationCaseListResponseSchema = Type.Object(
  {
    data: Type.Array(CentralModerationCaseProjectionSchema),
    meta: Type.Object(
      { requestId: Type.String({ format: 'uuid' }) },
      { additionalProperties: false },
    ),
  },
  { $id: 'CentralModerationCaseListResponse', additionalProperties: false },
);

export type CentralModerationCaseListResponse = Static<typeof CentralModerationCaseListResponseSchema>;

export const StartSafetyCaseReviewBodySchema = Type.Object({}, { additionalProperties: false });
export type StartSafetyCaseReviewBody = Static<typeof StartSafetyCaseReviewBodySchema>;

export const SafetyReplacementRemedySchema = Type.Union([
  Type.Literal('REPLACE_COACH'),
  Type.Literal('REPLACE_VENUE'),
  Type.Literal('REPLACE_COACH_AND_VENUE'),
]);

export const SafetyCaseRemedySchema = Type.Union([
  SafetyReplacementRemedySchema,
  Type.Literal('FORFEIT_BY_ENFORCEMENT'),
  Type.Literal('ACCOUNT_RESTRICTION'),
]);

export const SafetyAccountRestrictionCategorySchema = Type.Union([
  Type.Literal('VIOLENCE'),
  Type.Literal('FRAUD'),
  Type.Literal('IDENTITY_ABUSE'),
  Type.Literal('ILLEGAL_USE'),
]);

export const ResolveSafetyCaseBodySchema = Type.Object({
  remedyCode: SafetyCaseRemedySchema,
  replacementCoachUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  replacementVenueId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  causalLinkConfirmed: Type.Optional(Type.Boolean()),
  restrictionCategoryCode: Type.Optional(SafetyAccountRestrictionCategorySchema),
  seriousCategoryConfirmed: Type.Optional(Type.Boolean()),
  consequencesConfirmed: Type.Optional(Type.Boolean()),
  reason: Type.String({ minLength: 10, maxLength: 1000 }),
  expectedChallengeVersion: Type.Integer({ minimum: 1 }),
  expectedHoldVersion: Type.Integer({ minimum: 1 }),
}, { additionalProperties: false });
export type ResolveSafetyCaseBody = Static<typeof ResolveSafetyCaseBodySchema>;

const SafetyReviewStartedProjectionSchema = Type.Object({
  action: Type.Literal('SAFETY_REVIEW_STARTED'),
  caseId: Type.String({ format: 'uuid' }),
  state: Type.Literal('UNDER_REVIEW'),
  assignedReviewerUserId: Type.String({ format: 'uuid' }),
  reviewStartedAt: Type.String({ format: 'date-time' }),
  challengeId: Type.String({ format: 'uuid' }),
  challengeVersion: Type.Integer({ minimum: 1 }),
  holdId: Type.String({ format: 'uuid' }),
  holdVersion: Type.Integer({ minimum: 1 }),
  version: Type.Integer({ minimum: 2 }),
}, { additionalProperties: false });

const SafetyReplacementAppliedProjectionSchema = Type.Object({
  action: Type.Literal('SAFETY_REPLACEMENT_APPLIED'),
  caseId: Type.String({ format: 'uuid' }),
  state: Type.Literal('CLOSED'),
  decisionId: Type.String({ format: 'uuid' }),
  remedyCode: SafetyReplacementRemedySchema,
  replacementCoachUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  replacementVenueId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  challengeId: Type.String({ format: 'uuid' }),
  challengeState: Type.Literal('ACCEPTED_UNSCHEDULED'),
  schedulingDeadlineAt: Type.String({ format: 'date-time' }),
  challengeVersion: Type.Integer({ minimum: 1 }),
  holdId: Type.String({ format: 'uuid' }),
  holdState: Type.Literal('RELEASED'),
  holdVersion: Type.Integer({ minimum: 2 }),
  releasedAt: Type.String({ format: 'date-time' }),
  version: Type.Integer({ minimum: 3 }),
}, { additionalProperties: false });

const SafetyEnforcementForfeitAppliedProjectionSchema = Type.Object({
  action: Type.Literal('SAFETY_ENFORCEMENT_FORFEIT_APPLIED'),
  caseId: Type.String({ format: 'uuid' }),
  state: Type.Literal('CLOSED'),
  decisionId: Type.String({ format: 'uuid' }),
  remedyCode: Type.Literal('FORFEIT_BY_ENFORCEMENT'),
  resultId: Type.String({ format: 'uuid' }),
  challengeId: Type.String({ format: 'uuid' }),
  challengeState: Type.Literal('RESULT_RECORDED'),
  challengeVersion: Type.Integer({ minimum: 1 }),
  loserUserId: Type.String({ format: 'uuid' }),
  winnerUserId: Type.String({ format: 'uuid' }),
  appealDeadlineAt: Type.String({ format: 'date-time' }),
  holdId: Type.String({ format: 'uuid' }),
  holdState: Type.Literal('RELEASED'),
  holdVersion: Type.Integer({ minimum: 2 }),
  releasedAt: Type.String({ format: 'date-time' }),
  version: Type.Integer({ minimum: 3 }),
}, { additionalProperties: false });

const SafetyAccountRestrictionAppliedProjectionSchema = Type.Object({
  action: Type.Literal('SAFETY_ACCOUNT_RESTRICTION_APPLIED'),
  caseId: Type.String({ format: 'uuid' }),
  state: Type.Literal('CLOSED'),
  decisionId: Type.String({ format: 'uuid' }),
  remedyCode: Type.Literal('ACCOUNT_RESTRICTION'),
  enforcementId: Type.String({ format: 'uuid' }),
  subjectUserId: Type.String({ format: 'uuid' }),
  categoryCode: SafetyAccountRestrictionCategorySchema,
  accountState: Type.Literal('RESTRICTED'),
  appealDeadlineAt: Type.String({ format: 'date-time' }),
  challengeId: Type.String({ format: 'uuid' }),
  challengeState: Type.Literal('BOOKED'),
  challengeVersion: Type.Integer({ minimum: 1 }),
  holdId: Type.String({ format: 'uuid' }),
  holdState: Type.Literal('ACTIVE'),
  holdVersion: Type.Integer({ minimum: 1 }),
  competitionId: Type.String({ format: 'uuid' }),
  subjectStatus: Type.Union([
    Type.Literal('CHAMPION'), Type.Literal('CONTENDER'), Type.Null(),
  ]),
  statusReviewHoldId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  version: Type.Integer({ minimum: 3 }),
}, { additionalProperties: false });

export const SafetyCaseReviewCommandResponseSchema = Type.Object({
  data: Type.Union([
    SafetyReviewStartedProjectionSchema,
    SafetyReplacementAppliedProjectionSchema,
    SafetyEnforcementForfeitAppliedProjectionSchema,
    SafetyAccountRestrictionAppliedProjectionSchema,
  ]),
  meta: Type.Object({
    requestId: Type.String({ format: 'uuid' }),
    eventId: Type.String({ format: 'uuid' }),
    replayed: Type.Boolean(),
  }, { additionalProperties: false }),
}, { $id: 'SafetyCaseReviewCommandResponse', additionalProperties: false });
export type SafetyCaseReviewCommandResponse = Static<typeof SafetyCaseReviewCommandResponseSchema>;

export type ChatMessageActionResponse = Static<typeof ChatMessageActionResponseSchema>;

const ChallengeStateSchema = Type.Union([
  Type.Literal('AWAITING_RESPONSE'),
  Type.Literal('ACCEPTED_UNSCHEDULED'),
  Type.Literal('BOOKING_PENDING'),
  Type.Literal('BOOKED'),
  Type.Literal('IN_SESSION'),
  Type.Literal('RESULT_PENDING'),
  Type.Literal('RESULT_RECORDED'),
  Type.Literal('UNDER_APPEAL'),
  Type.Literal('COMPLETED'),
  Type.Literal('DECLINED'),
  Type.Literal('WITHDRAWN'),
  Type.Literal('CANCELLED_NO_FAULT'),
  Type.Literal('EXPIRED_NO_FAULT'),
]);

const ChallengeConflictCodeSchema = Type.Union([
  Type.Literal('ACCOUNT_NOT_ACTIVE'),
  Type.Literal('ACCOUNT_NOT_VERIFIED'),
  Type.Literal('AGE_CONTOUR_MISMATCH'),
  Type.Literal('COMMUNITY_NOT_ACTIVE'),
  Type.Literal('MEMBERSHIP_NOT_ACTIVE'),
  Type.Literal('COMPETITION_NOT_ACTIVE'),
  Type.Literal('MATCH_REQUIRED'),
  Type.Literal('PAIR_MATRIX_DENIED'),
  Type.Literal('PAIR_CHALLENGE_EXISTS'),
  Type.Literal('PAIR_BLOCKED'),
  Type.Literal('PAIR_COOLDOWN_ACTIVE'),
  Type.Literal('OPTIONAL_INVITE_LIMIT'),
  Type.Literal('OPTIONAL_PAIR_QUIET'),
  Type.Literal('OFFICIAL_OBLIGATION_LIMIT'),
  Type.Literal('YOUTH_OFFICIAL_DISABLED'),
  Type.Literal('RULESET_ACK_REQUIRED'),
  Type.Literal('CHALLENGE_NOT_AWAITING_RESPONSE'),
  Type.Literal('CHALLENGE_INITIATOR_REQUIRED'),
  Type.Literal('CHALLENGE_RECIPIENT_REQUIRED'),
  Type.Literal('CHALLENGE_RESPONSE_EXPIRED'),
  Type.Literal('CHALLENGE_RESPONSE_NOT_DUE'),
  Type.Literal('CHALLENGE_NOT_ACCEPTED'),
  Type.Literal('CHALLENGE_BOOKING_NOT_PENDING'),
  Type.Literal('CHALLENGE_NOT_BOOKED'),
  Type.Literal('CHALLENGE_NOT_IN_SESSION'),
  Type.Literal('CHALLENGE_SESSION_MISMATCH'),
  Type.Literal('CHALLENGE_COMPETITIVE_SNAPSHOT_MISSING'),
  Type.Literal('CHALLENGE_SCHEDULING_DEADLINE_REACHED'),
  Type.Literal('CHALLENGE_SCHEDULING_NOT_DUE'),
  Type.Literal('CHALLENGE_PARTICIPANT_REQUIRED'),
  Type.Literal('CHALLENGE_OBLIGATION_MISSING'),
  Type.Literal('CHALLENGE_RESCHEDULE_NOT_ALLOWED'),
  Type.Literal('CHALLENGE_RESCHEDULE_LIMIT_REACHED'),
  Type.Literal('CHALLENGE_RESCHEDULE_FORFEIT_CONFIRMATION_REQUIRED'),
  Type.Literal('CHALLENGE_MUTUAL_RESCHEDULE_NOT_ALLOWED'),
  Type.Literal('CHALLENGE_MUTUAL_RESCHEDULE_REQUEST_EXISTS'),
  Type.Literal('CHALLENGE_MUTUAL_RESCHEDULE_PEER_REQUIRED'),
]);

export const ScheduleMutationReasonCodeSchema = Type.Union([
  Type.Literal('COACH_UNAVAILABLE'),
  Type.Literal('VENUE_UNAVAILABLE'),
  Type.Literal('SCHEDULE_CHANGED'),
  Type.Literal('OTHER'),
]);

export const MutualChallengeRescheduleRequestSchema = Type.Object(
  {
    requestId: Type.String({ format: 'uuid' }),
    challengeId: Type.String({ format: 'uuid' }),
    bookingId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    sessionId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    proposedByUserId: Type.String({ format: 'uuid' }),
    confirmedByUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    reasonCode: ScheduleMutationReasonCodeSchema,
    state: Type.Union([Type.Literal('PROPOSED'), Type.Literal('CONFIRMED')]),
    proposedAt: Type.String({ format: 'date-time' }),
    confirmedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    version: Type.Integer({ minimum: 1, maximum: 2 }),
  },
  { $id: 'MutualChallengeRescheduleRequest', additionalProperties: false },
);

export type MutualChallengeRescheduleRequestContract = Static<
  typeof MutualChallengeRescheduleRequestSchema
>;

export const ChallengeProjectionSchema = Type.Object(
  {
    challengeId: Type.String({ format: 'uuid' }),
    sourceChatId: Type.String({ format: 'uuid' }),
    serviceChatId: Type.String({ format: 'uuid' }),
    initiatorUserId: Type.String({ format: 'uuid' }),
    initiatorDisplayName: Type.String({ minLength: 1, maxLength: 80 }),
    recipientUserId: Type.String({ format: 'uuid' }),
    recipientDisplayName: Type.String({ minLength: 1, maxLength: 80 }),
    responsePolicy: Type.Union([
      Type.Literal('OPTIONAL'),
      Type.Literal('MANDATORY'),
      Type.Literal('MUTUAL_GENESIS'),
    ]),
    stake: Type.Union([
      Type.Literal('NONE'),
      Type.Literal('CONTENDER'),
      Type.Literal('TITLE'),
      Type.Literal('GENESIS_CHAMPION'),
      Type.Literal('GENESIS_CONTENDER'),
    ]),
    state: ChallengeStateSchema,
    rulesetRef: Type.String({ minLength: 1 }),
    rulesetAckMode: Type.Union([
      Type.Literal('IMPLICIT_ON_ACCEPT'),
      Type.Literal('EXPLICIT_ACK_REQUIRED'),
    ]),
    responseDeadlineAt: Type.String({ format: 'date-time' }),
    acceptedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    schedulingDeadlineAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    userRescheduleCount: Type.Integer({ minimum: 0, maximum: 2 }),
    pairQuietUntil: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    viewerRole: Type.Union([Type.Literal('INITIATOR'), Type.Literal('RECIPIENT')]),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'ChallengeProjection', additionalProperties: false },
);

export type ChallengeContract = Static<typeof ChallengeProjectionSchema>;

export const ChatChallengeResponseSchema = Type.Object(
  {
    data: Type.Object(
      {
        challenge: Type.Union([ChallengeProjectionSchema, Type.Null()]),
        mutualRescheduleRequest: Type.Union([
          MutualChallengeRescheduleRequestSchema,
          Type.Null(),
        ]),
        canCreate: Type.Boolean(),
        createDenialCode: Type.Union([ChallengeConflictCodeSchema, Type.Null()]),
        createRetryAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
        policyVersion: Type.Literal('challenge-mvp-v1'),
      },
      { additionalProperties: false },
    ),
    meta: Type.Object(
      { requestId: Type.String({ format: 'uuid' }) },
      { additionalProperties: false },
    ),
  },
  { $id: 'ChatChallengeResponse', additionalProperties: false },
);

export type ChatChallengeResponse = Static<typeof ChatChallengeResponseSchema>;

export const CreateDirectChallengeBodySchema = Type.Object(
  { sourceChatId: Type.String({ format: 'uuid' }) },
  { $id: 'CreateDirectChallengeBody', additionalProperties: false },
);

export type CreateDirectChallengeBody = Static<typeof CreateDirectChallengeBodySchema>;

export const RespondToChallengeBodySchema = Type.Object(
  { explicitRulesetAcknowledged: Type.Optional(Type.Boolean()) },
  { $id: 'RespondToChallengeBody', additionalProperties: false },
);

export type RespondToChallengeBody = Static<typeof RespondToChallengeBodySchema>;

export const ConfirmMutualChallengeRescheduleBodySchema = Type.Object(
  { requestVersion: Type.Integer({ minimum: 1 }) },
  { $id: 'ConfirmMutualChallengeRescheduleBody', additionalProperties: false },
);

export type ConfirmMutualChallengeRescheduleBody = Static<
  typeof ConfirmMutualChallengeRescheduleBodySchema
>;

export const MutualChallengeRescheduleRequestResponseSchema = Type.Object(
  {
    data: MutualChallengeRescheduleRequestSchema,
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.String({ format: 'uuid' }),
        replayed: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'MutualChallengeRescheduleRequestResponse', additionalProperties: false },
);

export type MutualChallengeRescheduleRequestResponse = Static<
  typeof MutualChallengeRescheduleRequestResponseSchema
>;

export const ChallengeCommandResponseSchema = Type.Object(
  {
    data: ChallengeProjectionSchema,
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.String({ format: 'uuid' }),
        replayed: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'ChallengeCommandResponse', additionalProperties: false },
);

export type ChallengeCommandResponse = Static<typeof ChallengeCommandResponseSchema>;

export const YouthConsentStateSchema = Type.Union([
  Type.Literal('PENDING'),
  Type.Literal('GRANTED'),
  Type.Literal('DECLINED'),
  Type.Literal('REVOKED'),
  Type.Literal('EXPIRED'),
]);

export const YouthConsentProjectionSchema = Type.Object(
  {
    consentId: Type.String({ format: 'uuid' }),
    challengeId: Type.String({ format: 'uuid' }),
    athleteUserId: Type.String({ format: 'uuid' }),
    policyVersion: Type.Literal('youth-consent-mvp-v1'),
    state: YouthConsentStateSchema,
    channel: Type.Union([Type.Literal('EMAIL'), Type.Literal('SMS')]),
    maskedContact: Type.String({ minLength: 3, maxLength: 160 }),
    expiresAt: Type.String({ format: 'date-time' }),
    decidedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    revokedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'YouthConsentProjection', additionalProperties: false },
);

export type YouthConsentContract = Static<typeof YouthConsentProjectionSchema>;

export const YouthConsentSummaryResponseSchema = Type.Object(
  {
    data: Type.Object(
      {
        challengeId: Type.String({ format: 'uuid' }),
        featureEnabled: Type.Boolean(),
        viewerAgeDivision: Type.Union([Type.Literal('YOUTH'), Type.Literal('ADULT')]),
        requiredCount: Type.Integer({ minimum: 0, maximum: 2 }),
        grantedCount: Type.Integer({ minimum: 0, maximum: 2 }),
        ready: Type.Boolean(),
        consents: Type.Array(Type.Object(
          {
            athleteUserId: Type.String({ format: 'uuid' }),
            state: Type.Union([YouthConsentStateSchema, Type.Literal('NOT_REQUESTED')]),
            maskedContact: Type.Union([Type.String({ minLength: 3, maxLength: 160 }), Type.Null()]),
            expiresAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
            version: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
          },
          { additionalProperties: false },
        )),
        policyVersion: Type.Literal('youth-consent-mvp-v1'),
      },
      { additionalProperties: false },
    ),
    meta: Type.Object(
      { requestId: Type.String({ format: 'uuid' }) },
      { additionalProperties: false },
    ),
  },
  { $id: 'YouthConsentSummaryResponse', additionalProperties: false },
);

export type YouthConsentSummaryResponse = Static<typeof YouthConsentSummaryResponseSchema>;

export const RequestYouthConsentBodySchema = Type.Object(
  {
    channel: Type.Union([Type.Literal('EMAIL'), Type.Literal('SMS')]),
    guardianContact: Type.String({ minLength: 3, maxLength: 160 }),
    smsOptIn: Type.Optional(Type.Boolean()),
  },
  { $id: 'RequestYouthConsentBody', additionalProperties: false },
);

export type RequestYouthConsentBody = Static<typeof RequestYouthConsentBodySchema>;

export const YouthConsentCommandResponseSchema = Type.Object(
  {
    data: YouthConsentProjectionSchema,
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.String({ format: 'uuid' }),
        replayed: Type.Boolean(),
        developmentActionUrl: Type.Optional(Type.String({ minLength: 1 })),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'YouthConsentCommandResponse', additionalProperties: false },
);

export type YouthConsentCommandResponse = Static<typeof YouthConsentCommandResponseSchema>;

export const PublicYouthConsentProjectionSchema = Type.Object(
  {
    consentId: Type.String({ format: 'uuid' }),
    challengeId: Type.String({ format: 'uuid' }),
    athleteUserId: Type.String({ format: 'uuid' }),
    policyVersion: Type.Literal('youth-consent-mvp-v1'),
    state: YouthConsentStateSchema,
    channel: Type.Union([Type.Literal('EMAIL'), Type.Literal('SMS')]),
    maskedContact: Type.String({ minLength: 3, maxLength: 160 }),
    expiresAt: Type.String({ format: 'date-time' }),
    decidedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    revokedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    version: Type.Integer({ minimum: 1 }),
    athleteDisplayName: Type.String({ minLength: 1, maxLength: 80 }),
    challengeState: Type.String({ minLength: 1, maxLength: 80 }),
    canGrant: Type.Boolean(),
    canDecline: Type.Boolean(),
    canRevoke: Type.Boolean(),
  },
  { $id: 'PublicYouthConsentProjection', additionalProperties: false },
);

export type PublicYouthConsentContract = Static<typeof PublicYouthConsentProjectionSchema>;

export const PublicYouthConsentResponseSchema = Type.Object(
  {
    data: PublicYouthConsentProjectionSchema,
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.Optional(Type.String({ format: 'uuid' })),
        replayed: Type.Optional(Type.Boolean()),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'PublicYouthConsentResponse', additionalProperties: false },
);

export type PublicYouthConsentResponse = Static<typeof PublicYouthConsentResponseSchema>;

export const DecideYouthConsentBodySchema = Type.Object(
  {
    guardianDisplayName: Type.Optional(Type.String({ minLength: 2, maxLength: 120 })),
    relationship: Type.Optional(Type.String({ minLength: 2, maxLength: 80 })),
    consentTextAccepted: Type.Optional(Type.Boolean()),
  },
  { $id: 'DecideYouthConsentBody', additionalProperties: false },
);

export type DecideYouthConsentBody = Static<typeof DecideYouthConsentBodySchema>;

export const ResultOutcomeCodeSchema = Type.Union([
  Type.Literal('WIN_A'),
  Type.Literal('WIN_B'),
  Type.Literal('DRAW'),
  Type.Literal('NO_CONTEST'),
  Type.Literal('FORFEIT'),
  Type.Literal('NO_SHOW'),
]);

export const ResultStateSchema = Type.Union([
  Type.Literal('RECORDED'),
  Type.Literal('UNDER_APPEAL'),
  Type.Literal('FINAL'),
  Type.Literal('REVERSED'),
  Type.Literal('ANNULLED'),
  Type.Literal('REPEAT_ORDERED'),
]);

export const StatusTransitionTypeSchema = Type.Union([
  Type.Literal('NONE'),
  Type.Literal('GENESIS_APPLIED'),
  Type.Literal('GENESIS_APPLIED_WITH_VACANCY'),
  Type.Literal('CONTENDER_ASSIGNED'),
  Type.Literal('CONTENDER_TRANSFERRED'),
  Type.Literal('CONTENDER_DEFENDED'),
  Type.Literal('TITLE_TRANSFERRED'),
  Type.Literal('TITLE_DEFENDED'),
]);

const CompetitionStatusSnapshotSchema = Type.Object(
  {
    championUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    contenderUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    statusVersion: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const ResultProjectionSchema = Type.Object(
  {
    resultId: Type.String({ format: 'uuid' }),
    challengeId: Type.String({ format: 'uuid' }),
    sessionId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    state: ResultStateSchema,
    outcomeCode: ResultOutcomeCodeSchema,
    recordedOutcomeCode: ResultOutcomeCodeSchema,
    winnerUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    winnerDisplayName: Type.Union([Type.String({ minLength: 1, maxLength: 80 }), Type.Null()]),
    loserUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    loserDisplayName: Type.Union([Type.String({ minLength: 1, maxLength: 80 }), Type.Null()]),
    recordedWinnerUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    recordedLoserUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    technicalCorrectionDecisionId: Type.Union([
      Type.String({ format: 'uuid' }), Type.Null(),
    ]),
    reasonCode: Type.Union([Type.String({ minLength: 1, maxLength: 80 }), Type.Null()]),
    comment: Type.Union([Type.String({ minLength: 1, maxLength: 500 }), Type.Null()]),
    methodCode: Type.Union([Type.String({ minLength: 1, maxLength: 80 }), Type.Null()]),
    methodText: Type.Union([Type.String({ minLength: 1, maxLength: 500 }), Type.Null()]),
    scorePayload: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
    methodPayload: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
    recordedMethodCode: Type.Union([Type.String({ minLength: 1, maxLength: 80 }), Type.Null()]),
    recordedMethodText: Type.Union([Type.String({ minLength: 1, maxLength: 500 }), Type.Null()]),
    recordedScorePayload: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
    recordedMethodPayload: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
    latestMetadataRevisionId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    metadataRevisionCount: Type.Integer({ minimum: 0 }),
    metadataRevisionDeadlineAt: Type.String({ format: 'date-time' }),
    viewerCanReviseMetadata: Type.Boolean(),
    recordedAt: Type.String({ format: 'date-time' }),
    appealDeadlineAt: Type.String({ format: 'date-time' }),
    finalizedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    decision: Type.Union([
      Type.Literal('UPHOLD'), Type.Literal('REVERSE'), Type.Literal('ANNUL'),
      Type.Literal('REPEAT'), Type.Null(),
    ]),
    decisionReason: Type.Union([Type.String({ minLength: 1, maxLength: 2000 }), Type.Null()]),
    statusTransitionType: StatusTransitionTypeSchema,
    statusBefore: CompetitionStatusSnapshotSchema,
    statusAfter: CompetitionStatusSnapshotSchema,
    provisional: Type.Boolean(),
    integrityReviewState: Type.Union([Type.String({ minLength: 1, maxLength: 40 }), Type.Null()]),
    integrityReviewCategory: Type.Union([Type.String({ minLength: 1, maxLength: 40 }), Type.Null()]),
    viewerCanAppeal: Type.Boolean(),
    viewerCanWaiveAppeal: Type.Boolean(),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'ResultProjection', additionalProperties: false },
);

export type ResultContract = Static<typeof ResultProjectionSchema>;

export const RecordSessionResultBodySchema = Type.Object(
  {
    sessionId: Type.String({ format: 'uuid' }),
    outcomeCode: ResultOutcomeCodeSchema,
    winnerUserId: Type.Optional(Type.Union([Type.String({ format: 'uuid' }), Type.Null()])),
    reasonCode: Type.Optional(Type.Union([Type.String({ minLength: 1, maxLength: 80 }), Type.Null()])),
    comment: Type.Optional(Type.Union([Type.String({ minLength: 1, maxLength: 500 }), Type.Null()])),
    methodCode: Type.Optional(Type.Union([Type.String({ minLength: 1, maxLength: 80 }), Type.Null()])),
    methodText: Type.Optional(Type.Union([Type.String({ minLength: 1, maxLength: 500 }), Type.Null()])),
    scorePayload: Type.Optional(Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()])),
    methodPayload: Type.Optional(Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()])),
  },
  { $id: 'RecordSessionResultBody', additionalProperties: false },
);

export type RecordSessionResultBody = Static<typeof RecordSessionResultBodySchema>;

export const ReviseResultMetadataBodySchema = Type.Object(
  {
    methodCode: Type.Optional(Type.Union([
      Type.String({ minLength: 1, maxLength: 80 }), Type.Null(),
    ])),
    methodText: Type.Optional(Type.Union([
      Type.String({ minLength: 1, maxLength: 500 }), Type.Null(),
    ])),
    scorePayload: Type.Optional(Type.Union([
      Type.Record(Type.String(), Type.Unknown()), Type.Null(),
    ])),
    methodPayload: Type.Optional(Type.Union([
      Type.Record(Type.String(), Type.Unknown()), Type.Null(),
    ])),
  },
  { $id: 'ReviseResultMetadataBody', additionalProperties: false, minProperties: 1 },
);

export type ReviseResultMetadataBody = Static<typeof ReviseResultMetadataBodySchema>;

export const SubmitResultAppealBodySchema = Type.Object(
  {
    reasonCode: Type.String({ minLength: 1, maxLength: 80 }),
    statement: Type.String({ minLength: 1, maxLength: 2000 }),
  },
  { $id: 'SubmitResultAppealBody', additionalProperties: false },
);

export type SubmitResultAppealBody = Static<typeof SubmitResultAppealBodySchema>;

export const WaiveResultAppealBodySchema = Type.Object(
  {},
  { $id: 'WaiveResultAppealBody', additionalProperties: false },
);

export type WaiveResultAppealBody = Static<typeof WaiveResultAppealBodySchema>;

export const AppealStateSchema = Type.Union([
  Type.Literal('SUBMITTED'),
  Type.Literal('UNDER_REVIEW'),
  Type.Literal('WITHDRAWN'),
  Type.Literal('DECIDED_UPHELD'),
  Type.Literal('DECIDED_REVERSED'),
  Type.Literal('DECIDED_ANNULLED'),
  Type.Literal('DECIDED_REPEAT'),
]);

export const AppealDecisionSchema = Type.Union([
  Type.Literal('UPHOLD'),
  Type.Literal('REVERSE'),
  Type.Literal('ANNUL'),
  Type.Literal('REPEAT'),
]);

export const AppealResponseSchema = Type.Object(
  {
    responseId: Type.String({ format: 'uuid' }),
    responderUserId: Type.String({ format: 'uuid' }),
    responderDisplayName: Type.String({ minLength: 1, maxLength: 80 }),
    responderRole: Type.Union([Type.Literal('OPPONENT'), Type.Literal('COACH')]),
    statement: Type.String({ minLength: 1, maxLength: 2000 }),
    submittedAt: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);

export const AppealSlaExtensionSchema = Type.Object(
  {
    durationHours: Type.Union([Type.Literal(24), Type.Literal(48)]),
    reason: Type.String({ minLength: 1, maxLength: 2000 }),
    extendedBy: Type.String({ format: 'uuid' }),
    extendedAt: Type.String({ format: 'date-time' }),
    previousDueAt: Type.String({ format: 'date-time' }),
    extendedDueAt: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);

export const AppealProjectionSchema = Type.Object(
  {
    appealId: Type.String({ format: 'uuid' }),
    resultId: Type.String({ format: 'uuid' }),
    challengeId: Type.String({ format: 'uuid' }),
    state: AppealStateSchema,
    appellantUserId: Type.String({ format: 'uuid' }),
    appellantDisplayName: Type.String({ minLength: 1, maxLength: 80 }),
    reasonCode: Type.String({ minLength: 1, maxLength: 80 }),
    statement: Type.String({ minLength: 1, maxLength: 2000 }),
    submittedAt: Type.String({ format: 'date-time' }),
    responseDeadlineAt: Type.String({ format: 'date-time' }),
    responses: Type.Array(AppealResponseSchema),
    originalSlaDueAt: Type.String({ format: 'date-time' }),
    slaDueAt: Type.String({ format: 'date-time' }),
    slaExtension: Type.Union([AppealSlaExtensionSchema, Type.Null()]),
    withdrawnAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    assignedReviewerUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    reviewStartedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    decision: Type.Union([AppealDecisionSchema, Type.Null()]),
    decisionReason: Type.Union([Type.String({ minLength: 1, maxLength: 2000 }), Type.Null()]),
    decidedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    resultState: ResultStateSchema,
    recordedOutcomeCode: ResultOutcomeCodeSchema,
    effectiveOutcomeCode: Type.Union([ResultOutcomeCodeSchema, Type.Null()]),
    recordedWinnerUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    effectiveWinnerUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    participantUserIds: Type.Tuple([
      Type.String({ format: 'uuid' }), Type.String({ format: 'uuid' }),
    ]),
    coachUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    viewerCanStartReview: Type.Boolean(),
    viewerCanDecide: Type.Boolean(),
    viewerCanRespond: Type.Boolean(),
    viewerCanWithdraw: Type.Boolean(),
    viewerCanExtendSla: Type.Boolean(),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'AppealProjection', additionalProperties: false },
);

export type AppealContract = Static<typeof AppealProjectionSchema>;

export const StartAppealReviewBodySchema = Type.Object(
  {},
  { $id: 'StartAppealReviewBody', additionalProperties: false },
);

export type StartAppealReviewBody = Static<typeof StartAppealReviewBodySchema>;

export const DecideAppealBodySchema = Type.Object(
  {
    decision: AppealDecisionSchema,
    reason: Type.String({ minLength: 1, maxLength: 2000 }),
  },
  { $id: 'DecideAppealBody', additionalProperties: false },
);

export type DecideAppealBody = Static<typeof DecideAppealBodySchema>;

export const AddAppealResponseBodySchema = Type.Object(
  { statement: Type.String({ minLength: 1, maxLength: 2000 }) },
  { $id: 'AddAppealResponseBody', additionalProperties: false },
);
export type AddAppealResponseBody = Static<typeof AddAppealResponseBodySchema>;

export const WithdrawAppealBodySchema = Type.Object(
  {},
  { $id: 'WithdrawAppealBody', additionalProperties: false },
);
export type WithdrawAppealBody = Static<typeof WithdrawAppealBodySchema>;

export const ExtendAppealSlaBodySchema = Type.Object(
  {
    durationHours: Type.Union([Type.Literal(24), Type.Literal(48)]),
    reason: Type.String({ minLength: 1, maxLength: 2000 }),
  },
  { $id: 'ExtendAppealSlaBody', additionalProperties: false },
);
export type ExtendAppealSlaBody = Static<typeof ExtendAppealSlaBodySchema>;

export const AppealQueueResponseSchema = Type.Object(
  {
    data: Type.Array(AppealProjectionSchema),
    meta: Type.Object(
      { requestId: Type.String({ format: 'uuid' }) },
      { additionalProperties: false },
    ),
  },
  { $id: 'AppealQueueResponse', additionalProperties: false },
);

export type AppealQueueResponse = Static<typeof AppealQueueResponseSchema>;

export const AppealCommandResponseSchema = Type.Object(
  {
    data: AppealProjectionSchema,
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.String({ format: 'uuid' }),
        replayed: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'AppealCommandResponse', additionalProperties: false },
);

export type AppealCommandResponse = Static<typeof AppealCommandResponseSchema>;

export const AppealDetailResponseSchema = Type.Object(
  {
    data: AppealProjectionSchema,
    meta: Type.Object(
      { requestId: Type.String({ format: 'uuid' }) },
      { additionalProperties: false },
    ),
  },
  { $id: 'AppealDetailResponse', additionalProperties: false },
);
export type AppealDetailResponse = Static<typeof AppealDetailResponseSchema>;

export const MissingResultClaimOutcomeSchema = Type.Union([
  Type.Literal('WIN_A'), Type.Literal('WIN_B'), Type.Literal('DRAW'), Type.Literal('NO_CONTEST'),
]);

export const MissingResultReviewStateSchema = Type.Union([
  Type.Literal('OPEN'), Type.Literal('UNDER_REVIEW'), Type.Literal('REVIEWER_ASSIGNED'),
  Type.Literal('RESOLVED'), Type.Literal('REPEAT_ORDERED'),
]);

export const MissingResultStatementSchema = Type.Object({
  statementId: Type.String({ format: 'uuid' }),
  athleteUserId: Type.String({ format: 'uuid' }),
  athleteDisplayName: Type.String({ minLength: 1, maxLength: 80 }),
  outcomeCode: MissingResultClaimOutcomeSchema,
  winnerUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  statement: Type.String({ minLength: 1, maxLength: 2000 }),
  submittedAt: Type.String({ format: 'date-time' }),
}, { additionalProperties: false });

export const MissingResultReviewProjectionSchema = Type.Object({
  reviewId: Type.String({ format: 'uuid' }),
  challengeId: Type.String({ format: 'uuid' }),
  sessionId: Type.String({ format: 'uuid' }),
  state: MissingResultReviewStateSchema,
  venueId: Type.String({ format: 'uuid' }),
  venueDisplayName: Type.String({ minLength: 1, maxLength: 160 }),
  originalCoachUserId: Type.String({ format: 'uuid' }),
  originalCoachDisplayName: Type.String({ minLength: 1, maxLength: 80 }),
  participantUserIds: Type.Tuple([Type.String({ format: 'uuid' }), Type.String({ format: 'uuid' })]),
  participantDisplayNames: Type.Tuple([
    Type.String({ minLength: 1, maxLength: 80 }), Type.String({ minLength: 1, maxLength: 80 }),
  ]),
  openedAt: Type.String({ format: 'date-time' }),
  assignedCentralUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  reviewStartedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  assignedReviewerCoachUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  assignedReviewerCoachDisplayName: Type.Union([Type.String({ minLength: 1, maxLength: 80 }), Type.Null()]),
  allowedOutcomeCode: Type.Union([MissingResultClaimOutcomeSchema, Type.Null()]),
  allowedWinnerUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  assignmentReason: Type.Union([Type.String({ minLength: 1, maxLength: 2000 }), Type.Null()]),
  statements: Type.Array(MissingResultStatementSchema),
  venueConfirmation: Type.Union([Type.Object({
    attendanceConfirmed: Type.Boolean(),
    note: Type.String({ minLength: 1, maxLength: 2000 }),
    confirmedBy: Type.String({ format: 'uuid' }),
    confirmedAt: Type.String({ format: 'date-time' }),
  }, { additionalProperties: false }), Type.Null()]),
  resolution: Type.Union([Type.String({ minLength: 1, maxLength: 80 }), Type.Null()]),
  resolutionReason: Type.Union([Type.String({ minLength: 1, maxLength: 2000 }), Type.Null()]),
  resolvedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  challengeState: Type.String({ minLength: 1, maxLength: 80 }),
  challengeVersion: Type.Integer({ minimum: 1 }),
  reviewerCoachOptions: Type.Array(Type.Object({
    userId: Type.String({ format: 'uuid' }),
    displayName: Type.String({ minLength: 1, maxLength: 80 }),
  }, { additionalProperties: false })),
  viewerCanSubmitStatement: Type.Boolean(),
  viewerCanConfirmVenue: Type.Boolean(),
  viewerCanStartReview: Type.Boolean(),
  viewerCanAssignCoach: Type.Boolean(),
  viewerCanOrderRepeat: Type.Boolean(),
  viewerCanRecordConstrainedResult: Type.Boolean(),
  version: Type.Integer({ minimum: 1 }),
}, { $id: 'MissingResultReviewProjection', additionalProperties: false });

export type MissingResultReviewContract = Static<typeof MissingResultReviewProjectionSchema>;

export const MissingResultReviewResponseSchema = Type.Object({
  data: MissingResultReviewProjectionSchema,
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
}, { $id: 'MissingResultReviewResponse', additionalProperties: false });
export type MissingResultReviewResponse = Static<typeof MissingResultReviewResponseSchema>;

export const MissingResultReviewCommandResponseSchema = Type.Object({
  data: MissingResultReviewProjectionSchema,
  meta: Type.Object({
    requestId: Type.String({ format: 'uuid' }), eventId: Type.String({ format: 'uuid' }),
    replayed: Type.Boolean(),
  }, { additionalProperties: false }),
}, { $id: 'MissingResultReviewCommandResponse', additionalProperties: false });
export type MissingResultReviewCommandResponse = Static<typeof MissingResultReviewCommandResponseSchema>;

export const MissingResultReviewListResponseSchema = Type.Object({
  data: Type.Array(MissingResultReviewProjectionSchema),
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
}, { $id: 'MissingResultReviewListResponse', additionalProperties: false });
export type MissingResultReviewListResponse = Static<typeof MissingResultReviewListResponseSchema>;

export const SubmitMissingResultStatementBodySchema = Type.Object({
  outcomeCode: MissingResultClaimOutcomeSchema,
  statement: Type.String({ minLength: 1, maxLength: 2000 }),
}, { $id: 'SubmitMissingResultStatementBody', additionalProperties: false });
export type SubmitMissingResultStatementBody = Static<typeof SubmitMissingResultStatementBodySchema>;

export const ConfirmMissingResultVenueBodySchema = Type.Object({
  attendanceConfirmed: Type.Boolean(),
  note: Type.String({ minLength: 1, maxLength: 2000 }),
}, { $id: 'ConfirmMissingResultVenueBody', additionalProperties: false });
export type ConfirmMissingResultVenueBody = Static<typeof ConfirmMissingResultVenueBodySchema>;

export const AssignMissingResultCoachBodySchema = Type.Object({
  reviewerCoachUserId: Type.String({ format: 'uuid' }),
  repeatObjectivelyImpossible: Type.Boolean(),
  reason: Type.String({ minLength: 1, maxLength: 2000 }),
}, { $id: 'AssignMissingResultCoachBody', additionalProperties: false });
export type AssignMissingResultCoachBody = Static<typeof AssignMissingResultCoachBodySchema>;

export const OrderMissingResultRepeatBodySchema = Type.Object({
  reason: Type.String({ minLength: 1, maxLength: 2000 }),
}, { $id: 'OrderMissingResultRepeatBody', additionalProperties: false });
export type OrderMissingResultRepeatBody = Static<typeof OrderMissingResultRepeatBodySchema>;

export const StartMissingResultReviewBodySchema = Type.Object(
  {}, { $id: 'StartMissingResultReviewBody', additionalProperties: false },
);
export type StartMissingResultReviewBody = Static<typeof StartMissingResultReviewBodySchema>;

export const IntegrityCategorySchema = Type.Union([
  Type.Literal('FRAUD'), Type.Literal('SYSTEM_ERROR'), Type.Literal('IDENTITY_ERROR'),
]);
export const IntegrityCaseStateSchema = Type.Union([
  Type.Literal('OPEN'), Type.Literal('UNDER_REVIEW'), Type.Literal('DECIDED_UPHELD'),
  Type.Literal('DECIDED_CORRECTED'), Type.Literal('DECIDED_ANNULLED'),
]);
export const IntegrityDispositionSchema = Type.Union([
  Type.Literal('UPHOLD'), Type.Literal('CORRECT'), Type.Literal('ANNUL'), Type.Literal('REPEAT'),
]);
export const IntegrityCaseProjectionSchema = Type.Object({
  caseId: Type.String({ format: 'uuid' }),
  resultId: Type.String({ format: 'uuid' }),
  challengeId: Type.String({ format: 'uuid' }),
  competitionId: Type.String({ format: 'uuid' }),
  category: IntegrityCategorySchema,
  publicReasonCategory: IntegrityCategorySchema,
  evidenceReference: Type.Union([Type.String({ minLength: 1, maxLength: 500 }), Type.Null()]),
  internalReason: Type.Union([Type.String({ minLength: 1, maxLength: 2000 }), Type.Null()]),
  state: IntegrityCaseStateSchema,
  openedBy: Type.String({ format: 'uuid' }),
  openedAt: Type.String({ format: 'date-time' }),
  slaDueAt: Type.String({ format: 'date-time' }),
  assignedReviewerUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  reviewStartedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  requestedDisposition: Type.Union([IntegrityDispositionSchema, Type.Null()]),
  effectiveDisposition: Type.Union([IntegrityDispositionSchema, Type.Null()]),
  decisionReason: Type.Union([Type.String({ minLength: 1, maxLength: 2000 }), Type.Null()]),
  effectiveOutcomeCode: Type.Union([ResultOutcomeCodeSchema, Type.Null()]),
  effectiveWinnerUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  replayHash: Type.Union([Type.String({ minLength: 64, maxLength: 64 }), Type.Null()]),
  decidedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  participantUserIds: Type.Tuple([Type.String({ format: 'uuid' }), Type.String({ format: 'uuid' })]),
  participantDisplayNames: Type.Tuple([
    Type.String({ minLength: 1, maxLength: 80 }), Type.String({ minLength: 1, maxLength: 80 }),
  ]),
  originalCoachUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  viewerCanStartReview: Type.Boolean(),
  viewerCanDecide: Type.Boolean(),
  version: Type.Integer({ minimum: 1 }),
}, { $id: 'IntegrityCaseProjection', additionalProperties: false });
export type IntegrityCaseContract = Static<typeof IntegrityCaseProjectionSchema>;

export const IntegrityCaseResponseSchema = Type.Object({
  data: IntegrityCaseProjectionSchema,
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
}, { $id: 'IntegrityCaseResponse', additionalProperties: false });
export type IntegrityCaseResponse = Static<typeof IntegrityCaseResponseSchema>;

export const IntegrityCaseListResponseSchema = Type.Object({
  data: Type.Array(IntegrityCaseProjectionSchema),
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
}, { $id: 'IntegrityCaseListResponse', additionalProperties: false });
export type IntegrityCaseListResponse = Static<typeof IntegrityCaseListResponseSchema>;

export const IntegrityCaseCommandResponseSchema = Type.Object({
  data: IntegrityCaseProjectionSchema,
  meta: Type.Object({
    requestId: Type.String({ format: 'uuid' }), eventId: Type.String({ format: 'uuid' }),
    replayed: Type.Boolean(),
  }, { additionalProperties: false }),
}, { $id: 'IntegrityCaseCommandResponse', additionalProperties: false });
export type IntegrityCaseCommandResponse = Static<typeof IntegrityCaseCommandResponseSchema>;

export const EnforcementAppealStateSchema = Type.Union([
  Type.Literal('SUBMITTED'), Type.Literal('UNDER_REVIEW'), Type.Literal('DECIDED_REVOKED'),
]);
export const EnforcementAppealProjectionSchema = Type.Object({
  appealId: Type.String({ format: 'uuid' }),
  enforcementId: Type.String({ format: 'uuid' }),
  subjectUserId: Type.String({ format: 'uuid' }),
  state: EnforcementAppealStateSchema,
  statement: Type.String({ minLength: 10, maxLength: 2000 }),
  submittedAt: Type.String({ format: 'date-time' }),
  appealDeadlineAt: Type.String({ format: 'date-time' }),
  assignedReviewerUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  reviewStartedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  decisionReason: Type.Union([Type.String({ minLength: 10, maxLength: 2000 }), Type.Null()]),
  decidedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  enforcementState: Type.Union([Type.Literal('ACTIVE'), Type.Literal('REVOKED')]),
  enforcementVersion: Type.Integer({ minimum: 1 }),
  accountState: Type.Union([Type.Literal('ACTIVE'), Type.Literal('RESTRICTED'), Type.Literal('CLOSED')]),
  restrictionRemainsActive: Type.Boolean(),
  viewerCanStartReview: Type.Boolean(),
  viewerCanDecide: Type.Boolean(),
  version: Type.Integer({ minimum: 1 }),
}, { $id: 'EnforcementAppealProjection', additionalProperties: false });
export type EnforcementAppealContract = Static<typeof EnforcementAppealProjectionSchema>;

export const ActiveEnforcementAppealContextSchema = Type.Object({
  enforcementId: Type.String({ format: 'uuid' }),
  enforcementState: Type.Union([Type.Literal('ACTIVE'), Type.Literal('REVOKED')]),
  appealDeadlineAt: Type.String({ format: 'date-time' }),
  enforcementVersion: Type.Integer({ minimum: 1 }),
  accountState: Type.Union([Type.Literal('ACTIVE'), Type.Literal('RESTRICTED'), Type.Literal('CLOSED')]),
  restrictionRemainsActive: Type.Boolean(),
  appeal: Type.Union([EnforcementAppealProjectionSchema, Type.Null()]),
}, { $id: 'ActiveEnforcementAppealContext', additionalProperties: false });

export const MyEnforcementAppealResponseSchema = Type.Object({
  data: Type.Union([ActiveEnforcementAppealContextSchema, Type.Null()]),
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
}, { $id: 'MyEnforcementAppealResponse', additionalProperties: false });
export type MyEnforcementAppealResponse = Static<typeof MyEnforcementAppealResponseSchema>;

export const EnforcementAppealListResponseSchema = Type.Object({
  data: Type.Array(EnforcementAppealProjectionSchema),
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
}, { $id: 'EnforcementAppealListResponse', additionalProperties: false });
export type EnforcementAppealListResponse = Static<typeof EnforcementAppealListResponseSchema>;

export const EnforcementAppealCommandResponseSchema = Type.Object({
  data: EnforcementAppealProjectionSchema,
  meta: Type.Object({
    requestId: Type.String({ format: 'uuid' }), eventId: Type.String({ format: 'uuid' }),
    replayed: Type.Boolean(),
  }, { additionalProperties: false }),
}, { $id: 'EnforcementAppealCommandResponse', additionalProperties: false });
export type EnforcementAppealCommandResponse = Static<typeof EnforcementAppealCommandResponseSchema>;

export const SubmitEnforcementAppealBodySchema = Type.Object({
  statement: Type.String({ minLength: 10, maxLength: 2000 }),
}, { $id: 'SubmitEnforcementAppealBody', additionalProperties: false });
export type SubmitEnforcementAppealBody = Static<typeof SubmitEnforcementAppealBodySchema>;

export const StartEnforcementAppealReviewBodySchema = Type.Object(
  {}, { $id: 'StartEnforcementAppealReviewBody', additionalProperties: false },
);

export const RevokeEnforcementAppealBodySchema = Type.Object({
  reason: Type.String({ minLength: 10, maxLength: 2000 }),
}, { $id: 'RevokeEnforcementAppealBody', additionalProperties: false });
export type RevokeEnforcementAppealBody = Static<typeof RevokeEnforcementAppealBodySchema>;

export const TechnicalCorrectionCategorySchema = Type.Union([
  Type.Literal('OUTCOME_OR_WINNER_ERROR'), Type.Literal('LATE_RESULT_CORRECTION'),
]);
export const TechnicalCorrectionStateSchema = Type.Union([
  Type.Literal('SUBMITTED'), Type.Literal('UNDER_REVIEW'), Type.Literal('APPROVED'),
  Type.Literal('REJECTED'), Type.Literal('WITHDRAWN'),
]);
export const TechnicalCorrectionProjectionSchema = Type.Object({
  correctionId: Type.String({ format: 'uuid' }),
  resultId: Type.String({ format: 'uuid' }),
  challengeId: Type.String({ format: 'uuid' }),
  competitionId: Type.String({ format: 'uuid' }),
  requesterUserId: Type.String({ format: 'uuid' }),
  requesterDisplayName: Type.String({ minLength: 1, maxLength: 80 }),
  category: TechnicalCorrectionCategorySchema,
  state: TechnicalCorrectionStateSchema,
  originalOutcomeCode: ResultOutcomeCodeSchema,
  originalWinnerUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  proposedOutcomeCode: ResultOutcomeCodeSchema,
  proposedWinnerUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  internalReason: Type.Union([Type.String({ minLength: 1, maxLength: 2000 }), Type.Null()]),
  evidenceReference: Type.Union([Type.String({ minLength: 1, maxLength: 500 }), Type.Null()]),
  submittedAt: Type.String({ format: 'date-time' }),
  assignedReviewerUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  reviewStartedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  decisionReason: Type.Union([Type.String({ minLength: 1, maxLength: 2000 }), Type.Null()]),
  decidedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  version: Type.Integer({ minimum: 1 }),
}, { $id: 'TechnicalCorrectionProjection', additionalProperties: false });
export type TechnicalCorrectionContract = Static<typeof TechnicalCorrectionProjectionSchema>;

export const TechnicalCorrectionListResponseSchema = Type.Object({
  data: Type.Array(TechnicalCorrectionProjectionSchema),
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
}, { $id: 'TechnicalCorrectionListResponse', additionalProperties: false });
export type TechnicalCorrectionListResponse = Static<typeof TechnicalCorrectionListResponseSchema>;

export const TechnicalCorrectionCommandResponseSchema = Type.Object({
  data: TechnicalCorrectionProjectionSchema,
  meta: Type.Object({
    requestId: Type.String({ format: 'uuid' }), eventId: Type.String({ format: 'uuid' }),
    replayed: Type.Boolean(),
  }, { additionalProperties: false }),
}, { $id: 'TechnicalCorrectionCommandResponse', additionalProperties: false });
export type TechnicalCorrectionCommandResponse = Static<typeof TechnicalCorrectionCommandResponseSchema>;

export const ApproveTechnicalCorrectionBodySchema = Type.Object({
  reason: Type.String({ minLength: 1, maxLength: 2000 }),
}, { $id: 'ApproveTechnicalCorrectionBody', additionalProperties: false });
export type ApproveTechnicalCorrectionBody = Static<typeof ApproveTechnicalCorrectionBodySchema>;

export const PlatformIncidentStateSchema = Type.Union([
  Type.Literal('DETECTED'), Type.Literal('CONFIRMED_ACTIVE'), Type.Literal('RESOLVED'),
  Type.Literal('COMPENSATED'), Type.Literal('REJECTED'),
]);
export const PlatformIncidentServiceSchema = Type.Union([
  Type.Literal('CHALLENGE'), Type.Literal('BOOKING'), Type.Literal('STATUS_QUEUE'),
  Type.Literal('COMPETITION'),
]);
export const PlatformIncidentSeveritySchema = Type.Union([
  Type.Literal('INFO'), Type.Literal('MINOR'), Type.Literal('MAJOR'), Type.Literal('CRITICAL'),
]);
const NullableUuidSchema = Type.Union([Type.String({ format: 'uuid' }), Type.Null()]);
const NullableDateTimeSchema = Type.Union([Type.String({ format: 'date-time' }), Type.Null()]);
const NullableTextSchema = Type.Union([Type.String(), Type.Null()]);
export const PlatformIncidentProjectionSchema = Type.Object({
  incidentId: Type.String({ format: 'uuid' }),
  state: PlatformIncidentStateSchema,
  affectedServices: Type.Array(PlatformIncidentServiceSchema, { minItems: 1 }),
  affectedSurfaces: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  severity: PlatformIncidentSeveritySchema,
  startedAt: Type.String({ format: 'date-time' }),
  endedAt: NullableDateTimeSchema,
  monitoringEvidenceReference: Type.String({ minLength: 1 }),
  detectedAt: Type.String({ format: 'date-time' }),
  confirmedBy: NullableUuidSchema,
  confirmedAt: NullableDateTimeSchema,
  confirmationReason: NullableTextSchema,
  rejectedBy: NullableUuidSchema,
  rejectedAt: NullableDateTimeSchema,
  rejectionReason: NullableTextSchema,
  resolvedBy: NullableUuidSchema,
  resolvedByActorType: Type.Union([Type.Literal('USER'), Type.Literal('SYSTEM'), Type.Null()]),
  resolvedAt: NullableDateTimeSchema,
  resolutionReason: NullableTextSchema,
  compensatedAt: NullableDateTimeSchema,
  impactCount: Type.Integer({ minimum: 0 }),
  version: Type.Integer({ minimum: 1 }),
}, { $id: 'PlatformIncidentProjection', additionalProperties: false });
export type PlatformIncidentContract = Static<typeof PlatformIncidentProjectionSchema>;

export const PlatformIncidentListResponseSchema = Type.Object({
  data: Type.Array(PlatformIncidentProjectionSchema),
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
}, { $id: 'PlatformIncidentListResponse', additionalProperties: false });
export type PlatformIncidentListResponse = Static<typeof PlatformIncidentListResponseSchema>;

export const PlatformIncidentCommandResponseSchema = Type.Object({
  data: PlatformIncidentProjectionSchema,
  meta: Type.Object({
    requestId: Type.String({ format: 'uuid' }), eventId: Type.String({ format: 'uuid' }),
    replayed: Type.Boolean(),
  }, { additionalProperties: false }),
}, { $id: 'PlatformIncidentCommandResponse', additionalProperties: false });
export type PlatformIncidentCommandResponse = Static<typeof PlatformIncidentCommandResponseSchema>;

export const PlatformIncidentReasonBodySchema = Type.Object({
  reason: Type.String({ minLength: 3, maxLength: 2000 }),
}, { $id: 'PlatformIncidentReasonBody', additionalProperties: false });
export type PlatformIncidentReasonBody = Static<typeof PlatformIncidentReasonBodySchema>;

export const ResolvePlatformIncidentBodySchema = Type.Object({
  endedAt: Type.String({ format: 'date-time' }),
  reason: Type.String({ minLength: 3, maxLength: 2000 }),
}, { $id: 'ResolvePlatformIncidentBody', additionalProperties: false });
export type ResolvePlatformIncidentBody = Static<typeof ResolvePlatformIncidentBodySchema>;

export const OpenIntegrityCaseBodySchema = Type.Object({
  resultId: Type.String({ format: 'uuid' }), category: IntegrityCategorySchema,
  evidenceReference: Type.String({ minLength: 1, maxLength: 500 }),
  internalReason: Type.String({ minLength: 1, maxLength: 2000 }),
}, { $id: 'OpenIntegrityCaseBody', additionalProperties: false });
export type OpenIntegrityCaseBody = Static<typeof OpenIntegrityCaseBodySchema>;

export const RequestTechnicalCorrectionBodySchema = Type.Object({
  category: TechnicalCorrectionCategorySchema,
  proposedOutcomeCode: ResultOutcomeCodeSchema,
  proposedWinnerUserId: Type.Optional(Type.Union([
    Type.String({ format: 'uuid' }), Type.Null(),
  ])),
  internalReason: Type.String({ minLength: 1, maxLength: 2000 }),
  evidenceReference: Type.String({ minLength: 1, maxLength: 500 }),
}, { $id: 'RequestTechnicalCorrectionBody', additionalProperties: false });
export type RequestTechnicalCorrectionBody = Static<typeof RequestTechnicalCorrectionBodySchema>;

export const StartTechnicalCorrectionReviewBodySchema = Type.Object(
  {}, { $id: 'StartTechnicalCorrectionReviewBody', additionalProperties: false },
);
export type StartTechnicalCorrectionReviewBody =
  Static<typeof StartTechnicalCorrectionReviewBodySchema>;

export const RejectTechnicalCorrectionBodySchema = Type.Object({
  reason: Type.String({ minLength: 1, maxLength: 2000 }),
}, { $id: 'RejectTechnicalCorrectionBody', additionalProperties: false });
export type RejectTechnicalCorrectionBody = Static<typeof RejectTechnicalCorrectionBodySchema>;

export const StartIntegrityReviewBodySchema = Type.Object(
  {}, { $id: 'StartIntegrityReviewBody', additionalProperties: false },
);
export type StartIntegrityReviewBody = Static<typeof StartIntegrityReviewBodySchema>;

export const DecideIntegrityCaseBodySchema = Type.Object({
  disposition: IntegrityDispositionSchema,
  correctedOutcomeCode: Type.Optional(Type.Union([ResultOutcomeCodeSchema, Type.Null()])),
  reason: Type.String({ minLength: 1, maxLength: 2000 }),
}, { $id: 'DecideIntegrityCaseBody', additionalProperties: false });
export type DecideIntegrityCaseBody = Static<typeof DecideIntegrityCaseBodySchema>;

export const ResultResponseSchema = Type.Object(
  {
    data: ResultProjectionSchema,
    meta: Type.Object(
      { requestId: Type.String({ format: 'uuid' }) },
      { additionalProperties: false },
    ),
  },
  { $id: 'ResultResponse', additionalProperties: false },
);

export type ResultResponse = Static<typeof ResultResponseSchema>;

export const ResultCommandResponseSchema = Type.Object(
  {
    data: ResultProjectionSchema,
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.String({ format: 'uuid' }),
        replayed: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'ResultCommandResponse', additionalProperties: false },
);

export type ResultCommandResponse = Static<typeof ResultCommandResponseSchema>;

export const SlotProjectionSchema = Type.Object(
  {
    slotId: Type.String({ format: 'uuid' }),
    venueId: Type.String({ format: 'uuid' }),
    venueDisplayName: Type.String({ minLength: 1 }),
    coachUserId: Type.String({ format: 'uuid' }),
    coachDisplayName: Type.String({ minLength: 1, maxLength: 80 }),
    startAt: Type.String({ format: 'date-time' }),
    endAt: Type.String({ format: 'date-time' }),
    state: Type.Union([
      Type.Literal('PUBLISHED'),
      Type.Literal('WITHDRAWN'),
      Type.Literal('EXPIRED'),
    ]),
    priceAmount: Type.Union([
      Type.String({ pattern: '^(?:0|[1-9]\\d{0,9})(?:\\.\\d{1,2})?$' }),
      Type.Null(),
    ]),
    priceCurrency: Type.Union([
      Type.String({ pattern: '^[A-Z]{3}$' }),
      Type.Null(),
    ]),
    priceText: Type.Union([Type.String({ minLength: 1, maxLength: 240 }), Type.Null()]),
    cancellationTermsText: Type.Union([
      Type.String({ minLength: 1, maxLength: 500 }),
      Type.Null(),
    ]),
    commercialVersion: Type.Integer({ minimum: 1 }),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'SlotProjection', additionalProperties: false },
);

export type SlotContract = Static<typeof SlotProjectionSchema>;

export const GroupOfferingProjectionSchema = Type.Object(
  {
    groupOfferingId: Type.String({ format: 'uuid' }),
    venueId: Type.String({ format: 'uuid' }),
    venueDisplayName: Type.String({ minLength: 1 }),
    sportCode: Type.String({ pattern: '^[A-Z][A-Z0-9_]{1,39}$' }),
    classLabel: Type.String({ minLength: 1, maxLength: 120 }),
    startAt: Type.String({ format: 'date-time' }),
    endAt: Type.String({ format: 'date-time' }),
    coachUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    coachDisplayName: Type.Union([
      Type.String({ minLength: 1, maxLength: 120 }),
      Type.Null(),
    ]),
    priceText: Type.Union([Type.String({ minLength: 1, maxLength: 240 }), Type.Null()]),
    externalInfoUrl: Type.Union([
      Type.String({ minLength: 1, maxLength: 500 }),
      Type.Null(),
    ]),
    contact: Type.Record(Type.String(), Type.Unknown()),
    capacityDisclaimerKey: Type.Literal('group.capacity.confirm-with-venue'),
    lastUpdatedAt: Type.String({ format: 'date-time' }),
    state: Type.Union([
      Type.Literal('PUBLISHED'),
      Type.Literal('WITHDRAWN'),
      Type.Literal('EXPIRED'),
    ]),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'GroupOfferingProjection', additionalProperties: false },
);

export type GroupOfferingContract = Static<typeof GroupOfferingProjectionSchema>;

export const CommercialTermsSnapshotSchema = Type.Object(
  {
    slotId: Type.String({ format: 'uuid' }),
    venueId: Type.String({ format: 'uuid' }),
    venueDisplayName: Type.String({ minLength: 1 }),
    coachUserId: Type.String({ format: 'uuid' }),
    coachDisplayName: Type.String({ minLength: 1, maxLength: 80 }),
    startAt: Type.String({ format: 'date-time' }),
    endAt: Type.String({ format: 'date-time' }),
    priceAmount: Type.Union([
      Type.String({ pattern: '^(?:0|[1-9]\\d{0,9})(?:\\.\\d{1,2})?$' }),
      Type.Null(),
    ]),
    priceCurrency: Type.Union([Type.String({ pattern: '^[A-Z]{3}$' }), Type.Null()]),
    priceText: Type.Union([Type.String({ minLength: 1, maxLength: 240 }), Type.Null()]),
    cancellationTermsText: Type.Union([
      Type.String({ minLength: 1, maxLength: 500 }),
      Type.Null(),
    ]),
    commercialVersion: Type.Integer({ minimum: 1 }),
  },
  { $id: 'CommercialTermsSnapshot', additionalProperties: false },
);

export const BookingIntentProjectionSchema = Type.Object(
  {
    bookingId: Type.String({ format: 'uuid' }),
    chatId: Type.String({ format: 'uuid' }),
    slotId: Type.String({ format: 'uuid' }),
    purpose: Type.Union([
      Type.Literal('TRAINING'),
      Type.Literal('OFFICIAL_CHALLENGE'),
    ]),
    challengeId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    state: Type.Union([
      Type.Literal('SELECTING'),
      Type.Literal('HOST_CONFIRMATION_PENDING'),
      Type.Literal('CONFIRMED_PAIR'),
      Type.Literal('CANCELLED'),
      Type.Literal('REJECTED'),
      Type.Literal('EXPIRED'),
    ]),
    selectedByUserIds: Type.Array(Type.String({ format: 'uuid' }), {
      minItems: 1,
      maxItems: 2,
      uniqueItems: true,
    }),
    selectionExpiresAt: Type.String({ format: 'date-time' }),
    hostConfirmationDeadlineAt: Type.String({ format: 'date-time' }),
    commercialTermsSnapshot: Type.Union([CommercialTermsSnapshotSchema, Type.Null()]),
    hostConfirmedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    sessionId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'BookingIntentProjection', additionalProperties: false },
);

export type BookingIntentContract = Static<typeof BookingIntentProjectionSchema>;

export const SessionProjectionSchema = Type.Object(
  {
    sessionId: Type.String({ format: 'uuid' }),
    bookingId: Type.String({ format: 'uuid' }),
    challengeId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    venueId: Type.String({ format: 'uuid' }),
    coachUserId: Type.String({ format: 'uuid' }),
    athleteUserIds: Type.Tuple([
      Type.String({ format: 'uuid' }),
      Type.String({ format: 'uuid' }),
    ]),
    purpose: Type.Union([
      Type.Literal('TRAINING'),
      Type.Literal('OFFICIAL_CHALLENGE'),
    ]),
    state: Type.Literal('SCHEDULED'),
    scheduledStartAt: Type.String({ format: 'date-time' }),
    scheduledEndAt: Type.String({ format: 'date-time' }),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'SessionProjection', additionalProperties: false },
);

export type SessionContract = Static<typeof SessionProjectionSchema>;

export const AttendanceProjectionSchema = Type.Object(
  {
    attendanceId: Type.String({ format: 'uuid' }),
    athleteUserId: Type.String({ format: 'uuid' }),
    athleteDisplayName: Type.String({ minLength: 1, maxLength: 80 }),
    status: Type.Union([
      Type.Literal('PRESENT'),
      Type.Literal('LATE'),
      Type.Literal('NO_SHOW'),
    ]),
    arrivalAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    recordedByUserId: Type.String({ format: 'uuid' }),
    recordedAt: Type.String({ format: 'date-time' }),
    reasonCode: Type.Union([Type.Literal('ABSENCE_PREVENTED_SESSION'), Type.Null()]),
    comment: Type.Union([Type.String({ minLength: 1, maxLength: 500 }), Type.Null()]),
  },
  { $id: 'AttendanceProjection', additionalProperties: false },
);

export type AttendanceContract = Static<typeof AttendanceProjectionSchema>;

export const BookingOfficialConversionConfirmationSchema = Type.Object(
  {
    actorUserId: Type.String({ format: 'uuid' }),
    requiredRole: Type.Union([
      Type.Literal('ATHLETE_LOW'),
      Type.Literal('ATHLETE_HIGH'),
      Type.Literal('COACH'),
    ]),
    decision: Type.Union([Type.Literal('ACCEPT'), Type.Literal('DECLINE')]),
    decidedAt: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);

export const BookingOfficialConversionProjectionSchema = Type.Object(
  {
    conversionId: Type.String({ format: 'uuid' }),
    bookingId: Type.String({ format: 'uuid' }),
    sessionId: Type.String({ format: 'uuid' }),
    competitionId: Type.String({ format: 'uuid' }),
    requestedByUserId: Type.String({ format: 'uuid' }),
    stake: Type.Union([
      Type.Literal('NONE'),
      Type.Literal('CONTENDER'),
      Type.Literal('TITLE'),
    ]),
    state: Type.Union([
      Type.Literal('WAITING_FIFO'),
      Type.Literal('PENDING_CONFIRMATION'),
      Type.Literal('CONVERTED'),
      Type.Literal('DECLINED'),
      Type.Literal('EXPIRED'),
      Type.Literal('INVALIDATED'),
    ]),
    boundHolderUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    queueEntryId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    queuePosition: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    challengeId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    confirmationDeadlineAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    confirmations: Type.Array(BookingOfficialConversionConfirmationSchema, { maxItems: 3 }),
    viewerRequiredRole: Type.Union([
      Type.Literal('ATHLETE_LOW'), Type.Literal('ATHLETE_HIGH'), Type.Literal('COACH'), Type.Null(),
    ]),
    viewerHasDecided: Type.Boolean(),
    viewerCanRequest: Type.Boolean(),
    viewerCanConfirm: Type.Boolean(),
    viewerCanDecline: Type.Boolean(),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'BookingOfficialConversionProjection', additionalProperties: false },
);

export type BookingOfficialConversionContract = Static<
  typeof BookingOfficialConversionProjectionSchema
>;

export const BookingSoloConfirmationSchema = Type.Object(
  {
    actorUserId: Type.String({ format: 'uuid' }),
    requiredRole: Type.Union([
      Type.Literal('REMAINING_ATHLETE'),
      Type.Literal('COACH'),
    ]),
    decision: Type.Union([Type.Literal('ACCEPT'), Type.Literal('DECLINE')]),
    decidedAt: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);

export const BookingSoloContinuationProjectionSchema = Type.Object(
  {
    continuationId: Type.String({ format: 'uuid' }),
    bookingId: Type.String({ format: 'uuid' }),
    sessionId: Type.String({ format: 'uuid' }),
    cancelledAthleteUserId: Type.String({ format: 'uuid' }),
    remainingAthleteUserId: Type.String({ format: 'uuid' }),
    state: Type.Union([
      Type.Literal('PENDING'),
      Type.Literal('CONFIRMED'),
      Type.Literal('DECLINED'),
      Type.Literal('EXPIRED'),
    ]),
    deadlineAt: Type.String({ format: 'date-time' }),
    confirmations: Type.Array(BookingSoloConfirmationSchema, { maxItems: 2 }),
    viewerRequiredRole: Type.Union([
      Type.Literal('REMAINING_ATHLETE'), Type.Literal('COACH'), Type.Null(),
    ]),
    viewerHasDecided: Type.Boolean(),
    viewerCanConfirm: Type.Boolean(),
    viewerCanDecline: Type.Boolean(),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'BookingSoloContinuationProjection', additionalProperties: false },
);

export type BookingSoloContinuationContract = Static<
  typeof BookingSoloContinuationProjectionSchema
>;

export const BookingTrainingRetentionConfirmationSchema = Type.Object(
  {
    actorUserId: Type.String({ format: 'uuid' }),
    requiredRole: Type.Union([
      Type.Literal('ATHLETE_LOW'),
      Type.Literal('ATHLETE_HIGH'),
      Type.Literal('COACH_OR_HOST'),
    ]),
    decision: Type.Union([Type.Literal('ACCEPT'), Type.Literal('DECLINE')]),
    decidedAt: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);

export const BookingTrainingRetentionProjectionSchema = Type.Object(
  {
    retentionId: Type.String({ format: 'uuid' }),
    bookingId: Type.String({ format: 'uuid' }),
    sessionId: Type.String({ format: 'uuid' }),
    challengeId: Type.String({ format: 'uuid' }),
    cause: Type.Union([
      Type.Literal('YOUTH_CONSENT_REVOKED'), Type.Literal('AGE_TRANSITION'),
      Type.Literal('COMPETITIVE_CONTEXT_INVALIDATED'),
    ]),
    state: Type.Union([
      Type.Literal('PENDING'), Type.Literal('CONFIRMED'),
      Type.Literal('DECLINED'), Type.Literal('EXPIRED'),
    ]),
    deadlineAt: Type.String({ format: 'date-time' }),
    confirmations: Type.Array(BookingTrainingRetentionConfirmationSchema, { maxItems: 3 }),
    viewerRequiredRole: Type.Union([
      Type.Literal('ATHLETE_LOW'), Type.Literal('ATHLETE_HIGH'),
      Type.Literal('COACH_OR_HOST'), Type.Null(),
    ]),
    viewerHasDecided: Type.Boolean(),
    viewerCanConfirm: Type.Boolean(),
    viewerCanDecline: Type.Boolean(),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'BookingTrainingRetentionProjection', additionalProperties: false },
);

export type BookingTrainingRetentionContract = Static<
  typeof BookingTrainingRetentionProjectionSchema
>;

export const SessionLifecycleProjectionSchema = Type.Object(
  {
    sessionId: Type.String({ format: 'uuid' }),
    bookingId: Type.String({ format: 'uuid' }),
    bookingVersion: Type.Integer({ minimum: 1 }),
    challengeId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    challengeState: Type.Union([ChallengeStateSchema, Type.Null()]),
    challengeVersion: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    resultId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    venueId: Type.String({ format: 'uuid' }),
    venueDisplayName: Type.String({ minLength: 1, maxLength: 120 }),
    coachUserId: Type.String({ format: 'uuid' }),
    coachDisplayName: Type.String({ minLength: 1, maxLength: 80 }),
    guestCoachGrantId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    guestCoachGrantState: Type.Union([
      Type.Literal('ACTIVE'), Type.Literal('EXPIRED'), Type.Null(),
    ]),
    guestCoachGrantExpiresAt: Type.Union([
      Type.String({ format: 'date-time' }), Type.Null(),
    ]),
    athleteUserIds: Type.Tuple([
      Type.String({ format: 'uuid' }),
      Type.String({ format: 'uuid' }),
    ]),
    athleteDisplayNames: Type.Tuple([
      Type.String({ minLength: 1, maxLength: 80 }),
      Type.String({ minLength: 1, maxLength: 80 }),
    ]),
    activeAthleteUserIds: Type.Array(Type.String({ format: 'uuid' }), {
      minItems: 1,
      maxItems: 2,
    }),
    activeAthleteDisplayNames: Type.Array(Type.String({ minLength: 1, maxLength: 80 }), {
      minItems: 1,
      maxItems: 2,
    }),
    purpose: Type.Union([
      Type.Literal('TRAINING'),
      Type.Literal('OFFICIAL_CHALLENGE'),
    ]),
    state: Type.Union([
      Type.Literal('SCHEDULED'),
      Type.Literal('READY_FOR_COACH'),
      Type.Literal('IN_PROGRESS'),
      Type.Literal('ENDED'),
      Type.Literal('CANCELLED'),
    ]),
    scheduledStartAt: Type.String({ format: 'date-time' }),
    scheduledEndAt: Type.String({ format: 'date-time' }),
    windowOpenedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    actualStartAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    actualEndAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    latestCoachReplacementAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    cancellationReasonCode: Type.Union([Type.String({ minLength: 1, maxLength: 80 }), Type.Null()]),
    noShowGraceMinutes: Type.Integer({ minimum: 5, maximum: 30 }),
    attendance: Type.Array(AttendanceProjectionSchema, { maxItems: 2 }),
    viewerCanManage: Type.Boolean(),
    viewerCanRecordResult: Type.Boolean(),
    viewerCanAdminister: Type.Boolean(),
    viewerCanAuthorizeGuestCoach: Type.Boolean(),
    viewerCanReportCoachSafetyRefusal: Type.Boolean(),
    viewerCanRequestNoFaultReschedule: Type.Boolean(),
    viewerCanRequestOfficialConversion: Type.Boolean(),
    viewerCanCancelTraining: Type.Boolean(),
    viewerCanCancelOfficial: Type.Boolean(),
    officialConversion: Type.Union([BookingOfficialConversionProjectionSchema, Type.Null()]),
    soloContinuation: Type.Union([BookingSoloContinuationProjectionSchema, Type.Null()]),
    trainingRetention: Type.Union([BookingTrainingRetentionProjectionSchema, Type.Null()]),
    replacementCoachOptions: Type.Array(
      Type.Object(
        {
          userId: Type.String({ format: 'uuid' }),
          displayName: Type.String({ minLength: 1, maxLength: 80 }),
        },
        { additionalProperties: false },
      ),
    ),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'SessionLifecycleProjection', additionalProperties: false },
);

export type SessionLifecycleContract = Static<typeof SessionLifecycleProjectionSchema>;

export const MySessionsResponseSchema = Type.Object(
  {
    data: Type.Object(
      {
        sessions: Type.Array(SessionLifecycleProjectionSchema),
        completedTrainingCount: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
    meta: Type.Object(
      { requestId: Type.String({ format: 'uuid' }) },
      { additionalProperties: false },
    ),
  },
  { $id: 'MySessionsResponse', additionalProperties: false },
);

export type MySessionsResponse = Static<typeof MySessionsResponseSchema>;

export const SessionResponseSchema = Type.Object(
  {
    data: SessionLifecycleProjectionSchema,
    meta: Type.Object(
      { requestId: Type.String({ format: 'uuid' }) },
      { additionalProperties: false },
    ),
  },
  { $id: 'SessionResponse', additionalProperties: false },
);

export type SessionResponse = Static<typeof SessionResponseSchema>;

export const AuthorizeGuestCoachBodySchema = Type.Object(
  {
    coachUserId: Type.String({ format: 'uuid' }),
    reasonCode: Type.String({ minLength: 3, maxLength: 80 }),
  },
  { $id: 'AuthorizeGuestCoachBody', additionalProperties: false },
);

export type AuthorizeGuestCoachBody = Static<typeof AuthorizeGuestCoachBodySchema>;

export const RecordAttendanceBodySchema = Type.Object(
  {
    athleteUserId: Type.String({ format: 'uuid' }),
    status: Type.Union([
      Type.Literal('PRESENT'),
      Type.Literal('LATE'),
      Type.Literal('NO_SHOW'),
    ]),
    comment: Type.Optional(Type.Union([Type.String({ minLength: 1, maxLength: 500 }), Type.Null()])),
  },
  { $id: 'RecordAttendanceBody', additionalProperties: false },
);

export type RecordAttendanceBody = Static<typeof RecordAttendanceBodySchema>;

export const SessionActionBodySchema = Type.Object(
  {},
  { $id: 'SessionActionBody', additionalProperties: false },
);

export type SessionActionBody = Static<typeof SessionActionBodySchema>;

export const RequestBookingOfficialConversionBodySchema = Type.Object(
  {
    explicitRulesetAcknowledged: Type.Optional(Type.Boolean()),
  },
  { $id: 'RequestBookingOfficialConversionBody', additionalProperties: false },
);

export type RequestBookingOfficialConversionBody = Static<
  typeof RequestBookingOfficialConversionBodySchema
>;

export const DecideBookingOfficialConversionBodySchema = Type.Object(
  {
    decision: Type.Union([Type.Literal('ACCEPT'), Type.Literal('DECLINE')]),
    explicitRulesetAcknowledged: Type.Optional(Type.Boolean()),
  },
  { $id: 'DecideBookingOfficialConversionBody', additionalProperties: false },
);

export type DecideBookingOfficialConversionBody = Static<
  typeof DecideBookingOfficialConversionBodySchema
>;

export const BookingOfficialConversionCommandResponseSchema = Type.Object(
  {
    data: BookingOfficialConversionProjectionSchema,
    meta: Type.Object({
      requestId: Type.String({ format: 'uuid' }),
      eventId: Type.String({ format: 'uuid' }),
      replayed: Type.Boolean(),
    }, { additionalProperties: false }),
  },
  { $id: 'BookingOfficialConversionCommandResponse', additionalProperties: false },
);

export type BookingOfficialConversionCommandResponse = Static<
  typeof BookingOfficialConversionCommandResponseSchema
>;

export const RequestTrainingParticipantCancellationBodySchema = Type.Object(
  {},
  { $id: 'RequestTrainingParticipantCancellationBody', additionalProperties: false },
);

export type RequestTrainingParticipantCancellationBody = Static<
  typeof RequestTrainingParticipantCancellationBodySchema
>;

export const DecideBookingSoloContinuationBodySchema = Type.Object(
  { decision: Type.Union([Type.Literal('ACCEPT'), Type.Literal('DECLINE')]) },
  { $id: 'DecideBookingSoloContinuationBody', additionalProperties: false },
);

export type DecideBookingSoloContinuationBody = Static<
  typeof DecideBookingSoloContinuationBodySchema
>;

export const BookingSoloContinuationCommandResponseSchema = Type.Object(
  {
    data: BookingSoloContinuationProjectionSchema,
    meta: Type.Object({
      requestId: Type.String({ format: 'uuid' }),
      eventId: Type.String({ format: 'uuid' }),
      replayed: Type.Boolean(),
    }, { additionalProperties: false }),
  },
  { $id: 'BookingSoloContinuationCommandResponse', additionalProperties: false },
);

export type BookingSoloContinuationCommandResponse = Static<
  typeof BookingSoloContinuationCommandResponseSchema
>;

export const DecideBookingTrainingRetentionBodySchema = Type.Object(
  { decision: Type.Union([Type.Literal('ACCEPT'), Type.Literal('DECLINE')]) },
  { $id: 'DecideBookingTrainingRetentionBody', additionalProperties: false },
);

export type DecideBookingTrainingRetentionBody = Static<
  typeof DecideBookingTrainingRetentionBodySchema
>;

export const BookingTrainingRetentionCommandResponseSchema = Type.Object(
  {
    data: BookingTrainingRetentionProjectionSchema,
    meta: Type.Object({
      requestId: Type.String({ format: 'uuid' }),
      eventId: Type.String({ format: 'uuid' }),
      replayed: Type.Boolean(),
    }, { additionalProperties: false }),
  },
  { $id: 'BookingTrainingRetentionCommandResponse', additionalProperties: false },
);

export type BookingTrainingRetentionCommandResponse = Static<
  typeof BookingTrainingRetentionCommandResponseSchema
>;

export const ReplaceSessionCoachBodySchema = Type.Object(
  { replacementCoachUserId: Type.String({ format: 'uuid' }) },
  { $id: 'ReplaceSessionCoachBody', additionalProperties: false },
);

export type ReplaceSessionCoachBody = Static<typeof ReplaceSessionCoachBodySchema>;

export const FailSessionExternalBodySchema = Type.Object(
  {
    reasonCode: Type.Union([
      Type.Literal('COACH_UNAVAILABLE'),
      Type.Literal('VENUE_UNAVAILABLE'),
      Type.Literal('SAFETY'),
      Type.Literal('OTHER_EXTERNAL'),
    ]),
  },
  { $id: 'FailSessionExternalBody', additionalProperties: false },
);

export type FailSessionExternalBody = Static<typeof FailSessionExternalBodySchema>;

export const ReportSafetyAndCancelSessionBodySchema = Type.Object(
  {
    subjectUserId: Type.String({ format: 'uuid' }),
    reasonCode: Type.Union([
      Type.Literal('THREAT'), Type.Literal('HARASSMENT'),
      Type.Literal('UNSAFE_CONDUCT'), Type.Literal('OTHER_SAFETY'),
    ]),
    explicitConfirmation: Type.Literal(true),
    expectedBookingVersion: Type.Integer({ minimum: 1 }),
    expectedChallengeVersion: Type.Integer({ minimum: 1 }),
  },
  { $id: 'ReportSafetyAndCancelSessionBody', additionalProperties: false },
);

export type ReportSafetyAndCancelSessionBody = Static<
  typeof ReportSafetyAndCancelSessionBodySchema
>;

export const SafetyCancellationProjectionSchema = Type.Object(
  {
    action: Type.Union([
      Type.Literal('SAFETY_REPORTED_AND_CANCELLED'),
      Type.Literal('COACH_REFUSED_UNSAFE_SESSION'),
    ]),
    caseId: Type.String({ format: 'uuid' }),
    caseState: Type.Literal('SUBMITTED'),
    challengeId: Type.String({ format: 'uuid' }),
    bookingId: Type.String({ format: 'uuid' }),
    sessionId: Type.String({ format: 'uuid' }),
    holdId: Type.String({ format: 'uuid' }),
    holdState: Type.Literal('ACTIVE'),
    initialDueAt: Type.String({ format: 'date-time' }),
    finalDueAt: Type.String({ format: 'date-time' }),
    submittedAt: Type.String({ format: 'date-time' }),
    sessionVersion: Type.Integer({ minimum: 1 }),
    bookingVersion: Type.Integer({ minimum: 1 }),
    slotVersion: Type.Integer({ minimum: 1 }),
    challengeVersion: Type.Integer({ minimum: 1 }),
  },
  { $id: 'SafetyCancellationProjection', additionalProperties: false },
);

export const SafetyCancellationCommandResponseSchema = Type.Object(
  {
    data: SafetyCancellationProjectionSchema,
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.String({ format: 'uuid' }),
        replayed: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'SafetyCancellationCommandResponse', additionalProperties: false },
);

export type SafetyCancellationCommandResponse = Static<
  typeof SafetyCancellationCommandResponseSchema
>;

export const SessionCommandResponseSchema = Type.Object(
  {
    data: SessionLifecycleProjectionSchema,
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.String({ format: 'uuid' }),
        replayed: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'SessionCommandResponse', additionalProperties: false },
);

export type SessionCommandResponse = Static<typeof SessionCommandResponseSchema>;

export const HostConfirmationProjectionSchema = Type.Object(
  {
    outcome: Type.Union([
      Type.Literal('CONFIRMED'),
      Type.Literal('REJECTED_SLOT_UNAVAILABLE'),
    ]),
    booking: BookingIntentProjectionSchema,
    session: Type.Union([SessionProjectionSchema, Type.Null()]),
  },
  { $id: 'HostConfirmationProjection', additionalProperties: false },
);

export type HostConfirmationContract = Static<typeof HostConfirmationProjectionSchema>;

export const HostConfirmationQueueItemSchema = Type.Object(
  {
    booking: BookingIntentProjectionSchema,
    athleteDisplayNames: Type.Tuple([
      Type.String({ minLength: 1, maxLength: 80 }),
      Type.String({ minLength: 1, maxLength: 80 }),
    ]),
  },
  { $id: 'HostConfirmationQueueItem', additionalProperties: false },
);

export const HostConfirmationQueueResponseSchema = Type.Object(
  {
    data: Type.Array(HostConfirmationQueueItemSchema),
    meta: Type.Object(
      { requestId: Type.String({ format: 'uuid' }) },
      { additionalProperties: false },
    ),
  },
  { $id: 'HostConfirmationQueueResponse', additionalProperties: false },
);

export type HostConfirmationQueueResponse = Static<
  typeof HostConfirmationQueueResponseSchema
>;

export const VenueAdminDashboardResponseSchema = Type.Object(
  {
    data: Type.Object(
      {
        venue: Type.Object(
          {
            venueId: Type.String({ format: 'uuid' }),
            displayName: Type.String({ minLength: 1 }),
            timezone: Type.String({ minLength: 1, maxLength: 80 }),
            slotPublishHorizonDays: Type.Integer({ minimum: 1, maximum: 30 }),
          },
          { additionalProperties: false },
        ),
        coaches: Type.Array(
          Type.Object(
            {
              userId: Type.String({ format: 'uuid' }),
              displayName: Type.String({ minLength: 1, maxLength: 80 }),
            },
            { additionalProperties: false },
          ),
        ),
        slots: Type.Array(SlotProjectionSchema),
        groupOfferings: Type.Array(GroupOfferingProjectionSchema),
        hostConfirmations: Type.Array(HostConfirmationQueueItemSchema),
        groupInterests: Type.Array(
          Type.Object(
            {
              groupPlanId: Type.String({ format: 'uuid' }),
              groupOfferingId: Type.String({ format: 'uuid' }),
              athleteDisplayNames: Type.Tuple([
                Type.String({ minLength: 1, maxLength: 80 }),
                Type.String({ minLength: 1, maxLength: 80 }),
              ]),
              classLabel: Type.String({ minLength: 1, maxLength: 120 }),
              startAt: Type.String({ format: 'date-time' }),
              notifiedAt: Type.String({ format: 'date-time' }),
              state: Type.Literal('NOTIFIED'),
              version: Type.Integer({ minimum: 1 }),
            },
            { additionalProperties: false },
          ),
        ),
      },
      { additionalProperties: false },
    ),
    meta: Type.Object(
      { requestId: Type.String({ format: 'uuid' }) },
      { additionalProperties: false },
    ),
  },
  { $id: 'VenueAdminDashboardResponse', additionalProperties: false },
);

export type VenueAdminDashboardResponse = Static<
  typeof VenueAdminDashboardResponseSchema
>;

export const GroupOfferingSnapshotSchema = Type.Object(
  {
    groupOfferingId: Type.String({ format: 'uuid' }),
    venueId: Type.String({ format: 'uuid' }),
    venueDisplayName: Type.String({ minLength: 1 }),
    sportCode: Type.String({ pattern: '^[A-Z][A-Z0-9_]{1,39}$' }),
    classLabel: Type.String({ minLength: 1, maxLength: 120 }),
    startAt: Type.String({ format: 'date-time' }),
    endAt: Type.String({ format: 'date-time' }),
    coachUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    coachDisplayName: Type.Union([
      Type.String({ minLength: 1, maxLength: 120 }),
      Type.Null(),
    ]),
    priceText: Type.Union([Type.String({ minLength: 1, maxLength: 240 }), Type.Null()]),
    externalInfoUrl: Type.Union([
      Type.String({ minLength: 1, maxLength: 500 }),
      Type.Null(),
    ]),
    contact: Type.Record(Type.String(), Type.Unknown()),
    offeringVersion: Type.Integer({ minimum: 1 }),
  },
  { $id: 'GroupOfferingSnapshot', additionalProperties: false },
);

export const GroupPlanProjectionSchema = Type.Object(
  {
    groupPlanId: Type.String({ format: 'uuid' }),
    chatId: Type.String({ format: 'uuid' }),
    groupOfferingId: Type.String({ format: 'uuid' }),
    proposedByUserId: Type.String({ format: 'uuid' }),
    confirmedByPeer: Type.Boolean(),
    state: Type.Union([
      Type.Literal('PROPOSED'),
      Type.Literal('NOTIFIED'),
      Type.Literal('CONVERSION_PENDING'),
      Type.Literal('CONVERTED'),
      Type.Literal('DECLINED'),
      Type.Literal('EXPIRED'),
      Type.Literal('CANCELLED'),
    ]),
    offeringSnapshot: GroupOfferingSnapshotSchema,
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'GroupPlanProjection', additionalProperties: false },
);

export type GroupPlanContract = Static<typeof GroupPlanProjectionSchema>;

export const GroupPlanOfficialConversionProjectionSchema = Type.Object(
  {
    conversionId: Type.String({ format: 'uuid' }),
    groupPlanId: Type.String({ format: 'uuid' }),
    chatId: Type.String({ format: 'uuid' }),
    requestedByUserId: Type.String({ format: 'uuid' }),
    coachUserId: Type.String({ format: 'uuid' }),
    coachDisplayName: Type.String({ minLength: 1, maxLength: 120 }),
    state: Type.Union([
      Type.Literal('PENDING_CONFIRMATION'),
      Type.Literal('CONVERTED'),
      Type.Literal('DECLINED'),
      Type.Literal('EXPIRED'),
      Type.Literal('INVALIDATED'),
    ]),
    confirmationDeadlineAt: Type.String({ format: 'date-time' }),
    challengeId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    bookingId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    sessionId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    confirmations: Type.Array(BookingOfficialConversionConfirmationSchema, { maxItems: 3 }),
    viewerRequiredRole: Type.Union([
      Type.Literal('ATHLETE_LOW'), Type.Literal('ATHLETE_HIGH'), Type.Literal('COACH'), Type.Null(),
    ]),
    viewerHasDecided: Type.Boolean(),
    viewerCanConfirm: Type.Boolean(),
    viewerCanDecline: Type.Boolean(),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'GroupPlanOfficialConversionProjection', additionalProperties: false },
);

export type GroupPlanOfficialConversionContract = Static<
  typeof GroupPlanOfficialConversionProjectionSchema
>;

export const MyGroupPlanOfficialConversionsResponseSchema = Type.Object(
  {
    data: Type.Array(GroupPlanOfficialConversionProjectionSchema),
    meta: Type.Object(
      { requestId: Type.String({ format: 'uuid' }) },
      { additionalProperties: false },
    ),
  },
  { $id: 'MyGroupPlanOfficialConversionsResponse', additionalProperties: false },
);

export type MyGroupPlanOfficialConversionsResponse = Static<
  typeof MyGroupPlanOfficialConversionsResponseSchema
>;

export const TrainingOptionsResponseSchema = Type.Object(
  {
    data: Type.Object(
      {
        slots: Type.Array(SlotProjectionSchema),
        groupOfferings: Type.Array(GroupOfferingProjectionSchema),
        activeIntent: Type.Object(
          {
            booking: Type.Union([BookingIntentProjectionSchema, Type.Null()]),
            groupPlan: Type.Union([GroupPlanProjectionSchema, Type.Null()]),
          },
          { additionalProperties: false },
        ),
        reservationPolicy: Type.Literal('NO_RESERVATION_BEFORE_HOST_CONFIRMATION'),
      },
      { additionalProperties: false },
    ),
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        viewerUserId: Type.String({ format: 'uuid' }),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'TrainingOptionsResponse', additionalProperties: false },
);

export type TrainingOptionsResponse = Static<typeof TrainingOptionsResponseSchema>;

export const PublishSlotBodySchema = Type.Object(
  {
    coachUserId: Type.String({ format: 'uuid' }),
    startAt: Type.String({ format: 'date-time' }),
    endAt: Type.String({ format: 'date-time' }),
    priceAmount: Type.Optional(Type.Union([Type.String({ maxLength: 32 }), Type.Null()])),
    priceCurrency: Type.Optional(Type.Union([Type.String({ maxLength: 3 }), Type.Null()])),
    priceText: Type.Optional(Type.Union([Type.String({ maxLength: 240 }), Type.Null()])),
    cancellationTermsText: Type.Optional(
      Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
    ),
  },
  { $id: 'PublishSlotBody', additionalProperties: false },
);

export type PublishSlotBody = Static<typeof PublishSlotBodySchema>;

export const PublishGroupOfferingBodySchema = Type.Object(
  {
    sportCode: Type.String({ minLength: 2, maxLength: 40 }),
    classLabel: Type.String({ minLength: 1, maxLength: 120 }),
    startAt: Type.String({ format: 'date-time' }),
    endAt: Type.String({ format: 'date-time' }),
    coachUserId: Type.Optional(Type.Union([Type.String({ format: 'uuid' }), Type.Null()])),
    coachDisplayName: Type.Optional(
      Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    ),
    priceText: Type.Optional(Type.Union([Type.String({ maxLength: 240 }), Type.Null()])),
    externalInfoUrl: Type.Optional(
      Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
    ),
  },
  { $id: 'PublishGroupOfferingBody', additionalProperties: false },
);

export type PublishGroupOfferingBody = Static<typeof PublishGroupOfferingBodySchema>;

export const UpdateSlotBodySchema = Type.Object(
  {
    coachUserId: Type.String({ format: 'uuid' }),
    startAt: Type.String({ format: 'date-time' }),
    endAt: Type.String({ format: 'date-time' }),
    priceAmount: Type.Optional(Type.Union([Type.String({ maxLength: 32 }), Type.Null()])),
    priceCurrency: Type.Optional(Type.Union([Type.String({ maxLength: 3 }), Type.Null()])),
    priceText: Type.Optional(Type.Union([Type.String({ maxLength: 240 }), Type.Null()])),
    cancellationTermsText: Type.Optional(
      Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
    ),
  },
  { $id: 'UpdateSlotBody', additionalProperties: false },
);

export type UpdateSlotBody = Static<typeof UpdateSlotBodySchema>;

export const UpdateGroupOfferingBodySchema = Type.Object(
  {
    sportCode: Type.String({ minLength: 2, maxLength: 40 }),
    classLabel: Type.String({ minLength: 1, maxLength: 120 }),
    startAt: Type.String({ format: 'date-time' }),
    endAt: Type.String({ format: 'date-time' }),
    coachUserId: Type.Optional(Type.Union([Type.String({ format: 'uuid' }), Type.Null()])),
    coachDisplayName: Type.Optional(
      Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    ),
    priceText: Type.Optional(Type.Union([Type.String({ maxLength: 240 }), Type.Null()])),
    externalInfoUrl: Type.Optional(
      Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
    ),
  },
  { $id: 'UpdateGroupOfferingBody', additionalProperties: false },
);

export type UpdateGroupOfferingBody = Static<typeof UpdateGroupOfferingBodySchema>;

export const ScheduleMutationReasonBodySchema = Type.Object(
  {
    reasonCode: ScheduleMutationReasonCodeSchema,
    reasonNote: Type.Optional(Type.Union([
      Type.String({ minLength: 1, maxLength: 500 }),
      Type.Null(),
    ])),
  },
  { $id: 'ScheduleMutationReasonBody', additionalProperties: false },
);

export type ScheduleMutationReasonBody = Static<typeof ScheduleMutationReasonBodySchema>;

export const AthleteChallengeRescheduleBodySchema = Type.Object(
  {
    reasonCode: ScheduleMutationReasonCodeSchema,
    reasonNote: Type.Optional(Type.Union([
      Type.String({ minLength: 1, maxLength: 500 }),
      Type.Null(),
    ])),
    confirmForfeit: Type.Optional(Type.Boolean()),
  },
  { $id: 'AthleteChallengeRescheduleBody', additionalProperties: false },
);

export type AthleteChallengeRescheduleBody = Static<
  typeof AthleteChallengeRescheduleBodySchema
>;

export const SelectSlotBodySchema = Type.Object(
  {
    chatId: Type.String({ format: 'uuid' }),
    slotId: Type.String({ format: 'uuid' }),
    commercialVersion: Type.Integer({ minimum: 1 }),
    challengeId: Type.Optional(Type.String({ format: 'uuid' })),
  },
  { $id: 'SelectSlotBody', additionalProperties: false },
);

export type SelectSlotBody = Static<typeof SelectSlotBodySchema>;

export const SelectSameSlotBodySchema = Type.Object(
  { commercialVersion: Type.Integer({ minimum: 1 }) },
  { $id: 'SelectSameSlotBody', additionalProperties: false },
);

export type SelectSameSlotBody = Static<typeof SelectSameSlotBodySchema>;

export const ConfirmBookingHostBodySchema = Type.Object(
  {},
  { $id: 'ConfirmBookingHostBody', additionalProperties: false },
);

export type ConfirmBookingHostBody = Static<typeof ConfirmBookingHostBodySchema>;

export const RejectBookingHostBodySchema = Type.Object(
  {
    reasonCode: ScheduleMutationReasonCodeSchema,
    reasonNote: Type.Optional(Type.Union([
      Type.String({ minLength: 1, maxLength: 500 }),
      Type.Null(),
    ])),
  },
  { $id: 'RejectBookingHostBody', additionalProperties: false },
);

export type RejectBookingHostBody = Static<typeof RejectBookingHostBodySchema>;

export const ProposeGroupPlanBodySchema = Type.Object(
  {
    chatId: Type.String({ format: 'uuid' }),
    groupOfferingId: Type.String({ format: 'uuid' }),
    offeringVersion: Type.Integer({ minimum: 1 }),
  },
  { $id: 'ProposeGroupPlanBody', additionalProperties: false },
);

export type ProposeGroupPlanBody = Static<typeof ProposeGroupPlanBodySchema>;

export const ConfirmGroupPlanBodySchema = Type.Object(
  {},
  { $id: 'ConfirmGroupPlanBody', additionalProperties: false },
);

export type ConfirmGroupPlanBody = Static<typeof ConfirmGroupPlanBodySchema>;

export const RequestGroupPlanOfficialConversionBodySchema = Type.Object(
  { explicitRulesetAcknowledged: Type.Optional(Type.Boolean()) },
  { $id: 'RequestGroupPlanOfficialConversionBody', additionalProperties: false },
);

export type RequestGroupPlanOfficialConversionBody = Static<
  typeof RequestGroupPlanOfficialConversionBodySchema
>;

export const DecideGroupPlanOfficialConversionBodySchema = Type.Object(
  {
    decision: Type.Union([Type.Literal('ACCEPT'), Type.Literal('DECLINE')]),
    explicitRulesetAcknowledged: Type.Optional(Type.Boolean()),
  },
  { $id: 'DecideGroupPlanOfficialConversionBody', additionalProperties: false },
);

export type DecideGroupPlanOfficialConversionBody = Static<
  typeof DecideGroupPlanOfficialConversionBodySchema
>;

export const SlotCommandResponseSchema = Type.Object(
  {
    data: SlotProjectionSchema,
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.String({ format: 'uuid' }),
        replayed: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'SlotCommandResponse', additionalProperties: false },
);

export type SlotCommandResponse = Static<typeof SlotCommandResponseSchema>;

export const GroupOfferingCommandResponseSchema = Type.Object(
  {
    data: GroupOfferingProjectionSchema,
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.String({ format: 'uuid' }),
        replayed: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'GroupOfferingCommandResponse', additionalProperties: false },
);

export type GroupOfferingCommandResponse = Static<
  typeof GroupOfferingCommandResponseSchema
>;

export const BookingIntentCommandResponseSchema = Type.Object(
  {
    data: BookingIntentProjectionSchema,
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.String({ format: 'uuid' }),
        replayed: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'BookingIntentCommandResponse', additionalProperties: false },
);

export type BookingIntentCommandResponse = Static<
  typeof BookingIntentCommandResponseSchema
>;

export const HostConfirmationCommandResponseSchema = Type.Object(
  {
    data: HostConfirmationProjectionSchema,
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.String({ format: 'uuid' }),
        replayed: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'HostConfirmationCommandResponse', additionalProperties: false },
);

export type HostConfirmationCommandResponse = Static<
  typeof HostConfirmationCommandResponseSchema
>;

export const HostRejectionCommandResponseSchema = Type.Object(
  {
    data: Type.Object(
      {
        booking: BookingIntentProjectionSchema,
        rejectedAt: Type.String({ format: 'date-time' }),
        reasonCode: ScheduleMutationReasonCodeSchema,
        reasonNote: Type.Union([
          Type.String({ minLength: 1, maxLength: 500 }),
          Type.Null(),
        ]),
      },
      { additionalProperties: false },
    ),
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.String({ format: 'uuid' }),
        replayed: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'HostRejectionCommandResponse', additionalProperties: false },
);

export type HostRejectionCommandResponse = Static<
  typeof HostRejectionCommandResponseSchema
>;

export const GroupPlanCommandResponseSchema = Type.Object(
  {
    data: GroupPlanProjectionSchema,
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.String({ format: 'uuid' }),
        replayed: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'GroupPlanCommandResponse', additionalProperties: false },
);

export type GroupPlanCommandResponse = Static<typeof GroupPlanCommandResponseSchema>;

export const GroupPlanOfficialConversionCommandResponseSchema = Type.Object(
  {
    data: GroupPlanOfficialConversionProjectionSchema,
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.String({ format: 'uuid' }),
        replayed: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'GroupPlanOfficialConversionCommandResponse', additionalProperties: false },
);

export type GroupPlanOfficialConversionCommandResponse = Static<
  typeof GroupPlanOfficialConversionCommandResponseSchema
>;

export const ChangeDisplayNameBodySchema = Type.Object(
  {
    displayName: Type.String({ minLength: 1, maxLength: 80 }),
  },
  { $id: 'ChangeDisplayNameBody', additionalProperties: false },
);

export type ChangeDisplayNameBody = Static<typeof ChangeDisplayNameBodySchema>;

const SportCodeSchema = Type.String({
  minLength: 2,
  maxLength: 40,
  pattern: '^[A-Z][A-Z0-9_]{1,39}$',
});

export const ChangeSportsBodySchema = Type.Object(
  {
    primarySport: SportCodeSchema,
    secondarySport: Type.Union([SportCodeSchema, Type.Null()]),
  },
  { $id: 'ChangeSportsBody', additionalProperties: false },
);

export type ChangeSportsBody = Static<typeof ChangeSportsBodySchema>;

export const ChangeHomeVenueBodySchema = Type.Object(
  { venueId: Type.String({ format: 'uuid' }) },
  { $id: 'ChangeHomeVenueBody', additionalProperties: false },
);
export type ChangeHomeVenueBody = Static<typeof ChangeHomeVenueBodySchema>;

export const HomeVenueOptionSchema = Type.Object({
  venueId: Type.String({ format: 'uuid' }),
  displayName: Type.String({ minLength: 1, maxLength: 120 }),
  address: Type.String({ minLength: 1 }),
  cityCode: Type.String({ minLength: 1 }),
}, { $id: 'HomeVenueOption', additionalProperties: false });

export const HomeVenueSettingsResponseSchema = Type.Object({
  data: Type.Object({
    homeVenueId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    userVersion: Type.Integer({ minimum: 1 }),
    options: Type.Array(HomeVenueOptionSchema),
  }, { additionalProperties: false }),
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) },
    { additionalProperties: false }),
}, { $id: 'HomeVenueSettingsResponse', additionalProperties: false });
export type HomeVenueSettingsResponse = Static<typeof HomeVenueSettingsResponseSchema>;

export const HomeVenueCommandResponseSchema = Type.Object({
  data: Type.Object({
    homeVenueId: Type.String({ format: 'uuid' }),
    venueDisplayName: Type.String({ minLength: 1, maxLength: 120 }),
    version: Type.Integer({ minimum: 1 }),
  }, { additionalProperties: false }),
  meta: Type.Object({
    requestId: Type.String({ format: 'uuid' }),
    eventId: Type.String({ format: 'uuid' }),
    replayed: Type.Boolean(),
  }, { additionalProperties: false }),
}, { $id: 'HomeVenueCommandResponse', additionalProperties: false });
export type HomeVenueCommandResponse = Static<typeof HomeVenueCommandResponseSchema>;

export const RequestAvatarUploadBodySchema = Type.Object({
  mimeType: Type.Union([
    Type.Literal('image/jpeg'),
    Type.Literal('image/png'),
    Type.Literal('image/webp'),
  ]),
  sizeBytes: Type.Integer({ minimum: 1, maximum: 10 * 1024 * 1024 }),
  sha256: Type.String({ pattern: '^[0-9a-f]{64}$' }),
}, { $id: 'RequestAvatarUploadBody', additionalProperties: false });
export type RequestAvatarUploadBody = Static<typeof RequestAvatarUploadBodySchema>;

export const AvatarUploadTicketSchema = Type.Object({
  assetId: Type.String({ format: 'uuid' }),
  state: Type.Literal('PENDING_UPLOAD'),
  uploadUrl: Type.String({ format: 'uri' }),
  expiresAt: Type.String({ format: 'date-time' }),
  requiredHeaders: Type.Record(Type.String(), Type.String()),
  scanPolicyVersion: Type.Literal('avatar-scan-v1'),
}, { $id: 'AvatarUploadTicket', additionalProperties: false });
export type AvatarUploadTicketContract = Static<typeof AvatarUploadTicketSchema>;

export const AvatarUploadTicketResponseSchema = Type.Object({
  data: AvatarUploadTicketSchema,
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) },
    { additionalProperties: false }),
}, { $id: 'AvatarUploadTicketResponse', additionalProperties: false });
export type AvatarUploadTicketResponse = Static<typeof AvatarUploadTicketResponseSchema>;

export const EvidenceScopeTypeSchema = Type.Union([
  Type.Literal('RESULT_APPEAL'), Type.Literal('SAFETY_CASE'),
]);
export const EvidenceAttachmentStateSchema = Type.Union([
  Type.Literal('PENDING_SCAN'), Type.Literal('AVAILABLE'), Type.Literal('QUARANTINED'),
]);
export const EvidenceUploadIntentBodySchema = Type.Object({
  fileName: Type.String({ minLength: 1, maxLength: 255 }),
  declaredMimeType: Type.String({ minLength: 3, maxLength: 100 }),
  sizeBytes: Type.Integer({ minimum: 1, maximum: 100 * 1024 * 1024 }),
  durationSeconds: Type.Union([Type.Number({ exclusiveMinimum: 0, maximum: 60 }), Type.Null()]),
  sha256: Type.String({ pattern: '^[0-9a-f]{64}$' }),
}, { $id: 'EvidenceUploadIntentBody', additionalProperties: false });
export type EvidenceUploadIntentBody = Static<typeof EvidenceUploadIntentBodySchema>;

export const CompleteEvidenceUploadBodySchema = Type.Object({
  uploadReceiptId: Type.String({ minLength: 1, maxLength: 300 }),
}, { $id: 'CompleteEvidenceUploadBody', additionalProperties: false });
export type CompleteEvidenceUploadBody = Static<typeof CompleteEvidenceUploadBodySchema>;

export const EvidenceUploadTicketSchema = Type.Object({
  attachmentId: Type.String({ format: 'uuid' }),
  uploadReceiptId: Type.String({ minLength: 1 }),
  uploadUrl: Type.String({ format: 'uri' }),
  expiresAt: Type.String({ format: 'date-time' }),
  requiredHeaders: Type.Record(Type.String(), Type.String()),
  scanPolicyVersion: Type.Literal('evidence-scan-v1'),
  scopeVersion: Type.Integer({ minimum: 1 }),
}, { $id: 'EvidenceUploadTicket', additionalProperties: false });
export type EvidenceUploadTicket = Static<typeof EvidenceUploadTicketSchema>;

export const EvidenceAttachmentSchema = Type.Object({
  attachmentId: Type.String({ format: 'uuid' }), scopeType: EvidenceScopeTypeSchema,
  scopeId: Type.String({ format: 'uuid' }), submitterUserId: Type.String({ format: 'uuid' }),
  state: EvidenceAttachmentStateSchema, fileName: Type.String({ minLength: 1, maxLength: 255 }),
  mediaKind: Type.Union([Type.Literal('IMAGE'), Type.Literal('AUDIO'), Type.Literal('VIDEO')]),
  mimeType: Type.String(), sizeBytes: Type.Integer({ minimum: 1 }),
  durationSeconds: Type.Union([Type.Number({ exclusiveMinimum: 0 }), Type.Null()]),
  submittedAt: Type.String({ format: 'date-time' }),
  scannedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  canAccessOriginal: Type.Boolean(), version: Type.Integer({ minimum: 1 }),
}, { $id: 'EvidenceAttachment', additionalProperties: false });
export type EvidenceAttachment = Static<typeof EvidenceAttachmentSchema>;

export const EvidenceUploadTicketResponseSchema = Type.Object({
  data: EvidenceUploadTicketSchema,
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
}, { $id: 'EvidenceUploadTicketResponse', additionalProperties: false });
export type EvidenceUploadTicketResponse = Static<typeof EvidenceUploadTicketResponseSchema>;

export const EvidenceAttachmentCommandResponseSchema = Type.Object({
  data: EvidenceAttachmentSchema,
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }),
    eventId: Type.String({ format: 'uuid' }), replayed: Type.Boolean() },
  { additionalProperties: false }),
}, { $id: 'EvidenceAttachmentCommandResponse', additionalProperties: false });
export type EvidenceAttachmentCommandResponse = Static<typeof EvidenceAttachmentCommandResponseSchema>;

export const EvidenceAttachmentListResponseSchema = Type.Object({
  data: Type.Array(EvidenceAttachmentSchema),
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
}, { $id: 'EvidenceAttachmentListResponse', additionalProperties: false });
export type EvidenceAttachmentListResponse = Static<typeof EvidenceAttachmentListResponseSchema>;

export const EvidenceOriginalAccessResponseSchema = Type.Object({
  data: Type.Object({ downloadUrl: Type.String({ format: 'uri' }),
    expiresAt: Type.String({ format: 'date-time' }), fileName: Type.String(), mimeType: Type.String() },
  { additionalProperties: false }),
  meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }, { additionalProperties: false }),
}, { $id: 'EvidenceOriginalAccessResponse', additionalProperties: false });
export type EvidenceOriginalAccessResponse = Static<typeof EvidenceOriginalAccessResponseSchema>;

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
  Type.Literal('MEMBERSHIP_REAPPLY_WAIT'),
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
        configurationId: Type.String({ format: 'uuid' }),
        configurationVersion: Type.Integer({ minimum: 1 }),
        configurationEffectiveAt: Type.String({ format: 'date-time' }),
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
          version: Type.Integer({ minimum: 1 }),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    membershipReapplyNotBeforeAt: Type.Union([
      Type.String({ format: 'date-time' }), Type.Null(),
    ]),
    membershipLatestRejectionReasonCode: Type.Union([
      Type.Literal('CAPACITY_UNAVAILABLE'),
      Type.Literal('COMMUNITY_REQUIREMENTS'),
      Type.Literal('REQUEST_NOT_APPROVED'),
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

export const ChangeCommunityPairCooldownBodySchema = Type.Object(
  { pairCooldownDays: Type.Integer({ minimum: 7, maximum: 30 }) },
  { $id: 'ChangeCommunityPairCooldownBody', additionalProperties: false },
);
export type ChangeCommunityPairCooldownBody = Static<
  typeof ChangeCommunityPairCooldownBodySchema
>;

export const CommunityConfigurationProjectionSchema = Type.Object(
  {
    communityId: Type.String({ format: 'uuid' }),
    configurationId: Type.String({ format: 'uuid' }),
    configurationVersion: Type.Integer({ minimum: 1 }),
    pairCooldownDays: Type.Integer({ minimum: 7, maximum: 30 }),
    noShowGraceMinutes: Type.Integer({ minimum: 5, maximum: 30 }),
    rulesetRef: Type.String(),
    rulesetAckMode: Type.Union([
      Type.Literal('IMPLICIT_ON_ACCEPT'),
      Type.Literal('EXPLICIT_ACK_REQUIRED'),
    ]),
    effectiveAt: Type.String({ format: 'date-time' }),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'CommunityConfigurationProjection', additionalProperties: false },
);

export const CommunityConfigurationCommandResponseSchema = Type.Object(
  {
    data: CommunityConfigurationProjectionSchema,
    meta: Type.Object({
      requestId: Type.String({ format: 'uuid' }),
      eventId: Type.String({ format: 'uuid' }),
      replayed: Type.Boolean(),
    }, { additionalProperties: false }),
  },
  { $id: 'CommunityConfigurationCommandResponse', additionalProperties: false },
);
export type CommunityConfigurationCommandResponse = Static<
  typeof CommunityConfigurationCommandResponseSchema
>;

export const MembershipProjectionSchema = Type.Object(
  {
    membershipId: Type.String({ format: 'uuid' }),
    communityId: Type.String({ format: 'uuid' }),
    userId: Type.String({ format: 'uuid' }),
    ageDivision: Type.Union([Type.Literal('YOUTH'), Type.Literal('ADULT')]),
    state: Type.Union([
      Type.Literal('PENDING'), Type.Literal('ACTIVE'), Type.Literal('UNDER_REVIEW'),
      Type.Literal('REJECTED'), Type.Literal('LEFT'), Type.Literal('REMOVED'),
      Type.Literal('ARCHIVED'),
    ]),
    competitionEnabled: Type.Boolean(),
    joinPath: Type.Union([
      Type.Literal('QR'), Type.Literal('INVITE'), Type.Literal('SELF_REQUEST'),
    ]),
    requestedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    decidedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    decidedBy: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    publicRejectionReasonCode: Type.Union([
      Type.Literal('CAPACITY_UNAVAILABLE'),
      Type.Literal('COMMUNITY_REQUIREMENTS'),
      Type.Literal('REQUEST_NOT_APPROVED'),
      Type.Null(),
    ]),
    reapplyNotBeforeAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'MembershipProjection', additionalProperties: false },
);
export type MembershipContract = Static<typeof MembershipProjectionSchema>;

export const MembershipCommandResponseSchema = Type.Object(
  {
    data: MembershipProjectionSchema,
    meta: Type.Object({
      requestId: Type.String({ format: 'uuid' }),
      eventId: Type.String({ format: 'uuid' }),
      replayed: Type.Boolean(),
    }, { additionalProperties: false }),
  },
  { $id: 'MembershipCommandResponse', additionalProperties: false },
);
export type MembershipCommandResponse = Static<typeof MembershipCommandResponseSchema>;

export const RejectMembershipBodySchema = Type.Object(
  {
    publicRejectionReasonCode: Type.Union([
      Type.Literal('CAPACITY_UNAVAILABLE'),
      Type.Literal('COMMUNITY_REQUIREMENTS'),
      Type.Literal('REQUEST_NOT_APPROVED'),
    ]),
    internalRejectionReasonCode: Type.Union([
      Type.Literal('CAPACITY_LIMIT'),
      Type.Literal('ELIGIBILITY_REVIEW'),
      Type.Literal('SAFETY_REVIEW'),
      Type.Literal('ADMIN_OTHER'),
    ]),
    internalCaseRef: Type.Optional(Type.Union([
      Type.String({ minLength: 3, maxLength: 200 }), Type.Null(),
    ])),
  },
  { $id: 'RejectMembershipBody', additionalProperties: false },
);
export type RejectMembershipBody = Static<typeof RejectMembershipBodySchema>;

export const PendingMembershipListResponseSchema = Type.Object(
  {
    data: Type.Array(Type.Intersect([
      MembershipProjectionSchema,
      Type.Object({ displayName: Type.String({ minLength: 1, maxLength: 80 }) }),
    ])),
    meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) },
      { additionalProperties: false }),
  },
  { $id: 'PendingMembershipListResponse', additionalProperties: false },
);
export type PendingMembershipListResponse = Static<typeof PendingMembershipListResponseSchema>;

export const CommunityLifecycleProjectionSchema = Type.Object(
  {
    communityId: Type.String({ format: 'uuid' }),
    state: Type.Union([
      Type.Literal('ACTIVE'), Type.Literal('PAUSED'),
      Type.Literal('CLOSING'), Type.Literal('CLOSED'),
    ]),
    pauseStartedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    latestPauseDurationSeconds: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    version: Type.Integer({ minimum: 1 }),
    competitions: Type.Array(Type.Object(
      {
        competitionId: Type.String({ format: 'uuid' }),
        availability: Type.Union([
          Type.Literal('ACTIVE'), Type.Literal('PAUSED'), Type.Literal('CLOSED'),
        ]),
        version: Type.Integer({ minimum: 1 }),
      },
      { additionalProperties: false },
    )),
  },
  { $id: 'CommunityLifecycleProjection', additionalProperties: false },
);
export type CommunityLifecycleContract = Static<typeof CommunityLifecycleProjectionSchema>;

export const CommunityLifecycleResponseSchema = Type.Object(
  {
    data: CommunityLifecycleProjectionSchema,
    meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }),
  },
  { $id: 'CommunityLifecycleResponse', additionalProperties: false },
);
export type CommunityLifecycleResponse = Static<typeof CommunityLifecycleResponseSchema>;

export const CommunityLifecycleCommandResponseSchema = Type.Object(
  {
    data: CommunityLifecycleProjectionSchema,
    meta: Type.Object({
      requestId: Type.String({ format: 'uuid' }),
      eventId: Type.String({ format: 'uuid' }),
      replayed: Type.Boolean(),
    }),
  },
  { $id: 'CommunityLifecycleCommandResponse', additionalProperties: false },
);
export type CommunityLifecycleCommandResponse = Static<typeof CommunityLifecycleCommandResponseSchema>;

export const CommunityLifecycleReasonBodySchema = Type.Object(
  { reason: Type.String({ minLength: 1, maxLength: 500 }) },
  { $id: 'CommunityLifecycleReasonBody', additionalProperties: false },
);
export type CommunityLifecycleReasonBody = Static<typeof CommunityLifecycleReasonBodySchema>;

const CommunityClosureDispositionSchema = Type.Union([
  Type.Literal('RETAIN_TO_COMPLETION'), Type.Literal('CANCEL_NO_FAULT'),
]);

export const CommunityClosureSessionCandidateSchema = Type.Object(
  {
    sessionId: Type.String({ format: 'uuid' }),
    state: Type.Union([
      Type.Literal('SCHEDULED'), Type.Literal('READY_FOR_COACH'), Type.Literal('IN_PROGRESS'),
      Type.Literal('ENDED'),
    ]),
    scheduledStartAt: Type.String({ format: 'date-time' }),
    scheduledEndAt: Type.String({ format: 'date-time' }),
    athleteDisplayNames: Type.Tuple([Type.String(), Type.String()]),
    recommendedDisposition: CommunityClosureDispositionSchema,
    cancellationAllowed: Type.Boolean(),
  },
  { $id: 'CommunityClosureSessionCandidate', additionalProperties: false },
);
export type CommunityClosureSessionCandidateContract =
  Static<typeof CommunityClosureSessionCandidateSchema>;

export const CommunityClosureCandidatesResponseSchema = Type.Object(
  {
    data: Type.Array(CommunityClosureSessionCandidateSchema),
    meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }),
  },
  { $id: 'CommunityClosureCandidatesResponse', additionalProperties: false },
);
export type CommunityClosureCandidatesResponse =
  Static<typeof CommunityClosureCandidatesResponseSchema>;

export const CommunityClosurePlanSchema = Type.Object(
  {
    planId: Type.String({ format: 'uuid' }),
    communityId: Type.String({ format: 'uuid' }),
    planVersion: Type.Integer({ minimum: 1 }),
    planState: Type.Union([Type.Literal('SCHEDULED'), Type.Literal('FINALIZED')]),
    communityState: Type.Union([Type.Literal('CLOSING'), Type.Literal('CLOSED')]),
    category: Type.String({ minLength: 1, maxLength: 80 }),
    reason: Type.String({ minLength: 1, maxLength: 500 }),
    emergency: Type.Boolean(),
    effectiveAt: Type.String({ format: 'date-time' }),
    scheduledAt: Type.String({ format: 'date-time' }),
    finalizedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    retainedSessionCount: Type.Integer({ minimum: 0 }),
    cancelledSessionCount: Type.Integer({ minimum: 0 }),
    communityVersion: Type.Integer({ minimum: 1 }),
  },
  { $id: 'CommunityClosurePlan', additionalProperties: false },
);
export type CommunityClosurePlanContract = Static<typeof CommunityClosurePlanSchema>;

export const CommunityClosurePlanResponseSchema = Type.Object(
  {
    data: CommunityClosurePlanSchema,
    meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }),
  },
  { $id: 'CommunityClosurePlanResponse', additionalProperties: false },
);
export type CommunityClosurePlanResponse = Static<typeof CommunityClosurePlanResponseSchema>;

export const CommunityClosureCommandResponseSchema = Type.Object(
  {
    data: CommunityClosurePlanSchema,
    meta: Type.Object({
      requestId: Type.String({ format: 'uuid' }),
      eventId: Type.String({ format: 'uuid' }),
      replayed: Type.Boolean(),
    }),
  },
  { $id: 'CommunityClosureCommandResponse', additionalProperties: false },
);
export type CommunityClosureCommandResponse = Static<typeof CommunityClosureCommandResponseSchema>;

export const ScheduleCommunityClosureBodySchema = Type.Object(
  {
    category: Type.String({ minLength: 1, maxLength: 80 }),
    reason: Type.String({ minLength: 1, maxLength: 500 }),
    emergency: Type.Boolean(),
    effectiveAt: Type.String({ format: 'date-time' }),
    sessionDispositions: Type.Array(Type.Object(
      {
        sessionId: Type.String({ format: 'uuid' }),
        disposition: CommunityClosureDispositionSchema,
      },
      { additionalProperties: false },
    )),
  },
  { $id: 'ScheduleCommunityClosureBody', additionalProperties: false },
);
export type ScheduleCommunityClosureBody = Static<typeof ScheduleCommunityClosureBodySchema>;

export const FinalizeCommunityClosureBodySchema = Type.Object(
  {
    planId: Type.String({ format: 'uuid' }),
    reason: Type.String({ minLength: 1, maxLength: 500 }),
  },
  { $id: 'FinalizeCommunityClosureBody', additionalProperties: false },
);
export type FinalizeCommunityClosureBody = Static<typeof FinalizeCommunityClosureBodySchema>;

const CompetitionPhaseSchema = Type.Union([
  Type.Literal('FOUNDING_OPEN'),
  Type.Literal('FOUNDING_CHALLENGE'),
  Type.Literal('RUNNING'),
  Type.Literal('CONTENDER_VACANT_OPEN'),
  Type.Literal('CONTENDER_GENESIS'),
  Type.Literal('CLOSED'),
]);

const StatusQueueEntryStateSchema = Type.Union([
  Type.Literal('WAITING'),
  Type.Literal('PAIRED_PENDING_ACCEPTANCE'),
  Type.Literal('RECONFIRMATION_REQUIRED'),
  Type.Literal('ACTIVATED'),
  Type.Literal('CONSUMED'),
  Type.Literal('WITHDRAWN'),
  Type.Literal('INVALIDATED'),
  Type.Literal('EXPIRED'),
]);

export const StatusQueueEntrySchema = Type.Object(
  {
    queueEntryId: Type.String({ format: 'uuid' }),
    competitionId: Type.String({ format: 'uuid' }),
    initiatorUserId: Type.String({ format: 'uuid' }),
    initiatorDisplayName: Type.String(),
    targetStatus: Type.Union([Type.Literal('CHAMPION'), Type.Literal('CONTENDER')]),
    kind: Type.Union([
      Type.Literal('DIRECT_STATUS'),
      Type.Literal('GENESIS_CANDIDATE'),
      Type.Literal('PREBOOKED_CONVERSION'),
    ]),
    state: StatusQueueEntryStateSchema,
    boundHolderUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    submittedAt: Type.String({ format: 'date-time' }),
    reconfirmationDeadlineAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    singleCandidateDeadlineAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    position: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    isViewerEntry: Type.Boolean(),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'StatusQueueEntry', additionalProperties: false },
);

const StatusHolderSchema = Type.Object(
  {
    userId: Type.String({ format: 'uuid' }),
    displayName: Type.String(),
  },
  { additionalProperties: false },
);

export const CompetitionStatusSchema = Type.Object(
  {
    competitionId: Type.String({ format: 'uuid' }),
    phase: CompetitionPhaseSchema,
    availability: Type.Union([
      Type.Literal('ACTIVE'),
      Type.Literal('PAUSED'),
      Type.Literal('CLOSED'),
    ]),
    champion: Type.Union([StatusHolderSchema, Type.Null()]),
    contender: Type.Union([StatusHolderSchema, Type.Null()]),
    statusVersion: Type.Integer({ minimum: 0 }),
    viewerStatus: Type.Union([
      Type.Literal('ORDINARY'),
      Type.Literal('CHAMPION'),
      Type.Literal('CONTENDER'),
    ]),
    visibility: Type.Union([Type.Literal('FULL'), Type.Literal('AGGREGATE')]),
    queueSize: Type.Integer({ minimum: 0 }),
    queue: Type.Array(StatusQueueEntrySchema),
    activeChallenge: Type.Union([
      Type.Object(
        {
          challengeId: Type.String({ format: 'uuid' }),
          serviceChatId: Type.String({ format: 'uuid' }),
          state: ChallengeStateSchema,
          responsePolicy: Type.Union([
            Type.Literal('OPTIONAL'),
            Type.Literal('MANDATORY'),
            Type.Literal('MUTUAL_GENESIS'),
          ]),
          stake: Type.Union([
            Type.Literal('CONTENDER'),
            Type.Literal('TITLE'),
            Type.Literal('GENESIS_CHAMPION'),
            Type.Literal('GENESIS_CONTENDER'),
          ]),
          initiatorDisplayName: Type.String(),
          recipientDisplayName: Type.String(),
          viewerIsParticipant: Type.Boolean(),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    viewerGenesisAction: Type.Union([
      Type.Object(
        {
          challengeId: Type.String({ format: 'uuid' }),
          serviceChatId: Type.String({ format: 'uuid' }),
          state: ChallengeStateSchema,
          opponentDisplayName: Type.String(),
          responseDeadlineAt: Type.String({ format: 'date-time' }),
          rulesetRef: Type.String({ minLength: 1 }),
          rulesetAckMode: Type.Union([
            Type.Literal('IMPLICIT_ON_ACCEPT'),
            Type.Literal('EXPLICIT_ACK_REQUIRED'),
          ]),
          viewerDecision: Type.Union([
            Type.Literal('ACCEPT'),
            Type.Literal('DECLINE'),
            Type.Null(),
          ]),
          acceptedCount: Type.Integer({ minimum: 0, maximum: 2 }),
          canAccept: Type.Boolean(),
          canDecline: Type.Boolean(),
          version: Type.Integer({ minimum: 1 }),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    viewerQueueEntryId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    canJoinQueue: Type.Boolean(),
    joinDenialCode: Type.Union([
      Type.Literal('ACCOUNT_NOT_ACTIVE'),
      Type.Literal('ACCOUNT_NOT_VERIFIED'),
      Type.Literal('COMMUNITY_NOT_ACTIVE'),
      Type.Literal('MEMBERSHIP_NOT_ACTIVE'),
      Type.Literal('AGE_CONTOUR_MISMATCH'),
      Type.Literal('COMPETITION_NOT_ACTIVE'),
      Type.Literal('COMPETITION_INTEGRITY_HOLD'),
      Type.Literal('COMPETITION_PHASE_UNAVAILABLE'),
      Type.Literal('ALREADY_STATUS_HOLDER'),
      Type.Literal('LIVE_QUEUE_ENTRY_EXISTS'),
      Type.Literal('PAIR_COOLDOWN_ACTIVE'),
      Type.Literal('PAIR_CHALLENGE_EXISTS'),
      Type.Literal('QUEUE_ENTRY_NOT_FOUND'),
      Type.Literal('QUEUE_ENTRY_INITIATOR_REQUIRED'),
      Type.Literal('QUEUE_ENTRY_NOT_WAITING'),
      Type.Literal('QUEUE_ENTRY_NOT_HEAD'),
      Type.Literal('STATUS_SLOT_OCCUPIED'),
      Type.Literal('BOUND_HOLDER_CHANGED'),
      Type.Literal('QUEUE_RECONFIRMATION_NOT_REQUIRED'),
      Type.Literal('QUEUE_RECONFIRMATION_EXPIRED'),
      Type.Literal('QUEUE_RECONFIRMATION_NOT_DUE'),
      Type.Literal('GENESIS_CHALLENGE_NOT_FOUND'),
      Type.Literal('GENESIS_PARTICIPANT_REQUIRED'),
      Type.Literal('GENESIS_RESPONSE_NOT_PENDING'),
      Type.Literal('GENESIS_RESPONSE_EXPIRED'),
      Type.Literal('GENESIS_RESPONSE_NOT_DUE'),
      Type.Literal('GENESIS_RESPONSE_ALREADY_RECORDED'),
      Type.Literal('GENESIS_SINGLE_WINDOW_NOT_STARTED'),
      Type.Literal('GENESIS_SINGLE_PROMOTION_NOT_DUE'),
      Type.Literal('GENESIS_SINGLE_CANDIDATE_CHANGED'),
      Type.Literal('RULESET_ACK_REQUIRED'),
      Type.Literal('OFFICIAL_OBLIGATION_LIMIT'),
      Type.Null(),
    ]),
    policyVersion: Type.Literal('status-queue-mvp-v1'),
  },
  { $id: 'CompetitionStatus', additionalProperties: false },
);

export const CompetitionStatusResponseSchema = Type.Object(
  {
    data: CompetitionStatusSchema,
    meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }),
  },
  { $id: 'CompetitionStatusResponse', additionalProperties: false },
);

export type CompetitionStatusResponse = Static<typeof CompetitionStatusResponseSchema>;

export const StatusQueueEntryCommandResponseSchema = Type.Object(
  {
    data: StatusQueueEntrySchema,
    meta: Type.Object({
      requestId: Type.String({ format: 'uuid' }),
      eventId: Type.String({ format: 'uuid' }),
      replayed: Type.Boolean(),
    }),
  },
  { $id: 'StatusQueueEntryCommandResponse', additionalProperties: false },
);

export type StatusQueueEntryCommandResponse = Static<
  typeof StatusQueueEntryCommandResponseSchema
>;

export const PreviewStatusReleaseBodySchema = Type.Object(
  { competitionId: Type.String({ format: 'uuid' }) },
  { $id: 'PreviewStatusReleaseBody', additionalProperties: false },
);

export type PreviewStatusReleaseBody = Static<typeof PreviewStatusReleaseBodySchema>;

export const ConfirmStatusReleaseBodySchema = Type.Object(
  { confirmationToken: Type.String({ format: 'uuid' }) },
  { $id: 'ConfirmStatusReleaseBody', additionalProperties: false },
);

export type ConfirmStatusReleaseBody = Static<typeof ConfirmStatusReleaseBodySchema>;

export const StatusReleaseSchema = Type.Object(
  {
    releaseId: Type.String({ format: 'uuid' }),
    competitionId: Type.String({ format: 'uuid' }),
    releasedStatus: Type.Union([Type.Literal('CHAMPION'), Type.Literal('CONTENDER')]),
    consequence: Type.Union([
      Type.Literal('CHAMPION_SUCCESSION'),
      Type.Literal('CHAMPION_VACANCY'),
      Type.Literal('CONTENDER_VACANCY'),
    ]),
    state: Type.Union([Type.Literal('PREVIEWED'), Type.Literal('CONFIRMED')]),
    successorUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    successorDisplayName: Type.Union([Type.String(), Type.Null()]),
    beforeStatusVersion: Type.Integer({ minimum: 0 }),
    afterStatusVersion: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    previewExpiresAt: Type.String({ format: 'date-time' }),
    confirmationToken: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    membershipRemainsActive: Type.Literal(true),
    createsResult: Type.Literal(false),
    createsLoss: Type.Literal(false),
    createsCooldown: Type.Literal(false),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'StatusRelease', additionalProperties: false },
);

export const StatusReleaseCommandResponseSchema = Type.Object(
  {
    data: StatusReleaseSchema,
    meta: Type.Object({
      requestId: Type.String({ format: 'uuid' }),
      eventId: Type.String({ format: 'uuid' }),
      replayed: Type.Boolean(),
    }),
  },
  { $id: 'StatusReleaseCommandResponse', additionalProperties: false },
);

export type StatusReleaseCommandResponse = Static<typeof StatusReleaseCommandResponseSchema>;

export const PreviewMembershipExitBodySchema = Type.Object(
  { membershipId: Type.String({ format: 'uuid' }) },
  { $id: 'PreviewMembershipExitBody', additionalProperties: false },
);

export type PreviewMembershipExitBody = Static<typeof PreviewMembershipExitBodySchema>;

export const ConfirmMembershipExitBodySchema = Type.Object(
  { confirmationToken: Type.String({ format: 'uuid' }) },
  { $id: 'ConfirmMembershipExitBody', additionalProperties: false },
);

export type ConfirmMembershipExitBody = Static<typeof ConfirmMembershipExitBodySchema>;

export const MembershipExitSchema = Type.Object(
  {
    exitId: Type.String({ format: 'uuid' }),
    membershipId: Type.String({ format: 'uuid' }),
    competitionId: Type.String({ format: 'uuid' }),
    departingStatus: Type.Union([
      Type.Literal('ORDINARY'), Type.Literal('CHAMPION'), Type.Literal('CONTENDER'),
    ]),
    consequence: Type.Union([
      Type.Literal('ORDINARY_EXIT'), Type.Literal('CHAMPION_SUCCESSION'),
      Type.Literal('CHAMPION_VACANCY'), Type.Literal('CONTENDER_VACANCY'),
      Type.Literal('ACCEPTED_CHALLENGE_FORFEIT'),
    ]),
    state: Type.Union([Type.Literal('PREVIEWED'), Type.Literal('CONFIRMED')]),
    successorUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    successorDisplayName: Type.Union([Type.String(), Type.Null()]),
    opponentUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    opponentDisplayName: Type.Union([Type.String(), Type.Null()]),
    challengeId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    resultId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    beforeMembershipVersion: Type.Integer({ minimum: 1 }),
    afterMembershipVersion: Type.Union([Type.Integer({ minimum: 2 }), Type.Null()]),
    beforeStatusVersion: Type.Integer({ minimum: 0 }),
    afterStatusVersion: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    previewExpiresAt: Type.String({ format: 'date-time' }),
    confirmationToken: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    closedChallengeCount: Type.Integer({ minimum: 0 }),
    invalidatedQueueEntryCount: Type.Integer({ minimum: 0 }),
    createsForfeit: Type.Boolean(),
    createsLoss: Type.Boolean(),
    createsCooldown: Type.Boolean(),
    appealWaived: Type.Boolean(),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'MembershipExit', additionalProperties: false },
);

export const MembershipExitCommandResponseSchema = Type.Object(
  {
    data: MembershipExitSchema,
    meta: Type.Object({
      requestId: Type.String({ format: 'uuid' }),
      eventId: Type.String({ format: 'uuid' }),
      replayed: Type.Boolean(),
    }),
  },
  { $id: 'MembershipExitCommandResponse', additionalProperties: false },
);

export type MembershipExitCommandResponse = Static<typeof MembershipExitCommandResponseSchema>;

export const MembershipRemovalCaseStateSchema = Type.Union([
  Type.Literal('REMOVED_APPEALABLE'),
  Type.Literal('UNDER_REVIEW'),
  Type.Literal('APPEALED'),
  Type.Literal('CONFIRMED'),
  Type.Literal('REJECTED'),
  Type.Literal('OVERTURNED'),
]);

export const MembershipRemovalCaseSchema = Type.Object(
  {
    caseId: Type.String({ format: 'uuid' }),
    membershipId: Type.String({ format: 'uuid' }),
    communityId: Type.String({ format: 'uuid' }),
    competitionId: Type.String({ format: 'uuid' }),
    subjectUserId: Type.String({ format: 'uuid' }),
    subjectDisplayName: Type.String({ minLength: 1, maxLength: 80 }),
    requestedByUserId: Type.String({ format: 'uuid' }),
    requestedByDisplayName: Type.String({ minLength: 1, maxLength: 80 }),
    subjectStatus: Type.Union([
      Type.Literal('ORDINARY'), Type.Literal('CHAMPION'), Type.Literal('CONTENDER'),
    ]),
    state: MembershipRemovalCaseStateSchema,
    requestReason: Type.String({ minLength: 10, maxLength: 1000 }),
    requestedAt: Type.String({ format: 'date-time' }),
    appealDeadlineAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    appealReason: Type.Union([Type.String({ minLength: 10, maxLength: 1000 }), Type.Null()]),
    appealedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    reviewedByUserId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    decisionReason: Type.Union([Type.String({ minLength: 10, maxLength: 1000 }), Type.Null()]),
    decidedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    replacementMembershipId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    cancelledChallengeCount: Type.Integer({ minimum: 0 }),
    cancelledBookingCount: Type.Integer({ minimum: 0 }),
    invalidatedQueueEntryCount: Type.Integer({ minimum: 0 }),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'MembershipRemovalCase', additionalProperties: false },
);

export const RequestMembershipRemovalBodySchema = Type.Object(
  { reason: Type.String({ minLength: 10, maxLength: 1000 }) },
  { $id: 'RequestMembershipRemovalBody', additionalProperties: false },
);
export type RequestMembershipRemovalBody = Static<typeof RequestMembershipRemovalBodySchema>;

export const AppealMembershipRemovalBodySchema = Type.Object(
  { reason: Type.String({ minLength: 10, maxLength: 1000 }) },
  { $id: 'AppealMembershipRemovalBody', additionalProperties: false },
);
export type AppealMembershipRemovalBody = Static<typeof AppealMembershipRemovalBodySchema>;

export const DecideMembershipRemovalBodySchema = Type.Object(
  {
    decision: Type.Union([
      Type.Literal('CONFIRM_REMOVAL'), Type.Literal('REJECT_REMOVAL'),
    ]),
    reason: Type.String({ minLength: 10, maxLength: 1000 }),
    cancelConfirmedSessions: Type.Boolean(),
  },
  { $id: 'DecideMembershipRemovalBody', additionalProperties: false },
);
export type DecideMembershipRemovalBody = Static<typeof DecideMembershipRemovalBodySchema>;

export const MembershipRemovalCommandResponseSchema = Type.Object(
  {
    data: MembershipRemovalCaseSchema,
    meta: Type.Object(
      {
        requestId: Type.String({ format: 'uuid' }),
        eventId: Type.String({ format: 'uuid' }),
        replayed: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'MembershipRemovalCommandResponse', additionalProperties: false },
);
export type MembershipRemovalCommandResponse = Static<
  typeof MembershipRemovalCommandResponseSchema
>;

export const MembershipRemovalListResponseSchema = Type.Object(
  {
    data: Type.Array(MembershipRemovalCaseSchema),
    meta: Type.Object(
      { requestId: Type.String({ format: 'uuid' }) },
      { additionalProperties: false },
    ),
  },
  { $id: 'MembershipRemovalListResponse', additionalProperties: false },
);
export type MembershipRemovalListResponse = Static<typeof MembershipRemovalListResponseSchema>;

export const VenueMemberSchema = Type.Object(
  {
    membershipId: Type.String({ format: 'uuid' }),
    userId: Type.String({ format: 'uuid' }),
    displayName: Type.String({ minLength: 1, maxLength: 80 }),
    ageDivision: Type.Union([Type.Literal('YOUTH'), Type.Literal('ADULT')]),
    membershipState: Type.Union([Type.Literal('ACTIVE'), Type.Literal('UNDER_REVIEW')]),
    status: Type.Union([
      Type.Literal('ORDINARY'), Type.Literal('CHAMPION'), Type.Literal('CONTENDER'),
    ]),
    latestRemovalCase: Type.Union([MembershipRemovalCaseSchema, Type.Null()]),
  },
  { $id: 'VenueMember', additionalProperties: false },
);

export const VenueMemberListResponseSchema = Type.Object(
  {
    data: Type.Array(VenueMemberSchema),
    meta: Type.Object(
      { requestId: Type.String({ format: 'uuid' }) },
      { additionalProperties: false },
    ),
  },
  { $id: 'VenueMemberListResponse', additionalProperties: false },
);
export type VenueMemberListResponse = Static<typeof VenueMemberListResponseSchema>;

export const GenesisResponseBodySchema = Type.Object(
  { explicitRulesetAcknowledged: Type.Optional(Type.Boolean()) },
  { $id: 'GenesisResponseBody', additionalProperties: false },
);

export const GenesisResponseProjectionSchema = Type.Object(
  {
    challengeId: Type.String({ format: 'uuid' }),
    competitionId: Type.String({ format: 'uuid' }),
    serviceChatId: Type.String({ format: 'uuid' }),
    state: ChallengeStateSchema,
    opponentDisplayName: Type.String(),
    responseDeadlineAt: Type.String({ format: 'date-time' }),
    rulesetRef: Type.String({ minLength: 1 }),
    rulesetAckMode: Type.Union([
      Type.Literal('IMPLICIT_ON_ACCEPT'),
      Type.Literal('EXPLICIT_ACK_REQUIRED'),
    ]),
    viewerDecision: Type.Union([
      Type.Literal('ACCEPT'),
      Type.Literal('DECLINE'),
      Type.Null(),
    ]),
    acceptedCount: Type.Integer({ minimum: 0, maximum: 2 }),
    canAccept: Type.Boolean(),
    canDecline: Type.Boolean(),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'GenesisResponseProjection', additionalProperties: false },
);

export const GenesisResponseCommandResponseSchema = Type.Object(
  {
    data: GenesisResponseProjectionSchema,
    meta: Type.Object({
      requestId: Type.String({ format: 'uuid' }),
      eventId: Type.String({ format: 'uuid' }),
      replayed: Type.Boolean(),
    }),
  },
  { $id: 'GenesisResponseCommandResponse', additionalProperties: false },
);

export type GenesisResponseBody = Static<typeof GenesisResponseBodySchema>;
export type GenesisResponseCommandResponse = Static<typeof GenesisResponseCommandResponseSchema>;

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

export const AppointGymAdminBodySchema = Type.Object(
  {
    userId: Type.String({ format: 'uuid' }),
    reasonCode: Type.String({ minLength: 3, maxLength: 80 }),
  },
  { $id: 'AppointGymAdminBody', additionalProperties: false },
);

export type AppointGymAdminBody = Static<typeof AppointGymAdminBodySchema>;

export const ChangePrimaryAdminBodySchema = Type.Object(
  {
    userId: Type.String({ format: 'uuid' }),
    reasonCode: Type.String({ minLength: 3, maxLength: 80 }),
  },
  { $id: 'ChangePrimaryAdminBody', additionalProperties: false },
);

export type ChangePrimaryAdminBody = Static<typeof ChangePrimaryAdminBodySchema>;

export const PrimaryAdminProjectionSchema = Type.Object(
  {
    venueId: Type.String({ format: 'uuid' }),
    primaryGrantId: Type.String({ format: 'uuid' }),
    primaryAdminUserId: Type.String({ format: 'uuid' }),
    previousPrimaryAdminUserId: Type.Union([
      Type.String({ format: 'uuid' }),
      Type.Null(),
    ]),
    change: Type.Union([Type.Literal('APPOINTED'), Type.Literal('TRANSFERRED')]),
    version: Type.Integer({ minimum: 1 }),
  },
  { $id: 'PrimaryAdminProjection', additionalProperties: false },
);

export const PrimaryAdminCommandResponseSchema = Type.Object(
  {
    data: PrimaryAdminProjectionSchema,
    meta: Type.Object({
      requestId: Type.String({ format: 'uuid' }),
      eventId: Type.String({ format: 'uuid' }),
      replayed: Type.Boolean(),
    }),
  },
  { $id: 'PrimaryAdminCommandResponse', additionalProperties: false },
);

export type PrimaryAdminCommandResponse = Static<
  typeof PrimaryAdminCommandResponseSchema
>;

export const VenueRoleSummaryResponseSchema = Type.Object(
  {
    data: Type.Object(
      {
        venueId: Type.String({ format: 'uuid' }),
        primaryAdminVersion: Type.Integer({ minimum: 0 }),
        activeGrants: Type.Array(RoleGrantProjectionSchema),
      },
      { additionalProperties: false },
    ),
    meta: Type.Object({ requestId: Type.String({ format: 'uuid' }) }),
  },
  { $id: 'VenueRoleSummaryResponse', additionalProperties: false },
);

export type VenueRoleSummaryResponse = Static<
  typeof VenueRoleSummaryResponseSchema
>;

export const VerifyVenueBodySchema = Type.Object(
  {
    checklistVersion: Type.String({ minLength: 3, maxLength: 80 }),
    evidenceReference: Type.String({ minLength: 3, maxLength: 500 }),
    reasonCode: Type.String({ minLength: 3, maxLength: 80 }),
  },
  { $id: 'VerifyVenueBody', additionalProperties: false },
);

export type VerifyVenueBody = Static<typeof VerifyVenueBodySchema>;

export const VenueVerificationProjectionSchema = Type.Object(
  {
    venueId: Type.String({ format: 'uuid' }),
    displayName: Type.String(),
    state: Type.Literal('ACTIVE'),
    version: Type.Integer({ minimum: 2 }),
    communityCreationAllowed: Type.Literal(true),
    slotPublicationAllowed: Type.Literal(true),
  },
  { $id: 'VenueVerificationProjection', additionalProperties: false },
);

export const VenueVerificationCommandResponseSchema = Type.Object(
  {
    data: VenueVerificationProjectionSchema,
    meta: Type.Object({
      requestId: Type.String({ format: 'uuid' }),
      eventId: Type.String({ format: 'uuid' }),
      replayed: Type.Boolean(),
    }),
  },
  { $id: 'VenueVerificationCommandResponse', additionalProperties: false },
);

export type VenueVerificationCommandResponse = Static<
  typeof VenueVerificationCommandResponseSchema
>;
