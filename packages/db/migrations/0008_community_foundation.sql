create schema if not exists community;

create table community.venues (
  venue_id uuid primary key,
  legal_name text not null check (length(btrim(legal_name)) between 1 and 160),
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  address text not null check (length(btrim(address)) > 0),
  city_code text not null check (length(btrim(city_code)) > 0),
  latitude numeric(9,6),
  longitude numeric(9,6),
  timezone text not null check (length(btrim(timezone)) > 0),
  state text not null check (state in ('PENDING_VERIFICATION', 'ACTIVE', 'PAUSED', 'CLOSED')),
  minimum_booking_notice_hours integer not null check (minimum_booking_notice_hours between 8 and 48),
  slot_publish_horizon_days integer not null check (slot_publish_horizon_days between 1 and 30),
  contact_payload jsonb not null default '{}'::jsonb,
  configuration_version_id uuid not null,
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table community.venue_configuration_versions (
  configuration_id uuid primary key,
  venue_id uuid not null references community.venues(venue_id),
  configuration_version integer not null check (configuration_version > 0),
  minimum_booking_notice_hours integer not null check (minimum_booking_notice_hours between 8 and 48),
  slot_publish_horizon_days integer not null check (slot_publish_horizon_days between 1 and 30),
  contact_payload jsonb not null,
  created_by uuid not null,
  effective_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (venue_id, configuration_version)
);

alter table community.venues
  add constraint venues_active_configuration_fk
  foreign key (configuration_version_id)
  references community.venue_configuration_versions(configuration_id)
  deferrable initially deferred;

create table community.communities (
  community_id uuid primary key,
  venue_id uuid not null references community.venues(venue_id),
  name text not null check (length(btrim(name)) between 1 and 120),
  state text not null check (state in ('ACTIVE', 'PAUSED', 'CLOSING', 'CLOSED')),
  pause_started_at timestamptz,
  configuration_id uuid not null,
  created_by_central_id uuid not null,
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create unique index communities_one_current_per_venue_uq
  on community.communities (venue_id)
  where state in ('ACTIVE', 'PAUSED', 'CLOSING');

create table community.community_configuration_versions (
  configuration_id uuid primary key,
  community_id uuid not null references community.communities(community_id),
  configuration_version integer not null check (configuration_version > 0),
  pair_cooldown_days integer not null check (pair_cooldown_days between 7 and 30),
  no_show_grace_minutes integer not null check (no_show_grace_minutes between 5 and 30),
  ruleset_ref text not null check (length(btrim(ruleset_ref)) > 0),
  ruleset_ack_mode text not null check (
    ruleset_ack_mode in ('IMPLICIT_ON_ACCEPT', 'EXPLICIT_ACK_REQUIRED')
  ),
  central_approval_id uuid,
  created_by uuid not null,
  effective_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint community_explicit_ack_requires_central_check check (
    ruleset_ack_mode <> 'EXPLICIT_ACK_REQUIRED' or central_approval_id is not null
  ),
  unique (community_id, configuration_version)
);

alter table community.communities
  add constraint communities_active_configuration_fk
  foreign key (configuration_id)
  references community.community_configuration_versions(configuration_id)
  deferrable initially deferred;

create table community.community_memberships (
  membership_id uuid primary key,
  community_id uuid not null references community.communities(community_id),
  user_id uuid not null references identity.users(user_id),
  age_division text not null check (age_division in ('YOUTH', 'ADULT')),
  state text not null check (
    state in ('PENDING', 'ACTIVE', 'UNDER_REVIEW', 'REJECTED', 'LEFT', 'REMOVED', 'ARCHIVED')
  ),
  competition_enabled boolean not null default false,
  join_path text not null check (join_path in ('QR', 'INVITE', 'SELF_REQUEST')),
  requested_at timestamptz,
  decided_at timestamptz,
  decided_by uuid,
  reason_code text,
  public_rejection_reason_code text,
  internal_case_ref text,
  reapply_not_before_at timestamptz,
  left_at timestamptz,
  removed_at timestamptz,
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint memberships_competition_requires_active_check check (
    not competition_enabled or state = 'ACTIVE'
  )
);

create unique index memberships_one_current_relationship_uq
  on community.community_memberships (community_id, user_id)
  where state in ('PENDING', 'ACTIVE', 'UNDER_REVIEW');

create unique index memberships_one_active_competitive_per_user_uq
  on community.community_memberships (user_id)
  where state = 'ACTIVE' and competition_enabled;

create table community.role_grants (
  grant_id uuid primary key,
  user_id uuid not null references identity.users(user_id),
  role text not null check (role in ('PRIMARY_ADMIN', 'GYM_ADMIN', 'COACH', 'CENTRAL_ADMIN')),
  scope_type text not null check (scope_type in ('VENUE', 'COMMUNITY', 'SESSION', 'GLOBAL')),
  scope_id uuid,
  state text not null check (state in ('PENDING', 'ACTIVE', 'DECLINED', 'REVOKED', 'EXPIRED')),
  authorized_by uuid,
  authorized_at timestamptz,
  expires_at timestamptz,
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint role_grants_scope_shape_check check (
    (scope_type = 'GLOBAL' and scope_id is null)
    or (scope_type <> 'GLOBAL' and scope_id is not null)
  ),
  constraint role_grants_active_authorization_check check (
    state <> 'ACTIVE' or (authorized_by is not null and authorized_at is not null)
  )
);

create unique index role_grants_one_active_primary_per_venue_uq
  on community.role_grants (scope_id)
  where role = 'PRIMARY_ADMIN' and scope_type = 'VENUE' and state = 'ACTIVE';

create unique index role_grants_one_live_role_scope_per_user_uq
  on community.role_grants (user_id, role, scope_type, scope_id)
  where state in ('PENDING', 'ACTIVE');

create view community.coach_memberships as
select grant_id, user_id, scope_id as community_id, authorized_by, authorized_at, expires_at
from community.role_grants
where role = 'COACH' and scope_type = 'COMMUNITY' and state = 'ACTIVE';

create trigger venue_configuration_versions_immutable
before update or delete on community.venue_configuration_versions
for each row execute function platform.reject_event_mutation();

create trigger community_configuration_versions_immutable
before update or delete on community.community_configuration_versions
for each row execute function platform.reject_event_mutation();
