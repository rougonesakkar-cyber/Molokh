alter table governance.enforcements
  drop constraint enforcements_state_check,
  drop constraint enforcements_version_check,
  add column revoked_by_user_id uuid references identity.users(user_id),
  add column revoked_at timestamptz,
  add column revocation_reason text,
  add constraint enforcements_state_check check (state in ('ACTIVE', 'REVOKED')),
  add constraint enforcements_version_check check (version > 0),
  add constraint enforcements_revocation_shape_check check (
    (state = 'ACTIVE'
      and revoked_by_user_id is null and revoked_at is null and revocation_reason is null)
    or (state = 'REVOKED'
      and revoked_by_user_id is not null and revoked_at is not null
      and length(btrim(revocation_reason)) between 10 and 2000)
  );

drop trigger enforcements_immutable on governance.enforcements;

create function governance.guard_enforcement_transition()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Append-only record cannot be deleted';
  end if;
  if row(
    old.source_case_id, old.source_decision_id, old.subject_user_id,
    old.enforcement_type, old.category_code, old.applied_by_user_id,
    old.applied_at, old.appeal_deadline_at, old.created_at
  ) is distinct from row(
    new.source_case_id, new.source_decision_id, new.subject_user_id,
    new.enforcement_type, new.category_code, new.applied_by_user_id,
    new.applied_at, new.appeal_deadline_at, new.created_at
  ) then
    raise exception 'Enforcement source facts are immutable';
  end if;
  if not (
    old.state = 'ACTIVE' and new.state = 'REVOKED'
    and new.version = old.version + 1
    and new.revoked_by_user_id is not null and new.revoked_at is not null
    and length(btrim(new.revocation_reason)) between 10 and 2000
  ) then
    raise exception 'Invalid Enforcement transition';
  end if;
  return new;
end;
$$;

create trigger enforcements_transition_guard
before update or delete on governance.enforcements
for each row execute function governance.guard_enforcement_transition();

alter table governance.enforcement_appeals
  drop constraint enforcement_appeals_state_check,
  drop constraint enforcement_appeal_review_shape_check,
  add column decision_reason text,
  add column decided_at timestamptz,
  add constraint enforcement_appeals_state_check check (
    state in ('SUBMITTED', 'UNDER_REVIEW', 'DECIDED_REVOKED')
  ),
  add constraint enforcement_appeal_review_shape_check check (
    (state = 'SUBMITTED'
      and assigned_reviewer_user_id is null and review_started_at is null
      and decision_reason is null and decided_at is null)
    or (state = 'UNDER_REVIEW'
      and assigned_reviewer_user_id is not null and review_started_at is not null
      and decision_reason is null and decided_at is null)
    or (state = 'DECIDED_REVOKED'
      and assigned_reviewer_user_id is not null and review_started_at is not null
      and length(btrim(decision_reason)) between 10 and 2000 and decided_at is not null)
  );

create function governance.guard_enforcement_appeal_transition()
returns trigger language plpgsql as $$
begin
  if new.version <> old.version + 1 then
    raise exception 'Invalid EnforcementAppeal version transition';
  end if;
  if old.state = 'SUBMITTED' and new.state = 'UNDER_REVIEW'
    and new.assigned_reviewer_user_id is not null and new.review_started_at is not null
    and new.decision_reason is null and new.decided_at is null then
    return new;
  end if;
  if old.state = 'UNDER_REVIEW' and new.state = 'DECIDED_REVOKED'
    and new.assigned_reviewer_user_id = old.assigned_reviewer_user_id
    and new.review_started_at = old.review_started_at
    and length(btrim(new.decision_reason)) between 10 and 2000
    and new.decided_at is not null then
    return new;
  end if;
  raise exception 'Invalid EnforcementAppeal transition';
end;
$$;

create trigger enforcement_appeal_transition_guard
before update on governance.enforcement_appeals
for each row execute function governance.guard_enforcement_appeal_transition();
