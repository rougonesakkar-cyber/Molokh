import {
  AUTH_SESSION_POLICY_VERSION,
  AuthSessionConflictError,
  assertAuthOtpCanBeRequested,
  assertAuthOtpCanBeVerified,
  assertAuthSessionCanBeRotated,
  authAccessTokenExpiresAt,
  authOtpExpiresAt,
  authRefreshTokenExpiresAt,
  deriveAuthAccessMode,
  type AuthAccessMode,
  type AuthOtpChallengeState,
  type AuthOtpTransport,
  type AuthRefreshTokenState,
  type AuthSessionFamilyState,
  type CommandEnvelope,
} from '@molokh/core';
import { sql, type Kysely } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand } from './platform-command.js';

export interface AuthCommandEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
}

export interface AuthOtpRequestEffectIds extends AuthCommandEffectIds {
  readonly expiredChallengeEventId: string;
}

export interface AuthSessionIssueIds extends AuthCommandEffectIds {
  readonly trustedSessionId: string;
  readonly familyId: string;
  readonly refreshTokenId: string;
  readonly accessTokenId: string;
  readonly sessionEventId: string;
}

export interface AuthSessionRotationIds extends AuthCommandEffectIds {
  readonly refreshTokenId: string;
  readonly accessTokenId: string;
}

export interface RequestAuthOtpPayload {
  readonly phoneE164: string;
  readonly transport: AuthOtpTransport;
  readonly localDevelopmentTransportEnabled: boolean;
  readonly smsTransportAvailable: boolean;
  readonly smsOptedIn: boolean;
}

export interface VerifyAuthOtpPayload {
  readonly challengeId: string;
  readonly deviceLabel: string | null;
}

export interface RotateAuthSessionPayload {
  readonly familyId: string;
  readonly refreshTokenId: string;
  readonly generation: number;
}

export interface RevokeAuthSessionPayload {
  readonly familyId: string;
  readonly reason: 'LOGOUT' | 'REFRESH_REUSE' | 'CENTRAL_REVOCATION';
}

export interface AuthOtpChallengeProjection {
  readonly challengeId: string;
  readonly userId: string;
  readonly phoneE164: string;
  readonly transport: AuthOtpTransport;
  readonly state: AuthOtpChallengeState;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly expiresAt: string;
  readonly version: number;
}

export interface AuthSessionProjection {
  readonly userId: string;
  readonly familyId: string;
  readonly accessTokenId: string;
  readonly refreshTokenId: string;
  readonly generation: number;
  readonly accessExpiresAt: string;
  readonly refreshExpiresAt: string;
}

export interface AuthOtpVerificationProjection {
  readonly outcome: 'VERIFIED' | 'INVALID_CODE' | 'LOCKED' | 'EXPIRED';
  readonly challenge: AuthOtpChallengeProjection;
  readonly session: AuthSessionProjection | null;
}

export interface AuthenticatedSessionProjection {
  readonly userId: string;
  readonly familyId: string;
  readonly familyVersion: number;
  readonly trustedSessionId: string;
  readonly accessMode: AuthAccessMode;
}

export interface RefreshTokenContext {
  readonly userId: string;
  readonly familyId: string;
  readonly familyState: AuthSessionFamilyState;
  readonly familyVersion: number;
  readonly refreshTokenId: string;
  readonly refreshTokenState: AuthRefreshTokenState;
  readonly generation: number;
  readonly refreshExpiresAt: string;
}

interface UserRow {
  readonly user_id: string;
  readonly account_state: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
}

interface ChallengeRow {
  readonly challenge_id: string;
  readonly user_id: string;
  readonly phone_e164: string;
  readonly transport: AuthOtpTransport;
  readonly state: AuthOtpChallengeState;
  readonly code_verifier_hash: string;
  readonly attempts: number;
  readonly max_attempts: number;
  readonly expires_at: Date;
  readonly version: string;
}

