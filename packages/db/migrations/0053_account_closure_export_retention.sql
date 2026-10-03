create table platform.retention_policy_versions (
  policy_id uuid primary key,
  record_class text not null check (record_class in (
    'ACCOUNT_EXPORT', 'PERSONAL_CHAT', 'SERVICE_CHAT', 'SAFETY_EVIDENCE',
    'IMMUTABLE_COMPETITION_HISTORY'
  )),
  policy_version text not null,
  retention_seconds bigint check (retention_seconds is null or retention_seconds > 0),
  effective_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (record_class, policy_version),
  check ((record_class = 'IMMUTABLE_COMPETITION_HISTORY') = (retention_seconds is null))
);

insert into platform.retention_policy_versions (
  policy_id, record_class, policy_version, retention_seconds, effective_at
) values
  ('0199a1b2-1234-7000-8000-000000005301', 'ACCOUNT_EXPORT',
    'account-lifecycle-mvp-v1', 172800, '2026-10-03T00:00:00Z'),
  ('0199a1b2-1234-7000-8000-000000005302', 'PERSONAL_CHAT',
    'data-lifecycle-mvp-v1', 31536000, '2026-10-03T00:00:00Z'),
  ('0199a1b2-1234-7000-8000-000000005303', 'SERVICE_CHAT',
    'data-lifecycle-mvp-v1', 94608000, '2026-10-03T00:00:00Z'),
  ('0199a1b2-1234-7000-8000-000000005304', 'SAFETY_EVIDENCE',
    'data-lifecycle-mvp-v1', 94608000, '2026-10-03T00:00:00Z'),
  ('0199a1b2-1234-7000-8000-000000005305', 'IMMUTABLE_COMPETITION_HISTORY',
    'data-lifecycle-mvp-v1', null, '2026-10-03T00:00:00Z');

create trigger retention_policy_versions_immutable
before update or delete on platform.retention_policy_versions
for each row execute function platform.reject_event_mutation();

create table identity.account_closure_requests (
  closure_id uuid primary key,
  user_id uuid not null references identity.users(user_id),
  state text not null check (state in ('REQUESTED', 'CANCELLED', 'EXECUTED')),
  export_requested boolean not null,
  recovery_until timestamptz not null,
  requested_at timestamptz not null,
  cancelled_at timestamptz,
  executed_at timestamptz,
  executed_by uuid references identity.users(user_id),
  execution_reason text,
  pseudonymization_event_id uuid references platform.domain_events(event_id)
    deferrable initially deferred,
  policy_version text not null,
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (recovery_until = requested_at + interval '30 days'),
  check (
    (state = 'REQUESTED' and cancelled_at is null and executed_at is null
      and executed_by is null and execution_reason is null and pseudonymization_event_id is null)
    or (state = 'CANCELLED' and cancelled_at is not null and executed_at is null
      and executed_by is null and execution_reason is null and pseudonymization_event_id is null)
    or (state = 'EXECUTED' and cancelled_at is null and executed_at is not null
      and executed_by is not null and execution_reason is not null
      and pseudonymization_event_id is not null)
  )
);

create unique index account_closure_one_requested_per_user_uq
  on identity.account_closure_requests (user_id)
  where state = 'REQUESTED';
create index account_closure_recovery_queue_idx
  on identity.account_closure_requests (recovery_until, closure_id)
  where state = 'REQUESTED';

create table identity.account_data_exports (
  export_id uuid primary key,
  user_id uuid not null references identity.users(user_id),
  closure_id uuid references identity.account_closure_requests(closure_id),
  state text not null check (state in ('REQUESTED', 'READY', 'EXPIRED')),
  requested_at timestamptz not null,
  ready_at timestamptz,
  expires_at timestamptz,
  expired_at timestamptz,
  export_payload jsonb,
  payload_sha256 text check (payload_sha256 is null or payload_sha256 ~ '^[0-9a-f]{64}$'),
  policy_version text not null,
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (state = 'REQUESTED' and ready_at is null and expires_at is null
      and expired_at is null and export_payload is null and payload_sha256 is null)
    or (state = 'READY' and ready_at is not null and expires_at = ready_at + interval '48 hours'
      and expired_at is null and export_payload is not null and payload_sha256 is not null)
    or (state = 'EXPIRED' and ready_at is not null and expires_at is not null
      and expired_at is not null and export_payload is null and payload_sha256 is not null)
  )
);

create unique index account_export_one_live_per_user_uq
  on identity.account_data_exports (user_id)
  where state in ('REQUESTED', 'READY');
create index account_export_expiry_idx
  on identity.account_data_exports (expires_at, export_id)
  where state = 'READY';
