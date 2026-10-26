create table competition.technical_correction_requests (
  correction_id uuid primary key,
  result_id uuid not null references competition.results(result_id),
  challenge_id uuid not null references competition.challenges(challenge_id),
  competition_id uuid not null references competition.competitions(competition_id),
  requester_user_id uuid not null references identity.users(user_id),
  category text not null check (
    category in ('OUTCOME_OR_WINNER_ERROR', 'LATE_RESULT_CORRECTION')
  ),
  state text not null check (
    state in ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN')
  ),
  source_result_version bigint not null check (source_result_version > 0),
  original_outcome_code text not null check (
    original_outcome_code in ('WIN_A', 'WIN_B', 'DRAW', 'NO_CONTEST', 'FORFEIT', 'NO_SHOW')
  ),
  original_winner_user_id uuid references identity.users(user_id),
  proposed_outcome_code text not null check (
    proposed_outcome_code in ('WIN_A', 'WIN_B', 'DRAW', 'NO_CONTEST', 'FORFEIT', 'NO_SHOW')
  ),
  proposed_winner_user_id uuid references identity.users(user_id),
  internal_reason text not null check (length(btrim(internal_reason)) between 1 and 2000),
  evidence_reference text not null check (length(btrim(evidence_reference)) between 1 and 500),
  submitted_at timestamptz not null,
  version bigint not null check (version > 0),
  constraint technical_correction_original_shape_check check (
    (original_outcome_code in ('DRAW', 'NO_CONTEST') and original_winner_user_id is null)
    or (original_outcome_code not in ('DRAW', 'NO_CONTEST') and original_winner_user_id is not null)
  ),
  constraint technical_correction_proposal_shape_check check (
    (proposed_outcome_code in ('DRAW', 'NO_CONTEST') and proposed_winner_user_id is null)
    or (proposed_outcome_code not in ('DRAW', 'NO_CONTEST') and proposed_winner_user_id is not null)
  ),
  constraint technical_correction_changes_result_check check (
    row(original_outcome_code, original_winner_user_id)
      is distinct from row(proposed_outcome_code, proposed_winner_user_id)
  )
);

create unique index technical_corrections_one_open_per_result_uq
  on competition.technical_correction_requests (result_id)
  where state in ('SUBMITTED', 'UNDER_REVIEW');

create index technical_corrections_central_queue_idx
  on competition.technical_correction_requests (submitted_at, correction_id)
  where state in ('SUBMITTED', 'UNDER_REVIEW');

create function competition.guard_technical_correction_source_immutability()
returns trigger language plpgsql as $$
begin
  if row(
    old.result_id, old.challenge_id, old.competition_id, old.requester_user_id,
    old.category, old.source_result_version, old.original_outcome_code,
    old.original_winner_user_id, old.proposed_outcome_code,
    old.proposed_winner_user_id, old.internal_reason, old.evidence_reference,
    old.submitted_at
  ) is distinct from row(
    new.result_id, new.challenge_id, new.competition_id, new.requester_user_id,
    new.category, new.source_result_version, new.original_outcome_code,
    new.original_winner_user_id, new.proposed_outcome_code,
    new.proposed_winner_user_id, new.internal_reason, new.evidence_reference,
    new.submitted_at
  ) then
    raise exception 'TechnicalCorrectionRequest source facts are immutable';
  end if;
  return new;
end;
$$;

create trigger technical_correction_source_immutable
before update on competition.technical_correction_requests
for each row execute function competition.guard_technical_correction_source_immutability();

create trigger technical_correction_delete_rejected
before delete on competition.technical_correction_requests
for each row execute function platform.reject_event_mutation();
