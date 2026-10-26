alter table governance.moderation_cases
  drop constraint moderation_cases_case_type_check,
  alter column report_id drop not null,
  alter column message_id drop not null,
  add column challenge_id uuid references competition.challenges(challenge_id),
  add column booking_id uuid references scheduling.bookings(booking_id),
  add column session_id uuid references scheduling.sessions(session_id),
  add column initial_due_at timestamptz,
  add column final_due_at timestamptz,
  add constraint moderation_cases_case_type_check
    check (case_type in ('REPORT', 'SAFETY')),
  add constraint moderation_cases_source_shape_check check (
    (
      case_type = 'REPORT'
      and report_id is not null and message_id is not null
      and challenge_id is null and booking_id is null and session_id is null
      and initial_due_at is null and final_due_at is null
    ) or (
      case_type = 'SAFETY'
      and report_id is null and message_id is null
      and challenge_id is not null and booking_id is not null and session_id is not null
      and initial_due_at is not null and final_due_at is not null
      and initial_due_at < final_due_at
    )
  );

create unique index moderation_cases_one_safety_case_per_session_uq
  on governance.moderation_cases (session_id)
  where case_type = 'SAFETY';

create index moderation_cases_safety_resources_idx
  on governance.moderation_cases (challenge_id, booking_id, session_id)
  where case_type = 'SAFETY';

create or replace function governance.guard_moderation_case_source_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.case_type is distinct from new.case_type
    or old.report_id is distinct from new.report_id
    or old.chat_id is distinct from new.chat_id
    or old.message_id is distinct from new.message_id
    or old.reporter_user_id is distinct from new.reporter_user_id
    or old.subject_user_id is distinct from new.subject_user_id
    or old.reason_code is distinct from new.reason_code
    or old.challenge_id is distinct from new.challenge_id
    or old.booking_id is distinct from new.booking_id
    or old.session_id is distinct from new.session_id
    or old.initial_due_at is distinct from new.initial_due_at
    or old.final_due_at is distinct from new.final_due_at
    or old.submitted_at is distinct from new.submitted_at then
    raise exception 'ModerationCase source facts are immutable';
  end if;
  return new;
end;
$$;

alter table competition.process_holds
  drop constraint process_holds_one_source_check,
  add column moderation_case_id uuid references governance.moderation_cases(case_id),
  add constraint process_holds_one_source_check check (
    num_nonnulls(
      source_case_id, account_access_case_id, duplicate_account_case_id,
      moderation_case_id
    ) <= 1
  );

create index process_holds_moderation_case_idx
  on competition.process_holds (moderation_case_id)
  where moderation_case_id is not null;
