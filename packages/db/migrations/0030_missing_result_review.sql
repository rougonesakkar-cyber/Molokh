create table competition.missing_result_reviews (
  review_id uuid primary key,
  challenge_id uuid not null unique references competition.challenges(challenge_id),
  session_id uuid not null unique references scheduling.sessions(session_id),
  venue_id uuid not null references community.venues(venue_id),
  original_coach_user_id uuid not null references identity.users(user_id),
  operational_followup_id uuid not null unique,
  state text not null check (
    state in ('OPEN', 'UNDER_REVIEW', 'REVIEWER_ASSIGNED', 'RESOLVED', 'REPEAT_ORDERED')
  ),
  opened_at timestamptz not null,
  assigned_central_user_id uuid references identity.users(user_id),
  review_started_at timestamptz,
  assigned_reviewer_coach_user_id uuid references identity.users(user_id),
  allowed_outcome_code text check (
    allowed_outcome_code in ('WIN_A', 'WIN_B', 'DRAW', 'NO_CONTEST')
  ),
  allowed_winner_user_id uuid references identity.users(user_id),
  assignment_reason text check (
    assignment_reason is null or length(btrim(assignment_reason)) between 1 and 2000
  ),
  reviewer_assigned_at timestamptz,
  resolution text check (
    resolution in ('RESULT_CONFIRMED', 'LATE_ORIGINAL_RESULT', 'REPEAT_ORDERED', 'NO_CONTEST')
  ),
  resolution_reason text check (
    resolution_reason is null or length(btrim(resolution_reason)) between 1 and 2000
  ),
  resolved_at timestamptz,
  version bigint not null check (version > 0),
  constraint missing_result_review_assignment_shape_check check (
    (state <> 'REVIEWER_ASSIGNED')
    or (
      assigned_central_user_id is not null
      and assigned_reviewer_coach_user_id is not null
      and allowed_outcome_code is not null
      and assignment_reason is not null
      and reviewer_assigned_at is not null
    )
  ),
  constraint missing_result_review_winner_shape_check check (
    (allowed_outcome_code in ('WIN_A', 'WIN_B') and allowed_winner_user_id is not null)
    or (allowed_outcome_code in ('DRAW', 'NO_CONTEST') and allowed_winner_user_id is null)
    or allowed_outcome_code is null
  ),
  constraint missing_result_review_resolution_shape_check check (
    (state in ('RESOLVED', 'REPEAT_ORDERED') and resolution is not null and resolved_at is not null)
    or (state not in ('RESOLVED', 'REPEAT_ORDERED') and resolution is null and resolved_at is null)
  )
);

create table competition.missing_result_statements (
  statement_id uuid primary key,
  review_id uuid not null references competition.missing_result_reviews(review_id),
  athlete_user_id uuid not null references identity.users(user_id),
  claimed_outcome_code text not null check (
    claimed_outcome_code in ('WIN_A', 'WIN_B', 'DRAW', 'NO_CONTEST')
  ),
  claimed_winner_user_id uuid references identity.users(user_id),
  statement text not null check (length(btrim(statement)) between 1 and 2000),
  submitted_at timestamptz not null,
  unique (review_id, athlete_user_id),
  constraint missing_result_statement_winner_shape_check check (
    (claimed_outcome_code in ('WIN_A', 'WIN_B') and claimed_winner_user_id is not null)
    or (claimed_outcome_code in ('DRAW', 'NO_CONTEST') and claimed_winner_user_id is null)
  )
);

create table competition.missing_result_venue_confirmations (
  confirmation_id uuid primary key,
  review_id uuid not null unique references competition.missing_result_reviews(review_id),
  confirmed_by uuid not null references identity.users(user_id),
  attendance_confirmed boolean not null,
  note text not null check (length(btrim(note)) between 1 and 2000),
  confirmed_at timestamptz not null
);

create index missing_result_reviews_central_queue_idx
  on competition.missing_result_reviews (opened_at, review_id)
  where state in ('OPEN', 'UNDER_REVIEW', 'REVIEWER_ASSIGNED');

create trigger missing_result_statements_immutable
before update or delete on competition.missing_result_statements
for each row execute function platform.reject_event_mutation();

create trigger missing_result_venue_confirmations_immutable
before update or delete on competition.missing_result_venue_confirmations
for each row execute function platform.reject_event_mutation();

create function competition.guard_missing_result_review_source_immutability()
returns trigger language plpgsql as $$
begin
  if row(
    old.challenge_id, old.session_id, old.venue_id, old.original_coach_user_id,
    old.operational_followup_id, old.opened_at
  ) is distinct from row(
    new.challenge_id, new.session_id, new.venue_id, new.original_coach_user_id,
    new.operational_followup_id, new.opened_at
  ) then
    raise exception 'MissingResultReview source facts are immutable';
  end if;
  return new;
end;
$$;

create trigger missing_result_reviews_source_immutable
before update on competition.missing_result_reviews
for each row execute function competition.guard_missing_result_review_source_immutability();
