import {
  projectCommunityAccess,
  type ActiveRoleGrant,
  type AgeDivision,
  type CommunityAccessProjection,
  type CommunityState,
  type MembershipState,
} from '@molokh/core';
import { type Kysely, sql } from 'kysely';

import type { Database } from './index.js';

export interface LocalPilotCommunityFixture {
  readonly venueId: string;
  readonly venueConfigurationId: string;
  readonly communityId: string;
  readonly communityConfigurationId: string;
  readonly membershipId: string;
  readonly centralGrantId: string;
  readonly athleteUserId: string;
  readonly centralActorId: string;
  readonly legalName: string;
  readonly venueDisplayName: string;
  readonly communityName: string;
  readonly address: string;
  readonly cityCode: string;
  readonly timezone: string;
  readonly contactPayload: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}

export interface CommunityContextProjection {
  readonly venue: {
    readonly venueId: string;
    readonly displayName: string;
    readonly address: string;
    readonly cityCode: string;
    readonly timezone: string;
    readonly minimumBookingNoticeHours: number;
    readonly slotPublishHorizonDays: number;
    readonly contactPayload: Readonly<Record<string, unknown>>;
  };
  readonly community: {
    readonly communityId: string;
    readonly name: string;
    readonly state: CommunityState;
    readonly configurationId: string;
    readonly configurationVersion: number;
    readonly configurationEffectiveAt: string;
    readonly pairCooldownDays: number;
    readonly noShowGraceMinutes: number;
    readonly rulesetRef: string;
    readonly rulesetAckMode: 'IMPLICIT_ON_ACCEPT' | 'EXPLICIT_ACK_REQUIRED';
    readonly version: number;
  };
  readonly membership: {
    readonly membershipId: string;
    readonly state: MembershipState;
    readonly ageDivision: AgeDivision;
    readonly competitionEnabled: boolean;
    readonly joinPath: 'QR' | 'INVITE' | 'SELF_REQUEST';
    readonly version: number;
  } | null;
  readonly membershipReapplyNotBeforeAt: string | null;
  readonly membershipLatestRejectionReasonCode:
    | 'CAPACITY_UNAVAILABLE'
    | 'COMMUNITY_REQUIREMENTS'
    | 'REQUEST_NOT_APPROVED'
    | null;
  readonly activeRoleGrants: readonly ActiveRoleGrant[];
  readonly access: CommunityAccessProjection;
}

interface CommunityContextRow {
  readonly user_id: string;
  readonly account_state: 'ACTIVE' | 'RESTRICTED' | 'CLOSED';
  readonly account_verification_state:
    | 'NOT_STARTED'
    | 'PENDING'
    | 'VERIFIED'
    | 'REJECTED'
    | 'EXPIRED'
    | 'REVOKED';
  readonly user_age_division: AgeDivision;
  readonly venue_id: string;
  readonly venue_display_name: string;
  readonly address: string;
  readonly city_code: string;
  readonly timezone: string;
  readonly minimum_booking_notice_hours: number;
  readonly slot_publish_horizon_days: number;
  readonly contact_payload: Readonly<Record<string, unknown>>;
  readonly community_id: string;
  readonly community_name: string;
  readonly community_state: CommunityState;
  readonly configuration_id: string;
  readonly configuration_version: number;
  readonly configuration_effective_at: Date;
  readonly pair_cooldown_days: number;
  readonly no_show_grace_minutes: number;
  readonly ruleset_ref: string;
  readonly ruleset_ack_mode: 'IMPLICIT_ON_ACCEPT' | 'EXPLICIT_ACK_REQUIRED';
  readonly community_version: string;
  readonly membership_id: string | null;
  readonly membership_state: MembershipState | null;
  readonly membership_age_division: AgeDivision | null;
  readonly competition_enabled: boolean | null;
  readonly join_path: 'QR' | 'INVITE' | 'SELF_REQUEST' | null;
  readonly membership_version: string | null;
  readonly membership_reapply_not_before_at: Date | null;
  readonly membership_latest_rejection_reason_code:
    | 'CAPACITY_UNAVAILABLE'
    | 'COMMUNITY_REQUIREMENTS'
    | 'REQUEST_NOT_APPROVED'
    | null;
  readonly has_other_active_competitive_membership: boolean;
  readonly multi_community_discipline_enabled: boolean;
}

interface RoleGrantRow {
  readonly role: ActiveRoleGrant['role'];
  readonly scope_type: ActiveRoleGrant['scopeType'];
  readonly scope_id: string | null;
}

