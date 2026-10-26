alter table governance.safety_case_decisions
  drop constraint safety_case_decisions_remedy_code_check,
  drop constraint safety_case_decisions_remedy_shape_check,
  add column restriction_category_code text,
  add constraint safety_case_decisions_remedy_code_check check (
    remedy_code in (
      'REPLACE_COACH', 'REPLACE_VENUE', 'REPLACE_COACH_AND_VENUE',
      'FORFEIT_BY_ENFORCEMENT', 'ACCOUNT_RESTRICTION'
    )
  ),
  add constraint safety_case_decisions_restriction_category_check check (
    restriction_category_code is null
    or restriction_category_code in ('VIOLENCE', 'FRAUD', 'IDENTITY_ABUSE', 'ILLEGAL_USE')
  ),
  add constraint safety_case_decisions_remedy_shape_check check (
    (remedy_code = 'REPLACE_COACH'
      and replacement_coach_user_id is not null and replacement_venue_id is null
      and source_result_id is null and enforcement_reason_code is null
      and causal_link_code is null and restriction_category_code is null)
    or (remedy_code = 'REPLACE_VENUE'
      and replacement_coach_user_id is null and replacement_venue_id is not null
      and source_result_id is null and enforcement_reason_code is null
      and causal_link_code is null and restriction_category_code is null)
    or (remedy_code = 'REPLACE_COACH_AND_VENUE'
      and replacement_coach_user_id is not null and replacement_venue_id is not null
      and source_result_id is null and enforcement_reason_code is null
      and causal_link_code is null and restriction_category_code is null)
    or (remedy_code = 'FORFEIT_BY_ENFORCEMENT'
      and replacement_coach_user_id is null and replacement_venue_id is null
      and source_result_id is not null and enforcement_reason_code is not null
      and causal_link_code = 'SUBJECT_CAUSED_SESSION_FAILURE'
      and restriction_category_code is null)
    or (remedy_code = 'ACCOUNT_RESTRICTION'
      and replacement_coach_user_id is null and replacement_venue_id is null
      and source_result_id is null and enforcement_reason_code is null
      and causal_link_code is null and restriction_category_code is not null)
  );

create table governance.enforcements (
  enforcement_id uuid primary key,
  source_case_id uuid not null unique references governance.moderation_cases(case_id),
  source_decision_id uuid not null unique references governance.safety_case_decisions(decision_id),
  subject_user_id uuid not null references identity.users(user_id),
  enforcement_type text not null check (enforcement_type = 'ACCOUNT_RESTRICTION'),
  state text not null check (state = 'ACTIVE'),
  category_code text not null check (
    category_code in ('VIOLENCE', 'FRAUD', 'IDENTITY_ABUSE', 'ILLEGAL_USE')
  ),
  applied_by_user_id uuid not null references identity.users(user_id),
  applied_at timestamptz not null,
  appeal_deadline_at timestamptz not null,
  version bigint not null check (version = 1),
  created_at timestamptz not null default clock_timestamp(),
  constraint enforcements_appeal_window_check check (
    appeal_deadline_at = applied_at + interval '7 days'
  )
);

create unique index enforcements_one_active_account_restriction_uq
  on governance.enforcements (subject_user_id)
  where enforcement_type = 'ACCOUNT_RESTRICTION' and state = 'ACTIVE';

create index enforcements_subject_history_idx
  on governance.enforcements (subject_user_id, applied_at desc, enforcement_id);

create trigger enforcements_immutable
before update or delete on governance.enforcements
for each row execute function platform.reject_event_mutation();
