alter table identity.users
  drop constraint users_phone_verified_before_activation_check;

create table identity.trusted_sessions (
  trusted_session_id uuid primary key,
  user_id uuid not null references identity.users(user_id),
  session_reference_hash text not null check (session_reference_hash ~ '^[0-9a-f]{64}$'),
  state text not null check (state in ('TRUSTED', 'REVOKED')),
  trusted_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (user_id, session_reference_hash),
  check (
    (state = 'TRUSTED' and revoked_at is null)
    or (state = 'REVOKED' and revoked_at is not null)
  )
);

create table identity.account_access_cases (
  case_id uuid primary key,
  user_id uuid not null references identity.users(user_id),
  state text not null check (state in ('PENDING', 'SECURITY_HOLD', 'COMPLETED', 'REJECTED')),
  recovery_route text not null check (recovery_route in ('VERIFIED_ROUTE', 'PHONE_CHANGE')),
  recovery_signals text[] not null check (
    cardinality(recovery_signals) > 0
    and recovery_signals <@ array['VERIFIED_PHONE', 'TRUSTED_SESSION', 'CENTRAL_SUPPORT']::text[]
  ),
  requested_phone_e164 text,
  request_reason text not null check (length(btrim(request_reason)) between 10 and 1000),
  requested_by uuid not null references identity.users(user_id),
  requested_at timestamptz not null,
  reviewed_by uuid references identity.users(user_id),
  decision_reason text check (
    decision_reason is null or length(btrim(decision_reason)) between 10 and 1000
  ),
  decision_at timestamptz,
  security_hold_until timestamptz,
  completed_at timestamptz,
  incident_started_at timestamptz,
  incident_ended_at timestamptz,
  incident_reason text check (
    incident_reason is null or length(btrim(incident_reason)) between 10 and 1000
  ),
  affected_process_ids uuid[] not null default '{}',
  incident_confirmed_by uuid references identity.users(user_id),
  incident_confirmed_at timestamptz,
  policy_version text not null,
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((recovery_route = 'PHONE_CHANGE') = (requested_phone_e164 is not null)),
  check (
    (state = 'PENDING' and decision_at is null and security_hold_until is null
      and completed_at is null)
    or (state = 'SECURITY_HOLD' and recovery_route = 'PHONE_CHANGE'
      and reviewed_by is not null and decision_reason is not null
      and decision_at is not null and security_hold_until = decision_at + interval '24 hours'
      and completed_at is null)
    or (state = 'COMPLETED' and completed_at is not null)
    or (state = 'REJECTED' and reviewed_by is not null and decision_reason is not null
      and decision_at is not null and completed_at is null)
  ),
  check (
    (incident_started_at is null and incident_ended_at is null and incident_reason is null
      and cardinality(affected_process_ids) = 0 and incident_confirmed_by is null
      and incident_confirmed_at is null)
    or (incident_started_at is not null and incident_ended_at > incident_started_at
      and incident_reason is not null and cardinality(affected_process_ids) > 0
      and incident_confirmed_by is not null and incident_confirmed_at is not null)
  )
);

create unique index account_access_one_live_case_per_user_uq
  on identity.account_access_cases (user_id)
  where state in ('PENDING', 'SECURITY_HOLD');
create unique index account_access_one_requested_phone_uq
  on identity.account_access_cases (requested_phone_e164)
  where state in ('PENDING', 'SECURITY_HOLD') and requested_phone_e164 is not null;
create index account_access_central_queue_idx
  on identity.account_access_cases (requested_at, case_id)
  where state = 'PENDING';
create index account_access_hold_expiry_idx
  on identity.account_access_cases (security_hold_until, case_id)
  where state = 'SECURITY_HOLD';

create table identity.user_sensitive_action_holds (
  hold_id uuid primary key,
  user_id uuid not null references identity.users(user_id),
  source_case_id uuid not null references identity.account_access_cases(case_id),
  state text not null check (state in ('ACTIVE', 'RELEASED')),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at = starts_at + interval '24 hours'),
  released_at timestamptz,
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (state = 'ACTIVE' and released_at is null)
    or (state = 'RELEASED' and released_at is not null)
  )
);

create unique index sensitive_action_hold_one_active_per_user_uq
  on identity.user_sensitive_action_holds (user_id) where state = 'ACTIVE';