function challengeProjection(row: ChallengeRow): AuthOtpChallengeProjection {
  return {
    challengeId: row.challenge_id,
    userId: row.user_id,
    phoneE164: row.phone_e164,
    transport: row.transport,
    state: row.state,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    expiresAt: row.expires_at.toISOString(),
    version: Number(row.version),
  };
}

function assertSha256(value: string, field: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new TypeError(`${field} must be a SHA-256 hash`);
}

export async function requestAuthOtp(
  database: Kysely<Database>,
  command: CommandEnvelope<RequestAuthOtpPayload>,
  ids: AuthOtpRequestEffectIds,
  codeVerifierHash: string,
  now?: () => Date,
): Promise<ExecutedCommand<AuthOtpChallengeProjection>> {
  assertSha256(codeVerifierHash, 'codeVerifierHash');
  return executeCriticalCommand<RequestAuthOtpPayload, AuthOtpChallengeProjection>(database, {
    command,
    mutate: async (transaction, context) => {
      const userResult = await sql<UserRow>`
        select user_id, account_state
        from identity.users
        where phone_e164 = ${command.payload.phoneE164}
          and phone_verified_at is not null
        for update
      `.execute(transaction);
      const user = userResult.rows[0];
      if (!user) throw new AuthSessionConflictError('AUTH_ACCOUNT_NOT_ACTIVE');
      assertAuthOtpCanBeRequested({ ...command.payload, accountState: user.account_state });

      const expiredResult = await sql<{
        readonly challenge_id: string; readonly user_id: string; readonly version: string;
      }>`
        select challenge_id, user_id, version::text
        from identity.auth_otp_challenges
        where user_id = ${user.user_id}::uuid
          and state = 'PENDING'
          and expires_at <= ${context.occurredAt.toISOString()}::timestamptz
        for update
      `.execute(transaction);
      const expired = expiredResult.rows[0];
      await sql`
        update identity.auth_otp_challenges
        set state = 'EXPIRED', version = version + 1,
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where user_id = ${user.user_id}::uuid
          and state = 'PENDING'
          and expires_at <= ${context.occurredAt.toISOString()}::timestamptz
      `.execute(transaction);
      const liveResult = await sql<{ readonly exists: boolean }>`
        select exists (
          select 1 from identity.auth_otp_challenges
          where user_id = ${user.user_id}::uuid and state = 'PENDING'
        ) as exists
      `.execute(transaction);
      if (liveResult.rows[0]?.exists) {
        throw new AuthSessionConflictError('AUTH_OTP_INVALID_STATE');
      }

      const expiresAt = authOtpExpiresAt(context.occurredAt);
      const projection: AuthOtpChallengeProjection = {
        challengeId: command.aggregateId,
        userId: user.user_id,
        phoneE164: command.payload.phoneE164,
        transport: command.payload.transport,
        state: 'PENDING', attempts: 0, maxAttempts: 5,
        expiresAt: expiresAt.toISOString(), version: context.nextVersion,
      };
      await sql`
        insert into identity.auth_otp_challenges (
          challenge_id, user_id, phone_e164, transport, state, code_verifier_hash,
          attempts, max_attempts, expires_at, verified_at, created_at, updated_at, version
        ) values (
          ${command.aggregateId}::uuid, ${user.user_id}::uuid, ${command.payload.phoneE164},
          ${command.payload.transport}, 'PENDING', ${codeVerifierHash}, 0, 5,
          ${expiresAt.toISOString()}::timestamptz, null,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz, ${context.nextVersion}
        )
      `.execute(transaction);
      return {
        responseStatus: 202,
        response: projection,
        event: { eventId: ids.eventId, eventName: 'AuthOtpRequested', schemaVersion: 1,
          transitionId: null, payload: { challengeId: projection.challengeId,
            userId: projection.userId, transport: projection.transport,
            expiresAt: projection.expiresAt },
          metadata: { policyVersion: AUTH_SESSION_POLICY_VERSION } },
        relatedEvents: expired ? [{ eventId: ids.expiredChallengeEventId,
          eventName: 'AuthOtpClosed', schemaVersion: 1,
          aggregateType: 'AuthOtpChallenge', aggregateId: expired.challenge_id,
          aggregateVersion: Number(expired.version) + 1, transitionId: null,
          payload: { challengeId: expired.challenge_id, userId: expired.user_id,
            outcome: 'EXPIRED' },
          metadata: { policyVersion: AUTH_SESSION_POLICY_VERSION,
            reason: 'REPLACED_BY_NEW_REQUEST' } }] : [],
        audit: { auditId: ids.auditId, action: 'AUTH_OTP_REQUESTED', transitionId: null,
          reasonCode: null, beforeState: null, afterState: 'PENDING',
          metadata: { transport: projection.transport,
            expiredChallengeId: expired?.challenge_id ?? null } },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'auth.otp.requested',
          payload: { challengeId: projection.challengeId, userId: projection.userId,
            transport: projection.transport, expiresAt: projection.expiresAt } }],
      };
    }, ...(now ? { now } : {}),
  });
}

