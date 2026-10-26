import { createHash, createHmac } from 'node:crypto';

import {
  YOUTH_CONSENT_POLICY_VERSION,
  SCHEDULING_POLICY_VERSION,
  YouthConsentConflictError,
  assertYouthConsentCanBeRequested,
  assertYouthConsentDecisionCanBeRecorded,
  assertYouthOfficialConsentReady,
  normalizeGuardianContact,
  normalizeGuardianIdentity,
  type CommandEnvelope,
  type YouthConsentChannel,
  type YouthConsentDecision,
  type YouthConsentState,
} from '@molokh/core';
import { sql, type Kysely, type Transaction } from 'kysely';

import type { Database } from './index.js';
import { executeCriticalCommand, type ExecutedCommand } from './platform-command.js';
import { openBookedOfficialTrainingRetention } from './training-retention.js';

export interface RequestYouthConsentPayload {
  readonly challengeId: string;
  readonly channel: YouthConsentChannel;
  readonly guardianContact: string;
  readonly smsOptIn?: boolean;
}

export interface DecideYouthConsentPayload {
  readonly consentId: string;
  readonly tokenHash: string;
  readonly decision: YouthConsentDecision;
  readonly guardianDisplayName?: string;
  readonly relationship?: string;
  readonly consentTextAccepted?: boolean;
}

export interface YouthConsentEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly notificationOutboxMessageId: string;
  readonly notificationId: string;
  readonly challengeEventId?: string;
  readonly challengeOutboxMessageId?: string;
  readonly trainingRetentionId?: string;
  readonly trainingRetentionEventId?: string;
  readonly trainingRetentionBookingEventId?: string;
  readonly trainingRetentionOutboxMessageId?: string;
  readonly trainingRetentionTimerOutboxMessageId?: string;
  readonly trainingRetentionNotificationOutboxMessageId?: string;
  readonly trainingRetentionNotificationIds?: readonly [string, string, string];
}

export interface YouthConsentProjection {
  readonly consentId: string;
  readonly challengeId: string;
  readonly athleteUserId: string;
  readonly policyVersion: typeof YOUTH_CONSENT_POLICY_VERSION;
  readonly state: YouthConsentState;
  readonly channel: YouthConsentChannel;
  readonly maskedContact: string;
  readonly expiresAt: string;
  readonly decidedAt: string | null;
  readonly revokedAt: string | null;
  readonly version: number;
}

export interface YouthConsentSummaryItem {
  readonly athleteUserId: string;
  readonly state: YouthConsentState | 'NOT_REQUESTED';
  readonly maskedContact: string | null;
  readonly expiresAt: string | null;
  readonly version: number | null;
}

export interface YouthConsentSummaryProjection {
  readonly challengeId: string;
  readonly featureEnabled: boolean;
  readonly viewerAgeDivision: 'YOUTH' | 'ADULT';
  readonly requiredCount: number;
  readonly grantedCount: number;
  readonly ready: boolean;
  readonly consents: readonly YouthConsentSummaryItem[];
  readonly policyVersion: typeof YOUTH_CONSENT_POLICY_VERSION;
}

export interface PublicYouthConsentProjection extends YouthConsentProjection {
  readonly athleteDisplayName: string;
  readonly challengeState: string;
  readonly canGrant: boolean;
  readonly canDecline: boolean;
  readonly canRevoke: boolean;
}

interface ConsentRow {
  readonly consent_id: string;
  readonly challenge_id: string;
  readonly athlete_user_id: string;
  readonly policy_version: typeof YOUTH_CONSENT_POLICY_VERSION;
  readonly state: YouthConsentState;
  readonly channel: YouthConsentChannel;
  readonly masked_contact: string;
  readonly token_hash: string;
  readonly expires_at: Date;
  readonly decided_at: Date | null;
  readonly revoked_at: Date | null;
  readonly version: string;
  readonly athlete_display_name: string;
  readonly challenge_state: string;
  readonly challenge_version: string;
}

