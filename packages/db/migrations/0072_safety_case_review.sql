alter table governance.moderation_cases
  add column assigned_reviewer_user_id uuid references identity.users(user_id),
  add column review_started_at timestamptz,
  add column closed_at timestamptz,
  add constraint moderation_cases_review_shape_check check (
    (state = 'SUBMITTED'
      and assigned_reviewer_user_id is null
      and review_started_at is null
      and closed_at is null)
    or (state in ('TRIAGED', 'UNDER_REVIEW', 'DECIDED')
      and assigned_reviewer_user_id is not null
      and review_started_at is not null
      and closed_at is null)
    or (state = 'CLOSED'
      and assigned_reviewer_user_id is not null
      and review_started_at is not null
      and closed_at is not null)
  );

create table governance.safety_case_decisions (
  decision_id uuid primary key,
  case_id uuid not null unique references governance.moderation_cases(case_id),
  reviewer_user_id uuid not null references identity.users(user_id),
  remedy_code text not null check (
    remedy_code in ('REPLACE_COACH', 'REPLACE_VENUE', 'REPLACE_COACH_AND_VENUE')
  ),
  replacement_coach_user_id uuid references identity.users(user_id),
  replacement_venue_id uuid references community.venues(venue_id),
  decision_reason text not null check (length(btrim(decision_reason)) between 10 and 1000),
  decided_at timestamptz not null,
  constraint safety_case_decisions_remedy_shape_check check (
    (remedy_code = 'REPLACE_COACH'
      and replacement_coach_user_id is not null and replacement_venue_id is null)
    or (remedy_code = 'REPLACE_VENUE'
      and replacement_coach_user_id is null and replacement_venue_id is not null)
    or (remedy_code = 'REPLACE_COACH_AND_VENUE'
      and replacement_coach_user_id is not null and replacement_venue_id is not null)
  )
);

create index safety_case_decisions_reviewer_idx
  on governance.safety_case_decisions (reviewer_user_id, decided_at, decision_id);

create trigger safety_case_decisions_immutable
before update or delete on governance.safety_case_decisions
for each row execute function platform.reject_event_mutation();