export async function verifyAuthOtp(
  database: Kysely<Database>,
  command: CommandEnvelope<VerifyAuthOtpPayload>,
  ids: AuthSessionIssueIds,
  secrets: {
    readonly suppliedCodeVerifierHash: string;
    readonly sessionReferenceHash: string;
    readonly accessTokenHash: string;
    readonly refreshTokenHash: string;
  },
  now?: () => Date,
): Promise<ExecutedCommand<AuthOtpVerificationProjection>> {
  for (const [field, value] of Object.entries(secrets)) assertSha256(value, field);
  return executeCriticalCommand<VerifyAuthOtpPayload, AuthOtpVerificationProjection>(database, {
    command,
    mutate: async (transaction, context) => {
      const result = await sql<ChallengeRow>`
        select challenge_id, user_id, phone_e164, transport, state, code_verifier_hash,
               attempts, max_attempts, expires_at, version::text
        from identity.auth_otp_challenges
        where challenge_id = ${command.payload.challengeId}::uuid
        for update
      `.execute(transaction);
      const row = result.rows[0];
      if (!row || row.version !== String(command.expectedVersion)) {
        throw new AuthSessionConflictError('AUTH_OTP_INVALID_STATE');
      }

      let terminalOutcome: 'EXPIRED' | 'LOCKED' | null = null;
      try {
        assertAuthOtpCanBeVerified({ state: row.state, attempts: row.attempts,
          maxAttempts: row.max_attempts, expiresAt: row.expires_at,
          occurredAt: context.occurredAt });
      } catch (error) {
        if (error instanceof AuthSessionConflictError && error.code === 'AUTH_OTP_EXPIRED') {
          terminalOutcome = 'EXPIRED';
        } else if (error instanceof AuthSessionConflictError
          && error.code === 'AUTH_OTP_ATTEMPTS_EXHAUSTED') {
          terminalOutcome = 'LOCKED';
        } else {
          throw error;
        }
      }

      const codeMatches = row.code_verifier_hash === secrets.suppliedCodeVerifierHash;
      if (terminalOutcome !== null || !codeMatches) {
        const attempts = terminalOutcome === 'EXPIRED' ? row.attempts : row.attempts + 1;
        const state: AuthOtpChallengeState = terminalOutcome === 'EXPIRED'
          ? 'EXPIRED' : attempts >= row.max_attempts ? 'LOCKED' : 'PENDING';
        const outcome = state === 'PENDING' ? 'INVALID_CODE' : state;
        await sql`
          update identity.auth_otp_challenges
          set state = ${state}, attempts = ${attempts}, version = ${context.nextVersion},
              updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = ${row.challenge_id}::uuid
        `.execute(transaction);
        const projection = challengeProjection({ ...row, state, attempts,
          version: String(context.nextVersion) });
        return {
          responseStatus: 200,
          response: { outcome, challenge: projection, session: null },
          event: { eventId: ids.eventId,
            eventName: outcome === 'INVALID_CODE' ? 'AuthOtpVerificationFailed' : 'AuthOtpClosed',
            schemaVersion: 1, transitionId: null,
            payload: { challengeId: row.challenge_id, userId: row.user_id, outcome,
              attempts }, metadata: { policyVersion: AUTH_SESSION_POLICY_VERSION } },
          audit: { auditId: ids.auditId, action: 'AUTH_OTP_VERIFICATION_REJECTED',
            transitionId: null, reasonCode: outcome, beforeState: row.state,
            afterState: state, metadata: { attempts } },
          outbox: [{ messageId: ids.outboxMessageId, topic: 'auth.otp.verification-rejected',
            payload: { challengeId: row.challenge_id, userId: row.user_id, outcome } }],
        };
      }

      const accessExpiresAt = authAccessTokenExpiresAt(context.occurredAt);
      const refreshExpiresAt = authRefreshTokenExpiresAt(context.occurredAt);
      await sql`
        update identity.auth_otp_challenges
        set state = 'VERIFIED', verified_at = ${context.occurredAt.toISOString()}::timestamptz,
            version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where challenge_id = ${row.challenge_id}::uuid
      `.execute(transaction);
      await sql`
        insert into identity.trusted_sessions (
          trusted_session_id, user_id, session_reference_hash, state,
          trusted_at, revoked_at, last_seen_at, created_at, updated_at
        ) values (
          ${ids.trustedSessionId}::uuid, ${row.user_id}::uuid, ${secrets.sessionReferenceHash},
          'TRUSTED', ${context.occurredAt.toISOString()}::timestamptz, null,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into identity.auth_session_families (
          family_id, user_id, trusted_session_id, state, device_label, created_at,
          last_rotated_at, revoked_at, revoke_reason, policy_version, version, updated_at
        ) values (
          ${ids.familyId}::uuid, ${row.user_id}::uuid, ${ids.trustedSessionId}::uuid,
          'ACTIVE', ${command.payload.deviceLabel},
          ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz, null, null,
          ${AUTH_SESSION_POLICY_VERSION}, 1,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into identity.auth_refresh_tokens (
          refresh_token_id, family_id, token_hash, generation, state, issued_at,
          expires_at, used_at, replaced_by_token_id
        ) values (
          ${ids.refreshTokenId}::uuid, ${ids.familyId}::uuid, ${secrets.refreshTokenHash},
          1, 'ACTIVE', ${context.occurredAt.toISOString()}::timestamptz,
          ${refreshExpiresAt.toISOString()}::timestamptz, null, null
        )
      `.execute(transaction);
      await sql`
        insert into identity.auth_access_tokens (
          access_token_id, family_id, token_hash, generation, state, issued_at,
          expires_at, revoked_at
        ) values (
          ${ids.accessTokenId}::uuid, ${ids.familyId}::uuid, ${secrets.accessTokenHash},
          1, 'ACTIVE', ${context.occurredAt.toISOString()}::timestamptz,
          ${accessExpiresAt.toISOString()}::timestamptz, null
        )
      `.execute(transaction);

      const challenge = challengeProjection({ ...row, state: 'VERIFIED',
        version: String(context.nextVersion) });
      const session: AuthSessionProjection = { userId: row.user_id, familyId: ids.familyId,
        accessTokenId: ids.accessTokenId, refreshTokenId: ids.refreshTokenId, generation: 1,
        accessExpiresAt: accessExpiresAt.toISOString(), refreshExpiresAt: refreshExpiresAt.toISOString() };
      return {
        responseStatus: 200,
        response: { outcome: 'VERIFIED', challenge, session },
        event: { eventId: ids.eventId, eventName: 'AuthOtpVerified', schemaVersion: 1,
          transitionId: null, payload: { challengeId: row.challenge_id, userId: row.user_id },
          metadata: { policyVersion: AUTH_SESSION_POLICY_VERSION } },
        relatedEvents: [{ eventId: ids.sessionEventId, eventName: 'AuthSessionEstablished',
          schemaVersion: 1, aggregateType: 'AuthSessionFamily', aggregateId: ids.familyId,
          aggregateVersion: 1, transitionId: null,
          payload: { familyId: ids.familyId, userId: row.user_id,
            trustedSessionId: ids.trustedSessionId, generation: 1,
            accessExpiresAt: session.accessExpiresAt, refreshExpiresAt: session.refreshExpiresAt },
          metadata: { policyVersion: AUTH_SESSION_POLICY_VERSION } }],
        audit: { auditId: ids.auditId, action: 'AUTH_SESSION_ESTABLISHED', transitionId: null,
          reasonCode: null, beforeState: row.state, afterState: 'VERIFIED',
          metadata: { familyId: ids.familyId, trustedSessionId: ids.trustedSessionId } },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'auth.session.established',
          sourceEventId: ids.sessionEventId, payload: { familyId: ids.familyId,
            userId: row.user_id, generation: 1 } }],
      };
    }, ...(now ? { now } : {}),
  });
}

