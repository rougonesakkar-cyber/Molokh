alter table competition.challenges
  add column cycle_no integer not null default 1 check (cycle_no > 0);

create table competition.results (
  result_id uuid primary key,
  challenge_id uuid not null references competition.challenges(challenge_id),
  session_id uuid references scheduling.sessions(session_id),
  competitive_snapshot_id uuid not null references scheduling.session_competitive_snapshots(snapshot_id),
  cycle_no integer not null check (cycle_no > 0),
  origin text not null check (origin in ('SESSION', 'ADMINISTRATIVE_FORFEIT')),
  state text not null check (
    state in ('RECORDED', 'UNDER_APPEAL', 'FINAL', 'REVERSED', 'ANNULLED', 'REPEAT_ORDERED')
  ),
  recorded_outcome_code text not null check (
    recorded_outcome_code in ('WIN_A', 'WIN_B', 'DRAW', 'NO_CONTEST', 'FORFEIT', 'NO_SHOW')
  ),
  winner_user_id uuid references identity.users(user_id),
  loser_user_id uuid references identity.users(user_id),
  reason_code text,
  comment text,
  method_code text,
  method_text text,
  score_payload jsonb,
  method_payload jsonb,
  actual_time timestamptz not null,
  venue_id uuid references community.venues(venue_id),
  coach_user_id uuid references identity.users(user_id),
  recorded_by uuid not null references identity.users(user_id),
  recorded_at timestamptz not null,
  appeal_deadline_at timestamptz not null,
  pre_status_snapshot jsonb not null,
  status_transition_event_id uuid,
  finalized_at timestamptz,
  version bigint not null check (version > 0),
  updated_at timestamptz not null,
  constraint results_one_per_challenge_cycle_unique unique (challenge_id, cycle_no),
  constraint results_one_per_session_unique unique (session_id),
  constraint results_session_origin_shape_check check (
    (origin = 'SESSION' and session_id is not null and venue_id is not null and coach_user_id is not null)
    or (origin = 'ADMINISTRATIVE_FORFEIT' and session_id is null)
  ),
  constraint results_decisive_shape_check check (
    (recorded_outcome_code in ('WIN_A', 'WIN_B', 'FORFEIT', 'NO_SHOW')
      and winner_user_id is not null and loser_user_id is not null
      and winner_user_id <> loser_user_id)
    or (recorded_outcome_code in ('DRAW', 'NO_CONTEST')
      and winner_user_id is null and loser_user_id is null)
  ),
  constraint results_explanation_shape_check check (
    recorded_outcome_code not in ('FORFEIT', 'NO_SHOW', 'NO_CONTEST')
    or (
      coalesce(length(btrim(reason_code)), 0) between 1 and 80
      and coalesce(length(btrim(comment)), 0) between 1 and 500
    )
  ),
  constraint results_optional_text_length_check check (
    (reason_code is null or length(btrim(reason_code)) between 1 and 80)
    and (comment is null or length(btrim(comment)) between 1 and 500)
    and (method_code is null or length(btrim(method_code)) between 1 and 80)
    and (method_text is null or length(btrim(method_text)) between 1 and 500)
  ),
  constraint results_appeal_window_check check (appeal_deadline_at > recorded_at),
  constraint results_finalized_shape_check check (
    (state in ('RECORDED', 'UNDER_APPEAL') and finalized_at is null)
    or (state in ('FINAL', 'REVERSED', 'ANNULLED', 'REPEAT_ORDERED') and finalized_at is not null)
  )
);

alter table competition.pair_cooldowns
  add constraint pair_cooldowns_source_result_fk
  foreign key (source_result_id) references competition.results(result_id);

alter table competition.competitions
  add constraint competitions_status_lock_result_fk
  foreign key (status_lock_result_id) references competition.results(result_id)
  deferrable initially deferred;

create table competition.status_transitions (
  transition_id uuid primary key,
  source_result_id uuid not null unique references competition.results(result_id),
  source_event_id uuid not null,
  competition_id uuid not null references competition.competitions(competition_id),
  transition_type text not null check (
    transition_type in (
      'GENESIS_APPLIED', 'GENESIS_APPLIED_WITH_VACANCY', 'CONTENDER_ASSIGNED',
      'CONTENDER_TRANSFERRED', 'CONTENDER_DEFENDED', 'TITLE_TRANSFERRED', 'TITLE_DEFENDED'
    )
  ),
  before_champion_user_id uuid references identity.users(user_id),
  before_contender_user_id uuid references identity.users(user_id),
  before_status_version bigint not null check (before_status_version >= 0),
  after_champion_user_id uuid references identity.users(user_id),
  after_contender_user_id uuid references identity.users(user_id),
  after_status_version bigint not null check (after_status_version > before_status_version),
  competitive_snapshot_id uuid not null references scheduling.session_competitive_snapshots(snapshot_id),
  provisional boolean not null check (provisional),
  applied_at timestamptz not null,
  constraint status_transitions_before_holders_check check (
    before_champion_user_id is null or before_contender_user_id is null
    or before_champion_user_id <> before_contender_user_id
  ),
  constraint status_transitions_after_holders_check check (
    after_champion_user_id is null or after_contender_user_id is null
    or after_champion_user_id <> after_contender_user_id
  )
);

