import {
  IdentityPermissionDeniedError,
  IdentityValidationError,
  adultTransitionAt,
  approveVerificationState,
  activateIdentity,
  normalizeChecklistVersion,
  normalizeDisplayName,
  normalizeSportPreferences,
  projectIdentityCapabilities,
  startVerificationState,
  type ActivateIdentityInput,
  type IdentityProjection,
  type CommandEnvelope,
} from '@molokh/core';
import { type Kysely, type Transaction, sql } from 'kysely';

import type { Database } from './index.js';
import {
  executeCriticalCommand,
  type ExecutedCommand,
} from './platform-command.js';
import { replayCompetitionProjection } from './status-replay.js';

export interface IdentityEffectIds {
  readonly eventId: string;
  readonly auditId: string;
  readonly outboxMessageId: string;
  readonly ageTransitionTimerOutboxMessageId?: string;
}

interface IdentityRow {
  readonly user_id: string;
  readonly display_name: string;
  readonly age_division: 'YOUTH' | 'ADULT';
  readonly account_state: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
  readonly phone_verified: boolean;
  readonly verification_state:
    | 'NOT_STARTED'
    | 'PENDING'
    | 'VERIFIED'
    | 'REJECTED'
    | 'EXPIRED'
    | 'REVOKED';
  readonly primary_sport: string;
  readonly secondary_sport: string | null;
  readonly discovery_radius_km: number;
  readonly version: string;
}

export interface ChangeDisplayNamePayload {
  readonly displayName: string;
}

export interface ChangeSportsPayload {
  readonly primarySport: string;
  readonly secondarySport: string | null;
}

export interface ChangeHomeVenuePayload {
  readonly venueId: string;
}

export interface HomeVenueOptionProjection {
  readonly venueId: string;
  readonly displayName: string;
  readonly address: string;
  readonly cityCode: string;
}

export interface HomeVenueSettingsProjection {
  readonly homeVenueId: string | null;
  readonly userVersion: number;
  readonly options: readonly HomeVenueOptionProjection[];
}

export interface HomeVenueSelectionProjection {
  readonly homeVenueId: string;
  readonly venueDisplayName: string;
  readonly version: number;
}

export type PublicProfileStatus = 'CHAMPION' | 'CONTENDER';
export type PublicProfileResultOutcome = 'WIN' | 'LOSS' | 'DRAW' | 'NO_CONTEST';
export type PublicProfileReviewState = 'PENDING' | 'REVIEWED' | null;

export interface PublicProfileCurrentStatus {
  readonly competitionId: string;
  readonly communityId: string;
  readonly status: PublicProfileStatus;
  readonly provisional: boolean;
  readonly reviewState: PublicProfileReviewState;
}

export interface PublicProfileStatusHistoryEntry extends PublicProfileCurrentStatus {
  readonly tenureId: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
}

export interface PublicProfileResultEntry {
  readonly resultId: string;
  readonly competitionId: string;
  readonly outcome: PublicProfileResultOutcome;
  readonly publicMethod: 'FORFEIT' | 'NO_SHOW' | null;
  readonly reviewState: PublicProfileReviewState;
  readonly occurredAt: string;
}

export interface PublicAthleteProfileProjection {
  readonly userId: string;
  readonly displayName: string;
  readonly ageDivision: IdentityProjection['ageDivision'];
  readonly primarySport: string;
  readonly secondarySport: string | null;
  readonly currentStatuses: readonly PublicProfileCurrentStatus[];
  readonly statusHistory: readonly PublicProfileStatusHistoryEntry[];
  readonly officialRecord: {
    readonly wins: number;
    readonly losses: number;
    readonly draws: number;
  };
  readonly recentOfficialResults: readonly PublicProfileResultEntry[];
  readonly completedTrainingCount: number;
}

interface PublicProfileIdentityRow {
  readonly user_id: string;
  readonly display_name: string;
  readonly age_division: IdentityProjection['ageDivision'];
  readonly account_state: IdentityProjection['accountState'];
  readonly primary_sport: string;
  readonly secondary_sport: string | null;
}

interface PublicProfileAccessRow {
  readonly viewer_active: boolean;
  readonly blocked: boolean;
  readonly allowed_context: boolean;
}

interface PublicProfileCompetitionRow {
  readonly competition_id: string;
  readonly community_id: string;
}

interface PublicProfileResultRow {
  readonly result_id: string;
  readonly competition_id: string;
  readonly state: string;
  readonly effective_outcome_code:
    | 'WIN_A' | 'WIN_B' | 'DRAW' | 'NO_CONTEST' | 'FORFEIT' | 'NO_SHOW';
  readonly effective_winner_user_id: string | null;
  readonly effective_loser_user_id: string | null;
  readonly actual_time: Date;
}

export interface StartVerificationPayload {
  readonly userId: string;
  readonly moderationChecklistVersion: string;
}