export async function readRefreshTokenContext(
  database: Kysely<Database>, tokenHash: string,
): Promise<RefreshTokenContext | null> {
  assertSha256(tokenHash, 'tokenHash');
  const result = await sql<{
    readonly user_id: string; readonly family_id: string;
    readonly family_state: AuthSessionFamilyState; readonly family_version: string;
    readonly refresh_token_id: string; readonly refresh_token_state: AuthRefreshTokenState;
    readonly generation: number; readonly expires_at: Date;
  }>`
    select family.user_id, family.family_id, family.state as family_state,
           family.version::text as family_version, token.refresh_token_id,
           token.state as refresh_token_state, token.generation, token.expires_at
    from identity.auth_refresh_tokens token
    join identity.auth_session_families family on family.family_id = token.family_id
    join identity.trusted_sessions trusted
      on trusted.trusted_session_id = family.trusted_session_id
    join identity.users users on users.user_id = family.user_id
    where token.token_hash = ${tokenHash}
      and trusted.state = 'TRUSTED'
      and users.account_state <> 'CLOSED'
  `.execute(database);
  const row = result.rows[0];
  return row ? { userId: row.user_id, familyId: row.family_id,
    familyState: row.family_state, familyVersion: Number(row.family_version),
    refreshTokenId: row.refresh_token_id, refreshTokenState: row.refresh_token_state,
    generation: row.generation, refreshExpiresAt: row.expires_at.toISOString() } : null;
}