create table competition.status_transition_finalizations (
  finalization_id uuid primary key,
  transition_id uuid not null unique references competition.status_transitions(transition_id),
  result_id uuid not null unique references competition.results(result_id),
  finalized_by_event_id uuid not null,
  competition_status_version bigint not null check (competition_status_version > 0),
  finalized_at timestamptz not null
);

create table competition.appeals (
  appeal_id uuid primary key,
  result_id uuid not null references competition.results(result_id),
  challenge_id uuid not null references competition.challenges(challenge_id),
  appellant_user_id uuid not null references identity.users(user_id),
  state text not null check (
    state in (
      'SUBMITTED', 'UNDER_REVIEW', 'WITHDRAWN', 'DECIDED_UPHELD',
      'DECIDED_REVERSED', 'DECIDED_ANNULLED', 'DECIDED_REPEAT'
    )
  ),
  reason_code text not null check (length(btrim(reason_code)) between 1 and 80),
  statement text not null check (length(btrim(statement)) between 1 and 2000),
  submitted_at timestamptz not null,
  response_deadline_at timestamptz not null,
  sla_due_at timestamptz not null,
  assigned_reviewer_id uuid references identity.users(user_id),
  decision text check (decision in ('UPHOLD', 'REVERSE', 'ANNUL', 'REPEAT')),
  decision_reason text,
  decided_at timestamptz,
  version bigint not null check (version > 0),
  constraint appeals_one_history_per_actor_unique unique (result_id, appellant_user_id),
  constraint appeals_deadline_shape_check check (
    response_deadline_at > submitted_at and sla_due_at > submitted_at
  )
);

create table competition.appeal_waivers (
  waiver_id uuid primary key,
  result_id uuid not null references competition.results(result_id),
  user_id uuid not null references identity.users(user_id),
  waived_at timestamptz not null,
  reason_context text not null check (reason_context = 'EARLY_UNLOCK'),
  unique (result_id, user_id)
);

create index results_challenge_history_idx
  on competition.results (challenge_id, cycle_no desc, recorded_at desc, result_id);

create index results_appeal_timer_idx
  on competition.results (appeal_deadline_at, result_id)
  where state = 'RECORDED';

create index appeals_central_queue_idx
  on competition.appeals (submitted_at, appeal_id)
  where state in ('SUBMITTED', 'UNDER_REVIEW');

create unique index pair_cooldowns_one_per_result_uq
  on competition.pair_cooldowns (source_result_id)
  where source_result_id is not null;

create function competition.guard_result_source_immutability()
returns trigger language plpgsql as $$
begin
  if row(
    old.challenge_id, old.session_id, old.competitive_snapshot_id, old.cycle_no,
    old.origin, old.recorded_outcome_code, old.winner_user_id, old.loser_user_id,
    old.reason_code, old.comment, old.method_code, old.method_text,
    old.score_payload, old.method_payload, old.actual_time, old.venue_id,
    old.coach_user_id, old.recorded_by, old.recorded_at, old.appeal_deadline_at,
    old.pre_status_snapshot, old.status_transition_event_id
  ) is distinct from row(
    new.challenge_id, new.session_id, new.competitive_snapshot_id, new.cycle_no,
    new.origin, new.recorded_outcome_code, new.winner_user_id, new.loser_user_id,
    new.reason_code, new.comment, new.method_code, new.method_text,
    new.score_payload, new.method_payload, new.actual_time, new.venue_id,
    new.coach_user_id, new.recorded_by, new.recorded_at, new.appeal_deadline_at,
    new.pre_status_snapshot, new.status_transition_event_id
  ) then
    raise exception 'Result source facts are immutable';
  end if;
  return new;
end;
$$;

create trigger results_source_immutable
before update on competition.results
for each row execute function competition.guard_result_source_immutability();

create function competition.guard_appeal_source_immutability()
returns trigger language plpgsql as $$
begin
  if row(
    old.result_id, old.challenge_id, old.appellant_user_id,
    old.reason_code, old.statement, old.submitted_at,
    old.response_deadline_at, old.sla_due_at
  ) is distinct from row(
    new.result_id, new.challenge_id, new.appellant_user_id,
    new.reason_code, new.statement, new.submitted_at,
    new.response_deadline_at, new.sla_due_at
  ) then
    raise exception 'Appeal source facts are immutable';
  end if;
  return new;
end;
$$;

create trigger appeals_source_immutable
before update on competition.appeals
for each row execute function competition.guard_appeal_source_immutability();

create trigger status_transitions_immutable
before update or delete on competition.status_transitions
for each row execute function platform.reject_event_mutation();

create trigger status_transition_finalizations_immutable
before update or delete on competition.status_transition_finalizations
for each row execute function platform.reject_event_mutation();

create trigger appeal_waivers_immutable
before update or delete on competition.appeal_waivers
for each row execute function platform.reject_event_mutation();