interface ConsentRequestContextRow {
  readonly challenge_id: string;
  readonly challenge_state: string;
  readonly response_deadline_at: Date;
  readonly athlete_user_id: string;
  readonly athlete_age_division: 'YOUTH' | 'ADULT';
  readonly feature_enabled: boolean;
}

interface ReadinessRow {
  readonly feature_enabled: boolean;
  readonly youth_participant_count: string;
  readonly granted_consent_count: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function keyedSha256(key: string, value: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

function projection(row: ConsentRow): YouthConsentProjection {
  return {
    consentId: row.consent_id,
    challengeId: row.challenge_id,
    athleteUserId: row.athlete_user_id,
    policyVersion: row.policy_version,
    state: row.state,
    channel: row.channel,
    maskedContact: row.masked_contact,
    expiresAt: row.expires_at.toISOString(),
    decidedAt: row.decided_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
    version: Number(row.version),
  };
}

async function consentRowById(
  database: Kysely<Database> | Transaction<Database>,
  consentId: string,
  lock = false,
): Promise<ConsentRow | null> {
  const result = await sql<ConsentRow>`
    select consent.consent_id, consent.challenge_id, consent.athlete_user_id,
      consent.policy_version, consent.state, consent.channel, consent.masked_contact,
      consent.token_hash, consent.expires_at, consent.decided_at, consent.revoked_at,
      consent.version::text as version, athlete.display_name as athlete_display_name,
      challenge.state as challenge_state, challenge.version::text as challenge_version
    from governance.youth_challenge_consents as consent
    join identity.users as athlete on athlete.user_id = consent.athlete_user_id
    join competition.challenges as challenge on challenge.challenge_id = consent.challenge_id
    where consent.consent_id = ${consentId}::uuid
    ${lock ? sql`for update of consent, challenge` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function consentRowByTokenHash(
  database: Kysely<Database> | Transaction<Database>,
  tokenHash: string,
  lock = false,
): Promise<ConsentRow | null> {
  const result = await sql<ConsentRow>`
    select consent.consent_id, consent.challenge_id, consent.athlete_user_id,
      consent.policy_version, consent.state, consent.channel, consent.masked_contact,
      consent.token_hash, consent.expires_at, consent.decided_at, consent.revoked_at,
      consent.version::text as version, athlete.display_name as athlete_display_name,
      challenge.state as challenge_state, challenge.version::text as challenge_version
    from governance.youth_challenge_consents as consent
    join identity.users as athlete on athlete.user_id = consent.athlete_user_id
    join competition.challenges as challenge on challenge.challenge_id = consent.challenge_id
    where consent.token_hash = ${tokenHash}
    ${lock ? sql`for update of consent, challenge` : sql``}
  `.execute(database);
  return result.rows[0] ?? null;
}

async function readinessForUsers(
  database: Kysely<Database> | Transaction<Database>,
  participantUserIds: readonly [string, string],
  challengeId: string | null,
  occurredAt: Date,
): Promise<ReadinessRow> {
  const result = await sql<ReadinessRow>`
    select
      coalesce((select enabled from platform.feature_flags where feature_key = 'YOUTH_OFFICIAL'), false)
        as feature_enabled,
      (select count(*)::text from identity.users
        where user_id in (${participantUserIds[0]}::uuid, ${participantUserIds[1]}::uuid)
          and age_division = 'YOUTH') as youth_participant_count,
      ((${challengeId}::uuid is not null)::integer * (
        select count(*)::integer from governance.youth_challenge_consents as consent
        where consent.challenge_id = ${challengeId}::uuid
          and consent.athlete_user_id in (${participantUserIds[0]}::uuid, ${participantUserIds[1]}::uuid)
          and consent.policy_version = ${YOUTH_CONSENT_POLICY_VERSION}
          and consent.state = 'GRANTED'
          and consent.expires_at > ${occurredAt.toISOString()}::timestamptz
      ))::text as granted_consent_count
  `.execute(database);
  return result.rows[0] ?? {
    feature_enabled: false,
    youth_participant_count: '0',
    granted_consent_count: '0',
  };
}

export async function assertYouthOfficialAvailableForUsers(
  database: Kysely<Database> | Transaction<Database>,
  participantUserIds: readonly [string, string],
): Promise<void> {
  const readiness = await readinessForUsers(database, participantUserIds, null, new Date(0));
  assertYouthOfficialConsentReady({
    featureEnabled: readiness.feature_enabled,
    youthParticipantCount: Number(readiness.youth_participant_count),
    grantedConsentCount: Number(readiness.youth_participant_count),
  });
}

export async function assertYouthOfficialAvailableForUser(
  database: Kysely<Database> | Transaction<Database>,
  userId: string,
): Promise<void> {
  const result = await sql<{
    readonly age_division: 'YOUTH' | 'ADULT';
    readonly feature_enabled: boolean;
  }>`
    select athlete.age_division,
      coalesce((select enabled from platform.feature_flags where feature_key = 'YOUTH_OFFICIAL'), false)
        as feature_enabled
    from identity.users as athlete where athlete.user_id = ${userId}::uuid
  `.execute(database);
  const row = result.rows[0];
  if (row?.age_division === 'YOUTH' && !row.feature_enabled) {
    throw new YouthConsentConflictError('YOUTH_OFFICIAL_DISABLED');
  }
}

export async function assertYouthChallengeConsentReady(
  database: Kysely<Database> | Transaction<Database>,
  challengeId: string,
  participantUserIds: readonly [string, string],
  occurredAt: Date,
): Promise<void> {
  const readiness = await readinessForUsers(database, participantUserIds, challengeId, occurredAt);
  assertYouthOfficialConsentReady({
    featureEnabled: readiness.feature_enabled,
    youthParticipantCount: Number(readiness.youth_participant_count),
    grantedConsentCount: Number(readiness.granted_consent_count),
  });
}

export async function readYouthConsentSummary(
  database: Kysely<Database>,
  challengeId: string,
  viewerUserId: string,
  occurredAt: Date = new Date(),
): Promise<YouthConsentSummaryProjection> {
  const challengeResult = await sql<{
    readonly pair_low_id: string;
    readonly pair_high_id: string;
    readonly viewer_age_division: 'YOUTH' | 'ADULT';
  }>`
    select challenge.pair_low_id, challenge.pair_high_id,
      viewer.age_division as viewer_age_division
    from competition.challenges as challenge
    join identity.users as viewer on viewer.user_id = ${viewerUserId}::uuid
    where challenge.challenge_id = ${challengeId}::uuid
      and ${viewerUserId}::uuid in (challenge.pair_low_id, challenge.pair_high_id)
  `.execute(database);
  const challenge = challengeResult.rows[0];
  if (!challenge) throw new YouthConsentConflictError('YOUTH_CONSENT_SUBJECT_REQUIRED');
  const participants = [challenge.pair_low_id, challenge.pair_high_id] as const;
  const readiness = await readinessForUsers(database, participants, challengeId, occurredAt);
  const rows = await sql<{
    readonly athlete_user_id: string;
    readonly age_division: 'YOUTH' | 'ADULT';
    readonly state: YouthConsentState | null;
    readonly masked_contact: string | null;
    readonly expires_at: Date | null;
    readonly version: string | null;
  }>`
    select athlete.user_id as athlete_user_id, athlete.age_division,
      consent.state, consent.masked_contact, consent.expires_at,
      consent.version::text as version
    from identity.users as athlete
    left join governance.youth_challenge_consents as consent
      on consent.challenge_id = ${challengeId}::uuid
      and consent.athlete_user_id = athlete.user_id
      and consent.policy_version = ${YOUTH_CONSENT_POLICY_VERSION}
    where athlete.user_id in (${participants[0]}::uuid, ${participants[1]}::uuid)
      and athlete.age_division = 'YOUTH'
    order by athlete.user_id
  `.execute(database);
  const requiredCount = Number(readiness.youth_participant_count);
  const grantedCount = Number(readiness.granted_consent_count);
  return {
    challengeId,
    featureEnabled: readiness.feature_enabled,
    viewerAgeDivision: challenge.viewer_age_division,
    requiredCount,
    grantedCount,
    ready: requiredCount === grantedCount && (requiredCount === 0 || readiness.feature_enabled),
    consents: rows.rows.map((row) => ({
      athleteUserId: row.athlete_user_id,
      state: row.state ?? 'NOT_REQUESTED',
      maskedContact: row.athlete_user_id === viewerUserId ? row.masked_contact : null,
      expiresAt: row.expires_at?.toISOString() ?? null,
      version: row.version === null ? null : Number(row.version),
    })),
    policyVersion: YOUTH_CONSENT_POLICY_VERSION,
  };
}

export async function requestYouthConsent(
  database: Kysely<Database>,
  command: CommandEnvelope<RequestYouthConsentPayload>,
  ids: YouthConsentEffectIds,
  deliveryToken: string,
  now?: () => Date,
): Promise<ExecutedCommand<YouthConsentProjection>> {
  if (command.actor.type !== 'USER' || !command.actor.id
    || command.aggregateType !== 'YouthChallengeConsent') {
    throw new YouthConsentConflictError('YOUTH_CONSENT_SUBJECT_REQUIRED');
  }
  const contact = normalizeGuardianContact({
    channel: command.payload.channel,
    contact: command.payload.guardianContact,
    ...(command.payload.smsOptIn === undefined ? {} : { smsOptIn: command.payload.smsOptIn }),
  });
  if (deliveryToken.length < 32) throw new YouthConsentConflictError('YOUTH_CONSENT_TOKEN_INVALID');
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const requestContextResult = await sql<ConsentRequestContextRow>`
        select challenge.challenge_id, challenge.state as challenge_state,
          challenge.response_deadline_at, athlete.user_id as athlete_user_id,
          athlete.age_division as athlete_age_division,
          coalesce((select enabled from platform.feature_flags where feature_key = 'YOUTH_OFFICIAL'), false)
            as feature_enabled
        from competition.challenges as challenge
        join identity.users as athlete on athlete.user_id = ${command.actor.id}::uuid
        where challenge.challenge_id = ${command.payload.challengeId}::uuid
          and ${command.actor.id}::uuid in (challenge.pair_low_id, challenge.pair_high_id)
        for update of challenge
      `.execute(transaction);
      const requestContext = requestContextResult.rows[0];
      if (!requestContext) throw new YouthConsentConflictError('YOUTH_CONSENT_SUBJECT_REQUIRED');
      assertYouthConsentCanBeRequested({
        featureEnabled: requestContext.feature_enabled,
        challengeState: requestContext.challenge_state,
        actorIsParticipant: requestContext.athlete_user_id === command.actor.id,
        actorAgeDivision: requestContext.athlete_age_division,
        expiresAt: requestContext.response_deadline_at,
        occurredAt: context.occurredAt,
      });
      await sql`
        insert into governance.youth_challenge_consents (
          consent_id, challenge_id, athlete_user_id, policy_version,
          state, channel, contact_hash, masked_contact, token_hash,
          request_event_id, requested_at, expires_at, version, created_at, updated_at
        ) values (
          ${command.aggregateId}::uuid, ${command.payload.challengeId}::uuid,
          ${command.actor.id}::uuid, ${YOUTH_CONSENT_POLICY_VERSION},
          'PENDING', ${command.payload.channel}, ${keyedSha256(deliveryToken, contact.normalized)}, ${contact.masked},
          ${sha256(deliveryToken)}, ${ids.eventId}::uuid,
          ${context.occurredAt.toISOString()}::timestamptz,
          ${requestContext.response_deadline_at.toISOString()}::timestamptz,
          ${context.nextVersion}, ${context.occurredAt.toISOString()}::timestamptz,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      const created = await consentRowById(transaction, command.aggregateId);
      if (!created) throw new YouthConsentConflictError('YOUTH_CONSENT_NOT_FOUND');
      const response = projection(created);
      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'YouthChallengeConsentRequested',
          schemaVersion: 1,
          transitionId: 'YC-01',
          payload: {
            consentId: response.consentId,
            challengeId: response.challengeId,
            athleteUserId: response.athleteUserId,
            channel: response.channel,
            expiresAt: response.expiresAt,
          },
          metadata: { policyVersion: YOUTH_CONSENT_POLICY_VERSION },
        },
        audit: {
          auditId: ids.auditId,
          action: 'REQUEST_YOUTH_CHALLENGE_CONSENT',
          transitionId: 'YC-01',
          reasonCode: null,
          beforeState: null,
          afterState: 'PENDING',
          metadata: { challengeId: response.challengeId, channel: response.channel },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: command.payload.channel === 'EMAIL'
              ? 'notification.guardian-email.v1'
              : 'notification.guardian-sms.v1',
            payload: {
              consentId: response.consentId,
              challengeId: response.challengeId,
              channel: response.channel,
              destination: contact.normalized,
              actionPath: `/guardian-consent?token=${deliveryToken}`,
              expiresAt: response.expiresAt,
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: { notifications: [{
              notificationId: ids.notificationId,
              recipientUserId: response.athleteUserId,
              category: 'MANDATORY',
              renderKey: 'youth-consent.requested',
              actionTarget: { type: 'CHALLENGE', challengeId: response.challengeId },
              payload: { maskedContact: response.maskedContact, expiresAt: response.expiresAt },
              deadlineAt: response.expiresAt,
            }] },
          },
        ],
      };
    },
  });
}