export async function rotateAuthSession(
  database: Kysely<Database>,
  command: CommandEnvelope<RotateAuthSessionPayload>,
  ids: AuthSessionRotationIds,
  hashes: { readonly currentRefreshTokenHash: string; readonly nextRefreshTokenHash: string;
    readonly nextAccessTokenHash: string },
  now?: () => Date,
): Promise<ExecutedCommand<AuthSessionProjection>> {
  for (const [field, value] of Object.entries(hashes)) assertSha256(value, field);
  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const tokenResult = await sql<{
        readonly user_id: string; readonly family_state: AuthSessionFamilyState;
        readonly token_state: AuthRefreshTokenState; readonly expires_at: Date;
      }>`
        select family.user_id, family.state as family_state, token.state as token_state,
               token.expires_at
        from identity.auth_refresh_tokens token
        join identity.auth_session_families family on family.family_id = token.family_id
        where token.refresh_token_id = ${command.payload.refreshTokenId}::uuid
          and token.family_id = ${command.payload.familyId}::uuid
          and token.token_hash = ${hashes.currentRefreshTokenHash}
        for update of token, family
      `.execute(transaction);
      const token = tokenResult.rows[0];
      if (!token) throw new AuthSessionConflictError('AUTH_SESSION_INVALID_STATE');
      assertAuthSessionCanBeRotated({ familyState: token.family_state,
        refreshTokenState: token.token_state, refreshExpiresAt: token.expires_at,
        occurredAt: context.occurredAt });

      const generation = command.payload.generation + 1;
      const accessExpiresAt = authAccessTokenExpiresAt(context.occurredAt);
      const refreshExpiresAt = authRefreshTokenExpiresAt(context.occurredAt);
      await sql`
        update identity.auth_refresh_tokens
        set state = 'EXPIRED'
        where refresh_token_id = ${command.payload.refreshTokenId}::uuid
      `.execute(transaction);
      await sql`
        update identity.auth_access_tokens
        set state = 'REVOKED', revoked_at = ${context.occurredAt.toISOString()}::timestamptz
        where family_id = ${command.payload.familyId}::uuid and state = 'ACTIVE'
      `.execute(transaction);
      await sql`
        insert into identity.auth_refresh_tokens (
          refresh_token_id, family_id, token_hash, generation, state, issued_at,
          expires_at, used_at, replaced_by_token_id
        ) values (
          ${ids.refreshTokenId}::uuid, ${command.payload.familyId}::uuid,
          ${hashes.nextRefreshTokenHash}, ${generation}, 'ACTIVE',
          ${context.occurredAt.toISOString()}::timestamptz,
          ${refreshExpiresAt.toISOString()}::timestamptz, null, null
        )
      `.execute(transaction);
      await sql`
        update identity.auth_refresh_tokens
        set state = 'ROTATED', used_at = ${context.occurredAt.toISOString()}::timestamptz,
            replaced_by_token_id = ${ids.refreshTokenId}::uuid
        where refresh_token_id = ${command.payload.refreshTokenId}::uuid
      `.execute(transaction);
      await sql`
        insert into identity.auth_access_tokens (
          access_token_id, family_id, token_hash, generation, state, issued_at,
          expires_at, revoked_at
        ) values (
          ${ids.accessTokenId}::uuid, ${command.payload.familyId}::uuid,
          ${hashes.nextAccessTokenHash}, ${generation}, 'ACTIVE',
          ${context.occurredAt.toISOString()}::timestamptz,
          ${accessExpiresAt.toISOString()}::timestamptz, null
        )
      `.execute(transaction);
      await sql`
        update identity.auth_session_families
        set last_rotated_at = ${context.occurredAt.toISOString()}::timestamptz,
            version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where family_id = ${command.payload.familyId}::uuid
      `.execute(transaction);
      await sql`
        update identity.trusted_sessions trusted
        set last_seen_at = ${context.occurredAt.toISOString()}::timestamptz,
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        from identity.auth_session_families family
        where family.family_id = ${command.payload.familyId}::uuid
          and trusted.trusted_session_id = family.trusted_session_id
      `.execute(transaction);

      const projection: AuthSessionProjection = { userId: token.user_id,
        familyId: command.payload.familyId, accessTokenId: ids.accessTokenId,
        refreshTokenId: ids.refreshTokenId, generation,
        accessExpiresAt: accessExpiresAt.toISOString(), refreshExpiresAt: refreshExpiresAt.toISOString() };
      return {
        responseStatus: 200, response: projection,
        event: { eventId: ids.eventId, eventName: 'AuthSessionRotated', schemaVersion: 1,
          transitionId: null, payload: { familyId: projection.familyId,
            userId: projection.userId, generation, accessExpiresAt: projection.accessExpiresAt,
            refreshExpiresAt: projection.refreshExpiresAt },
          metadata: { policyVersion: AUTH_SESSION_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'AUTH_SESSION_ROTATED', transitionId: null,
          reasonCode: null, beforeState: 'ACTIVE', afterState: 'ACTIVE',
          metadata: { generation } },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'auth.session.rotated',
          payload: { familyId: projection.familyId, userId: projection.userId, generation } }],
      };
    }, ...(now ? { now } : {}),
  });
}

