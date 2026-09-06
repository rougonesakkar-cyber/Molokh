create schema if not exists identity;

create table identity.users (
  user_id uuid primary key,
  phone_e164 text not null,
  phone_verified_at timestamptz,
  birth_date date not null,
  age_division text not null check (age_division in ('YOUTH', 'ADULT')),
  display_name text not null check (
    length(btrim(display_name)) between 1 and 80
  ),
  avatar_asset_id uuid,
  account_state text not null check (
    account_state in ('ACTIVE', 'RESTRICTED', 'CLOSED')
  ),
  discovery_paused boolean not null default false,
  locale text not null,
  version bigint not null check (version > 0),
  activated_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint users_minimum_activation_age_check check (
    birth_date <= (
      (activated_at at time zone 'UTC')::date - interval '14 years'
    )::date
  )
);

create unique index users_active_verified_phone_uq
  on identity.users (phone_e164)
  where phone_verified_at is not null
    and account_state in ('ACTIVE', 'RESTRICTED');

create table identity.athlete_profiles (
  user_id uuid primary key references identity.users(user_id),
  primary_sport text not null,
  secondary_sport text,
  weight_kg numeric(5,2),
  experience_text text,
  home_venue_id uuid,
  primary_community_id uuid,
  discovery_radius_km integer not null check (discovery_radius_km > 0),
  preference_json jsonb not null default '{"version":1}'::jsonb,
  stats_schema_version integer not null default 1 check (stats_schema_version > 0),
  updated_at timestamptz not null default clock_timestamp()
);

create table identity.account_verifications (
  verification_id uuid primary key,
  user_id uuid not null references identity.users(user_id),
  state text not null check (
    state in ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'REVOKED')
  ),
  method text not null check (method = 'CENTRAL_MODERATION'),
  moderation_checklist_version text not null,
  is_current boolean not null default true,
  verified_at timestamptz,
  expires_at timestamptz,
  decided_by uuid,
  decision_reason text,
  created_at timestamptz not null default clock_timestamp(),
  version bigint not null check (version > 0)
);

create unique index account_verifications_current_user_uq
  on identity.account_verifications (user_id)
  where is_current;

create table identity.display_name_audit (
  audit_id uuid primary key,
  user_id uuid not null references identity.users(user_id),
  changed_by uuid not null,
  previous_display_name text not null,
  new_display_name text not null,
  request_id uuid not null,
  occurred_at timestamptz not null
);

create trigger display_name_audit_append_only
before update or delete on identity.display_name_audit
for each row execute function platform.reject_event_mutation();