export async function readPublicYouthConsent(
  database: Kysely<Database>,
  token: string,
  now: Date = new Date(),
): Promise<PublicYouthConsentProjection> {
  const row = await consentRowByTokenHash(database, sha256(token));
  if (!row) throw new YouthConsentConflictError('YOUTH_CONSENT_TOKEN_INVALID');
  const active = now < row.expires_at;
  return {
    ...projection(row),
    athleteDisplayName: row.athlete_display_name,
    challengeState: row.challenge_state,
    canGrant: active && row.state === 'PENDING' && row.challenge_state === 'AWAITING_RESPONSE',
    canDecline: active && row.state === 'PENDING' && row.challenge_state === 'AWAITING_RESPONSE',
    canRevoke: active && row.state === 'GRANTED'
      && ['AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKED'].includes(row.challenge_state),
  };
}

export async function decideYouthConsent(
  database: Kysely<Database>,
  command: CommandEnvelope<DecideYouthConsentPayload>,
  ids: YouthConsentEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<PublicYouthConsentProjection>> {
  if (command.actor.type !== 'EXTERNAL' || command.actor.id !== command.aggregateId
    || command.aggregateType !== 'YouthChallengeConsent'
    || command.payload.consentId !== command.aggregateId) {
    throw new YouthConsentConflictError('YOUTH_CONSENT_TOKEN_INVALID');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const row = await consentRowById(transaction, command.aggregateId, true);
      if (!row || row.token_hash !== command.payload.tokenHash) {
        throw new YouthConsentConflictError('YOUTH_CONSENT_TOKEN_INVALID');
      }
      const actorScope = new Set(command.actor.scopeIds);
      if (actorScope.size !== 2 || !actorScope.has(row.challenge_id)
        || !actorScope.has(row.athlete_user_id)) {
        throw new YouthConsentConflictError('YOUTH_CONSENT_TOKEN_INVALID');
      }
      assertYouthConsentDecisionCanBeRecorded({
        state: row.state,
        decision: command.payload.decision,
        expiresAt: row.expires_at,
        occurredAt: context.occurredAt,
        ...(command.payload.consentTextAccepted === undefined
          ? {}
          : { consentTextAccepted: command.payload.consentTextAccepted }),
      });
      if (command.payload.decision !== 'REVOKE' && row.challenge_state !== 'AWAITING_RESPONSE') {
        throw new YouthConsentConflictError('YOUTH_CONSENT_INVALID_STATE');
      }
      if (command.payload.decision === 'REVOKE'
        && !['AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKED'].includes(row.challenge_state)) {
        throw new YouthConsentConflictError('YOUTH_CONSENT_INVALID_STATE');
      }

      const identity = command.payload.decision === 'GRANT'
        ? normalizeGuardianIdentity({
            guardianDisplayName: command.payload.guardianDisplayName ?? '',
            relationship: command.payload.relationship ?? '',
          })
        : null;
      const nextState: YouthConsentState = command.payload.decision === 'GRANT'
        ? 'GRANTED'
        : command.payload.decision === 'DECLINE'
          ? 'DECLINED'
          : 'REVOKED';
      const auditHash = identity
        ? sha256(JSON.stringify({
            consentId: row.consent_id,
            guardianDisplayName: identity.guardianDisplayName,
            relationship: identity.relationship,
            policyVersion: YOUTH_CONSENT_POLICY_VERSION,
            acceptedAt: context.occurredAt.toISOString(),
          }))
        : null;
      const closesChallenge = command.payload.decision === 'DECLINE'
        || command.payload.decision === 'REVOKE';
      const challengeClosureReason = command.payload.decision === 'DECLINE'
        ? 'YOUTH_CONSENT_DECLINED'
        : 'YOUTH_CONSENT_REVOKED';
      const retainsBookedSession = command.payload.decision === 'REVOKE'
        && row.challenge_state === 'BOOKED';

      if (command.payload.decision === 'REVOKE') {
        await sql`
          update governance.youth_challenge_consents
          set state = 'REVOKED', revocation_event_id = ${ids.eventId}::uuid,
            revoked_at = ${context.occurredAt.toISOString()}::timestamptz,
            version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where consent_id = ${row.consent_id}::uuid and state = 'GRANTED'
        `.execute(transaction);
      } else {
        await sql`
          update governance.youth_challenge_consents
          set state = ${nextState},
            guardian_display_name = ${identity?.guardianDisplayName ?? null},
            relationship = ${identity?.relationship ?? null},
            consent_audit_hash = ${auditHash}, decision_event_id = ${ids.eventId}::uuid,
            decided_at = ${context.occurredAt.toISOString()}::timestamptz,
            version = ${context.nextVersion}, updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where consent_id = ${row.consent_id}::uuid and state = 'PENDING'
        `.execute(transaction);
      }
      if (closesChallenge) {
        if (!ids.challengeEventId || !ids.challengeOutboxMessageId) {
          throw new TypeError('Youth consent Challenge closure effect IDs are required');
        }
        await sql`
          update competition.challenges
          set state = 'CANCELLED_NO_FAULT', decided_at = ${context.occurredAt.toISOString()}::timestamptz,
            version = version + 1, updated_at = ${context.occurredAt.toISOString()}::timestamptz
          where challenge_id = ${row.challenge_id}::uuid
            and state in ('AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKED')
        `.execute(transaction);
        await sql`
          update competition.challenge_participant_obligations
          set released_at = ${context.occurredAt.toISOString()}::timestamptz,
            release_reason = ${challengeClosureReason}
          where challenge_id = ${row.challenge_id}::uuid and released_at is null
        `.execute(transaction);
      }
      const trainingRetention = retainsBookedSession
        ? await openBookedOfficialTrainingRetention(transaction, {
            challengeId: row.challenge_id,
            cause: 'YOUTH_CONSENT_REVOKED',
            occurredAt: context.occurredAt,
            ids: { retentionId: requiredYouthEffectId(ids, 'trainingRetentionId') },
          })
        : null;
      const updated = await consentRowById(transaction, row.consent_id);
      if (!updated) throw new YouthConsentConflictError('YOUTH_CONSENT_NOT_FOUND');
      const base = projection(updated);
      const response: PublicYouthConsentProjection = {
        ...base,
        athleteDisplayName: updated.athlete_display_name,
        challengeState: updated.challenge_state,
        canGrant: false,
        canDecline: false,
        canRevoke: updated.state === 'GRANTED'
          && ['AWAITING_RESPONSE', 'ACCEPTED_UNSCHEDULED', 'BOOKED'].includes(updated.challenge_state),
      };
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: command.payload.decision === 'GRANT'
            ? 'YouthChallengeConsentGranted'
            : command.payload.decision === 'DECLINE'
              ? 'YouthChallengeConsentDeclined'
              : 'YouthChallengeConsentRevoked',
          schemaVersion: 1,
          transitionId: command.payload.decision === 'GRANT'
            ? 'YC-02'
            : command.payload.decision === 'DECLINE'
              ? 'YC-03'
              : 'YC-04',
          payload: {
            consentId: response.consentId,
            challengeId: response.challengeId,
            athleteUserId: response.athleteUserId,
            state: response.state,
          },
          metadata: { policyVersion: YOUTH_CONSENT_POLICY_VERSION },
        },
        ...(closesChallenge
          ? {
              relatedEvents: [{
                eventId: ids.challengeEventId!,
                eventName: 'ChallengeCancelledNoFault',
                schemaVersion: 1,
                aggregateType: 'Challenge',
                aggregateId: row.challenge_id,
                aggregateVersion: Number(row.challenge_version) + 1,
                transitionId: 'CH-26',
                payload: {
                  challengeId: row.challenge_id,
                  reason: challengeClosureReason,
                  consentId: row.consent_id,
                },
                metadata: { policyVersion: YOUTH_CONSENT_POLICY_VERSION },
              }, ...(trainingRetention ? [
                {
                  eventId: requiredYouthEffectId(ids, 'trainingRetentionEventId'),
                  eventName: 'BookingTrainingRetentionRequested',
                  schemaVersion: 1,
                  aggregateType: 'BookingTrainingRetention',
                  aggregateId: trainingRetention.retentionId,
                  aggregateVersion: 1,
                  transitionId: 'B-26',
                  payload: {
                    retentionId: trainingRetention.retentionId,
                    bookingId: trainingRetention.bookingId,
                    sessionId: trainingRetention.sessionId,
                    sourceChallengeId: trainingRetention.challengeId,
                    cause: 'YOUTH_CONSENT_REVOKED',
                    deadlineAt: trainingRetention.deadlineAt,
                  },
                  metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
                },
                {
                  eventId: requiredYouthEffectId(ids, 'trainingRetentionBookingEventId'),
                  eventName: 'BookingOfficialReleasePending',
                  schemaVersion: 1,
                  aggregateType: 'Booking',
                  aggregateId: trainingRetention.bookingId,
                  aggregateVersion: trainingRetention.bookingVersion,
                  transitionId: 'B-26',
                  payload: {
                    bookingId: trainingRetention.bookingId,
                    retentionId: trainingRetention.retentionId,
                    sourceChallengeId: trainingRetention.challengeId,
                  },
                  metadata: { policyVersion: SCHEDULING_POLICY_VERSION },
                },
              ] : [])],
            }
          : {}),
        audit: {
          auditId: ids.auditId,
          action: `${command.payload.decision}_YOUTH_CHALLENGE_CONSENT`,
          transitionId: command.payload.decision === 'GRANT'
            ? 'YC-02'
            : command.payload.decision === 'DECLINE'
              ? 'YC-03'
              : 'YC-04',
          reasonCode: null,
          beforeState: row.state,
          afterState: response.state,
          metadata: { challengeId: response.challengeId, athleteUserId: response.athleteUserId },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: `governance.youth-consent.${response.state.toLowerCase()}.v1`,
            payload: {
              consentId: response.consentId,
              challengeId: response.challengeId,
              athleteUserId: response.athleteUserId,
              state: response.state,
            },
          },
          {
            messageId: ids.notificationOutboxMessageId,
            topic: 'notification.in_app.v1',
            payload: { notifications: [{
              notificationId: ids.notificationId,
              recipientUserId: response.athleteUserId,
              category: 'MANDATORY',
              renderKey: `youth-consent.${response.state.toLowerCase()}`,
              actionTarget: { type: 'CHALLENGE', challengeId: response.challengeId },
              payload: { state: response.state },
              deadlineAt: null,
            }] },
          },
          ...(closesChallenge
            ? [{
                messageId: ids.challengeOutboxMessageId!,
                topic: 'competition.challenge.cancelled-no-fault.v1',
                sourceEventId: ids.challengeEventId!,
                payload: {
                  challengeId: row.challenge_id,
                  reason: challengeClosureReason,
                  consentId: row.consent_id,
                },
              }]
            : []),
          ...(trainingRetention
            ? [
                {
                  messageId: requiredYouthEffectId(ids, 'trainingRetentionOutboxMessageId'),
                  topic: 'scheduling.booking.training-retention-requested.v1',
                  sourceEventId: requiredYouthEffectId(ids, 'trainingRetentionEventId'),
                  payload: {
                    retentionId: trainingRetention.retentionId,
                    bookingId: trainingRetention.bookingId,
                    sessionId: trainingRetention.sessionId,
                    sourceChallengeId: trainingRetention.challengeId,
                    cause: 'YOUTH_CONSENT_REVOKED',
                    deadlineAt: trainingRetention.deadlineAt,
                  },
                },
                {
                  messageId: requiredYouthEffectId(ids, 'trainingRetentionTimerOutboxMessageId'),
                  topic: 'scheduling.booking.training-retention-timer.v1',
                  sourceEventId: requiredYouthEffectId(ids, 'trainingRetentionEventId'),
                  payload: {
                    retentionId: trainingRetention.retentionId,
                    timer: {
                      commandType: 'EXPIRE_BOOKING_TRAINING_RETENTION',
                      aggregateType: 'BookingTrainingRetention',
                      aggregateId: trainingRetention.retentionId,
                      expectedState: 'PENDING',
                      expectedVersion: 1,
                      deadlineAt: trainingRetention.deadlineAt,
                      policyVersion: SCHEDULING_POLICY_VERSION,
                      idempotencyKey: `booking-training-retention:${trainingRetention.retentionId}:expire:v1`,
                    },
                  },
                },
                {
                  messageId: requiredYouthEffectId(ids, 'trainingRetentionNotificationOutboxMessageId'),
                  topic: 'notification.in_app.v1',
                  sourceEventId: requiredYouthEffectId(ids, 'trainingRetentionEventId'),
                  payload: {
                    notifications: [...trainingRetention.athleteUserIds, trainingRetention.coachUserId]
                      .map((recipientUserId, index) => ({
                        notificationId: requiredYouthNotificationId(ids, index),
                        recipientUserId,
                        category: 'MANDATORY',
                        renderKey: 'booking.training-retention-required',
                        actionTarget: { type: 'SESSION', sessionId: trainingRetention.sessionId },
                        payload: { retentionId: trainingRetention.retentionId,
                          cause: 'YOUTH_CONSENT_REVOKED' },
                        deadlineAt: trainingRetention.deadlineAt,
                      })),
                  },
                },
              ]
            : []),
        ],
      };
    },
  });
}

function requiredYouthEffectId(ids: YouthConsentEffectIds, key: keyof YouthConsentEffectIds): string {
  const value = ids[key];
  if (typeof value !== 'string') throw new TypeError(`Youth consent effect ID ${key} is required`);
  return value;
}

function requiredYouthNotificationId(ids: YouthConsentEffectIds, index: number): string {
  const value = ids.trainingRetentionNotificationIds?.[index];
  if (!value) throw new TypeError(`Youth consent retention notification ID ${index} is required`);
  return value;
}

export function youthConsentTokenHash(token: string): string {
  if (token.length < 32) throw new YouthConsentConflictError('YOUTH_CONSENT_TOKEN_INVALID');
  return sha256(token);
}