export async function revokeAuthSession(
  database: Kysely<Database>,
  command: CommandEnvelope<RevokeAuthSessionPayload>,
  ids: AuthCommandEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<{ readonly familyId: string; readonly state: 'REVOKED' }>> {
  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const familyResult = await sql<{ readonly state: AuthSessionFamilyState }>`
        select state from identity.auth_session_families
        where family_id = ${command.payload.familyId}::uuid for update
      `.execute(transaction);
      const family = familyResult.rows[0];
      if (!family || family.state !== 'ACTIVE') {
        throw new AuthSessionConflictError('AUTH_SESSION_INVALID_STATE');
      }
      await sql`
        update identity.auth_session_families
        set state = 'REVOKED', revoked_at = ${context.occurredAt.toISOString()}::timestamptz,
            revoke_reason = ${command.payload.reason}, version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where family_id = ${command.payload.familyId}::uuid
      `.execute(transaction);
      await sql`
        update identity.auth_refresh_tokens
        set state = 'REVOKED'
        where family_id = ${command.payload.familyId}::uuid and state = 'ACTIVE'
      `.execute(transaction);
      await sql`
        update identity.auth_access_tokens
        set state = 'REVOKED', revoked_at = ${context.occurredAt.toISOString()}::timestamptz
        where family_id = ${command.payload.familyId}::uuid and state = 'ACTIVE'
      `.execute(transaction);
      await sql`
        update identity.trusted_sessions trusted
        set state = 'REVOKED', revoked_at = ${context.occurredAt.toISOString()}::timestamptz,
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        from identity.auth_session_families family
        where family.family_id = ${command.payload.familyId}::uuid
          and trusted.trusted_session_id = family.trusted_session_id
          and trusted.state = 'TRUSTED'
      `.execute(transaction);
      const response = { familyId: command.payload.familyId, state: 'REVOKED' as const };
      return {
        responseStatus: 200, response,
        event: { eventId: ids.eventId, eventName: 'AuthSessionRevoked', schemaVersion: 1,
          transitionId: null, payload: { ...response, reason: command.payload.reason },
          metadata: { policyVersion: AUTH_SESSION_POLICY_VERSION } },
        audit: { auditId: ids.auditId, action: 'AUTH_SESSION_REVOKED', transitionId: null,
          reasonCode: command.payload.reason, beforeState: 'ACTIVE', afterState: 'REVOKED',
          metadata: {} },
        outbox: [{ messageId: ids.outboxMessageId, topic: 'auth.session.revoked',
          payload: { ...response, reason: command.payload.reason } }],
      };
    }, ...(now ? { now } : {}),
  });
}

