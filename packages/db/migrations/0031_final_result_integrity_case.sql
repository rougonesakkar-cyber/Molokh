alter table competition.challenge_participant_obligations
  add column cycle_no integer not null default 1 check (cycle_no > 0);

alter table competition.challenge_participant_obligations
  drop constraint challenge_participant_obligations_challenge_id_user_id_key;

alter table competition.challenge_participant_obligations
  add constraint challenge_obligations_cycle_actor_unique
  unique (challenge_id, cycle_no, user_id);

create table competition.integrity_cases (
  case_id uuid primary key,
  result_id uuid not null references competition.results(result_id),
  challenge_id uuid not null references competition.challenges(challenge_id),
  competition_id uuid not null references competition.competitions(competition_id),
  category text not null check (category in ('FRAUD', 'SYSTEM_ERROR', 'IDENTITY_ERROR')),
  evidence_reference text not null check (length(btrim(evidence_reference)) between 1 and 500),
  internal_reason text not null check (length(btrim(internal_reason)) between 1 and 2000),
  public_reason_category text not null check (
    public_reason_category in ('FRAUD', 'SYSTEM_ERROR', 'IDENTITY_ERROR')
  ),
  state text not null check (
    state in ('OPEN', 'UNDER_REVIEW', 'DECIDED_UPHELD', 'DECIDED_CORRECTED', 'DECIDED_ANNULLED')
  ),
  source_result_version bigint not null check (source_result_version > 0),
  source_competition_version bigint not null check (source_competition_version > 0),
  source_status_version bigint not null check (source_status_version >= 0),
  opened_by uuid not null references identity.users(user_id),
  opened_at timestamptz not null,
  sla_due_at timestamptz not null,
  assigned_reviewer_user_id uuid references identity.users(user_id),
  review_started_at timestamptz,
  decided_at timestamptz,
  version bigint not null check (version > 0),
  constraint integrity_case_sla_check check (sla_due_at > opened_at),
  constraint integrity_case_review_shape_check check (
    (state = 'OPEN' and assigned_reviewer_user_id is null and review_started_at is null)
    or (state <> 'OPEN' and assigned_reviewer_user_id is not null and review_started_at is not null)
  ),
  constraint integrity_case_decision_shape_check check (
    (state in ('OPEN', 'UNDER_REVIEW') and decided_at is null)
    or (state like 'DECIDED_%' and decided_at is not null)
  )
);

create unique index integrity_cases_one_open_per_result_uq
  on competition.integrity_cases (result_id)
  where state in ('OPEN', 'UNDER_REVIEW');

create index integrity_cases_central_queue_idx
  on competition.integrity_cases (opened_at, case_id)
  where state in ('OPEN', 'UNDER_REVIEW');

alter table competition.competitions
  add column integrity_hold_case_id uuid references competition.integrity_cases(case_id);

create unique index competitions_one_integrity_hold_case_uq
  on competition.competitions (integrity_hold_case_id)
  where integrity_hold_case_id is not null;

create table competition.integrity_decisions (
  decision_id uuid primary key,
  case_id uuid not null unique references competition.integrity_cases(case_id),
  result_id uuid not null references competition.results(result_id),
  reviewer_user_id uuid not null references identity.users(user_id),
  requested_disposition text not null check (
    requested_disposition in ('UPHOLD', 'CORRECT', 'ANNUL', 'REPEAT')
  ),
  effective_disposition text not null check (
    effective_disposition in ('UPHOLD', 'CORRECT', 'ANNUL', 'REPEAT')
  ),
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  public_reason_category text not null check (
    public_reason_category in ('FRAUD', 'SYSTEM_ERROR', 'IDENTITY_ERROR')
  ),
  original_outcome_code text not null check (
    original_outcome_code in ('WIN_A', 'WIN_B', 'DRAW', 'NO_CONTEST', 'FORFEIT', 'NO_SHOW')
  ),
  original_winner_user_id uuid references identity.users(user_id),
  original_loser_user_id uuid references identity.users(user_id),
  effective_outcome_code text check (
    effective_outcome_code in ('WIN_A', 'WIN_B', 'DRAW', 'NO_CONTEST', 'FORFEIT', 'NO_SHOW')
  ),
  effective_winner_user_id uuid references identity.users(user_id),
  effective_loser_user_id uuid references identity.users(user_id),
  replay_hash text not null check (length(replay_hash) = 64),
  decided_at timestamptz not null,
  constraint integrity_decision_effective_shape_check check (
    (effective_disposition = 'UPHOLD'
      and effective_outcome_code = original_outcome_code)
    or (effective_disposition = 'CORRECT' and effective_outcome_code is not null)
    or (effective_disposition in ('ANNUL', 'REPEAT') and effective_outcome_code is null)
  )
);

create table competition.integrity_status_compensations (
  compensation_id uuid primary key,
  decision_id uuid not null unique references competition.integrity_decisions(decision_id),
  case_id uuid not null unique references competition.integrity_cases(case_id),
  source_transition_id uuid references competition.status_transitions(transition_id),
  source_result_id uuid not null unique references competition.results(result_id),
  from_champion_user_id uuid references identity.users(user_id),
  from_contender_user_id uuid references identity.users(user_id),
  to_champion_user_id uuid references identity.users(user_id),
  to_contender_user_id uuid references identity.users(user_id),
  competition_status_version bigint not null check (competition_status_version > 0),
  replay_hash text not null check (length(replay_hash) = 64),
  compensated_by_event_id uuid not null,
  compensated_at timestamptz not null
);

create function competition.guard_integrity_case_source_immutability()
returns trigger language plpgsql as $$
begin
  if row(
    old.result_id, old.challenge_id, old.competition_id, old.category,
    old.evidence_reference, old.internal_reason, old.public_reason_category,
    old.source_result_version, old.source_competition_version, old.source_status_version,
    old.opened_by, old.opened_at, old.sla_due_at
  ) is distinct from row(
    new.result_id, new.challenge_id, new.competition_id, new.category,
    new.evidence_reference, new.internal_reason, new.public_reason_category,
    new.source_result_version, new.source_competition_version, new.source_status_version,
    new.opened_by, new.opened_at, new.sla_due_at
  ) then
    raise exception 'IntegrityCase source facts are immutable';
  end if;
  return new;
end;
$$;

create trigger integrity_cases_source_immutable
before update on competition.integrity_cases
for each row execute function competition.guard_integrity_case_source_immutability();

create trigger integrity_decisions_immutable
before update or delete on competition.integrity_decisions
for each row execute function platform.reject_event_mutation();

create trigger integrity_status_compensations_immutable
before update or delete on competition.integrity_status_compensations
for each row execute function platform.reject_event_mutation();
