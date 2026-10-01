create table community.community_closure_plans (
  plan_id uuid primary key,
  community_id uuid not null references community.communities(community_id),
  plan_version integer not null check (plan_version > 0),
  state text not null check (state in ('SCHEDULED', 'FINALIZED')),
  category text not null check (length(btrim(category)) between 1 and 80),
  reason text not null check (length(btrim(reason)) between 1 and 500),
  emergency boolean not null,
  effective_at timestamptz not null,
  new_action_cutoff_at timestamptz not null,
  notification_at timestamptz not null,
  scheduled_by uuid not null references identity.users(user_id),
  reviewed_by uuid not null references identity.users(user_id),
  scheduled_at timestamptz not null,
  finalized_by uuid references identity.users(user_id),
  finalized_actor_type text check (finalized_actor_type in ('USER', 'SYSTEM')),
  finalized_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint community_closure_plan_effective_check check (
    emergency or effective_at > scheduled_at
  ),
  constraint community_closure_plan_cutoff_check check (
    new_action_cutoff_at = scheduled_at
  ),
  constraint community_closure_plan_finalization_shape_check check (
    (state = 'SCHEDULED' and finalized_by is null
      and finalized_actor_type is null and finalized_at is null)
    or
    (state = 'FINALIZED' and finalized_actor_type is not null and finalized_at is not null
      and ((finalized_actor_type = 'USER' and finalized_by is not null)
        or (finalized_actor_type = 'SYSTEM' and finalized_by is null)))
  ),
  unique (community_id, plan_version)
);

create unique index community_closure_plans_one_scheduled_uq
  on community.community_closure_plans (community_id)
  where state = 'SCHEDULED';

create index community_closure_plans_due_idx
  on community.community_closure_plans (effective_at, plan_id)
  where state = 'SCHEDULED';

create table community.community_closure_session_dispositions (
  plan_id uuid not null references community.community_closure_plans(plan_id),
  session_id uuid not null references scheduling.sessions(session_id),
  disposition text not null check (
    disposition in ('RETAIN_TO_COMPLETION', 'CANCEL_NO_FAULT')
  ),
  reason text not null check (length(btrim(reason)) between 1 and 500),
  recorded_at timestamptz not null,
  primary key (plan_id, session_id)
);

create table community.community_closure_status_dispositions (
  status_disposition_id uuid primary key,
  plan_id uuid not null references community.community_closure_plans(plan_id),
  competition_id uuid not null references competition.competitions(competition_id),
  status_type text not null check (status_type in ('CHAMPION', 'CONTENDER')),
  user_id uuid not null references identity.users(user_id),
  closure_reason text not null check (closure_reason = 'COMMUNITY_CLOSED'),
  closed_at timestamptz not null,
  unique (plan_id, competition_id, status_type)
);

create function community.guard_closure_plan_source_immutability()
returns trigger language plpgsql as $$
begin
  if row(
    old.plan_id, old.community_id, old.plan_version, old.category, old.reason,
    old.emergency, old.effective_at, old.new_action_cutoff_at, old.notification_at,
    old.scheduled_by, old.reviewed_by, old.scheduled_at
  ) is distinct from row(
    new.plan_id, new.community_id, new.plan_version, new.category, new.reason,
    new.emergency, new.effective_at, new.new_action_cutoff_at, new.notification_at,
    new.scheduled_by, new.reviewed_by, new.scheduled_at
  ) then
    raise exception 'Community Closure Plan source facts are immutable';
  end if;
  return new;
end;
$$;

create trigger community_closure_plans_source_immutable
before update on community.community_closure_plans
for each row execute function community.guard_closure_plan_source_immutability();

create trigger community_closure_session_dispositions_immutable
before update or delete on community.community_closure_session_dispositions
for each row execute function platform.reject_event_mutation();

create trigger community_closure_status_dispositions_immutable
before update or delete on community.community_closure_status_dispositions
for each row execute function platform.reject_event_mutation();
