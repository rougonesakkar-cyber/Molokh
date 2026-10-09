create table competition.technical_correction_decisions (
  decision_id uuid primary key,
  correction_id uuid not null unique
    references competition.technical_correction_requests(correction_id),
  result_id uuid not null unique references competition.results(result_id),
  reviewer_user_id uuid not null references identity.users(user_id),
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  original_outcome_code text not null check (
    original_outcome_code in ('WIN_A', 'WIN_B', 'DRAW', 'NO_CONTEST', 'FORFEIT', 'NO_SHOW')
  ),
  original_winner_user_id uuid references identity.users(user_id),
  original_loser_user_id uuid references identity.users(user_id),
  effective_outcome_code text not null check (
    effective_outcome_code in ('WIN_A', 'WIN_B', 'DRAW', 'NO_CONTEST', 'FORFEIT', 'NO_SHOW')
  ),
  effective_winner_user_id uuid references identity.users(user_id),
  effective_loser_user_id uuid references identity.users(user_id),
  compensation_mode text not null check (compensation_mode = 'REAPPLY_CORRECTED'),
  decided_at timestamptz not null,
  constraint technical_correction_decision_original_shape_check check (
    (original_outcome_code in ('DRAW', 'NO_CONTEST')
      and original_winner_user_id is null and original_loser_user_id is null)
    or (original_outcome_code not in ('DRAW', 'NO_CONTEST')
      and original_winner_user_id is not null and original_loser_user_id is not null
      and original_winner_user_id <> original_loser_user_id)
  ),
  constraint technical_correction_decision_effective_shape_check check (
    (effective_outcome_code in ('DRAW', 'NO_CONTEST')
      and effective_winner_user_id is null and effective_loser_user_id is null)
    or (effective_outcome_code not in ('DRAW', 'NO_CONTEST')
      and effective_winner_user_id is not null and effective_loser_user_id is not null
      and effective_winner_user_id <> effective_loser_user_id)
  )
);

create table competition.technical_correction_status_compensations (
  compensation_id uuid primary key,
  decision_id uuid not null unique
    references competition.technical_correction_decisions(decision_id),
  correction_id uuid not null unique
    references competition.technical_correction_requests(correction_id),
  source_transition_id uuid references competition.status_transitions(transition_id),
  source_result_id uuid not null unique references competition.results(result_id),
  corrected_transition_type text check (
    corrected_transition_type in (
      'GENESIS_APPLIED', 'GENESIS_APPLIED_WITH_VACANCY', 'CONTENDER_ASSIGNED',
      'CONTENDER_TRANSFERRED', 'CONTENDER_DEFENDED', 'TITLE_TRANSFERRED', 'TITLE_DEFENDED'
    )
  ),
  from_champion_user_id uuid references identity.users(user_id),
  from_contender_user_id uuid references identity.users(user_id),
  to_champion_user_id uuid references identity.users(user_id),
  to_contender_user_id uuid references identity.users(user_id),
  competition_status_version bigint not null check (competition_status_version > 0),
  compensated_by_event_id uuid not null,
  compensated_at timestamptz not null,
  constraint technical_correction_compensation_from_holders_check check (
    from_champion_user_id is null or from_contender_user_id is null
    or from_champion_user_id <> from_contender_user_id
  ),
  constraint technical_correction_compensation_to_holders_check check (
    to_champion_user_id is null or to_contender_user_id is null
    or to_champion_user_id <> to_contender_user_id
  )
);

create trigger technical_correction_decisions_immutable
before update or delete on competition.technical_correction_decisions
for each row execute function platform.reject_event_mutation();

create trigger technical_correction_status_compensations_immutable
before update or delete on competition.technical_correction_status_compensations
for each row execute function platform.reject_event_mutation();