export async function authenticateAccessToken(
  database: Kysely<Database>, tokenHash: string, now: Date = new Date(),
): Promise<AuthenticatedSessionProjection | null> {
  assertSha256(tokenHash, 'tokenHash');
  const result = await sql<{
    readonly user_id: string; readonly family_id: string; readonly family_version: string;
    readonly trusted_session_id: string;
    readonly trusted_at: Date; readonly hold_starts_at: Date | null;
  }>`
    select family.user_id, family.family_id, family.version::text as family_version,
           family.trusted_session_id,
           trusted.trusted_at, hold.starts_at as hold_starts_at
    from identity.auth_access_tokens token
    join identity.auth_session_families family on family.family_id = token.family_id
    join identity.trusted_sessions trusted
      on trusted.trusted_session_id = family.trusted_session_id
    join identity.users users on users.user_id = family.user_id
    left join identity.user_sensitive_action_holds hold
      on hold.user_id = family.user_id and hold.state = 'ACTIVE'
      and hold.starts_at <= ${now.toISOString()}::timestamptz
      and hold.ends_at > ${now.toISOString()}::timestamptz
    where token.token_hash = ${tokenHash}
      and token.state = 'ACTIVE' and token.expires_at > ${now.toISOString()}::timestamptz
      and family.state = 'ACTIVE' and trusted.state = 'TRUSTED'
      and users.account_state <> 'CLOSED'
  `.execute(database);
  const row = result.rows[0];
  if (!row) return null;
  return { userId: row.user_id, familyId: row.family_id,
    familyVersion: Number(row.family_version),
    trustedSessionId: row.trusted_session_id,
    accessMode: deriveAuthAccessMode({ sensitiveHoldActive: row.hold_starts_at !== null,
      trustedAt: row.trusted_at, holdStartedAt: row.hold_starts_at }) };
}