export async function ensureLocalPilotCommunity(
  database: Kysely<Database>,
  fixture: LocalPilotCommunityFixture,
): Promise<void> {
  await database.transaction().execute(async (transaction) => {
    await sql`set constraints all deferred`.execute(transaction);
    await sql`
      insert into community.venues (
        venue_id, legal_name, display_name, address, city_code, timezone, state,
        minimum_booking_notice_hours, slot_publish_horizon_days, contact_payload,
        configuration_version_id, version
      ) values (
        ${fixture.venueId}::uuid, ${fixture.legalName}, ${fixture.venueDisplayName},
        ${fixture.address}, ${fixture.cityCode}, ${fixture.timezone}, 'ACTIVE',
        8, 30, ${JSON.stringify(fixture.contactPayload)}::jsonb,
        ${fixture.venueConfigurationId}::uuid, 1
      ) on conflict (venue_id) do nothing
    `.execute(transaction);
    await sql`
      insert into community.venue_configuration_versions (
        configuration_id, venue_id, configuration_version,
        minimum_booking_notice_hours, slot_publish_horizon_days, contact_payload,
        created_by, effective_at
      ) values (
        ${fixture.venueConfigurationId}::uuid, ${fixture.venueId}::uuid, 1,
        8, 30, ${JSON.stringify(fixture.contactPayload)}::jsonb,
        ${fixture.centralActorId}::uuid, ${fixture.occurredAt}::timestamptz
      ) on conflict (configuration_id) do nothing
    `.execute(transaction);
    await sql`
      insert into community.communities (
        community_id, venue_id, name, state, configuration_id,
        created_by_central_id, version
      ) values (
        ${fixture.communityId}::uuid, ${fixture.venueId}::uuid,
        ${fixture.communityName}, 'ACTIVE', ${fixture.communityConfigurationId}::uuid,
        ${fixture.centralActorId}::uuid, 1
      ) on conflict (community_id) do nothing
    `.execute(transaction);
    await sql`
      insert into community.community_configuration_versions (
        configuration_id, community_id, configuration_version,
        pair_cooldown_days, no_show_grace_minutes, ruleset_ref,
        ruleset_ack_mode, created_by, effective_at
      ) values (
        ${fixture.communityConfigurationId}::uuid, ${fixture.communityId}::uuid, 1,
        15, 15, 'MOLOKH_RECOMMENDED_V1', 'IMPLICIT_ON_ACCEPT',
        ${fixture.centralActorId}::uuid, ${fixture.occurredAt}::timestamptz
      ) on conflict (configuration_id) do nothing
    `.execute(transaction);
    await sql`
      insert into platform.domain_events (
        event_id, event_name, event_version, aggregate_type, aggregate_id,
        aggregate_version, transition_id, correlation_id, actor_id, actor_type,
        actor_roles, actor_scope_ids, occurred_at, idempotency_key_hash, payload, metadata
      ) values (
        md5('community-created:' || ${fixture.communityId})::uuid,
        'CommunityCreated', 1, 'Community', ${fixture.communityId}::uuid, 1, 'CO-01',
        md5('community-created-correlation:' || ${fixture.communityId})::uuid,
        ${fixture.centralActorId}::uuid, 'SYSTEM', '["CENTRAL_ADMIN"]'::jsonb,
        '{}'::uuid[], ${fixture.occurredAt}::timestamptz,
        md5('community-created:' || ${fixture.communityId}),
        ${JSON.stringify({ communityId: fixture.communityId, venueId: fixture.venueId,
          bootstrap: true })}::jsonb,
        ${JSON.stringify({ policyVersion: 'community-lifecycle-mvp-v1', bootstrap: true })}::jsonb
      ) on conflict do nothing
    `.execute(transaction);
    await sql`
      insert into community.community_memberships (
        membership_id, community_id, user_id, age_division, state,
        competition_enabled, join_path, decided_at, decided_by, version
      ) values (
        ${fixture.membershipId}::uuid, ${fixture.communityId}::uuid,
        ${fixture.athleteUserId}::uuid,
        (select age_division from identity.users where user_id = ${fixture.athleteUserId}::uuid),
        'ACTIVE', true, 'QR', ${fixture.occurredAt}::timestamptz,
        ${fixture.centralActorId}::uuid, 1
      ) on conflict (membership_id) do nothing
    `.execute(transaction);
    await sql`
      insert into community.role_grants (
        grant_id, user_id, role, scope_type, scope_id, state,
        authorized_by, authorized_at, version
      ) values (
        ${fixture.centralGrantId}::uuid, ${fixture.centralActorId}::uuid,
        'CENTRAL_ADMIN', 'GLOBAL', null, 'ACTIVE',
        ${fixture.centralActorId}::uuid, ${fixture.occurredAt}::timestamptz, 1
      ) on conflict (grant_id) do nothing
    `.execute(transaction);
  });
}

