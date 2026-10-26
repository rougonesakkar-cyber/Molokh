create table platform.platform_incidents (
  incident_id uuid primary key,
  state text not null check (state in (
    'DETECTED', 'CONFIRMED_ACTIVE', 'RESOLVED', 'COMPENSATED', 'REJECTED'
  )),
  affected_services text[] not null check (cardinality(affected_services) > 0),
  affected_surfaces text[] not null check (cardinality(affected_surfaces) > 0),
  severity text not null check (severity in ('INFO', 'MINOR', 'MAJOR', 'CRITICAL')),
  started_at timestamptz not null,
  ended_at timestamptz,
  monitoring_evidence_reference text not null check (length(trim(monitoring_evidence_reference)) > 0),
  detected_at timestamptz not null,
  confirmed_by uuid references identity.users(user_id),
  confirmed_at timestamptz,
  confirmation_reason text,
  rejected_by uuid references identity.users(user_id),
  rejected_at timestamptz,
  rejection_reason text,
  resolved_by uuid references identity.users(user_id),
  resolved_by_actor_type text check (resolved_by_actor_type in ('USER', 'SYSTEM')),
  resolved_at timestamptz,
  resolution_reason text,
  compensated_at timestamptz,
  impact_count integer not null default 0 check (impact_count >= 0),
  version bigint not null check (version > 0),
  policy_version text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (ended_at is null or ended_at > started_at),
  check (state not in ('RESOLVED', 'COMPENSATED') or ended_at is not null)
);

create index platform_incidents_state_started_idx
  on platform.platform_incidents (state, started_at, incident_id);
create index platform_incidents_services_gin_idx
  on platform.platform_incidents using gin (affected_services);

create table platform.incident_impacts (
  impact_id uuid primary key,
  incident_id uuid not null references platform.platform_incidents(incident_id),
  aggregate_type text not null,
  aggregate_id uuid not null,
  service text not null,
  surface text not null,
  deadline_kind text not null check (deadline_kind in (
    'CHALLENGE_RESPONSE', 'CHALLENGE_SCHEDULING', 'BOOKING_SELECTION',
    'STATUS_QUEUE_RECONFIRMATION', 'BOOKING_CONVERSION_CONFIRMATION',
    'GENESIS_PUBLIC_WINDOW'
  )),
  impact_type text not null check (impact_type in ('DEADLINE_EXTENDED', 'TIMEOUT_COMPENSATED')),
  clock_started_at timestamptz not null,
  old_deadline_at timestamptz not null,
  new_deadline_at timestamptz not null,
  overlap_started_at timestamptz not null,
  overlap_ended_at timestamptz not null,
  overlap_milliseconds bigint not null check (overlap_milliseconds > 0),
  source_timeout_event_id uuid references platform.domain_events(event_id),
  source_result_id uuid references competition.results(result_id),
  source_status_event_id uuid references platform.domain_events(event_id),
  compensating_event_id uuid references platform.domain_events(event_id),
  created_at timestamptz not null default clock_timestamp(),
  unique (incident_id, aggregate_type, aggregate_id, deadline_kind),
  check (overlap_ended_at > overlap_started_at),
  check (new_deadline_at > old_deadline_at)
);

create index incident_impacts_incident_idx
  on platform.incident_impacts (incident_id, created_at, impact_id);

create trigger incident_impacts_immutable
before update or delete on platform.incident_impacts
for each row execute function platform.reject_event_mutation();

create table platform.incident_timeout_compensations (
  compensation_id uuid primary key,
  impact_id uuid not null unique references platform.incident_impacts(impact_id),
  incident_id uuid not null references platform.platform_incidents(incident_id),
  challenge_id uuid not null references competition.challenges(challenge_id),
  source_timeout_event_id uuid not null references platform.domain_events(event_id),
  source_result_id uuid not null references competition.results(result_id),
  source_status_transition_id uuid references competition.status_transitions(transition_id),
  replay_hash text not null,
  compensating_event_id uuid not null references platform.domain_events(event_id),
  compensated_at timestamptz not null,
  policy_version text not null
);

create trigger incident_timeout_compensations_immutable
before update or delete on platform.incident_timeout_compensations
for each row execute function platform.reject_event_mutation();