export interface ApproveVerificationPayload {
  readonly userId: string;
  readonly moderationChecklistVersion: string;
}

export class IdentityNotFoundError extends Error {
  readonly code = 'IDENTITY_NOT_FOUND';

  constructor() {
    super('Identity was not found');
    this.name = 'IdentityNotFoundError';
  }
}

function projectRow(row: IdentityRow): IdentityProjection {
  return projectIdentityCapabilities({
    userId: row.user_id,
    displayName: row.display_name,
    ageDivision: row.age_division,
    accountState: row.account_state,
    phoneVerified: row.phone_verified,
    accountVerificationState: row.verification_state,
    primarySport: row.primary_sport,
    secondarySport: row.secondary_sport,
    discoveryRadiusKm: row.discovery_radius_km,
    version: Number(row.version),
  });
}

async function selectIdentity(
  database: Kysely<Database> | Transaction<Database>,
  userId: string,
): Promise<IdentityRow | null> {
  const result = await sql<IdentityRow>`
    select
      users.user_id,
      users.display_name,
      users.age_division,
      users.account_state,
      (users.phone_verified_at is not null) as phone_verified,
      coalesce(verification.state, 'NOT_STARTED') as verification_state,
      profile.primary_sport,
      profile.secondary_sport,
      profile.discovery_radius_km,
      users.version::text as version
    from identity.users as users
    join identity.athlete_profiles as profile on profile.user_id = users.user_id
    left join identity.account_verifications as verification
      on verification.user_id = users.user_id and verification.is_current
    where users.user_id = ${userId}::uuid
  `.execute(database);
  return result.rows[0] ?? null;
}

function withVerificationState(
  identity: IdentityProjection,
  accountVerificationState: IdentityProjection['accountVerificationState'],
): IdentityProjection {
  return projectIdentityCapabilities({
    userId: identity.userId,
    displayName: identity.displayName,
    ageDivision: identity.ageDivision,
    accountState: identity.accountState,
    phoneVerified: identity.phoneVerified,
    accountVerificationState,
    primarySport: identity.primarySport,
    secondarySport: identity.secondarySport,
    discoveryRadiusKm: identity.discoveryRadiusKm,
    version: identity.version,
  });
}

export async function readIdentityProjection(
  database: Kysely<Database>,
  userId: string,
): Promise<IdentityProjection | null> {
  const row = await selectIdentity(database, userId);
  return row ? projectRow(row) : null;
}