create index sensitive_action_hold_expiry_idx
  on identity.user_sensitive_action_holds (ends_at, hold_id) where state = 'ACTIVE';

create table identity.duplicate_account_cases (
  case_id uuid primary key,
  state text not null check (state in ('UNDER_REVIEW', 'CLEARED', 'RESOLVED')),
  signal_references text[] not null check (cardinality(signal_references) > 0),
  request_reason text not null check (length(btrim(request_reason)) between 10 and 1000),
  requested_by uuid references identity.users(user_id),
  requested_by_type text not null check (requested_by_type in ('USER', 'SYSTEM')),
  requested_at timestamptz not null,
  canonical_user_id uuid references identity.users(user_id),
  reviewed_by uuid references identity.users(user_id),
  decision_reason text check (
    decision_reason is null or length(btrim(decision_reason)) between 10 and 1000
  ),
  decided_at timestamptz,
  policy_version text not null,
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((requested_by_type = 'SYSTEM') = (requested_by is null)),
  check (
    (state = 'UNDER_REVIEW' and canonical_user_id is null and reviewed_by is null
      and decision_reason is null and decided_at is null)
    or (state = 'CLEARED' and canonical_user_id is null and reviewed_by is not null
      and decision_reason is not null and decided_at is not null)
    or (state = 'RESOLVED' and canonical_user_id is not null and reviewed_by is not null
      and decision_reason is not null and decided_at is not null)
  )
);

create table identity.duplicate_account_case_users (
  case_id uuid not null references identity.duplicate_account_cases(case_id),
  user_id uuid not null references identity.users(user_id),
  live boolean not null default true,
  primary key (case_id, user_id)
);

create unique index duplicate_account_one_live_case_per_user_uq
  on identity.duplicate_account_case_users (user_id)
  where live;

create table identity.duplicate_account_processes (
  case_id uuid not null references identity.duplicate_account_cases(case_id),
  process_kind text not null check (process_kind in ('STATUS', 'OBLIGATION')),
  aggregate_id uuid not null,
  current_owner_user_id uuid not null references identity.users(user_id),
  decision text check (decision is null or decision in (
    'RETAIN_CURRENT_OWNER', 'CLOSE_NO_FAULT', 'SEPARATE_GOVERNED_REVIEW'
  )),
  primary key (case_id, process_kind, aggregate_id, current_owner_user_id)
);

create table identity.duplicate_account_aliases (
  alias_id uuid primary key,
  case_id uuid not null references identity.duplicate_account_cases(case_id),
  canonical_user_id uuid not null references identity.users(user_id),
  duplicate_user_id uuid not null references identity.users(user_id),
  created_at timestamptz not null,
  unique (duplicate_user_id),
  check (canonical_user_id <> duplicate_user_id)
);

alter table competition.process_holds
  alter column created_by drop not null,
  add column created_by_type text not null default 'USER'
    check (created_by_type in ('USER', 'SYSTEM')),
  add column account_access_case_id uuid references identity.account_access_cases(case_id),
  add column duplicate_account_case_id uuid references identity.duplicate_account_cases(case_id),
  add constraint process_holds_one_source_check check (
    num_nonnulls(source_case_id, account_access_case_id, duplicate_account_case_id) <= 1
  ),
  add constraint process_holds_creator_shape_check check (
    (created_by_type = 'SYSTEM' and created_by is null)
    or (created_by_type = 'USER' and created_by is not null)
  );

create index process_holds_account_access_case_idx
  on competition.process_holds (account_access_case_id)
  where account_access_case_id is not null;
create index process_holds_duplicate_account_case_idx
  on competition.process_holds (duplicate_account_case_id)
  where duplicate_account_case_id is not null;

create trigger account_access_cases_reject_delete
before delete on identity.account_access_cases
for each row execute function platform.reject_event_mutation();
create trigger sensitive_action_holds_reject_delete
before delete on identity.user_sensitive_action_holds
for each row execute function platform.reject_event_mutation();
create trigger duplicate_account_cases_reject_delete
before delete on identity.duplicate_account_cases
for each row execute function platform.reject_event_mutation();
create trigger duplicate_account_aliases_immutable
before update or delete on identity.duplicate_account_aliases
for each row execute function platform.reject_event_mutation();
