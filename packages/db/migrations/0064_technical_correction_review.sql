alter table competition.technical_correction_requests
  add column assigned_reviewer_user_id uuid references identity.users(user_id),
  add column review_started_at timestamptz,
  add column decision_reason text check (
    decision_reason is null or length(btrim(decision_reason)) between 1 and 2000
  ),
  add column decided_at timestamptz,
  add constraint technical_correction_review_shape_check check (
    (state = 'SUBMITTED' and assigned_reviewer_user_id is null
      and review_started_at is null and decision_reason is null and decided_at is null)
    or (state = 'UNDER_REVIEW' and assigned_reviewer_user_id is not null
      and review_started_at is not null and decision_reason is null and decided_at is null)
    or (state = 'REJECTED' and assigned_reviewer_user_id is not null
      and review_started_at is not null and decision_reason is not null and decided_at is not null)
    or state in ('APPROVED', 'WITHDRAWN')
  );
