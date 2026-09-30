drop trigger if exists bookings_frozen_snapshot_guard on scheduling.bookings;
drop trigger if exists group_plans_frozen_snapshot_guard on scheduling.group_plans;
drop function if exists scheduling.reject_frozen_snapshot_change();

create function scheduling.reject_booking_snapshot_change()
returns trigger
language plpgsql
as $$
begin
  if old.commercial_terms_snapshot is not null
     and new.commercial_terms_snapshot is distinct from old.commercial_terms_snapshot then
    raise exception 'booking commercial terms snapshot is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function scheduling.reject_group_plan_snapshot_change()
returns trigger
language plpgsql
as $$
begin
  if new.offering_snapshot is distinct from old.offering_snapshot then
    raise exception 'group plan offering snapshot is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger bookings_frozen_snapshot_guard
before update on scheduling.bookings
for each row execute function scheduling.reject_booking_snapshot_change();

create trigger group_plans_frozen_snapshot_guard
before update on scheduling.group_plans
for each row execute function scheduling.reject_group_plan_snapshot_change();
