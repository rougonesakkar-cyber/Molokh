alter table governance.safety_case_decisions
  drop constraint safety_case_decisions_remedy_code_check,
  drop constraint safety_case_decisions_remedy_shape_check,
  add column source_result_id uuid references competition.results(result_id),
  add column enforcement_reason_code text,
  add column causal_link_code text,
  add constraint safety_case_decisions_remedy_code_check check (
    remedy_code in (
      'REPLACE_COACH', 'REPLACE_VENUE', 'REPLACE_COACH_AND_VENUE',
      'FORFEIT_BY_ENFORCEMENT'
    )
  ),
  add constraint safety_case_decisions_enforcement_reason_check check (
    enforcement_reason_code is null
    or enforcement_reason_code in ('THREAT', 'HARASSMENT', 'UNSAFE_CONDUCT', 'OTHER_SAFETY')
  ),
  add constraint safety_case_decisions_causal_link_check check (
    causal_link_code is null or causal_link_code = 'SUBJECT_CAUSED_SESSION_FAILURE'
  ),
  add constraint safety_case_decisions_remedy_shape_check check (
    (remedy_code = 'REPLACE_COACH'
      and replacement_coach_user_id is not null and replacement_venue_id is null
      and source_result_id is null and enforcement_reason_code is null
      and causal_link_code is null)
    or (remedy_code = 'REPLACE_VENUE'
      and replacement_coach_user_id is null and replacement_venue_id is not null
      and source_result_id is null and enforcement_reason_code is null
      and causal_link_code is null)
    or (remedy_code = 'REPLACE_COACH_AND_VENUE'
      and replacement_coach_user_id is not null and replacement_venue_id is not null
      and source_result_id is null and enforcement_reason_code is null
      and causal_link_code is null)
    or (remedy_code = 'FORFEIT_BY_ENFORCEMENT'
      and replacement_coach_user_id is null and replacement_venue_id is null
      and source_result_id is not null and enforcement_reason_code is not null
      and causal_link_code = 'SUBJECT_CAUSED_SESSION_FAILURE')
  );
