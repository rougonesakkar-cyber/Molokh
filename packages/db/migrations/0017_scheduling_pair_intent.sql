create table scheduling.bookings (
  booking_id uuid primary key,
  chat_id uuid not null references social.chats(chat_id),
  match_id uuid not null references social.matches(match_id),
  slot_id uuid not null references scheduling.slots(slot_id),
  pair_low_id uuid not null references identity.users(user_id),
  pair_high_id uuid not null references identity.users(user_id),
  purpose text not null check (purpose in ('TRAINING', 'OFFICIAL_CHALLENGE')),
  state text not null check (
    state in (
      'SELECTING', 'HOST_CONFIRMATION_PENDING', 'CONFIRMED_PAIR',
      'OFFICIAL_CONVERSION_PENDING', 'OFFICIAL_RELEASE_PENDING',
      'SOLO_DECISION_PENDING', 'CONFIRMED_SOLO', 'EXPIRED',
      'REJECTED', 'CANCELLED', 'COMPLETED'
    )
  ),
  initiated_by uuid not null references identity.users(user_id),
  selected_by_low_at timestamptz,
  selected_by_high_at timestamptz,
  selection_expires_at timestamptz not null,
  host_confirmation_deadline_at timestamptz not null,
  commercial_terms_snapshot jsonb,
  host_confirmed_by uuid references identity.users(user_id),
  host_confirmed_at timestamptz,
  version bigint not null check (version > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint bookings_distinct_ordered_pair_check check (pair_low_id < pair_high_id),
  constraint bookings_selection_check check (
    selected_by_low_at is not null or selected_by_high_at is not null
  ),
  constraint bookings_mutual_snapshot_check check (
    (state = 'SELECTING' and commercial_terms_snapshot is null)
    or
    (state in ('EXPIRED', 'CANCELLED'))
    or
    (
      state not in ('SELECTING', 'EXPIRED', 'CANCELLED')
      and commercial_terms_snapshot is not null
    )
  ),
  constraint bookings_host_confirmation_check check (
    (host_confirmed_by is null and host_confirmed_at is null)
    or
    (host_confirmed_by is not null and host_confirmed_at is not null)
  )
);

create unique index bookings_one_live_request_per_pair_uq
  on scheduling.bookings (pair_low_id, pair_high_id)
  where state in ('SELECTING', 'HOST_CONFIRMATION_PENDING');

create index bookings_chat_live_idx
  on scheduling.bookings (chat_id, updated_at desc, booking_id)
  where state in ('SELECTING', 'HOST_CONFIRMATION_PENDING');

create index bookings_slot_pending_idx
  on scheduling.bookings (slot_id, created_at, booking_id)
  where state in ('SELECTING', 'HOST_CONFIRMATION_PENDING');

alter table scheduling.slots
  add constraint slots_booking_fk
  foreign key (booking_id) references scheduling.bookings(booking_id)
  deferrable initially deferred;

create unique index slots_booking_id_uq
  on scheduling.slots (booking_id)
  where booking_id is not null;

create table scheduling.group_plans (
  group_plan_id uuid primary key,
  chat_id uuid not null references social.chats(chat_id),
  match_id uuid not null references social.matches(match_id),
  group_offering_id uuid not null references scheduling.group_offerings(group_offering_id),
  pair_low_id uuid not null references identity.users(user_id),
  pair_high_id uuid not null references identity.users(user_id),
  proposed_by uuid not null references identity.users(user_id),
  confirmed_by_peer_at timestamptz,
  offering_snapshot jsonb not null,
  start_at timestamptz not null,
  state text not null check (
    state in (
      'PROPOSED', 'NOTIFIED', 'CONVERSION_PENDING', 'CONVERTED',
      'DECLINED', 'CANCELLED', 'EXPIRED'
    )
  ),
  version bigint not null check (version > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint group_plans_distinct_ordered_pair_check check (pair_low_id < pair_high_id),
  constraint group_plans_confirmation_check check (
    (state = 'PROPOSED' and confirmed_by_peer_at is null)
    or
    (state in ('DECLINED', 'CANCELLED', 'EXPIRED'))
    or
    (
      state not in ('PROPOSED', 'DECLINED', 'CANCELLED', 'EXPIRED')
      and confirmed_by_peer_at is not null
    )
  )
);

create unique index group_plans_one_live_plan_per_pair_uq
  on scheduling.group_plans (pair_low_id, pair_high_id)
  where state in ('PROPOSED', 'NOTIFIED', 'CONVERSION_PENDING');

create index group_plans_chat_live_idx
  on scheduling.group_plans (chat_id, updated_at desc, group_plan_id)
  where state in ('PROPOSED', 'NOTIFIED', 'CONVERSION_PENDING');

create or replace function scheduling.reject_frozen_snapshot_change()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'bookings'
     and old.commercial_terms_snapshot is not null
     and new.commercial_terms_snapshot is distinct from old.commercial_terms_snapshot then
    raise exception 'booking commercial terms snapshot is immutable' using errcode = '23514';
  end if;
  if tg_table_name = 'group_plans'
     and new.offering_snapshot is distinct from old.offering_snapshot then
    raise exception 'group plan offering snapshot is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger bookings_frozen_snapshot_guard
before update on scheduling.bookings
for each row execute function scheduling.reject_frozen_snapshot_change();

create trigger group_plans_frozen_snapshot_guard
before update on scheduling.group_plans
for each row execute function scheduling.reject_frozen_snapshot_change();