export async function readCommunityContext(
  database: Kysely<Database>,
  userId: string,
  communityId: string,
): Promise<CommunityContextProjection | null> {
  const result = await sql<CommunityContextRow>`
    select
      users.user_id,
      users.account_state,
      coalesce(verification.state, 'NOT_STARTED') as account_verification_state,
      users.age_division as user_age_division,
      venue.venue_id,
      venue.display_name as venue_display_name,
      venue.address,
      venue.city_code,
      venue.timezone,
      venue.minimum_booking_notice_hours,
      venue.slot_publish_horizon_days,
      venue.contact_payload,
      community.community_id,
      community.name as community_name,
      community.state as community_state,
      configuration.configuration_id,
      configuration.configuration_version,
      configuration.effective_at as configuration_effective_at,
      configuration.pair_cooldown_days,
      configuration.no_show_grace_minutes,
      configuration.ruleset_ref,
      configuration.ruleset_ack_mode,
      community.version::text as community_version,
      membership.membership_id,
      membership.state as membership_state,
      membership.age_division as membership_age_division,
      membership.competition_enabled,
      membership.join_path,
      membership.version::text as membership_version,
      (
        select rejected.reapply_not_before_at
        from community.community_memberships as rejected
        where rejected.community_id = community.community_id
          and rejected.user_id = users.user_id
          and rejected.state = 'REJECTED'
          and rejected.join_path = 'SELF_REQUEST'
        order by rejected.decided_at desc nulls last, rejected.created_at desc
        limit 1
      ) as membership_reapply_not_before_at,
      (
        select rejected.public_rejection_reason_code
        from community.community_memberships as rejected
        where rejected.community_id = community.community_id
          and rejected.user_id = users.user_id
          and rejected.state = 'REJECTED'
          and rejected.join_path = 'SELF_REQUEST'
        order by rejected.decided_at desc nulls last, rejected.created_at desc
        limit 1
      ) as membership_latest_rejection_reason_code,
      exists (
        select 1
        from community.community_memberships as other_membership
        where other_membership.user_id = users.user_id
          and other_membership.community_id <> community.community_id
          and other_membership.state = 'ACTIVE'
          and other_membership.competition_enabled
      ) as has_other_active_competitive_membership,
      coalesce((
        select flag.enabled from platform.feature_flags as flag
        where flag.feature_key = 'MULTI_COMMUNITY_DISCIPLINE'
      ), false) as multi_community_discipline_enabled
    from identity.users as users
    cross join community.communities as community
    join community.venues as venue on venue.venue_id = community.venue_id
    join community.community_configuration_versions as configuration
      on configuration.configuration_id = community.configuration_id
    left join identity.account_verifications as verification
      on verification.user_id = users.user_id and verification.is_current
    left join community.community_memberships as membership
      on membership.community_id = community.community_id
      and membership.user_id = users.user_id
      and membership.state in ('PENDING', 'ACTIVE', 'UNDER_REVIEW')
    where users.user_id = ${userId}::uuid
      and community.community_id = ${communityId}::uuid
  `.execute(database);
  const row = result.rows[0];
  if (!row) return null;

  const roleResult = await sql<RoleGrantRow>`
    select role, scope_type, scope_id
    from community.role_grants
    where user_id = ${userId}::uuid
      and state = 'ACTIVE'
      and (
        (scope_type = 'GLOBAL' and scope_id is null)
        or (scope_type = 'VENUE' and scope_id = ${row.venue_id}::uuid)
        or (scope_type = 'COMMUNITY' and scope_id = ${row.community_id}::uuid)
      )
  `.execute(database);
  const activeRoleGrants: ActiveRoleGrant[] = roleResult.rows.map((grant) => ({
    role: grant.role,
    scopeType: grant.scope_type,
    scopeId: grant.scope_id,
  }));
  const membership =
    row.membership_id && row.membership_state && row.membership_age_division && row.join_path
      && row.membership_version
      ? {
          membershipId: row.membership_id,
          state: row.membership_state,
          ageDivision: row.membership_age_division,
          competitionEnabled: row.competition_enabled === true,
          joinPath: row.join_path,
          version: Number(row.membership_version),
        }
      : null;
  const access = projectCommunityAccess({
    userId: row.user_id,
    accountState: row.account_state,
    accountVerificationState: row.account_verification_state,
    ageDivision: row.user_age_division,
    venueId: row.venue_id,
    communityId: row.community_id,
    communityState: row.community_state,
    membership,
    membershipReapplyBlocked:
      (row.membership_reapply_not_before_at?.getTime() ?? 0) > Date.now(),
    hasOtherActiveCompetitiveMembership: row.has_other_active_competitive_membership,
    multiCommunityDisciplineEnabled: row.multi_community_discipline_enabled,
    activeRoleGrants,
  });

  return {
    venue: {
      venueId: row.venue_id,
      displayName: row.venue_display_name,
      address: row.address,
      cityCode: row.city_code,
      timezone: row.timezone,
      minimumBookingNoticeHours: row.minimum_booking_notice_hours,
      slotPublishHorizonDays: row.slot_publish_horizon_days,
      contactPayload: row.contact_payload,
    },
    community: {
      communityId: row.community_id,
      name: row.community_name,
      state: row.community_state,
      configurationId: row.configuration_id,
      configurationVersion: row.configuration_version,
      configurationEffectiveAt: row.configuration_effective_at.toISOString(),
      pairCooldownDays: row.pair_cooldown_days,
      noShowGraceMinutes: row.no_show_grace_minutes,
      rulesetRef: row.ruleset_ref,
      rulesetAckMode: row.ruleset_ack_mode,
      version: Number(row.community_version),
    },
    membership,
    membershipReapplyNotBeforeAt: row.membership_reapply_not_before_at?.toISOString() ?? null,
    membershipLatestRejectionReasonCode: row.membership_latest_rejection_reason_code,
    activeRoleGrants,
    access,
  };
}
