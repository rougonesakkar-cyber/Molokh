create schema if not exists platform;

create table platform.domain_events (
  event_id uuid primary key,
  event_name text not null,
  event_version integer not null check (event_version > 0),
  aggregate_type text not null,
  aggregate_id uuid not null,
  aggregate_version bigint not null check (aggregate_version > 0),
  transition_id text,
  correlation_id uuid not null,
  causation_id uuid,
  actor_id uuid,
  occurred_at timestamptz not null default clock_timestamp(),
  payload jsonb not null default '{}'::jsonb
);

create index domain_events_aggregate_idx
  on platform.domain_events (aggregate_type, aggregate_id, aggregate_version);

create table platform.audit_events (
  audit_id uuid primary key,
  action text not null,
  actor_id uuid,
  aggregate_type text not null,
  aggregate_id uuid not null,
  transition_id text,
  request_id uuid not null,
  occurred_at timestamptz not null default clock_timestamp(),
  metadata jsonb not null default '{}'::jsonb
);

create table platform.outbox_messages (
  message_id uuid primary key,
  topic text not null,
  event_id uuid not null references platform.domain_events(event_id),
  payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  published_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0)
);

create index outbox_messages_pending_idx
  on platform.outbox_messages (created_at)
  where published_at is null;

create table platform.idempotency_records (
  scope text not null,
  idempotency_key text not null,
  request_hash text not null,
  response_status integer not null,
  response_body jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (scope, idempotency_key)
);

create table platform.inbox_receipts (
  consumer_name text not null,
  event_id uuid not null,
  processed_at timestamptz not null default clock_timestamp(),
  primary key (consumer_name, event_id)
);

create function platform.reject_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'append-only table % cannot be mutated', tg_table_name;
end;
$$;

create trigger domain_events_append_only
before update or delete on platform.domain_events
for each row execute function platform.reject_event_mutation();

create trigger audit_events_append_only
before update or delete on platform.audit_events
for each row execute function platform.reject_event_mutation();

