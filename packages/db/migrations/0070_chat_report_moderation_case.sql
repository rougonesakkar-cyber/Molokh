create table governance.moderation_cases (
  case_id uuid primary key,
  case_type text not null check (case_type = 'REPORT'),
  state text not null check (state in ('SUBMITTED', 'TRIAGED', 'UNDER_REVIEW', 'DECIDED', 'CLOSED')),
  report_id uuid not null unique references social.chat_message_reports(report_id),
  chat_id uuid not null references social.chats(chat_id),
  message_id uuid not null references social.chat_messages(message_id),
  reporter_user_id uuid not null references identity.users(user_id),
  subject_user_id uuid not null references identity.users(user_id),
  reason_code text not null check (length(btrim(reason_code)) between 1 and 80),
  submitted_at timestamptz not null,
  version bigint not null check (version > 0),
  constraint moderation_case_distinct_parties_check check (reporter_user_id <> subject_user_id)
);

create unique index moderation_cases_one_report_per_message_uq
  on governance.moderation_cases (message_id)
  where case_type = 'REPORT';

create index moderation_cases_central_queue_idx
  on governance.moderation_cases (submitted_at, case_id)
  where state in ('SUBMITTED', 'TRIAGED', 'UNDER_REVIEW');

create function governance.guard_moderation_case_source_mutation()
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
    or old.submitted_at is distinct from new.submitted_at then
    raise exception 'ModerationCase source facts are immutable';
  end if;
  return new;
end;
$$;

create trigger moderation_cases_source_immutable
before update on governance.moderation_cases
for each row execute function governance.guard_moderation_case_source_mutation();

create trigger moderation_cases_no_delete
before delete on governance.moderation_cases
for each row execute function platform.reject_event_mutation();
