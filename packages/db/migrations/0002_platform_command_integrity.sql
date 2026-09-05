create unique index domain_events_aggregate_version_uq
  on platform.domain_events (aggregate_type, aggregate_id, aggregate_version);

alter table platform.domain_events
  add column recorded_at timestamptz not null default clock_timestamp(),
  add column actor_type text not null default 'SYSTEM'
    check (actor_type in ('USER', 'SYSTEM', 'PROVIDER')),
  add column actor_roles jsonb not null default '[]'::jsonb,
  add column actor_scope_ids uuid[] not null default '{}'::uuid[],
  add column idempotency_key_hash text not null default '',
  add column metadata jsonb not null default '{}'::jsonb;

alter table platform.audit_events
  add column actor_roles jsonb not null default '[]'::jsonb,
  add column actor_scope_ids uuid[] not null default '{}'::uuid[],
  add column correlation_id uuid,
  add column causation_id uuid,
  add column reason_code text,
  add column before_state text,
  add column after_state text;

alter table platform.idempotency_records
  add column command_id uuid not null,
  add column event_id uuid not null references platform.domain_events(event_id);