export async function readPublicAthleteProfile(
  database: Kysely<Database>,
  viewerUserId: string,
  subjectUserId: string,
): Promise<PublicAthleteProfileProjection | null> {
  const identityResult = await sql<PublicProfileIdentityRow>`
    select users.user_id, users.display_name, users.age_division, users.account_state,
      profile.primary_sport, profile.secondary_sport
    from identity.users as users
    join identity.athlete_profiles as profile on profile.user_id = users.user_id
    where users.user_id = ${subjectUserId}::uuid
  `.execute(database);
  const identity = identityResult.rows[0];
  if (!identity || identity.account_state === 'CLOSED') return null;

  const accessResult = await sql<PublicProfileAccessRow>`
    select
      exists (
        select 1 from identity.users as viewer
        where viewer.user_id = ${viewerUserId}::uuid and viewer.account_state = 'ACTIVE'
      ) as viewer_active,
      exists (
        select 1 from social.blocks as block
        where block.state = 'ACTIVE'
          and (
            (block.blocker_user_id = ${viewerUserId}::uuid
              and block.blocked_user_id = ${subjectUserId}::uuid)
            or (block.blocker_user_id = ${subjectUserId}::uuid
              and block.blocked_user_id = ${viewerUserId}::uuid)
          )
      ) as blocked,
      (
        ${viewerUserId}::uuid = ${subjectUserId}::uuid
        or exists (
          select 1 from social.matches as match
          where match.state in ('ACTIVE', 'ARCHIVED')
            and match.pair_low_id = least(${viewerUserId}::uuid, ${subjectUserId}::uuid)
            and match.pair_high_id = greatest(${viewerUserId}::uuid, ${subjectUserId}::uuid)
        )
        or exists (
          select 1
          from community.community_memberships as viewer_membership
          join community.community_memberships as subject_membership
            on subject_membership.community_id = viewer_membership.community_id
          where viewer_membership.user_id = ${viewerUserId}::uuid
            and viewer_membership.state = 'ACTIVE'
            and subject_membership.user_id = ${subjectUserId}::uuid
            and subject_membership.state = 'ACTIVE'
        )
        or exists (
          select 1
          from community.role_grants as role_grant
          where role_grant.user_id = ${viewerUserId}::uuid
            and role_grant.state = 'ACTIVE'
            and (role_grant.expires_at is null or role_grant.expires_at > clock_timestamp())
            and (
              (role_grant.role = 'CENTRAL_ADMIN'
                and role_grant.scope_type = 'GLOBAL' and role_grant.scope_id is null)
              or (role_grant.role = 'COACH' and role_grant.scope_type = 'COMMUNITY'
                and exists (
                  select 1 from community.community_memberships as membership
                  where membership.user_id = ${subjectUserId}::uuid
                    and membership.community_id = role_grant.scope_id
                    and membership.state = 'ACTIVE'
                ))
              or (role_grant.role in ('GYM_ADMIN', 'PRIMARY_ADMIN')
                and role_grant.scope_type = 'VENUE'
                and exists (
                  select 1
                  from community.community_memberships as membership
                  join community.communities as community
                    on community.community_id = membership.community_id
                  where membership.user_id = ${subjectUserId}::uuid
                    and membership.state = 'ACTIVE'
                    and community.venue_id = role_grant.scope_id
                ))
            )
        )
      ) as allowed_context
  `.execute(database);
  const access = accessResult.rows[0];
  if (!access?.viewer_active || access.blocked || !access.allowed_context) {
    throw new IdentityPermissionDeniedError();
  }

  const competitionResult = await sql<PublicProfileCompetitionRow>`
    select competition.competition_id, competition.community_id
    from competition.competitions as competition
    where ${subjectUserId}::uuid in (
        competition.champion_user_id, competition.contender_user_id
      )
      or exists (
        select 1 from platform.domain_events as event
        where event.aggregate_type = 'Competition'
          and event.aggregate_id = competition.competition_id
          and ${subjectUserId} in (
            event.payload->>'championUserId', event.payload->>'contenderUserId',
            event.payload->>'afterChampionUserId', event.payload->>'afterContenderUserId',
            event.payload->'after'->>'championUserId',
            event.payload->'after'->>'contenderUserId',
            event.payload->'to'->>'championUserId', event.payload->'to'->>'contenderUserId',
            case when event.payload ? 'assignedStatus' then event.payload->>'userId' else null end
          )
      )
    order by competition.competition_id
  `.execute(database);
  const statusHistory: PublicProfileStatusHistoryEntry[] = [];
  for (const competition of competitionResult.rows) {
    const projection = await replayCompetitionProjection(database, competition.competition_id);
    for (const tenure of projection.tenures) {
      if (tenure.userId !== subjectUserId) continue;
      statusHistory.push({
        tenureId: tenure.tenureId,
        competitionId: competition.competition_id,
        communityId: competition.community_id,
        status: tenure.status,
        startedAt: tenure.startedAt,
        endedAt: tenure.endedAt,
        provisional: tenure.provisional,
        reviewState: tenure.provisional && tenure.endedAt === null
          ? 'PENDING'
          : tenure.provisional || tenure.compensatesTenureId !== null
            ? 'REVIEWED'
            : null,
      });
    }
  }
  statusHistory.sort((left, right) =>
    right.startedAt.localeCompare(left.startedAt)
      || left.competitionId.localeCompare(right.competitionId)
      || left.tenureId.localeCompare(right.tenureId));
  const currentStatuses = statusHistory
    .filter((tenure) => tenure.endedAt === null)
    .map(({ competitionId, communityId, status, provisional }) => ({
      competitionId, communityId, status, provisional,
      reviewState: provisional ? 'PENDING' as const : null,
    }));

  const effectiveResults = await sql<PublicProfileResultRow>`
    select result.result_id, competition.competition_id, result.state,
      coalesce(
        integrity_decision.effective_outcome_code,
        appeal_decision.effective_outcome_code,
        correction_decision.effective_outcome_code,
        result.recorded_outcome_code
      ) as effective_outcome_code,
      case
        when integrity_decision.effective_disposition in ('ANNUL', 'REPEAT')
          or appeal_decision.decision in ('ANNUL', 'REPEAT') then null
        else coalesce(
          integrity_decision.effective_winner_user_id,
          appeal_decision.effective_winner_user_id,
          case when correction_decision.decision_id is not null
            then correction_decision.effective_winner_user_id
            else result.winner_user_id end
        )
      end as effective_winner_user_id,
      case
        when integrity_decision.effective_disposition in ('ANNUL', 'REPEAT')
          or appeal_decision.decision in ('ANNUL', 'REPEAT') then null
        else coalesce(
          integrity_decision.effective_loser_user_id,
          appeal_decision.effective_loser_user_id,
          case when correction_decision.decision_id is not null
            then correction_decision.effective_loser_user_id
            else result.loser_user_id end
        )
      end as effective_loser_user_id,
      result.actual_time
    from competition.results as result
    join competition.challenges as challenge on challenge.challenge_id = result.challenge_id
    join competition.competitions as competition
      on competition.competition_id = challenge.competition_id
    left join competition.appeal_decisions as appeal_decision
      on appeal_decision.result_id = result.result_id
    left join competition.technical_correction_decisions as correction_decision
      on correction_decision.result_id = result.result_id
    left join lateral (
      select integrity_case.case_id
      from competition.integrity_cases as integrity_case
      where integrity_case.result_id = result.result_id
      order by integrity_case.opened_at desc, integrity_case.case_id desc
      limit 1
    ) as integrity_case on true
    left join competition.integrity_decisions as integrity_decision
      on integrity_decision.case_id = integrity_case.case_id
    where ${subjectUserId}::uuid in (challenge.pair_low_id, challenge.pair_high_id)
      and result.state not in ('ANNULLED', 'REPEAT_ORDERED')
      and coalesce(integrity_decision.effective_disposition, '') not in ('ANNUL', 'REPEAT')
      and coalesce(appeal_decision.decision, '') not in ('ANNUL', 'REPEAT')
    order by result.actual_time desc, result.result_id desc
  `.execute(database);
  const publicResults: PublicProfileResultEntry[] = effectiveResults.rows.map((result) => {
    const outcome: PublicProfileResultOutcome = result.effective_outcome_code === 'DRAW'
      ? 'DRAW'
      : result.effective_outcome_code === 'NO_CONTEST'
        ? 'NO_CONTEST'
        : result.effective_winner_user_id === subjectUserId
          ? 'WIN'
          : 'LOSS';
    return {
      resultId: result.result_id,
      competitionId: result.competition_id,
      outcome,
      publicMethod: result.effective_outcome_code === 'FORFEIT'
        ? 'FORFEIT'
        : result.effective_outcome_code === 'NO_SHOW'
          ? 'NO_SHOW'
          : null,
      reviewState: result.state === 'RECORDED' || result.state === 'UNDER_APPEAL'
        ? 'PENDING'
        : result.state === 'REVERSED'
          ? 'REVIEWED'
          : null,
      occurredAt: result.actual_time.toISOString(),
    };
  });
  const officialRecord = publicResults.reduce((record, result) => ({
    wins: record.wins + (result.outcome === 'WIN' ? 1 : 0),
    losses: record.losses + (result.outcome === 'LOSS' ? 1 : 0),
    draws: record.draws + (result.outcome === 'DRAW' ? 1 : 0),
  }), { wins: 0, losses: 0, draws: 0 });

  const trainingResult = await sql<{ readonly completed_training_count: string }>`
    select count(*)::text as completed_training_count
    from scheduling.attendance as attendance
    join scheduling.sessions as session on session.session_id = attendance.session_id
    where attendance.athlete_user_id = ${subjectUserId}::uuid
      and attendance.status in ('PRESENT', 'LATE')
      and session.purpose = 'TRAINING'
      and session.state = 'ENDED'
  `.execute(database);

  return {
    userId: identity.user_id,
    displayName: identity.display_name,
    ageDivision: identity.age_division,
    primarySport: identity.primary_sport,
    secondarySport: identity.secondary_sport,
    currentStatuses,
    statusHistory,
    officialRecord,
    recentOfficialResults: publicResults.slice(0, 5),
    completedTrainingCount: Number(trainingResult.rows[0]?.completed_training_count ?? '0'),
  };
}

