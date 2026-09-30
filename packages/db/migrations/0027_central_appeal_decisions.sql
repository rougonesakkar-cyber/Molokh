alter table competition.appeals
  add column review_started_at timestamptz;

create table competition.appeal_decisions (
  decision_id uuid primary key,
  appeal_id uuid not null unique references competition.appeals(appeal_id),
  result_id uuid not null unique references competition.results(result_id),
  reviewer_user_id uuid not null references identity.users(user_id),
  decision text not null check (decision in ('UPHOLD', 'REVERSE', 'ANNUL', 'REPEAT')),
  reason text not null check (length(btrim(reason)) between 1 and 2000),
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
  compensation_mode text not null check (
    compensation_mode in (
      'FINALIZE_ORIGINAL', 'REAPPLY_CORRECTED', 'RESTORE_PRE_RESULT', 'RESTORE_AND_REPEAT'
    )
  ),
  decided_at timestamptz not null,
  constraint appeal_decisions_original_shape_check check (
    (original_outcome_code in ('WIN_A', 'WIN_B', 'FORFEIT', 'NO_SHOW')
      and original_winner_user_id is not null and original_loser_user_id is not null
      and original_winner_user_id <> original_loser_user_id)
    or (original_outcome_code in ('DRAW', 'NO_CONTEST')
      and original_winner_user_id is null and original_loser_user_id is null)
  ),
  constraint appeal_decisions_effective_shape_check check (
    (decision in ('UPHOLD', 'REVERSE')
      and effective_outcome_code is not null
      and (
        (effective_outcome_code in ('WIN_A', 'WIN_B', 'FORFEIT', 'NO_SHOW')
          and effective_winner_user_id is not null and effective_loser_user_id is not null
          and effective_winner_user_id <> effective_loser_user_id)
        or (effective_outcome_code in ('DRAW', 'NO_CONTEST')
          and effective_winner_user_id is null and effective_loser_user_id is null)
      ))
    or (decision in ('ANNUL', 'REPEAT')
      and effective_outcome_code is null
      and effective_winner_user_id is null and effective_loser_user_id is null)
  )
);

create table competition.status_transition_compensations (
  compensation_id uuid primary key,
  source_transition_id uuid not null unique references competition.status_transitions(transition_id),
  source_result_id uuid not null unique references competition.results(result_id),
  decision_id uuid not null unique references competition.appeal_decisions(decision_id),
  compensation_mode text not null check (
    compensation_mode in ('REAPPLY_CORRECTED', 'RESTORE_PRE_RESULT', 'RESTORE_AND_REPEAT')
  ),
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
  constraint status_compensations_from_holders_check check (
    from_champion_user_id is null or from_contender_user_id is null
    or from_champion_user_id <> from_contender_user_id
  ),
  constraint status_compensations_to_holders_check check (
    to_champion_user_id is null or to_contender_user_id is null
    or to_champion_user_id <> to_contender_user_id
  ),
  constraint status_compensations_corrected_type_check check (
    (compensation_mode = 'REAPPLY_CORRECTED' and corrected_transition_type is not null)
    or (compensation_mode in ('RESTORE_PRE_RESULT', 'RESTORE_AND_REPEAT')
      and corrected_transition_type is null)
  )
);

create index appeal_decisions_decided_at_idx
  on competition.appeal_decisions (decided_at desc, decision_id);

create trigger appeal_decisions_immutable
before update or delete on competition.appeal_decisions
for each row execute function platform.reject_event_mutation();

create trigger status_transition_compensations_immutable
before update or delete on competition.status_transition_compensations
for each row execute function platform.reject_event_mutation();
