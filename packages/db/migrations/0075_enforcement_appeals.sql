create table governance.enforcement_appeals (
  appeal_id uuid primary key,
  enforcement_id uuid not null unique references governance.enforcements(enforcement_id),
  subject_user_id uuid not null references identity.users(user_id),
  state text not null check (state in ('SUBMITTED', 'UNDER_REVIEW')),
  statement text not null check (length(btrim(statement)) between 10 and 2000),
  submitted_at timestamptz not null,
  assigned_reviewer_user_id uuid references identity.users(user_id),
  review_started_at timestamptz,
  version bigint not null check (version > 0),
  constraint enforcement_appeal_review_shape_check check (
    (state = 'SUBMITTED'
      and assigned_reviewer_user_id is null and review_started_at is null)
    or (state = 'UNDER_REVIEW'
      and assigned_reviewer_user_id is not null and review_started_at is not null)
  )
);

create index enforcement_appeals_central_fifo_idx
  on governance.enforcement_appeals (submitted_at, appeal_id)
  where state in ('SUBMITTED', 'UNDER_REVIEW');

create function governance.guard_enforcement_appeal_source_immutability()
returns trigger language plpgsql as $$
begin
  if row(
    old.enforcement_id, old.subject_user_id, old.statement, old.submitted_at
  ) is distinct from row(
    new.enforcement_id, new.subject_user_id, new.statement, new.submitted_at
  ) then
    raise exception 'EnforcementAppeal source facts are immutable';
  end if;
  return new;
end;
$$;

create trigger enforcement_appeal_source_immutable
before update on governance.enforcement_appeals
for each row execute function governance.guard_enforcement_appeal_source_immutability();

create trigger enforcement_appeal_delete_rejected
before delete on governance.enforcement_appeals
for each row execute function platform.reject_event_mutation();
