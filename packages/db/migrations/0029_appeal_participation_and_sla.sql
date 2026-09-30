create table competition.appeal_responses (
  response_id uuid primary key,
  appeal_id uuid not null references competition.appeals(appeal_id),
  responder_user_id uuid not null references identity.users(user_id),
  responder_role text not null check (responder_role in ('OPPONENT', 'COACH')),
  statement text not null check (length(btrim(statement)) between 1 and 2000),
  submitted_at timestamptz not null,
  unique (appeal_id, responder_user_id)
);

create table competition.appeal_withdrawals (
  withdrawal_id uuid primary key,
  appeal_id uuid not null unique references competition.appeals(appeal_id),
  withdrawn_by uuid not null references identity.users(user_id),
  withdrawn_at timestamptz not null
);

create table competition.appeal_sla_extensions (
  extension_id uuid primary key,
  appeal_id uuid not null unique references competition.appeals(appeal_id),
  extended_by uuid not null references identity.users(user_id),
  duration_hours integer not null check (duration_hours in (24, 48)),
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  previous_due_at timestamptz not null,
  extended_due_at timestamptz not null,
  extended_at timestamptz not null,
  constraint appeal_sla_extensions_duration_check check (
    extended_due_at = previous_due_at + make_interval(hours => duration_hours)
  )
);

create index appeal_responses_appeal_submitted_idx
  on competition.appeal_responses (appeal_id, submitted_at, response_id);
create index appeal_withdrawals_withdrawn_at_idx
  on competition.appeal_withdrawals (withdrawn_at desc, appeal_id);
create index appeal_sla_extensions_due_idx
  on competition.appeal_sla_extensions (extended_due_at, appeal_id);

create trigger appeal_responses_immutable
before update or delete on competition.appeal_responses
for each row execute function platform.reject_event_mutation();

create trigger appeal_withdrawals_immutable
before update or delete on competition.appeal_withdrawals
for each row execute function platform.reject_event_mutation();

create trigger appeal_sla_extensions_immutable
before update or delete on competition.appeal_sla_extensions
for each row execute function platform.reject_event_mutation();