export async function activateUser(
  database: Kysely<Database>,
  command: CommandEnvelope<ActivateIdentityInput>,
  ids: IdentityEffectIds,
  now?: () => Date,
): Promise<ExecutedCommand<IdentityProjection>> {
  if (command.payload.userId !== command.aggregateId) {
    throw new IdentityValidationError('userId');
  }
  return executeCriticalCommand(database, {
    command,
    ...(now ? { now } : {}),
    mutate: async (transaction, context) => {
      const identity = activateIdentity(command.payload, context.occurredAt);
      if (identity.ageDivision === 'YOUTH' && !ids.ageTransitionTimerOutboxMessageId) {
        throw new TypeError('Youth activation age-transition timer effect ID is required');
      }
      await sql`
        insert into identity.users (
          user_id, phone_e164, phone_verified_at, birth_date, age_division,
          display_name, account_state, locale, version, activated_at
        ) values (
          ${command.payload.userId}::uuid,
          ${identity.phoneE164},
          ${identity.phoneVerifiedAt}::timestamptz,
          ${identity.birthDate}::date,
          ${identity.ageDivision},
          ${identity.displayName},
          'ACTIVE',
          ${identity.locale},
          ${context.nextVersion},
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);
      await sql`
        insert into identity.athlete_profiles (
          user_id, primary_sport, secondary_sport, discovery_radius_km
        ) values (
          ${command.payload.userId}::uuid,
          ${identity.primarySport},
          ${identity.secondarySport},
          ${identity.discoveryRadiusKm}
        )
      `.execute(transaction);

      const response = projectIdentityCapabilities({
        userId: command.payload.userId,
        displayName: identity.displayName,
        ageDivision: identity.ageDivision,
        accountState: 'ACTIVE',
        phoneVerified: true,
        accountVerificationState: 'NOT_STARTED',
        primarySport: identity.primarySport,
        secondarySport: identity.secondarySport,
        discoveryRadiusKm: identity.discoveryRadiusKm,
        version: context.nextVersion,
      });

      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'UserAccountActivated',
          schemaVersion: 1,
          transitionId: 'U-01',
          payload: {
            userId: command.payload.userId,
            ageDivision: identity.ageDivision,
          },
          metadata: { policyVersion: 'identity-v1' },
        },
        audit: {
          auditId: ids.auditId,
          action: 'ACTIVATE_ACCOUNT',
          transitionId: 'U-01',
          reasonCode: null,
          beforeState: null,
          afterState: 'ACTIVE',
          metadata: { ageDivision: identity.ageDivision },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'identity.user.activated.v1',
            payload: {
              userId: command.payload.userId,
              version: context.nextVersion,
            },
          },
          ...(identity.ageDivision === 'YOUTH'
            ? [{
                messageId: ids.ageTransitionTimerOutboxMessageId!,
                topic: 'identity.age-division-timer.v1',
                payload: {
                  userId: command.payload.userId,
                  timer: {
                    commandType: 'TRANSITION_TO_ADULT',
                    aggregateType: 'AgeDivisionTransition',
                    aggregateId: command.payload.userId,
                    expectedState: 'YOUTH',
                    expectedVersion: 0,
                    deadlineAt: adultTransitionAt(identity.birthDate).toISOString(),
                    policyVersion: 'identity-v1',
                    idempotencyKey: `age-division:${command.payload.userId}:adult:v1`,
                  },
                },
              }]
            : []),
        ],
      };
    },
  });
}

export async function changeDisplayName(
  database: Kysely<Database>,
  command: CommandEnvelope<ChangeDisplayNamePayload>,
  ids: IdentityEffectIds,
): Promise<ExecutedCommand<IdentityProjection>> {
  if (command.actor.id !== command.aggregateId) {
    throw new IdentityNotFoundError();
  }
  const displayName = normalizeDisplayName(command.payload.displayName);

  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const currentResult = await sql<IdentityRow>`
        select
          users.user_id,
          users.display_name,
          users.age_division,
          users.account_state,
          (users.phone_verified_at is not null) as phone_verified,
          coalesce(verification.state, 'NOT_STARTED') as verification_state,
          profile.primary_sport,
          profile.secondary_sport,
          profile.discovery_radius_km,
          users.version::text as version
        from identity.users as users
        join identity.athlete_profiles as profile on profile.user_id = users.user_id
        left join identity.account_verifications as verification
          on verification.user_id = users.user_id and verification.is_current
        where users.user_id = ${command.aggregateId}::uuid
        for update of users
      `.execute(transaction);
      const current = currentResult.rows[0];
      if (!current) throw new IdentityNotFoundError();
      if (current.account_state !== 'ACTIVE') {
        throw new IdentityValidationError('accountState');
      }
      if (current.display_name === displayName) {
        throw new IdentityValidationError('displayName');
      }

      await sql`
        update identity.users
        set display_name = ${displayName},
            version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where user_id = ${command.aggregateId}::uuid
      `.execute(transaction);
      await sql`
        insert into identity.display_name_audit (
          audit_id, user_id, changed_by, previous_display_name,
          new_display_name, request_id, occurred_at
        ) values (
          ${ids.auditId}::uuid,
          ${command.aggregateId}::uuid,
          ${command.actor.id}::uuid,
          ${current.display_name},
          ${displayName},
          ${command.requestId}::uuid,
          ${context.occurredAt.toISOString()}::timestamptz
        )
      `.execute(transaction);

      const response = projectIdentityCapabilities({
        userId: current.user_id,
        displayName,
        ageDivision: current.age_division,
        accountState: current.account_state,
        phoneVerified: current.phone_verified,
        accountVerificationState: current.verification_state,
        primarySport: current.primary_sport,
        secondarySport: current.secondary_sport,
        discoveryRadiusKm: current.discovery_radius_km,
        version: context.nextVersion,
      });

      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'DisplayNameChanged',
          schemaVersion: 1,
          transitionId: null,
          payload: { userId: current.user_id, displayName },
          metadata: { policyVersion: 'identity-v1' },
        },
        audit: {
          auditId: ids.auditId,
          action: 'CHANGE_DISPLAY_NAME',
          transitionId: null,
          reasonCode: null,
          beforeState: current.account_state,
          afterState: current.account_state,
          metadata: { displayNameChanged: true },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'identity.display_name.changed.v1',
            payload: { userId: current.user_id, version: context.nextVersion },
          },
        ],
      };
    },
  });
}

export async function changeSports(
  database: Kysely<Database>,
  command: CommandEnvelope<ChangeSportsPayload>,
  ids: IdentityEffectIds,
): Promise<ExecutedCommand<IdentityProjection>> {
  if (command.actor.id !== command.aggregateId) {
    throw new IdentityNotFoundError();
  }
  const sports = normalizeSportPreferences(command.payload);

  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const currentResult = await sql<IdentityRow>`
        select
          users.user_id,
          users.display_name,
          users.age_division,
          users.account_state,
          (users.phone_verified_at is not null) as phone_verified,
          coalesce(verification.state, 'NOT_STARTED') as verification_state,
          profile.primary_sport,
          profile.secondary_sport,
          profile.discovery_radius_km,
          users.version::text as version
        from identity.users as users
        join identity.athlete_profiles as profile on profile.user_id = users.user_id
        left join identity.account_verifications as verification
          on verification.user_id = users.user_id and verification.is_current
        where users.user_id = ${command.aggregateId}::uuid
        for update of users, profile
      `.execute(transaction);
      const current = currentResult.rows[0];
      if (!current) throw new IdentityNotFoundError();
      if (current.account_state !== 'ACTIVE') {
        throw new IdentityValidationError('accountState');
      }
      if (
        current.primary_sport === sports.primarySport &&
        current.secondary_sport === sports.secondarySport
      ) {
        throw new IdentityValidationError('sports');
      }

      await sql`
        update identity.athlete_profiles
        set primary_sport = ${sports.primarySport},
            secondary_sport = ${sports.secondarySport},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where user_id = ${command.aggregateId}::uuid
      `.execute(transaction);
      await sql`
        update identity.users
        set version = ${context.nextVersion},
            updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where user_id = ${command.aggregateId}::uuid
      `.execute(transaction);

      const response = projectIdentityCapabilities({
        userId: current.user_id,
        displayName: current.display_name,
        ageDivision: current.age_division,
        accountState: current.account_state,
        phoneVerified: current.phone_verified,
        accountVerificationState: current.verification_state,
        primarySport: sports.primarySport,
        secondarySport: sports.secondarySport,
        discoveryRadiusKm: current.discovery_radius_km,
        version: context.nextVersion,
      });

      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'SportPreferencesChanged',
          schemaVersion: 1,
          transitionId: null,
          payload: { userId: current.user_id, ...sports },
          metadata: { policyVersion: 'identity-v1' },
        },
        audit: {
          auditId: ids.auditId,
          action: 'CHANGE_SPORTS',
          transitionId: null,
          reasonCode: null,
          beforeState: current.account_state,
          afterState: current.account_state,
          metadata: {
            previousPrimarySport: current.primary_sport,
            previousSecondarySport: current.secondary_sport,
            ...sports,
          },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'identity.sports.changed.v1',
            payload: { userId: current.user_id, version: context.nextVersion, ...sports },
          },
        ],
      };
    },
  });
}

export async function readHomeVenueSettings(
  database: Kysely<Database>,
  userId: string,
): Promise<HomeVenueSettingsProjection | null> {
  const current = await sql<{
    readonly home_venue_id: string | null;
    readonly version: string;
  }>`
    select profile.home_venue_id, users.version::text as version
    from identity.users as users
    join identity.athlete_profiles as profile on profile.user_id = users.user_id
    where users.user_id = ${userId}::uuid
  `.execute(database);
  const row = current.rows[0];
  if (!row) return null;
  const venues = await sql<{
    readonly venue_id: string;
    readonly display_name: string;
    readonly address: string;
    readonly city_code: string;
  }>`
    select venue_id, display_name, address, city_code
    from community.venues
    where state = 'ACTIVE'
    order by city_code, display_name, venue_id
  `.execute(database);
  return {
    homeVenueId: row.home_venue_id,
    userVersion: Number(row.version),
    options: venues.rows.map((venue) => ({
      venueId: venue.venue_id,
      displayName: venue.display_name,
      address: venue.address,
      cityCode: venue.city_code,
    })),
  };
}

export async function changeHomeVenue(
  database: Kysely<Database>,
  command: CommandEnvelope<ChangeHomeVenuePayload>,
  ids: IdentityEffectIds,
): Promise<ExecutedCommand<HomeVenueSelectionProjection>> {
  if (command.actor.id !== command.aggregateId) throw new IdentityNotFoundError();
  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const currentResult = await sql<{
        readonly user_id: string;
        readonly account_state: IdentityRow['account_state'];
        readonly home_venue_id: string | null;
      }>`
        select users.user_id, users.account_state, profile.home_venue_id
        from identity.users as users
        join identity.athlete_profiles as profile on profile.user_id = users.user_id
        where users.user_id = ${command.aggregateId}::uuid
        for update of users, profile
      `.execute(transaction);
      const current = currentResult.rows[0];
      if (!current) throw new IdentityNotFoundError();
      if (current.account_state !== 'ACTIVE') {
        throw new IdentityValidationError('accountState');
      }
      if (current.home_venue_id === command.payload.venueId) {
        throw new IdentityValidationError('homeVenueId');
      }
      const venueResult = await sql<{
        readonly venue_id: string;
        readonly display_name: string;
      }>`
        select venue_id, display_name
        from community.venues
        where venue_id = ${command.payload.venueId}::uuid and state = 'ACTIVE'
        for share
      `.execute(transaction);
      const venue = venueResult.rows[0];
      if (!venue) throw new IdentityValidationError('homeVenueId');

      await sql`
        update identity.athlete_profiles
        set home_venue_id = ${venue.venue_id}::uuid,
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where user_id = ${current.user_id}::uuid
      `.execute(transaction);
      await sql`
        update identity.users
        set version = ${context.nextVersion},
          updated_at = ${context.occurredAt.toISOString()}::timestamptz
        where user_id = ${current.user_id}::uuid
      `.execute(transaction);
      const response: HomeVenueSelectionProjection = {
        homeVenueId: venue.venue_id,
        venueDisplayName: venue.display_name,
        version: context.nextVersion,
      };
      return {
        responseStatus: 200,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'HomeVenueChanged',
          schemaVersion: 1,
          transitionId: null,
          payload: { userId: current.user_id, homeVenueId: venue.venue_id },
          metadata: { policyVersion: 'identity-v1' },
        },
        audit: {
          auditId: ids.auditId,
          action: 'CHANGE_HOME_VENUE',
          transitionId: null,
          reasonCode: null,
          beforeState: current.account_state,
          afterState: current.account_state,
          metadata: {
            previousHomeVenueId: current.home_venue_id,
            homeVenueId: venue.venue_id,
            competitionStateChanged: false,
          },
        },
        outbox: [{
          messageId: ids.outboxMessageId,
          topic: 'identity.home_venue.changed.v1',
          payload: {
            userId: current.user_id,
            homeVenueId: venue.venue_id,
            version: context.nextVersion,
          },
        }],
      };
    },
  });
}

export async function startAccountVerification(
  database: Kysely<Database>,
  command: CommandEnvelope<StartVerificationPayload>,
  ids: IdentityEffectIds,
): Promise<ExecutedCommand<IdentityProjection>> {
  if (command.actor.id !== command.payload.userId) throw new IdentityNotFoundError();
  const checklistVersion = normalizeChecklistVersion(
    command.payload.moderationChecklistVersion,
  );

  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      await sql`
        select user_id
        from identity.users
        where user_id = ${command.payload.userId}::uuid
        for update
      `.execute(transaction);
      const identityRow = await selectIdentity(transaction, command.payload.userId);
      if (!identityRow) throw new IdentityNotFoundError();
      const identity = projectRow(identityRow);
      const currentResult = await sql<{ readonly state: IdentityProjection['accountVerificationState'] }>`
        select state
        from identity.account_verifications
        where user_id = ${command.payload.userId}::uuid and is_current
        for update
      `.execute(transaction);
      const currentState = currentResult.rows[0]?.state ?? 'NOT_STARTED';
      const nextState = startVerificationState({
        currentState,
        accountState: identity.accountState,
        phoneVerified: identity.phoneVerified,
      });

      await sql`
        insert into identity.account_verifications (
          verification_id, user_id, state, method,
          moderation_checklist_version, is_current, expires_at, version
        ) values (
          ${command.aggregateId}::uuid, ${command.payload.userId}::uuid,
          ${nextState}, 'CENTRAL_MODERATION', ${checklistVersion}, true, null,
          ${context.nextVersion}
        )
      `.execute(transaction);
      const response = withVerificationState(identity, nextState);

      return {
        responseStatus: 201,
        response,
        event: {
          eventId: ids.eventId,
          eventName: 'VerificationStarted',
          schemaVersion: 1,
          transitionId: 'V-01',
          payload: {
            verificationId: command.aggregateId,
            userId: command.payload.userId,
            method: 'CENTRAL_MODERATION',
            moderationChecklistVersion: checklistVersion,
          },
          metadata: { policyVersion: 'identity-v1' },
        },
        audit: {
          auditId: ids.auditId,
          action: 'START_VERIFICATION',
          transitionId: 'V-01',
          reasonCode: null,
          beforeState: 'NOT_STARTED',
          afterState: nextState,
          metadata: { moderationChecklistVersion: checklistVersion },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'identity.verification.started.v1',
            payload: {
              verificationId: command.aggregateId,
              userId: command.payload.userId,
              version: context.nextVersion,
            },
          },
        ],
      };
    },
  });
}

export async function approveAccountVerification(
  database: Kysely<Database>,
  command: CommandEnvelope<ApproveVerificationPayload>,
  ids: IdentityEffectIds,
): Promise<ExecutedCommand<IdentityProjection>> {
  if (!command.actor.id) throw new IdentityPermissionDeniedError();
  const checklistVersion = normalizeChecklistVersion(
    command.payload.moderationChecklistVersion,
  );

  return executeCriticalCommand(database, {
    command,
    mutate: async (transaction, context) => {
      const centralGrant = await sql<{ readonly allowed: boolean }>`
        select true as allowed
        from community.role_grants
        where user_id = ${command.actor.id}::uuid
          and role = 'CENTRAL_ADMIN'
          and scope_type = 'GLOBAL'
          and scope_id is null
          and state = 'ACTIVE'
        limit 1
      `.execute(transaction);
      if (!centralGrant.rows[0]?.allowed) throw new IdentityPermissionDeniedError();

      const verificationResult = await sql<{
        readonly user_id: string;
        readonly state: IdentityProjection['accountVerificationState'];
        readonly moderation_checklist_version: string;
      }>`
        select user_id, state, moderation_checklist_version
        from identity.account_verifications
        where verification_id = ${command.aggregateId}::uuid and is_current
        for update
      `.execute(transaction);
      const verification = verificationResult.rows[0];
      if (!verification || verification.user_id !== command.payload.userId) {
        throw new IdentityNotFoundError();
      }
      if (verification.moderation_checklist_version !== checklistVersion) {
        throw new IdentityValidationError('moderationChecklistVersion');
      }
      const identityRow = await selectIdentity(transaction, command.payload.userId);
      if (!identityRow) throw new IdentityNotFoundError();
      const identity = projectRow(identityRow);
      const nextState = approveVerificationState({
        currentState: verification.state,
        accountState: identity.accountState,
        phoneVerified: identity.phoneVerified,
        moderationChecksPassed: true,
      });
      await sql`
        update identity.account_verifications
        set state = ${nextState},
            verified_at = ${context.occurredAt.toISOString()}::timestamptz,
            decided_by = ${command.actor.id}::uuid,
            decision_reason = 'PROFILE_PHONE_DUPLICATE_CHECKS_PASSED',
            version = ${context.nextVersion}
        where verification_id = ${command.aggregateId}::uuid
      `.execute(transaction);
      return {
        responseStatus: 200,
        response: withVerificationState(identity, nextState),
        event: {
          eventId: ids.eventId,
          eventName: 'AccountVerified',
          schemaVersion: 1,
          transitionId: 'V-02',
          payload: {
            verificationId: command.aggregateId,
            userId: command.payload.userId,
            method: 'CENTRAL_MODERATION',
            moderationChecklistVersion: checklistVersion,
          },
          metadata: { policyVersion: 'identity-v1' },
        },
        audit: {
          auditId: ids.auditId,
          action: 'APPROVE_VERIFICATION',
          transitionId: 'V-02',
          reasonCode: 'PROFILE_PHONE_DUPLICATE_CHECKS_PASSED',
          beforeState: verification.state,
          afterState: nextState,
          metadata: { moderationChecklistVersion: checklistVersion },
        },
        outbox: [
          {
            messageId: ids.outboxMessageId,
            topic: 'identity.account.verified.v1',
            payload: {
              verificationId: command.aggregateId,
              userId: command.payload.userId,
              version: context.nextVersion,
            },
          },
        ],
      };
    },
  });
}

export interface PendingVerificationProjection {
  readonly verificationId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly ageDivision: IdentityProjection['ageDivision'];
  readonly moderationChecklistVersion: string;
  readonly createdAt: string;
  readonly version: number;
}

export async function listPendingVerifications(
  database: Kysely<Database>,
  centralUserId: string,
): Promise<readonly PendingVerificationProjection[]> {
  const centralGrant = await sql<{ readonly allowed: boolean }>`
    select true as allowed
    from community.role_grants
    where user_id = ${centralUserId}::uuid
      and role = 'CENTRAL_ADMIN'
      and scope_type = 'GLOBAL'
      and scope_id is null
      and state = 'ACTIVE'
    limit 1
  `.execute(database);
  if (!centralGrant.rows[0]?.allowed) throw new IdentityPermissionDeniedError();

  const result = await sql<{
    readonly verification_id: string;
    readonly user_id: string;
    readonly display_name: string;
    readonly age_division: IdentityProjection['ageDivision'];
    readonly moderation_checklist_version: string;
    readonly created_at: Date;
    readonly version: string;
  }>`
    select
      verification.verification_id,
      verification.user_id,
      users.display_name,
      users.age_division,
      verification.moderation_checklist_version,
      verification.created_at,
      verification.version::text as version
    from identity.account_verifications as verification
    join identity.users as users on users.user_id = verification.user_id
    where verification.state = 'PENDING' and verification.is_current
    order by verification.created_at, verification.verification_id
  `.execute(database);
  return result.rows.map((row) => ({
    verificationId: row.verification_id,
    userId: row.user_id,
    displayName: row.display_name,
    ageDivision: row.age_division,
    moderationChecklistVersion: row.moderation_checklist_version,
    createdAt: row.created_at.toISOString(),
    version: Number(row.version),
  }));
}
