create table community.primary_admin_successor_proposals (
  proposal_id uuid primary key,
  venue_id uuid not null references community.venues(venue_id),
  proposed_by_user_id uuid not null references identity.users(user_id),
  target_user_id uuid not null references identity.users(user_id),
  state text not null check (state in ('PENDING', 'APPROVED')),
  proposal_reason_code text not null check (
    length(btrim(proposal_reason_code)) between 3 and 80
  ),
  proposed_at timestamptz not null,
  approved_by_user_id uuid references identity.users(user_id),
  approval_reason_code text check (
    approval_reason_code is null
    or length(btrim(approval_reason_code)) between 3 and 80
  ),
  approved_at timestamptz,
  primary_grant_id uuid references community.role_grants(grant_id),
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint primary_admin_successor_distinct_users_check check (
    proposed_by_user_id <> target_user_id
  ),
  constraint primary_admin_successor_state_shape_check check (
    (state = 'PENDING'
      and approved_by_user_id is null
      and approval_reason_code is null
      and approved_at is null
      and primary_grant_id is null)
    or (state = 'APPROVED'
      and approved_by_user_id is not null
      and approval_reason_code is not null
      and approved_at is not null
      and primary_grant_id is not null)
  )
);

create unique index primary_admin_successor_one_pending_per_venue_uq
  on community.primary_admin_successor_proposals (venue_id)
  where state = 'PENDING';

create index primary_admin_successor_central_queue_idx
  on community.primary_admin_successor_proposals (proposed_at, proposal_id)
  where state = 'PENDING';

create function community.guard_primary_admin_successor_source_immutability()
returns trigger language plpgsql as $$
begin
  if row(
    old.venue_id, old.proposed_by_user_id, old.target_user_id,
    old.proposal_reason_code, old.proposed_at
  ) is distinct from row(
    new.venue_id, new.proposed_by_user_id, new.target_user_id,
    new.proposal_reason_code, new.proposed_at
  ) then
    raise exception 'PrimaryAdmin successor proposal source facts are immutable';
  end if;
  return new;
end;
$$;

create trigger primary_admin_successor_source_immutable
before update on community.primary_admin_successor_proposals
for each row execute function community.guard_primary_admin_successor_source_immutability();

create trigger primary_admin_successor_delete_rejected
before delete on community.primary_admin_successor_proposals
for each row execute function platform.reject_event_mutation();
